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

// roof_shots: fixed debug cameras (window.__cam) for roof before/after: street level and aerial-ish
const VIEWS = [
  { name: 'market_hill', walk: [-108, 94], pos: [-75, 62, 0], at: [-140, 130, 0], up: 6, atUp: 14 },
  { name: 'market_aerial', walk: [-108, 94], pos: [-20, 20, 0], at: [-120, 110, 0], up: 55, atUp: 0 },
  { name: 'petty_cury', walk: [-50, 30], pos: [-75, 45, 0], at: [22, -6, 0], up: 16, atUp: 4 },
  { name: 'trinity_st', walk: [-215, 160], pos: [-205, 115, 0], at: [-245, 242, 0], up: 16, atUp: 4 },
  { name: 'kings_parade_aerial', walk: [-190, 5], pos: [-130, -60, 0], at: [-200, 40, 0], up: 45, atUp: 0 },
];
async function sceneRoofs() {
  manifest.scenes.roofs = { desc: 'roof views', frames: [] };
  const { ctx, page } = await openPage('?explore&debug' + QUERY, 1);
  for (const v of VIEWS) {
    await page.evaluate(([x, y]) => window.__player.teleport(x, y), v.walk);
    await settle(page);
    const gz = await page.evaluate(() => window.__p.z);
    await page.evaluate(([v, gz]) => { window.__cam = { pos: [v.pos[0], v.pos[1], gz + v.up], at: [v.at[0], v.at[1], gz + v.atUp], fov: 60 }; }, [v, gz]);
    await new Promise(r => setTimeout(r, 4000));
    await shot(page, 'roofs', `${v.name}.jpg`, v.name);
    if (process.env.PROBE && process.env.PROBE.startsWith(v.name + ':')) {   // PROBE=view:px,py -> object under that pixel
      const [px, py] = process.env.PROBE.split(':')[1].split(',').map(Number);
      log('probe', await page.evaluate(([px, py]) => {
        const T = window.__THREE, fc = window.__cam, rc = new T.Raycaster(), c = new T.PerspectiveCamera(60, 960 / 540, 0.1, 5000);
        c.position.set(fc.pos[0], fc.pos[2], -fc.pos[1]); c.lookAt(fc.at[0], fc.at[2], -fc.at[1]); c.updateMatrixWorld(); rc.setFromCamera(new T.Vector2(px / 480 - 1, 1 - py / 270), c);
        return rc.intersectObjects(window.__scene.children, true).filter(h => h.object.visible).slice(0, 4).map(h => {
          let o = h.object, n = []; while (o) { n.push(o.name || o.userData?.name || o.type); o = o.parent; }
          return h.distance.toFixed(1) + ' ' + n.slice(0, 4).join('<') + ' ' + JSON.stringify(h.point); });
      }, [px, py]));
    }
  }
  await ctx.close();
}
await sceneRoofs();
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
if (manifest.errors.length) console.error(manifest.errors.join('\n'));
await browser.close(); server.close();
