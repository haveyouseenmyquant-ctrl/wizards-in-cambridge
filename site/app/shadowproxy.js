// Optimisation s2: merged shadow proxies. Every OSM building in a tile, every city-facade part and every zone mesh is its
// own Mesh, so the sun's shadow pass issued ~1100 draw calls a frame. Once a top-level scene group (a tile, a
// cityfac block, the zone) has stopped changing, its static opaque casters are merged into one position-only mesh per
// shadow side that is drawn only by the shadow camera (layer 1); the originals stop casting. If the group changes
// (streaming, hidden buildings), the originals cast again until it is stable and the proxy is rebuilt.
// Static = matrixAutoUpdate false (tiles.js, zone.js, trees.js set it); skipped: instanced/skinned meshes, alpha-tested
// or transparent materials and custom depth materials (their shadows stay per mesh). Eligibility reads the base flag
// (shadowlod.js castShadow0), so distance culling of small casters does not churn the proxies. ?shadowproxy=0 turns it off.
const PERIOD = 1, LAYER = 1, MAX_REBUILDS = 6;
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

  function build(s) {
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
      let ov = 0, oi = 0;
      for (const m of list) {
        const g = m.geometry, p = g.attributes.position, n = p.count;
        m.updateMatrixWorld();
        for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); pos[(ov + i) * 3] = v.x; pos[(ov + i) * 3 + 1] = v.y; pos[(ov + i) * 3 + 2] = v.z; }
        if (g.index) { const a = g.index; for (let i = 0; i < a.count; i++) idx[oi + i] = a.getX(i) + ov; oi += a.count; }
        else { for (let i = 0; i < n; i++) idx[oi + i] = ov + i; oi += n; }
        ov += n;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }); mat.shadowSide = side;
      const proxy = new THREE.Mesh(geo, mat);
      proxy.name = 'shadowProxy'; proxy.layers.set(LAYER); proxy.castShadow = true; proxy.receiveShadow = false;
      proxy.matrixAutoUpdate = false; proxy.updateMatrixWorld();
      root.add(proxy); s.proxies.push(proxy);
      stats.tris += ni / 3;
    }
    for (const m of s.cand) { m.castShadow = false; m.userData.shadowProxied = true; }
    s.members = s.cand;
  }

  return dt => {
    if ((t -= dt) > 0) return;
    t = PERIOD;
    for (const [g, s] of state) if (g.parent !== scene) { release(s); state.delete(g); }
    for (const g of scene.children) {
      if (g === root || g.name === 'game' || !g.isObject3D || g.isLight) continue;
      const cand = []; let sig = 0;
      g.traverseVisible(o => { if (eligible(o)) { cand.push(o); sig = (sig * 31 + o.id) % 2147483647; } });
      if (cand.length < 2 && !state.has(g)) continue;
      let s = state.get(g);
      if (!s) state.set(g, s = { sig: -1, stable: 0, members: [], proxies: [], cand: [], rebuilds: 0 });
      if (sig !== s.sig) {
        if (s.proxies.length) { release(s); s.rebuilds++; stats.rebuilds++; }
        s.sig = sig; s.stable = 0; s.cand = cand; continue;
      }
      if (!s.proxies.length && ++s.stable >= 2 && s.rebuilds < MAX_REBUILDS && cand.length >= 2) { s.cand = cand; build(s); }
    }
    let groups = 0, merged = 0, tris = 0;
    for (const s of state.values()) if (s.proxies.length) { groups++; merged += s.members.length; for (const p of s.proxies) tris += (p.geometry.index.count / 3) | 0; }
    Object.assign(stats, { groups, merged, tris });
  };
}
