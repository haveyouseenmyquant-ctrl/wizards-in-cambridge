#!/usr/bin/env node
// Wizards in Cambridge fps/load harness (org KPI definition): fixed 60-second scripted walk AND fight on the default
// preset, GPU-backed Chrome (ANGLE Metal, windowed: headless Chrome throttles rAF), fixed 1280x720 viewport.
//
//   node scripts/wic_perf.mjs [site_dir_or_url] [--seconds 60] [--query '&q=low'] [--no-write] [--headless-ok]
//
// load_seconds = navigation start -> window.__walkReady (world walkable at spawn; the game layer starts then).
// The 60 s run: pick the Pyromancer, walk a fixed loop over Market Hill (spawn -> market-north encounter -> market-south
// encounter -> back), steering the real Player toward each waypoint (held W, yaw set each 100 ms; side-steps when
// blocked); whenever a live mob is within 30 m the bot faces it and casts spells 1-6 in turn. Player HP is refilled
// each tick so a death screen never interrupts the measured minute. fps_median = median of frames counted in each
// whole second of the 60 s (requestAnimationFrame). Also reports p5 fps, draw calls / triangles (renderer.info) and the
// GL renderer string (to prove it was not SwiftShader).
// Writes: data/benchmark/scores/<build_hash>_wic.json (merges fps_median, load_seconds, perf_detail) and
//         data/derived/browser_kpi.json {hash, result: {fps_median, load_seconds, ...}} (prototype format).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i < 0 ? def : argv.splice(i, 2)[1]; };
const flag = name => { const i = argv.indexOf(name); return i >= 0 && !!argv.splice(i, 1); };
const SECONDS = Number(opt('--seconds', 60));
const QUERY = opt('--query', '');
const NO_WRITE = flag('--no-write');
const SRC = argv[0] || path.join(ROOT, 'site');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1280, H = 720, LOAD_TIMEOUT = 60000;
const log = (...a) => console.error('[wic_perf]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2' };

function serve(dir) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, path.normalize(p));
    if (!f.startsWith(path.resolve(dir)) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    const body = fs.readFileSync(f);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Content-Length': body.length });
    res.end(body);
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

// in-page driver, installed once the game is up; window.__perfStep() advances it (called every 100 ms)
function installDriver() {
  const g = window.__game, P = window.__p;
  const WP = [[-105, 78], [-98, 38], [-112, 60], [-105, 78], [-108, 94]];   // spawn -> market-north -> market-south -> back
  let wi = 0, prev = { x: P.x, y: P.y }, stuck = 0, side = 1, castI = 0, castT = 0;
  const keys = P.keys || P._keys;
  const st = { casts: 0, kills: 0, maxMobs: 0, dist: 0, laps: 0 };
  g.on?.('kill', () => st.kills++);
  window.__perfStats = st;
  window.__perfStep = () => {
    g.stats.hp = g.stats.maxHp; g.stats.mana = g.stats.maxMana;
    const live = (g.mobs || []).filter(m => !m.dead && m.hp > 0);
    st.maxMobs = Math.max(st.maxMobs, live.length);
    const moved = Math.hypot(P.x - prev.x, P.y - prev.y); st.dist += moved; prev = { x: P.x, y: P.y };
    let tx = WP[wi][0], ty = WP[wi][1];
    if (Math.hypot(tx - P.x, ty - P.y) < 4) { wi = (wi + 1) % WP.length; if (!wi) st.laps++; tx = WP[wi][0]; ty = WP[wi][1]; }
    let yaw = -Math.atan2(tx - P.x, ty - P.y);
    stuck = moved < 0.05 ? stuck + 1 : Math.max(0, stuck - 1);
    if (stuck > 5) { yaw += side * 1.2; if (stuck > 20) { stuck = 0; side = -side; } }
    let near = null, nd = 30;
    for (const m of live) { const d = Math.hypot(m.x - P.x, m.y - P.y); if (d < nd) { nd = d; near = m; } }
    if (near && nd > 6) yaw = -Math.atan2(near.x - P.x, near.y - P.y);   // close in, facing it
    P.yaw = yaw;
    if (near && (castT -= 1) <= 0) {   // cast spells 1-6 in turn, one every 300 ms
      castT = 3;
      const k = 'Digit' + (1 + castI++ % 6);
      dispatchEvent(new KeyboardEvent('keydown', { code: k, key: k.slice(5), bubbles: true }));
      dispatchEvent(new KeyboardEvent('keyup', { code: k, key: k.slice(5), bubbles: true }));
      st.casts++;
    }
    return { near: !!near, wi };
  };
  return !!keys;
}

async function main() {
  let server = null, url = SRC;
  if (!/^https?:\/\//.test(SRC)) { server = await serve(path.resolve(SRC)); url = `http://127.0.0.1:${server.address().port}/`; }
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: false,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${W},${H + 90}`, '--no-first-run',
      '--autoplay-policy=no-user-gesture-required'],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  });
  const errors = [], T0 = Date.now();
  const err = m => errors.push(`+${((Date.now() - T0) / 1000).toFixed(1)}s ${m}`);
  const out = { fps_median: null, load_seconds: null };
  const detail = { seconds: SECONDS, viewport: `${W}x${H}`, query: QUERY };
  try {
    const page = await browser.newPage();
    page.on('console', m => { if (m.type() === 'error') err(`console: ${m.text()}`); });
    page.on('pageerror', e => err(`pageerror: ${e.message}`));
    page.on('requestfailed', r => err(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
    page.on('response', r => { if (r.status() >= 400) err(`HTTP ${r.status()}: ${r.url()}`); });
    await page.goto(`${url}?debug&nopick${QUERY}`, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT });
    await page.waitForFunction('window.__walkReady === true', { polling: 50, timeout: LOAD_TIMEOUT });
    out.load_seconds = Math.round(await page.evaluate('window.__walkReadyAt') / 10) / 100;
    detail.gl = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER); });
    detail.preset = await page.evaluate('window.__quality?.name || null');
    await page.waitForFunction('window.__game && window.__game.caster && window.__game.mobSystem', { polling: 100, timeout: 60000 });
    detail.game_ready_s = Math.round((Date.now() - T0) / 10) / 100;   // wall clock incl. browser start
    await page.evaluate(() => { const g = window.__game; g.caster.setClass('pyromancer'); g.save.cls = 'pyromancer'; g.persist?.(); g.paused = false; });
    await page.evaluate(installDriver);
    await page.mouse.click(W / 2, H / 2).catch(() => {});
    await page.keyboard.down('KeyW');
    await page.evaluate(() => { const f = window.__frames = []; const tick = t => { f.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    const t0 = Date.now(), info = [];
    let fightTicks = 0, ticks = 0;
    while (Date.now() - t0 < SECONDS * 1000) {
      const s = await page.evaluate('window.__perfStep()');
      ticks++; if (s.near) fightTicks++;
      if (ticks % 20 === 0) info.push(await page.evaluate('window.__renderer ? {calls: window.__renderer.info.render.calls, tris: window.__renderer.info.render.triangles} : null'));
      await sleep(100);
    }
    await page.keyboard.up('KeyW');
    const f = await page.evaluate('window.__frames');
    const per = {};
    for (const t of f) { const k = Math.floor((t - f[0]) / 1000); per[k] = (per[k] || 0) + 1; }
    const full = Math.floor((f.at(-1) - f[0]) / 1000);
    const c = Object.entries(per).filter(([k]) => +k < full).map(([, v]) => v).sort((a, b) => a - b);
    out.fps_median = c.length ? c[Math.floor(c.length / 2)] : null;
    detail.fps_p5 = c.length ? c[Math.floor(c.length * 0.05)] : null;
    detail.fps_min = c[0] ?? null;
    detail.fight_pct = Math.round(100 * fightTicks / Math.max(1, ticks));
    Object.assign(detail, await page.evaluate('window.__perfStats'));
    detail.dist = Math.round(detail.dist);
    const ok = info.filter(Boolean);
    if (ok.length) { detail.draw_calls_median = ok.map(i => i.calls).sort((a, b) => a - b)[ok.length >> 1]; detail.tris_median = ok.map(i => i.tris).sort((a, b) => a - b)[ok.length >> 1]; }
    detail.tiles = await page.evaluate('window.__player.loadedTiles');
  } catch (e) { err('harness: ' + e.message); }
  finally { await browser.close(); server?.close(); }
  detail.errors = errors.length; detail.first_errors = errors.slice(0, 5);
  for (const e of errors) log(e);
  log(JSON.stringify(detail));
  if (/swiftshader/i.test(detail.gl || '')) { log('SwiftShader renderer: not a GPU measurement, not writing'); out.fps_median = null; }
  if (!NO_WRITE && out.fps_median != null && !QUERY && !/^https?:/.test(SRC)) {
    const hash = execFileSync(path.join(ROOT, '.venv/bin/python'), ['-I', path.join(ROOT, 'scripts/build_hash.py'), SRC]).toString().trim();
    const sf = path.join(ROOT, 'data/benchmark/scores', `${hash}_wic.json`);
    const cur = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    Object.assign(cur, { fps_median: out.fps_median, load_seconds: out.load_seconds, perf_detail: { ...detail, at: new Date().toISOString() } });
    fs.mkdirSync(path.dirname(sf), { recursive: true });
    fs.writeFileSync(sf, JSON.stringify(cur, null, 1));
    const bf = path.join(ROOT, 'data/derived/browser_kpi.json');
    const prev = fs.existsSync(bf) ? JSON.parse(fs.readFileSync(bf, 'utf8')) : {};
    fs.writeFileSync(bf, JSON.stringify({ ...prev, ts: Math.floor(Date.now() / 1000), src: 'wic_perf', hash, result: { ...(prev.hash === hash ? prev.result : {}), fps_median: out.fps_median, load_seconds: out.load_seconds } }, null, 1));
    log('wrote', sf);
  }
  console.log(JSON.stringify(out));
}

main().catch(e => { console.error(e); console.log(JSON.stringify({ fps_median: null, load_seconds: null })); process.exit(1); });
