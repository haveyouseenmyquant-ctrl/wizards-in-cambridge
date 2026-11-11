#!/usr/bin/env node
// Item effect tests (session 40): loads /?debug headless, runs window.__itemTest(id) for every item with a special
// effect, checks the chests got placed on walkable ground, and prints one JSON line {equipment_effects, failed, ...}.
//   node scripts/test_items.mjs [site_dir]
import { wicLaunch } from './lib/wic_launch.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const argv = process.argv.slice(2);
const SRC = path.resolve(argv[0] || path.join(ROOT, 'site'));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
}));
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'warning' && /items/.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug&tutorial=0${process.env.WIC_TEST_QUERY || ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__walkReady === true && !!window.__game && !!window.__itemTest', { timeout: 300000 });
  const ids = await page.evaluate(() => window.__itemIds());
  const results = [];
  for (const id of ids) results.push(await page.evaluate(id => window.__itemTest(id), id));
  for (const r of results) console.error('[items]', r.ok ? 'ok  ' : 'FAIL', r.id, '-', r.detail);
  // chests: teleport to Market Square so the tiles load, give placement a few seconds
  await page.evaluate(() => window.__player.teleport(-102.9, 57.4));
  // session 44: item effect tests are synchronous (ticks are emitted by the test, no wall/game clock involved);
  // chest placement waits on tile streaming, so the caps below are generous wall-clock safety limits only
  await sleep(1000);
  await page.waitForFunction('!window.__player.pendingPlace', { timeout: 180000 }).catch(() => {});
  await page.waitForFunction('window.__game.items.chests.every(c => c.placed)', { timeout: 180000 }).catch(() => {});
  const chests = await page.evaluate(() => window.__game.items.chests.map(c => ({ id: c.id, placed: !!c.g, x: +c.x.toFixed(1), y: +c.y.toFixed(1), z: c.z && +c.z.toFixed(2), top: +(window.__game.world.support(c.x, c.y, 1e4, true)?.z ?? 0).toFixed(2) })));
  for (const c of chests) console.error('[chest]', JSON.stringify(c));
  // loot drop: kill a stub with a guaranteed drop, check a pickup appears
  const loot = await page.evaluate(() => { const g = window.__game, n0 = g.root.children.length;
    g.emit('kill', { mob: { x: g.px + 5, y: g.py, z: g.pz, type: { loot: [{ rarity: 'epic', chance: 1 }] } } }); return g.root.children.length > n0; });
  const failed = results.filter(r => !r.ok).map(r => r.id);
  console.log(JSON.stringify({ equipment_effects: results.filter(r => r.ok).length, total: results.length, failed,
    chests_placed: chests.filter(c => c.placed).length, loot_drop: loot, page_errors: errors.slice(0, 5) }));
} finally { await browser.close(); server.close(); }
