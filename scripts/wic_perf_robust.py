"""Load-robust fps_median (QA s7, task db8c): a single wic_perf run on a busy Mac mini read 41 fps at loadavg 6-8 for a
build that reads 60 when idle. This waits until the 1-minute loadavg is below WIC_PERF_MAX_LOAD (4) and no other test
browser (puppeteer / playwright profile) is running, for at most WIC_PERF_WAIT_S (1200 s), then runs wic_perf.mjs
WIC_PERF_RUNS (2) times with --no-write and merges the run with the higher fps_median into <hash>_wic.json:
fps_median, load_seconds, perf_detail {..best run, loadavg_before, loadavg_after, waited_s, load_ok, runs[]}.

    .venv/bin/python -I scripts/wic_perf_robust.py [site] [--hash H]     (hash default: WIC_BUILD_HASH, else build_hash.py)
Exit 0 measured, 1 harness failure (no run produced an fps_median)."""
import datetime
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[1:]
H = os.environ.get("WIC_BUILD_HASH", "")
if "--hash" in args:
    i = args.index("--hash"); H = args[i + 1]; del args[i:i + 2]
SRC = args[0] if args else os.path.join(ROOT, "site")
MAX_LOAD = float(os.environ.get("WIC_PERF_MAX_LOAD", 4))
WAIT_S = int(os.environ.get("WIC_PERF_WAIT_S", 1200))
RUNS = int(os.environ.get("WIC_PERF_RUNS", 2))
log = lambda *a: print("[wic_perf_robust]", *a, file=sys.stderr, flush=True)


def other_browsers():  # main Chrome/WebKit processes started by puppeteer or playwright (test browsers, not the user's)
    out = subprocess.run(["pgrep", "-fl", "puppeteer_dev_chrome_profile|playwright_chromiumdev_profile|pw_run.sh|playwright.*webkit"],
                         capture_output=True, text=True).stdout
    return [l for l in out.splitlines() if "Helper" not in l and "pgrep" not in l]


def la():
    return round(os.getloadavg()[0], 2)


if not H:
    H = subprocess.run([os.path.join(ROOT, ".venv/bin/python"), "-I", os.path.join(ROOT, "scripts/build_hash.py"), SRC],
                       capture_output=True, text=True).stdout.strip()
t0 = time.time()
while True:
    busy = other_browsers()
    if la() < MAX_LOAD and not busy:
        break
    if time.time() - t0 > WAIT_S:
        log(f"gave up waiting after {WAIT_S} s: loadavg {la()}, other browsers {len(busy)}; measuring anyway")
        break
    time.sleep(15)
waited = round(time.time() - t0)
load_ok = la() < MAX_LOAD and not other_browsers()
before = la()
runs = []
for k in range(RUNS):
    lb = la()
    p = subprocess.run(["node", os.path.join(ROOT, "scripts/wic_perf.mjs"), SRC, "--no-write"], capture_output=True, text=True)
    try:
        d = json.loads(p.stdout.strip().splitlines()[-1])
    except (IndexError, ValueError):
        d = {}
    r = {"fps_median": d.get("fps_median"), "load_seconds": d.get("load_seconds"), "loadavg_before": lb, "loadavg_after": la(),
         "detail": d.get("perf_detail", {})}
    log(f"run {k + 1}: fps_median {r['fps_median']} load_seconds {r['load_seconds']} loadavg {lb} -> {r['loadavg_after']}")
    runs.append(r)
after = la()
good = [r for r in runs if r["fps_median"] is not None]
if not good:
    log("no run measured fps_median (harness)")
    print(json.dumps({"fps_median": None}))
    sys.exit(1)
best = max(good, key=lambda r: r["fps_median"])
detail = {**best["detail"], "loadavg_before": before, "loadavg_after": after, "waited_s": waited, "load_ok": load_ok,
          "max_load": MAX_LOAD, "runs": [{k: v for k, v in r.items() if k != "detail"} | {"fps_p5": r["detail"].get("fps_p5")} for r in runs],
          "at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}
new = {"fps_median": best["fps_median"], "load_seconds": best["load_seconds"], "perf_detail": detail}
sf = os.path.join(ROOT, "data/benchmark/scores", f"{H}_wic.json")
cur = json.load(open(sf)) if os.path.exists(sf) and os.path.getsize(sf) else {}
cur.update(new)
json.dump(cur, open(sf + ".tmp", "w"), indent=1); os.replace(sf + ".tmp", sf)
log("wrote", sf)
print(json.dumps({"hash": H, "fps_median": best["fps_median"], "load_seconds": best["load_seconds"], "runs": [r["fps_median"] for r in runs], "load_ok": load_ok}))
