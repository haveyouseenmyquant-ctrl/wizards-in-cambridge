#!/bin/bash
# Safari KPI: runs the WebKit (Playwright) smoke test on a build and merges safari_ok (1 = ready, no console error)
# into data/benchmark/scores/<build_hash>_wic.json.   scripts/wic_safari.sh [site_dir]
cd "$(dirname "$0")/.."
S=${1:-site}
H=$(.venv/bin/python -I scripts/build_hash.py "$S") || exit 1
OUT=$(node scripts/webkit_smoke.mjs "$S" /tmp/wic_webkit.png 2>/tmp/wic_webkit.err); RC=$?
OK=0; [ $RC -eq 0 ] && OK=1
echo "${OUT:-$(tail -3 /tmp/wic_webkit.err)}" >&2
.venv/bin/python -I - "data/benchmark/scores/${H}_wic.json" "$OK" <<'PY'
import json, os, sys
f, ok = sys.argv[1], int(sys.argv[2])
d = json.load(open(f)) if os.path.exists(f) else {}
d["safari_ok"] = ok
json.dump(d, open(f, "w"), indent=1)
print(json.dumps({"safari_ok": ok}))
PY
exit $RC
