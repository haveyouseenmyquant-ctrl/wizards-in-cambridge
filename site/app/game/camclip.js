// Gameplay s8 (task 751e, issue 5ac5): the combat camera never ends inside a market prop. Runs after combatcam.js (last
// applyCamera3 wrapper). The zone's prop meshes (market stall strips with their canopies, back sheets and frames,
// clutter, trailers, the fountain, street furniture) have no collision, and the boom / overhead fallback could end
// inside one (judge: combat frame inside a stall at Market Hill). Each prop gets an oriented box (min-area rectangle of
// its vertices in plan, full height), built once. Per frame, if the camera is inside a box grown by MARGIN: pull it
// in along the chest->camera line to the first clear point when that leaves >= MIN_D of boom; otherwise (the player
// stands inside a stall strip) lift it above the box tops and look down at the player (lift eases down, snaps up).
const PROP = /^(market_stalls|clutter|trailer|fountain|furniture)/, MARGIN = 0.25, MIN_D = 1.2, CHEST = 1.3, LIFT_PAD = 0.35;

export function install(game) {
  const p = game.player, T = game.THREE; if (!p?.applyCamera3 || !T) return;
  const st = game.camClip = { boxes: null, near: [], nearT: 0, pulls: 0, lifts: 0, frames: 0, lift: 0, nx: 1e9, nz: 1e9 };
  const v = new T.Vector3(), m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0);
  // Optimisation s8 (task 22df): a generator run at <= 4 ms per frame (building every box in one frame was a 90-120 ms
  // hitch at game start); the camera is unclipped for the few frames it takes
  function* build() {
    const zone = game.scene?.getObjectByName('zone'); if (!zone) return [];
    zone.updateMatrixWorld(true);
    const boxes = [], meshes = [];
    zone.traverse(m => { if (m.isMesh && m.geometry && (PROP.test(m.name) || PROP.test(m.parent?.name || ''))) meshes.push(m); });
    let t0 = performance.now();
    for (const m of meshes) {
      if (performance.now() - t0 > 4) { yield; t0 = performance.now(); }
      // only each 1 cm column's lowest and highest z go to the hull (stall strips have 10^5 vertices; hull error <= 1 cm)
      const pa = m.geometry.getAttribute('position'), col = new Map(), e = m.matrixWorld.elements; let y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < pa.count; i++) {
        if ((i & 4095) === 4095 && performance.now() - t0 > 4) { yield; t0 = performance.now(); }
        const px = pa.getX(i), py = pa.getY(i), pz = pa.getZ(i);
        const x = e[0] * px + e[4] * py + e[8] * pz + e[12], y = e[1] * px + e[5] * py + e[9] * pz + e[13], z = e[2] * px + e[6] * py + e[10] * pz + e[14];
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        const k = Math.round(x * 100), c = col.get(k);
        if (!c) col.set(k, [x, z, x, z]); else if (z < c[1]) { c[0] = x; c[1] = z; } else if (z > c[3]) { c[2] = x; c[3] = z; }
      }
      const pts = []; for (const c of col.values()) pts.push([c[0], c[1]], [c[2], c[3]]);
      const b = minRect(pts); if (b) boxes.push({ ...b, y0, y1, cx: (b.u0 + b.u1) / 2 * b.ux - (b.w0 + b.w1) / 2 * b.uz, cz: (b.u0 + b.u1) / 2 * b.uz + (b.w0 + b.w1) / 2 * b.ux, r: Math.hypot(b.u1 - b.u0, b.w1 - b.w0) / 2 });
    }
    return boxes;
  }
  const inside = (b, x, y, z, e) => {
    if (y < b.y0 - e || y > b.y1 + e) return false;
    const u = x * b.ux + z * b.uz, w = -x * b.uz + z * b.ux;
    return u > b.u0 - e && u < b.u1 + e && w > b.w0 - e && w < b.w1 + e;
  };
  const hitAny = (x, y, z) => { for (const b of st.near) if (inside(b, x, y, z, MARGIN)) return b; return null; };

  // Optimisation s10 (task 2409, issue 4a30): the prop pull / lift above never looked at buildings, and combatcam's
  // collision march misses roofs and eaves over the camera. Last step every combat frame: if the camera is inside a
  // solid surface's reach (wall within WALL_R, or a solid roof / building top above it), march chest -> camera and
  // stop CLEAR m before the first bad point (collision frame: x, y, z up = three.js x, -z, y).
  const W = game.world, WALL_R = 0.25, CLEAR = 0.3;
  const roofAbove = (x, y, z) => {
    for (const t of W.tiles.values()) {
      if (!t.contains(x, y)) continue;
      const k = t.topAt(x, y); if (k >= 0 && t.kind[k] === 0 && t.heightAt(k, x, y) > z - 0.05) return true;
    }
    return false;
  };
  const wall = (x, y, z) => W.blocked(x, y, z - WALL_R, WALL_R, 0, 2 * WALL_R);
  const bad = (x, y, z) => wall(x, y, z) || roofAbove(x, y, z);
  // chest -> point clear of walls (and of roofs too unless the player already stands under one: a tall roof's eave)
  const lineClear = (hx, hy, hz, x, y, z, roofed) => {
    const dx = x - hx, dy = y - hy, dz = z - hz, L = Math.hypot(dx, dy, dz);
    for (let r = 0.3; r <= L; r += 0.2) { const f = r / L, px = hx + dx * f, py = hy + dy * f, pz = hz + dz * f; if (roofed ? wall(px, py, pz) : bad(px, py, pz)) return false; }
    return !(pl0.camOcclude && pl0.camOcclude(hx, hz, -hy, dx / L, dz / L, -dy / L, L + 0.2) < L + 0.2);
  };
  const pl0 = p, A = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI], RH = [[2.6, 1.2], [1.9, 0.9], [1.3, 0.6], [2.6, 2.2]];
  let keep = null, keepT = 0;   // last off-line spot (offset from the chest), held while it stays clear
  function collide(pl, cam, dt) {
    const c = cam.position, hx = pl.x, hy = pl.y, hz = pl.z + CHEST;
    let x = c.x, y = -c.z, z = c.y;
    const dx = x - hx, dy = y - hy, dz = z - hz, L = Math.hypot(dx, dy, dz);
    if (L < 0.4) return;
    // also an un-eased line-of-sight ray (combatcam eases its pull-in; the zone can appear mid-fight)
    // prop boxes (and this ray) count too, unless the chest is in a box (standing in a stall strip: the lift above
    // handles that, and a ray from inside the strip would pull the lifted camera back down into it)
    const props = !hitAny(hx, hz, -hy), badP = (x, y, z) => bad(x, y, z) || (props && !!hitAny(x, z, -y));
    const occ = props && pl.camOcclude ? pl.camOcclude(hx, hz, -hy, dx / L, dz / L, -dy / L, L) : Infinity;
    if (occ >= L && !badP(x, y, z)) { keep = null; return; }
    st.walls++;
    // 1) pull in along the line to just before the first bad point or visual hit, if that leaves a usable boom
    let r = 0.3; for (; r < L; r += 0.1) if (badP(hx + dx * r / L, hy + dy * r / L, hz + dz * r / L)) break;
    r = Math.min(r, occ);
    if (r - CLEAR >= 1.2) { const f = (r - CLEAR) / L; c.set(hx + dx * f, hz + dz * f, -(hy + dy * f)); keep = null; return; }
    // 2) a clear spot around the player (azimuths from the current camera bearing, then shorter/higher booms)
    const roofed = roofAbove(hx, hy, hz);
    let spot = null;
    if (keep && (keepT -= dt) > 0) { const k = [hx + keep[0], hy + keep[1], hz + keep[2]]; if (!badP(...k) && lineClear(hx, hy, hz, ...k, roofed)) spot = k; }
    if (!spot) {
      const a0 = Math.hypot(dx, dy) > 0.2 ? Math.atan2(dy, dx) : Math.atan2(Math.cos(pl.yaw), -Math.sin(pl.yaw));
      search: for (const [R, H] of RH) for (const da of A) {
        const k = [hx + Math.cos(a0 + da) * R, hy + Math.sin(a0 + da) * R, hz + H];
        if (!badP(...k) && !hitAny(k[0], k[2], -k[1]) && lineClear(hx, hy, hz, ...k, roofed)) { spot = k; break search; }
      }
      if (spot) { keep = [spot[0] - hx, spot[1] - hy, spot[2] - hz]; keepT = 0.4; st.spots++; }
    }
    if (spot) { c.set(spot[0], spot[2], -spot[1]); m4.lookAt(c, v.set(hx, pl.z + 0.9, -hy), up); q.setFromRotationMatrix(m4); cam.quaternion.copy(q); return; }
    const f = Math.max(0.3, r - CLEAR) / L; c.set(hx + dx * f, hz + dz * f, -(hy + dy * f));   // nothing clear: best effort
  }
  st.spots = 0;
  st.walls = 0;

  const a3 = p.applyCamera3;
  p.applyCamera3 = function (cam, dt = 1 / 60) {
    a3.call(this, cam, dt);
    if (!this.combatCam || window.__cam || window.__explore) { st.lift = 0; return; }
    clipProps.call(this, cam, dt);
    if (W?.tiles) collide(this, cam, dt);
  };
  function clipProps(cam, dt) {
    if (!st.boxes) {   // zone.js: __zoneReady true once loaded
      if (!window.__zoneReady) return;
      const r = (st.gen ||= build()).next(); if (!r.done) return;
      st.boxes = r.value; st.gen = null; st.nearT = 0;
    }
    const cx = this.x, cy = this.z + CHEST, cz = -this.y;
    if ((st.nearT -= 1) <= 0 || Math.hypot(st.nx - cx, st.nz - cz) > 2) { st.nearT = 15; st.nx = cx; st.nz = cz; st.near = st.boxes.filter(b => Math.hypot(b.cx - cx, b.cz - cz) < b.r + 9); }
    st.frames++;
    const c = cam.position;
    let b = hitAny(c.x, c.y, c.z);
    if (b) {   // pull in along the chest->camera line to the farthest clear point
      const dx = c.x - cx, dy = c.y - cy, dz = c.z - cz, L = Math.hypot(dx, dy, dz);
      for (let d = L - 0.1; d >= MIN_D; d -= 0.1) {
        const f = d / L; if (!hitAny(cx + dx * f, cy + dy * f, cz + dz * f)) { c.set(cx + dx * f, cy + dy * f, cz + dz * f); b = null; st.pulls++; break; }
      }
    }
    let want = 0;
    if (b) {   // still inside: rise over the tops of every box the camera column is in
      let y = c.y;
      for (let k = 0; k < 4 && b; k++) { y = Math.max(y, b.y1 + LIFT_PAD); b = hitAny(c.x, y, c.z); }
      want = y - c.y; st.lifts++;
    }
    st.lift = want >= st.lift ? want : st.lift + (want - st.lift) * Math.min(1, dt * 3);
    if (st.lift > 0.01) {
      c.y += st.lift;
      if (hitAny(c.x, c.y, c.z)) c.y += want;   // eased-down lift dipped back into a box: hold it clear
      m4.lookAt(c, v.set(cx, this.z + 0.9, cz), up); q.setFromRotationMatrix(m4);
      cam.quaternion.slerp(q, Math.min(1, st.lift / 0.6));
    }
  }
  game.add({ dispose() { p.applyCamera3 = a3; delete game.camClip; } });
}

// min-area rectangle of 2D points (convex hull edge directions): {ux, uz, u0, u1, w0, w1}; u along (ux, uz), w across
function minRect(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const H = lo.slice(0, -1).concat(hi.slice(0, -1)); let best = null;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    for (const p of H) { const u = p[0] * ux + p[1] * uz, w = -p[0] * uz + p[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w); }
    const A = (u1 - u0) * (w1 - w0); if (!best || A < best.A) best = { A, ux, uz, u0, u1, w0, w1 };
  }
  return best;
}
