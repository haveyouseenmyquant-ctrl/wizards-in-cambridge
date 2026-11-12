// Exploration mode avatar (graphics s2). In ?explore the game layer never starts, so the third-person view used to show
// the blocky explorer figure. This installs wizard_rig.js on a tiny stand-in for the game (clock, class from the save,
// no events) so the rigged wizard walks, runs and idles there too. No mobs, HUD or combat are loaded. When the player
// toggles into the game (G), the game's own wizard modules take over the avatar and this rig is hidden.
import * as THREE from 'three';
import { Avatar } from '../avatar.js';
import { install as installRig } from './wizard_rig.js';
import { SAVE_KEY } from './core.js';

let done = false;
export function install({ scene }) {
  if (done) return; done = true;
  let cls = 'stormcaller';
  try { cls = JSON.parse(localStorage.getItem(SAVE_KEY))?.cls || cls; } catch {}
  // s11: the player's own clock (fixed-step recordings advance it between rendered frames; wall time did not)
  let pl = null;
  const root = new THREE.Group(); root.name = 'explore_rig'; scene.add(root);
  const shim = { THREE, root, get time() { return pl ? pl.t : performance.now() / 1000; }, caster: { cls }, stats: { hp: 1 },
    on: () => () => {}, add: (s) => s };
  const base = Avatar.prototype.update;
  installRig(shim);
  const rigged = Avatar.prototype.update;
  Avatar.prototype.update = function (p, dt, visible) {
    pl = p;
    rigged.call(this, p, dt, visible);
    root.visible = true;
    if (shim.wizardRig?.model?.root.visible) { this.root.visible = false; }
  };
  // the game's wizard.js replaces the avatar update without calling down the chain: hide this rig while it runs
  const watch = () => { if (window.__game && !window.__explore) root.visible = false; requestAnimationFrame(watch); };
  requestAnimationFrame(watch);
  return { base };
}
