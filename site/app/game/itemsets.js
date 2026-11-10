// Item sets and uniques (gameplay s2). Merged into ITEMS by itemdefs.js, so every piece has its own fx + test like any
// other item (scripts/test_items.mjs). Set bonuses (SETS) are switched on and off by progression.js as pieces are
// equipped: bonus fx(c) gets the same context as item effects ({game, S, on, cleanup}).
// Uniques are legendaries with a build-defining rule change (unique: true); they drop like other legendaries.
const isHit = (c, e) => c.S.isMobHit(e);
const ELEM = { pyromancer: ['fire', 0xff7a2a], stormcaller: ['storm', 0x9fd8ff], warden: ['stone', 0xd8b880], hexweaver: ['hex', 0xb070ff] };
const elem = g => ELEM[g.caster?.cls] || ['physical', 0xffffff];

export const SET_ITEMS = {
  // ---------------- uniques
  wand_bloodquill: { name: 'Blood-Ink Quill', slot: 'wand', rarity: 'legendary', unique: true, stats: { power: 0.1, hpRegen: 1.5 },
    desc: 'Unique: your spells are written in blood. Every cast refunds its mana and costs half as much health instead (never below 1).',
    fx(c) { c.on('cast', e => { const g = c.game; if (e.caster && e.caster !== 'player') return;
      const cost = e.cost ?? g.caster?.spells?.[e.slot]?.mana ?? 0; if (!cost) return;
      g.stats.mana = Math.min(g.stats.maxMana, g.stats.mana + cost); g.stats.hp = Math.max(1, g.stats.hp - cost * 0.5);
      c.S.fx.burst(c.S.pp(1.2), 0xa0101a, 6, 1.4, 0.5); }); },
    test(t) { const g = t.game; g.stats.mana = 40; g.stats.hp = 80; g.emit('cast', { caster: 'player', slot: 0, cost: 10 });
      return [g.stats.mana >= 49.9 && g.stats.hp <= 75.1 && g.stats.hp >= 74.9, `mana ${g.stats.mana} hp ${g.stats.hp}`]; } },
  ring_ninefold: { name: 'Ring of the Ninefold Peal', slot: 'ring', rarity: 'legendary', unique: true, stats: { cdr: 0.05 },
    desc: 'Unique: every 5th spell you cast peals out: that spell comes straight off cooldown and its mana is returned.',
    fx(c) { let n = 0; c.on('cast', e => { const g = c.game; if (e.caster && e.caster !== 'player') return; if (++n % 5) return;
      const sp = g.caster?.spells?.[e.slot]; if (sp) { sp.readyAt = g.time; g.stats.mana = Math.min(g.stats.maxMana, g.stats.mana + (e.cost ?? sp.mana)); }
      c.S.fx.ring(g.px, g.py, g.pz + 0.1, 0xffe08a, 3, 0.5); c.S.fx.burst(c.S.pp(1.6), 0xffe08a, 18, 2, 0.6); }); },
    test(t) { const g = t.game, sp = g.caster?.spells?.[1]; if (!sp) return [false, 'no caster spells'];
      const r0 = sp.readyAt; for (let i = 0; i < 4; i++) g.emit('cast', { caster: 'player', slot: 1 }); sp.readyAt = g.time + 10;
      g.emit('cast', { caster: 'player', slot: 1 }); const ok = sp.readyAt <= g.time; sp.readyAt = r0; return [ok, `readyAt-time ${(sp.readyAt - g.time).toFixed(1)}`]; } },
  robe_embergown: { name: "Fellow's Ember Gown", slot: 'robe', rarity: 'legendary', unique: true, stats: { power: 0.4, maxHp: -40 },
    desc: 'Unique: glass cannon. +40% spell power but -40 max health; every kill heals 10% of your max health.',
    fx(c) { c.on('kill', () => { const g = c.game; g.heal(g.stats.maxHp * 0.1); c.S.fx.burst(c.S.pp(1), 0xff6a3a, 14, 2, 0.6); }); },
    test(t) { const g = t.game; g.stats.hp = 10; g.emit('kill', { mob: t.mob(3, 0) }); return [g.stats.hp >= 10 + g.stats.maxHp * 0.1 - 0.01, `hp ${g.stats.hp.toFixed(1)}`]; } },
  boots_bridgerunner: { name: "Bridge-Runner's Soles", slot: 'boots', rarity: 'legendary', unique: true, stats: { speedMult: 0.06 },
    desc: 'Unique: dodging is an attack. Every dash releases a shockwave of your element (30 damage, 4 m) and your next spell within 2 s deals +50%.',
    fx(c) { const g = c.game; let on = false, until = 0; const set = v => { if (v === on) return; g.stats.power += v ? 0.5 : -0.5; on = v; };
      c.on('dash', () => { const [type, col] = elem(g); c.S.aoe(g.px, g.py, 4, 30, type); c.S.fx.ring(g.px, g.py, g.pz + 0.1, col, 4, 0.4); c.S.fx.burst(c.S.pp(0.6), col, 24, 4, 0.5); set(true); until = c.S.t + 2; });
      c.on('cast', e => { if (on && (!e.caster || e.caster === 'player')) c.S.after(0.6, () => set(false)); });   // projectiles land first
      c.on('tick', () => { if (on && c.S.t > until) set(false); });
      c.cleanup(() => set(false)); },
    test(t) { const m = t.mob(2, 0); t.game.emit('dash', {}); return [m.hp <= m.maxHp - 30, `hp ${m.hp}`]; } },
  hat_stormcrown: { name: 'Crown of the Fen Storm', slot: 'hat', rarity: 'legendary', unique: true, stats: { critChance: 0.06 },
    desc: 'Unique: every critical hit calls lightning down on the target (20 storm damage in 2.5 m).',
    fx(c) { c.on('hit', e => { if (!isHit(c, e) || !e.crit) return; const m = e.target; c.S.fx.bolt(c.S.mp(m, 9), c.S.mp(m, 0.8), 0xcfe8ff); c.S.fx.burst(c.S.mp(m, 0.6), 0x9fd8ff, 14, 3, 0.4);
      c.S.aoe(m.x, m.y, 2.5, 20, 'storm'); }); },
    test(t) { const m = t.mob(3, 0); t.hit(m, 10, true); return [m.hp <= m.maxHp - 20, `hp ${m.hp}`]; } },

  // ---------------- set: Night Climbers' Regalia (hat, boots, broom)
  nc_hat: { name: "Night Climber's Cap", slot: 'hat', rarity: 'epic', set: 'nightclimbers', stats: { speedMult: 0.03, maxMana: 10 },
    desc: 'Every jump restores 5 mana.',
    fx(c) { c.on('jump', () => { const g = c.game; g.stats.mana = Math.min(g.stats.maxMana, g.stats.mana + 5); c.S.fx.burst(c.S.pp(0.2), 0x7ab0ff, 8, 1.5, 0.4); }); },
    test(t) { const g = t.game; g.stats.mana = 0; g.emit('jump', {}); return [g.stats.mana >= 5, `mana ${g.stats.mana}`]; } },
  nc_boots: { name: "Night Climber's Plimsolls", slot: 'boots', rarity: 'epic', set: 'nightclimbers', stats: { speedMult: 0.04 },
    desc: 'Landing from a jump strikes foes within 2.5 m for 12 damage.',
    fx(c) { c.on('land', () => { const g = c.game; c.S.aoe(g.px, g.py, 2.5, 12, 'physical'); c.S.fx.ring(g.px, g.py, g.pz + 0.05, 0x9ab0d0, 2.5, 0.35); }); },
    test(t) { const m = t.mob(1.5, 0); t.game.emit('land', {}); return [m.hp <= m.maxHp - 12, `hp ${m.hp}`]; } },
  nc_broom: { name: "Night Climber's Drainpipe Broom", slot: 'broom', rarity: 'epic', set: 'nightclimbers', stats: { speedMult: 0.04 },
    desc: 'Mounting the broom makes you untouchable for 0.6 s.',
    fx(c) { let was = false; c.on('tick', () => { const g = c.game, f = !!g.player.flying; if (f && !was) { g.invulnUntil = Math.max(g.invulnUntil || 0, g.time + 0.6); c.S.fx.burst(c.S.pp(0.6), 0xc0d8ff, 16, 2, 0.4); } was = f; }); },
    test(t) { const g = t.game, p = g.player; g.invulnUntil = 0; p.mode = 'broom'; t.ticks(1); const ok = g.invulnUntil > g.time; p.mode = 'walk'; return [ok, `invuln ${(g.invulnUntil - g.time).toFixed(2)}`]; } },

  // ---------------- set: Proctors' Vigil (ring, amulet, robe)
  pv_ring: { name: "Proctor's Signet", slot: 'ring', rarity: 'epic', set: 'proctors', stats: { power: 0.05 },
    desc: 'Your hits on stunned foes deal 8 bonus damage.',
    fx(c) { c.on('hit', e => { const m = e.target; if (!isHit(c, e) || !(m.stunUntil > c.game.time)) return; c.game.damageMob(m, 8 / (c.game.stats.power || 1), { type: 'physical', crit: false, noProc: true }); }); },
    test(t) { const m = t.mob(3, 0); m.stunUntil = t.game.time + 5; t.hit(m, 10); return [m.hp <= m.maxHp - 8, `hp ${m.hp}`]; } },
  pv_amulet: { name: "Proctor's Lantern-Chain", slot: 'amulet', rarity: 'epic', set: 'proctors', stats: { maxHp: 10 },
    desc: 'When struck, gain a 12-point shield (4 s cooldown).',
    fx(c) { let ready = 0; c.on('playerHit', () => { const g = c.game; if (c.S.t < ready) return; ready = c.S.t + 4; g.shield = Math.max(g.shield || 0, 12); c.S.fx.burst(c.S.pp(1), 0xffd890, 12, 1.6, 0.5); }); },
    test(t) { const g = t.game; g.shield = 0; g.emit('playerHit', { amount: 5 }); return [g.shield >= 12, `shield ${g.shield}`]; } },
  pv_robe: { name: "Proctor's Gown", slot: 'robe', rarity: 'epic', set: 'proctors', stats: { armor: 6 },
    desc: 'Below 35% health your armour rises by 25.',
    fx(c) { const g = c.game; let on = false; const set = v => { if (v === on) return; g.stats.armor += v ? 25 : -25; on = v; };
      c.on('tick', () => set(g.stats.hp > 0 && g.stats.hp < g.stats.maxHp * 0.35)); c.cleanup(() => set(false)); },
    test(t) { const g = t.game, a0 = g.stats.armor; g.stats.hp = g.stats.maxHp * 0.2; t.ticks(1); const a1 = g.stats.armor; g.stats.hp = g.stats.maxHp; t.ticks(1);
      return [a1 >= a0 + 25 && g.stats.armor === a0, `armor ${a0} -> ${a1} -> ${g.stats.armor}`]; } },
};

// Set bonuses: n pieces equipped -> bonus n active (stats added, fx subscribed).
export const SETS = {
  nightclimbers: { name: "Night Climbers' Regalia", pieces: ['nc_hat', 'nc_boots', 'nc_broom'], bonuses: {
    2: { desc: '+20 max mana, +5% speed', stats: { maxMana: 20, speedMult: 0.05 } },
    3: { desc: 'While airborne (jumping or on the broom) your spells deal +35% damage',
      fx(c) { const g = c.game; let on = false; const set = v => { if (v === on) return; g.stats.power += v ? 0.35 : -0.35; on = v; };
        c.on('tick', () => { const p = g.player; set(!!p.flying || !p.grounded); }); c.cleanup(() => set(false)); } } } },
  proctors: { name: "Proctors' Vigil", pieces: ['pv_ring', 'pv_amulet', 'pv_robe'], bonuses: {
    2: { desc: '+10 armour', stats: { armor: 10 } },
    3: { desc: 'When struck, every foe within 6 m is stunned for 1.2 s (5 s cooldown)',
      fx(c) { let ready = 0; c.on('playerHit', () => { const g = c.game; if (c.S.t < ready) return; ready = c.S.t + 5;
        for (const m of g.mobsNear(g.px, g.py, 6)) m.stunUntil = Math.max(m.stunUntil || 0, g.time + 1.2);
        c.S.fx.ring(g.px, g.py, g.pz + 0.1, 0xffd890, 6, 0.5); c.S.fx.burst(c.S.pp(1), 0xffe0a0, 30, 4, 0.6); }); } } } },
};
for (const [sid, s] of Object.entries(SETS)) for (const id of s.pieces) {
  const d = SET_ITEMS[id]; d.desc += ` Set: ${s.name} (` + Object.entries(s.bonuses).map(([n, b]) => `${n}: ${b.desc}`).join('; ') + ').';
  d.set = sid;
}
