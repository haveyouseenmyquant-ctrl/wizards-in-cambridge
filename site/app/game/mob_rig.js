// Rigged, animated mob models (graphics s2). Loads site/models/mobs/*.glb (KayKit Skeletons pack by Kay Lousberg, CC0,
// trimmed by scripts/build_char_glb.mjs; clips idle, walk, run, attack, attack2, hit, death, spawn, taunt) and draws them
// in place of the procedural model for the mob types below. The procedural model stays in the scene graph, hidden, so
// mobs.js part animation, death debris and the fallback (model failed to load) keep working unchanged. The skinned
// model sits inside mob.rig, so the shared body-language layer (lunge, flinch, topple) still applies on top of the clips.
// Clips are picked from the mob state each frame and cross-faded with one AnimationMixer per mob, driven by game dt.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from '../../vendor/meshoptimizer/meshopt_decoder.module.js';

const base = (n) => new URL(`../../models/mobs/${n}.glb`, import.meta.url).href;
// type id -> glb + look: colour multiplies the KayKit atlas; emissive glow; opacity for the spectral ones
export const MOB_MODELS = {
  statue: { glb: 'statue', grey: true, color: 0xd8d0bc, rough: 0.95, metal: 0, emissive: 0x000000, ei: 0 },             // weathered Portland stone
  river_wraith: { glb: 'wraith', color: 0x7fe0d0, rough: 0.4, metal: 0, emissive: 0x1a8070, ei: 0.9, opacity: 0.82 },
  automaton: { glb: 'automaton', color: 0xd8a860, rough: 0.35, metal: 0.85, emissive: 0x000000, ei: 0 },     // brass
  ink_imp: { glb: 'imp', color: 0x5a5ab8, rough: 0.25, metal: 0.1, emissive: 0x201060, ei: 0.6 },              // wet ink
  punt_revenant: { glb: 'statue', grey: true, color: 0xb8ccd4, rough: 0.7, metal: 0, emissive: 0x0c2830, ei: 0.4 },     // river-drowned bones
};
const ONCE = ['death', 'hit', 'attack', 'attack2', 'spawn', 'taunt'];

export function install(game) {
  const T = game.THREE, sys = game.mobSystem;
  if (!sys) return;
  const assets = {};
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  for (const n of new Set(Object.values(MOB_MODELS).map(m => m.glb)))
    assets[n] = loader.loadAsync(base(n)).then(g => (assets[n] = g)).catch(e => { console.warn('[mob_rig]', n, e.message); assets[n] = null; });

  const greyCache = new Map();
  const grey = (tex) => {   // desaturated copy of the palette atlas, for carved-stone and bleached-bone looks
    if (!tex?.image) return tex;
    if (greyCache.has(tex)) return greyCache.get(tex);
    const img = tex.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2], v = 70 + l * 0.75; p[i] = p[i + 1] = p[i + 2] = v; }
    g.putImageData(d, 0, 0);
    const t = new T.CanvasTexture(c); t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.magFilter = T.NearestFilter; t.minFilter = T.LinearFilter; t.generateMipmaps = false;
    greyCache.set(tex, t); return t;
  };

  const attach = (mob) => {
    const L = MOB_MODELS[mob.type.id], A = L && assets[L.glb];
    if (!A || A instanceof Promise || mob.removed || mob.glb) return false;
    const R = mob.rig;
    // measure the procedural body (rig local frame) before hiding it, so the skinned model matches its size
    const proc = new T.Group(); proc.name = 'proc'; while (R.children.length) proc.add(R.children[0]); R.add(proc);
    R.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(R.matrixWorld).invert(), pb = new T.Box3();
    proc.traverse(o => { if (o.isMesh && !o.userData.outline && o.geometry) { o.geometry.computeBoundingBox(); pb.union(o.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
    const procH = pb.isEmpty() ? 1.8 : Math.max(0.6, pb.max.y - pb.min.y);
    proc.visible = false;
    const model = SkeletonUtils.clone(A.scene), inner = new T.Group(); inner.name = 'glb'; inner.add(model);
    const mat = new T.MeshStandardMaterial({ roughness: L.rough, metalness: L.metal, color: L.color, emissive: L.emissive, emissiveIntensity: L.ei,
      transparent: !!L.opacity, opacity: L.opacity ?? 1, depthWrite: !L.opacity });
    model.traverse(o => { if (o.isMesh) { if (!mat.map) mat.map = L.grey ? grey(o.material.map) : o.material.map; o.material = mat; o.castShadow = true; o.frustumCulled = false; } });
    model.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(model, true), h = box.max.y - box.min.y || 1, k = procH * 1.05 / h;
    inner.scale.setScalar(k); inner.position.y = (pb.isEmpty() ? 0 : pb.min.y) - box.min.y * k;
    R.add(inner);
    mob.mats.push(mat); mob.baseEmissive?.push({ c: mat.emissive.clone(), i: mat.emissiveIntensity });
    if (mob.matBase) mob.matBase.push([mat.transparent, mat.opacity]);
    const mixer = new T.AnimationMixer(model), acts = {};
    for (const c of A.animations) acts[c.name] = mixer.clipAction(c);
    for (const n of ONCE) if (acts[n]) { acts[n].setLoop(T.LoopOnce, 1); acts[n].clampWhenFinished = true; }
    mob.glb = { mixer, acts, cur: null, lock: 0, lastState: null, inner };
    mob.camBody = null;
    play(mob, mob.dead ? 'death' : 'idle', 0, 1);
    acts.idle && (acts.idle.time = Math.random() * acts.idle.getClip().duration);   // desync packs
    return true;
  };

  function play(mob, name, fade = 0.15, ts = 1) {
    const G = mob.glb, a = G.acts[name]; if (!a) return;
    if (G.cur === name && !ONCE.includes(name)) { a.timeScale = ts; return; }
    const prev = G.cur && G.acts[G.cur];
    a.reset(); a.timeScale = ts; a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (prev && prev !== a) prev.crossFadeTo(a, fade, false);
    G.cur = name;
  }

  function drive(mob, dt) {
    const G = mob.glb, st = mob.state, a = mob.attack, dur = (n) => G.acts[n]?.getClip().duration || 1;
    G.lock = Math.max(0, G.lock - dt);
    if (mob.dead) { if (G.cur !== 'death') play(mob, 'death', 0.1, 1.2); }
    else if (st !== G.lastState && st === 'windup') {
      // strike lands (about 55% into the clip) as the wind-up ends and the attack goes active
      const n = mob.type.attacks.indexOf(a) % 2 && G.acts.attack2 ? 'attack2' : 'attack';
      play(mob, n, 0.1, Math.max(0.5, Math.min(2.5, dur(n) * 0.55 / Math.max(0.2, mob.windupEff || a?.windup || 0.8))));
      G.lock = dur(n) / G.acts[n].timeScale;
    } else if (st === 'stagger' && G.lastState !== 'stagger') { play(mob, 'hit', 0.08, 0.8); G.lock = 0.6; }
    else if (mob.hitT > 0.3 && G.cur !== 'hit' && !['windup', 'active'].includes(st)) { play(mob, 'hit', 0.06, 1.3); G.lock = dur('hit') / 1.3; }
    else if (G.lock <= 0) {
      const moved = Math.hypot(mob.x - (G.px ?? mob.x), mob.y - (G.py ?? mob.y)) / Math.max(1e-3, dt);
      const fly = mob.type.flying;
      if (st === 'active' && a?.kind === 'charge') play(mob, 'run', 0.1, 1.6);
      else if (!fly && moved > 2.6) play(mob, 'run', 0.2, Math.min(1.6, moved / 4.5));
      else if (!fly && moved > 0.3) play(mob, 'walk', 0.2, Math.min(1.8, Math.max(0.6, moved / 1.6)));
      else if (fly && moved > 0.3) play(mob, 'walk', 0.25, 0.7);
      else play(mob, 'idle', 0.25, 1);
    }
    G.lastState = st; G.px = mob.x; G.py = mob.y;
    G.mixer.update(dt);
  }

  const spawn0 = sys.spawn.bind(sys);
  sys.spawn = (...args) => { const mob = spawn0(...args); if (MOB_MODELS[mob.type.id]) attach(mob) || (mob.glbPending = true); return mob; };
  const update0 = sys.update.bind(sys);
  const tick = (dt) => {
    for (const mob of game.mobs) {
      if (mob.glbPending && attach(mob)) mob.glbPending = false;
      if (mob.glb && !mob.removed) drive(mob, dt);
    }
  };
  sys.update = (dt) => { update0(dt); tick(dt); };
  game.mobRig = { MOB_MODELS, assets, tick, ready: () => Object.values(assets).every(a => a && !(a instanceof Promise)) };
}
