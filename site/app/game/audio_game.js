// Game-layer audio hooks (audio node, session 1): a voice for every mob type (attack wind-up, hit, death), built from
// a material profile (stone, spirit, ink, clockwork, bells, soot, river wood, bike metal) and a pitch per type, and
// registered as sfx.js recipes 'mob_<type>_attack|hit|death'. Mob sounds fade with distance from the player.
// Events: 'mobAttack' {mob, attack} (mobs.js beginAttack), 'hit' {target: mob}, 'kill' {mob}.
import * as sfx from './sfx.js';

// material voice recipes; p = pitch factor (bosses are low and long)
const V = {
  stone: p => ({
    attack: { n: [{ type: 'lowpass', f0: 300 * p, f1: 900 * p, t: 0.55, g: 0.45 }], o: [{ w: 'sawtooth', f0: 70 * p, f1: 55 * p, t: 0.5, g: 0.08 }] },   // grinding growl
    hit:    { n: [{ type: 'bandpass', f0: 2600 * p, f1: 900 * p, q: 2, t: 0.09, g: 0.5 }], o: [{ w: 'triangle', f0: 240 * p, f1: 110 * p, t: 0.1, g: 0.2 }] },   // chip / crack
    death:  { n: [{ type: 'lowpass', f0: 1600 * p, f1: 90, t: 1.1, g: 0.6 }, { type: 'bandpass', f0: 3000 * p, q: 3, t: 0.12, g: 0.3, d: 0.25 }, { type: 'bandpass', f0: 2400 * p, q: 3, t: 0.1, g: 0.25, d: 0.5 }],
              o: [{ w: 'sine', f0: 80 * p, f1: 35, t: 0.9, g: 0.4 }] },   // rubble collapse
  }),
  spirit: p => ({
    attack: { o: [{ w: 'sine', f0: 520 * p, f1: 880 * p, t: 0.6, g: 0.12 }, { w: 'sine', f0: 540 * p, f1: 900 * p, t: 0.6, g: 0.08 }], n: [{ type: 'bandpass', f0: 900 * p, f1: 2400 * p, q: 6, t: 0.6, g: 0.15 }] },   // rising wail
    hit:    { o: [{ w: 'sine', f0: 1200 * p, f1: 500 * p, t: 0.14, g: 0.14 }], n: [{ type: 'highpass', f0: 3000, t: 0.08, g: 0.15 }] },
    death:  { o: [{ w: 'sine', f0: 900 * p, f1: 120 * p, t: 1.3, g: 0.16 }, { w: 'sine', f0: 935 * p, f1: 125 * p, t: 1.3, g: 0.1 }], n: [{ type: 'bandpass', f0: 2000 * p, f1: 300, q: 4, t: 1.2, g: 0.2 }] },   // fading sigh
  }),
  ink: p => ({
    attack: { o: [{ w: 'square', f0: 300 * p, f1: 700 * p, t: 0.2, g: 0.06 }], n: [{ type: 'bandpass', f0: 600 * p, f1: 1500 * p, q: 5, t: 0.25, g: 0.35 }] },   // squelchy chitter
    hit:    { n: [{ type: 'bandpass', f0: 900 * p, f1: 400 * p, q: 6, t: 0.1, g: 0.45 }], o: [{ w: 'sine', f0: 400 * p, f1: 200 * p, t: 0.08, g: 0.12 }] },   // splat
    death:  { n: [{ type: 'bandpass', f0: 1200 * p, f1: 200, q: 5, t: 0.5, g: 0.45 }, { type: 'lowpass', f0: 500, t: 0.3, g: 0.3, d: 0.15 }], o: [{ w: 'sine', f0: 600 * p, f1: 90, t: 0.45, g: 0.12 }] },   // ink splash
  }),
  clock: p => ({
    attack: { o: [{ w: 'square', f0: 1800 * p, t: 0.03, g: 0.06 }, { w: 'square', f0: 1500 * p, t: 0.03, g: 0.06, d: 0.12 }, { w: 'square', f0: 1800 * p, t: 0.03, g: 0.06, d: 0.24 }, { w: 'sawtooth', f0: 90 * p, f1: 180 * p, t: 0.5, g: 0.07, d: 0.1 }] },   // winding ratchet
    hit:    { o: [{ w: 'square', f0: 900 * p, f1: 820 * p, t: 0.12, g: 0.06 }, { w: 'triangle', f0: 1430 * p, t: 0.2, g: 0.08 }], n: [{ type: 'highpass', f0: 4000, t: 0.05, g: 0.3 }] },   // metal clank
    death:  { o: [{ w: 'sawtooth', f0: 220 * p, f1: 40, t: 1.0, g: 0.1 }, { w: 'triangle', f0: 1430 * p, t: 0.4, g: 0.08, d: 0.3 }, { w: 'triangle', f0: 1650 * p, t: 0.3, g: 0.06, d: 0.5 }], n: [{ type: 'bandpass', f0: 2500, f1: 600, q: 2, t: 0.8, g: 0.3 }] },   // spring unwinding
  }),
  bells: p => ({
    attack: { o: [{ w: 'sine', f0: 2600 * p, f1: 3400 * p, t: 0.12, g: 0.07 }, { w: 'sine', f0: 3100 * p, f1: 3900 * p, t: 0.1, g: 0.05, d: 0.08 }, { w: 'sine', f0: 2800 * p, f1: 3600 * p, t: 0.1, g: 0.05, d: 0.16 }], n: [{ type: 'bandpass', f0: 1200, q: 1, t: 0.4, g: 0.15 }] },   // squeak + flutter
    hit:    { o: [{ w: 'sine', f0: 880 * p, t: 0.35, g: 0.1 }, { w: 'sine', f0: 880 * 2.76 * p, t: 0.2, g: 0.05 }], n: [{ type: 'bandpass', f0: 1500, q: 2, t: 0.06, g: 0.3 }] },   // small bell tink
    death:  { o: [{ w: 'sine', f0: 660 * p, t: 1.4, g: 0.14 }, { w: 'sine', f0: 660 * 2.4 * p, t: 0.9, g: 0.06 }, { w: 'sine', f0: 660 * 0.5 * p, t: 1.6, g: 0.1 }], n: [{ type: 'bandpass', f0: 1000, f1: 3000, q: 1, t: 0.4, g: 0.2 }] },   // cracked bell
  }),
  soot: p => ({
    attack: { n: [{ type: 'bandpass', f0: 2500 * p, f1: 700 * p, q: 2, t: 0.35, g: 0.4 }, { type: 'highpass', f0: 5000, t: 0.3, g: 0.12 }] },   // crackle hiss
    hit:    { n: [{ type: 'bandpass', f0: 1800 * p, f1: 600, q: 1.5, t: 0.1, g: 0.4 }] },
    death:  { n: [{ type: 'lowpass', f0: 2500, f1: 120, t: 0.6, g: 0.5 }, { type: 'highpass', f0: 6000, t: 0.4, g: 0.12, d: 0.05 }], o: [{ w: 'sine', f0: 220 * p, f1: 60, t: 0.3, g: 0.15 }] },   // puff out
  }),
  river: p => ({
    attack: { n: [{ type: 'bandpass', f0: 400 * p, f1: 1400 * p, q: 1.5, t: 0.5, g: 0.4 }], o: [{ w: 'triangle', f0: 140 * p, f1: 90 * p, t: 0.45, g: 0.12 }] },   // pole swish + creak
    hit:    { o: [{ w: 'triangle', f0: 190 * p, f1: 120 * p, t: 0.12, g: 0.25 }], n: [{ type: 'bandpass', f0: 700 * p, q: 4, t: 0.1, g: 0.35 }] },   // wet wood knock
    death:  { n: [{ type: 'lowpass', f0: 900, f1: 150, t: 0.9, g: 0.45 }, { type: 'bandpass', f0: 1800, f1: 500, q: 3, t: 0.3, g: 0.2, d: 0.3 }], o: [{ w: 'sine', f0: 300 * p, f1: 70, t: 0.6, g: 0.15, d: 0.1 }] },   // splash
  }),
  bike: p => ({
    attack: { o: [{ w: 'sine', f0: 2900 * p, t: 0.25, g: 0.08 }, { w: 'sine', f0: 2900 * p, t: 0.3, g: 0.08, d: 0.14 }], n: [{ type: 'highpass', f0: 3500, f1: 2000, t: 0.5, g: 0.18 }] },   // ding-ding + freewheel
    hit:    { o: [{ w: 'triangle', f0: 620 * p, t: 0.18, g: 0.1 }, { w: 'square', f0: 310 * p, f1: 240 * p, t: 0.08, g: 0.05 }], n: [{ type: 'bandpass', f0: 3000, q: 3, t: 0.07, g: 0.3 }] },   // frame clang
    death:  { n: [{ type: 'bandpass', f0: 4000, f1: 1500, q: 2, t: 0.8, g: 0.3 }, { type: 'lowpass', f0: 700, f1: 100, t: 0.6, g: 0.4 }], o: [{ w: 'sine', f0: 2900 * p, t: 0.6, g: 0.05, d: 0.2 }, { w: 'triangle', f0: 180, f1: 60, t: 0.5, g: 0.2 }] },   // spokes + chain clatter
  }),
};
// type -> [material, pitch]; unknown types fall back to stone at pitch 1
export const MOB_VOICE = {
  gargoyle: ['stone', 1.1], statue: ['stone', 0.8], crest_griffin: ['stone', 1.25], gatehouse_lion: ['stone', 0.55],
  wisp: ['spirit', 1.3], river_wraith: ['spirit', 0.8], bog_hag: ['spirit', 0.6],
  ink_imp: ['ink', 1.2], automaton: ['clock', 1], chimekeeper: ['clock', 0.6],
  bell_bats: ['bells', 1.1], bellwarden: ['bells', 0.35], soot_sprite: ['soot', 1.2],
  punt_revenant: ['river', 1], bicycle_golem: ['bike', 1],
};
export function registerMob(id, boss = false) {
  const [mat, p] = MOB_VOICE[id] || ['stone', 1];
  const r = V[mat](p);
  if (boss) for (const k of ['attack', 'death']) r[k].o = [...(r[k].o || []), { w: 'sine', f0: 55, f1: 40, t: 1.2, g: 0.35 }];   // bosses get a sub thump
  for (const k of ['attack', 'hit', 'death']) sfx.register(`mob_${id}_${k}`, r[k]);
}

export function install(game) {
  for (const t of game.mobTypes || []) registerMob(t.id, t.boss);
  const near = m => { const d = Math.hypot(m.x - game.px, m.y - game.py); return Math.max(0, Math.min(1, 1.15 - d / 45)); };
  const voice = (m, k, v = 1) => { const id = m?.type?.id; if (!id) return; if (!sfx.has(`mob_${id}_${k}`)) registerMob(id, m.boss); const g = near(m) * v; if (g > 0.02) sfx.play(`mob_${id}_${k}`, g, 0.94 + Math.random() * 0.12); };
  const offs = [
    game.on('mobAttack', ({ mob }) => voice(mob, 'attack', mob.boss ? 1.2 : 0.8)),
    game.on('hit', ({ target, noProc }) => { if (target?.type) voice(target, 'hit', noProc ? 0.4 : 0.7); }),
    game.on('kill', ({ mob }) => voice(mob, 'death', mob?.boss ? 1.4 : 0.9)),
  ];
  game.add({ dispose() { offs.forEach(f => f()); } });
}
