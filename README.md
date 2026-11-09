# Wizards in Cambridge

An original wizard action RPG set in Cambridge city centre, playable in the browser, built on the open-data world of
the Walkable Cambridge prototype (OpenStreetMap, Environment Agency LiDAR, OS OpenData, CC0 assets). Built by Tobi,
an AI agent operated by Gaspard Oliviers. KPIs: `./measure.sh`. Prototype history: `JOURNAL-PROTOTYPE.md`.

- Study area: `area.geojson` (52.1975–52.2125 N, 0.1080–0.1330 E; fixed).
- Data sources and licences: `DATA.md`.
- Build format (manifest, tiles, collision): `FORMAT.md`.
- KPIs: `./measure.sh` (uses `scripts/kpi.py`; OSM targets from `scripts/osm_targets.py`).
- Fixed landmark list: `landmarks/landmarks.json`.
- Harness self-test: `.venv/bin/python -I scripts/make_test_build.py && .venv/bin/python -I scripts/kpi.py data/testbuild --verbose`.
- Build the world: `.venv/bin/python -I scripts/build.py` → `site/manifest.json`, `site/tiles/`, `site/collision/` (git-ignored, ~6 s).
- Viewer: `site/index.html` + `site/app/` (three.js, vendored in `site/vendor/`). Serve `site/` with any static server.
- Publish: `scripts/publish.sh` uploads the world data as a release asset; `.github/workflows/pages.yml` deploys viewer + world to GitHub Pages.

Credits: © OpenStreetMap contributors (ODbL). © Environment Agency copyright and/or database right 2022 (OGL v3).
Contains OS data © Crown copyright and database right 2026 (OGL v3).

## Scoring loop (service.sh, QA)

`./service.sh` (or `./service.sh --once`) checks the current build (data/derived/live_site if present, else site/)
every 10 min. For each new build hash (scripts/build_hash.py) it runs, one at a time, skipping heavy work while
data/derived/session_active is fresher than 75 min:
1. `scripts/wic_record.mjs` (fixed scripted recordings) + `scripts/wic_judge.py` (blind judge, frozen docs/RUBRIC.md)
   -> `judged_game_quality`, `judged_sections`
2. `scripts/wic_playtest.mjs` (or `scripts/playtest.mjs` until it exists) -> `playtest_pass_pct`, `per_class`
3. `scripts/quest_bot.mjs` (Story) -> `main_quests_shipped`, once it exists
4. `scripts/wic_perf.mjs` (Optimisation) -> `fps_median`, `load_seconds`, once it exists
Results merge into data/benchmark/scores/<hash>_wic.json. Lock: /tmp/wic_service.lock. Each step's outcome
(ok / game_fail / harness_fail) is appended to data/derived/wic_harness_log.jsonl; a step is tried at most 3 times
per hash.
