"""Write <site>/<sub>/digest.json (sub = collision or tiles, default both): sha256 of every collision (.col) or world
tile (.glb), so build_hash.py follows collision and tile changes without fetching ~220 MB over the network (session 75;
QA s6: + tiles, after the s18 roof rebuild kept the old hash and service.sh never rescored the new roofs)."""
import hashlib
import json
import os
import sys

EXT = {"collision": ".col", "tiles": ".glb"}


def digest(site, sub):
    """The digest.json text for <site>/<sub>; '' if the dir does not exist."""
    d = os.path.join(site, sub)
    if not os.path.isdir(d):
        return ""
    h = hashlib.sha256()
    names = sorted(f for f in os.listdir(d) if f.endswith(EXT[sub]))
    for f in names:
        h.update(f.encode() + b"\0" + hashlib.sha256(open(os.path.join(d, f), "rb").read()).digest())
    return json.dumps({"tiles": len(names), "sha256": h.hexdigest()})


if __name__ == "__main__":
    for sub in sys.argv[2:] or list(EXT):
        out = digest(sys.argv[1], sub)
        p = os.path.join(sys.argv[1], sub, "digest.json")
        if out and (not os.path.exists(p) or open(p).read() != out):
            open(p, "w").write(out)
        print(sub, out)
