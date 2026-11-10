// Rigged, animated story NPCs (graphics s2). quests.js builds a primitive figure per NPC and hands it to
// game.npcRig.attach(group, npc); this loads site/models/npcs/<id>.glb (KayKit Adventurers by Kay Lousberg, CC0, trimmed
// by scripts/build_char_glb.mjs; clips idle, talk, walk, wave, hit, death), recolours its palette atlas from the NPC's
// palette in quests/*.json, hides the primitive (kept as the fallback) and plays idle, or talk while that NPC speaks.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from '../../vendor/meshoptimizer/meshopt_decoder.module.js';

const MODEL = { nell: 'nell', pip: 'pip', absalom: 'absalom' };
const HEIGHT = { nell: 1.68, pip: 1.75, absalom: 1.9 };   // metres before the NPC's own scale (Pip is 0.62)

export function install(game) {
  const T = game.THREE, loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), assets = {}, live = [];
  const load = (n) => assets[n] ??= loader.loadAsync(new URL(`../../models/npcs/${n}.glb`, import.meta.url).href)
    .catch(e => { console.warn('[npc_rig]', n, e.message); return null; });

  // palette recolour: saturated cloth pixels take the robe hue (dark ones) or trim hue (bright ones); skin and hair keep theirs
  function recolour(tex, n) {
    const img = tex.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data, hsl = {}, robe = new T.Color(n.robe || '#556'), trim = new T.Color(n.trim || '#ca6');
    const R = robe.getHSL({}), Tr = trim.getHSL({}), col = new T.Color();
    for (let i = 0; i < p.length; i += 4) {
      col.setRGB(p[i] / 255, p[i + 1] / 255, p[i + 2] / 255).getHSL(hsl);
      if (hsl.s < 0.12) continue;
      const skin = hsl.h > 0.02 && hsl.h < 0.11 && hsl.l > 0.45;
      if (skin) continue;
      const tgt = hsl.l > 0.6 ? Tr : R;
      col.setHSL(tgt.h, Math.min(1, tgt.s * 1.05), Math.min(0.9, tgt.l * (0.55 + hsl.l)));
      p[i] = col.r * 255; p[i + 1] = col.g * 255; p[i + 2] = col.b * 255;
    }
    g.putImageData(d, 0, 0);
    const t = new T.CanvasTexture(c); t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.magFilter = T.NearestFilter; t.minFilter = T.LinearFilter; t.generateMipmaps = false;
    return t;
  }

  async function attach(group, n) {
    const file = MODEL[n.id]; if (!file) return;
    const A = await load(file); if (!A || group.userData.npcRig) return;
    const model = SkeletonUtils.clone(A.scene), inner = new T.Group(); inner.name = 'npc_glb'; inner.add(model);
    let mat = null;
    model.traverse(o => { if (o.isMesh) { mat ??= new T.MeshStandardMaterial({ map: recolour(o.material.map, n), roughness: 0.85 }); o.material = mat; o.castShadow = true; o.frustumCulled = false; } });
    model.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(model, true), k = (HEIGHT[n.id] || 1.75) / (box.max.y - box.min.y || 1);
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
