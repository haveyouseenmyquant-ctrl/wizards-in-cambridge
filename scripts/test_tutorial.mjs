#!/usr/bin/env node
// QA a328 (issue is-20261110-192341-intr): a new player is not attacked during the tutorial. For every class: a fresh
// browser profile (empty localStorage), /?debug&q=low WITHOUT ?tutorial=0 / nopick / explore, the class is picked by
// clicking its card in the class picker, and the bot plays each step of window.WIC.tutorial with real key presses
// (E, W, arrows, Space, Shift, Q, B, 1-6), falling back to the game API (teleport, equip, yaw) and only then to
// tutorial.next(). Checked on every frame while tutorial.active: no 'playerHit' with damage and HP never drops; no mob
// within 20 m before the first_mob step and no other mob within 20 m from it on; first_mob has exactly one live mob (a
// wisp). Then: the tutorial completes in step order without a forced step (a forced step = soft-lock), the done flag is
// stored, encounters come back, a reload skips it, and no page errors.
// node scripts/test_tutorial.mjs [site_dir] [cls,cls...]   last stdout line: JSON {tutorial_pass, reason, classes:{...}}
// Defaults to windowed GPU Chrome (WIC_TEST_GPU=1, as in wic_gate.py); WIC_TEST_GPU=0 = headless SwiftShader.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
process.env.WIC_TEST_GPU ??= '1';
const { wicLaunch } = await import('./lib/wic_launch.mjs');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'site')), ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LOAD_MS = 1000 * +(process.env.WIC_LOAD_TIMEOUT_S || 180);
const STEPS = ['intro', 'move', 'look', 'jump', 'run', 'dash', 'broom', 'cast', 'first_mob', 'loot', 'equip', 'quest_log'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ktx2': 'image/ktx2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, path.normalize(p));
  if (!f.startsWith(SRC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const URL0 = `http://127.0.0.1:${server.address().port}/?debug${process.env.WIC_TEST_QUERY || '&q=low'}`;
const out = { tutorial_pass: false, reason: '', url: URL0.replace(/^http:\/\/[^/]+/, ''), classes: {} };
const finish = code => { console.log(JSON.stringify(out)); process.exit(code); };
setTimeout(() => { out.reason = out.reason || 'harness: watchdog'; finish(1); }, 1000 * +(process.env.WIC_TUTORIAL_TEST_S || 900)).unref();
const sleep = ms => new Promise(z => setTimeout(z, ms));
const t0 = Date.now();
let browser;
try {
  browser = await puppeteer.launch(wicLaunch({ executablePath: CHROME, headless: true, protocolTimeout: 0,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'], defaultViewport: { width: 960, height: 540 } }));
  let classIds = null;
  for (let k = 0; ; k++) {
    if (classIds && k >= classIds.length) break;
    const ctx = await browser.createBrowserContext(), page = await ctx.newPage(), errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); }); page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    const r = { pass: false, steps: [], how: {}, hits: 0, hpDrop: false, nearEarly: 0, nearOther: 0, firstMob: null, errors };
    try {
      await page.goto(URL0, { waitUntil: 'domcontentloaded', timeout: LOAD_MS });
      await page.waitForFunction('window.__walkReady === true && window.__game?.caster && document.querySelector(".gh-card")', { timeout: LOAD_MS });
      if (!classIds) classIds = await page.evaluate(() => Object.keys(window.__game.caster.classes));
      const cls = classIds[k]; out.classes[cls] = r;
      if (ONLY && !ONLY.includes(cls)) { delete out.classes[cls]; await ctx.close(); continue; }
      r.storageEmpty = await page.evaluate(() => !localStorage.getItem('wic_tutorial_done'));
      const cards = await page.$$('.gh-card'); await cards[k].click();
      const hasT = await page.waitForFunction('window.WIC?.tutorial?.active === true', { timeout: 20000 }).then(() => true, () => false);
      if (!hasT) { r.reason = await page.evaluate(() => window.WIC?.tutorial ? `tutorial not started (done=${window.WIC.tutorial.done})` : 'no window.WIC.tutorial'); continue; }
      // per-frame watcher, registered as a game system so it sees every update
      await page.evaluate(() => {
        const g = window.__game, T = window.WIC.tutorial, w = window.__tw = { hits: 0, hpDrop: false, nearEarly: 0, nearOther: 0, fmMax: 0, fmTypes: [], firstNear: null };
        g.on('playerHit', e => { if (T.active && e.amount > 0) w.hits++; });
        let hp0 = g.stats.hp;
        g.add({ update() {
          if (!T.active) return;
          if (g.stats.hp < hp0 - 1e-6 && g.stats.hp < g.stats.maxHp - 1e-6) {   // (a clamp to a lower maxHp after an equip is not damage)
             w.hpDrop = true; (w.drops ||= []).length < 5 && w.drops.push({ step: T.step, from: +hp0.toFixed(1), to: +g.stats.hp.toFixed(1), max: g.stats.maxHp }); } hp0 = g.stats.hp;
          const early = T.steps.indexOf(T.step) < T.steps.indexOf('first_mob');
          const live = g.mobs.filter(m => !m.dead && !m.removed);
          for (const m of live) if (Math.hypot(m.x - g.px, m.y - g.py) < 20 && (early || !m.tutorialMob)) {
            if (early) w.nearEarly++; else w.nearOther++; w.firstNear ??= `${m.type?.id || m.typeId}@${T.step}`; }
          if (T.step === 'first_mob') { w.fmMax = Math.max(w.fmMax, live.length); for (const m of live) if (!w.fmTypes.includes(m.type?.id || m.typeId)) w.fmTypes.push(m.type?.id || m.typeId); }
        } });
      });
      const T = expr => page.evaluate(expr);
      const step = () => T('window.WIC.tutorial.step');
      const waitStep = async (id, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await step() !== id) return true; await sleep(100); } return false; };
      const talk = async id => { for (let i = 0; i < 12 && await step() === id && !(await T('window.WIC.tutorial.lineIndex >= window.WIC.tutorial.lines.length - 1')); i++) { await page.keyboard.press('KeyE'); await sleep(120); } };
      const hold = async (keys, ms) => { for (const c of keys) await page.keyboard.down(c); await sleep(ms); for (const c of [...keys].reverse()) await page.keyboard.up(c); };
      for (let guard = 0; guard < 16; guard++) {
        const id = await step();
        if (!(await T('window.WIC.tutorial.active'))) break;
        r.steps.push(id); await talk(id); let how = 'input';
        if (id === 'intro' || id === 'quest_log') { for (let i = 0; i < 4 && await step() === id; i++) { await page.keyboard.press('KeyE'); await sleep(250); } }
        else if (id === 'move') await hold(['KeyW'], 4000);
        else if (id === 'look') { await hold(['ArrowLeft'], 1500);
          if (!(await waitStep(id, 500))) { how = 'api'; await T('(async () => { const p = window.__game.player; for (let i = 0; i < 20; i++) { p.yaw += 0.1; await new Promise(z => setTimeout(z, 50)); } })()'); } }
        else if (id === 'jump') await page.keyboard.press('Space');
        else if (id === 'run') await hold(['ShiftLeft', 'KeyW'], 2000);
        else if (id === 'dash') { await page.keyboard.down('KeyW'); await sleep(200); await page.keyboard.press('KeyQ'); await sleep(300); await page.keyboard.up('KeyW'); }
        else if (id === 'broom') { await page.keyboard.press('KeyB'); await sleep(600); }
        else if (id === 'cast') { if (await T('window.__game.player.mode === "broom"')) { await page.keyboard.press('KeyB'); await sleep(400); }
          const n = await T('window.__game.caster.spells.length');
          for (let i = 0; i < n && await step() === id; i++) { await page.keyboard.press(`Digit${i + 1}`); await sleep(800); }
          if (await step() === id) { how = 'api'; await T('(async () => { const c = window.__game.caster; for (let i = 0; i < c.spells.length; i++) { c.cast(i, null); await new Promise(z => setTimeout(z, 700)); } })()'); } }
        else if (id === 'first_mob') {
          await T('new Promise(ok => { const t = Date.now(), f = () => (window.__game.mobs.some(m => m.tutorialMob && !m.dead) || Date.now() - t > 8000) ? ok() : setTimeout(f, 100); f(); })');
          r.firstMobHp = await T('window.__game.mobs.find(m => m.tutorialMob && !m.dead)?.maxHp ?? null');
          await sleep(4000);   // let the wisp close in and attack: no damage expected
          // face the wisp and cast slot 1 (the class's basic attack) until it falls
          for (let i = 0; i < 40 && await step() === id; i++) {
            await T('(() => { const g = window.__game, w = g.mobs.find(m => m.tutorialMob && !m.dead); if (w) g.player.yaw = Math.atan2(-(w.x - g.px), w.y - g.py); })()');
            await page.keyboard.press('Digit1'); await sleep(400);
          }
          if (await step() === id) { how = 'api'; await T('(() => { const g = window.__game, w = g.mobs.find(m => m.tutorialMob && !m.dead); for (let i = 0; w && !w.dead && i < 50; i++) g.damageMob(w, 10, { source: "test" }); })()'); }
        } else if (id === 'loot') {   // walk to the drop (aim with the API, move with W), else teleport onto it
          const aim = '(() => { const g = window.__game, d = g.items.drops?.[0]; if (!d) return -1; g.player.yaw = Math.atan2(-(d.x - g.px), d.y - g.py); return Math.hypot(d.x - g.px, d.y - g.py); })()';
          r.lootDist0 = Math.round(await T(aim));
          for (let i = 0; i < 30 && await step() === id; i++) { if (await T(aim) < 0) break; await hold(['KeyW'], 250); }
          if (await step() === id) { how = 'api'; await T('(() => { const d = window.__game.items.drops?.[0]; if (d) window.__player.teleport(d.x, d.y, d.z); })()'); } }
        else if (id === 'equip') { how = 'api';
          await T('(() => { const it = window.__game.items, d = it.inventory.find(k => !it.defs[k].starter && it.equipped?.[it.defs[k].slot] !== k); if (d) it.equip(d); })()'); }
        if (!(await waitStep(id, 6000))) { await talk(id); if (await waitStep(id, 2000) === false) { how = 'forced'; await T('window.WIC.tutorial.next()'); await waitStep(id, 2000); } }
        r.how[id] = how;
      }
      Object.assign(r, await T('({ ...window.__tw, done: window.WIC.tutorial.done, active: window.WIC.tutorial.active, skipped: !!window.WIC.tutorial.skipped, flag: localStorage.getItem("wic_tutorial_done") })'));
      r.firstMob = { max: r.fmMax, types: r.fmTypes }; delete r.fmMax; delete r.fmTypes;
      await sleep(3000); r.encountersOn = await T('window.__game.mobSystem?.encountersEnabled !== false');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: LOAD_MS });
      await page.waitForFunction('window.__walkReady === true && window.WIC?.tutorial', { timeout: LOAD_MS });
      await sleep(1500); r.reloadSkips = await T('!window.WIC.tutorial.active && window.WIC.tutorial.done');
      const forced = Object.entries(r.how).filter(([, h]) => h === 'forced').map(([s]) => s);
      const why = [];
      if (JSON.stringify(r.steps) !== JSON.stringify(STEPS)) why.push(`steps ${r.steps.join(',')}`);
      if (forced.length) why.push(`soft-lock (forced) at ${forced.join(',')}`);
      if (!r.done || r.active || r.skipped) why.push('not completed');
      if (r.flag !== '1') why.push('done flag not stored');
      if (r.hits || r.hpDrop) why.push(`player damaged during tutorial (hits ${r.hits})`);
      if (r.nearEarly) why.push(`mob within 20 m before first_mob (${r.firstNear})`);
      if (r.nearOther) why.push(`other mob within 20 m during first_mob+ (${r.firstNear})`);
      if (r.firstMob.max !== 1) why.push(`first_mob had ${r.firstMob.max} live mobs`);
      if (r.firstMob.types.some(t => t !== 'wisp')) why.push(`first_mob types ${r.firstMob.types}`);
      if (!r.encountersOn) why.push('encounters not re-enabled');
      if (!r.reloadSkips) why.push('reload did not skip the tutorial');
      if (errors.length) why.push(`console errors: ${errors[0]}`);
      r.reason = why.join('; '); r.pass = !why.length;
    } catch (e) { r.reason = `harness: ${String(e).slice(0, 200)}`; if (!classIds) { out.reason = r.reason; break; } }
    finally { await ctx.close().catch(() => {}); }
  }
  const cs = Object.entries(out.classes);
  out.tutorial_pass = cs.length > 0 && cs.every(([, r]) => r.pass);
  out.reason = out.reason || cs.filter(([, r]) => !r.pass).map(([c, r]) => `${c}: ${r.reason}`).join(' | ');
} catch (e) { out.reason = `harness: ${String(e).slice(0, 200)}`; }
out.secs = Math.round((Date.now() - t0) / 1000);
await browser?.close().catch(() => {}); server.close();
finish(out.tutorial_pass ? 0 : out.reason.startsWith('harness') ? 1 : 2);
