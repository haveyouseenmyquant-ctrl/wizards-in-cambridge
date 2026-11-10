#!/usr/bin/env node
// Headless route bot (playtest KPIs). For every class: load /?debug&nopick in a fresh browser context, pick the class,
// then walk a fixed route through 5 encounters around Market Square / Peas Hill / King's Parade / Senate House Hill
// and finish with the Bellwarden (boss-market). The bot moves only through the real Player (held keys + yaw, so
// collision, steps and walls apply), plans paths on a 1 m grid with world.standAt, casts the class's spells through
// game.caster.cast, walks over kill spots to pick up loot (items.js pickup radius), equips better drops, picks talents
// at level-ups and uses the real death screen button if it dies. The game clock is stepped deterministically
// (player.update + game.update at 20 Hz from page.evaluate), a few seconds of game time per evaluate.
// Runs are a job queue over WC_PLAYTEST_WORKERS pages per class (default 2), each run in a fresh browser context.
// playable = class data ok (>=6 spells incl. a blink + an ult, >=3 talent choices) and >= half its runs pass.
//   node scripts/playtest.mjs [site_dir] [runs_per_class=5]
// Last stdout line: {playable_classes, playtest_pass_pct, boss_ttk_median_s, boss_ttk_spread_pct, classes, runs, ...}
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { wicLaunch } from './lib/wic_launch.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'site'));
const RUNS = +(process.argv[3] || 5);
const RUN_WALL_S = +(process.env.WC_PLAYTEST_RUN_WALL_S || 3600);   // wall-clock safety cap per run (limits are game time)
const ONLY = process.env.WC_PLAYTEST_CLASSES ? process.env.WC_PLAYTEST_CLASSES.split(',') : null;   // debug: subset of classes
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const SOFT_S = +(process.env.WIC_SOFTLOCK_S || 0);   // QA main-path bot: fail when nothing progresses for this much game time (0 = off)
const ROUTE = ['market-north', 'market-south', 'peas-hill', 'kings-parade', 'senate-house-hill', 'boss-market'];
const T0 = Date.now();
const log = (...a) => console.error(`[playtest ${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, path.normalize(p));
  if (!f.startsWith(SRC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const URL0 = `http://127.0.0.1:${server.address().port}/?debug&nopick${process.env.WIC_TEST_QUERY || ''}`;
const launch = () => puppeteer.launch(wicLaunch({
  executablePath: CHROME, headless: true, protocolTimeout: 0,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=480,270'],
  defaultViewport: { width: 480, height: 270 },   // small canvas: swiftshader frames between sim chunks stay cheap
}));
let browser = await launch();
// session 82: the s81 live run lost Chrome at 304 s ('Connection closed') and every later run failed against the dead
// browser (playable_classes 0). Relaunch once per crash; runs in flight on the old browser retry as harness errors.
let relaunching = null;
async function ensureBrowser() {
  if (browser.connected) return;
  relaunching ||= (async () => { log('browser', 'disconnected, relaunching'); await browser.close().catch(() => {}); browser = await launch(); })().finally(() => { relaunching = null; });
  await relaunching;
}

// ---------------- the in-page bot (installed as window.__bot)
function installBot(route, runIdx, softS = 0) {
  const ROUTE_BOSS = 'bellwarden';
  const g = window.__game, P = window.__p, W = window.__world, sys = g.mobSystem, C = g.caster, items = g.items;
  const DT = 0.05;
  const ENC = Object.fromEntries(g.encounters.map(e => [e.id, e]));
  const ev = { kills: [], pickups: 0, equips: 0, deaths: 0, casts: 0, talents: 0, errors: [] };
  const offs = [];
  offs.push(g.on('kill', e => { if (e.mob) ev.kills.push({ x: e.mob.x, y: e.mob.y, boss: !!e.mob.boss, type: e.mob.type?.id, t: g.time }); }));
  offs.push(g.on('pickup', e => {
    ev.pickups++;
    // equip the drop if it beats what is in its slot (give() already equips into empty slots)
    const d = items.defs[e.id], ranks = Object.keys(items.rarities);
    const cur = items.equipped[d.slot], cd = cur && items.defs[cur];
    if (cur !== e.id && (!cd || ranks.indexOf(d.rarity) > ranks.indexOf(cd.rarity))) { if (items.equip(e.id)) ev.equips++; }
    else if (cur === e.id) ev.equips++;
  }));
  offs.push(g.on('cast', () => ev.casts++));
  // QA watchdog (softS > 0): progress = a kill, a pickup, damage to a mob, a new route leg, or getting 1 m closer to the
  // current leg's encounter than ever before on that leg; none of these for softS s of game time is a soft-lock
  const wd = { t: g.time, key: null, best: Infinity };
  const prog = () => { wd.t = g.time; };
  offs.push(g.on('kill', prog), g.on('pickup', prog), g.on('hit', e => { if (e.target && e.target !== P && e.target.type) prog(); }));
  // boss time-to-kill: from the first damage the boss takes to its death
  // session 44: only the route's boss (the Bellwarden) counts; other bosses met on the way used to pollute the TTK
  offs.push(g.on('hit', e => { if (e.target?.type?.id === ROUTE_BOSS && bot.bossStart == null) bot.bossStart = g.time; }));
  // session 69: boss damage by spell/source (balance diagnostics; logged per run)
  ev.bossDmg = {};
  offs.push(g.on('hit', e => { if (e.target?.type?.id === ROUTE_BOSS) { const k = e.spell?.id || e.spell || e.source || '?'; ev.bossDmg[k] = (ev.bossDmg[k] || 0) + e.amount; } }));
  // session 53: a death respawns the player far away; fights left behind are not 'stuck mobs'
  // session 72: where each death happened (game time, route leg, what the bot was doing)
  offs.push(g.on('playerDeath', () => { ev.deaths++; (ev.deathLog ||= []).push(`${(g.time - bot.t0).toFixed(0)}s L${bot.leg} ${bot.why || ''}`.slice(0, 90)); bot.engaged.clear(); bot.trail.length = 0; bot.retrace = null; }));
  offs.push(g.on('levelup', () => {
    for (let t = 0; t < 3; t++) if (C.picks[t] == null && g.stats.level >= C.talentLevels[t]) { if (C.pickTalent(t, (runIdx + t) % 2)) ev.talents++; }
  }));

  // --- A* on a 1 m grid (walkable = world.standAt from the neighbour's feet height, so steps/walls apply)
  function plan(sx, sy, sz, tx, ty, tol = 1.5) {
    const pad = 30, x0 = Math.floor(Math.min(sx, tx) - pad), y0 = Math.floor(Math.min(sy, ty) - pad);
    const nx = Math.ceil(Math.max(sx, tx) + pad) - x0, ny = Math.ceil(Math.max(sy, ty) + pad) - y0, N = nx * ny;
    const zf = new Float32Array(N).fill(NaN), gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const ix = x => Math.round(x - x0), iy = y => Math.round(y - y0);
    const s = ix(sx) + iy(sy) * nx; zf[s] = sz; gs[s] = 0;
    const heap = [[Math.hypot(tx - sx, ty - sy), s]];
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
        let z = W.standAt(wx + a, wy + b, zf[i]); if (z == null) continue;
        // session 57: from the start cell only the target cell has to be standable. The player can stand up to 0.5 m from
        // a cell centre that lies inside a wall/bollard, which made every half-step check fail: a 1-cell plan (warden
        // softlocks at -131,-29 and -180,17 with 'path 1')
        if (i !== s) {
          if (a && b && (W.standAt(wx + a / 2, wy + b / 2, zf[i]) == null || W.standAt(wx + a, wy, zf[i]) == null || W.standAt(wx, wy + b, zf[i]) == null)) continue;
          if (W.standAt(wx + a / 2, wy + b / 2, zf[i]) == null) continue;
        }
        const ng = gs[i] + (a && b ? 1.414 : 1); if (ng >= gs[j]) continue;
        gs[j] = ng; from[j] = i; zf[j] = z; push(ng + Math.hypot(tx - qx - x0, ty - qy - y0), j);
      }
    }
    const pts = []; for (let i = best; i >= 0; i = from[i]) pts.push({ x: i % nx + x0, y: ((i / nx) | 0) + y0 });
    pts.reverse(); return { pts, miss: bestD };
  }

  const bot = window.__bot = {
    ev, route, leg: 0, state: 'go', path: null, wp: 0, goal: null, stuckT: 0, lastPos: null, replans: 0,
    engaged: new Map(), loot: [], arriveT: null, bossStart: null, bossTtk: null, fail: null, done: false,
    t0: g.time, maxT: 900, noSpawnT: 0, clearedEnc: new Set(), trail: [], retrace: null, retraceN: 0, legT: 0,
    dispose() { for (const f of offs) f(); },
  };
  const live = () => g.mobs.filter(m => !m.dead);
  const hostile = m => !['idle', 'patrol', 'return', 'dead'].includes(m.state);
  const dist = m => Math.hypot(m.x - P.x, m.y - P.y);
  function setGoal(x, y, tol = 1.5) { bot.goal = { x, y, tol }; const r = plan(P.x, P.y, P.z, x, y, tol); bot.path = r.pts; bot.goal.miss = r.miss; bot.wp = 0; }
  function steer(dt) {   // hold W (+Shift) toward the next waypoint; returns true when the goal is reached
    const G = bot.goal; if (!G) return true;
    if (Math.hypot(G.x - P.x, G.y - P.y) <= G.tol + 0.3) { bot.path = null; bot.goal = null; return true; }
    if (!bot.path || bot.wp >= bot.path.length) {
      setGoal(G.x, G.y, G.tol);
      if (!bot.path.length) {   // session 44: an empty plan used to idle forever without tripping the stuck check
        bot.noPathT = (bot.noPathT || 0) + dt; P.keys.add('Space');
        if (bot.noPathT > 20) bot.fail = `softlock: no path (leg ${bot.leg} ${route[bot.leg]}, at ${P.x.toFixed(1)},${P.y.toFixed(1)},${P.z.toFixed(1)}, goal ${G.x.toFixed(1)},${G.y.toFixed(1)})`;
        return false;
      }
    }
    bot.noPathT = 0;
    // session 55: escape manoeuvre. A warden stood 16 s at -131,-29 with a 1-cell plan, walking into the same wall toward
    // the goal; after repeated failed replans walk 1.5 s in a random direction (jumping) before replanning again
    // session 76: retrace. A plan that cannot reach the goal (G.miss large) from where the player stands means the 1 m planner
    // grid has lost the way out of a pocket the real player walked into (warden: Great St Mary's railings, -169.5,27, a 12-cell
    // partial plan for 160 s). Walk back along the bot's own trail (spots the player really stood on) until a plan from there
    // reaches the goal, then resume. Each retrace drops the trail it used, so the next one goes further back.
    if (bot.retrace) {
      const R = bot.retrace, tr = bot.trail; R.t -= dt; R.chk -= dt;
      let q = tr[R.i];
      while (q && Math.hypot(q.x - P.x, q.y - P.y) < 0.7) q = tr[--R.i];
      let done = !q || R.t <= 0;
      if (!done && R.chk <= 0) { R.chk = 1; const r = plan(P.x, P.y, P.z, G.x, G.y, G.tol); if (r.pts.length > 1 && !(r.miss > G.tol + 1)) done = true; }
      if (done) { tr.length = Math.max(0, R.i); bot.retrace = null; bot.replans = 0; bot.stuckT = 0; const k = { best: G.best, loot: G.loot, enc: G.enc, vant: G.vant }; setGoal(G.x, G.y, G.tol); Object.assign(bot.goal, k); return false; }
      P.yaw = Math.atan2(-(q.x - P.x), q.y - P.y); P.keys.add('KeyW'); P.keys.add('ShiftLeft');
      if (R.t < R.t0 - 3 && Math.random() < 0.05) P.keys.add('Space');
      return false;
    }
    if (bot.escapeT > 0) { bot.escapeT -= dt; P.yaw = bot.escapeYaw; P.keys.add('KeyW'); P.keys.add('Space'); if (bot.escapeT <= 0) setGoal(G.x, G.y, G.tol); return false; }
    let q = bot.path[bot.wp];
    while (Math.hypot(q.x - P.x, q.y - P.y) < 0.9 && bot.wp < bot.path.length - 1) q = bot.path[++bot.wp];
    if (bot.wp >= bot.path.length - 1 && Math.hypot(q.x - P.x, q.y - P.y) < 0.9) {
      // session 53: the end of a partial plan is not the goal (a stormcaller stood 800 s on a ledge 'arriving' at its own cell);
      // walk straight at the goal with jumps and let the stuck check below replan or fail
      if (!(G.miss > G.tol + 1)) { bot.path = null; bot.goal = null; return true; }
      q = G; P.keys.add('Space');
    }
    P.yaw = Math.atan2(-(q.x - P.x), q.y - P.y);
    P.keys.add('KeyW'); P.keys.add('ShiftLeft');
    // stuck detection: no progress for 2 s -> jump, then replan
    bot.stuckT += dt;
    if (bot.stuckT > 2) {
      const moved = bot.lastPos ? Math.hypot(P.x - bot.lastPos.x, P.y - bot.lastPos.y) : 9;
      bot.lastPos = { x: P.x, y: P.y }; bot.stuckT = 0;
      // session 50: also count it as stuck when 2 s of movement brought it no closer to the goal (a movement spell that lands on
      // a roof is settled back to its start, so the bot hopped in place for 10+ minutes without tripping the moved check)
      const dG = Math.hypot(G.x - P.x, G.y - P.y), closer = G.best == null || dG < G.best - 0.5;
      if (closer) G.best = dG;
      // session 53: loot is optional; a kill spot the bot cannot get onto (corpse against bollards/railings) is skipped
      // instead of failing the run as a softlock (a really stuck player still fails on the next travel leg)
      if ((moved < 0.5 || !closer) && G.loot && bot.replans >= 3) { G.loot.looted = true; bot.goal = null; bot.path = null; bot.replans = 0; return false; }
      if ((moved < 0.5 || !closer) && !G.loot && bot.replans >= 2 && (bot.retraceN || 0) < 6 && bot.trail.length > 3) {
        const r = plan(P.x, P.y, P.z, G.x, G.y, G.tol);
        if (!r.pts.length || r.miss > G.tol + 1) { bot.retraceN = (bot.retraceN || 0) + 1; bot.retrace = { i: bot.trail.length - 1, t: 30, t0: 30, chk: 2 }; return false; }
      }
      if (moved < 0.5 || !closer) { bot.replans++; P.keys.add('Space'); if (bot.replans >= 3) { bot.escapeT = 1.5; bot.escapeYaw = Math.random() * 6.283; } setGoal(G.x, G.y, G.tol); bot.goal.best = G.best; bot.goal.loot = G.loot; bot.goal.enc = G.enc; if (bot.replans > 8) bot.fail = `softlock: no route progress (leg ${bot.leg} ${route[bot.leg]}, at ${P.x.toFixed(1)},${P.y.toFixed(1)},${P.z.toFixed(1)}, goal ${G.x.toFixed(1)},${G.y.toFixed(1)}, path ${bot.path?.length ?? 0}, engaged ${[...bot.engaged.keys()].map(m => m.type.id).join('/') || 'none'})`; }
      else bot.replans = 0;
    }
    return false;
  }
  // session 57: a walkable spot 5-9 m from mob m (feet level with the player) with a clear line of fire to the mob's
  // centre, nearest to the player; `n` rotates the start angle so successive calls try different sides
  function vantage(m, n) {
    const cz = m.z + 1, cands = [];
    for (const r of [6, 8, 5, 9]) for (let k = 0; k < 16; k++) {
      const a = (k + n * 5) / 16 * 6.283, x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r;
      const z = W.standAt(x, y, P.z); if (z == null || Math.abs(z - P.z) > 1.5) continue;
      const ez = z + 1.4, L = Math.hypot(m.x - x, m.y - y, cz - ez); let clear = true;
      for (let d = 0.6; d < L - (m.radius || 0.5) && clear; d += 0.4) { const f = d / L; if (W.blocked(x + (m.x - x) * f, y + (m.y - y) * f, ez + (cz - ez) * f - 0.2, 0.1, 0, 0.4)) clear = false; }
      if (clear) cands.push({ x, y, d: Math.hypot(x - P.x, y - P.y) + (n % 3) * 3 * Math.random() });
    }
    cands.sort((a, b) => a.d - b.d);
    return cands[0] || null;
  }
  function castAt(m) {
    const d = dist(m), sp = C.spells, nearby = live().filter(o => Math.hypot(o.x - m.x, o.y - m.y) < 7).length;
    // session 68: a curse (damage-taken debuff) goes first when the target isn't cursed or the curse is about to lapse,
    // as a player would open with it; sorting by raw damage left Withering Mark almost unused and hexweaver boss kill times swung 12-37 s
    const needCurse = !(m._curseUntil > g.time + 1);
    const prio = s => (s.ult ? 2 : 0) + (s.curse && needCurse ? 1 : 0);
    const order = sp.map((s, i) => [s, i]).sort((a, b) => (prio(b[0]) - prio(a[0])) || ((b[0].dmg || 0) - (a[0].dmg || 0)));
    // session 69: keep mana for the bigger spells. Basic-attack spam (5 mana per 0.4 s vs 8/s regen) pinned mana near 5,
    // so hexweaver's siphon / curse / wisps never went out on the boss (all 903 boss damage in a run came from Hex Dart).
    // A filler cast must leave enough for the dearest damage spell coming off cooldown within 1.5 s.
    const reserve = Math.max(0, ...sp.filter(s => !s.ult && s.kind !== 'blink' && s.mana > 6 && (s.dmg || s.curse || s.amount) && s.readyAt - g.time < 1.5).map(s => s.mana));
    for (const [s, i] of order) {
      if (g.time < s.readyAt || g.stats.mana < s.mana) continue;
      if (s.mana <= 6 && !s.ult && g.stats.mana - s.mana < reserve) continue;
      if (s.kind === 'blink') continue;                                      // movement spell: used for travel
      if (s.ult && !(m.boss || nearby >= 3)) continue;
      if (s.kind === 'shield' && !(m.boss || g.stats.hp < g.stats.maxHp * 0.7) && !s.dmg) continue;
      const reach = s.kind === 'nova' || s.kind === 'shield' ? (s.radius || 5) : (s.range || 10);
      if (d > reach + (m.radius || 0.5)) continue;
      if (C.cast(i, m)) return true;
    }
    return false;
  }
  function blinkForward() {   // travel with the class's movement spell along open straight path segments
    const i = C.spells.findIndex(s => s.kind === 'blink'); const s = C.spells[i];
    if (i < 0 || g.time < s.readyAt || g.stats.mana < s.mana + 30 || !bot.path) return;
    const q = bot.path[Math.min(bot.path.length - 1, bot.wp + Math.round(s.dist || 10))]; if (!q) return;
    const dx = q.x - P.x, dy = q.y - P.y, L = Math.hypot(dx, dy); if (L < (s.dist || 10) * 0.9) return;
    for (let k = 1; k < L; k += 0.5) if (W.standAt(P.x + dx * k / L, P.y + dy * k / L, P.z) == null) return;   // clear line only
    P.yaw = Math.atan2(-dx, dy); C.cast(i);
  }

  bot.step = function (dt) {
    if (bot.done || bot.fail) return;
    if (g.time - bot.t0 > bot.maxT) { bot.fail = 'timeout: route not finished'; return; }
    P.keys.clear();
    if (softS > 0) {
      const e0 = ENC[route[bot.leg]], d = e0 ? Math.hypot(e0.x - P.x, e0.y - P.y) : 0;
      if (wd.key !== bot.leg) { wd.key = bot.leg; wd.best = d; prog(); } else if (d < wd.best - 1) { wd.best = d; prog(); }
      if (g.time - wd.t > softS) { bot.fail = `softlock: no progress for ${softS} s game time (leg ${bot.leg} ${route[bot.leg]}, at ${P.x.toFixed(1)},${P.y.toFixed(1)},${P.z.toFixed(1)}, ${bot.why || ''})`.slice(0, 300); return; }
    }
    // session 76: breadcrumb trail of spots the player really stood on (for retrace), 1 m apart, not while retracing
    if (!bot.retrace && g.stats.hp > 0) { const L = bot.trail[bot.trail.length - 1]; if (!L || Math.hypot(L.x - P.x, L.y - P.y) > 1) { bot.trail.push({ x: P.x, y: P.y }); if (bot.trail.length > 600) bot.trail.splice(0, 100); } }
    if (bot.leg !== bot.legSeen) { bot.legSeen = bot.leg; bot.legT = 0; bot.retraceN = 0; } bot.legT += dt;
    // death: use the real "Rise again" button
    if (g.stats.hp <= 0 || g.paused) {
      bot.why = `dead/paused hp ${Math.round(g.stats.hp)} paused ${!!g.paused}`;
      const btn = document.querySelector('.gh-death button'), shown = btn && !document.querySelector('.gh-death').hidden;
      if (shown) { btn.click(); bot.path = null; bot.state = 'go'; }
      return;
    }
    // engagement bookkeeping: a mob that is fought must die within its time budget
    for (const [m, e] of bot.engaged) {
      if (m.dead) { if (m.type.id === ROUTE_BOSS && bot.bossStart != null && bot.bossTtk == null) bot.bossTtk = g.time - bot.bossStart; bot.engaged.delete(m); continue; }
      if (m.removed) { bot.engaged.delete(m); continue; }
      if (!hostile(m) && (dist(m) > 25 || m.state === 'return')) { bot.engaged.delete(m); continue; }   // session 53: leashed home, out of the fight (s55: any distance once it is walking home)
      if (m.hp < e.hp) e.lastDmg = g.time;   // session 44: only damage counts as progress (leash regen used to reset it)
      e.hp = m.hp;
      if (g.time - e.lastDmg > 30) { bot.fail = `stuck mob: ${m.type.id} not damaged for 30 s (mob ${m.x.toFixed(1)},${m.y.toFixed(1)},${m.z.toFixed(1)} ${m.state}, player ${P.x.toFixed(1)},${P.y.toFixed(1)},${P.z.toFixed(1)}, why ${bot.why})`; return; }
      if (g.time - e.t > (m.boss ? 360 : 120)) { bot.fail = `stuck mob: ${m.type.id} not killed within ${m.boss ? 360 : 120} s`; return; }
    }
    for (const id of route) { const s = sys.encounterState.get(id); if (s?.active && s.mobs.length && s.mobs.every(m => m.dead)) bot.clearedEnc.add(id); }
    const encId = route[bot.leg], enc = ENC[encId];
    const es = sys.encounterState.get(encId);
    const encMobs = es?.active ? es.mobs.filter(m => !m.dead && !m.removed) : [];
    // target: the current encounter's mobs once there, otherwise anything hostile within 18 m
    let tgt = null, bd = Infinity;
    for (const m of live()) {
      const d = dist(m), mine = encMobs.includes(m) && Math.hypot(enc.x - P.x, enc.y - P.y) < enc.r + 25;
      if (m.boss && encId !== 'boss-market' && !hostile(m)) continue;
      if ((mine || (hostile(m) && d < (bot.legT > 150 ? 8 : 18))) && d < bd) { bd = d; tgt = m; }
    }
    if (tgt) {
      if (!bot.engaged.has(tgt)) bot.engaged.set(tgt, { t: g.time, hp: tgt.hp, lastDmg: g.time });
      const e = bot.engaged.get(tgt);
      P.yaw = Math.atan2(-(tgt.x - P.x), tgt.y - P.y);
      const cast = castAt(tgt);
      bot.why = `fight ${tgt.type.id} ${tgt.state} d ${bd.toFixed(1)} hp ${Math.round(tgt.hp)} cast ${cast}`;
      const want = tgt.boss ? 9 : 7;
      // session 57: no damage for 6 s (bolts stopped by railings, a canopy or the wall top a flyer hovers over; a gargoyle
      // straight overhead) -> walk to a vantage point 5-9 m from the mob with a clear line of fire, a new one every 5 s.
      // Walking at the mob (the old rule) parked the bot under a hovering gargoyle / against King's railings for 30 s.
      if (g.time - e.lastDmg > 6) {
        if (!e.vant || g.time - e.vantT > 5 || Math.hypot(e.vant.x - tgt.x, e.vant.y - tgt.y) > 11) { e.vant = vantage(tgt, e.vantN = (e.vantN || 0) + 1); e.vantT = g.time; }
        if (e.vant) {
          bot.why += ` vantage ${e.vant.x.toFixed(1)},${e.vant.y.toFixed(1)}`;
          if (!bot.goal || bot.goal.vant !== e.vant) { setGoal(e.vant.x, e.vant.y, 0.8); bot.goal.vant = e.vant; }
          if (steer(dt)) e.vantT = -1e9;   // arrived and still no damage after the next 5 s: pick another
          return;
        }
      }
      if (!cast && (bd > want + 3 || g.time - e.lastDmg > 6)) {   // close in (or find a line of sight) along a path
        if (!bot.goal || Math.hypot(bot.goal.x - tgt.x, bot.goal.y - tgt.y) > 3) setGoal(tgt.x, tgt.y, Math.max(2, want - 3));
        steer(dt);
      } else bot.path = null, bot.goal = null;
      return;
    }
    // loot: walk over recent kill spots (drops sit within 0.8 m of the corpse)
    // session 50: drops more than 20 m away are left behind (with 25 s core respawns and reinforcement waves, walking back
    // 40-60 m for every old drop pulled the bot into fresh packs forever: 5 of 20 runs timed out at 900 s with 250-470 kills)
    for (const k of ev.kills) if (!k.looted && Math.hypot(k.x - P.x, k.y - P.y) > 20) k.looted = true;
    // session 76: a leg that has run 150 s+ stops looting and only fights mobs within 8 m (stormcaller farmed a respawning
    // pack near -124,-29 for 600 s on leg 3: fight 18 m out, loot, re-aggro, repeat, then timed out at 900 s)
    if (bot.legT > 150) for (const k of ev.kills) k.looted = true;
    const spot = ev.kills.find(k => !k.looted);
    if (spot) {
      bot.why = `loot ${spot.x.toFixed(1)},${spot.y.toFixed(1)}`;
      if (!bot.goal || bot.goal.loot !== spot) { setGoal(spot.x, spot.y, 0.4); bot.goal.loot = spot; spot.tries = (spot.tries || 0) + 1; }
      if (steer(dt) || g.time - spot.t > 40) { spot.looted = true; bot.goal = null; }
      return;
    }
    // travel along the route
    if (!enc) { bot.done = true; return; }
    // session 44: an encounter on the route already cleared earlier in the run (e.g. pulled while passing) counts
    if (bot.clearedEnc.has(encId)) { bot.leg++; bot.goal = null; bot.path = null; bot.noSpawnT = 0; return; }
    bot.why = `travel ${encId} active ${!!es?.active} mobs ${es?.mobs?.length ?? 0} dead ${es?.mobs?.filter(m => m.dead).length ?? 0} removed ${es?.mobs?.filter(m => m.removed).length ?? 0}`;
    const dEnc = Math.hypot(enc.x - P.x, enc.y - P.y);
    const cleared = es?.active && es.mobs.length && es.mobs.every(m => m.dead);
    if (cleared && dEnc < enc.r + 25) { bot.leg++; bot.goal = null; bot.path = null; bot.noSpawnT = 0; return; }
    if (dEnc < Math.max(4, enc.r * 0.5)) {   // arrived but nothing to fight: wait for the spawn, but not forever
      bot.noSpawnT += dt; if (bot.noSpawnT > 30) bot.fail = `encounter ${encId} never spawned`;
      if (es?.active && encMobs.length) setGoal(encMobs[0].x, encMobs[0].y, 6), steer(dt);
      return;
    }
    if (!bot.goal || bot.goal.enc !== encId) { setGoal(enc.x, enc.y, Math.max(3, enc.r * 0.4)); bot.goal.enc = encId; }
    blinkForward();
    steer(dt);
  };
  bot.chunk = function (gameS = 6, wallMs = 4000) {
    const t0 = performance.now(); let n = 0;
    try {
      while (n * DT < gameS && performance.now() - t0 < wallMs && !bot.done && !bot.fail) { bot.step(DT); P.update(DT); g.update(DT); n++; }
    } catch (e) { bot.fail = 'bot exception: ' + e.message; }
    P.keys.clear();
    return { t: +(g.time - bot.t0).toFixed(1), leg: bot.leg, done: bot.done, fail: bot.fail, hp: Math.round(g.stats.hp), lvl: g.stats.level,
      why: bot.why, mobs: g.mobs.filter(m => !m.dead).length, x: +P.x.toFixed(1), y: +P.y.toFixed(1) };
  };
  return true;
}

const classResults = {}, runs = [];
let pageErrorsTotal = 0;
try {
  const ctx0 = await browser.createBrowserContext();
  const probe = await ctx0.newPage();
  probe.on('pageerror', e => log('probe pageerror:', String(e.message || e).slice(0, 300)));
  probe.on('console', m => { if (m.type() === 'error') log('probe console error:', m.text().slice(0, 300)); });
  await probe.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await probe.waitForFunction('window.__walkReady === true', { timeout: 300000 });
  await probe.waitForFunction('window.__game && window.__game.caster && window.__game.mobSystem && window.__game.items', { timeout: 30000, polling: 250 })
    .catch(async e => { log('probe state:', await probe.evaluate(() => JSON.stringify({ game: !!window.__game, caster: !!window.__game?.caster, mobs: !!window.__game?.mobSystem, items: !!window.__game?.items, err: window.__gameError ? String(window.__gameError) : null }))); throw e; });
  const classData = await probe.evaluate(() => Object.fromEntries(Object.entries(window.__game.caster.classes).map(([id, c]) => [id, {
    spells: c.spells.length, movement: c.spells.some(s => s.kind === 'blink'), ultimate: c.spells.some(s => s.ult),
    talentChoices: (c.talents || []).reduce((n, t) => n + t.length, 0), talentTiers: (c.talents || []).length }])));
  await ctx0.close();
  log('classes', JSON.stringify(classData));
  // session 60: runs are a job queue served by WORKERS pages per class (WC_PLAYTEST_WORKERS, default 3), each run in its own
  // fresh browser context (fresh localStorage; a crashed page no longer fails every later run of its class with 'detached Frame')
  const WORKERS = Math.max(1, +(process.env.WC_PLAYTEST_WORKERS || 2));
  const clsList = Object.keys(classData).filter(c => !ONLY || ONLY.includes(c));
  for (const cls of clsList) classResults[cls] = { ...classData[cls], runs: [] };
  const jobs = [];
  for (let r = 0; r < RUNS; r++) for (const cls of clsList) jobs.push({ cls, r, retried: 0 });
  let mkLock = Promise.resolve();
  async function runOne(job) {
    const { cls, r } = job, res = classResults[cls];
    // context/page creation is serialised (12 concurrent newPage calls raced: 'Requesting main frame too early!')
    let ctx, page;
    const made = mkLock.then(async () => {
      for (let k = 0; ; k++) {
        try { await ensureBrowser(); ctx = await browser.createBrowserContext(); page = await ctx.newPage(); await page.goto('about:blank'); return; }
        catch (e) { await ctx?.close().catch(() => {}); if (k >= 4) throw e; log(cls, r, 'newPage retry:', e.message); await new Promise(ok => setTimeout(ok, 2000 * (k + 1))); }
      }
    });
    mkLock = made.catch(() => {});
    try { await made; } catch (e) {
      const rec = { cls, run: r, fail: 'harness: ' + e.message, pass: false, wallS: 0 };
      res.runs.push(rec); runs.push(rec); log(cls, r, 'FAIL', rec.fail); return;
    }
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/404|Failed to load resource/.test(t)) errors.push(t);
      if (m.type() === 'warning' && /^\[(game|classes|items|mobs)\]/.test(t)) errors.push(t); });
    const e0 = 0, w0 = Date.now();
    let rec = { cls, run: r };
    try {
      await page.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 300000 });
      await page.waitForFunction('window.__walkReady === true', { timeout: 300000 });
      await page.waitForFunction('window.__game && window.__game.caster && window.__game.mobSystem && window.__game.items', { timeout: 300000, polling: 250 });
      await page.evaluate(c => { const g = window.__game; g.caster.setClass(c); g.save.cls = c; g.persist(); g.paused = false; }, cls);
      // wait for the tiles along the route to stream in around the start
      await page.evaluate(() => window.__player.teleport(-108.1, 93.97));
      await page.waitForFunction('!window.__player.pendingPlace && window.__player.settled(160)', { timeout: 300000, polling: 500 });
      await page.evaluate(installBot, ROUTE, r, SOFT_S);
      // session 44: the run limit is game time (bot.maxT, checked in bot.step); chunks are stepped until the bot is
      // done/failed, with only a wall-clock safety cap so a heavily loaded machine cannot turn into 'not finished'
      let st;
      for (let k = 0; ; k++) {
        st = await page.evaluate(() => window.__bot.chunk(6, 4000));
        if (st.done || st.fail || errors.length > e0) break;
        if (Date.now() - w0 > RUN_WALL_S * 1000) { st.fail = `harness: wall-clock safety cap ${RUN_WALL_S} s at game ${st.t} s`; break; }
        if (k % 10 === 9) log(cls, r, JSON.stringify(st));
      }
      const ev = await page.evaluate(() => { const b = window.__bot; b.dispose(); const e = b.ev;
        return { bossTtk: b.bossTtk, kills: e.kills.length, bossKilled: e.kills.some(k => k.type === 'bellwarden'), pickups: e.pickups, equips: e.equips,
          deaths: e.deaths, deathLog: e.deathLog || [], casts: e.casts, talents: e.talents, bossDmg: e.bossDmg, equipped: Object.keys(window.__game.items.equipped).length }; });
      const perr = errors.slice(e0);
      rec = { ...rec, ...ev, gameS: st.t, fail: st.fail || (perr.length ? 'page error: ' + perr[0] : null) || (!st.done ? 'not finished' : null) || (!ev.bossKilled ? 'boss not killed' : null) };
    } catch (e) {
      rec.fail = 'harness: ' + e.message;
      // a page that did not load in time under CPU contention is a harness problem, not a game failure: retry (up to 3x)
      if ((job.retried || 0) < 3 && !/bot|stuck|softlock/.test(e.message)) { log(cls, r, 'harness retry:', e.message); job.retried = (job.retried || 0) + 1; await ctx.close().catch(() => {}); return runOne(job); }
    }
    await ctx.close().catch(() => {});
    rec.pass = !rec.fail; rec.wallS = +((Date.now() - w0) / 1000).toFixed(0);
    pageErrorsTotal += errors.length - e0;
    res.runs.push(rec); runs.push(rec);
    log(cls, r, rec.pass ? 'PASS' : 'FAIL ' + rec.fail, `boss ${rec.bossTtk?.toFixed?.(1)}s game ${rec.gameS}s wall ${rec.wallS}s kills ${rec.kills} pickups ${rec.pickups} deaths ${rec.deaths} bossDmg ${JSON.stringify(rec.bossDmg)} deathLog ${JSON.stringify(rec.deathLog)}`);
  }
  await Promise.all(Array.from({ length: Math.min(jobs.length, WORKERS * clsList.length) }, async (_, w) => {
    await new Promise(ok => setTimeout(ok, w * 8000));   // stagger the page loads
    for (let job; (job = jobs.shift());) await runOne(job);
  }));
  for (const cls of clsList) classResults[cls].runs.sort((a, b) => a.run - b.run);
} catch (e) { log('fatal', e.stack || e.message); }
finally { await browser.close(); server.close(); }

const out = { classes: {} };
const meds = [];
for (const [cls, r] of Object.entries(classResults)) {
  const passN = r.runs.filter(x => x.pass).length;
  const dataOk = r.spells >= 6 && r.movement && r.ultimate && r.talentChoices >= 3;
  const ttk = median(r.runs.filter(x => x.pass && x.bossTtk != null).map(x => x.bossTtk));
  if (ttk != null) meds.push(ttk);
  out.classes[cls] = { pass: `${passN}/${r.runs.length}`, data_ok: dataOk, playable: dataOk && passN > 0 && passN >= r.runs.length / 2,
    boss_ttk_median_s: ttk == null ? null : +ttk.toFixed(1), fails: [...new Set(r.runs.filter(x => !x.pass).map(x => x.fail))] };
}
const all = median(meds);
const result = {
  playable_classes: Object.values(out.classes).filter(c => c.playable).length,
  playtest_pass_pct: runs.length ? +(100 * runs.filter(x => x.pass).length / runs.length).toFixed(1) : 0,
  boss_ttk_median_s: all == null ? null : +all.toFixed(1),
  boss_ttk_spread_pct: all ? +(100 * Math.max(...meds.map(m => Math.abs(m - all))) / all).toFixed(1) : null,
  runs_total: runs.length, page_errors: pageErrorsTotal, wall_s: +((Date.now() - T0) / 1000).toFixed(0),
  ...out,
  run_log: runs.map(x => ({ cls: x.cls, run: x.run, pass: x.pass, fail: x.fail || null })),
};
console.log(JSON.stringify(result));
process.exit(runs.length && runs.every(x => x.pass) ? 0 : 1);
