#!/usr/bin/env node
// In-browser audio test (audio node, session 1): loads the real game (/?debug&nopick) in Chrome with a running
// AudioContext and proves that every docs/audio_checklist.md item really plays, by counting WebAudio source starts per
// item (window.__audio.counts, incremented at each OscillatorNode / AudioBufferSourceNode start()):
//   spells: cast every spell of every class through game.caster.cast -> 'sfx.<recipe>' starts
//   mobs: spawn each type, begin an attack, hit it, kill it -> 'sfx.mob_<type>_attack|hit|death' starts
//   footsteps: stand on a triangle of each collision surface class and walk 3 m with the real player -> 'foot.<surface>'
//   ambience / bells: tick the world audio at the market, on Clare Bridge, and across a quarter-hour on a test clock
//   music: per area explore + combat (a chasing mob), per boss -> 'music.<state>.<area|boss>' and the music state
//   settings: volume applies + persists; mute starts nothing; exploration mode (G) keeps footsteps/ambience, no music
//   node scripts/test_audio.mjs [site_dir]
// Last stdout line: {"audio_coverage_pct", "items", "verified", "failed": [...], ...}; also written to
// data/benchmark/scores/<build_hash>_audio.json. Exit 1 if any [x] item failed verification.
import { wicLaunch } from './lib/wic_launch.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const puppeteer = createRequire(path.join(ROOT, 'tools/'))('puppeteer-core');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'site'));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const T0 = Date.now();
const log = (...a) => console.error(`[test_audio ${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

// checklist items
const md = fs.readFileSync(path.join(ROOT, 'docs/audio_checklist.md'), 'utf8');
const ITEMS = [...md.matchAll(/^- \[( |x)\] `([^`]+)`/gm)].map(m => ({ id: m[2], done: m[1] === 'x' }));

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, path.normalize(p));
  if (!f.startsWith(SRC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const launch = wicLaunch({
  executablePath: CHROME, headless: true, protocolTimeout: 0,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'],
  defaultViewport: { width: 640, height: 360 },
});
launch.args = [...launch.args, '--autoplay-policy=no-user-gesture-required', '--mute-audio'];
const browser = await puppeteer.launch(launch);
const WATCHDOG_S = +(process.env.WC_TEST_WATCHDOG_S || 600);
setTimeout(() => { console.log(JSON.stringify({ ok: false, audio_coverage_pct: 0, error: `watchdog ${WATCHDOG_S} s` })); process.exit(1); }, WATCHDOG_S * 1000).unref();
const errors = [];
let res = {}, info = {};
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/404|Failed to load resource/.test(t)) errors.push(t); if (m.type() === 'warning' && /\[(audio|game)\]/.test(t)) errors.push(t); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug&nopick&q=low${process.env.WIC_TEST_QUERY || ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__walkReady === true', { timeout: 300000 });
  await page.waitForFunction('window.__game && window.__game.mobSystem && window.__game.caster && window.__audioWorld', { timeout: 120000 });
  await page.keyboard.press('ShiftRight');   // a trusted gesture as well, for builds without the autoplay flag
  await page.waitForFunction('window.__audio.ctx.state === "running"', { timeout: 20000 });
  log('game ready');

  // shared in-page helpers
  await page.evaluate(() => {
    const H = window.__t = {};
    H.g = () => window.__game; H.P = window.__p; H.A = window.__audio; H.W = window.__audioWorld;
    H.cnt = k => H.A.counts[k] || 0;
    H.sum = pre => Object.entries(H.A.counts).filter(([k]) => k.startsWith(pre)).reduce((s, [, v]) => s + v, 0);
    H.sleep = ms => new Promise(r => setTimeout(r, ms));
    H.step = (n = 1, dt = 0.05) => { const g = H.g(); for (let i = 0; i < n; i++) { H.P.update(dt); if (g && !window.__explore) g.update(dt); H.W.update(dt); } };
    H.wtick = (n, dt = 0.1) => { for (let i = 0; i < n; i++) H.W.update(dt); };
    H.settle = async (wallMs = 60000) => { const w0 = performance.now(); while (!window.__player.settled(120) && performance.now() - w0 < wallMs) await H.sleep(100); };
    H.go = async (x, y, z) => { window.__player.teleport(x, y, z); await H.settle(); H.step(4); };
    H.quiet = () => { const g = H.g(), sys = g.mobSystem; sys.encountersEnabled = false; for (const m of [...g.mobs]) sys.remove(m); for (const s of sys.encounterState.values()) { s.active = false; s.mobs = []; } g.invulnUntil = 1e9; };
  });

  // ---- spells, ui
  res = await page.evaluate(async () => {
    const H = window.__t, g = H.g(), C = g.caster, r = {};
    H.quiet(); g.paused = false;
    await H.go(-110, 40);
    for (const cls of ['pyromancer', 'stormcaller', 'warden', 'hexweaver']) {
      C.setClass(cls); H.step(2);
      for (let i = 0; i < C.spells.length; i++) {
        const sp = C.spells[i]; g.stats.mana = g.stats.maxMana = 1000; sp.readyAt = 0; g.paused = false;
        const b = H.cnt('sfx.' + sp.sfx); C.cast(i); H.step(3);
        r[`spell.${cls}.${sp.id}`] = H.cnt('sfx.' + sp.sfx) > b;
      }
      H.step(40);
    }
    H.quiet();
    let b = H.cnt('sfx.levelup'); g.gainXp(g.xpToNext() + 1); H.step(2); r['ui.levelup'] = H.cnt('sfx.levelup') > b;
    g.invulnUntil = 0; g.shield = 0; b = H.cnt('sfx.hurt'); g.damagePlayer(3, null); H.step(2); r['ui.hurt'] = H.cnt('sfx.hurt') > b;
    g.stats.hp = g.stats.maxHp; g.invulnUntil = 1e9;
    return r;
  });
  log('spells', Object.values(res).filter(Boolean).length);

  // ---- mobs
  Object.assign(res, await page.evaluate(async () => {
    const H = window.__t, g = H.g(), sys = g.mobSystem, r = {};
    H.quiet(); H.step(300);   // let lingering spell zones from the spell phase expire
    for (const T of g.mobTypes) {
      const P = H.P, spot = sys.findSpot(P.x + 4, P.y, 6) || { x: P.x + 4, y: P.y, z: P.z };
      const m = sys.spawn(T.id, spot.x, spot.y, spot.z); m.stunUntil = g.time + 1e4;
      const k = s => H.cnt(`sfx.mob_${T.id}_${s}`);
      let b = k('attack'); sys.beginAttack(m, sys.attacksFor(m)[0]); H.step(3); r[`mob.${T.id}.attack`] = k('attack') > b;
      b = k('hit'); g.damageMob(m, 1, { type: 'physical' }); H.step(3); r[`mob.${T.id}.hit`] = k('hit') > b; if (!r[`mob.${T.id}.hit`]) r['_mob_' + T.id] = { d: Math.hypot(m.x - H.P.x, m.y - H.P.y), dead: m.dead, hp: m.hp, st: m.state, hit: H.cnt('sfx.hit_physical') };
      b = k('death'); g.damageMob(m, 1e7, { type: 'physical' }); H.step(3); r[`mob.${T.id}.death`] = k('death') > b;
      sys.remove(m); H.step(2);
    }
    return r;
  }));
  log('mobs done');

  // ---- music per area (explore, combat), bosses; ambience and footsteps at the same places
  const AREAS = { market: [-110, 40], river: [-441, 14], colleges: [278, -87] };
  for (const [area, [x, y]] of Object.entries(AREAS)) {
    Object.assign(res, await page.evaluate(async (area, x, y) => {
      const H = window.__t, g = H.g(), sys = g.mobSystem, MU = window.__audioMusic, r = {}, inf = {};
      H.quiet(); await H.go(x, y); H.wtick(60);
      let b = H.cnt('music.explore.' + area); H.wtick(3);
      inf.state = MU.state(); inf.water = H.W.S.water;
      r['music.explore.' + area] = MU.state() === 'explore.' + area && H.cnt('music.explore.' + area) > 0;
      const spot = sys.findSpot(H.P.x + 5, H.P.y, 8) || { x: H.P.x + 5, y: H.P.y, z: H.P.z };
      const m = sys.spawn('statue', spot.x, spot.y, spot.z); m.stunUntil = g.time + 1e4; m.state = 'chase';
      b = H.cnt('music.combat.' + area); H.wtick(3);
      r['music.combat.' + area] = MU.state() === 'combat.' + area && H.cnt('music.combat.' + area) > b;
      sys.remove(m); H.wtick(60);   // combat hold runs out
      inf.after = MU.state();
      // ambience deltas here
      const a0 = { market: H.cnt('amb.market'), river: H.cnt('amb.river'), birds: H.cnt('amb.birds'), bikes: H.cnt('amb.bikes') };
      H.wtick(400);
      for (const k of Object.keys(a0)) inf['amb_' + k] = H.cnt('amb.' + k) - a0[k];
      if (area === 'market') { r['amb.market'] = inf.amb_market > 0; r['amb.birds'] = inf.amb_birds > 0; r['amb.bikes'] = inf.amb_bikes > 0;
        r['amb.city'] = H.cnt('amb.city') > 0 && H.W.S.beds.city.gain.gain.value > 0; }
      if (area === 'river') r['amb.river'] = inf.amb_river > 0;
      return { ...r, ['_info_' + area]: inf };
    }, area, x, y));
    log('area', area);
  }
  Object.assign(res, await page.evaluate(async () => {
    const H = window.__t, g = H.g(), sys = g.mobSystem, MU = window.__audioMusic, r = {};
    H.quiet(); await H.go(-110, 40);
    for (const id of ['bellwarden', 'chimekeeper', 'gatehouse_lion']) {
      const spot = sys.findSpot(H.P.x + 8, H.P.y, 10) || { x: H.P.x + 8, y: H.P.y, z: H.P.z };
      const m = sys.spawn(id, spot.x, spot.y, spot.z); m.stunUntil = g.time + 1e4; m.state = 'chase';
      const b = H.cnt('music.boss.' + id); H.wtick(3);
      r['music.boss.' + id] = MU.state() === 'boss.' + id && H.cnt('music.boss.' + id) > b;
      sys.remove(m); H.wtick(2);
    }
    // bells across 11:59:58 -> 12:00:01 on the test clock
    const W = H.W, bq = H.cnt('bells.quarters'), bh = H.cnt('bells.hour');
    W.S.clock = () => new Date(2026, 10, 10, 11, 59, 58); H.wtick(2);
    W.S.clock = () => new Date(2026, 10, 10, 12, 0, 1); H.wtick(2);
    r['bells.quarters'] = H.cnt('bells.quarters') - bq >= 16; r['bells.hour'] = H.cnt('bells.hour') - bh >= 12;
    r._bells = { quarters: H.cnt('bells.quarters') - bq, hour: H.cnt('bells.hour') - bh };
    W.S.clock = null;
    return r;
  }));
  log('music + bells done');

  // ---- footsteps: one walk per surface class
  const SURF = { cobbles: 5, stone: 2, grass: 3, tarmac: 1, wood: 8 };
  for (const [name, cls] of Object.entries(SURF)) {
    const out = await page.evaluate(async (name, cls) => {
      const H = window.__t, P = H.P, Wd = window.__world, inf = { tried: 0 };
      if (H.g()) H.quiet();
      if (name === 'wood') await H.go(-441, 14);   // Clare Bridge
      else await H.go(-110, 40);
      const cands = [];
      for (const t of Wd.tiles.values()) for (let i = 0; i < t.nt; i++) {
        if (t.kind[i] !== 1 || t.surface[i] !== cls) continue;
        const a = t.tris[i * 3] * 3, b = t.tris[i * 3 + 1] * 3, c = t.tris[i * 3 + 2] * 3, v = t.verts;
        const x = (v[a] + v[b] + v[c]) / 3, y = (v[a + 1] + v[b + 1] + v[c + 1]) / 3, z = (v[a + 2] + v[b + 2] + v[c + 2]) / 3;
        cands.push({ x, y, z, d: Math.hypot(x - P.x, y - P.y) });
      }
      cands.sort((p, q) => p.d - q.d);
      const same = (x, y, z) => { const s = Wd.support(x, y, z + 0.6); return s && s.kind === 1 && s.surface === cls && Math.abs(s.z - z) < 0.6; };
      for (const cd of cands.slice(0, 400)) {
        if (!same(cd.x, cd.y, cd.z) || Wd.standAt(cd.x, cd.y, cd.z + 0.1) == null) continue;
        let yaw = null;
        for (let k = 0; k < 16 && yaw == null; k++) { const yw = k / 16 * 6.283, sx = -Math.sin(yw), sy = Math.cos(yw); if ([1, 2, 3, 4].every(d => same(cd.x + sx * d, cd.y + sy * d, cd.z))) yaw = yw; }
        if (yaw == null) continue;
        if (++inf.tried > 6) break;
        window.__player.teleport(cd.x, cd.y, cd.z + 0.05); H.step(6);
        P.yaw = yaw; const b = H.cnt('foot.' + name);
        P.keys.add('KeyW'); H.step(45); P.keys.clear(); H.step(4);
        inf.at = [cd.x.toFixed(1), cd.y.toFixed(1)]; inf.steps = H.cnt('foot.' + name) - b;
        if (inf.steps > 0) return { ok: true, inf };
      }
      return { ok: false, inf: { ...inf, cands: cands.length } };
    }, name, cls);
    res['foot.' + name] = out.ok; info['foot_' + name] = out.inf;
    log('foot', name, out.ok, JSON.stringify(out.inf));
  }

  // ---- settings
  Object.assign(res, await page.evaluate(async () => {
    const H = window.__t, A = H.A, r = {};
    A.set({ volume: 0.3 }); await H.sleep(500);
    r['settings.volume'] = Math.abs(A.buses.master.gain.value - 0.3) < 0.03 && JSON.parse(localStorage.getItem('wic-audio-v1')).volume === 0.3;
    A.set({ volume: 0.8 });
    A.set({ mute: true }); await H.sleep(400);
    const total = () => Object.values(A.counts).reduce((s, v) => s + v, 0), t0 = total();
    const g = H.g(); g.caster.spells[0].readyAt = 0; g.stats.mana = 1000; g.caster.cast(0);
    H.W.S.clock = () => new Date(2026, 10, 10, 12, 14, 59); H.wtick(2); H.W.S.clock = () => new Date(2026, 10, 10, 12, 15, 1); H.wtick(200); H.W.S.clock = null;
    H.P.keys.add('KeyW'); H.step(40); H.P.keys.clear();
    await H.sleep(500);
    r['settings.mute'] = total() === t0 && A.buses.master.gain.value < 0.01;
    A.set({ mute: false });
    return r;
  }));
  // exploration mode: the real G key
  await page.keyboard.press('KeyG');
  await page.waitForFunction('window.__explore === true && !window.__game', { timeout: 20000 });
  Object.assign(res, await page.evaluate(async () => {
    const H = window.__t, r = {}, inf = {};
    await H.go(-110, 40); H.wtick(5);
    const m0 = H.sum('music.'), f0 = H.sum('foot.'), a0 = H.sum('amb.');
    // walk somewhere open
    let best = 0, by = 0; for (let k = 0; k < 16; k++) { const yw = k / 16 * 6.283; let d = 0; for (; d < 6; d++) if (window.__world.standAt(H.P.x - Math.sin(yw) * (d + 1), H.P.y + Math.cos(yw) * (d + 1), H.P.z) == null) break; if (d > best) { best = d; by = yw; } }
    H.P.yaw = by; H.P.keys.add('KeyW'); H.step(60); H.P.keys.clear(); H.wtick(200);
    await H.sleep(1500);
    Object.assign(inf, { music: H.sum('music.') - m0, foot: H.sum('foot.') - f0, amb: H.sum('amb.') - a0, state: window.__audioMusic.state() });
    r['mode.explore'] = inf.music === 0 && inf.foot > 0 && inf.amb > 0 && inf.state === null;
    r._explore = inf;
    return r;
  }));
  await page.keyboard.press('KeyG');
  await page.waitForFunction('window.__game && window.__game.caster', { timeout: 60000 }).catch(() => {});
  info.counts_total = await page.evaluate(() => Object.values(window.__audio.counts).reduce((s, v) => s + v, 0));
} catch (e) {
  errors.push('test: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
}
await browser.close(); server.close();

for (const [k, v] of Object.entries(res)) if (k.startsWith('_')) { info[k.slice(1)] = v; delete res[k]; }
const verified = ITEMS.filter(i => i.done && res[i.id] === true).map(i => i.id);
const failed = ITEMS.filter(i => i.done && res[i.id] !== true).map(i => i.id);
const pct = ITEMS.length ? +(100 * verified.length / ITEMS.length).toFixed(1) : 0;
const hash = spawnSync('python3', [path.join(ROOT, 'scripts/build_hash.py'), SRC], { encoding: 'utf8' }).stdout.trim();
const out = { ok: failed.length === 0 && errors.length === 0, audio_coverage_pct: pct, items: ITEMS.length, marked_done: ITEMS.filter(i => i.done).length,
  verified: verified.length, failed, errors: errors.slice(0, 5), hash, secs: Math.round((Date.now() - T0) / 1000), info };
if (hash) {
  const dir = path.join(ROOT, 'data/benchmark/scores'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${hash}_audio.json`), JSON.stringify({ hash, audio_coverage_pct: pct, items: ITEMS.length, verified: verified.length, failed, at: new Date().toISOString() }, null, 1));
}
console.log(JSON.stringify(out));
process.exit(out.ok ? 0 : 1);
