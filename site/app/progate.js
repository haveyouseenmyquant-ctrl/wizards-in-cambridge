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
  if (/[?&]debug/.test(location.search)) window.__progGate = stats;
  return () => {
    for (const [m] of held) {
      const p = renderer.properties.get(m).currentProgram;
      if (!p || p.isReady()) { m.visible = true; held.delete(m); }
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
    let mats = [];
    try { mats = renderer.compile(wrap, camera, scene); } catch (e) { }
    wrap.children = [];
    renderer.setRenderTarget(rt0);
    stats.compiled += batch.length;
    for (const m of mats) {
      if (!m.visible || held.has(m)) continue;
      const p = renderer.properties.get(m).currentProgram;
      if (p && !p.isReady()) { m.visible = false; held.set(m, true); stats.held++; }
    }
  };
}
