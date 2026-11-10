// Collision data (.col, see FORMAT.md) and player-vs-world queries.
// Frame: x east, y north, z up (world metres minus manifest origin).

export const STEP = 0.45;      // max step up (m)
export const BODY_HI = 1.8;    // body height (m)
export const RADIUS = 0.3;     // body radius (m)
const MIN_NZ = Math.cos(50 * Math.PI / 180); // walkable surfaces may tilt up to 50 degrees
const CELL = 4;                // spatial grid cell (m)

export function parseCol(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== 'WCOL') throw new Error('bad .col magic');
  const nv = dv.getUint32(8, true), nt = dv.getUint32(12, true);
  let o = 16;
  const verts = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const tris = new Uint32Array(buf, o, nt * 3); o += nt * 12;
  const kind = new Uint8Array(buf, o, nt); o += nt;
  const surface = new Uint8Array(buf, o, nt);
  return { verts, tris, kind, surface, nt };
}

// One tile of collision triangles with a uniform XY grid (CSR layout: start offsets + triangle ids).
export class ColTile {
  constructor(col) {
    Object.assign(this, col);
    const { verts, tris, nt } = col;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < verts.length; i += 3) {
      const x = verts[i], y = verts[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (!(x1 >= x0)) { x0 = y0 = 0; x1 = y1 = 1; }
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.nx = Math.max(1, Math.ceil((x1 - x0) / CELL)); this.ny = Math.max(1, Math.ceil((y1 - y0) / CELL));
    // per-triangle cell range + z range
    const box = new Int32Array(nt * 4), zr = new Float32Array(nt * 2);
    const count = new Uint32Array(this.nx * this.ny + 1);
    for (let t = 0; t < nt; t++) {
      const a = tris[t * 3] * 3, b = tris[t * 3 + 1] * 3, c = tris[t * 3 + 2] * 3;
      const cx0 = this.cx(Math.min(verts[a], verts[b], verts[c])), cx1 = this.cx(Math.max(verts[a], verts[b], verts[c]));
      const cy0 = this.cy(Math.min(verts[a + 1], verts[b + 1], verts[c + 1])), cy1 = this.cy(Math.max(verts[a + 1], verts[b + 1], verts[c + 1]));
      box[t * 4] = cx0; box[t * 4 + 1] = cy0; box[t * 4 + 2] = cx1; box[t * 4 + 3] = cy1;
      zr[t * 2] = Math.min(verts[a + 2], verts[b + 2], verts[c + 2]); zr[t * 2 + 1] = Math.max(verts[a + 2], verts[b + 2], verts[c + 2]);
      for (let j = cy0; j <= cy1; j++) for (let i = cx0; i <= cx1; i++) count[j * this.nx + i + 1]++;
    }
    for (let k = 1; k < count.length; k++) count[k] += count[k - 1];
    const fill = count.slice(0, -1), ids = new Uint32Array(count[count.length - 1]);
    for (let t = 0; t < nt; t++) {
      for (let j = box[t * 4 + 1]; j <= box[t * 4 + 3]; j++)
        for (let i = box[t * 4]; i <= box[t * 4 + 2]; i++) ids[fill[j * this.nx + i]++] = t;
    }
    this.start = count; this.ids = ids; this.zr = zr;
  }
  cx(x) { return Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.x0) / CELL))); }
  cy(y) { return Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.y0) / CELL))); }
  contains(x, y, m = 0) { return x >= this.x0 - m && x <= this.x1 + m && y >= this.y0 - m && y <= this.y1 + m; }

  // Height of triangle t at (x, y), or NaN if outside / too steep.
  heightAt(t, x, y) {
    const v = this.verts, a = this.tris[t * 3] * 3, b = this.tris[t * 3 + 1] * 3, c = this.tris[t * 3 + 2] * 3;
    const ax = v[a], ay = v[a + 1], bx = v[b] - ax, by = v[b + 1] - ay, cx = v[c] - ax, cy = v[c + 1] - ay;
    const d = bx * cy - by * cx;
    if (Math.abs(d) < 1e-9) return NaN;
    const px = x - ax, py = y - ay;
    const u = (px * cy - py * cx) / d, w = (bx * py - by * px) / d;
    if (u < -1e-6 || w < -1e-6 || u + w > 1 + 1e-6) return NaN;
    const bz = v[b + 2] - v[a + 2], cz = v[c + 2] - v[a + 2];
    // normal tilt check: n = (b x c); nz = d
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz;
    if (Math.abs(d) < MIN_NZ * Math.hypot(nx, ny, d)) return NaN;
    return v[a + 2] + u * bz + w * cz;
  }

  // Index of the topmost non-vertical triangle of any kind at (x, y), or -1 (for the minimap).
  topAt(x, y) {
    const c = this.cy(y) * this.nx + this.cx(x), v = this.verts;
    let best = -1, bz = -Infinity;
    for (let k = this.start[c]; k < this.start[c + 1]; k++) {
      const t = this.ids[k];
      if (this.zr[t * 2 + 1] <= bz) continue;
      const a = this.tris[t * 3] * 3, b = this.tris[t * 3 + 1] * 3, cc = this.tris[t * 3 + 2] * 3;
      const ax = v[a], ay = v[a + 1], bx = v[b] - ax, by = v[b + 1] - ay, cx = v[cc] - ax, cy = v[cc + 1] - ay;
      const d = bx * cy - by * cx;
      if (Math.abs(d) < 1e-6) continue;
      const px = x - ax, py = y - ay, u = (px * cy - py * cx) / d, w = (bx * py - by * px) / d;
      if (u < 0 || w < 0 || u + w > 1) continue;
      const z = v[a + 2] + u * (v[b + 2] - v[a + 2]) + w * (v[cc + 2] - v[a + 2]);
      if (z > bz) { bz = z; best = t; }
    }
    return best;
  }

  // Highest kind-1/2 surface at (x, y) with z <= zmax; writes into best {z, kind, surface}.
  // With roofs, upward-facing solid triangles (building roofs) count as walkable too (surface 0). Only the
  // player's own movement uses that; the KPI harness and teleport placement use the plain rules.
  support(x, y, zmax, best, roofs = false) {
    const c = this.cy(y) * this.nx + this.cx(x);
    for (let k = this.start[c]; k < this.start[c + 1]; k++) {
      const t = this.ids[k], kd = this.kind[t];
      if ((kd === 0 && !roofs) || this.zr[t * 2] > zmax || this.zr[t * 2 + 1] < best.z) continue;
      if (kd === 0 && !this.facesUp(t)) continue;
      const z = this.heightAt(t, x, y);
      if (z <= zmax && z > best.z) { best.z = z; best.kind = kd || 1; best.surface = this.surface[t]; }
    }
  }

  facesUp(t) {
    const v = this.verts, a = this.tris[t * 3] * 3, b = this.tris[t * 3 + 1] * 3, c = this.tris[t * 3 + 2] * 3;
    return (v[b] - v[a]) * (v[c + 1] - v[a + 1]) - (v[b + 1] - v[a + 1]) * (v[c] - v[a]) > 0;
  }

  // Does any solid triangle cross the body cylinder at (x, y) between heights zlo and zhi?
  blocked(x, y, zlo, zhi, r) {
    const i0 = this.cx(x - r), i1 = this.cx(x + r), j0 = this.cy(y - r), j1 = this.cy(y + r);
    const v = this.verts;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * this.nx + i;
      for (let k = this.start[c]; k < this.start[c + 1]; k++) {
        const t = this.ids[k];
        if (this.kind[t] !== 0 || this.zr[t * 2] > zhi || this.zr[t * 2 + 1] < zlo) continue;
        let poly = [];
        for (let q = 0; q < 3; q++) { const p = this.tris[t * 3 + q] * 3; poly.push([v[p], v[p + 1], v[p + 2]]); }
        poly = clipZ(clipZ(poly, zlo, 1), zhi, -1);
        if (poly.length && polyDist2(poly, x, y) < r * r) return true;
      }
    }
    return false;
  }
}

// Keep the part of a polygon with s*(z - z0) >= 0.
function clipZ(poly, z0, s) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = s * (p[2] - z0), dq = s * (q[2] - z0);
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) {
      const f = dp / (dp - dq);
      out.push([p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1]), z0]);
    }
  }
  return out;
}

// Squared XY distance from (x, y) to a polygon's projection (0 if inside).
function polyDist2(poly, x, y) {
  let best = Infinity, inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) inside = !inside;
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    const f = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2)) : 0;
    const dx = ax + f * ex - x, dy = ay + f * ey - y;
    best = Math.min(best, dx * dx + dy * dy);
  }
  return inside ? 0 : best;
}

// The set of loaded collision tiles.
export class CollisionWorld {
  constructor() { this.tiles = new Map(); }
  add(id, tile) { this.tiles.set(id, tile); }
  remove(id) { this.tiles.delete(id); }
  covered(x, y) { for (const t of this.tiles.values()) if (t.contains(x, y)) return true; return false; }
  // Highest walkable-or-water surface under (x, y) at or below zmax: {z, kind, surface} or null.
  support(x, y, zmax, roofs = false) {
    const best = { z: -Infinity, kind: -1, surface: 0 };
    for (const t of this.tiles.values()) if (t.contains(x, y)) t.support(x, y, zmax, best, roofs);
    return best.kind < 0 ? null : best;
  }
  // Does a solid triangle cross the body column from feet + lo to feet + hi (default: above a step up to head height)?
  blocked(x, y, feet, r = RADIUS, lo = STEP + 0.01, hi = BODY_HI) {
    for (const t of this.tiles.values()) if (t.contains(x, y, r) && t.blocked(x, y, feet + lo, feet + hi, r)) return true;
    return false;
  }
  // Where a player at (x, y) with feet at `feet` would stand, or null if not allowed (no ground, water, wall).
  // opts: roofs (stand on roofs), water (allow wading out of water), hi (body height, lower when crouching).
  standAt(x, y, feet, opts = {}) {
    const s = this.support(x, y, feet + STEP, opts.roofs);
    if (!s || (s.kind !== 1 && !(opts.water && s.kind === 2))) return null;
    if (this.blocked(x, y, Math.max(s.z, feet), RADIUS, STEP + 0.01, opts.hi ?? BODY_HI)) return null;
    return s.z;
  }
}
