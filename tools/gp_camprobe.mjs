#!/usr/bin/env node
// Camera occlusion probe (combatcam.js): 16 yaws at X,Y; chest->camera ray vs every scene mesh.
// Gameplay smoke test for site/app/game/tutorial.js (f917): fresh profile, NO ?tutorial=0. Drives every step through
// window.WIC.tutorial (+ real casts / kill / equip), asserts no player damage and no non-tutorial mob within 20 m while
// active, exactly one mob in first_mob, completion + localStorage flag, and that a reload skips it.
// node scripts/test_tutorial_gp.mjs [site_dir] [class]   last stdout line: JSON {tutorial_gp_pass,...}
import { wicLaunch } from '../scripts/lib/wic_launch.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'site')), CLS = process.argv[3] || 'pyromancer';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, path.normalize(p));
  if (!f.startsWith(SRC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const browser = await puppeteer.launch(wicLaunch({ executablePath: CHROME, headless: true, protocolTimeout: 0,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'], defaultViewport: { width: 960, height: 540 } }));
setTimeout(() => process.exit(1), 240000).unref();

const X = +(process.env.X ?? -101.4), Y = +(process.env.Y ?? 24);
const page = await browser.newPage();
page.on('pageerror', e => console.error(String(e)));
await page.evaluateOnNewDocument(cls => { localStorage.setItem('wic_tutorial_done', '1'); localStorage.setItem('walkable-cambridge-save-v1', JSON.stringify({ cls })); }, CLS);
await page.goto(`http://127.0.0.1:${server.address().port}/?debug&nopick&q=low`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction('window.__walkReady === true && window.__game?.combatCam', { timeout: 180000 });
const r = await page.evaluate(async (X, Y) => {
  const g = window.__game, P = g.player, T = g.THREE; g.mobSystem.encountersEnabled = false; for (const m of [...g.mobs]) g.mobSystem.remove(m);
  window.__player.teleport(X, Y); for (let i = 0; i < 30; i++) await new Promise(z => setTimeout(z, 100)); P.x = X; P.y = Y; P.z = g.groundAt(X, Y, 3) ?? P.z; P.vx = P.vy = P.vz = 0; P.view = 3; P.pitch = -0.3; P.camMax = 4.8;
  for (let i = 0; i < 40; i++) await new Promise(z => setTimeout(z, 100));
  const rc = new T.Raycaster(), out = [];
  for (let k = 0; k < 16; k++) {
    P.yaw = k / 16 * 6.283; P.camD = null; P.camP = null;
    for (let i = 0; i < 30; i++) P.applyCamera3(g.camera, 1 / 30);
    g.camera.updateMatrixWorld();
    const c = new T.Vector3(P.x, P.z + 1.3, -P.y), cam = g.camera.position.clone(), dir = cam.clone().sub(c), L = dir.length(); dir.normalize();
    rc.set(c, dir); rc.far = L; rc.camera = g.camera; const hits = rc.intersectObjects(g.scene.children, true).filter(h => h.object.visible && h.object.isMesh && !h.object.name.startsWith('gh'));
    const h = hits.find(h => { let o = h.object; while (o) { if (o === g.root) return false; o = o.parent; } return true; });
    let path = ''; if (h) { let o = h.object; while (o && path.length < 120) { path += (o.name || o.type) + '<'; o = o.parent; } }
    out.push({ yaw: +P.yaw.toFixed(2), L: +L.toFixed(2), k: +g.combatCam.k.toFixed(2), hit: h ? +h.distance.toFixed(2) : null, path });
  }
  return out;
}, X, Y);
for (const o of r) console.log(JSON.stringify(o));
if (process.env.SHOTS) await page.addStyleTag({ content: '.q-dlg,.q-bars{display:none!important}' });
if (process.env.SHOTS) for (const yaw of process.env.SHOTS.split(',').map(Number)) {
  await page.evaluate(y => { window.__game.player.yaw = y; }, yaw); await new Promise(z => setTimeout(z, 1500));
  const info = await page.evaluate(() => { const g = window.__game, P = g.player; return { p: [P.x, P.y, P.z].map(v => +v.toFixed(1)), cam: g.camera.position.toArray().map(v => +v.toFixed(1)), cc: g.combatCam }; });
  console.log('shot', yaw, JSON.stringify(info));
  await page.screenshot({ path: `/tmp/camprobe_${yaw}.jpg`, type: 'jpeg', quality: 70 });
}
await browser.close(); server.close(); process.exit(0);
