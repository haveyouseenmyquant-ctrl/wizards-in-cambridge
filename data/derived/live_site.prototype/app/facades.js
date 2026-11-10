// Real photo facades (scripts/facades.py): per tile, float32 quads of 4 corners [x, y, z, u, v] in the collision
// frame (x east, y north, z up) and one RGBA WebP atlas (sky transparent) of wall pieces rectified from non-held-out Mapillary photos.
// Unlit: the photos already carry real light and shade. Drawn 4 cm proud of the wall.
// Session 32: no photo facades inside a modelled zone (Gaspard, 8 Nov: photo-baked facades are replaced by geometry);
// there the zone skins (site/app/zone.js) or the plain tile walls show instead. ?zone=0 brings them back.
import * as THREE from 'three';

const SKIP = new URLSearchParams(location.search).get('zone') === '0' ? [] :
  [[-102.9, 57.4, 100],   // Market Square zone (52.2053N 0.1190E, 90 m) + 10 m margin, collision frame [x, y, r]
   [-213.3, 80.3, 20]];   // Senate House (bespoke model, scripts/zone_bespoke_senate.py)

export function makeFacades(buf, tex) {
  const a0 = new Float32Array(buf), keep = [];
  for (let q = 0; q < a0.length / 20 - 0.5; q++) {
    let cx = 0, cy = 0;
    for (let k = 0; k < 4; k++) { cx += a0[q * 20 + k * 5] / 4; cy += a0[q * 20 + k * 5 + 1] / 4; }
    if (!SKIP.some(([x, y, r]) => (cx - x) ** 2 + (cy - y) ** 2 < r * r)) keep.push(q);
  }
  const a = new Float32Array(keep.length * 20);
  keep.forEach((q, i) => a.set(a0.subarray(q * 20, q * 20 + 20), i * 20));
  const nq = keep.length;
  const pos = new Float32Array(nq * 12), uv = new Float32Array(nq * 8), idx = new Uint32Array(nq * 6);
  for (let q = 0; q < nq; q++) {
    for (let k = 0; k < 4; k++) {
      const r = a.subarray(q * 20 + k * 5, q * 20 + k * 5 + 5);
      pos.set([r[0], r[2], -r[1]], (q * 4 + k) * 3); uv.set([r[3], r[4]], (q * 4 + k) * 2);
    }
    const o = q * 4; idx.set([o, o + 1, o + 2, o, o + 2, o + 3], q * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere(); g.computeVertexNormals();   // normals only for the ?post=ao normal pass
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.flipY = true;
  const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(g, m);
  mesh.userData.ownMat = true; mesh.name = 'facades';
  return mesh;
}
