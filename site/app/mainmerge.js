// Optimisation s3: main-pass batching of static meshes. Tiles (one Mesh per OSM building / ground part) and the zone
// (one Mesh per bespoke part) cost ~600 of the ~1000 draw calls a frame on the Low preset. Once a top-level scene group
// has stopped changing, its static meshes are baked to world space and merged per (material, attribute layout,
// receiveShadow, 64 m cell), so frustum culling still works cell by cell. The originals stay in the scene graph (camera
// occlusion, zoneHide, shadow casting and shadowproxy.js keep using them) but move to layer HIDE, which only the
// shadow camera renders; the merged copies are drawn by the main camera and never cast shadows. If the group changes
// (streaming, hidden buildings), the originals come back to layer 0 until it is stable and it is rebuilt.
// Skipped: instanced/skinned/morphed meshes, multi-material or grouped geometry, transparent materials, meshes with
// their own onBeforeRender and dynamic ones (matrixAutoUpdate). Preset field merge (Low, Medium: changed draw order flips a few
// coplanar z-ties, so High stays as it was); ?mainmerge=1|0 overrides.
const PERIOD = 1, HIDE = 3, CELL = 64, MAX_REBUILDS = 8;

export function installMainMerge(THREE, scene, light, on) {
  const q = new URLSearchParams(location.search).get('mainmerge');
  if (q ? q === '0' : !on) return () => {};
  if (light) light.shadow.camera.layers.enable(HIDE);
  const root = new THREE.Group(); root.name = 'mainMerge'; root.matrixAutoUpdate = false; scene.add(root);
  const state = new Map(), stats = window.__mainMerge = { groups: 0, merged: 0, batches: 0, rebuilds: 0 };
  const noHook = THREE.Object3D.prototype.onBeforeRender;
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let t = 0;

  const eligible = o => o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.matrixAutoUpdate === false
    && o.geometry?.attributes.position && !Array.isArray(o.material) && o.material && !o.material.transparent
    && !o.geometry.groups?.length && !o.geometry.morphAttributes?.position && o.onBeforeRender === noHook
    && o.renderOrder === 0 && o.frustumCulled;

  const layout = g => Object.keys(g.attributes).sort().map(k => k + g.attributes[k].itemSize).join(',');

  function release(s) {
    for (const m of s.members) m.layers.set(0);
    for (const b of s.batches) { root.remove(b); b.geometry.dispose(); }
    s.members = []; s.batches = [];
  }

  function merge(list, names) {
    let nv = 0, ni = 0;
    for (const m of list) { const g = m.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const geo = new THREE.BufferGeometry(), out = {};
    for (const k of names) { const n = list[0].geometry.attributes[k].itemSize; out[k] = { n, a: new Float32Array(nv * n) }; }
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let ov = 0, oi = 0;
    for (const m of list) {
      m.updateMatrixWorld();
      const g = m.geometry, cnt = g.attributes.position.count, mw = m.matrixWorld;
      nm.getNormalMatrix(mw);
      for (const k of names) {
        const src = g.attributes[k], { n, a } = out[k];
        if (k === 'position' || k === 'normal' || k === 'tangent') {
          for (let i = 0; i < cnt; i++) {
            v.fromBufferAttribute(src, i);
            if (k === 'position') v.applyMatrix4(mw); else if (k === 'normal') v.applyNormalMatrix(nm); else v.transformDirection(mw);
            const o = (ov + i) * n; a[o] = v.x; a[o + 1] = v.y; a[o + 2] = v.z;
            if (n === 4) a[o + 3] = src.getW(i);
          }
        } else {
          for (let i = 0; i < cnt; i++) {
            const o = (ov + i) * n;
            a[o] = src.getX(i); if (n > 1) a[o + 1] = src.getY(i); if (n > 2) a[o + 2] = src.getZ(i); if (n > 3) a[o + 3] = src.getW(i);
          }
        }
      }
      if (g.index) { const a = g.index; for (let i = 0; i < a.count; i++) idx[oi + i] = a.getX(i) + ov; oi += a.count; }
      else { for (let i = 0; i < cnt; i++) idx[oi + i] = ov + i; oi += cnt; }
      ov += cnt;
    }
    for (const k of names) geo.setAttribute(k, new THREE.BufferAttribute(out[k].a, out[k].n));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    return geo;
  }

  function build(s) {
    const buckets = new Map();
    for (const m of s.cand) {
      const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      v.copy(g.boundingSphere.center).applyMatrix4(m.matrixWorld);
      const key = m.material.uuid + '|' + layout(g) + '|' + m.receiveShadow + '|' + Math.floor(v.x / CELL) + ',' + Math.floor(v.z / CELL);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(m);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const names = Object.keys(list[0].geometry.attributes);
      const mesh = new THREE.Mesh(merge(list, names), list[0].material);
      mesh.name = 'mainMerge'; mesh.castShadow = false; mesh.receiveShadow = list[0].receiveShadow;
      mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld();
      root.add(mesh); s.batches.push(mesh);
      for (const m of list) { m.layers.set(HIDE); s.members.push(m); }
    }
  }

  return dt => {
    if ((t -= dt) > 0) return;
    t = PERIOD;
    for (const [g, s] of state) if (g.parent !== scene) { release(s); state.delete(g); }
    for (const g of scene.children) {
      if (g === root || g.name === 'game' || g.name === 'shadowProxies' || !g.isObject3D || g.isLight) continue;
      const cand = []; let sig = 0;
      g.traverseVisible(o => { if (eligible(o)) { cand.push(o); sig = (sig * 31 + o.id) % 2147483647; } });
      if (cand.length < 2 && !state.has(g)) continue;
      let s = state.get(g);
      if (!s) state.set(g, s = { sig: -1, stable: 0, members: [], batches: [], cand: [], rebuilds: 0 });
      if (sig !== s.sig) {
        if (s.batches.length) { release(s); s.rebuilds++; stats.rebuilds++; }
        s.sig = sig; s.stable = 0; s.cand = cand; continue;
      }
      if (!s.batches.length && ++s.stable >= 2 && s.rebuilds < MAX_REBUILDS && cand.length >= 2) { s.cand = cand; build(s); }
    }
    let groups = 0, merged = 0, batches = 0;
    for (const s of state.values()) if (s.batches.length) { groups++; merged += s.members.length; batches += s.batches.length; }
    Object.assign(stats, { groups, merged, batches });
  };
}
