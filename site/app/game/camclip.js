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
  function build() {
    const zone = game.scene?.getObjectByName('zone'); if (!zone) return [];
    zone.updateMatrixWorld(true);
    const boxes = [];
    zone.traverse(m => {
      if (!m.isMesh || !m.geometry || !(PROP.test(m.name) || PROP.test(m.parent?.name || ''))) return;
      const pa = m.geometry.getAttribute('position'), pts = []; let y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld); pts.push([v.x, v.z]); if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y; }
      const b = minRect(pts); if (b) boxes.push({ ...b, y0, y1, cx: (b.u0 + b.u1) / 2 * b.ux - (b.w0 + b.w1) / 2 * b.uz, cz: (b.u0 + b.u1) / 2 * b.uz + (b.w0 + b.w1) / 2 * b.ux, r: Math.hypot(b.u1 - b.u0, b.w1 - b.w0) / 2 });
    });
    return boxes;
  }
  const inside = (b, x, y, z, e) => {
    if (y < b.y0 - e || y > b.y1 + e) return false;
    const u = x * b.ux + z * b.uz, w = -x * b.uz + z * b.ux;
    return u > b.u0 - e && u < b.u1 + e && w > b.w0 - e && w < b.w1 + e;
  };
  const hitAny = (x, y, z) => { for (const b of st.near) if (inside(b, x, y, z, MARGIN)) return b; return null; };

  const a3 = p.applyCamera3;
  p.applyCamera3 = function (cam, dt = 1 / 60) {
    a3.call(this, cam, dt);
    if (!this.combatCam || window.__cam || window.__explore) { st.lift = 0; return; }
    if (!st.boxes) { if (!window.__zoneReady || !(st.boxes = build())) return; st.nearT = 0; }   // zone.js: true once loaded
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
  };
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
