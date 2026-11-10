// Road markings (scripts/markings.py): per tile, float32 records [x0, y0, x1, y1, kind] in the collision frame,
// kind 0 = white centre dash (0.10 m), 1 = yellow kerb line (0.075 m). Draped on the tile's own collision ground,
// sampled every 2 m, 3 cm up, one merged mesh per tile.
import * as THREE from 'three';

const W = [0.10, 0.075], COL = [new THREE.Color(0xe8e6df), new THREE.Color(0xd8a71c)];
const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

export function makeMarkings(buf, col) {
  const r = new Float32Array(buf), pos = [], clr = [], idx = [];
  const z = (x, y) => { const b = { z: -Infinity, kind: -1 }; col.support(x, y, 1e4, b, false); return b.kind < 0 ? null : b.z + 0.03; };
  for (let i = 0; i + 4 < r.length; i += 5) {
    const [x0, y0, x1, y1, k] = [r[i], r[i + 1], r[i + 2], r[i + 3], r[i + 4]];
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 0.05) continue;
    const nx = -(y1 - y0) / L * W[k] / 2, ny = (x1 - x0) / L * W[k] / 2, n = Math.max(1, Math.ceil(L / 2));
    let prev = -1;
    for (let j = 0; j <= n; j++) {
      const x = x0 + (x1 - x0) * j / n, y = y0 + (y1 - y0) * j / n, h = z(x, y);
      if (h == null) { prev = -1; continue; }
      const v = pos.length / 3;
      // collision frame (x east, y north, z up) -> three.js (x, z up, -y)
      pos.push(x + nx, h, -(y + ny), x - nx, h, -(y - ny));
      for (let q = 0; q < 2; q++) clr.push(COL[k].r, COL[k].g, COL[k].b);
      if (prev >= 0) idx.push(prev, prev + 1, v, prev + 1, v + 1, v);
      prev = v;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(clr, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = 'markings';
  return m;
}
