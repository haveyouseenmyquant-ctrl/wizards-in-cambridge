"""Parametric roofs (EnvVFX s4, task dd7b; Gaspard 2026-11-10: "roofs look like height maps, not natural roofs").

Instead of meshing the raw 1 m DSM per footprint (build.add_lidar_roof), every building gets a clean roof built from
a few parameters fitted to the DSM:

  flat     flat roof at the DSM's upper-middle level with a parapet (lead/asphalt grey)
  gable    ridge along the long (gable_long) or short (gable_short) axis of the footprint's minimum rotated rectangle
  hip      four planes meeting a ridge (straight skeleton of the rectangle)
  mansard  steep (~70 deg) lower slopes, shallow upper slopes, on the hip skeleton
  lean_to  one plane (least-squares fit)

Pitch is a grid search (15-60 deg) on the DSM pixels in the footprint, eave = 15th percentile, ridge capped at the
95th percentile (a capped roof gets a flat top, like a real truncated roof). The surface z = eave + min(s*g, cap) is
piecewise planar: the footprint is split along every break line (ridges, hips, cap contours) and each piece is
earcut, so ridges and eaves are exactly straight. Walls rise to the roof edge (gable ends become triangles).
Roofs overhang the walls by OVERHANG except where another footprint touches (terraces), have a soffit and fascia
(thickness THICK), a ridge cap, and chimney stacks where the DSM shows a small blob well above the fitted roof.
Materials are vertex colours: slate, clay tile, weathered tile, lead.
"""
import math
import zlib

import mapbox_earcut as earcut
import numpy as np
from scipy.ndimage import label
from shapely.geometry import LineString, Polygon
from shapely.ops import split

OVERHANG, THICK = 0.35, 0.16
PARAPET_W, PARAPET_H = 0.3, 0.6
SLOPES = np.tan(np.radians(np.arange(15, 61, 2.5)))
STATS = {}

SLATE = np.array([0.30, 0.32, 0.36])
TILE = np.array([0.55, 0.31, 0.23])
TILE_OLD = np.array([0.46, 0.34, 0.28])
LEAD = np.array([0.47, 0.49, 0.50])
BRICK = np.array([0.52, 0.30, 0.24])
RIDGE = np.array([0.24, 0.22, 0.22])


def _frame(P):
    """Centre, long-axis unit vector a, normal n, half lengths L >= W of the minimum rotated rectangle."""
    C = np.asarray(P.minimum_rotated_rectangle.exterior.coords)[:4]
    e1, e2 = C[1] - C[0], C[2] - C[1]
    l1, l2 = np.linalg.norm(e1), np.linalg.norm(e2)
    if l1 < l2:
        e1, e2, l1, l2 = e2, e1, l2, l1
    a = e1 / max(l1, 1e-9)
    return C.mean(0), a, np.array([-a[1], a[0]]), l1 / 2, l2 / 2


def _shape(kind, u, v, L, W):
    """Shape function g (metres of horizontal distance from the eave line), unclipped below zero."""
    if kind == "gable_long":
        return W - np.abs(v)
    if kind == "gable_short":
        return L - np.abs(u)
    return np.minimum(W - np.abs(v), L - np.abs(u))   # hip, mansard


MK = 1.2   # mansard: horizontal width of the steep lower slope (m)


def _z(f, xy):
    u = (xy - f["c"]) @ f["a"]; v = (xy - f["c"]) @ f["n"]
    if f["kind"] == "flat":
        return np.full(len(xy), f["e"])
    if f["kind"] == "lean_to":
        return f["e"] + f["pa"] * u + f["pb"] * v
    g = _shape(f["kind"], u, v, f["L"], f["W"])
    if f["kind"] == "mansard":
        h = np.where(g < MK, g * 2.75, MK * 2.75 + (g - MK) * f["s"])
        return f["e"] + np.minimum(h, f["cap"])
    return f["e"] + np.minimum(f["s"] * g, f["cap"])


def fit(P, R, M, O, dmed, zmin=-1e9):
    """P: footprint polygon (local frame). R/M/O: DSM window, footprint mask, local coords of pixel (0,0) centre."""
    c, a, n, L, W = _frame(P)
    ii, jj = np.nonzero(M)
    xy = np.c_[O[0] + jj, O[1] - ii].astype(float)
    z = R[ii, jj].astype(float)
    f = dict(c=c, a=a, n=n, L=L, W=W)
    if len(z) < 6:
        return None
    e = max(float(np.percentile(z, 15)), dmed + 2.5, zmin)
    top = float(np.percentile(z, 95))
    u = (xy - c) @ a; v = (xy - c) @ n
    if top - e < 1.2 or W < 2.0:
        f.update(kind="flat", e=max(float(np.percentile(z, 70)), dmed + 2.5, zmin))
        return f
    cap = top - e
    best = None
    for kind in ("gable_long", "gable_short", "hip", "mansard"):
        g = np.maximum(_shape(kind, u, v, L, W), 0)
        for s in (SLOPES if kind != "mansard" else np.tan(np.radians([10, 15, 20, 25, 30]))):
            if kind == "mansard":
                h = np.where(g < MK, g * 2.75, MK * 2.75 + (g - MK) * s)
            else:
                h = s * g
            pred = e + np.minimum(h, cap)
            rms = float(np.sqrt(np.mean(np.minimum(np.abs(pred - z), 3.0) ** 2)))
            rms *= {"gable_long": 0.97, "gable_short": 0.97, "hip": 1.0, "mansard": 1.06}[kind]   # prefer simple gables
            if best is None or rms < best[0]:
                best = (rms, kind, float(s))
    # lean-to: one least-squares plane, pitch clamped to 45 deg
    A = np.c_[u, v, np.ones(len(z))]
    w = np.linalg.lstsq(A, z, rcond=None)[0]
    gr = math.hypot(w[0], w[1])
    if gr > 1.0:
        w[:2] /= gr
    lrms = float(np.sqrt(np.mean(np.minimum(np.abs(A @ w - z), 3.0) ** 2)))
    if lrms < best[0] * 0.8 and gr > np.tan(np.radians(8)):
        f.update(kind="lean_to", e=float(w[2]), pa=float(w[0]), pb=float(w[1]), rms=lrms)
    else:
        f.update(kind=best[1], s=best[2], e=e, cap=cap, rms=best[0])
    # chimneys: small blobs of DSM pixels well above the fitted roof, away from the footprint edge
    res = np.full(R.shape, -9.0)
    res[ii, jj] = z - _z(f, xy)
    lab, k = label(res > 1.0)
    ch = []
    for i in range(1, min(k, 12) + 1):
        bi, bj = np.nonzero(lab == i)
        if 1 <= len(bi) <= 6:
            px = np.array([O[0] + bj.mean(), O[1] - bi.mean()])
            from shapely.geometry import Point
            if P.buffer(-0.6).contains(Point(px)):
                ch.append((px, float(min(res[bi, bj].max(), 2.5)), len(bi)))
    f["chimneys"] = ch[:4]
    return f


def _lines(f):
    """Break lines (local-frame LineStrings) where the roof surface changes plane."""
    c, a, n, L, W = f["c"], f["a"], f["n"], f["L"], f["W"]
    big = 2 * (L + W) + 20
    out = []

    def uv_line(p, d):   # point p and direction d, both in (u, v)
        P0 = c + a * p[0] + n * p[1]; D = a * d[0] + n * d[1]
        out.append(LineString([P0 - D * big, P0 + D * big]))
    k = f["kind"]
    if k in ("flat", "lean_to"):
        return out
    s = f["s"]
    if k == "mansard":
        levels = [MK]
        hm = MK * 2.75
        if f["cap"] > hm:
            levels.append(MK + (f["cap"] - hm) / max(s, 1e-6))
    else:
        levels = [f["cap"] / s]
    if k in ("gable_long", "hip", "mansard"):
        uv_line((0, 0), (1, 0))
        for lv in levels:
            if lv < W:
                uv_line((0, W - lv), (1, 0)); uv_line((0, -(W - lv)), (1, 0))
    if k in ("gable_short", "hip", "mansard"):
        uv_line((0, 0), (0, 1))
        for lv in levels:
            if lv < L:
                uv_line((L - lv, 0), (0, 1)); uv_line((-(L - lv), 0), (0, 1))
    if k in ("hip", "mansard"):
        for sg in (1, -1):
            uv_line((L - W, 0), (1, sg)); uv_line((-(L - W), 0), (1, sg))
    return out


def _pieces(Q, lines):
    cells = [Q]
    for ln in lines:
        nxt = []
        for cpoly in cells:
            if ln.intersects(cpoly):
                nxt += [g for g in split(cpoly, ln).geoms if g.geom_type == "Polygon" and g.area > 1e-4]
            else:
                nxt.append(cpoly)
        cells = nxt
    return cells


def _earcut(polys):
    T = []
    for p in polys:
        rings = [np.asarray(p.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in p.interiors]
        rings = [r for r in rings if len(r) >= 3]
        if not rings:
            continue
        v = np.concatenate(rings)
        ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
        idx = earcut.triangulate_float64(v, ends).reshape(-1, 3)
        t = v[idx]
        cr = (t[:, 1, 0] - t[:, 0, 0]) * (t[:, 2, 1] - t[:, 0, 1]) - (t[:, 1, 1] - t[:, 0, 1]) * (t[:, 2, 0] - t[:, 0, 0])
        t[cr < 0] = t[cr < 0][:, ::-1]
        T.append(t)
    return np.concatenate(T) if T else np.zeros((0, 3, 2))


def _boundary(T):
    A = T[:, [0, 1, 2]].reshape(-1, 2); B = T[:, [1, 2, 0]].reshape(-1, 2)
    ka = np.round(A * 1000).astype(np.int64); kb = np.round(B * 1000).astype(np.int64)
    lo = (ka[:, 0] < kb[:, 0]) | ((ka[:, 0] == kb[:, 0]) & (ka[:, 1] < kb[:, 1]))
    key = np.where(lo[:, None], np.c_[ka, kb], np.c_[kb, ka])
    _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True)
    e = cnt[inv.ravel()] == 1
    return A[e], B[e]


def _quads(a, b, za0, zb0, za1, zb1):
    k = len(a)
    za0, zb0, za1, zb1 = (np.broadcast_to(np.asarray(z, float), (k,)) for z in (za0, zb0, za1, zb1))
    A0 = np.c_[a, za0]; B0 = np.c_[b, zb0]; A1 = np.c_[a, za1]; B1 = np.c_[b, zb1]
    return np.concatenate([np.stack([A0, B0, B1], 1), np.stack([A0, B1, A1], 1)])


def colour(f, oid, tone):
    h = (zlib.crc32(oid.encode()) & 0xffff) / 65535.0
    if f["kind"] == "flat":
        c = LEAD
    elif f["kind"] == "mansard":
        c = SLATE
    else:
        c = SLATE if h < 0.5 else TILE if h < 0.85 else TILE_OLD
    return np.clip(c + tone * 0.6, 0, 1)


def build(m, P, z0, f, wall, roofc, neigh=None, bottom=False):
    """Add walls + roof for footprint P (local frame) to Mesh m. neigh: union of touching footprints (no overhang
    there). Returns True."""
    STATS[f["kind"]] = STATS.get(f["kind"], 0) + 1
    if f["kind"] == "flat":
        zt = f["e"]
        inner = P.buffer(-PARAPET_W, join_style=2)
        T = _earcut([P])
        a, b = _boundary(T)
        m.tris(_quads(a, b, z0, z0, zt + PARAPET_H, zt + PARAPET_H), wall, 0)
        polys = [g for g in getattr(inner, "geoms", [inner]) if g.geom_type == "Polygon" and not g.is_empty]
        Ti = _earcut(polys)
        if len(Ti):
            m.tris(np.concatenate([Ti, np.full((len(Ti), 3, 1), zt)], 2), roofc, 0)
            ia, ib = _boundary(Ti)   # parapet inner faces (inner boundary seen from inside: reversed edges)
            m.tris(_quads(ib, ia, zt, zt, zt + PARAPET_H, zt + PARAPET_H), wall * 0.9, 0)
            ring = P.difference(inner)
            Tr = _earcut([g for g in getattr(ring, "geoms", [ring]) if g.geom_type == "Polygon"])
            if len(Tr):
                m.tris(np.concatenate([Tr, np.full((len(Tr), 3, 1), zt + PARAPET_H)], 2), LEAD * 0.85, 0)
        else:
            m.tris(np.concatenate([T, np.full((len(T), 3, 1), zt + PARAPET_H)], 2), roofc, 0)
        if bottom:
            m.tris(np.concatenate([T[:, ::-1], np.full((len(T), 3, 1), z0)], 2), roofc, 0)
        return True
    lines = _lines(f)
    # walls: footprint split along the break lines, walls up to the roof edge
    T = _earcut(_pieces(P, lines))
    a, b = _boundary(T)
    m.tris(_quads(a, b, z0, z0, _z(f, a), _z(f, b)), wall, 0)
    if bottom:
        m.tris(np.concatenate([T[:, ::-1], np.full((len(T), 3, 1), z0)], 2), roofc, 0)
    # roof: overhanging outline (not into touching footprints), top + soffit + fascia
    Q = P.buffer(OVERHANG, join_style=2, mitre_limit=2.0)
    if neigh is not None and not neigh.is_empty:
        Q = Q.difference(neigh.buffer(0.02)).union(P)
    Q = Q.buffer(0)
    if Q.geom_type != "Polygon":
        Q = max(getattr(Q, "geoms", [P]), key=lambda g: g.area if g.geom_type == "Polygon" else 0)
    Tr = _earcut(_pieces(Q, lines))
    Zr = _z(f, Tr.reshape(-1, 2)).reshape(-1, 3, 1)
    m.tris(np.concatenate([Tr, Zr], 2), roofc, 0)
    m.tris(np.concatenate([Tr[:, ::-1], Zr[:, ::-1] - THICK], 2), wall * 0.62, 0)
    ra, rb = _boundary(Tr)
    za, zb = _z(f, ra), _z(f, rb)
    m.tris(_quads(ra, rb, za - THICK, zb - THICK, za, zb), roofc * 0.8, 0)
    # ridge cap along the ridge line (gables, hips) when the ridge is not capped flat
    k = f["kind"]
    if k in ("gable_long", "gable_short", "hip") and f["s"] * (f["W"] if k != "gable_short" else f["L"]) <= f["cap"] + 1e-3:
        c, A, N, L, W = f["c"], f["a"], f["n"], f["L"], f["W"]
        if k == "gable_long":
            p0, p1 = c - A * (L + 5), c + A * (L + 5)
        elif k == "gable_short":
            p0, p1 = c - N * (W + 5), c + N * (W + 5)
        else:
            p0, p1 = c - A * (L - W), c + A * (L - W)
        seg = LineString([p0, p1]).intersection(Q) if np.linalg.norm(p1 - p0) > 0.2 else None
        for sgm in ([] if seg is None or seg.is_empty else getattr(seg, "geoms", [seg])):
            if sgm.geom_type != "LineString" or sgm.length < 0.5:
                continue
            q = np.asarray(sgm.coords)[[0, -1]]
            d = (q[1] - q[0]) / np.linalg.norm(q[1] - q[0]); nn = np.array([-d[1], d[0]]) * 0.17
            zr = float(_z(f, q[:1])[0])
            top = np.c_[q, [zr + 0.09, zr + 0.09]]
            for sg in (1, -1):
                side = np.c_[q + sg * nn, [zr - 0.03, zr - 0.03]]
                quad = np.stack([side[0], side[1], top[1]], 0), np.stack([side[0], top[1], top[0]], 0)
                tri = np.stack(quad)
                m.tris(np.concatenate([tri, tri[:, ::-1]]), RIDGE, 0)   # both windings: tiny, never culled
    # chimney stacks
    for px, h, npx in f.get("chimneys", []):
        hw = 0.45 if npx <= 2 else 0.7
        zb = float(_z(f, px[None])[0]) - 0.3
        sq = Polygon([px + f["a"] * sx * hw + f["n"] * sy * 0.4 for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        Tc = _earcut([sq])
        ca, cb = _boundary(Tc)
        zt = zb + 0.3 + max(h, 1.0)
        m.tris(_quads(ca, cb, zb, zb, zt, zt), BRICK, 0)
        m.tris(np.concatenate([Tc, np.full((len(Tc), 3, 1), zt)], 2), BRICK * 0.7, 0)
    return True
