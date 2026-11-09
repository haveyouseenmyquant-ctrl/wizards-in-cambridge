#!/bin/bash
# Wizards in Cambridge KPIs: prints one JSON object, reading only cached per-build results (fast).
# Current build = the published snapshot data/derived/live_site if present (written by publish.sh), else site/.
# Contract for the scoring scripts (owned by the teams, run by publish.sh / service.sh):
#   data/benchmark/scores/<BUILD_HASH>_wic.json   any of the KPI keys below, measured on that exact build
#   data/derived/browser_kpi.json                 {"hash", "result": {"fps_median", "load_seconds"}} (prototype harness)
# A KPI not measured on the current build prints 0.
cd "$(dirname "$0")"
PY=.venv/bin/python
S=site; [ -d data/derived/live_site ] && S=data/derived/live_site
H=$($PY -I scripts/build_hash.py "$S" 2>/dev/null)
$PY -I - "$H" <<'EOF'
import json, os, sys
h = sys.argv[1]
keys = ("judged_game_quality", "main_quests_shipped", "playtest_pass_pct", "fps_median", "load_seconds")
out = dict.fromkeys(keys, 0)
b = "data/derived/browser_kpi.json"
if h and os.path.exists(b):
    d = json.load(open(b))
    if d.get("hash") == h:
        out.update({k: d["result"][k] for k in ("fps_median", "load_seconds") if k in d.get("result", {})})
f = "data/benchmark/scores/%s_wic.json" % h
if h and os.path.exists(f):
    out.update({k: v for k, v in json.load(open(f)).items() if k in keys and isinstance(v, (int, float))})
print(json.dumps(out))
EOF
