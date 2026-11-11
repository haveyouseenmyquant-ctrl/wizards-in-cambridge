// Gameplay s5 (task f917, issue is-20261110-192341-intr): safe new-player start. A step state machine that runs once for a
// new player (done flag in localStorage 'wic_tutorial_done'). While it runs no encounter, patrol, wave or quest mob spawns,
// stray mobs are removed and the player takes no damage. Steps: intro, move, look, jump, run, dash, broom, cast (every
// class spell once), first_mob (ONE weak, slow-telegraphing wisp), loot (guaranteed drop), equip, quest_log. Afterwards
// encounters resume lightly: for GRACE_S only one hostile at a time (extra pack members are not spawned).
// Text comes from quests/tutorial.json (Story); built-in fallback lines are used if it is missing. If tutorial_ui.js (UI
// and UX) is installed and sets window.WIC.tutorialUI it renders the prompts from window.WIC.tutorial (event 'tutorialRender'); otherwise a plain DOM panel is shown.
// Skipped with ?tutorial=0 (bots, benchmarks), and in ?nopick / ?explore runs, which stage the game themselves.
// API: window.WIC.tutorial = {active, step, steps, done, next(), advance(), skip(), line, speaker, prompt, lineIndex, lines}
export const STEPS = ['intro', 'move', 'look', 'jump', 'run', 'dash', 'broom', 'cast', 'first_mob', 'loot', 'equip', 'quest_log'];
const KEY = 'wic_tutorial_done', GRACE_S = 90;
const FALLBACK = {
  intro: ['A thread of light runs out of your fingers. You have the knack, and the old places of this city will hear it. Time to learn to use it.'],
  move: ['Walk to the end of the stalls.'], look: ['Look about you: up at the tower, over at the Guildhall.'],
  jump: ['Hop up onto the kerb.'], run: ['Faster now.'], dash: ['When something swings at you, do not be there.'],
  broom: ['Take the yard broom and hold it like you mean it.'], cast: ['Now point that knack of yours at nothing in particular.'],
  first_mob: ['A wisp has drifted in off the commons. Deal with it, and dodge when it flares.'],
  loot: ['It left something behind. Pick it up.'], equip: ['Try it on.'], quest_log: ['The tracker shows where to go next. Follow the beam.'],
};
const PROMPTS = {
  intro: ['Press E or Enter to continue', 'Tap the panel to continue'], move: ['Move with W A S D', 'Drag the joystick to walk'],
  look: ['Move the mouse to look around', 'Drag on the right of the screen to look'], jump: ['Press Space to jump', 'Tap Jump'],
  run: ['Hold Shift while moving to run', 'Tap Run while moving'], dash: ['Press Q to dash', 'Tap Dash while moving'],
  broom: ['Press B to mount the broom', 'Tap Broom'], cast: ['Cast each spell once: keys 1 to 6', 'Tap each spell button once'],
  first_mob: ['Defeat the wisp; press Q to dodge when it flares', 'Defeat the wisp; tap Dash to dodge'],
  loot: ['Walk over the glowing drop', 'Walk over the glowing drop'], equip: ['Press I, then click the item to equip it', 'Tap Satchel, then the item'],
  quest_log: ['The quest tracker (top right) shows your goal. Press E to finish', 'Tap to finish'],
};

export async function install(game) {
  const QS = new URLSearchParams(location.search);
  const stored = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
  const skipQ = QS.get('tutorial') === '0' || ((QS.has('nopick') || QS.has('explore')) && QS.get('tutorial') !== '1');
  const touch = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
  const W = window.WIC = window.WIC || {};
  const T = W.tutorial = { active: false, done: stored || skipQ, step: null, steps: STEPS.slice(), lineIndex: 0, lines: [], line: '', speaker: '',
    prompt: '', stepIndex: -1, skipped: skipQ && !stored, next, advance, skip, data: null };
  game.tutorial = T;
  if (T.done) return;

  let data = null;
  try { const r = await fetch(new URL('./quests/tutorial.json', import.meta.url)); if (r.ok) data = await r.json(); } catch {}
  T.data = data;
  const byId = Object.fromEntries((data?.steps || []).map(s => [s.id, s]));
  const names = Object.fromEntries(Object.entries(data?.npcs || {}).map(([k, v]) => [k, v.name || '']));

  const p = game.player, sys = () => game.mobSystem, offs = [];
  let st = null, wisp = null, drop = null, graceUntil = -1, ui = null;

  // ---- safety: no damage, no spawns while active; light encounters during the grace period
  const dmg0 = game.damagePlayer;
  game.damagePlayer = function (amount, source) { if (T.active) return 0; return dmg0.call(this, amount, source); };
  const S = sys(), spawn0 = S?.spawn;
  if (S) S.spawn = function (typeId, x, y, z, opts = {}) {
    const m = spawn0.call(this, typeId, x, y, z, opts);
    const block = T.active ? !opts.tutorial
      : game.time < graceUntil && !m.type?.boss && game.mobs.some(o => o !== m && !o.dead && !o.removed && !o.type?.boss);
    if (block) { this.remove(m); m.dead = true; m.noLoot = true; }
    return m;
  };
  const enc0 = S?.encountersEnabled ?? true;
  function clearStrays() { for (const m of [...game.mobs]) if (!m.tutorialMob && !m.removed) { sys()?.remove(m); m.dead = true; } }

  function begin() {
    T.active = true; T.done = false;
    if (S) S.encountersEnabled = false;
    clearStrays(); enter(0);
  }
  function lineOf(raw) {
    const m = /^([a-z_]+):\s*(.*)$/s.exec(raw); if (!m) return { who: '', text: raw };
    return { who: m[1] === 'narrator' ? '' : (names[m[1]] ?? m[1]), text: m[2] };
  }
  function enter(i) {
    if (i >= STEPS.length) return finish(false);
    const id = STEPS[i], d = byId[id];
    let lines = d?.lines?.length ? d.lines.slice() : FALLBACK[id].slice();
    if (id === 'cast' && d?.by_class?.[game.caster?.cls]) lines.push(d.by_class[game.caster.cls]);
    st = { id, i, t0: game.time, x: p.x, y: p.y, yaw: p.yaw, pitch: p.pitch ?? 0, look: 0, ok: false, slots: new Set(), mounted: false, runT: 0 };
    T.stepIndex = i; T.step = id; T.lines = lines; T.lineIndex = 0;
    T.prompt = (touch ? d?.prompt_touch : d?.prompt_kbm) || PROMPTS[id][touch ? 1 : 0];
    showLine();
    if (id === 'first_mob') spawnWisp();
    if (id === 'loot' && !drop) dropLoot(p.x + 2, p.y + 1);
    if (id === 'equip' && drop && game.items?.equipped?.[game.items.defs[drop]?.slot] === drop) st.ok = true;
    game.emit('tutorialStep', { step: id, index: i });
    render();
  }
  function showLine() { const l = lineOf(T.lines[T.lineIndex] ?? ''); T.line = l.text; T.speaker = l.who; }
  function advance() { if (!T.active) return false; if (T.lineIndex < T.lines.length - 1) { T.lineIndex++; showLine(); render(); return true; } T.lineIndex = T.lines.length; render(); return false; }
  const talked = () => T.lineIndex >= T.lines.length - 1;
  function next() { if (!T.active) return false; if (st.id === 'first_mob' && wisp && !wisp.dead) { wisp.dead = true; sys()?.remove(wisp); dropLoot(wisp.x, wisp.y); } enter(st.i + 1); return true; }
  function skip() { if (!T.active) return false; finish(true); return true; }
  function finish(skipped) {
    if (wisp && !wisp.dead) { sys()?.remove(wisp); wisp.dead = true; }
    T.active = false; T.done = true; T.skipped = skipped; T.step = 'done'; T.stepIndex = STEPS.length;
    try { localStorage.setItem(KEY, '1'); } catch {}
    if (S) S.encountersEnabled = enc0;
    graceUntil = game.time + GRACE_S;
    if (skipped && data?.skip?.line) game.hud?.toast?.(lineOf(data.skip.line).text);
    game.emit('tutorialDone', { skipped });
    render();
  }

  function spawnWisp() {
    const f = game.facing(), Sy = sys(); if (!Sy) return;
    const spot = Sy.findSpot?.(p.x + f.x * 9, p.y + f.y * 9, 8) || { x: p.x + f.x * 9, y: p.y + f.y * 9, z: null };
    wisp = Sy.spawn('wisp', spot.x, spot.y, spot.z, { tutorial: true });
    wisp.tutorialMob = true; wisp.noLoot = true; wisp.hp = wisp.maxHp = 22;
    // slow, clearly telegraphed attacks and a slower drift: a first enemy to learn on
    const ty = wisp.type; wisp.type = { ...ty, speed: ty.speed * 0.6, attacks: ty.attacks.map(a => ({ ...a, windup: a.windup * 1.7, cd: a.cd * 1.6, dmg: Math.round(a.dmg * 0.5) })) };
  }
  function dropLoot(x, y) {
    const it = game.items; if (!it) return;
    const ids = Object.keys(it.defs).filter(k => { const d = it.defs[k]; return !d.starter && !d.quest && !d.unique && d.rarity === 'uncommon' && it.equipped?.[d.slot]; });
    drop = ids.length ? ids[Math.floor(Math.random() * ids.length)] : it.roll?.('uncommon');
    if (drop) { const z = game.groundAt(x, y, p.z + 2) ?? p.z; it.drop(drop, x, y, z); }
  }

  offs.push(game.on('jump', () => { if (T.active && st.id === 'jump') st.ok = true; }));
  offs.push(game.on('dash', () => { if (T.active && st.id === 'dash') st.ok = true; }));
  offs.push(game.on('cast', e => { if (T.active && st.id === 'cast' && e.caster === 'player') st.slots.add(e.slot); }));
  offs.push(game.on('kill', e => { if (T.active && e.mob === wisp && st.id === 'first_mob') { st.ok = true; dropLoot(wisp.x, wisp.y); } }));
  offs.push(game.on('pickup', e => { if (T.active && (st.id === 'loot' || st.id === 'first_mob')) { drop = e.id; if (st.id === 'loot') st.ok = true; } }));
  offs.push(game.on('equip', e => { if (T.active && (st.id === 'equip' || (st.id === 'loot' && e.id === drop))) { if (st.id === 'equip') st.ok = true; else st.preEquip = true; } }));

  let started = false;
  game.add({ update(dt) {
    if (!started) { if (game.save.cls && !game.paused) { started = true; begin(); } return; }
    if (!T.active) return;
    if (game.mobs.some(m => !m.tutorialMob && !m.removed)) clearStrays();
    const s = game.stats; s.mana = s.maxMana; s.hp = Math.max(s.hp, s.maxHp);
    const id = st.id;
    if (id === 'move' && Math.hypot(p.x - st.x, p.y - st.y) > 4) st.ok = true;
    if (id === 'look') { st.look += Math.abs(p.yaw - st.yaw) + Math.abs((p.pitch ?? 0) - st.pitch); st.yaw = p.yaw; st.pitch = p.pitch ?? 0; if (st.look > 1.2) st.ok = true; }
    if (id === 'run') { st.runT = p.speed > 3.5 ? st.runT + dt : 0; if (st.runT > 0.4) st.ok = true; }
    if (id === 'broom' && p.mode === 'broom') st.ok = true;
    if (id === 'cast') { const n = game.caster?.spells?.length || 0; for (const sp of game.caster?.spells || []) sp.readyAt = Math.min(sp.readyAt, game.time + 0.6); if (n && st.slots.size >= n) st.ok = true; }
    if (id === 'first_mob' && (!wisp || (wisp.removed && !wisp.dead)) && talked()) spawnWisp();
    if (id === 'equip' && st.preEquip) st.ok = true;
    if (id === 'intro' || id === 'quest_log') st.ok = talked() && T.lineIndex >= T.lines.length;
    if (st.ok && talked()) enter(st.i + 1);
  }, dispose() {
    for (const o of offs) o(); game.damagePlayer = dmg0; if (S) { S.spawn = spawn0; S.encountersEnabled = enc0; }
    ui?.remove(); ui = null;
  } });

  // ---- input: E / Enter advances dialogue lines
  const onKey = e => { if (!T.active || e.target instanceof HTMLInputElement) return; if (e.code === 'KeyE' || e.code === 'Enter') { if (!advance() && (st.id === 'intro' || st.id === 'quest_log')) T.lineIndex = T.lines.length; } };
  window.addEventListener('keydown', onKey); offs.push(() => window.removeEventListener('keydown', onKey));

  // ---- UI: tutorial_ui.js (UI and UX team) if present, else a plain DOM panel
  // (no import probe: a missing file would log a 404 console error; tutorial_ui.js sets window.WIC.tutorialUI = true)
  function render() {
    if (W.tutorialUI) { ui?.remove(); ui = null; game.emit('tutorialRender', T); return; }
    if (!ui) {
      ui = document.createElement('div'); ui.id = 'wic-tutorial';
      ui.style.cssText = 'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);max-width:min(620px,92vw);z-index:40;background:rgba(14,12,20,.86);color:#f3ead8;border:1px solid #c9a75a;border-radius:8px;padding:12px 16px;font:15px/1.4 Georgia,serif;box-shadow:0 4px 18px rgba(0,0,0,.5);cursor:pointer';
      ui.innerHTML = '<div class="tw" style="font:700 12px system-ui;color:#e9c46a;letter-spacing:.06em;text-transform:uppercase"></div><div class="tl"></div><div class="tp" style="margin-top:8px;font:600 13px system-ui;color:#9fe0ff"></div><div class="tb" style="margin-top:8px;display:flex;gap:4px;align-items:center"></div>';
      const sk = document.createElement('button'); sk.textContent = data?.skip?.label || 'Skip tutorial';
      sk.style.cssText = 'position:absolute;right:8px;top:8px;font:12px system-ui;background:#2a2433;color:#ddd;border:1px solid #666;border-radius:4px;padding:2px 8px;cursor:pointer';
      sk.onclick = e => { e.stopPropagation(); skip(); }; ui.appendChild(sk);
      ui.onclick = () => { if (!advance() && (st.id === 'intro' || st.id === 'quest_log')) T.lineIndex = T.lines.length; };
      document.body.appendChild(ui);
    }
    ui.style.display = T.active ? 'block' : 'none'; if (!T.active) return;
    ui.querySelector('.tw').textContent = T.speaker || '';
    ui.querySelector('.tl').textContent = T.lineIndex < T.lines.length ? T.line : '';
    ui.querySelector('.tp').textContent = talked() ? T.prompt : (touch ? 'Tap to continue' : 'E / Enter: continue');
    ui.querySelector('.tb').innerHTML = STEPS.map((_, k) => `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${k < T.stepIndex ? '#e9c46a' : k === T.stepIndex ? '#9fe0ff' : '#555'}"></i>`).join('');
  }
}
