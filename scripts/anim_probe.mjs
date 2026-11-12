#!/usr/bin/env node
// QA s12 (task 2879): animation probe CLI (Graphics' quick loop without the judge). The probe itself lives in
// scripts/lib/anim_probe.mjs and runs inside wic_record / gameplay_clip at every recorded frame, so service.sh gets it
// in <hash>_wic.json for free (wic_judge.py merges manifest.anim_probe). This CLI:
//   node scripts/anim_probe.mjs <rec_dir>   summarise an existing recording (its manifest.json frames)
//   node scripts/anim_probe.mjs [site_dir]  run a short gameplay_clip (CLIP_S=20 s, 4 frames per class, every class;
//                                           env ANIM_CLIP_S / ANIM_FRAMES / CLIP_CLASSES) and summarise it
// Last stdout line: {player_pose_dev_deg, mob_pose_dev_deg, npc_pose_dev_deg, cast_pose_frames_pct, rigid_mob_pct,
// rigid_npc_pct, anim_probe_detail, page_errors[]}. Exit 1 on a harness failure.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { animSummary } from './lib/anim_probe.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ARG = path.resolve(process.argv[2] || path.join(ROOT, 'site'));
const samples = [], pageErrors = [];
let harness = false;
const fromCombat = dir => {
  if (!fs.existsSync(dir)) return;
  for (const cls of fs.readdirSync(dir).sort()) {
    const ev = path.join(dir, cls, 'events.json'); if (!fs.existsSync(ev)) continue;
    const e = JSON.parse(fs.readFileSync(ev));
    for (const f of e.frames) samples.push({ scene: `combat_${cls}`, file: f.file, anim: f.anim });
    for (const m of e.page_errors || []) if (!/^harness/.test(m)) pageErrors.push(`${cls}: ${m}`);
  }
};
const man = (() => { try { return JSON.parse(fs.readFileSync(path.join(ARG, 'manifest.json'))); } catch { return null; } })();
if (man?.scenes) {   // a wic_record dir (site/ has a web-app manifest.json without scenes)
  for (const [k, sc] of Object.entries(man.scenes)) for (const f of sc.frames) samples.push({ scene: k, file: f.file, anim: f.anim });
  pageErrors.push(...(man.errors || []).filter(m => /^pageerror/.test(m)));
} else {
  const out = '/tmp/wic_anim_probe';
  fs.rmSync(out, { recursive: true, force: true });
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/gameplay_clip.mjs'), ARG, out], {
    stdio: ['ignore', 'pipe', 'inherit'], timeout: 1800000,
    env: { ...process.env, CLIP_S: process.env.ANIM_CLIP_S || '20', CLIP_FRAMES: process.env.ANIM_FRAMES || '4' } });
  if (r.status !== 0) harness = true;
  fromCombat(out);
}
const s = animSummary(samples);
if (!samples.length) harness = true;
console.log(JSON.stringify({ ...s, page_errors: pageErrors, harness_fail: harness }));
process.exit(harness ? 1 : 0);
