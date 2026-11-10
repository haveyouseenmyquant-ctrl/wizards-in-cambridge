#!/usr/bin/env node
// Story screenshots: loads /?debug&nopick, picks a class, calls window.__wicStory(0..) like QA's judge recorder and
// saves one screenshot per beat.   node scripts/story_shots.mjs [site_dir] [out_dir=/tmp/wic_story_shots]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'site')), OUT = process.argv[3] || '/tmp/wic_story_shots';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, path.normalize(p));
  if (!f.startsWith(SRC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 0,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'], defaultViewport: { width: 1280, height: 720 } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug&nopick`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__walkReady === true && window.__wicStory', { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.caster.setClass('stormcaller'); g.save.cls = 'stormcaller'; g.persist(); g.paused = false; });
  for (let i = 0; ; i++) {
    const cap = await page.evaluate(i => window.__wicStory(i), i);
    if (cap == null) break;
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(OUT, `story_${i}.jpg`), quality: 80 });
    console.error(i, cap);
  }
} finally { await browser.close(); server.close(); }
console.log(JSON.stringify({ out: OUT, errors }));
