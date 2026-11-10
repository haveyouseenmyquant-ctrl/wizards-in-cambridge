// Game sound effects (session 40): every sound is synthesised with WebAudio at play time; no audio files.
// play(name) looks up a recipe: layered oscillator sweeps + filtered noise bursts with short envelopes.
import { ctx as audioCtx, buses, live, count, noise as noiseBuffer } from './audio.js';
// session 40 synth, audio node s1: shares the engine's context and plays into its sfx bus; each source start is counted
// as 'sfx.<recipe>' (the in-browser audio test reads the counts).
let master = null, noiseBuf = null, curName = '';
function audio() {
  const c = audioCtx(); if (!c) return null;
  master = buses.sfx; noiseBuf = noiseBuffer();
  return c;
}

// osc layer: {w: wave, f0, f1, t: duration, g: gain, d: delay}
function tone(c, o, at, out = master, pr = 1) {
  const t0 = at + (o.d || 0), osc = c.createOscillator(), g = c.createGain();
  osc.type = o.w || 'sine';
  osc.frequency.setValueAtTime(o.f0 * pr, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, (o.f1 ?? o.f0) * pr), t0 + o.t);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.g ?? 0.3, t0 + Math.min(0.02, o.t * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.t);
  osc.connect(g); g.connect(out); osc.start(t0); count('sfx.' + curName); osc.stop(t0 + o.t + 0.05);
}
// noise layer: {type: filter type, f0, f1, q, t, g, d}
function noise(c, o, at, out = master, pr = 1) {
  const t0 = at + (o.d || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = o.type || 'lowpass'; f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0 * pr, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, (o.f1 ?? o.f0) * pr), t0 + o.t);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.g ?? 0.3, t0 + Math.min(0.03, o.t * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.t);
  src.connect(f); f.connect(g); g.connect(out); src.start(t0, Math.random() * 0.5); count('sfx.' + curName); src.stop(t0 + o.t + 0.05);
}

const R = {
  // pyromancer
  ember:    { n: [{ type: 'bandpass', f0: 1800, f1: 400, q: 2, t: 0.25, g: 0.5 }], o: [{ w: 'sawtooth', f0: 320, f1: 90, t: 0.18, g: 0.08 }] },
  spray:    { n: [{ type: 'lowpass', f0: 3000, f1: 600, t: 0.6, g: 0.5 }, { type: 'highpass', f0: 4000, t: 0.3, g: 0.15 }] },
  orb:      { n: [{ type: 'lowpass', f0: 900, f1: 200, t: 0.7, g: 0.5 }], o: [{ w: 'sine', f0: 140, f1: 60, t: 0.6, g: 0.3 }] },
  flamestep:{ n: [{ type: 'bandpass', f0: 600, f1: 3000, q: 1.5, t: 0.3, g: 0.5 }], o: [{ w: 'triangle', f0: 200, f1: 800, t: 0.25, g: 0.15 }] },
  kindle:   { n: [{ type: 'lowpass', f0: 2500, f1: 150, t: 0.8, g: 0.6 }], o: [{ w: 'sawtooth', f0: 110, f1: 40, t: 0.7, g: 0.12 }] },
  sunfall:  { n: [{ type: 'lowpass', f0: 400, f1: 3000, t: 1.2, g: 0.5 }], o: [{ w: 'sine', f0: 60, f1: 220, t: 1.2, g: 0.3 }, { w: 'sawtooth', f0: 90, f1: 45, t: 1.4, g: 0.08, d: 0.2 }] },
  heartbeat:{ o: [{ w: 'sine', f0: 62, f1: 44, t: 0.16, g: 0.45 }, { w: 'sine', f0: 58, f1: 40, t: 0.14, g: 0.3, d: 0.17 }] },   // session 72: low-HP lub-dub
  boom:     { n: [{ type: 'lowpass', f0: 1200, f1: 80, t: 0.5, g: 0.6 }], o: [{ w: 'sine', f0: 90, f1: 35, t: 0.45, g: 0.4 }] },
  // stormcaller
  lance:    { o: [{ w: 'square', f0: 2400, f1: 300, t: 0.12, g: 0.07 }], n: [{ type: 'highpass', f0: 3000, t: 0.12, g: 0.35 }] },
  arc:      { o: [{ w: 'sawtooth', f0: 1600, f1: 200, t: 0.25, g: 0.08 }, { w: 'square', f0: 900, f1: 2400, t: 0.15, g: 0.05, d: 0.05 }], n: [{ type: 'highpass', f0: 2500, t: 0.25, g: 0.3 }] },
  gale:     { n: [{ type: 'bandpass', f0: 300, f1: 1500, q: 0.8, t: 0.6, g: 0.6 }] },
  winddash: { n: [{ type: 'bandpass', f0: 2500, f1: 400, q: 1.2, t: 0.35, g: 0.6 }] },
  static:   { o: [{ w: 'square', f0: 60, f1: 62, t: 0.9, g: 0.05 }], n: [{ type: 'highpass', f0: 5000, t: 0.9, g: 0.15 }] },
  tempest:  { n: [{ type: 'lowpass', f0: 200, f1: 1200, t: 1.5, g: 0.5 }], o: [{ w: 'sawtooth', f0: 50, f1: 40, t: 1.5, g: 0.1 }] },
  thunder:  { n: [{ type: 'lowpass', f0: 5000, f1: 100, t: 0.7, g: 0.7 }] },
  // stone warden
  pebble:   { o: [{ w: 'triangle', f0: 260, f1: 120, t: 0.12, g: 0.25 }], n: [{ type: 'lowpass', f0: 800, t: 0.1, g: 0.3 }] },
  granite:  { o: [{ w: 'sine', f0: 180, f1: 360, t: 0.5, g: 0.25 }, { w: 'triangle', f0: 270, f1: 540, t: 0.5, g: 0.1 }] },
  quake:    { n: [{ type: 'lowpass', f0: 300, f1: 40, t: 0.9, g: 0.8 }], o: [{ w: 'sine', f0: 55, f1: 30, t: 0.8, g: 0.5 }] },
  leap:     { n: [{ type: 'bandpass', f0: 400, f1: 1200, t: 0.3, g: 0.4 }] },
  spikes:   { n: [{ type: 'bandpass', f0: 1500, f1: 300, q: 3, t: 0.4, g: 0.6 }], o: [{ w: 'square', f0: 150, f1: 70, t: 0.2, g: 0.1 }] },
  monolith: { o: [{ w: 'sine', f0: 40, f1: 80, t: 1.4, g: 0.5 }, { w: 'triangle', f0: 160, f1: 120, t: 1.2, g: 0.15 }], n: [{ type: 'lowpass', f0: 500, f1: 60, t: 1.3, g: 0.6 }] },
  // hex weaver
  dart:     { o: [{ w: 'sine', f0: 900, f1: 500, t: 0.18, g: 0.15 }, { w: 'sine', f0: 1350, f1: 760, t: 0.18, g: 0.07 }] },
  mark:     { o: [{ w: 'triangle', f0: 300, f1: 150, t: 0.5, g: 0.2 }, { w: 'triangle', f0: 317, f1: 158, t: 0.5, g: 0.15 }] },
  siphon:   { o: [{ w: 'sawtooth', f0: 120, f1: 480, t: 0.6, g: 0.07 }], n: [{ type: 'bandpass', f0: 800, f1: 2000, q: 4, t: 0.6, g: 0.25 }] },
  shade:    { o: [{ w: 'sine', f0: 600, f1: 120, t: 0.3, g: 0.2 }], n: [{ type: 'highpass', f0: 1500, t: 0.2, g: 0.2 }] },
  wisp:     { o: [{ w: 'sine', f0: 700, f1: 1400, t: 0.4, g: 0.12 }, { w: 'sine', f0: 1050, f1: 2100, t: 0.4, g: 0.06, d: 0.08 }] },
  bloom:    { o: [{ w: 'sine', f0: 220, f1: 110, t: 1.5, g: 0.25 }, { w: 'sine', f0: 233, f1: 116, t: 1.5, g: 0.2 }, { w: 'triangle', f0: 330, f1: 165, t: 1.5, g: 0.08, d: 0.15 }] },
  // impacts (one per hit, by damage type; pitch jittered per hit so repeats don't machine-gun)
  hit_physical: { n: [{ type: 'lowpass', f0: 1400, f1: 200, t: 0.09, g: 0.5 }], o: [{ w: 'triangle', f0: 180, f1: 70, t: 0.08, g: 0.25 }] },
  hit_fire:  { n: [{ type: 'bandpass', f0: 2200, f1: 500, q: 1.2, t: 0.14, g: 0.45 }], o: [{ w: 'sine', f0: 150, f1: 60, t: 0.1, g: 0.25 }] },
  hit_storm: { n: [{ type: 'highpass', f0: 3500, f1: 1800, t: 0.08, g: 0.35 }], o: [{ w: 'square', f0: 1300, f1: 250, t: 0.07, g: 0.05 }, { w: 'sine', f0: 160, f1: 70, t: 0.08, g: 0.2 }] },
  hit_stone: { n: [{ type: 'lowpass', f0: 900, f1: 120, t: 0.12, g: 0.6 }], o: [{ w: 'triangle', f0: 140, f1: 55, t: 0.12, g: 0.35 }] },
  hit_hex:   { n: [{ type: 'bandpass', f0: 1200, f1: 600, q: 3, t: 0.12, g: 0.35 }], o: [{ w: 'sine', f0: 520, f1: 260, t: 0.12, g: 0.12 }, { w: 'sine', f0: 140, f1: 70, t: 0.09, g: 0.2 }] },
  crit:      { o: [{ w: 'triangle', f0: 1800, f1: 900, t: 0.16, g: 0.12 }, { w: 'sine', f0: 90, f1: 40, t: 0.22, g: 0.4 }], n: [{ type: 'lowpass', f0: 3000, f1: 150, t: 0.2, g: 0.5 }] },
  warn:      { o: [{ w: 'triangle', f0: 520, f1: 470, t: 0.22, g: 0.1 }, { w: 'triangle', f0: 520, f1: 470, t: 0.22, g: 0.08, d: 0.16 }] },   // session 50: boss wind-up cue
  phase:     { o: [{ w: 'sine', f0: 98, f1: 92, t: 2.2, g: 0.4 }, { w: 'sine', f0: 247, f1: 240, t: 1.8, g: 0.12 }, { w: 'sine', f0: 523, t: 1.2, g: 0.05 }], n: [{ type: 'lowpass', f0: 600, f1: 80, t: 0.6, g: 0.4 }] },   // boss phase gong
  kill:      { o: [{ w: 'sine', f0: 240, f1: 60, t: 0.3, g: 0.3 }], n: [{ type: 'lowpass', f0: 1800, f1: 100, t: 0.3, g: 0.45 }] },
  // loot: drop chime (pitch/length scaled by rarity in items.js) and pickup sparkle
  drop:      { o: [{ w: 'sine', f0: 880, t: 0.35, g: 0.12 }, { w: 'sine', f0: 1320, t: 0.45, g: 0.08, d: 0.07 }, { w: 'triangle', f0: 1760, t: 0.5, g: 0.05, d: 0.14 }] },
  drop_big:  { o: [{ w: 'sine', f0: 660, t: 0.5, g: 0.14 }, { w: 'sine', f0: 990, t: 0.6, g: 0.1, d: 0.08 }, { w: 'sine', f0: 1320, t: 0.7, g: 0.08, d: 0.16 }, { w: 'triangle', f0: 1980, t: 0.8, g: 0.05, d: 0.24 }],
               n: [{ type: 'highpass', f0: 6000, t: 0.6, g: 0.06 }] },
  // session 46: drop toss whoosh + rarity stings (rising arpeggios; longer, brighter and more layered per rarity)
  drop_toss: { n: [{ type: 'bandpass', f0: 600, f1: 2400, q: 1.5, t: 0.3, g: 0.25 }], o: [{ w: 'sine', f0: 400, f1: 900, t: 0.25, g: 0.06 }] },
  sting_uncommon: { o: [{ w: 'triangle', f0: 784, t: 0.25, g: 0.12 }, { w: 'triangle', f0: 988, t: 0.35, g: 0.1, d: 0.08 }] },
  sting_rare: { o: [{ w: 'triangle', f0: 659, t: 0.3, g: 0.13 }, { w: 'triangle', f0: 831, t: 0.3, g: 0.11, d: 0.08 }, { w: 'triangle', f0: 988, t: 0.5, g: 0.11, d: 0.16 }, { w: 'sine', f0: 1976, t: 0.6, g: 0.04, d: 0.16 }] },
  sting_epic: { o: [{ w: 'sawtooth', f0: 330, t: 0.7, g: 0.04 }, { w: 'triangle', f0: 659, t: 0.3, g: 0.13 }, { w: 'triangle', f0: 784, t: 0.3, g: 0.12, d: 0.09 }, { w: 'triangle', f0: 988, t: 0.3, g: 0.12, d: 0.18 }, { w: 'triangle', f0: 1319, t: 0.8, g: 0.12, d: 0.27 }],
                n: [{ type: 'highpass', f0: 7000, t: 0.9, g: 0.06, d: 0.2 }] },
  sting_legendary: { o: [{ w: 'sine', f0: 110, f1: 220, t: 1.2, g: 0.25 }, { w: 'triangle', f0: 523, t: 0.3, g: 0.14 }, { w: 'triangle', f0: 659, t: 0.3, g: 0.14, d: 0.1 }, { w: 'triangle', f0: 784, t: 0.3, g: 0.14, d: 0.2 },
                       { w: 'triangle', f0: 1047, t: 1.1, g: 0.15, d: 0.3 }, { w: 'sine', f0: 2093, t: 1.2, g: 0.05, d: 0.3 }], n: [{ type: 'highpass', f0: 6000, t: 1.4, g: 0.08, d: 0.25 }] },
  pickup:    { o: [{ w: 'triangle', f0: 700, f1: 1400, t: 0.12, g: 0.15 }, { w: 'sine', f0: 1400, f1: 2100, t: 0.2, g: 0.08, d: 0.06 }] },
  // generic
  hurt:     { o: [{ w: 'square', f0: 200, f1: 90, t: 0.15, g: 0.12 }] },
  nomana:   { o: [{ w: 'triangle', f0: 180, f1: 170, t: 0.12, g: 0.1 }] },
  levelup:  { o: [{ w: 'triangle', f0: 523, t: 0.15, g: 0.2 }, { w: 'triangle', f0: 659, t: 0.15, g: 0.2, d: 0.12 }, { w: 'triangle', f0: 784, t: 0.4, g: 0.2, d: 0.24 }] },
  death:    { o: [{ w: 'sawtooth', f0: 220, f1: 50, t: 1.6, g: 0.15 }] },
};

let lastAt = {}, winT = -1, winN = 0, clock = null;
// throttling clock: the game clock when set (so stepped/accelerated sims throttle like real play), else audio time
export function setClock(fn) { clock = fn; lastAt = {}; winT = -1; }
// play(name, vol, pitch): each call gets its own gain node (volume no longer leaks into other playing sounds).
// Same-name repeats within 30 ms are merged (except hit_*), and at most ~10 sounds start per 60 ms window.
export function play(name, vol = 1, pitch = 1) {
  const c = audio(); const r = R[name];
  if (!c || !r || !live()) return;
  const now = c.currentTime, tn = clock ? clock() : now;
  if (tn < (lastAt[name] ?? -1)) lastAt = {};   // clock went backwards (new game)
  if (tn - (lastAt[name] ?? -1) < (name.startsWith('hit_') ? 0 : 0.03)) return;
  if (tn - winT > 0.06 || tn < winT) { winT = tn; winN = 0; }
  if (++winN > 10 && !name.startsWith('mob_')) return;   // mob voices (attack / hit / death cues) are never dropped by the cap
  lastAt[name] = tn;
  const out = c.createGain(); out.gain.value = Math.min(2, vol); out.connect(master);
  curName = name;
  for (const o of r.o || []) tone(c, o, now, out, pitch);
  for (const o of r.n || []) noise(c, o, now, out, pitch);
  setTimeout(() => out.disconnect(), 3000);
}
export function init() { audio(); }
// add or replace a recipe (audio_game.js registers the mob voices: mob_<type>_attack|hit|death)
export function register(name, recipe) { R[name] = recipe; }
export const has = name => !!R[name];
