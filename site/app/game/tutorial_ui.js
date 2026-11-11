// Tutorial prompt UI (UI and UX, task 616a; issue is-20261110-192341-intr). Renders the steps of tutorial.js (Gameplay):
//  - a dialogue box at the bottom (same frame as story dialogue) while the mentor still has lines for this step;
//  - then an action card at the top centre: a drawn glyph for the step (keys and mouse on desktop, joystick / swipe /
//    button glyphs on touch), the prompt (step.prompt_kbm or step.prompt_touch from quests/tutorial.json) with keys drawn
//    as keycaps and touch buttons as pills, a progress pip row and a Skip button. The matching touch button pulses.
// Contract: sets window.WIC.tutorialUI = true; tutorial.js then emits 'tutorialRender' with window.WIC.tutorial
// ({active, step, steps, stepIndex, line, speaker, prompt, lineIndex, lines, advance(), skip()}). If tutorial.js is
// absent (or has not run yet) nothing is shown; ?tutorial_ui=demo renders stub steps for screenshots.
const CSS = `
#wic-tut{position:fixed;inset:0;pointer-events:none;z-index:32;font:14px/1.4 system-ui,sans-serif;color:#f6ead0}
#wic-tut[hidden]{display:none}
#wic-tut .tu-dlg{position:absolute;left:50%;bottom:max(calc(9vh + 14px),112px);transform:translateX(-50%);width:min(720px,92vw);padding:14px 18px 22px;
  background:linear-gradient(rgba(20,16,12,.92),rgba(10,8,6,.95));border:1px solid #6b5630;border-radius:6px;box-shadow:0 6px 30px rgba(0,0,0,.6);pointer-events:auto;cursor:pointer}
#wic-tut .tu-who{font:700 12px/1 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#e9c46a;margin-bottom:6px;min-height:12px}
#wic-tut .tu-line{font:17px/1.45 Georgia,'Times New Roman',serif}
#wic-tut .tu-line.nar{font-style:italic;color:#d9ccb0}
#wic-tut .tu-more{position:absolute;right:12px;bottom:6px;font:600 11px/1 system-ui,sans-serif;color:#b9a77f;animation:tuP 1s infinite alternate}
#wic-tut .tu-card{position:absolute;left:50%;top:clamp(64px,11vh,110px);transform:translateX(-50%);width:min(560px,90vw);display:flex;gap:14px;align-items:center;
  padding:12px 16px 10px;background:linear-gradient(rgba(16,20,30,.9),rgba(8,10,16,.92));border:1px solid rgba(159,224,255,.45);border-radius:8px;
  box-shadow:0 4px 22px rgba(0,0,0,.55);pointer-events:auto;animation:tuIn .25s ease-out}
#wic-tut .tu-card.tap{cursor:pointer}
#wic-tut .tu-ico{flex:0 0 auto;width:74px;height:56px;color:#9fe0ff;display:flex;align-items:center;justify-content:center}
#wic-tut .tu-ico svg{width:100%;height:100%}
#wic-tut .tu-body{flex:1;min-width:0}
#wic-tut .tu-step{font:700 10px/1 system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#8fb8cc;margin-bottom:6px}
#wic-tut .tu-p{font:600 15px/1.5 system-ui,sans-serif;color:#f3f6fa}
#wic-tut kbd{display:inline-block;min-width:1.5em;padding:0 .4em;margin:0 .1em;border:1px solid #c9d6e0;border-bottom-width:3px;border-radius:4px;
  background:linear-gradient(#3a4250,#232831);color:#fff;font:700 12px/1.55 system-ui,sans-serif;text-align:center;vertical-align:1px}
#wic-tut .tu-pill{display:inline-block;padding:0 .7em;margin:0 .1em;border-radius:999px;background:rgba(255,210,120,.92);color:#21180a;font:700 12px/1.7 system-ui,sans-serif;vertical-align:1px}
#wic-tut .tu-pips{display:flex;gap:5px;align-items:center;margin-top:9px}
#wic-tut .tu-pips i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.22);transition:all .2s}
#wic-tut .tu-pips i.d{background:#e9c46a}
#wic-tut .tu-pips i.c{width:18px;border-radius:4px;background:#9fe0ff;box-shadow:0 0 6px #9fe0ff}
#wic-tut .tu-skip{position:absolute;right:8px;top:8px;padding:3px 10px;font:600 11px/1.3 system-ui,sans-serif;color:#cfd8e0;background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.25);border-radius:4px;cursor:pointer;pointer-events:auto}
#wic-tut .tu-skip:hover{background:rgba(255,255,255,.16);color:#fff}
#wic-tut .tu-dlg.last{pointer-events:none;animation:tuOut 1s 6s forwards}
@keyframes tuOut{to{opacity:0;visibility:hidden}}
#touch-buttons button.tu-hint,#touch-satchel.tu-hint{animation:tuHint .7s ease-in-out infinite alternate;box-shadow:0 0 0 3px #9fe0ff}
#joystick.tu-hint{box-shadow:0 0 0 4px #9fe0ff,0 0 18px #9fe0ff}
@keyframes tuP{from{opacity:.45}to{opacity:1}}
@keyframes tuIn{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes tuHint{from{filter:brightness(1)}to{filter:brightness(1.5)}}
body.wic-tut-on #game-hud .gh-toasts,body.wic-tut-on #game-hud .gh-toast{top:auto}
#wic-tut.touch .tu-card{left:12px;top:8px;transform:none;width:min(520px,calc(100vw - 300px));padding:8px 12px 8px;gap:10px;animation:none}
#wic-tut.touch .tu-ico{width:56px;height:42px}#wic-tut.touch .tu-p{font-size:13px;line-height:1.45}#wic-tut.touch .tu-step{margin-bottom:4px}
#wic-tut.touch .tu-skip{position:static;margin-left:auto;align-self:flex-start;flex:0 0 auto}
#wic-tut.touch .tu-dlg{bottom:auto;top:8px;left:12px;transform:none;width:min(560px,calc(100vw - 300px))}
@media (max-width:640px){#wic-tut .tu-ico{width:52px;height:42px}#wic-tut .tu-p{font-size:13px}#wic-tut .tu-line{font-size:15px}#wic-tut .tu-card{top:58px}}
`;
const S = (inner, vb = '0 0 74 56') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const key = (x, y, t, w = 16) => `<rect x="${x}" y="${y}" width="${w}" height="16" rx="3"/><text x="${x + w / 2}" y="${y + 12}" fill="currentColor" stroke="none" font-size="9" font-weight="700" text-anchor="middle" font-family="system-ui">${t}</text>`;
const mouse = (lit = '') => `<rect x="25" y="6" width="24" height="40" rx="12"/><path d="M37 6 V20 M25 20 H49"/>${lit === 'l' ? '<path d="M27 18 V13 A10 10 0 0 1 36 7 V18 Z" fill="currentColor" fill-opacity=".6" stroke="none"/>' : ''}`;
const GLYPH_KBM = {
  intro: S(key(22, 20, 'E') + key(42, 20, '↵')),
  move: S(key(29, 8, 'W') + key(9, 28, 'A') + key(29, 28, 'S') + key(49, 28, 'D')),
  look: S(mouse() + '<path d="M8 26 H18 M14 22 L18 26 L14 30 M66 26 H56 M60 22 L56 26 L60 30" />'),
  jump: S(key(12, 32, 'Space', 50) + '<path d="M37 26 V8 M31 14 L37 8 L43 14"/>'),
  run: S(key(6, 30, 'Shift', 30) + '<path d="M42 38 H52 M46 32 H58 M50 26 H66" />'),
  dash: S(key(10, 20, 'Q') + '<path d="M34 28 H66 M58 20 L66 28 L58 36 M34 22 H48 M34 34 H48" stroke-opacity=".6"/>'),
  broom: S(key(8, 20, 'B') + '<path d="M30 40 L62 12 M30 40 L24 50 M30 40 L20 44 M30 40 L28 52 M30 40 L18 48"/>'),
  cast: S(key(4, 20, '1') + key(22, 20, '2') + key(40, 20, '3') + '<text x="64" y="32" fill="currentColor" stroke="none" font-size="10" text-anchor="middle">…</text>'),
  first_mob: S('<circle cx="40" cy="26" r="9" fill="currentColor" fill-opacity=".25"/><circle cx="40" cy="26" r="15" stroke-dasharray="3 4"/>' + key(4, 18, 'Q')),
  loot: S('<path d="M37 10 L46 24 L37 44 L28 24 Z" fill="currentColor" fill-opacity=".3"/><path d="M37 2 V6 M22 12 L25 15 M52 12 L49 15 M18 50 H56" />'),
  equip: S(key(6, 20, 'I') + '<path d="M36 18 H62 V46 H36 Z M42 18 V12 H56 V18" /><path d="M42 30 H56" />'),
  quest_log: S('<path d="M14 8 H50 V48 H14 Z" /><path d="M22 18 H42 M22 26 H42 M22 34 H34" /><path d="M60 46 V10 M54 16 L60 10 L66 16" />'),
};
const pill = (x, y, t, w = 34) => `<rect x="${x}" y="${y}" width="${w}" height="16" rx="8" fill="currentColor" fill-opacity=".2"/><text x="${x + w / 2}" y="${y + 11.5}" fill="currentColor" stroke="none" font-size="8.5" font-weight="700" text-anchor="middle" font-family="system-ui">${t}</text>`;
const finger = (x, y) => `<path d="M${x} ${y} v-12 a3 3 0 0 1 6 0 v8 l6 1.5 a3 3 0 0 1 2.4 3.4 l-1.4 8 H${x + 2} Z" fill="currentColor" fill-opacity=".25"/>`;
const GLYPH_TOUCH = {
  intro: S('<rect x="8" y="12" width="44" height="22" rx="4"/><path d="M14 20 H44 M14 27 H36"/>' + finger(48, 40)),
  move: S('<circle cx="30" cy="28" r="20"/><circle cx="38" cy="22" r="8" fill="currentColor" fill-opacity=".4"/><path d="M30 28 L38 22" stroke-dasharray="2 3"/>'),
  look: S(finger(30, 38) + '<path d="M8 22 H22 M12 18 L8 22 L12 26 M66 22 H52 M62 18 L66 22 L62 26" />'),
  jump: S(pill(20, 30, 'Jump') + '<path d="M37 24 V6 M31 12 L37 6 L43 12"/>'),
  run: S(pill(6, 30, 'Run') + '<path d="M46 38 H56 M50 32 H62 M54 26 H70" />'),
  dash: S(pill(4, 20, 'Dash') + '<path d="M44 28 H70 M62 20 L70 28 L62 36" />'),
  broom: S(pill(2, 20, 'Broom', 36) + '<path d="M42 40 L68 14 M42 40 L36 50 M42 40 L32 46 M42 40 L40 52"/>'),
  cast: S('<circle cx="16" cy="28" r="10"/><circle cx="38" cy="28" r="10"/><circle cx="60" cy="28" r="10"/>' + finger(34, 50)),
  first_mob: S('<circle cx="46" cy="26" r="9" fill="currentColor" fill-opacity=".25"/><circle cx="46" cy="26" r="15" stroke-dasharray="3 4"/>' + pill(0, 18, 'Dash', 28)),
  loot: GLYPH_KBM.loot,
  equip: S(pill(2, 20, 'Satchel', 38) + '<path d="M46 18 H70 V46 H46 Z M51 18 V12 H65 V18" />'),
  quest_log: S('<path d="M14 8 H46 V48 H14 Z" /><path d="M22 18 H40 M22 26 H40 M22 34 H32" />' + finger(52, 50)),
};
const TITLE = { intro: 'Meet your mentor', move: 'Walk', look: 'Look around', jump: 'Jump', run: 'Run', dash: 'Dash', broom: 'Broom',
  cast: 'Cast your spells', first_mob: 'First foe', loot: 'Loot', equip: 'Equip', quest_log: 'Your quest' };
// touch buttons to pulse per step (#touch-buttons [data-key], #touch-satchel, #joystick)
const HINT = { move: '#joystick', jump: '[data-key="Space"]', run: '[data-key="run"]', dash: '[data-key="KeyQ"]', broom: '[data-key="KeyB"]',
  first_mob: '[data-key="KeyQ"]', equip: '#touch-satchel' };
const KEYS = /\b(W A S D|WASD|Shift|Space|Enter|Tab|Esc|left mouse|right mouse|[A-Z]|[1-6] to [1-6]|[1-6])\b/g;
const TOUCHB = /\b(Jump|Run|Dash|Crouch|Broom|View|Satchel)\b(?= button| to| while|,|\.|$| rises| descends)/g;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// prompt text -> HTML: keys as keycaps (desktop), touch button names as pills (touch)
export function promptHTML(text, touch) {
  let h = esc(text || '');
  if (touch) return h.replace(TOUCHB, '<span class="tu-pill">$1</span>');
  return h.replace(KEYS, m => {
    if (m === 'W A S D' || m === 'WASD') return ['W', 'A', 'S', 'D'].map(k => `<kbd>${k}</kbd>`).join('');
    if (/^[1-6] to [1-6]$/.test(m)) return `<kbd>${m[0]}</kbd>–<kbd>${m.slice(-1)}</kbd>`;
    if (m === 'left mouse' || m === 'right mouse') return `<kbd>${m === 'left mouse' ? 'LMB' : 'RMB'}</kbd>`;
    return `<kbd>${m}</kbd>`;
  }).replace(/(^|[.;:] )<kbd>A<\/kbd> /g, '$1A ');   // the article "A" at a sentence start is not a key
}

export function install(game) {
  if (typeof document === 'undefined') return;
  const W = window.WIC = window.WIC || {};
  W.tutorialUI = true;
  const expose = () => { if (game.items) W.items = game.items; };   // the touch Satchel button calls WIC.items.togglePanel()
  expose();
  const QS = new URLSearchParams(location.search);
  const touch = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
  const style = document.createElement('style'); style.id = 'wic-tutorial-ui'; style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'wic-tut'; root.hidden = true; root.classList.toggle('touch', touch); document.body.appendChild(root);
  let hinted = null;

  function setHint(sel) {
    if (hinted) hinted.classList.remove('tu-hint');
    hinted = touch && sel ? document.querySelector(sel.startsWith('#') ? sel : '#touch-buttons ' + sel) : null;
    hinted?.classList.add('tu-hint');
  }
  function onTap(T) { if (!T.advance?.() && (T.step === 'intro' || T.step === 'quest_log')) T.lineIndex = T.lines.length; render(T); }

  function render(T) {
    const on = !!T?.active;
    root.hidden = !on; document.body.classList.toggle('wic-tut-on', on);
    if (!on) { root.innerHTML = ''; setHint(null); return; }
    const steps = T.steps || [], i = Math.max(0, T.stepIndex ?? steps.indexOf(T.step)), id = T.step;
    const n = T.lines?.length || 0, talked = T.lineIndex >= n - 1, tap = id === 'intro' || id === 'quest_log';
    const skip = `<button class="tu-skip" type="button">${esc(T.data?.skip?.label || 'Skip tutorial')}</button>`;
    const pips = `<div class="tu-pips" aria-label="Step ${i + 1} of ${steps.length}">${steps.map((s, k) => `<i class="${k < i ? 'd' : k === i ? 'c' : ''}" title="${esc(TITLE[s] || s)}"></i>`).join('')}</div>`;
    let html = '';
    // the mentor's line (bottom); on an action step the last line fades out by itself so the spell bar stays clear
    if (T.lineIndex < n && T.line) html += `<div class="tu-dlg${talked && !tap ? ' last' : ''}"><div class="tu-who">${esc(T.speaker || '')}</div>
      <div class="tu-line${T.speaker ? '' : ' nar'}">${esc(T.line)}</div><div class="tu-more">${talked && !tap ? '' : touch ? 'Tap to continue' : '<kbd>E</kbd> continue'}</div>${talked ? '' : skip}</div>`;
    if (talked) {
      const g = (touch ? GLYPH_TOUCH : GLYPH_KBM)[id] || GLYPH_KBM.intro;
      html += `<div class="tu-card${tap ? ' tap' : ''}"><div class="tu-ico">${g}</div><div class="tu-body">
        <div class="tu-step">Step ${i + 1} of ${steps.length} · ${esc(TITLE[id] || id)}</div>
        <div class="tu-p">${promptHTML(T.prompt, touch)}</div>${pips}</div>${skip}</div>`;
      setHint(HINT[id]);
    } else setHint(null);
    root.innerHTML = html;
    root.querySelector('.tu-skip').onclick = e => { e.stopPropagation(); T.skip?.(); render(T); };
    for (const b of root.querySelectorAll('.tu-dlg:not(.last), .tu-card.tap')) b.onclick = () => onTap(T);
  }

  const offs = [game.on('ready', expose), game.on('tutorialRender', T => render(T)), game.on('tutorialDone', () => render(null))];
  // tutorial.js may have rendered before this module installed (it awaits tutorial.json): catch up once
  if (W.tutorial?.active) render(W.tutorial);

  // ?tutorial_ui=demo&tstep=<id>[&tline=1]: stub steps for screenshots when tutorial.js is not driving
  if (QS.get('tutorial_ui') === 'demo') {
    const steps = ['intro', 'move', 'look', 'jump', 'run', 'dash', 'broom', 'cast', 'first_mob', 'loot', 'equip', 'quest_log'];
    const id = QS.get('tstep') || 'move', talk = QS.has('tline');
    const stub = { active: true, steps, step: id, stepIndex: steps.indexOf(id), speaker: talk ? 'Nell Tapscott' : '', line: 'Hold that bundle. No, by the stems. ...Well. Would you look at that.',
      lines: talk ? ['a', 'b'] : ['a'], lineIndex: 0, prompt: touch ? 'Drag the joystick at bottom left to walk' : 'Move with W A S D (or the arrow keys)',
      advance() { return false; }, skip() { stub.active = false; } };
    if (!W.tutorial?.active) setTimeout(() => render(stub), 0);
  }
  game.add?.({ dispose() { for (const o of offs) o?.(); setHint(null); root.remove(); style.remove(); document.body.classList.remove('wic-tut-on'); } });
}
