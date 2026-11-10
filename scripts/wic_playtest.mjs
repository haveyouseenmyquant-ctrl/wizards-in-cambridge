#!/usr/bin/env node
// QA main-path bot (playtest_pass_pct). Plays the main story path with every class through the real player, N runs each:
//   1. scripts/quest_bot.mjs: every shipped main quest start to finish (one run per class per round)
//   2. scripts/playtest.mjs: the Market Square encounter route and the Bellwarden (N runs per class)
// Both run with WIC_SOFTLOCK_S=60: a run fails on a crash, a bot exception, a soft-lock (no kill, no damage, no new quest
// step / route leg and no new closest approach to the objective for 60 s of game time), any console error, a timeout or
// an unfinished path. Runs that fail for harness reasons ('harness: ...': page load timeout, browser crash, wall-clock cap)
// are left out of the percentage and logged to data/derived/wic_harness_log.jsonl (harness_flake_pct).
//   node scripts/wic_playtest.mjs [site_dir] [route_runs_per_class=2] [quest_rounds=1]
// Merges playtest_pass_pct, per_class and playtest_detail into data/benchmark/scores/<build_hash>_wic.json.
// Last stdout line: that JSON. Exit 0 all pass, 2 game failures, 1 harness failure (no game-judged runs).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = path.resolve(process.argv[2] || path.join(ROOT, 'site'));
const ROUTE_RUNS = +(process.argv[3] || 2), QUEST_ROUNDS = +(process.argv[4] || 1);
const SOFT_S = 60, T0 = Date.now();
const log = (...a) => console.error(`[wic_playtest ${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);
// WIC_BUILD_HASH (service.sh): score under the hash the caller re-checks after the run
const hash = process.env.WIC_BUILD_HASH || spawnSync(path.join(ROOT, '.venv/bin/python'), ['-I', path.join(ROOT, 'scripts/build_hash.py'), SITE], { encoding: 'utf8' }).stdout.trim();
if (!hash) { log('no build hash for', SITE); process.exit(1); }

function child(script, args) {   // run a bot, stderr passed through, returns its last stdout JSON line (or null)
  return new Promise(ok => {
    const p = spawn(process.execPath, [path.join(ROOT, 'scripts', script), SITE, ...args.map(String)],
      { env: { ...process.env, WIC_SOFTLOCK_S: String(SOFT_S) }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', d => out += d);
    p.on('close', code => {
      const line = out.trim().split('\n').pop();
      try { ok(JSON.parse(line)); } catch { log(script, 'exit', code, 'no JSON result'); ok(null); }
    });
  });
}

log('build', hash, 'site', SITE);
const quest = await child('quest_bot.mjs', [4 * QUEST_ROUNDS]);
log('quest_bot done', quest && JSON.stringify({ main_quests_shipped: quest.main_quests_shipped, pass: quest.quest_bot_pass_pct }));
const route = await child('playtest.mjs', [ROUTE_RUNS]);
log('route bot done', route && JSON.stringify({ pass: route.playtest_pass_pct, runs: route.runs_total }));

const runs = [];
for (const r of quest?.runs || []) runs.push({ bot: 'quest', cls: r.cls, pass: r.pass, fail: r.fail || null });
for (const r of route?.run_log || []) runs.push({ bot: 'route', cls: r.cls, pass: r.pass, fail: r.fail });
const isHarness = r => !r.pass && /^harness/.test(r.fail || '');
const judged = runs.filter(r => !isHarness(r)), harness = runs.filter(isHarness);
const per_class = {};
for (const r of runs) {
  const c = per_class[r.cls] ||= { runs: 0, passed: 0, harness_fails: 0, fails: [] };
  if (isHarness(r)) { c.harness_fails++; continue; }
  c.runs++; if (r.pass) c.passed++; else c.fails.push(`${r.bot}: ${r.fail}`.slice(0, 300));
}
for (const c of Object.values(per_class)) c.pass_pct = c.runs ? +(100 * c.passed / c.runs).toFixed(1) : 0;
const result = {
  playtest_pass_pct: judged.length ? +(100 * judged.filter(r => r.pass).length / judged.length).toFixed(1) : 0,
  per_class,
  playtest_detail: { route_runs_per_class: ROUTE_RUNS, quest_runs: quest?.runs?.length || 0, runs_judged: judged.length, harness_fails: harness.length,
    softlock_s: SOFT_S, boss_ttk_median_s: route?.boss_ttk_median_s ?? null, main_quests_shipped: quest?.main_quests_shipped ?? null,
    wall_s: Math.round((Date.now() - T0) / 1000), at: new Date().toISOString() },
};

const f = path.join(ROOT, 'data/benchmark/scores', `${hash}_wic.json`);
fs.mkdirSync(path.dirname(f), { recursive: true });
const d = fs.existsSync(f) && fs.statSync(f).size ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
if (judged.length) { Object.assign(d, result); fs.writeFileSync(f + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(f + '.tmp', f); }
const hlog = path.join(ROOT, 'data/derived/wic_harness_log.jsonl');
fs.mkdirSync(path.dirname(hlog), { recursive: true });
for (const r of runs) fs.appendFileSync(hlog, JSON.stringify({ hash, step: `playtest_run:${r.bot}:${r.cls}`, status: r.pass ? 'ok' : isHarness(r) ? 'harness_fail' : 'game_fail', t: new Date().toISOString() }) + '\n');
console.log(JSON.stringify(result));
process.exit(!judged.length ? 1 : judged.every(r => r.pass) ? 0 : 2);
