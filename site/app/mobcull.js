// Mob draw culling (optimisation s5). Rigged mob models (game/mob_rig.js) are skinned meshes with frustumCulled = false
// (their bind-pose bounds do not follow the animation), so every live mob was drawn in the main and the shadow pass even
// when far off screen. Each frame this hides a rigged mob's model when neither the mob nor its ground shadow can be in
// the camera frustum, and stops far mobs casting shadows (their shadow is a few texels of the 240 m sun map).
// The animation mixers keep running, so a mob that comes back into view is in the right pose. ?mobcull=0 turns it off.
// It also merges the skinned parts of each loaded mob model that share a skeleton, bind matrix and material (KayKit
// skeletons: 9-10 part meshes, one atlas material) into one SkinnedMesh before mob_rig clones it: 1 draw instead of 10.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const OFF = new URLSearchParams(location.search).get('mobcull') === '0';

// gltfpack quantizes each part's positions on its own scale and folds that dequantization into the part's inverse bind
// matrices, so parts are merged in float: part i's vertices are mapped into part 0's bind space by
// R_i = inv(IBM_0j) * IBM_ij (the same for every joint j, checked), and the merged mesh uses part 0's skeleton.
const names = (g) => Object.keys(g.attributes).sort().join(',') + (g.index ? '#i' : '') + (Object.keys(g.morphAttributes).length ? '#m' : '');
function floatGeo(T, g, R) {
  const out = new T.BufferGeometry(), v = new T.Vector3(), nm = new T.Matrix3().getNormalMatrix(R);
  for (const [k, a] of Object.entries(g.attributes)) {
    const n = a.count, s = a.itemSize, f = new (k === 'skinIndex' ? Uint16Array : Float32Array)(n * s);
    for (let i = 0; i < n; i++) {
      if (k === 'position' || k === 'normal') {
        v.fromBufferAttribute(a, i); k === 'position' ? v.applyMatrix4(R) : v.applyMatrix3(nm).normalize(); v.toArray(f, i * 3);
      } else for (let c = 0; c < s; c++) f[i * s + c] = a.getComponent(i, c);
    }
    out.setAttribute(k, new T.BufferAttribute(f, s));
  }
  out.setIndex(g.index ? Array.from(g.index.array) : null);
  return out;
}
export function mergeSkinned(T, root) {
  const groups = new Map(); let saved = 0;
  root.traverse(o => {
    if (!o.isSkinnedMesh || Array.isArray(o.material) || !o.skeleton) return;
    const L = names(o.geometry); if (L.includes('#m')) return;
    const key = [o.skeleton.bones.map(b => b.uuid).join(','), o.material.uuid, o.parent?.uuid, L,
      o.bindMatrix.elements.map(v => v.toFixed(5)).join(','), o.matrix.elements.map(v => v.toFixed(5)).join(',')].join(';');
    (groups.get(key) || groups.set(key, []).get(key)).push(o);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const a = list[0], inv0 = a.skeleton.boneInverses.map(m => m.clone().invert()), Rs = [];
    for (const o of list) {
      const R = new T.Matrix4().multiplyMatrices(inv0[0], o.skeleton.boneInverses[0]);
      const ok = o.skeleton.boneInverses.every((m, j) => new T.Matrix4().multiplyMatrices(inv0[j], m).elements.every((x, e) => Math.abs(x - R.elements[e]) < 1e-3 * (1 + Math.abs(x))));
      Rs.push(ok ? R : null);
    }
    const use = list.filter((o, i) => Rs[i]); if (use.length < 2) continue;
    const geo = mergeGeometries(use.map(o => floatGeo(T, o.geometry, Rs[list.indexOf(o)])), false);
    if (!geo) continue;
    const m = new T.SkinnedMesh(geo, a.material);
    m.name = a.name + '_merged'; m.position.copy(a.position); m.quaternion.copy(a.quaternion); m.scale.copy(a.scale);
    m.castShadow = a.castShadow; m.receiveShadow = a.receiveShadow; m.frustumCulled = a.frustumCulled;
    a.parent.add(m); m.bind(a.skeleton, a.bindMatrix);
    for (const o of use) o.parent.remove(o);
    saved += use.length - 1;
  }
  return saved;
}

export function install(game) {
  if (OFF) return;
  const T = game.THREE, cam = game.camera;
  const merged = {};
  const prep = (n, g) => { if (g?.scene && !g.userData?.mobMerged) { (g.userData ||= {}).mobMerged = true; merged[n] = mergeSkinned(T, g.scene); } return g; };
  const assets = game.mobRig?.assets || {};
  for (const [n, a] of Object.entries(assets)) { if (a instanceof Promise) a.then(g => prep(n, g)); else prep(n, a); }
  const fr = new T.Frustum(), pv = new T.Matrix4(), sph = new T.Sphere(), sun = new T.Vector3(), c = new T.Vector3();
  const SHADOW_D = 45;   // m from the camera beyond which mobs stop casting shadows
  let light = null;
  const stats = { mobs: 0, hidden: 0, noShadow: 0 };
  const setShadow = (G, on) => { if (G.shadowOn === on) return; G.shadowOn = on; G.inner.traverse(o => { if (o.isMesh) o.castShadow = on; }); };
  game.add({
    update() {
      if (!light) game.scene.traverse(o => { if (!light && o.isDirectionalLight && o.castShadow) light = o; });
      if (light) sun.subVectors(light.position, light.target.position).normalize(); else sun.set(0, 1, 0);
      const k = 1 / Math.max(0.25, sun.y);   // ground shadow offset per metre of height
      cam.updateMatrixWorld();
      fr.setFromProjectionMatrix(pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      stats.mobs = stats.hidden = stats.noShadow = 0;
      for (const mob of game.mobs) {
        const G = mob.glb; if (!G || mob.removed) continue;
        stats.mobs++;
        const p = mob.group.position, h = Math.max(1, (mob.camBody?.oy ?? 1) * 2 + (mob.type.hover || 0) + 1) * (mob.type.scale || 1);
        // one sphere around the body and its shadow: from the head down to the shadow tip on the ground
        const sx = sun.x * h * k, sz = sun.z * h * k;
        c.set(p.x - sx * 0.5, p.y + h * 0.5 - (mob.type.hover || 0) * 0.5, p.z - sz * 0.5);
        sph.set(c, 2 + 0.5 * Math.hypot(sx, h, sz));
        const vis = fr.intersectsSphere(sph);
        if (G.inner.visible !== vis) G.inner.visible = vis;
        if (!vis) { stats.hidden++; continue; }
        const far = cam.position.distanceTo(p) > SHADOW_D;
        setShadow(G, !far); if (far) stats.noShadow++;
      }
    },
  });
  if (window.__debug !== undefined || /[?&]debug/.test(location.search)) window.__mobCull = Object.assign(stats, { merged });
}
