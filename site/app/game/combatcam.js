// Gameplay s5 (task 3102): combat camera occlusion. Runs after feel.js's shoulder offset (which can push the camera
// into a stall canopy or a wall the boom never saw). Each frame one ray from the player's chest to the camera is tested
// against the visual-only meshes (zone facades, stall canopies: player.camOcclude) and the world collision (marched);
// when blocked, the boom is shortened to just in front of the hit and raised a little, eased both ways (no snapping).
// Mobs within HIDE_R (1.5 m) of the camera are hidden outright (visible=false) instead of mobs.js's translucent camClear
// tint, which filled ~40% of combat frames with green blobs. Everything patched is restored on dispose.
const HIDE_R = 1.5, CHEST = 1.3, CLEAR = 0.3, MIN_D = 0.6, LIFT = 0.7, HIGH_D = 1.6;

export function install(game) {
  const p = game.player, T = game.THREE; if (!p?.applyCamera3 || !T) return;
  const st = game.combatCam = { k: 1, lift: 0, hits: 0, hidden: 0, frames: 0, high: 0, highT: 0, highP: null, highFrames: 0 };
  const a3 = p.applyCamera3;
  p.applyCamera3 = function (cam, dt = 1 / 60) {
    a3.call(this, cam, dt);
    if (!this.combatCam || window.__cam || window.__explore) { st.k = 1; st.lift = 0; st.high = 0; return; }
    st.frames++;
    // chest point and the chest->camera vector (three.js frame: x, z up, -y)
    const cx = this.x, cy = this.z + CHEST, cz = -this.y;
    let dx = cam.position.x - cx, dy = cam.position.y - cy, dz = cam.position.z - cz;
    const dist = Math.hypot(dx, dy, dz); if (dist < 0.2) return;
    dx /= dist; dy /= dist; dz /= dist;
    // raycast against visual-only meshes (rayaccel grid in main.js), then march the collision world
    let hit = this.camOcclude ? this.camOcclude(cx, cy, cz, dx, dy, dz, dist + CLEAR) : Infinity;
    const W = game.world;
    for (let r = 0.4; r < Math.min(hit, dist + CLEAR); r += 0.25) {
      const x = cx + dx * r, y = -(cz + dz * r), z = cy + dy * r;
      if (W.blocked(x, y, z - 0.25, 0.2, 0, 0.5)) { hit = r; break; }
    }
    const blocked = hit < dist + CLEAR;
    if (blocked) st.hits++;
    const wantK = blocked ? Math.max(MIN_D, hit - CLEAR) / dist : 1, wantLift = blocked ? LIFT * (1 - wantK) : 0;
    // ease: pull in quickly, let out slowly, both smooth
    st.k += (wantK - st.k) * Math.min(1, dt * (wantK < st.k ? 14 : 3));
    st.lift += (wantLift - st.lift) * Math.min(1, dt * 5);
    const d = dist * Math.min(1, st.k);
    cam.position.set(cx + dx * d, cy + dy * d + st.lift, cz + dz * d);
    // squeezed against a wall (narrow lanes, corners): the boom alone ends inside the avatar, so rise above and
    // slightly behind the player and look down at them; blended in/out smoothly
    const wantHigh = d < HIGH_D ? 1 : 0;
    if (wantHigh && (st.highT -= dt) <= 0) { st.highT = 0.25; st.highP = overhead(this); }
    st.high += ((wantHigh && st.highP ? 1 : 0) - st.high) * Math.min(1, dt * 4);
    if (st.high > 0.01 && st.highP) {
      const H = st.highP, a = st.high;
      cam.position.set(cam.position.x + (H.x - cam.position.x) * a, cam.position.y + (H.y - cam.position.y) * a, cam.position.z + (H.z - cam.position.z) * a);
      // look just past the player in the facing direction so the wizard sits low in frame with the way ahead visible
      const f = game.facing();
      q0.copy(cam.quaternion); m4.lookAt(cam.position, v0.set(cx + f.x * 1.5, this.z + 0.6, cz - f.y * 1.5), up); q1.setFromRotationMatrix(m4);
      cam.quaternion.copy(q0.slerp(q1, a)); st.highFrames++;
      if (a > 0.3 && !(this.camD >= 0.8)) this.camD = 0.8;   // main.js hides the avatar while camD < 0.8
    }
  };
  // highest clear spot 1.4-2.4 m above the chest, backed off up to 1.9 m
  const q0 = new T.Quaternion(), q1 = new T.Quaternion(), m4 = new T.Matrix4(), v0 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  function overhead(pl) {
    const W = game.world, ceil = W.support(pl.x, pl.y, pl.z + 6, true)?.z;
    for (const h of [2.4, 1.9, 1.4]) {
      const z = pl.z + CHEST + h; if (ceil != null && ceil > pl.z + 0.5 && ceil < z + 0.4) continue;
      if (W.blocked(pl.x, pl.y, z - 0.25, 0.2, 0, 0.5)) continue;
      // back off behind the player, else behind-left/right, else to the side: the most room wins (prefer behind)
      let best = null;
      for (const [da, pref] of [[0, 0.4], [0.6, 0.2], [-0.6, 0.2], [1.2, 0], [-1.2, 0]]) {
        const a = pl.yaw + da, bx = Math.sin(a), by = -Math.cos(a);
        let b = 0; for (let r = 0.25; r <= 2.2; r += 0.25) { if (W.blocked(pl.x + bx * r, pl.y + by * r, z - 0.25, 0.25, 0, 0.5)) break; b = r; }
        b = Math.max(0, b - 0.3);
        if (pl.camOcclude) {   // s6 (9e85): stall walls / zone facades between the chest and the overhead spot
          const ox = bx * b, oy = z - (pl.z + CHEST), oz = -by * b, L = Math.hypot(ox, oy, oz);
          const h = pl.camOcclude(pl.x, pl.z + CHEST, -pl.y, ox / L, oy / L, oz / L, L + 0.3);
          if (h < L + 0.3) continue;
        }
        if (!best || b + pref > best.s) best = { s: b + pref, x: pl.x + bx * b, y: z, z: -(pl.y + by * b) };
      }
      if (best) return best;
    }
    return null;
  }

  // hide (not tint) mobs whose body is within HIDE_R of the camera
  const S = game.mobSystem, clear0 = S?.camClear;
  const box = new T.Box3(), cv = new T.Vector3(), sz = new T.Vector3(), cp = new T.Vector3();
  if (S) S.camClear = function (cam) {
    if (!cam) return;
    cam.getWorldPosition(cp); let n = 0;
    for (const mob of game.mobs) {
      const grp = mob.group; if (!grp || mob.removed) continue;
      let B = mob.ccBody;
      if (!B) { box.setFromObject(grp); box.getCenter(cv); box.getSize(sz); B = mob.ccBody = { oy: cv.y - grp.position.y, r: Math.max(0.4, Math.min(sz.x, sz.z) * 0.5) }; }
      const d = Math.hypot(cp.x - mob.x, cp.y - (grp.position.y + B.oy), cp.z + mob.y) - B.r * 0.5;
      const hide = d < HIDE_R;
      if (hide && !mob.ccHidden) { mob.ccHidden = true; grp.visible = false; }
      else if (!hide && mob.ccHidden) { mob.ccHidden = false; grp.visible = true; }
      if (hide) n++;
    }
    st.hidden = n;
  };
  game.add({ dispose() {
    p.applyCamera3 = a3; if (S && clear0) S.camClear = clear0;
    for (const m of game.mobs) if (m.ccHidden && m.group) { m.group.visible = true; m.ccHidden = false; }
    delete game.combatCam;
  } });
}
