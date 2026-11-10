// Quality presets (Low / Medium / High / Ultra). One place decides the preset; the renderer, tiles, trees, grass and
// spell VFX read their budgets from it.
//   ?q=low|medium|high|ultra (or the older ?quality=...) applies to this page load only;
//   the menu button cycles the preset, saves it in localStorage ('wic_quality') and reloads.
//   Default: Low on touch devices (phones/tablets), High elsewhere. fps_median is measured on the default (High at
//   1280x720 in scripts/wic_perf.mjs).
const KEY = 'wic_quality';
export const PRESET_NAMES = ['low', 'medium', 'high', 'ultra'];
// pixelRatio: cap on devicePixelRatio; shadow: shadow-map size (0 = off); facR: radius (m) of detailed city facades;
// grass: blade field preset (null = off); treeCards: leaf-card density; vfx: particle count scale; ao: GTAO post pass;
// bloom: HDR bloom + vignette pass (golden look); msaa: samples of the HDR target; fogDensity: exp2 haze (default 0.0042).
export const PRESETS = {
  low:    { pixelRatio: 1,    shadow: 0,    facR: 60,  treeCards: 0.55, vfx: 0.5, ao: false, fogFar: 320, bloom: false, fogDensity: 0.0048 },
  medium: { pixelRatio: 1.25, shadow: 1024, facR: 120, treeCards: 0.8,  vfx: 0.75, ao: false, fogFar: 380, bloom: true, msaa: 2 },
  high:   { pixelRatio: 1.5,  shadow: 2048, facR: 200, treeCards: 1,    vfx: 1,   ao: false, fogFar: 420, bloom: true, msaa: 4 },
  ultra:  { pixelRatio: 2,    shadow: 4096, facR: 260, treeCards: 1.3,  vfx: 1,   ao: true,  fogFar: 480, bloom: true, msaa: 4, fogDensity: 0.0036 },
};
const LABEL = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };

function stored() { try { return localStorage.getItem(KEY); } catch { return null; } }
function coarse() { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } }

const QS = new URLSearchParams(location.search);
const fromUrl = (QS.get('q') || QS.get('quality') || '').toLowerCase();
export const DEFAULT_QUALITY = coarse() ? 'low' : 'high';
export const QUALITY = PRESET_NAMES.includes(fromUrl) ? fromUrl : PRESET_NAMES.includes(stored()) ? stored() : DEFAULT_QUALITY;
export const Q = { name: QUALITY, ...PRESETS[QUALITY] };
window.__quality = Q;

export function setQuality(name) {
  if (!PRESET_NAMES.includes(name)) return;
  try { localStorage.setItem(KEY, name); } catch { /* private mode: applies to this load only */ }
  const u = new URL(location.href);
  u.searchParams.delete('q'); u.searchParams.delete('quality');
  location.replace(u.href);
}

// menu button: "Quality: High" (click cycles Low -> Medium -> High -> Ultra and reloads)
export function initQualityMenu(menu = document.getElementById('menu')) {
  if (!menu || menu.querySelector('[data-quality]')) return;
  const b = document.createElement('button');
  b.dataset.quality = QUALITY;
  b.title = 'Graphics quality (reloads the page)';
  b.textContent = `Quality: ${LABEL[QUALITY]}`;
  b.addEventListener('click', e => {
    e.stopPropagation();
    setQuality(PRESET_NAMES[(PRESET_NAMES.indexOf(QUALITY) + 1) % PRESET_NAMES.length]);
  });
  menu.appendChild(b);
}
