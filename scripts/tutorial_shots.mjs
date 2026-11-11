#!/usr/bin/env node
// Tutorial prompt screenshots (UI and UX, 616a): fresh profile, /?debug&nopick&tutorial=1, picks a class, steps through
// window.WIC.tutorial and saves desktop and touch-emulated shots.  node scripts/tutorial_shots.mjs [site_dir] [out_dir=data/derived/ui_shots]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'site')), OUT = process.argv[3] || path.join(ROOT, 'data/derived/ui_shots');
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
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
const errors = [], shots = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
async function run(tag, vp, plan) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); await page.setViewport(vp);
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug&nopick&tutorial=1`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__walkReady === true && window.__game && window.WIC && window.WIC.tutorial', { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.caster.setClass('stormcaller'); g.save.cls = 'stormcaller'; g.persist(); g.paused = false; });
  await page.waitForFunction('window.WIC.tutorial.active', { timeout: 60000 });
  for (const [name, step, talk] of plan) {
    await page.evaluate((step, talk) => { const T = window.WIC.tutorial;
      while (T.active && T.step !== step) T.next();
      if (!talk) { while (T.advance()); } }, step, talk);
    await wait(1800);
    const f = path.join(OUT, `tutorial_${tag}_${name}.png`); await page.screenshot({ path: f }); shots.push(f);
  }
  const info = await page.evaluate(() => ({ ui: !!window.WIC.tutorialUI, coarse: matchMedia('(pointer: coarse)').matches, card: !!document.querySelector('#wic-tut .tu-card'), satchel: !!document.querySelector('#touch-satchel') }));
  console.error(tag, JSON.stringify(info));
  await ctx.close();
}
try {
  await run('desktop', { width: 1280, height: 720 }, [['intro', 'intro', true], ['move', 'move'], ['cast', 'cast'], ['equip', 'equip']]);
  await run('touch', { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, [['move', 'move'], ['equip', 'equip']]);
} finally { await browser.close(); server.close(); }
console.log(JSON.stringify({ shots, errors }));
