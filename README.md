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
