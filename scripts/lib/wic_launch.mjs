// Shared puppeteer launch options for the game tests. Default: headless SwiftShader (as written in each test).
// WIC_TEST_GPU=1: windowed GPU Chrome (ANGLE Metal, like wic_perf.mjs; headless Chrome throttles rAF) - several
// times faster on the merged trunk; the tests' checks are unchanged.
export function wicLaunch(o) {
  if (process.env.WIC_TEST_GPU !== '1') return o;
  const size = (o.args || []).find(a => a.startsWith('--window-size='));
  return { ...o, headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ...(size ? [size] : [])] };
}
