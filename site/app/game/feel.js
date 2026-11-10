// Combat feel (gameplay node, session 1). An add-on layer over the existing systems; everything it patches is restored
// on dispose, so exploration mode (G, ?explore) never sees it.
//  - Over-the-shoulder combat camera: game mode starts in third person with the camera offset over the right shoulder
//    (collision-checked so it never pokes into a wall); first person stays the exploration default and V still toggles.
//  - Dodge: every dash grants i-frames (DODGE_IFRAMES s). An attack that lands inside them is evaded: no damage,
//    "Evaded" text, the dash cooldown is refunded and the chain is kept.
//  - Soft lock-on: a cast with no explicit target picks the best live mob in a cone around the aim (angle + distance,
//    line of sight). Tab / middle mouse / the touch Lock button toggles a hard lock that eases the view onto the target.
//    A reticle marks the current target (soft = thin, hard = bold).
//  - Poise and stagger: player damage builds poise on a mob; breaking it interrupts the wind-up (telegraph cleared)
//    and staggers the mob, with a short immunity so it can't be stun-locked.
//  - Chain combo: consecutive casts that land within CHAIN_WINDOW s build a chain (+4% damage per link, up to +40%;
//    every 5th link doubles poise damage). Taking a hit breaks the chain, which makes dodging pay.
//  - Hit-stop and camera shake scaled by damage relative to the target's health (core.hitStop rate-limits).
// game.feel.stats counts each feature firing (scripts/test_feel.mjs asserts them in a scripted fight).
import * as sfx from './sfx.js';

const DODGE_IFRAMES = 0.32, CHAIN_WINDOW = 2.5, SHOULDER = 0.6, LOCK_RANGE = 34, LOCK_CONE = 0.38, HARD_RANGE = 42;
const AIMED = new Set(['bolt', 'beam', 'cone', 'zone']);   // spell kinds that use a target (blinks stay free movement)

export function install(game) {
  const T = game.THREE, p = game.player, offs = [];
  const stats = { hitStops: 0, shakes: 0, staggers: 0, telegraphs: 0, dodges: 0, evaded: 0, lockOns: 0, hardLocks: 0,
    reactions: 0, maxChain: 0, shoulder: 0 };
  const F = game.feel = { stats, lock: null, soft: null, chain: 0, chainAt: -9, dodgeUntil: -9, trauma: 0 };

  // ---------- over-the-shoulder camera
  const prevView = p.view; p.view = 3; p.onChange?.();
  const a3 = p.applyCamera3, a1 = p.applyCamera;
  const shoulder = (cam) => {
    if (!p.combatCam || window.__cam) return;
    const rx = Math.cos(p.yaw), ry = Math.sin(p.yaw);   // camera right in the collision frame (x east, y north)
    const cx = cam.position.x, cy = -cam.position.z, cz = cam.position.y;
    let k = SHOULDER;
    for (; k > 0.05; k -= 0.15) {   // shrink the offset until the shifted camera (and the path to it) is clear
      const x = cx + rx * k, y = cy + ry * k;
      if (!game.world.blocked(x, y, cz - 0.3, 0.25, 0, 0.6) && !game.world.blocked(cx + rx * k * 0.5, cy + ry * k * 0.5, cz - 0.3, 0.25, 0, 0.6)) break;
    }
    if (k > 0.05) { cam.position.x += rx * k; cam.position.z -= ry * k; F.shoulderK = k; stats.shoulder++; }
  };
  const shake = (cam) => {
    if (F.trauma <= 0.001 || window.__cam) return;
    const s = F.trauma * F.trauma, t = game.time * 41;
    cam.rotation.x += 0.012 * s * Math.sin(t * 1.21); cam.rotation.y += 0.014 * s * Math.sin(t * 0.87 + 2.1); cam.rotation.z += 0.01 * s * Math.sin(t * 1.43 + 0.6);
  };
  if (a3) p.applyCamera3 = function (cam, dt) { a3.call(this, cam, dt); shoulder(cam); shake(cam); };
  if (a1) p.applyCamera = function (cam) { a1.call(this, cam); shake(cam); };
  offs.push(() => { if (a3) p.applyCamera3 = a3; if (a1) p.applyCamera = a1; p.view = prevView === 3 ? 3 : 1; p.onChange?.(); });

  // ---------- floating combat words ("Evaded", "Staggered", chain counter)
  const css = document.createElement('style');
  css.textContent = `.gf-word{position:fixed;left:50%;top:58%;transform:translate(-50%,0);font:700 20px/1 Georgia,serif;letter-spacing:.1em;color:#e8f4ff;text-shadow:0 0 10px #4aa0ff,0 2px 3px #000;pointer-events:none;opacity:0;z-index:30}
.gf-chain{position:fixed;left:calc(50% + 46px);top:calc(50% - 10px);font:700 18px/1 Georgia,serif;color:#ffd890;text-shadow:0 0 8px #ff7a20,0 2px 3px #000;pointer-events:none;opacity:0;z-index:30}
.gf-chain small{font-size:11px;letter-spacing:.12em;margin-left:4px;color:#ffe9c8}
#gf-lock{position:fixed;right:14px;bottom:200px;width:64px;height:64px;border-radius:50%;border:2px solid #fff8;background:#0006;color:#fff;font:600 13px sans-serif;z-index:31}
#gf-lock.on{background:#c0302080;border-color:#ffb080}`;
  document.head.appendChild(css);
  const word = document.createElement('div'); word.className = 'gf-word'; document.body.appendChild(word);
  const chainEl = document.createElement('div'); chainEl.className = 'gf-chain'; document.body.appendChild(chainEl);
  let wordT = 0;
  const say = (text, color) => { word.textContent = text; word.style.color = color || '#e8f4ff'; wordT = 0.9; };
  offs.push(() => { css.remove(); word.remove(); chainEl.remove(); });

  // ---------- dodge: i-frames on every dash
  offs.push(game.on('dash', () => {
    F.dodgeUntil = game.time + DODGE_IFRAMES; game.invulnUntil = Math.max(game.invulnUntil || 0, F.dodgeUntil); stats.dodges++;
    game.mobSystem?.burst?.(p.x, p.y, p.z + 1, 0xd8ecff, 8, 3);
  }));
  const dmgP = game.damagePlayer;
  game.damagePlayer = function (amount, source) {
    if (F.dodgeUntil > this.time && amount > 0 && this.stats.hp > 0) {
      stats.evaded++; p.dashCd = 0; say('Evaded'); sfx.play('pickup', 0.5, 1.6);
      this.emit('evade', { amount, source }); return 0;
    }
    return dmgP.call(this, amount, source);
  };
  offs.push(() => { game.damagePlayer = dmgP; });

  // ---------- soft lock-on
  const losClear = (m) => {
    const x0 = p.x, y0 = p.y, z0 = p.eye - 0.4, dx = m.x - x0, dy = m.y - y0, dz = (m.z + (m.height ?? 1.6) * 0.5) - z0, d = Math.hypot(dx, dy);
    for (let r = 1; r < d - (m.radius || 0.5); r += 1) {
      const f = r / d, z = z0 + dz * f;
      if (game.world.blocked(x0 + dx * f, y0 + dy * f, z - 0.3, 0.05, 0, 0.6)) return false;
    }
    return true;
  };
  function pickTarget(range = LOCK_RANGE) {
    const f = game.facing(); let best = null, bs = Infinity;
    for (const m of game.mobs) {
      if (m.dead || m.removed || typeof m.hp !== 'number') continue;
      const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
      if (d > range || d < 0.01) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dy * f.y) / d)));
      const cone = Math.max(LOCK_CONE, Math.atan2((m.radius || 0.5) + 1.2, d));   // close mobs get a wider cone
      if (ang > cone) continue;
      const s = ang * 12 + d * 0.15 - (m === F.lock ? 3 : 0) - (m.boss ? 0.5 : 0);
      if (s < bs && losClear(m)) { bs = s; best = m; }
    }
    return best;
  }
  F.pickTarget = pickTarget;
  // classes.js calls game.autoTarget(sp) when a cast has no explicit target
  game.autoTarget = (sp) => {
    if (sp && !AIMED.has(sp.kind)) return undefined;
    const m = (F.lock && !F.lock.dead) ? F.lock : pickTarget();
    if (m) { stats.lockOns++; F.lastAuto = m; }
    return m || undefined;
  };
  offs.push(() => { delete game.autoTarget; });
  function toggleLock() {
    if (F.lock) { F.lock = null; lockBtn && lockBtn.classList.remove('on'); return; }
    const m = pickTarget(HARD_RANGE) || game.nearestMob(p.x, p.y, 18);
    if (m) { F.lock = m; stats.hardLocks++; lockBtn && lockBtn.classList.add('on'); }
  }
  F.toggleLock = toggleLock;
  const onKey = e => { if (e.code === 'Tab' && !window.__explore && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); if (!e.repeat) toggleLock(); } };
  const onMouse = e => { if (e.button === 1) { e.preventDefault(); toggleLock(); } };
  addEventListener('keydown', onKey); addEventListener('mousedown', onMouse);
  offs.push(() => { removeEventListener('keydown', onKey); removeEventListener('mousedown', onMouse); });
  // touch: a Lock button next to the action buttons
  let lockBtn = null;
  if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
    lockBtn = document.createElement('button'); lockBtn.id = 'gf-lock'; lockBtn.textContent = 'Lock';
    lockBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); toggleLock(); });
    document.body.appendChild(lockBtn); offs.push(() => lockBtn.remove());
  }
  // reticle over the current target (a camera-facing ring)
  const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.moveTo(32 + Math.cos(a) * 18, 32 + Math.sin(a) * 18); g.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31); g.stroke(); }
    return new T.CanvasTexture(c); })();
  const reticle = new T.Sprite(new T.SpriteMaterial({ map: ringTex, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  reticle.renderOrder = 999; reticle.visible = false; game.root.add(reticle);
  offs.push(() => { game.root.remove(reticle); reticle.material.dispose(); ringTex.dispose(); });

  // ---------- poise / stagger, reactions, chain, scaled hit-stop + shake
  const dmgM = game.damageMob;
  game.damageMob = function (mob, amount, opts = {}) {
    if (opts.source === 'player' && !opts.noProc && F.chain > 1 && this.time - F.chainAt < CHAIN_WINDOW) amount *= 1 + 0.04 * Math.min(10, F.chain - 1);
    return dmgM.call(this, mob, amount, opts);
  };
  offs.push(() => { game.damageMob = dmgM; });
  const hs = game.hitStop;
  game.hitStop = function (dur, scale) { const a = this._hsAt; hs.call(this, dur, scale); if (this._hsAt !== a) stats.hitStops++; };
  offs.push(() => { game.hitStop = hs; });

  let credited = true;
  offs.push(game.on('cast', () => { credited = false; }));
  offs.push(game.on('playerHit', ({ amount }) => { if (amount > 0 && F.chain) { F.chain = 0; } }));
  offs.push(game.on('hit', ({ target, amount, source, noProc, crit }) => {
    if (!target || target === p || source === 'mob' || typeof target.hp !== 'number') return;
    const mob = target, maxHp = mob.maxHp || 100;
    if (!noProc && mob.flinch > 0) stats.reactions++;
    // chain: the first landed hit of each cast extends it
    if (!noProc && !credited) {
      credited = true;
      F.chain = game.time - F.chainAt < CHAIN_WINDOW ? F.chain + 1 : 1; F.chainAt = game.time;
      stats.maxChain = Math.max(stats.maxChain, F.chain);
    }
    // hit-stop and shake scaled by the hit's share of the target's health
    const share = Math.min(1, amount / Math.max(25, maxHp * 0.3));
    if (!noProc && amount >= 6) game.hitStop(Math.min(0.11, 0.02 + 0.08 * share + (crit ? 0.02 : 0)), 0.06);
    if (!noProc) { const add = 0.08 + 0.35 * share; F.trauma = Math.min(0.8, F.trauma + add); stats.shakes++; }
    // poise
    if (mob.dead || mob.state === 'dead' || !mob.type) return;
    const thr = Math.max(mob.boss ? 60 : 18, maxHp * (mob.boss ? 0.12 : 0.3)), now = game.time;
    mob.poise = Math.max(0, (mob.poise || 0) - (now - (mob.poiseAt ?? now)) * thr * 0.2);
    mob.poiseAt = now;
    mob.poise += amount * (noProc ? 0.4 : 1) * (F.chain && F.chain % 5 === 0 ? 2 : 1);
    if (mob.poise >= thr && !(mob.poiseImmune > now) && ['chase', 'windup', 'recover', 'idle', 'patrol'].includes(mob.state)) {
      const wasWindup = mob.state === 'windup';
      game.mobSystem?.clearTelegraph?.(mob);
      if (mob.chargeOrb) mob.chargeOrb.visible = false;
      mob.state = 'stagger'; mob.stateT = mob.boss ? 1.0 : 0.8; mob.poise = 0; mob.poiseImmune = now + (mob.boss ? 7 : 2.5);
      stats.staggers++; if (wasWindup) stats.interrupts = (stats.interrupts || 0) + 1;
      say(wasWindup ? 'Interrupted' : 'Staggered', '#ffd890'); sfx.play('crit', 0.6, 0.6);
      game.mobSystem?.burst?.(mob.x, mob.y, mob.z + (mob.height ?? 1.6) * 0.7, 0xffe0a0, 10, 4);
      game.emit('stagger', { mob, interrupted: wasWindup });
    }
  }));

  // ---------- per frame
  const seenWindup = new WeakSet();
  let softT = 0;
  game.add({
    update(dt) {
      const rdt = Math.max(dt, 1 / 120);
      F.trauma = Math.max(0, F.trauma - rdt * 2.2);
      // telegraph readability check: count each wind-up that shows a ground telegraph
      for (const m of game.mobs) {
        if (m.state === 'windup' && m.telegraph?.length) { if (!seenWindup.has(m.telegraph)) { seenWindup.add(m.telegraph); stats.telegraphs++; } }
      }
      // hard lock: drop dead / far targets, ease the view onto the target
      if (F.lock && (F.lock.dead || F.lock.removed || Math.hypot(F.lock.x - p.x, F.lock.y - p.y) > HARD_RANGE)) { F.lock = null; lockBtn?.classList.remove('on'); }
      if (F.lock && game.stats.hp > 0) {
        const want = Math.atan2(-(F.lock.x - p.x), F.lock.y - p.y);
        let d = want - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        p.yaw += d * Math.min(1, dt * 5);
      }
      if ((softT -= dt) <= 0) { softT = 0.15; F.soft = F.lock || pickTarget(); }
      const tgt = F.lock || F.soft;
      reticle.visible = !!tgt && !tgt.dead && game.stats.hp > 0;
      if (reticle.visible) {
        const h = (tgt.height ?? 1.6) * (tgt.boss ? 0.6 : 0.55);
        reticle.position.set(tgt.x, tgt.z + h, -tgt.y);
        const d = game.camera.position.distanceTo(reticle.position), s = Math.max(0.6, (tgt.radius || 0.5) * 2.4) * (F.lock ? 1 : 0.8);
        reticle.scale.setScalar(Math.max(s, d * 0.045));
        reticle.material.color.setHex(F.lock ? 0xff6040 : 0xffffff); reticle.material.opacity = F.lock ? 0.95 : 0.45;
        reticle.material.rotation += dt * (F.lock ? 1.5 : 0.5);
      }
      // words + chain counter
      wordT = Math.max(0, wordT - rdt);
      word.style.opacity = Math.min(1, wordT * 3).toFixed(2); word.style.transform = `translate(-50%,${(-30 * (0.9 - wordT)).toFixed(0)}px)`;
      const live = F.chain > 1 && game.time - F.chainAt < CHAIN_WINDOW;
      if (!live && F.chain > 1 && game.time - F.chainAt >= CHAIN_WINDOW) F.chain = 0;
      chainEl.style.opacity = live ? Math.min(1, (CHAIN_WINDOW - (game.time - F.chainAt)) * 2).toFixed(2) : '0';
      if (live) { const txt = `×${F.chain}`; if (chainEl.dataset.n !== txt) { chainEl.dataset.n = txt; chainEl.innerHTML = `${txt}<small>CHAIN</small>`; } }
    },
    dispose() { for (const f of offs.splice(0)) { try { f(); } catch (e) { console.warn('[feel]', e); } } delete game.feel; },
  });
}
