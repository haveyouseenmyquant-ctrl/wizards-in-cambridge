// Safari smoke test: load the site in WebKit (Playwright), wait for the player to be walkable, walk forward 5 s,
// report console errors / failed requests and a screenshot.  node scripts/webkit_smoke.mjs <site_dir_or_url> [out.png]
import http from 'http'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const require = createRequire(path.resolve('tools/pw/package.json'));
const { webkit } = require('playwright');
const [SRC = 'site', SHOT = '/tmp/wc_webkit.png'] = process.argv.slice(2);
let base = SRC, server;
if (!/^https?:/.test(SRC)) {
  const dir = path.resolve(SRC);
  server = http.createServer((q, r) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, path.normalize(p));
    if (!f.startsWith(dir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end(); }
    const ext = path.extname(f); r.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream' });
    r.end(fs.readFileSync(f));
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok)); base = `http://127.0.0.1:${server.address().port}/`;
}
const errs = [];
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));
page.on('requestfailed', r => errs.push('failed ' + r.url()));
page.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
const t0 = Date.now();
await page.goto(base, { waitUntil: 'domcontentloaded' });
let ready = false;
for (let i = 0; i < 120 && !ready; i++) { await page.waitForTimeout(250); ready = await page.evaluate(() => !!window.__walkReady); }
const load = (Date.now() - t0) / 1000;
await page.mouse.click(640, 360).catch(() => {});
await page.keyboard.down('w'); await page.waitForTimeout(5000); await page.keyboard.up('w');
await page.screenshot({ path: SHOT });
console.log(JSON.stringify({ webkit_ready: ready, load_seconds: load, errors: errs.length, first_errors: errs.slice(0, 5) }));
await browser.close(); server?.close();
process.exit(ready && !errs.length ? 0 : 1);   // wic: the task check relies on the exit code
