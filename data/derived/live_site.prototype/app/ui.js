// Minimap, landmark list and credits overlay.
import { SURFACE_COLORS } from './tiles.js';

const MAP_MPP = 2;     // pre-rendered tile maps: metres per pixel
const VIEW_MPP = 1.5;  // minimap view: metres per pixel

// Render a tile top-down once into a small image (topmost surface per pixel; buildings dark).
// Sampling the collision grid is much cheaper than drawing every triangle with canvas paths.
export function renderTileMap(col) {
  const mpp = Math.max(MAP_MPP, (col.x1 - col.x0) / 256, (col.y1 - col.y0) / 256);
  const W = Math.max(1, Math.ceil((col.x1 - col.x0) / mpp)), H = Math.max(1, Math.ceil((col.y1 - col.y0) / mpp));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), px = img.data;
  const rgb = Object.fromEntries(Object.entries({ ...SURFACE_COLORS, wall: '#6d6458' })
    .map(([k, c]) => [k, [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))]));
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const t = col.topAt(col.x0 + (i + 0.5) * mpp, col.y1 - (j + 0.5) * mpp);
    if (t < 0) continue;
    const c = col.kind[t] === 0 ? rgb.wall : rgb[col.surface[t]] || rgb[0], o = (j * W + i) * 4;
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { canvas: cv, x0: col.x0, y1: col.y1, mpp };
}

export class Minimap {
  constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.maps = new Map(); }
  add(id, map) { this.maps.set(id, map); }
  remove(id) { this.maps.delete(id); }
  draw(px, py, heading) {
    const { cv, g } = this, W = cv.width, H = cv.height;
    g.fillStyle = '#d8d4c8'; g.fillRect(0, 0, W, H);
    for (const m of this.maps.values()) {
      g.drawImage(m.canvas, W / 2 + (m.x0 - px) / VIEW_MPP, H / 2 + (py - m.y1) / VIEW_MPP, m.canvas.width * m.mpp / VIEW_MPP, m.canvas.height * m.mpp / VIEW_MPP);
    }
    g.save(); g.translate(W / 2, H / 2); g.rotate(heading);
    g.fillStyle = '#d0302a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.fillStyle = '#222'; g.font = 'bold 11px system-ui, sans-serif'; g.fillText('N', W / 2 - 4, 12);
  }
}

// Landmark list: entries with x/y (collision frame) get a jump button; others are shown as unavailable.
export function initLandmarks(listEl, entries, onJump) {
  listEl.textContent = '';
  if (!entries.length) { listEl.innerHTML = '<li class="muted">No landmarks in this build yet.</li>'; return; }
  for (const lm of entries) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.textContent = lm.name || lm.id;
    const ok = Number.isFinite(lm.x) && Number.isFinite(lm.y);
    b.disabled = !ok; if (!ok) b.title = 'Position not available in this build';
    b.addEventListener('click', () => onJump(lm));
    li.append(b); listEl.append(li);
  }
}

// Merge manifest landmarks with the richer site/landmarks.json list (by id).
export function mergeLandmarks(fromManifest = [], fromFile = []) {
  const byId = new Map();
  for (const lm of [...fromFile, ...fromManifest]) byId.set(lm.id, { ...byId.get(lm.id), ...lm });
  return [...byId.values()];
}

export function initOverlays() {
  for (const btn of document.querySelectorAll('[data-open]')) {
    btn.addEventListener('click', e => {
      e.stopPropagation(); document.exitPointerLock?.();
      const el = document.getElementById(btn.dataset.open);
      const show = el.hidden;
      for (const o of document.querySelectorAll('.overlay')) o.hidden = true;
      el.hidden = !show;
    });
  }
  for (const btn of document.querySelectorAll('.overlay .close')) btn.addEventListener('click', () => { btn.closest('.overlay').hidden = true; });
  addEventListener('keydown', e => {
    if (e.code === 'Escape') for (const o of document.querySelectorAll('.overlay')) o.hidden = true;
    if ((e.code === 'KeyH' || e.key === '?') && !(e.target instanceof HTMLInputElement)) {
      const el = document.getElementById('controls'), show = el.hidden;
      for (const o of document.querySelectorAll('.overlay')) o.hidden = true;
      el.hidden = !show;
    }
  });
}
