#!/usr/bin/env node
// Combat-feel test (gameplay node, session 1): headless Chrome loads /?debug&nopick and runs a scripted fight against an
// animated statue next to Market Square, asserting that every feel feature is live (site/app/game/feel.js + existing):
//   third-person over-the-shoulder combat camera · soft lock-on (a cast aimed off-target still homes on the mob) ·
//   damage numbers · mob hit reaction (flinch + knockback) · hit-stop · camera shake scaled by damage · chain combo ·
//   readable wind-up telegraph · poise stagger that interrupts a wind-up · dodge with i-frames (evade, then vulnerable
//   again) · hard lock eases the view onto the target · exploration toggle (G) drops the game and returns to 1st person.
//   node scripts/test_feel.mjs [site_dir]
// Last line: {"ok": bool, "checks": {...}, ...}; exit code 1 on failure.
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
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, protocolTimeout: 0,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'],
  defaultViewport: { width: 960, height: 540 },
});
const WATCHDOG_S = +(process.env.WC_TEST_WATCHDOG_S || 900);
setTimeout(() => { console.log(JSON.stringify({ ok: false, error: `watchdog ${WATCHDOG_S} s` })); process.exit(1); }, WATCHDOG_S * 1000).unref();
const errors = [];
let out = { ok: false };
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/404|Failed to load resource/.test(t)) errors.push(t);
    if (m.type() === 'warning' && /\[(game|classes|feel)\]/.test(t)) errors.push(t);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug&nopick`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__walkReady === true', { timeout: 300000 });
  await page.waitForFunction('window.__game && window.__game.mobSystem && window.__game.feel && window.__game.caster', { timeout: 120000 });

  const res = await page.evaluate(async () => {
    const g = window.__game, P = window.__p, sys = g.mobSystem, F = g.feel, S = F.stats, c = {}, info = {};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // game-clock steps: a sim pump advances player + game at 20 Hz even when swiftshader renders slowly
    window.__simPump = setInterval(() => { for (let i = 0; i < 4; i++) { P.update(0.05); g.update(0.05); } }, 30);
    const until = async (cond, gameS, wallMs = 60000) => { const g0 = g.time, w0 = performance.now(); while (!cond() && g.time - g0 < gameS && performance.now() - w0 < wallMs) await sleep(30); return cond(); };
    const step = s => until(() => false, s);
    // quiet arena by the market
    sys.encountersEnabled = false;
    for (const m of [...g.mobs]) sys.remove(m);
    for (const s of sys.encounterState.values()) { s.active = false; s.mobs = []; }
    const e0 = g.encounters.find(e => e.id === 'market-north') || g.encounters[0];
    window.__player.teleport(e0.x, e0.y);
    await step(2.5);
    g.caster.setClass('pyromancer'); g.stats.level = Math.max(g.stats.level, 1); g.paused = false;

    // 1. combat camera
    const sh0 = S.shoulder; { const w0 = performance.now(); while (S.shoulder <= sh0 + 2 && performance.now() - w0 < 30000) await sleep(50); }   // render frames, not game time
    c.thirdPersonCamera = P.view === 3 && P.combatCam === true && S.shoulder > sh0;
    info.shoulderK = F.shoulderK;

    // 2. target: a statue ~7 m ahead; aim 0.2 rad off it
    const spot = sys.findSpot(P.x, P.y + 7, 6) || { x: P.x, y: P.y + 7, z: P.z };
    const mob = sys.spawn('statue', spot.x, spot.y, spot.z);
    mob.stunUntil = g.time + 1e4; mob.state = 'chase';
    const aimAt = (off = 0) => { P.yaw = Math.atan2(-(mob.x - P.x), mob.y - P.y) + off; P.pitch = -0.05; };
    aimAt(0.2);
    await step(0.5);
    let numsAtHit = 0, flinchAtHit = 0, kbAtHit = false;
    const offHit = g.on('hit', e => { if (e.target !== mob) return;
      numsAtHit = Math.max(numsAtHit, [...document.querySelectorAll('.gh-num')].filter(d => d.style.display !== 'none').length);
      flinchAtHit = Math.max(flinchAtHit, mob.flinch || 0); kbAtHit ||= !!mob.kb; });
    const castNow = (i = 0) => { const sp = g.caster.spells[i]; sp.readyAt = 0; g.stats.mana = g.stats.maxMana; return g.caster.cast(i); };
    const hp0 = mob.hp, lock0 = S.lockOns, hs0 = S.hitStops, shk0 = S.shakes;
    castNow(0);
    c.softLockOn = S.lockOns > lock0 && F.lastAuto === mob;
    c.lockedCastHits = await until(() => mob.hp < hp0, 3);
    c.damageNumbers = numsAtHit > 0;
    c.hitReaction = flinchAtHit > 0 && kbAtHit;
    // a heavy hit: hit-stop + bigger shake than a light one
    const tr0 = F.trauma; g.damageMob(mob, 30, { source: 'player', crit: true, type: 'fire' });
    c.hitStop = S.hitStops > hs0;
    c.cameraShake = S.shakes > shk0 && F.trauma > tr0;
    F.trauma = 0; g.damageMob(mob, 2, { source: 'player', crit: false }); const tLight = F.trauma;
    F.trauma = 0; g.damageMob(mob, 30, { source: 'player', crit: false }); const tHeavy = F.trauma;
    c.shakeScalesWithDamage = tHeavy > tLight * 1.5; info.trauma = [tLight, tHeavy];
    mob.hp = mob.maxHp;
    // 3. chain combo: four quick landed casts
    for (let i = 0; i < 4; i++) { aimAt(0.05); castNow(0); await step(0.45); }
    c.chainCombo = S.maxChain >= 3; info.maxChain = S.maxChain;
    offHit();

    // 4. telegraph -> poise stagger interrupts the wind-up
    mob.hp = mob.maxHp; mob.poise = 0; mob.poiseImmune = 0; mob.stunUntil = 0; g.stats.hp = g.stats.maxHp; g.invulnUntil = g.time + 1e4;
    for (const a of mob.type.attacks) mob.attackCd[a.name] = 0;
    mob.state = 'chase';
    const tel0 = S.telegraphs;
    await until(() => mob.state === 'windup' && mob.telegraph?.length > 0, 15);
    c.telegraph = mob.state === 'windup' && mob.telegraph?.length > 0 && S.telegraphs > tel0;
    info.windupAttack = mob.attack?.name;
    const st0 = S.staggers;
    g.damageMob(mob, mob.maxHp * 0.34, { source: 'player', crit: false, type: 'fire' });
    c.staggerInterrupt = S.staggers > st0 && mob.state === 'stagger' && !mob.telegraph && (S.interrupts || 0) > 0;
    await step(0.3);

    // 5. dodge i-frames: dash, an attack inside the window is evaded, then the player is vulnerable again
    g.invulnUntil = 0; g.shield = 0; g.stats.hp = g.stats.maxHp;
    P.dashCd = 0; P.wantDash = true;
    await until(() => F.dodgeUntil > g.time, 1);
    const ev0 = S.evaded, dIn = g.damagePlayer(20, mob);
    c.dodgeIFrames = S.dodges > 0 && dIn === 0 && S.evaded > ev0;
    await step(0.5);
    g.invulnUntil = 0;
    const dOut = g.damagePlayer(5, mob);
    c.vulnerableAfterDodge = dOut > 0; info.dodge = [dIn, dOut];
    g.stats.hp = g.stats.maxHp; g.invulnUntil = g.time + 1e4;

    // 6. hard lock eases the view onto the target
    mob.stunUntil = g.time + 1e4;
    aimAt(0.05); F.toggleLock();
    const locked = F.lock === mob;
    P.yaw += 0.9; await step(1.2);
    const want = Math.atan2(-(mob.x - P.x), mob.y - P.y), err = Math.abs(Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw)));
    c.hardLock = locked && err < 0.15; info.lockErr = +err.toFixed(3);
    if (F.lock) F.toggleLock();

    // 7. kill: reticle clears
    g.damageMob(mob, 1e5, { source: 'player', crit: false });
    await step(0.6);
    c.killClearsTarget = !F.soft || !!F.soft.dead;
    clearInterval(window.__simPump);
    return { c, info, stats: { ...S } };
  });
  // 8. exploration toggle: G drops the game layer and the camera returns to first person; G again brings it back
  await page.keyboard.press('KeyG');
  await page.waitForFunction('window.__explore === true && !window.__game', { timeout: 30000 }).catch(() => {});
  const explore = await page.evaluate(() => ({ off: window.__explore === true && !window.__game, view: window.__p.view, hud: !document.querySelector('.gf-chain') }));
  res.c.explorationMode = explore.off && explore.view === 1 && explore.hud;
  await page.keyboard.press('KeyG');
  await page.waitForFunction('window.__game && window.__game.feel', { timeout: 60000 }).catch(() => {});
  res.c.gameResumes = await page.evaluate(() => !!(window.__game?.feel) && window.__p.view === 3);
  const failed = Object.entries(res.c).filter(([, v]) => !v).map(([k]) => k);
  out = { ok: failed.length === 0 && errors.length === 0, passed: Object.values(res.c).filter(Boolean).length, of: Object.keys(res.c).length,
    failed, checks: res.c, info: res.info, stats: res.stats, console_errors: errors.length, errors: errors.slice(0, 5) };
} catch (e) { out.error = String(e); out.errors = errors.slice(0, 5); }
finally { await browser.close(); server.close(); }
console.log(JSON.stringify(out));
process.exit(out.ok ? 0 : 1);
