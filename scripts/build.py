"""Build the browser world into site/: manifest.json, tiles/*.glb, collision/*.col (see FORMAT.md).

v1 ("complete and simple"):
  - ground: EA LiDAR DTM sampled on a 2 m grid per 250 m tile, each triangle classed from OSM
    (roads, footways, grass, water, squares, under-building); water is non-walkable.
  - buildings: every OSM building extruded from its lowest ground to median DTM + LiDAR P95 height,
    roof shaped from the LiDAR DSM (3 m heightfield, chimneys filtered) where it isn't flat, solid walls. Walkable OSM ways that cross a building get a 2.6 m wide, ~3.5 m high
    passage cut through it (gate arches, building passages, arcades).
  - bridges: walkable ways tagged bridge=* get a deck interpolated between the ground at their ends.

Usage: .venv/bin/python -I scripts/build.py [--out site]
"""
import json
import math
import os
import struct
import sys
import time

import mapbox_earcut as earcut
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.features import geometry_mask, rasterize
from rasterio.features import shapes as rio_shapes
from rasterio.windows import from_bounds
from scipy.ndimage import binary_erosion, binary_opening, distance_transform_edt, label, map_coordinates, median_filter
from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, mapping, shape
from shapely.ops import polygonize, unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
RAW = os.path.join(ROOT, "data/raw/osm/cambridge_overpass.json")
OUT = os.path.join(ROOT, sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "site")
E0, N0 = 545000.0, 258400.0
TILE = 250.0
EXT = 1000.0          # world extent: [-EXT, EXT) in x and y (matches the LiDAR mosaic)
GSTEP = 2.0           # ground grid spacing (m)
PASS_W = 1.3          # half width of a cut passage (m)
PASS_H = 3.5          # passage clear height above median ground (m)

WALK = {"footway", "pedestrian", "path", "steps", "living_street", "residential", "service",
        "unclassified", "tertiary", "secondary", "primary", "cycleway", "track"}
ROAD_HALF = {"primary": 4.5, "secondary": 4.0, "tertiary": 3.5, "unclassified": 3.0, "residential": 3.0,
             "living_street": 2.5, "service": 2.0, "pedestrian": 3.0, "track": 1.5}
# surface classes (FORMAT.md)
S_ROAD, S_PAVE, S_GRASS, S_WATER, S_COURT, S_EARTH, S_STEPS, S_BRIDGE, S_UNDER = 1, 2, 3, 4, 5, 6, 7, 8, 9
S_BRICK = 10          # clay brick paviors (herringbone), session 36
COLORS = {S_ROAD: (0.32, 0.32, 0.34), S_PAVE: (0.62, 0.60, 0.56), S_GRASS: (0.33, 0.52, 0.24),
          S_WATER: (0.22, 0.36, 0.42), S_COURT: (0.66, 0.62, 0.55), S_EARTH: (0.50, 0.42, 0.31),
          S_STEPS: (0.60, 0.58, 0.54), S_BRIDGE: (0.55, 0.50, 0.45), S_UNDER: (0.5, 0.5, 0.5),
          S_BRICK: (0.62, 0.60, 0.80)}   # S_BRICK's colour is only a key for materials.js (it draws the brick),
                                         # chosen so blends with pavement/road don't pass near another class
# ground surface overrides from photo evidence (session 36), applied on top of the OSM surface tags
GROUND_OVR = os.path.join(ROOT, "data/annotations/ground/surfaces.json")
OVR_CLASS = {"brick": S_BRICK, "sett": S_COURT, "paving_stones": S_PAVE, "asphalt": S_ROAD}
GRASS = {"grass", "meadow", "recreation_ground", "village_green", "park", "garden", "pitch", "common",
         "grassland", "scrub", "wood", "forest", "cemetery", "allotments", "playground", "golf_course",
         "heath", "orchard", "nature_reserve"}
PAVED = {"square", "parking", "marketplace", "pedestrian", "plaza"}
PARK_ON_ROAD = {"lane", "street_side", "on_street", "half_on_kerb", "parallel", "diagonal", "perpendicular"}
SETT = {"sett", "cobblestone", "unhewn_cobblestone", "cobblestone:flattened"}
SLABS = {"paving_stones", "paved", "concrete:plates", "stone"}
BRICKS = {"bricks", "brick", "clay"}
UNPAVED = {"dirt", "earth", "ground", "grass", "gravel", "fine_gravel", "compacted", "unpaved"}
SIDEWALK_W = 2.0      # modelled footway width beside a road with sidewalk=* (m)
SIDEWALK_HW = {"primary", "secondary", "tertiary", "unclassified", "residential"}


def _num(v):
    try:
        return float(str(v).replace("m", "").strip())
    except (TypeError, ValueError):
        return None


def parked_sides(t):
    """How many sides of a road have on-road parking (OSM parking:<side>=*, older parking:lane:<side>=*)."""
    n = 0
    for side in ("left", "right"):
        v = (t.get(f"parking:{side}") or t.get("parking:both") or t.get(f"parking:lane:{side}")
             or t.get("parking:lane:both"))
        n += v in PARK_ON_ROAD
    return n


def road_half(t):
    """Half width of the modelled carriageway (m): OSM width if mapped, else the class default plus ~1 m for each
    side with on-road parking (sessions <= 25 used the class default alone, which is narrower than real streets)."""
    hw = t.get("highway")
    if hw not in ROAD_HALF:
        return None
    w = _num(t.get("width"))
    if w and 3.0 <= w <= 24.0 and hw not in ("pedestrian", "track"):
        return w / 2
    return ROAD_HALF[hw] + (parked_sides(t) if os.environ.get("WC_ROAD_PARK", "1") == "1" else 0)


def road_class(t):
    """Surface class of a carriageway from its OSM surface tag."""
    sf = t.get("surface")
    if sf in SETT:
        return S_COURT
    if sf in BRICKS:
        return S_BRICK
    if sf in SLABS or (sf is None and t.get("highway") == "pedestrian"):
        return S_PAVE
    return S_ROAD


def area_class(t):
    """Surface class of a paved area (square, marketplace, pedestrian area): its OSM surface tag, else pavement."""
    sf = t.get("surface")
    if sf in SETT:
        return S_COURT
    if sf in BRICKS:
        return S_BRICK
    if sf == "asphalt":
        return S_ROAD
    return S_PAVE


def ground_overrides(ways, rels, nodes):
    """{class: [polygons]} from data/annotations/ground/surfaces.json (FORMAT.md): photo-checked surfaces that
    replace the OSM-derived class. Each feature is an OSM way (buffered by half_width, or one side of it by width
    with side=left|right), an OSM area (way or relation, whole polygon), or a world-frame line/polygon."""
    out = {}
    if not os.path.exists(GROUND_OVR) or os.environ.get("WC_GROUND_OVR", "1") != "1":
        return out
    for f in json.load(open(GROUND_OVR))["features"]:
        cl = OVR_CLASS[f["surface"]]
        g = None
        if "osm" in f:
            kind, oid = f["osm"].split("/")
            if kind == "relation":
                r = next((r for r in rels if r["id"] == int(oid)), None)
                g = rel_area(r, ways, nodes) if r else None
            elif int(oid) in ways:
                w = ways[int(oid)]
                if f.get("area"):
                    g = way_area(w, nodes)
                else:
                    c = coords(w, nodes)
                    g = LineString(c) if c else None
        elif "line" in f:
            g = LineString([(x + E0, y + N0) for x, y in f["line"]])
        elif "polygon" in f:
            g = Polygon([(x + E0, y + N0) for x, y in f["polygon"]])
        if g is None:
            log("ground override: missing", f.get("osm") or f.get("id"))
            continue
        if g.geom_type == "LineString":
            if f.get("side") in ("left", "right"):
                w = float(f["width"])
                g = g.buffer(w if f["side"] == "left" else -w, cap_style=2, single_sided=True)
            else:
                g = g.buffer(float(f.get("half_width", 2.0)), cap_style=2)
        out.setdefault(cl, []).append(g)
    log("ground overrides", {k: len(v) for k, v in out.items()})
    return out


def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)


# ---------------------------------------------------------------- OSM
def load_osm():
    els = json.load(open(RAW))["elements"]
    tr = Transformer.from_crs(4326, 27700, always_xy=True)
    nids = [e["id"] for e in els if e["type"] == "node"]
    lon = np.array([e["lon"] for e in els if e["type"] == "node"])
    lat = np.array([e["lat"] for e in els if e["type"] == "node"])
    E, N = tr.transform(lon, lat)
    nodes = dict(zip(nids, zip(E, N)))
    ways = {e["id"]: e for e in els if e["type"] == "way"}
    rels = [e for e in els if e["type"] == "relation"]
    pnodes = [e for e in els if e["type"] == "node" and e.get("tags")]
    return nodes, ways, rels, pnodes


def coords(w, nodes):
    c = [nodes.get(n) for n in w["nodes"]]
    return None if any(p is None for p in c) else c


def way_area(w, nodes):
    c = coords(w, nodes)
    if not c or len(c) < 4 or c[0] != c[-1]:
        return None
    g = Polygon(c)
    return g if g.is_valid else g.buffer(0)


def rel_area(r, ways, nodes):
    outers, inners = [], []
    for m in r.get("members", []):
        if m["type"] == "way" and m["ref"] in ways:
            c = coords(ways[m["ref"]], nodes)
            if c and len(c) >= 2:
                (inners if m.get("role") == "inner" else outers).append(LineString(c))
    polys = list(polygonize(unary_union(outers))) if outers else []
    if not polys:
        return None
    g = unary_union(polys)
    if inners:
        holes = list(polygonize(unary_union(inners)))
        if holes:
            g = g.difference(unary_union(holes))
    return g if g.is_valid else g.buffer(0)


# ---------------------------------------------------------------- glTF / collision writers
def write_col(path, verts, tris, kind, surf):
    with open(path, "wb") as f:
        f.write(b"WCOL" + struct.pack("<III", 1, len(verts), len(tris)))
        f.write(np.asarray(verts, "<f4").tobytes())
        f.write(np.asarray(tris, "<u4").tobytes())
        f.write(np.asarray(kind, "u1").tobytes())
        f.write(np.asarray(surf, "u1").tobytes())


def write_glb(path, meshes):
    """meshes: list of (node_name, pos (n,3) Y-up, nrm (n,3), col (n,3), idx (m,)[, mat (n,)])
    (optional mat: per-vertex float material id, written as the custom attribute _MAT; three.js exposes it as `_mat`)"""
    chunks, bin_len = [], 0
    js = {"asset": {"version": "2.0", "generator": "walkable-cambridge build.py",
                    "copyright": "© OpenStreetMap contributors; © Environment Agency copyright and/or database right 2022"},
          "scenes": [{"nodes": list(range(len(meshes)))}], "scene": 0, "nodes": [], "meshes": [],
          "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.9}}],
          "accessors": [], "bufferViews": [], "buffers": []}
    for name, pos, nrm, col, idx, *extra in meshes:
        pos = np.asarray(pos, "<f4"); nrm = np.asarray(nrm, "<f4"); col = np.asarray(col, "<f4")
        idx = np.asarray(idx, "<u2" if len(pos) < 65536 else "<u4")
        acc = {}
        streams = [("POSITION", pos, 34962), ("NORMAL", nrm, 34962), ("COLOR_0", col, 34962)]
        if extra and extra[0] is not None:
            streams.append(("_MAT", np.asarray(extra[0], "<f4").reshape(-1), 34962))
        for key, arr, target in streams + [("idx", idx, 34963)]:
            b = arr.tobytes()
            js["bufferViews"].append({"buffer": 0, "byteOffset": bin_len, "byteLength": len(b), "target": target})
            pad = b"\0" * (-len(b) % 4)
            chunks += [b, pad]; bin_len += len(b) + len(pad)
            a = {"bufferView": len(js["bufferViews"]) - 1, "count": len(arr)}
            if key == "idx":
                a.update(componentType=5123 if arr.dtype == np.dtype("<u2") else 5125, type="SCALAR")
            elif arr.ndim == 1:
                a.update(componentType=5126, type="SCALAR")
            else:
                a.update(componentType=5126, type="VEC3")
                if key == "POSITION":
                    a.update(min=pos.min(0).tolist(), max=pos.max(0).tolist())
            js["accessors"].append(a)
            acc[key] = len(js["accessors"]) - 1
        js["meshes"].append({"primitives": [{"attributes": {k: acc[k] for k in ("POSITION", "NORMAL", "COLOR_0", "_MAT") if k in acc},
                                             "indices": acc["idx"], "material": 0}]})
        js["nodes"].append({"name": name, "mesh": len(js["meshes"]) - 1})
    js["buffers"].append({"byteLength": bin_len})
    j = json.dumps(js, separators=(",", ":")).encode(); j += b" " * (-len(j) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(j) + 8 + bin_len))
        f.write(struct.pack("<II", len(j), 0x4E4F534A) + j)
        f.write(struct.pack("<II", bin_len, 0x004E4942))
        for c in chunks:
            f.write(c)


class Mesh:
    """Accumulates triangles in the collision frame (x east, y north, z up), with flat normals and colours."""

    def __init__(self):
        self.p, self.n, self.c, self.kind, self.surf = [], [], [], [], []

    def tris(self, P, color, kind, surf=0):
        """P: (k,3,3) triangles, counter-clockwise seen from the outside."""
        P = np.asarray(P, float).reshape(-1, 3, 3)
        if not len(P):
            return
        nr = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
        ln = np.linalg.norm(nr, axis=1, keepdims=True)
        nr = nr / np.maximum(ln, 1e-12)
        self.p.append(P.reshape(-1, 3)); self.n.append(np.repeat(nr, 3, 0))
        self.c.append(np.tile(np.asarray(color, float), (len(P) * 3, 1)))
        self.kind.append(np.full(len(P), kind, np.uint8)); self.surf.append(np.full(len(P), surf, np.uint8))

    def arrays(self):
        if not self.p:
            return None
        return (np.concatenate(self.p), np.concatenate(self.n), np.concatenate(self.c),
                np.concatenate(self.kind), np.concatenate(self.surf))


def to_gl(p):
    return np.stack([p[:, 0], p[:, 2], -p[:, 1]], 1)


def polys_of(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    return [q for q in getattr(g, "geoms", []) if q.geom_type == "Polygon" and q.area > 0.05]


def triangulate(poly):
    """Earcut a shapely polygon (BNG); returns (k,3,2) triangles in local frame, CCW."""
    rings = [np.asarray(poly.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in poly.interiors]
    rings = [r for r in rings if len(r) >= 3]
    if not rings:
        return np.zeros((0, 3, 2))
    v = np.concatenate(rings) - [E0, N0]
    ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
    idx = earcut.triangulate_float64(v, ends).reshape(-1, 3)
    T = v[idx]
    cr = (T[:, 1, 0] - T[:, 0, 0]) * (T[:, 2, 1] - T[:, 0, 1]) - (T[:, 1, 1] - T[:, 0, 1]) * (T[:, 2, 0] - T[:, 0, 0])
    T[cr < 0] = T[cr < 0][:, ::-1]
    return T


def add_prism(m, poly, z0, z1, color, roof_color, top=True, bottom=False):
    """Walls of all rings from z0 to z1 (solid), plus a roof at z1 and optionally an underside at z0."""
    p = poly if poly.exterior.is_ccw else Polygon(poly.exterior.coords[::-1], [r.coords for r in poly.interiors])
    rings = [np.asarray(p.exterior.coords)] + [np.asarray(r.coords)[::-1] if r.is_ccw else np.asarray(r.coords) for r in p.interiors]
    W = []
    for r in rings:
        r = r - [E0, N0]
        a, b = r[:-1], r[1:]
        A0 = np.c_[a, np.full(len(a), z0)]; B0 = np.c_[b, np.full(len(a), z0)]
        A1 = np.c_[a, np.full(len(a), z1)]; B1 = np.c_[b, np.full(len(a), z1)]
        W += [np.stack([A0, B0, B1], 1), np.stack([A0, B1, A1], 1)]
    if W:
        m.tris(np.concatenate(W), color, 0)
    T = triangulate(p)
    if len(T):
        if top:
            m.tris(np.concatenate([T, np.full((len(T), 3, 1), z1)], 2), roof_color, 0)
        if bottom:
            m.tris(np.concatenate([T[:, ::-1], np.full((len(T), 3, 1), z0)], 2), roof_color, 0)


# ---- building=roof (session 31): in OSM a roof with no walls. Rendered as a thin canopy slab, no walls, no
# collision (people walk under it). The Market Hill stall rows (MARKET_STALL_ROOFS) are one long gabled canopy each,
# ridge along the strip's long axis, eaves CANOPY_EAVE above the strip's median ground (Commons photos of the market:
# eaves ~2.3-2.5 m, shallow ~13 deg pitch); scripts/zone_props.py wraps its striped canvas around this slab.
MARKET_STALL_ROOFS = {f"way/{i}" for i in range(400160678, 400160686)}
CANOPY_EAVE = 2.4     # market canopy: eave height above the strip's median ground (m)
CANOPY_SLOPE = 0.24   # rise per metre from eave to ridge
CANOPY_T = 0.12       # canopy slab thickness in the tile (m)


def canopy_parts(g, gabled):
    """Planar parts of a building=roof canopy: [(polygon, f)] with f(P (n,2), same frame as g) -> height above the
    eave. Gabled: g split along the long axis of its minimum rotated rectangle (ridge at mid-width)."""
    if not gabled:
        return [(g, lambda P: np.zeros(len(P)))]
    r = np.asarray(g.minimum_rotated_rectangle.exterior.coords)[:4]
    e1, e2 = r[1] - r[0], r[2] - r[1]
    if np.linalg.norm(e1) < np.linalg.norm(e2):
        r = np.roll(r, -1, 0)
        e1, e2 = e2, e1
    W = np.linalg.norm(e2)
    nr, c = e2 / W, r.mean(0)
    out = []
    m0, m1 = (r[0] + r[3]) / 2, (r[1] + r[2]) / 2
    for q in ([m0, m1, r[2], r[3]], [r[0], r[1], m1, m0]):
        sg = 1 if np.dot(np.mean(q, 0) - c, nr) > 0 else -1
        part = g.intersection(Polygon(q).buffer(1e-6, join_style=2))
        if not part.is_empty:
            out.append((part, lambda P, sg=sg: CANOPY_SLOPE * np.clip(W / 2 - sg * ((np.asarray(P) - c) @ nr), 0, W / 2)))
    return out


def canopy_height(g, P, gabled=True):
    """Height above the eave of the canopy over footprint g at points P (n,2), same frame as g."""
    P = np.asarray(P, float).reshape(-1, 2)
    if not gabled:
        return np.zeros(len(P))
    parts = canopy_parts(g, True)
    return np.max([f(P) for _, f in parts], 0) if parts else np.zeros(len(P))


def canopy_surface(g, z, gabled, local_off=(E0, N0)):
    """Upward-facing triangles (k,3,3), local frame, of the canopy surface over g (BNG) whose eave is at z."""
    out = []
    for part, f in canopy_parts(g, gabled):
        for p in polys_of(part):
            T = triangulate(p)   # local frame
            if len(T):
                h = f(T.reshape(-1, 2) + np.asarray(local_off)).reshape(-1, 3, 1)
                out.append(np.concatenate([T, z + h], 2))
    return np.concatenate(out) if out else np.zeros((0, 3, 3))


def add_canopy(m, g, ze, gabled, color):
    """Thin slab (CANOPY_T) centred on the canopy surface with eave at ze: top, underside and rim; no walls."""
    t2 = CANOPY_T / 2
    T = canopy_surface(g, ze, gabled)
    if not len(T):
        return
    m.tris(T + [0, 0, t2], color, 0)
    m.tris(T[:, ::-1] - [0, 0, t2], color, 0)
    for part, f in canopy_parts(g, gabled):
        for p in polys_of(part):
            p = p if p.exterior.is_ccw else Polygon(p.exterior.coords[::-1])
            a = np.asarray(p.exterior.coords)
            h = ze + f(a)
            a = a - [E0, N0]
            A, B, ha, hb = a[:-1], a[1:], h[:-1], h[1:]
            A0, B0 = np.c_[A, ha - t2], np.c_[B, hb - t2]
            A1, B1 = np.c_[A, ha + t2], np.c_[B, hb + t2]
            m.tris(np.concatenate([np.stack([A0, B0, B1], 1), np.stack([A0, B1, A1], 1)]), color, 0)


ROOF_CELL = 8.0       # roof heightfield: coarsest quadtree cell (m)
ROOF_MIN = 1.0        # finest cell (the LiDAR pixel)
# canopy filter threshold (m), 0 = off. Session 17 at 1.0: photo_match 23.52 -> 23.53 (67 views <= 520 m), but
# roof_match 92.11 -> 84.56, because that KPI compares with the DSM including tree crowns. Off until Gaspard decides.
CANOPY_PEN = float(os.environ.get("WC_CANOPY_PEN", "0"))
GROUND_HOLES = os.environ.get("WC_GROUND_HOLES", "1") == "1"
HOLE_H, HOLE_MIN_PX = 1.5, 16   # nDSM below 1.5 m over >= 16 px (after a 3x3 opening)
ROOF_TOL = 0.25      # split a cell while the roof deviates (RMS) more than this from its two-triangle fit (m)


def roof_quadtree(X, Y, S, zf):
    """Square cells (x, y, size) covering the given ones, split until the heightfield zf is within ROOF_TOL of
    each cell's two-triangle fit or the cell is ROOF_MIN wide. Flat roofs stay coarse, ridges/hips/towers get 1 m."""
    done = []
    while len(X):
        k = np.maximum(2, np.round(S / ROOF_MIN).astype(int) + 1)
        kk = int(k.max())
        u = np.linspace(0, 1, kk)
        U, V = np.meshgrid(u, u)
        U, V = U.ravel(), V.ravel()
        px = X[:, None] + U[None] * S[:, None]; py = Y[:, None] + V[None] * S[:, None]
        z = zf(np.c_[px.ravel(), py.ravel()]).reshape(len(X), -1)
        c00, c10, c01, c11 = (zf(np.c_[X + a * S, Y + b * S]) for a, b in ((0, 0), (1, 0), (0, 1), (1, 1)))
        lower = U[None] >= V[None]      # triangles (00,10,11) and (00,11,01)
        fit = np.where(lower, c00[:, None] + U[None] * (c10 - c00)[:, None] + V[None] * (c11 - c10)[:, None],
                       c00[:, None] + V[None] * (c01 - c00)[:, None] + U[None] * (c11 - c01)[:, None])
        split = (np.sqrt(((z - fit) ** 2).mean(1)) > ROOF_TOL) & (S > ROOF_MIN * 1.5)   # RMS: single noisy pixels do not split
        done.append(np.c_[X[~split], Y[~split], S[~split]])
        h = S[split] / 2
        X = np.concatenate([X[split], X[split] + h, X[split], X[split] + h])
        Y = np.concatenate([Y[split], Y[split], Y[split] + h, Y[split] + h])
        S = np.concatenate([h, h, h, h])
    D = np.concatenate(done)
    return D[:, 0], D[:, 1], D[:, 2]


def _polys(g):
    if g.geom_type == "Polygon":
        return [g] if g.area > 1e-6 else []
    return [q for q in getattr(g, "geoms", []) if q.geom_type == "Polygon" and q.area > 1e-6]


def add_lidar_roof(m, poly, z0, zf, color, roof_color, bottom=False):
    """Like add_prism, but the roof is a heightfield zf(local xy) -> z on a ROOF_CELL grid clipped to the
    footprint, and the walls rise from z0 to the roof edge (built from the roof's boundary edges, so the
    shell is closed)."""
    import shapely
    x0, y0, x1, y1 = poly.bounds
    # grid on LiDAR pixel centres (local k + 0.5): 1 m cells then carry the DSM values exactly, not corner averages
    gx = np.arange(math.floor((x0 - 0.5) / ROOF_CELL) * ROOF_CELL + 0.5, x1, ROOF_CELL)
    gy = np.arange(math.floor((y0 - 0.5) / ROOF_CELL) * ROOF_CELL + 0.5, y1, ROOF_CELL)
    X, Y = np.meshgrid(gx, gy)
    X, Y, S = roof_quadtree(X.ravel(), Y.ravel(), np.full(X.size, ROOF_CELL), lambda P: zf(P - [E0, N0]))   # poly is BNG, zf local
    cells = shapely.box(X, Y, X + S, Y + S)
    pieces = shapely.intersection(cells[shapely.intersects(cells, poly)], poly)
    T = [triangulate(q) for pc in pieces for q in _polys(pc)]
    T = [t for t in T if len(t)]
    if not T:
        return False
    T = np.concatenate(T)
    k = len(T)
    Z = zf(T.reshape(-1, 2)).reshape(k, 3)
    m.tris(np.concatenate([T, Z[..., None]], 2), roof_color, 0)
    # boundary edges = edges used by exactly one triangle (kept in the triangle's CCW direction)
    A = T[:, [0, 1, 2]].reshape(-1, 2); B = T[:, [1, 2, 0]].reshape(-1, 2)
    ZA = Z[:, [0, 1, 2]].ravel(); ZB = Z[:, [1, 2, 0]].ravel()
    ka = np.round(A * 1000).astype(np.int64); kb = np.round(B * 1000).astype(np.int64)
    lo = np.where((ka[:, 0] < kb[:, 0]) | ((ka[:, 0] == kb[:, 0]) & (ka[:, 1] < kb[:, 1])), 0, 1)
    key = np.where(lo[:, None] == 0, np.c_[ka, kb], np.c_[kb, ka])
    _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True)
    e = cnt[inv.ravel()] == 1
    a, b, za, zb = A[e], B[e], ZA[e], ZB[e]
    A0 = np.c_[a, np.full(len(a), z0)]; B0 = np.c_[b, np.full(len(a), z0)]
    A1 = np.c_[a, za]; B1 = np.c_[b, zb]
    m.tris(np.concatenate([np.stack([A0, B0, B1], 1), np.stack([A0, B1, A1], 1)]), color, 0)
    if bottom:
        U = triangulate(poly)
        if len(U):
            m.tris(np.concatenate([U[:, ::-1], np.full((len(U), 3, 1), z0)], 2), roof_color, 0)
    return True


# session 27 A/B (25 views): 18.19 -> 17.92 with planes; off by default
ROOF_PLANES = os.environ.get("WC_ROOF_PLANES", "0") == "1"
PLANE_TOL, PLANE_MAX, PLANE_OUT = 0.25, 8, 0.5   # RANSAC inlier band, planes per roof, residual beyond which a pixel keeps the DSM (m)
PLANE_EDGE = float(os.environ.get("WC_PLANE_EDGE", "1.0"))   # unexplained edge pixels further off their plane keep the DSM (m)
PLANE_MIN_SHARE = 0.5   # planes must explain at least this share of the footprint pixels
PLANE_STATS = []


def roof_planes(R, m, rng):
    """Session 27: snap the roof heightfield to planes, so ridges, hips and eaves run straight instead of following
    the 1 m pixels. Sequential RANSAC finds up to PLANE_MAX planes z = a*col - b*row + c in the footprint's pixels.
    Pixels a plane explains within PLANE_OUT take its value; unexplained interior pixels (chimneys, towers, spires)
    keep the DSM; unexplained edge pixels (1 m pixels mixing eave and street) and the pixels outside the footprint take
    the plane of the nearest explained pixel, unless the DSM is more than PLANE_EDGE off it. Returns the new R, or
    None if the planes explain less than PLANE_MIN_SHARE of the roof."""
    mi = binary_erosion(m, np.ones((3, 3), bool))   # interior; the rest of m is the edge ring
    ii, jj = np.nonzero(m)
    P = np.c_[jj, -ii, np.ones(len(ii))].astype(float)
    z = R[ii, jj].astype(float)
    n = len(z)
    if n < 12:
        return None
    left = np.ones(n, bool)
    cand = []
    for _ in range(PLANE_MAX):
        idx = np.nonzero(left)[0]
        if len(idx) < max(6, 0.03 * n):
            break
        S = rng.choice(idx, (200, 3))
        A = P[S]   # 200 x 3 x 3
        ok = np.abs(np.linalg.det(A)) > 1e-6
        if not ok.any():
            break
        Wc = np.linalg.solve(A[ok], z[S[ok]][..., None])[..., 0]
        Wc = Wc[np.hypot(Wc[:, 0], Wc[:, 1]) <= 2.0]   # steeper than ~63 degrees: not a roof face
        if not len(Wc):
            break
        cnt = (np.abs(P[idx] @ Wc.T - z[idx, None]) < PLANE_TOL).sum(0)
        b = int(cnt.argmax())
        if cnt[b] < max(6, 0.03 * n):
            break
        inl = idx[np.abs(P[idx] @ Wc[b] - z[idx]) < PLANE_TOL]
        w = np.linalg.lstsq(P[inl], z[inl], rcond=None)[0]
        cand.append(w)
        left[np.abs(P @ w - z) < PLANE_TOL] = False
    if not cand:
        return None
    W = np.array(cand)
    res = np.abs(P @ W.T - z[:, None])
    lab = res.argmin(1)
    good = res[np.arange(n), lab] <= PLANE_OUT
    PLANE_STATS.append((n, len(W), good.mean(), -1, -1))
    if good.mean() < PLANE_MIN_SHARE:
        return None
    L = np.full(R.shape, -1)
    L[ii[good], jj[good]] = lab[good]
    _, (ni, nj) = distance_transform_edt(L < 0, return_indices=True)
    Lf = L[ni, nj]   # nearest planar pixel's plane, everywhere
    I, J = np.indices(R.shape)
    out = (W[Lf, 0] * J - W[Lf, 1] * I + W[Lf, 2]).astype(R.dtype)
    keep = np.zeros(R.shape, bool)
    bad = ~good & mi[ii, jj]   # unexplained interior pixels keep the DSM; unexplained edge pixels (mixed with the
    keep[ii[bad], jj[bad]] = True   # street) take the nearest plane, unless they are more than PLANE_EDGE off it
    keep |= m & ~keep & (L < 0) & (np.abs(out - R) > PLANE_EDGE)   # (a wall top beside a lower roof, a misregistered footprint)
    out[keep] = R[keep]
    _, (oi, oj) = distance_transform_edt(~m, return_indices=True)
    near_keep = ~m & keep[oi, oj]   # outside pixels next to kept pixels follow them (bilinear sampling at the edge)
    out[near_keep] = out[oi, oj][near_keep]
    PLANE_STATS[-1] = PLANE_STATS[-1][:3] + (float(np.sqrt(((out - R)[mi] ** 2).mean())), float(np.sqrt(((out - R)[m] ** 2).mean())))
    return out


def roof_field(bd, lo):
    """Height function for a building's LiDAR roof, or None if the roof is (nearly) flat."""
    R = bd.get("roofR")
    if R is None:
        return None
    vals = R[bd["roofM"]]
    hi = float(vals.max())
    if hi - lo < 1.0:
        return None
    ox, oy = bd["roofO"]   # local coords of pixel (0,0) centre; rows go south

    def zf(P):   # the LiDAR roof itself (session 14: no rescaling to the p95 top; roof_match_pct compares with the DSM)
        z = map_coordinates(R, [oy - P[:, 1], P[:, 0] - ox], order=1, mode="nearest")
        return np.maximum(z, lo)
    return zf


PARAM_ROOFS = os.environ.get("WC_PARAM_ROOFS", "1") == "1"   # EnvVFX s4: parametric roofs (scripts/roofs.py)
ROOF_STYLES = []   # (oid, style) per non-landmark building
ROOF_DEBUG = []


def param_roof(bm, bd):
    """Walls + parametric roof (scripts/roofs.py) for a non-landmark building. False -> caller builds the old way."""
    import roofs
    from shapely.affinity import translate
    g, cut, z0, z1 = bd["g"], bd["cut"], bd["base"], bd["top"]
    tone = bd["tone"]
    wall = np.clip(np.array([0.78, 0.72, 0.60]) + tone, 0, 1)
    zp = max(bd["dmed"] + PASS_H, (bd["zcut"] or -1e9) + 2.6)
    neigh = bd.get("neigh")
    neigh = translate(neigh, -E0, -N0) if neigh is not None else None
    if cut is not None and z1 - zp <= 1.0:
        return False
    built, style = False, None
    for p in polys_of(g):
        P = translate(p, -E0, -N0)
        f = None
        if bd.get("roofR") is not None:
            try:
                f = roofs.fit(P, bd["roofR"], bd["roofM"], bd["roofO"], bd["dmed"], zp + 0.5 if cut is not None else -1e9)
            except Exception:
                f = None
        if f is None:
            f = dict(kind="flat", e=z1 - 0.5)
        rc = roofs.colour(f, bd["oid"], tone)
        try:
            if cut is None:
                roofs.build(bm, P, z0, f, wall, rc, neigh)
            else:
                roofs.build(bm, P, zp, f, wall, rc, neigh, bottom=True)
        except Exception as ex:
            log("param roof failed", bd["oid"], ex)
            return False
        style = style or f["kind"]
        if os.environ.get("WC_ROOF_DEBUG"):
            c = P.centroid
            ROOF_DEBUG.append(dict(oid=bd["oid"], kind=f["kind"], cx=round(c.x, 1), cy=round(c.y, 1), e=round(f["e"], 2),
                                   z0=round(z0, 2), dmed=round(bd["dmed"], 2), top=round(z1, 2), cut=cut is not None,
                                   W=round(f.get("W", 0), 2), L=round(f.get("L", 0), 2), area=round(P.area, 1), tags=bd["t"]))
        built = True
    if cut is not None:
        for p in polys_of(g.difference(cut)):
            add_prism(bm, p, z0, zp, wall, wall, top=False)
    if built:
        ROOF_STYLES.append((bd["oid"], style, bd.get("roofR") is not None))
    return built


def add_prism_local(m, g, z0, z1, color, roof_color):
    """add_prism for a (Multi)Polygon in the local frame."""
    from shapely.affinity import translate
    for p in polys_of(translate(g, E0, N0)):
        add_prism(m, p, z0, z1, color, roof_color)


def build_landmarks(bdata, ways, nodes, DTM, DSM, tf, dtm_at):
    """Procedural landmark detail (scripts/detail.py). Sets bd['lm'] for buildings; returns extra
    non-building landmark meshes (bridges) as dicts and the manifest landmark entries."""
    import detail as D
    from shapely.affinity import translate
    lms = json.load(open(os.path.join(ROOT, "landmarks/landmarks.json")))["landmarks"]
    by_oid = {bd["oid"]: bd for bd in bdata}
    extra, entries = [], []
    for l in lms:
        sp = D.SPECS.get(l["id"])
        bd = by_oid.get(l["osm_id"])
        e = dict(id=l["id"], name=l["name"], osm_id=l["osm_id"], detailed=False)
        if sp is None:
            entries.append(e); continue
        solid, deco = Mesh(), Mesh()
        if bd is not None:
            g = bd["g"]; dmed, base, top = bd["dmed"], bd["base"], bd["top"]
        else:
            kind, i = l["osm_id"].split("/")
            g = way_area(ways[int(i)], nodes) if kind == "way" and int(i) in ways else None
            if g is None:
                entries.append(e); continue
            c = g.centroid
            dmed = float(dtm_at([c.x], [c.y])[0]); base = dmed - 0.3; top = dmed + 3
        gl = translate(g, -E0, -N0)
        if gl.geom_type != "Polygon":
            gl = max(gl.geoms, key=lambda q: q.area)
        ctx = D.Ctx(gl, dmed, base, top, DTM, DSM, tf, E0, N0)
        ctx.wall = sp["wall"]
        st = sp["style"]
        if st == "gothic":
            res = D.gothic(solid, deco, ctx, sp)
        elif st == "classical":
            res = D.classical(solid, deco, ctx, sp)
        elif st == "brick_hall":
            res = D.brick_hall(solid, deco, ctx, sp)
        elif st == "round":
            res = D.round_church(solid, deco, ctx, sp)
        elif st == "gate":
            res = D.gate(solid, deco, ctx, sp)
        elif st == "gate_tower":
            gn = nodes.get(443675369)
            res = D.gate_tower(deco, deco, ctx, sp, None if gn is None else (gn[0] - E0, gn[1] - N0))
        elif st == "bridge":
            ends = [ctx.c + ctx.u * s * (ctx.L + 3.0) for s in (-1, 1)]
            dz = float(max(dtm_at([q[0] + E0 for q in ends], [q[1] + N0 for q in ends]))) + 0.05
            res = D.bridge(deco, deco, ctx, sp, dz)
        else:
            res = None
        if res is None:
            entries.append(e); continue
        feats = [f for f in res["features"] if f]
        e.update(detailed=True, style=st, features=feats, screenshot=f"landmarks/{l['id']}.png",
                 x=round(ctx.c[0], 1), y=round(ctx.c[1], 1), look_z=round(dmed, 1),
                 size=round(float(ctx.L), 1), view=sp.get("front", 150))
        entries.append(e)
        lm = dict(solid=solid.arrays(), deco=deco.arrays(), keep_body=st in ("gate_tower",) or bd is None)
        if bd is not None:
            bd["lm"] = lm
        else:
            extra.append(dict(id=l["id"], cx=ctx.c[0], cy=ctx.c[1], lm=lm))
    log(sum(e["detailed"] for e in entries), "landmarks detailed")
    return extra, entries


# ---------------------------------------------------------------- main
def main():
    t0 = time.time()
    nodes, ways, rels, pnodes = load_osm()
    log("osm loaded", len(nodes), "nodes", len(ways), "ways")
    world = box(E0 - EXT, N0 - EXT, E0 + EXT, N0 + EXT)

    # ---- classify OSM features
    buildings, water, grass, paved = [], [], [], []
    road_lines, walk_lines, bridges = [], [], []
    for w in ways.values():
        t = w.get("tags", {})
        if not t:
            continue
        hw = t.get("highway")
        if hw:
            c = coords(w, nodes)
            if c and len(c) >= 2:
                ln = LineString(c)
                if hw in WALK and t.get("foot") != "no":
                    walk_lines.append((ln, t))
                    if t.get("bridge", "no") != "no" and t.get("layer", "1") not in ("-1", "-2"):
                        bridges.append((ln, t))
                if hw in ROAD_HALF or hw in WALK:
                    road_lines.append((ln, t))
            if t.get("area") == "yes" or t.get("area:highway"):
                g = way_area(w, nodes)
                if g is not None:
                    paved.append((g, area_class(t)))
        g = None
        if "building" in t and t["building"] != "no":
            g = way_area(w, nodes)
            if g is None:
                c = coords(w, nodes)
                if c and len(c) >= 2:
                    g = LineString(c).buffer(0.75)
            if g is not None and g.area > 0.5:
                buildings.append((f"way/{w['id']}", g, t))
            continue
        if t.get("natural") == "water" or t.get("waterway") == "riverbank" or t.get("water"):
            g = way_area(w, nodes)
            if g is not None:
                water.append(g)
        elif t.get("landuse") in GRASS or t.get("leisure") in GRASS or t.get("natural") in GRASS:
            g = way_area(w, nodes)
            if g is not None:
                grass.append(g)
        elif t.get("place") == "square" or t.get("amenity") in PAVED:
            g = way_area(w, nodes)
            if g is not None:
                paved.append((g, area_class(t)))
    for r in rels:
        t = r.get("tags", {})
        if t.get("type") not in ("multipolygon", "building", None):
            continue
        if "building" in t and t["building"] != "no":
            g = rel_area(r, ways, nodes)
            if g is not None and g.area > 0.5:
                buildings.append((f"relation/{r['id']}", g, t))
        elif t.get("natural") == "water" or t.get("waterway") == "riverbank" or t.get("water"):
            g = rel_area(r, ways, nodes)
            if g is not None:
                water.append(g)
        elif t.get("landuse") in GRASS or t.get("leisure") in GRASS or t.get("natural") in GRASS:
            g = rel_area(r, ways, nodes)
            if g is not None:
                grass.append(g)
        elif t.get("place") == "square" or t.get("amenity") in PAVED or t.get("highway") == "pedestrian":
            g = rel_area(r, ways, nodes)
            if g is not None:
                paved.append((g, area_class(t)))
    for n in pnodes:
        t = n["tags"]
        if "building" in t and t["building"] != "no":
            buildings.append((f"node/{n['id']}", Point(nodes[n["id"]]).buffer(4.0, cap_style=3), t))
    buildings = [b for b in buildings if b[1].intersects(world)]
    log(len(buildings), "buildings,", len(walk_lines), "walk ways,", len(bridges), "bridges,", len(water), "water,", len(grass), "grass")

    # ---- LiDAR
    dtm_r = rasterio.open(os.path.join(ROOT, "data/lidar/dtm_1m.tif"))
    dsm_r = rasterio.open(os.path.join(ROOT, "data/lidar/dsm_1m.tif"))
    DTM = dtm_r.read(1).astype("f8")
    DSM = dsm_r.read(1).astype("f8")
    tf = dtm_r.transform
    LEFT, TOP = tf.c, tf.f
    # tree canopy over roofs (session 17, off by default): the laser passes through foliage, so first return - last
    # return > CANOPY_PEN (NLP 2023, same grid) in blobs of at least 3x3 m; single-pixel lines (eaves) are opened away.
    CANOPY = np.zeros(DTM.shape, bool)
    if CANOPY_PEN:
        F23 = rasterio.open(os.path.join(ROOT, "data/lidar/nlp2023_first_return_dsm_1m.tif")).read(1).astype("f8")
        L23 = rasterio.open(os.path.join(ROOT, "data/lidar/nlp2023_dsm_1m.tif")).read(1).astype("f8")
        CANOPY = binary_opening((F23 > -100) & (L23 > -100) & (F23 - L23 > CANOPY_PEN), np.ones((3, 3), bool))
        del F23, L23

    def dtm_at(E, N):
        return map_coordinates(DTM, [TOP - np.asarray(N) - 0.5, np.asarray(E) - LEFT - 0.5], order=1, mode="nearest")

    # ---- surface class raster (1 m, same grid as the DTM); later layers win
    shp = DTM.shape
    cls = np.full(shp, int(os.environ.get("WC_GROUND_DEFAULT", S_PAVE)), np.uint8)   # default: unmapped urban ground (yards, forecourts): paving since session 26 (was cobbles)

    def burn(geoms, val):
        geoms = [mapping(g) for g in geoms if g is not None and not g.is_empty]
        if geoms:
            rasterize([(g, val) for g in geoms], out=cls, transform=tf, all_touched=False)

    # footways beside roads tagged sidewalk=both|left|right|yes (or untagged urban roads); separately mapped
    # footways (sidewalk=separate) are burned with the walk lines below
    sw = []
    for ln, t in road_lines:
        hw = t.get("highway")
        if hw not in SIDEWALK_HW or t.get("area") == "yes":
            continue
        v = t.get("sidewalk", t.get("sidewalk:both", "both" if os.environ.get("WC_SIDEWALK_DEFAULT", "1") == "1" else "no"))
        h = road_half(t) + SIDEWALK_W
        if v in ("both", "yes"):
            sw.append(ln.buffer(h, cap_style=2))
        elif v in ("left", "right"):
            sw.append(ln.buffer(h if v == "left" else -h, cap_style=2, single_sided=True))
    burn(sw, S_PAVE)
    burn(grass, S_GRASS)
    for cl in (S_PAVE, S_ROAD, S_COURT, S_BRICK):   # squares/pedestrian areas follow their surface tag (session 36)
        burn([g for g, c in paved if c == cl], cl)
    for cl in (S_ROAD, S_PAVE, S_COURT):
        burn([ln.buffer(road_half(t)) for ln, t in road_lines if t["highway"] in ROAD_HALF and t["highway"] != "track"
              and t.get("area") != "yes" and road_class(t) == cl], cl)
    burn([ln.buffer(1.0) for ln, t in walk_lines if t["highway"] in ("footway", "cycleway", "path", "track")
          and t.get("surface") in UNPAVED], S_EARTH)
    for cl in (S_ROAD, S_PAVE, S_COURT):
        burn([ln.buffer(1.0) for ln, t in walk_lines if t["highway"] in ("footway", "cycleway", "path")
              and t.get("surface") not in UNPAVED and (road_class(t) if t.get("surface") else S_PAVE) == cl], cl)
    for cl, geoms in ground_overrides(ways, rels, nodes).items():
        burn(geoms, cl)
    burn([ln.buffer(1.0) for ln, t in walk_lines if t["highway"] == "steps"], S_STEPS)
    burn(water, S_WATER)
    # connector repairs (scripts/connectors.py), retired in session 7: only real, mapped openings count. The 94
    # invented connectors are kept in connectors_invented_retired.json for reference; this file no longer exists.
    cpath = os.path.join(ROOT, "data/derived/connectors.json")
    conns = [LineString(c["line"]) for c in json.load(open(cpath))["connectors"]] if os.path.exists(cpath) else []
    conn_bufs = [ln.buffer(PASS_W) for ln in conns]
    burn(conn_bufs, S_PAVE)
    burn([g for _, g, t in buildings if t.get("building") != "roof"], S_UNDER)   # open ground under roofs
    log("class raster done", np.bincount(cls.ravel(), minlength=11).tolist())

    # ---- building heights and passages
    tree = STRtree([ln for ln, _ in walk_lines])
    walk_geoms = [ln for ln, _ in walk_lines]
    bdata = []
    rng = np.random.default_rng(1)
    holes_cut = 0
    rng_planes, n_planes = np.random.default_rng(27), 0
    for oid, g, t in buildings:
        x0, y0, x1, y1 = g.bounds
        win = from_bounds(x0 - 1, y0 - 1, x1 + 1, y1 + 1, tf).round_offsets().round_lengths()
        r0, c0 = int(win.row_off), int(win.col_off)
        r0c, c0c = max(r0, 0), max(c0, 0)
        r1, c1 = min(r0 + int(win.height), shp[0]), min(c0 + int(win.width), shp[1])
        dmed = dmin = p95 = roof = None
        if r1 > r0c and c1 > c0c:
            a = DTM[r0c:r1, c0c:c1]; s = DSM[r0c:r1, c0c:c1]; cn = CANOPY[r0c:r1, c0c:c1]
            wtf = rasterio.transform.from_origin(LEFT + c0c, TOP - r0c, 1, 1)
            m = geometry_mask([mapping(g)], a.shape, wtf, invert=True)
            if m.sum() == 0:
                m = geometry_mask([mapping(g)], a.shape, wtf, invert=True, all_touched=True)
            if m.sum():
                dmed, dmin = float(np.median(a[m])), float(a[m].min())
                src = m & ~cn   # roof pixels not under tree canopy (all of m when the filter is off)
                if src.sum() < max(6, 0.3 * m.sum()):
                    src = m     # mostly under trees: keep the DSM as it is
                p95 = float(np.percentile(s[src] - a[src], 95))
                if m.sum() >= 6:   # roof surface: DSM inside the footprint, canopy pixels filled from the nearest roof pixel
                    _, (ii, jj) = distance_transform_edt(~src, return_indices=True)
                    R = s[ii, jj]   # session 16: no 3x3 median, chimneys and ridges stay sharp
                    q10, q90 = np.percentile(R[src], [10, 90])
                    roof = (R, m, (LEFT + c0c + 0.5 - E0, TOP - r0c - 0.5 - N0), q90 - q10 >= 1.5)
                    if GROUND_HOLES and t.get("building") != "roof":   # session 22: footprint parts where the LiDAR shows ground (building sites,
                        # courtyards mapped without an inner ring) become open ground, not a roof at ground + 1 m
                        low = binary_opening(m & (R - a < HOLE_H), np.ones((3, 3), bool))
                        lab, nl = label(low)
                        if nl:
                            sz = np.bincount(lab.ravel())
                            keep = np.isin(lab, np.nonzero(sz >= HOLE_MIN_PX)[0][1:])
                            if keep.any():
                                hp = unary_union([shape(q) for q, v in rio_shapes(keep.astype("u1"), mask=keep, transform=wtf) if v])
                                g2 = g.difference(hp.buffer(0.01))
                                if not g2.is_empty and g2.area >= 0.25 * g.area:
                                    holes_cut += 1
                                    g = g2
        if dmed is None:
            c = g.centroid
            dmed = dmin = float(dtm_at([c.x], [c.y])[0])
        h = p95
        if h is None or h < 2.5:
            roof = None
            try:
                h = float(str(t.get("height", "")).split()[0])
            except (ValueError, IndexError):
                lv = t.get("building:levels")
                h = 3.0 * float(lv) + 1.0 if lv and lv.replace(".", "").isdigit() else max(h or 0, 3.0)
            h = max(h, 2.5)
        is_roof = t.get("building") == "roof"
        if is_roof:   # canopy: market rows gabled at CANOPY_EAVE; others flat at the height tag / LiDAR top
            roof = None
            try:
                h = float(str(t.get("height", "")).split()[0])
            except (ValueError, IndexError):
                h = p95 if p95 is not None and 2.2 <= p95 <= 12 else 3.0
            if oid in MARKET_STALL_ROOFS:
                S = canopy_surface(g, 0.0, True)
                h = CANOPY_EAVE + CANOPY_T / 2 + (float(S[..., 2].max()) if len(S) else 0.0)
        top = dmed + h
        base = dmin - 0.3
        # passages for walkable ways that cross the building interior
        cuts = []
        inner = g.buffer(-0.3)
        if not inner.is_empty:
            for i in tree.query(g, predicate="intersects"):
                seg = walk_geoms[i].intersection(inner)
                if seg.length > 0.3:
                    cuts.append(seg.buffer(PASS_W))
        for cb in conn_bufs:
            if cb.intersects(g):
                cuts.append(cb.intersection(g))
        cut = unary_union(cuts) if cuts else None
        zcut = None
        if cut is not None and not cut.is_empty:   # passage ceiling clears the highest ground in the cut
            bx0, by0, bx1, by1 = cut.bounds
            gx, gy = np.meshgrid(np.arange(bx0, bx1 + 1, 1.0), np.arange(by0, by1 + 1, 1.0))
            zcut = float(dtm_at(gx.ravel(), gy.ravel()).max())
        c = g.representative_point()
        if is_roof:
            cut = zcut = None
        bdata.append(dict(oid=oid, g=g, t=t, top=top, base=base, dmed=dmed, cut=cut, zcut=zcut, cx=c.x - E0, cy=c.y - N0,
                          tone=rng.uniform(-0.06, 0.06), is_roof=is_roof))
        if roof is not None:
            bdata[-1].update(roofR=roof[0], roofM=roof[1], roofO=roof[2], pitched=roof[3])
            if ROOF_PLANES and roof[3]:
                Rp = roof_planes(roof[0], roof[1], rng_planes)
                if Rp is not None:
                    bdata[-1]["roofR"] = Rp
                    n_planes += 1
    log(holes_cut, "footprints with LiDAR ground holes")
    log(n_planes, "pitched roofs fitted with planes")
    if os.environ.get("WC_PLANE_STATS"):
        np.save("/tmp/plane_stats.npy", np.array(PLANE_STATS)); sys.exit(0)
    log("building heights done", sum(b["cut"] is not None for b in bdata), "with passages")

    if PARAM_ROOFS:   # touching footprints: no roof overhang into a neighbour (terraces)
        gs = [bd["g"] for bd in bdata]
        btree = STRtree(gs)
        for i, bd in enumerate(bdata):
            nb = [gs[j] for j in btree.query(bd["g"].buffer(0.4), predicate="intersects") if j != i and not bdata[j]["is_roof"]]
            bd["neigh"] = unary_union(nb) if nb else None
    lm_extra, lm_entries = build_landmarks(bdata, ways, nodes, DTM, DSM, tf, dtm_at)

    # ---- spawn: Market Square (Market Hill), nearest walkable way point
    sp_e, sp_n = Transformer.from_crs(4326, 27700, always_xy=True).transform(0.11894, 52.20563)
    best = min(walk_geoms, key=lambda ln: ln.distance(Point(sp_e, sp_n)))
    q = best.interpolate(best.project(Point(sp_e, sp_n)))
    spawn = {"x": round(q.x - E0, 2), "y": round(q.y - N0, 2), "z": round(float(dtm_at([q.x], [q.y])[0]), 2)}

    # ---- tiles
    os.makedirs(os.path.join(OUT, "tiles"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "collision"), exist_ok=True)
    tiles, man_b = [], []
    n_pitched = 0
    nt = int(2 * EXT / TILE)
    for ty in range(nt):
        for tx in range(nt):
            tid = f"t_{tx}_{ty}"
            bx0, by0 = -EXT + tx * TILE, -EXT + ty * TILE
            bx1, by1 = bx0 + TILE, by0 + TILE
            # ground grid
            xs = np.arange(bx0, bx1 + 1e-6, GSTEP); ys = np.arange(by0, by1 + 1e-6, GSTEP)
            X, Y = np.meshgrid(xs, ys)
            Z = dtm_at((X + E0).ravel(), (Y + N0).ravel()).reshape(X.shape)
            nx, ny = len(xs), len(ys)
            ids = np.arange(nx * ny).reshape(ny, nx)
            a, b, c, d = ids[:-1, :-1].ravel(), ids[:-1, 1:].ravel(), ids[1:, 1:].ravel(), ids[1:, :-1].ravel()
            gtri = np.concatenate([np.stack([a, b, c], 1), np.stack([a, c, d], 1)])
            V = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
            cen = V[gtri].mean(1)
            ci = np.clip((TOP - (cen[:, 1] + N0)).astype(int), 0, shp[0] - 1)
            cj = np.clip((cen[:, 0] + E0 - LEFT).astype(int), 0, shp[1] - 1)
            gsurf = cls[ci, cj]
            gkind = np.where(gsurf == S_WATER, 2, 1).astype(np.uint8)
            # vertex colours from the class at each vertex; normals from the DTM gradient
            vi = np.clip((TOP - (V[:, 1] + N0)).astype(int), 0, shp[0] - 1)
            vj = np.clip((V[:, 0] + E0 - LEFT).astype(int), 0, shp[1] - 1)
            lut = np.array([COLORS.get(k, (0.5, 0.5, 0.5)) for k in range(256)])
            vcol = lut[cls[vi, vj]]
            gy, gx = np.gradient(Z, GSTEP)
            vn = np.stack([-gx.ravel(), -gy.ravel(), np.ones(nx * ny)], 1)
            vn /= np.linalg.norm(vn, axis=1, keepdims=True)

            m = Mesh()
            col_parts = []
            glb_meshes = [("ground", to_gl(V), to_gl(vn), vcol, gtri.ravel())]
            # bridges whose midpoint is in this tile
            for ln, t in bridges:
                mp = ln.interpolate(0.5, normalized=True)
                if not (bx0 <= mp.x - E0 < bx1 and by0 <= mp.y - N0 < by1):
                    continue
                L = ln.length
                n = max(2, int(math.ceil(L / 1.0)) + 1)
                pts = np.array([ln.interpolate(s).coords[0] for s in np.linspace(0, L, n)]) - [E0, N0]
                za, zb = dtm_at([pts[0, 0] + E0, pts[-1, 0] + E0], [pts[0, 1] + N0, pts[-1, 1] + N0])
                zz = np.linspace(za, zb, n) + 0.05
                try:
                    half = max(1.2, float(str(t.get("width", "")).split()[0]) / 2)
                except (ValueError, IndexError):
                    half = ROAD_HALF.get(t["highway"], 1.5)
                tg = np.gradient(pts, axis=0); tg /= np.maximum(np.linalg.norm(tg, axis=1, keepdims=True), 1e-9)
                nr = np.stack([-tg[:, 1], tg[:, 0]], 1) * half
                Lp = np.c_[pts + nr, zz]; Rp = np.c_[pts - nr, zz]
                T = np.concatenate([np.stack([Rp[:-1], Rp[1:], Lp[1:]], 1), np.stack([Rp[:-1], Lp[1:], Lp[:-1]], 1)])
                m.tris(T, COLORS[S_BRIDGE], 1, S_BRIDGE)
                # underside so it shows from below
                m.tris(np.concatenate([T[:, ::-1]]) - [0, 0, 0.3], COLORS[S_BRIDGE], 1, S_BRIDGE)
            bridge_arr = m.arrays()
            if bridge_arr is not None:
                p, nrm, colr, k, s = bridge_arr
                glb_meshes.append(("bridges", to_gl(p), to_gl(nrm), colr, np.arange(len(p))))
                col_parts.append((p, k, s))
            # buildings whose representative point is in this tile
            for bd in bdata:
                if not (bx0 <= bd["cx"] < bx1 and by0 <= bd["cy"] < by1):
                    continue
                bm = Mesh()
                if PARAM_ROOFS and not bd.get("lm") and not bd["is_roof"] and param_roof(bm, bd):
                    zf, z1 = None, bd["top"]
                else:
                    bm = Mesh()
                    tone = bd["tone"]
                    wall = np.clip(np.array([0.78, 0.72, 0.60]) + tone, 0, 1)
                    roof = np.clip(np.array([0.45, 0.40, 0.38]) + tone, 0, 1)
                    g, cut, z0, z1 = bd["g"], bd["cut"], bd["base"], bd["top"]
                    zp = max(bd["dmed"] + PASS_H, (bd["zcut"] or -1e9) + 2.6)
                    zf = None if bd.get("lm") else roof_field(bd, max(bd["dmed"] + 1.0, zp + 0.5 if cut is not None else -1e9))
                    if zf is not None and bd.get("pitched"):
                        roof = np.clip(np.array([0.50, 0.33, 0.28]) + tone, 0, 1)   # pitched: tiled-roof red
                    if zf is not None:
                        n_pitched += 1
                    if bd["is_roof"]:   # session 31: roof with no walls (see add_canopy), no collision
                        gab = bd["oid"] in MARKET_STALL_ROOFS
                        ze = bd["dmed"] + CANOPY_EAVE if gab else z1 - CANOPY_T / 2
                        add_canopy(bm, g, ze, gab, np.array([0.88, 0.87, 0.83]) if gab else roof)
                    elif cut is None:
                        for p in polys_of(g):
                            if zf is None or not add_lidar_roof(bm, p, z0, zf, wall, roof):
                                add_prism(bm, p, z0, z1, wall, roof)
                    else:
                        low = g.difference(cut)
                        if z1 - zp > 1.0:
                            for p in polys_of(low):
                                add_prism(bm, p, z0, zp, wall, roof, top=False)
                            for p in polys_of(g):
                                if zf is None or not add_lidar_roof(bm, p, zp, zf, wall, roof, bottom=True):
                                    add_prism(bm, p, zp, z1, wall, roof, bottom=True)
                        else:
                            for p in polys_of(low):
                                add_prism(bm, p, z0, z1, wall, roof)
                arr = bm.arrays()
                if arr is None:
                    continue
                p, nrm, colr, k, s = arr
                node = "b:" + bd["oid"]
                if not bd["is_roof"]:
                    col_parts.append((p, k, s))   # collision keeps the plain body (passages, walls)
                lm = bd.get("lm")
                if lm:
                    parts = ([arr] if lm["keep_body"] or bd["cut"] is not None else []) + [a for a in (lm["solid"], lm["deco"]) if a is not None]
                    p, nrm, colr = (np.concatenate([a[i] for a in parts]) for i in range(3))
                glb_meshes.append((node, to_gl(p), to_gl(nrm), colr, np.arange(len(p))))
                man_b.append({"osm_id": bd["oid"], "tile": tid, "node": node, "detailed": bool(lm),
                              "name": bd["t"].get("name"), "height": round(z1 - bd["dmed"], 1)})
                if bd["is_roof"]:
                    man_b[-1].update(roof_only=True, base=round(bd["dmed"], 3))
            for ex in lm_extra:
                if bx0 <= ex["cx"] < bx1 and by0 <= ex["cy"] < by1:
                    parts = [a for a in (ex["lm"]["solid"], ex["lm"]["deco"]) if a is not None]
                    p, nrm, colr = (np.concatenate([a[i] for a in parts]) for i in range(3))
                    glb_meshes.append(("lm:" + ex["id"], to_gl(p), to_gl(nrm), colr, np.arange(len(p))))
                    for e in lm_entries:
                        if e["id"] == ex["id"]:
                            e["tile"], e["node"] = tid, "lm:" + ex["id"]
            # collision: ground (indexed) + everything else (unindexed)
            cv, ct, ck, cs = [V], [gtri], [gkind], [gsurf]
            off = len(V)
            for p, k, s in col_parts:
                cv.append(p); ct.append(np.arange(len(p)).reshape(-1, 3) + off); ck.append(k); cs.append(s)
                off += len(p)
            write_col(os.path.join(OUT, "collision", tid + ".col"), np.concatenate(cv), np.concatenate(ct),
                      np.concatenate(ck), np.concatenate(cs))
            write_glb(os.path.join(OUT, "tiles", tid + ".glb"), glb_meshes)
            tiles.append({"id": tid, "bounds": [bx0, by0, bx1, by1], "glb": f"tiles/{tid}.glb", "collision": f"collision/{tid}.col"})
        log("tile row", ty, "done")

    for e in lm_entries:   # landmarks that are buildings: tile/node from the building entry
        for b in man_b:
            if b["osm_id"] == e["osm_id"] and "node" not in e:
                e["tile"], e["node"] = b["tile"], b["node"]
    json.dump({"landmarks": lm_entries}, open(os.path.join(OUT, "landmarks.json"), "w"), indent=1)

    man = {"version": 1, "origin": {"crs": "EPSG:27700", "e0": E0, "n0": N0}, "spawn": spawn,
           "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "tiles": tiles, "buildings": man_b,
           "landmarks": lm_entries}
    json.dump(man, open(os.path.join(OUT, "manifest.json"), "w"), separators=(",", ":"))
    log(n_pitched, "buildings with LiDAR roof shapes")
    if PARAM_ROOFS:
        import roofs
        nl = sum(1 for bd in bdata if not bd.get("lm") and not bd["is_roof"])
        cnt = {}
        for _, st, _ in ROOF_STYLES:
            cnt[st] = cnt.get(st, 0) + 1
        json.dump({"parametric_share": round(len(ROOF_STYLES) / max(nl, 1), 4), "buildings": nl,
                   "parametric": len(ROOF_STYLES), "with_lidar_fit": sum(1 for r in ROOF_STYLES if r[2]),
                   "counts": cnt, "landmarks_untouched": sum(1 for bd in bdata if bd.get("lm")),
                   "styles": {o: st for o, st, _ in ROOF_STYLES}},
                  open(os.path.join(ROOT, "data/derived/roof_styles.json"), "w"), indent=1)
        log("parametric roofs", cnt)
        if ROOF_DEBUG:
            json.dump(ROOF_DEBUG, open("/tmp/roof_debug.json", "w"))
    log(f"done: {len(tiles)} tiles, {len(man_b)} buildings, spawn {spawn}, {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
