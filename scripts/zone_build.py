"""Market Square zone: real 3D facade geometry from the parametric parts library (session 30).

  .venv/bin/python -I scripts/zone_build.py [--ann-dir DIR ...]

Reads data/annotations/market_square/walls.json and the per-building annotations way_<id>.json (SCHEMA.md); walls
without an annotation get facade_parts.default_layout (flagged in the stats). Writes
  site/zone/market_square.glb    one node per building "f:<osm_id>" (+ scripts/zone_props.py build() nodes, if any)
  site/zone/zone.json            {glb, centre, radius, stats}
  data/derived/facade_geometry.json   per wall: id, annotated, element counts, areas (facade KPIs)
"""
import glob
import importlib
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build as B  # noqa: E402
import facade_parts as F  # noqa: E402

ROOT = B.ROOT
ZONE = "market_square"
ANN_DIR = os.path.join(ROOT, "data/annotations", ZONE)
GAMMA = float(os.environ.get("ZONE_GAMMA", "1.0"))   # colour hex -> vertex colour exponent (build.py uses raw values)


def load_annotations(dirs):
    walls = {}
    for d in dirs:
        for f in sorted(glob.glob(os.path.join(d, "way_*.json")) + glob.glob(os.path.join(d, "relation_*.json"))):
            try:
                a = json.load(open(f))
            except (OSError, ValueError) as e:
                print("skip annotation", f, e, file=sys.stderr)
                continue
            for w in a.get("walls", []):
                if "id" in w:
                    walls[w["id"]] = w
    return walls


def corner_extents(walls):
    """Skin x-extent per wall: extended by the skin depth at convex corners shared with the next/previous listed
    wall of the same building, shortened at concave ones (so neighbouring skins meet in a mitre)."""
    ext = {w["id"]: [0.0, w["length"]] for w in walls}
    ends = {}
    for w in walls:
        ends.setdefault((w["osm_id"], tuple(np.round(w["p0"], 1))), []).append(("start", w))
    for a in walls:
        for kind, b in ends.get((a["osm_id"], tuple(np.round(a["p1"], 1))), []):
            if b is a:
                continue
            da = np.subtract(a["p1"], a["p0"]) / max(a["length"], 1e-6)
            db = np.subtract(b["p1"], b["p0"]) / max(b["length"], 1e-6)
            cr = da[0] * db[1] - da[1] * db[0]   # outside on the right => footprint CCW => left turn = convex
            if abs(cr) < 0.2:
                continue
            d = F.SKIN if cr > 0 else -F.SKIN
            ext[a["id"]][1] += d
            ext[b["id"]][0] -= d
    return ext


# s71: corner walls that are really curved (OSM gives a chamfer): the skin is built flat on the curve length and bent
# onto a Bezier tangent to the neighbouring walls (through the chamfer ends, so it stays proud of the tile body).
CURVED = {"way/1288730360:1"}   # 15 Market Hill (Franco Manca), rounded Market Hill / Market Street corner


def curve_of(w, W):
    a = next(x for x in W if x["osm_id"] == w["osm_id"] and x["id"] != w["id"]
             and np.allclose(x["p1"], w["p0"], atol=0.05))
    b = next(x for x in W if x["osm_id"] == w["osm_id"] and x["id"] != w["id"]
             and np.allclose(x["p0"], w["p1"], atol=0.05))
    da = np.subtract(a["p1"], a["p0"]) / a["length"]
    db = np.subtract(b["p1"], b["p0"]) / b["length"]
    apex = F.line_apex(w["p0"], da, w["p1"], -db)
    return a, b, F.bezier_path(w["p0"], apex, w["p1"])


def curved_skin(w, lay, H, Lc, path):
    """Annotated layout of a chamfer wall rebuilt on the curve length Lc and bent onto the curve."""
    k = Lc / w["length"]
    lay = json.loads(json.dumps(lay))
    for wl in ([lay] if "elements" in lay else lay.get("walls", [lay])):
        for e in wl.get("elements", []):
            for key in ("x", "x0", "x1", "door_x"):
                if key in e:
                    e[key] = round(e[key] * k, 3)
    P = F.wall_facade(Lc, H, lay, 0.0, Lc)
    T, N, C = P.arrays()
    W3, Nw, C, M = F.bend(T, N, C, P.mats(), Lc, path)
    W3[..., 2] += w["ground_z"]
    return P, W3, Nw, C, M


def to_collision(w, T, N):
    p0 = np.asarray(w["p0"], float)
    d = (np.asarray(w["p1"], float) - p0) / w["length"]
    n = np.array([d[1], -d[0]])   # outward = right of p0 -> p1
    X = p0[0] + T[..., 0] * d[0] + T[..., 1] * n[0]
    Y = p0[1] + T[..., 0] * d[1] + T[..., 1] * n[1]
    Z = w["ground_z"] + T[..., 2]
    P = np.stack([X, Y, Z], -1)
    Nw = np.stack([N[:, 0] * d[0] + N[:, 1] * n[0], N[:, 0] * d[1] + N[:, 1] * n[1], N[:, 2]], -1)
    return P, Nw


def orient(P, Nw):
    """Make every triangle counter-clockwise seen from its intended normal; returns P and unit face normals."""
    g = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
    flip = (g * Nw).sum(1) < 0
    P = P.copy()
    P[flip] = P[flip][:, ::-1]
    g[flip] = -g[flip]
    ln = np.linalg.norm(g, axis=1)
    keep = ln > 1e-9
    return P[keep], g[keep] / ln[keep, None], keep


def gl_mesh(name, P, nrm, col, mat=None):
    """mat: optional (k,) per-triangle material ids (facade_parts.MATS) -> the _MAT vertex attribute."""
    k = len(P)
    pos = B.to_gl(P.reshape(-1, 3))
    nr = B.to_gl(np.repeat(nrm, 3, 0))
    cl = np.repeat(col, 3, 0)
    if mat is None:
        return (name, pos, nr, cl, np.arange(k * 3))
    return (name, pos, nr, cl, np.arange(k * 3), np.repeat(np.asarray(mat, np.float32), 3))


HIDE = []
CUTS = []        # s11: [x0, z0, x1, z1, y0, y1] three.js frame: tile wall rectangles cut away behind shop glass
SHOPGLASS = []   # s11: see-through shop glass triangles (mat 10)
ELEMENTS = {}   # wall id -> {"window": n, ...} counted from the geometry of the bespoke modules (their ELEMENTS)
PROP_BUILDINGS = {"way/400160677", "way/400160686"}   # food trailers: modelled by zone_props.py


def duplicate_walls(W, ann):
    """OSM has overlapping footprints (college ways vs street-address ways, e.g. way/137017428:0/1 = 1099847936:5/6),
    which would build two skins on one wall and z-fight. A wall is a duplicate when another building's wall runs along
    it (midpoints < 1.2 m apart, parallel, same facing); keep the annotated one, then the one with an address, else the one listed first.
    Returns {dropped wall id: kept wall id} (the kept wall's skin is the dropped wall's geometry too)."""
    drop = {}
    mids = [(np.add(w["p0"], w["p1"]) / 2, (np.subtract(w["p1"], w["p0"])) / max(w["length"], 1e-6)) for w in W]
    for i, a in enumerate(W):
        for j in range(i + 1, len(W)):
            b = W[j]
            if a["osm_id"] == b["osm_id"] or a["id"] in drop or b["id"] in drop:
                continue
            (ma, da), (mb, db) = mids[i], mids[j]
            if np.hypot(*(ma - mb)) > 1.2 or float(da @ db) < 0.95:
                continue
            def rank(w):   # annotated first, then the street-address way (the per-shop annotations use those)
                return (w["id"] in ann, "addr:housenumber" in w["tags"])
            lo, hi = (a, b) if rank(b) > rank(a) else (b, a)
            drop[lo["id"]] = hi["id"]
    return drop


def load_bespoke():
    """scripts/zone_bespoke_*.py modules: BUILDS = {osm_id: fn(walls_of_building) -> [{"name", "tris", "col"}, ...]}
    (optional "mat": a facade_parts.MATS name/id, or a per-triangle array of them; default plain)
    (tris: world collision-frame triangles (E, N, z) like zone_props). A bespoke building gets no generic skin.
    Optional HIDE_TILE = [osm_id, ...]: complete bespoke models whose tile body the viewer hides (zone.json "hide").
    Optional ELEMENTS = {wall_id: {"window": n, "door": n, "shopfront": n, "dormer": n}}: openings the module's geometry
    really emits per walls.json wall (for facade_geometry_match_pct; walls without it count as unmodelled)."""
    here = os.path.dirname(os.path.abspath(__file__))
    out = {}
    for f in sorted(glob.glob(os.path.join(here, "zone_bespoke_*.py"))):
        try:
            mod = importlib.import_module(os.path.basename(f)[:-3])
            out.update(getattr(mod, "BUILDS", {}))
            HIDE.extend(getattr(mod, "HIDE_TILE", []))
            ELEMENTS.update(getattr(mod, "ELEMENTS", {}))
        except Exception as e:   # never break the zone build
            print("bespoke module failed:", f, repr(e), file=sys.stderr)
    return out


def prop_meshes(items):
    meshes, n = [], 0
    for pr in items:
        T = np.asarray(pr["tris"], float).reshape(-1, 3, 3)
        if not len(T):
            continue
        g = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
        ln = np.linalg.norm(g, axis=1)
        ok = ln > 1e-9
        col = np.broadcast_to(np.asarray(pr["col"], float), (len(T), 3))[ok]
        m = pr.get("mat", 0)
        if isinstance(m, (str, int, float, np.integer)) or m is None:
            m = np.full(len(T), F.mat_id(m))
        else:
            m = np.array([F.mat_id(x) for x in np.asarray(m).reshape(-1)])
        mat = np.broadcast_to(m, (len(T),))[ok]
        meshes.append(gl_mesh(pr["name"], T[ok], g[ok] / ln[ok, None], col, mat))
        n += int(ok.sum())
    return meshes, n


def write_compact_glb(path, meshes):
    """Session 34: the zone GLB, indexed and quantized (KHR_mesh_quantization): flat-shaded triangle soup is deduped
    into shared vertices; POSITION int16 normalized (node translation + uniform scale restore metres; ~5 mm at 170 m), NORMAL int8,
    COLOR_0 uint8 normalized, _MAT uint8. ~20 bytes per vertex instead of 40, ~1/3 of the old file."""
    import struct
    chunks, bin_len = [], 0
    js = {"asset": {"version": "2.0", "generator": "walkable-cambridge zone_build.py",
                    "copyright": "© OpenStreetMap contributors; © Environment Agency copyright and/or database right 2022"},
          "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"],
          "scenes": [{"nodes": list(range(len(meshes)))}], "scene": 0, "nodes": [], "meshes": [],
          "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.9}}],
          "accessors": [], "bufferViews": [], "buffers": []}

    def view(b, target, stride=None):
        nonlocal bin_len
        bv = {"buffer": 0, "byteOffset": bin_len, "byteLength": len(b), "target": target}
        if stride:
            bv["byteStride"] = stride
        js["bufferViews"].append(bv)
        chunks.extend([b, b"\0" * (-len(b) % 4)])
        bin_len += len(b) + (-len(b) % 4)
        return len(js["bufferViews"]) - 1

    def acc(bv, count, ctype, typ, norm=False, **kw):
        a = {"bufferView": bv, "count": int(count), "componentType": ctype, "type": typ, **kw}
        if norm:
            a["normalized"] = True
        js["accessors"].append(a)
        return len(js["accessors"]) - 1

    for name, pos, nrm, col, idx, *extra in meshes:
        pos = np.asarray(pos, np.float64)[np.asarray(idx)]
        nrm = np.asarray(nrm, np.float64)[np.asarray(idx)]
        col = np.asarray(col, np.float64)[np.asarray(idx)]
        mat = np.asarray(extra[0], np.float64)[np.asarray(idx)] if extra and extra[0] is not None else np.zeros(len(pos))
        lo, hi = pos.min(0), pos.max(0)
        c, h = (lo + hi) / 2, max(float((hi - lo).max()) / 2, 1e-3)   # uniform scale: zone.js transforms normals by mat3(modelMatrix)
        qp = np.round((pos - c) / h * 32767).astype("<i2")
        qn = np.round(np.clip(nrm, -1, 1) * 127).astype("i1")
        qc = np.round(np.clip(col, 0, 1) * 255).astype("u1")
        qm = np.clip(np.round(mat), 0, 255).astype("u1")
        key = np.zeros((len(pos), 12), "u1")
        key[:, 0:6] = qp.view("u1").reshape(-1, 6)
        key[:, 6:9] = qn.view("u1")
        key[:, 9:12] = qc
        key = np.concatenate([key, qm[:, None]], 1)
        _, first, inv = np.unique(np.ascontiguousarray(key).view("V13").ravel(), return_index=True, return_inverse=True)
        n = len(first)
        P4 = np.zeros((n, 4), "<i2"); P4[:, :3] = qp[first]
        N4 = np.zeros((n, 4), "i1"); N4[:, :3] = qn[first]
        C4 = np.zeros((n, 4), "u1"); C4[:, :3] = qc[first]
        M4 = np.zeros((n, 4), "u1"); M4[:, 0] = qm[first]
        I = inv.astype("<u2" if n < 65536 else "<u4")
        a = {"POSITION": acc(view(P4.tobytes(), 34962, 8), n, 5122, "VEC3", True, min=[-32767] * 3, max=[32767] * 3),
             "NORMAL": acc(view(N4.tobytes(), 34962, 4), n, 5120, "VEC3", True),
             "COLOR_0": acc(view(C4.tobytes(), 34962, 4), n, 5121, "VEC3", True),
             "_MAT": acc(view(M4.tobytes(), 34962, 4), n, 5121, "SCALAR")}
        ia = acc(view(I.tobytes(), 34963), len(I), 5123 if I.dtype == np.dtype("<u2") else 5125, "SCALAR")
        js["meshes"].append({"primitives": [{"attributes": a, "indices": ia, "material": 0}]})
        js["nodes"].append({"name": name, "mesh": len(js["meshes"]) - 1,
                            "translation": c.tolist(), "scale": [h, h, h]})
    js["buffers"].append({"byteLength": bin_len})
    j = json.dumps(js, separators=(",", ":")).encode(); j += b" " * (-len(j) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(j) + 8 + bin_len))
        f.write(struct.pack("<II", len(j), 0x4E4F534A) + j)
        f.write(struct.pack("<II", bin_len, 0x004E4942))
        for ch in chunks:
            f.write(ch)


def main():
    t0 = time.time()
    args = sys.argv[1:]
    dirs = [ANN_DIR] + [args[i + 1] for i, a in enumerate(args) if a == "--ann-dir"]
    W = json.load(open(os.path.join(ANN_DIR, "walls.json")))["walls"]
    ann = load_annotations(dirs)
    ext = corner_extents(W)
    curves = {}
    for w in W:
        if w["id"] in CURVED:
            a, b, cv = curve_of(w, W)
            curves[w["id"]] = cv
            ext[a["id"]][1], ext[b["id"]][0] = a["length"], 0.0   # neighbours stop at the tangent points
    man = json.load(open(os.path.join(ROOT, "site/manifest.json")))
    landmark = {l["osm_id"]: l["id"] for l in man.get("landmarks", []) if l.get("detailed") and l.get("osm_id")}
    bespoke = load_bespoke()
    dup = duplicate_walls(W, ann)
    by_b, rows, skipped = {}, [], []
    tot_area = tot_detail = 0.0
    for w in W:
        L, H = w["length"], w["eave_z"] - w["ground_z"]
        a = ann.get(w["id"])
        if w["id"] in dup:
            skipped.append({"id": w["id"], "reason": "duplicate footprint", "built_as": dup[w["id"]]})
            continue
        if w["tags"].get("building") == "roof" or w["osm_id"] in PROP_BUILDINGS:
            # market stall rows (thin canopies in build.py + zone_props stalls) and trailers: no facade skin
            skipped.append({"id": w["id"], "reason": "stall/trailer"})
            continue
        if w["osm_id"] in bespoke:
            skipped.append({"id": w["id"], "reason": "bespoke", "built_as": "bespoke model " + w["osm_id"]})
            continue
        if a is None and w["osm_id"] in landmark:
            # detailed landmark render model (build.py build_landmarks) already has 3D buttresses/piers/windows that a
            # generic skin would clash with; only annotated walls of landmarks get a skin
            skipped.append({"id": w["id"], "reason": "landmark:" + landmark[w["osm_id"]]})
            continue
        lay = a if a is not None else F.default_layout(w)
        x0s, x1s = ext[w["id"]]
        if w["id"] in curves:
            P, Pw, Nw, C, M = curved_skin(w, lay, H, *curves[w["id"]])
            M = np.where(M == F.MATS["shopglass"], F.MATS["glass"], M)   # bent walls: no tile cut, glass stays opaque
        else:
            F.SHOP_INTERIORS = True
            P = F.wall_facade(L, H, lay, x0s, x1s)
            F.SHOP_INTERIORS = False
            T, N, C = P.arrays()
            M = P.mats()
            if not len(T):
                continue
            Pw, Nw = to_collision(w, T, N)
            for a_, b_, z0_, z1_ in P.cuts:   # s11: tile wall cut away behind see-through shop glass (materials.js)
                E, _ = to_collision(w, np.array([[[a_, 0, z0_], [b_, 0, z1_], [a_, 0, z1_]]]), np.zeros((1, 3)))
                g = B.to_gl(E[0])
                CUTS.append([round(float(v), 3) for v in (g[0][0], g[0][2], g[1][0], g[1][2], g[0][1], g[1][1])])
        Pw, nrm, keep = orient(Pw, Nw)
        col = np.clip(C[keep], 0, 1) ** GAMMA
        M = M[keep]
        sg = M == F.MATS["shopglass"]
        if sg.any():
            SHOPGLASS.append((Pw[sg], nrm[sg], col[sg], M[sg]))
            Pw, nrm, col, M = Pw[~sg], nrm[~sg], col[~sg], M[~sg]
        by_b.setdefault(w["osm_id"], []).append((Pw, nrm, col, M))
        area = L * H
        tot_area += area
        tot_detail += min(P.detail_area, area)
        rows.append({"id": w["id"], "osm_id": w["osm_id"], "annotated": a is not None, "length": round(L, 2),
                     "height": round(H, 2), "area": round(area, 2), "detail_area": round(min(P.detail_area, area), 2),
                     "elements": dict(sorted(P.counts.items())), "tris": int(len(Pw))})
    meshes = []
    for oid, parts in by_b.items():
        meshes.append(gl_mesh("f:" + oid, *(np.concatenate(x) for x in zip(*parts))))
    if SHOPGLASS:   # one transparent node (zone.js: reflection-only glass over the real shop interiors)
        meshes.append(gl_mesh("shopglass", *(np.concatenate(x) for x in zip(*SHOPGLASS))))
    nprops = 0
    for oid, fn in bespoke.items():
        try:
            m, n = prop_meshes(fn([w for w in W if w["osm_id"] == oid]))
            meshes += m
            nprops += n
        except Exception as e:
            print("bespoke build failed:", oid, repr(e), file=sys.stderr)
    here = os.path.dirname(os.path.abspath(__file__))
    for f in sorted(glob.glob(os.path.join(here, "zone_props*.py"))):   # zone_props.py, zone_props_<topic>.py
        try:
            zp = importlib.import_module(os.path.basename(f)[:-3])
            HIDE.extend(getattr(zp, "HIDE_TILE", []))   # s38: stall rows draw their own canopies
            m, n = prop_meshes(zp.build() if hasattr(zp, "build") else [])
            meshes += m
            nprops += n
        except Exception as e:   # props are optional; never break the facade build
            print("props module failed:", f, repr(e), file=sys.stderr)
    out = os.path.join(ROOT, "site/zone")
    os.makedirs(out, exist_ok=True)
    (B.write_glb if os.environ.get("ZONE_FLOAT_GLB") else write_compact_glb)(os.path.join(out, ZONE + ".glb"), meshes)
    ntris = sum(len(m[4]) // 3 for m in meshes)
    allp = np.array([w["p0"] for w in W] + [w["p1"] for w in W])
    centre = ((allp.min(0) + allp.max(0)) / 2).round(1).tolist()
    stats = {"walls_annotated": sum(r["annotated"] for r in rows), "walls_total": len(W), "walls_built": len(rows),
             "walls_unannotated": [r["id"] for r in rows if not r["annotated"]],
             "walls_skipped": skipped,
             "tris": ntris, "facade_tris": ntris - nprops, "prop_tris": nprops,
             "facade_area_m2": round(tot_area, 1), "modelled_detail_area_m2": round(tot_detail, 1)}
    json.dump({"glb": "zone/" + ZONE + ".glb", "centre": centre, "radius": 140, "hide": HIDE, "cuts": CUTS, "stats": stats},
              open(os.path.join(out, "zone.json"), "w"), indent=1)
    os.makedirs(os.path.join(ROOT, "data/derived"), exist_ok=True)
    built = {r["id"]: r for r in rows}
    json.dump({"zone": ZONE, "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "walls": rows,
               "skipped": skipped,
               "bespoke_walls": [{"id": k, "elements": v, "tris": 1} for k, v in sorted(ELEMENTS.items())
                                 if any(w["id"] == k and w["osm_id"] in bespoke for w in W)],
               # s40: a dropped duplicate is the same physical wall as the kept one, so it carries the kept skin's
               # emitted openings (zone_kpi compares them with the dropped wall's own annotation)
               "duplicate_walls": [{"id": d, "duplicate_of": k, "elements": built[k]["elements"], "tris": built[k]["tris"]}
                                   for d, k in sorted(dup.items()) if k in built],
               "stats": {k: v for k, v in stats.items() if k not in ("walls_unannotated", "walls_skipped")}},
              open(os.path.join(ROOT, "data/derived/facade_geometry.json"), "w"), indent=1)
    s = {k: v for k, v in stats.items() if k not in ("walls_unannotated", "walls_skipped")}
    s["walls_skipped"] = len(skipped)
    s["skip_reasons"] = {r: sum(x["reason"] == r for x in skipped) for r in dict.fromkeys(x["reason"] for x in skipped)}
    print(f"zone {ZONE}: {len(meshes)} nodes, {s}, {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
