// Game layer core (session 40): the shared state every game module plugs into.
// Loaded by main.js only outside exploration mode (?explore, or the in-game toggle), so realism renders never see it.
// Frames: collision frame x east, y north, z up (metres); three.js position = (x, z, -y).
// Modules (each owns its file): classes.js (classes, spells, caster input), mobs.js (mob types, AI, encounters),
// items.js (items, effects, inventory, drops, chests), hud.js (HUD, damage numbers, class select).
// Events (game.on / game.emit), payloads are plain objects:
//   'hit'    {target, amount, crit, type, source, spell}   after damage is applied to a mob or the player
//   'kill'   {mob, source}                                  a mob died (loot rolls listen to this)
//   'cast'   {spell, caster}                                the player cast a spell
//   'dash' {} · 'jump' {} · 'land' {}                       player movement (from Player state edges)
//   'equip'  {item, slot} · 'unequip' {item, slot} · 'pickup' {item}
//   'playerHit' {amount, source} · 'playerDeath' {} · 'levelup' {level}
//   'tick'   {dt}                                           every frame
import * as THREE from 'three';

export const v3 = (x, y, z) => new THREE.Vector3(x, z, -y);              // collision frame -> three.js
export const SAVE_KEY = 'walkable-cambridge-save-v1';

export class Game {
  constructor({ scene, camera, player, world }) {
    Object.assign(this, { scene, camera, player, world, THREE });
    this.root = new THREE.Group(); this.root.name = 'game'; scene.add(this.root);
    this.handlers = new Map();
    this.mobs = [];          // live mob instances: {id, type, x, y, z, hp, maxHp, dead, ...} (owned by mobs.js)
    this.systems = [];       // objects with update(dt) (and optional dispose())
    this.time = 0;
    // player combat stats; items/talents modify these through `mods`
    this.stats = { hp: 100, maxHp: 100, mana: 100, maxMana: 100, manaRegen: 8, hpRegen: 0.5, power: 1, critChance: 0.1,
                   critMult: 1.75, cdr: 0, speedMult: 1, armor: 0, level: 1, xp: 0 };
    this.save = this.loadSave();
    this.prev = { dashing: false, grounded: true };
  }

  // --- events
  on(ev, fn) { if (!this.handlers.has(ev)) this.handlers.set(ev, []); this.handlers.get(ev).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const a = this.handlers.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(ev, data = {}) { for (const fn of [...(this.handlers.get(ev) || [])]) { try { fn(data); } catch (e) { console.warn('[game]', ev, e); } } }

  // --- queries
  get px() { return this.player.x; } get py() { return this.player.y; } get pz() { return this.player.z; }
  // player facing (unit vector in the collision frame): yaw 0 = north, positive = left
  facing() { const y = this.player.yaw; return { x: -Math.sin(y), y: Math.cos(y) }; }
  mobsNear(x, y, r) { return this.mobs.filter(m => !m.dead && Math.hypot(m.x - x, m.y - y) <= r + (m.radius || 0.5)); }
  nearestMob(x, y, r) { let b = null, bd = r; for (const m of this.mobs) { if (m.dead) continue; const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; b = m; } } return b; }
  groundAt(x, y, zHint = 1e4) { const s = this.world.support(x, y, zHint + 0.5); return s ? s.z : null; }

  // --- damage
  // Damage a mob. opts: {type:'fire'|'storm'|'stone'|'hex'|'physical', crit?:bool (rolled if undefined), source, spell, noProc}
  damageMob(mob, amount, opts = {}) {
    if (!mob || mob.dead) return 0;
    const crit = opts.crit ?? (Math.random() < this.stats.critChance);
    // s74: direct player hits roll +-12% (mean 1) so damage numbers vary instead of repeating one value
    const roll = opts.source === 'player' && !opts.noProc ? 0.88 + 0.24 * Math.random() : 1;
    let dmg = amount * roll * this.stats.power * (crit ? this.stats.critMult : 1) * (mob.damageTaken ?? 1);
    dmg = Math.max(1, Math.round(dmg));
    mob.hp -= dmg; mob.lastHitAt = this.time;
    mob.onHit?.(dmg, opts);
    this.emit('hit', { target: mob, amount: dmg, crit, type: opts.type || 'physical', source: opts.source || 'player', spell: opts.spell, noProc: opts.noProc });
    if (mob.hp <= 0 && !mob.dead) { mob.hp = 0; mob.dead = true; mob.onDeath?.(); this.emit('kill', { mob, source: opts.source || 'player' }); this.gainXp(mob.xp || 10); }
    return dmg;
  }
  damagePlayer(amount, source) {
    if (this.stats.hp <= 0 || this.invulnUntil > this.time) return 0;
    const dmg = Math.max(1, Math.round(amount * (1 - Math.min(0.75, this.stats.armor / 100)) * (this.damageTakenMult ?? 1)));
    if (this.shield > 0) { const a = Math.min(this.shield, dmg); this.shield -= a; if (a === dmg) { this.emit('playerHit', { amount: 0, absorbed: a, source }); return 0; } }
    this.stats.hp -= dmg;
    this.emit('playerHit', { amount: dmg, source });
    if (this.stats.hp <= 0) { this.stats.hp = 0; this.emit('playerDeath', {}); }
    return dmg;
  }
  heal(amount) { const s = this.stats; const h = Math.min(s.maxHp - s.hp, amount); s.hp += h; return h; }

  // --- progression (localStorage; no accounts, no servers)
  xpToNext(level = this.stats.level) { return Math.round(60 * level ** 1.5); }
  gainXp(n) {
    const s = this.stats; s.xp += n;
    while (s.xp >= this.xpToNext()) { s.xp -= this.xpToNext(); s.level++; s.maxHp += 10; s.hp = s.maxHp; this.emit('levelup', { level: s.level }); }
    this.save.level = s.level; this.save.xp = s.xp; this.persist();
  }
  loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch {} }

  add(system) { this.systems.push(system); return system; }

  // --- hit-stop: briefly dip the game timescale (crits / big hits). Real-time duration; re-triggers are rate-limited
  // so a burst of crits cannot stall combat.
  hitStop(dur = 0.05, scale = 0.1) {
    const now = performance.now() / 1000;
    if (now - (this._hsAt ?? -1) < 0.22) return;
    this._hsAt = now; this.hitStopLeft = Math.max(this.hitStopLeft || 0, dur); this.hitStopScale = scale;
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    if (this.hitStopLeft > 0) { const raw = dt; this.hitStopLeft -= raw; dt = raw * (this.hitStopScale ?? 0.1); }
    this.time += dt;
    const s = this.stats, p = this.player;
    s.mana = Math.min(s.maxMana, s.mana + s.manaRegen * dt);
    if (s.hp > 0) s.hp = Math.min(s.maxHp, s.hp + s.hpRegen * dt);
    if (p.dashing && !this.prev.dashing) this.emit('dash', {});
    if (!p.grounded && this.prev.grounded && p.vz > 0) this.emit('jump', {});
    if (p.grounded && !this.prev.grounded) this.emit('land', {});
    this.prev.dashing = p.dashing; this.prev.grounded = p.grounded;
    for (const sys of this.systems) sys.update?.(dt);
    this.emit('tick', { dt });
  }

  dispose() { for (const sys of this.systems) sys.dispose?.(); this.scene.remove(this.root); this.handlers.clear(); this.mobs = []; }
}
