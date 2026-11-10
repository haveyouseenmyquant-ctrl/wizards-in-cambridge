// Original generative score (audio node, session 1). Game mode only: exploration mode (window.__explore) is silent here,
// so realism walks hear just the city. State machine per frame: boss (an engaged boss within 45 m) > combat (a mob
// chasing / attacking within 30 m, held 4 s after the last one) > explore. Each state has a theme per area:
//   market   - around Great St Mary's and the Market Square: D dorian, plucked lute-like line over warm pads
//   river    - near the Cam / the Backs: F lydian, flowing harp arpeggios
//   colleges - elsewhere: A aeolian, slow organ chorale
// Combat reuses the area's key at 1.6x tempo with drums, an eighth-note bass ostinato and a staccato lead. Each boss has
// its own theme: the Bellwarden (change-ringing bell motif), the Chime-keeper (ticking 7-beat ostinato), the Gatehouse
// Lion (brass fanfare over toms). The sequencer schedules one bar ahead on the audio clock; states crossfade.
// Every note's source starts are counted as music.<state>.<area|boss>.
import { ctx, buses, live, count } from './audio.js';
import { GSM } from './audio_world.js';

const SCALES = { dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], aeolian: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], hminor: [0, 2, 3, 5, 7, 8, 11] };
const T = {
  market:   { root: 146.83, scale: 'dorian', bpm: 76, beats: 4, prog: [0, 6, 3, 0, 5, 3, 6, 0], voice: 'pluck',
              motifs: [[[7, 0, 1], [9, 1, 0.5], [10, 1.5, 0.5], [11, 2, 2]], [[11, 0, 1.5], [10, 1.5, 0.5], [9, 2, 1], [7, 3, 1]], [[8, 0, 1], [9, 1, 1], [11, 2, 1], [12, 3, 1]], [[11, 0, 2], [9, 2, 1], [7, 3, 1]]] },
  river:    { root: 174.61, scale: 'lydian', bpm: 60, beats: 4, prog: [0, 1, 0, 4, 5, 1, 3, 4], voice: 'harp',
              motifs: [[[7, 0, 3], [8, 3, 1]], [[9, 0, 2], [11, 2, 2]], [[10, 0, 1], [9, 1, 1], [8, 2, 2]], [[7, 0, 4]]] },
  colleges: { root: 110.0, scale: 'aeolian', bpm: 66, beats: 4, prog: [0, 5, 2, 6, 3, 0, 4, 4], voice: 'organ',
              motifs: [[[7, 0, 2], [8, 2, 1], [9, 3, 1]], [[11, 0, 2], [10, 2, 2]], [[9, 0, 1], [8, 1, 1], [7, 2, 2]], [[6, 0, 2], [7, 2, 2]]] },
};
const BOSS = {
  bellwarden:     { root: 130.81, scale: 'aeolian', bpm: 100, beats: 4, prog: [0, 0, 5, 6, 0, 3, 4, 4], voice: 'bell',
                    motifs: [[[14, 0, 0.5], [13, 0.5, 0.5], [12, 1, 0.5], [11, 1.5, 0.5], [12, 2, 0.5], [14, 2.5, 0.5], [13, 3, 0.5], [11, 3.5, 0.5]], [[12, 0, 0.5], [14, 0.5, 0.5], [13, 1, 0.5], [11, 1.5, 0.5], [14, 2, 1], [11, 3, 1]]] },
  chimekeeper:    { root: 98.0, scale: 'phrygian', bpm: 132, beats: 7, prog: [0, 1, 0, 6, 0, 1, 5, 4], voice: 'tick',
                    motifs: [[[7, 0, 1], [8, 1, 1], [7, 2, 1], [11, 3, 2], [10, 5, 2]], [[12, 0, 2], [11, 2, 1], [10, 3, 1], [8, 4, 3]]] },
  gatehouse_lion: { root: 146.83, scale: 'hminor', bpm: 112, beats: 4, prog: [0, 0, 5, 4, 0, 3, 4, 4], voice: 'brass',
                    motifs: [[[7, 0, 0.75], [7, 0.75, 0.25], [11, 1, 1], [10, 2, 0.5], [9, 2.5, 0.5], [11, 3, 1]], [[14, 0, 1.5], [13, 1.5, 0.5], [11, 2, 1], [9, 3, 1]]] },
};
const freq = (th, deg) => { const s = SCALES[th.scale], o = Math.floor(deg / 7); return th.root * 2 ** ((s[((deg % 7) + 7) % 7] + 12 * o) / 12); };

// ---- instruments (each counts one start per oscillator / noise source on `item`)
let c = null;
function osc(item, w, f, t0, dur, g, out, { a = 0.01, r = null, det = 0, lp = 0, lpEnd = 0 } = {}) {
  const o = c.createOscillator(), e = c.createGain(); o.type = w; o.frequency.value = f; o.detune.value = det;
  let node = o;
  if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(lp, t0); if (lpEnd) fl.frequency.exponentialRampToValueAtTime(lpEnd, t0 + dur); o.connect(fl); node = fl; }
  e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(g, t0 + a);
  if (r == null) e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  else { e.gain.setValueAtTime(g, t0 + Math.max(a, dur - r)); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); }
  node.connect(e); e.connect(out); o.start(t0); o.stop(t0 + dur + 0.05); count(item);
}
function hit(item, type, f0, f1, q, t0, dur, g, out) {
  const s = c.createBufferSource(), fl = c.createBiquadFilter(), e = c.createGain();
  s.buffer = window.__audioNoise; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t0); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  e.gain.setValueAtTime(g, t0); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl); fl.connect(e); e.connect(out); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05); count(item);
}
function kickNote(it, t, out, g) { const o = c.createOscillator(), e = c.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25); e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.connect(e); e.connect(out); o.start(t); o.stop(t + 0.4); count(it); }

const VOICE = {
  pluck: (it, f, t, d, out, g = 0.12) => { osc(it, 'triangle', f, t, Math.min(1.6, d + 0.6), g, out, { a: 0.005 }); osc(it, 'sine', f * 2, t, 0.5, g * 0.3, out, { a: 0.003 }); },
  harp:  (it, f, t, d, out, g = 0.11) => { osc(it, 'sine', f, t, 2.2, g, out, { a: 0.004 }); osc(it, 'triangle', f * 2, t, 0.8, g * 0.25, out, { a: 0.003 }); },
  organ: (it, f, t, d, out, g = 0.06) => { for (const [m, k] of [[1, 1], [2, 0.5], [3, 0.25]]) osc(it, 'sine', f * m, t, d, g * k, out, { a: 0.08, r: 0.15 }); },
  bell:  (it, f, t, d, out, g = 0.09) => { for (const [m, k, l] of [[1, 1, 1.6], [2, 0.5, 1], [2.4, 0.3, 0.8], [3, 0.2, 0.5], [0.5, 0.4, 2]]) osc(it, 'sine', f * m, t, l, g * k, out, { a: 0.003 }); },
  tick:  (it, f, t, d, out, g = 0.08) => { osc(it, 'square', f, t, Math.min(d, 0.35), g * 0.5, out, { a: 0.004, lp: 2400, lpEnd: 500 }); osc(it, 'triangle', f * 2, t, 0.25, g * 0.4, out, { a: 0.002 }); },
  brass: (it, f, t, d, out, g = 0.07) => { osc(it, 'sawtooth', f, t, d * 0.95, g, out, { a: 0.04, r: 0.1, lp: 2600, lpEnd: 900 }); osc(it, 'sawtooth', f, t, d * 0.95, g * 0.7, out, { a: 0.05, r: 0.1, det: 9, lp: 2000, lpEnd: 700 }); },
};
function pad(it, th, chordDeg, t, d, out, g) {
  for (const k of [0, 2, 4]) { const f = freq(th, chordDeg + k); osc(it, 'sawtooth', f, t, d + 0.4, g, out, { a: d * 0.35, r: d * 0.4, lp: 900, det: -6 }); osc(it, 'sawtooth', f, t, d + 0.4, g, out, { a: d * 0.35, r: d * 0.4, lp: 900, det: 6 }); }
}

// one bar of music for `mode` ('explore' | 'combat' | 'boss') starting at t0
function bar(it, th, mode, n, t0, out) {
  const fast = mode !== 'explore', spb = 60 / (th.bpm * (mode === 'combat' ? 1.6 : 1)), B = th.beats, len = spb * B;
  const chord = th.prog[n % th.prog.length], motif = th.motifs[n % th.motifs.length];
  pad(it, th, chord, t0, len, out, fast ? 0.012 : 0.02);
  if (!fast) osc(it, 'sine', freq(th, chord - 7), t0, len, 0.08, out, { a: 0.2, r: 0.5 });
  // melody (explore: sparse with variation; combat/boss: every bar)
  if (fast || n % 4 !== 3) for (const [deg, b, d] of motif) {
    if (!fast && Math.random() < 0.15) continue;
    const dv = !fast && Math.random() < 0.2 ? (Math.random() < 0.5 ? 1 : -1) : 0;
    const v = mode === 'combat' ? (th.voice === 'organ' ? 'brass' : 'tick') : th.voice;
    VOICE[v](it, freq(th, deg + dv), t0 + b * spb, d * spb * (mode === 'combat' ? 0.6 : 1), out);
  }
  if (!fast) return;
  // rhythm section: eighth-note bass ostinato, kick / snare / hats
  const ost = [0, 0, 4, 0, 0, 3, 4, 2];
  for (let i = 0; i < B * 2; i++) osc(it, 'sawtooth', freq(th, chord + ost[i % 8] - 14), t0 + i * spb / 2, spb * 0.45, 0.07, out, { a: 0.005, lp: 700, lpEnd: 200 });
  for (let b = 0; b < B; b++) {
    if (b % 2 === 0 || (mode === 'boss' && b === B - 1)) kickNote(it, t0 + b * spb, out, mode === 'boss' ? 0.6 : 0.45);
    if (b % 2 === 1) hit(it, 'bandpass', 1800, 900, 0.8, t0 + b * spb, 0.18, 0.18, out);
    hit(it, 'highpass', 7000, 0, 0.7, t0 + b * spb + spb / 2, 0.05, 0.05, out);
  }
  if (mode === 'boss') {   // boss colour: toms on the last beat and a low choir-ish drone
    for (let i = 0; i < 3; i++) { const t = t0 + (B - 1) * spb + i * spb / 3; const o = c.createOscillator(), e = c.createGain(); o.frequency.setValueAtTime(140 - i * 25, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.3); e.gain.setValueAtTime(0.25, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.connect(e); e.connect(out); o.start(t); o.stop(t + 0.4); count(it); }
    for (const k of [0, 4]) osc(it, 'sawtooth', freq(th, chord + k - 7), t0, len, 0.03, out, { a: 0.3, r: 0.3, lp: 600 });
  }
}

const AREA_R = 220;   // within this of Great St Mary's = market theme
export function areaAt(x, y, water = 0) {
  if (Math.hypot(x - GSM.x, y - GSM.y) < AREA_R && water < 0.3) return 'market';
  return water >= 0.3 || x < -340 ? 'river' : 'colleges';
}
const COMBAT_STATES = new Set(['chase', 'windup', 'active', 'recover', 'stagger']);
const M = { cur: null, track: null, combatHold: 0, timer: null, forced: null };

function setTrack(key) {
  if (M.cur === key) return;
  const t = c.currentTime;
  if (M.track) { const old = M.track.gain; old.gain.cancelScheduledValues(t); old.gain.setTargetAtTime(0, t, 0.6); setTimeout(() => old.disconnect(), 4000); }
  M.cur = key; M.track = null;
  if (!key) return;
  const [mode, id] = key.split('.'), th = mode === 'boss' ? BOSS[id] : T[id];
  const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(1, t + (mode === 'explore' ? 2.5 : 0.6)); gain.connect(buses.music);
  M.track = { key, mode, th, gain, n: 0, next: t + 0.08, item: 'music.' + key };
  pump();
}
function pump() {
  const k = M.track; if (!k || !live()) return;
  while (k.next < c.currentTime + 0.6) {
    bar(k.item, k.th, k.mode, k.n++, k.next, k.gain);
    k.next += (60 / (k.th.bpm * (k.mode === 'combat' ? 1.6 : 1))) * k.th.beats;
  }
}

// called every frame by audio_world.js
export function update(dt, world) {
  c = ctx(); if (!c) return;
  if (!window.__audioNoise) { const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; window.__audioNoise = b; }
  if (!M.timer) M.timer = setInterval(pump, 150);
  const g = window.__game;
  if (!live() || !g || window.__explore) { setTrack(null); return; }
  let key = null;
  if (M.forced) key = M.forced;
  else {
    let boss = null, fight = false;
    for (const m of g.mobs) {
      if (m.dead) continue;
      const d = Math.hypot(m.x - g.px, m.y - g.py);
      if (m.boss && d < 45 && COMBAT_STATES.has(m.state)) boss = m;
      else if (d < 30 && COMBAT_STATES.has(m.state)) fight = true;
    }
    if (fight || boss) M.combatHold = 4; else M.combatHold -= dt;
    const area = areaAt(g.px, g.py, world?.S?.water || 0);
    key = boss && BOSS[boss.type.id] ? 'boss.' + boss.type.id : M.combatHold > 0 ? 'combat.' + area : 'explore.' + area;
  }
  setTrack(key);
  pump();
}
export const state = () => M.cur;
export const AREAS = Object.keys(T), BOSSES = Object.keys(BOSS);
window.__audioMusic = { state, areaAt, M };
