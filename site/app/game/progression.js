// Progression depth (gameplay s2): level cap 20 with per-level growth, level-gated spell ranks (a spell evolves into a
// new form with a new mechanic at levels 8, 12, 16 and 20), item set bonuses, and restoring level/xp from localStorage
// on reload (core.js saves them but never read them back). Talent data (3 tiers x 3 choices) lives in classes.js.
// window.__progression exposes the tables for scripts/test_progression.mjs.
import { SETS } from './itemsets.js';

export const LEVEL_CAP = 20;
export const GROWTH = { maxHp: 10, maxMana: 3, manaRegen: 0.2 };   // per level above 1 (core.js adds the maxHp itself)

// Ranks: {level, spell, name, desc, f(s)} - f edits that spell's fresh copy (after talents), adding a mechanic.
export const RANKS = {
  pyromancer: [
    { level: 8, spell: 'ember_bolt', name: 'Ember Lance', desc: 'Ember Bolt pierces one more foe', f: s => { s.pierce = (s.pierce || 0) + 1; } },
    { level: 12, spell: 'cinder_spray', name: "Wyrm's Breath", desc: 'Cinder Spray blasts foes back', f: s => { s.knock = Math.max(s.knock || 0, 3); } },
    { level: 16, spell: 'kindle_ring', name: 'Corona', desc: 'Kindle Ring sears foes (+20% damage taken)', f: s => { s.curse = Math.max(s.curse || 1, 1.2); s.curseDur = Math.max(s.curseDur || 0, 4); } },
    { level: 20, spell: 'sunfall', name: 'Sunfall Eternal', desc: 'Sunfall lasts 30% longer and meteors stagger', f: s => { s.dur *= 1.3; s.stun = Math.max(s.stun || 0, 0.3); } },
  ],
  stormcaller: [
    { level: 8, spell: 'spark_lance', name: 'Forked Spark', desc: 'Spark Lance chains to one more foe', f: s => { s.chain = (s.chain || 0) + 1; } },
    { level: 12, spell: 'gale_burst', name: 'Cyclone', desc: 'Gale Burst also stuns 0.5 s', f: s => { s.stun = Math.max(s.stun || 0, 0.5); } },
    { level: 16, spell: 'arc_chain', name: 'Thunderhead Chain', desc: 'Arc Chain slows every foe it jumps to', f: s => { s.slow = Math.max(s.slow || 0, 1.5); } },
    { level: 20, spell: 'tempest', name: 'Tempest Unbound', desc: 'Tempest radius +25% and strikes stun', f: s => { s.radius *= 1.25; s.stun = Math.max(s.stun || 0, 0.3); } },
  ],
  warden: [
    { level: 8, spell: 'pebble_shot', name: 'Cobble Shot', desc: 'Pebble Shot bursts on impact (2 m) and shoves', f: s => { s.splash = Math.max(s.splash || 0, 2); s.knock = Math.max(s.knock || 0, 2); } },
    { level: 12, spell: 'quake_stomp', name: 'Tremor', desc: 'Quake Stomp leaves foes slowed', f: s => { s.slow = Math.max(s.slow || 0, 2); } },
    { level: 16, spell: 'boulder_leap', name: 'Meteor Leap', desc: 'Boulder Leap makes you untouchable in flight', f: s => { s.invuln = Math.max(s.invuln || 0, 0.8); } },
    { level: 20, spell: 'monolith', name: 'Monolith of Ages', desc: "Monolith Ward's shockwave heals you for 30% of its damage", f: s => { s.drain = Math.max(s.drain || 0, 0.3); } },
  ],
  hexweaver: [
    { level: 8, spell: 'hex_dart', name: 'Hex Barb', desc: 'Hex Dart festers (4 dmg/s for 3 s)', f: s => { s.burn = s.burn || { dps: 4, dur: 3 }; } },
    { level: 12, spell: 'soul_siphon', name: 'Soul Harvest', desc: 'Soul Siphon leaps to one more foe', f: s => { s.chain = (s.chain || 0) + 1; s.chainRange ||= 8; } },
    { level: 16, spell: 'shade_step', name: 'Umbral Step', desc: 'Shade Step leaves a cursing burst behind', f: s => { if (!s.wake) Object.assign(s, { wake: true, dmg: 12, radius: 3, curse: 1.25, curseDur: 4 }); } },
    { level: 20, spell: 'night_bloom', name: 'Endless Night', desc: 'Night Bloom opens around you and follows you', f: s => { s.follow = true; } },
  ],
};

export function install(game) {
  const st = game.stats, sv = game.save, offs = [];
  const growth = (n, sgn = 1) => { st.maxHp += sgn * GROWTH.maxHp * n; st.maxMana += sgn * GROWTH.maxMana * n; st.manaRegen += sgn * GROWTH.manaRegen * n; };

  // --- level cap
  game.xpToNext = (L = st.level) => (L >= LEVEL_CAP ? Infinity : Math.round(60 * L ** 1.5));
  const coreGain = game.gainXp.bind(game);
  game.gainXp = n => { if (st.level >= LEVEL_CAP) { st.xp = 0; return; } coreGain(n); if (st.level >= LEVEL_CAP) { st.xp = 0; sv.xp = 0; game.persist(); } };
  // core adds +10 maxHp per level; add mana growth on top
  offs.push(game.on('levelup', ({ level }) => {
    st.maxMana += GROWTH.maxMana; st.manaRegen += GROWTH.manaRegen; st.mana = st.maxMana;
    for (const r of RANKS[game.caster?.cls] || []) if (r.level === level) game.hud?.toast?.(`${spellName(r.spell)} evolves: ${r.name}!`);
  }));
  // debug/test helper: set a level directly, keeping growth consistent
  game.setLevel = L => { L = Math.max(1, Math.min(LEVEL_CAP, L | 0)); growth(L - st.level); st.level = L; st.xp = 0; st.hp = st.maxHp; st.mana = st.maxMana;
    sv.level = L; sv.xp = 0; game.persist(); game.caster?.rebuild(); game.emit('levelChanged', { level: L }); };

  // --- restore level/xp from the save
  const L0 = Math.max(1, Math.min(LEVEL_CAP, sv.level | 0));
  if (L0 > 1) { growth(L0 - 1); st.level = L0; st.hp = st.maxHp; st.mana = st.maxMana; }
  st.xp = L0 >= LEVEL_CAP ? 0 : Math.max(0, +sv.xp || 0);

  // --- spell ranks (applied by classes.js rebuild via game.spellMods)
  const spellName = id => game.caster?.classes?.[game.caster.cls]?.spells.find(s => s.id === id)?.name || id;
  const rankMod = (S, level, cls) => { for (const r of RANKS[cls] || []) { const s = S[r.spell]; if (!s || level < r.level) continue;
    r.f(s); s.rank = (s.rank || 1) + 1; s.baseName ||= s.name; s.name = r.name; } };
  (game.spellMods ||= []).push(rankMod);
  game.caster?.rebuild();
  offs.push(game.on('ready', () => game.caster?.rebuild()));

  // --- set bonuses
  const active = {};   // `${set}:${n}` -> offs[]
  const applyStats = (stats, sgn) => { for (const [k, v] of Object.entries(stats || {})) st[k] = (st[k] ?? 0) + sgn * v;
    st.hp = Math.min(st.hp, st.maxHp); st.mana = Math.min(st.mana, st.maxMana); };
  function refreshSets() {
    const eq = Object.values(game.items?.equipped || {});
    for (const [sid, s] of Object.entries(SETS)) {
      const n = s.pieces.filter(id => eq.includes(id)).length;
      for (const [k, b] of Object.entries(s.bonuses)) {
        const key = `${sid}:${k}`, want = n >= +k, on = !!active[key];
        if (want === on) continue;
        if (want) {
          const o = active[key] = []; applyStats(b.stats, 1);
          try { b.fx?.({ game, S: game.items.S, on: (ev, fn) => o.push(game.on(ev, fn)), cleanup: fn => o.push(fn) }); } catch (e) { console.warn('[progression] set fx', key, e); }
          if (!game.items?.S?.testing) game.hud?.toast?.(`${s.name} (${k}): ${b.desc}`);
        } else { for (const f of active[key]) { try { f(); } catch {} } delete active[key]; applyStats(b.stats, -1); }
      }
    }
  }
  offs.push(game.on('equip', refreshSets), game.on('unequip', refreshSets));
  refreshSets();

  window.__progression = { LEVEL_CAP, RANKS, SETS, GROWTH, activeSets: () => Object.keys(active) };
  game.add({ dispose() { for (const f of offs) f(); for (const k of Object.keys(active)) for (const f of active[k]) { try { f(); } catch {} } delete window.__progression; } });
}
