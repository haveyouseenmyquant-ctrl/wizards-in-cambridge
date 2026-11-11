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
const UNCAPPED = flag('--uncapped');   // no vsync / frame-rate limit: shows headroom above 60; never writes
const PROFILE = Number(opt('--profile', 0));   // CPU-profile N seconds mid-run and print the top self-time functions
const PROFILE_AT = opt('--profile-at', null);   // with --profile: start at this second of the run and break down the longest busy run (hitch hunting)
const NO_WRITE = flag('--no-write') || UNCAPPED || PROFILE > 0;
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
      '--autoplay-policy=no-user-gesture-required', ...(UNCAPPED ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])],
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
    // per-frame renderer.info totals across all composer passes: read + reset once per rAF (autoReset would only keep the last pass)
    await page.evaluate(() => {
      const f = window.__frames = [], r = window.__renderer, inf = window.__rinfo = [];
      if (r) r.info.autoReset = false;
      const tick = t => { f.push(t); if (r) { inf.push([r.info.render.calls, r.info.render.triangles]); r.info.reset(); } requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    let prof = null;
    if (PROFILE) prof = (async () => {
      await sleep((PROFILE_AT != null ? Number(PROFILE_AT) : Math.max(0, (SECONDS - PROFILE) / 2)) * 1000);
      const cdp = await page.createCDPSession();
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
      await sleep(PROFILE * 1000);
      const { profile } = await cdp.send('Profiler.stop');
      const dt = {}, tot = { all: 0 };
      const td = profile.timeDeltas; const idx = new Map(profile.nodes.map(n => [n.id, n]));
      profile.samples.forEach((id, i) => { const n = idx.get(id); const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`; dt[k] = (dt[k] || 0) + (td[i] || 0); tot.all += td[i] || 0; });
      if (PROFILE_AT != null) {   // longest run of non-idle samples = the hitch: self + inclusive ms inside it
        const times = []; let t = 0; for (const d of td) times.push(t += d);
        const parent = new Map(); for (const n of profile.nodes) for (const ch of n.children || []) parent.set(ch, n.id);
        const key = cf => `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
        let best = [0, 0], cur = 0;
        profile.samples.forEach((id, i) => { if (idx.get(id).callFrame.functionName === '(idle)') cur = i + 1; else if (times[i] - times[cur] > times[best[1]] - times[best[0]]) best = [cur, i]; });
        log('longest busy run ms', ((times[best[1]] - times[best[0]]) / 1000).toFixed(0), 'at', ((times[best[0]]) / 1e6 + Number(PROFILE_AT)).toFixed(2), 's');
        const self = {}, incl = {};
        for (let i = best[0]; i <= best[1]; i++) { const id = profile.samples[i], d = td[i + 1] || 200; const k = key(idx.get(id).callFrame); self[k] = (self[k] || 0) + d;
          const seen = new Set(); for (let x = id; x; x = parent.get(x)) { const kk = key(idx.get(x).callFrame); if (!seen.has(kk)) { seen.add(kk); incl[kk] = (incl[kk] || 0) + d; } } }
        log('--self'); for (const [k, v] of Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 15)) log((v / 1000).toFixed(1).padStart(6), k);
        log('--incl'); for (const [k, v] of Object.entries(incl).sort((a, b) => b[1] - a[1]).slice(0, 40)) log((v / 1000).toFixed(1).padStart(6), k);
        return;
      }
      const top = Object.entries(dt).sort((a, b) => b[1] - a[1]).slice(0, 30);
      for (const [k, v] of top) log(`${(100 * v / tot.all).toFixed(1).padStart(5)}%  ${k}`);
    })().catch(e => log('profile failed', e.message));
    const t0 = Date.now(), info = [];
    const progs0 = await page.evaluate('window.__renderer?.info.programs?.length ?? null');
    let fightTicks = 0, ticks = 0;
    while (Date.now() - t0 < SECONDS * 1000) {
      const s = await page.evaluate('window.__perfStep()');
      ticks++; if (s.near) fightTicks++;
      await sleep(100);
    }
    await page.keyboard.up('KeyW');
    await prof;
    detail.programs = [progs0, await page.evaluate('window.__renderer?.info.programs?.length ?? null')];   // shader programs at start/end of the run
    // WIC_PROGLOG=1: every program linked after load (progate.js ?debug log: name, key, s since load, ready when first seen)
    if (process.env.WIC_PROGLOG) for (const r of await page.evaluate('window.__progGate?.log || []')) log('prog', JSON.stringify(r), 'walkReady', (await page.evaluate('window.__walkReadyAt') / 1000).toFixed(2));
    if (PROFILE) log('census', JSON.stringify(await page.evaluate(() => {   // visible draw-producing objects per top-level scene child
      const out = {}, cam = window.__scene; if (!cam) return null;
      for (const c of window.__scene.children) { let n = 0, inst = 0; c.traverseVisible(o => { if (o.isMesh || o.isPoints || o.isLine) { n++; if (o.isInstancedMesh) inst++; } }); if (n) { const k = (c.name || c.type) + (inst ? `(${inst}i)` : ''); out[k] = (out[k] || 0) + n; } }
      return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25));
    })));
    for (const [calls, tris] of await page.evaluate('window.__rinfo || []')) info.push({ calls, tris });
    const f = await page.evaluate('window.__frames');
    const per = {};
    for (const t of f) { const k = Math.floor((t - f[0]) / 1000); per[k] = (per[k] || 0) + 1; }
    const full = Math.floor((f.at(-1) - f[0]) / 1000);
    const c = Object.entries(per).filter(([k]) => +k < full).map(([, v]) => v).sort((a, b) => a - b);
    out.fps_median = c.length ? c[Math.floor(c.length / 2)] : null;
    detail.fps_p5 = c.length ? c[Math.floor(c.length * 0.05)] : null;
    detail.fps_min = c[0] ?? null;
    detail.slow_secs = Object.entries(per).filter(([k, v]) => +k < full && v < 50).map(([k, v]) => [+k, v]);   // [second, fps] below 50
    const gaps = f.slice(1).map((t, i) => [Math.round((f[i] - f[0]) / 100) / 10, Math.round(t - f[i])]).filter(g => g[1] > 34);
    detail.long_frames = gaps.length; detail.worst_frames = gaps.sort((x, y) => y[1] - x[1]).slice(0, 8);   // [s, ms]
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
  console.log(JSON.stringify({ ...out, perf_detail: detail }));   // QA s7: detail on stdout for wic_perf_robust.py
}

main().catch(e => { console.error(e); console.log(JSON.stringify({ fps_median: null, load_seconds: null })); process.exit(1); });
