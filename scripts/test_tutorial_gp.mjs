#!/usr/bin/env node
// Gameplay smoke test for site/app/game/tutorial.js (f917): fresh profile, NO ?tutorial=0. Drives every step through
// window.WIC.tutorial (+ real casts / kill / equip), asserts no player damage and no non-tutorial mob within 20 m while
// active, exactly one mob in first_mob, completion + localStorage flag, and that a reload skips it.
// node scripts/test_tutorial_gp.mjs [site_dir] [class]   last stdout line: JSON {tutorial_gp_pass,...}
import { wicLaunch } from './lib/wic_launch.mjs';
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
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=480,270'], defaultViewport: { width: 480, height: 270 } }));
setTimeout(() => { console.log(JSON.stringify({ tutorial_gp_pass: false, error: 'watchdog' })); process.exit(1); }, 240000).unref();
const errors = []; let out = { tutorial_gp_pass: false };
try {
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(String(e)));
  await page.evaluateOnNewDocument(cls => { if (!localStorage.getItem('walkable-cambridge-save-v1')) localStorage.setItem('walkable-cambridge-save-v1', JSON.stringify({ cls })); }, CLS);
  const URL0 = `http://127.0.0.1:${server.address().port}/?debug&q=low`;
  await page.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__walkReady === true && window.WIC?.tutorial?.active', { timeout: 180000 });
  out = await page.evaluate(async () => {
    const g = window.__game, T = window.WIC.tutorial, P = window.__p, r = { steps: [], hpDrop: false, nearMob: 0, firstMobCount: null, dmgBlocked: null };
    const watch = () => { if (!T.active) return; if (g.stats.hp < g.stats.maxHp - 1e-6) r.hpDrop = true;
      for (const m of g.mobs) if (!m.dead && !m.tutorialMob && Math.hypot(m.x - g.px, m.y - g.py) < 20) r.nearMob++; };
    const pump = (n = 10) => { for (let i = 0; i < n; i++) { P?.update?.(0.05); g.update(0.05); watch(); } };
    const wait = async (fn, s = 20) => { const t0 = g.time; while (!fn() && g.time - t0 < s) { pump(); await new Promise(z => setTimeout(z, 20)); } return fn(); };
    g.mobSystem.spawn('statue', g.px + 3, g.py, null);   // a stray spawn must be blocked
    r.dmgBlocked = g.damagePlayer(50, 'test') === 0;
    for (let guard = 0; guard < 20 && T.active; guard++) {
      const id = T.step; r.steps.push(id);
      if (id === 'cast') { for (let i = 0; i < g.caster.spells.length; i++) { g.caster.cast(i, null); pump(14); } }
      else if (id === 'first_mob') {
        await wait(() => g.mobs.some(m => m.tutorialMob && !m.dead));
        r.firstMobCount = g.mobs.filter(m => !m.dead).length;
        const w = g.mobs.find(m => m.tutorialMob); pump(60);   // let it attack (no damage expected)
        while (w && !w.dead) { g.damageMob(w, 10, { source: 'test' }); pump(2); }
      } else if (id === 'equip') { const it = g.items, d = it.inventory.find(k => !it.defs[k].starter); if (d) it.equip(d); else T.next(); }
      else if (id === 'loot') { const pk = g.items.drops[0]; if (pk) window.__player.teleport(pk.x, pk.y); await wait(() => T.step !== 'loot', 6); if (T.step === 'loot') T.next(); }
      else T.next();
      while (T.active && T.step === id && T.lineIndex < T.lines.length) T.advance();
      await wait(() => T.step !== id, 8);
      if (T.step === id) { r.stuck = id; T.next(); }
    }
    r.done = T.done && !T.active; r.flag = localStorage.getItem('wic_tutorial_done');
    pump(40); r.encountersOn = g.mobSystem.encountersEnabled;
    return r;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__walkReady === true && window.WIC?.tutorial', { timeout: 180000 });
  out.reloadSkips = await page.evaluate(() => !window.WIC.tutorial.active && window.WIC.tutorial.done);
  const STEPS = ['intro', 'move', 'look', 'jump', 'run', 'dash', 'broom', 'cast', 'first_mob', 'loot', 'equip', 'quest_log'];
  out.errors = errors.slice(0, 5);
  out.tutorial_gp_pass = out.done && out.flag === '1' && !out.hpDrop && out.nearMob === 0 && out.firstMobCount === 1 && out.dmgBlocked
    && out.reloadSkips && JSON.stringify(out.steps) === JSON.stringify(STEPS) && !errors.length;
} catch (e) { out.error = String(e); out.errors = errors.slice(0, 5); }
console.log(JSON.stringify(out));
await browser.close(); server.close(); process.exit(out.tutorial_gp_pass ? 0 : 1);
