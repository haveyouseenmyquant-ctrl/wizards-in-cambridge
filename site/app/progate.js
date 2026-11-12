// Parallel shader compile gate (Optimisation s6, task a95b).
// three.js links a new program the first time it draws it, and reading its uniforms blocks the main thread until the
// driver has finished compiling (~10-15 ms per program on an M4, 20+ new programs when the zone and the game layer
// arrive). Here every object attached to the scene is compiled up front with renderer.compile() (KHR_parallel_shader_compile
// lets the driver build it off-thread) and its new materials are held invisible until their program reports ready, so
// they pop in a frame or two later instead of freezing the page. No-op without the extension (isReady() is then always
// true). ?proggate=0 turns it off.
export function installProgGate(THREE, renderer, scene, camera, target = () => null) {
  if (/[?&]proggate=0/.test(location.search)) return () => {};
  const added = new Set(), held = new Map();   // materials waiting for their program
  const add0 = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function (...objs) {
    const r = add0.apply(this, objs);
    for (const o of objs) if (o && o !== this && o.isObject3D) added.add(o);
    return r;
  };
  const inScene = o => { while (o.parent) o = o.parent; return o === scene; };
  const stats = { compiled: 0, held: 0 }, wrap = new THREE.Object3D();
  // stand-ins for the shadow pass's depth material (same program key: side flipped, map/alphaMap/alphaTest/displacement copied)
  const depthOf = new WeakMap(), depthHeld = new Map();
  const flip = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
  const depthFor = m => {
    let d = depthOf.get(m);
    if (!d) depthOf.set(m, d = new THREE.MeshDepthMaterial());
    d.side = m.shadowSide !== null && m.shadowSide !== undefined ? m.shadowSide : flip[m.side];
    d.map = m.map || null; d.alphaMap = m.alphaMap || null; d.alphaTest = m.alphaToCoverage ? 0.5 : m.alphaTest;
    d.displacementMap = m.displacementMap || null; d.displacementScale = m.displacementScale ?? 1;
    d.wireframe = m.wireframe; d.clippingPlanes = m.clippingPlanes; d.clipShadows = m.clipShadows;
    return d;
  };
  let nProg = 0;
  if (/[?&]debug/.test(location.search)) {
    window.__progGate = stats; stats.log = [];
    // ?debug: name the object whose first draw (main or shadow pass) linked a program
    const path = o => { const n = []; for (; o && n.length < 4; o = o.parent) n.push(o.name || o.type); return n.join('<'); };
    const spy = pass => function () {
      const ps = renderer.info.programs || [];
      for (; nProg < ps.length; nProg++) stats.log.push([ps[nProg].cacheKey, +(performance.now() / 1000).toFixed(2), pass + ':' + path(this)]);
    };
    THREE.Object3D.prototype.onAfterShadow = spy('shadow');
    THREE.Object3D.prototype.onAfterRender = spy('draw');
  }
  return () => {
    // ?debug: every program three.js links: [key, s since load, by 'gate' (parallel compile) or 'draw' (linked on first draw)]
    const logProgs = by => { const ps = renderer.info.programs || []; for (; nProg < ps.length; nProg++) stats.log.push([ps[nProg].cacheKey, +(performance.now() / 1000).toFixed(2), by]); };
    if (stats.log) logProgs('draw');
    for (const [m] of held) {
      const p = renderer.properties.get(m).currentProgram, d = depthHeld.get(m), pd = d && renderer.properties.get(d).currentProgram;
      if ((!p || p.isReady()) && (!pd || pd.isReady())) { m.visible = true; held.delete(m); depthHeld.delete(m); }
    }
    if (!added.size) return;
    // only objects bringing a material without a linked program (VFX re-adding known materials skip the compile), batched
    // into one compile() so the scene's lights are gathered once per frame
    const ready = m => { const p = renderer.properties.get(m).currentProgram; return p && p.isReady(); };
    const batch = [];
    for (const o of added) {
      if (!inScene(o)) continue;   // a detached group: its own add to the scene comes through later
      let fresh = false;
      o.traverse(c => { if (fresh || !c.material) return; fresh = Array.isArray(c.material) ? !c.material.every(ready) : !ready(c.material); });
      if (fresh) batch.push(o);
    }
    added.clear();
    if (!batch.length) return;
    // compile for the buffer the scene pass draws into: tone mapping and output colour space are part of the program key
    const rt0 = renderer.getRenderTarget(); renderer.setRenderTarget(target());
    wrap.children = batch;   // a parentless stand-in: traverse() follows children only, the objects keep their real parents
    // s8 (task 22df): compile() skips invisible objects, so pooled VFX (vfx.js adds its sprites/meshes hidden) linked
    // their programs synchronously on the first cast; show them for the compile only
    const hidden = []; wrap.traverse(c => { if (!c.visible) { c.visible = true; hidden.push(c); } });
    let mats = [];
    try { mats = [...renderer.compile(wrap, camera, scene)]; } catch (e) { }
    // s11 (task 22df): the shadow pass links a depth program on a caster's first shadow draw (player wizard on a
    // class pick, each new mob rig): compile that variant too, with a depth material set up as WebGLShadowMap does
    const swapped = new Map();   // a Map: the batch can reach one mesh twice (a group and its child both added)
    wrap.traverse(c => {
      if (!c.isMesh || !c.castShadow || !c.material || swapped.has(c)) return;
      const one = m => c.customDepthMaterial || depthFor(m);
      swapped.set(c, c.material);
      c.material = Array.isArray(c.material) ? c.material.map(one) : one(c.material);
    });
    if (swapped.size) {
      // the shadow pass draws with no fog (renderBufferDirect gets scene null), and fog is part of the program key
      let dm = new Set(); const fog = scene.fog; scene.fog = null;
      try { dm = renderer.compile(wrap, camera, scene); } catch (e) { }
      scene.fog = fog;
      for (const [c, m] of swapped) c.material = m;
      // hold each caster's own material until its depth program is ready as well
      for (const [c, m] of swapped) for (const real of [m].flat()) { const d = c.customDepthMaterial || depthOf.get(real); if (d && dm.has(d)) mats.push(real), depthHeld.set(real, d); }
    }
    for (const c of hidden) c.visible = false;
    if (stats.log) logProgs('gate');
    wrap.children = [];
    renderer.setRenderTarget(rt0);
    stats.compiled += batch.length;
    for (const m of new Set(mats)) {
      if (!m.visible || held.has(m) || m.isMeshDepthMaterial) continue;
      if (!ready(m) || (depthHeld.has(m) && !ready(depthHeld.get(m)))) { m.visible = false; held.set(m, true); stats.held++; }
    }
  };
}
