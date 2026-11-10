#!/bin/bash
# Merge gate: every game test on a site dir, sequentially; last stdout line is the JSON summary. See scripts/wic_gate.py.
exec python3 "$(cd "$(dirname "$0")/.." && pwd)/scripts/wic_gate.py" "$@"
