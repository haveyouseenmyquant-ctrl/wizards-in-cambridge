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
// type id -> glb + look: colour multiplies the KayKit atlas (or recolours per source material, see `mats`); emissive glow; opacity for the spectral ones
export const MOB_MODELS = {
  statue: { glb: 'statue', grey: true, color: 0xd8d0bc, rough: 0.95, metal: 0, emissive: 0x000000, ei: 0 },             // weathered Portland stone
  river_wraith: { glb: 'wraith', color: 0x7fe0d0, rough: 0.4, metal: 0, emissive: 0x1a8070, ei: 0.9, opacity: 0.94 },   // s6: was 0.82, read as a blob under spell VFX
  automaton: { glb: 'automaton', color: 0xd8a860, rough: 0.35, metal: 0.85, emissive: 0x000000, ei: 0 },     // brass
  ink_imp: { glb: 'imp', color: 0x5a5ab8, rough: 0.25, metal: 0.1, emissive: 0x201060, ei: 0.6 },              // wet ink
  punt_revenant: { glb: 'statue', grey: true, color: 0xb8ccd4, rough: 0.7, metal: 0, emissive: 0x0c2830, ei: 0.4 },     // river-drowned bones
  // Quaternius Ultimate Monsters (CC0): untextured, one material per part, so `mats` recolours by source material name
  // ('*' = any other); `alias` maps missing clip names onto existing ones; `size` scales the fitted height; `y0` puts the model's feet at that rig-local height (flyers: the
  // procedural model's lowest part is a hanging tail/rope, so bottom-matching would sink them); `swarm`
  // adds extra clones (own mixers, same clips, phase-offset) at the given offsets in fitted-model units.
  gargoyle: { glb: 'gargoyle', rough: 0.95, metal: 0, emissive: 0x000000, ei: 0, alias: { walk: 'run' }, size: 0.6, y0: -1.0,   // flying demon in weathered stone
    mats: { Demon_Main: { color: 0xd0cabc }, Black: { color: 0x7e7a72 }, Eye_White: { color: 0x9a6a40, emissive: 0xff7a10, ei: 1.4 }, Eye_Black: { color: 0x201008 } } },
  wisp: { glb: 'wisp', rough: 0.3, metal: 0, emissive: 0x12a890, ei: 1.0, opacity: 0.95, alias: { walk: 'run' }, size: 0.5, y0: -0.45,       // marsh-light ghost
    mats: { Ghost_Main: { color: 0x38d0b0 }, Eye_White: { color: 0xffffff, emissive: 0xe0fff8, ei: 2.5, opacity: 1 }, Eye_Black: { color: 0x0a3a40, emissive: 0x000000, ei: 0, opacity: 1 } } },
  bell_bats: { glb: 'bat', rough: 0.8, metal: 0, emissive: 0x000000, ei: 0, alias: { idle: 'run', walk: 'run' }, size: 0.4, y0: -0.3,   // belfry bats
    swarm: [[0.8, 0.3, -0.4], [-0.75, -0.2, -0.25]],
    mats: { Main: { color: 0x75606a }, Belly: { color: 0xd0b080 }, Eyes: { color: 0xffc040, emissive: 0xffa020, ei: 2.5 }, '*': { color: 0x2a2224 } } },
  // s9: Quaternius Animated Robot (CC0) as the moss-golem: moss-green plates over rusted bicycle iron
  bicycle_golem: { glb: 'golem', rough: 0.9, metal: 0.2, emissive: 0x000000, ei: 0,
    mats: { Main: { color: 0x6f9a34, emissive: 0x1c3008, ei: 0.5 }, Grey: { color: 0x7a5038 }, Black: { color: 0x202418 } } },
};
const ONCE = ['death', 'hit', 'attack', 'attack2', 'spawn', 'taunt'];

export function install(game) {
  const T = game.THREE, sys = game.mobSystem;
  if (!sys) return;
  const assets = {};
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  for (const n of new Set(Object.values(MOB_MODELS).map(m => m.glb)))
    assets[n] = loader.loadAsync(base(n)).then(g => (assets[n] = g)).catch(e => { console.warn('[mob_rig]', n, e.message); assets[n] = null; });

  const boxes = {};   // 919d: precise skinned bounds per glb (bind pose, same for every clone): ~10 ms per spawn otherwise
  const greyCache = new Map();
  const grey = (tex) => {   // desaturated copy of the palette atlas, for carved-stone and bleached-bone looks
    if (!tex?.image) return tex;
    if (greyCache.has(tex)) return greyCache.get(tex);
    const img = tex.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
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
    // s6: world-space body of the procedural model, for the camera-clearance spheres below (the skinned glbs' own
    // bounds are metres too big, so combatcam.js hid statues/automata/wraiths from 7 m away and camClear faded them)
    mob.group.updateMatrixWorld(true); const wb = new T.Box3(); proc.traverse(o => { if (o.isMesh && !o.userData.outline && o.geometry) wb.union(new T.Box3().setFromObject(o)); });
    proc.visible = false;
    const inner = new T.Group(); inner.name = 'glb';
    const made = new Map();   // material per look key, shared by the swarm clones
    const look = (src) => {
      if (!L.mats) {
        if (!made.has('')) made.set('', new T.MeshStandardMaterial({ roughness: L.rough, metalness: L.metal, color: L.color, emissive: L.emissive, emissiveIntensity: L.ei,
          transparent: !!L.opacity, opacity: L.opacity ?? 1, depthWrite: !L.opacity, map: L.grey ? grey(src.map) : src.map }));
        return made.get('');
      }
      const key = L.mats[src.name] ? src.name : '*';
      if (!made.has(key)) {
        const S = { ...L, ...(L.mats[key] || {}) }, op = S.opacity != null && S.opacity < 1;
        const m = new T.MeshStandardMaterial({ roughness: S.rough, metalness: S.metal, emissive: S.emissive, emissiveIntensity: S.ei,
          transparent: op, opacity: op ? S.opacity : 1, depthWrite: !op });
        if (S.color != null) m.color.setHex(S.color); else m.color.copy(src.color);
        made.set(key, m);
      }
      return made.get(key);
    };
    const units = [];
    for (let u = 0; u <= (L.swarm?.length || 0); u++) {
      const model = SkeletonUtils.clone(A.scene);
      model.traverse(o => { if (o.isMesh) { o.material = look(o.material); o.castShadow = true; o.frustumCulled = false; } });
      const mixer = new T.AnimationMixer(model), acts = {};
      for (const c of A.animations) acts[c.name] = mixer.clipAction(c);
      for (const [k, v] of Object.entries(L.alias || {})) if (!acts[k] && acts[v]) acts[k] = acts[v];
      for (const n of ONCE) if (acts[n]) { acts[n].setLoop(T.LoopOnce, 1); acts[n].clampWhenFinished = true; }
      units.push({ model, mixer, acts });
    }
    const model = units[0].model; inner.add(model);
    model.updateMatrixWorld(true);
    const box = boxes[L.glb] ??= new T.Box3().setFromObject(model, true), h = box.max.y - box.min.y || 1, k = procH * 1.05 * (L.size ?? 1) / h;
    inner.scale.setScalar(k); inner.position.y = (L.y0 ?? (pb.isEmpty() ? 0 : pb.min.y)) - box.min.y * k;
    units.slice(1).forEach((U, i) => { U.model.position.fromArray(L.swarm[i]).multiplyScalar(h); U.model.scale.setScalar(0.85 + 0.1 * i); inner.add(U.model); });
    R.add(inner);
    for (const mat of made.values()) {
      mob.mats.push(mat); mob.baseEmissive?.push({ c: mat.emissive.clone(), i: mat.emissiveIntensity });
      if (mob.matBase) mob.matBase.push([mat.transparent, mat.opacity]);
    }
    const { mixer, acts } = units[0];
    mob.glb = { mixer, acts, units, cur: null, lock: 0, lastState: null, inner, em: [...made.values()].filter(m => m.emissive).map(m => [m, m.emissive.clone()]) };
    mob.camBody = mob.ccBody = null;
    if (!wb.isEmpty() && !L.mats) {
      const c = wb.getCenter(new T.Vector3()), sz = wb.getSize(new T.Vector3()), oy = c.y - mob.group.position.y;
      mob.camBody = { oy, r: Math.max(0.6, sz.y * 0.4) };   // from the height: the width includes the flat aura disc
      mob.ccBody = { oy, r: Math.max(0.4, sz.y * 0.28) };
    }
    if (L.mats) {   // Quaternius rigs give a huge loose skinned box, which made camClear fade them from metres away: measure precisely
      mob.group.updateMatrixWorld(true);
      const bb = new T.Box3().setFromObject(inner, true), c = bb.getCenter(new T.Vector3()), sz = bb.getSize(new T.Vector3());
      mob.camBody = { oy: c.y - mob.group.position.y, r: Math.max(0.6, Math.min(sz.x, sz.z) * 0.5, sz.y * 0.4) };
      mob.ccBody = { oy: mob.camBody.oy, r: Math.max(0.4, Math.min(sz.x, sz.z) * 0.5) };
    }
    play(mob, mob.dead ? 'death' : 'idle', 0, 1);
    acts.idle && (acts.idle.time = Math.random() * acts.idle.getClip().duration);   // desync packs
    return true;
  };

  const WHITE = new T.Color(1, 1, 1);
  function play(mob, name, fade = 0.15, ts = 1) {
    const G = mob.glb; if (!G.acts[name]) return;
    G.units.forEach((U, i) => {
      const a = U.acts[name], sw = i ? 1 + 0.07 * i : 1;   // swarm clones run slightly off-beat
      if (G.cur === name && !ONCE.includes(name)) { a.timeScale = ts * sw; return; }
      const prev = G.cur && U.acts[G.cur];
      a.reset(); a.timeScale = ts * sw; a.enabled = true; a.setEffectiveWeight(1); a.play();
      if (i && !ONCE.includes(name)) a.time = (0.37 * i * a.getClip().duration) % a.getClip().duration;
      if (prev && prev !== a) prev.crossFadeTo(a, fade, false);
    });
    G.cur = name;
  }

  function drive(mob, dt) {
    const G = mob.glb, st = mob.state, a = mob.attack, dur = (n) => G.acts[n]?.getClip().duration || 1;
    G.lock = Math.max(0, G.lock - dt);
    // s6: every fresh hit restarts the hit clip and kicks a knockback lean on the skinned model (away from the player,
    // ~0.5 s) on top of mobs.js's 0.22 s rig flinch, so the reaction survives into still frames
    const newHit = !mob.dead && (mob.hitT || 0) > (G.hitPrev || 0) + 0.05; G.hitPrev = mob.hitT || 0;
    if (newHit) G.kick = 1;
    G.kick = Math.max(0, (G.kick || 0) - dt / 0.5);
    const kk = G.kick * G.kick * (3 - 2 * G.kick) * (mob.dead ? 0 : 1) * (1 - 0.6 * (mob.type.knockResist ?? 0));
    G.inner.rotation.x = -0.45 * kk; G.inner.rotation.z = 0.12 * kk * Math.sin(mob.id * 2.1 + G.kick * 9);
    if (mob.dead) {
      // s7: readable death - anticipation (0.25 s: rears back and stretches on the hit clip, white flash), then the death
      // clip collapses with a forward pitch and a squash as the body lands
      const t = G.deathT = (G.deathT ?? -dt) + dt, k0 = G.k0 ??= G.inner.scale.x, A = 0.25;
      if (t < A) {
        if (G.cur !== 'hit' || t < dt * 1.5) { G.cur = null; play(mob, G.acts.hit ? 'hit' : 'death', 0.05, G.acts.hit ? 0.9 : 0.4); }
        const u = Math.sin(Math.min(1, t / A) * Math.PI / 2);
        G.inner.rotation.x = -0.4 * u; G.inner.scale.set(k0 * (1 - 0.06 * u), k0 * (1 + 0.1 * u), k0 * (1 - 0.06 * u));
      } else {
        if (G.cur !== 'death') play(mob, 'death', 0.08, 1.1);
        const c = Math.min(1, (t - A) / 0.5), e = c * c * (3 - 2 * c), land = Math.max(0, 1 - Math.abs(t - A - 0.55) / 0.15);
        G.inner.rotation.x = -0.4 * (1 - e) + 0.25 * e; G.inner.scale.set(k0 * (1 + 0.08 * land), k0 * (1 - 0.12 * land), k0 * (1 + 0.08 * land));
      }
      const fl = Math.max(0, 1 - t / 0.35);
      for (const [m, c] of G.em) m.emissive.copy(c).lerp(WHITE, 0.7 * fl);
    }
    else if (st !== G.lastState && st === 'windup') {
      // strike lands (about 55% into the clip) as the wind-up ends and the attack goes active
      const n = mob.type.attacks.indexOf(a) % 2 && G.acts.attack2 ? 'attack2' : 'attack';
      play(mob, n, 0.1, Math.max(0.5, Math.min(2.5, dur(n) * 0.55 / Math.max(0.2, mob.windupEff || a?.windup || 0.8))));
      G.lock = dur(n) / G.acts[n].timeScale;
    } else if (st === 'stagger' && G.lastState !== 'stagger') { play(mob, 'hit', 0.08, 0.8); G.lock = 0.6; }
    else if (newHit && !['windup', 'active'].includes(st)) { G.cur = null; play(mob, 'hit', 0.05, 1.1); G.lock = Math.min(0.7, dur('hit') / 1.1); }
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
    for (const U of G.units) U.mixer.update(dt);
  }

  const spawn0 = sys.spawn.bind(sys);
  // 919d: at most ATTACH_PER_FRAME skinned clones per frame (an encounter spawning 10 mobs at once was a ~20 ms frame);
  // the rest keep their procedural body for a frame or two
  const ATTACH_PER_FRAME = 3; let budget = ATTACH_PER_FRAME;
  const tryAttach = (mob) => budget > 0 && attach(mob) && (budget--, true);
  sys.spawn = (...args) => { const mob = spawn0(...args); if (MOB_MODELS[mob.type.id]) tryAttach(mob) || (mob.glbPending = true); return mob; };
  // s4: rigged mobs keep their body after death. The procedural death styles (stretch, spin, swell) would mangle a
  // skinned model, so a rigged mob plays its death clip, flyers drop to the ground, the body lies still, then sinks and
  // fades. The whole thing stays under the 3 s the self-test (__mobTest) allows for removal.
  const DEATH_HOLD = 2.0, DEATH_END = 2.7;
  const tickDeath0 = sys.tickDeath.bind(sys);
  sys.tickDeath = (mob, dt) => {
    if (!mob.glb) return tickDeath0(mob, dt);
    mob.deathT += dt; const t = mob.deathT, gz = mob.groundZ ?? mob.z;
    if (mob.aura) mob.aura.material.opacity = Math.max(0, 0.5 * (1 - t / 0.6));
    if (mob.type.flying) { const f = Math.min(1, t / 0.7); mob.group.position.y = mob.z + (gz - mob.z) * f * f; }
    if (t > DEATH_HOLD) {
      const f = Math.min(1, (t - DEATH_HOLD) / (DEATH_END - DEATH_HOLD));
      mob.group.position.y = (mob.type.flying ? gz : mob.z) - f * 0.5 * mob.type.scale;
      for (const c of mob.mats) { c.transparent = true; c.depthWrite = f < 0.5; c.opacity = Math.max(0, 1 - f); }
    }
    if (t > DEATH_END) sys.remove(mob);
  };
  const update0 = sys.update.bind(sys);
  const tick = (dt) => {
    for (const mob of game.mobs) {
      if (mob.glbPending && tryAttach(mob)) mob.glbPending = false;
      if (mob.glb && !mob.removed) drive(mob, dt);
    }
    budget = ATTACH_PER_FRAME;
  };
  sys.update = (dt) => { update0(dt); tick(dt); };
  game.mobRig = { MOB_MODELS, assets, tick, ready: () => Object.values(assets).every(a => a && !(a instanceof Promise)) };
}
