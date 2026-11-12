"""Parametric facade parts library (session 30, Market Square zone).

Everything works in a wall-local frame: x = metres along the wall (p0 -> p1), y = outward from the original wall
plane, z = metres above the wall's ground_z. A `Parts` accumulator collects triangles (k,3,3), the intended
outward normal of each triangle (k,3) and a per-triangle sRGB colour (k,3); `zone_build.py` maps them to the
collision frame and fixes the winding from the intended normals (the local frame is left-handed there).

The real tile wall stays at y = 0. The facade skin is a sheet at y = SKIN (0.25 m) with real openings; reveals run
back from the skin to the glass / door leaf just outside the wall plane (y = GLASS), so the depth is geometry.
"""
import hashlib
import math

import mapbox_earcut as earcut
import numpy as np
from shapely.geometry import MultiPolygon, Polygon, box
from shapely.ops import unary_union

SKIN = 0.25    # skin plane, metres outside the wall
GLASS = 0.07   # glass / door leaf plane (just proud of the tile wall and the photo-facade quads at 0.04)
GLASS_COL = "#2b3034"
STOREY = 3.2
BAY = 2.8


def rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def shade(c, k):
    return np.clip(np.asarray(c, float) * k, 0, 1)


def polys(g):
    if g is None or g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    return [q for q in getattr(g, "geoms", []) if isinstance(q, Polygon) and q.area > 1e-4]


def earcut2d(poly):
    """(k,3,2) triangles of a shapely polygon (with holes)."""
    rings = [np.asarray(poly.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in poly.interiors]
    rings = [r for r in rings if len(r) >= 3]
    if not rings:
        return np.zeros((0, 3, 2))
    v = np.concatenate(rings).astype(np.float64)
    ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
    idx = np.asarray(earcut.triangulate_float64(v, ends)).reshape(-1, 3)
    return v[idx]


# Surface material ids (per triangle; zone_build writes them as the _MAT vertex attribute, site/app/zone.js shades
# them procedurally: brick coursing, ashlar joints, render noise, glass reflection, painted timber sheen).
MATS = {"plain": 0, "brick": 1, "stone": 2, "render": 3, "stucco": 3, "timber": 4, "frame": 4, "glass": 5,
        "flint": 6, "trim": 7, "interior": 8, "lamp": 9, "shopglass": 10}
# s11 EnvVFX: 8 = shop interior surfaces (self-lit warm in zone.js: inside the tile building's shadow), 9 = lamp bulbs /
# lit shades (emissive), 10 = see-through shop glass (zone_build moves it to the transparent "shopglass" node)


def mat_id(m, default=0):
    if m is None:
        return default
    if isinstance(m, str):
        return MATS.get(m.lower(), default)
    return int(m)


def wall_material(ann):
    """Wall surface material: the annotation's `material`, else guessed from the wall colour (red/brown -> brick,
    pale -> render, buff -> gault brick or ashlar)."""
    m = ann.get("material")
    if m in MATS:
        return m
    c = rgb(ann.get("wall_colour", "#b9a784"))
    if c[0] - c[2] > 0.25:
        return "brick"
    if c.mean() > 0.78:
        return "render"
    return "brick" if int(hashlib.md5(str(ann.get("id", "")).encode()).hexdigest()[:2], 16) % 3 == 0 else "stone"


class Parts:
    """mat: default material of the wall surface; per-triangle ids are explicit (`mat=` on any emitter) or inferred
    in mats(): glass colour -> glass, colour proportional to wall_col -> wall material, thin parts at the glass plane
    (frames, glazing bars, door leaves, stallrisers) -> painted timber, everything else -> trim."""

    def __init__(self, mat="render", wall_col=None):
        self.t, self.n, self.c = [], [], []
        self.m = []
        self.mat = mat_id(mat, 3)
        self.wall_col = None if wall_col is None else np.asarray(wall_col, float)
        self.counts = {}
        self.detail_area = 0.0   # facade area (m2, projected on the wall) covered by modelled 3D elements
        self.cuts = []           # (x0, x1, z0, z1) in the wall frame: tile wall cut away behind see-through shop glass

    def count(self, kind, k=1):
        self.counts[kind] = self.counts.get(kind, 0) + k

    def add(self, T, n, col, mat=None):
        T = np.asarray(T, float).reshape(-1, 3, 3)
        if not len(T):
            return
        self.t.append(T)
        self.n.append(np.tile(np.asarray(n, float), (len(T), 1)) if np.ndim(n) == 1 else np.asarray(n, float))
        self.c.append(np.tile(np.asarray(col, float), (len(T), 1)))
        self.m.append(np.full(len(T), mat_id(mat, -1), np.int16))

    def quad(self, a, b, c, d, n, col, mat=None):
        self.add([[a, b, c], [a, c, d]], n, col, mat)

    def face_xz(self, g, y, col, n=(0, 1, 0), mat=None):
        """Polygon(s) in the xz plane at depth y."""
        for p in polys(g):
            T2 = earcut2d(p)
            if len(T2):
                self.add(np.stack([T2[..., 0], np.full(T2.shape[:2], y), T2[..., 1]], -1), n, col, mat)

    def sides_xz(self, g, y0, y1, col, inward=False, skip_ground=False, mat=None):
        """Extrude the boundary rings of polygon(s) between y0 and y1. Normals point out of the polygon, or into it
        (inward=True: reveals of a hole)."""
        for p in polys(g):
            for ring, hole in [(p.exterior, False)] + [(r, True) for r in p.interiors]:
                P = np.asarray(ring.coords)
                if ring.is_ccw == hole:   # make exterior rings CCW in (x,z), holes CW
                    P = P[::-1]
                for (ax, az), (bx, bz) in zip(P[:-1], P[1:]):
                    if skip_ground and az < 0.01 and bz < 0.01:
                        continue
                    L = math.hypot(bx - ax, bz - az)
                    if L < 1e-4:
                        continue
                    nx, nz = (bz - az) / L, -(bx - ax) / L   # right of a CCW edge = outward
                    if inward:
                        nx, nz = -nx, -nz
                    self.quad((ax, y0, az), (bx, y0, bz), (bx, y1, bz), (ax, y1, az), (nx, 0, nz), col, mat)

    def slab(self, g, y0, y1, col, sides=True, mat=None):
        """Polygon(s) extruded from y0 (against the wall, back face omitted) to a front face at y1."""
        self.face_xz(g, y1, col, mat=mat)
        if sides:
            self.sides_xz(g, y0, y1, col, mat=mat)

    def box(self, x0, x1, y0, y1, z0, z1, col, top=True, bottom=True, mat=None):
        """Axis box; the back face (y0) is omitted."""
        self.slab(box(x0, z0, x1, z1), y0, y1, col, sides=False, mat=mat)
        self.quad((x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1), (-1, 0, 0), col, mat)
        self.quad((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1), (1, 0, 0), col, mat)
        if top:
            self.quad((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), (0, 0, 1), col, mat)
        if bottom:
            self.quad((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (0, 0, -1), col, mat)

    def lathe(self, cx, cy, prof, col, n=8, mat=None, sy=1.0):
        """Solid of revolution about the vertical axis at (cx, cy): prof = [(r, z), ...] bottom to top (r=0 ends are
        closed); sy squashes the depth (oval bodies, torso stands). Flat-shaded faces (s5 EnvVFX: rounded goods)."""
        a = np.arange(n) * 2 * np.pi / n
        ring = lambda r, z: [np.array([cx + r * math.cos(t), cy + r * sy * math.sin(t), z]) for t in a]  # noqa: E731
        R = [ring(r, z) for r, z in prof]
        for k in range(len(R) - 1):
            for i in range(n):
                j = (i + 1) % n
                p0, p1, q1, q0 = R[k][i], R[k][j], R[k + 1][j], R[k + 1][i]
                nn = np.cross(p1 - p0, q0 - p0) if prof[k][0] > 1e-6 else np.cross(q1 - p0, q0 - p0)
                L = np.linalg.norm(nn)
                if L < 1e-12:
                    continue
                nn = nn / L
                if prof[k][0] > 1e-6:
                    self.add([[p0, p1, q1]], nn, col, mat)
                if prof[k + 1][0] > 1e-6:
                    self.add([[p0, q1, q0]], nn, col, mat)
        for (r, z), Rk, s_ in ((prof[0], R[0], -1), (prof[-1], R[-1], 1)):
            if r > 1e-6:   # flat cap
                c = np.array([cx, cy, z])
                for i in range(n):
                    j = (i + 1) % n
                    self.add([[c, Rk[i], Rk[j]] if s_ > 0 else [c, Rk[j], Rk[i]]], (0, 0, s_), col, mat)

    def extrude_profile(self, prof, x0, x1, col, mat=None):
        """Profile [(y, z), ...] traversed counter-clockwise in the (y, z) plane (y right, z up), from the wall at the
        bottom outwards and back to the wall at the top; extruded along x from x0 to x1, with end caps."""
        P = np.asarray(prof, float)
        for (ay, az), (by, bz) in zip(P[:-1], P[1:]):
            L = math.hypot(by - ay, bz - az)
            if L < 1e-5:
                continue
            ny, nz = (bz - az) / L, -(by - ay) / L
            self.quad((x0, ay, az), (x1, ay, az), (x1, by, bz), (x0, by, bz), (0, ny, nz), col, mat)
        T2 = earcut2d(Polygon(P))
        for x, nx in ((x0, -1), (x1, 1)):
            self.add(np.stack([np.full(T2.shape[:2], x), T2[..., 0], T2[..., 1]], -1), (nx, 0, 0), col, mat)

    def arrays(self):
        if not self.t:
            return np.zeros((0, 3, 3)), np.zeros((0, 3)), np.zeros((0, 3))
        return np.concatenate(self.t), np.concatenate(self.n), np.concatenate(self.c)

    def mats(self):
        """(k,) per-triangle material ids aligned with arrays() (see the class docstring for the inference)."""
        if not self.t:
            return np.zeros(0, np.int16)
        m = np.concatenate(self.m).copy()
        auto = m < 0
        if auto.any():
            T, C = np.concatenate(self.t), np.concatenate(self.c)
            a = np.full(len(m), MATS["trim"], np.int16)
            ys = T[..., 1]
            a[(ys.max(1) <= SKIN - 0.05) & (ys.min(1) >= -0.01)] = MATS["frame"]
            if self.wall_col is not None:
                r = C / np.maximum(self.wall_col, 1e-3)
                a[(np.ptp(r, 1) < 0.02) & (r.mean(1) > 0.6) & (r.mean(1) < 1.15)] = self.mat
            a[np.abs(C - rgb(GLASS_COL)).max(1) < 0.02] = MATS["glass"]
            m[auto] = a[auto]
        return m


# ---------------------------------------------------------------- opening shapes (polygons in the xz plane)

def arc(cx, cz, r, a0, a1, n):
    a = np.linspace(a0, a1, n + 1)
    return list(zip(cx + r * np.cos(a), cz + r * np.sin(a)))


def opening_shape(xc, w, z0, h, head="flat"):
    x0, x1 = xc - w / 2, xc + w / 2
    if head == "arched" and h > w / 2 + 0.2:
        zs = z0 + h - w / 2
        return Polygon([(x0, z0), (x1, z0)] + arc(xc, zs, w / 2, 0, math.pi, 8) + [(x0, z0)])
    if head == "pointed" and h > w * 0.87 + 0.2:   # equilateral gothic arch
        zs = z0 + h - w * 0.866
        right = arc(x0, zs, w, 0, math.pi / 3, 4)
        left = arc(x1, zs, w, 2 * math.pi / 3, math.pi, 4)
        return Polygon([(x0, z0), (x1, z0)] + right + left[1:])
    return box(x0, z0, x1, z0 + h)


# ---------------------------------------------------------------- elements

def window(P, el, wall_col, trim_col, yb=SKIN):
    """Returns the opening polygon (for the skin). Adds reveals, glass, frame + glazing bars, sill and head."""
    xc, w, z0, h = el["x"], el.get("w", 1.0), el.get("z", 1.0), el.get("h", 1.6)
    head = el.get("head", "pointed" if el.get("style") == "gothic" else "flat")
    op = opening_shape(xc, w, z0, h, head)
    P.sides_xz(op, GLASS, yb, shade(wall_col, 0.82), inward=True)
    P.face_xz(op, GLASS, rgb(GLASS_COL))
    cols, rows = el.get("panes", [2, 2])
    fw = 0.07 if w > 0.6 else 0.05
    inner = op.buffer(-fw, join_style=2)
    bars = []
    bw = 0.035
    (bx0, bz0, bx1, bz1) = inner.bounds if not inner.is_empty else op.bounds
    for i in range(1, max(1, int(cols))):
        x = bx0 + (bx1 - bx0) * i / cols
        bars.append(box(x - bw / 2, bz0, x + bw / 2, bz1))
    rz1 = bz1 if head == "flat" else min(bz1, z0 + h - w * (0.5 if head == "arched" else 0.866))
    for j in range(1, max(1, int(rows))):
        z = bz0 + (rz1 - bz0) * j / rows
        bars.append(box(bx0, z - (bw if j == rows // 2 and rows % 2 == 0 else bw / 2), bx1, z + bw / 2))
    frame = unary_union([op.difference(inner)] + [b.intersection(inner) for b in bars])
    P.slab(frame, GLASS, GLASS + 0.05, trim_col, sides=False)
    if el.get("sill", True):
        P.box(xc - w / 2 - 0.08, xc + w / 2 + 0.08, GLASS, yb + 0.07, z0 - 0.09, z0, trim_col, bottom=True)
        P.detail_area += (w + 0.16) * 0.09
    zt = op.bounds[3]
    if head == "pediment":
        tri = Polygon([(xc - w / 2 - 0.2, zt + 0.05), (xc + w / 2 + 0.2, zt + 0.05), (xc, zt + 0.05 + 0.35 * w)])
        P.box(xc - w / 2 - 0.2, xc + w / 2 + 0.2, yb, yb + 0.1, zt, zt + 0.08, trim_col)
        P.slab(tri, yb, yb + 0.08, trim_col)
        P.detail_area += tri.area + (w + 0.4) * 0.08
    elif head == "flat" and el.get("lintel", True):
        P.box(xc - w / 2 - 0.06, xc + w / 2 + 0.06, yb, yb + 0.025, zt, zt + 0.16, shade(trim_col, 0.95), bottom=False)
        P.detail_area += (w + 0.12) * 0.16
    elif head in ("arched", "pointed"):   # thin archivolt band around the head
        band = op.buffer(0.1, join_style=2).difference(op).intersection(box(xc - w, zt - w * 0.9, xc + w, zt + 1))
        P.slab(band, yb, yb + 0.03, trim_col)
        P.detail_area += band.area
    P.detail_area += op.area
    P.count("window")
    return op


def door(P, el, wall_col, trim_col, yb=SKIN):
    xc, w, h = el["x"], el.get("w", 1.0), el.get("h", 2.2)
    surround = el.get("surround", "none")
    style = el.get("style", "panelled")
    fan = surround == "fanlight" or style == "arched"
    op = opening_shape(xc, w, 0, h + (w / 2 if fan else 0), "arched" if fan else ("pointed" if style == "gothic" else "flat"))
    P.sides_xz(op, GLASS, yb, shade(wall_col, 0.8), inward=True, skip_ground=True)
    leaf_col = rgb(el.get("colour", "#2e3b33"))
    leaf = op.intersection(box(xc - w, 0, xc + w, h)) if fan else op
    P.face_xz(leaf, GLASS, leaf_col)
    if fan:
        P.face_xz(op.difference(box(xc - w, 0, xc + w, h)), GLASS, rgb(GLASS_COL))
        P.box(xc - w / 2, xc + w / 2, GLASS, GLASS + 0.06, h, h + 0.06, trim_col)
    if style == "glazed":
        P.face_xz(box(xc - w / 2 + 0.12, 1.0, xc + w / 2 - 0.12, h - 0.15), GLASS + 0.01, rgb(GLASS_COL))
    else:   # four raised panels
        pw, gap = (w - 0.36) / 2, 0.12
        for i in range(2):
            x0 = xc - w / 2 + gap + i * (pw + gap)
            for z0, z1 in ((0.2, 0.95), (1.1, h - 0.18)):
                if z1 > z0 + 0.2:
                    P.box(x0, x0 + pw, GLASS, GLASS + 0.025, z0, z1, shade(leaf_col, 1.15))
    zt = op.bounds[3]
    if surround == "pilastered":
        for x in (xc - w / 2 - 0.3, xc + w / 2):
            P.box(x, x + 0.3, yb, yb + 0.1, 0, zt, trim_col, bottom=False)
        P.box(xc - w / 2 - 0.4, xc + w / 2 + 0.4, yb, yb + 0.16, zt, zt + 0.35, trim_col)
        P.detail_area += 0.6 * zt + (w + 0.8) * 0.35
    elif surround != "none":
        band = op.buffer(0.12, join_style=2).difference(op).intersection(box(xc - w, 0, xc + w, zt + 1))
        P.slab(band, yb, yb + 0.03, trim_col)
        P.detail_area += band.area
    P.detail_area += op.area
    P.count("door")
    return op


DISPLAY_COLS = ["#8c2a24", "#24406e", "#2f5a34", "#d8cdb0", "#3a3330", "#c08a2e", "#7d7f86", "#5e3858", "#e8e2d4",
                "#b8442c", "#2c6a6a"]


def window_display(P, a, b, sr, ztop, key, y0=None, pm="plain"):
    """s3 EnvVFX (judge: "shop windows empty planes"): a stocked window display as real geometry in the glazing
    reveal: a display board on the stallriser, a stepped riser and a glass shelf, goods by a per-window theme
    (books, bottles/jars, dressed torso stands, gift boxes) and white price cards. All within GLASS..GLASS+0.16."""
    rng = np.random.default_rng(int(hashlib.md5(key.encode()).hexdigest()[:8], 16))
    if b - a < 0.6 or ztop - sr < 0.9:
        return
    y0, dy = (GLASS + 0.004 if y0 is None else y0), 0.15
    mb, mt = ("timber", "trim") if pm == "plain" else (pm, pm)
    col = lambda: shade(rgb(DISPLAY_COLS[rng.integers(len(DISPLAY_COLS))]), rng.uniform(0.85, 1.1))  # noqa: E731
    board = shade(rgb("#6b4a32"), rng.uniform(0.8, 1.2))
    P.box(a, b, y0, y0 + dy, sr, sr + 0.03, board, bottom=False, mat=mb)                 # display board
    theme = int(rng.integers(4))
    zs = sr + 0.75
    shelf = theme != 2 and ztop - zs > 0.35
    if shelf:
        P.box(a, b, y0, y0 + dy * 0.8, zs, zs + 0.015, rgb("#c9d4d4"), mat=mt)               # glass shelf
    z = sr + 0.03
    x = a + 0.06
    while x < b - 0.12:
        if theme == 0:   # books / stationery: upright, face-out on stands
            w, h = rng.uniform(0.03, 0.06), rng.uniform(0.18, 0.3)
            if rng.random() < 0.25:
                w = rng.uniform(0.15, 0.2)   # face-out cover on a little easel
                P.box(x, x + w, y0 + 0.02, y0 + 0.04, z, z + h * 1.1, col(), mat=pm)
            else:
                P.box(x, x + w, y0 + 0.01, y0 + dy - 0.02, z, z + h, col(), mat=pm)
            x += w + (0.004 if rng.random() < 0.8 else 0.08)
        elif theme == 1:  # bottles / jars on the board, turned (lathe) with shoulders, necks, lids and labels
            c = col()
            cy = y0 + 0.075
            if rng.random() < 0.6:     # bottle
                r, h = rng.uniform(0.028, 0.04), rng.uniform(0.17, 0.3)
                P.lathe(x + r, cy, [(r * 0.9, z), (r, z + 0.01), (r, z + h * 0.68), (r * 0.42, z + h * 0.84),
                                    (r * 0.36, z + h), (r * 0.4, z + h + 0.004)], c, n=8, mat=pm)
                P.lathe(x + r, cy, [(r * 0.42, z + h), (r * 0.42, z + h + 0.035)],
                        rgb("#c9a75a") if rng.random() < 0.4 else shade(c, 0.45), n=6, mat=pm)        # cap / foil
                P.lathe(x + r, cy, [(r * 1.04, z + h * 0.25), (r * 1.04, z + h * 0.55)], rgb("#ece6d6"), n=8, mat=pm)
                x += 2 * r + rng.uniform(0.015, 0.05)
            else:                      # jar
                r, h = rng.uniform(0.04, 0.06), rng.uniform(0.08, 0.15)
                P.lathe(x + r, cy, [(r * 0.85, z), (r, z + 0.012), (r, z + h * 0.85), (r * 0.8, z + h)], c, n=10, mat=pm)
                P.lathe(x + r, cy, [(r * 0.85, z + h), (r * 0.85, z + h + 0.025), (r * 0.6, z + h + 0.03)],
                        shade(rgb(["#8c2a24", "#c9a75a", "#e8e2d4"][int(rng.integers(3))]), 1.0), n=10, mat=pm)
                x += 2 * r + rng.uniform(0.01, 0.04)
        elif theme == 2:  # clothes: dressed torso stands
            w = rng.uniform(0.34, 0.42)
            if x + w > b - 0.06:
                break
            c = col()
            cx = x + w / 2
            k_ = min(1.0, (ztop - z - 0.05) / 1.72)
            cy, k = y0 + 0.075, k_
            P.lathe(cx, cy, [(0.12, z), (0.0, z + 0.03)], rgb("#2a2a2a"), n=10, mat=pm)                    # base
            P.lathe(cx, cy, [(0.012, z), (0.012, z + 0.86 * k)], rgb("#2a2a2a"), n=6, mat=pm)              # pole
            top = c if rng.random() < 0.3 else col()
            # dressed torso: hips -> waist -> chest -> shoulders -> neck, oval in depth
            P.lathe(cx, cy, [(0.15, z + 0.85 * k), (0.17, z + 1.0 * k), (0.15, z + 1.2 * k)], c, n=10, mat=pm, sy=0.45)
            P.lathe(cx, cy, [(0.15, z + 1.2 * k), (0.135, z + 1.3 * k), (0.17, z + 1.48 * k), (0.19, z + 1.58 * k),
                             (0.06, z + 1.64 * k)], top, n=10, mat=pm, sy=0.45)
            P.lathe(cx, cy, [(0.045, z + 1.62 * k), (0.04, z + 1.72 * k), (0.03, z + 1.74 * k)], rgb("#d9c7b0"), n=6, mat=pm)
            x += w + rng.uniform(0.12, 0.3)
        else:             # gifts / homeware: stacked boxes
            w = rng.uniform(0.12, 0.28)
            h = 0.0
            for k in range(int(rng.integers(1, 4))):
                hh = rng.uniform(0.07, 0.16)
                ww = w * (1 - 0.15 * k)
                P.box(x + (w - ww) / 2, x + (w + ww) / 2, y0 + 0.01, y0 + dy - 0.02, z + h, z + h + hh, col(), mat=pm)
                if rng.random() < 0.5:   # ribbon band round the box
                    xc = x + w / 2
                    P.box(xc - 0.008, xc + 0.008, y0 + 0.008, y0 + dy - 0.018, z + h - 0.001, z + h + hh + 0.002,
                          rgb(["#c9a75a", "#e8e2d4", "#8c2a24"][int(rng.integers(3))]), mat=pm)
                h += hh
            x += w + rng.uniform(0.04, 0.12)
        if rng.random() < 0.12:   # price card
            P.box(x - 0.02, x + 0.06, y0 + dy - 0.012, y0 + dy - 0.008, z, z + 0.06, rgb("#f4f2ea"), mat=pm)
    if shelf:                     # small goods on the shelf
        x = a + 0.08
        while x < b - 0.1:
            w, h = rng.uniform(0.06, 0.16), rng.uniform(0.08, min(0.25, ztop - zs - 0.1))
            if rng.random() < 0.45:   # turned ware on the shelf: vase / bowl / pot
                r = w / 2
                P.lathe(x + r, y0 + 0.07, [(r * 0.6, zs + 0.015), (r, zs + 0.015 + h * 0.45), (r * 0.55, zs + 0.015 + h * 0.85),
                                          (r * 0.65, zs + 0.015 + h)], col(), n=10, mat=pm)
            else:
                P.box(x, x + w, y0 + 0.01, y0 + dy * 0.75, zs + 0.015, zs + 0.015 + h, col(), mat=pm)
            x += w + rng.uniform(0.02, 0.1)

SHOP_INTERIORS = False   # zone_build turns this on only for the generic walls (they export tile cuts + the glass node)
INTERIOR_WALLS = ["#2f4a3e", "#5a2a2a", "#d9cfb8", "#27324a", "#8a7f6e", "#e4ddd0", "#3d3530"]


def shop_interior(P, x0, x1, zf, key, D=2.8):
    """s11 EnvVFX (judge: "box-shaped shop windows", "shop interiors use primitive shapes"): a real shop room behind the
    see-through glass, inside the tile building (its wall is cut away there, zone.json "cuts"): plank floor, painted
    back and side walls, ceiling, stocked shelving units on the back wall, a counter with a till, a display table and
    pendant lamps. Everything uses the self-lit interior material (the room sits in the building's shadow)."""
    rng = np.random.default_rng(int(hashlib.md5(("in" + key).encode()).hexdigest()[:8], 16))
    m = "interior"
    yb, yf, zc = -D, GLASS - 0.01, zf + 0.15
    wall = rgb(INTERIOR_WALLS[int(rng.integers(len(INTERIOR_WALLS)))])
    wood = shade(rgb("#6b4a32"), rng.uniform(0.7, 1.25))
    col = lambda: shade(rgb(DISPLAY_COLS[rng.integers(len(DISPLAY_COLS))]), rng.uniform(0.8, 1.1))  # noqa: E731
    P.quad((x0, yb, 0.002), (x1, yb, 0.002), (x1, yf, 0.002), (x0, yf, 0.002), (0, 0, 1), shade(wood, 0.8), m)   # floor
    P.quad((x0, yb, zc), (x0, yf, zc), (x1, yf, zc), (x1, yb, zc), (0, 0, -1), rgb("#e8e2d6"), m)               # ceiling
    P.quad((x0, yb, 0), (x1, yb, 0), (x1, yb, zc), (x0, yb, zc), (0, 1, 0), wall, m)                           # back wall
    P.quad((x0, yf, 0), (x0, yb, 0), (x0, yb, zc), (x0, yf, zc), (1, 0, 0), shade(wall, 0.9), m)               # sides
    P.quad((x1, yb, 0), (x1, yf, 0), (x1, yf, zc), (x1, yb, zc), (-1, 0, 0), shade(wall, 0.9), m)
    # stocked shelving units along the back wall
    nu = max(1, int((x1 - x0 - 0.2) / 0.95))
    uw = (x1 - x0 - 0.2) / nu
    sd = 0.36
    levels = [z for z in (0.12, 0.55, 0.98, 1.41, 1.84, 2.27) if z < zc - 0.45]
    for u in range(nu):
        a, b = x0 + 0.1 + u * uw, x0 + 0.1 + (u + 1) * uw
        top = levels[-1] + 0.42
        P.box(a, b, yb, yb + 0.02, 0, top, shade(wood, 0.75), bottom=False, mat=m)                  # unit back
        for xa in (a, b - 0.04):
            P.box(xa, xa + 0.04, yb, yb + sd, 0, top, wood, bottom=False, mat=m)                 # uprights
        P.box(a, b, yb, yb + sd + 0.03, top, top + 0.06, wood, bottom=False, mat=m)              # cornice
        for z in levels:
            P.box(a + 0.04, b - 0.04, yb, yb + sd, z - 0.025, z, wood, bottom=False, mat=m)      # shelf
            kind = int(rng.integers(3))
            x = a + 0.07
            while x < b - 0.1:
                if kind == 0:     # books / boxed goods, spines out
                    w, h = rng.uniform(0.03, 0.07), rng.uniform(0.18, 0.32)
                    P.box(x, x + w, yb + 0.06, yb + sd - 0.03, z, z + h, col(), top=True, bottom=False, mat=m)
                    x += w + (0.003 if rng.random() < 0.85 else 0.06)
                elif kind == 1:   # jars / tins, turned
                    r, h = rng.uniform(0.03, 0.05), rng.uniform(0.08, 0.2)
                    c = col()
                    P.lathe(x + r, yb + sd * 0.55, [(r, z), (r, z + h), (r * 0.7, z + h + 0.02)], c, n=6, mat=m)
                    x += 2 * r + rng.uniform(0.01, 0.04)
                else:             # folded / boxed stock in stacks
                    w = rng.uniform(0.14, 0.24)
                    h = 0.0
                    c = col()
                    for k in range(int(rng.integers(1, 4))):
                        hh = rng.uniform(0.05, 0.1)
                        P.box(x, x + w, yb + 0.04, yb + sd - 0.02, z + h, z + h + hh, shade(c, 0.9 + 0.1 * k), bottom=False, mat=m)
                        h += hh
                    x += w + rng.uniform(0.02, 0.06)
    # counter with a till at one end, a display table in the middle
    cl = rng.random() < 0.5
    ca, cb = (x0 + 0.15, x0 + min(1.5, (x1 - x0) * 0.35)) if cl else (x1 - min(1.5, (x1 - x0) * 0.35), x1 - 0.15)
    P.box(ca, cb, yb + 0.9, yb + 1.5, 0, 0.92, shade(wood, 0.85), bottom=False, mat=m)
    P.box(ca - 0.03, cb + 0.03, yb + 0.87, yb + 1.53, 0.92, 0.96, shade(wood, 1.15), bottom=False, mat=m)
    tx = (ca + cb) / 2
    P.box(tx - 0.15, tx + 0.15, yb + 1.0, yb + 1.3, 0.96, 1.12, rgb("#2a2a2a"), bottom=False, mat=m)
    ta, tb = (cb + 0.5, cb + 1.7) if cl else (ca - 1.7, ca - 0.5)
    if ta > x0 + 0.2 and tb < x1 - 0.2:
        tc = shade(wood, 1.1)
        P.box(ta, tb, yf - 1.6, yf - 0.9, 0.72, 0.76, tc, mat=m)
        for lx in (ta + 0.05, tb - 0.09):
            for ly in (yf - 1.55, yf - 0.99):
                P.box(lx, lx + 0.04, ly, ly + 0.04, 0, 0.72, shade(tc, 0.8), top=False, bottom=False, mat=m)
        x = ta + 0.08
        while x < tb - 0.15:
            w, h = rng.uniform(0.12, 0.25), rng.uniform(0.05, 0.22)
            P.box(x, x + w, yf - 1.45, yf - 1.05, 0.76, 0.76 + h, col(), bottom=False, mat=m)
            x += w + rng.uniform(0.05, 0.15)
    # pendant lamps: cord, conical shade, glowing bulb
    nl = max(1, int((x1 - x0) / 1.8))
    for i in range(nl):
        lx, ly = x0 + (x1 - x0) * (i + 0.5) / nl, yb + 1.3
        zl = zc - 0.65
        P.box(lx - 0.006, lx + 0.006, ly - 0.006, ly + 0.006, zl + 0.2, zc, rgb("#1c1c1c"), top=False, bottom=False, mat=m)
        P.lathe(lx, ly, [(0.2, zl), (0.17, zl + 0.04), (0.06, zl + 0.2), (0.0, zl + 0.21)], rgb("#26352e"), n=10, mat=m)
        P.lathe(lx, ly, [(0.0, zl - 0.03), (0.06, zl + 0.02), (0.0, zl + 0.06)], rgb("#fff1d0"), n=8, mat="lamp")
    P.count("shop_interior")


def shopfront(P, el, wall_col, trim_col, yb=SKIN):
    x0, x1, z1 = el["x0"], el["x1"], el.get("z1", 3.3)
    fh = min(0.7, z1 * 0.22)
    zf = z1 - fh                         # fascia bottom = top of the glazing opening
    sr = el.get("stallriser", 0.5)
    fcol = rgb(el.get("fascia_colour", "#26343a"))
    pil = 0.25
    gx0, gx1 = x0 + pil, x1 - pil         # glazed opening between the end pilasters
    op = box(gx0, 0, gx1, zf)
    P.sides_xz(op, GLASS, yb, shade(fcol, 0.9), inward=True, skip_ground=True)
    dx = el.get("door_x")
    dw = 1.0
    if dx is not None:
        dx = min(max(dx, gx0 + dw / 2), gx1 - dw / 2)
    segs = [(gx0, gx1)] if dx is None else [(gx0, dx - dw / 2), (dx + dw / 2, gx1)]
    for a, b in segs:
        if b - a < 0.1:
            continue
        if sr > 0.05:
            P.box(a, b, GLASS, GLASS + 0.12, 0, sr, shade(fcol, 0.85), bottom=False)
        if not SHOP_INTERIORS:
            P.face_xz(box(a, sr, b, zf), GLASS, rgb(GLASS_COL))
        else:
            P.face_xz(box(a, sr, b, zf), GLASS, rgb(GLASS_COL), mat="shopglass")   # see-through (s11)
            P.cuts.append((a, b, sr, zf))
            P.box(a, b, GLASS - 0.62, GLASS - 0.01, 0, sr, shade(fcol, 0.6), bottom=False, mat="interior")  # display bed
        nm = max(1, round((b - a) / 1.4))
        for i in range(1, nm):
            x = a + (b - a) * i / nm
            P.box(x - 0.03, x + 0.03, GLASS, GLASS + 0.06, sr, zf, fcol, top=False, bottom=False)
        P.box(a, b, GLASS, GLASS + 0.06, zf - 0.55, zf - 0.5, fcol)   # transom
        if SHOP_INTERIORS:
            window_display(P, a, b, sr, zf - 0.55, f"{x0:.2f}:{a:.2f}:{el.get('fascia_colour', '')}", y0=GLASS - 0.36,
                           pm="interior")
        else:
            window_display(P, a, b, sr, zf - 0.55, f"{x0:.2f}:{a:.2f}:{el.get('fascia_colour', '')}")
    if dx is not None:   # recessed door: deep frame, glazed leaf
        P.face_xz(box(dx - dw / 2, 0, dx + dw / 2, zf), GLASS - 0.01, shade(fcol, 0.7))
        P.face_xz(box(dx - dw / 2 + 0.12, 0.9, dx + dw / 2 - 0.12, zf - 0.7), GLASS, rgb(GLASS_COL))
        for x in (dx - dw / 2, dx + dw / 2 - 0.06):
            P.box(x, x + 0.06, GLASS, GLASS + 0.12, 0, zf, fcol, top=False, bottom=False)
        P.count("shop_door")
    if SHOP_INTERIORS:
        shop_interior(P, gx0, gx1, zf, f"{x0:.2f}:{el.get('fascia_colour', '')}")
    for a in (x0, x1 - pil):              # end pilasters with corbels
        P.box(a, a + pil, yb, yb + 0.1, 0, zf, fcol, bottom=False)
    P.box(x0 - 0.05, x1 + 0.05, yb, yb + 0.12, zf, z1 - 0.12, fcol)                       # fascia board
    P.extrude_profile([(yb, z1 - 0.12), (yb + 0.2, z1 - 0.12), (yb + 0.26, z1 - 0.05), (yb + 0.26, z1),
                       (yb, z1)], x0 - 0.1, x1 + 0.1, shade(fcol, 0.8))                      # fascia cornice
    if el.get("awning"):
        acol = rgb(el["awning_colour"]) if el.get("awning_colour") else shade(fcol, 1.2)
        P.quad((x0, yb + 0.15, zf), (x1, yb + 0.15, zf), (x1, yb + 1.3, zf - 0.7), (x0, yb + 1.3, zf - 0.7),
               (0, 0.5, 0.86), acol)
        if el.get("awning_colour"):   # valance strip along the front edge (reads as a canvas awning)
            P.box(x0, x1, yb + 1.28, yb + 1.33, zf - 0.95, zf - 0.7, shade(acol, 0.9), top=False)
    P.detail_area += (x1 - x0) * z1
    P.count("shopfront")
    return op


def dormer(P, el, H, wall_col, trim_col, roof_col):
    xc, w, h = el["x"], el.get("w", 1.2), el.get("h", 1.4)
    W = w + 0.4
    x0, x1, zt = xc - W / 2, xc + W / 2, H + h
    yf, yk = 0.0, -1.6                   # front plane at the wall, cheeks run back into the roof
    rise = W * 0.45
    face = Polygon([(x0, H), (x1, H), (x1, zt), (xc, zt + rise), (x0, zt)])
    win = {"x": xc, "w": w - 0.1, "z": H + 0.2, "h": h - 0.35, "panes": [2, 2], "head": "flat", "sill": False, "lintel": False}
    op = window(P, win, wall_col, trim_col, yb=yf + 0.12)
    P.count("window", -1)               # the dormer's own window is part of the dormer element (SCHEMA.md)
    P.face_xz(face.difference(op), yf + 0.12, trim_col)
    P.quad((x0, yk, H), (x0, yf + 0.12, H), (x0, yf + 0.12, zt), (x0, yk, zt), (-1, 0, 0), wall_col)
    P.quad((x1, yf + 0.12, H), (x1, yk, H), (x1, yk, zt), (x1, yf + 0.12, zt), (1, 0, 0), wall_col)
    s = math.hypot(W / 2, rise)
    for sx in (-1, 1):                   # pitched roof with a small overhang
        e = (xc + sx * (W / 2 + 0.1), zt - 0.07)
        P.quad((e[0], yk, e[1]), (e[0], yf + 0.22, e[1]), (xc, yf + 0.22, zt + rise + 0.05), (xc, yk, zt + rise + 0.05),
               (sx * rise / s, 0, (W / 2) / s), roof_col)
    P.detail_area += face.area
    P.count("dormer")


def cornice(P, kind, z, x0, x1, col):
    if kind == "none":
        return
    y = SKIN
    if kind == "classical" or kind == "bracketed":
        prof = [(y, z - 0.45), (y + 0.06, z - 0.45), (y + 0.06, z - 0.33), (y + 0.16, z - 0.28), (y + 0.2, z - 0.18),
                (y + 0.42, z - 0.15), (y + 0.42, z - 0.08), (y + 0.5, z), (y, z)]
        P.extrude_profile(prof, x0, x1, col)
        if kind == "bracketed":
            n = max(1, int((x1 - x0) / 0.9))
            for i in range(n):
                x = x0 + (x1 - x0) * (i + 0.5) / n
                P.box(x - 0.07, x + 0.07, y, y + 0.36, z - 0.6, z - 0.15, shade(col, 0.95), top=False)
        P.detail_area += (x1 - x0) * 0.45
    else:   # simple
        prof = [(y, z - 0.25), (y + 0.08, z - 0.25), (y + 0.08, z - 0.15), (y + 0.22, z - 0.08), (y + 0.22, z), (y, z)]
        P.extrude_profile(prof, x0, x1, col)
        P.detail_area += (x1 - x0) * 0.25
    P.count("cornice")


def string_course(P, z, x0, x1, col):
    y = SKIN
    P.extrude_profile([(y, z - 0.09), (y + 0.06, z - 0.09), (y + 0.08, z - 0.03), (y + 0.08, z + 0.07), (y, z + 0.09)],
                      x0, x1, col)
    P.detail_area += (x1 - x0) * 0.18
    P.count("string_course")


def quoins(P, x0, x1, H, col):
    k = 0
    for x, sgn in ((x0, 1), (x1, -1)):
        z, i = 0.0, 0
        while z + 0.3 <= H - 0.2:
            wq = 0.55 if i % 2 == 0 else 0.32
            a, b = (x, x + wq) if sgn > 0 else (x - wq, x)
            P.box(a, b, SKIN, SKIN + 0.025, z + 0.01, z + 0.29, col, bottom=False)
            P.detail_area += wq * 0.28
            z += 0.3; i += 1; k += 1
    P.count("quoin", k)


def pilaster(P, x, H, col):
    P.box(x - 0.22, x + 0.22, SKIN, SKIN + 0.1, 0, H, col, top=False, bottom=False)
    P.detail_area += 0.44 * H
    P.count("pilaster")


# ---------------------------------------------------------------- wall assembly

def wall_facade(L, H, ann, x0s=0.0, x1s=None, roof_col="#5d4f48"):
    """Build one wall. ann: annotation wall dict (schema in data/annotations/market_square/SCHEMA.md).
    x0s/x1s: skin extent along x (corners: extended or mitred). Returns Parts."""
    x1s = L if x1s is None else x1s
    wall_col = rgb(ann.get("wall_colour", "#b9a784"))
    P = Parts(mat=wall_material(ann), wall_col=wall_col)
    trim_col = rgb(ann.get("trim_colour", "#e6e0d2"))
    roof_col = rgb(roof_col)
    holes = []
    for el in ann.get("elements", []):
        t = el.get("type")
        try:
            if t == "window":
                if el.get("z", 1) + el.get("h", 1.6) > H - 0.1 or not (0.2 < el["x"] < L - 0.2):
                    continue
                holes.append(window(P, el, wall_col, trim_col))
            elif t == "door":
                if el.get("h", 2.2) > H - 0.2 or not (0.2 < el["x"] < L - 0.2):
                    continue
                holes.append(door(P, el, wall_col, trim_col))
            elif t == "shopfront":
                el = dict(el, x0=max(el["x0"], x0s + 0.05), x1=min(el["x1"], x1s - 0.05), z1=min(el.get("z1", 3.3), H - 0.3))
                if el["x1"] - el["x0"] < 1.0:
                    continue
                holes.append(shopfront(P, el, wall_col, trim_col))
            elif t == "dormer":
                dormer(P, el, H, wall_col, trim_col, roof_col)
        except (KeyError, TypeError, ValueError):
            continue
    # skin with openings, its edges returned back to the wall plane
    skin = box(x0s, 0, x1s, H).difference(unary_union(holes)) if holes else box(x0s, 0, x1s, H)
    P.face_xz(skin, SKIN, wall_col)
    P.quad((x0s, 0, 0), (x0s, SKIN, 0), (x0s, SKIN, H), (x0s, 0, H), (-1, 0, 0), wall_col)
    P.quad((x1s, SKIN, 0), (x1s, 0, 0), (x1s, 0, H), (x1s, SKIN, H), (1, 0, 0), wall_col)
    P.quad((x0s, 0, H), (x1s, 0, H), (x1s, SKIN, H), (x0s, SKIN, H), (0, 0, 1), wall_col)
    for z in ann.get("string_courses", []):
        if 0.5 < z < H - 0.3:
            string_course(P, z, x0s, x1s, trim_col)
    cz = min(ann.get("cornice_z", H), H)
    cornice(P, ann.get("cornice", "simple"), cz, x0s, x1s, trim_col)
    if ann.get("parapet"):
        P.box(x0s, x1s, 0, SKIN + 0.05, H - 0.02, H + 0.1, shade(trim_col, 0.9), bottom=False)
    if ann.get("quoins"):
        quoins(P, x0s, x1s, H, trim_col)
    for x in ann.get("pilasters", []) or []:
        if 0.25 < x < L - 0.25:
            pilaster(P, x, min(cz, H) - 0.3, trim_col)
    return P


PALETTE = [("#bcae8c", "#e8e2d4"), ("#c2b494", "#efe9dc"), ("#9c5f45", "#e9e4d8"), ("#d9d1c0", "#f1ede4"),
           ("#c9bea3", "#ece6d8"), ("#a8754f", "#efe9dc")]


def default_layout(wall):
    """Procedural georgian/victorian layout for a wall without an annotation."""
    L, H = wall["length"], wall["eave_z"] - wall["ground_z"]
    tags = wall.get("tags", {})
    hsh = int(hashlib.md5(wall["osm_id"].encode()).hexdigest()[:8], 16)
    wc, tc = PALETTE[hsh % len(PALETTE)]
    ann = {"id": wall["id"], "wall_colour": wc, "trim_colour": tc, "cornice": "simple", "elements": [],
           "string_courses": []}
    if L < 2.4 or H < 2.5:
        ann["cornice"] = "none" if H < 2.5 else "simple"
        return ann
    church = tags.get("amenity") == "place_of_worship" or tags.get("building") in ("church", "chapel")
    if church:   # tall gothic lancets
        ann.update(wall_colour="#c4b99c", trim_colour="#d6ccb2", cornice="simple")
        nb = max(1, int(L / 4.0))
        for i in range(nb):
            x = L * (i + 0.5) / nb
            h = min(H - 3.2, 6.5)
            if h > 2.0:
                ann["elements"].append({"type": "window", "style": "gothic", "x": x, "w": 1.4, "z": 2.2, "h": h,
                                        "panes": [2, 4], "head": "pointed", "sill": True})
        return ann
    try:
        lv = int(float(tags.get("building:levels", "0")))
    except ValueError:
        lv = 0
    n = lv if lv and 2.6 <= H / lv <= 5.0 else max(1, round(H / STOREY))
    n = max(1, min(n, int(H / 2.6)))
    fh = H / n
    floor_z = [fh * k for k in range(n)]
    ann["storeys"], ann["floor_z"] = n, floor_z
    nb = max(1, int(L / BAY))
    bw = L / nb
    georgian = hsh % 2 == 0
    shop = ("shop" in tags or "amenity" in tags) and L >= 3.0
    if n > 1:
        ann["string_courses"] = [floor_z[1]]
    if shop:
        z1 = min(fh, 4.0)
        units = max(1, round(L / 6.5))
        uw = L / units
        for u in range(units):
            a, b = u * uw + 0.15, (u + 1) * uw - 0.15
            ann["elements"].append({"type": "shopfront", "x0": a, "x1": b, "z1": z1, "door_x": a + 1.0 if u % 2 == 0 else b - 1.0,
                                    "stallriser": 0.5, "fascia_colour": ["#1f3a30", "#2b2f3a", "#5a1f22", "#30302e"][(hsh + u) % 4]})
    for k in range(n):
        if k == 0 and shop:
            continue
        top = k == n - 1 and n > 2
        h = min(1.75 if not top else 1.35, fh - 1.25)
        if h < 0.8:
            continue
        sill = floor_z[k] + (0.85 if k else 0.8)
        for i in range(nb):
            x = bw * (i + 0.5)
            w = min(1.05 if not top else 0.95, bw * 0.48)
            if k == 0 and i == nb // 2 and L > 5 and fh > 2.6:
                ann["elements"].append({"type": "door", "style": "panelled", "x": x, "w": 1.0, "h": min(2.3, fh - 0.6),
                                        "surround": "fanlight" if georgian and fh > 3.4 else "none"})
                continue
            ann["elements"].append({"type": "window", "style": "sash_georgian" if georgian else "sash_victorian",
                                    "x": x, "w": w, "z": sill, "h": h, "panes": [3, 3] if georgian else [1, 2],
                                    "head": "flat", "sill": True})
    return ann


def count_on_walls(ops, walls, maxd=2.5):
    """Assign emitted openings [(kind, wx, wy), ...] (world xy of the opening centre on its skin plane) to the nearest
    wall of `walls` (perpendicular distance <= maxd, inside the wall's span). Returns {wall id: {kind: n}} for every
    wall (bespoke modules' ELEMENTS, read by zone_build for facade_geometry_match_pct)."""
    out = {w["id"]: {k: 0 for k in ("window", "door", "shopfront", "dormer")} for w in walls}
    for kind, x, y in ops:
        best, bd = None, maxd
        for w in walls:
            p0, p1 = np.asarray(w["p0"], float), np.asarray(w["p1"], float)
            L = float(np.linalg.norm(p1 - p0))
            d = (p1 - p0) / L
            v = np.array([x, y]) - p0
            a, o = v @ d, abs(v[0] * d[1] - v[1] * d[0])
            if -0.3 <= a <= L + 0.3 and o <= bd:
                best, bd = w["id"], o
        if best is not None:
            out[best][kind] = out[best].get(kind, 0) + 1
    return out


# ---------------------------------------------------------------- curved fronts (session 71)

def bezier_path(a, c, b, n=256):
    """Plan curve for a rounded corner: quadratic Bezier a -> b with control point c (the corner apex), so it is
    tangent to the wall lines a-c and c-b. Returns (length, f) with f(s) -> (points (m,2), unit tangents (m,2)) at
    arc length s (0..length)."""
    a, c, b = (np.asarray(v, float) for v in (a, c, b))
    t = np.linspace(0, 1, n)[:, None]
    pts = (1 - t) ** 2 * a + 2 * (1 - t) * t * c + t ** 2 * b
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    L = float(s[-1])

    def f(q):
        q = np.clip(np.asarray(q, float), 0, L)
        u = np.interp(q, s, t[:, 0])[:, None]
        p = (1 - u) ** 2 * a + 2 * (1 - u) * u * c + u ** 2 * b
        d = 2 * (1 - u) * (c - a) + 2 * u * (b - c)
        return p, d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
    return L, f


def bend(T, N, C, M, L, path, maxdx=0.2):
    """Wrap a flat facade built in a wall frame (x along 0..L, y outward, z up) onto a plan curve: path(s) gives the
    point/tangent at arc length s (L = curve length; x outside 0..L continues straight along the end tangents).
    Triangles are split until no edge spans more than maxdx in x, so walls, window reveals, cornices and glazing all
    follow the curve. Returns world (E, N, z-from-frame) triangles, normals, colours and material ids."""
    T, N, C, M = np.asarray(T, float), np.asarray(N, float), np.asarray(C, float), np.asarray(M)
    for _ in range(12):
        x = T[..., 0]
        span = np.abs(x[:, [0, 1, 2]] - x[:, [1, 2, 0]])      # edge i: vertex i -> i+1
        e = span.argmax(1)
        big = span.max(1) > maxdx
        if not big.any():
            break
        Tk, Ts = T[~big], T[big]
        es = e[big]
        r = np.arange(len(Ts))
        vi, vj, vk = Ts[r, es], Ts[r, (es + 1) % 3], Ts[r, (es + 2) % 3]
        m = (vi + vj) / 2
        T = np.concatenate([Tk, np.stack([vi, m, vk], 1), np.stack([m, vj, vk], 1)])
        N = np.concatenate([N[~big], N[big], N[big]])
        C = np.concatenate([C[~big], C[big], C[big]])
        M = np.concatenate([M[~big], M[big], M[big]])
    V = T.reshape(-1, 3)
    s = np.clip(V[:, 0], 0, L)
    p, t = path(s)
    n = np.stack([t[:, 1], -t[:, 0]], 1)                       # outward = right of the path direction
    xy = p + (V[:, 0] - s)[:, None] * t + V[:, 1:2] * n
    W = np.concatenate([xy, V[:, 2:3]], 1).reshape(-1, 3, 3)
    _, tc = path(np.clip(T[..., 0].mean(1), 0, L))
    nc = np.stack([tc[:, 1], -tc[:, 0]], 1)
    Nw = np.concatenate([N[:, :1] * tc + N[:, 1:2] * nc, N[:, 2:3]], 1)
    g = np.cross(W[:, 1] - W[:, 0], W[:, 2] - W[:, 0])
    flip = (g * Nw).sum(1) < 0
    W[flip] = W[flip][:, ::-1]
    return W, Nw, C, M


def line_apex(p0, d0, p1, d1):
    """Intersection of the lines p0 + a d0 and p1 + b d1 (plan)."""
    p0, d0, p1, d1 = (np.asarray(v, float) for v in (p0, d0, p1, d1))
    A = np.array([[d0[0], -d1[0]], [d0[1], -d1[1]]])
    a, _ = np.linalg.solve(A, p1 - p0)
    return p0 + a * d0
