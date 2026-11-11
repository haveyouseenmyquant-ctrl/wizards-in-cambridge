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

ITEMS.quest_ringers_sally = { name: "Ringer's Sallies", slot: 'ring', rarity: 'rare', quest: true, stats: { cdr: 0.06, power: 0.03 },
  desc: 'Striped wool from a bell-rope grip. Every fourth cast rings the Quarters and restores 8 mana.',
  fx(c) { let n = 0; c.on('cast', () => { if (++n % 4) return; const s = c.game.stats; s.mana = Math.min(s.maxMana, s.mana + 8); c.S.fx?.burst?.(c.S.pp(1.4), 0xe9c46a, 8, 2, 0.5); }); },
  test(t) { const s = t.game.stats; s.mana = 10; for (let i = 0; i < 4; i++) t.game.emit('cast', {}); return [s.mana >= 18 || s.mana === s.maxMana, `mana ${s.mana}`]; } };

ITEMS.quest_crest_ward = { name: 'Crest-Stone Ward', slot: 'robe', rarity: 'epic', quest: true, stats: { armor: 8, maxHp: 20 },
  desc: "A shard of the King's gate lion's shield. Every third hit taken raises a 15-point stone shield (6 s cooldown).",
  fx(c) { let n = 0, ready = 0; c.on('playerHit', () => { if (++n % 3 || c.S.t < ready) return; ready = c.S.t + 6; const g = c.game; g.shield = Math.min(45, (g.shield || 0) + 15); c.S.fx?.burst?.(c.S.pp(1), 0xcfc6b0, 20, 2, 0.6); }); },
  test(t) { t.game.shield = 0; for (let i = 0; i < 3; i++) t.game.emit('playerHit', { amount: 2 }); return [t.game.shield >= 15, `shield ${t.game.shield}`]; } };

ITEMS.quest_ferrymans_coin = { name: "Ferryman's Coin", slot: 'amulet', rarity: 'epic', quest: true, stats: { maxMana: 20, power: 0.04, speedMult: 0.04 },
  desc: "Wat Gedney's fare, a drowned penny on a cord. Every dash carries you on the river: restore 6 mana and 4 health.",
  fx(c) { c.on('dash', () => { const s = c.game.stats; s.mana = Math.min(s.maxMana, s.mana + 6); c.game.heal(4); c.S.fx?.burst?.(c.S.pp(0.4), 0x40d0c0, 12, 2, 0.5); }); },
  test(t) { const s = t.game.stats; s.mana = 10; s.hp = 50; t.game.emit('dash', {}); return [s.mana >= 16 && s.hp >= 54, `mana ${s.mana} hp ${s.hp}`]; } };

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
#wic-q .q-dlg{position:fixed;left:50%;bottom:calc(9vh + 14px);transform:translateX(-50%);width:min(820px,94vw);min-height:104px;display:flex;gap:14px;align-items:center;padding:14px 18px;background:linear-gradient(rgba(20,16,12,.9),rgba(10,8,6,.94));border:1px solid #6b5630;border-radius:6px;box-shadow:0 6px 30px rgba(0,0,0,.6);color:#f6ead0;z-index:31;pointer-events:auto;cursor:pointer}
#wic-q .q-dlg svg{flex:none;width:96px;height:96px;border-radius:50%;border:2px solid #b8913e;background:#222}
#wic-q .q-dlg .q-who{font:700 12px/1 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#e9c46a;margin-bottom:6px}
#wic-q .q-dlg .q-role{font-weight:500;letter-spacing:.04em;text-transform:none;color:#b9a77f;margin-left:8px}
#wic-q .q-dlg .q-line{font:400 18px/1.4 Georgia,serif}
#wic-q .q-dlg.narr .q-line{font-style:italic;color:#e6dcc4;text-align:center;width:100%}
#wic-q .q-dlg .q-next{position:absolute;right:12px;bottom:8px;font:600 11px/1 system-ui,sans-serif;color:#b9a77f;animation:qPulse 1s infinite alternate}
#wic-q .q-dlg.mini{left:auto;right:16px;top:calc(30vh + 92px);bottom:auto;transform:none;width:min(300px,46vw);min-height:0;padding:7px 10px;gap:8px;pointer-events:none;opacity:.9;box-shadow:none}
#wic-q .q-dlg.mini svg{width:36px;height:36px}
#wic-q .q-dlg.mini .q-line{font-size:13px;line-height:1.3}
#wic-q .q-dlg.mini .q-who{font-size:10px;margin-bottom:3px}
body.q-cine #status,body.q-cine .gh-loot{visibility:hidden}
body.q-talk #game-hud,body.q-talk #minimap,body.q-talk #touch-buttons{opacity:0;pointer-events:none;transition:opacity .3s}
#wic-q .q-dlg .q-opts{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:5px}
#wic-q .q-dlg .q-opts li{font:400 17px/1.3 Georgia,serif;padding:5px 10px;border:1px solid #5a4828;border-radius:4px;background:rgba(60,46,24,.35);cursor:pointer}
#wic-q .q-dlg .q-opts li:first-child{border-color:#c9a24e;background:rgba(120,90,36,.4)}
#wic-q .q-dlg .q-opts li b{display:inline-block;width:20px;color:#e9c46a;font:700 13px/1 system-ui,sans-serif}
#wic-q .q-dlg.mini .q-role,#wic-q .q-dlg.mini .q-next{display:none}
@keyframes qPulse{from{opacity:.35}to{opacity:1}}
#wic-q .q-fade{position:fixed;inset:0;background:#05070a;pointer-events:none;z-index:31;opacity:0;display:flex;align-items:center;justify-content:center;font:italic 22px/1.4 Georgia,serif;color:#e6d6b0;text-shadow:0 2px 10px #000}
#wic-q .q-fade.on{animation:qFade 3.2s ease-in-out forwards}
@keyframes qFade{0%{opacity:0}15%{opacity:1}65%{opacity:1}100%{opacity:0}}
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
    : n.hat === 'boater' ? `<ellipse cx="42" cy="30" rx="26" ry="5" fill="${n.trim}"/><rect x="29" y="16" width="26" height="14" rx="3" fill="${n.trim}"/><rect x="29" y="24" width="26" height="4" fill="${n.robe}"/>`
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
  const fade = el('div', 'q-fade', root);
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
    if (fresh && st.step === 0) { showCard(q.chapter, q.title, q.summary, 3.2); say(q.intro || [], () => enterStep()); }
    else enterStep();
  }
  function enterStep() {
    const s = cur(); if (!s) return;
    st.kills = 0; st.tracked.clear(); st.ensureT = 0; st.phase = 'active';
    if (s.type === 'kill' && s.spawn) spawnPack(s);
    if (s.type === 'collect') { const z = game.groundAt(s.place.x, s.place.y) ?? P.z; place(shard, s.place.x, s.place.y, z + 0.6); shard.visible = true; }
    game.emit('questStep', { quest: st.q.id, step: s.id, index: st.step });
    if (s.type === 'kill' && s.mob) st.reveal = { id: s.mob, t0: game.time, dur: 3.2 };
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
      if (s.travel) travel(s.travel);
      st.step++; save[st.q.id].step = st.step; game.persist();
      if (st.step >= st.q.steps.length) return finish();
      enterStep();
    });
  }
  function travel(t) {
    fade.textContent = t.caption || ''; fade.classList.remove('on'); void fade.offsetWidth; fade.classList.add('on');
    const sp = sys()?.findSpot?.(t.x, t.y, 3);
    P.teleport(sp ? sp.x : t.x, sp ? sp.y : t.y, sp ? sp.z : t.z, t.look || null);
    game.invulnUntil = Math.max(game.invulnUntil || 0, game.time + 4);
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
    st.q = null; st.phase = firstOpen() ? 'idle' : 'done';   // the next chapter opens once this card has faded
  }

  // ---------- dialogue
  const dq = { lines: [], i: 0, done: null };
  function say(lines, done) {
    if (!lines.length) { done?.(); return; }
    dq.lines = lines; dq.i = 0; dq.done = done; dq.at0 = game.time; dq.npc = lines.map(L => npcs[L.who]).find(Boolean) || null; show();
  }
  function show() {
    dq.at = game.time; const L = dq.lines[dq.i], q = st.q, n = L.who === 'player' ? null : (npcs[L.who] || q?.npcs?.[L.who] || {});
    const narr = L.who === 'narrator';
    dlg.className = 'q-dlg' + (narr ? ' narr' : '') + (st.combat ? ' mini' : ''); dlg.hidden = false; bars.classList.toggle('on', !st.combat);
    if (narr) dlg.innerHTML = `<div class="q-line">${L.line}</div><div class="q-next">E ▸</div>`;
    else if (L.choices) {   // a reply for the player to pick: E / 1 takes the first, 2-4 or a click the others
      const cls = game.caster?.classes?.[game.caster.cls], pl = { id: 'pl', robe: cls?.color || '#556', trim: '#e9c46a', skin: '#d8b090', hair: '#2a2018', hat: 'tall' };
      dlg.innerHTML = `${portrait(pl)}<div style="flex:1"><div class="q-who">You<span class="q-role">reply</span></div><ol class="q-opts">${L.choices.map((c, k) => `<li data-k="${k}"><b>${k + 1}</b>${c.text}</li>`).join('')}</ol></div>`;
    } else {
      const cls = game.caster?.classes?.[game.caster.cls], pl = { id: 'pl', robe: cls?.color || '#556', trim: '#e9c46a', skin: '#d8b090', hair: '#2a2018', hat: 'tall' };
      const who = L.who === 'player' ? 'You' : n.name, role = L.who === 'player' ? (cls?.name || '') : (n.role || '');
      dlg.innerHTML = `${portrait(L.who === 'player' ? pl : { ...n, id: L.who })}<div><div class="q-who">${who}<span class="q-role">${role}</span></div><div class="q-line">${L.line}</div></div><div class="q-next">E ▸</div>`;
    }
    const sp = n?.g ? n : dq.npc;   // the two face each other for the conversation
    if (sp?.g) { const dx = sp.x - P.x, dy = sp.y - P.y; if (Math.hypot(dx, dy) < 8) { sp.g.rotation.y = Math.atan2(-dx, dy); P.yaw = Math.atan2(-dx, dy); } }
  }
  function choose(k) {
    const L = dq.lines[dq.i], c = L?.choices?.[k]; if (!c) return false;
    (save.choices ||= {})[`${st.q?.id || ''}.${cur()?.id || ''}`] = k;
    dq.lines = [...dq.lines.slice(0, dq.i), { who: 'player', line: c.text }, ...(c.reply || []), ...dq.lines.slice(dq.i + 1)];
    show(); return true;
  }
  function advance() {
    if (dlg.hidden) return false;
    if (dq.lines[dq.i]?.choices) return choose(0);
    if (++dq.i < dq.lines.length) { show(); return true; }
    dlg.hidden = true; bars.classList.remove('on'); const d = dq.done; dq.done = null; d?.(); return true;
  }
  // dialogue camera: an over-the-shoulder two-shot on the NPC in the conversation, eased in. Runs right after the
  // player's own third-person camera (main.js places the camera after game.update), so closing the box hands it back.
  const camV = new THREE.Vector3(), camT = new THREE.Vector3();
  // over either shoulder, whichever has a clear line from the target's face (stall canopies, walls); else pulled in
  function shoulderShot(px, py, pz, nx, ny, hz, back = 1.5, side = 0.75, eh = 1.8) {
    const dx = nx - px, dy = ny - py, L = Math.hypot(dx, dy); if (L < 0.8 || L > 9) return null;
    const ux = dx / L, uy = dy / L, ez = pz + eh;
    let best = null;
    for (const sd of [side, -side]) {
      const cx = px - ux * back + uy * sd, cy = py - uy * back - ux * sd, ddx = cx - nx, ddy = cy - ny, ddz = ez - hz, D = Math.hypot(ddx, ddy, ddz);
      const hit = P.camOcclude ? P.camOcclude(nx, hz, -ny, ddx / D, ddz / D, -ddy / D, D) : Infinity, f = Math.min(1, (hit - 0.3) / D);
      if (!best || f > best.f) best = { f, x: nx + ddx * f, y: ny + ddy * f, z: hz + ddz * f };
      if (f >= 1) break;
    }
    return best;
  }
  // shot / reverse shot: the NPC speaking is framed tight over the player's shoulder (lens pushed in), the player's
  // lines are framed over the NPC's shoulder; the camera glides between set-ups and the lens eases back afterwards
  const cs = { fov0: null, on: false };
  function frameSpeaker(cam, dt) {
    const n = dq.npc?.g ? dq.npc : st.focus; if (!n || !cam) return false;
    const hz = n.hz ?? n.z + 1.62 * (n.scale || 1);
    const ph = P.z + 1.62, L = dlg.hidden ? null : dq.lines[dq.i]; let rev = L?.who === 'player' && !L.choices && !!n.g, wide = !n.g, best = null;
    if (rev) best = shoulderShot(n.x, n.y, n.z ?? P.z, P.x, P.y, ph, 1.1, 0.9, 1.4 * (n.scale || 1));
    if (!best || best.f < 0.5) { rev = false; if (!wide) best = shoulderShot(P.x, P.y, P.z, n.x, n.y, hz, 1.2, 1.25, 1.42); }   // camera under the hat brim
    if (!best || best.f < 0.5) { best = shoulderShot(P.x, P.y, P.z, n.x, n.y, hz); wide = true; }   // cramped (stall canopy, wall) or a place, not a person: wider set-up
    if (!best || best.f < 0.45) return false;
    camT.set(best.x, best.z, -best.y);
    const snap = !cs.on || stage.on || cam.position.distanceToSquared(camV) > 400;
    if (!cs.on) { cs.fov0 = cam.fov; camV.copy(cam.position); cs.on = true; cs.t0 = game.time; }
    const a = snap && stage.on ? 1 : 1 - Math.exp(-dt * 6);
    camV.lerp(camT, a); cam.position.copy(camV);
    const k = Math.min(1, (game.time - cs.t0) / 0.5), e = stage.on ? 1 : k * k * (3 - 2 * k);
    const fov = cs.fov0 + ((wide ? cs.fov0 : rev ? 44 : 40) - cs.fov0) * e;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (rev) cam.lookAt(P.x, ph - 0.1, -P.y); else cam.lookAt(n.x, hz - 0.18 * (n.scale || 1), -n.y);
    return true;
  }
  function endFraming(cam) { if (!cs.on) return; cs.on = false; if (cs.fov0 && cam) { cam.fov = cs.fov0; cam.updateProjectionMatrix(); } }
  // boss reveal: when a named-boss step opens, a low shot from behind the player looking up at the boss for ~3 s
  function revealBoss(cam) {
    const R = st.reveal, t = game.time - R.t0; if (t > R.dur) { st.reveal = null; return false; }
    const m = game.mobs.filter(b => !b.dead && !b.removed && b.type?.id === R.id).sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y))[0];
    if (!m || Math.hypot(m.x - P.x, m.y - P.y) > 45) return false;
    const dx = m.x - P.x, dy = m.y - P.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const k = Math.min(1, t / 0.6, (R.dur - t) / 0.5), e = k * k * (3 - 2 * k), push = Math.min(t / R.dur, 1) * 1.2;   // slow push-in
    const hz = (m.z ?? P.z) + (m.type.hover || 0) + m.type.radius * 1.9;
    camT.set(P.x - ux * (2.2 - push) - uy * 1.1, P.z + 0.9, -(P.y - uy * (2.2 - push) + ux * 1.1));
    camV.copy(cam.position).lerp(camT, e); cam.position.copy(camV);
    cam.lookAt(m.x, hz * e + (P.z + 1.6) * (1 - e), -m.y);
    return true;
  }
  const cam3 = P.applyCamera3;
  if (cam3) { P.applyCamera3 = function (cam, dt) { cam3.call(this, cam, dt); if (window.__cam) return; if (st.reveal && revealBoss(cam)) return; if (!((!dlg.hidden || st.focus) && !st.combat && frameSpeaker(cam, dt))) endFraming(cam); }; offs.push(() => { P.applyCamera3 = cam3; }); }
  function hideCard() { card.style.opacity = 0; st.cardT = 0; }
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
  listen(dlg, 'click', e => { e.stopPropagation(); const k = e.target.closest?.('li[data-k]')?.dataset.k; if (k != null) choose(+k); else advance(); });
  listen(window, 'keydown', e => { const k = /^Digit([1-4])$/.exec(e.code)?.[1]; if (k && !dlg.hidden && dq.lines[dq.i]?.choices && choose(k - 1)) e.stopPropagation(); }, true);
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
    if (!st.q) { const last = order.filter(id => save[id]?.done).pop(); track.hidden = !last; if (last) track.innerHTML = `<div class="q-ch">Quest complete</div><div class="q-ti">${quests[last].title}</div><div class="q-ob">${quests[last].next || ''}</div>`; return; }
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

  function cine() {
    if (st.cardT > 0 && !track.hidden) track.hidden = true;   // the chapter / quest-complete card speaks for the tracker
    const on = st.cardT > 0 || !!st.reveal || (!dlg.hidden && !st.combat) || !!stage.on;
    if (on !== st.cine) { st.cine = on; document.body.classList.toggle('q-cine', on); }
    const talk = !dlg.hidden && !st.combat; if (talk !== st.talk) { st.talk = talk; document.body.classList.toggle('q-talk', talk); }
  }
  const sysObj = game.add({ update(dt) {
    if (st.cardT > 0 && (st.cardT -= dt) <= 0) card.style.opacity = 0;
    if (!st.q && st.phase === 'idle' && st.cardT <= 0 && !(game.tutorial && !game.tutorial.done) && game.save.cls && !game.paused && !P.pendingPlace) { const id = firstOpen(); if (id) begin(id, true); else st.phase = 'done'; }
    // combat: a hostile mob close by. Story text then shrinks into the quest column, the letterbox and title card get
    // out of the way, and narration advances by itself so it never covers the fight
    const combat = !(st.reveal && game.time - st.reveal.t0 < st.reveal.dur) && game.mobs.some(m => !m.dead && !m.removed && !['idle', 'patrol', 'return', 'dead'].includes(m.state) && Math.hypot(m.x - P.x, m.y - P.y) < 22);
    if (combat !== !!st.combat) { st.combat = combat; if (!dlg.hidden) { dlg.classList.toggle('mini', combat); bars.classList.toggle('on', !combat); } }
    if (combat && st.cardT > 0) { st.cardT = 0; card.style.opacity = 0; }
    if (combat && !dlg.hidden && st.phase !== 'talking' && game.time - dq.at > 3.5) advance();
    if (!st.q) { updateTracker(null); cine(); prompt.hidden = true; beam.visible = false; return; }
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
    updateTracker(o); cine();
  }, dispose() { for (const f of offs) f(); endFraming(game.camera); document.body.classList.remove('q-cine', 'q-talk'); root.remove(); game.root.remove(world); if (window.__wicStory === stage) delete window.__wicStory; } });
  // quest checkpoints: falling mid-quest puts you back at the quest's checkpoint instead of the Market Hill spawn
  const riseBtn = () => document.querySelector('.gh-death .gh-btn');
  offs.push(game.on('playerDeath', () => { const c = st.q?.checkpoint, b = riseBtn(); if (b) b.textContent = `Rise again (at ${c ? c.name : 'Market Hill'})`; }));
  offs.push(game.on('respawn', () => {
    const c = st.q?.checkpoint; if (!c) return;
    const s = sys()?.findSpot?.(c.x, c.y, 4); if (!s) return;
    P.teleport(s.x, s.y, s.z, c.look || [c.x, c.y + 10]);
  }));
  offs.push(game.on('kill', e => {
    const s = cur(); if (!s || s.type !== 'kill' || st.phase !== 'active') return;
    if (s.spawn ? st.tracked.has(e.mob) : e.mob?.type?.id === s.mob) st.kills++;
  }));

  game.quests = { quests, order, save, get state() { return { quest: st.q?.id || null, step: st.step, phase: st.phase }; },
    get dialogueOpen() { return !dlg.hidden; }, get speaker() { return dlg.hidden ? null : dq.lines[dq.i]?.who || null; }, objective, interact, advance, npcs };

  // ---------- QA story hook: stage the opening beats through the real systems, one screenshot per call
  async function settle() { const t0 = performance.now(); while ((P.pendingPlace || !window.__player?.settled?.(60)) && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 200)); }
  async function goNear(x, y, d, face, hz) {   // stand d m from (x,y), looking at it, from the side with the clearest camera
    let tx, ty, tz = null, bestF = -1;
    for (const off of [0, 40, -40, 80, -80, 120, -120, 180]) {
      const a = ((face ?? 200) + off) * Math.PI / 180, s = sys()?.findSpot?.(x + Math.cos(a) * d, y + Math.sin(a) * d, 2);
      if (!s) continue;
      const sh = shoulderShot(s.x, s.y, s.z, x, y, hz ?? (game.groundAt(x, y) ?? s.z) + 1.6), f = sh ? sh.f : 0;
      if (f > bestF + 0.05) { bestF = f; tx = s.x; ty = s.y; tz = s.z; }
      if (f >= 0.95) break;
    }
    if (tx == null) { const a = (face ?? 200) * Math.PI / 180; tx = x + Math.cos(a) * d; ty = y + Math.sin(a) * d; }
    // look a little to the left of the target so the third-person body does not hide it (the target sits right of centre)
    const L = Math.hypot(x - tx, y - ty) || 1, side = Math.min(1.4, L * 0.35), lx = x - (y - ty) / L * side, ly = y + (x - tx) / L * side;
    P.teleport(tx, ty, tz ?? game.groundAt(tx, ty) ?? P.z, [lx, ly]);   // with z: no 'open ground 30 m away' search
    await settle(); placeNpcs(st.q || quests.prologue);
    for (const n of Object.values(npcs)) if (Math.hypot(n.x - x, n.y - y) < 0.5) n.g.rotation.y = Math.atan2(P.x - n.x, -(P.y - n.y));
  }
  // QA's recorder freezes the game clock between beats, so update() never runs there: refresh what it would
  async function stage(step) { const cap = await beat(step); dlg.classList.remove('mini'); cine();
    if (st.q) updateTracker(objective());
    const who = dlg.hidden ? null : dq.lines[dq.i]?.who;   // NPC rigs (npc_rig.js) pose mid-gesture: talk for the speaker
    for (const R of game.npcRig?.live || []) { const nm = who === R.id ? 'talk' : 'idle', a = R.acts[nm]; if (a && R.cur !== nm) { R.acts[R.cur]?.stop(); a.reset().play(); R.cur = nm; } R.mixer.update(0.7); }
    return cap; }
  async function beat(step) {
    const q = quests.prologue, at = i => { save.prologue = { step: i }; st.q = q; st.step = i; st.phase = 'active'; };
    const line = (L, i) => { dq.lines = L; dq.i = i; dq.done = null; dq.at0 = game.time - 1; dq.npc = L.map(l => npcs[l.who]).find(Boolean) || null; show(); return L[i].line; };
    dlg.hidden = true; bars.classList.remove('on');
    const S = sys();
    if (step === 0) { stage.view = P.view; P.view = 3; if (S) S.encountersEnabled = false; }
    stage.on = step < 8; st.focus = null; st.reveal = null; const status = document.getElementById('status'); if (status) status.textContent = '';
    st.combat = false;
    if (S && step < 8) for (const m of [...game.mobs]) if (!m.dead && !m.removed && !(step === 6 && m.type?.id === 'bellwarden')) S.remove(m);   // a calm square for the scene
    switch (step) {
      case 0: at(0); placeNpcs(q); showCard(q.chapter, q.title, q.summary, 8); return `${q.chapter}: ${q.title}`;
      case 1: { at(0); const n = npcs.nell || q.npcs.nell; await goNear(n.x, n.y, 3.2, 200); hideCard(); return line(q.steps[0].dialogue, 0); }
      case 2: { const L = q.steps[0].dialogue, k = L.findIndex(l => l.choices); return k < 0 ? line(L, 3) : (line(L, k), 'Reply: ' + L[k].choices.map(c => c.text).join(' / ')); }
      case 3: { at(1); enterStep(); const p = q.steps[1].place, z = game.groundAt(p.x, p.y) ?? P.z; await goNear(p.x, p.y, 6, 30, z + 1.2);
        st.focus = { x: p.x, y: p.y, hz: z + 1.2 }; dq.at0 = game.time - 1; return 'Quest tracker: ' + q.steps[1].text; }
      case 4: { const p = q.steps[1].place, z = game.groundAt(p.x, p.y) ?? P.z; await goNear(p.x, p.y, 2.2, 110, z + 0.7);
        const r = line(q.steps[1].dialogue, 0); st.focus = { x: p.x, y: p.y, hz: z + 0.7 }; return r; }
      case 5: { at(3); shard.visible = false; const n = npcs.pip || q.npcs.pip; await goNear(n.x, n.y, 2.6, 50, (n.z ?? P.z) + 1.0); return line(q.steps[3].dialogue, 1); }
      case 6: { at(4); const b = q.steps[4].at; await goNear(b.x, b.y, 12, 100);
        if (!game.mobs.some(m => !m.dead && m.type?.id === 'bellwarden')) { const m = S?.spawn('bellwarden', b.x, b.y, null); if (m) m.questMob = true; }
        st.reveal = { id: 'bellwarden', t0: game.time - 1.6, dur: 1e9 }; return line(q.steps[4].intro, 0); }
      case 7: { const n = npcs.nell || q.npcs.nell; at(5); await goNear(n.x, n.y, 3.2, 200); line(q.steps[5].dialogue, 2);
        showCard('Quest complete', q.title, `Title earned: ${q.rewards.title} · +${q.rewards.xp} XP · ${ITEMS[q.rewards.items[0]].name}`, 10);
        save.prologue = { step: q.steps.length, done: true }; st.q = null; st.phase = 'staged'; return `Quest complete: ${q.title}`; }
      default: st.reveal = null; stage.on = false; hideCard(); if (S) S.encountersEnabled = true; if (stage.view) P.view = stage.view; if (st.phase === 'staged') { st.phase = 'idle'; } return null;
    }
  }
  window.__wicStory = stage;
  offs.push(() => { delete game.quests; });
  void sysObj;
}
