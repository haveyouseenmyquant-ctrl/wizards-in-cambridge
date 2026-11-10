// Player classes and spells (session 40): four original casting classes, six spells each (keys 1-6, left mouse = 1
// while the pointer is locked), a 3-tier talent tree per class and a staff held in first-person view.
// Spells are data (CLASSES) run by a few generic kinds (bolt, beam, cone, nova, zone, blink, shield, summon);
// talents are small functions that edit a fresh copy of the class's spell table, so they really change behaviour.
// Mob status fields written here (mobs.js honours them): slowUntil, stunUntil (game.time seconds), damageTaken (mult).
import * as sfx from './sfx.js';
import { createVfx } from './vfx.js';

export const STARTING_GEAR = {
  pyromancer: ['starter_pyromancer_staff', 'starter_pyromancer_hat', 'starter_pyromancer_robe'],
  stormcaller: ['starter_stormcaller_staff', 'starter_stormcaller_hat', 'starter_stormcaller_robe'],
  warden: ['starter_warden_staff', 'starter_warden_hat', 'starter_warden_robe'],
  hexweaver: ['starter_hexweaver_staff', 'starter_hexweaver_hat', 'starter_hexweaver_robe'],
};

export const CLASSES = {
  pyromancer: {
    // session 70: no boss damage nerf (s66 had 0.86). Its slow kills were deaths: the boss heals to full whenever the
    // player dies, and the glass-cannon pyro died 4-10 times a run. So: tougher starter robe, and Flame Step dodges.
    // session 78: boss median TTK 30.3 s vs an all-class median of ~18 s (stormcaller 14.9, warden 18.0, hexweaver 18.2).
    // Ember Bolt was the weakest filler by far (16 dmg / 5 mana = 3.2 dmg per mana vs 5-7 for the other classes), so it
    // goes to 19 (all fights), and boss damage gets x1.3 (boss fights only); together ~x1.45 on the boss -> ~20 s.
    bossMult: 1.3,
    name: 'Pyromancer', color: '#ff7a2a', blurb: 'Fire and burst damage. Burns linger, explosions stack, and Ember Bolt cauterises your wounds.',
    spells: [
      { id: 'ember_bolt', name: 'Ember Bolt', glyph: '✦', kind: 'bolt', type: 'fire', mana: 5, cd: 0.45, dmg: 19, speed: 48, range: 45, splash: 1.2, drain: 0.1, color: 0xff7a2a, sfx: 'ember', look: 'ember' },
      { id: 'cinder_spray', name: 'Cinder Spray', glyph: '≋', kind: 'cone', type: 'fire', mana: 14, cd: 3, dmg: 14, range: 9, angle: 0.6, burn: { dps: 6, dur: 3 }, color: 0xffa040, sfx: 'spray', look: 'spray' },
      { id: 'fireburst', name: 'Fireburst Orb', glyph: '◉', kind: 'bolt', type: 'fire', mana: 22, cd: 6, dmg: 24, speed: 22, range: 50, splash: 4.5, color: 0xff5010, sfx: 'orb', look: 'orb', size: 1.6 },
      { id: 'flame_step', name: 'Flame Step', glyph: '➚', kind: 'blink', type: 'fire', mana: 15, cd: 5, dist: 11, invuln: 0.4, dmg: 18, radius: 3, color: 0xff9a30, sfx: 'flamestep', look: 'flamestep' },
      { id: 'kindle_ring', name: 'Kindle Ring', glyph: '◎', kind: 'nova', type: 'fire', mana: 24, cd: 9, dmg: 24, radius: 5.5, knock: 3, burn: { dps: 5, dur: 3 }, color: 0xff6a00, sfx: 'kindle', look: 'kindle' },
      { id: 'sunfall', name: 'Sunfall', glyph: '☀', kind: 'zone', type: 'fire', mana: 50, cd: 60, dmg: 11, radius: 7, dur: 3, interval: 0.22, tick: 'meteor', splash: 2.5, range: 40, color: 0xffc040, sfx: 'sunfall', look: 'sunfall', ult: true },
    ],
    talents: [
      [{ name: 'Split Embers', desc: 'Ember Bolt fires 3 bolts in a fan', f: S => { S.ember_bolt.count = 3; } },
       { name: 'Searing Core', desc: 'Ember Bolt +40% damage and burns', f: S => { S.ember_bolt.dmg *= 1.4; S.ember_bolt.burn = { dps: 4, dur: 2 }; } }],
      [{ name: 'Wide Blast', desc: 'Fireburst Orb radius +60%', f: S => { S.fireburst.splash *= 1.6; } },
       { name: 'Long Spray', desc: 'Cinder Spray range +50%, burns twice as hot', f: S => { S.cinder_spray.range *= 1.5; S.cinder_spray.burn.dps *= 2; } }],
      [{ name: 'Endless Dawn', desc: 'Sunfall lasts 50% longer', f: S => { S.sunfall.dur *= 1.5; } },
       { name: 'Quick Kindling', desc: 'All Pyromancer cooldowns -20%', f: S => { for (const k in S) S[k].cd *= 0.8; } }],
    ],
  },
  stormcaller: {
    bossMult: 0.88,   // session 78: boss median TTK 14.9 s, fastest class; x0.88 -> ~17 s, toward the ~18 s median
    name: 'Stormcaller', color: '#7fd4ff', blurb: 'Lightning and wind. Fast, mobile, chains between foes. Wind Dash goes further on a broom.',
    spells: [
      { id: 'spark_lance', name: 'Spark Lance', glyph: 'ϟ', kind: 'beam', type: 'storm', mana: 5, cd: 0.4, dmg: 26, range: 40, chain: 1, color: 0xbfe6ff, sfx: 'lance', look: 'lance' },
      { id: 'arc_chain', name: 'Arc Chain', glyph: '⚡', kind: 'beam', type: 'storm', mana: 14, cd: 4, dmg: 28, range: 30, chain: 4, chainRange: 8, color: 0x8fb8ff, sfx: 'arc', look: 'arc' },
      { id: 'gale_burst', name: 'Gale Burst', glyph: '༄', kind: 'cone', type: 'storm', mana: 12, cd: 6, dmg: 16, range: 10, angle: 0.8, knock: 5, slow: 2, color: 0xd8fff4, sfx: 'gale', look: 'gale' },
      { id: 'wind_dash', name: 'Wind Dash', glyph: '»', kind: 'blink', type: 'storm', mana: 10, cd: 4, dist: 14, broomMult: 1.6, color: 0xc8f0ff, sfx: 'winddash', look: 'winddash' },
      { id: 'static_field', name: 'Static Field', glyph: '⌁', kind: 'zone', type: 'storm', mana: 22, cd: 12, dmg: 16, radius: 5, dur: 4, interval: 0.5, tick: 'field', slow: 1, range: 30, color: 0x66aaff, sfx: 'static', look: 'static' },
      { id: 'tempest', name: 'Tempest', glyph: '☈', kind: 'zone', type: 'storm', mana: 50, cd: 70, dmg: 24, radius: 12, dur: 5, interval: 0.3, tick: 'strike', follow: true, color: 0xe0f0ff, sfx: 'tempest', look: 'tempest', ult: true },
    ],
    talents: [
      [{ name: 'Forked Lance', desc: 'Spark Lance chains to 2 more foes', f: S => { S.spark_lance.chain += 2; } },
       { name: 'Charged Lance', desc: 'Spark Lance +35% damage', f: S => { S.spark_lance.dmg *= 1.35; } }],
      [{ name: 'Slipstream', desc: 'Wind Dash +60% distance and brief invulnerability', f: S => { S.wind_dash.dist *= 1.6; S.wind_dash.invuln = 0.6; } },
       { name: 'Thunderclap', desc: 'Gale Burst stuns for 1 s', f: S => { S.gale_burst.stun = 1; } }],
      [{ name: 'Eye of the Storm', desc: 'Tempest strikes twice as often', f: S => { S.tempest.interval /= 2; } },
       { name: 'Wide Field', desc: 'Static Field radius +50%, lasts 2 s longer', f: S => { S.static_field.radius *= 1.5; S.static_field.dur += 2; } }],
    ],
  },
  warden: {
    name: 'Stone Warden', color: '#c9a66b', blurb: 'Earth and stone. Shields, stuns and roots; outlasts anything.',
    spells: [
      { id: 'pebble_shot', name: 'Pebble Shot', glyph: '●', kind: 'bolt', type: 'stone', mana: 4, cd: 0.5, dmg: 28, speed: 52, range: 50, splash: 0, grav: 4, color: 0xd8b880, sfx: 'pebble', look: 'pebble' },
      { id: 'granite_skin', name: 'Granite Skin', glyph: '⛨', kind: 'shield', type: 'stone', mana: 18, cd: 12, amount: 40, dur: 8, color: 0xe0c080, sfx: 'granite', look: 'granite' },
      { id: 'quake_stomp', name: 'Quake Stomp', glyph: '⩩', kind: 'nova', type: 'stone', mana: 18, cd: 8, dmg: 35, radius: 6, stun: 1.2, color: 0xb08850, sfx: 'quake', look: 'quake' },
      { id: 'boulder_leap', name: 'Boulder Leap', glyph: '⤴', kind: 'blink', type: 'stone', mana: 14, cd: 7, dist: 10, hop: 7, dmg: 20, radius: 3, stun: 0.8, landing: true, color: 0xc09060, sfx: 'leap', look: 'leap' },
      { id: 'rootbind', name: 'Rootbind Spikes', glyph: '⋀', kind: 'zone', type: 'stone', mana: 20, cd: 10, dmg: 30, radius: 4, dur: 0.01, interval: 1, tick: 'spikes', slow: 4, range: 30, color: 0x9a8a60, sfx: 'spikes', look: 'spikes' },
      { id: 'monolith', name: 'Monolith Ward', glyph: '▲', kind: 'shield', type: 'stone', mana: 50, cd: 75, amount: 120, dur: 10, dmg: 130, radius: 9, stun: 3, color: 0xffd890, sfx: 'monolith', look: 'monolith', ult: true },
    ],
    talents: [
      [{ name: 'Bedrock', desc: 'Granite Skin absorbs 60% more', f: S => { S.granite_skin.amount *= 1.6; } },
       { name: 'Quick Set', desc: 'Granite Skin cooldown -40%', f: S => { S.granite_skin.cd *= 0.6; } }],
      [{ name: 'Fault Line', desc: 'Quake Stomp radius +40%', f: S => { S.quake_stomp.radius *= 1.4; } },
       { name: 'Aftershock', desc: 'Quake Stomp stuns 1 s longer', f: S => { S.quake_stomp.stun += 1; } }],
      [{ name: 'Crater', desc: 'Boulder Leap landing radius x2, +50% damage', f: S => { S.boulder_leap.radius *= 2; S.boulder_leap.dmg *= 1.5; } },
       { name: 'Ancient Ward', desc: 'Monolith Ward cooldown -35%', f: S => { S.monolith.cd *= 0.65; } }],
    ],
  },
  hexweaver: {
    name: 'Hex Weaver', color: '#b070ff', blurb: 'Curses, bound wisps and life drain. Weakens foes, feeds on them.',
    spells: [
      { id: 'hex_dart', name: 'Hex Dart', glyph: '✧', kind: 'bolt', type: 'hex', mana: 5, cd: 0.4, dmg: 25, speed: 40, range: 50, splash: 0, drain: 0.3, color: 0xb070ff, sfx: 'dart', look: 'dart' },
      { id: 'withering_mark', name: 'Withering Mark', glyph: '⍟', kind: 'bolt', type: 'hex', mana: 12, cd: 5, dmg: 10, speed: 34, range: 45, splash: 0, curse: 1.35, curseDur: 8, burn: { dps: 5, dur: 8 }, color: 0x70ff90, sfx: 'mark', look: 'mark' },
      { id: 'soul_siphon', name: 'Soul Siphon', glyph: '♆', kind: 'beam', type: 'hex', mana: 16, cd: 6, dmg: 54, range: 25, chain: 0, drain: 0.5, color: 0xd050ff, sfx: 'siphon', look: 'siphon' },
      { id: 'shade_step', name: 'Shade Step', glyph: '⇢', kind: 'blink', type: 'hex', mana: 12, cd: 5, dist: 12, invuln: 0.5, color: 0x8040c0, sfx: 'shade', look: 'shade' },
      { id: 'bound_wisps', name: 'Bound Wisps', glyph: '❂', kind: 'summon', type: 'hex', mana: 24, cd: 18, dmg: 10, count: 2, dur: 12, interval: 0.8, range: 20, drain: 0.3, color: 0xa0ffd0, sfx: 'wisp', look: 'wisp' },
      { id: 'night_bloom', name: 'Night Bloom', glyph: '✿', kind: 'zone', type: 'hex', mana: 50, cd: 70, dmg: 28, radius: 8, dur: 4, interval: 0.5, tick: 'field', curse: 1.5, curseDur: 6, drain: 0.25, range: 30, color: 0x9030ff, sfx: 'bloom', look: 'bloom', ult: true },
    ],
    talents: [
      [{ name: 'Gluttony', desc: 'Hex Dart drains 60% of damage dealt', f: S => { S.hex_dart.drain = 0.6; } },
       { name: 'Needle Hex', desc: 'Hex Dart pierces through 2 foes', f: S => { S.hex_dart.pierce = 2; } }],
      [{ name: 'Deep Wither', desc: 'Withering Mark curse 1.6x damage taken', f: S => { S.withering_mark.curse = 1.6; } },
       { name: 'Third Wisp', desc: 'Bound Wisps summons 3 wisps', f: S => { S.bound_wisps.count = 3; } }],
      [{ name: 'Overgrowth', desc: 'Night Bloom radius +50%', f: S => { S.night_bloom.radius *= 1.5; } },
       { name: 'Shadow Wake', desc: 'Shade Step leaves a cursing burst where you were', f: S => { Object.assign(S.shade_step, { wake: true, dmg: 15, radius: 3.5, curse: 1.3, curseDur: 5 }); } }],
    ],
  },
};
export const TALENT_LEVELS = [2, 4, 6];

export function install(game) {
  const THREE = game.THREE, p = game.player, world = game.world;
  const vfx = createVfx(game); game.vfx = vfx;
  const offs = [];   // listener removers, run on dispose
  const listen = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };

  // ---------- spells table (class defs + talents) ----------
  const caster = game.caster = {
    cls: null, spells: [], classes: CLASSES, talentLevels: TALENT_LEVELS,
    get talents() { return CLASSES[this.cls]?.talents || []; },
    get picks() { return (game.save.talents ||= {})[this.cls] ||= [null, null, null]; },
    setClass, cast, pickTalent, rebuild,
    remaining(i) { const s = this.spells[i]; return s ? Math.max(0, s.readyAt - game.time) : 0; },
  };
  function rebuild() {
    const def = CLASSES[caster.cls]; if (!def) return;
    const old = caster.spells, S = {};
    const list = def.spells.map((d, i) => {
      const s = structuredClone(d); s.slot = i; s.key = String(i + 1);
      s.readyAt = old[i]?.id === s.id ? old[i].readyAt : 0; s.cdTotal = old[i]?.id === s.id ? old[i].cdTotal : s.cd;
      S[s.id] = s; return s;
    });
    const picks = caster.picks;
    def.talents.forEach((tier, t) => { const c = picks[t]; if (c != null && game.stats.level >= TALENT_LEVELS[t]) tier[c]?.f(S); });
    caster.spells = list;
    game.emit('spellsChanged', { cls: caster.cls });
  }
  function setClass(cls) {
    if (!CLASSES[cls]) return false;
    caster.cls = cls; caster.spells = [];
    if (game.save.cls !== cls) { game.save.cls = cls; game.persist(); }
    rebuild(); giveGear();
    return true;
  }
  function pickTalent(tier, choice) {
    if (game.stats.level < TALENT_LEVELS[tier]) return false;
    caster.picks[tier] = choice; game.persist(); rebuild(); return true;
  }
  function giveGear() {
    if (!game.items?.give || !caster.cls) return;
    const given = (game.save.gearGiven ||= {});
    // session 73: starting gear now includes the class hat (its stats were dead data). given[cls] === 2 means staff, hat
    // and robe were granted; older saves (true) get only the missing hat, quietly
    if (given[caster.cls] === 2) return;
    const ids = given[caster.cls] ? [`starter_${caster.cls}_hat`] : STARTING_GEAR[caster.cls];
    for (const id of ids) { try { game.items.give(id, { quiet: !!given[caster.cls] }); } catch (e) { console.warn('[classes] give', id, e.message); } }
    given[caster.cls] = 2; game.persist();
  }
  offs.push(game.on('ready', giveGear));
  offs.push(game.on('levelup', () => { rebuild(); sfx.play('levelup'); }));
  setClass(game.save.cls && CLASSES[game.save.cls] ? game.save.cls : 'pyromancer');
  if (!game.save.cls) { delete game.save.cls; game.persist(); }   // still let the HUD offer the class choice

  // ---------- aiming ----------
  const A = { x: 0, y: 0, z: 0, dx: 0, dy: 1, dz: 0, hx: 0, hy: 1 };   // origin + unit direction + horizontal facing
  const mobH = m => m.height ?? 1.6;
  function aim(target) {
    const f = game.facing();
    A.x = p.x + f.x * 0.4; A.y = p.y + f.y * 0.4; A.z = p.eye - 0.25;
    if (target && !target.dead) {
      let dx = target.x - A.x, dy = target.y - A.y, dz = target.z + mobH(target) * 0.5 - A.z; const l = Math.hypot(dx, dy, dz) || 1;
      A.dx = dx / l; A.dy = dy / l; A.dz = dz / l;
      const h = Math.hypot(dx, dy) || 1; A.hx = dx / h; A.hy = dy / h;
    } else {
      const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
      A.dx = f.x * cp; A.dy = f.y * cp; A.dz = sp; A.hx = f.x; A.hy = f.y;
    }
  }
  // first wall/ground hit along the aim ray, up to range (cast-time only)
  const P = { x: 0, y: 0, z: 0, d: 0 };
  function rayPoint(range) {
    let d = 0.5;
    for (; d <= range; d += 0.5) {
      const x = A.x + A.dx * d, y = A.y + A.dy * d, z = A.z + A.dz * d, g = game.groundAt(x, y, z);
      if ((g != null && z <= g + 0.05) || world.blocked(x, y, z - 0.3, 0.15, 0, 0.6)) { d -= 0.5; break; }
    }
    d = Math.max(0, Math.min(d, range));
    P.x = A.x + A.dx * d; P.y = A.y + A.dy * d; P.z = A.z + A.dz * d; P.d = d; return P;
  }
  const groundZ = (x, y, z) => game.groundAt(x, y, z + 1) ?? p.z;

  // ---------- hit effects / statuses ----------
  const dots = [], cursed = new Set();
  function hit(m, sp, mult = 1, ox, oy) {
    if (!m || m.dead) return 0;
    if (m.boss) mult *= CLASSES[caster.cls]?.bossMult ?? 1;
    const dealt = game.damageMob(m, (sp.dmg || 0) * mult, { type: sp.type, spell: sp.id, source: 'player' });
    status(m, sp, ox, oy);
    if (sp.drain && dealt) game.heal(dealt * sp.drain);
    return dealt;
  }
  function status(m, sp, ox, oy) {
    if (m.dead) return;
    const t = game.time;
    if (sp.slow) m.slowUntil = Math.max(m.slowUntil || 0, t + sp.slow);
    if (sp.stun) m.stunUntil = Math.max(m.stunUntil || 0, t + sp.stun);
    if (sp.curse) { m.damageTaken = Math.max(m.damageTaken ?? 1, sp.curse); m._curseUntil = t + (sp.curseDur || 5); cursed.add(m); vfx.sigil(m.x, m.y, m.z + mobH(m) + 0.4, 0x70ff90, 0.9, 1.2); }
    if (sp.burn) {
      let d = dots.find(d => d.m === m && d.sp === sp.id);
      if (!d) { d = { m, sp: sp.id, type: sp.type, next: t + 0.5 }; dots.push(d); }
      d.dps = sp.burn.dps; d.until = t + sp.burn.dur; d.drain = sp.drain || 0;
    }
    if (sp.knock && ox != null) {
      const dx = m.x - ox, dy = m.y - oy, l = Math.hypot(dx, dy) || 1;
      for (let k = sp.knock; k > 0.4; k *= 0.5) {
        const nx = m.x + dx / l * k, ny = m.y + dy / l * k;
        const g = world.standAt(nx, ny, m.z);
        if (g != null) { m.x = nx; m.y = ny; m.z = g; break; }
      }
    }
  }
  function aoe(x, y, z, r, sp, mult = 1, vert = 4) {
    let n = 0;
    for (const m of game.mobsNear(x, y, r)) if (Math.abs(m.z + mobH(m) * 0.5 - z) < vert + mobH(m)) { hit(m, sp, mult, x, y); n++; }
    return n;
  }

  // ---------- per-spell looks (cast + impact VFX; session 46 kit, see vfx.js) ----------
  // fire = flame tongues + embers + smoke + scorch; storm = branching bolts, wind streaks, sparks;
  // stone = shards, dust, rock debris, amber runes; hex = purple/green wisps, curse sigils, drain tethers.
  const nearGround = (x, y, z) => { const g = groundZ(x, y, z); return z - g < 1.6 ? g : null; };
  const FIRE = { tex: 'flame', color: 0xfff0b0, color2: 0xff2a00 };
  const SMOKE = { tex: 'smoke', color: 0x3a302a, color2: 0x1a1612, grow: 2.2, drag: 1.5, alpha: 0.5 };
  const DUST = { tex: 'dust', color: 0xb8a080, color2: 0x8a7860, grow: 2, drag: 2.2, alpha: 0.6 };
  // session 70: fire blasts use the vfx fire kit (heat-graded layers, ember bed, spark streaks; no per-call allocation).
  // big: true/2 = fireburst, 1 = meteor, false/0 = bolt hit
  function fireBlast(x, y, z, r, big) { vfx.fireball(x, y, z, r, big === true ? 2 : big || 0, nearGround(x, y, z)); }
  const EMB_HEAD = { tex: 'flame', color: 0xfff6d8, color2: 0xff6010, speed: 0, size: 0.6, life: 0.07, drag: 0, jitter: 0.04, spin: 8 };
  const EMB_LICK = { ...FIRE, speed: 0.6, size: 0.42, life: 0.28, up: 1.4, jitter: 0.12 };
  const EMB_SPARK = { tex: 'ember', color: 0xffe080, color2: 0xff3000, speed: 1.4, size: 0.1, life: 0.7, grav: 2.5, drag: 0.8, up: 0.6 };
  const ORB_FIRE = { ...FIRE, color2: 0xc01800, speed: 1.2, size: 0.85, life: 0.38, up: 1.5, jitter: 0.3 };
  const ORB_SMOKE = { ...SMOKE, color: 0x5a2c16, speed: 0.4, size: 0.8, life: 0.9, up: 0.8, alpha: 0.3 };
  const MET_FIRE = { ...FIRE, color2: 0xc01800, speed: 1, size: 1, life: 0.3, jitter: 0.4 };
  function stoneHit(x, y, z, n = 6, floor) {
    vfx.debris(x, y, z, n, { color: 0x8a7458, speed: 4.5, size: 0.17, up: 5, floor: floor ?? groundZ(x, y, z), life: 1.5 });   // s80: chunkier
    vfx.burst(x, y, z, Math.ceil(n * 0.8), { ...DUST, speed: 2, size: 0.9, life: 0.9, up: 0.5 });
    vfx.burst(x, y, z, n * 2, { tex: 'shard', color: 0xd8c098, speed: 6, size: 0.18, life: 0.5, grav: 14, drag: 1, spin: 6 });
  }
  function hexPuff(x, y, z, n, c1 = 0xb070ff, c2 = 0x60ff90) {
    vfx.burst(x, y, z, n, { tex: 'wisp', color: c1, color2: 0x4010a0, speed: 2.5, size: 0.6, life: 0.7, drag: 3, up: 0.8, spin: 4 });
    vfx.burst(x, y, z, Math.ceil(n / 2), { tex: 'ember', color: c2, speed: 3.5, size: 0.14, life: 0.6, drag: 2, up: 1 });
    vfx.burst(x, y, z, Math.ceil(n / 4), { tex: 'smoke', color: 0x2a1040, color2: 0x100818, grow: 2, speed: 0.8, size: 0.9, life: 1, alpha: 0.45 });
    HEX_MOTE.speed = 1.6; HEX_MOTE.jitter = 0.4; vfx.burst(x, y, z, Math.ceil(n * 0.8), HEX_MOTE);   // s80: dark motes that curl up and linger
  }
  const HEX_MOTE = { tex: 'wisp', blend: 'alpha', color: 0x1c0a2c, color2: 0x07030c, speed: 1.6, size: 0.45, life: 1.2, drag: 2.5, up: 1.1, spin: 3, alpha: 0.8, jitter: 0.4 };
  const LOOK = {
    ember: { missile: { envelope: 0xff6a18, stretch: 3, coreColor: 0xfff4d8, radius: 0.22, halo: 0.9, width: 0.6, width2: 0.22, trailColor2: 0xffe080, trailLife: 0.28, trailLife2: 0.42 },
             trail: (x, y, z) => {   // session 51: flickering flame head (random size/colour each frame), licking tongues, ember sparks
               EMB_HEAD.size = 0.5 + Math.random() * 0.35; vfx.burst(x, y, z, 1, EMB_HEAD);
               vfx.burst(x, y, z, 2, EMB_LICK);
               if (Math.random() < 0.7) vfx.burst(x, y, z, 1, EMB_SPARK); },
             impact: (x, y, z) => fireBlast(x, y, z, 1.4, 0) },
    orb: { missile: { envelope: 0xff4a10, stretch: 1.8, coreColor: 0xfff0c0, radius: 0.26, halo: 1.3, width: 0.75, width2: 0.3, trailColor2: 0xffd060, trailLife: 0.3 },
           trail: (x, y, z) => { vfx.burst(x, y, z, 3, ORB_FIRE); if (Math.random() < 0.6) vfx.burst(x, y, z, 1, ORB_SMOKE); },
           impact: (x, y, z, sp) => { sfx.play('boom'); fireBlast(x, y, z, sp.splash, true); } },
    pebble: { missile: { stretch: 1.8, coreColor: 0xffd890, radius: 0.1, halo: 0.7, width: 0.3, trailColor: 0xd8a860, trailLife: 0.3, width2: 0.1, trailColor2: 0xffe0a0, rock: 0.2 },   // session 52: tumbling stone head
              trail: (x, y, z) => {   // session 51: grit shards shed behind the pebble and a dust wake
                if (Math.random() < 0.7) vfx.burst(x, y, z, 1, { ...DUST, speed: 0.3, size: 0.45, life: 0.6, alpha: 0.45, grow: 1.5 });
                if (Math.random() < 0.6) vfx.burst(x, y, z, 1, { tex: 'shard', color: 0xc8a878, speed: 1.5, size: 0.14, life: 0.4, grav: 10, spin: 9 }); },
              impact: (x, y, z) => { stoneHit(x, y, z, 9); vfx.burst(x, y, z, 6, { tex: 'shard', color: 0xa08860, speed: 4, size: 0.3, life: 0.6, grav: 14, spin: 7, up: 2 }); vfx.burst(x, y, z, 4, { ...DUST, speed: 2.5, size: 1.3, life: 1.1, up: 0.4, alpha: 0.5, grow: 2 });
                vfx.impact(x, y, z, 0xffc870, 1.2); vfx.core(x, y, z, 0xffb050, 0.3, 0.12);   // session 52: amber crack flash
                const g = nearGround(x, y, z); if (g != null) { vfx.decal('crack', x, y, g, 1.1, 3, 0xffffff, 0.8); vfx.ring(x, y, g, 0xd8b070, 0.2, 1.8, 0.3, 0.75);
                  for (let k = 0; k < 3; k++) { const a = Math.random() * 6.283; vfx.spike(x + Math.cos(a) * 0.5, y + Math.sin(a) * 0.5, g, 0.5 + Math.random() * 0.4, 0.55); } } } },
    dart: { missile: { crystal: 0xb070ff, crystalSize: 1.1, stretch: 3.2, coreColor: 0xf4e0ff, radius: 0.15, halo: 0.8, width: 0.4, width2: 0.14, trailColor2: 0x70ff90, trailLife: 0.28, trailLife2: 0.4 },
            trail: (x, y, z, b) => {   // session 51: two wisps orbit the dart's path (double helix) and fade behind it
              const t = (b ? b.trav : 0) * 1.6, nx = b ? -b.dy : 1, ny = b ? b.dx : 0;
              for (const ph of [0, Math.PI]) { const c = Math.cos(t + ph) * 0.32, sn = Math.sin(t + ph) * 0.32;
                vfx.burst(x + nx * c, y + ny * c, z + sn, 1, { tex: 'wisp', color: ph ? 0xd890ff : 0x9050ff, color2: 0x301080, speed: 0.1, size: 0.34, life: 0.5, spin: 5, drag: 2, jitter: 0 }); }
              if (Math.random() < 0.3) vfx.burst(x, y, z, 1, { tex: 'smoke', color: 0x3a1460, color2: 0x100818, speed: 0.2, size: 0.5, life: 0.6, alpha: 0.35, grow: 1.6 }); },
            impact: (x, y, z) => { hexPuff(x, y, z, 10); vfx.sigil(x, y, z + 0.9, 0xc080ff, 0.9, 0.9); vfx.core(x, y, z, 0xb070ff, 0.25, 0.15); const g = nearGround(x, y, z); if (g != null) vfx.decal('rune', x, y, g, 0.9, 1.2, 0xb070ff, 0.7, 2); } },
    mark: { missile: { crystal: 0x60ff80, crystalSize: 1.3, stretch: 2.4, coreColor: 0xe0ffe8, radius: 0.17, halo: 0.85, width: 0.44, trailColor: 0x50ff70, width2: 0.12, trailColor2: 0xb070ff, trailLife: 0.3 },
            trail: (x, y, z) => vfx.burst(x, y, z, 2, { tex: 'wisp', color: 0x70ff90, color2: 0x104020, speed: 0.6, size: 0.45, life: 0.5, up: -0.4, spin: 5 }),
            impact: (x, y, z) => { hexPuff(x, y, z, 12, 0x70ff90, 0xb070ff); vfx.sigil(x, y, z + 0.6, 0x70ff90, 1.3, 1.4); const g = nearGround(x, y, z); if (g != null) vfx.decal('rune', x, y, g, 1.4, 1.6, 0x50ff70, 0.8, 1.5); } },
  };

  // ---------- projectiles ----------
  const projs = [], projPool = [];
  function fireBolt(sp, dirx, diry, dirz) {
    const b = projPool.pop() || { hits: new Set() };
    Object.assign(b, { sp, x: A.x, y: A.y, z: A.z, dx: dirx, dy: diry, dz: dirz, trav: 0, vz: 0, pierce: sp.pierce || 0 });
    b.hits.clear();
    const ms = LOOK[sp.look]?.missile;
    b.orb = ms ? vfx.missile(b.x, b.y, b.z, sp.color, ms) : vfx.orb(b.x, b.y, b.z, sp.color, (sp.size || 0.6) * 0.6);
    projs.push(b);
  }
  function explode(b) {
    const sp = b.sp, look = LOOK[sp.look];
    look?.impact(b.x, b.y, b.z, sp);
    if (sp.splash > 0) aoe(b.x, b.y, b.z, sp.splash, sp, 1, sp.splash);
  }
  function stepProjs(dt) {
    for (let i = projs.length - 1; i >= 0; i--) {
      const b = projs[i], sp = b.sp; let done = false;
      const n = Math.max(1, Math.ceil(sp.speed * dt / 1.2)), h = sp.speed * dt / n;
      for (let s = 0; s < n && !done; s++) {
        if (sp.grav) b.vz -= sp.grav * dt / n;
        b.x += b.dx * h; b.y += b.dy * h; b.z += b.dz * h + b.vz * dt / n; b.trav += h;
        for (const m of game.mobs) {
          if (m.dead || b.hits.has(m)) continue;
          const r = (m.radius || 0.5) + 0.35, cz = m.z + mobH(m) * 0.5;
          const dx = m.x - b.x, dy = m.y - b.y, dz = cz - b.z;
          if (dx * dx + dy * dy < r * r && Math.abs(dz) < mobH(m) * 0.5 + 0.35) {
            b.hits.add(m);
            if (!(sp.splash > 0)) hit(m, sp, 1, b.x, b.y);
            if (b.pierce-- <= 0) { done = true; break; } else LOOK[sp.look]?.impact(b.x, b.y, b.z, sp);
          }
        }
        if (!done) {
          const g = game.groundAt(b.x, b.y, b.z);
          if (b.trav >= sp.range || (g != null && b.z <= g) || world.blocked(b.x, b.y, b.z - 0.2, 0.1, 0, 0.4)) done = true;
        }
      }
      if (done) { explode(b); vfx.release(b.orb); projs[i] = projs[projs.length - 1]; projs.pop(); projPool.push(b); continue; }
      b.orb?.position.set(b.x, b.z, -b.y);
      LOOK[sp.look]?.trail(b.x, b.y, b.z, b);
    }
  }

  // ---------- zones, summons, delayed events ----------
  const zones = [], wisps = [], later = [], meteors = [];
  const after = (s, fn) => later.push({ at: game.time + s, fn });
  function zoneTick(z) {
    const sp = z.sp;
    if (sp.follow) { z.x = p.x; z.y = p.y; z.z = p.z; }
    if (sp.tick === 'field') {
      aoe(z.x, z.y, z.z + 1, sp.radius, sp, 1);
      const a = Math.random() * 6.283, r = Math.random() * sp.radius;
      if (sp.type === 'storm') {
        for (let k = 0; k < 2; k++) { const a2 = a + k * 3.1, x = z.x + Math.cos(a2) * r, y = z.y + Math.sin(a2) * r, x2 = z.x + Math.cos(a2 + 0.8) * sp.radius * Math.random(), y2 = z.y + Math.sin(a2 + 0.8) * sp.radius * Math.random();
          vfx.lightning(x, y, z.z + 0.15, x2, y2, z.z + 0.15 + Math.random() * 1.2, 0x7ab8ff, 0.16, 0.5, { width: 0.6, branches: 1 }); }
        vfx.burst(z.x, z.y, z.z + 0.2, 8, { tex: 'spark', color: 0xffffff, color2: 0x4080ff, speed: 3, size: 0.14, life: 0.4, up: 2, ring: sp.radius * Math.random() });
      } else {
        vfx.burst(z.x, z.y, z.z + 0.3, 14, { tex: 'wisp', color: 0xb060ff, color2: 0x300a60, speed: 0.8, size: 0.9, life: 1.3, up: 2.2, drag: 0.8, spin: 3, jitter: sp.radius * 1.4, jz: 0.3 });
        vfx.burst(z.x, z.y, z.z + 0.3, 8, { tex: 'ember', color: 0x70ff90, speed: 0.6, size: 0.16, life: 1.2, up: 2.8, drag: 0.6, jitter: sp.radius * 1.5, jz: 0.3 });
        vfx.burst(z.x, z.y, z.z + 0.2, 4, { tex: 'smoke', color: 0x2a1040, color2: 0x0c0614, grow: 1.6, speed: 0.4, size: 1.8, life: 1.6, up: 0.6, alpha: 0.4, jitter: sp.radius * 1.2, jz: 0.1 });
        for (const m of game.mobsNear(z.x, z.y, sp.radius)) if (Math.random() < 0.35) vfx.sigil(m.x, m.y, m.z + mobH(m) + 0.5, 0xc080ff, 0.8, 0.8);
      }
    } else if (sp.tick === 'meteor') {
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * sp.radius, x = z.x + Math.cos(a) * r, y = z.y + Math.sin(a) * r, gz = groundZ(x, y, z.z + 5);
      const met = vfx.missile(x + 3, y + 3, gz + 25, 0xff8020, { coreColor: 0xfff0c0, envelope: 0xff4a10, stretch: 3, radius: 0.35, halo: 1.6, width: 1.1, width2: 0.4, trailColor2: 0xffe080, trailLife: 0.35, trailLife2: 0.5 });
      meteors.push({ h: met, x0: x + 3, y0: y + 3, z0: gz + 25, x, y, z: gz, t0: game.time });
      vfx.decal('rune', x, y, gz, sp.splash * 0.8, 0.3, 0xff6010, 0.8);
      after(0.15, () => { vfx.release(met); fireBlast(x, y, gz + 0.3, sp.splash, 1); vfx.flameColumn(x, y, gz, 4.5, 0.55, 0.32); vfx.debris(x, y, gz + 0.2, 5, { color: 0x3a2a20, speed: 5, size: 0.12, up: 6, floor: gz }); aoe(x, y, gz + 1, sp.splash, sp); sfx.play('boom', 0.6); });
    } else if (sp.tick === 'strike') {
      let m = null, bd = 1e9;
      for (const c of game.mobsNear(z.x, z.y, sp.radius)) { const d = (c._struck || 0) + Math.random(); if (d < bd) { bd = d; m = c; } }
      let x, y, gz;
      if (m) { x = m.x; y = m.y; gz = m.z; m._struck = (m._struck || 0) + 1; }
      else { const a = Math.random() * 6.283, r = Math.random() * sp.radius; x = z.x + Math.cos(a) * r; y = z.y + Math.sin(a) * r; gz = groundZ(x, y, z.z + 5); }
      vfx.lightning(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6, gz + 24, x, y, gz, 0xbfdcff, 0.25, 2.4, { width: 1.8, branches: 3 });
      vfx.burst(x, y, gz + 0.2, 26, { tex: 'spark', color: 0xffffff, color2: 0x5090ff, speed: 9, size: 0.2, life: 0.45, grav: 10, drag: 2, up: 3 });
      vfx.burst(x, y, gz + 0.2, 6, { tex: 'dust', color: 0x9aa4b0, color2: 0x5a6068, speed: 2.5, size: 1.2, life: 1, grow: 2, alpha: 0.5, up: 0.6 });
      vfx.core(x, y, gz + 0.4, 0x9ac8ff, 0.5, 0.18);
      vfx.ring(x, y, gz, 0xa8d0ff, 0.3, 3.2, 0.35); vfx.decal('frost', x, y, gz, 1.6, 2.5, 0x6aa0ff, 0.7);
      vfx.light(x, y, gz + 2, 0x9ac8ff, 1.6, 0.25, 22);
      sfx.play('thunder', 0.6);
      if (m) hit(m, sp); else aoe(x, y, gz + 1, 1.5, sp);
    } else if (sp.tick === 'spikes') {
      for (let k = 0; k < 16; k++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * sp.radius, x = z.x + Math.cos(a) * r, y = z.y + Math.sin(a) * r; vfx.spike(x, y, groundZ(x, y, z.z), 1 + Math.random() * 1.4, 1.6); }
      vfx.decal('crack', z.x, z.y, z.z, sp.radius * 1.2, 4, 0xffffff, 0.85);
      vfx.debris(z.x, z.y, z.z + 0.3, 10, { color: 0x8a7458, speed: 4, size: 0.16, up: 6, jitter: sp.radius, floor: z.z });
      vfx.burst(z.x, z.y, z.z + 0.3, 14, { ...DUST, speed: 2, size: 1.4, life: 1.2, up: 1, jitter: sp.radius * 1.4, jz: 0.2 });
      aoe(z.x, z.y, z.z + 1, sp.radius, sp);
    }
  }
  function stepWorld(dt) {
    const t = game.time;
    for (let i = meteors.length - 1; i >= 0; i--) {   // Sunfall meteors: fall 25 m in 0.15 s (damage timing is unchanged)
      const m = meteors[i], k = Math.min(1, (t - m.t0) / 0.15);
      vfx.moveMissile(m.h, m.x0 + (m.x - m.x0) * k, m.y0 + (m.y - m.y0) * k, m.z0 + (m.z - m.z0) * k);
      vfx.burst(m.h.x, m.h.y, m.h.z, 2, MET_FIRE);
      if (k >= 1) { meteors[i] = meteors[meteors.length - 1]; meteors.pop(); }
    }
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (t >= z.next) { z.next += z.sp.interval; zoneTick(z); }
      if (t >= z.until) { zones[i] = zones[zones.length - 1]; zones.pop(); }
    }
    for (let i = wisps.length - 1; i >= 0; i--) {
      const w = wisps[i]; w.a += dt * 2.2;
      const x = p.x + Math.cos(w.a) * 1.4, y = p.y + Math.sin(w.a) * 1.4, z = p.z + 2 + Math.sin(w.a * 2) * 0.3;
      w.orb.position.set(x, z, -y);
      if (Math.random() < 0.4) vfx.burst(x, y, z, 1, { tex: 'wisp', color: 0xa0ffd0, color2: 0x6020c0, speed: 0.3, size: 0.4, life: 0.6, spin: 4 });
      if (t >= w.next) {
        w.next = t + w.sp.interval;
        const m = game.nearestMob(x, y, w.sp.range);
        if (m) { vfx.tether(x, y, z, m.x, m.y, m.z + mobH(m) * 0.5, 0x90ffc8, 0.3, { width: 0.12 }); hexPuff(m.x, m.y, m.z + mobH(m) * 0.5, 5, 0xa0ffd0, 0xb070ff); hit(m, w.sp); sfx.play('dart', 0.5); }
      }
      if (t >= w.until) { vfx.release(w.orb); hexPuff(x, y, z, 8, 0xa0ffd0, 0xb070ff); wisps[i] = wisps[wisps.length - 1]; wisps.pop(); }
    }
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      if (d.m.dead || t > d.until) { dots[i] = dots[dots.length - 1]; dots.pop(); continue; }
      if (t >= d.next) {
        d.next += 0.5;
        const dealt = game.damageMob(d.m, d.dps * 0.5 * (d.m.boss ? CLASSES[caster.cls]?.bossMult ?? 1 : 1), { type: d.type, spell: d.sp, source: 'player', crit: false, noProc: true });
        if (d.drain && dealt) game.heal(dealt * d.drain);
        const dz = d.m.z + mobH(d.m) * 0.6;
        if (d.type === 'fire') { vfx.burst(d.m.x, d.m.y, dz, 4, { ...FIRE, speed: 0.6, size: 0.6, life: 0.45, up: 2, jitter: 0.6 }); vfx.burst(d.m.x, d.m.y, dz + 0.4, 1, { ...SMOKE, speed: 0.3, size: 0.8, life: 1, up: 1.2, alpha: 0.35 }); }
        else vfx.burst(d.m.x, d.m.y, dz, 4, { tex: 'wisp', color: 0x60ff80, color2: 0x204010, speed: 0.6, size: 0.5, life: 0.6, up: 1.5, jitter: 0.6, spin: 4 });
      }
    }
    for (const m of cursed) if (m.dead || t > m._curseUntil) { m.damageTaken = 1; cursed.delete(m); }
    for (let i = later.length - 1; i >= 0; i--) if (t >= later[i].at) { const e = later[i]; later[i] = later[later.length - 1]; later.pop(); e.fn(); }
    if (game.shield > 0 && t > (game.shieldUntil || 0)) game.shield = 0;
  }

  // ---------- spell kinds ----------
  function blinkTo(dist, flying) {
    const x0 = p.x, y0 = p.y; let x = p.x, y = p.y, z = p.z, moved = 0;
    for (let d = 0.5; d <= dist + 1e-6; d += 0.5) {
      const nx = x0 + A.hx * d, ny = y0 + A.hy * d;
      if (flying) { if (world.blocked(nx, ny, z)) break; x = nx; y = ny; moved = d; continue; }
      const g = world.standAt(nx, ny, z);
      // session 48: at most a walkable step per 0.5 m (was 1.2 m, which let blinks climb kerb-walls and plinths)
      if (g == null || Math.abs(g - z) > 0.6) break;
      x = nx; y = ny; z = g; moved = d;
    }
    p.x = x; p.y = y; if (!flying) p.z = z;
    return moved;
  }
  // session 48: is (x, y, z) on a roof or wall top (solid geometry, not walkable ground)? Movement spells must
  // never leave the player there (a warden Boulder Leap hop of ~2.5 m landed on a wall top and softlocked the route bot).
  const onRoof = (x, y, z) => { const g = world.support(x, y, z + 0.3, false); return !g || g.kind !== 1 || g.z < z - 0.5; };
  // Nearest walkable ground at about the level the spell started from: back along the path first, then rings.
  function settleOnGround(x0, y0, z0) {
    if (p.flying || !onRoof(p.x, p.y, p.z)) return false;
    const tryAt = (x, y) => {
      const g = world.support(x, y, z0 + 1.5, false);
      if (!g || g.kind !== 1 || Math.abs(g.z - z0) > 1.5) return null;
      const z = world.standAt(x, y, g.z); return z == null ? null : z;
    };
    const lx = p.x, ly = p.y, L = Math.hypot(lx - x0, ly - y0);
    let best = null;
    for (let d = 0; d <= L && !best; d += 0.5) { const f = L ? d / L : 0, x = lx + (x0 - lx) * f, y = ly + (y0 - ly) * f, z = tryAt(x, y); if (z != null) best = [x, y, z]; }
    for (let r = 0.5; r <= 6 && !best; r += 0.5) for (let k = 0, n = Math.ceil(r * 8); k < n && !best; k++) {
      const a = k / n * 6.283, x = lx + Math.cos(a) * r, y = ly + Math.sin(a) * r, z = tryAt(x, y); if (z != null) best = [x, y, z];
    }
    if (!best) best = [x0, y0, z0];
    [p.x, p.y, p.z] = best; p.vx = p.vy = p.vz = 0; p.grounded = true; if (p.climb) p.climb = null;
    return true;
  }
  const KIND = {
    bolt(sp) {
      const n = sp.count || 1;
      for (let k = 0; k < n; k++) {
        const a = (k - (n - 1) / 2) * 0.12, c = Math.cos(a), s = Math.sin(a);
        fireBolt(sp, A.dx * c - A.dy * s, A.dx * s + A.dy * c, A.dz);
      }
      vfx.burst(A.x + A.dx * 0.6, A.y + A.dy * 0.6, A.z + A.dz * 0.6, 8, { tex: sp.type === 'fire' ? 'flame' : sp.type === 'hex' ? 'wisp' : sp.type === 'stone' ? 'shard' : 'spark', color: sp.color, speed: 3, size: 0.22, life: 0.25, dx: A.dx, dy: A.dy, dz: A.dz });
    },
    beam(sp, target) {
      const end = rayPoint(sp.range);
      let first = null, bt = end.d;
      for (const m of game.mobs) {
        if (m.dead) continue;
        const cx = m.x - A.x, cy = m.y - A.y, cz = m.z + mobH(m) * 0.5 - A.z, t = cx * A.dx + cy * A.dy + cz * A.dz;
        if (t < 0 || t > bt + 0.5) continue;
        const ex = cx - A.dx * t, ey = cy - A.dy * t, ez = cz - A.dz * t, r = (m.radius || 0.5) + 0.6;
        if (ex * ex + ey * ey < r * r && Math.abs(ez) < mobH(m) * 0.5 + 0.6) { first = m; bt = t; }
      }
      if (target && !target.dead && !first) first = target;
      const ex = first ? first.x : end.x, ey = first ? first.y : end.y, ez = first ? first.z + mobH(first) * 0.5 : end.z;
      const siphon = sp.look === 'siphon';
      if (siphon) {
        const tgt = first, ox = A.x, oy = A.y, oz = A.z - 0.3;
        vfx.tether(ex, ey, ez, ox, oy, oz, sp.color, 0.7, { width: 0.22, from: tgt ? () => [tgt.x, tgt.y, tgt.z + mobH(tgt) * 0.5] : null, to: () => [p.x + A.hx * 0.6, p.y + A.hy * 0.6, p.eye - 0.45] });
        hexPuff(ex, ey, ez, 16, 0xe070ff, 0x70ff90); vfx.sigil(ex, ey, ez + 1.2, 0xd050ff, 1.1, 0.9);
        vfx.burst(p.x, p.y, p.z + 0.2, 10, { tex: 'wisp', color: 0x90ffb0, color2: 0xd050ff, speed: 0.5, size: 0.5, life: 0.9, up: 1.6, ring: 0.9, spin: 3 });
      } else {
        const arc = sp.look === 'arc';
        // session 51: jagged forked main bolt plus a thinner off-colour twin, a hand flash and an arc flash at the
        // end (white core, ring, sparks, light), and a small scorch where it strikes the ground
        vfx.lightning(A.x, A.y, A.z - 0.1, ex, ey, ez, sp.color, arc ? 0.3 : 0.2, arc ? 1.1 : 0.8, { width: arc ? 1.6 : 1.25, branches: arc ? -1 : 3 });
        vfx.lightning(A.x, A.y, A.z - 0.1, ex, ey, ez, 0x6a8cff, 0.14, arc ? 1.4 : 1.1, { width: 0.45, branches: 1 });
        vfx.core(A.x, A.y, A.z - 0.1, 0xd8f0ff, 0.12, 0.08);
        vfx.core(ex, ey, ez, 0xe8f6ff, arc ? 0.5 : 0.36, 0.12);
        vfx.ring(ex, ey, ez - 0.2, 0xbfe6ff, 0.15, arc ? 1.6 : 1.1, 0.22, 0.8);
        vfx.burst(ex, ey, ez, arc ? 18 : 12, { tex: 'spark', color: 0xffffff, color2: sp.color, speed: 8, size: 0.16, life: 0.35, grav: 8, drag: 2 });
        vfx.burst(ex, ey, ez, 3, { tex: 'glow', color: 0xbfe6ff, color2: 0x4060ff, speed: 0.5, size: arc ? 1.6 : 1.1, life: 0.12, drag: 0, jitter: 0 });
        vfx.light(ex, ey, ez, 0x9ac8ff, arc ? 1 : 0.6, 0.15);
        if (!first) { const g = nearGround(ex, ey, ez); if (g != null) vfx.decal('scorch', ex, ey, g, 0.7, 2, 0xffffff, 0.6); }
      }
      if (!first) return;
      hit(first, sp);
      // chain to nearby foes
      let from = first, mult = 1; const done = new Set([first]);
      for (let c = 0; c < (sp.chain || 0); c++) {
        let nx = null, nd = sp.chainRange || 6;
        for (const m of game.mobs) { if (m.dead || done.has(m)) continue; const d = Math.hypot(m.x - from.x, m.y - from.y); if (d < nd) { nd = d; nx = m; } }
        if (!nx) break;
        mult *= 0.8; done.add(nx);
        vfx.lightning(from.x, from.y, from.z + mobH(from) * 0.5, nx.x, nx.y, nx.z + mobH(nx) * 0.5, sp.color, 0.24, 0.8, { width: 1, branches: 1 });
        hit(nx, sp, mult); from = nx;
      }
    },
    cone(sp) {
      const cosA = Math.cos(sp.angle);
      for (const m of game.mobsNear(p.x, p.y, sp.range)) {
        const dx = m.x - p.x, dy = m.y - p.y, l = Math.hypot(dx, dy) || 1;
        if ((dx * A.hx + dy * A.hy) / l >= cosA && Math.abs(m.z - p.z) < 4) hit(m, sp, 1, p.x, p.y);
      }
      if (sp.look === 'spray') {
        // session 70: fewer, hotter tongues (90 made a flat yellow wash over the camera), a white-hot muzzle, a hot inner
        // jet, spark streaks, red-brown smoke at the far end, and a scorched, glowing ember strip along the ground
        const sx = A.x + A.hx * 1.6, sy = A.y + A.hy * 1.6, sz = A.z - 0.4;
        vfx.core(sx, sy, sz, 0xff9a30, 0.22, 0.14);
        vfx.burst(sx, sy, sz, 46, { ...FIRE, color2: 0xb81800, speed: sp.range * 1.5, size: 0.95, life: 0.55, dx: A.hx, dy: A.hy, dz: A.dz * 0.4, cone: 0.45, drag: 2.4, up: 1.2, jitter: 0.2 });
        vfx.burst(sx, sy, sz, 14, { tex: 'flame', color: 0xffffff, color2: 0xffa030, speed: sp.range * 1.2, size: 0.55, life: 0.3, dx: A.hx, dy: A.hy, dz: A.dz * 0.3, cone: 0.15, drag: 2, jitter: 0.1 });
        vfx.burst(sx, sy, sz, 22, { tex: 'ember', color: 0xffe8a0, color2: 0xff2400, speed: sp.range * 1.4, size: 0.13, life: 0.9, dx: A.hx, dy: A.hy, dz: 0.15, cone: 0.6, drag: 1.5, grav: 4 });
        vfx.emberStreaks(sx, sy, sz, 3, 0xffa040, sp.range * 1.3, A.hx * 2, A.hy * 2);
        after(0.2, () => vfx.burst(p.x + A.hx * sp.range * 0.7, p.y + A.hy * sp.range * 0.7, p.z + 1, 6, { ...SMOKE, color: 0x5a2c16, speed: 1, size: 1.6, life: 1.8, up: 1.2, jitter: sp.range * 0.35, alpha: 0.4, fadeIn: 0.3 }));
        for (let k = 1; k <= 2; k++) { const x = p.x + A.hx * sp.range * k * 0.33, y = p.y + A.hy * sp.range * k * 0.33, g = groundZ(x, y, p.z);
          vfx.decal('scorch', x, y, g, 1 + k * 0.6, 3, 0xffffff, 0.7); vfx.decal('embers', x, y, g + 0.01, 0.8 + k * 0.5, 1.1, 0xff5a10, 0.8); }
      } else {
        for (let k = 0; k < 12; k++) { const a = (Math.random() - 0.5) * sp.angle * 1.8, c = Math.cos(a), s = Math.sin(a);
          vfx.streak(p.x + A.hx * 1.2 + (Math.random() - 0.5), p.y + A.hy * 1.2 + (Math.random() - 0.5), p.z + 0.4 + Math.random() * 1.6, A.hx * c - A.hy * s, A.hx * s + A.hy * c, 0.05, sp.range * 2.2, 0xe0fff8, 0.45, 0.16, 3); }
        vfx.burst(p.x + A.hx * 2, p.y + A.hy * 2, p.z + 0.3, 16, { tex: 'dust', color: 0xc8d0c8, color2: 0x8a9090, speed: sp.range * 0.9, size: 1, life: 0.9, dx: A.hx, dy: A.hy, dz: 0.05, cone: 0.6, grow: 1.8, alpha: 0.4 });
        vfx.burst(p.x + A.hx * 2, p.y + A.hy * 2, p.z + 1, 20, { tex: 'spark', color: 0xffffff, color2: 0x80e0ff, speed: sp.range * 1.4, size: 0.12, life: 0.4, dx: A.hx, dy: A.hy, dz: 0.05, cone: 0.7, drag: 2 });
        vfx.ring(p.x + A.hx * 3, p.y + A.hy * 3, p.z, 0xd8fff4, 0.5, 4, 0.4, 0.6);
      }
    },
    nova(sp) {
      const gz = p.z;
      aoe(p.x, p.y, gz + 1, sp.radius, sp, 1);
      if (sp.look === 'kindle') {
        // session 70: a readable ring of fire: a white-hot flash at the caster, a low expanding flame skirt, then a wall of
        // tongues standing up at the ring's edge, spark streaks, red-brown smoke ring, scorch + glowing ember bed
        const cx = p.x, cy = p.y;
        vfx.core(cx, cy, gz + 1, 0xff9a30, 0.5, 0.16);
        vfx.ring(cx, cy, gz, 0xff6a00, 0.5, sp.radius * 1.1, 0.5); vfx.ring(cx, cy, gz + 0.3, 0xffc040, 0.3, sp.radius * 0.8, 0.6, 0.7);
        vfx.burst(cx, cy, gz + 0.4, 50, { ...FIRE, color2: 0xb81800, speed: 1, radial: sp.radius * 2.6, size: 1.05, life: 0.5, ring: 1.2, drag: 3, up: 1.4 });
        vfx.burst(cx, cy, gz + 0.5, 28, { tex: 'ember', color: 0xffe8a0, color2: 0xff2400, speed: 2, radial: sp.radius * 2.4, size: 0.14, life: 1.1, ring: 1, grav: 5, up: 3 });
        after(0.12, () => vfx.flameWall(cx, cy, gz, sp.radius * 0.95, 34));
        vfx.emberStreaks(cx, cy, gz + 0.6, 5, 0xffa040, sp.radius * 1.6);
        after(0.25, () => vfx.burst(cx, cy, gz + 0.5, 10, { ...SMOKE, color: 0x5a2c16, speed: 1, size: 1.8, life: 1.8, ring: sp.radius * 0.9, up: 1.2, alpha: 0.38, fadeIn: 0.3 }));
        vfx.decal('scorch', cx, cy, gz, sp.radius * 1.05, 5, 0xffffff, 0.8); vfx.decal('embers', cx, cy, gz + 0.01, sp.radius * 0.95, 1.4, 0xff5a10, 0.75);
        vfx.light(cx, cy, gz + 1.5, 0xff7020, 1.2, 0.5);
      } else {
        vfx.ring(p.x, p.y, gz, 0xd8b070, 0.5, sp.radius * 1.15, 0.6); vfx.ring(p.x, p.y, gz, 0xffd890, 0.3, sp.radius * 0.7, 0.45, 0.6);
        vfx.decal('crack', p.x, p.y, gz, sp.radius * 1.1, 5, 0xffffff, 0.9); vfx.decal('rune', p.x, p.y, gz, sp.radius * 0.6, 0.9, 0xffb040, 0.8, 2);
        // session 52: three rings of stone shards erupt outward in sequence, each with a dust shockwave band
        vfx.shardWave(p.x, p.y, gz, sp.radius, after, { rings: 3, per: 8, h: 1.5 });
        vfx.burst(p.x, p.y, gz + 0.5, 18, { tex: 'shard', color: 0xffd890, color2: 0x8a7458, speed: 5, size: 0.3, life: 0.9, up: 7, grav: 15, spin: 7, jitter: 1.2 });
        vfx.light(p.x, p.y, gz + 1, 0xffb050, 1.2, 0.4, 18);
        vfx.debris(p.x, p.y, gz + 0.3, 14, { color: 0x8a7458, speed: sp.radius * 1.2, size: 0.18, up: 7, jitter: 2, floor: gz });
        vfx.burst(p.x, p.y, gz + 0.3, 30, { ...DUST, speed: 1, radial: sp.radius * 1.6, size: 1.6, life: 1.3, ring: 1.5, up: 0.6 });
      }
    },
    zone(sp, target) {
      let x, y, z;
      if (sp.follow) { x = p.x; y = p.y; z = p.z; }
      else if (target && !target.dead) { x = target.x; y = target.y; z = target.z; }
      else { const e = rayPoint(sp.range); x = e.x; y = e.y; z = groundZ(e.x, e.y, e.z); }
      zones.push({ sp, x, y, z, next: game.time + (sp.tick === 'meteor' ? 0.4 : 0), until: game.time + sp.dur + (sp.tick === 'meteor' ? 0.4 : 0) });
      const dur = Math.max(0.6, sp.dur + 0.4);
      if (sp.look === 'sunfall') {
        vfx.decal('rune', x, y, z, sp.radius * 1.1, dur, 0xff7020, 0.9, 0.5); vfx.decal('scorch', x, y, z, sp.radius * 1.2, dur + 4, 0xffffff, 0.6);
        vfx.ring(x, y, z, 0xffc040, 0.5, sp.radius * 1.1, 0.8); vfx.orb(x, y, z + 22, 0xffd080, 6, dur);
        // session 70: a dark, fire-lit cloud overhead (was 30 size-3 flame sprites: a screen-filling yellow wash) and a
        // glowing ember bed over the target circle
        vfx.burst(x, y, z + 17, 12, { ...SMOKE, color: 0x6a3018, color2: 0x1a1210, speed: 1, size: 5, life: dur + 1, grow: 0.6, drag: 0.6, alpha: 0.55, jitter: sp.radius * 1.4, jz: 1.5, fadeIn: 0.2 });
        vfx.burst(x, y, z + 16.5, 8, { ...FIRE, color2: 0xa01800, speed: 0.5, size: 2.2, life: 0.9, jitter: sp.radius * 1.2, jz: 1, drag: 1, alpha: 0.7 });
        vfx.decal('embers', x, y, z + 0.01, sp.radius * 0.9, dur, 0xff4a10, 0.5);
      } else if (sp.look === 'static') {
        vfx.decal('frost', x, y, z, sp.radius * 1.05, dur, 0x5a90ff, 0.75); vfx.decal('rune', x, y, z, sp.radius, dur, 0x3a70ff, 0.6, -0.6);
        vfx.ring(x, y, z, 0x88ccff, sp.radius * 0.2, sp.radius, 0.5);
      } else if (sp.look === 'tempest') {
        vfx.ring(p.x, p.y, p.z, 0xe0f0ff, 1, sp.radius, 0.8); vfx.ring(p.x, p.y, p.z, 0x80b0ff, 0.5, sp.radius * 0.6, 0.6, 0.6);
        vfx.burst(p.x, p.y, p.z + 15, 40, { tex: 'smoke', color: 0x3a4250, color2: 0x1a1e26, speed: 1.5, size: 7, life: sp.dur + 1, grow: 0.8, drag: 0.5, alpha: 0.55, jitter: sp.radius * 1.6, jz: 2, fadeIn: 0.15 });
        for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283; vfx.streak(p.x + Math.cos(a) * 3, p.y + Math.sin(a) * 3, p.z + 0.5 + Math.random() * 3, -Math.sin(a), Math.cos(a), 0.15, 14, 0xd8f0ff, 0.9, 0.14, 2.5); }
        vfx.decal('frost', p.x, p.y, p.z, sp.radius * 0.7, 2, 0x80b0ff, 0.5);
      } else if (sp.look === 'spikes') { vfx.ring(x, y, z, 0x9a8a60, 0.5, sp.radius, 0.4); vfx.decal('rune', x, y, z, sp.radius, 0.6, 0xd0a050, 0.8, 2);
        vfx.decal('crack', x, y, z, sp.radius * 1.1, 4, 0xffffff, 0.85); vfx.shardWave(x, y, z, sp.radius * 0.9, after, { rings: 2, per: 6, h: 0.9 }); }
      else if (sp.look === 'bloom') {
        vfx.decal('rune', x, y, z, sp.radius * 1.05, dur, 0xa040ff, 0.9, 0.5); vfx.decal('rune', x, y, z, sp.radius * 0.6, dur, 0x50ff80, 0.8, -0.9);
        vfx.ring(x, y, z, 0xc080ff, 0.5, sp.radius * 1.2, 0.9); vfx.ring(x, y, z, 0x60ff90, 0.5, sp.radius * 0.7, 1.2);
        for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; vfx.burst(x + Math.cos(a) * sp.radius * 0.8, y + Math.sin(a) * sp.radius * 0.8, z + 0.2, 6, { tex: 'wisp', color: 0xd090ff, color2: 0x50ff80, speed: 0.6, size: 1.2, life: 1.6, up: 3.5, drag: 0.8, spin: 3, jitter: 0.6 }); }
        vfx.light(x, y, z + 1.5, 0xa040ff, 1.4, 0.8, 20);
      }
    },
    blink(sp) {
      const fly = p.flying, x0 = p.x, y0 = p.y, z0 = p.z, fromRoof = !fly && onRoof(x0, y0, z0);
      const dist = sp.dist * (fly && sp.broomMult ? sp.broomMult : 1);
      if (sp.wake) { vfx.ring(x0, y0, z0, 0x8040c0, 0.5, sp.radius, 0.5); aoe(x0, y0, z0 + 1, sp.radius, sp); }
      const moved = blinkTo(dist, fly);
      if (sp.invuln) game.invulnUntil = Math.max(game.invulnUntil || 0, game.time + sp.invuln);
      if (sp.hop && !fly) { p.vz = sp.hop; p.grounded = false; }
      if (!fly && !fromRoof) {   // session 48: never end a movement spell on a roof / wall top
        settleOnGround(x0, y0, z0);
        // session 57: the hop's airtime carried a running player over railings and churchyard walls (a warden leapt into
        // an enclosure at -131,-29 off Bene't Street and could never walk out again: 3 of 5 route-bot runs). The landing
        // must be walkable-reachable from where the leap put the player; otherwise it is pulled back to that spot.
        if (sp.hop) {
          const bx = p.x, by = p.y, bz = p.z, t1 = game.time;
          const reach = () => {
            const L = Math.hypot(p.x - bx, p.y - by); let z = bz;
            for (let d = 0.4; d < L + 0.2; d += 0.4) {
              const f = Math.min(1, d / L), g = world.standAt(bx + (p.x - bx) * f, by + (p.y - by) * f, z);
              if (g == null || Math.abs(g - z) > 0.6) return false; z = g;
            }
            return true;
          };
          const chk = () => {
            if (p.grounded && p.vz <= 0) {
              if (!reach()) { p.x = bx; p.y = by; p.z = world.standAt(bx, by, bz) ?? bz; p.vx = p.vy = p.vz = 0; }
              settleOnGround(x0, y0, z0);
            } else if (game.time - t1 < 3) after(0.05, chk);
          };
          after(0.1, chk);
        }
      }
      if (fly && sp.broomMult) game.stats.mana = Math.min(game.stats.maxMana, game.stats.mana + sp.mana * 0.5);   // broom synergy: half refund
      // trail along the path
      const steps = Math.max(2, Math.round(moved));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, x = x0 + (p.x - x0) * t, y = y0 + (p.y - y0) * t, z = z0 + (p.z - z0) * t + 1;
        if (sp.look === 'flamestep') { vfx.burst(x, y, z - 0.6, 4, { ...FIRE, color2: 0xb81800, speed: 0.6, size: 0.9, life: 0.6, up: 2.2, jitter: 0.5 }); if (k % 2) vfx.decal('embers', x, y, z - 1, 0.9, 1.2, 0xff5a10, 0.7); }
        else if (sp.look === 'shade') { vfx.burst(x, y, z, 2, { tex: 'smoke', color: 0x24102e, color2: 0x0a0410, grow: 1.6, speed: 0.4, size: 1.3, life: 1.1, alpha: 0.55, jitter: 0.6 }); vfx.burst(x, y, z, 2, { tex: 'wisp', color: 0xb070ff, color2: 0x50ff80, speed: 0.6, size: 0.5, life: 0.7, spin: 4, jitter: 0.6 }); }
        else if (sp.look === 'winddash') vfx.burst(x, y, z, 2, { tex: 'spark', color: 0xffffff, color2: 0x80d0ff, speed: 1.5, size: 0.12, life: 0.4, jitter: 0.8 });
        else vfx.burst(x, y, z - 0.7, 2, { ...DUST, speed: 0.8, size: 1, life: 0.9, jitter: 0.6 });
      }
      if (sp.look === 'winddash') for (let k = 0; k < 8; k++) vfx.streak(x0 + (Math.random() - 0.5) * 1.5, y0 + (Math.random() - 0.5) * 1.5, z0 + 0.3 + Math.random() * 1.6, A.hx, A.hy, 0, Math.max(6, moved * 3), 0xd8f4ff, 0.35, 0.14, 1);
      if (sp.look === 'shade') vfx.decal('rune', x0, y0, z0, 1.4, 1.2, 0x9040ff, 0.85, 3);
      if (sp.look === 'flamestep') { vfx.fireball(x0, y0, z0 + 0.4, sp.radius * 0.6, 0, z0); vfx.flameColumn(x0, y0, z0, 2.6, 0.5, 0.3); aoe(x0, y0, z0 + 1, sp.radius, sp);
        after(0.05, () => { vfx.fireball(p.x, p.y, p.z + 0.4, sp.radius * 0.65, 0, p.z); vfx.flameWall(p.x, p.y, p.z, sp.radius * 0.6, 18); aoe(p.x, p.y, p.z + 1, sp.radius, sp); }); }
      if (sp.landing) {
        const land = () => {
          vfx.ring(p.x, p.y, p.z, 0xd8b070, 0.4, sp.radius * 1.2, 0.5); vfx.decal('crack', p.x, p.y, p.z, sp.radius * 1.1, 4, 0xffffff, 0.9);
          vfx.shardWave(p.x, p.y, p.z, sp.radius, after, { rings: 2, per: 8, h: 1.3 });   // session 52
          vfx.impact(p.x, p.y, p.z + 0.4, 0xffc870, 2); vfx.light(p.x, p.y, p.z + 1, 0xffb050, 1, 0.35);
          vfx.debris(p.x, p.y, p.z + 0.3, 12, { color: 0x8a7458, speed: sp.radius * 1.6, size: 0.16, up: 6, jitter: 1.5, floor: p.z });
          vfx.burst(p.x, p.y, p.z + 0.3, 26, { ...DUST, speed: 1, radial: sp.radius * 1.8, size: 1.5, life: 1.2, ring: 1.2, up: 0.5 });
          aoe(p.x, p.y, p.z + 1, sp.radius, sp); sfx.play('quake', 0.7);
        };
        const t0 = game.time, wait = () => (p.grounded && game.time - t0 > 0.15) || game.time - t0 > 2 ? land() : after(0.05, wait);
        after(0.15, wait);
      }
    },
    shield(sp) {
      game.shield = Math.max(game.shield || 0, sp.amount); game.shieldUntil = game.time + sp.dur;
      vfx.dome(sp.color, sp.ult ? 1.8 : 1.4, () => game.shield > 0);
      // session 52: a collar of stone shards bursts up around the caster as the rune shell closes, plus a dust skirt
      for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283 + Math.random() * 0.3; vfx.spike(p.x + Math.cos(a) * 1.6, p.y + Math.sin(a) * 1.6, p.z, 0.9 + Math.random() * 0.5, 0.7, 0xa09070); }
      vfx.burst(p.x, p.y, p.z + 0.2, 14, { ...DUST, speed: 0.6, radial: 3, size: 1.2, life: 1, ring: 1.4, up: 0.5 });
      vfx.debris(p.x, p.y, p.z + 0.3, 8, { color: 0x8a7458, speed: 3, size: 0.18, up: 6, jitter: 2.4, floor: p.z, life: 1.3 });   // s80: earth thrown up
      vfx.ring(p.x, p.y, p.z, sp.color, 0.4, 2.6, 0.45, 0.8); vfx.light(p.x, p.y, p.z + 1.2, 0xffc060, 0.8, 0.4);
      vfx.burst(p.x, p.y, p.z + 0.3, 24, { tex: 'shard', color: 0xffd890, color2: 0xa07030, speed: 1, radial: 2.5, size: 0.28, life: 0.9, ring: 1.6, up: 3, grav: 4, spin: 5 });
      vfx.burst(p.x, p.y, p.z + 0.2, 10, { tex: 'rune', color: sp.color, speed: 0, size: 0.5, life: 1.2, ring: 1.5, up: 1.6, drag: 0, spin: 1.5 });
      if (sp.radius) {   // Monolith Ward: stun nova + a ring of standing stones
        aoe(p.x, p.y, p.z + 1, sp.radius, sp);
        vfx.ring(p.x, p.y, p.z, 0xffd890, 0.5, sp.radius * 1.2, 0.9); vfx.ring(p.x, p.y, p.z, 0xffa040, 0.5, sp.radius * 0.8, 0.6, 0.7);
        vfx.decal('rune', p.x, p.y, p.z, sp.radius * 0.75, 3.5, 0xffb040, 0.95, 0.4); vfx.decal('crack', p.x, p.y, p.z, sp.radius * 1.1, 6, 0xffffff, 0.9);
        for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; vfx.spike(p.x + Math.cos(a) * sp.radius * 0.5, p.y + Math.sin(a) * sp.radius * 0.5, p.z, 2.6 + Math.random() * 1.2, 3, 0xa09070); }
        vfx.debris(p.x, p.y, p.z + 0.3, 20, { color: 0x8a7458, speed: sp.radius * 1.2, size: 0.22, up: 8, jitter: 2, floor: p.z, life: 1.8 });
        vfx.burst(p.x, p.y, p.z + 0.3, 40, { ...DUST, speed: 1, radial: sp.radius * 1.5, size: 2, life: 1.6, ring: 2, up: 0.8 });
        for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; vfx.burst(p.x + Math.cos(a) * sp.radius * 0.5, p.y + Math.sin(a) * sp.radius * 0.5, p.z + 2, 3, { tex: 'rune', color: 0xffc860, speed: 0, size: 0.6, life: 2, up: 1.2, drag: 0, jitter: 0.3, jz: 1.6, spin: 1 }); }
        vfx.light(p.x, p.y, p.z + 2, 0xffc060, 1.6, 0.8, 20);
      }
    },
    summon(sp) {
      for (let k = 0; k < sp.count; k++) {
        const o = vfx.missile(p.x, p.y, p.z + 2, sp.color, { coreColor: 0xeafff4, radius: 0.12, halo: 0.6, width: 0.2, trailLife: 0.4, trailColor: 0xb070ff }); if (!o) break;
        wisps.push({ sp, orb: o, a: k / sp.count * 6.283, next: game.time + 0.3 + k * 0.2, until: game.time + sp.dur });
      }
      hexPuff(p.x + A.hx * 1.5, p.y + A.hy * 1.5, p.z + 1.5, 16, 0xa0ffd0, 0xb070ff);
      vfx.decal('rune', p.x, p.y, p.z, 1.8, 1.4, 0x60ffa0, 0.8, 2);
    },
  };

  // ---------- staff (first-person) ----------
  const staff = new THREE.Group();
  const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 1.1, 6), new THREE.MeshBasicMaterial({ color: 0x4a3020, depthTest: false, fog: false }));
  wood.position.y = -0.3; staff.add(wood);
  const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: vfx.glow, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  tip.position.y = 0.27; tip.scale.setScalar(0.14); staff.add(tip);
  wood.renderOrder = tip.renderOrder = 999;
  game.root.add(staff);
  const so = new THREE.Vector3(); let thrust = 0, bob = 0;
  function updateStaff(dt) {
    const show = p.view !== 3 && !window.__cam;
    staff.visible = show; if (!show) return;
    thrust = Math.max(0, thrust - dt * 4); bob += dt * (2 + p.speed * 1.5);
    const th = Math.sin(Math.min(1, thrust) * Math.PI);
    so.set(0.28, -0.32 + Math.sin(bob) * 0.012 + th * 0.05, -0.62 - th * 0.18).applyQuaternion(game.camera.quaternion);
    staff.position.copy(game.camera.position).add(so);
    staff.quaternion.copy(game.camera.quaternion); staff.rotateX(-0.35 - th * 0.4); staff.rotateZ(0.12);
    const def = CLASSES[caster.cls];
    if (def) tip.material.color.set(def.color);
    tip.scale.setScalar(0.13 + th * 0.12 + Math.sin(game.time * 5) * 0.01);
  }

  // ---------- casting ----------
  let lastNoMana = -9;
  function cast(i, target) {
    const sp = caster.spells[i];
    if (!sp || game.stats.hp <= 0 || game.paused) return false;
    if (game.time < sp.readyAt) return false;
    if (game.stats.mana < sp.mana) {
      if (game.time - lastNoMana > 1) { lastNoMana = game.time; sfx.play('nomana'); game.hud?.toast?.('Not enough mana'); }
      return false;
    }
    game.stats.mana -= sp.mana;
    sp.cdTotal = sp.cd * (1 - Math.min(0.6, game.stats.cdr || 0)); sp.readyAt = game.time + sp.cdTotal;
    aim(target);
    try { KIND[sp.kind](sp, target); } catch (e) { console.warn('[classes] spell', sp.id, e); }
    sfx.play(sp.sfx); thrust = 1;
    game.emit('cast', { spell: sp.id, caster: 'player', slot: i, cls: caster.cls });
    return true;
  }

  // ---------- input ----------
  const canvas = document.getElementById('view');
  listen(window, 'keydown', e => {
    if (e.target instanceof HTMLInputElement || e.repeat || window.__explore || game.paused) return;
    const m = /^Digit([1-6])$/.exec(e.code);
    if (m) cast(+m[1] - 1);
  });
  listen(window, 'mousedown', e => {
    if (e.button === 0 && canvas && document.pointerLockElement === canvas && !game.paused) cast(0);
  });

  game.add({
    update(dt) { stepProjs(dt); stepWorld(dt); vfx.update(dt); updateStaff(dt); },
    dispose() {
      for (const f of offs) f();
      for (const m of cursed) m.damageTaken = 1;
      staff.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      vfx.dispose();
    },
  });
}
