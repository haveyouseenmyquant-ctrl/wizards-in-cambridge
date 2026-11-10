// Rigged, animated player wizard (graphics s1, model swapped s3). Loads site/models/player/wizard.glb ("Animated Wizard"
// by Quaternius, CC-BY 3.0 via poly.pizza, trimmed by scripts/build_char_glb.mjs to the clips below) and draws it in place of the procedural
// wizard from wizard.js, which keeps running underneath (it still owns the broom and is the fallback if the model fails
// to load). Clips: idle, walk, run, cast, cast_raise, cast_long, hit, death, jump, dash, block, sit; picked from the
// player state each frame and cross-faded with an AnimationMixer driven by game.time.
// Per-class look: the texture is recoloured on a canvas (robe and trim hues), a procedural hat, a glowing staff focus.
import { Avatar } from '../avatar.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from '../../vendor/meshoptimizer/meshopt_decoder.module.js';

const URL_GLB = new URL('../../models/player/wizard.glb', import.meta.url).href;
const HEIGHT = 1.72;   // metres, head to boots (the pointed hat adds ~0.4 m above)
// robe: hue (deg), saturation scale, lightness scale; trim likewise; focus colour
const LOOK = {
  pyromancer: { robe: [4, 1.25, 1.05], trim: [38, 1.1, 1.15], focus: 0xff7a2a },
  stormcaller: { robe: [214, 1.1, 1.1], trim: [188, 0.9, 1.25], focus: 0x7fd4ff },
  warden: { robe: [42, 0.55, 0.95], trim: [32, 1.0, 1.1], focus: 0xffc860 },
  hexweaver: { robe: [272, 1.1, 0.8], trim: [150, 1.0, 1.1], focus: 0xc070ff },
};
const LOOPS = new Set(['idle', 'walk', 'run']);
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
      // Quaternius wizard: blue robe (hue ~220) and gold trim (hue ~40); skin, leather and grey beard are left alone
      const tgt = h >= 195 && h < 255 && s > 0.2 ? L.robe : h >= 32 && h < 58 && s > 0.3 && l < 0.6 ? L.trim : null;
      if (!tgt) continue;
      const S = Math.min(1, s * tgt[1]), Lt = Math.min(0.95, l * tgt[2]), C = (1 - Math.abs(2 * Lt - 1)) * S, H = tgt[0] / 60, X = C * (1 - Math.abs(H % 2 - 1)), m = Lt - C / 2;
      const [r1, g1, b1] = H < 1 ? [C, X, 0] : H < 2 ? [X, C, 0] : H < 3 ? [0, C, X] : H < 4 ? [0, X, C] : H < 5 ? [X, 0, C] : [C, 0, X];
      p[i] = (r1 + m) * 255; p[i + 1] = (g1 + m) * 255; p[i + 2] = (b1 + m) * 255;
    }
    g.putImageData(d, 0, 0);
    const t = new T.CanvasTexture(c); t.flipY = base.flipY; t.colorSpace = base.colorSpace; t.anisotropy = 4;
    return texCache[cls] = t;
  }

  function build(cls) {
    const L = LOOK[cls] || LOOK.stormcaller;
    const root = new T.Group(); root.name = 'wizard_rig';
    const model = SkeletonUtils.clone(asset.scene);
    const inner = new T.Group(); inner.add(model); root.add(inner);
    inner.rotation.y = Math.PI;   // the model faces +Z, the player model faces -Z
    let mat = null, staff = null, head = null;
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.frustumCulled = false;
        if (!mat) { const base = o.material; mat = new T.MeshStandardMaterial({ map: classTexture(cls, base.map), roughness: 0.85, metalness: 0 }); }
        o.material = mat;
      }
      if (o.name === 'Wizard_Staff') staff = o;
      if (o.name === 'Head') head = o;
    });
    model.updateMatrixWorld(true); const box = new T.Box3().setFromObject(model, true), h = box.max.y - box.min.y || 1;
    inner.scale.setScalar(HEIGHT / h); inner.position.y = -box.min.y * HEIGHT / h; root.updateMatrixWorld(true);
    // pointed hat on the Head bone (the model is bare-headed): class robe colour, trim band, slightly bent tip
    let hat = null;
    if (head) {
      const hc = new T.Color().setHSL(L.robe[0] / 360, 0.45, 0.2 * L.robe[2]), tc = new T.Color().setHSL(L.trim[0] / 360, 0.55, 0.45);
      const hm = new T.MeshStandardMaterial({ color: hc, roughness: 0.9 }), tm = new T.MeshStandardMaterial({ color: tc, roughness: 0.6, metalness: 0.3 });
      hat = new T.Group(); hat.name = 'wizard_hat';
      const brim = new T.Mesh(new T.CylinderGeometry(0.34, 0.36, 0.03, 24), hm); hat.add(brim);
      const band = new T.Mesh(new T.CylinderGeometry(0.175, 0.185, 0.06, 20), tm); band.position.y = 0.045; hat.add(band);
      const c1 = new T.Mesh(new T.CylinderGeometry(0.1, 0.18, 0.26, 20), hm); c1.position.y = 0.14; hat.add(c1);
      const c2 = new T.Mesh(new T.ConeGeometry(0.1, 0.26, 16), hm); c2.position.set(0, 0.36, -0.03); c2.rotation.x = -0.35; hat.add(c2);
      hat.traverse(o => { if (o.isMesh) o.castShadow = true; });
      const top = new T.Box3().setFromObject(model, true).max.y, hp = new T.Vector3(); head.getWorldPosition(hp);
      const ws = new T.Vector3(), wq = new T.Quaternion(); head.getWorldScale(ws); head.getWorldQuaternion(wq);
      hat.position.copy(head.worldToLocal(new T.Vector3(hp.x, top - 0.1, hp.z + 0.02)));
      hat.quaternion.copy(wq.invert()); hat.scale.setScalar(1 / (ws.x || 1)); head.add(hat);
    }
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
    return { cls, root, mixer, acts, mat, focus, hat, cur: null, oneShot: null, oneShotEnd: 0, lastT: game.time };
  }

  function destroy() {
    if (!R) return; game.root.remove(R.root); R.mixer.stopAllAction();
    R.mat.dispose(); R.hat?.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); R.focus?.geometry.dispose(); R.focus?.material.dispose(); R = null;
  }

  function play(name, fade = 0.18) {
    if (!R.acts[name] || R.cur === name) return;
    const next = R.acts[name], prev = R.acts[R.cur];
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    // loops start at a random phase so the gait is not in lock-step with whatever started it (fixed-step recordings)
    if (LOOPS.has(name)) next.time = Math.random() * next.getClip().duration;
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
    const hf = game.time - (R.hitT || -9) < 0.25 ? 1 : 0; R.mat.emissive.setRGB(0.5 * hf, 0.06 * hf, 0.04 * hf);   // red hit flash only
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
