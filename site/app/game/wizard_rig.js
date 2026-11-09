// Rigged, animated player wizard (graphics s1). Loads site/models/player/wizard.glb (KayKit Adventurers "Mage" by
// Kay Lousberg, CC0, trimmed by scripts/build_char_glb.mjs to the clips below) and draws it in place of the procedural
// wizard from wizard.js, which keeps running underneath (it still owns the broom and is the fallback if the model fails
// to load). Clips: idle, walk, run, cast, cast_raise, cast_long, hit, death, jump, dash, block, sit; picked from the
// player state each frame and cross-faded with an AnimationMixer driven by game.time.
// Per-class look: the KayKit palette atlas is recoloured on a canvas (robe and trim hues), plus a glowing staff focus.
import { Avatar } from '../avatar.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from '../../vendor/meshoptimizer/meshopt_decoder.module.js';

const URL_GLB = new URL('../../models/player/wizard.glb', import.meta.url).href;
const HEIGHT = 1.9;   // metres, hat included (matches the procedural wizard)
// robe: hue (deg), saturation scale, lightness scale; trim likewise; focus colour
const LOOK = {
  pyromancer: { robe: [4, 1.25, 1.05], trim: [38, 1.1, 1.15], focus: 0xff7a2a },
  stormcaller: { robe: [214, 1.1, 1.1], trim: [188, 0.9, 1.25], focus: 0x7fd4ff },
  warden: { robe: [42, 0.55, 0.95], trim: [32, 1.0, 1.1], focus: 0xffc860 },
  hexweaver: { robe: [272, 1.1, 0.8], trim: [150, 1.0, 1.1], focus: 0xc070ff },
};
const CAST_RAISE = new Set(['nova', 'zone', 'shield', 'summon']);

export function install(game) {
  const T = game.THREE;
  let asset = null, R = null, failed = false;
  const texCache = {};

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(URL_GLB)
    .then(g => { asset = g; }).catch(e => { failed = true; console.warn('[wizard_rig] model not loaded, procedural wizard stays:', e.message); });

  function classTexture(cls, base) {
    if (texCache[cls]) return texCache[cls];
    const L = LOOK[cls] || LOOK.stormcaller, img = base.image;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i] / 255, gg = p[i + 1] / 255, b = p[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, dl = mx - mn;
      if (dl < 0.08) continue;
      const s = dl / (1 - Math.abs(2 * l - 1));
      let h = mx === r ? ((gg - b) / dl) % 6 : mx === gg ? (b - r) / dl + 2 : (r - gg) / dl + 4; h = (h * 60 + 360) % 360;
      const tgt = h >= 228 && h < 290 ? L.robe : h >= 300 && h < 350 ? L.trim : null;
      if (!tgt) continue;
      const S = Math.min(1, s * tgt[1]), Lt = Math.min(0.95, l * tgt[2]), C = (1 - Math.abs(2 * Lt - 1)) * S, H = tgt[0] / 60, X = C * (1 - Math.abs(H % 2 - 1)), m = Lt - C / 2;
      const [r1, g1, b1] = H < 1 ? [C, X, 0] : H < 2 ? [X, C, 0] : H < 3 ? [0, C, X] : H < 4 ? [0, X, C] : H < 5 ? [X, 0, C] : [C, 0, X];
      p[i] = (r1 + m) * 255; p[i + 1] = (g1 + m) * 255; p[i + 2] = (b1 + m) * 255;
    }
    g.putImageData(d, 0, 0);
    const t = new T.CanvasTexture(c); t.flipY = base.flipY; t.colorSpace = base.colorSpace; t.magFilter = T.NearestFilter; t.generateMipmaps = false; t.minFilter = T.LinearFilter;
    return texCache[cls] = t;
  }

  function build(cls) {
    const L = LOOK[cls] || LOOK.stormcaller;
    const root = new T.Group(); root.name = 'wizard_rig';
    const model = SkeletonUtils.clone(asset.scene);
    const inner = new T.Group(); inner.add(model); root.add(inner);
    inner.rotation.y = Math.PI;   // KayKit faces +Z, the player model faces -Z
    let mat = null, staff = null;
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.frustumCulled = false;
        if (!mat) { const base = o.material; mat = new T.MeshStandardMaterial({ map: classTexture(cls, base.map), roughness: 0.85, metalness: 0 }); }
        o.material = mat;
      }
      if (o.name === '2H_Staff') staff = o;
    });
    model.updateMatrixWorld(true); const box = new T.Box3().setFromObject(model, true), h = box.max.y - box.min.y || 1;
    inner.scale.setScalar(HEIGHT / h); inner.position.y = -box.min.y * HEIGHT / h;
    // glowing focus at the staff head
    let focus = null;
    if (staff) {
      const sb = new T.Box3().setFromObject(staff), top = staff.worldToLocal(new T.Vector3((sb.min.x + sb.max.x) / 2, sb.max.y, (sb.min.z + sb.max.z) / 2));
      focus = new T.Mesh(new T.IcosahedronGeometry(0.09, 0), new T.MeshBasicMaterial({ color: L.focus, fog: false }));
      const ws = new T.Vector3(); staff.getWorldScale(ws); focus.userData.s = 1 / (ws.x || 1); focus.scale.setScalar(focus.userData.s);
      focus.position.copy(top); staff.add(focus);
    }
    const mixer = new T.AnimationMixer(model), acts = {};
    for (const clip of asset.animations) acts[clip.name] = mixer.clipAction(clip);
    for (const n of ['death', 'hit', 'cast', 'cast_raise', 'cast_long', 'jump', 'dash']) if (acts[n]) { acts[n].setLoop(T.LoopOnce, 1); acts[n].clampWhenFinished = true; }
    game.root.add(root);
    return { cls, root, mixer, acts, mat, focus, cur: null, oneShot: null, oneShotEnd: 0, lastT: game.time };
  }

  function destroy() {
    if (!R) return; game.root.remove(R.root); R.mixer.stopAllAction();
    R.mat.dispose(); R.focus?.geometry.dispose(); R.focus?.material.dispose(); R = null;
  }

  function play(name, fade = 0.18) {
    if (!R.acts[name] || R.cur === name) return;
    const next = R.acts[name], prev = R.acts[R.cur];
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    R.cur = name;
  }
  function oneShot(name, fade = 0.1) {
    if (!R || !R.acts[name]) return;
    R.cur = null; play(name, fade); R.oneShot = name; R.oneShotEnd = game.time + R.acts[name].getClip().duration * 0.92 / (R.acts[name].timeScale || 1);
  }

  const offs = [
    game.on('cast', e => { if (!R) return; const sp = game.caster?.spells?.find(s => s.id === e.spell);
      const n = CAST_RAISE.has(sp?.kind) ? 'cast_raise' : 'cast'; R.acts[n].timeScale = 1.6; oneShot(n, 0.06); }),
    game.on('playerHit', e => { if (R && e.amount > 0 && !(R.oneShot || '').startsWith('cast')) oneShot('hit', 0.06); }),
    game.on('dash', () => { if (R) { R.acts.dash.timeScale = 1.5; oneShot('dash', 0.05); } }),
  ];

  function update(p, visible, W) {
    if (!asset) return false;
    const cls = game.caster?.cls || 'stormcaller';
    if (!R || R.cls !== cls) { destroy(); R = build(cls); }
    R.root.visible = visible;
    const t = game.time, dt = Math.min(0.1, Math.max(0, t - R.lastT)); R.lastT = t;
    if (!visible) return true;
    R.root.position.set(p.x, p.z, -p.y); R.root.rotation.set(0, p.yaw, 0);
    const flying = p.mode === 'broom', sp = p.speed || 0, dead = game.stats.hp <= 0, air = !p.grounded && !flying;
    // the procedural broom (owned by wizard.js) rides along with the rigged model
    if (W?.broom && W.broom.parent !== R.root) R.root.add(W.broom);
    if (dead) { if (R.cur !== 'death') { R.oneShot = null; play('death', 0.12); } }
    else if (R.oneShot && t < R.oneShotEnd && !flying) { /* let the one-shot finish */ }
    else {
      R.oneShot = null;
      if (flying) play('sit', 0.25);
      else if (air) play('jump', 0.12);
      else if (sp > 3.6) { play('run'); R.acts.run.timeScale = Math.max(0.7, Math.min(1.6, sp / 5.5)); }
      else if (sp > 0.25) { play('walk'); R.acts.walk.timeScale = Math.max(0.6, Math.min(1.5, sp / 1.8)); }
      else play('idle', 0.25);
    }
    R.mixer.update(dt);
    if (R.focus) { const ca = R.oneShot?.startsWith('cast') ? 1 : 0; R.focus.rotation.y += dt * 2.5;
      R.focus.scale.setScalar(R.focus.userData.s * (1 + 0.8 * ca) * (1 + Math.sin(t * 6) * 0.06)); }
    R.mat.emissive.setRGB(game.time - (R.hitT || -9) < 0.25 ? 0.5 : 0, 0.03, 0.02);
    return true;
  }
  offs.push(game.on('playerHit', e => { if (R && e.amount > 0) R.hitT = game.time; }));

  // wrap the (already wrapped by wizard.js) avatar update: run the procedural wizard, then swap in the rig if loaded
  const prev = Avatar.prototype.update;
  Avatar.prototype.update = function (p, dt, visible) {
    prev.call(this, p, dt, visible);
    const W = game.wizard?.model, vis = visible || !!window.__wizShow;
    try { if (!failed && update(p, vis, W) && W) { W.root.visible = false; } }
    catch (e) { console.warn('[wizard_rig]', e); failed = true; if (R) R.root.visible = false; if (W) W.root.visible = vis; }
  };
  game.wizardRig = { get model() { return R; }, get ready() { return !!asset; }, play: n => oneShot(n) };
  game.add({ dispose() { Avatar.prototype.update = prev; for (const f of offs) f(); destroy(); for (const k in texCache) texCache[k].dispose(); } });
}
