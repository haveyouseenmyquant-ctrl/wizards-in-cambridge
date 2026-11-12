// Townsfolk (graphics s9, task d1ad): animated pedestrians and a few cyclists around the Market Square, Peas Hill,
// King's Parade and Senate House Hill, in exploration mode and in the game. They reuse the KayKit NPC rigs from
// npc_rig.js (shared loader and recoloured-atlas cache, so no extra start-up work beyond a few idle-sliced recolours),
// walk with the rig's walk clip plus a procedural bob / sway layer, steer with the collision world (standAt: ground,
// walls, no indoor spots), keep clear of the player and flee from live mobs. Cyclists ride a procedural bicycle.
// main.js installs it once the walk is ready (both modes, not for benchmark renders); the game's MODULES entry only
// hands it the game so walkers can see the mobs.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadNpc, recolour } from './npc_rig.js';
import { mergeSkinned } from '../mobcull.js';

// collision frame (x east, y north, m): the four recorded exploration spots, the square and the parade
const AREAS = [
  { x: -108, y: 94, r: 26, n: 7 },   // Market Hill
  { x: -122, y: -20, r: 18, n: 4 },  // Peas Hill
  { x: -190, y: 5, r: 26, n: 6 },    // King's Parade
  { x: -182, y: 68, r: 18, n: 4 },   // Senate House Hill
  { x: -150, y: 40, r: 30, n: 3 },   // round Great St Mary's
];
const CYCLISTS = 4;
const RIGS = ['nell', 'pip', 'absalom'], HEIGHT = { nell: 1.68, pip: 1.74, absalom: 1.82 };
// muted everyday clothes (robe = coat, trim = scarf / lining)
const PALETTES = [
  { robe: '#4a5a6e', trim: '#c9b48a' }, { robe: '#6b3a32', trim: '#d8c7a0' }, { robe: '#3f5a44', trim: '#bfa76a' },
  { robe: '#5b4d6b', trim: '#c2c2c2' }, { robe: '#7a6a4a', trim: '#3a3a44' }, { robe: '#2f3a4f', trim: '#b04a3a' },
];
const WALK = 1.25, CYCLE = 4.2, R = 0.3;
const rnd = (a, b) => a + Math.random() * (b - a);
// draw / update LOD (optimisation s9; ?folklod=0 turns it off): each rig's skinned parts merged once per rig file
// (KayKit: ~7 draws -> 1), the bicycle's static tubes and spokes merged, walkers out of the camera frustum (sphere
// padded for their shadow) or beyond FAR m hidden with their mixers paused, mixers beyond MID m stepped every 3rd frame,
// no shadow casting beyond SHADOW m.
const LOD = new URLSearchParams(location.search).get('folklod') !== '0';
const FAR = 90, MID = 30, SHADOW = 40;

let S = null;
export function install(ctx) {
  if (S) { if (ctx.mobs) S.game = ctx; return S.api; }
  if (!ctx.scene || !ctx.world || window.__cam) return null;   // never in benchmark renders
  S = { camera: ctx.camera, scene: ctx.scene, world: ctx.world, player: ctx.player, game: ctx.mobs ? ctx : null, folk: [], mats: new Map() };
  const root = S.root = new THREE.Group(); root.name = 'townsfolk'; S.scene.add(root);
  S.api = window.__townsfolk = { get folk() { return S.folk; }, root };
  start().catch(e => console.warn('[townsfolk]', e));
  let last = performance.now();
  const loop = () => {   // wall-clock time (sub-stepped on slow frames, so walkers keep their pace on software GL too)
    const t = performance.now(), dt = Math.min(1, (t - last) / 1000), n = Math.ceil(dt / 0.1); last = t;
    for (let i = 0; i < n; i++) tick(dt / n);
    cull();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return S.api;
}

const idle = () => new Promise(r => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 800 }) : setTimeout(r, 30)));

// ground and indoor tests: walkable ground at about street level with no roof just above the head
function groundAt(x, y, zHint) {
  const w = S.world, s = w.support(x, y, zHint + 3);
  if (!s || s.kind !== 1) return null;
  const roof = w.support(x, y, s.z + 40, true);
  if (roof && roof.z > s.z + 2.2) return null;
  if (w.blocked(x, y, s.z, R + 0.15)) return null;
  return s.z;
}
function spot(a) {
  const z0 = S.world.support(a.x, a.y, 60)?.z ?? 10;
  for (let i = 0; i < 60; i++) {
    const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * a.r, x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
    const z = groundAt(x, y, z0);
    if (z != null && Math.abs(z - z0) < 3) return { x, y, z };
  }
  return null;
}

// one material per (rig, palette): spawns at once with the stock atlas, the recoloured one (idle-sliced, shared with
// npc_rig.js) is swapped in when ready
async function material(file, pal) {
  const key = file + pal.robe + pal.trim;
  if (!S.mats.has(key)) S.mats.set(key, (async () => {
    const A = await loadNpc(file); if (!A) return null;
    let src = null; A.scene.traverse(o => { if (o.isMesh) src ??= o.material.map; });
    const mat = new THREE.MeshStandardMaterial({ map: src, roughness: 0.88 });
    if (pal.robe) recolour(src, pal, file).then(t => { mat.map = t; mat.needsUpdate = true; }).catch(() => {});
    return mat;
  })());
  return S.mats.get(key);
}

async function start() {
  // each area spawns as soon as its collision tiles are in (the walk is ready at the spawn; other spots stream later)
  let k = 0;
  const jobs = [];
  for (const a of AREAS) for (let i = 0; i < a.n; i++) jobs.push({ a, bike: false, k: k++ });
  for (let i = 0; i < CYCLISTS; i++) jobs.push({ a: AREAS[[0, 2, 4, 2][i % 4]], bike: true, k: k++ });
  for (let tries = 0; jobs.length && tries < 600; tries++) {
    await idle();
    let t0 = performance.now();
    for (let i = 0; i < jobs.length; i++) {
      // Optimisation s11 (task 22df): <= ~4 ms of spawning per idle slice (all 28 walkers in one tick was a start hitch)
      if (performance.now() - t0 > 4) { await idle(); t0 = performance.now(); }
      const j = jobs[i]; if (!S.world.covered(j.a.x, j.a.y)) continue;
      const p = spot(j.a); if (!p) continue;
      const r = j.k % RIGS.length, file = RIGS[r], pal = (j.k / RIGS.length | 0) % 2 ? PALETTES[r * 2 + (j.k % 2)] : {};   // stock or one of two per rig
      const A = await template(file), mat = await material(file, pal);
      jobs.splice(i--, 1);
      if (A && mat) spawn(A, file, mat, p, j);
    }
    if (jobs.length) await new Promise(r => setTimeout(r, 250));
  }
}

// per rig file: the loaded rig with its skinned parts merged (cloned per walker, so the merge runs once per file)
const tmpl = {};
function template(file) {
  return tmpl[file] ??= loadNpc(file).then(A => {
    if (!A || !LOD) return A;
    const scene = SkeletonUtils.clone(A.scene), m = new THREE.MeshStandardMaterial();
    scene.traverse(o => { if (o.isMesh) o.material = m; });
    try { mergeSkinned(THREE, scene); } catch (e) { console.warn('[townsfolk] merge', e); return A; }
    return { ...A, scene };
  });
}

const _fr = new THREE.Frustum(), _m = new THREE.Matrix4(), _sp = new THREE.Sphere();
function cull() {
  const cam = S.camera; if (!LOD || !cam) return;
  _fr.setFromProjectionMatrix(_m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const cx = cam.matrixWorld.elements[12], cz = cam.matrixWorld.elements[14];
  for (const f of S.folk) {
    const p = f.g.position, d = Math.hypot(p.x - cx, p.z - cz);
    _sp.center.set(p.x, p.y + 1, p.z); _sp.radius = 4;
    const vis = d < FAR && _fr.intersectsSphere(_sp);
    f.g.visible = vis; f.near = d < MID;
    const sh = d < SHADOW;
    if (f.shadow !== sh) { f.shadow = sh; f.g.traverse(o => { if (o.isMesh) o.castShadow = sh; }); }
  }
}

const boxes = {};
function spawn(A, file, mat, p, j) {
  const model = SkeletonUtils.clone(A.scene), g = new THREE.Group(), body = new THREE.Group(); g.name = 'townsfolk_' + j.k;
  model.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = true; o.frustumCulled = false; o.raycast = () => {}; } });   // not pickable, never blocks camera / view rays
  model.updateMatrixWorld(true);
  const box = boxes[file] ??= new THREE.Box3().setFromObject(model, true);
  const h = HEIGHT[file] * rnd(0.94, 1.06), k = h / (box.max.y - box.min.y || 1);
  body.scale.setScalar(k); body.position.y = -box.min.y * k; body.add(model); g.add(body);
  const mixer = new THREE.AnimationMixer(model), acts = {};
  for (const c of A.animations) acts[c.name] = mixer.clipAction(c);
  const f = { g, body, mixer, acts, cur: null, x: p.x, y: p.y, z: p.z, yaw: rnd(0, Math.PI * 2), bike: j.bike, home: j.a,
    speed: j.bike ? CYCLE * rnd(0.85, 1.15) : WALK * rnd(0.85, 1.2), phase: Math.random() * 10, wait: 0, turn: 0, probe: 0,
    moved: 0, start: { x: p.x, y: p.y }, h, mskip: 0, near: true };
  if (j.bike) {
    f.bikeG = bicycle(); g.add(f.bikeG);
    body.position.y += 0.62; body.position.z = -0.12; f.baseY = body.position.y;   // sat on the saddle
    play(f, acts.idle ? 'idle' : 'walk'); if (acts.idle) acts.idle.timeScale = 0.3;
  } else {
    play(f, 'walk'); acts.walk.time = Math.random() * acts.walk.getClip().duration;
    acts.walk.timeScale = f.speed / WALK;
  }
  S.root.add(g); S.folk.push(f);
  place(f, 0);
}

function play(f, name, fade = 0.3) {
  const a = f.acts[name]; if (!a || f.cur === name) return;
  const prev = f.cur && f.acts[f.cur];
  a.reset().play(); if (prev) prev.crossFadeTo(a, fade, false);
  f.cur = name;
}

const BIKE = {};
function bicycle() {
  BIKE.frame ??= new THREE.MeshStandardMaterial({ color: 0x1d2a3a, roughness: 0.5, metalness: 0.6 });
  BIKE.tyre ??= new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  BIKE.wheel ??= new THREE.TorusGeometry(0.33, 0.03, 6, 20);
  BIKE.spoke ??= new THREE.CylinderGeometry(0.008, 0.008, 0.64, 4);
  BIKE.tube ??= new THREE.CylinderGeometry(0.022, 0.022, 1, 5);
  const g = new THREE.Group(); g.name = 'bicycle'; g.userData.wheels = [];
  for (const z of [0.5, -0.5]) {
    const w = new THREE.Group(); w.position.set(0, 0.34, z); w.rotation.y = Math.PI / 2;
    w.add(new THREE.Mesh(BIKE.wheel, BIKE.tyre));
    BIKE.spokes ??= mergeGeometries([0, 1, 2].map(i => BIKE.spoke.clone().rotateZ(i * Math.PI / 3)));
    if (LOD) w.add(new THREE.Mesh(BIKE.spokes, BIKE.frame));
    else for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(BIKE.spoke, BIKE.frame); s.rotation.z = i * Math.PI / 3; w.add(s); }
    g.add(w); g.userData.wheels.push(w);
  }
  const tube = (a, b) => {   // a frame tube between two points (side view: y up, z forward)
    const m = new THREE.Mesh(BIKE.tube, BIKE.frame), A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    m.position.copy(A).add(B).multiplyScalar(0.5); m.scale.y = A.distanceTo(B);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize()); g.add(m);
  };
  tube([0, 0.34, -0.5], [0, 0.42, 0]); tube([0, 0.42, 0], [0, 0.85, -0.12]); tube([0, 0.85, -0.12], [0, 0.82, 0.38]);
  tube([0, 0.42, 0], [0, 0.82, 0.38]); tube([0, 0.34, 0.5], [0, 1.0, 0.4]); tube([-0.25, 1.0, 0.4], [0.25, 1.0, 0.4]);
  tube([0, 0.34, -0.5], [0, 0.85, -0.12]);
  if (LOD) {   // the seven frame tubes -> one mesh (geometry shared by every bicycle)
    const tubes = g.children.filter(o => o.geometry === BIKE.tube);
    BIKE.frameGeo ??= mergeGeometries(tubes.map(o => { o.updateMatrix(); return BIKE.tube.clone().applyMatrix4(o.matrix); }));
    for (const o of tubes) g.remove(o);
    g.add(new THREE.Mesh(BIKE.frameGeo, BIKE.frame));
  }
  for (const o of g.children) { o.castShadow = true; o.raycast = () => {}; }
  return g;
}

// yaw 0 = north (+y), positive = left (player convention); the KayKit rigs face +z in model space
function place(f, dt) {
  f.g.position.set(f.x, f.z, -f.y);
  f.g.rotation.y = f.yaw + Math.PI;
}

// ambient crowd: walkers left far behind (player walked / teleported away) move to street spots 8-35 m round the
// player, within the city centre, so the street the player is in always has people in it
const NEAR = 70, CENTRE = { x: -151, y: 60, r: 450 };
function regroup(P) {
  if (!P || Math.hypot(P.x - CENTRE.x, P.y - CENTRE.y) > CENTRE.r) return;
  let n = 0;
  for (const f of S.folk) {
    if (Math.hypot(f.x - P.x, f.y - P.y) < NEAR || n >= 4) continue;
    const a = { x: P.x, y: P.y, r: f.bike ? 40 : 35 }, z0 = S.world.support(P.x, P.y, P.z + 2)?.z ?? P.z;
    for (let i = 0; i < 20; i++) {
      const p = spot(a);
      if (!p || Math.hypot(p.x - P.x, p.y - P.y) < 8 || Math.abs(p.z - z0) > 2.5) continue;
      Object.assign(f, p, { home: { x: P.x, y: P.y, r: 22 }, stall: 0, yaw: Math.random() * Math.PI * 2 }); n++; break;
    }
  }
}

function tick(dt) {
  if (!S || !S.folk.length) return;
  const P = S.player || S.game?.player, mobs = S.game && !S.game.disposed ? S.game.mobs : null;
  if ((S.regroupT = (S.regroupT || 0) - dt) <= 0) { S.regroupT = 0.4; regroup(P); }
  for (const f of S.folk) {
    // threats: live mobs within 14 m -> walk / ride away briskly; the player -> step round them
    let ax = 0, ay = 0, flee = false;
    if (mobs) for (const m of mobs) {
      if (m.dead) continue; const dx = f.x - m.x, dy = f.y - m.y, d = Math.hypot(dx, dy);
      if (d < 14) { ax += dx / (d + 0.1) * (14 - d); ay += dy / (d + 0.1) * (14 - d); flee = true; }
    }
    if (P) { const dx = f.x - P.x, dy = f.y - P.y, d = Math.hypot(dx, dy); if (d < 2.2) { ax += dx / (d + 0.1) * 3; ay += dy / (d + 0.1) * 3; } }
    // home pull: wander inside the area (cyclists range wider)
    const hx = f.home.x - f.x, hy = f.home.y - f.y, hd = Math.hypot(hx, hy), lim = f.home.r * (f.bike ? 2.2 : 1.3);
    if (hd > lim) { ax += hx / hd * 2; ay += hy / hd * 2; }
    f.turn -= dt;
    if (f.turn <= 0) { f.turn = rnd(3, 8); f.yawGoal = f.yaw + rnd(-1.2, 1.2); }
    if (ax || ay) f.yawGoal = Math.atan2(-ax, ay);
    let dy_ = ((f.yawGoal ?? f.yaw) - f.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    f.yaw += Math.sign(dy_) * Math.min(Math.abs(dy_), dt * (f.bike ? 1.2 : 2.5));
    const sp = f.speed * (flee ? (f.bike ? 1.3 : 1.9) : 1);
    // move with the collision world; on a wall / kerb drop / indoor spot turn away and try again next frame
    const fx = -Math.sin(f.yaw), fy = Math.cos(f.yaw), nx = f.x + fx * sp * dt, ny = f.y + fy * sp * dt;
    f.probe -= dt;
    let ok = true;
    if (f.probe <= 0) {   // look 1.2 m ahead a few times a second (blocked() is the expensive bit)
      f.probe = 0.2;
      const z = groundAt(f.x + fx * 1.2, f.y + fy * 1.2, f.z);
      ok = z != null && Math.abs(z - f.z) < 0.5;
      if (!ok) { f.yawGoal = f.yaw + (Math.random() < 0.5 ? 1 : -1) * rnd(1.4, 2.6); f.turn = rnd(2, 4); f.stall = (f.stall || 0) + 1; }
      else f.stall = 0;
    }
    if (ok || f.stall > 12) {
      const s = S.world.support(nx, ny, f.z + 0.5);
      if (s && s.kind === 1 && Math.abs(s.z - f.z) < 0.5) { f.moved += Math.hypot(nx - f.x, ny - f.y); f.x = nx; f.y = ny; f.z += (s.z - f.z) * Math.min(1, dt * 10); }
    }
    if (f.stall > 30) { const p = spot(f.home); if (p) Object.assign(f, p, { stall: 0 }); }
    // procedural layer on top of the clip: walk bob and side sway, or pedalling bob and wheel spin for cyclists
    f.phase += dt * (f.bike ? sp / 2.1 : sp * 1.75) * Math.PI;
    if (f.bike) {
      for (const w of f.bikeG.userData.wheels) w.rotation.x -= sp * dt / 0.34;
      f.body.position.y = f.baseY + Math.abs(Math.sin(f.phase)) * 0.03;
      f.g.rotation.z = Math.max(-0.2, Math.min(0.2, -dy_ * 0.35));
      if (f.acts.walk) { if (f.cur !== 'walk') play(f, 'walk'); f.acts.walk.timeScale = sp / 2.4; }   // legs cycling
    } else {
      f.acts.walk && (f.acts.walk.timeScale = sp / WALK);
      f.body.rotation.z = Math.sin(f.phase) * 0.04; f.body.rotation.x = flee ? 0.18 : 0.04;
    }
    f.mdt = (f.mdt || 0) + dt;   // the mixer runs when the walker is drawn: every frame near, every 3rd far
    if (!LOD || (f.g.visible && (f.near || ++f.mskip % 3 === 0))) { f.mixer.update(f.mdt); f.mdt = 0; }
    place(f, dt);
  }
}
