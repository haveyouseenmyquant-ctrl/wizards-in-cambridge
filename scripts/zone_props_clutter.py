"""Market Square zone: pavement clutter in front of the annotated shopfronts (EnvVFX s6, task 926d).

Loaded by zone_build.py like zone_props.py. For every shopfront element in data/annotations/market_square/way_*.json
it places, deterministically per wall, a mix of real 3D street clutter on the pavement just outside the window:
  sandwich boards (A-frame, chalkboard faces with chalk lines), planter boxes with clipped shrubs, cafe tables with
  chairs (cafes / restaurants only), black-and-gold litter bins and the odd stack of delivery crates.
Positions keep clear of other walls (>= 0.8 m) so nothing pokes into a neighbouring building.
  .venv/bin/python -I scripts/zone_props_clutter.py    # prints per-item tri counts
"""
import collections
import glob
import hashlib
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zone_props import ROOT, Ground, Mesh  # noqa: E402

ANN = os.path.join(ROOT, "data/annotations/market_square")
TIMBER = (0.36, 0.25, 0.16)
TIMBER_LT = (0.55, 0.42, 0.28)
CHALK = (0.10, 0.12, 0.11)
CHALK_TXT = (0.86, 0.85, 0.80)
CHALK_COLS = [(0.90, 0.88, 0.80), (0.95, 0.72, 0.35), (0.55, 0.80, 0.90), (0.95, 0.55, 0.60)]
SOIL = (0.20, 0.15, 0.11)
LEAF = [(0.20, 0.34, 0.14), (0.26, 0.40, 0.17), (0.17, 0.29, 0.12), (0.30, 0.42, 0.20)]
BIN = (0.07, 0.08, 0.08)
GOLD = (0.62, 0.48, 0.20)
METAL = (0.16, 0.17, 0.18)
CAFE = ("cafe", "coffee", "bakery", "restaurant", "bistro", "tea", "deli", "kitchen", "bar", "pub", "grill",
        "pizza", "patisserie", "brasserie", "fudge", "chocolate")
PLANTER_COLS = [(0.18, 0.22, 0.20), (0.30, 0.22, 0.15), (0.62, 0.60, 0.55), (0.12, 0.13, 0.14)]


def _frame(m, o, d, n):
    """Local -> world helper: x along the wall, y outward, z up."""
    o, d, n = np.asarray(o, float), np.asarray(d, float), np.asarray(n, float)

    def P(x, y, z):
        return np.array([o[0] + x * d[0] + y * n[0], o[1] + x * d[1] + y * n[1], o[2] + z])
    return P


def rot2(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([c, s, 0.0]), np.array([-s, c, 0.0])


def a_board(m, c, z, d, rng):
    """Sandwich board: two 0.6 x 0.95 m timber-framed chalkboard leaves leaning on each other, ~0.45 m apart at the foot."""
    d, n = rot2(np.arctan2(d[1], d[0]) + rng.uniform(-0.5, 0.5))
    P = _frame(m, (c[0], c[1], z), d, n)
    w, h, foot = 0.30, 0.92, 0.22
    for s in (1, -1):
        y0 = s * foot
        def lo(x, zz, t=0.0, y0=y0, s=s):
            return P(x, y0 * (1 - zz / h) + s * t, zz)
        # frame (four bars, 3 cm), face recessed 1 cm
        for x0, x1, z0, z1 in ((-w, -w + 0.04, 0, h), (w - 0.04, w, 0, h), (-w, w, h - 0.05, h), (-w, w, 0.12, 0.17)):
            q = [lo(x0, z0, 0.012), lo(x1, z0, 0.012), lo(x1, z1, 0.012), lo(x0, z1, 0.012)]
            m.quad(*(q if s > 0 else q[::-1]), TIMBER)
            q2 = [lo(x0, z0, -0.012), lo(x1, z0, -0.012), lo(x1, z1, -0.012), lo(x0, z1, -0.012)]
            m.quad(*(q2[::-1] if s > 0 else q2), TIMBER)
        face = [lo(-w + 0.04, 0.17, 0.004), lo(w - 0.04, 0.17, 0.004), lo(w - 0.04, h - 0.05, 0.004),
                lo(-w + 0.04, h - 0.05, 0.004)]
        m.quad(*(face if s > 0 else face[::-1]), CHALK)
        back = [lo(-w + 0.04, 0.17, -0.004), lo(w - 0.04, 0.17, -0.004), lo(w - 0.04, h - 0.05, -0.004),
                lo(-w + 0.04, h - 0.05, -0.004)]
        m.quad(*(back[::-1] if s > 0 else back), TIMBER_LT)
        # chalk lettering: a heading bar + a few lines of varying length and colour
        zz = h - 0.14
        for k in range(rng.integers(4, 7)):
            lw = (0.40 if k == 0 else rng.uniform(0.15, 0.42))
            th = 0.045 if k == 0 else 0.022
            col = CHALK_COLS[rng.integers(len(CHALK_COLS))] if k else CHALK_TXT
            x0 = -lw / 2 if k == 0 else -w + 0.08
            q = [lo(x0, zz - th, 0.009), lo(x0 + lw, zz - th, 0.009), lo(x0 + lw, zz, 0.009), lo(x0, zz, 0.009)]
            m.quad(*(q if s > 0 else q[::-1]), col)
            zz -= th + rng.uniform(0.04, 0.07)
            if zz < 0.25:
                break


def planter(m, c, z, d, rng):
    """Square planter box (0.55 m) with a clipped evergreen shrub or a little bay tree."""
    d, n = rot2(np.arctan2(d[1], d[0]))
    P = _frame(m, (c[0], c[1], z), d, n)
    s, hb = 0.28, 0.48
    col = PLANTER_COLS[rng.integers(len(PLANTER_COLS))]
    o = P(-s, -s, 0)
    m.box(o, d * 2 * s, n * 2 * s, [0, 0, hb], col, top=SOIL)
    m.box(P(-s - 0.02, -s - 0.02, hb - 0.05), d * (2 * s + 0.04), n * (2 * s + 0.04), [0, 0, 0.05],
          tuple(x * 1.2 for x in col))
    top = np.array([c[0], c[1], z + hb])
    if rng.random() < 0.5:   # clipped ball on a stem (bay / box topiary)
        m.prism(c[0], c[1], z + hb, z + hb + 0.55, 0.025, 5, TIMBER)
        m.ball(top + [0, 0, 0.85], 0.32, LEAF[rng.integers(4)], fine=True, rot=rng.uniform(0, 6))
        m.ball(top + [0.05, -0.03, 0.92], 0.24, LEAF[rng.integers(4)], fine=True, rot=rng.uniform(0, 6))
    else:                    # loose shrub: a cluster of leaf balls
        for _ in range(7):
            off = rng.uniform(-0.18, 0.18, 2)
            m.ball(top + [off[0], off[1], rng.uniform(0.12, 0.4)], rng.uniform(0.14, 0.22), LEAF[rng.integers(4)],
                   fine=True, rot=rng.uniform(0, 6))


def litter_bin(m, c, z, rng):
    """Cambridge city-centre litter bin: black octagonal cast body, gold band, domed lid."""
    m.prism(c[0], c[1], z, z + 0.08, 0.30, 8, BIN)
    m.prism(c[0], c[1], z + 0.08, z + 0.85, 0.26, 8, BIN, r_top=0.28, cap=False)
    m.prism(c[0], c[1], z + 0.62, z + 0.68, 0.285, 8, GOLD, cap=False)
    m.prism(c[0], c[1], z + 0.85, z + 0.92, 0.30, 8, BIN, top=BIN)
    m.prism(c[0], c[1], z + 0.92, z + 1.0, 0.24, 8, BIN, r_top=0.08)


def cafe_set(m, c, z, d, rng):
    """Round bistro table with two folding chairs."""
    m.prism(c[0], c[1], z, z + 0.02, 0.22, 8, METAL)
    m.prism(c[0], c[1], z, z + 0.72, 0.03, 6, METAL, cap=False)
    m.prism(c[0], c[1], z + 0.72, z + 0.75, 0.32, 12, (0.78, 0.76, 0.72) if rng.random() < 0.5 else METAL)
    if rng.random() < 0.7:   # a cup and saucer
        m.prism(c[0] + 0.08, c[1] - 0.05, z + 0.75, z + 0.76, 0.07, 8, (0.95, 0.95, 0.93))
        m.prism(c[0] + 0.08, c[1] - 0.05, z + 0.76, z + 0.84, 0.04, 8, (0.95, 0.95, 0.93), top=(0.25, 0.15, 0.08))
    d = np.asarray(d, float)
    ccol = [METAL, (0.17, 0.28, 0.22), (0.55, 0.20, 0.16)][rng.integers(3)]
    for s in (1, -1):
        a = np.arctan2(d[1], d[0]) + rng.uniform(-0.3, 0.3)
        dd, nn = rot2(a)
        q = np.array([c[0], c[1]]) + dd[:2] * s * 0.55
        P = _frame(m, (q[0], q[1], z), dd * s, nn)   # x points away from the table
        for lx, ly in ((-0.19, -0.19), (0.19, -0.19), (-0.19, 0.19), (0.19, 0.19)):
            m.box(P(lx - 0.012, ly - 0.012, 0), dd * s * 0.025, nn * 0.025, [0, 0, 0.45], ccol)
        m.box(P(-0.21, -0.21, 0.45), dd * s * 0.42, nn * 0.42, [0, 0, 0.03], ccol)
        m.box(P(0.19, -0.21, 0.48), dd * s * 0.025, nn * 0.42, [0, 0, 0.40], ccol)
        for zz in (0.62, 0.80):
            m.box(P(0.18, -0.21, zz), dd * s * 0.03, nn * 0.42, [0, 0, 0.06], ccol)


def crates(m, c, z, d, rng):
    """Stack of 2-3 plastic delivery crates against the wall."""
    d, n = rot2(np.arctan2(d[1], d[0]) + rng.uniform(-0.2, 0.2))
    col = [(0.16, 0.30, 0.55), (0.20, 0.45, 0.25), (0.12, 0.12, 0.13)][rng.integers(3)]
    zz = z
    for k in range(rng.integers(2, 4)):
        P = _frame(m, (c[0], c[1], zz), d, n)
        j = rng.uniform(-0.03, 0.03, 2)
        m.box(P(-0.3 + j[0], -0.2 + j[1], 0), d * 0.6, n * 0.4, [0, 0, 0.29], col, top=tuple(x * 0.6 for x in col))
        zz += 0.29


def _seg_dist(p, a, b):
    ab = b - a
    t = np.clip(np.dot(p - a, ab) / max(np.dot(ab, ab), 1e-9), 0, 1)
    return float(np.linalg.norm(p - (a + t * ab)))


STATS = collections.Counter()   # placement / rejection counts (printed by __main__)


def build():
    W = {w["id"]: w for w in json.load(open(os.path.join(ANN, "walls.json")))["walls"]}
    segs = [(np.asarray(w["p0"], float), np.asarray(w["p1"], float), wid) for wid, w in W.items()]
    g = Ground()
    out, placed = [], []

    def clear(p, own, r=0.8):
        if any(_seg_dist(p, a, b) < r for a, b, wid in segs if wid != own):
            STATS["wall"] += 1
            return False
        if any(np.linalg.norm(p - q) < 1.0 for q in placed):
            STATS["near"] += 1
            return False
        return True

    for f in sorted(glob.glob(os.path.join(ANN, "way_*.json")) + glob.glob(os.path.join(ANN, "relation_*.json"))):
        try:
            a = json.load(open(f))
        except (OSError, ValueError):
            continue
        for wa in a.get("walls", []):
            w = W.get(wa.get("id"))
            if w is None or w["tags"].get("building") == "roof":
                continue
            p0 = np.asarray(w["p0"], float)
            d = (np.asarray(w["p1"], float) - p0) / max(w["length"], 1e-6)
            nrm = np.array([d[1], -d[0]])
            for k, el in enumerate(e for e in wa.get("elements", []) if e.get("type") == "shopfront"):
                rng = np.random.default_rng(int(hashlib.md5(f"{wa['id']}:{k}".encode()).hexdigest()[:8], 16))
                x0, x1 = float(el.get("x0", 0)), float(el.get("x1", w["length"]))
                name = (str(el.get("fascia_text", "")) + " " + str(a.get("name", ""))).lower()
                cafe = any(c in name for c in CAFE)
                m = Mesh()
                want = []
                xm = (x0 + x1) / 2 + rng.uniform(-0.3, 0.3) * (x1 - x0) / 2
                if rng.random() < (0.95 if cafe else 0.8):
                    want.append(("aboard", xm, 1.25))
                if cafe and x1 - x0 > 2.5:
                    want.append(("cafe", x0 + 0.9, 1.15))
                if rng.random() < 0.7:   # planters flank the shop: one or both ends
                    ends = [x0 + 0.4, x1 - 0.4] if rng.random() < 0.4 and x1 - x0 > 2.0 else [
                        x0 + 0.4 if rng.random() < 0.5 else x1 - 0.4]
                    want += [("planter", e, 0.45) for e in ends]
                if rng.random() < 0.3:
                    want.append(("bin", x1 + 0.3, 0.55))
                if rng.random() < 0.2:
                    want.append(("crates", x0 + 0.5, 0.35))
                for kind, x, y in want:
                    if not 0.2 < x < w["length"] - 0.2:
                        continue
                    p = p0 + d * x + nrm * y
                    if not clear(p, wa["id"]):
                        continue
                    z = g(*p)
                    if abs(z - w["ground_z"]) > 0.6:   # off the pavement (steps, basement area)
                        STATS["z"] += 1
                        continue
                    STATS[kind] += 1
                    placed.append(p)
                    if kind == "aboard":
                        a_board(m, p, z, d, rng)
                    elif kind == "planter":
                        planter(m, p, z, d, rng)
                    elif kind == "cafe":
                        cafe_set(m, p, z, d, rng)
                    elif kind == "bin":
                        litter_bin(m, p, z, rng)
                    else:
                        crates(m, p, z, d, rng)
                if m.t:
                    out.append(m.out(f"clutter:{wa['id']}:{k}"))
    return out


if __name__ == "__main__":
    props = build()
    print(dict(STATS))
    print(len(props), "items", sum(len(p["tris"]) for p in props), "tris")
