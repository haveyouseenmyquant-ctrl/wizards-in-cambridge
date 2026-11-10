// Player: input (keyboard + mouse, touch joystick + buttons, gamepad) and movement.
// On foot: walk/run, jump (coyote time + jump buffer), crouch, slide, dash, ledge climb, 1st/3rd person.
// Broom: free flight with hover, collides with buildings and terrain, lands on roofs.
import { STEP, BODY_HI } from './collision.js';

const WALK = 1.4, RUN = 6, CROUCH = 1.3, TURN = 1.8, GRAVITY = 9.81, SUBSTEP = 0.15;
const EYE = 1.65, EYE_CROUCH = 1.0, HI_CROUCH = 1.2;
const ACCEL_GROUND = 18, ACCEL_AIR = 5;
const JUMP_V = 4.6, COYOTE = 0.12, JUMP_BUFFER = 0.15;
const SLIDE_V = 8.5, SLIDE_T = 0.9, SLIDE_FRICTION = 5;
const DASH_V = 15, DASH_T = 0.18, DASH_CD = 1.0, DOUBLE_TAP = 0.25;
const CLIMB_MAX = 1.5, CLIMB_T = 0.4;
const FLY = 10, FLY_BOOST = 28, FLY_ACCEL = 6, FLY_UP = 6, FLY_MAX_AGL = 150, FLY_SUBSTEP = 0.3;
// Study area (52.1975–52.2125 N, 0.1080–0.1330 E) in the world frame, counter-clockwise (pyproj, EPSG:27700 − origin).
const AREA = [[-829.3, -832.0], [879.2, -782.0], [830.1, 886.1], [-877.8, 836.2]];
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

// Push (x, y) back inside the study area (convex quad) if it left it.
function clampArea(x, y) {
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = AREA[i], [bx, by] = AREA[(i + 1) % 4];
    const ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey), nx = ey / l, ny = -ex / l; // outward normal
    const d = (x - ax) * nx + (y - ay) * ny;
    if (d > 0) { x -= nx * d; y -= ny * d; }
  }
  return [x, y];
}

export class Player {
  constructor(world, canvas) {
    this.world = world;
    this.x = 0; this.y = 0; this.z = 0;    // feet, collision frame
    this.yaw = 0; this.pitch = 0;           // yaw 0 = facing north, positive = turning left
    this.vx = 0; this.vy = 0; this.vz = 0;  // velocity (m/s)
    this.grounded = false; this.pendingPlace = null;
    this.mode = 'walk';                     // 'walk' | 'climb' | 'broom'
    this.view = 1;                          // 1 = first person, 3 = third person
    this.crouching = false; this.slideT = 0; this.dashT = 0; this.dashCd = 0;
    this.t = 0; this.lastGround = -1; this.jumpAt = -1; this.lastTap = {}; this.climb = null;
    this.eyeH = EYE; this.runLatch = false;
    this.keys = new Set(); this.joy = { x: 0, y: 0 };
    this.canPlace = () => true; // set by the app: are the tiles around a teleport target loaded?
    this.onChange = () => {};    // set by the app: mode/view changed (for the HUD)
    this.initInput(canvas);
  }

  get eye() { return this.z + this.eyeH; }
  get heading() { return -this.yaw; } // compass heading (radians clockwise from north)
  get speed() { return Math.hypot(this.vx, this.vy); }
  get flying() { return this.mode === 'broom'; }
  get sliding() { return this.slideT > 0; }
  get dashing() { return this.dashT > 0; }

  // Put the player at (x, y); feet are placed once collision there is loaded. With z: the walkable
  // surface at or below z + STEP; without z: the nearest open walkable ground (searching outwards).
  teleport(x, y, z = null, lookAt = null) {
    this.x = x; this.y = y; if (z != null) this.z = z;
    this.vx = this.vy = this.vz = 0; this.grounded = false; this.slideT = this.dashT = 0; this.climb = null;
    if (this.mode === 'climb') this.mode = 'walk';
    this.pendingPlace = { x, y, z, lookAt };
  }
  tryPlace() {
    const p = this.pendingPlace, w = this.world;
    if (!w.covered(p.x, p.y) || (p.z == null && !this.canPlace(p.x, p.y))) return false;
    if (p.z != null) {
      const g = w.standAt(p.x, p.y, p.z) ?? w.standAt(p.x, p.y, 1e4);
      if (g == null) return false;
      this.x = p.x; this.y = p.y; this.z = g;
    } else {
      // Landmark centres are usually inside buildings: look for open ground about 30 m away
      // (rings at 30, 24, 36, 18, ... m) with no wall in the way for the first part of the view line.
      const radii = [30]; for (let k = 6; k <= 120; k += 6) { if (30 - k >= 0) radii.push(30 - k); radii.push(30 + k); }
      let found = null;
      for (const r of radii) {
        const n = r === 0 ? 1 : Math.ceil(2 * Math.PI * r / 4);
        for (let i = 0; i < n && !found; i++) {
          const a = i / n * 2 * Math.PI, ux = Math.cos(a), uy = Math.sin(a), x = p.x + r * ux, y = p.y + r * uy;
          const s = w.support(x, y, 1e4);
          if (!s || s.kind !== 1 || s.surface === 9) continue;
          const g = w.standAt(x, y, s.z);
          if (g == null) continue;
          let clear = true;
          for (let d = 2; d < r - 15 && clear; d += 2) clear = !w.blocked(x - ux * d, y - uy * d, g, 0.05);
          if (clear) found = [x, y, g];
        }
        if (found) break;
      }
      if (!found) return false;
      [this.x, this.y, this.z] = found;
    }
    if (p.lookAt) this.yaw = -Math.atan2(p.lookAt[0] - this.x, p.lookAt[1] - this.y);
    else this.faceOpen();
    this.pendingPlace = null; this.grounded = true;
    return true;
  }

  // Face the direction with the longest walkable straight line (up to 80 m) from here.
  faceOpen() {
    let best = 0;
    for (let a = 0; a < 24; a++) {
      const yaw = a / 24 * 2 * Math.PI, sx = -Math.sin(yaw), sy = Math.cos(yaw);
      let d = 0, z = this.z;
      for (; d < 80; d += 1) {
        const g = this.world.standAt(this.x + sx * (d + 1), this.y + sy * (d + 1), z);
        if (g == null) break; z = g;
      }
      if (d > best) { best = d; this.yaw = yaw; }
    }
  }

  // ---- input actions (keyboard, touch buttons and gamepad all come through press/release) ----
  press(code) {
    if (this.keys.has(code)) return;
    this.keys.add(code);
    if (code === 'Space') this.jumpAt = this.t;
    else if (code === 'KeyQ') this.wantDash = true;
    else if (code === 'KeyC' || code === 'ControlLeft' || code === 'ControlRight') this.wantSlide = true;
    else if (code === 'KeyB') this.toggleBroom();
    else if (code === 'KeyV') { this.view = this.view === 1 ? 3 : 1; this.onChange(); }
    else if (MOVE_KEYS.includes(code)) {
      if (this.t - (this.lastTap[code] ?? -9) < DOUBLE_TAP) this.wantDash = true;
      this.lastTap[code] = this.t;
    }
  }
  release(code) { this.keys.delete(code); }

  toggleBroom() {
    if (this.pendingPlace) return;
    if (this.mode === 'broom') {          // dismount: keep momentum, fall if airborne
      this.mode = 'walk'; this.grounded = false;
    } else {
      this.mode = 'broom'; this.climb = null; this.slideT = this.dashT = 0; this.crouching = false;
      this.vz = Math.max(this.vz, 1.5);   // a little lift on mounting
    }
    this.onChange();
  }

  input() {
    const k = this.keys;
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - this.joy.y;
    let s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.joy.x;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || this.runLatch || Math.hypot(this.joy.x, this.joy.y) > 0.95;
    const down = k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight');
    return { f, s, run, down, up: k.has('Space') };
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    this.pollGamepad(dt);
    if (this.pendingPlace) { if (!this.tryPlace()) return; this.mode = this.mode === 'broom' ? 'broom' : 'walk'; }
    const k = this.keys;
    this.yaw += ((k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0)) * TURN * dt;
    const inp = this.input();
    if (this.mode === 'broom') this.fly(dt, inp);
    else if (this.mode === 'climb') this.climbStep(dt);
    else this.walk(dt, inp);
    this.dashCd = Math.max(0, this.dashCd - dt);
    // eye height eases between standing and crouching
    const eyeT = this.mode === 'broom' ? 1.25 : (this.crouching || this.sliding) ? EYE_CROUCH : EYE;
    this.eyeH += (eyeT - this.eyeH) * Math.min(1, dt * 12);
    this.wantDash = this.wantSlide = false;
  }

  walk(dt, inp) {
    const w = this.world, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward = (-sin yaw, cos yaw), right = (cos yaw, sin yaw) in x-east/y-north
    const wx = -sy * inp.f + cy * inp.s, wy = cy * inp.f + sy * inp.s, moving = Math.hypot(wx, wy) > 0.05;
    const onWater = this.grounded && w.support(this.x, this.y, this.z + 0.01)?.kind === 2;
    // crouch (hold) / slide (crouch pressed while running fast on the ground)
    if (this.wantSlide && this.grounded && inp.run && this.speed > RUN * 0.7 && !this.sliding) {
      const sp = Math.max(this.speed, SLIDE_V) / this.speed;
      this.vx *= sp; this.vy *= sp; this.slideT = SLIDE_T;
    }
    this.crouching = inp.down && this.grounded;
    if (!this.crouching && !this.sliding && !this.standClear()) this.crouching = true; // no headroom to stand
    // dash: a short burst in the input direction (or forward), with a cooldown
    if (this.wantDash && this.dashCd <= 0 && !onWater) {
      const [dx, dy] = moving ? [wx / Math.hypot(wx, wy), wy / Math.hypot(wx, wy)] : [-sy, cy];
      this.vx = dx * DASH_V; this.vy = dy * DASH_V; this.dashT = DASH_T; this.dashCd = DASH_CD; this.slideT = 0;
    }
    // horizontal velocity
    if (this.dashT > 0) {
      this.dashT -= dt;
      if (this.dashT <= 0) { const sp = this.speed, cap = RUN / Math.max(sp, 1e-6); if (sp > RUN) { this.vx *= cap; this.vy *= cap; } }
    } else if (this.slideT > 0) {
      this.slideT -= dt;
      const sp = this.speed, ns = Math.max(0, sp - SLIDE_FRICTION * dt);
      if (sp > 1e-6) { this.vx *= ns / sp; this.vy *= ns / sp; }
      if (ns < CROUCH || !this.grounded) this.slideT = 0;
    } else {
      const target = onWater ? 1.2 : this.crouching ? CROUCH : inp.run ? RUN : WALK;
      const tx = wx * target, ty = wy * target, ex = tx - this.vx, ey = ty - this.vy, el = Math.hypot(ex, ey);
      const a = (this.grounded ? ACCEL_GROUND : ACCEL_AIR) * dt;
      if (el <= a) { this.vx = tx; this.vy = ty; } else { this.vx += ex / el * a; this.vy += ey / el * a; }
    }
    // jump (buffered press, coyote time after leaving the ground)
    if (this.grounded) this.lastGround = this.t;
    if (this.t - this.jumpAt < JUMP_BUFFER && this.t - this.lastGround < COYOTE && !this.crouching) {
      this.vz = JUMP_V; this.grounded = false; this.jumpAt = this.lastGround = -9; this.slideT = 0;
    }
    // horizontal move in substeps, sliding along walls, stepping up and following the ground down
    const opts = { roofs: true, water: onWater, hi: this.crouching || this.sliding ? HI_CROUCH : BODY_HI };
    let dx = this.vx * dt, dy = this.vy * dt, hitWall = false;
    // session 54: depenetration. A player standing where standAt says no (overlapping a bollard or railing after a
    // shove / spell landing) could not take any substep, since every nearby point was blocked too: the route bot
    // softlocked twice by the King's Parade bollards. Push out to the nearest valid spot within 0.8 m.
    if (this.grounded && !this.climb && (dx || dy) && w.standAt(this.x, this.y, this.z, opts) == null) {
      out: for (let r = 0.1; r <= 0.8; r += 0.1) for (let k = 0; k < 16; k++) {
        const a = k / 16 * 6.283, x = this.x + Math.cos(a) * r, y = this.y + Math.sin(a) * r, g = w.standAt(x, y, this.z, opts);
        if (g != null && Math.abs(g - this.z) <= STEP) { this.x = x; this.y = y; this.z = g; break out; }
      }
    }
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SUBSTEP));
    dx /= n; dy /= n;
    for (let i = 0; i < n && (dx || dy); i++) {
      const [cx, cy2] = clampArea(this.x + dx, this.y + dy);
      let g = w.standAt(cx, cy2, this.z, opts);
      if (g != null) { this.x = cx; this.y = cy2; }
      else if ((g = w.standAt(this.x + dx, this.y, this.z, opts)) != null) { this.x += dx; dy = 0; hitWall = true; }
      else if ((g = w.standAt(this.x, this.y + dy, this.z, opts)) != null) { this.y += dy; dx = 0; hitWall = true; }
      else { hitWall = true; break; }
      if (g > this.z) this.z = g;                                              // step up
      else if (this.z - g <= STEP && this.grounded && this.vz <= 0) this.z = g; // follow the ground down
    }
    if (hitWall && moving && inp.f > 0.3 && this.tryLedge(sy, cy, opts)) return;
    // vertical: gravity, ceiling, landing
    const ground = w.support(this.x, this.y, this.z + 0.01, true);
    if (this.vz > 0 || (ground && ground.z < this.z - 1e-3)) {
      this.vz -= GRAVITY * dt;
      const nz = this.z + this.vz * dt;
      if (this.vz > 0 && w.blocked(this.x, this.y, nz, 0.25, 0.3, opts.hi + 0.05)) this.vz = 0; // bumped head
      else this.z = ground ? Math.max(ground.z, nz) : nz;
      this.grounded = false;
    }
    if (ground && this.z <= ground.z + 1e-3 && this.vz <= 0) { this.z = ground.z; this.vz = 0; this.grounded = true; }
    if (!ground) { this.vz = 0; this.grounded = true; } // outside loaded collision: hold still vertically
  }

  standClear() { return !this.world.blocked(this.x, this.y, this.z, 0.25, STEP + 0.01, BODY_HI); }

  // Blocked while pushing forward: climb onto a ledge up to CLIMB_MAX above the feet if there is room.
  tryLedge(sy, cy, opts) {
    const w = this.world, fx = -sy, fy = cy;
    for (const d of [0.45, 0.7]) {
      const x = this.x + fx * d, y = this.y + fy * d;
      const s = w.support(x, y, this.z + CLIMB_MAX, true);
      if (!s || s.kind !== 1 || s.z <= this.z + STEP || s.z > this.z + CLIMB_MAX) continue;
      if (w.blocked(x, y, s.z, 0.3, 0.05, HI_CROUCH)) continue;          // room to kneel on top
      if (w.blocked(this.x, this.y, this.z, 0.2, 0.3, s.z - this.z + 1.0)) continue; // room to pull up
      this.mode = 'climb'; this.climb = { t: 0, x0: this.x, y0: this.y, z0: this.z, x, y, z: s.z };
      this.vx = this.vy = this.vz = 0; this.slideT = this.dashT = 0;
      return true;
    }
    return false;
  }

  climbStep(dt) {
    const c = this.climb; c.t += dt;
    const u = Math.min(1, c.t / CLIMB_T), up = Math.min(1, u * 1.6), fwd = Math.max(0, (u - 0.5) * 2);
    this.z = c.z0 + (c.z - c.z0) * up;
    this.x = c.x0 + (c.x - c.x0) * fwd; this.y = c.y0 + (c.y - c.y0) * fwd;
    if (u >= 1) { this.mode = 'walk'; this.climb = null; this.grounded = true; this.crouching = !this.standClear(); }
  }

  fly(dt, inp) {
    const w = this.world, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // W/S along the view direction (pitch included), A/D strafe, Space/C straight up/down, Shift boost
    const speed = inp.run ? FLY_BOOST : FLY;
    let tx = (-sy * cp * inp.f + cy * inp.s) * speed, ty = (cy * cp * inp.f + sy * inp.s) * speed;
    let tz = sp * inp.f * speed + ((inp.up ? 1 : 0) - (inp.down ? 1 : 0)) * FLY_UP * (inp.run ? 2 : 1);
    if (this.wantDash && this.dashCd <= 0) { this.vx += -sy * 12; this.vy += cy * 12; this.dashCd = DASH_CD; }
    const a = FLY_ACCEL * dt;
    this.vx += (tx - this.vx) * Math.min(1, a); this.vy += (ty - this.vy) * Math.min(1, a); this.vz += (tz - this.vz) * Math.min(1, a * 1.5);
    // move in substeps; walls block per axis, the ground/roofs push the broom up (so it rides over them)
    let dx = this.vx * dt, dy = this.vy * dt, dz = this.vz * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / FLY_SUBSTEP));
    dx /= n; dy /= n; dz /= n;
    const free = (x, y, z) => !w.blocked(x, y, z, 0.35, 0.05, 1.5);
    for (let i = 0; i < n; i++) {
      const [cx, cy2] = clampArea(this.x + dx, this.y + dy);
      if (free(cx, cy2, this.z)) { this.x = cx; this.y = cy2; }
      else if (free(cx, this.y, this.z)) { this.x = cx; this.vy *= 0.5; }
      else if (free(this.x, cy2, this.z)) { this.y = cy2; this.vx *= 0.5; }
      else { this.vx *= 0.3; this.vy *= 0.3; }
      const nz = this.z + dz;
      if (free(this.x, this.y, nz)) this.z = nz; else this.vz = 0;
      const g = w.support(this.x, this.y, this.z + 0.5, true);
      if (g && this.z < g.z) { this.z = g.z; if (this.vz < 0) this.vz = 0; }
      this.floor = g ? g.z : this.floor;
    }
    if (this.floor != null && this.z > this.floor + FLY_MAX_AGL) { this.z = this.floor + FLY_MAX_AGL; this.vz = Math.min(this.vz, 0); }
    this.grounded = this.floor != null && this.z <= this.floor + 0.02;
  }

  applyCamera(cam) {
    cam.position.set(this.x, this.eye, -this.y);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  // Third-person camera: behind and above the head, pulled in when a wall is in the way. Session 51: the collision
  // march is backed by one ray against nearby visual-only meshes (zone facades, market stall canopies; this.camOcclude,
  // set by main.js), and the boom length is smoothed (snaps in at once, eases back out) so it never sits in geometry.
  applyCamera3(cam, dt = 1 / 60) {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const hx = this.x, hy = this.y, hz0 = this.eye + 0.3;
    const dmax = this.camMax || (this.mode === 'broom' ? 5.5 : 4);   // camMax: optional override (gameplay clip)
    // session 78: game (combat) mode gets an ARPG occlusion camera (main.js sets combatCam; exploration is unchanged):
    // a thick boom (0.3 m collision probe + side rays at the near-plane half-width) so an oblique wall can't slip
    // between the ray and the near plane, 0.45 m clearance, a slower ease-out, and when the boom is squeezed (< 70% of its
    // length) it may also rise over the player (steeper, higher pivot) instead of collapsing into the head facing the wall.
    const C = !!this.combatCam, clr = C ? 0.45 : 0.3, pr = C ? 0.3 : 0.2, rx = cy, rz = -sy;   // rx/rz: camera right (three.js frame)
    const boom = (bp, hz) => {   // free boom length behind the head for boom pitch bp
      const cp = Math.cos(bp), sp = Math.sin(bp);
      if (C && hz > hz0 + 0.05 && (this.world.blocked(hx, hy, hz - 0.3, 0.25, 0, 0.6) || (this.world.support(hx, hy, hz + 0.3, true)?.z ?? -1e9) > hz - 0.3)) return 0;   // raised pivot inside a ceiling
      let d = dmax;
      for (let r = 0.5; r <= d; r += 0.25) {
        const x = hx + sy * cp * r, y = hy - cy * cp * r, z = hz - sp * r;
        if (this.world.blocked(x, y, z - 0.3, pr, 0, 0.6) || (this.world.support(x, y, z, true)?.z ?? -1e9) > z - 0.3) { d = Math.max(0.6, r - clr); break; }
      }
      if (this.camOcclude) {   // three.js frame: (x, z, -y); direction from the head back to the camera
        const dx = sy * cp, dy = -sp, dz = cy * cp;
        let hit = this.camOcclude(hx, hz, -hy, dx, dy, dz, d + clr);
        if (C) for (const o of [-0.28, 0.28]) hit = Math.min(hit, this.camOcclude(hx + rx * o, hz, -hy + rz * o, dx, dy, dz, d + clr));
        if (hit < d + clr) d = Math.max(0.35, hit - clr);
      }
      return d;
    };
    // session 60: under a stall canopy / next to a boss the boom used to collapse to 0.35 m, inside the canopy or the
    // avatar. When the normal boom is short, swing it lower and flatter (and drop the pivot) so the camera slides under
    // the canopy and keeps the fight in view; the boom pitch is eased so the swing never pops.
    let want = this.pitch, wantHz = hz0, best = boom(this.pitch, hz0);
    if (best < dmax * 0.7) {
      const alts = [[Math.min(this.pitch + 0.3, 0.15), hz0 - 0.25], [Math.min(this.pitch + 0.55, 0.25), hz0 - 0.5]];
      if (C) alts.push([Math.max(-1.1, Math.min(this.pitch, -0.3) - 0.45), hz0 + 0.4], [-1.1, hz0 + 0.8]);   // s78: rise over the wall
      for (const [bp, hz] of alts) {
        const d = boom(bp, hz); if (d > best + 0.8) { best = d; want = bp; wantHz = hz; }
      }
    }
    if (this.camP == null) { this.camP = want; this.camHz = wantHz; }
    const k = Math.min(1, dt * 6);
    this.camP += (want - this.camP) * k; this.camHz += (wantHz - this.camHz) * k;
    const hz = this.camHz, bp = this.camP, cp = Math.cos(bp), sp = Math.sin(bp);
    let d = Math.abs(bp - want) < 0.02 ? best : boom(bp, hz);
    if (this.camD == null || d < this.camD) this.camD = d;   // pull in at once
    else this.camD += (d - this.camD) * Math.min(1, dt * (C ? 2.5 : 4));  // ease back out
    d = Math.min(this.camD, dmax);
    cam.position.set(hx + sy * cp * d, hz - sp * d, -(hy - cy * cp * d));
    // aim at the player's look direction, tilted by however far the boom swung below the player's pitch
    cam.rotation.set(this.pitch + (bp - this.pitch) * 0.6, this.yaw, 0, 'YXZ');
  }

  look(dx, dy) {
    this.yaw -= dx; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy));
  }

  // Standard-mapping gamepad: left stick move, right stick look, A jump/up, B crouch/down, X dash, Y broom,
  // LB/L3 run/boost, RB view.
  pollGamepad(dt) {
    const gp = navigator.getGamepads?.().find(g => g && g.mapping === 'standard');
    if (!gp) { if (this.gpWas) { this.joy.x = this.joy.y = 0; this.gpWas = null; } return; }
    const dz = v => Math.abs(v) < 0.15 ? 0 : v;
    this.joy.x = dz(gp.axes[0]); this.joy.y = dz(gp.axes[1]);
    this.look(dz(gp.axes[2]) * 2.5 * dt, dz(gp.axes[3]) * 2.0 * dt);
    const map = { 0: 'Space', 1: 'KeyC', 2: 'KeyQ', 3: 'KeyB', 4: 'ShiftLeft', 10: 'ShiftLeft', 5: 'KeyV' };
    const was = this.gpWas || {}, now = {};
    for (const [i, code] of Object.entries(map)) {
      const p = !!gp.buttons[i]?.pressed; now[code] = now[code] || p;
    }
    for (const [code, p] of Object.entries(now)) { if (p && !was[code]) this.press(code); else if (!p && was[code]) this.release(code); }
    this.gpWas = now;
  }

  initInput(canvas) {
    const typing = e => e.target instanceof HTMLInputElement;
    addEventListener('keydown', e => {
      if (typing(e)) return;
      this.press(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.ctrlKey) e.preventDefault();
    });
    addEventListener('keyup', e => this.release(e.code));
    addEventListener('blur', () => this.keys.clear());

    const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!touch) {
      canvas.addEventListener('click', () => { const r = canvas.requestPointerLock?.(); r?.catch?.(() => {}); });
      addEventListener('mousemove', e => {
        if (document.pointerLockElement === canvas) this.look(e.movementX * 0.0022, e.movementY * 0.0022);
      });
    }
    // drag-to-look (touch, or mouse without pointer lock)
    let drag = null;
    canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; } });
    canvas.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      this.look((e.clientX - drag.x) * 0.005, (e.clientY - drag.y) * 0.005);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const end = e => { if (drag && e.pointerId === drag.id) drag = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

    // touch action buttons: hold = key held; Run is a toggle
    for (const b of document.querySelectorAll('#touch-buttons [data-key]')) {
      const code = b.dataset.key;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if (code === 'run') { this.runLatch = !this.runLatch; b.classList.toggle('on', this.runLatch); return; }
        this.press(code); b.setPointerCapture(e.pointerId);
      });
      const up = () => { if (code !== 'run') this.release(code); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    }
    if (touch) document.getElementById('touch-buttons')?.removeAttribute('hidden');

    // virtual joystick
    const pad = document.getElementById('joystick'), knob = document.getElementById('knob');
    if (!pad) return;
    if (touch) pad.hidden = false;
    let jid = null;
    const move = e => {
      const r = pad.getBoundingClientRect(), R = r.width / 2;
      let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      this.joy.x = x; this.joy.y = y;
      knob.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
    };
    pad.addEventListener('pointerdown', e => { jid = e.pointerId; pad.setPointerCapture(jid); move(e); e.preventDefault(); });
    pad.addEventListener('pointermove', e => { if (e.pointerId === jid) move(e); });
    const stop = e => { if (e.pointerId !== jid) return; jid = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; };
    pad.addEventListener('pointerup', stop); pad.addEventListener('pointercancel', stop);
  }
}
