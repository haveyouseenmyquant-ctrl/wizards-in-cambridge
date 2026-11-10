#!/usr/bin/env node
// Mob model/pose screenshots (session 50): headless Chrome loads /?debug on the local build, freezes the mob AI, lines up
// mob types in a row on Market Hill and renders idle and wind-up poses with the __cam hook.
//   node scripts/mob_shots.mjs [out_prefix]   writes <out_prefix>_<n>.png (default docs/screens/session50_mobs)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const SRC = process.env.WC_SITE || path.join(ROOT, 'site'), OUT = process.argv[2] || path.join(ROOT, 'docs/screens/session50_mobs');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, path.normalize(p));
  if (!f.startsWith(SRC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 0,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 720 } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__walkReady === true && window.__game && window.__game.mobSystem', { timeout: 300000, polling: 500 });
  const SHOTS = process.env.MOB_SHOTS ? JSON.parse(process.env.MOB_SHOTS) : [
    { types: ['gargoyle', 'wisp', 'statue', 'ink_imp'] },
    { types: ['automaton', 'river_wraith', 'bog_hag', 'punt_revenant'] },
    { types: ['bell_bats', 'soot_sprite', 'crest_griffin', 'bicycle_golem'] },
    { types: ['wisp', 'statue', 'river_wraith', 'ink_imp'], pose: 'windup' },
    { types: ['gargoyle', 'automaton', 'statue', 'river_wraith'], pose: 'windup', attack: 1 },
  ];
  for (let i = 0; i < SHOTS.length; i++) {
    await page.evaluate(async (S) => {
      const g = window.__game, sys = g.mobSystem;
      window.__unpause ??= setInterval(() => { const pk = document.querySelector('.gh-pick'); if (pk) pk.hidden = true; g.paused = false; }, 100);
      window.__player.teleport(-186, 0);
      for (let i = 0; i < 100 && g.mobRig && !g.mobRig.ready(); i++) await new Promise(r => setTimeout(r, 200));
      await new Promise(r => setTimeout(r, 1500));
      for (const m of [...g.mobs]) { sys.remove(m); g.mobs.splice(g.mobs.indexOf(m), 1); }
      const X0 = -190, Y0 = -5, shot = [];
      S.types.forEach((id, k) => {
        const y = Y0 + k * 3.4, sp = sys.findSpot(X0, y, 2) || { x: X0, y, z: g.pz };
        const m = sys.spawn(id, sp.x, sp.y, sp.z); m.yaw = Math.PI / 2 + 0.3 - k * 0.15; shot.push(m);
      });
      sys.update = (dt) => { for (const m of shot) {
        m.t += dt;
        if (S.pose === 'death') { if (m.state !== 'dead') { m.dead = true; sys.onDeath(m); } m.deathT = (S.deathT ?? 0.6) - dt; sys.tickDeath(m, dt); continue; }
        if (S.pose === 'windup') { const a = m.type.attacks[Math.min(S.attack || 0, m.type.attacks.length - 1)]; m.attack = a; m.windupEff = a.windup; m.state = 'windup'; m.stateT = a.windup * 0.2; }
        else if (S.pose === 'hit') { m.state = 'chase'; if ((m.t % 0.9) < dt) sys.onHit(m, 30, {}); m.kb = null; m.flashT = Math.max(0, m.flashT - dt); m.flinch = Math.max(0, m.flinch - dt); m.hitT = Math.max(0, (m.hitT || 0) - dt); }
        else m.state = S.pose === 'walk' ? 'chase' : 'idle';
        const mv = S.pose === 'walk' ? 1 : 0;
        sys.animate(m, dt, mv); sys.bodyLanguage(m, dt, mv); sys.place(m);
      } g.mobRig?.tick(dt); };
      const mid = shot[Math.floor(shot.length / 2)];
      const gz = mid.groundZ ?? mid.z; window.__cam = { pos: [X0 + 6.5, Y0 + 5.1 - 3.5, gz + 2.6], at: [X0, Y0 + 5.1, gz + 1.2], fov: 60 };
      await new Promise(r => setTimeout(r, 2500));
    }, SHOTS[i]);
    await page.screenshot({ path: `${OUT}_${SHOTS[i].name || i + 1}.${process.env.MOB_JPG ? 'jpg' : 'png'}`, ...(process.env.MOB_JPG ? { type: 'jpeg', quality: 85 } : {}) });
  }
} finally { console.log(JSON.stringify({ errors })); await browser.close(); server.close(); }
