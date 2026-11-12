// Optimisation s2: grid-accelerated nearest-hit raycast for static meshes (third-person camera occlusion).
// Mesh.raycast tests every triangle of a mesh once the ray touches its bounding sphere; the merged zone meshes
// have tens of thousands, and the camera casts three rays a frame. Here each geometry gets a lazily built uniform
// grid of triangle indices over the two widest local axes (cells CELL m in world units: the quantized zone GLB
// stores positions in a unit cube scaled by its node); a ray only tests triangles in the cells its segment's
// bounding box covers. Back faces are culled for FrontSide materials, as in Mesh.raycast. Returns the nearest world-space distance or Infinity.
import * as THREE from 'three';

const CELL = 2;
const grids = new WeakMap();
const inv = new THREE.Matrix4(), lo = new THREE.Vector3(), ld = new THREE.Vector3(), le = new THREE.Vector3();
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3(), wp = new THREE.Vector3();
const lray = new THREE.Ray(), wray = new THREE.Ray(), sph = new THREE.Sphere();
let stamp = 1;

// s11 (task 22df): built in slices of <= BUDGET ms per frame across all meshes (the zone's first ray built every grid in
// one frame, part of the game-start hitch); a mesh whose grid isn't complete yet is skipped (the camera is unoccluded
// for those few frames)
const BUDGET = 2;
let frameT = -1, spent = 0;
function build(geo, scale) {
  const pos = geo.attributes.position, idx = geo.index;
  const n = idx ? idx.count / 3 : pos.count / 3;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, ext = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z], mn = [bb.min.x, bb.min.y, bb.min.z];
  const ax = [0, 1, 2].sort((p, q) => ext[q] - ext[p]), U = ax[0], V = ax[1];
  const cell = Math.max(CELL / (scale || 1), Math.max(ext[U], ext[V]) / 256, 1e-9);
  const nu = Math.max(1, Math.ceil(ext[U] / cell)), nv = Math.max(1, Math.ceil(ext[V] / cell));
  return { U, V, cell, nu, nv, mu: mn[U], mv: mn[V], cells: new Array(nu * nv), seen: new Uint32Array(n), pos, idx, n, done: 0 };
}
function grow(g) {   // true once complete
  const now = performance.now();
  if (now - frameT > 8) { frameT = now; spent = 0; }   // a new frame (rays within one frame come < 8 ms apart)
  if (spent >= BUDGET) return false;
  const { pos, idx, U, V, cell, nu, nv, mu, mv, cells, n } = g, t0 = performance.now();
  const get = [pos.getX.bind(pos), pos.getY.bind(pos), pos.getZ.bind(pos)];
  let t = g.done;
  for (; t < n; t++) {
    if ((t & 1023) === 1023 && performance.now() - t0 + spent > BUDGET) break;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let j = 0; j < 3; j++) { const v = idx ? idx.getX(t * 3 + j) : t * 3 + j, x = get[U](v), y = get[V](v); u0 = Math.min(u0, x); u1 = Math.max(u1, x); v0 = Math.min(v0, y); v1 = Math.max(v1, y); }
    const i0 = Math.max(0, Math.floor((u0 - mu) / cell)), i1 = Math.min(nu - 1, Math.floor((u1 - mu) / cell));
    const k0 = Math.max(0, Math.floor((v0 - mv) / cell)), k1 = Math.min(nv - 1, Math.floor((v1 - mv) / cell));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) (cells[k * nu + i] ||= []).push(t);
  }
  g.done = t; spent += performance.now() - t0;
  return t >= n;
}

// o, dir: world-space origin and unit direction; far: max distance
export function raycastNearest(meshes, o, dir, near, far) {
  let best = Infinity;
  wray.set(o, dir);
  for (const m of meshes) {
    const geo = m.geometry;
    if (!geo?.attributes?.position || geo.morphAttributes?.position || m.isSkinnedMesh || m.isInstancedMesh) continue;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    sph.copy(geo.boundingSphere).applyMatrix4(m.matrixWorld);   // cheap reject first, as Mesh.raycast does
    if (!wray.intersectsSphere(sph) || sph.center.distanceTo(o) - sph.radius > Math.min(far, best)) continue;
    let g = grids.get(geo);
    if (!g || g.pos !== geo.attributes.position) { g = build(geo, m.matrixWorld.getMaxScaleOnAxis()); grids.set(geo, g); }
    if (g.done < g.n && !grow(g)) continue;
    inv.copy(m.matrixWorld).invert();
    lo.copy(o).applyMatrix4(inv);
    le.copy(o).addScaledVector(dir, Math.min(far, best)).applyMatrix4(inv);
    ld.copy(le).sub(lo); const llen = ld.length(); if (!llen) continue; ld.divideScalar(llen);
    lray.set(lo, ld);
    const lu0 = lo.getComponent(g.U), lu1 = le.getComponent(g.U), lv0 = lo.getComponent(g.V), lv1 = le.getComponent(g.V);
    const i0 = Math.max(0, Math.floor((Math.min(lu0, lu1) - g.mu) / g.cell)), i1 = Math.min(g.nu - 1, Math.floor((Math.max(lu0, lu1) - g.mu) / g.cell));
    const k0 = Math.max(0, Math.floor((Math.min(lv0, lv1) - g.mv) / g.cell)), k1 = Math.min(g.nv - 1, Math.floor((Math.max(lv0, lv1) - g.mv) / g.cell));
    if (i0 > i1 || k0 > k1) continue;
    if (++stamp > 0xfffffff0) { stamp = 1; }
    const cull = !Array.isArray(m.material) && m.material?.side === THREE.FrontSide;
    const s = stamp, seen = g.seen, pos = g.pos, idx = g.idx;
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const cell = g.cells[k * g.nu + i]; if (!cell) continue;
      for (const t of cell) {
        if (seen[t] === s) continue; seen[t] = s;
        const v0 = idx ? idx.getX(t * 3) : t * 3, v1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, v2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, v0); b.fromBufferAttribute(pos, v1); c.fromBufferAttribute(pos, v2);
        if (!lray.intersectTriangle(a, b, c, cull, hit)) continue;
        const d = wp.copy(hit).applyMatrix4(m.matrixWorld).distanceTo(o);
        if (d >= near && d <= far && d < best) best = d;
      }
    }
  }
  return best;
}
