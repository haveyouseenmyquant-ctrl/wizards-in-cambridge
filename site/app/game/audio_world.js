// World audio (audio node, session 1): runs in game and exploration mode alike (started by main.js, ticked every frame).
//  - footsteps by the collision surface under the player (cobbles/setts, stone paving, grass, tarmac, wooden bridges),
//    one step per ~0.75 m walked (longer strides when running), plus a landing thud
//  - city ambience: Market Square murmur, the river near water, birdsong, passing bicycles (freewheel + bell)
//  - Great St Mary's: the Cambridge Quarters (first rung at GSM in 1793, public domain) on the quarter hours and the
//    hour struck on the tenor, spatialised from the tower, on the local clock
// Collision frame: x east, y north, z up (m). Surface classes from scripts/build.py.
import { ctx, buses, live, count, tone, burst, bed, installUi } from './audio.js';
import * as music from './audio_music.js';

export const SURF = { 1: 'tarmac', 2: 'stone', 3: 'grass', 5: 'cobbles', 6: 'grass', 7: 'stone', 8: 'wood', 9: 'stone', 10: 'stone', 0: 'stone' };
export const GSM = { x: -151, y: 60, z: 38 };            // Great St Mary's tower (bell chamber)
export const MARKET = { x: -110, y: 40, r: 90 };         // Market Square centre and murmur radius
const rnd = (a, b) => a + Math.random() * (b - a);

// footstep recipes: each a list of burst/tone layers; every step jitters pitch and level
const STEP = {
  cobbles: [{ n: { type: 'bandpass', f0: 1900, f1: 1300, q: 2.5, t: 0.05, g: 0.5 } }, { n: { type: 'bandpass', f0: 2300, q: 3, t: 0.04, g: 0.35, d: 0.035 } }, { o: { w: 'triangle', f0: 140, f1: 90, t: 0.06, g: 0.25 } }],
  stone:   [{ n: { type: 'highpass', f0: 2400, t: 0.04, g: 0.4 } }, { o: { w: 'triangle', f0: 260, f1: 160, t: 0.05, g: 0.22 } }],
  grass:   [{ n: { type: 'bandpass', f0: 3200, f1: 1800, q: 0.8, t: 0.14, g: 0.22, a: 0.03 } }, { n: { type: 'lowpass', f0: 500, t: 0.08, g: 0.2 } }],
  tarmac:  [{ n: { type: 'lowpass', f0: 1100, f1: 500, t: 0.06, g: 0.5 } }, { n: { type: 'highpass', f0: 3500, t: 0.03, g: 0.12 } }],
  wood:    [{ o: { w: 'triangle', f0: 190, f1: 150, t: 0.12, g: 0.3 } }, { n: { type: 'bandpass', f0: 650, q: 5, t: 0.1, g: 0.5 } }, { o: { w: 'sine', f0: 95, t: 0.1, g: 0.2 } }],
};
function footstep(surface, vol = 1, out = buses.ambience) {
  if (!live()) return;
  const pr = rnd(0.9, 1.1), g = vol * rnd(0.75, 1), c = ctx(), at = c.currentTime;
  for (const L of STEP[surface]) {
    if (L.n) burst('foot.' + surface, { ...L.n, f0: L.n.f0 * pr, f1: L.n.f1 && L.n.f1 * pr, g: L.n.g * g }, out, at);
    if (L.o) tone('foot.' + surface, { ...L.o, f0: L.o.f0 * pr, f1: L.o.f1 && L.o.f1 * pr, g: L.o.g * g }, out, at);
  }
}

// a church bell: hum, prime, tierce (minor third), quint, nominal and upper partials, each with its own decay
function bell(item, f, at, out, g = 0.3, len = 4) {
  const P = [[0.5, 1, 1], [1, 0.8, 0.8], [1.2, 0.5, 0.6], [1.5, 0.35, 0.5], [2, 0.6, 0.45], [2.51, 0.25, 0.3], [3.0, 0.18, 0.25], [4.07, 0.12, 0.15]];
  for (const [r, a, d] of P) tone(item, { w: 'sine', f0: f * r, t: len * d, g: g * a * 0.5, a: 0.004 }, out, at);
  burst(item, { type: 'bandpass', f0: f * 3, q: 2, t: 0.05, g: g * 0.3 }, out, at);   // clapper strike
}
// Cambridge Quarters on four bells (E major: 1 G#4, 2 F#4, 3 E4, 4 B3); the five changes and their order per quarter
const QB = [415.3, 370.0, 329.6, 246.9];
const CHANGES = [[1, 2, 3, 4], [3, 1, 2, 4], [3, 2, 1, 3], [1, 3, 2, 4], [4, 2, 1, 3]];
const QUARTERS = { 1: [0], 2: [1, 2], 3: [3, 4, 0], 4: [1, 2, 3, 4] };
const TENOR = 164.8;   // hour bell (E3)

export function install({ player, world, camera }) {
  const c = ctx(); if (!c) return null;
  installUi();
  const L = c.listener, out = buses.ambience;
  // bell tower panner (HRTF where available); listener follows the player's head
  const tower = c.createPanner(); tower.panningModel = 'equalpower'; tower.distanceModel = 'inverse'; tower.refDistance = 60; tower.rolloffFactor = 0.8;
  const towerGain = c.createGain(); towerGain.gain.value = 1.6; towerGain.connect(tower); tower.connect(buses.ambience);
  const setPos = (p, x, y, z) => { if (p.positionX) { p.positionX.value = x; p.positionY.value = z; p.positionZ.value = -y; } else p.setPosition(x, z, -y); };
  setPos(tower, GSM.x, GSM.y, GSM.z);

  const S = {
    clock: null,          // test hook: () => Date (defaults to the real local clock)
    lastQ: null, beds: {}, timers: { birds: rnd(1, 4), bikes: rnd(4, 10), river: 1, market: 1 },
    stride: 0, last: null, surface: null, water: 0, waterT: 0, wasGrounded: true, started: false,
  };
  const now = () => (S.clock ? S.clock() : new Date());

  function startBeds() {
    if (S.started || !live()) return;
    S.started = true;
    S.beds.market = bed('amb.market', { type: 'bandpass', f: 450, q: 0.6 }, out);   // crowd murmur
    S.beds.marketHi = bed('amb.market', { type: 'bandpass', f: 1400, q: 1.5 }, out);
    S.beds.river = bed('amb.river', { type: 'bandpass', f: 900, q: 0.5 }, out);     // flowing water
    S.beds.city = bed('amb.city', { type: 'lowpass', f: 180, q: 0.5 }, out);        // distant town hum
  }
  function ringQuarter(q, hour) {
    const t0 = c.currentTime + 0.05, gap = 0.62;
    let k = 0;
    for (const ch of QUARTERS[q]) { for (const b of CHANGES[ch]) bell('bells.quarters', QB[b - 1], t0 + (k++) * gap, towerGain, 0.32, 3.5); k += 1; }
    if (q === 4) { const t1 = t0 + k * gap + 1.8; for (let i = 0; i < (hour % 12 || 12); i++) bell('bells.hour', TENOR, t1 + i * 2.2, towerGain, 0.45, 6); }
  }
  // sample the ground around the player for open water (river ambience) every 0.7 s
  function scanWater(x, y, z) {
    let wet = 0, n = 0;
    for (const r of [8, 20, 40]) for (let a = 0; a < 8; a++) {
      const s = world.support(x + r * Math.cos(a * 0.785), y + r * Math.sin(a * 0.785), z + 2); n++;
      if (s && s.kind === 2) wet += r === 8 ? 1.5 : r === 20 ? 1 : 0.6;
    }
    return Math.min(1, wet / 8);
  }

  const sys = {
    S, footstep, ringQuarter,
    update(dt) {
      if (!live()) { music.update(dt, sys); return; }
      startBeds();
      const p = player, t = c.currentTime;
      // listener
      const ex = p.x, ey = p.y, ez = p.z + 1.65, fx = -Math.sin(p.yaw), fy = Math.cos(p.yaw);
      if (L.positionX) { L.positionX.value = ex; L.positionY.value = ez; L.positionZ.value = -ey; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = -fy; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
      else { L.setPosition(ex, ez, -ey); L.setOrientation(fx, 0, -fy, 0, 1, 0); }

      // footsteps: distance walked on the ground
      const sup = world.support(p.x, p.y, p.z + 0.5);
      S.surface = sup && sup.kind === 1 ? (SURF[sup.surface] || 'stone') : sup && sup.kind === 2 ? 'water' : null;
      const onFoot = p.mode !== 'broom' && p.grounded;
      if (S.last && onFoot) {
        const d = Math.hypot(p.x - S.last.x, p.y - S.last.y);
        if (d < 3) S.stride += d;   // teleports don't step
        const strideLen = p.speed > 3 ? 1.15 : 0.75;
        if (S.stride >= strideLen && S.surface && S.surface !== 'water') { S.stride = 0; footstep(S.surface, p.speed > 3 ? 1 : 0.7); }
      } else S.stride = 0.5;
      if (onFoot && !S.wasGrounded && S.surface && S.surface !== 'water') footstep(S.surface, 1.2);   // landing
      S.wasGrounded = onFoot; S.last = { x: p.x, y: p.y };

      // ambience levels (smoothed)
      if ((S.waterT -= dt) <= 0) { S.waterT = 0.7; S.water = scanWater(p.x, p.y, p.z); }
      const dm = Math.hypot(p.x - MARKET.x, p.y - MARKET.y), mk = Math.max(0, Math.min(1, 1.2 - dm / MARKET.r));
      const lv = (b, v) => b.gain.gain.setTargetAtTime(v, t, 0.8);
      lv(S.beds.market, 0.05 * mk); lv(S.beds.marketHi, 0.012 * mk); lv(S.beds.river, 0.05 * S.water); lv(S.beds.city, 0.03);
      S.beds.river.filter.frequency.setTargetAtTime(700 + 500 * Math.sin(t * 0.3), t, 1);

      // events
      const T = S.timers;
      if ((T.market -= dt) <= 0) {   // stall clatter / cup clink / distant footfalls in the square
        T.market = rnd(0.6, 2.2);
        if (mk > 0.15) { const pan = rnd(-0.8, 0.8); Math.random() < 0.5
          ? tone('amb.market', { w: 'sine', f0: rnd(2200, 3400), t: 0.15, g: 0.03 * mk, pan }, out)
          : burst('amb.market', { type: 'bandpass', f0: rnd(500, 1500), q: 3, t: rnd(0.05, 0.12), g: 0.05 * mk, pan }, out); }
      }
      if ((T.river -= dt) <= 0) {   // drips, laps and the odd punt-pole plop
        T.river = rnd(0.25, 0.9);
        if (S.water > 0.1) { const f = rnd(500, 1300), pan = rnd(-0.9, 0.9); tone('amb.river', { w: 'sine', f0: f, f1: f * 1.8, t: 0.06, g: 0.04 * S.water, pan }, out);
          if (Math.random() < 0.15) burst('amb.river', { type: 'lowpass', f0: 700, f1: 200, t: 0.35, g: 0.12 * S.water, pan }, out); }
      }
      if ((T.birds -= dt) <= 0) {   // a short phrase from a songbird somewhere nearby
        const grass = S.surface === 'grass' ? 1 : 0.5;
        T.birds = rnd(2.5, 7) / grass;
        const base = rnd(2400, 4200), n = 2 + Math.floor(Math.random() * 5), pan = rnd(-1, 1), g = rnd(0.012, 0.03) * grass;
        for (let i = 0; i < n; i++) { const f = base * rnd(0.8, 1.25); tone('amb.birds', { w: 'sine', f0: f, f1: f * rnd(0.7, 1.4), t: rnd(0.05, 0.14), g, pan, d: i * rnd(0.09, 0.16) }, out); }
      }
      if ((T.bikes -= dt) <= 0) {   // a cyclist passes: freewheel ticks sweeping across, sometimes a bell
        const road = S.surface === 'tarmac' || S.surface === 'cobbles' ? 1 : 0.5;
        T.bikes = rnd(6, 16) / road;
        const dir = Math.random() < 0.5 ? -1 : 1, n = 22, rate = rnd(0.05, 0.075), g = 0.035 * road;
        for (let i = 0; i < n; i++) { const k = i / n, env = Math.sin(Math.PI * k); burst('amb.bikes', { type: 'highpass', f0: 4500, t: 0.012, g: g * env + 0.0005, pan: dir * (2 * k - 1), d: i * rate }, out); }
        if (Math.random() < 0.45) for (const d of [0.4, 0.62]) { tone('amb.bikes', { w: 'sine', f0: 2950, t: 0.5, g: 0.03 * road, pan: -dir * 0.2, d }, out); tone('amb.bikes', { w: 'sine', f0: 2950 * 2.1, t: 0.25, g: 0.01 * road, pan: -dir * 0.2, d }, out); }
      }

      // Great St Mary's: ring when the clock crosses a quarter hour
      const d = now(), q = d.getHours() * 4 + Math.floor(d.getMinutes() / 15);
      if (S.lastQ != null && q !== S.lastQ) ringQuarter(((q % 4) || 4), d.getHours());
      S.lastQ = q;

      music.update(dt, sys);
    },
  };
  window.__audioWorld = sys;
  return sys;
}
