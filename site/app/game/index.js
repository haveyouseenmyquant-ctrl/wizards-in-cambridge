// Starts the game layer. Each module exports install(game) and registers its systems/handlers on the game.
// A module that fails to load is skipped (logged as a warning), so the world stays walkable.
import { Game } from './core.js';

export const MODULES = ['./hud.js', './classes.js', './mobs.js', './items.js', './progression.js', './wizard.js', './wizard_rig.js', './mob_rig.js', '../mobcull.js', './npc_rig.js', './feel.js', './combatcam.js', './quests.js', './tutorial.js', './tutorial_ui.js', './uipolish.js', './uiscreens.js', './uiframe.js', './audio_game.js'];

let pre = null;
// started by main.js while the world tiles stream in, so the game modules are ready when the walk becomes playable
export function preload() { return pre ||= Promise.all(MODULES.map(m => import(m).catch(e => e))); }

export async function startGame(ctx) {
  const game = new Game(ctx);
  // fetch all modules in parallel (a serial await chain cost ~1 s of round trips), then install in the listed order
  const T = window.__gameT = { start: performance.now() };
  const mods = await preload();
  T.mods = performance.now();
  MODULES.forEach((m, i) => {
    try { if (mods[i] instanceof Error) throw mods[i]; mods[i].install?.(game); } catch (e) { console.warn('[game] module', m, 'not loaded:', e.message); }
  });
  // module data the game needs from its first frame (mobs.js: encounters), normally already loaded by the prefetch
  await Promise.all(mods.map(m => m instanceof Error ? null : m.ready?.catch?.(e => console.warn('[game] module data', e.message))));
  T.installed = performance.now();
  game.emit('ready', {});
  return game;
}
