#!/usr/bin/env node
// Headless check of the game classes: every class casts all 6 spells (base and with talents) at a dummy target.
//   node scripts/test_classes.mjs [site_dir]
// Prints JSON {ok, classes:{cls:{spells:{id:{cast, dmg}}, talents:{id:{cast, dmg}}}}, load_s, errors}; exit 1 on console errors or failed casts.
// Loads with ?q=low (spell logic doesn't depend on the preset) and waits up to WIC_LOAD_TIMEOUT_S (default 180) for the
// world and the game layer: under SwiftShader on the merged trunk the game layer takes ~25 s after the world, more under load.
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
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const LOAD_MS = 1000 * +(process.env.WIC_LOAD_TIMEOUT_S || 180);
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  executablePath: CHROME, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'],
  defaultViewport: { width: 960, height: 540 }, protocolTimeout: 600000,
}));
const errors = [];
let out = { ok: false };
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/404|Failed to load resource/.test(t)) errors.push(t);
    if (m.type() === 'warning' && /\[(game|classes)\]/.test(t) && !/mobs\.js|items\.js/.test(t)) errors.push(t);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug&nopick&q=low`, { waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  await page.waitForFunction('window.__walkReady === true', { timeout: LOAD_MS, polling: 500 });
  await page.waitForFunction('window.__game && window.__game.caster && window.__game.hud', { timeout: LOAD_MS, polling: 500 });
  out.load_s = +((Date.now() - t0) / 1000).toFixed(1);
  // quiet arena: no encounters, no live mobs (the test spawns its own stunned target per cast)
  await page.evaluate(() => { const g = window.__game; if (g.mobSystem) { g.mobSystem.encountersEnabled = false; for (const m of [...g.mobs]) g.mobSystem.remove(m); } });
  const cls = await page.evaluate(() => Object.keys(window.__game.caster.classes));
  out = { ok: true, load_s: out.load_s, classes: {}, modules: await page.evaluate(() => ({ mobs: window.__game.mobs.length, items: !!window.__game.items })) };
  for (const c of cls) {
    for (const withTalents of [false, true]) {
      await page.evaluate((c, wt) => {
        const g = window.__game; g.invulnUntil = 1e9; g.paused = false;
        g.save.cls = c; g.caster.setClass(c);
        g.stats.level = wt ? 6 : 1;
        for (let t = 0; t < 3; t++) g.caster.picks[t] = wt ? (t + (c.length % 2)) % 2 : null;
        g.caster.rebuild();
        window.__hits = {};
        if (!window.__hitHook) window.__hitHook = g.on('hit', e => { if (e.source === 'player') window.__hits[e.spell] = (window.__hits[e.spell] || 0) + e.amount; });
      }, c, withTalents);
      const res = {};
      for (let i = 0; i < 6; i++) {
        const r = await page.evaluate(i => {
          const g = window.__game, p = g.player, f = g.facing();
          g.stats.mana = g.stats.maxMana;
          for (const s of g.caster.spells) s.readyAt = 0;
          // a dummy mob 6 m ahead (removed again after the cast resolves)
          const z = g.groundAt(p.x + f.x * 6, p.y + f.y * 6, p.z + 2) ?? p.z;
          const ms = g.mobSystem;
          let m;
          if (ms) { m = ms.spawn(g.mobTypes[0].id, p.x + f.x * 6, p.y + f.y * 6, z); }
          else { m = { id: 'dummy' + i, type: 'dummy', x: p.x + f.x * 6, y: p.y + f.y * 6, z, radius: 0.6, height: 1.8, dead: false }; g.mobs.push(m); }
          Object.assign(m, { hp: 1e6, maxHp: 1e6, xp: 0, stunUntil: 1e9 });
          window.__dummy = m;
          return { id: g.caster.spells[i].id, cast: g.caster.cast(i, m) };
        }, i);
        // wait for the cast to resolve: until its first hit lands (+0.3 s for follow-up ticks), at most 1.8 s
        for (let t = 0, hitAt = -1; t < 1800 && (hitAt < 0 || t - hitAt < 300); t += 100) {
          await sleep(100);
          if (hitAt < 0 && await page.evaluate(id => (window.__hits[id] || 0) > 0, r.id)) hitAt = t;
        }
        r.dmg = await page.evaluate(id => { const g = window.__game, m = window.__dummy; if (g.mobSystem) g.mobSystem.remove(m); else g.mobs.splice(g.mobs.indexOf(m), 1); return window.__hits[id] || 0; }, r.id);
        if (!r.cast) out.ok = false;
        res[r.id] = r;
      }
      (out.classes[c] ||= {})[withTalents ? 'talents' : 'spells'] = res;
    }
  }
  out.fps = await page.evaluate(() => new Promise(ok => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 30 && performance.now() - t0 < 20000) requestAnimationFrame(f); else ok(+(n * 1000 / (performance.now() - t0)).toFixed(1)); }; requestAnimationFrame(f); }));
  out.hudNodes = await page.evaluate(() => document.querySelectorAll('#game-hud *').length);
  // death + respawn
  out.respawn = await page.evaluate(async () => {
    const g = window.__game; g.invulnUntil = 0; g.shield = 0; g.damagePlayer(1e6, 'test');
    const shown = !document.querySelector('.gh-death').hidden;
    document.querySelector('.gh-death button').click();
    return { shown, hp: g.stats.hp };
  });
  await page.screenshot({ path: '/tmp/test_classes.png' });
} catch (e) { errors.push('test: ' + e.message); out.ok = false; }
finally { await browser.close(); server.close(); }
out.errors = [...new Set(errors)];
if (errors.length) out.ok = false;
console.log(JSON.stringify(out, null, 1));
process.exit(out.ok ? 0 : 1);
