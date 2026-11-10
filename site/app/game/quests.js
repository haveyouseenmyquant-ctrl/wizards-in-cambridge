// Quests (story team, session 1): data-driven main quests (quests/*.json), NPCs, dialogue with speaker names and
// portraits, a HUD quest tracker with a waypoint beam, chapter cards, rewards, progress in the game save (localStorage).
// Step types: talk {npc} · reach {place} · collect {place, item} · kill {mob | spawn[], count, at}.
// Every step may carry `intro` (lines shown when it starts) and `dialogue` (lines shown when it completes; for talk
// steps, the conversation itself). Input: E / Enter / click / tap advances dialogue and talks to a nearby NPC.
// API (game.quests): objective(), interact(), advance(), state, dialogueOpen; events 'questStep', 'questComplete'.
// window.__wicStory(step) stages the opening beats for QA's judge recorder (caption string, null to end).
import { ITEMS } from './itemdefs.js';
import * as sfx from './sfx.js';

const BASE = new URL('./quests/', import.meta.url);
const TALK_R = 3.2, SPAWN = [-108.1, 93.97];

// quest reward items (kept out of random loot by `quest: true`)
ITEMS.quest_nells_posy = { name: "Nell's Posy Charm", slot: 'amulet', rarity: 'rare', quest: true, stats: { maxHp: 15, hpRegen: 0.5 },
  desc: 'Last of the marigolds. Kills heal 6 health.',
  fx(c) { c.on('kill', () => { c.game.heal(6); c.S.fx?.burst?.(c.S.pp(1.2), 0xf4b942, 10, 2, 0.6); }); },
  test(t) { const m = t.mob(3, 0); t.game.stats.hp = 50; t.game.emit('kill', { mob: m }); return [t.game.stats.hp >= 56, `hp ${t.game.stats.hp}`]; } };

const CSS = `
#wic-q .q-track{position:absolute;right:16px;top:30vh;width:270px;padding:10px 12px;background:linear-gradient(90deg,rgba(14,12,10,0),rgba(14,12,10,.72) 18%);color:#f3e6c8;font:600 13px/1.35 system-ui,sans-serif;text-align:right;pointer-events:none;text-shadow:0 1px 2px #000}
#wic-q .q-track .q-ch{font:700 10px/1 system-ui,sans-serif;letter-spacing:.22em;color:#d9b45a;text-transform:uppercase}
#wic-q .q-track .q-ti{font:700 16px/1.2 Georgia,serif;color:#fff3d6;margin:3px 0 6px}
#wic-q .q-track .q-ob{display:flex;justify-content:flex-end;align-items:center;gap:8px}
#wic-q .q-track .q-ob::before{content:'';width:7px;height:7px;border:1.5px solid #e9c46a;transform:rotate(45deg);flex:none}
#wic-q .q-track .q-dist{color:#d9c08a;font-weight:500}
#wic-q .q-arrow{display:inline-block;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:12px solid #e9c46a;filter:drop-shadow(0 0 3px #000)}
#wic-q .q-bars::before,#wic-q .q-bars::after{content:'';position:fixed;left:0;right:0;height:9vh;background:#000;transition:transform .5s;z-index:30}
#wic-q .q-bars::before{top:0;transform:translateY(-100%)} #wic-q .q-bars::after{bottom:0;transform:translateY(100%)}
#wic-q .q-bars.on::before,#wic-q .q-bars.on::after{transform:none}
#wic-q .q-dlg{position:fixed;left:50%;bottom:calc(9vh + 14px);transform:translateX(-50%);width:min(760px,92vw);min-height:92px;display:flex;gap:14px;align-items:center;padding:14px 18px;background:linear-gradient(rgba(20,16,12,.9),rgba(10,8,6,.94));border:1px solid #6b5630;border-radius:6px;box-shadow:0 6px 30px rgba(0,0,0,.6);color:#f6ead0;z-index:31;pointer-events:auto;cursor:pointer}
#wic-q .q-dlg svg{flex:none;width:84px;height:84px;border-radius:50%;border:2px solid #b8913e;background:#222}
#wic-q .q-dlg .q-who{font:700 12px/1 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#e9c46a;margin-bottom:6px}
#wic-q .q-dlg .q-role{font-weight:500;letter-spacing:.04em;text-transform:none;color:#b9a77f;margin-left:8px}
#wic-q .q-dlg .q-line{font:400 18px/1.4 Georgia,serif}
#wic-q .q-dlg.narr .q-line{font-style:italic;color:#e6dcc4;text-align:center;width:100%}
#wic-q .q-dlg .q-next{position:absolute;right:12px;bottom:8px;font:600 11px/1 system-ui,sans-serif;color:#b9a77f;animation:qPulse 1s infinite alternate}
@keyframes qPulse{from{opacity:.35}to{opacity:1}}
#wic-q .q-card{position:fixed;left:50%;top:26%;transform:translateX(-50%);text-align:center;color:#fff3d6;pointer-events:none;transition:opacity .8s;z-index:32;text-shadow:0 2px 12px #000,0 0 30px rgba(0,0,0,.8)}
#wic-q .q-card small{display:block;font:700 13px/1 system-ui,sans-serif;letter-spacing:.4em;color:#d9b45a;text-transform:uppercase;margin-bottom:12px}
#wic-q .q-card b{display:block;font:400 44px/1.1 Georgia,serif;letter-spacing:.04em}
#wic-q .q-card i{display:block;font:400 16px/1.5 Georgia,serif;color:#e6d6b0;margin-top:12px;max-width:560px}
#wic-q .q-prompt{position:fixed;left:50%;top:58%;transform:translateX(-50%);padding:7px 14px;background:rgba(12,10,8,.78);border:1px solid #8a6f3a;border-radius:4px;color:#f6ead0;font:600 14px/1 system-ui,sans-serif;pointer-events:auto;cursor:pointer;z-index:29}
#wic-q .q-prompt kbd{display:inline-block;padding:2px 6px;margin-right:8px;border:1px solid #e9c46a;border-radius:3px;color:#e9c46a;font:700 12px/1 system-ui,sans-serif}
body.explore #wic-q{display:none}`;

// a head-and-shoulders portrait from the NPC's palette (no external art)
function portrait(n) {
  const hat = n.hat === 'scarf' ? `<path d="M22 40 Q42 14 62 40 L62 46 Q42 36 22 46Z" fill="${n.trim}"/>`
    : n.hat === 'hood' ? `<path d="M18 52 Q16 18 42 16 Q68 18 66 52 Q58 30 42 30 Q26 30 18 52Z" fill="${n.robe}"/>`
    : n.hat === 'tall' ? `<path d="M26 34 L58 34 L52 6 L32 6Z" fill="${n.trim}"/><rect x="20" y="32" width="44" height="5" rx="2" fill="${n.trim}"/>` : '';
  return `<svg viewBox="0 0 84 84"><defs><radialGradient id="pg${n.id}" cx=".5" cy=".35"><stop offset="0" stop-color="#4a3c28"/><stop offset="1" stop-color="#141008"/></radialGradient></defs>
<rect width="84" height="84" fill="url(#pg${n.id})"/><path d="M8 84 Q10 58 42 56 Q74 58 76 84Z" fill="${n.robe}"/><path d="M34 57 L42 70 L50 57" fill="none" stroke="${n.trim}" stroke-width="3"/>
<ellipse cx="42" cy="40" rx="15" ry="17" fill="${n.skin}"/><path d="M27 38 Q28 20 42 21 Q56 20 57 38 Q50 28 42 28 Q34 28 27 38Z" fill="${n.hair}"/>
<circle cx="36.5" cy="41" r="1.6" fill="#1a120a"/><circle cx="47.5" cy="41" r="1.6" fill="#1a120a"/><path d="M37 49 Q42 52 47 49" stroke="#6a3a2a" stroke-width="1.6" fill="none"/>${hat}</svg>`;
}

export async function install(game) {
  const THREE = game.THREE, P = game.player, sys = () => game.mobSystem;
  const quests = {}, order = [];
  try {
    const idx = await (await fetch(new URL('index.json', BASE))).json();
    for (const id of idx.main) { quests[id] = await (await fetch(new URL(id + '.json', BASE))).json(); order.push(id); }
  } catch (e) { console.warn('[quests] data not loaded:', e.message); return; }
  if (!game.handlers) return;   // disposed while loading
  const save = game.save.quests ||= {};
  const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; parent?.appendChild(e); return e; };
  const root = el('div', null, document.body); root.id = 'wic-q';
  el('style', null, root, CSS);
  const bars = el('div', 'q-bars', root);
  const track = el('div', 'q-track', root); track.hidden = true;
  const dlg = el('div', 'q-dlg', root); dlg.hidden = true;
  const card = el('div', 'q-card', root); card.style.opacity = 0;
  const prompt = el('div', 'q-prompt', root); prompt.hidden = true;
  const offs = [];
  const listen = (t, ev, fn) => { t.addEventListener(ev, fn); offs.push(() => t.removeEventListener(ev, fn)); };

  // ---------- world objects: NPCs, objective beam, collectible
  const world = new THREE.Group(); world.name = 'quests'; game.root.add(world);
  const npcs = {};
  function npcModel(n) {
    const g = new THREE.Group(), M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.42, 1.25, 10), M(n.robe)); robe.position.y = 0.62;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.4, 10), M(n.robe)); torso.position.y = 1.4;
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 14), M(n.trim)); trim.position.y = 1.58; trim.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), M(n.skin)); head.position.y = 1.78;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M(n.hat === 'hood' ? n.robe : n.hair)); hair.position.y = 1.8;
    hair.scale.set(1, 1, 1.05);
    for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.55, 6), M(n.robe)); a.position.set(s * 0.25, 1.28, 0.06); a.rotation.z = s * 0.18; g.add(a); }
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), M('#1a120a')); e.position.set(s * 0.055, 1.8, 0.135); g.add(e); }
    g.add(robe, torso, trim, head, hair);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.scale.setScalar(n.scale || 1);
    // floating quest marker (gold diamond), shown when the NPC has something for the player
    const mk = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xffc94a }));
    mk.scale.set(1, 1.6, 1); mk.position.y = 2.35 / (n.scale || 1); g.add(mk); g.userData.marker = mk;
    game.npcRig?.attach(g, n);   // graphics: rigged animated model from site/models/npcs/<id>.glb replaces the figure above
    return g;
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.renderOrder = 5; beam.visible = false; world.add(beam);
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: 0xc8913a, emissive: 0xffa040, emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.3 }));
  shard.visible = false; world.add(shard);
  const place = (obj, x, y, z, yawDeg) => { obj.position.set(x, z, -y); if (yawDeg != null) obj.rotation.y = yawDeg * Math.PI / 180; };

  function placeNpcs(q) {   // snapped to walkable ground once the tiles under them have streamed in
    for (const [id, n] of Object.entries(q.npcs)) {
      if (n.x == null || npcs[id]?.placed) continue;
      if (!game.world.covered?.(n.x, n.y)) continue;
      const s = sys()?.findSpot?.(n.x, n.y, 6) || (game.groundAt(n.x, n.y) != null ? { x: n.x, y: n.y, z: game.groundAt(n.x, n.y) } : null);
      if (!s) continue;
      const g = npcs[id]?.g || npcModel({ ...n, id }); world.add(g);
      place(g, s.x, s.y, s.z, n.face);
      npcs[id] = { ...n, id, g, x: s.x, y: s.y, z: s.z, placed: true };
    }
  }

  // ---------- quest state
  const st = { q: null, step: -1, phase: 'idle', tracked: new Set(), kills: 0, ensureT: 0, cardT: 0 };
  const cur = () => st.q && st.q.steps[st.step];
  function firstOpen() { return order.find(id => !save[id]?.done); }
  function begin(id, fresh) {
    const q = quests[id]; st.q = q; save[id] ||= { step: 0 }; st.step = save[id].step; game.persist();
    placeNpcs(q);
    if (fresh && st.step === 0) { showCard(q.chapter, q.title, q.summary, 5); say(q.intro || [], () => enterStep()); }
    else enterStep();
  }
  function enterStep() {
    const s = cur(); if (!s) return;
    st.kills = 0; st.tracked.clear(); st.ensureT = 0; st.phase = 'active';
    if (s.type === 'kill' && s.spawn) spawnPack(s);
    if (s.type === 'collect') { const z = game.groundAt(s.place.x, s.place.y) ?? P.z; place(shard, s.place.x, s.place.y, z + 0.6); shard.visible = true; }
    game.emit('questStep', { quest: st.q.id, step: s.id, index: st.step });
    if (s.intro) say(s.intro);
  }
  function spawnPack(s) {
    const S = sys(); if (!S) return;
    s.spawn.forEach((t, i) => { if ([...st.tracked].filter(m => !m.dead && !m.removed).length + st.kills >= s.count) return;
      const a = i / s.spawn.length * 6.283; try { const m = S.spawn(t, s.at.x + Math.cos(a) * 4, s.at.y + Math.sin(a) * 4, null); m.questMob = true; st.tracked.add(m); } catch (e) { console.warn('[quests] spawn', e.message); } });
  }
  function completeStep() {
    const s = cur(); st.phase = 'outro'; shard.visible = false; sfx.play?.('pickup');
    say(s.type === 'talk' ? [] : (s.dialogue || []), () => {
      st.step++; save[st.q.id].step = st.step; game.persist();
      if (st.step >= st.q.steps.length) return finish();
      enterStep();
    });
  }
  function finish() {
    const q = st.q, r = q.rewards || {};
    save[q.id] = { step: q.steps.length, done: true }; st.phase = 'done';
    if (r.title) { (game.save.titles ||= []).includes(r.title) || game.save.titles.push(r.title); }
    game.persist();
    if (r.xp) game.gainXp(r.xp);
    for (const it of r.items || []) game.items?.give?.(it);
    showCard('Quest complete', q.title, [r.title && `Title earned: ${r.title}`, r.xp && `+${r.xp} XP`, ...(r.items || []).map(i => ITEMS[i]?.name)].filter(Boolean).join(' · '), 6);
    sfx.play?.('levelup');
    game.emit('questComplete', { quest: q.id });
    st.q = null; const nxt = firstOpen(); if (nxt) begin(nxt, true);
  }

  // ---------- dialogue
  const dq = { lines: [], i: 0, done: null };
  function say(lines, done) {
    if (!lines.length) { done?.(); return; }
    dq.lines = lines; dq.i = 0; dq.done = done; show();
  }
  function show() {
    dq.at = game.time; const L = dq.lines[dq.i], q = st.q, n = L.who === 'player' ? null : (npcs[L.who] || q?.npcs?.[L.who] || {});
    const narr = L.who === 'narrator';
    dlg.className = 'q-dlg' + (narr ? ' narr' : ''); dlg.hidden = false; bars.classList.add('on');
    if (narr) dlg.innerHTML = `<div class="q-line">${L.line}</div><div class="q-next">E ▸</div>`;
    else {
      const cls = game.caster?.classes?.[game.caster.cls], pl = { id: 'pl', robe: cls?.color || '#556', trim: '#e9c46a', skin: '#d8b090', hair: '#2a2018', hat: 'tall' };
      const who = L.who === 'player' ? 'You' : n.name, role = L.who === 'player' ? (cls?.name || '') : (n.role || '');
      dlg.innerHTML = `${portrait(L.who === 'player' ? pl : { ...n, id: L.who })}<div><div class="q-who">${who}<span class="q-role">${role}</span></div><div class="q-line">${L.line}</div></div><div class="q-next">E ▸</div>`;
    }
    if (n?.g) { const dx = n.x - P.x, dy = n.y - P.y; if (Math.hypot(dx, dy) < 8) { n.g.rotation.y = Math.atan2(-dx, dy); } }
  }
  function advance() {
    if (dlg.hidden) return false;
    if (++dq.i < dq.lines.length) { show(); return true; }
    dlg.hidden = true; bars.classList.remove('on'); const d = dq.done; dq.done = null; d?.(); return true;
  }
  function showCard(small, big, sub, secs) { card.innerHTML = `<small>${small}</small><b>${big}</b>${sub ? `<i>${sub}</i>` : ''}`; card.style.opacity = 1; st.cardT = secs; }

  // ---------- interaction
  function nearNpc() { let b = null, bd = TALK_R; for (const n of Object.values(npcs)) { const d = Math.hypot(n.x - P.x, n.y - P.y); if (d < bd) { bd = d; b = n; } } return b; }
  function interact() {
    if (advance()) return true;
    const n = nearNpc(), s = cur(); if (!n) return false;
    if (st.phase === 'active' && s?.type === 'talk' && s.npc === n.id) { st.phase = 'talking'; say(s.dialogue || [], () => completeStep()); return true; }
    say([{ who: n.id, line: n.idle || (s ? `${s.text}. I'll be here.` : 'Mind how you go, Warden.') }]); return true;
  }
  listen(window, 'keydown', e => { if (e.target instanceof HTMLInputElement || e.repeat) return; if (e.code === 'KeyE' || e.code === 'Enter') { if (interact()) e.stopPropagation(); } }, true);
  listen(dlg, 'click', e => { e.stopPropagation(); advance(); });
  listen(prompt, 'click', e => { e.stopPropagation(); interact(); });

  // ---------- objective / tracker
  function objective() {
    const s = cur(); if (!s || !st.q) return null;
    const o = { quest: st.q.id, step: s.id, index: st.step, type: s.type, text: s.text, phase: st.phase, dialogue: !dlg.hidden };
    if (s.type === 'talk') { const n = npcs[s.npc] || st.q.npcs[s.npc]; Object.assign(o, { x: n.x, y: n.y, npc: s.npc, r: TALK_R - 0.5 }); }
    else if (s.type === 'reach' || s.type === 'collect') Object.assign(o, { x: s.place.x, y: s.place.y, r: s.place.r });
    else if (s.type === 'kill') {
      const live = s.spawn ? [...st.tracked].filter(m => !m.dead && !m.removed) : game.mobs.filter(m => !m.dead && m.type?.id === s.mob);
      const t = live.sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y))[0];
      Object.assign(o, { x: t ? t.x : s.at.x, y: t ? t.y : s.at.y, r: 8, mobs: live, left: s.count - st.kills });
    }
    return o;
  }
  function updateTracker(o) {
    if (!st.q) { const last = order.filter(id => save[id]?.done).pop(); track.hidden = !last; if (last) track.innerHTML = `<div class="q-ch">Next</div><div class="q-ob">${quests[last].next || ''}</div>`; return; }
    track.hidden = false;
    let txt = o?.text || '';
    if (o?.type === 'kill' && cur().count > 1) txt += ` (${cur().count - o.left}/${cur().count})`;
    let dist = '';
    if (o && o.x != null) {
      const dx = o.x - P.x, dy = o.y - P.y, d = Math.hypot(dx, dy), rel = Math.atan2(-dx, dy) - P.yaw;
      dist = ` <span class="q-dist">${Math.round(d)} m</span> <span class="q-arrow" style="transform:rotate(${(-rel * 180 / Math.PI).toFixed(0)}deg)"></span>`;
    }
    track.innerHTML = `<div class="q-ch">${st.q.chapter}</div><div class="q-ti">${st.q.title}</div><div class="q-ob">${txt}${dist}</div>`;
  }

  const sysObj = game.add({ update(dt) {
    if (st.cardT > 0 && (st.cardT -= dt) <= 0) card.style.opacity = 0;
    if (!st.q && st.phase === 'idle' && game.save.cls && !game.paused && !P.pendingPlace) { const id = firstOpen(); if (id) begin(id, true); else st.phase = 'done'; }
    if (!st.q) { updateTracker(null); prompt.hidden = true; beam.visible = false; return; }
    placeNpcs(st.q);
    // nobody gets hit mid-sentence, for up to 8 s a line (a player or bot that ignores the box is not left invulnerable)
    if (!dlg.hidden && game.time - dq.at < 8) game.invulnUntil = Math.max(game.invulnUntil || 0, game.time + 0.3);
    const s = cur(), o = objective();
    // NPC markers: only the NPC the current talk step points at
    for (const n of Object.values(npcs)) { const mk = n.g.userData.marker; mk.visible = s?.type === 'talk' && s.npc === n.id; mk.rotation.y += dt * 2; mk.position.y = 2.35 / (n.scale || 1) + Math.sin(game.time * 3) * 0.06; }
    if (st.phase === 'active' && s) {
      if ((s.type === 'reach' || s.type === 'collect') && Math.hypot(s.place.x - P.x, s.place.y - P.y) < s.place.r) completeStep();
      else if (s.type === 'kill') {
        if (st.kills >= s.count) completeStep();
        else if ((st.ensureT -= dt) <= 0) {   // keep the objective winnable: respawn a quest pack lost to despawn, wake the boss if it is between respawns
          st.ensureT = 3;
          if (s.spawn && ![...st.tracked].some(m => !m.dead && !m.removed)) spawnPack(s);
          if (s.mob && !game.mobs.some(m => !m.dead && m.type?.id === s.mob) && Math.hypot(s.at.x - P.x, s.at.y - P.y) < 60) {
            try { const m = sys()?.spawn(s.mob, s.at.x, s.at.y, null); if (m) m.questMob = true; } catch (e) { console.warn('[quests] spawn', e.message); }
          }
        }
      }
    }
    if (shard.visible) { shard.rotation.y += dt * 1.5; shard.position.y += Math.sin(game.time * 2.5) * 0.002; }
    beam.visible = !!(o && o.x != null && st.phase === 'active');
    if (beam.visible) { const z = game.groundAt(o.x, o.y, P.z + 20) ?? P.z; beam.position.set(o.x, z + 15, -o.y); beam.material.opacity = 0.16 + 0.06 * Math.sin(game.time * 2); }
    const n = dlg.hidden ? nearNpc() : null;
    prompt.hidden = !n; if (n) prompt.innerHTML = `<kbd>E</kbd>Talk to ${n.name}`;
    updateTracker(o);
  }, dispose() { for (const f of offs) f(); root.remove(); game.root.remove(world); if (window.__wicStory === stage) delete window.__wicStory; } });
  offs.push(game.on('kill', e => {
    const s = cur(); if (!s || s.type !== 'kill' || st.phase !== 'active') return;
    if (s.spawn ? st.tracked.has(e.mob) : e.mob?.type?.id === s.mob) st.kills++;
  }));

  game.quests = { quests, order, save, get state() { return { quest: st.q?.id || null, step: st.step, phase: st.phase }; },
    get dialogueOpen() { return !dlg.hidden; }, get speaker() { return dlg.hidden ? null : dq.lines[dq.i]?.who || null; }, objective, interact, advance, npcs };

  // ---------- QA story hook: stage the opening beats through the real systems, one screenshot per call
  async function settle() { const t0 = performance.now(); while ((P.pendingPlace || !window.__player?.settled?.(60)) && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 200)); }
  async function goNear(x, y, d, face) {   // stand d m from (x,y), looking at it
    const a = (face ?? 200) * Math.PI / 180; let tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d, tz = null;
    const s = sys()?.findSpot?.(tx, ty, 4); if (s) { tx = s.x; ty = s.y; tz = s.z; }
    // look a little to the left of the target so the third-person body does not hide it (the target sits right of centre)
    const L = Math.hypot(x - tx, y - ty) || 1, side = Math.min(1.4, L * 0.35), lx = x - (y - ty) / L * side, ly = y + (x - tx) / L * side;
    P.teleport(tx, ty, tz ?? game.groundAt(tx, ty) ?? P.z, [lx, ly]);   // with z: no 'open ground 30 m away' search await settle(); placeNpcs(st.q || quests.prologue);
    for (const n of Object.values(npcs)) if (Math.hypot(n.x - x, n.y - y) < 0.5) n.g.rotation.y = Math.atan2(P.x - n.x, -(P.y - n.y));
  }
  async function stage(step) {
    const q = quests.prologue, at = i => { save.prologue = { step: i }; st.q = q; st.step = i; st.phase = 'active'; };
    const line = (L, i) => { dq.lines = L; dq.i = i; dq.done = null; show(); return L[i].line; };
    dlg.hidden = true; bars.classList.remove('on');
    const S = sys();
    if (step === 0) { stage.view = P.view; P.view = 3; if (S) S.encountersEnabled = false; }
    if (S && step < 8) for (const m of [...game.mobs]) if (!m.dead && !m.removed && !(step === 6 && m.type?.id === 'bellwarden')) S.remove(m);   // a calm square for the scene
    switch (step) {
      case 0: at(0); placeNpcs(q); showCard(q.chapter, q.title, q.summary, 8); return `${q.chapter}: ${q.title}`;
      case 1: { at(0); const n = npcs.nell || q.npcs.nell; await goNear(n.x, n.y, 3.2, 200); card.style.opacity = 0; return line(q.steps[0].dialogue, 0); }
      case 2: return line(q.steps[0].dialogue, 3);
      case 3: { at(1); enterStep(); const p = q.steps[1].place; await goNear(p.x, p.y, 7, 110); return 'Quest tracker: ' + q.steps[1].text; }
      case 4: { const p = q.steps[1].place; await goNear(p.x, p.y, 1.8, 110); return line(q.steps[1].dialogue, 0); }
      case 5: { at(3); shard.visible = false; const n = npcs.pip || q.npcs.pip; await goNear(n.x, n.y, 2.6, 90); return line(q.steps[3].dialogue, 1); }
      case 6: { at(4); const b = q.steps[4].at; await goNear(b.x, b.y, 12, 100);
        if (!game.mobs.some(m => !m.dead && m.type?.id === 'bellwarden')) { const m = S?.spawn('bellwarden', b.x, b.y, null); if (m) m.questMob = true; }
        return line(q.steps[4].intro, 0); }
      case 7: { const n = npcs.nell || q.npcs.nell; at(5); await goNear(n.x, n.y, 3.2, 200); line(q.steps[5].dialogue, 2);
        showCard('Quest complete', q.title, `Title earned: ${q.rewards.title} · +${q.rewards.xp} XP · ${ITEMS[q.rewards.items[0]].name}`, 10); return `Quest complete: ${q.title}`; }
      default: card.style.opacity = 0; if (S) S.encountersEnabled = true; if (stage.view) P.view = stage.view; return null;
    }
  }
  window.__wicStory = stage;
  offs.push(() => { delete game.quests; });
  void sysObj;
}
