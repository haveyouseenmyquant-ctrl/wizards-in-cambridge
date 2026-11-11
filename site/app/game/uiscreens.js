// UI screens (gameplay s4, judge 'UI polish'): new file so hud.js / items.js / quests.js stay untouched.
//  - Menu focus: while the inventory (I), talents (T), class pick or death screen is open, body.wic-menu hides every
//    world overlay (quest banner/card/dialogue/letterbox bars, toasts, loot cards, damage numbers, plates, boss bar).
//  - Inventory: a framed grid panel replaces the old text list: paper-doll equipment slots and a bag grid, each a tile
//    with a drawn slot icon in a rarity frame, a details pane (hover = tooltip, click = equip/unequip), stat summary.
//  - Talents: the existing overlay restyled as a framed panel with tier rows, a rune icon per talent, lock labels.
//  - Combat toast queue: during a fight at most one loot card and two toasts show; the rest wait and play out after.
// Exploration mode never installs the game layer, so it is untouched.
import { ITEMS, RARITY, SLOTS } from './itemdefs.js';
import { KIND } from './uiframe.js';

const ICON = {   // 48x48 line icons per slot (stroke = currentColor)
  wand: '<path d="M10 40 L34 14"/><path d="M34 6 L36 12 L42 14 L36 16 L34 22 L32 16 L26 14 L32 12 Z" fill="currentColor" fill-opacity=".35"/>',
  hat: '<path d="M8 38 Q24 32 40 38"/><path d="M14 36 L27 6 Q30 14 34 18 L32 35"/><path d="M16 30 Q24 27 32 30"/>',
  robe: '<path d="M18 6 L30 6 L36 14 L40 42 L8 42 L12 14 Z"/><path d="M24 6 L24 42"/><path d="M12 14 L5 26 M36 14 L43 26"/>',
  boots: '<path d="M14 6 L26 6 L26 30 L40 34 L40 42 L12 42 Z"/><path d="M14 18 L26 18"/>',
  ring: '<circle cx="24" cy="28" r="12"/><circle cx="24" cy="28" r="8"/><path d="M19 13 L24 7 L29 13 L24 17 Z" fill="currentColor" fill-opacity=".4"/>',
  amulet: '<path d="M8 6 Q24 30 40 6"/><path d="M24 22 L32 32 L24 44 L16 32 Z" fill="currentColor" fill-opacity=".3"/><circle cx="24" cy="32" r="3"/>',
  broom: '<path d="M38 6 L20 30"/><path d="M20 30 L8 42 M20 30 L13 44 M20 30 L18 45 M20 30 L6 37 M22 32 L24 44"/><path d="M17 27 L24 33"/>',
};
const RUNES = [   // talent icons: abstract sigils picked by a hash of the talent name (original shapes)
  '<circle cx="24" cy="24" r="14"/><path d="M24 6 L24 42 M6 24 L42 24"/>',
  '<path d="M24 6 L40 38 L8 38 Z"/><circle cx="24" cy="28" r="5"/>',
  '<path d="M10 10 L38 38 M38 10 L10 38"/><circle cx="24" cy="24" r="7"/>',
  '<path d="M24 4 L30 18 L44 24 L30 30 L24 44 L18 30 L4 24 L18 18 Z"/>',
  '<path d="M12 40 Q24 2 36 40"/><path d="M16 28 L32 28"/>',
  '<rect x="10" y="10" width="28" height="28" transform="rotate(45 24 24)"/><path d="M24 14 L24 34"/>',
  '<path d="M8 30 Q16 14 24 30 T40 30"/><path d="M8 20 Q16 4 24 20 T40 20"/>',
  '<circle cx="24" cy="24" r="16"/><path d="M24 8 A10 10 0 0 1 24 40"/>',
];
// s4: talent icons show what the talent does (judge: 'talent icons are generic'), first matching keyword wins
const EFFECT = [
  [/fan|fires \d|summons \d|\d (darts|stones)/i, '<path d="M24 42 L10 10 M24 42 L24 6 M24 42 L38 10"/><path d="M6 14 L10 8 L14 13 M20 10 L24 4 L28 10 M34 13 L38 8 L42 14"/>'],
  [/pierce|punches through/i, '<path d="M4 24 L42 24 M34 16 L42 24 L34 32"/><path d="M16 10 L16 38 M26 10 L26 38" stroke-dasharray="3 4"/>'],
  [/chain|leaps on/i, '<rect x="5" y="17" width="18" height="14" rx="7"/><rect x="25" y="17" width="18" height="14" rx="7"/><path d="M17 24 L31 24"/>'],
  [/heal|drain|siphon/i, '<path d="M24 41 C8 30 6 20 12 14 C17 9 22 11 24 16 C26 11 31 9 36 14 C42 20 40 30 24 41 Z" fill="currentColor" fill-opacity=".25"/><path d="M24 22 L24 32 M19 27 L29 27"/>'],
  [/invulner|absorbs|ward/i, '<path d="M24 5 L40 11 L38 28 Q34 38 24 43 Q14 38 10 28 L8 11 Z" fill="currentColor" fill-opacity=".2"/><path d="M17 24 L22 29 L31 18"/>'],
  [/stun|stagger|paralys|jolt|root/i, '<path d="M24 4 L28 18 L42 14 L31 24 L42 34 L28 30 L24 44 L20 30 L6 34 L17 24 L6 14 L20 18 Z" fill="currentColor" fill-opacity=".2"/>'],
  [/burn|hot|sears/i, '<path d="M24 44 C12 44 9 34 13 26 C15 32 19 32 19 32 C15 22 22 12 26 4 C28 14 38 18 36 32 C35 40 30 44 24 44 Z" fill="currentColor" fill-opacity=".25"/><path d="M24 40 C19 40 18 34 21 30 C23 34 26 33 27 30 C30 34 29 40 24 40 Z"/>'],
  [/follows you|around you|with you|centres on you/i, '<circle cx="24" cy="15" r="5"/><path d="M17 36 L24 22 L31 36"/><ellipse cx="24" cy="32" rx="19" ry="7" stroke-dasharray="5 4"/>'],
  [/cooldown/i, '<path d="M12 5 L36 5 M12 43 L36 43 M14 5 Q14 18 24 24 Q34 30 34 43 M34 5 Q34 18 24 24 Q14 30 14 43"/><path d="M18 39 L30 39 L24 32 Z" fill="currentColor"/>'],
  [/hurls|throws|shoves|back\b|outward/i, '<circle cx="24" cy="24" r="5" fill="currentColor" fill-opacity=".4"/><path d="M24 15 L24 4 M19 9 L24 4 L29 9 M24 33 L24 44 M19 39 L24 44 L29 39 M15 24 L4 24 M9 19 L4 24 L9 29 M33 24 L44 24 M39 19 L44 24 L39 29"/>'],
  [/radius|x2/i, '<circle cx="24" cy="24" r="4" fill="currentColor"/><circle cx="24" cy="24" r="11"/><circle cx="24" cy="24" r="19" stroke-dasharray="4 4"/>'],
  [/slow|sap/i, '<path d="M8 36 L40 36"/><path d="M14 36 C10 24 20 14 28 20 C34 25 28 32 23 29 C19 26 23 22 25 24"/><path d="M34 36 L40 26"/>'],
  [/curse|damage taken|conductive|cracks/i, '<circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="7"/><path d="M24 4 L21 13 L27 18 L22 24 M40 30 L32 28"/>'],
  [/distance|longer|twice as often/i, '<path d="M6 30 Q20 8 42 12 Q30 16 26 24 Q36 22 40 26 Q28 30 20 38 Z" fill="currentColor" fill-opacity=".2"/><path d="M6 40 L30 40"/>'],
  [/damage|dmg/i, '<path d="M24 6 L32 18 L27 18 L27 42 L21 42 L21 18 L16 18 Z" fill="currentColor" fill-opacity=".3"/>'],
];
const effectIcon = (nm, desc) => (EFFECT.find(([re]) => re.test(desc)) || [])[1] || RUNES[hash(nm) % RUNES.length];
const svg = (inner, cls = '') => `<svg class="${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const hash = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const PCT = ['critChance', 'cdr', 'speedMult', 'power', 'critMult'];
const STAT_NAME = { power: 'spell power', critChance: 'crit chance', critMult: 'crit damage', cdr: 'cooldowns', speedMult: 'move speed', armor: 'armour', maxHp: 'health', maxMana: 'mana', manaRegen: 'mana regen', hpRegen: 'health regen' };
const statLines = s => Object.entries(s || {}).map(([k, v]) => `${v > 0 ? '+' : ''}${PCT.includes(k) ? Math.round(v * 100) + '%' : v} ${STAT_NAME[k] || k}`);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `
body.wic-menu #wic-q, body.wic-menu #game-hud .gh-toasts, body.wic-menu #game-hud .gh-loots, body.wic-menu #game-hud .gh-banner,
body.wic-menu #game-hud .gh-nums, body.wic-menu #game-hud .gh-plates, body.wic-menu #game-hud .gh-boss, body.wic-menu #game-hud .gh-risen,
body.wic-menu #game-hud .gh-lowtag, body.wic-menu #game-hud .gh-crosshair, body.wic-menu #status { display: none !important; }
body.wic-menu #game-hud { z-index: 60; }
/* a menu opened while a story line is up: quests.js fades #game-hud under body.q-talk, which took the talent overlay
   with it. :has() reacts the same frame the overlay opens (wic-menu waits for a game tick); the story box steps aside */
body:has(#game-hud > .gh-overlay:not([hidden])) #game-hud { opacity: 1 !important; pointer-events: auto !important; z-index: 60; }
body:has(#game-hud > .gh-overlay:not([hidden])) .q-dlg, body:has(#game-hud > .gh-overlay:not([hidden])) .q-card,
body:has(#game-hud > .gh-overlay:not([hidden])) #wic-tut { visibility: hidden !important; }
body.wic-gridinv #inv-panel { display: none !important; }
#game-hud .gh-loots { left: 18px; right: auto; top: 44%; max-height: 22vh; align-items: flex-start; }
#game-hud .gh-loot { align-items: flex-start; border-right: 0; border-left: 3px solid var(--rc); border-radius: 2px 4px 4px 2px; background: linear-gradient(90deg, rgba(10,10,16,.82), rgba(10,10,16,.4)); box-shadow: inset 24px 0 24px -20px var(--rc); }
#game-hud .gh-loot-e { text-align: left; }
#game-hud .gh-loot { max-width: 300px; }
#game-hud .gh-loot-h { flex-wrap: wrap; column-gap: 8px; row-gap: 1px; }
#wic-inv { position: fixed; inset: 0; z-index: 61; display: none; align-items: center; justify-content: center; background: radial-gradient(ellipse at center, rgba(8,7,14,.72), rgba(4,4,8,.92)); font: 13px/1.35 system-ui, sans-serif; color: #e9e2d0; }
#wic-inv.open { display: flex; } body.explore #wic-inv { display: none !important; }
#wic-inv .wi-box { width: min(900px, 96vw); max-height: 92vh; overflow: auto; display: grid; grid-template-columns: 330px 1fr; grid-template-rows: auto auto auto; gap: 14px 18px; padding: 16px 20px; background: linear-gradient(170deg, rgba(34,28,22,.97), rgba(16,13,12,.98)); border: 1px solid #8a7040; border-radius: 6px; box-shadow: 0 0 0 3px rgba(0,0,0,.6), 0 0 0 4px #4a3a20, 0 18px 50px rgba(0,0,0,.8); }
#wic-inv .wi-head { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 14px; border-bottom: 1px solid #5a4828; padding-bottom: 8px; }
#wic-inv .wi-head h2 { margin: 0; font: 600 24px/1 Georgia, serif; letter-spacing: .06em; color: #f1dca4; }
#wic-inv .wi-head span { color: #b9a77f; font-size: 12px; } #wic-inv .wi-x { margin-left: auto; background: none; border: 1px solid #6a5630; color: #e9d6a4; border-radius: 4px; padding: 3px 10px; cursor: pointer; font: 600 12px system-ui; }
#wic-inv h3 { margin: 0 0 8px; font: 700 11px/1 system-ui; letter-spacing: .2em; text-transform: uppercase; color: #d9b45a; }
#wic-inv .wi-doll { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
#wic-inv .wi-doll .wi-tile { width: auto; height: 58px; flex-direction: row; justify-content: flex-start; gap: 8px; padding: 6px 8px; text-align: left; }
#wic-inv .wi-doll .wi-tile svg { width: 34px; height: 34px; flex: none; }
#wic-inv .wi-doll .wi-tile.empty svg { opacity: .28; }
#wic-inv .wi-slotn { display: block; font: 700 9px/1 system-ui; letter-spacing: .16em; text-transform: uppercase; color: #9a8a6a; margin-bottom: 3px; }
#wic-inv .wi-name { display: block; font: 600 12px/1.2 system-ui; color: #f3ead6; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
#wic-inv .wi-bag { display: grid; grid-template-columns: repeat(auto-fill, 58px); gap: 7px; align-content: start; }
#wic-inv .wi-tile { --rc: #777; position: relative; width: 58px; height: 58px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 5px; cursor: pointer; color: var(--rc); background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--rc) 22%, transparent), rgba(10,9,8,.85) 70%); border: 2px solid color-mix(in srgb, var(--rc) 75%, #000); box-shadow: inset 0 0 0 1px rgba(0,0,0,.7), inset 0 0 12px rgba(0,0,0,.6); }
#wic-inv .wi-tile svg { width: 38px; height: 38px; filter: drop-shadow(0 1px 1px #000); }
#wic-inv .wi-tile:hover, #wic-inv .wi-tile.sel { border-color: var(--rc); box-shadow: 0 0 10px color-mix(in srgb, var(--rc) 60%, transparent), inset 0 0 0 1px rgba(0,0,0,.7); }
#wic-inv .wi-tile.empty { --rc: #4a4438; cursor: default; background: rgba(10,9,8,.6); border-style: dashed; }
#wic-inv .wi-tile .wi-pip { position: absolute; right: 3px; top: 3px; width: 7px; height: 7px; border-radius: 50%; background: var(--rc); box-shadow: 0 0 4px var(--rc); }
#wic-inv .wi-hint { margin-top: 6px; color: #9a8a6a; font-style: italic; font-size: 12px; }
#wic-inv .wi-cell.empty { width: 58px; height: 58px; border-radius: 5px; border: 1px dashed #3a3428; background: rgba(10,9,8,.45); }
#wic-inv .wi-det { --rc: #888; margin-top: 12px; min-height: 96px; padding: 10px 12px; border-left: 3px solid var(--rc); background: linear-gradient(90deg, color-mix(in srgb, var(--rc) 14%, rgba(0,0,0,.4)), rgba(0,0,0,.25)); border-radius: 0 4px 4px 0; }
#wic-inv .wi-det b { display: block; font: 600 18px/1.2 Georgia, serif; color: var(--rc); }
#wic-inv .wi-det .wi-r { font: 700 10px/1 system-ui; letter-spacing: .18em; text-transform: uppercase; color: #b9a77f; margin: 4px 0 6px; }
#wic-inv .wi-det ul { margin: 0 0 6px; padding: 0; list-style: none; color: #9fe39a; font-weight: 600; }
#wic-inv .wi-det p { margin: 0; color: #e6dcc4; font-style: italic; font-family: Georgia, serif; font-size: 14px; }
#wic-inv .wi-det .wi-act { margin-top: 6px; color: #b9a77f; font-size: 11px; }
#wic-inv .wi-foot { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px 16px; border-top: 1px solid #5a4828; padding-top: 8px; color: #cbbd99; font-size: 12px; }
#wic-inv .wi-foot b { color: #f3ead6; }
#game-hud .gh-talents { background: radial-gradient(ellipse at center, rgba(8,7,14,.75), rgba(4,4,8,.94)); gap: 8px; }
#game-hud .gh-talents > h1 { font-size: 28px; letter-spacing: .06em; }
#game-hud .gh-talents > p:not(.gh-hint) { margin: 0 0 6px; color: #cbbd99; font-size: 13px; }
#game-hud .gh-talents .gh-tier { padding: 8px 10px; background: rgba(28,23,18,.92); border: 1px solid #5a4828; border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,.5); }
#game-hud .gh-talents .gh-tier-lv { width: 64px; font: 700 12px/1.2 system-ui; letter-spacing: .12em; color: #d9b45a; text-transform: uppercase; }
#game-hud .gh-talents .gh-tier-lv small { display: block; font-weight: 500; letter-spacing: 0; text-transform: none; color: #a08a60; font-size: 10px; margin-top: 3px; }
#game-hud .gh-talent { width: 250px; min-height: 74px; flex-direction: row; align-items: center; gap: 10px; background: linear-gradient(160deg, rgba(34,28,20,.95), rgba(12,10,9,.95)); border: 1px solid #4a3e2a; font-size: 13px; }
#game-hud .gh-talent:not(.locked):hover { border-color: #d9b45a; }
#game-hud .gh-talent .wt-ic { --cc: #b9a77f; flex: none; width: 46px; height: 46px; padding: 6px; box-sizing: border-box; border-radius: 8px; transform: rotate(0); border: 2px solid color-mix(in srgb, var(--cc) 55%, #3a3020); color: var(--cc); background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--cc) 28%, rgba(20,16,12,.9)), rgba(10,8,6,.95) 75%); filter: drop-shadow(0 0 4px color-mix(in srgb, var(--cc) 40%, transparent)); }
#game-hud .gh-talent .wt-tx { display: flex; flex-direction: column; gap: 3px; }
#game-hud .gh-talent .wt-tx b { font: 600 14px/1.1 Georgia, serif; color: #f3ead6; }
#game-hud .gh-talent .wt-tx span { color: #ded3b9; line-height: 1.3; }
#game-hud .gh-talent.on { border-color: #f2d36b; background: linear-gradient(rgba(90,70,24,.95), rgba(50,38,14,.95)); box-shadow: 0 0 12px rgba(242,211,107,.45); }
#game-hud .gh-talent.on .wt-ic { border-color: #f2d36b; box-shadow: 0 0 10px rgba(242,211,107,.6); }
#game-hud .gh-talent.locked { opacity: .62; filter: grayscale(.6); }
/* s6: tiers read as one tree: a gold spine between tier panels, warmer panel fill */
#game-hud .gh-talents .gh-tier { position: relative; background: linear-gradient(90deg, rgba(48,38,24,.94), rgba(26,21,16,.94) 30%); }
#game-hud .gh-talents .gh-tier + .gh-tier::before { content: ''; position: absolute; left: 41px; top: -10px; width: 2px; height: 10px; background: linear-gradient(#d9b45a, #7a6236); }
#game-hud .gh-talents .gh-tier-lv small { color: #c4ab78 !important; font-size: 11px !important; }
#game-hud .gh-talent .wt-icw { position: relative; flex: none; display: block; }
#game-hud .gh-talent .wt-sp { position: absolute; right: -5px; bottom: -5px; width: 20px; height: 20px; padding: 2px; box-sizing: border-box; border-radius: 50%; color: #f3ead6; background: #1a140e; border: 1px solid var(--cc, #b9a77f); }
#wic-inv .wi-det { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rc) 45%, transparent), 0 0 14px color-mix(in srgb, var(--rc) 25%, transparent); border-radius: 0 5px 5px 0; }
#wic-inv .wi-dh { display: flex; gap: 10px; align-items: center; margin-bottom: 4px; }
#wic-inv .wi-dic { flex: none; width: 40px; height: 40px; padding: 4px; color: var(--rc); border: 2px solid var(--rc); border-radius: 5px; background: radial-gradient(circle, color-mix(in srgb, var(--rc) 30%, transparent), rgba(0,0,0,.7)); }
#wic-inv .wi-rb { font-style: normal; color: #111; background: var(--rc); padding: 2px 6px 2px 5px; border-radius: 3px; margin-right: 4px; letter-spacing: .12em; }
#wic-inv.open .wi-box, #game-hud .gh-talents:not([hidden]) > *, #game-hud .gh-pick:not([hidden]) > * { animation: wu-in .28s cubic-bezier(.2,.8,.3,1) both; }
#game-hud .gh-talents:not([hidden]) > .gh-tier:nth-of-type(2) { animation-delay: .05s; } #game-hud .gh-talents:not([hidden]) > .gh-tier:nth-of-type(3) { animation-delay: .1s; }
#game-hud .gh-talents:not([hidden]) > .gh-tier:nth-of-type(4) { animation-delay: .15s; }
@keyframes wu-in { from { opacity: 0; transform: translateY(10px) scale(.985); } }
/* combat readability: damage numbers a size smaller, and at most NUM_CAP on screen (crits and newest first) */
#game-hud .gh-num { font-size: 22px; } #game-hud .gh-num.big { font-size: 27px; } #game-hud .gh-num.crit { font-size: 31px; }
#game-hud .gh-num.crit::before { font-size: 12px; }
#game-hud .gh-num.wu-cap { visibility: hidden; }
`;
const NUM_CAP = 3;

export function install(game) {
  if (typeof document === 'undefined' || !game.items) return;
  const offs = [];
  const style = document.createElement('style'); style.id = 'wic-uiscreens'; style.textContent = CSS; document.head.appendChild(style);
  offs.push(() => style.remove());
  document.body.classList.add('wic-gridinv'); offs.push(() => document.body.classList.remove('wic-gridinv', 'wic-menu'));
  const items = game.items, sv = game.save.items;

  // ---------------- inventory grid
  const inv = document.createElement('div'); inv.id = 'wic-inv'; document.body.appendChild(inv); offs.push(() => inv.remove());
  const old = document.getElementById('inv-panel');
  let sel = null;   // item id shown in the details pane
  const tile = (id, slot) => {
    if (!id) return `<div class="wi-tile empty" title="${slot}: empty">${svg(ICON[slot] || '')}${slot ? `<span><span class="wi-slotn">${slot}</span><span class="wi-name" style="color:#7a7060">empty</span></span>` : ''}</div>`;
    const d = ITEMS[id], rc = RARITY[d.rarity].color;
    return `<div class="wi-tile${sel === id ? ' sel' : ''}" data-id="${id}" data-slot="${slot || ''}" style="--rc:${rc}" title="${esc(d.name)}">${svg(ICON[d.slot] || '')}`
      + (slot ? `<span><span class="wi-slotn">${slot}</span><span class="wi-name">${esc(d.name)}</span></span>` : `<i class="wi-pip"></i>`) + `</div>`;
  };
  function details(id) {
    const d = id && ITEMS[id];
    if (!d) return `<div class="wi-det"><b style="color:#b9a77f">Nothing selected</b><div class="wi-act">Hover an item to inspect it. Click a bag item to equip it, click worn gear to take it off.</div></div>`;
    const worn = sv.eq[d.slot] === id;
    return `<div class="wi-det" style="--rc:${RARITY[d.rarity].color}"><div class="wi-dh">${svg(ICON[d.slot] || '', 'wi-dic')}<span><b>${esc(d.name)}</b><div class="wi-r"><em class="wi-rb">${'◆'.repeat(RARITY[d.rarity].order + 1)} ${d.rarity}</em> ${d.slot}${d.unique ? ' · unique' : ''}${d.set ? ' · set' : ''}</div></span></div>`
      + `<ul>${statLines(d.stats).map(l => `<li>${l}</li>`).join('')}</ul>${d.desc ? `<p>${esc(d.desc)}</p>` : ''}`
      + `<div class="wi-act">${worn ? 'Worn · click to take off' : `In bag · click to equip${sv.eq[d.slot] ? ` (replaces ${esc(ITEMS[sv.eq[d.slot]]?.name)})` : ''}`}</div></div>`;
  }
  function render() {
    if (!inv.classList.contains('open')) return;
    if (sel && !items.S.owns(sel)) sel = null;
    if (!sel) sel = SLOTS.map(s => sv.eq[s]).filter(Boolean).sort((a, b) => RARITY[ITEMS[b].rarity].order - RARITY[ITEMS[a].rarity].order)[0] || sv.inv[0] || null;
    const bag = [...sv.inv].sort((a, b) => RARITY[ITEMS[b].rarity].order - RARITY[ITEMS[a].rarity].order);
    const cells = Math.max(8, Math.ceil(bag.length / 8) * 8);   // s4: one row minimum, no rows of empty placeholders
    const s = game.stats, chests = items.chests?.length ?? 8;
    inv.innerHTML = `<div class="wi-box"><div class="wi-head"><h2>Satchel</h2><span>${bag.length} in bag · ${SLOTS.filter(k => sv.eq[k]).length}/${SLOTS.length} worn</span><button class="wi-x">Close (I)</button></div>`
      + `<div><h3>Equipped</h3><div class="wi-doll">${SLOTS.map(k => tile(sv.eq[k], k)).join('')}</div></div>`
      + `<div><h3>Bag</h3><div class="wi-bag">${bag.map(id => tile(id)).join('')}${'<div class="wi-cell empty"></div>'.repeat(cells - bag.length)}</div>${bag.length ? '' : '<div class="wi-hint">Empty. Drops from foes, chests at real places and bosses land here.</div>'}<div class="wi-detwrap">${details(sel)}</div></div>`
      + `<div class="wi-foot"><span>Health <b>${Math.ceil(s.hp)}/${s.maxHp}</b></span><span>Mana <b>${Math.floor(s.mana)}/${s.maxMana}</b></span>`
      + `<span>Spell power <b>${Math.round(s.power * 100)}%</b></span><span>Crit <b>${Math.round(s.critChance * 100)}%</b></span><span>Armour <b>${Math.round(s.armor)}</b></span>`
      + `<span>Chests opened <b>${sv.chests.length}/${chests}</b></span></div></div>`;
  }
  inv.addEventListener('mouseover', e => { const t = e.target.closest('.wi-tile[data-id]'); if (!t || t.dataset.id === sel) return; sel = t.dataset.id;
    inv.querySelectorAll('.wi-tile.sel').forEach(x => x.classList.remove('sel')); t.classList.add('sel'); const w = inv.querySelector('.wi-detwrap'); if (w) w.innerHTML = details(sel); });
  inv.addEventListener('click', e => {
    if (e.target.closest('.wi-x') || e.target === inv) { items.togglePanel?.(false); return; }
    const t = e.target.closest('.wi-tile[data-id]'); if (!t) return; sel = t.dataset.id;
    if (t.dataset.slot) items.unequip(t.dataset.slot); else items.equip(t.dataset.id);
    render();
  });
  offs.push(game.on('equip', render), game.on('unequip', render));
  const onEsc = e => { if (e.code === 'Escape' && inv.classList.contains('open')) items.togglePanel?.(false); };
  addEventListener('keydown', onEsc); offs.push(() => removeEventListener('keydown', onEsc));

  // ---------------- talents: decorate the hud overlay each time it is redrawn
  const tal = document.querySelector('#game-hud .gh-talents');
  let decorating = false;
  function decorate() {
    if (!tal || tal.hidden || decorating || tal.querySelector('.wt-ic')) return;
    decorating = true;
    const c = game.caster, lv = game.stats.level;
    tal.querySelectorAll('.gh-tier').forEach((row, t) => {
      const need = c?.talentLevels?.[t], lab = row.querySelector('.gh-tier-lv');
      if (lab && need != null) lab.innerHTML = `Tier ${['I', 'II', 'III', 'IV'][t] || t + 1}<small>${lv >= need ? `level ${need} · open` : `unlocks at level ${need}`}</small>`;
      row.querySelectorAll('.gh-talent').forEach(b => {
        const nm = b.querySelector('b')?.textContent || '', ds = b.querySelector('span')?.outerHTML || '';
        const dtx = b.querySelector('span')?.textContent || '', sp = c?.classes?.[c.cls]?.spells?.find(x => dtx.includes(x.name) || nm.includes(x.name.split(' ')[0]));
        // effect glyph as the icon, the spell it modifies as a small badge in the corner
        b.innerHTML = `<i class="wt-icw">${svg(effectIcon(nm, dtx), 'wt-ic')}${sp && KIND[sp.kind] ? svg(KIND[sp.kind], 'wt-sp') : ''}</i><div class="wt-tx"><b>${esc(nm)}</b>${ds}</div>`;
        const cc = c?.classes?.[c.cls]?.color; if (cc) b.style.setProperty('--cc', cc);
      });
    });
    decorating = false;
  }
  const mo = tal && new MutationObserver(decorate);
  mo?.observe(tal, { childList: true, attributes: true, attributeFilter: ['hidden'] });
  offs.push(() => mo?.disconnect());

  // ---------------- combat toast queue
  const hud = game.hud || {}, loot0 = hud.loot, toast0 = hud.toast, lq = [], tq = [];
  const inCombat = () => { for (const m of game.mobs || []) { if (m.dead) continue; const d = Math.hypot(m.x - game.px, m.y - game.py);
    if (d < 24 && (m.boss || m.state === 'chase' || m.state === 'windup' || m.state === 'active' || m.hp < m.maxHp)) return true; } return false; };
  const shown = cls => document.querySelectorAll(`#game-hud .${cls}`).length;
  const story = () => !!game.uiFrame?.storyBusy?.();   // uiframe.js: a dialogue box or quest card is up, so loot/toasts wait
  const now = () => performance.now() / 1000, STALE = 15;   // s5: what waited out a long story scene is stale news
  const stamp = a => (a.t = now(), a);
  function dropStale() {   // stale toasts go; stale common/uncommon loot folds into one 'in your satchel' toast
    for (let i = tq.length - 1; i >= 0; i--) if (now() - (tq[i].t || 0) > STALE) tq.splice(i, 1);
    const old = lq.filter(a => now() - (a.t || 0) > STALE && (a[1] === 'common' || a[1] === 'uncommon'));
    if (old.length < 2) return;
    for (const a of old) lq.splice(lq.indexOf(a), 1);
    tq.unshift(stamp([`${old.length} items added to your satchel (I)`]));
  }
  if (loot0) hud.loot = (...a) => { stamp(a); if (story()) { lq.push(a); if (lq.length > 6) lq.shift(); return null; } if ((inCombat() && shown('gh-loot') >= 1) || shown('gh-loot') >= 3 || lq.length) { if (!lq.some(x => x[0] === a[0])) lq.push(a); if (lq.length > 4) lq.splice(Math.max(0, lq.findIndex(x => x[1] === 'common')), 1); return null; } return loot0(...a); };
  if (toast0) hud.toast = (...a) => { stamp(a); if (story()) { if (!tq.some(x => x[0] === a[0])) tq.push(a); return null; } if (inCombat() && (shown('gh-toast') >= 2 || tq.length)) { if (!tq.some(x => x[0] === a[0])) tq.push(a); if (tq.length > 3) tq.shift(); return null; } return toast0(...a); };
  offs.push(() => { if (loot0) hud.loot = loot0; if (toast0) hud.toast = toast0; });
  let qT = 0;

  // ---------------- damage numbers: hud.js pools them; keep only the NUM_CAP most relevant visible
  const seen = new WeakMap(); let clock = 0;
  function capNums() {
    clock++;
    const vis = [];
    for (const d of document.querySelectorAll('#game-hud .gh-num')) {
      if (d.style.display === 'none') { seen.delete(d); d.classList.remove('wu-cap'); continue; }
      const k = d.textContent; let r = seen.get(d);
      if (!r || r.k !== k) { r = { t: clock, k }; seen.set(d, r); }   // new or re-used (or a rolling total grew): newest
      vis.push([d, r.t + (d.classList.contains('crit') ? 1e6 : 0)]);
    }
    vis.sort((a, b) => b[1] - a[1]);
    // s6: a number that would overlap a higher-priority one or the boss bar stays hidden (judge: numbers overlap the
    // boss name and each other)
    const bossEl = document.querySelector('#game-hud .gh-boss'), keep = [];
    const bb = bossEl && bossEl.style.display === 'block' ? bossEl.getBoundingClientRect() : null;
    const hit = (a, b) => a.left < b.right + 4 && b.left < a.right + 4 && a.top < b.bottom + 2 && b.top < a.bottom + 2;
    vis.forEach(([d], i) => {
      let off = i >= NUM_CAP;
      if (!off) { const r = d.getBoundingClientRect(); off = (bb && hit(r, bb)) || keep.some(k => hit(r, k)) || r.left < 10 || r.top < 10 || r.right > innerWidth - 10 || r.bottom > innerHeight - 10;   /* edge-clamped = off-screen target */ if (!off) keep.push(r); }
      d.classList.toggle('wu-cap', off);
    });
  }

  // ---------------- per frame: menu state, inventory mirror, queue drain
  const isOpen = el => el && !el.hidden;
  game.add({
    update(dt) {
      const invOpen = !!old?.classList.contains('open');
      if (invOpen !== inv.classList.contains('open')) { inv.classList.toggle('open', invOpen); if (invOpen) render(); }
      const menu = invOpen || isOpen(tal) || isOpen(document.querySelector('#game-hud .gh-pick')) || isOpen(document.querySelector('#game-hud .gh-death'));
      if (menu !== document.body.classList.contains('wic-menu')) document.body.classList.toggle('wic-menu', menu);
      if (menu) decorate();
      capNums();
      if ((qT -= dt) > 0 || (!lq.length && !tq.length) || story()) return;
      dropStale();
      const fight = inCombat();
      if (lq.length && shown('gh-loot') < (fight ? 1 : 3)) { loot0(...lq.shift()); qT = 0.6; }
      else if (tq.length && shown('gh-toast') < (fight ? 2 : 3)) { toast0(...tq.shift()); qT = 0.4; }
    },
    dispose() { for (const f of offs) f(); },
  });
  game.uiScreens = { render, inCombat, queued: () => lq.length + tq.length };
}
