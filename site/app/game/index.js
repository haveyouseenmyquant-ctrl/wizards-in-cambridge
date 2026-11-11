// Starts the game layer. Each module exports install(game) and registers its systems/handlers on the game.
// A module that fails to load is skipped (logged as a warning), so the world stays walkable.
import { Game } from './core.js';

export const MODULES = ['./hud.js', './classes.js', './mobs.js', './items.js', './progression.js', './wizard.js', './wizard_rig.js', './mob_rig.js', '../mobcull.js', './npc_rig.js', './feel.js', './combatcam.js', './quests.js', './tutorial.js', './tutorial_ui.js', './uipolish.js', './uiscreens.js', './uiframe.js', './audio_game.js'];

export async function startGame(ctx) {
  const game = new Game(ctx);
  // fetch all modules in parallel (a serial await chain cost ~1 s of round trips), then install in the listed order
  const mods = await Promise.all(MODULES.map(m => import(m).catch(e => e)));
  MODULES.forEach((m, i) => {
    try { if (mods[i] instanceof Error) throw mods[i]; mods[i].install?.(game); } catch (e) { console.warn('[game] module', m, 'not loaded:', e.message); }
  });
  game.emit('ready', {});
  return game;
}
