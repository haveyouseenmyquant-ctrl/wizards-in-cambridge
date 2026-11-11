// Optimisation s2: merged shadow proxies. Every OSM building in a tile, every city-facade part and every zone mesh is its
// own Mesh, so the sun's shadow pass issued ~1100 draw calls a frame. Once a top-level scene group (a tile, a
// cityfac block, the zone) has stopped changing, its static opaque casters are merged into one position-only mesh per
// shadow side that is drawn only by the shadow camera (layer 1); the originals stop casting. If the group changes
// (streaming, hidden buildings), the originals cast again until it is stable and the proxy is rebuilt.
// Static = matrixAutoUpdate false (tiles.js, zone.js, trees.js set it); skipped: instanced/skinned meshes, alpha-tested
// or transparent materials and custom depth materials (their shadows stay per mesh). Eligibility reads the base flag
// (shadowlod.js castShadow0), so distance culling of small casters does not churn the proxies. ?shadowproxy=0 turns it off.
const PERIOD = 1, LAYER = 1, MAX_REBUILDS = 6;
// normalized attribute scale (negative = signed: clamp at -1, as three's denormalize does)
const NORM = new Map([[Float32Array, 1], [Uint8Array, 1 / 255], [Uint16Array, 1 / 65535], [Uint32Array, 1 / 4294967295], [Int8Array, -1 / 127], [Int16Array, -1 / 32767], [Int32Array, -1 / 2147483647]]);
const SHADOW_SIDE = { 0: 1, 1: 0, 2: 2 };   // what WebGLShadowMap renders for FrontSide/BackSide/DoubleSide

export function installShadowProxies(THREE, scene, light) {
  if (new URLSearchParams(location.search).get('shadowproxy') === '0') return () => {};
  light.shadow.camera.layers.enable(LAYER);
  const root = new THREE.Group(); root.name = 'shadowProxies'; root.matrixAutoUpdate = false; scene.add(root);
  const state = new Map(), stats = window.__shadowProxy = { groups: 0, merged: 0, tris: 0, rebuilds: 0 };
  const v = new THREE.Vector3();
  let t = 0;

  const eligible = o => o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.matrixAutoUpdate === false && o.geometry?.attributes.position
    && (o.userData.shadowProxied || (o.userData.castShadow0 ?? o.castShadow)) && !o.customDepthMaterial && !Array.isArray(o.material)
    && !(o.material?.alphaTest > 0) && !o.material?.transparent && !o.geometry.morphAttributes?.position;

  function release(s) {
    for (const m of s.members) { m.castShadow = true; m.userData.shadowProxied = false; }
    for (const p of s.proxies) { root.remove(p); p.geometry.dispose(); }
    s.members = []; s.proxies = [];
  }

  function* build(s) {   // s7: generator, resumed each frame within a time budget (a zone build alone took ~45 ms)
    const bySide = new Map();
    for (const m of s.cand) {
      const side = m.material?.shadowSide ?? SHADOW_SIDE[m.material?.side ?? 0];
      if (!bySide.has(side)) bySide.set(side, []);
      bySide.get(side).push(m);
    }
    for (const [side, list] of bySide) {
      let nv = 0, ni = 0;
      for (const m of list) { const g = m.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
      const pos = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let ov = 0, oi = 0; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const m of list) {
        const g = m.geometry, p = g.attributes.position, n = p.count;
        m.updateMatrixWorld();
        const e = m.matrixWorld.elements, il = p.isInterleavedBufferAttribute, a = il ? p.data.array : p.array;
        const st = il ? p.data.stride : p.itemSize, of = il ? p.offset : 0, k = p.normalized ? NORM.get(a.constructor) : 1;
        if (k && p.itemSize >= 3) {   // s7: direct (de)quantised affine transform; fromBufferAttribute per vertex cost ~100 ms a build
          for (let i = 0, b = of, j = ov * 3; i < n; i++, b += st, j += 3) {
            let x = a[b] * k, y = a[b + 1] * k, z = a[b + 2] * k;
            if (k < 0) { x = Math.max(-x, -1); y = Math.max(-y, -1); z = Math.max(-z, -1); }
            const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
            pos[j] = X; pos[j + 1] = Y; pos[j + 2] = Z;
            if (X < lo[0]) lo[0] = X; if (X > hi[0]) hi[0] = X; if (Y < lo[1]) lo[1] = Y; if (Y > hi[1]) hi[1] = Y; if (Z < lo[2]) lo[2] = Z; if (Z > hi[2]) hi[2] = Z;
          }
        } else for (let i = 0; i < n; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); const j = (ov + i) * 3; pos[j] = v.x; pos[j + 1] = v.y; pos[j + 2] = v.z;
          lo[0] = Math.min(lo[0], v.x); lo[1] = Math.min(lo[1], v.y); lo[2] = Math.min(lo[2], v.z); hi[0] = Math.max(hi[0], v.x); hi[1] = Math.max(hi[1], v.y); hi[2] = Math.max(hi[2], v.z);
        }
        if (g.index) { const a = g.index.array, c = g.index.count; for (let i = 0; i < c; i++) idx[oi + i] = a[i] + ov; oi += c; }
        else { for (let i = 0; i < n; i++) idx[oi + i] = ov + i; oi += n; }
        ov += n;
        yield;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.boundingBox = new THREE.Box3(new THREE.Vector3(...lo), new THREE.Vector3(...hi));   // box-derived sphere: only used for shadow-camera culling
      geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
      const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }); mat.shadowSide = side;
      const proxy = new THREE.Mesh(geo, mat);
      proxy.name = 'shadowProxy'; proxy.layers.set(LAYER); proxy.castShadow = true; proxy.receiveShadow = false;
      proxy.matrixAutoUpdate = false; proxy.updateMatrixWorld();
      root.add(proxy); s.proxies.push(proxy);
      stats.tris += ni / 3;
    }
    for (const m of s.cand) { m.castShadow = false; m.userData.shadowProxied = true; }
    s.members = s.cand; s.queued = false;
  }

  const queue = [];   // s7: groups ready to merge, built a few ms per frame (several tiles settling together made 100-180 ms frames)
  return dt => {
    if (queue.length) {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 4) {
        const s = queue[0];
        if (!s.live || !s.queued || (!s.job && (s.proxies.length || s.cand.length < 2))) { queue.shift(); s.job = null; continue; }
        s.job ??= build(s);
        if (s.job.next().done) { queue.shift(); s.job = null; }
      }
    }
    if ((t -= dt) > 0) return;
    t = PERIOD;
    for (const [g, s] of state) if (g.parent !== scene) { release(s); s.live = false; state.delete(g); }
    for (const g of scene.children) {
      if (g === root || g.name === 'game' || !g.isObject3D || g.isLight) continue;
      const cand = []; let sig = 0;
      g.traverseVisible(o => { if (eligible(o)) { cand.push(o); sig = (sig * 31 + o.id) % 2147483647; } });
      if (cand.length < 2 && !state.has(g)) continue;
      let s = state.get(g);
      if (!s) state.set(g, s = { sig: -1, stable: 0, members: [], proxies: [], cand: [], rebuilds: 0, live: true, queued: false });
      if (sig !== s.sig) {
        if (s.queued) { s.queued = false; s.job = null; const i = queue.indexOf(s); if (i >= 0) queue.splice(i, 1); }
        if (s.proxies.length) { release(s); s.rebuilds++; stats.rebuilds++; }
        s.sig = sig; s.stable = 0; s.cand = cand; continue;
      }
      if (!s.proxies.length && !s.queued && ++s.stable >= 2 && s.rebuilds < MAX_REBUILDS && cand.length >= 2) { s.cand = cand; s.queued = true; queue.push(s); }
    }
    let groups = 0, merged = 0, tris = 0;
    for (const s of state.values()) if (s.proxies.length) { groups++; merged += s.members.length; for (const p of s.proxies) tris += (p.geometry.index.count / 3) | 0; }
    Object.assign(stats, { groups, merged, tris });
  };
}
