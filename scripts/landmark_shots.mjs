#!/usr/bin/env node
// Reference screenshots of the detailed landmarks: landmarks/<id>.png (oblique aerial view).
//   node scripts/landmark_shots.mjs [site_dir] [--only id,id]
// Uses the viewer's window.__cam hook; the player is teleported to the landmark so its tiles stream in.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const argv = process.argv.slice(2);
const oi = argv.indexOf('--only');
const ONLY = oi < 0 ? null : argv.splice(oi, 2)[1].split(',');
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
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug&tutorial=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__walkReady === true', { timeout: 60000 });
  await page.addStyleTag({ content: '#help,#minimap,#status,.hud{display:none!important}' });
  const man = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json')));
  for (const l of man.landmarks) {
    if (!l.detailed || (ONLY && !ONLY.includes(l.id))) continue;
    const b = (l.view ?? 150) * Math.PI / 180;
    const d = Math.max(30, 2.2 * (l.size || 15));
    const at = [l.x, l.y, l.look_z + Math.min(12, 0.35 * d)];
    const pos = [l.x + Math.sin(b) * d, l.y + Math.cos(b) * d, l.look_z + 0.55 * d + 4];
    await page.evaluate((x, y) => window.__player.teleport(x, y), l.x, l.y);
    await page.evaluate((pos, at) => { window.__cam = { pos, at }; }, pos, at);
    await sleep(800);
    await page.waitForFunction('!window.__player.pendingPlace', { timeout: 30000 }).catch(() => {});
    await sleep(2500);
    const out = path.join(ROOT, 'landmarks', l.id + '.png');
    await page.screenshot({ path: out });
    console.error('[shots]', l.id);
  }
} finally { await browser.close(); server.close(); }
