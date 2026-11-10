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
    if (g.mobSystem) { g.mobSystem.encountersEnabled = false; for (const m of [...g.mobs]) g.mobSystem.remove(m); }
    window.__player.teleport(-100, 62); await new Promise(r => setTimeout(r, 2500));
    P.view = 3; P.yaw = 2.6; P.pitch = -0.15; P.camD = null; P.camP = null; });
  for (const cls of (process.env.WIZ_CLS || 'pyromancer,stormcaller,warden,hexweaver').split(',')) {
    for (const [tag, clip, wait] of [['idle', null, 1200], ['cast', 'cast', 350], ['castlayer', 'L:cast', 250], ['raise', 'L:raise', 250], ['hit', 'hit', 200]]) {
      const r = await page.evaluate(async (cls, clip, wait) => { const g = window.__game;
        if (g.caster.cls !== cls) { g.save.cls = cls; g.caster.setClass(cls); }
        await new Promise(r => setTimeout(r, 300));
        if (clip?.startsWith('L:')) { g.wizardRig.play('idle'); g.wizardRig.pose('cast', clip === 'L:raise', true); }
        else if (clip === 'hit') { g.wizardRig.play(clip); g.wizardRig.pose('hit', false, true); }
        else { g.wizardRig.pose(null); if (clip) g.wizardRig.play(clip); }
        await new Promise(r => setTimeout(r, wait));
        const R = g.wizardRig.model; const m = R?.mat, im = m?.map?.image;
        if (!window.__dumped && im?.toDataURL) { window.__dumped = 1; console.log('[wizard_rig] dump', JSON.stringify({ color: m.color, em: m.emissive, w: im.width, vc: m.vertexColors }), im.toDataURL('image/png').slice(0, 60)); window.__tex = im.toDataURL('image/png'); }
        const ua = R?.bones["UpperArm.R"];  return { q: ua && ua.quaternion.toArray().map(v => v.toFixed(2)).join(","), wp: ua && (() => { const V = g.THREE.Vector3, a = new V(), b = new V(), c = new V(), f = new V(0, 0, -1).applyQuaternion(R.root.quaternion); R.root.updateMatrixWorld(true); ua.getWorldPosition(a); R.bones["LowerArm.R"].getWorldPosition(b); R.bones["Fist.R"].getWorldPosition(c); const u = b.clone().sub(a).normalize(), l = c.clone().sub(b).normalize(); return [u.y, u.dot(f), l.y, l.dot(f), R.root.rotation.y, g.player?.yaw].map(x => (+x).toFixed(2)).join(","); })(), dt: g.time - R?.castT, t: g.time, cls, s: R?.root.children[0].scale.x, y: R?.root.children[0].position.y, cur: R?.cur, visible: R?.root.visible, proc: g.wizard.model?.root.visible };
      }, cls, clip, wait);
      info.push(r);
      await page.screenshot({ path: `${OUT}_${cls}_${tag}.jpg`, quality: 72 });
      if (process.env.WIZ_DUMP) { const u = await page.evaluate(() => window.__tex); if (u) fs.writeFileSync(`${OUT}_tex_${cls}.png`, Buffer.from(u.split(',')[1], 'base64')); }
    }
  }
} finally { console.log(JSON.stringify({ errors, info })); await browser.close(); server.close(); }
