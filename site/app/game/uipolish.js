// UI polish (gameplay s3): declutter the screen while the game layer is on. Style-only, no shared-file edits:
//  - the Quality button joins the other menu buttons, shown only when the menu is opened
//  - the centre '#status' line (e.g. a 'Loading…' left behind by a pending teleport) is hidden after 4 s in game mode
//  - smaller damage numbers (judge: "damage numbers too big")
// Exploration mode (no game-on class) is untouched.
const CSS = `
body.game-on #menu > button[data-quality] { display: none; }
body.game-on #menu.open > button[data-quality] { display: inline-block; background: rgba(12,12,20,.75); color: #f1e6cc; font-size: 12px; }
body.game-on #status.wic-stale { display: none; }
#game-hud .gh-num { font-size: 19px; -webkit-text-stroke-width: .8px; }
#game-hud .gh-num.big { font-size: 23px; }
#game-hud .gh-num.crit { font-size: 27px; }
#game-hud .gh-num.crit::before { font-size: 11px; }
#game-hud .gh-num.taken { font-size: 16px; }
`;

export function install(game) {
  if (typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'wic-uipolish'; style.textContent = CSS;
  document.head.appendChild(style);
  const st = document.getElementById('status');
  let text = null, since = 0;
  const timer = setInterval(() => {
    if (!st) return;
    const t = st.textContent;
    if (t !== text) { text = t; since = performance.now(); st.classList.remove('wic-stale'); }
    else if (t && performance.now() - since > 4000) st.classList.add('wic-stale');
  }, 500);
  game.systems.push({ update() {}, dispose() { clearInterval(timer); style.remove(); st?.classList.remove('wic-stale'); } });
}
