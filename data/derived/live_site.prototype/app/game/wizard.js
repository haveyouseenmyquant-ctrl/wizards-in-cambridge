// Third-person wizard model for game mode (session 71). The plain explorer avatar (../avatar.js) stays for exploration
// mode; while the game layer runs, its update() is redirected here: the avatar is hidden and a procedural per-class
// wizard is drawn in its place (same visibility rule, same position / yaw).
// Original design from three.js primitives: a layered robe (open over-coat on a darker under-robe, flared rippled hem,
// shoulder capelet), bell sleeves, a broad-brimmed hat with a three-segment crumpled tip, belt, satchel and strap, a
// big nose and beard, and a class staff with a glowing focus. About 2.3k triangles, 10 materials.
// Animation (driven by game.time so scripted clips that step the game clock pose it consistently): walk cycle (legs,
// counter arm swing, robe sway / trailing hem, body bob and twist, hat tip flop), idle breathing, a cast pose on every
// 'cast' event (staff thrust forward for bolts / beams / cones / blinks, staff raised overhead for novas / zones /
// shields / summons) with a focus flare, a red flash + recoil on 'playerHit', seated on a broom when flying, and a
// fall when the player dies.
import { Avatar } from '../avatar.js';

const LOOK = {
  pyromancer: { robe: 0x8e2416, inner: 0x2e0f0b, trim: 0xf0a640, hat: 0x6e1a10, wood: 0x3a2014, beard: 0xa8461e, focus: 0xff7a2a, head: 'fork' },
  stormcaller: { robe: 0x24508e, inner: 0x0f1d3a, trim: 0xcfe8ff, hat: 0x1d3f74, wood: 0xc8b48c, beard: 0xe8e8ee, focus: 0x7fd4ff, head: 'ring' },
  warden: { robe: 0x6a5a34, inner: 0x2f2a1a, trim: 0xd9b26e, hat: 0x4a5630, wood: 0x5a4028, beard: 0x7a5232, focus: 0xffc860, head: 'stone' },
  hexweaver: { robe: 0x3c1c58, inner: 0x120818, trim: 0x8affc4, hat: 0x26103a, wood: 0x1c1418, beard: 0x2a2030, focus: 0xc070ff, head: 'hook' },
};
const CAST_POSE = { bolt: 'thrust', beam: 'thrust', cone: 'thrust', blink: 'thrust', nova: 'raise', zone: 'raise', shield: 'raise', summon: 'raise' };
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

export function install(game) {
  const T = game.THREE;
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 31); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();

  let W = null;   // current model {root, parts..., mats}

  function build(cls) {
    const L = LOOK[cls] || LOOK.stormcaller;
    const lam = (c, o = {}) => new T.MeshLambertMaterial({ color: c, ...o });
    const M = { robe: lam(L.robe, { side: T.DoubleSide }), inner: lam(L.inner, { side: T.DoubleSide }), trim: lam(L.trim), hat: lam(L.hat, { side: T.DoubleSide }),
      skin: lam(0xe2b48e), leather: lam(0x4a3020), dark: lam(0x1c1816), wood: lam(L.wood), beard: lam(L.beard),
      focus: new T.MeshBasicMaterial({ color: L.focus, fog: false }) };
    const flash = [M.robe, M.inner, M.hat];
    const part = (geo, m, x, y, z, parent) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    const grp = (x, y, z, parent) => { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    const lathe = (pts, seg, ps = 0, pl = Math.PI * 2) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg, ps, pl);
    // ripple the hem: vertices below yCut get a radial wave so the robe edge reads as cloth, not a cone
    const ripple = (geo, yCut, amp, n) => { const a = geo.attributes.position;
      for (let i = 0; i < a.count; i++) { const y = a.getY(i); if (y > yCut) continue; const x = a.getX(i), z = a.getZ(i), r = Math.hypot(x, z) || 1, ph = Math.atan2(x, z);
        const k = 1 + amp * Math.sin(ph * n) * Math.min(1, (yCut - y) / 0.12) / r; a.setX(i, x * k); a.setZ(i, z * k); }
      geo.computeVertexNormals(); return geo; };

    const root = new T.Group(); root.name = 'wizard';
    const body = grp(0, 0, 0, root);
    // --- legs (under the robe; boots show at the hem when striding)
    const leg = sx => { const g = grp(sx, 0.92, 0, body); part(new T.CylinderGeometry(0.055, 0.05, 0.8, 6), M.dark, 0, -0.4, 0, g);
      part(new T.BoxGeometry(0.11, 0.09, 0.25), M.leather, 0, -0.82, -0.05, g); return g; };
    const legL = leg(-0.1), legR = leg(0.1);
    // --- robe: torso + skirt (skirt pivots at the waist so it can sway and trail)
    const torso = grp(0, 0.98, 0, body);
    part(lathe([[0.2, 0], [0.215, 0.12], [0.23, 0.3], [0.2, 0.38], [0.12, 0.44], [0.07, 0.48]], 14), M.robe, 0, 0, 0, torso);
    part(lathe([[0.3, 0.2], [0.27, 0.32], [0.2, 0.42], [0.09, 0.5]], 14), M.hat, 0, 0, 0, torso);                     // shoulder capelet
    part(new T.TorusGeometry(0.3, 0.018, 4, 18).rotateX(Math.PI / 2), M.trim, 0, 0.2, 0, torso);                      // capelet edge
    part(new T.BoxGeometry(0.05, 0.3, 0.02), M.trim, 0, 0.12, -0.222, torso);                                       // front placket
    part(new T.TorusGeometry(0.212, 0.026, 4, 16).rotateX(Math.PI / 2), M.leather, 0, 0.02, 0, torso);              // belt
    part(new T.BoxGeometry(0.07, 0.06, 0.03), M.trim, 0, 0.02, -0.235, torso);                                     // buckle
    const strap = part(new T.BoxGeometry(0.035, 0.62, 0.02), M.leather, 0.02, 0.2, -0.235, torso); strap.rotation.z = -0.62;
    const satchel = part(new T.BoxGeometry(0.17, 0.15, 0.08), M.leather, -0.24, -0.08, -0.04, torso); satchel.rotation.y = 0.5;
    part(new T.BoxGeometry(0.175, 0.05, 0.085), M.trim, -0.24, -0.02, -0.04, torso).rotation.y = 0.5;                // satchel flap
    const skirt = grp(0, 0.98, 0, body);
    const hemPts = [[0.205, 0], [0.24, -0.2], [0.3, -0.48], [0.38, -0.72], [0.44, -0.82]];
    part(ripple(lathe(hemPts.map(([r, y]) => [r * 0.93, y * 1.04]), 16), -0.66, 0.02, 7), M.inner, 0, 0, 0, skirt);       // under-robe
    part(ripple(lathe(hemPts.map(([r, y]) => [r * 1.05, y]), 16, Math.PI + 0.38, Math.PI * 2 - 0.76), -0.6, 0.035, 6), M.robe, 0, 0, 0, skirt);   // open over-coat
    const hemTrim = new T.TorusGeometry(0.455, 0.02, 4, 26, Math.PI * 2 - 0.76).rotateX(Math.PI / 2).rotateY(-(1.5 * Math.PI + 0.38));
    part(hemTrim, M.trim, 0, -0.8, 0, skirt);
    // --- arms: shoulder pivot -> upper sleeve -> elbow pivot -> bell sleeve, cuff, hand
    const arm = sx => { const s = grp(sx, 1.34, 0, body); part(new T.CylinderGeometry(0.075, 0.08, 0.3, 7), M.robe, 0, -0.15, 0, s);
      const e = grp(0, -0.3, 0, s); part(new T.CylinderGeometry(0.08, 0.15, 0.3, 9, 1, true), M.robe, 0, -0.15, 0, e);
      part(new T.TorusGeometry(0.15, 0.02, 4, 12).rotateX(Math.PI / 2), M.trim, 0, -0.3, 0, e);
      const h = grp(0, -0.34, 0, e); part(new T.SphereGeometry(0.055, 7, 5), M.skin, 0, 0, 0, h); return { s, e, h }; };
    const armL = arm(-0.25), armR = arm(0.25);
    // --- head: face, big nose, eyes, beard
    const head = grp(0, 1.58, 0, body);
    part(new T.SphereGeometry(0.12, 12, 9), M.skin, 0, 0, 0, head);
    part(new T.ConeGeometry(0.03, 0.1, 6).rotateX(-Math.PI / 2), M.skin, 0, -0.01, -0.13, head);
    for (const sx of [-0.045, 0.045]) part(new T.SphereGeometry(0.017, 5, 4), M.dark, sx, 0.025, -0.105, head);
    const beardLen = cls === 'stormcaller' ? 0.34 : cls === 'hexweaver' ? 0.12 : 0.22;
    part(new T.ConeGeometry(0.1, beardLen, 8).rotateX(Math.PI), M.beard, 0, -0.08 - beardLen / 2, -0.06, head).rotation.x = -0.25;
    if (cls === 'hexweaver') part(new T.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), M.beard, 0, 0.0, 0.03, head).rotation.x = 0.6;   // long dark hair under the hat
    // --- hat: drooping brim, banded crown, two crumpled upper segments, a bead at the tip
    const hat = grp(0, 0.08, 0.005, head); hat.rotation.x = 0.06;
    part(lathe([[0.1, 0.03], [0.2, 0.012], [0.3, -0.015], [0.36, -0.05]], 18), M.hat, 0, 0, 0, hat);
    part(new T.CylinderGeometry(0.12, 0.165, 0.26, 12), M.hat, 0, 0.13, 0, hat);
    part(new T.TorusGeometry(0.16, 0.022, 4, 14).rotateX(Math.PI / 2), M.trim, 0, 0.035, 0, hat);
    const tip1 = grp(0, 0.26, 0, hat); part(new T.CylinderGeometry(0.07, 0.12, 0.22, 10), M.hat, 0, 0.11, 0, tip1);
    const tip2 = grp(0, 0.22, 0, tip1); part(new T.ConeGeometry(0.07, 0.26, 9), M.hat, 0, 0.13, 0, tip2);
    part(new T.OctahedronGeometry(0.03), M.focus, 0, 0.27, 0, tip2);
    // --- staff (in the right hand; orientation set each frame relative to the body)
    const staff = grp(0, 0, 0, armR.h); const sh = grp(0, 0, -0.02, staff);
    const thick = cls === 'warden' ? 0.034 : 0.022;
    part(new T.CylinderGeometry(thick * 0.85, thick, 1.75, 6), M.wood, 0, 0.12, 0, sh);
    const top = grp(0, 1.0, 0, sh);
    const focus = part(new T.OctahedronGeometry(0.07), M.focus, 0, 0.1, 0, top); focus.castShadow = false;
    if (L.head === 'fork') { for (const s of [-1, 1]) { const c = part(new T.ConeGeometry(0.022, 0.24, 5), M.wood, s * 0.06, 0.1, 0, top); c.rotation.z = -s * 0.45; } }
    else if (L.head === 'ring') { part(new T.TorusGeometry(0.12, 0.014, 4, 16), M.trim, 0, 0.12, 0, top); part(new T.ConeGeometry(0.03, 0.12, 5), M.trim, 0, 0.29, 0, top); }
    else if (L.head === 'stone') { part(new T.DodecahedronGeometry(0.1), lam(0x8a8478, { flatShading: true }), 0, 0.02, 0, top); focus.position.set(0, 0.06, -0.08); focus.scale.setScalar(0.7);
      for (const y of [-0.3, -0.6]) part(new T.SphereGeometry(0.045, 5, 4), M.wood, 0, y, 0, top); }
    else { part(new T.TorusGeometry(0.1, 0.02, 4, 10, Math.PI * 1.3), M.wood, -0.1, 0.06, 0, top).rotation.z = -0.2; focus.position.set(-0.19, -0.02, 0); }
    const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: L.focus, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    glow.scale.setScalar(0.5); glow.position.copy(focus.position); top.add(glow);
    // --- broom (when flying)
    const broom = grp(0, 0.85, -0.1, root);
    part(new T.CylinderGeometry(0.025, 0.03, 2.0, 6), M.wood, 0, 0, 0, broom).rotation.x = Math.PI / 2;
    part(new T.ConeGeometry(0.2, 0.6, 10), lam(0xc8a85a), 0, 0, 1.2, broom).rotation.x = -Math.PI / 2;
    game.root.add(root);
    return { cls, root, body, legL, legR, torso, skirt, armL, armR, head, hat, tip1, tip2, staff, sh, focus, glow, broom, M, flash, phase: 0, lastT: game.time };
  }
  function destroy() { if (!W) return; game.root.remove(W.root);
    W.root.traverse(o => { o.geometry?.dispose?.(); if (o.material && o.material !== W.M.focus) o.material.dispose?.(); }); W.M.focus.dispose(); W = null; }

  let castT = -9, castPose = 'thrust', hitT = -9;
  const offs = [
    game.on('cast', e => { const sp = game.caster?.spells?.find(s => s.id === e.spell); castPose = CAST_POSE[sp?.kind] || 'thrust'; castT = game.time; }),
    game.on('playerHit', e => { if (e.amount > 0) hitT = game.time; }),
  ];

  function update(p, visible) {
    const cls = game.caster?.cls || 'stormcaller';
    if (!W || W.cls !== cls) { destroy(); W = build(cls); }
    W.root.visible = visible; if (!visible) { W.lastT = game.time; return; }
    const t = game.time, dt = Math.min(0.1, Math.max(0, t - W.lastT)); W.lastT = t;
    const { body, legL, legR, skirt, torso, armL, armR, head, tip1, tip2, staff, sh, focus, glow, broom } = W;
    W.root.position.set(p.x, p.z, -p.y); W.root.rotation.set(0, p.yaw, 0);
    const flying = p.mode === 'broom', crouch = p.crouching || p.sliding, sp = p.speed || 0, air = !p.grounded && !flying;
    const run = flying ? 0 : Math.min(1, sp / 6), dead = game.stats.hp <= 0;
    W.phase += dt * (2 + sp * 2.2);
    const ph = W.phase, swing = flying ? 0 : Math.sin(ph) * Math.min(0.75, sp * 0.14);
    const br = Math.sin(t * 1.9);                                   // idle breathing
    // cast envelope: snap up in 0.07 s, hold to 0.25 s, ease out by 0.55 s
    const ca = t - castT, ck = ca < 0 ? 0 : smooth(ca < 0.07 ? ca / 0.07 : ca < 0.25 ? 1 : 1 - (ca - 0.25) / 0.3);
    const thrust = castPose === 'thrust' ? ck : 0, raise = castPose === 'raise' ? ck : 0;
    const hk = Math.max(0, 1 - (t - hitT) / 0.3);                  // hit recoil
    broom.visible = flying;

    // body
    let bx = 0, by = 0;
    if (flying) { const bob = Math.sin(ph * 0.5) * 0.04; broom.position.set(0, 0.85 + bob, -0.1); broom.rotation.set(p.pitch * 0.4, 0, 0); by = bob - 0.05; bx = p.pitch * 0.4 - 0.15; }
    else { by = (crouch ? -0.38 : 0) + Math.abs(Math.sin(ph)) * 0.045 * run + raise * 0.05; bx = p.sliding ? 0.5 : crouch ? -0.25 : p.dashing ? -0.35 : -0.09 * run; }
    bx += 0.28 * hk - 0.1 * thrust + 0.07 * raise;
    body.position.set(0, by, 0);
    body.rotation.set(bx, Math.sin(ph) * 0.07 * run - 0.28 * thrust, Math.sin(ph) * 0.035 * run);
    if (dead) { body.rotation.set(1.45, 0, 0.1); body.position.set(0, 0.12, 0); }
    torso.scale.set(1 + br * 0.008, 1 + br * 0.014, 1 + br * 0.012);
    head.rotation.set(-bx * 0.5 + br * 0.02 - 0.12 * thrust, 0.18 * thrust, 0);

    // legs
    const knee = flying ? 1.25 : crouch ? 1.0 : air ? 0.5 : 0;
    legL.rotation.set(swing + knee, 0, flying ? 0.12 : 0); legR.rotation.set(-swing + knee, 0, flying ? -0.12 : 0);

    // skirt: trails back with speed, sways with the stride, flares when running / jumping / casting
    const flare = 1 + 0.07 * run + 0.04 * Math.abs(Math.sin(ph)) * run + (air ? 0.12 : 0) + 0.06 * ck + br * 0.006;
    skirt.position.y = 0.98;
    skirt.rotation.set(flying ? 0.75 : crouch ? 0.35 : -0.2 * run - (p.dashing ? 0.35 : 0) - 0.12 * hk, 0, -Math.sin(ph) * 0.07 * run);
    skirt.scale.set(flare, crouch ? 0.8 : 1, flare);

    // left (free) arm: counter-swing, palm thrust for bolts, flung out for area spells
    const flyArm = flying ? 1.0 : 0, airArm = air ? 1.8 : 0;
    armL.s.rotation.set(-swing * 0.9 + flyArm + airArm * 0.6 + br * 0.02 + (1.45 - (-swing * 0.9)) * thrust * 0.9 + 0.5 * raise, 0, -0.14 - br * 0.015 - 1.1 * raise);
    armL.e.rotation.set(0.25 + 0.35 * run - 0.2 * thrust, 0, 0);
    // right (staff) arm: held a little forward, small swing; thrust forward / raise overhead on cast
    const rBase = 0.28 + swing * 0.3 + flyArm * 0.6 + airArm * 0.3 + br * 0.015;
    const rA = rBase + (1.4 - rBase) * thrust + (2.75 - rBase) * raise, rE = 0.55 * (1 - Math.max(thrust, raise)) + 0.1;
    armR.s.rotation.set(rA, 0, 0.14 + br * 0.015 + 0.3 * raise); armR.e.rotation.set(rE, 0, 0);
    // staff orientation relative to the body: near vertical at rest, pointed forward-up in a thrust, upright overhead when raised
    const tilt = flying ? -1.35 : -0.12 + swing * 0.15 - 1.0 * thrust + 0.1 * raise;
    staff.rotation.set(tilt - rA - rE, 0, -(0.14 + 0.3 * raise));
    sh.position.y = -0.6 * raise;   // grip slides down the shaft so the raised staff head clears the hat

    // hat tip flop (secondary motion)
    tip1.rotation.set(0.25 + Math.sin(ph * 2) * 0.12 * run + Math.sin(t * 1.3) * 0.04 + 0.25 * run + 0.2 * ck, 0, Math.sin(ph) * 0.08 * run);
    tip2.rotation.set(0.45 + Math.sin(ph * 2 - 0.6) * 0.18 * run + Math.sin(t * 1.3 - 0.5) * 0.06 + 0.2 * run + 0.25 * ck, 0, Math.sin(ph - 0.5) * 0.1 * run);

    // focus flare
    const fl = 1 + Math.sin(t * 6) * 0.06;
    focus.rotation.y += dt * 2.5; focus.scale.setScalar((W.cls === 'warden' ? 0.7 : 1) * (1 + 0.5 * ck) * fl);
    glow.scale.setScalar((0.5 + 1.6 * ck) * fl); glow.material.opacity = 0.75 + 0.25 * ck;
    // hit flash
    for (const m of W.flash) m.emissive.setRGB(0.55 * hk, 0.05 * hk, 0.03 * hk);
  }

  // redirect the explorer avatar while the game runs
  const orig = Avatar.prototype.update;
  Avatar.prototype.update = function (p, dt, visible) {
    this.root.visible = false;
    try { update(p, visible || !!window.__wizShow); } catch (e) { console.warn('[wizard]', e); Avatar.prototype.update = orig; orig.call(this, p, dt, visible); }
  };
  // debug: game.wizard.cast('thrust' | 'raise', age) holds a cast pose (with a frozen game clock) for screenshots
  game.wizard = { get model() { return W; }, cast(pose = 'thrust', age = 0.15) { castPose = pose; castT = game.time - age; } };
  game.add({ dispose() { Avatar.prototype.update = orig; for (const f of offs) f(); destroy(); glowTex.dispose(); } });
}
