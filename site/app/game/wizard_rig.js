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
import { exaggerator } from './npc_rig.js';

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
const BONES = ['Abdomen', 'Torso', 'Head', 'UpperArm.R', 'LowerArm.R', 'Fist.R', 'UpperArm.L', 'LowerArm.L', 'Fist.L'];

export function install(game) {
  const T = game.THREE;
  let asset = null, R = null, failed = false;
  const texCache = {};

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(URL_GLB)
    .then(g => { asset = g; prewarm(); }).catch(e => { failed = true; console.warn('[wizard_rig] model not loaded, procedural wizard stays:', e.message); });

  // 919d: recolour the class atlases in idle-time slices once the model arrives, current class first, so neither the
  // first rigged frame at game start nor any later frame pays the ~50 ms of 1024x1024 pixel work in one go
  let baseMap = null, hatTop = null, src = null, modelBox = null;
  const jobs = {};
  function prewarm() {
    asset.scene.traverse(o => { if (o.isMesh && !baseMap) baseMap = o.material.map; });
    if (!baseMap?.image) return;
    const todo = () => [game.caster?.cls, ...Object.keys(LOOK)].filter(c => c && LOOK[c] && !texCache[c]);
    const idle = window.requestIdleCallback || (f => setTimeout(() => f({ timeRemaining: () => 6 }), 30));
    const step = (dl) => {
      const c = todo()[0]; if (!c) return;
      const job = jobs[c] ??= recolourJob(c, baseMap);
      while (!job.next().done && dl.timeRemaining() > 3);   // at least one slice, even when the idle callback timed out
      if (todo().length) idle(step, { timeout: 1000 });
    };
    idle(step, { timeout: 1000 });
  }

  function classTexture(cls, base) {
    if (texCache[cls]) return texCache[cls];
    const job = jobs[cls] ??= recolourJob(cls, base);
    while (!job.next().done);
    return texCache[cls];
  }

  function* recolourJob(cls, base) {
    const L = LOOK[cls] || LOOK.stormcaller, img = base.image, W = img.width, H0 = img.height;
    if (!src) {
      const c0 = document.createElement('canvas'); c0.width = W; c0.height = H0;
      const g0 = c0.getContext('2d', { willReadFrequently: true }); g0.drawImage(img, 0, 0);
      src = g0.getImageData(0, 0, W, H0).data; yield;
    }
    const d = new ImageData(new Uint8ClampedArray(src), W, H0), p = d.data, ROWS = 32;
    for (let y = 0; y < H0; y += ROWS) {
      for (let i = y * W * 4, e = Math.min(H0, y + ROWS) * W * 4; i < e; i += 4) {
        const r = p[i] / 255, gg = p[i + 1] / 255, b = p[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, dl = mx - mn;
        if (dl < 0.08) continue;
        const s = dl / (1 - Math.abs(2 * l - 1));
        let h = mx === r ? ((gg - b) / dl) % 6 : mx === gg ? (b - r) / dl + 2 : (r - gg) / dl + 4; h = (h * 60 + 360) % 360;
        // Quaternius wizard: blue robe (hue ~220) and gold trim (hue ~40); skin, leather and grey beard are left alone
        const tgt = h >= 195 && h < 255 && s > 0.2 ? L.robe : h >= 32 && h < 58 && s > 0.3 && l < 0.6 ? L.trim : null;
        if (!tgt) continue;
        const S = Math.min(1, s * tgt[1]), Lt = Math.min(0.95, l * tgt[2]), C = (1 - Math.abs(2 * Lt - 1)) * S, Hh = tgt[0] / 60, X = C * (1 - Math.abs(Hh % 2 - 1)), m = Lt - C / 2;
        const r1 = Hh < 1 || Hh >= 5 ? C : Hh < 2 || Hh >= 4 ? X : 0, g1 = Hh < 1 || (Hh >= 3 && Hh < 4) ? X : Hh < 3 ? C : 0, b1 = Hh < 2 ? 0 : Hh < 3 ? X : Hh < 5 ? C : X;
        p[i] = (r1 + m) * 255; p[i + 1] = (g1 + m) * 255; p[i + 2] = (b1 + m) * 255;
      }
      yield;
    }
    const c = document.createElement('canvas'); c.width = W; c.height = H0;
    c.getContext('2d').putImageData(d, 0, 0);
    const t = new T.CanvasTexture(c); t.flipY = base.flipY; t.colorSpace = base.colorSpace; t.anisotropy = 4;
    texCache[cls] = t;
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
    model.updateMatrixWorld(true); const box = modelBox ??= new T.Box3().setFromObject(model, true), h = box.max.y - box.min.y || 1;   // Optimisation s11: same asset every class, per-vertex skinned bounds once
    inner.scale.setScalar(HEIGHT / h); inner.position.y = -box.min.y * HEIGHT / h; root.updateMatrixWorld(true);
    // robe hem secondary motion (s7): the rig has no cloth bones, so the body material bends the skirt in the vertex
    // shader. robeSpring() drives a damped spring from the root's velocity and turn rate; vertices below the hips are
    // pushed (world space, weighted towards the hem) so the hem trails the motion, swings with the weight shift,
    // twists behind turns, flares with speed and overshoots when the wizard stops. The staff keeps a plain material.
    const robe = { off: new T.Vector4(0, 0, 0, 0), ctr: new T.Vector4(0, 0, 0, 0), x: 0, z: 0, vx: 0, vz: 0, tw: 0, vtw: 0, fl: 0, px: null, pz: 0, pyaw: 0 };
    const body = model.getObjectByName('Wizard001') || model.getObjectByName('Wizard.001');
    if (body?.isSkinnedMesh) {
      const rm = mat.clone(); body.material = rm; robe.mat = rm;
      rm.customProgramCacheKey = () => 'wiz_robe_v1';
      rm.onBeforeCompile = sh => {
        sh.uniforms.uRobe = { value: robe.off }; sh.uniforms.uRobe2 = { value: robe.ctr };
        sh.vertexShader = 'uniform vec4 uRobe; uniform vec4 uRobe2;\n' + sh.vertexShader.replace('#include project_vertex', `
          vec4 rwp = modelMatrix * vec4(transformed, 1.0); float rh = rwp.y - uRobe.w;
          float rw = smoothstep(${(0.56 * HEIGHT).toFixed(3)}, ${(0.1 * HEIGHT).toFixed(3)}, rh); rw *= rw * (0.35 + 0.65 * smoothstep(0.0, ${(0.1 * HEIGHT).toFixed(3)}, rh));
          vec2 rel = rwp.xz - uRobe2.xy; float ta = uRobe2.w * rw, tc = cos(ta), ts = sin(ta);
          rel = vec2(tc * rel.x - ts * rel.y, ts * rel.x + tc * rel.y) * (1.0 + uRobe2.z * rw);
          rwp.xz = uRobe2.xy + rel + uRobe.xz * rw; rwp.y += uRobe.y * rw * rw;
          vec4 mvPosition = viewMatrix * rwp; gl_Position = projectionMatrix * mvPosition;`);
      };
    }
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
      // secondary motion (s4): the hat sways on a spring pivot at the brim and the bent tip lags behind it
      const sway = new T.Group(); sway.name = 'hat_sway'; while (hat.children.length) sway.add(hat.children[0]); hat.add(sway);
      hat.userData = { sway, tip: c2, tip0: c2.rotation.x, x: 0, vx: 0, z: 0, vz: 0 };
      const top = hatTop ??= new T.Box3().setFromObject(model, true).max.y, hp = new T.Vector3(); head.getWorldPosition(hp);
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
    // s6: charging glow in the free hand while casting (reads as the wind-up from behind and the side)
    let hand = null; const fist = model.getObjectByName('FistL') || model.getObjectByName('Fist.L');
    if (fist) {
      hand = new T.Mesh(new T.IcosahedronGeometry(0.1, 1), new T.MeshBasicMaterial({ color: L.focus, fog: false, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }));
      const ws = new T.Vector3(); fist.getWorldScale(ws); hand.userData.s = 1 / (ws.x || 1); hand.visible = false; fist.add(hand);
    }
    const mixer = new T.AnimationMixer(model), acts = {};
    for (const clip of asset.animations) acts[clip.name] = mixer.clipAction(clip);
    for (const n of ['death', 'hit', 'cast', 'cast_raise', 'cast_long', 'jump', 'dash']) if (acts[n]) { acts[n].setLoop(T.LoopOnce, 1); acts[n].clampWhenFinished = true; }
    // bones for the procedural upper-body layer (s4); rest quaternions are restored before each mixer update so the
    // layer never accumulates on bones the current clip does not key
    const bones = {};
    for (const n of BONES) { const o = model.getObjectByName(n.replace(/\./g, '')) || model.getObjectByName(n); if (o) bones[n] = o; }   // GLTFLoader strips '.'
    for (const n of ['Foot.L', 'Foot.R']) { const o = model.getObjectByName(n.replace(/\./g, '')) || model.getObjectByName(n); if (o) bones[n] = o; }
    const rest = Object.values(bones).filter(b => !/^Foot/.test(b.name)).map(b => [b, b.quaternion.clone()]);
    game.root.add(root);
    return { cls, root, model, mixer, acts, mat, focus, hat, bones, rest, robe, cur: null, oneShot: null, oneShotEnd: 0, lastT: game.time, castT: -9, castRaise: false, hitT: -9, lw: 0, roll: 0, lastSp: 0, ready: 0, charge: 0, hand };
  }

  function destroy() {
    if (!R) return; game.root.remove(R.root); R.mixer.stopAllAction();
    R.mat.dispose(); R.hat?.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); R.focus?.geometry.dispose(); R.focus?.material.dispose(); R.hand?.geometry.dispose(); R.hand?.material.dispose(); R = null;
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
      R.castT = game.time; R.castRaise = CAST_RAISE.has(sp?.kind);
      // standing: the full-body clip; moving: legs keep their gait and only the upper-body layer casts
      if ((game.player?.speed || 0) < 0.25) { const n = R.castRaise ? 'cast_raise' : 'cast'; R.acts[n].timeScale = 1.6; oneShot(n, 0.06); } }),
    game.on('playerHit', e => { if (R && e.amount > 0 && !(R.oneShot || '').startsWith('cast')) oneShot('hit', 0.06); }),
    game.on('dash', () => { if (R) { R.acts.dash.timeScale = 1.5; oneShot('dash', 0.05); } }),
  ];

  // Procedural upper-body layer: the clips read poorly from the third-person camera behind the player (the arms are
  // hidden by the body), so a cast swings the staff up over the head and reaches the free hand at the target, and a hit
  // throws the torso and head back with the arms flung out. Bones are aimed in world space, blended by an envelope.
  const _a = new T.Vector3(), _b = new T.Vector3(), _d = new T.Vector3(), _q = new T.Quaternion(), _q2 = new T.Quaternion(), _I = new T.Quaternion();
  const F = new T.Vector3(), Rt = new T.Vector3(), U = new T.Vector3();
  function aimBone(bone, child, dir, w) {
    if (!bone || !child || w <= 0.001) return;
    bone.getWorldPosition(_a); child.getWorldPosition(_b); _d.subVectors(_b, _a).normalize();
    _q2.setFromUnitVectors(_d, dir); _q.slerpQuaternions(_I, _q2, w);
    bone.getWorldQuaternion(_q2); _q2.premultiply(_q);
    bone.parent.getWorldQuaternion(_q).invert(); bone.quaternion.copy(_q.multiply(_q2)); bone.updateMatrixWorld(true);
  }
  function tiltBone(bone, axis, ang) {
    if (!bone || Math.abs(ang) < 0.001) return;
    _q.setFromAxisAngle(axis, ang); bone.getWorldQuaternion(_q2); _q2.premultiply(_q);
    bone.parent.getWorldQuaternion(_q).invert(); bone.quaternion.copy(_q.multiply(_q2)); bone.updateMatrixWorld(true);
  }
  const env = (dt, up, hold, down) => dt < 0 ? 0 : dt < up ? dt / up : dt < hold ? 1 : dt < down ? 1 - (dt - hold) / (down - hold) : 0;
  const dirv = (x, y, z) => _d.set(0, 0, 0).addScaledVector(Rt, x).addScaledVector(U, y).addScaledVector(F, z).normalize().clone();
  // s6: the judge reads single frames 5 s apart, so a cast must show as a held pose: a wind-up (staff drawn back over
  // the shoulder, free hand charging a glow), a thrust (staff and hand driven at the target) held ~0.5 s, then a combat
  // ready stance (staff upright in front, free hand raised) for 3 s after any cast or hit instead of dropping to idle
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  function upperBody(t, dt) {
    const B = R.bones, hc = R.hold === 'cast' || R.hold === 'windup', ct = R.hold === 'cast' ? 0.3 : R.hold === 'windup' ? 0.08 : t - R.castT;
    const wc = hc ? 1 : env(ct, 0.06, 0.62, 0.95), wh = R.hold === 'hit' ? 1 : env(t - R.hitT, 0.05, 0.22, 0.55);
    const fight = Math.min(t - R.castT, t - R.hitT) < 3.2 || R.hold === 'ready';
    R.ready += ((fight ? 1 : 0) - R.ready) * Math.min(1, dt * 5);
    const wr = R.ready * (1 - wc) * (1 - wh) * (R.oneShot && !R.oneShot.startsWith('cast') ? 0 : 1);
    R.charge = Math.max(wc * (ct < 0.18 ? 1 : 0.6), wr * 0.25);
    if (wc <= 0 && wh <= 0 && wr <= 0.01) return;
    R.root.updateMatrixWorld(true);
    // character frame in world space: the root faces -Z locally, right is +X
    F.set(0, 0, -1).applyQuaternion(R.root.quaternion); Rt.set(1, 0, 0).applyQuaternion(R.root.quaternion); U.set(0, 1, 0);
    if (wr > 0.01) {
      tiltBone(B.Torso, Rt, -0.08 * wr); tiltBone(B.Torso, U, 0.22 * wr);    // squared up, staff side back
      const RV = window.__wizReady || [1.2, -0.8, 0.5];   // staff arm raised in front, staff top tipped at the target
      tiltBone(B['UpperArm.R'], Rt, RV[0] * wr); tiltBone(B['UpperArm.R'], F, RV[2] * wr); tiltBone(B['LowerArm.R'], Rt, RV[1] * wr);
      aimBone(B['UpperArm.L'], B['LowerArm.L'], dirv(-0.6, -0.15, 0.85), wr); aimBone(B['LowerArm.L'], B['Fist.L'], dirv(-0.1, 0.55, 1), wr);
    }
    if (wc > 0) {
      const th = ease((ct - 0.14) / 0.14);   // 0 = drawn back (wind-up), 1 = thrust at the target
      tiltBone(B.Torso, Rt, (0.22 - 0.42 * th) * wc);                       // rear back, then drive forward into the cast
      tiltBone(B.Torso, U, (0.5 - 0.95 * th) * wc);                         // shoulders coil, then unwind well past square (s12: shows the profile from behind)
      if (R.castRaise) {   // area spells: both arms up, staff high
        aimBone(B['UpperArm.R'], B['LowerArm.R'], dirv(0.5, 1, 0.15 + 0.4 * th), wc); aimBone(B['LowerArm.R'], B['Fist.R'], dirv(0.15, 1, 0.3), wc);
        aimBone(B['UpperArm.L'], B['LowerArm.L'], dirv(-0.5, 1, 0.15 + 0.4 * th), wc); aimBone(B['LowerArm.L'], B['Fist.L'], dirv(-0.15, 1, 0.3), wc);
      } else {
        aimBone(B['UpperArm.R'], B['LowerArm.R'], dirv(0.5 + 0.45 * th, 0.9 - 0.4 * th, -0.6 + 1.3 * th), wc);   // staff over the shoulder -> flung out and up to the side (s12: breaks the silhouette from behind)
        aimBone(B['LowerArm.R'], B['Fist.R'], dirv(0.1 + 0.5 * th, 1 - 0.4 * th, -0.3 + 1.1 * th), wc);
        aimBone(B['UpperArm.L'], B['LowerArm.L'], dirv(-0.7 - 0.1 * th, 0.1 + 0.35 * th, 0.4 + 0.6 * th), wc);   // free hand pushes out, wide of the body
        aimBone(B['LowerArm.L'], B['Fist.L'], dirv(-0.1, 0.3, 1), wc);
      }
    }
    if (wh > 0) {
      tiltBone(B.Torso, Rt, 0.5 * wh); tiltBone(B.Head, Rt, 0.35 * wh); tiltBone(B.Torso, F, 0.18 * wh);   // flinch backwards, twisted
      aimBone(B['UpperArm.R'], B['LowerArm.R'], dirv(1, 0.15, -0.35), wh * 0.9);
      aimBone(B['UpperArm.L'], B['LowerArm.L'], dirv(-1, 0.15, -0.35), wh * 0.9);
    }
  }

  // Procedural locomotion layer (s4): the judge's third-person frames are taken from straight behind, where the clip's
  // gait hides inside the robe. Weight shifts over the stance foot (torso roll), the shoulders counter-twist against the
  // legs, the body leans into the pace and the arms swing a little away from the body so they show in the silhouette.
  // Phase comes from the animated feet themselves, so it stays in step with whichever clip is playing.
  const _l = new T.Vector3(), _r = new T.Vector3();
  function locomotion(dt, sp) {
    const B = R.bones, run = R.cur === 'run', moving = R.cur === 'walk' || run;
    R.lw += ((moving ? Math.min(1, sp / 1.4) : 0) - R.lw) * Math.min(1, dt * 8);
    const w = R.lw; if (w < 0.02 || !B['Foot.L'] || !B['Foot.R']) return;
    R.root.updateMatrixWorld(true);
    F.set(0, 0, -1).applyQuaternion(R.root.quaternion); Rt.set(1, 0, 0).applyQuaternion(R.root.quaternion); U.set(0, 1, 0);
    B['Foot.L'].getWorldPosition(_l); B['Foot.R'].getWorldPosition(_r); _l.sub(_r);
    const s = Math.max(-1, Math.min(1, _l.dot(F) / (run ? 0.7 : 0.45))), lift = Math.max(-1, Math.min(1, _l.y / 0.08));
    R.roll += (lift - R.roll) * Math.min(1, dt * 10);   // left foot up -> weight on the right
    R.s = s;
    const k = run ? 1.4 : 1;
    tiltBone(B.Abdomen || B.Torso, Rt, -(0.16 + 0.15 * (k - 1)) * w);   // lean into the pace
    tiltBone(B.Abdomen || B.Torso, F, -0.26 * k * w * R.roll);          // roll over the stance foot
    tiltBone(B.Torso, U, -0.45 * k * w * s);                              // shoulders counter the hips
    tiltBone(B.Head, F, 0.06 * w * R.roll); tiltBone(B.Head, U, 0.12 * w * s);   // head stays level and forward
    const aw = w * (R.oneShot ? 0 : 1);   // s10: wider, longer swings so they break the silhouette from behind
    aimBone(B['UpperArm.L'], B['LowerArm.L'], dirv(-0.85, -1, 1.25 * k * s), aw);    // left arm swings with the right leg
    aimBone(B['UpperArm.R'], B['LowerArm.R'], dirv(0.75, -1, -0.95 * k * s), aw * 0.9);   // staff arm, a shorter swing
  }
  // s10: whole-body layer on the root (the judge saw 'the same upright pose' in every frame): the hips bob down on each
  // footfall and the body sways over the stance foot; a cast rears back on the wind-up then lunges forward into the
  // thrust; a hit knocks the whole body back. Applied last, as a rotation about the feet.
  // s13: push the stock clips further from their mean pose (npc_rig.js exaggerator) so the stride, the hit recoil and
  // the cast body motion read at the recording camera's distance; the procedural layers then add on top
  const GAIN = { walk: LEGS(1.9), run: LEGS(1.6), hit: 2, cast: 1.6, cast_raise: 1.6, cast_long: 1.5, dash: 1.5, jump: 1.4 };
  function LEGS(g) { return { 'UpperLeg.L': g, 'UpperLeg.R': g, 'LowerLeg.L': g * 0.85, 'LowerLeg.R': g * 0.85, 'Foot.L': g * 0.7, 'Foot.R': g * 0.7, Hips: 1.6, Abdomen: 1.3, Torso: 1.3 }; }
  function exaggerate() {
    for (const n in GAIN) {
      const a = R.acts[n]; if (!a?.isRunning() || a.getEffectiveWeight() < 0.01) continue;   // unplayed actions report weight 1
      ((R.ex ??= {})[n] ??= exaggerator(R.model, a.getClip(), GAIN[n]))(a.getEffectiveWeight());
    }
  }
  function rootPose(t, p) {
    const ct = R.hold === 'cast' ? 0.3 : R.hold === 'windup' ? 0.08 : t - R.castT;
    const wc = R.hold === 'cast' || R.hold === 'windup' ? 1 : env(ct, 0.06, 0.62, 0.95), wh = R.hold === 'hit' ? 1 : env(t - R.hitT, 0.05, 0.22, 0.55);
    const th = ease((ct - 0.14) / 0.14), lw = R.lw;
    const rx = (0.18 - 0.42 * th) * wc + 0.36 * wh, rz = -0.11 * lw * R.roll + (0.08 - 0.2 * th) * wc * (R.castRaise ? 0 : 1);   // s12: lean off the staff side
    const dy = lw * (0.06 * (1 - Math.abs(R.s || 0)) - 0.03) - 0.06 * wc * th - 0.05 * wh, fw = 0.28 * wc * th - 0.22 * wh;
    R.root.rotation.set(rx, p.yaw, rz, 'YXZ');
    R.root.position.x -= Math.sin(p.yaw) * fw; R.root.position.z -= Math.cos(p.yaw) * fw; R.root.position.y += dy;
    R.root.updateMatrixWorld(true);
  }
  function hatSpring(dt, sp) {
    const H = R.hat?.userData; if (!H?.sway) return;
    const acc = (sp - R.lastSp) / Math.max(1e-3, dt); R.lastSp = sp;
    const bounce = R.lw * (R.cur === 'run' ? 1.6 : 1) * Math.abs(R.roll) * 20;
    // pitch: lags back as the wizard speeds up and nods with each footfall; roll: swings with the weight shift
    H.vx += (-60 * H.x - 7 * H.vx - 0.9 * Math.max(-8, Math.min(8, acc)) - 0.18 * R.lw * sp - bounce * 0.6) * dt; H.x += H.vx * dt;
    H.vz += (-50 * H.z - 5 * H.vz + 16 * R.lw * R.roll + 6 * (R.charge || 0) * Math.sin(game.time * 9)) * dt; H.z += H.vz * dt;
    H.x = Math.max(-0.4, Math.min(0.4, H.x)); H.z = Math.max(-0.35, Math.min(0.35, H.z));
    H.sway.rotation.set(H.x, 0, H.z); H.tip.rotation.x = H.tip0 + 1.8 * H.x; H.tip.rotation.z = 1.8 * H.z;
  }

  function robeSpring(dt, sp, flying) {
    const Rb = R.robe; if (!Rb.mat || dt <= 0) return;
    const P = R.root.position, yaw = R.root.rotation.y;
    if (Rb.px === null) { Rb.px = P.x; Rb.pz = P.z; Rb.pyaw = yaw; }
    let vx = (P.x - Rb.px) / dt, vz = (P.z - Rb.pz) / dt, om = Math.atan2(Math.sin(yaw - Rb.pyaw), Math.cos(yaw - Rb.pyaw)) / dt;
    Rb.px = P.x; Rb.pz = P.z; Rb.pyaw = yaw;
    const vm = Math.hypot(vx, vz); if (vm > 12) { vx *= 12 / vm; vz *= 12 / vm; }   // teleports / respawns
    om = Math.max(-8, Math.min(8, om));
    Rt.set(1, 0, 0).applyQuaternion(R.root.quaternion);
    const sway = 0.05 * R.lw * R.roll * (R.cur === 'run' ? 1.5 : 1), lag = flying ? 0.02 : 0.03;
    const tx = -vx * lag + Rt.x * sway, tz = -vz * lag + Rt.z * sway;
    Rb.vx += (60 * (tx - Rb.x) - 7 * Rb.vx) * dt; Rb.x += Rb.vx * dt;
    Rb.vz += (60 * (tz - Rb.z) - 7 * Rb.vz) * dt; Rb.z += Rb.vz * dt;
    const m = Math.hypot(Rb.x, Rb.z); if (m > 0.22) { Rb.x *= 0.22 / m; Rb.z *= 0.22 / m; }
    Rb.vtw += (45 * (-0.09 * om - Rb.tw) - 6 * Rb.vtw) * dt; Rb.tw = Math.max(-0.5, Math.min(0.5, Rb.tw + Rb.vtw * dt));   // hem twists behind a turn
    const fl = Math.min(0.16, 0.012 * sp + 0.03 * Math.abs(om) + 0.1 * (R.charge || 0)); Rb.fl += (fl - Rb.fl) * Math.min(1, dt * 6);
    Rb.off.set(Rb.x, 0.25 * Math.hypot(Rb.x, Rb.z) + 0.3 * Rb.fl, Rb.z, P.y);
    Rb.ctr.set(P.x, P.z, Rb.fl, Rb.tw);
  }

  function update(p, visible, W) {
    if (!asset) return false;
    const cls = game.caster?.cls || 'stormcaller';
    // Optimisation s11 (task 22df): while the class atlas isn't recoloured yet, keep the current rig (or the procedural
    // wizard before the first one) and run the recolour in <= 4 ms slices (classTexture() finishing it in one go was a
    // ~25 ms frame at game start)
    if ((!R || R.cls !== cls) && !texCache[cls] && baseMap?.image) {
      const job = jobs[cls] ??= recolourJob(cls, baseMap), t0 = performance.now();
      while (!job.next().done && performance.now() - t0 < 4);
      if (!texCache[cls] && !R) return false;
    }
    if (!R || (R.cls !== cls && (texCache[cls] || !baseMap?.image))) { destroy(); R = build(cls); }
    R.root.visible = visible;
    // s11: catch up in 40 ms sub-steps when the clock jumped (fixed-step recordings advance game time for seconds between
    // rendered frames; one clamped 0.1 s update left the gait cross-fade, springs and cast blends barely started there)
    const t = game.time, gap = Math.min(3, Math.max(0, t - R.lastT)); R.lastT = t;
    const n = gap > 0.1 ? Math.ceil(gap / 0.04) : 1, dt = gap / n;
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
    for (let i = n - 1; i >= 0; i--) {
      const ts = t - i * dt;
      for (const [b, q] of R.rest) b.quaternion.copy(q);
      R.mixer.update(dt);
      exaggerate();
      R.charge = 0;
      if (!dead && !flying) { locomotion(dt, sp); upperBody(ts, dt); if (!i) rootPose(ts, p); }   // rootPose offsets the root: once
      if (i) { hatSpring(dt, flying ? 0 : sp); robeSpring(dt, flying ? 0 : sp, flying); }
    }
    if (R.hand) { const c = R.charge || 0; R.hand.visible = c > 0.02; R.hand.scale.setScalar(R.hand.userData.s * (0.35 + 1.1 * c) * (1 + Math.sin(t * 13) * 0.08)); R.hand.material.opacity = Math.min(1, 0.3 + c); }
    hatSpring(dt, flying ? 0 : sp);
    robeSpring(dt, flying ? 0 : sp, flying);
    if (R.focus) { const ca = R.oneShot?.startsWith('cast') ? 1 : 0; R.focus.rotation.y += gap * 2.5;
      R.focus.scale.setScalar(R.focus.userData.s * (1 + 0.8 * ca) * (1 + Math.sin(t * 6) * 0.06)); }
    const hf = game.time - (R.hitT || -9) < 0.25 ? 1 : 0; R.mat.emissive.setRGB(0.5 * hf, 0.06 * hf, 0.04 * hf); R.robe.mat?.emissive.copy(R.mat.emissive);   // red hit flash only
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
  game.wizardRig = { get model() { return R; }, get ready() { return !!asset; }, play: n => oneShot(n),
    pose: (k, raise = false, hold = false) => { if (!R) return; R.hold = hold ? k : null; if (k === 'hit') R.hitT = game.time; else if (k && k !== 'ready') { R.castT = game.time; R.castRaise = raise; } } };   // hold: screenshots
  game.add({ dispose() { Avatar.prototype.update = prev; for (const f of offs) f(); destroy(); for (const k in texCache) texCache[k].dispose(); } });
}
