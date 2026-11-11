#!/bin/bash
# Merge gate: every game test on a site dir, sequentially; last stdout line is the JSON summary. See scripts/wic_gate.py.
# Tests: test_modload (fails on any "[game] module ... not loaded" warning or page error) test_classes test_feel test_camclip test_items test_mobs test_progression test_audio test_tutorial quest_bot test_townsfolk
exec python3 "$(cd "$(dirname "$0")/.." && pwd)/scripts/wic_gate.py" "$@"
