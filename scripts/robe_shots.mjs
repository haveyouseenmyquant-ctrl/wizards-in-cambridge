#!/usr/bin/env node
// Rigged player wizard screenshots (graphics s1): each class in the third-person view, idle and mid-cast, plus a hit.
//   WC_SITE=<dir> node scripts/wizard_shots.mjs <out_prefix>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const SRC = path.resolve(process.env.WC_SITE || path.join(ROOT, 'site')), OUT = process.argv[2] || path.join(ROOT, 'docs/screens/wizard');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, path.normalize(p));
  if (!f.startsWith(SRC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 0,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], defaultViewport: { width: 960, height: 540 } });
const errors = [], info = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' || /wizard_rig/.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug&nopick`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__walkReady === true && window.__game && window.__game.mobSystem && window.__game.wizardRig?.ready', { timeout: 300000, polling: 500 });
  await page.evaluate(async () => { const g = window.__game, P = window.__p; g.invulnUntil = 1e9;
    window.__player.teleport(-100, 62); await new Promise(r => setTimeout(r, 2500));
    P.view = 3; P.yaw = 2.6; P.pitch = -0.15; P.camD = null; P.camP = null; });
  const snap = async (tag) => { info.push(await page.evaluate((tag) => { const R = window.__game.wizardRig.model, b = R.robe; return { tag, cur: R.cur, x: +b.x.toFixed(3), z: +b.z.toFixed(3), tw: +b.tw.toFixed(3), fl: +b.fl.toFixed(3), mat: !!b.mat }; }, tag)); await page.screenshot({ path: `${OUT}_${tag}.jpg`, quality: 75 }); };
  await snap('idle');
  await page.keyboard.down('KeyW'); await new Promise(r => setTimeout(r, 1500)); await snap('walk');
  await page.keyboard.down('ShiftLeft'); await new Promise(r => setTimeout(r, 1500)); await snap('run');
  await page.keyboard.down('KeyA'); await new Promise(r => setTimeout(r, 500)); await snap('turn');
  await page.keyboard.up('KeyA'); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await new Promise(r => setTimeout(r, 120)); await snap('stop');
  await new Promise(r => setTimeout(r, 1500)); await snap('rest');
} finally { console.log(JSON.stringify({ errors, info })); await browser.close(); server.close(); }
