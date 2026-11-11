// Load-path probe: walk-ready vs game-ready page times, game install timings, long tasks and >2 ms WebGL stalls.
// node tools/wic_loadprobe.mjs http://127.0.0.1:8765/   (serve site/ with python3 -m http.server 8765)
import { createRequire } from 'module';
const puppeteer = createRequire('/Users/Shared/aistack-agent/work/projects/wizards-in-cambridge--optimisation/repo/tools/')('puppeteer-core');
const url = process.argv[2], q = process.argv[3] || '';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--use-angle=metal','--window-size=1280,810'], defaultViewport: { width: 1280, height: 720 } });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  const st = window.__stalls = [];
  for (const C of [WebGL2RenderingContext]) {
    for (const fn of ['getProgramParameter','getProgramInfoLog','getShaderInfoLog','getShaderParameter','getActiveUniform','getUniformLocation','getAttribLocation','getActiveAttrib','linkProgram','compileShader','useProgram','drawElements','drawArrays','texImage2D','texSubImage2D','compressedTexImage2D','bufferData']) {
    const g = C.prototype[fn];
    C.prototype[fn] = function (...a) { const rdy = fn === 'getProgramInfoLog' ? C.prototype.getProgramParameter.call(this, a[0], 0x91B1) : ''; const t = performance.now(); const r = g.apply(this, a); const d = performance.now() - t;
      if (d > 2) { const prog = a[0] instanceof WebGLProgram ? a[0] : null; const P = prog && window.__renderer?.info.programs?.find(x => x.program === prog); st.push([Math.round(t), +d.toFixed(1), fn, rdy, P ? P.name : '', P ? P.cacheKey.slice(0, 100) : '']); } return r; }; }
  }
});
await p.evaluateOnNewDocument(() => { window.__lt = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); });
await p.goto(url + '?debug&nopick' + q, { waitUntil: 'domcontentloaded' });
await p.waitForFunction('window.__walkReady', { polling: 20 });
const wr = await p.evaluate('window.__walkReadyAt');
await p.waitForFunction('window.__game && window.__game.caster && window.__game.mobSystem', { polling: 20, timeout: 60000 });
console.log('walk', wr, 'game', await p.evaluate('performance.now()'), await p.evaluate('JSON.stringify([window.__gameT, window.__progGate])'));
await new Promise(r => setTimeout(r, 3000));
console.log('longtasks', JSON.stringify(await p.evaluate('window.__lt')));
const s = []; let tot = 0; for (const x of s) { tot += x[1]; console.log(x.join(' | ')); } console.log('total stall ms', tot.toFixed(0), 'n', s.length);
await b.close();
