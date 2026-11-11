#!/usr/bin/env node
// Brand & Store Page: screenshots of the landing page for the blind store-page judge.
//   node tools/store_page_shots.mjs <url> <out_dir>
// Writes desktop_fold.png (1440x900 first screen), desktop_NN.png (full page cut into 1440x1600 pieces) and
// phone_NN.png (390x844 @2x, full page cut into 390x1200 CSS-px pieces), so no image is too tall for the judge to read.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { chromium } = createRequire(path.join(ROOT, 'tools/pw/'))('playwright');
const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('usage: store_page_shots.mjs <url> <out_dir>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.endsWith('.png')) fs.rmSync(path.join(out, f));

// system Chrome: the trunk Playwright's own browser build may not be downloaded
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const files = [], errors = [];
async function capture(name, viewport, dpr, piece) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: name === 'phone', hasTouch: name === 'phone' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('requestfailed', r => errors.push(`${name}: failed ${r.url()}`));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${name}: HTTP ${r.status()} ${r.url()}`); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  // lazy images below the fold never load in a static screenshot: force them, then wait (max 15 s)
  await page.evaluate(() => Promise.race([new Promise(r => setTimeout(r, 15000)), Promise.all([...document.images].map(i => { i.loading = 'eager'; return i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }); }))]));
  if (name === 'desktop') { const f = path.join(out, 'desktop_fold.png'); await page.screenshot({ path: f }); files.push(f); }
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0, k = 1; y < H; y += piece, k++) {
    const f = path.join(out, `${name}_${String(k).padStart(2, '0')}.png`);
    await page.screenshot({ path: f, fullPage: true, clip: { x: 0, y, width: viewport.width, height: Math.min(piece, H - y) } });
    files.push(f);
  }
  await ctx.close();
}
await capture('desktop', { width: 1440, height: 900 }, 1, 1600);
await capture('phone', { width: 390, height: 844 }, 2, 1200);
await browser.close();
console.log(JSON.stringify({ url, files: files.map(f => path.basename(f)), errors }));
