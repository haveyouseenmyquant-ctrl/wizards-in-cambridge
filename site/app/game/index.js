// Starts the game layer. Each module exports install(game) and registers its systems/handlers on the game.
// A module that fails to load is skipped (logged as a warning), so the world stays walkable.
import { Game } from './core.js';

const MODULES = ['./hud.js', './classes.js', './mobs.js', './items.js', './progression.js', './wizard.js', './wizard_rig.js', './mob_rig.js', './npc_rig.js', './feel.js', './quests.js', './tutorial.js', './uipolish.js', './uiscreens.js', './uiframe.js', './audio_game.js'];

export async function startGame(ctx) {
  const game = new Game(ctx);
  for (const m of MODULES) {
    try { (await import(m)).install?.(game); } catch (e) { console.warn('[game] module', m, 'not loaded:', e.message); }
  }
  game.emit('ready', {});
  return game;
}
