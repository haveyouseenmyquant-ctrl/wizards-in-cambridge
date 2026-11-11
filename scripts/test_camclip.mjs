#!/usr/bin/env node
// Combat camera vs market props (Gameplay s8, task 751e / issue 5ac5): headless Chrome loads /?debug&nopick, puts the
// player in game (combat) mode at 9+ spots among the Market Hill stall rows (the judge's combat frame-10 spot by
// market-north / boss-market plus spots along both sides and the ends of every stall strip) facing 8 yaws at 3 pitches,
// runs the real third-person combat camera (player.applyCamera3 with feel.js + combatcam.js + camclip.js) for 12 frames
// per pose and tests every frame's camera position against every zone prop mesh (market_stalls, clutter, trailer,
// fountain, furniture): inside = within the mesh's oriented bounding box (min-area rectangle of its vertices in plan,
// its full height). Boxes are computed here from the geometry, independently of camclip.js.
//   node scripts/test_camclip.mjs [site_dir]
// Last line: {"ok": bool, "camclip_frames_inside": N, "samples": M, "spots": K, ...}; exit 1 on failure.
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
const WATCHDOG_S = +(process.env.WC_TEST_WATCHDOG_S || 600);
setTimeout(() => { console.log(JSON.stringify({ ok: false, camclip_frames_inside: -1, samples: 0, error: `watchdog ${WATCHDOG_S} s` })); process.exit(1); }, WATCHDOG_S * 1000).unref();
const errors = [];
let out = { ok: false, camclip_frames_inside: -1, samples: 0 };
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug&nopick&q=low${process.env.WIC_TEST_QUERY || ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__walkReady === true', { timeout: 300000 });
  await page.waitForFunction('window.__game && window.__game.mobSystem && window.__game.feel && window.__zoneReady !== false && window.__scene.getObjectByName("zone")', { timeout: 120000 });
  // freeze the render loop so only this script moves the camera
  await page.evaluate(() => { window.__hold = true; const r = window.__renderer; window.__loop0 = r.setAnimationLoop; r.setAnimationLoop(null); });

  out = await page.evaluate(async () => {
    const g = window.__game, P = window.__p, W = window.__world, T = window.__THREE, sys = g.mobSystem;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    sys.encountersEnabled = false;
    for (const m of [...g.mobs]) sys.remove(m);
    for (const s of sys.encounterState.values()) { s.active = false; s.mobs = []; }
    for (let n = 0; g.quests?.dialogueOpen && n < 40; n++) g.quests.advance();
    // oriented boxes of the zone prop meshes (three.js frame: x, y up, z)
    const PROP = /^(market_stalls|clutter|trailer|fountain|furniture)/;
    const zone = window.__scene.getObjectByName('zone'), boxes = [], v = new T.Vector3();
    zone.updateMatrixWorld(true);
    zone.traverse(m => {
      if (!m.isMesh || !m.geometry) return;
      if (!PROP.test(m.name) && !PROP.test(m.parent?.name || '')) return;
      const pa = m.geometry.getAttribute('position'), pts = []; let y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld); pts.push([v.x, v.z]); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      // convex hull (monotone chain), then the min-area rectangle over the hull edge directions
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
      for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
      for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
      const H = lo.slice(0, -1).concat(up.slice(0, -1)); let best = null;
      for (let i = 0; i < H.length; i++) {
        const a = H[i], b = H[(i + 1) % H.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
        const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
        for (const p of H) { const u = p[0] * ux + p[1] * uz, w = -p[0] * uz + p[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w); }
        const A = (u1 - u0) * (w1 - w0); if (!best || A < best.A) best = { A, ux, uz, u0, u1, w0, w1 };
      }
      if (best) boxes.push({ name: m.name || m.parent?.name, y0, y1, ...best });
    });
    const inside = (b, x, y, z) => { if (y < b.y0 || y > b.y1) return false; const u = x * b.ux + z * b.uz, w = -x * b.uz + z * b.ux; return u > b.u0 && u < b.u1 && w > b.w0 && w < b.w1; };
    // spots: the clip's first fights (judge frame 10 at Market Hill) and both long sides + ends of every stall strip
    const spots = [];
    for (const id of ['market-north', 'boss-market', 'market-south']) { const e = g.encounters.find(e => e.id === id); if (e) spots.push({ x: e.x, y: e.y }); }
    for (const b of boxes.filter(b => /^market_stalls/.test(b.name))) {
      const cu = (b.u0 + b.u1) / 2, cw = (b.w0 + b.w1) / 2, hu = (b.u1 - b.u0) / 2, hw = (b.w1 - b.w0) / 2;
      const at = (u, w) => ({ x: u * b.ux - w * b.uz, y: -(u * b.uz + w * b.ux) });   // plan (u, w) -> collision frame (x, -z)
      const long = hu >= hw;
      for (const s of [-1, 1]) for (const off of [0.9, 2.2]) for (const f of [-0.6, 0, 0.6]) spots.push(long ? at(cu + f * hu, cw + s * (hw + off)) : at(cu + s * (hu + off), cw + f * hw));
      spots.push(long ? at(cu - hu - 1.2, cw) : at(cu, cw - hw - 1.2), long ? at(cu + hu + 1.2, cw) : at(cu, cw + hw + 1.2));
    }
    const C = window.__zoneCut?.value, cam = g.camera || window.__scene.children.find(o => o.isCamera);
    let samples = 0, insideN = 0, used = 0; const bad = [];
    const e0 = g.encounters.find(e => e.id === 'market-north') || g.encounters[0];
    window.__player.teleport(e0.x, e0.y);
    for (let i = 0; i < 60 && P.pendingPlace; i++) { P.update(0.05); await sleep(20); }
    const z0 = P.z;
    P.view = 3; P.combatCam = true;
    for (const s of spots) {
      // placed directly (teleport's placement search may move the player off a spot beside a stall); ground only,
      // never a canopy top: stand height searched from 1.5 m above the square's ground
      const z = W.standAt(s.x, s.y, z0 + 1.5);
      if (z == null || Math.abs(z - z0) > 1.2 || W.blocked(s.x, s.y, z + 0.1, 0.3, 0, 1.6)) continue;
      P.x = s.x; P.y = s.y; P.z = z; P.vx = P.vy = P.vz = 0; P.pendingPlace = null;
      used++;
      for (let k = 0; k < 8; k++) for (const [pitch, camMax] of [[-0.3, 4.8], [0, null], [-0.6, null]]) {
        P.yaw = k * Math.PI / 4; P.pitch = pitch; P.camMax = camMax; P.camD = P.camP = null;
        for (let f = 0; f < 16; f++) {
          if (C) C.set(P.x, P.z + 1.9, -P.y, 8);
          P.applyCamera3(cam, 1 / 30); cam.updateMatrixWorld();
          if (f < 4) continue;
          samples++;
          const c = cam.position, hit = boxes.find(b => inside(b, c.x, c.y, c.z));
          if (hit) { insideN++; if (bad.length < 12) bad.push({ spot: [+P.x.toFixed(1), +P.y.toFixed(1)], yaw: +P.yaw.toFixed(2), pitch, prop: hit.name, cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)] }); }
        }
      }
      await sleep(0);
    }
    P.camMax = null;
    return { camclip_frames_inside: insideN, samples, spots: used, spots_tried: spots.length, props: boxes.length,
      z0, clip: g.camClip && { boxes: g.camClip.boxes?.length, pulls: g.camClip.pulls, lifts: g.camClip.lifts, frames: g.camClip.frames }, stall_boxes: boxes.filter(b => /^market_stalls/.test(b.name)).length, bad };
  });
  out.ok = out.camclip_frames_inside === 0 && out.samples >= 200 && out.stall_boxes > 0 && !errors.length;
} catch (e) {
  errors.push('harness: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
}
out.page_errors = errors.slice(0, 5);
await browser.close(); server.close();
console.log(JSON.stringify(out));
process.exit(out.ok ? 0 : 1);
