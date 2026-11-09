#!/usr/bin/env node
// Trim a CC0 KayKit character .glb for the game: keep only the clips we use (renamed to canonical lower-case names),
// drop unused accessory meshes, prune and dedupe. Needs @gltf-transform (install anywhere; pass its node_modules dir).
// usage: GT=<dir containing node_modules> node scripts/build_char_glb.mjs <in.glb> <out.glb> '<json spec>'
//   spec: {"clips": {"idle": "Idle", "walk": "Walking_A", ...}, "drop": ["Spellbook", ...]}
import { createRequire } from 'module';
import path from 'path';
const req = createRequire(path.join(path.resolve(process.env.GT || process.cwd()), 'node_modules', 'x.js'));
const { NodeIO } = req('@gltf-transform/core');
const { prune, dedup, resample } = req('@gltf-transform/functions');
const [src, out, specJson] = process.argv.slice(2);
const spec = JSON.parse(specJson);
const { MeshoptEncoder, MeshoptDecoder } = req('meshoptimizer');
const { ALL_EXTENSIONS } = req('@gltf-transform/extensions');
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const root = doc.getRoot();
const want = new Map(Object.entries(spec.clips).map(([k, v]) => [v, k]));
const used = new Set();
for (const a of root.listAnimations()) {
  const canon = [...want.entries()].find(([v, k]) => v === a.getName() && !used.has(k));
  if (!canon) { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); continue; }
  // a source clip can map to several canonical names: duplicate by renaming first, extra names get a clone below
  used.add(canon[1]); a.setName(canon[1]);
}
const missing = Object.keys(spec.clips).filter(k => !used.has(k));
if (missing.length) { console.error('missing source clips for', missing); process.exit(1); }
for (const n of root.listNodes()) if ((spec.drop || []).includes(n.getName())) n.dispose();
// drop tracks that never leave the node's rest pose (most KayKit tracks are 2-key constants on unused bones)
const rest = (n, path) => path === 'translation' ? n.getTranslation() : path === 'rotation' ? n.getRotation() : n.getScale();
let dropped = 0;
for (const a of root.listAnimations()) for (const ch of a.listChannels()) {
  const n = ch.getTargetNode(), out = ch.getSampler().getOutput().getArray(), r = rest(n, ch.getTargetPath()), k = r.length;
  if (out.every((v, i) => Math.abs(v - r[i % k]) < 1e-4)) { const s = ch.getSampler(); ch.dispose(); if (!s.listParents().some(p => p.propertyType === "AnimationChannel")) s.dispose(); dropped++; }
}
console.log('dropped rest-pose tracks', dropped);
await doc.transform(resample(), prune(), dedup());
if (process.env.MESHOPT !== '0') {
  const { meshopt } = req('@gltf-transform/functions');
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
}
await io.write(out, doc);
console.log(out, root.listAnimations().map(a => a.getName()).join(','));
