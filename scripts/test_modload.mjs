#!/usr/bin/env node
// Module-load gate test (QA task 100c, issue 4bd7): loads the game (/?debug&nopick) and fails when any game module
// listed in site/app/game/index.js MODULES fails to load or install (console '[game] module <m> not loaded: ...'),
// when the game layer does not start at all ('[game] not started'), on module data errors ('[game] module data') and on
// any page error. index.js skips a broken module so the world stays walkable; without this test a syntax error in one
// module silently removed its feature from the build while every other test still passed.
//   node scripts/test_modload.mjs [site_dir]
// Last stdout line: {"ok", "load_s", "modules", "errors": [...]}; exit 1 if not ok.
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
const BAD = /\[game\] (module .* not loaded|not started|module data)/;
const T0 = Date.now();

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
const WATCHDOG_S = +(process.env.WC_TEST_WATCHDOG_S || 280);
setTimeout(() => { console.log(JSON.stringify({ ok: false, errors: [`watchdog ${WATCHDOG_S} s`] })); process.exit(1); }, WATCHDOG_S * 1000).unref();
const errors = [];
let modules = 0, harness = null;
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  page.on('console', m => { const t = m.text(); if (BAD.test(t)) errors.push(t.slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug&nopick${process.env.WIC_TEST_QUERY || ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  // the game layer either starts (window.__game) or logs '[game] not started'
  await page.waitForFunction(() => window.__game || window.__gameT?.installed, { timeout: 240000 }).catch(e => { if (!errors.length) throw e; });
  await new Promise(r => setTimeout(r, 1500));   // late module data warnings (ready promises)
  modules = await page.evaluate(async () => (await import('/app/game/index.js')).MODULES.length).catch(() => 0);
} catch (e) { harness = 'harness: ' + e.message; }
await browser.close(); server.close();
const ok = !harness && !errors.length && modules > 0;
console.log(JSON.stringify({ ok, load_s: +((Date.now() - T0) / 1000).toFixed(1), modules, errors: harness ? [harness, ...errors] : errors }));
process.exit(ok ? 0 : 1);
