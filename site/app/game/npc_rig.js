// Rigged, animated story NPCs (graphics s2). quests.js builds a primitive figure per NPC and hands it to
// game.npcRig.attach(group, npc); this loads site/models/npcs/<id>.glb (KayKit Adventurers by Kay Lousberg, CC0, trimmed
// by scripts/build_char_glb.mjs; clips idle, talk, walk, wave, hit, death), recolours its palette atlas from the NPC's
// palette in quests/*.json, hides the primitive (kept as the fallback) and plays idle, or talk while that NPC speaks.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from '../../vendor/meshoptimizer/meshopt_decoder.module.js';

const MODEL = { nell: 'nell', pip: 'pip', absalom: 'absalom', wat: 'absalom' };   // story s4: Wat Gedney reuses the lanky rig, recoloured
const HEIGHT = { nell: 1.68, pip: 1.75, absalom: 1.9, wat: 1.9 };   // metres before the NPC's own scale (Pip is 0.62)

export function install(game) {
  const T = game.THREE, loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), assets = {}, live = [];
  const load = (n) => assets[n] ??= loader.loadAsync(new URL(`../../models/npcs/${n}.glb`, import.meta.url).href)
    .catch(e => { console.warn('[npc_rig]', n, e.message); return null; });

  // palette recolour: saturated cloth pixels take the robe hue (dark ones) or trim hue (bright ones); skin and hair keep theirs
  // 919d: inline Uint8 HSL math (THREE.Color get/setHSL per pixel cost ~20 ms on the start frame) and one texture per
  // (model, robe, trim), so NPCs sharing a rig and palette share the recoloured atlas
  const texCache = new Map();
  const idle = () => new Promise(r => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 1500 }) : setTimeout(() => r({ timeRemaining: () => 6 }), 30)));
  const hsl = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (d === 0) return [0, 0, l];
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  };
  const hue = (p, q, t) => { t = t < 0 ? t + 1 : t > 1 ? t - 1 : t; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * 6 * (2 / 3 - t) : p; };
  // sliced over idle callbacks (rows of the 1024x1024 atlas while the frame has time left), one job per cache key
  async function recolour(tex, n, file) {
    const key = `${file}|${n.robe}|${n.trim}`;
    if (texCache.has(key)) return texCache.get(key);
    let done; texCache.set(key, new Promise(r => { done = r; }));
    let dl = await idle();
    const img = tex.image, W = img.width, H = img.height, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H), p = d.data, robe = new T.Color(n.robe || '#556'), trim = new T.Color(n.trim || '#ca6');
    const R = robe.getHSL({}), Tr = trim.getHSL({});
    for (let y = 0; y < H; y += 32) {
      if (dl.timeRemaining() < 3) dl = await idle();
      for (let i = y * W * 4, e = Math.min(H, y + 32) * W * 4; i < e; i += 4) {
        const [h, s, l] = hsl(p[i] / 255, p[i + 1] / 255, p[i + 2] / 255);   // raw bytes, as Color.setRGB/getHSL saw them
        if (s < 0.12) continue;
        if (h > 0.02 && h < 0.11 && l > 0.45) continue;   // skin
        const tgt = l > 0.6 ? Tr : R, S = Math.min(1, tgt.s * 1.05), L = Math.min(0.9, tgt.l * (0.55 + l));
        const q = L < 0.5 ? L * (1 + S) : L + S - L * S, pp = 2 * L - q;
        p[i] = hue(pp, q, tgt.h + 1 / 3) * 255; p[i + 1] = hue(pp, q, tgt.h) * 255; p[i + 2] = hue(pp, q, tgt.h - 1 / 3) * 255;
      }
    }
    if (dl.timeRemaining() < 3) dl = await idle();
    g.putImageData(d, 0, 0);
    const t = new T.CanvasTexture(c); t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.magFilter = T.NearestFilter; t.minFilter = T.LinearFilter; t.generateMipmaps = false;
    texCache.set(key, t); done(t); return t;
  }

  const boxes = {};   // precise skinned bounds per rig file (bind pose)
  async function attach(group, n) {
    const file = MODEL[n.id]; if (!file) return;
    const A = await load(file); if (!A || group.userData.npcRig) return;
    let srcMap = null; A.scene.traverse(o => { if (o.isMesh) srcMap ??= o.material.map; });
    const map = await recolour(srcMap, n, file);   // 919d: built in idle slices, never on the start frame
    if (group.userData.npcRig) return;
    const model = SkeletonUtils.clone(A.scene), inner = new T.Group(); inner.name = 'npc_glb'; inner.add(model);
    const mat = new T.MeshStandardMaterial({ map, roughness: 0.85 });
    model.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = true; o.frustumCulled = false; } });
    model.updateMatrixWorld(true);
    const box = boxes[file] ??= new T.Box3().setFromObject(model, true), k = (HEIGHT[n.id] || 1.75) / (box.max.y - box.min.y || 1);
    inner.scale.setScalar(k); inner.position.y = -box.min.y * k;
    for (const ch of group.children) if (ch !== group.userData.marker) ch.visible = false;   // primitive figure stays as the fallback
    group.add(inner);
    const mixer = new T.AnimationMixer(model), acts = {};
    for (const c of A.animations) acts[c.name] = mixer.clipAction(c);
    const R = group.userData.npcRig = { id: n.id, mixer, acts, cur: null };
    play(R, 'idle'); acts.idle.time = Math.random() * acts.idle.getClip().duration;
    live.push(R);
  }

  function play(R, name, fade = 0.3) {
    const a = R.acts[name]; if (!a || R.cur === name) return;
    const prev = R.cur && R.acts[R.cur];
    a.reset().play(); if (prev) prev.crossFadeTo(a, fade, false);
    R.cur = name;
  }

  game.add({ update(dt) {
    const who = game.quests?.speaker;
    for (const R of live) { play(R, who === R.id ? 'talk' : 'idle'); R.mixer.update(dt); }
  } });
  game.npcRig = { attach, live };
}
