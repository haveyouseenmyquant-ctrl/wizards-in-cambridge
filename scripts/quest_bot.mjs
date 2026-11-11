#!/usr/bin/env node
// Quest bot (story team): plays every shipped main quest (site/app/game/quests/index.json) start to finish through the
// real player. For each run: fresh browser context, /?debug&nopick, pick a class, then follow game.quests.objective():
// walk there with held keys + yaw (A* on a 1 m grid over world.standAt, so collision and steps apply), talk and advance
// dialogue with real E key presses, fight with the class's spells through game.caster.cast, use the real death-screen
// button. The game clock is stepped deterministically (player.update + game.update at 20 Hz inside page.evaluate).
// A run passes when every main quest is completed with no soft-lock, timeout or console error.
//   node scripts/quest_bot.mjs [site_dir] [runs=4]      (runs cycle through the classes)
// Last stdout line: {"main_quests_shipped": n, "quest_bot_pass_pct": p, "runs": [...], ...}
// Also merges main_quests_shipped and quest_bot_pass_pct into data/benchmark/scores/<build_hash>_wic.json.
import { wicLaunch } from './lib/wic_launch.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'site'));
const RUNS = +(process.argv[3] || 4);
const WORKERS = Math.max(1, +(process.env.WIC_QUESTBOT_WORKERS || 4));
const SOFT_S = +(process.env.WIC_SOFTLOCK_S || 0);   // QA main-path bot: soft-lock after this much game time without progress (0 = off)
const RUN_WALL_S = +(process.env.WIC_QUESTBOT_RUN_WALL_S || 1500);
const CLASSES = (process.env.WIC_QUESTBOT_CLASSES || 'pyromancer,stormcaller,warden,hexweaver').split(',');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const T0 = Date.now();
const log = (...a) => console.error(`[quest_bot ${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, path.normalize(p));
  if (!f.startsWith(SRC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const URL0 = `http://127.0.0.1:${server.address().port}/?debug&nopick&q=low`;   // low preset (rendering only): 4 runs 297 s -> 180 s wall, inside the 5 min task-check cap
// QA s9: GPU Chrome is the default (4 parallel lanes, 5 quests: 212 s SwiftShader -> 33 s); WIC_TEST_GPU=0 = headless
// SwiftShader. If the windowed GPU launch fails (no display session), fall back to SwiftShader rather than fail the run.
process.env.WIC_TEST_GPU ??= '1';
const LAUNCH = {
  executablePath: CHROME, headless: true, protocolTimeout: 0,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=480,270'],
  defaultViewport: { width: 480, height: 270 },
};
let browser;
try { browser = await puppeteer.launch(wicLaunch(LAUNCH)); }
catch (e) { if (process.env.WIC_TEST_GPU !== '1') throw e; log('GPU launch failed, using SwiftShader:', e.message); browser = await puppeteer.launch(LAUNCH); }

// ---------------- the in-page bot (window.__qbot)
function installBot(softS = 0, tileIds = []) {
  const g = window.__game, P = window.__p, W = window.__world, C = g.caster, Q = g.quests, DT = 0.05;
  const ev = { kills: 0, deaths: 0, casts: 0, steps: [], talks: 0 };
  ev.killLog = []; ev.boss = {}; g.on('hit', e => { if (e.target?.type?.id === 'bellwarden') { const b = ev.boss; e.target.qbFirst ??= g.time; b.first ??= +(g.time - bot.t0).toFixed(1); b.dmg = (b.dmg || 0) + e.amount; const k = e.spell?.id || e.spell || e.source; (b.by ||= {})[k] = ((b.by ||= {})[k] || 0) + e.amount; } }); const offs = [g.on('kill', e => { ev.kills++; if (e.mob?.type?.id === 'bellwarden' && e.mob.qbFirst != null) { const t = +(g.time - e.mob.qbFirst).toFixed(1); (ev.boss.kills ||= []).push(t); ev.boss.ttk = Math.max(ev.boss.ttk ?? 0, t); } /* per-mob first hit -> kill (a 2nd Bellwarden spawn no longer spans both fights); worst kill reported */ ev.killLog.push(`${e.mob?.type?.id}@${(g.time - bot.t0).toFixed(0)}`); }), g.on('cast', () => ev.casts++), g.on('playerDeath', () => ev.deaths++),
    g.on('questStep', e => ev.steps.push(`${e.quest}:${e.step}@${(g.time - bot.t0).toFixed(0)}`)),
    g.on('levelup', () => { for (let t = 0; t < 3; t++) if (C.picks[t] == null && g.stats.level >= C.talentLevels[t]) C.pickTalent(t, t % 2); })];
  function plan(sx, sy, sz, tx, ty, tol, fine = true) {   // A* on a 1 m grid; walkable = world.standAt from the neighbour's feet height
    const pad = 30, x0 = Math.floor(Math.min(sx, tx) - pad), y0 = Math.floor(Math.min(sy, ty) - pad);
    const nx = Math.ceil(Math.max(sx, tx) + pad) - x0, ny = Math.ceil(Math.max(sy, ty) + pad) - y0, N = nx * ny;
    const zf = new Float32Array(N).fill(NaN), gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const s = Math.round(sx - x0) + Math.round(sy - y0) * nx; zf[s] = sz; gs[s] = 0;
    const heap = [[0, s]];
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    let best = s, bestD = Infinity, n = 0;
    while (heap.length && n++ < 60000) {
      const [, i] = pop(); if (closed[i]) continue; closed[i] = 1;
      const cx = i % nx, cy = (i / nx) | 0, wx = cx + x0, wy = cy + y0, d = Math.hypot(tx - wx, ty - wy);
      if (d < bestD) { bestD = d; best = i; }
      if (d <= tol) break;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue;
        const qx = cx + a, qy = cy + b; if (qx < 0 || qy < 0 || qx >= nx || qy >= ny) continue;
        const j = qx + qy * nx; if (closed[j]) continue;
        const z = W.standAt(wx + a, wy + b, zf[i]); if (z == null) continue;
        if (i !== s) {
          if (a && b && (W.standAt(wx + a, wy, zf[i]) == null || W.standAt(wx, wy + b, zf[i]) == null)) continue;
          // thin fences and railings: sample the step at quarter points, not only the middle
          if (W.standAt(wx + a / 2, wy + b / 2, zf[i]) == null || fine && W.standAt(wx + a / 4, wy + b / 4, zf[i]) == null || W.standAt(wx + a * 0.75, wy + b * 0.75, zf[i]) == null) continue;
        }
        const ng = gs[i] + (a && b ? 1.414 : 1); if (ng >= gs[j]) continue;
        gs[j] = ng; from[j] = i; zf[j] = z; push(ng + Math.hypot(tx - qx - x0, ty - qy - y0), j);
      }
    }
    const pts = []; for (let i = best; i >= 0; i = from[i]) pts.push({ x: i % nx + x0, y: ((i / nx) | 0) + y0 });
    return { pts: pts.reverse(), miss: bestD };
  }
  const bot = window.__qbot = { ev, t0: g.time, maxT: 1400, goal: null, path: null, wp: 0, stuckT: 0, lastPos: null, replans: 0, escapeT: 0,
    fail: null, done: false, why: '', lastDmg: new Map(), ignore: new Set(), dispose() { for (const f of offs) f(); } };
  const key = code => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'KeyE' ? 'e' : code, bubbles: true }));
  function setGoal(x, y, tol) { const r = plan(P.x, P.y, P.z, x, y, tol, !(bot.replans % 4 >= 2));   // fine fence checks, coarse on alternate retries
    bot.goal = { x, y, tol, miss: r.miss, best: null }; bot.path = r.pts; bot.wp = 0; }
  function steer(dt) {   // hold W + Shift toward the next waypoint; true once within tol of the goal
    const G = bot.goal; if (Math.hypot(G.x - P.x, G.y - P.y) <= G.tol) { bot.path = null; return true; }
    if (bot.escapeT > 0) { bot.escapeT -= dt; P.yaw = bot.escapeYaw; P.keys.add('KeyW'); P.keys.add('Space'); if (bot.escapeT <= 0) { const k = G.step, b = G.best; setGoal(G.x, G.y, G.tol); bot.goal.step = k; bot.goal.best = b; } return false; }
    if (!bot.path || !bot.path.length) setGoal(G.x, G.y, G.tol);
    let q = bot.path[bot.wp] || G;
    while (bot.wp < bot.path.length - 1 && Math.hypot(q.x - P.x, q.y - P.y) < 0.9) q = bot.path[++bot.wp];
    if (bot.wp >= bot.path.length - 1 && Math.hypot(q.x - P.x, q.y - P.y) < 0.9) q = G;
    P.yaw = Math.atan2(-(q.x - P.x), q.y - P.y); P.keys.add('KeyW'); P.keys.add('ShiftLeft');
    if ((bot.stuckT += dt) > 2) {
      bot.stuckT = 0;
      const moved = bot.lastPos ? Math.hypot(P.x - bot.lastPos.x, P.y - bot.lastPos.y) : 9; bot.lastPos = { x: P.x, y: P.y };
      const dG = Math.hypot(G.x - P.x, G.y - P.y), closer = G.best == null || dG < G.best - 0.5; if (closer) G.best = dG;
      if (moved < 0.5 || !closer) {
        bot.replans++; P.keys.add('Space'); const best = G.best, k = G.step; setGoal(G.x, G.y, G.tol); bot.goal.best = best; bot.goal.step = k;
        if (bot.replans >= 3) { bot.escapeT = 1.5; bot.escapeYaw = Math.random() * 6.283; }
        if (bot.replans > 10) bot.fail = `softlock: no progress toward ${G.x.toFixed(1)},${G.y.toFixed(1)} from ${P.x.toFixed(1)},${P.y.toFixed(1)},${P.z.toFixed(1)} (${bot.why}) tiles=${[...(W.tiles?.keys?.() || [])].join("|")}`;
      } else bot.replans = 0;
    }
    return false;
  }
  function castAt(m) {
    const d = Math.hypot(m.x - P.x, m.y - P.y), sp = C.spells;
    const order = sp.map((s, i) => [s, i]).sort((a, b) => ((b[0].ult ? 2 : 0) + (b[0].curse && !(m._curseUntil > g.time + 1) ? 1 : 0)) - ((a[0].ult ? 2 : 0) + (a[0].curse && !(m._curseUntil > g.time + 1) ? 1 : 0)) || (b[0].dmg || 0) - (a[0].dmg || 0));
    for (const [s, i] of order) {
      if (g.time < s.readyAt || g.stats.mana < s.mana || s.kind === 'blink') continue;
      if (s.ult && !m.boss) continue;
      if (s.kind === 'shield' && !(m.boss || g.stats.hp < g.stats.maxHp * 0.7) && !s.dmg) continue;
      const reach = s.kind === 'nova' || s.kind === 'shield' ? (s.radius || 5) : (s.range || 10);
      if (d > reach + (m.radius || 0.5)) continue;
      if (C.cast(i, m)) return true;
    }
    return false;
  }
  // QA watchdog (softS > 0): progress = a kill, damage to a mob, a new quest step, or getting 1 m closer to the objective
  // than ever before on that step; none of these for softS s of game time is a soft-lock
  const wd = { t: g.time, key: null, best: Infinity }, prog = () => { wd.t = g.time; };
  offs.push(g.on('kill', prog), g.on('hit', e => { if (e.target && e.target !== P && e.target.type) prog(); }));
  bot.step = function (dt) {
    if (bot.done || bot.fail) return;
    for (const m of g.mobs) if (m.boss && !m.dead) {   // a boss that walks home heals to full: log every leash reset
      if (m.state === 'return' && m._qbSt !== 'return') (ev.resets ||= []).push(`${m.type.id}@${(g.time - bot.t0).toFixed(0)} hp ${Math.round(m.hp)} home ${Math.round(Math.hypot(m.x - m.home.x, m.y - m.home.y))} pl ${Math.round(Math.hypot(m.x - P.x, m.y - P.y))} php ${Math.round(g.stats.hp)}`);
      m._qbSt = m.state; }
    if (softS > 0) {
      const o = Q.objective(), k = o ? `${o.quest}:${o.step}` : 'none', d = o?.x != null ? Math.hypot(o.x - P.x, o.y - P.y) : 0;
      if (wd.key !== k) { wd.key = k; wd.best = d; prog(); } else if (d < wd.best - 1) { wd.best = d; prog(); }
      if (g.time - wd.t > softS) { bot.fail = `softlock: no progress for ${softS} s game time (${k}, at ${P.x.toFixed(1)},${P.y.toFixed(1)},${P.z.toFixed(1)}, ${bot.why})`.slice(0, 300); return; }
    }
    if (g.time - bot.t0 > bot.maxT) { bot.fail = `timeout at ${JSON.stringify(Q.state)}`; return; }
    P.keys.clear();
    if (Q.order.every(id => Q.save[id]?.done)) { bot.done = true; return; }
    if (g.stats.hp <= 0) { const b = document.querySelector('.gh-death button'); if (b && !document.querySelector('.gh-death').hidden) b.click(); bot.path = null; return; }
    if (Q.dialogueOpen) { bot.dlgT = (bot.dlgT || 0) + dt; if (bot.dlgT > 0.6) { bot.dlgT = 0; key('KeyE'); } bot.why = 'dialogue'; return; }
    const o = Q.objective();
    if (!o) { bot.why = 'waiting for quest'; bot.idleT = (bot.idleT || 0) + dt; if (bot.idleT > 30) bot.fail = 'no quest objective after 30 s'; return; }
    bot.idleT = 0;
    // fight: objective mobs, else anything hostile close by
    const hostile = m => !['idle', 'patrol', 'return', 'dead'].includes(m.state);
    let tgt = null, bd = Infinity;
    for (const m of g.mobs) {
      if (m.dead || m.removed || bot.ignore.has(m) && !o.mobs?.includes(m)) continue;
      const d = Math.hypot(m.x - P.x, m.y - P.y), mine = o.mobs?.includes(m);
      if ((mine && d < 60) || (hostile(m) && d < 14)) { if (d < bd) { bd = d; tgt = m; } }
    }
    if (tgt) {
      const L = bot.lastDmg.get(tgt) || { hp: tgt.hp, t: g.time, t0: g.time };
      if (tgt.hp < L.hp) { L.hp = tgt.hp; L.t = g.time; } bot.lastDmg.set(tgt, L);
      // a passer-by we cannot hurt (a swarm over a roof): walk on, as a player would; objective mobs are never dropped
      if (!o.mobs?.includes(tgt) && g.time - L.t > 25) { bot.ignore.add(tgt); bot.goal = null; bot.path = null; return; }
      if (g.time - L.t0 > (tgt.boss ? 400 : 150)) { bot.fail = `stuck mob: ${tgt.type.id} not killed in time (${bot.why})`; return; }
      P.yaw = Math.atan2(-(tgt.x - P.x), tgt.y - P.y);
      const cast = castAt(tgt), want = tgt.boss ? 9 : 7;
      bot.why = `fight ${tgt.type.id} d ${bd.toFixed(1)} hp ${Math.round(tgt.hp)} ${tgt.state} dmg ${Math.round(g.time - L.t)}s ago`;
      if (!cast && (bd > want + 2 || g.time - L.t > 5)) {   // close in / find a line of fire
        if (!bot.goal || Math.hypot(bot.goal.x - tgt.x, bot.goal.y - tgt.y) > 3 || g.time - L.t > 5 && !bot.goal.flank) {
          const a = Math.random() * 6.283; setGoal(tgt.x + (g.time - L.t > 5 ? Math.cos(a) * 5 : 0), tgt.y + (g.time - L.t > 5 ? Math.sin(a) * 5 : 0), Math.max(1.5, want - 4));
          bot.goal.flank = g.time - L.t > 5; if (bot.goal.flank) L.t = g.time - 2;
        }
        steer(dt);
      } else { bot.goal = null; bot.path = null; bot.replans = 0; }
      return;
    }
    bot.why = `${o.quest}:${o.step} ${o.type} -> ${o.x?.toFixed(1)},${o.y?.toFixed(1)}`;
    if (o.x == null) return;
    const tol = o.type === 'talk' ? 2.2 : o.type === 'kill' ? 6 : Math.max(0.6, (o.r || 1.5) * 0.6);
    if (!bot.goal || Math.hypot(bot.goal.x - o.x, bot.goal.y - o.y) > 1 || bot.goal.step !== o.step) { setGoal(o.x, o.y, tol); bot.goal.step = o.step; bot.replans = 0; }
    if (steer(dt)) {
      bot.replans = 0;
      if (o.type === 'talk') { bot.talkT = (bot.talkT || 0) + dt; if (bot.talkT > 0.5) { bot.talkT = 0; ev.talks++; key('KeyE'); } }
      else if (o.type === 'kill') { bot.waitT = (bot.waitT || 0) + dt; if (bot.waitT > 40) bot.fail = `kill target never appeared (${bot.why})`; }
    }
  };
  bot.chunk = function (gameS = 6, wallMs = 4000) {
    const t0 = performance.now(); let n = 0;
    // the bot steps game time faster than tiles stream in: pause (no game time passes) until the collision tiles within
    // 40 m are loaded, as a real-time player never outruns streaming (Bridge St -> Quayside crossed y=500 into t_3_6)
    const tilesReady = () => { for (const [a, b] of [[0, 0], [40, 0], [-40, 0], [0, 40], [0, -40]]) {
      const id = `t_${Math.floor((P.x + a + 1000) / 250)}_${Math.floor((P.y + b + 1000) / 250)}`; if (tileIds.includes(id) && !W.tiles?.has?.(id)) return false; } return true; };
    try { while (n * DT < gameS && performance.now() - t0 < wallMs && !bot.done && !bot.fail) { if (!tilesReady()) break; bot.step(DT); P.update(DT); g.update(DT); n++; } }
    catch (e) { bot.fail = 'bot exception: ' + e.message; }
    P.keys.clear();
    return { wait: n === 0, t: +(g.time - bot.t0).toFixed(1), done: bot.done, fail: bot.fail, state: Q.state, hp: Math.round(g.stats.hp), lvl: g.stats.level, why: bot.why, x: +P.x.toFixed(1), y: +P.y.toFixed(1) };
  };
  return true;
}

const TILE_IDS = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8')).tiles.map(t => t.id);
const runs = [];
let quests = [];
async function runOne(r) {
  const cls = CLASSES[r % CLASSES.length], ctx = await browser.createBrowserContext(), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/404|Failed to load resource/.test(t)) errors.push(t);
    if (m.type() === 'warning' && /^\[(game|quests|classes|items|mobs)\]/.test(t)) errors.push(t); });
  const w0 = Date.now(); let rec = { cls, run: r };
  try {
    await page.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction('window.__walkReady === true', { timeout: 300000 });
    await page.waitForFunction('window.__game && window.__game.caster && window.__game.mobSystem && window.__game.quests', { timeout: 120000, polling: 250 });
    await page.evaluate(c => { const g = window.__game; g.caster.setClass(c); g.save.cls = c; g.persist(); g.paused = false; }, cls);
    await page.evaluate(() => window.__player.teleport(-108.1, 93.97));
    await page.waitForFunction('!window.__player.pendingPlace && window.__player.settled(120)', { timeout: 300000, polling: 500 });
    quests = await page.evaluate(() => window.__game.quests.order);
    await page.evaluate(installBot, SOFT_S, TILE_IDS);
    let st;
    for (let k = 0; ; k++) {
      st = await page.evaluate(() => window.__qbot.chunk(6, 4000));
      if (st.wait) await new Promise(r => setTimeout(r, 250));   // tiles still streaming
      if (st.done || st.fail || errors.length) break;
      if (Date.now() - w0 > RUN_WALL_S * 1000) { st.fail = `harness: wall-clock cap ${RUN_WALL_S} s at game ${st.t} s`; break; }
      if (k % 10 === 9) log(cls, r, JSON.stringify(st));
    }
    const ev = await page.evaluate(() => { const b = window.__qbot; b.dispose(); const q = window.__game.quests;
      return { ...b.ev, completed: q.order.filter(id => q.save[id]?.done) }; });
    rec = { ...rec, ...ev, gameS: st.t, fail: st.fail || (errors.length ? 'console error: ' + errors[0] : null) || (!st.done ? 'not finished' : null) };
  } catch (e) { rec.fail = 'harness: ' + e.message; rec.completed = []; }
  await ctx.close().catch(() => {});
  rec.pass = !rec.fail; rec.wallS = Math.round((Date.now() - w0) / 1000);
  runs.push(rec);
  log(cls, r, rec.pass ? 'PASS' : 'FAIL ' + rec.fail, JSON.stringify({ completed: rec.completed, gameS: rec.gameS, kills: rec.kills, deaths: rec.deaths, steps: rec.steps, killLog: rec.killLog, boss: rec.boss, resets: rec.resets }));
}
try {
  const jobs = Array.from({ length: RUNS }, (_, r) => r);
  await Promise.all(Array.from({ length: Math.min(WORKERS, RUNS) }, async (_, w) => {
    await new Promise(ok => setTimeout(ok, w * 6000));
    for (let r; (r = jobs.shift()) !== undefined;) await runOne(r);
  }));
} catch (e) { log('fatal', e.stack || e.message); }
finally { await browser.close(); server.close(); }

// a quest counts as shipped when at least half the runs complete it; pass % = runs with every quest done and no error
const shipped = quests.filter(id => runs.filter(r => r.completed?.includes(id)).length >= Math.max(1, runs.length / 2)).length;
const result = { main_quests_shipped: shipped, quest_bot_pass_pct: runs.length ? +(100 * runs.filter(r => r.pass).length / runs.length).toFixed(1) : 0,
  quests, runs: runs.sort((a, b) => a.run - b.run).map(r => ({ cls: r.cls, pass: r.pass, fail: r.fail, completed: r.completed, gameS: r.gameS, deaths: r.deaths })),
  bossTTK: Object.fromEntries(runs.filter(r => r.boss?.ttk != null).map(r => [r.cls, r.boss.ttk])),
  wall_s: Math.round((Date.now() - T0) / 1000) };
try {
  const py = fs.existsSync(path.join(ROOT, '.venv/bin/python')) ? path.join(ROOT, '.venv/bin/python') : 'python3';
  const h = spawnSync(py, ['-I', path.join(ROOT, 'scripts/build_hash.py'), SRC], { encoding: 'utf8' }).stdout.trim();
  if (h) {
    const dir = path.join(ROOT, 'data/benchmark/scores'), f = path.join(dir, `${h}_wic.json`);
    fs.mkdirSync(dir, { recursive: true });
    const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
    fs.writeFileSync(f, JSON.stringify({ ...cur, main_quests_shipped: result.main_quests_shipped, quest_bot_pass_pct: result.quest_bot_pass_pct }, null, 1));
    result.build_hash = h;
  }
} catch (e) { log('score merge failed:', e.message); }
console.log(JSON.stringify(result));
process.exit(result.quest_bot_pass_pct === 100 ? 0 : 1);
