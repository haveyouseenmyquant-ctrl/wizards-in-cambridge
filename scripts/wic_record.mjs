#!/usr/bin/env node
// Fixed scripted recordings of one build for the blind judge (judged_game_quality, docs/RUBRIC.md).
// Scenes, all at 960x540, seeded Math.random, game clock stepped from page.evaluate (no wall-clock dependence):
//   explore  ?explore (no mobs, no HUD): 4 fixed spots, each a first-person and a third-person frame after 1.2 s of
//            scripted walking along a fixed yaw
//   menus    a fresh save: class selection screen, then the HUD after picking the first class, inventory (I), talents (T)
//   story    if the build exposes window.__wicStory (contract for the Story team: async (step) => caption|null, called
//            for step = 0, 1, ... up to 8 times, one frame after each call, null ends the scene) its frames; otherwise
//            the frames right after the class pick (start-of-game toast) and the spawn view, labelled as such
//   combat   scripts/gameplay_clip.mjs (one 60 s scripted fight per class, 12 frames each), run as a child process
//   node scripts/wic_record.mjs [site_dir] [out_dir] [--skip-combat]
// Writes <out_dir>/<scene>/*.jpg and <out_dir>/manifest.json {scenes: {name: {desc, frames: [{file, label}]}}, errors}.
// Exit 1 on a harness failure (browser crash, timeout), so service.sh can count harness flakes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const argv = process.argv.slice(2).filter(a => !a.startsWith('--'));
const SRC = path.resolve(argv[0] || path.join(ROOT, 'site'));
const OUT = path.resolve(argv[1] || '/tmp/wic_record');
const SKIP_COMBAT = process.argv.includes('--skip-combat');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const T0 = Date.now();
const log = (...a) => console.error(`[record ${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);
// fixed exploration spots (collision frame, m) and walking yaw (rad): Market Hill, Peas Hill, King's Parade, Senate House Hill
const SPOTS = [
  { name: 'Market Hill', x: -108.1, y: 93.97, yaw: Math.PI },
  { name: 'Peas Hill', x: -122, y: -20, yaw: 2.6 },
  { name: "King's Parade", x: -190, y: 5, yaw: 2.89 },
  { name: 'Senate House Hill', x: -182, y: 68, yaw: 3.01 },
];

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, path.normalize(p));
  if (!f.startsWith(SRC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, protocolTimeout: 600000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'],
  defaultViewport: { width: 960, height: 540 },
});

// runs before any page script: seeded Math.random + a rAF gate (__rafHold / __rafFrame) as in gameplay_clip.mjs
function preload(seed) {
  let s = seed >>> 0;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const raf = window.requestAnimationFrame.bind(window);
  let queue = [];
  window.__rafHold = false;
  window.requestAnimationFrame = cb => { if (!window.__rafHold) return raf(cb); queue.push(cb); return -queue.length; };
  window.__rafFrame = () => new Promise(done => { const q = queue; queue = []; raf(t => { for (const cb of q) { try { cb(t); } catch (e) { console.error(e); } } done(); }); });
}

const manifest = { site: SRC, scenes: {}, errors: [] };
fs.mkdirSync(OUT, { recursive: true });

async function openPage(query, seed) {
  const ctx = await browser.createBrowserContext();   // fresh localStorage
  const page = await ctx.newPage();
  page.on('pageerror', e => manifest.errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/404|Failed to load resource/.test(t)) manifest.errors.push(t); });
  await page.evaluateOnNewDocument(preload, seed);
  await page.goto(BASE + query, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__walkReady === true', { timeout: 180000 });
  return { ctx, page };
}
async function settle(page) {
  await page.waitForFunction('!window.__player.pendingPlace && window.__player.settled(160)', { timeout: 180000, polling: 500 });
  await new Promise(r => setTimeout(r, 1500));
}
async function shot(page, scene, name, label) {
  const dir = path.join(OUT, scene); fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => window.__rafHold ? window.__rafFrame() : new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: path.join(dir, name), type: 'jpeg', quality: 85 });
  (manifest.scenes[scene].frames ||= []).push({ file: `${scene}/${name}`, label });
  log(scene, name, label);
}
// step the player (and the game when present) by `secs` of game time at 20 Hz while holding `keys`
const step = (page, secs, keys = []) => page.evaluate(([secs, keys]) => {
  const P = window.__p; for (const k of keys) P.keys.add(k);
  for (let t = 0; t < secs; t += 0.05) { window.__stepping = true; P.update(0.05); window.__stepping = false; if (window.__gameUpdate) window.__gameUpdate(0.05); }
  for (const k of keys) P.keys.delete(k);
}, [secs, keys]);
// gate the render loop's own player/game clock so only step() advances time
const gate = page => page.evaluate(() => {
  const P = window.__p, pu = P.update.bind(P);
  P.update = dt => { if (window.__stepping) pu(dt); };
  const g = window.__game;
  if (g) { window.__gameUpdate = g.update.bind(g); g.update = () => {}; }
});

async function sceneExplore() {
  manifest.scenes.explore = { desc: 'Exploration mode (no enemies, no HUD by design): the player walks through four fixed spots of the city; first-person and third-person views', frames: [] };
  const { ctx, page } = await openPage('?explore&debug', 1);
  for (const [i, s] of SPOTS.entries()) {
    await page.evaluate(([x, y]) => window.__player.teleport(x, y), [s.x, s.y]);
    await settle(page);
    await page.evaluate(() => { window.__rafHold = true; });
    await gate(page);
    // keep the fixed yaw if it has >= 20 m of walkable ground ahead, else the nearest direction that does (so a new
    // wall or a shifted spawn does not turn the frame into a close-up of masonry); the yaw used goes in the label
    const yaw = await page.evaluate(pref => {
      const P = window.__p, W = window.__world, free = a => { let z = P.z, d = 0;
        for (; d < 40; d += 1) { const nz = W.standAt(P.x - Math.sin(a) * (d + 1), P.y + Math.cos(a) * (d + 1), z); if (nz == null) break; z = nz; }
        // and nothing rendered (facades without collision, screens, railings) within 20 m at eye height
        const T = window.__THREE, rc = new T.Raycaster(new T.Vector3(P.x, P.z + 1.65, -P.y), new T.Vector3(-Math.sin(a), 0, -Math.cos(a)), 0.3, 20);
        const hit = rc.intersectObjects(window.__scene.children, true).find(h => h.object.visible !== false && !h.object.isSprite);
        return hit ? Math.min(d, hit.distance) : d; };
      for (let k = 0; k <= 16; k++) for (const sgn of [1, -1]) { const a = pref + sgn * k * Math.PI / 16; if (free(a) >= 20) return a; }
      return pref;
    }, s.yaw);
    if (Math.abs(yaw - s.yaw) > 1e-6) manifest.errors.push(`note: explore ${s.name} yaw ${s.yaw} blocked, used ${yaw.toFixed(2)}`);
    for (const view of [1, 3]) {
      await page.evaluate(([yaw, view]) => { const P = window.__p; P.view = view; P.yaw = yaw; P.pitch = view === 3 ? -0.15 : 0; }, [yaw, view]);
      await step(page, 1.2, ['KeyW']);
      await shot(page, 'explore', `spot${i + 1}_${view === 1 ? 'fp' : 'tp'}.jpg`, `${s.name}, ${view === 1 ? 'first person' : 'third person'}, walking`);
    }
    await page.evaluate(() => { const P = window.__p; delete P.update; window.__rafHold = false; window.__rafFrame(); });
  }
  await ctx.close();
}

async function sceneMenusStory() {
  manifest.scenes.menus = { desc: 'Menus and HUD on a fresh save: class selection, the in-game HUD, inventory and talent screens', frames: [] };
  manifest.scenes.story = { desc: '', frames: [] };
  const { ctx, page } = await openPage('?debug', 2);
  await page.waitForFunction('window.__game && window.__game.caster && window.__game.hud', { timeout: 120000 });
  // the class picker opens on the game's 'ready' event (paused game), so wait for it before gating the clock
  // (game bug seen 2026-11-10: classes.js stores a default class before 'ready', so a new game never opens the picker;
  // then the recorder opens it through game.hud.openPick() and logs the bug)
  if (!await page.waitForSelector('.gh-card', { visible: true, timeout: 20000 }).catch(() => null)) {
    manifest.errors.push('game: a new game did not open the class selection screen');
    await page.evaluate(() => { delete window.__game.save.cls; window.__game.hud.openPick(); });
  }
  await settle(page);
  await gate(page);
  await page.evaluate(() => { window.__rafHold = true; });
  await shot(page, 'menus', 'pick.jpg', 'class selection screen on a new game');
  const card = await page.$('.gh-card');
  if (card) await page.evaluate(el => el.click(), card);
  else await page.evaluate(() => { const g = window.__game, c = Object.keys(g.caster.classes)[0]; g.caster.setClass(c); g.save.cls = c; g.persist(); g.paused = false; });
  await step(page, 0.5);
  const hasStory = await page.evaluate(() => typeof window.__wicStory === 'function');
  if (hasStory) {
    manifest.scenes.story.desc = 'The game\'s scripted story / dialogue scene, one frame per step';
    for (let k = 0; k < 8; k++) {
      const cap = await page.evaluate(k => window.__wicStory(k), k);
      if (cap == null) break;
      await shot(page, 'story', `step${k + 1}.jpg`, String(cap));
    }
  } else {
    manifest.scenes.story.desc = 'The build has no scripted story scene; these are the frames right after starting a new game';
    await shot(page, 'story', 'start.jpg', 'immediately after choosing a class on a new game');
    await step(page, 3);
    await shot(page, 'story', 'start_3s.jpg', '3 s after the start of a new game, at the spawn point');
  }
  await shot(page, 'menus', 'hud.jpg', 'in-game HUD at the spawn point');
  await page.keyboard.press('KeyI'); await step(page, 0.1);
  await shot(page, 'menus', 'inventory.jpg', 'inventory screen (I)');
  await page.keyboard.press('KeyI'); await page.keyboard.press('KeyT'); await step(page, 0.1);
  await shot(page, 'menus', 'talents.jpg', 'talent screen (T)');
  await ctx.close();
}

let harnessFail = false;
for (const [name, fn] of [['explore', sceneExplore], ['menus+story', sceneMenusStory]]) {
  try { await fn(); } catch (e) { harnessFail = true; manifest.errors.push(`harness ${name}: ${e.message}`); log(name, 'harness error', e.message); }
}
await browser.close(); server.close();

if (!SKIP_COMBAT) {
  const dir = path.join(OUT, 'combat');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/gameplay_clip.mjs'), SRC, dir], { stdio: ['ignore', 'pipe', 'inherit'], timeout: 3600000 });
  if (r.status !== 0) { harnessFail = true; manifest.errors.push(`harness combat: gameplay_clip exit ${r.status}`); }
}
const cdir = path.join(OUT, 'combat');
if (fs.existsSync(cdir)) for (const cls of fs.readdirSync(cdir).sort()) {
  const ev = path.join(cdir, cls, 'events.json');
  if (!fs.existsSync(ev)) continue;
  const e = JSON.parse(fs.readFileSync(ev));
  manifest.scenes[`combat_${cls}`] = {
    desc: `Scripted 60 s fight as the ${cls} class (third-person combat camera), frames evenly spaced in time`, events: `combat/${cls}/events.json`,
    frames: e.frames.map(f => ({ file: `combat/${cls}/${f.file}`, label: `t = ${f.t} s` })),
  };
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(JSON.stringify({ out: OUT, wall_s: +((Date.now() - T0) / 1000).toFixed(0), scenes: Object.fromEntries(Object.entries(manifest.scenes).map(([k, v]) => [k, v.frames.length])), errors: manifest.errors.length, harness_fail: harnessFail }));
process.exit(harnessFail ? 1 : 0);
