// Street furniture from OSM (scripts/street_objects.py): per tile, float32 records
// [x, y, z_ground, type, heading, seed, n] in the collision frame. One InstancedMesh per type per tile.
// Local model frame: +x along the nearest way, +y up, the way lies towards -z (benches and signs face -z).
// Bicycle parking: n Sheffield stands 1 m apart along the way, about half of the sides with a parked bike.
import * as THREE from 'three';

const BLACK = 0x1c1e1d, STEEL = 0x8c9094, STONE = 0xa8a091, RED = 0xb3161b, WOOD = 0x8a6a48;

function part(geo, color, x = 0, y = 0, z = 0, ry = 0, rx = 0) {
  geo.rotateX(rx); geo.rotateY(ry); geo.translate(x, y, z);
  const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(color), n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const box = (w, h, d, color, x, y, z, ry) => part(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, ry);
const cyl = (r0, r1, h, color, x = 0, y = 0, z = 0, seg = 10) => part(new THREE.CylinderGeometry(r0, r1, h, seg), color, x, y + h / 2, z);
function merge(parts) {
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) {
    const a = new Float32Array(n * 3); let o = 0;
    for (const p of parts) { a.set(p.attributes[k].array, o); o += p.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(a, 3));
  }
  return out;
}

function bike(z) {   // parked parallel to the stand (along local z), on the side z
  const p = [], tire = 0x161616, frame = [0x2b3a55, 0x6b1f22, 0x2d4a33, 0x1a1a1a, 0x8a8a86][Math.abs(z * 7 | 0) % 5];
  for (const s of [-0.53, 0.53]) p.push(part(new THREE.TorusGeometry(0.33, 0.022, 5, 18), tire, z, 0.35, s, Math.PI / 2));
  p.push(box(0.03, 0.03, 0.62, frame, z, 0.62, 0));                                    // top tube
  p.push(part(new THREE.BoxGeometry(0.03, 0.6, 0.03), frame, z, 0.5, 0.08, 0, 0.5));    // down tube
  p.push(part(new THREE.BoxGeometry(0.03, 0.42, 0.03), frame, z, 0.55, -0.2, 0, -0.25)); // seat tube
  p.push(box(0.06, 0.04, 0.22, BLACK, z, 0.86, -0.25));                                 // saddle
  p.push(box(0.5, 0.03, 0.03, BLACK, z, 0.95, 0.45));                                   // handlebar
  return p;
}

const GEOS = {
  1: merge([cyl(0.15, 0.17, 0.7, BLACK), cyl(0.06, 0.08, 4.3, BLACK), cyl(0.22, 0.12, 0.45, 0xd8d0b0, 0, 4.25), cyl(0.05, 0.25, 0.15, BLACK, 0, 4.7)]),
  2: merge([box(1.8, 0.05, 0.45, WOOD, 0, 0.42, 0), box(1.8, 0.38, 0.05, WOOD, 0, 0.5, 0.22), box(0.06, 0.45, 0.45, BLACK, -0.8, 0, 0), box(0.06, 0.45, 0.45, BLACK, 0.8, 0, 0)]),
  3: merge([cyl(0.09, 0.11, 0.9, BLACK), cyl(0.06, 0.1, 0.08, BLACK, 0, 0.9)]),
  4: merge([cyl(0.27, 0.25, 0.95, 0x262826), cyl(0.29, 0.29, 0.06, 0x3a3c3a, 0, 0.95)]),
  5: merge([box(0.05, 0.8, 0.05, STEEL, 0, 0, -0.35), box(0.05, 0.8, 0.05, STEEL, 0, 0, 0.35), box(0.05, 0.05, 0.75, STEEL, 0, 0.8, 0)]),
  6: merge([cyl(0.27, 0.27, 1.45, RED, 0, 0, 0, 16), cyl(0.3, 0.3, 0.08, RED, 0, 1.45, 0, 16), box(0.25, 0.03, 0.02, BLACK, 0, 1.15, -0.27)]),
  7: merge([box(0.92, 0.1, 0.92, RED, 0, 0, 0), box(0.86, 2.2, 0.86, RED, 0, 0.1, 0), box(0.92, 0.2, 0.92, RED, 0, 2.3, 0), box(0.7, 0.14, 0.88, 0xe8e2c8, 0, 2.05, 0)]),
  8: merge([cyl(0.04, 0.04, 2.9, STEEL), box(0.42, 0.42, 0.03, 0xe6e6e6, 0, 2.45, 0), box(0.4, 0.5, 0.03, 0x1f3a6b, 0, 1.9, 0)]),
  9: merge([cyl(0.04, 0.04, 2.0, BLACK), box(0.7, 0.9, 0.04, 0x29313a, 0, 1.3, 0)]),
  10: merge([box(1.2, 1.3, 1.2, STONE, 0, 0, 0), box(1.0, 0.15, 1.0, STONE, 0, 1.3, 0), cyl(0.22, 0.3, 1.5, 0x4d4a3c, 0, 1.45, 0, 8), part(new THREE.SphereGeometry(0.16, 8, 6), 0x4d4a3c, 0, 3.05, 0)]),
  11: merge([cyl(0.55, 0.5, 0.75, STONE, 0, 0, 0, 14), cyl(0.12, 0.15, 1.2, STONE, 0, 0.75, 0, 8)]),
  12: merge([cyl(0.09, 0.12, 3.2, BLACK), box(0.55, 0.55, 0.2, BLACK, 0, 3.2, 0), box(0.45, 0.45, 0.22, 0xf0ece0, 0, 3.25, 0)]),
};
const BIKES = [merge(bike(0.42)), merge(bike(-0.42))];
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
// Inside the Market Square zone these types are real geometry in site/zone/market_square.glb, built at the same OSM
// positions by scripts/zone_props_furniture.py (ZONE_C / ZONE_R / KINDS there): skip them here. ?zone=0 restores them.
// street_objects_pct (kpi.py) reads the objects/*.bin records, which are unchanged.
const ZONE_SKIP = new URLSearchParams(location.search).get('zone') === '0' ? null : { x: -96.8, y: 57.0, r: 140, types: new Set([1, 2, 3, 4, 5, 6, 7]) };

// Parked cars (type 13, scripts/cars.py): side profile (length along local x, nose at +x) extruded across the width.
// Body vertex colour is white and tinted per instance (paint); glass, tyres and trim stay dark.
function prism(pts, width, color, z = 0) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  g.translate(0, 0, z - width / 2);
  return part(g, color);
}
function car(L, H, W, estate) {
  const h = L / 2, GLASS = 0x1b2128, TYRE = 0x141414, p = [];
  p.push(prism([[-h, 0.28], [h - 0.05, 0.28], [h, 0.5], [h - 0.1, 0.78], [h - 1.05, 0.9], [-h + 0.15, 0.92], [-h, 0.75]], W, 0xffffff));
  const r0 = estate ? -h + 0.1 : -h + 0.55, top = H;
  p.push(prism([[h - 1.1, 0.9], [h - 1.85, top - 0.04], [r0 + 0.12, top - 0.04], [r0, 0.92]], W - 0.14, GLASS));
  p.push(prism([[h - 1.8, top - 0.06], [h - 1.86, top], [r0 + 0.16, top], [r0 + 0.12, top - 0.06]], W - 0.18, 0xffffff));
  for (const x of [h - 0.85, -h + 0.75]) for (const z of [-W / 2 + 0.12, W / 2 - 0.12]) {
    const t = new THREE.CylinderGeometry(0.31, 0.31, 0.2, 12); t.rotateX(Math.PI / 2);
    p.push(part(t, TYRE, x, 0.31, z));
  }
  for (const z of [-W / 2 + 0.25, W / 2 - 0.25]) {
    p.push(box(0.04, 0.12, 0.3, 0xe8e8e0, h - 0.01, 0.62, z));
    p.push(box(0.04, 0.12, 0.3, 0x9a1010, -h + 0.01, 0.66, z));
  }
  return merge(p);
}
const CARS = [car(4.1, 1.45, 1.75, false), car(4.6, 1.48, 1.8, true), car(4.5, 1.68, 1.85, true)];
const PAINT = [0xf2f2f0, 0xf2f2f0, 0x1a1a1c, 0x1a1a1c, 0x8d9196, 0xb9bcbf, 0x5d6166, 0x24375e, 0x7d1717, 0x2f3d33, 0x9fb3c8, 0x3b3b3e];

export function makeObjects(buf) {
  const a = new Float32Array(buf), n = a.length / 7 | 0;
  const byType = new Map(), add = (k, M) => { if (!byType.has(k)) byType.set(k, []); byType.get(k).push(M.clone()); };
  const m = new THREE.Matrix4(), r = new THREE.Matrix4(), paint = [];
  for (let i = 0; i < n; i++) {
    const [x, y, zg, type, head, seed, cnt] = a.subarray(i * 7, i * 7 + 7);
    if (ZONE_SKIP && ZONE_SKIP.types.has(type) && (x - ZONE_SKIP.x) ** 2 + (y - ZONE_SKIP.y) ** 2 < ZONE_SKIP.r ** 2) continue;
    r.makeRotationY(head);
    if (type === 5) {   // stands perpendicular to the way, spaced along it
      for (let j = 0; j < cnt; j++) {
        const off = (j - (cnt - 1) / 2) * 1.0;
        m.makeTranslation(x + Math.cos(head) * off, zg, -(y + Math.sin(head) * off)).multiply(r);
        add(5, m);
        const h = (seed * 7919 + j * 0.618) % 1;
        if (h < 0.55) add('b0', m);
        if (h > 0.3 && h < 0.75) add('b1', m);
      }
    } else if (type === 13) {
      m.makeTranslation(x, zg, -y).multiply(r); add('c' + ((seed * 3 | 0) % 3), m);
      (paint[(seed * 3 | 0) % 3] ||= []).push(PAINT[(seed * 997 | 0) % PAINT.length]);
    } else { m.makeTranslation(x, zg, -y).multiply(r); add(type, m); }
  }
  const g = new THREE.Group(); g.name = 'objects';
  for (const [k, ms] of byType) {
    const car = typeof k === 'string' && k[0] === 'c' ? +k[1] : -1;
    const geo = k === 'b0' ? BIKES[0] : k === 'b1' ? BIKES[1] : car >= 0 ? CARS[car] : GEOS[k];
    if (!geo) continue;
    const im = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((M, i) => im.setMatrixAt(i, M));
    if (car >= 0) { const c = new THREE.Color(); paint[car].forEach((p, i) => im.setColorAt(i, c.setHex(p))); }
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.userData.ownMat = false;
    im.matrixAutoUpdate = false; g.add(im);
  }
  return g;
}
