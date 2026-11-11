#!/usr/bin/env node
// Townsfolk (graphics s9, task d1ad): headless Chrome loads the build in exploration mode (?explore) and, with
// TF_GAME=1, in game mode too; waits for site/app/game/townsfolk.js to spawn its walkers, then measures how many stand
// within 120 m of Great St Mary's (collision frame -151, 60) and the share that moved more than 2 m in 5 s.
//   node scripts/test_townsfolk.mjs [site_dir]
// Last line: {"walkers": N, "moving_pct": P, "page_errors": [...], ...}
import { wicLaunch } from './lib/wic_launch.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'site'));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, path.normalize(p));
  if (!f.startsWith(SRC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const browser = await puppeteer.launch(wicLaunch({
  executablePath: CHROME, headless: true, protocolTimeout: 0,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'],
  defaultViewport: { width: 640, height: 360 },
}));
const WATCHDOG_S = +(process.env.WC_TEST_WATCHDOG_S || 400);
setTimeout(() => { console.log(JSON.stringify({ walkers: 0, moving_pct: 0, page_errors: [`watchdog ${WATCHDOG_S} s`] })); process.exit(1); }, WATCHDOG_S * 1000).unref();
const errors = [];
const out = {};
try {
  for (const mode of process.env.TF_GAME ? ['explore', 'game'] : ['explore']) {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
    page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/?nopick&q=low&debug${mode === 'explore' ? '&explore' : ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction('window.__walkReady === true', { timeout: 300000 });
    if (process.env.TF_DEBUG) await page.evaluate(() => { window.__TFDBG = 1; });
    await page.waitForFunction('window.__townsfolk && window.__townsfolk.folk.length >= 20', { timeout: 90000 }).catch(() => {});
    const r = await page.evaluate(async () => {
      const F = window.__townsfolk?.folk || [], near = F.filter(f => Math.hypot(f.x + 151, f.y - 60) <= 120);
      const p0 = near.map(f => [f.x, f.y]), m0 = near.map(f => f.moved); let raf = 0; const cnt = () => { raf++; if (raf < 1e5) requestAnimationFrame(cnt); }; requestAnimationFrame(cnt); const t0 = performance.now();
      await new Promise(r => setTimeout(r, 5000));
      const moved = near.filter((f, i) => Math.hypot(f.x - p0[i][0], f.y - p0[i][1]) > 2).length;
      const dbg = F.slice(0, 6).map(f => ({ x: +f.x.toFixed(1), y: +f.y.toFixed(1), z: +f.z.toFixed(2), stall: f.stall, moved: +f.moved.toFixed(1), cur: f.cur, sup: window.__world?.support(f.x, f.y, f.z + 0.5) }));
      const fps = +(raf / ((performance.now() - t0) / 1000)).toFixed(1), pathM = near.map((f, i) => +(f.moved - m0[i]).toFixed(1));
      return { fps, pathM, dbg: window.__TFDBG ? dbg : undefined, walkers: near.length, cyclists: near.filter(f => f.bike).length, moving_pct: near.length ? Math.round(100 * moved / near.length) : 0, total: F.length };
    });
    out[mode] = r;
    await page.close();
  }
} catch (e) { errors.push('harness: ' + e.message); }
await browser.close(); server.close();
const m = out.explore || { walkers: 0, moving_pct: 0 }, gm = out.game;
const res = { walkers: Math.min(m.walkers, gm?.walkers ?? 1e9), moving_pct: Math.min(m.moving_pct, gm?.moving_pct ?? 100), page_errors: errors, modes: out };
console.log(JSON.stringify(res));
process.exit(res.walkers >= 16 && res.moving_pct >= 80 && !errors.length ? 0 : 1);
