// CPU profile of the longest busy run (long task) between page load and game ready: self + inclusive ms.
// node tools/wic_loadprof.mjs http://127.0.0.1:8765/
import { createRequire } from 'module';
const puppeteer = createRequire('/Users/Shared/aistack-agent/work/projects/wizards-in-cambridge--optimisation/repo/tools/')('puppeteer-core');
const url = process.argv[2];
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--use-angle=metal','--window-size=1280,810'], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage(); const cdp = await p.createCDPSession();
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start');
await p.goto(url + '?debug&nopick', { waitUntil: 'domcontentloaded' });
await p.waitForFunction('window.__walkReady', { polling: 20 });
const wr = await p.evaluate('window.__walkReadyAt');
await p.waitForFunction('window.__game && window.__game.caster && window.__game.mobSystem', { polling: 20, timeout: 60000 });
const { profile } = await cdp.send('Profiler.stop');
console.log('walk', wr, 'game', await p.evaluate('performance.now()'), await p.evaluate('JSON.stringify([window.__gameT, window.__progGate])'));
// only samples after walkReady: profile times are in us relative to profile.startTime (monotonic); approximate by last N ms
const idx = new Map(profile.nodes.map(n => [n.id, n])); const parent = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
let t = profile.startTime; const times = profile.timeDeltas.map(d => (t += d));
const end = profile.endTime, win = (await p.evaluate('performance.now()') - wr) * 1000;
// longest run of non-idle samples = the long task
let best = [0, 0], cur = 0; profile.samples.forEach((id, i) => { const nm = idx.get(id).callFrame.functionName; if (nm === '(idle)') cur = i + 1; else if (times[i] - times[cur] > times[best[1]] - times[best[0]]) best = [cur, i]; });
console.log('longest busy run ms', ((times[best[1]] - times[best[0]]) / 1000).toFixed(0));
const self = {}, incl = {}; let tot = 0;
profile.samples.forEach((id, i) => { if (i < best[0] || i > best[1]) return; const d = profile.timeDeltas[i + 1] || 100; tot += d;
  const n = idx.get(id), cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`; self[k] = (self[k] || 0) + d;
  const seen = new Set(); for (let x = id; x; x = parent.get(x)) { const c = idx.get(x).callFrame; const kk = `${c.functionName || '(anon)'} ${c.url.split('/').slice(-2).join('/')}:${c.lineNumber + 1}`; if (seen.has(kk)) continue; seen.add(kk); incl[kk] = (incl[kk] || 0) + d; } });
console.log('window ms', (tot / 1000).toFixed(0));
console.log('--self'); for (const [k, v] of Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log((v / 1000).toFixed(0).padStart(5), k);
console.log('--incl'); for (const [k, v] of Object.entries(incl).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log((v / 1000).toFixed(0).padStart(5), k);
await b.close();
