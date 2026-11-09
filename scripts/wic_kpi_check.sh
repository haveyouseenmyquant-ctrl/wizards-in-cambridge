#!/bin/bash
# Task check helper: exits 0 if KPI <key> in data/benchmark/scores/<build_hash>_wic.json is > <min> (or < <max> with --lt).
#   scripts/wic_kpi_check.sh <key> <min> [site_dir]      scripts/wic_kpi_check.sh --lt <key> <max> [site_dir]
cd "$(dirname "$0")/.."
LT=0; [ "$1" = "--lt" ] && { LT=1; shift; }
H=$(.venv/bin/python -I scripts/build_hash.py "${3:-site}") || exit 1
python3 -c 'import json,sys
d = json.load(open(sys.argv[1])); v = d.get(sys.argv[2])
print(sys.argv[2], "=", v)
ok = isinstance(v, (int, float)) and (v < float(sys.argv[3]) if sys.argv[4] == "1" else v > float(sys.argv[3]))
sys.exit(0 if ok else 1)' "data/benchmark/scores/${H}_wic.json" "$1" "$2" "$LT"
