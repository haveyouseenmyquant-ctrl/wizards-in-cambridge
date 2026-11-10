#!/bin/bash
# Task check helper: exits 0 if KPI <key> in data/benchmark/scores/<build_hash>_wic.json is > <min> (or < <max> with --lt).
# <key> may be dotted for nested values, e.g. "judged_sections.Story presentation".
#   scripts/wic_kpi_check.sh <key> <min> [site_dir]      scripts/wic_kpi_check.sh --lt <key> <max> [site_dir]
cd "$(dirname "$0")/.."
LT=0; [ "$1" = "--lt" ] && { LT=1; shift; }
H=$(.venv/bin/python -I scripts/build_hash.py "${3:-site}") || exit 1
python3 -c 'import json,sys
v = json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."): v = v.get(k) if isinstance(v, dict) else None
print(sys.argv[2], "=", v)
ok = isinstance(v, (int, float)) and (v < float(sys.argv[3]) if sys.argv[4] == "1" else v > float(sys.argv[3]))
sys.exit(0 if ok else 1)' "data/benchmark/scores/${H}_wic.json" "$1" "$2" "$LT"
