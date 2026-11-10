import { createRequire } from 'node:module'; const puppeteer = createRequire('/Users/Shared/aistack-agent/work/projects/wizards-in-cambridge--optimisation/repo/tools/')('puppeteer-core');
import http from 'http'; import fs from 'fs'; import path from 'path';
const dir = path.resolve(process.argv[2]);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(dir, p); if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0);
await new Promise(r => server.on('listening', r));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--use-angle=metal'] });
const p = await b.newPage(); await p.setViewport({ width: 800, height: 500 });
await p.goto(`http://127.0.0.1:${server.address().port}/?debug&nopick${process.env.Q || ""}`);
await p.waitForFunction('window.__game && window.__game.mobSystem', { timeout: 60000, polling: 200 });
await new Promise(r => setTimeout(r, 12000));
console.log(await p.evaluate(async () => {
  const r = window.__renderer, S = window.__scene;
  const frame = () => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => { r.info.autoReset = false; r.info.reset(); requestAnimationFrame(() => { const c = r.info.render.calls; r.info.autoReset = true; ok(c); }); })));
  const out = { all: await frame() };
  r.shadowMap.autoUpdate = false; out.noShadowUpdate = await frame(); r.shadowMap.autoUpdate = true;
  for (const c of S.children) { const k = c.name || c.type; if (!['zone', 'game'].includes(k) && !/cityfac/.test(k) && c.type !== 'Group') continue; }
  const groups = {}; S.children.forEach((c, i) => { const k = (c.name || c.type).replace(/t_\d+_\d+/, ''); (groups[k] ||= []).push(c); });
  for (const [k, list] of Object.entries(groups)) { const vis = list.map(c => c.visible); list.forEach(c => c.visible = false); out['-' + k] = out.all - await frame(); list.forEach((c, i) => c.visible = vis[i]); }
  let casters = 0, gm = 0; S.traverseVisible(o => { if (o.isMesh && o.castShadow) casters++; });
  S.getObjectByName('game')?.traverseVisible(o => { if (o.isMesh) { gm++; } });
  out.casters = casters; out.gameMeshes = gm; out.mobs = window.__game.mobSystem.mobs?.length; out.lod = window.__shadowLod; out.proxy = window.__shadowProxy; out.merge = window.__mainMerge;
  const by = {}; for (const c of S.children) { let n = 0, rs = []; c.traverseVisible(o => { if (o.isMesh && o.castShadow) { n++; o.geometry.boundingSphere && rs.push(o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis()); } }); if (n) { rs.sort((a,b)=>a-b); const k = (c.name || c.type).replace(/t_\d+_\d+/, '') ; by[k] ||= { n: 0, rmed: [] }; by[k].n += n; by[k].rmed.push(rs[rs.length >> 1] | 0); } }
  for (const v of Object.values(by)) v.rmed = v.rmed.slice(0, 6);
  out.by = by;
  const names = {}; S.getObjectByName('zone')?.traverseVisible(o => { if (o.isMesh && o.castShadow) { const k = (o.name || o.parent?.name || '?').replace(/[0-9_]+$/, ''); names[k] = (names[k] || 0) + 1; } });
  out.zoneNames = Object.fromEntries(Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 12));
  const tn = {}; for (const c of S.children) if (c.type === 'Group' && !c.name) c.traverseVisible(o => { if (o.isMesh && o.castShadow) { const k = (o.name || o.material?.name || o.parent?.name || '?').replace(/[0-9_]+$/, ''); tn[k] = (tn[k] || 0) + 1; } });
  out.tileNames = Object.fromEntries(Object.entries(tn).sort((a, b) => b[1] - a[1]).slice(0, 12));
  return JSON.stringify(out);
}));
await b.close(); server.close();
