#!/usr/bin/env node
// Environment & VFX: the judge's exploration frames only (same spots, camera, 960x540 SwiftShader as scripts/wic_record.mjs),
// for fast lighting A/B.  node tools/env_shots.mjs [site_dir] [out_dir] [--query=&look=classic]   (~1-2 min)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const QUERY = (process.argv.find(a => a.startsWith('--query=')) || '--query=').slice(8);
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const argv = process.argv.slice(2).filter(a => !a.startsWith('--'));
const SRC = path.resolve(argv[0] || path.join(ROOT, 'site'));
const OUT = path.resolve(argv[1] || '/tmp/wic_env_shots');
const SKIP_COMBAT = process.argv.includes('--skip-combat');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const T0 = Date.now();
const log = (...a) => console.error(`[record ${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);
// fixed exploration spots (collision frame, m) and walking yaw (rad): Market Hill, Peas Hill, King's Parade, Senate House Hill
const SPOTS = [
  { name: 'Market Hill', x: -108.1, y: 93.97, yaw: Math.PI },
  { name: 'Peas Hill', x: -122, y: -20, yaw: 2.6 },
  { name: "King's Parade", x: -190, y: 5, yaw: 2.89 },
  { name: 'Senate House Hill', x: -182, y: 68, yaw: 3.01 },
];

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, path.normalize(p));
  if (!f.startsWith(SRC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, protocolTimeout: 600000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'],
  defaultViewport: { width: 960, height: 540 },
});

// runs before any page script: seeded Math.random + a rAF gate (__rafHold / __rafFrame) as in gameplay_clip.mjs
function preload(seed) {
  let s = seed >>> 0;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const raf = window.requestAnimationFrame.bind(window);
  let queue = [];
  window.__rafHold = false;
  window.requestAnimationFrame = cb => { if (!window.__rafHold) return raf(cb); queue.push(cb); return -queue.length; };
  window.__rafFrame = () => new Promise(done => { const q = queue; queue = []; raf(t => { for (const cb of q) { try { cb(t); } catch (e) { console.error(e); } } done(); }); });
}

const manifest = { site: SRC, scenes: {}, errors: [] };
fs.mkdirSync(OUT, { recursive: true });

async function openPage(query, seed) {
  const ctx = await browser.createBrowserContext();   // fresh localStorage
  const page = await ctx.newPage();
  page.on('pageerror', e => manifest.errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/404|Failed to load resource/.test(t)) manifest.errors.push(t); });
  await page.evaluateOnNewDocument(preload, seed);
  await page.goto(BASE + query, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__walkReady === true', { timeout: 180000 });
  return { ctx, page };
}
async function settle(page) {
  await page.waitForFunction('!window.__player.pendingPlace && window.__player.settled(160)', { timeout: 180000, polling: 500 });
  await new Promise(r => setTimeout(r, 1500));
}
async function shot(page, scene, name, label) {
  const dir = path.join(OUT, scene); fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => window.__rafHold ? window.__rafFrame() : new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: path.join(dir, name), type: 'jpeg', quality: 85 });
  (manifest.scenes[scene].frames ||= []).push({ file: `${scene}/${name}`, label });
  log(scene, name, label);
}
// step the player (and the game when present) by `secs` of game time at 20 Hz while holding `keys`
const step = (page, secs, keys = []) => page.evaluate(([secs, keys]) => {
  const P = window.__p; for (const k of keys) P.keys.add(k);
  for (let t = 0; t < secs; t += 0.05) { window.__stepping = true; P.update(0.05); window.__stepping = false; if (window.__gameUpdate) window.__gameUpdate(0.05); }
  for (const k of keys) P.keys.delete(k);
}, [secs, keys]);
// gate the render loop's own player/game clock so only step() advances time
const gate = page => page.evaluate(() => {
  const P = window.__p, pu = P.update.bind(P);
  P.update = dt => { if (window.__stepping) pu(dt); };
  const g = window.__game;
  if (g) { window.__gameUpdate = g.update.bind(g); g.update = () => {}; }
});

async function sceneExplore() {
  manifest.scenes.explore = { desc: 'Exploration mode (no enemies, no HUD by design): the player walks through four fixed spots of the city; first-person and third-person views', frames: [] };
  const { ctx, page } = await openPage('?explore&debug' + QUERY, 1);
  for (const [i, s] of SPOTS.entries()) {
    await page.evaluate(([x, y]) => window.__player.teleport(x, y), [s.x, s.y]);
    await settle(page);
    await page.evaluate(() => { window.__rafHold = true; });
    await gate(page);
    // keep the fixed yaw if it has >= 20 m of walkable ground ahead, else the nearest direction that does (so a new
    // wall or a shifted spawn does not turn the frame into a close-up of masonry); the yaw used goes in the label
    const yaw = await page.evaluate(pref => {
      const P = window.__p, W = window.__world, free = a => { let z = P.z, d = 0;
        for (; d < 40; d += 1) { const nz = W.standAt(P.x - Math.sin(a) * (d + 1), P.y + Math.cos(a) * (d + 1), z); if (nz == null) break; z = nz; }
        // and nothing rendered (facades without collision, screens, railings) within 20 m at eye height
        const T = window.__THREE, rc = new T.Raycaster(new T.Vector3(P.x, P.z + 1.65, -P.y), new T.Vector3(-Math.sin(a), 0, -Math.cos(a)), 0.3, 20);
        const hit = rc.intersectObjects(window.__scene.children, true).find(h => h.object.visible !== false && !h.object.isSprite);
        return hit ? Math.min(d, hit.distance) : d; };
      for (let k = 0; k <= 16; k++) for (const sgn of [1, -1]) { const a = pref + sgn * k * Math.PI / 16; if (free(a) >= 20) return a; }
      return pref;
    }, s.yaw);
    if (Math.abs(yaw - s.yaw) > 1e-6) manifest.errors.push(`note: explore ${s.name} yaw ${s.yaw} blocked, used ${yaw.toFixed(2)}`);
    for (const view of [1, 3]) {
      await page.evaluate(([yaw, view]) => { const P = window.__p; P.view = view; P.yaw = yaw; P.pitch = view === 3 ? -0.15 : 0; }, [yaw, view]);
      await step(page, 1.2, ['KeyW']);
      await shot(page, 'explore', `spot${i + 1}_${view === 1 ? 'fp' : 'tp'}.jpg`, `${s.name}, ${view === 1 ? 'first person' : 'third person'}, walking`);
    }
    await page.evaluate(() => { const P = window.__p; delete P.update; window.__rafHold = false; window.__rafFrame(); });
  }
  await ctx.close();
}


await sceneExplore();
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
if (manifest.errors.length) console.error(manifest.errors.join('\n'));
await browser.close(); server.close();
