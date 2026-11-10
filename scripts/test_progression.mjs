#!/usr/bin/env node
// Progression test (gameplay node, session 2): headless Chrome loads /?debug&nopick and proves, in the real game:
//   level curve to a cap of 20 with per-level growth · level-gated spell ranks (every class: a spell evolves into a new
//   form with a new mechanic at 8/12/16/20, absent one level below) · talent trees of >=3 tiers x >=3 choices where every
//   choice adds a mechanic, tiers are level-gated and picks are saved · talents and ranks change spells in play (stub
//   target: Rootgrasp/Charged Lance stun, Tremor slows) · uniques and set pieces pass their effect tests, set bonuses
//   switch on at 2/3 pieces and off again · level, xp, talents, ranks, equipment and set bonuses survive a page reload.
//   node scripts/test_progression.mjs [site_dir]
// Last line: {"ok": bool, "checks": {...}, ...}; exit code 1 on failure.
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
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'],
  defaultViewport: { width: 960, height: 540 },
}));
const WATCHDOG_S = +(process.env.WC_TEST_WATCHDOG_S || 900);
setTimeout(() => { console.log(JSON.stringify({ ok: false, error: `watchdog ${WATCHDOG_S} s` })); process.exit(1); }, WATCHDOG_S * 1000).unref();
const errors = [];
let out = { ok: false };
const URL0 = () => `http://127.0.0.1:${server.address().port}/?debug&nopick${process.env.WIC_TEST_QUERY || ''}`;
async function load(page) {
  await page.waitForFunction('window.__walkReady === true', { timeout: 300000 });
  await page.waitForFunction('window.__game && window.__game.caster && window.__game.items && window.__progression', { timeout: 120000 });
}
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/404|Failed to load resource/.test(t)) errors.push(t);
    if (m.type() === 'warning' && /\[(game|classes|items|progression)\]/.test(t)) errors.push(t);
  });
  await page.goto(URL0(), { waitUntil: 'domcontentloaded', timeout: 300000 });
  await load(page);

  const a = await page.evaluate(async () => {
    const g = window.__game, P = window.__p, C = g.caster, I = g.items, PR = window.__progression, c = {}, info = {};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.paused = false;
    if (g.mobSystem) { g.mobSystem.encountersEnabled = false; for (const m of [...g.mobs]) g.mobSystem.remove(m); }
    const e0 = g.encounters?.find(e => e.id === 'market-north') || g.encounters?.[0];
    if (e0) { window.__player.teleport(e0.x, e0.y); const w0 = performance.now(); await sleep(500); while (window.__player.pendingPlace && performance.now() - w0 < 60000) await sleep(100); }
    const pump = n => { for (let i = 0; i < n; i++) { P.update?.(0.05); g.update(0.05); } };
    const stubs = [];
    // real mob (statue) as the target, made unkillable and frozen in place so only the spell's own status shows
    const stub = (dx, dy) => { const f = g.facing(), x = g.px + f.x * dy - f.y * dx, y = g.py + f.y * dy + f.x * dx;
      const sp = g.mobSystem.findSpot(x, y, 4) || { x, y, z: g.pz }; const m = g.mobSystem.spawn('statue', sp.x, sp.y, sp.z);
      m.hp = m.maxHp = 1e5; m.stunUntil = 0; m.slowUntil = 0; m.speed = 0; m.noLoot = true; m.xp = 0; stubs.push(m);
      P.yaw = Math.atan2(-(m.x - P.x), m.y - P.y); P.pitch = -0.05; return m; };
    const clearStubs = () => { for (const m of stubs) g.mobSystem.remove(m); stubs.length = 0; };
    const ready = () => { for (const s of C.spells) s.readyAt = 0; g.stats.mana = g.stats.maxMana; };

    // 1. level curve and cap
    C.setClass('warden'); g.setLevel(1);
    const curve = []; for (let L = 1; L <= PR.LEVEL_CAP; L++) curve.push(g.xpToNext(L));
    g.gainXp(1e7); const capped = g.stats.level; g.gainXp(1e6);
    c.levelCap20 = PR.LEVEL_CAP >= 20 && capped === PR.LEVEL_CAP && g.stats.level === PR.LEVEL_CAP && !isFinite(g.xpToNext()) && curve.slice(0, -1).every((x, i) => i === 0 || x > curve[i - 1]);
    info.curve = curve.slice(0, -1); info.mana20 = g.stats.maxMana; info.hp20 = g.stats.maxHp;
    g.setLevel(1); c.levelGrowth = info.hp20 > g.stats.maxHp && info.mana20 > g.stats.maxMana;

    // 2. level-gated spell ranks, every class
    const ranksOk = {};
    for (const cls of Object.keys(C.classes)) {
      C.setClass(cls); const R = PR.RANKS[cls] || []; let ok = R.length >= 4 && new Set(R.map(r => r.level)).size >= 3 && R.every(r => r.level <= PR.LEVEL_CAP);
      for (const r of R) {
        g.setLevel(r.level - 1); const before = C.spells.find(s => s.id === r.spell);
        const nb = before?.name, kb = JSON.stringify(before);
        g.setLevel(r.level); const after = C.spells.find(s => s.id === r.spell);
        ok = ok && nb !== r.name && after?.name === r.name && after.rank >= 2 && JSON.stringify(after) !== kb;
      }
      ranksOk[cls] = ok;
    }
    c.levelGatedSpells = Object.values(ranksOk).every(Boolean); info.ranks = ranksOk;

    // 3. talent trees: >=3 tiers x >=3 choices; each choice adds a mechanic (a new key, or a zero/false key switched on)
    const talOk = {}; const weak = [];
    for (const [cls, def] of Object.entries(C.classes)) {
      let ok = def.talents.length >= 3 && def.talents.every(t => t.length >= 3);
      def.talents.forEach((tier, ti) => tier.forEach((o, ci) => {
        const S = {}; for (const s of def.spells) S[s.id] = structuredClone(s); o.f(S);
        const mech = def.spells.some(b => { const s = S[b.id]; return Object.keys(s).some(k => !(k in b) || (!b[k] && s[k]) || (typeof b[k] === 'object' && JSON.stringify(b[k]) !== JSON.stringify(s[k])) || typeof b[k] === 'boolean' && b[k] !== s[k]); });
        if (!mech) { ok = false; weak.push(`${cls}:${ti}:${o.name}`); }
      }));
      talOk[cls] = ok;
    }
    c.talentTrees3x3 = Object.values(talOk).every(Boolean); info.talents = talOk; info.weakTalents = weak;
    // tier gating + saved picks
    C.setClass('warden'); g.setLevel(1); C.picks.fill(null);
    const lockedPick = C.pickTalent(1, 2); g.setLevel(4); const okPick = C.pickTalent(1, 2);
    c.talentGating = !lockedPick && okPick && JSON.parse(localStorage.getItem('walkable-cambridge-save-v1')).talents.warden[1] === 2;

    // 4. talents change spell behaviour in play: Rootgrasp makes Rootbind root (stun); Charged Lance makes Spark Lance stun
    const tryCast = async (slot, setup) => { clearStubs(); const m = stub(0, 6); ready(); setup?.(m); const t0 = g.time + 0.01; C.cast(slot, m); pump(12); const r = { stun: (m.stunUntil || 0) > t0, slow: (m.slowUntil || 0) > t0, dmg: m.maxHp - m.hp, d: +Math.hypot(m.x - g.px, m.y - g.py).toFixed(1) }; clearStubs(); return r; };
    C.picks[1] = 0; C.rebuild(); const rootBase = await tryCast(4);
    C.pickTalent(1, 2); const rootTal = await tryCast(4);
    C.setClass('stormcaller'); g.setLevel(2); C.picks.fill(null); C.pickTalent(0, 2); const lanceBase = await tryCast(0);
    C.pickTalent(0, 1); const lanceTal = await tryCast(0);
    c.talentBehaviourLive = rootBase.dmg > 0 && !rootBase.stun && rootTal.stun && lanceBase.dmg > 0 && !lanceBase.stun && lanceTal.stun;
    info.live = { rootBase, rootTal, lanceBase, lanceTal };
    // rank in play: warden Quake Stomp gains a slow at 12 (Tremor)
    C.setClass('warden'); C.picks.fill(null); g.setLevel(11); const qs11 = await tryCast(2, m => { m.x = g.px + 1.5; m.y = g.py; m.z = g.pz; });
    g.setLevel(12); const qs12 = await tryCast(2, m => { m.x = g.px + 1.5; m.y = g.py; m.z = g.pz; });
    c.rankBehaviourLive = qs11.dmg > 0 && !qs11.slow && qs12.slow; info.rankLive = { qs11, qs12 };

    // 5. loot: uniques and sets
    const defs = I.defs, uniques = Object.keys(defs).filter(k => defs[k].unique && defs[k].fx), setIds = Object.values(PR.SETS).flatMap(s => s.pieces);
    const tests = []; for (const id of [...uniques, ...setIds]) tests.push(await window.__itemTest(id));
    c.uniquesAndSetPiecesWork = uniques.length >= 4 && Object.keys(PR.SETS).length >= 2 && tests.every(t => t.ok);
    info.uniques = uniques; info.itemFails = tests.filter(t => !t.ok);
    for (const s of I.slots) I.unequip(s);
    I.give('nc_hat', { quiet: true }); I.equip('nc_hat'); const m0 = g.stats.maxMana; I.give('nc_boots', { quiet: true }); I.equip('nc_boots');
    const two = PR.activeSets().includes('nightclimbers:2') && !PR.activeSets().includes('nightclimbers:3') && g.stats.maxMana === m0 + 20;
    I.give('nc_broom', { quiet: true }); I.equip('nc_broom');
    const three = PR.activeSets().includes('nightclimbers:3');
    const pw0 = g.stats.power; P.grounded = false; g.emit('tick', { dt: 0.05 }); const air = g.stats.power; P.grounded = true; g.emit('tick', { dt: 0.05 });
    const airOk = Math.abs(air - pw0 - 0.35) < 1e-6 && Math.abs(g.stats.power - pw0) < 1e-6;
    I.unequip('boots'); const broke = !PR.activeSets().some(k => k.startsWith('nightclimbers:3')) && PR.activeSets().includes('nightclimbers:2');
    c.setBonuses = two && three && airOk && broke; info.sets = { two, three, airOk, broke };
    for (const s of I.slots) I.unequip(s);

    // 6. state to survive reload: warden L12, picks, Proctors' Vigil
    C.setClass('warden'); g.save.cls = 'warden'; g.setLevel(12); C.picks.fill(null); C.pickTalent(0, 2); C.pickTalent(1, 2); C.pickTalent(2, 1);
    for (const id of ['pv_ring', 'pv_amulet', 'pv_robe']) { I.give(id, { quiet: true }); I.equip(id); }
    g.persist();
    const snap = { level: g.stats.level, maxHp: g.stats.maxHp, maxMana: g.stats.maxMana, armor: g.stats.armor, picks: [...C.picks], spells: C.spells.map(s => s.name), sets: PR.activeSets().sort(),
      rootStun: C.spells.find(s => s.id === 'rootbind').stun, eq: Object.values(I.equipped).sort() };
    return { c, info, snap };
  });

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 300000 });
  await load(page);
  const b = await page.evaluate(() => {
    const g = window.__game, C = g.caster, I = g.items, PR = window.__progression;
    return { level: g.stats.level, maxHp: g.stats.maxHp, maxMana: g.stats.maxMana, armor: g.stats.armor, cls: C.cls, picks: [...C.picks], spells: C.spells.map(s => s.name), sets: PR.activeSets().sort(),
      rootStun: C.spells.find(s => s.id === 'rootbind')?.stun, eq: Object.values(I.equipped).sort() };
  });
  const s = a.snap;
  const same = k => JSON.stringify(s[k]) === JSON.stringify(b[k]);
  const checks = { ...a.c, survivesReload: b.cls === 'warden' && ['level', 'maxHp', 'maxMana', 'armor', 'picks', 'spells', 'sets', 'rootStun', 'eq'].every(same) };
  out = { ok: Object.values(checks).every(Boolean) && !errors.length, checks, info: a.info, beforeReload: s, afterReload: b,
    level_cap: 20, talent_tiers: 3, talent_choices: 3, page_errors: errors.slice(0, 5) };
} catch (e) { out = { ok: false, error: String(e.stack || e), page_errors: errors.slice(0, 5) }; }
finally { await browser.close(); server.close(); }
for (const [k, v] of Object.entries(out.checks || {})) console.error('[progression]', v ? 'ok  ' : 'FAIL', k);
console.log(JSON.stringify(out));
process.exit(out.ok ? 0 : 1);
