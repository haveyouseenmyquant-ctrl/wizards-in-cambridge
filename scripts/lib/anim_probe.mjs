// QA s12 (task 2879): animation probe for recorded frames, a cheap pre-judge measure of visible body motion for Graphics.
// animProbe() runs in the page (page.evaluate) right where wic_record / gameplay_clip take a frame: no extra recording
// pass. It reads the joint rotations of
//   player  game.wizardRig.model (skinned wizard; rest = skeleton bind pose from boneInverses)
//   mobs    live game.mobs within NEAR m of the player: the skinned GLB units (rest = skeleton bind pose from
//           boneInverses), else the procedural body (every Object3D under mob.rig; rest = first sample of that mob)
//   npcs    skinned meshes under a group with userData.npcRig or named townsfolk_* within NEAR m (bind pose rest)
// and returns per actor the mean joint deviation from rest (deg) plus a compact joint snapshot, so animSummary() can
// tell frame to frame whether an actor moved at all. Player cast state comes from the rig (hold / castT envelope).
// animSummary(samples) turns the per-frame results into the <hash>_wic.json fields:
//   player_pose_dev_deg   mean over frames of the player's mean joint deviation from rest
//   mob_pose_dev_deg      mean over (frame, mob) of the mob's mean joint deviation from rest
//   npc_pose_dev_deg      same for NPCs and townsfolk
//   cast_pose_frames_pct  % of game-mode frames where the player is in a cast pose: rig in its cast window and the
//                         arm/hand joints >= CAST_ARM_DEG off rest
//   rigid_mob_pct         % of mobs seen in >= 2 frames whose joints never move > RIGID_DEG between their frames
//                         (skinned mobs seen once count as rigid if within RIGID_DEG of bind pose; procedural ones seen
//                         once are not counted)
//   rigid_npc_pct         same for NPCs
export function animProbe() {
  const g = window.__game, P = window.__p, T = window.__THREE;
  if (!T) return null;
  const NEAR = 40, D = 180 / Math.PI;
  const ang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w))) * D;
  const st = window.__animProbeRest ||= new WeakMap();
  // bind-pose local rotation of each bone with a bone parent (the skeleton root carries the model orientation)
  const bindRest = sk => {
    if (st.has(sk)) return st.get(sk);
    const m = new Map(), inv = sk.boneInverses, idx = new Map(sk.bones.map((b, i) => [b, i]));
    sk.bones.forEach((b, i) => {
      const pi = idx.get(b.parent); if (pi == null) return;
      const loc = inv[pi].clone().multiply(inv[i].clone().invert()), q = new T.Quaternion(); loc.decompose(new T.Vector3(), q, new T.Vector3()); m.set(b, q);
    });
    st.set(sk, m); return m;
  };
  const measure = (pairs, armRe) => {
    let s = 0, n = 0, as = 0, an = 0; const snap = [];
    for (const [b, r] of pairs) { const d = ang(b.quaternion, r); s += d; n++; if (armRe && armRe.test(b.name)) { as += d; an++; }
      const q = b.quaternion; snap.push(+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)); }
    return { dev: n ? +(s / n).toFixed(2) : null, arm: an ? +(as / an).toFixed(2) : null, joints: n, snap };
  };
  const skinPairs = root => { const pairs = [], seen = new Set();
    root.traverse(o => { if (!o.isSkinnedMesh || seen.has(o.skeleton)) return; seen.add(o.skeleton);
      for (const [b, q] of bindRest(o.skeleton)) pairs.push([b, q]); });
    return pairs; };
  const out = { t: g ? +(+g.time).toFixed(2) : null, player: null, mobs: [], npcs: [] };
  const px = P?.x ?? 0, py = P?.y ?? 0;
  // player
  const R = g?.wizardRig?.model;
  if (R?.root && R.root.visible !== false) {
    const pairs = skinPairs(R.root);   // whole skeleton vs bind pose (R.rest only holds the 9 procedural-layer bones)
    const m = measure(pairs, /arm|hand|shoulder|forearm/i);
    const ct = R.hold === 'cast' || R.hold === 'windup' ? 0 : g.time - R.castT;
    out.player = { dev: m.dev, arm: m.arm, joints: m.joints, snap: m.snap, cast_window: ct >= 0 && ct < 0.95, hold: R.hold || null };
  }
  // mobs
  for (const mob of g?.mobs || []) {
    if (mob.dead || !mob.group) continue;
    const mp = new T.Vector3().setFromMatrixPosition(mob.group.matrixWorld), d = Math.hypot(mp.x - px, -mp.z - py);
    if (d > NEAR) continue;
    let pairs = [], kind = 'skinned';
    for (const U of mob.glb?.units || []) pairs.push(...skinPairs(U.model));
    if (!pairs.length) {
      kind = 'procedural';
      const base = st.get(mob) || new Map();
      (mob.rig || mob.group).traverse(o => { if (o === mob.rig || o === mob.group) return; if (!base.has(o)) base.set(o, o.quaternion.clone()); pairs.push([o, base.get(o)]); });
      st.set(mob, base);
    }
    const type = mob.type?.id || mob.name || null, id = `${type}#${mob.id}`;
    const m = measure(pairs);
    out.mobs.push({ id, type, kind, dist: +d.toFixed(1), state: mob.state || null, dev: m.dev, joints: m.joints, snap: m.snap });
  }
  // NPCs + townsfolk
  const scene = window.__scene;
  if (scene) scene.traverse(o => {
    if (!(o.userData?.npcRig || /^townsfolk_/.test(o.name || ''))) return;
    if (o.visible === false) return;
    const wp = new T.Vector3().setFromMatrixPosition(o.matrixWorld), d = Math.hypot(wp.x - px, -wp.z - py);
    if (d > NEAR) return;
    const pairs = skinPairs(o); if (!pairs.length) return;
    const m = measure(pairs);
    out.npcs.push({ id: o.userData.npcRig?.id || o.uuid.slice(0, 8), dist: +d.toFixed(1), dev: m.dev, joints: m.joints, snap: m.snap });
  });
  return out;
}

const CAST_ARM_DEG = 20, RIGID_DEG = 1;
const maxStep = (a, b) => { if (!a || !b || a.length !== b.length) return null; let m = 0;
  for (let i = 0; i < a.length; i += 4) { const d = Math.abs(a[i] * b[i] + a[i + 1] * b[i + 1] + a[i + 2] * b[i + 2] + a[i + 3] * b[i + 3]);
    m = Math.max(m, 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI); } return m; };
const mean = a => a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2) : null;

// samples: [{scene, file, anim}] in recording order (anim = animProbe() result or {error}); a scene is one continuous
// page, so frame-to-frame motion is only compared inside a scene
export function animSummary(samples) {
  const ok = samples.filter(s => s.anim && !s.anim.error);
  const pl = ok.filter(s => s.anim.player?.dev != null);
  const game = pl.filter(s => !/^explore/.test(s.scene));
  const cast = game.filter(s => s.anim.player.cast_window && (s.anim.player.arm ?? 0) >= CAST_ARM_DEG);
  const actors = (key) => {
    const by = new Map();
    for (const s of ok) for (const a of s.anim[key] || []) { const k = `${s.scene}|${a.id}`; if (!by.has(k)) by.set(k, []); by.get(k).push(a); }
    const res = [];
    for (const [k, list] of by) {
      let move = 0; for (let i = 1; i < list.length; i++) move = Math.max(move, maxStep(list[i - 1].snap, list[i].snap) ?? 0);
      // a procedural mob seen once has no rest to compare with (its rest is its first sample): not counted
      const rigid = list.length > 1 ? move < RIGID_DEG : list[0].kind === 'procedural' ? null : (list[0].dev ?? 0) < RIGID_DEG;
      res.push({ key: k, type: list[0].type ?? null, kind: list[0].kind ?? 'skinned', frames: list.length, max_step_deg: +move.toFixed(2), mean_dev_deg: mean(list.map(a => a.dev ?? 0)), rigid });
    }
    return res;
  };
  const mobs = actors('mobs'), npcs = actors('npcs');
  const pct = (n, d) => d ? +(100 * n / d).toFixed(1) : null;
  // player frame-to-frame motion inside a scene
  const pstep = []; for (let i = 1; i < pl.length; i++) if (pl[i].scene === pl[i - 1].scene) pstep.push(maxStep(pl[i - 1].anim.player.snap, pl[i].anim.player.snap) ?? 0);
  return {
    player_pose_dev_deg: mean(pl.map(s => s.anim.player.dev)),
    player_pose_step_deg: mean(pstep),
    mob_pose_dev_deg: mean(ok.flatMap(s => (s.anim.mobs || []).map(m => m.dev ?? 0))),
    npc_pose_dev_deg: mean(ok.flatMap(s => (s.anim.npcs || []).map(m => m.dev ?? 0))),
    cast_pose_frames_pct: pct(cast.length, game.length) ?? 0,
    rigid_mob_pct: pct(mobs.filter(m => m.rigid).length, mobs.filter(m => m.rigid != null).length) ?? 0,
    rigid_npc_pct: pct(npcs.filter(m => m.rigid).length, npcs.filter(m => m.rigid != null).length),
    anim_probe_detail: {
      frames_probed: ok.length, player_frames: pl.length, game_frames: game.length, cast_frames: cast.length,
      cast_window_frames: game.filter(s => s.anim.player.cast_window).length, errors: samples.filter(s => s.anim?.error).length,
      player_rest_frames: pl.filter(s => s.anim.player.dev < RIGID_DEG).map(s => `${s.scene}/${s.file}`),
      mobs_seen: mobs.length, npcs_seen: npcs.length, cast_arm_deg: CAST_ARM_DEG, rigid_deg: RIGID_DEG,
      rigid_mobs: mobs.filter(m => m.rigid).map(m => `${m.key} (${m.kind}, ${m.frames} fr)`).slice(0, 20),
      mob_types: Object.fromEntries([...new Set(mobs.map(m => m.type))].map(t => { const l = mobs.filter(m => m.type === t);
        return [t, { seen: l.length, rigid: l.filter(m => m.rigid).length, mean_dev_deg: mean(l.map(m => m.mean_dev_deg)) }]; })),
    },
  };
}
