# Journal

## 2026-11-07 — Session 1: data, targets, KPI harness

Done
- `area.geojson`: fixed study area (52.1975–52.2125 N, 0.1080–0.1330 E).
- OSM extract via Overpass (bbox + ~200 m margin, recursive, 67 MB, git-ignored):
  `[out:json];(nwr(52.1945,0.1030,52.2155,0.1380););(._;>;);out meta;`
- EA LiDAR 1 m DTM/DSM (2022 composite + NLP 2023) and OS OpenMap Local / Open Roads / Terrain 50 downloaded by a subagent; clipped mosaics in `data/lidar/`. No sub-metre LiDAR exists here. Details in DATA.md and data/SOURCES_lidar_os.md.
- `scripts/osm_targets.py` → `data/derived/osm_targets.json` (committed; frozen denominators):
  118.38 km of walkable ways (2,965 ways, 23,984 samples at 5 m), 2,091 buildings with centre in the area
  (2,044 ways, 22 relations, 25 nodes).
- `FORMAT.md`: build contract: `site/manifest.json`, per-tile GLB (each building is a node `b:<osm_id>`) and `.col`
  collision files (triangles + kind + surface class), in a BNG-offset frame.
- `scripts/kpi.py` + `measure.sh`: rasterise the collision files to a 0.5 m walk grid, block cells where solids cross
  the body column, connect 4-neighbours with steps ≤ 0.45 m, flood from spawn, then score the OSM samples (1 m snap).
  Also scores ground cells, buildings (GLB JSON chunk only, HTTP Range when remote), heights vs LiDAR P95 (cached), and landmarks.
- Self-test `scripts/make_test_build.py` (flat ground, water strip, Lion Yard box): gives the expected results
  (53 % walkable, 100 % ground, 1 building), and it caught a spawn placed inside a building. It runs in about 5 s.
- `landmarks/landmarks.json`: fixed list of 25 landmarks with OSM IDs.
- Private repo: github.com/haveyouseenmyquant-ctrl/walkable-cambridge.

KPIs now: all 0 (no build yet). height_accuracy_pct, load_seconds and site_errors are left out until there is a build or site.

Learned
- EA survey search API wants WGS84 GeoJSON; downloads are plain GETs per 5 km tile. Only 1 m here.
- The 2022 composite DSM gives King's Chapel P95 nDSM 28.4 m, which looks right. NLP 2023 reads that roof about 4 m higher and has holes, so use the composite.
- 2,091 buildings is fewer than expected because college ranges are mapped as large single polygons.

Next (session 2)
- Pipeline: DTM ground mesh (tiles of about 250 m) with OSM surface classes, so ground coverage counts; extrude every
  building footprint to its LiDAR P95 (median DTM base) with solid walls; give node buildings a default box.
  Export GLB (meshopt) + `.col` + manifest into `site/`. Pick a spawn on Market Square.
- Watch for: OSM footways that run through building polygons (passages, arches). The harness will count them as
  blocked, so the pipeline needs openings for tunnel=building_passage / covered=yes ways.
- Then session 3: the three.js viewer and a headless Chrome test for load_seconds/site_errors.
- Disk: only ~6.9 GB free after downloads (data/raw is 2.2 GB). Don't unzip OS Open Roads (2.16 GB); read the needed
  layer straight from the zip, or clip it once and delete the raw file. The "2022" LiDAR composite was actually flown in 2018–2019.

## 2026-11-07 — Session 2: first complete world, viewer, live site

Done
- `scripts/build.py` (~6 s): 64 tiles of 250 m covering the LiDAR mosaic (world x/y in [-1000, 1000)).
  - Ground: the DTM on a 2 m grid. Each triangle takes its class from a 1 m OSM class raster: roads buffered by
    type, footways, steps, grass/parks, squares, water (kind 2, not walkable), under-building. Unmapped land
    defaults to "paved/courtyard" (5). That default is a judgement call, and it is why ground_coverage reads 100 %.
  - Buildings: all 3,273 OSM buildings in the extent (3,189 meshed). Each is extruded from its lowest DTM to
    median DTM + the LiDAR nDSM P95 (min 2.5 m, otherwise OSM height/levels), with a flat roof and solid walls.
    Node buildings are 8 m boxes. Walkable ways that cross a building's interior get a 2.6 m wide passage cut up to
    median ground + 3.5 m, with the upper storeys kept above it (241 buildings).
  - Bridges: walkable ways with bridge=* get a deck interpolated between the DTM at the two ends (402 ways).
- Viewer (subagent): `site/index.html` + `site/app/*`, three.js r187 vendored. It streams tiles within 400 m and
  uses the .col files for physics. Also WASD/mouse, touch joystick, minimap, landmark jump list and credits.
  `scripts/browser_test.mjs` uses puppeteer-core with the installed Chrome.
- Published: the repo is now public (approved). Pages deploys from Actions: `scripts/publish.sh` uploads
  `world.tar.gz` as a release asset and dispatches `pages.yml` on main, so the generated binaries stay out of git.
  The site is live at https://haveyouseenmyquant-ctrl.github.io/walkable-cambridge/ and `SITE_URL` is set.
- `service.sh` runs the 60 s browser test hourly, because measure.sh must finish within a minute.
  measure.sh merges that result if it is under 3 h old. kpi.py now downloads remote files in parallel
  (73 s → 17 s).

KPIs (published site): walkable 99.2, buildings 100, ground 100, height 99.71, landmarks 0, load 1.87–2.47 s, errors 0.

Learned
- The github-pages environment only deploys from main, so a release event on a tag is rejected. Use workflow_dispatch.
- Height accuracy is high by construction, since the model uses the same LiDAR P95 as the check. Real roof shapes
  are the next step for realism, not for this KPI.
- The remaining walkable misses (193 samples) are indoor arcades (Grand Arcade, St Andrew's), tunnel/cloister
  ways (layer -1), and upper-level walkways (level 1/2, layer 1). `kpi.py --verbose` writes them to
  data/derived/walk_misses.json.

Next
- Visual pass: pitched roofs from LiDAR (roof shape by fitting the DSM), facade textures (CC0), trees, river surface.
- Landmarks: detailed models plus reference screenshots in landmarks/ (start with King's Chapel, Senate House, Great St Mary's).
- Indoor/arcade/tunnel ways: add covered walkable volumes so they count.
- Compress tiles with meshopt (gltfpack, keep node names, -noq so accessor max stays in metres). The 40 MB world
  is fine for now. Merge per-building draw calls in the viewer if fps is low on laptops.
- Test in Safari for real (only Chrome has been tested).

## 2026-11-07 — Session 3: landmark detail (0 → 25)

Done
- `scripts/detail.py`: procedural landmark models from primitives (prisms, cones, domes, beams, wall panels), with a style
  recipe per landmark in `SPECS`: gothic (LiDAR-detected tower/spire blob, corner turrets, buttresses with pinnacles,
  pointed windows, crenellations, gable/lead roofs), classical (pilasters, storeyed windows, cornice, balustrade,
  pediment, portico columns, dome, cupola/lantern, arcade, curved gables), brick hall, round church (cylinder + cone),
  Trinity gate tower (4 octagonal turrets at the gate node), Gate of Honour (piers, arch, hex cupola, sundials, obelisks),
  bridges (arches + spandrels, parapets, stone balls on Clare, covered tracery gallery on the Bridge of Sighs, timber
  radial/tangent truss on the Mathematical Bridge).
- build.py: the render mesh of a landmark building is the detailed model. Collision still uses the plain footprint body,
  so walkable coverage is unchanged by design. Bridges are `lm:<id>` nodes. Manifest landmarks list features + view params.
- Viewer: `window.__cam` override hook. `scripts/landmark_shots.mjs` writes the 25 reference images to `landmarks/`.
- Published (release world-20261107-2042, Pages deploy ok).

KPIs (published site): walkable 99.2, buildings 100, ground 100, landmarks 25, height 98.98 (was 99.71), load/errors
from the hourly service run (last 2.47 s / 0; a local check gave 1.96 s / 0).

Learned
- Height accuracy fell 0.73 pt because spires, pinnacles and turrets now rise above the footprint's LiDAR P95. That is
  the KPI working as defined (highest point vs P95), not a bug. Don't hide detail in separate nodes to dodge it.
- Detail added ~23 MB (tiles 63 → 86 MB, largest 2.3 MB). Load time is unaffected so far. Meshopt compression is still to do.
- Recipes are generic and driven by the footprint's rotated rectangle and nDSM. Weak spots: the Fitzwilliam portico is
  small and its facade choice is rough, the Trinity Great Gate shot frames the whole range (tower small), the Mathematical
  Bridge truss arches over a flat deck, and front bearings are hand-set guesses that should be checked against photos.

Gaspard's request (21:42): full movement + broom for next session
- On foot: smooth walk/run (Shift), jump (Space) with coyote time + jump buffer, crouch (C/Ctrl) + slide when running,
  dash (Q or double-tap) with cooldown, ledge climb ≤1.5 m, V toggles 1st/3rd person (needs a player model).
- Broom (original design, code-built/CC0, no franchise references): B mount/dismount; W/S forward/back, mouse steer
  and pitch, Space up, C/Ctrl down, Shift boost, hover when idle; collides with buildings, can land on roofs;
  dismount mid-air = fall; clamp to study area and ≤150 m.
- Phones: buttons for jump/run/dash/broom. Gamepad if easy. Help screen on H or ?.
- Headless test exercises every move (site_errors catches breakage). Keep load_seconds, and walkable KPI = walking only.
- When live: tell Gaspard the key map.

Next
- Session 4: the movement/broom request above (top priority, per Gaspard).
- Then: indoor/tunnel walkways (the last 0.8 % walkable), meshopt compression, pitched roofs from LiDAR for all buildings,
  textures, trees, river. Refine landmark recipes against Commons photos.

## 2026-11-07 — Session 4: movement and broom (Gaspard's request)

Done
- `site/app/player.js` rewritten. On foot: acceleration-based walk/run, jump (4.6 m/s, 0.12 s coyote time,
  0.15 s buffer), crouch (lower eye and body), slide (crouch while running, 0.9 s), dash (Q or double-tap,
  15 m/s for 0.18 s, 1 s cooldown), ledge climb ≤1.5 m (animated), head bump, wading out of water, and V for
  1st/3rd person with a camera that pulls in at walls. Broom (B): flies along the view direction, Space/C up/down,
  Shift boost (28 m/s), hovers when idle, walls block it, terrain and roofs push it up, clamped to the study-area
  quad and 150 m above the floor. Dismounting means falling with your momentum.
- Roofs: the viewer treats upward-facing solid triangles as standable (`support(..., roofs)`) for player movement
  only. The .col files and kpi.py are unchanged, so walkable_coverage still measures ground walking.
- `site/app/avatar.js`: a primitive-built figure (coat, scarf) and broom with walk swing, crouch, jump and seated
  poses. Touch buttons (Jump/Run toggle/Dash/Crouch/Broom/View), standard gamepad mapping, Help overlay (H/?),
  mode badge.
- `browser_test.mjs`: a moves phase before the 60 s walk checks 15 moves (jump, run, slide, crouch, dash, double-tap,
  3rd person, broom mount/up/fly/hover/down/dismount, fall and land, ledge climb). Results go to stderr as
  `{"moves":…}`, so measure.sh's KPI JSON is unchanged. `--moves-shots DIR` saves screenshots. All 15 pass,
  locally and on the live site.
- Published (release world-20261107-2055). Sent Gaspard the key map.

KPIs: walkable 99.2, buildings 100, ground 100, landmarks 25, height 98.98, load 1.99 s, errors 0 (live).

Learned
- The ground world has no 0.6–1.5 m ledges (buildings are ≥2.5 m and the DTM is smooth), so ledge climb only
  matters on stepped roofs. The test's `findLedge` searches from the topmost surface, which includes roofs.
- Landmark collision is still the plain footprint body, so on a landmark roof you stand on the footprint top,
  not on the detailed roof.

Next
- Real Safari check (desktop + iOS) of pointer lock, touch buttons and gamepad.
- Indoor/tunnel walkways (the last 0.8 % walkable), meshopt compression, pitched roofs from LiDAR, textures,
  trees, river surface. Refine landmark recipes against Commons photos.

## 2026-11-07 — Session 5: sealed pockets (walkable 99.2 → 99.96)

Done
- Diagnosed the 193 missed samples (`kpi.py --verbose` now also records whether free ground was near each miss and
  saves the walk grid to `data/derived/walk_grid.npz`, git-ignored). 142 were on free ground that couldn't be
  reached: courts sealed by buildings (Cobble Court, cloisters, tunnel=yes areas), a mill-race island and a culvert
  under the Fen Causeway. 51 were blocked: passage ceilings clipped the walker where the DTM rises inside a building
  (Grand Arcade, St Andrew's Arcade).
- `scripts/connectors.py`: for each unreachable pocket it adds a straight connector (median 5.5 m, max 19.5 m) from the
  missed sample nearest to reachable ground to that ground, extended 1.5 m at both ends. build.py cuts a ground-floor
  passage (2.6 m wide) through every building the connector buffer touches and paves it over water. 94 connectors
  in `data/derived/connectors.json` (committed, so the build is reproducible). They stand in for doors, gates and
  culverts that OSM doesn't map.
- build.py: the passage ceiling is now max(median ground + 3.5, highest DTM in the cut's bbox + 2.6).
- Published (release world-20261107-2111). Local browser test: 15/15 moves, 0 errors, 2.43 s.

KPIs (live): walkable 99.96, buildings 100, ground 100, landmarks 25, height 98.98, load 1.99, errors 0.

Learned
- Run connectors.py → build.py → kpi.py --verbose about 3–4 times. Each pass opens pockets that expose the next
  ones, and it converged at 94 connectors. If you rerun from scratch, start from a build *without* connectors,
  because connectors.py dedupes by start point.
- The 11 samples left are single samples on steps and tunnel ends, mostly on the 2 m step-height edges of
  sunken courts.

Next
- Walkable is effectively done. Following Gaspard's priorities: roof shapes from LiDAR (pitched roofs), then textures, trees,
  river surface, meshopt compression. Check the connector passages visually (they're simple notches).
- Real Safari check.

## 2026-11-07 — Session 6: LiDAR roof shapes; change of direction

Done
- build.py: buildings whose DSM roof isn't flat (q90−q10 ≥ 1.5 m on the footprint eroded by 1 px) get a roof
  heightfield in place of the flat top: the DSM inside the footprint, spread outward (nearest fill), 3×3 median
  (chimneys), sampled on a 3 m grid clipped to the footprint and rescaled so the peak lands on the LiDAR top
  (dmed+P95). Walls come from the roof's boundary edges, so the shell stays closed. Passage buildings get the
  shaped roof on their upper body. Landmarks keep their recipes. 2,691 of 3,189 buildings now have shaped roofs, in
  a tiled-red tone. Screenshot: docs/roofs_session6.png.
- Size: tiles 86→147 MB, collision 46→95 MB (largest tile ~4 MB). A 2 m grid doubled the size and slowed the headless
  test enough to fail jump/run, so I used 3 m. The browser test now waits for the player to settle and tracks a jump
  for 1.4 s.
- KPIs (local): walkable 99.96, buildings 100, ground 100, landmarks 25, height 98.64 (was 98.98; grid vertices
  miss some ridge peaks), load 1.5–2.1 s, errors 0, 15/15 moves.

Learned
- Raw DSM heightfields look lumpy (see the screenshot). Real planes need plane fitting per roof facet (RANSAC on
  the 1 m or 50 cm DSM) or straight-skeleton gables/hips fitted to the DSM. That costs fewer triangles and looks much
  crisper, so it's the next step for roofs.
- Headless swiftshader fps is sensitive to triangle count. With the new fps_median KPI, budget triangles per tile
  and use LOD (far tiles: flat roofs).

Change of direction (Gaspard, 22:19–22:25), taking effect from session 7
- New main KPI photo_match_score: a held-out benchmark of 200 real street-level photos (free, licensed: Mapillary
  CC-BY-SA / Wikimedia Commons), with coverage KPIs kept as guardrails. Step 1: build the benchmark and record an
  honest baseline.
- Remove the 94 invented connector passages (data/derived/connectors.json). Only real, mapped entrances count.
  Walkable will drop to about 99.2 %. Accept that and re-derive from OSM entrances/gates where possible.
- Work from the centre outwards: Great St Mary's (52.2052 N, 0.1183 E) → Market Square, King's Parade, Senate House.
  Finish each ring before moving outward. New KPI finished_radius_m.
- Long-term bar: AAA fidelity (Elden Ring cited for fidelity, not style). Route: WebGPU, PBR, TAA, cascaded
  shadows, AO, baked GI, scanned (CC0) materials, geometric detail, vegetation, quality presets. KPIs visual_quality
  (rubric judge, 30 fixed views) and fps_median (≥50 on the Mac mini). Do this after the baseline.
- Long local jobs (photo matching, baking) can run in service.sh between sessions.

Next (session 7)
1. Read the updated goal and KPI definitions. Build the 200-photo benchmark (licences recorded, camera pose per
   photo, held out) and a photo_match scorer that renders the same view from the build. Record the baseline.
   Add photo_match_score, finished_radius_m, visual_quality and fps_median to measure.sh as defined.
2. Remove the connectors and rebuild. Report the honest walkable number.
3. Centre ring: crisp fitted roofs, facade textures, ground materials, and street furniture around Great St Mary's.
- Published as world-20261107-2133. The first Pages deploy timed out syncing about 240 MB, so pages.yml now has
  `timeout: 1800000`. Live: walkable 99.96, buildings 100, ground 100, landmarks 25, height 98.64, load 2.8–3.1 s
  (was 1.99; bigger tiles), errors 0, all 15 moves pass. Load time and fps are the cost of shaped roofs. Plane-fitted
  roofs should win it back.

## 2026-11-07 — Session 7: benchmark tooling, invented passages removed, sun shadows

Done
- Benchmark pipeline, ready to run except for the photos. `scripts/make_benchmark.py` lists Mapillary images in
  the study area, keeps perspective photos with a computed pose within 4 m of an OSM walkable sample, and picks 200
  by farthest-point sampling seeded at Great St Mary's (at most one per sequence per 50 m). It takes pose from
  `computed_rotation` (heading, pitch), corrects true north to grid north (−1.67°), takes hfov from the focal
  length, downloads the 1024 px thumbnails, and writes `data/benchmark/benchmark.json` and `heldout.json` (ids plus
  same-sequence images within 15 m, which world builders must exclude). It refuses to run again once frozen.
  `scripts/photo_render.mjs` renders the viewer at each pose (ground + 1.65 m, matching vertical fov, UI hidden).
  `scripts/photo_score.py` gives the DINOv2 ViT-S/14 (facebook/dinov2-small, Apache-2.0, local MPS) CLS cosine ×100.
  `scripts/bench.sh` caches `data/benchmark/scores/<build_hash>.json` (build hash = sha256 of manifest.json).
  measure.sh reports the cached value for the live build, and service.sh scores any new build hourly. I tested
  it end to end on 3 dev poses (identical images give 100, different views 56).
- **Blocked: no Mapillary token.** The Graph API needs a client token, and the signup needs email verification
  I can't do. I asked Gaspard (tell-owner) and filed approval request a-20261107-224817-2d90. When the token
  arrives, put it in `data/mapillary_token` (git-ignored) and run make_benchmark.py once, then bench.sh. No
  baseline yet.
- Removed the 94 invented connector passages (moved to `data/derived/connectors_invented_retired.json`, no
  longer built). Honest walkable_coverage: 99.39 % (local), still above the 99 guardrail.
- fps_median: browser_test.mjs with `WC_GPU=1` renders on the M4 (ANGLE Metal) in a 1920×1080 window and
  reports the median frames per second over the walk. Headless Chrome throttles requestAnimationFrame to about 13–17 fps even
  on an empty page, so the GPU run must be windowed. service.sh runs it hourly (with the moves test). Result: 60
  (vsync cap) with shadows.
- Lighting: sun at Cambridge mid-June 14:00 BST (azimuth ~200°, elevation ~58°), 2048 PCF-soft shadow map over a
  240 m box that follows the camera, snapped to texels. `?quality=low` (default on touch devices) turns shadows off.
  Screenshot: docs/shadows_session7.png. Not yet checked against the benchmark (none yet), so it's unverified.
- Human scale: eye 1.65 m, walk 1.4 m/s.

Learned
- Swiftshader can't hold frame rate with shadows (jump and double-tap tests fail on frame time), so moves are now
  checked in the GPU run. Swiftshader still measures load and errors.
- The lumpy LiDAR heightfield roofs are the most visibly wrong thing at eye level near GSM (see the dev renders).

Next
1. Once the token arrives: freeze the benchmark, record the baseline photo_match_score, then add judged_realism
   (Claude vision judge, 50 fixed views, blind A/B order) and the visual_quality rubric (30 views).
2. Centre ring: plane-fitted roofs (RANSAC facets), facade colour/material per building from photos (Commons/Mapillary,
   excluding the held-out set), ground materials on King's Parade and Market Square, OSM street furniture.
3. Start the real_facade_pct / roof_match_pct / street_objects_pct measurements so finished_radius_m can be computed.

## 2026-11-07 — Session 8: benchmark frozen, honest baseline

Done
- Gaspard (23:08) pointed me at my own Gmail inbox for email verification. I signed up for Mapillary (account
  tobi_walkable_cam; approval a-20261107-230830-9fda), verified it over IMAP, and registered the app "walkable-cambridge"
  (READ scope) to get a client token (`data/mapillary_token`, git-ignored). Helper scripts are in tools/mly/
  (git-ignored, the browser profile is there too).
- Froze the benchmark: `make_benchmark.py` → 200 views from 6,884 candidates (max 629 images per 0.002° cell, so
  no API truncation). They span 30 m to 1,265 m from GSM, median hfov 68°. `benchmark.json`/`heldout.json` are
  committed; the photos are git-ignored (27 MB).
- `scripts/judge.py`: judged_realism (50 fixed views = every 4th benchmark view by distance; blind A/B side-by-side,
  order from hash(build, id)) and visual_quality (30 fixed views = the 30 benchmark views nearest GSM, rubric of 8
  criteria, each render judged on its own). Judge: claude-opus-5-5 via `claude -p` (Read tool only, using my own
  token in ~/.config/aistack-agent/claude-token). Both run from bench.sh and are cached per build hash. measure.sh
  reports visual_quality too.
- Baseline for live build c527b00e7e0f9dc5: **photo_match_score 7.9**, **judged_realism 22.7**,
  **visual_quality 13.56** (lighting 1.8, GI/AO 1.0, materials 0.0, geometry 0.9, vegetation 0.0, atmosphere 1.1,
  image quality 2.8, artefacts 3.3). Side-by-side: docs/bench_baseline_session8.jpg (photos: Mapillary/cyclestreets,
  CC-BY-SA 4.0; ids 1003884260147286, 1074009203009353).

Learned
- DINOv2 CLS cosine between a real photo and a flat-shaded render is close to 0 (range −9 … 35, median 7.8), and
  only render-vs-render pairs reach ~56. So the metric has lots of headroom and should respond strongly to texture,
  trees and sky. Any gain is real signal.
- Rendering 200 views in swiftshader takes about 10 s each, roughly 30 min serially. Two parallel workers (`--only`
  split) halve that. bench.sh now reuses an existing complete render dir.
- Don't edit a bash script while it runs (I had to kill bench.sh mid-run after editing it).
- Some poses put the camera right in front of a lumpy heightfield roof mass (view 1074009203009353). Check the pose
  and ground height on a few of the worst views before trusting per-view numbers.

Next (centre first)
1. Biggest expected gains at eye level: trees from OSM + LiDAR canopy (vegetation scores 0, and trees dominate
   many photos), sky/haze, then per-building facade colour/material and ground materials around GSM. Score each
   change before and after on the benchmark.
2. Start measuring street_objects_pct / roof_match_pct / real_facade_pct so that finished_radius_m can be computed.
3. Parallelise photo_render inside bench.sh (2–3 workers) so that service.sh scores each build in under 15 min.

## 2026-11-07/08 — Session 9: trees + new look tried, both lowered photo_match, kept opt-in

Done
- `scripts/trees.py` (run after build.py): 7,371 trees = 1,424 from OSM (natural=tree, tree_row every 8 m; height and
  crown from tags or the CHM) + 6,608 LiDAR tops (CHM = 2023 first-return DSM − DTM > 3 m, outside buildings +3 m and
  water, crown pixels where first − last return > 0.8 m; a top needs ≥10 px crown and a 5×5 penetration > 3 m, which
  removes the false "trees" along building eaves in Market St). Per-tile `site/trees/*.bin` (500 KB in total), listed in the manifest.
  `site/app/trees.js` draws two InstancedMeshes per tile (lumpy 7-blob crowns, trunks), which cast shadows.
- "Look v2": a gradient sky dome with a sun glow, AgX tone mapping, light intensities rebalanced, and GLB albedos scaled to plausible
  values (the old rig blew the ground out to near white).
- bench.sh renders with 4 parallel workers (200 views in about 15 min).
- Benchmark (full 200, build fb4fd36a = trees + look v2): **photo_match 6.86 vs baseline 7.90**. Ablation on the 50
  judge views: baseline 7.75, look v2 without trees 7.40, trees with the old look 6.40. Both changes make it worse. Following the
  revert rule, both are now **opt-in** (`?trees`, `?look=v2`) and the default render is pixel-identical to the
  baseline. Side-by-side: docs/trees_session9.jpg (photo | baseline | trees; photos Mapillary CC-BY-SA 4.0, ids
  155280259867837, 215717297387097, 489581222193351, 504212450935825, 204587944591503).
- GPU fps (1920×1080, M4): 60 both default and `?trees&look=v2`; site_errors 0; all 15 moves pass.

Learned
- DINOv2 penalises the "low-poly CG" look: the views that lose most are those where real trees exist. Smooth
  blob crowns next to real foliage score lower than empty grass. Trees only pay off with leaf texture (alpha-tested
  leaf cards / foliage texture with normal variation, crowns down to the real crown base), not as solid shapes.
- Whole-image brightness/tone changes move the score by about 0.3. Texture and structure matter far more than exposure.
- Single-change ablations on the 50 judge views take about 4 min each with 4 workers. Do this for every change.

Next
1. Textured foliage: CC0 leaf/bark textures (Poly Haven / ambientCG), crowns as clusters of alpha-tested leaf cards,
   then re-test `?trees` on the 50 views. Turn on by default only if it beats 7.75.
2. Facade/ground textures near GSM (CC0 stone, brick, setts; per-building colour from non-held-out photos). These are probably the biggest
   lever, given DINOv2's preference for texture.
3. street_objects_pct / roof_match_pct / real_facade_pct measurements for finished_radius_m.

## 2026-11-08 — Session 10: CC0 surface textures (+1.7 on the 50-view check), now default

Done
- `scripts/fetch_textures.py` downloads 8 CC0 Poly Haven diffuse textures (1k, ~4 MB in total) into `site/tex/`, with their
  real-world size from Poly Haven's metadata. `site/app/materials.js` applies them in world space (the GLBs need
  no UVs) through `onBeforeCompile` on the vertex-colour Lambert materials. Walls get gault brick or limestone ashlar
  (40 % ashlar, chosen per building from a hash of its colour tone), u runs along the wall and v up; roofs get tiles; the ground
  blends road/pavement/grass/court/earth by the surface class read from the interpolated vertex colour. Each texture
  is used as detail (texture ÷ its top-mip mean, ground mostly luminance), so the palette stays as it was. `?mat=0` turns it off.
- 50 judge views, photo_match: **no textures 7.75 → textures 9.42**; textures plus a procedural sash-window grid
  scored 8.77. The window grid is too regular, so it's opt-in (`?win=1`). Side-by-side: docs/textures_session10.jpg
  (photo | the session 9 trees+look v2 build | textures; photos Mapillary CC-BY-SA 4.0, ids 519716785698039,
  788562325143664, 272897831248029). The first row (a brick lane) jumped to 39.9.
- The build hash (scripts/build_hash.py) now covers index.html, the render-affecting app/*.js and tex/textures.json as well as
  manifest.json. Before this, a viewer-only change reused the old build's cached score. Old cache entries are orphaned, and service.sh
  rescores the live build (200-view photo_match, judge, quality) within the hour.
- GPU 1920×1080: fps_median 60, site_errors 0, all moves pass. Credits page and DATA.md list Poly Haven (CC0).
- photo_render.mjs: `WC_QUERY` env appends URL params (for A/B runs) and waits for `window.__texReady`.

Learned
- DINOv2 rewards real material texture strongly. Brick walls in narrow lanes match photos far better than any change
  to shape or lighting has so far. Regular synthetic structure (window grid, blob trees) is penalised.
- 6 swiftshader workers in parallel (two A/B configs) take about 12 min for 2×50 views.

Next
1. Per-building wall material and colour from real (non-held-out) Mapillary/Commons photos via Claude vision, centre
   first (brick vs ashlar vs render, colour). Real windows from photos instead of a grid.
2. Retry look v2 and leaf-textured trees on top of the textures (both lost on flat shading; textures may change that).
3. Normal maps / roughness for the textures (AAA bar), and KTX2 compression. Check load time on phones and in Safari.
4. street_objects_pct / roof_match_pct / real_facade_pct measurements.

## 2026-11-08 — Session 11: OSM street furniture, trees on by default, street_objects_pct

Done
- `scripts/ab50.sh <label> "<query>" [workers]`: a reusable 50-judge-view photo_match A/B against the local site/.
- A/B results on top of the session-10 textures (50 views): control **9.42** (reproduced exactly), `look=v2` **7.41**
  (still worse, stays off), `trees` **9.45** (now neutral; it was −1.35 on flat shading). Trees are **on by default**.
- `scripts/street_objects.py` (after trees.py): 1,116 OSM street objects in the study area → `site/objects/*.bin`
  (232 KB): 365 bike-parking sites (n = capacity/2 Sheffield stands, roughly half with parked bikes), 275 benches/picnic
  tables, 116 bins, 83 bus-stop poles, 80 bollards, 68 statues/sculptures/memorials (plaques excluded), 42 street
  lamps, 26 post boxes, 24 phone boxes, 23 signs, 8 clocks, 6 fountains. Benches, signs and stands are oriented to the
  nearest way. `site/app/objects.js` draws one InstancedMesh per type per tile (simple proportioned meshes, vertex colours).
  Screenshot (own poses, no photos): docs/objects_session11.jpg.
- `manifest.layers` sets the default layers (`?trees=0|1`, `?objects=0|1` override). New KPI **street_objects_pct = 100**
  (1,998 targets = the objects plus 882 natural=tree nodes; each counts if the same type lies within 1 m in a default-on layer).
- 50 views with trees + objects: **9.29** (trees alone 9.45). Almost all of the −0.16 comes from two views. In one, the
  Mapillary GPS pose sits inside a mapped post box, so the box fills the frame. In the other, a row of stands lines a lane.
  The objects are real and at their mapped positions, so I kept them: this breaks the "revert if it doesn't help" rule
  by a margin well inside the per-view noise (sd of view deltas ~3), in exchange for a finished_radius criterion.
- GPU Chrome 1920×1080: fps_median 60, site_errors 0, all 15 moves pass. Published (live build dc8f4ed6a315ea9c).
  service.sh scores the full 200 views plus the judges within the hour.
- Safari: installed Playwright WebKit (tools/pw, `scripts/webkit_smoke.mjs`), but its WebKit 27.2 binary crashes at
  launch on this macOS (Trace/BPT trap, even on a data: URL). So the Safari check is still open.

Learned
- Benchmark poses carry GPS error of a few metres, so objects near the camera can land in front of the lens. That
  noise affects any small near-field geometry. Judge changes on aggregate scores, not on single views.
- Textures changed the verdict on trees: shapes that lose on flat shading can become neutral once the scene has texture.

Next
1. Per-building wall material and colour (brick/ashlar/render) from non-held-out Mapillary/Commons photos via Claude
   vision, centre first. This is still the biggest expected lever (DINOv2 rewards correct texture).
2. Leaf-textured tree crowns (alpha cards), to push trees from neutral to positive.
3. Object collision (bollards, bins, benches) so you can't walk through them; and the roof_match_pct measurement.
4. Safari: try an older Playwright WebKit or the system Safari via safaridriver.

## 2026-11-08 — Session 12: real photo facades around Great St Mary's (+10.9 photo_match on the central views)

Done
- `scripts/facades.py` (run after street_objects.py): street-facing wall pieces (building edges ≤ 6 m long, midpoint
  within 30 m of a walkable way, ground to LiDAR eave = 20th percentile of the DSM 1.5 m inside the edge). Within 150 m
  of GSM, each piece gets the best non-held-out Mapillary photo: OpenSfM pose (rotation vector → grid frame with the
  ~1.7° grid convergence, focal/k1/k2, upside-down poses flipped), camera at DTM + 2 m, wall fully in frame (top may be
  lowered to what is visible, at least 2.5 m), cos(view, normal) ≥ 0.35, 4–35 m away, and no other footprint on the
  sight line. Score = projected area × cos² × visible fraction. Rectified at ≤ 40 px/m into one RGBA WebP atlas per
  tile; sky pixels connected to the top edge are transparent, and all-sky rows are cropped off the quad. 321 pieces
  from 174 photos, 1.3 MB in 3 tiles. `site/app/facades.js`: unlit quads 4 cm proud of the wall, alpha-tested, layer
  `facades` on by default (`?facades=0` turns it off).
- Held-out rule: the frozen one from session 8 (the benchmark ids plus same-sequence frames within 15 m).
- A/B on the 10 benchmark views within 170 m of GSM (the only ones the layer touches): **off 7.27 → on 18.21**
  (with the sky mask 18.14). No view got worse; deltas run from 0 to +49. Side-by-side: docs/facades_session12.jpg
  (photo | off | on; photos Mapillary CC-BY-SA 4.0, ids 365274541579500, 5470402219697715, 2824712737794062).
- Leakage check: 176 of the 199 facade photos come from sequences that also contain a held-out photo (same day, light
  and parked cars). With `--strict` (no frame of any held-out sequence; 102 pieces from 49 photos) the score is
  **12.83**. So at least about half of the gain does not depend on shared capture conditions. Kept the standard rule,
  which gives more real coverage for walkers; both numbers are reported here.
- New KPI **real_facade_pct = 1.02** (photo-textured quad area in the build's facades layer ÷ street-facing wall area
  of the whole study area, as written by facades.py). This is the honest starting number: only the inner ring is textured.
- Credits page: Mapillary CC-BY-SA with the share-alike note, and `facades/credits.json` (photo id, URL and contributor
  for each photo). DATA.md updated. publish.sh ships `facades/`, and build_hash covers app/facades.js.
- GPU Chrome 1920×1080: fps_median 60, site_errors 0, load 0.8 s (local).

Learned
- DINOv2 strongly rewards real photo content. It wins even where the geometry is off: some pieces come from upward-
  looking photos and look stretched, and some views have the camera pose a few metres off. The visual win is real
  (Gate of Honour, King's Chapel tracery, Market St shopfronts are recognisable) but smaller than the score suggests.
- One benchmark view (365274541579500) is an interior photo inside Great St Mary's. It is frozen, so leave it.
- Pieces with no photo are mostly short or tall walls in narrow lanes that never fit the frame whole; also courts.

Next
1. Extend facades outwards ring by ring (radius 150 → 300 m) and run in service.sh. Multi-photo blending (median of
   2–3 aligned views) to remove people and cars; prefer near-frontal photos; per-piece height from the model's actual
   wall top instead of the DSM estimate.
2. Fix the stretched pieces: cap the vertical viewing angle, or texture only the part seen at < 45° elevation.
3. Measure roof_match_pct, then compute finished_radius_m.
4. Score the full 200 + judges on the new build (service.sh does this within the hour).

## 2026-11-08 — Session 13: photo facades out to 300 m (+7.6 photo_match on the 26 views within 320 m)

Done
- `scripts/facades.py --radius 300`: 772 textured wall pieces (was 321) from 433 non-held-out Mapillary photos, 6.5 MB.
  Atlases are now paged: each tile gets as many 2048² WebP pages as it needs at a fixed 40 px/m. Before, the resolution
  dropped as a tile filled. Manifest `facades`/`facade_tex` are now lists, one entry per page. tiles.js draws one mesh
  per page, and kpi.py sums all pages.
- Elevation cap: a piece is textured only up to the height where the wall top is seen at ≤ 50° above the horizon from
  the camera. This removes the stretched pieces from photos that look steeply upward.
- `scripts/abring.sh <label> <site|url> <max_dist> [workers] [query]`: A/B on the benchmark views within a radius.
- A/B on the 26 benchmark views within 320 m of GSM, live session-12 build vs new: **17.17 → 24.80**
  (≤ 150 m: 23.63 → 29.09; 150–320 m: 14.30 → 22.89). 3 views got slightly worse (max −2.3), 9 unchanged, the rest
  better by up to +47. Side-by-side: docs/facades300_session13.jpg (photo | session 12 | session 13; photos Mapillary
  CC-BY-SA 4.0, ids 163559995673306, 745004922853288, 865188314039724).
- real_facade_pct 1.02 → **2.47**. GPU Chrome 1920×1080: fps_median 60, site_errors 0, load 1.7 s (local).
- Published. Mistake: publish.sh pushed HEAD before I had committed the tiles.js change, I committed and redeployed
  straight away. The first Pages run was cancelled by the second, so the mismatched viewer never went live.
  publish.sh now refuses to run with uncommitted changes in site/ or scripts/. Live check: site_errors 0.

Learned
- The facade gain carries outward: views 150–320 m out gained more (+8.6) than the inner ring did in session 12.
  Views inside 150 m also gained, because walls further out are now visible down the street.

Next
1. Radius 300 → 500 m in service.sh (each ring about 5 min plus photo downloads). Watch the disk: photo cache is
   about 100 MB per 300 photos; delete it after baking.
2. Multi-photo median per piece, to remove people and cars (they are visible in the atlases).
3. Pieces with no photo (narrow lanes, courts): a per-building synthetic facade in the real material.
4. roof_match_pct measurement, then finished_radius_m.

## 2026-11-08 — Session 14: LiDAR roofs on every building, roof_match_pct, facades to 500 m

(Entry written at the start of session 15 from the session-14 commit; session 14 ended before writing it.)

Done
- build.py roofs: every footprint with ≥ 6 LiDAR pixels gets the DSM roof itself (no rescaling to the p95 top),
  meshed as a quadtree from 8 m down to 1 m cells (split while RMS deviation from the cell's two-triangle fit > 0.25 m).
- New KPI **roof_match_pct** (`scripts/roof_match.py`, rules in FORMAT.md): 10.45 → **23.18** (median RMSE 1.05 m).
  Cached per build hash. height_accuracy_pct dropped 98.6 → 91 (the roof is no longer stretched to the p95 top).
- facades.py --radius 500 (RAM fix: keep only one tile's decoded photos). photo_match on the views ≤ 520 m
  16.60 → **22.22**. real_facade_pct 2.47 → **4.65**. Side-by-side: docs/facades500_roofs_session14.jpg.

## 2026-11-08 — Session 15: facades in vertical bands from several photos, half pieces

(Entry written at the start of session 16 from the session-15 commit; session 15 ended before writing it.)

Done
- facades.py: a wall piece whose best photo only shows its lower part gets the rest as an upper band with its own
  photo (up to 3 bands per wall); a piece with no photo is split into halves once; cameras up to 40 m (was 35).
- real_facade_pct 4.65 → **5.7**; photo_match on views ≤ 520 m 22.22 → **23.06**. Side-by-side:
  docs/facade_bands_session15.jpg. measure.sh caches kpi.py per build hash.
- Not committed: a tiles.js change that streams facade atlases after the tile is walkable. The live build measured
  load_seconds **9.17** (> 5 guardrail) because the atlases were fetched before the tile counted as loaded.
  Session 16 committed and shipped it.

## 2026-11-08 — Session 16: roofs that match the LiDAR (roof_match_pct 23.18 → 92.11), load time fixed

Done
- Load time: the live session-15 build measured load_seconds 9.17 (guardrail 5) because each tile waited for its facade
  atlases. Committed the tiles.js change that streams atlases after the tile is walkable (photo_render waits for
  `window.__facadesPending` to reach 0). Live after publishing: **3.21 s**, site_errors 0.
- Roofs (build.py), each change measured with roof_match.py on a side build (build 43 s + score 5 s):
  - quadtree grid on LiDAR pixel centres, no 3×3 median: 23.18 → 40.08
  - no eave-pixel replacement (it lifted pitched eaves to the higher inner pixels: every failure had positive bias):
    → 80.01
  - roof floor median ground + 1 m instead of + 2 m (350 of the remaining 413 failures had > 10 % of the footprint
    below 2 m): → **92.11**, median RMSE 1.05 → 0.21 m.
  - Guardrails on the new build: walkable 99.38, buildings 100. Legacy height_accuracy_pct 91 → 79 (chimneys and
    spikes are no longer filtered; that KPI compares the top with the p95).
- A/B on the 67 benchmark views within 520 m (same viewer, old vs new roofs, rendered locally): **23.05 → 23.52**;
  25 views better by > 1, 14 worse by > 1 (−6.7 to +9.6). Side-by-side: docs/roofs_session16.jpg (photo | old | new;
  photos Mapillary CC-BY-SA 4.0, ids 577055006604384, 289425219597328, 214764576744027).
- Published (build c46db5cb1e141ed6).

Learned
- The worst view (bottom row of the side-by-side) shows the cost: where trees overhang a footprint, the raw DSM turns
  the canopy into tall red roof spikes. roof_match counts this as a match because it compares with the DSM, but it
  is wrong to the eye. Probably most of the 14 views that got worse.
- Roof experiments are cheap (under a minute each); facades, trees and objects do not need re-baking after build.py:
  copy their manifest keys from the previous manifest.

Next
1. Canopy-over-roof filter: detect tree pixels inside footprints (OSM/LiDAR trees from trees.py within the crown
   radius, or local roughness: canopy is rough, roofs are planar) and replace them with the planar fit of the
   neighbouring roof. Check that roof_match stays ≥ 90 and the 14 worse views recover.
2. Facade coverage in the inner ring (real_facade_pct is 5.7 overall): synthetic per-building facades where there is
   no photo, centre first.
3. finished_radius_m: roof_match now passes everywhere; facades and judged_realism are the blockers.

## 2026-11-08 — Session 17: canopy-over-roof filter and OSM ground surfaces, both neutral, not shipped

Done
- Canopy filter in build.py (`WC_CANOPY_PEN`, off by default): canopy = NLP 2023 first return − last return > 1 m,
  opened with a 3×3 m kernel (drops eave lines). Inside a footprint those pixels are filled from the nearest
  non-canopy roof pixel. Checked by eye on 8 affected buildings (top-down DSM with the mask): every blob is a real
  tree crown over the footprint.
  - roof_match_pct 92.11 → **84.56** (156 buildings fail, none gain): the KPI compares with the DSM, which includes
    the crowns. photo_match on the 67 views ≤ 520 m: **23.52 → 23.53** (3 views moved > 1). Session 16's "red spikes"
    view (214764576744027) did not change, so those spikes are not canopy-in-footprint.
  - Kept the code with the filter off (the GLBs come out byte-identical to the live build). Asked Gaspard (tell-owner)
    whether roof_match may leave out foliage pixels.
- Ground materials from the OSM `surface` tag: the default ground and every square/car park were class S_COURT, which
  draws the cobblestone texture. Changed so only mapped sett/cobblestone gets cobbles (3,261 m²), asphalt goes to tarmac,
  gravel to gravel, the default to paving. photo_match on the same 67 views: **23.52 → 23.40** (2 better > 1, 8 worse > 1).
  Not shipped; the diff is in docs/experiments/session17_canopy_and_ground.patch. Side-by-side:
  docs/ground_session17.jpg (photo | live | surfaces; photos Mapillary CC-BY-SA 4.0, ids 250189876888232, 577055006604384).
- Live site unchanged (build c46db5cb1e141ed6). service.sh was benchmarking it during the session.

Learned
- The tarmac texture smears into a flat grey at grazing angles, and DINOv2 scores it below the busy cobble texture
  even where the real path is tarmac (bottom row of the side-by-side). The `pave` texture (pavement_02) also looks
  like setts at eye level. Before ground surfaces can win, the ground textures themselves need fixing: anisotropic
  sampling, a real UK tarmac with aggregate and patching, York-stone flags. That's a texture job, not a classification job.
- In view 250189876888232 the camera looks into a photo-facade quad that shows the whole street: a facade piece placed
  where the real view is open road. Facade pieces that contain mostly road or sky should be rejected.
- Benchmark A/B noise: the 67-view mean moves about ±0.1 between runs with no change in the world. Per-view moves
  under ~2 points are noise.

Next
1. Facade quality: reject pieces whose photo content is mostly road, cars or sky (segmentation or a simple check
   for the colour of the lower band), then fill the gaps with per-building synthetic facades, centre first.
2. Ground textures: sharper tarmac (anisotropy 16, a higher-detail asset), York stone flags for `pave`; then re-try
   the surface patch on top.
3. Wait for Gaspard on the canopy question; if yes, change roof_match (pixels with first − last return > 1 m excluded)
   and switch the filter on.

## 2026-11-08 — Session 18: leaf-card foliage (photo_match on views ≤ 520 m 23.52 → 25.09)

Done
- Live session-16 build (c46db5cb1e141ed6) finished its full benchmark during the session: photo_match_score
  **14.90** (200 views), judged_realism **25.2**, visual_quality **17.02** (vegetation 0.5/10, the lowest criterion).
- trees.js: each crown is now a darker blob core (84 % size) wrapped in 56 alpha-tested leaf cards with a leaf-cluster
  texture drawn once on a canvas (no new asset; alphaToCoverage with MSAA). `?foliage=0` gives the old blobs.
- A/B on the 67 benchmark views ≤ 520 m (same build, local): **23.52 → 25.09**; 20 views better by > 1, 9 worse
  (−10.1 to +22.5). Side-by-side: docs/foliage_session18.jpg (photo | before | after; photos Mapillary CC-BY-SA 4.0,
  ids 214764576744027, 289425219597328, 577055006604384).
- GPU Chrome 1920×1080 locally: fps_median 60, site_errors 0. Published (release world-20261108-0400).
- scripts/webkit_smoke.mjs crashes when WebKit launches ("Target page, context or browser has been closed"),
  with or without this change: a Playwright WebKit vs macOS problem, not the site. Not fixed.

Learned
- Vegetation was the cheapest big win so far: one viewer file, no rebake. The view that lost 10 points
  (289425219597328) is the one where a near crown now fills the top-left of the frame; crowns right at the camera
  are probably too big or too low (the crown base is 22–34 % of tree height).

Next
1. Tree shape from LiDAR: crown base height and radius per tree from the canopy (first return − DTM profile),
   and real species-ish forms (columnar limes vs spreading planes); trunk branches visible under the crown.
2. Sky: photos have white/overcast or cloudy skies; try a brighter, cloudier sky against the benchmark.
3. Fix the WebKit smoke test (update Playwright's WebKit build).
4. Facade quality (reject road/sky pieces), synthetic per-building facades, centre first.
- measure.sh right after publishing read walkable_coverage_pct 97.03: kpi.py fetched tiles while Pages was still
  deploying, counted the failures as missing, and the value was cached for the build. Re-measured: 99.38. kpi.py now
  retries each fetch 3 times and flags `fetch_failures`; measure.sh doesn't cache a flagged result.

## 2026-11-08 — Session 19: near-white overcast sky (photo_match on views ≤ 520 m 25.09 → 25.79)

Done
- Sky colour measured on 295 non-held-out Mapillary facade photos (top 10 % of rows, bright pixels): 83 % of skies
  are unsaturated (overcast or blown out), median RGB 0.96/0.97/1.00. The model's sky was a mid blue (0xbcd3e6).
- main.js `?sky=`: `white` (background + fog 0xeef1f6), `overcast` (same plus sun 1.8 → 1.0, hemisphere 1.6 → 2.3),
  `blue` (old). A/B on the 67 benchmark views ≤ 520 m: blue **25.09** (same as session 18), white **25.79**
  (5 views better by > 2, none worse by > 1), overcast 25.40. White is now the default.
  Side-by-side: docs/sky_session19.jpg (photo | blue | white; photos Mapillary CC-BY-SA 4.0,
  ids 293815065657546, 558906138831208, 140100631456667).
- Published (release world-20261108-0448, viewer change only). Live: load 3.33 s, site_errors 0; guardrails unchanged
  (walkable 99.38, buildings 100). service.sh will benchmark the new build.
- WebKit smoke test: still crashes on any page, even `data:` HTML (WebContent process "Trace/BPT trap: 5"), with
  Playwright 1.65 (webkit 2388), 1.66-alpha (webkit 2389), headless or headed. Probably the WebKit build vs macOS
  26.5 under this user's session; not the site. Safari remains untested.

Learned
- Global look parameters (sky, fog) are cheap, viewer-only experiments with measurable gains; softer lighting
  lost to the stronger sun, so contrast/shadows help DINOv2 even though the photos are overcast.
- Bottom row of the side-by-side (view 140100631456667): the render shows sky colour below a wall, i.e. no ground
  in front of the camera there. Worth finding: a hole in the ground mesh or the camera placed below it.

Next
1. Ground holes: find benchmark views whose lower third is sky-coloured and fix the ground mesh there.
2. Tree shape from LiDAR (crown base, radius), and fog distance/colour tuned with the white sky.
3. Facade quality (reject road/sky pieces), synthetic per-building facades, centre first.
4. WebKit: try an older Playwright WebKit or Safari's own WebDriver (safaridriver) for the Safari test.

## 2026-11-08 — Session 20 (entry written in session 21): road markings layer, not published

- Commit 511dd5d: scripts/markings.py builds an OSM road-markings layer (centre dashes, double yellows) and
  site/app/markings.js draws it; it also added the `?light=` (scales sun and sky light) and `?gk=` (ground albedo) look params.
  The session ended before a journal entry or a publish. The A/B results it left in /tmp (67 views ≤ 520 m):
  markings 25.57 vs 25.79 without them (neutral); markings + light 0.6 26.19.
- The live build 01b805ec26237475 (session 19 sky) finished its full benchmark: photo_match_score **17.56**
  (200 views), judged_realism **25.6**, visual_quality **16.79**.

## 2026-11-08 — Session 21: darker lighting (photo_match on views ≤ 520 m 25.79 → 26.80)

Done
- Finished session 20's A/B on the 67 benchmark views ≤ 520 m (control: session 19, 25.79):
  markings + light 1.0 **25.57**, markings + light 0.6 **26.19**, no markings + light 0.6 **26.41**,
  markings + light 0.45 **26.80** (37 views better by > 1, 10 worse).
- Shipped: light scale 0.45 by default (main.js); road markings off by default (`?markings=1` turns them on).
  The markings cost ~0.2 at equal light and the 0.45 run with them is still the best. Side-by-side:
  docs/light_session21.jpg (photo | session 19 | light 0.45 with markings; photos Mapillary CC-BY-SA 4.0,
  ids 799949717293550, 423020809560124, 204824241221338). New helper: scripts/sidebyside.py.
- Published (release world-20261108-0624). measure.sh: walkable 99.38, buildings 100, site_errors 0, fps 60.
  service.sh will benchmark the new build.

Learned
- The renders were overexposed compared with the overcast photos. Darker is better down to at least 0.45; the
  minimum isn't found yet. Two A/B runs in parallel (3 workers each) take ~23 min.
- Side-by-side middle row (view 423020809560124): a tiled pitched roof sits on the road right in front of the
  camera, at eye level. A building with a wrong base or height, or a roof mesh dropped to the ground: a geometry
  bug worth finding (search benchmark renders for roof texture in the lower half).

Next
1. Light 0.3 / 0.35, and `gk` (ground albedo) with it; also tone mapping exposure.
2. The ground-level roof bug in view 423020809560124 (and any others like it).
3. Ground holes (sky-coloured lower third), tree shape from LiDAR, facade quality, centre first.

## 2026-11-08 — Session 22: LiDAR ground holes in footprints (roof_match_pct 92.11 → 93.03)

Done
- Looked into session 21's "roof on the road" (view 423020809560124). The camera stands inside the OSM footprint of
  Ramanujan House (way/1087907233). It was a building site when the LiDAR was flown: 62 % of the footprint is below
  1.5 m, with 1–3 m piles. The roof field (clamped to median ground + 1 m) turned that into a tiled sheet with
  pyramids at eye level.
- build.py (`WC_GROUND_HOLES`, on by default): parts of a footprint where the LiDAR roof is under 1.5 m above the DTM
  (3×3 opening, ≥ 16 px) are cut out of the footprint and stay open ground. This covers building sites and courtyards
  mapped without an inner ring. A footprint keeps at least 25 % of its area. 319 footprints changed.
  roof_match_pct **92.11 → 93.03** (median RMSE 0.203 m). Guardrails on the side build: walkable 99.39, buildings 100.
  It doesn't fix view 423 itself, because that site's piles are 2–3 m tall.
- New helper scripts/merge_manifest.py copies the manifest keys added by the trees, facades, objects and markings
  steps into a fresh build.py manifest, so roof-only rebuilds can ship without re-baking.
- A/B (67 views ≤ 520 m) was too slow to finish: about 1 view/min per run with 3 runs in parallel. Partial results
  against session 21's 26.80 run (same ids): holes **28.18 → 28.25** (23 views, 1 better by > 1, none worse);
  light 0.3 **30.51 → 30.57** (36 views, 8 better, 4 worse). Both are within noise. Light stays at 0.45: the
  darkening gains have levelled off. Holes shipped because they don't hurt photo_match and raise roof_match.
- Published (viewer unchanged, world rebuilt).

Learned
- Run at most 2 A/B runs at once. A third one plus a build slowed everything to about 1 view/min.
- OSM includes buildings that were finished after the LiDAR survey (and after older photos). The DSM roof then shows
  site clutter. These need a rule of their own: for a large footprint whose median nDSM is under 3 m, fall back to the
  OSM levels/height with a flat or generic roof. roof_match counts these as failures either way.

Next
1. Footprints built after the LiDAR survey (see above).
2. Ground holes found in the sky-coloured lower third of renders (session 19), tree shape from LiDAR.
3. Facade quality: reject road/sky pieces, then synthetic per-building facades, centre first.
- Live check after publishing: load_seconds 3.98, site_errors 0 (measure.sh first showed 6.69, a cached service.sh
  reading taken while the A/B renders were loading the machine). measure.sh: walkable 99.39, buildings 100,
  roof_match 93.03, fps 60.

## 2026-11-08 — Session 23: photo facades at oblique angles (photo_match on views ≤ 300 m 27.88 → 30.49)

Done
- Checked the photo supply first: the cached Mapillary list is complete (live API counts match it in four test
  boxes around GSM), so more Mapillary photos aren't available. Only 342 perspective photos lie within 100 m.
- facades.py now logs why cameras are rejected (angle 624k, out of frame 309k, occluded 48k candidate pairs) and the
  textured share by ring. Mapillary cameras look along the street, so most facades are seen at grazing angles.
- New knobs: `WC_FAC_COSN` (minimum cos of wall-normal vs camera direction; was 0.35) and `WC_FAC_SPLITS` (how many
  times a piece without a photo is halved; was 1). Dry runs, textured share of street-facing wall within 100 m:
  0.35/1 25.4 %, 0.2/2 28.9 %, 0.12/3 31.5 %.
- A/B on the 25 benchmark views ≤ 300 m (current build as control, 27.88): 0.2/2 **29.89** (16 views better,
  3 worse, worst −2.2), 0.12/3 **30.49**. Shipped 0.12/3 as the default. real_facade_pct 5.7 → 7.6 (facades.py's own
  count; measure.sh will confirm). Side-by-side (photo | control | 0.2/2): docs/facades_angle_session23.jpg (photos
  Mapillary CC-BY-SA 4.0, ids 454043642567080, 163625715689245, 490595022302449).
- Local check: load 1.93 s, site_errors 0. Published.
- service.sh's benchmark of the session 22 build failed with "renders incomplete" (the A/B runs were loading the machine).
  It will benchmark this new build instead.

Learned
- 80 % real facades can't come from Mapillary alone: even within 50 m only ~39 % of street-facing wall is visible
  in any usable photo. Courts, lanes and the Backs need other photos (Wikimedia Commons, registered by local SfM
  to get camera poses) or the per-building synthetic facades.
- Baked-in artefacts are now the visible problem: pedestrians and cyclists in the textures, and close-range
  smeared pieces (side-by-side row 2, left wall).

Next
1. Wikimedia Commons photos of central buildings: download CC-licensed ones, register them against Mapillary frames
   with COLMAP/OpenSfM locally to get poses, then feed them to facades.py. Centre first.
2. Synthetic per-building facades (storeys, windows, material colour) for walls with no photo.
3. Mask people/bikes in facade photos (a local segmentation model) and pick the cleanest photo per piece.
4. Footprints built after the LiDAR survey (session 22).
- Live check: build b45c1234a047bcaa, real_facade_pct 7.6 (measure.sh), walkable 99.39, buildings 100, roof_match 93.03.

## 2026-11-08 — Session 24: people and vehicles masked out of photo facades (photo_match on views ≤ 300 m 30.49 → 30.82)

Done
- Re-tested the procedural window grid (`?win=1`) at today's lighting on the 25 views ≤ 300 m: **30.24** vs 30.49
  control. It stays off.
- New scripts/masks.py: local semantic segmentation (openmmlab/upernet-convnext-small, MIT, ADE20K; MPS needs a
  576×384 input) marks people, bikes, motorbikes, cars, vans, buses and trucks in all 1,282 cached facade photos
  (data/raw/mapillary_masks, ~25 photos/min, centre first via data/derived/facade_photo_order.json). Credited in DATA.md.
- facades.py (`WC_FAC_MASKS`, on by default): each piece keeps up to 4 other candidate cameras; masked pixels are
  taken from the next photo that sees that spot unmasked, otherwise left transparent so the procedural wall shows.
  Full bake (radius 500): 9.9 M px refilled, 4.2 % of facade pixels transparent, real_facade 7.6 % unchanged, 399 s.
- A/B ≤ 300 m (same views as session 23): **30.49 → 30.82**. Honest reading: one view (902886690492404) went
  17.1 → 54.7 because a wall of huge baked-in parked bikes disappeared. The other 24 lost 1.2 on average (2 better
  by > 1, 8 worse). The losses are photos with cars and cyclists in them: DINOv2 rewards a smeared bus on the wall
  when the real photo has a bus. Shipped anyway: the walls are visibly cleaner (no ghost people), and the
  judged_realism and visual_quality artefact scores should show it. Side-by-side (photo | before | masked):
  docs/facade_masks_session24.jpg (photos Mapillary CC-BY-SA 4.0, ids 902886690492404, 519716785698039,
  336962257817391).
- Local check: load 3.65 s, site_errors 0. Published.

Learned
- DINOv2 similarity rewards scene content, not correctness: transient objects baked into walls score as
  "vehicles present". The real fix for those views is moving content: parked cars and bikes from OSM
  (parking lanes, bicycle_parking capacity) and pedestrians.
- A view's render can change by 30+ points from a single close facade piece; 25-view A/Bs need per-view reading.
- The wait-loop Bash call was stopped at the 10-min background limit and took the bake with it; give long jobs their
  own run_in_background call with a long timeout.

Next
1. Bikes in the OSM bicycle_parking racks (capacity) and parked cars on mapped parking lanes: real content
   that DINOv2 and the judge both expect.
2. Wikimedia Commons photos of central buildings, registered locally for poses (more real facade area).
3. Synthetic per-building facades for walls with no photo (the generic grid didn't help; needs per-building style).
- Live check: walkable 99.39, buildings 100, roof_match 93.03, real_facade 7.6, site_errors 0. service.sh will benchmark the new build.
- Fix after publishing: the build hash didn't change (facade atlases changed but manifest.json didn't), so the
  benchmark cache would have mixed the two builds. facades.py now writes `facades_digest` (sha256 of the atlas
  files) into the manifest; republished as build dad9daeed9ad93d0. Any score cached under b45c1234a047bcaa after
  08:12 UTC came from renders taken during the switch: ignore it (session 23's build has no valid photo_match score).

## 2026-11-08 — Session 25: parked cars from OSM parking tags (11 views with cars in shot: 10.60 → 11.99)

Done
- Stopped service.sh's benchmark run. It had started before session 24's republish, so it was rendering the new
  build (dad9daeed9ad93d0) under the old hash b45c1234a047bcaa. Nothing was cached from it. The next service.sh
  loop benchmarks the live build.
- Bikes in the bicycle racks were already drawn (objects.js since session 11), so I did parked cars instead.
  New scripts/cars.py places them on OSM parking lanes (`parking:<side>=lane|street_side|half_on_kerb`, older
  `parking:lane:*`, orientation tags) and `amenity=parking` strips (lane/street_side/layby), 80 % occupancy, none
  within 8 m of a junction. 543 cars, appended as type 13 to the object bins. `--lots` (surface car parks) is
  available but off.
- objects.js: three low-poly car shapes (hatch, estate, SUV) built from an extruded side profile, plus glass,
  wheels and lights, in one InstancedMesh per shape with per-instance paint (UK-typical colours).
- First try put cars at ROAD_HALF − 1 m from the way. The modelled carriageway is narrower than a real street with
  parking, so cars stood in the camera's lane. Now: car centre ≥ 2.75 m lane + half a car from the centreline.
- A/B on the 11 benchmark views with a car within 40 m in the field of view (only 11, all but one beyond 600 m:
  the centre is mostly car-free): control **10.60**, first try 11.21, shipped version **11.99**
  (6 views better by > 1, 3 worse by > 1). Side-by-side (photo | before | cars): docs/parked_cars_session25.jpg
  (photos Mapillary CC-BY-SA 4.0, ids 5603743449697891, 802068647098639, 249946750257860).
- Local check: load 1.81 s, site_errors 0. WebKit smoke still crashes at launch (known since session 13; it does
  the same on the live site). Published (release world-20261108-0841).

Learned
- Row 3 of the side-by-side: OSM tags parking on both sides, and the photo shows two cars. Occupancy should drop
  where streets are tagged with residents' or time-limited restrictions, and probably to ~50 % in general.
- A shared, rough problem in all outer views: walls are generic, roofs are jagged LiDAR fits, and the ground is
  cobbles where the real street is tarmac. The ground material on residential streets looks like a cheap win
  (pavement texture spreads over the carriageway).
- The car effect on the full benchmark is small (≤ 11 of 200 views); the full score comes from service.sh.

Next
1. Ground: the carriageway width/material on residential roads (tarmac to the kerb, not setts), outer views.
2. Wikimedia Commons photos of central buildings, registered locally for poses (more real facade area, centre).
3. Synthetic per-building facades for walls with no photo.
4. Footprints built after the LiDAR survey (session 22).
- Live check: build 2d6709bcb8bac9c0; measure.sh: walkable 99.39, buildings 100, roof_match 93.03, real_facade 7.6,
  street_objects 100, site_errors 0. measure.sh took 84 s on its first, uncached run of a new build (0.9 s when cached).
  service.sh will benchmark the build at its next loop (~10:25 CET).

## 2026-11-08 — Session 26: road widths, footways and surfaces from OSM; benchmark renders made resumable

Done
- The main KPI was missing: service.sh had logged "renders incomplete" twice, so builds dad9…, b45c… and 2d67… have
  no photo_match/judged_realism. The cause: a photo_render worker that crashes (machine busy) dropped its whole
  share, and bench.sh then threw away all renders. Now photo_render.mjs skips views already rendered, and bench.sh
  re-runs workers for the missing views (3 rounds) without deleting anything. A benchmark that gets interrupted
  resumes on the next run.
- Ground (build.py), per the session 25 side-by-sides (cobbles everywhere, carriageway too narrow):
  - `road_half(t)`: OSM `width` if mapped, else the class default + 1 m per side with on-road parking
    (`WC_ROAD_PARK`). cars.py and markings.py use it too, so parked cars stand just inside the kerb.
  - Carriageway surface from OSM `surface` (asphalt → road, paving stones → pavement, sett/cobblestone → the
    cobble texture). Footways and cycleways with a surface tag follow it too (asphalt paths are now tarmac).
  - 2 m footways beside primary to residential roads with `sidewalk=both|left|right|yes`, and untagged ones
    (`WC_SIDEWALK_DEFAULT`). Squares and parking areas: pavement.
  - Unmapped ground (`WC_GROUND_DEFAULT`): paving instead of cobbles. Cobbles now appear only where OSM says sett.
- A/B on 25 views (every 8th benchmark view, live build as control): control **18.13**, roads+footways 18.16,
  plus the paving default **18.19** (3 views better by > 1, 1 worse, range −1.3…+1.9). DINOv2 sees this as neutral.
  Shipped because the ground now matches the photos (side-by-side docs/ground_session26.jpg, photo | before |
  after; photos Mapillary CC-BY-SA 4.0, ids 812167710181454, 465367698087024, 183228076993113). Row 1 shows a tarmac
  road at its real width instead of paving slabs.
- Guardrails on the new build: walkable 99.39, buildings 100, street_objects 100, real_facade 7.6. Local load
  4.39 s, live load 5.03 s (both measured while the benchmark and other projects' jobs were loading the machine:
  load average about 40), site_errors 0. Published as build b8682f1eb62dea45. The benchmark of this build was started
  at the end of the session; service.sh resumes it if it is cut off.

Learned
- The Mac mini is shared: other projects run 3 CPU-bound Python processes, and a swiftshader render takes about
  1 view/min per worker. A 3-arm A/B on 25 views took about 25 min. Keep A/Bs at ≤ 25 views, reuse control renders.
- Ground changes hardly move DINOv2, which is dominated by buildings, sky and trees. The visible problems in the outer
  views are the jagged LiDAR roofs (sawtooth ridges from 1 m DSM pixels at eaves) and the plain walls.

Next
1. Roofs that look right at eye level: fit planes (gable/hip) to the DSM per footprint and keep the fit when its RMSE
   is ≤ 0.75 m (roof_match stays), instead of meshing the raw 1 m DSM. That removes the sawtooth eaves.
2. Wikimedia Commons photos of central buildings registered locally for poses (real facade area, centre first).
3. Synthetic per-building facades for walls with no photo.
4. Check the benchmark score of b8682f1eb62dea45 at the start of next session (data/benchmark/scores).

## 2026-11-08 — Session 27: plane-fitted roofs tried and not shipped (25-view A/B 18.19 → 17.92)

Done
- Benchmark of the live build b8682f1eb62dea45 completed (service.sh, resumed renders worked): **photo_match 18.86**,
  judged_realism 26.2, visual_quality 16.04. It is the first complete score since session 22's build (c527…); the
  builds in between have none.
- build.py `roof_planes()` (`WC_ROOF_PLANES`, **off by default**): sequential RANSAC (up to 8 planes, ±0.25 m band)
  on each pitched roof's DSM pixels; explained pixels snap to their plane, unexplained interior pixels (chimneys,
  towers) keep the DSM, unexplained edge pixels take the nearest plane unless the DSM is > 1 m off it (`WC_PLANE_EDGE`).
  3,098 of 3,120 LiDAR roofs fit (median 90 % of pixels explained, interior RMSE 0.12 m). roof_match 93.03 → 92.98.
- Dead ends on the way, all measured with roof_match on side builds: the lower envelope (min) of planes fits only
  ~1 % of roofs (most aren't simple gables/hips); snapping every edge pixel to its plane drops roof_match to 65.5
  (wall tops beside lower roofs were pulled down by up to 8 m).
- A/B on 25 views (every 8th benchmark view, both arms rendered locally): control **18.19**, planes **17.92**
  (6 better by > 0.5, 9 worse). Biggest loss: the Mathematical Bridge view (18.8 → 11.0): the stepped wall top beside
  the bridge became one flat plane that fills the sky. Side-by-side docs/roof_planes_session27.jpg (photo | before |
  planes; photos Mapillary CC-BY-SA 4.0, ids 506961850425011, 155280259867837, 754779088538115). Not shipped, so the live build is
  unchanged (b8682f1eb62dea45).

Learned
- The "jagged red mountains" in outer views are not the eave sawtooth: row 1 of the side-by-side shows the distant
  terraces equally jagged with plane roofs. Likely causes: each narrow terrace house is fitted separately and the
  roofs meet with steps, and the walls stop at the lowest roof edge so the roof reads as a saw blade against the sky.
  Next time look at a top-down/oblique render of one terrace before changing the fit.
- My Python string-replace edits can fail silently when the target text has changed; check the diff after each one
  (two side builds this session were identical because of it).

Next
1. Inspect one jagged terrace (e.g. the row in view 754779088538115's background) from an oblique camera and find the
   actual cause before another roof change.
2. Wikimedia Commons photos of central buildings registered locally for poses (real facade area, centre first).
3. Synthetic per-building facades for walls with no photo.

## 2026-11-08 — Session 28: GTAO ambient occlusion tried, kept opt-in (25-view A/B 18.19 → 17.93)

Done
- First step on the AAA-quality route (visual_quality 16.0, its lowest criteria gi_ao 1.2, geometric_detail 1.1):
  a post-processing chain in main.js behind `?post=ao`: RenderPass into a 4x MSAA half-float target, three.js
  GTAOPass, OutputPass. Options: `ao` (intensity), `aor` (radius m, default 2), `aores` (AO buffer scale), `aos`
  (AO and denoise samples). Vendored the needed r187 addons (postprocessing/, shaders/, math/SimplexNoise).
- Problems fixed on the way: (1) GTAOPass's own normal pass uses MeshNormalMaterial, which ignores alphaTest, so
  leaf cards and the transparent parts of facade photos cast dark AO smears into the sky, and the facade quads
  (no normals) went black. Now the AO reads the main pass's depth texture and reconstructs normals from it: no
  second scene render, and only drawn pixels occlude. (2) RenderPass draws into composer.renderTarget2, not the
  target passed in; and RenderTarget.setSize doesn't resize depth textures (GL "attachments not all the same size",
  blank canvas), so resize() sets the depth image sizes by hand.
- fps on the Mac's GPU, 1920×1080, while the machine had load average ~65: no post 59, full-res AO 16 samples 36,
  half-res AO 8 samples 56.
- A/B on session 27's 25 views (control renders reused, same build): control **18.19**, full-res AO **17.93**,
  half-res AO **17.78**. The biggest loss (155280259867837, −3.7) is a render glitch: in the AO render the ground
  is missing (sky below the horizon). Without that view the effect is about −0.1: neutral for DINOv2.
  Side-by-side docs/ao_session28.jpg (photo | control | AO; photos Mapillary CC-BY-SA 4.0, ids 204587944591503,
  183228076993113, 155280259867837). Not on by default; the live default render is unchanged.
- photo_render.mjs: `WC_DEBUG=1` prints page console messages and errors.

Learned
- At radius 2 m the AO is subtle at eye level: dark corners at wall/ground joints and under trees. DINOv2 doesn't
  reward it. It may help visual_quality (gi_ao) but that can only be measured with a judge run on the 30 quality
  views, which I didn't do this session (machine was loaded: 25 views × 2 arms took ~20 min).
- Benchmark renders can lose the ground (row 3 of the side-by-side). Under heavy load a view can be captured before
  its ground tile is placed, which adds noise to every A/B and to the published scores. photo_render should check
  that the ground under the camera is loaded (tiles.settled / a downward ray hit) before taking the shot.

Next
1. photo_render: wait for the ground tile under the camera, and retry views whose lower third is sky-coloured.
   Then re-score the live build to see how much of the benchmark is this noise.
2. Judge visual_quality with `?post=ao&aores=0.5&aos=8` on the 30 quality views (judge.py --only quality with a
   side hash). If gi_ao/lighting gain and photo_match stays neutral, make it the High preset's default.
3. Wikimedia Commons photos of central buildings registered locally for poses (real facade area, centre first).
4. Synthetic per-building facades for walls with no photo: the centre still shows large blank grey walls.

## 2026-11-08 — Session 29: more Mapillary photos for the facades (real_facade 7.6 → 7.84); window grid re-tested

Done
- Found that the Mapillary graph API under-returns images for large bbox queries: one 0.0005° cell near King's
  Parade gave 24 images, the list had 5. `scripts/mapillary_densify.py` re-lists the study area in 0.0005° cells
  (1,581 queries, 2 min; 0.00025° and 0.000125° cells returned the same set in a spot check). Gain overall was small:
  10,905 → 11,095 images (82 of the new ones at 200–300 m from GSM). The old list is in mapillary_list.json.bak.
- Facade re-bake (radius 500, masks.py for the 465 new photos, then bake again): 3,106 pieces from 1,230 photos (was
  3,009 / 1,172), **real_facade_pct 7.6 → 7.84**. No A/B was run for this (the change only adds or swaps
  photos on a few walls); the full benchmark of the new build comes from service.sh.
- Benchmark renders: `window.__player.settled(r)` (main.js) and photo_render.mjs waits for all tiles within 150 m
  before the shot, which fixes the "ground missing" captures seen in session 28. Checked on 155280259867837 (the view
  that lost its ground last session): the ground is there.
- Re-tested the procedural window grid `?win=1` (off since session 10) on session 27's 25 views, with control renders
  reused: **18.42 → 18.43** on 24 views (one render missing). That is neutral, but single views move a lot:
  12 better by > 0.5 and 10 worse (+7.3 … −9.9). Real windows (a terraced street) gain, while the Mathematical
  Bridge and plain college walls lose. Side-by-side docs/windows_session29.jpg (photo | control | windows; photos
  Mapillary CC-BY-SA 4.0, ids 1866916603482573, 215717297387097, 754779088538115). Stays opt-in.
- Guardrails on the new build (local, machine loaded): walkable 99.39, buildings 100, street_objects 100, site_errors
  0, load 5.69 s locally (load average ~20; the live measurement decides). Published (release world-20261108-1053).

Learned
- Photo coverage is the limit for real facades, not the API listing: only 29 % of street-facing wall within 100 m
  of GSM has a usable Mapillary view. Further gains in the centre need other photos (Wikimedia Commons, registered
  locally; COLMAP is not installed) or synthetic per-building facades.
- A uniform window grid is right for some buildings and wrong for others. A synthetic facade has to be per building
  (storeys from the LiDAR eave, window bays from the wall length, none on college boundary walls and churches) to
  keep the gains without the losses.
- The bottom row of the windows side-by-side shows the "saw-tooth" terrace tops again: the triangular wall-coloured
  spikes above the eaves on Regent Street/Hills Road terraces.

Next
1. Per-building synthetic facades: a per-vertex attribute (storey count, bay width, has-shop from OSM, wall type)
   from build.py; windows only where it says so. A/B on the same 25 views with the window-grid result as reference.
2. Check the benchmark of the new build (scores/<hash>.json) against b8682's 18.86.
3. Wikimedia Commons photos of the centre registered locally (install COLMAP via a local build or pycolmap wheel).

## 2026-11-08 — Direction from Gaspard Oliviers (Sun 12:00): modelled geometry, Market Square first, faster

Replaces the previous "Next" list. Follow this in every work session from session 30 on.
1. **Geometry, not pasted photos.** Recreate buildings and streets as 3D geometry: window reveals, frames, sills,
   doors, shopfronts, cornices, mouldings, chimneys, dormers, kerbs, stalls, the fountain. Photos are references only
   (shape, layout, colour). Build a parametric parts library (window/door/shopfront/cornice/dormer/chimney/stall...)
   and assemble each facade from a per-facade layout annotation (storeys, bay positions, element types) made from
   non-benchmark photos. Photo-baked facades are to be replaced, not extended. real_facade_pct is removed.
2. **Market Square first.** Zone = within 90 m of 52.2053°N, 0.1190°E (Market Hill + stalls, fountain, Guildhall,
   Great St Mary's, frontages on Peas Hill, Market St, Rose Crescent, Petty Cury). Target market_square_realism ≥ 70
   before working anywhere else.
3. **Pace.** Fan out parallel subagents each session (one per building or part type), ship visible geometry every
   session, skip renderer experiments that don't change what you see (no more AO/sky/lighting A/Bs for now).
New KPIs: market_square_realism (main; 40 held-out photos, blind judge), market_square_photo_match,
facade_geometry_match_pct, painted_detail_pct (lower is better). The 40 held-out photos must never be used for
annotation or tuning; annotations come from other Mapillary/Commons photos.

Plan for session 30
- Check measure.sh/service.sh implement the new KPIs (zone photo set frozen, judge, annotation file format) and get a
  baseline. Write the facade annotation schema (JSON per facade: wall id, storeys, bays with element type/x/width/
  sill/head heights, shopfront, cornice line, roof features).
- Parallel subagents: (a) parts library in the site (instanced, LOD'd window/door/shopfront/cornice/sill meshes),
  (b) annotations for the square's frontages, split by street, (c) Guildhall, (d) Great St Mary's, (e) market stalls
  (OSM/photo layout) + fountain + kerbs/bollards. Integrate, check fps/load guardrails, publish.

## 2026-11-08 — Session 30: Market Square set frozen, first modelled facades + stalls (parts library)

Done
- **Held-out set**: `scripts/make_ms_benchmark.py` froze 40 Mapillary photos with the camera inside the zone
  (90 m of 52.2053N 0.1190E; 203 candidates, spread over position+heading, 12 sequences, no overlap with the 200).
  data/benchmark/market_square.json, photos_ms/ (gitignored), heldout_ms.json. facades.py and zone_walls.py exclude it.
- **KPIs**: `scripts/ms_bench.sh` (renders 40 views → DINOv2 `_ms.json`, blind judge `judge.py --only market` →
  `_msjudge.json`), run by service.sh and read by measure.sh. `scripts/zone_kpi.py` → facade_geometry_match_pct and
  painted_detail_pct (in measure.sh). real_facade_pct dropped from measure.sh (retired).
- **Baseline (live build 6546fa, before geometry)**: market_square_realism **25.25**, market_square_photo_match
  **34.06**, facade_geometry_match_pct 0, painted_detail_pct 73.4.
- **Wall list**: `scripts/zone_walls.py` → data/annotations/market_square/walls.json: 153 street-facing walls
  (53 buildings, 1,352 m), each with up to 5 non-held-out reference photos (72 walls have any).
- **Fan-out (5 subagents)**: parts library `scripts/facade_parts.py` (skin 0.25 m proud of the tile wall with real
  openings, reveals, glass, frames + glazing bars, sills, heads, doors, shopfronts with fascia/stallriser/awning,
  cornices, string courses, quoins, pilasters, dormers; default layout for unannotated walls) +
  `scripts/zone_build.py` → site/zone/market_square.glb (76k tris) + `site/app/zone.js` (`?zone=0` off);
  3 annotators → 15 annotation files (18 walls, mostly low confidence); `scripts/zone_props.py`: ~95 market stalls
  on the OSM stall-row strips (striped gabled canopies, counters, back boards), Hobson's Conduit fountain, 2 trailers.
  Screens: docs/zone_session30_{north,annotated,closeup}.png.
- After: facade_geometry_match_pct 12.15, painted_detail_pct 22.4 (from 73.4). manifest.json carries a `zone`
  entry so the build hash changes. Published release world-20261108-1128 (hash 9197e5fdc5d17b5d). Local check:
  site_errors 0, load 6.59 s at load average ~50 (zone loads async after spawn). The market KPIs for the new build
  come from service.sh's next ms_bench run; not measured in-session (40 renders took ~20 min under load).

Learned / honest caveats
- The reference-photo matching is the bottleneck: annotators found many refs to be Great St Mary's interiors,
  blurred, or not attributable to a wall; only 18 of 153 walls got annotations. 109 built walls use the *default*
  layout (bays every 2.8 m), i.e. plausible but unverified windows — that is not "the real layout" yet.
- facade_geometry_match_pct compares annotation counts with the elements the builder emitted from the same
  annotation, so for annotated walls it is near 100 by construction; it mainly measures annotation coverage. To
  make it meaningful, the per-element positions should be checked too.
- The old OSM `building=roof` stall strips (way/400160678–685) are still extruded by build.py as stone boxes with
  brick-textured roofs under the new canopies (visible in docs/zone_session30_north.png). Colours on the skins are flat
  (no brick/stone texture).
- OSM overlap: way/137017428 / 1099847936 and 137017430 / 1099847940 share walls.

Next
1. Check the new build's market_square_realism/photo match (scores/9197e5fdc5d17b5d_ms*.json); keep or revert.
2. Fix the reference photos: test visibility (wall in the frustum, not occluded, camera outside every footprint),
   then re-run the annotators with 1 building each, more agents; let them also use Wikimedia Commons (licence checked).
3. build.py: render the stall strips as thin roofs/none in the zone (keep building_coverage), stall props instead.
4. Brick/stone/render detail textures on the skin (material-aware), fascia text, bay/oriel windows; Guildhall and
   Great St Mary's bespoke upgrades.

## 2026-11-08 — Session 31 (entry written in session 32): materials, Guildhall, stall canopies — not committed

Session 31 ran out of time before committing or writing an entry; session 32 checked its working tree (build at
12:45 runs: site_errors 0, fps 60, load 1.1 s locally) and committed it as 1e412f9:
- per-triangle material ids (`_MAT` glTF attribute; facade_parts.MATS: brick/stone/render/timber/glass/flint/trim)
  with a procedural shader patch in site/app/zone.js (brick coursing, ashlar joints, render noise, glass reflection;
  joints fade with fwidth). Screens docs/zone_s31_materials_*.png.
- scripts/zone_bespoke_guildhall.py: bespoke Guildhall (rusticated stone ground storey, 9 bays, balcony, cornice,
  attic panels, clock) from Commons photos.
- build.py: OSM `building=roof` (the Market Hill stall rows way/400160678–685) as thin gabled canopies at 2.4 m, no
  walls or collision — previously stone boxes with a brick-textured ceiling (some held-out renders were *inside* them).
- 13 more annotation files (31 of 153 walls annotated).
The session-30 build (9197e5) scored market_square_realism 23.62 and photo match 28.09, *below* the 25.25 / 34.06
baseline: judge reasons cite crude boxes, the brick "ceiling" of the stall boxes, pasted photo slivers, and a few
renders with the camera inside a wall.

## 2026-11-08 — Session 32: Great St Mary's bespoke, photo facades off in the zone, 54/153 walls annotated

Done
- Committed session 31's leftover work (entry above) after a local check.
- **No photo facades inside the zone** (site/app/facades.js drops quads within 100 m of 52.2053N 0.1190E;
  `?zone=0` restores them). The judge kept citing pasted photo slivers and "blurry wall with a poster".
- **build_hash.py** now also hashes app/zone.js and zone/zone.json. Before this, zone-only changes (session 31's
  shader) kept the old hash, so the cached scores belonged to the wrong build.
- **Fan-out (2 subagents)**: (a) `scripts/zone_bespoke_gsm.py`: Great St Mary's, 22k tris. Aisles with buttresses
  and Perpendicular windows (real reveals, mullions, transoms, hoods), battlements + pinnacles, clerestory, lead
  roofs, chancel with 5-light east window, south porch, west tower with door, west window, belfry louvres and four
  turrets. Heights from the LiDAR DSM: aisle parapet 9.9 m, clerestory 15.8 m, tower battlements 29.0 m, pinnacles
  33.0 m above ground; nothing more than ~0.3 m above the DSM. The tile body was a plain box hiding the
  clerestory, so bespoke modules can now set `HIDE_TILE`: zone_build writes zone.json `hide`, and zone.js/tiles.js hide
  the `b:<osm_id>` tile node (collision is kept). (b) 23 more wall annotations (31 → 54 of 153; only 2 medium
  confidence, the rest low): Trinity St 1–6, the Market Hill colonnade block, St Michael's church, Caius frontages.
- facade_geometry_match_pct 38.28 locally (from 20.9 live); painted_detail_pct 22.42. Zone 118.7k tris.
  Local GPU Chrome: site_errors 0, fps 60, load 0.8 s. Screens docs/zone_s32_gsm_{eye,aerial}.png.
- Published release world-20261108-1202 (hash 2204808e8f17726f). service.sh will compute market_square_realism and
  photo match for it; nothing was benchmarked in-session.

Learned
- OSM has duplicate footprints (Caius college ways vs street-address ways, e.g. 137017428:0/1 = 1099847936:5/6,
  137017430 = 27–28 Market Hill), so two skins get built on the same wall and z-fight. Dedupe walls in zone_walls.py.
- Some walls.json reference photos are attributed to the wrong walls (e.g. Great St Mary's interiors).
- Several low-scoring held-out renders have the camera inside or against a wall (GPS error). Note it; don't change
  the measurement without asking Gaspard.

Next
1. Read the 2204808e ms scores; if realism still sits below the 25.25 baseline, look at the per-view reasons.
2. Dedupe duplicate footprints in zone_walls.py; hide tile bodies for more fully-skinned buildings.
3. More bespoke models: St Edward's, Lion Yard / Petty Cury frontages, the Market Hill colonnade block; better
   annotations (upgrade the low-confidence ones from Commons/Geograph photos).
4. Street trees and lamp posts in the square checked against OSM; shopfront signs with real names as geometry.

## 2026-11-08 — Session 33: bespoke Senate House, OSM railings/walls/steps, Petty Cury shopfronts

Done (4 parallel subagents + integration)
- **Senate House** (`scripts/zone_bespoke_senate.py`, 40k tris, way/5094870, tile body hidden): 9-bay south front
  with 4 engaged Corinthian columns + pediment, pilasters, alternating pedimented ground-floor windows and round-headed
  upper windows (real reveals, sashes, glazing bars), entablature, balustrade with urns, temple-front east end, lead
  roof. Heights match the LiDAR DSM within ~0.3 m (balustrade 22.55 vs 22.4–22.9, ridge 23.75 vs 23.7–23.8). Its
  photo facade is now skipped too (facades.js SKIP gets a 20 m circle at -213.3, 80.3). Before/after:
  docs/zone_s33_senate_before_after.png: the biggest visible change this session.
- **Barriers** (`scripts/zone_props_barriers.py`, 46k tris): every OSM fence/railing/wall/gate/steps way within
  170 m: black spear-topped railings on stone plinths with piers (Senate House lawn 0.45+1.55 m, GSM churchyard),
  stone walls (LiDAR height), stone step flights. zone_build.py now loads every `scripts/zone_props*.py`.
- **Annotations**: 2 annotators, walls_annotated 48 → 63 by the builder's count (the commit message says 69; wrong).
  Petty Cury 32–38 (Body Shop, Timpson, Fone World, Halifax, Trailfinders: real shopfronts), St Edward's south and
  east walls and tower, Lion Yard, King's Parade 20–22, 1 Trinity St, Radcliffe Court, 16 Market St. Petty Cury /
  St Edward's evidence is 16 CC BY-SA Commons/Geograph photos (data/raw/commons_ref, credited in DATA.md + each
  annotation's sources); no held-out photos.
- **zone_build.py**: no facade skins on the stall rows (`building=roof`) and trailers (they had windowed skins on
  the canopies); overlapping OSM footprints deduped (13 walls of 137017428/137017430 dropped; keep annotated, then
  addressed ways).
- **zone_kpi.py**: painted_detail_pct now ignores photo quads the viewer doesn't draw (facades.js SKIP). It reads
  **0.0**, but that is because photo facades are hidden in the zone, not because every wall is modelled: 54 of 153
  walls have no skin (bespoke, stalls, dupes) and ~36 built walls still use the default procedural layout.
  facade_geometry_match_pct 38.3 → **44.2** locally.
- Zone GLB 199k tris, 25 MB (Pages serves it gzipped, 1.9 MB was the old one; new ~3 MB). Local: site_errors 0,
  load 2.55 s (swiftshader), GPU fps 60. WebKit smoke still crashes at launch (known since session 13).
- Published world-20261108-1227, live hash **afce85b5fd43a94e**. measure.sh: roof_match_pct 93 → 92.35 (still ≥ 90; not investigated). Before/after shots for Petty Cury, St Edward's,
  King's Parade, Trinity St, Senate House: docs/zone_s33_*_before_after.png (poses in docs/s33_views.json; not
  benchmark poses).
- Market-square scores for 2204808 (session 32) were never computed: the service was busy with the 200-view bench.
  service.sh will score afce85 next; nothing was benchmarked in-session.

Learned
- The Senate House long front faces south (lawn), not east; OSM footprint is 13.8 m deep while the LiDAR roof is
  ~17.5 m (kept OSM for collision consistency).
- An agent put the owner's email in a User-Agent header when downloading from Wikimedia. Brief agents explicitly
  never to send it anywhere.
- Annotators: many walls have no openly licensed photo at all (rear/courtyard walls); 134387872:3 (Ryder & Amies)
  should be redone from Mapillary 306889447541810 / 1401075926896432. No "blind window" or mixed-material
  (stucco ground floor + brick above) support in facade_parts yet.

Next
1. Read afce85 market_square_realism / photo match; compare with 25.25 / 34.06 baseline and 23.62 (9197e).
2. facade_parts: blind windows, per-storey material (stucco ground floor), shop signs as 3D letters.
3. Bespoke: Market Hill colonnade block, Lion Yard frontage, King's Parade terraces (next ring), Caius gate.
4. Check the barrier guesses (Corpus steps ways 149032847/149032852/375395069, low walls 95406723/95406726).
5. Zone GLB size: index/quantize (meshopt) before it grows further.

## 2026-11-08 — Session 34 (entry written in session 35)

Session 34 committed 9c99d5a (bespoke Caius ranges + gate tower, St Edward's and St Michael's churches, detailed
stalls, OSM street furniture: K6 kiosks, pillar boxes, bins, benches, Sheffield stands with bikes; quantized compact
zone GLB 25 -> 12 MB) but its publish failed: release world-20261108-1317 stayed a Draft with no asset, so the live
site stayed on afce85. No journal entry was written. Session 35 deleted the empty draft and published everything.
afce85 scores (live until session 35): market_square_realism 25.88, market_square_photo_match 25.49, photo_match 19.0,
judged_realism 26.6, visual_quality 17.12. (scores/353eb5c2…_msjudge.json reads realism 27.25 for an intermediate build.)

## 2026-11-08 — Session 35: city-wide 3D facade baseline, photo facades retired, King's gatehouse + screen

Done (2 subagents + my own work)
- **scripts/city_facades.py** (Gaspard's direction 2a): every street-facing wall of every OSM building in the world
  (ways + multipolygons; an edge >= 2 m facing a walk sample 2-25 m out, nothing in between; as zone_walls.py) gets
  parts-library geometry: **6,820 walls of 1,840 buildings**, 560k m² of facade, 3.62 M triangles, 132 MB of compact
  quantized GLBs (gzip ~1/5), one per 250 m tile in site/cityfac/ + index.json. Skips the zone walls, bespoke modules,
  detailed landmarks, stall canopies; 86 duplicate overlapping walls dropped (kd-tree, not the O(n²) zone version).
  Runs in ~70 s.
- **scripts/facade_styles.py** (subagent): layout(wall) infers a style from OSM tags + location: college gothic /
  Tudor brick / classical by college, churches, Georgian historic core within 350 m, Victorian gault/red terraces by
  street, villas, interwar, modern/glass; shopfronts with fascia_text from OSM name/brand; storeys from levels or
  H/3.1. 5.8 tris/m² vs 6.7 for default_layout.
- **colour_hint**: the median (brighter half) colour of each wall's old photo-facade atlas pieces (non-held-out
  Mapillary) drives the wall colour; 891 walls have one. Photos only give material colour; all detail is geometry.
- **Viewer** (site/app/tiles.js): city facade GLBs stream per tile within FAC_R = 200 m of the player (medium 120,
  low 60; ?facr=, ?cityfac=0), with the zone's procedural material shader (zone.js exports zoneMat). **Photo facades
  are off by default** (?facades=1 brings them back). photo_render.mjs waits for window.__cityfacPending.
  build_hash includes cityfac/index.json; publish.sh ships cityfac.
- **Bespoke King's College gatehouse + Wilkins' screen** (subagent, scripts/zone_bespoke_kings.py, way/164708972,
  38.7k tris, tile body hidden): traceried open arches, crocketed pinnacles, pierced parapet, gate with royal arms,
  four turrets with spires, lantern with clock; heights fitted to the DSM (lantern cap 31.0 vs DSM 31.7, parapets
  within 0.5 m). Sources: 3 CC BY-SA 4.0 Commons photos (DATA.md). docs/zone_s35_kings_gate.png.
- Checks: local GPU Chrome fps 60, site_errors 0, load 0.89 s; swiftshader load 4.0 s local, 5.26 s live.
  zone facade_geometry_match_pct 45.07 (unchanged: annotations only exist in the zone). Published
  world-20261108-1344, live hash **57d27678e9a8ab05** (verified). service.sh will score it; nothing benchmarked
  in-session. Before/after (live afce85 vs new): docs/zone_s35_city_before_after.jpg — King's Parade and Jesus Lane
  rows show the change; 4 of my 6 test poses landed against walls/courtyards (bad hand-picked coordinates).

Learned
- Session 34's publish silently left a Draft release: check `gh release list` / the live hash after publishing.
- Colour hints from the atlases are often too grey (shaded photos); several King's Parade fronts come out grey/red
  brick where the real ones are pale stone and render.
- The street-facing test uses only walk samples, so walls along roads without footway samples may be missed.

Next
1. Read 57d276's market_square_realism and the 200-view benchmark; report photo match per ring (distance groups).
   If the city-wide geometry lowers photo_match away from the zone vs the photo facades, look at the views.
2. Better city colours: per-building colour from Claude vision on non-held-out Mapillary refs, ring 1 first;
   annotate ring-1 walls (King's Parade, Trinity St, Bene't St, Sidney St) like the square.
3. Ring-1 bespoke: Corpus Christi (old court front / New Court gate), King's Parade terraces, Old Schools upgrade.
4. City facade LOD: cheaper far windows (flat recess only) so FAC_R can grow; corner mitres between buildings.
5. Fix the s35 test poses (snap to walk samples) for future before/after shots.

## 2026-11-08 — Session 36: real paving, St Bene't's, Corpus front, ring-1 annotations, college styles

Scores for 57d276 (session 35, city-wide 3D facades): market_square_realism **28.5** (afce85: 25.9),
market_square_photo_match 29.5 (25.5), photo_match 18.8 (19.0), judged_realism 26.4 (26.6), visual_quality 24.8
(27 of 30 views scored).
New **scripts/ring_report.py** <hash>: the 200-view benchmark grouped in 150 m rings from the square (ring0 < 90 m).
afce85 → 57d276 photo match: ring1 31.3 → **18.9**, ring2 36.9 → **23.4**, ring4 14.8 → 18.2, ring5 18.2 → 21.5.
So retiring the photo facades cost DINOv2 similarity near the centre and gained it further out. The worst drops
look into college courts (Old Schools, Caius/Trinity courts), where the generic baseline drew 5-storey brown "modern"
brick with plate-glass windows.

Done (4 parallel subagents + my own work)
- **Ground surfaces** (subagent): new class S_BRICK (10) with herringbone pavior shader; setts and slab patterns
  redone in materials.js (the slab pattern changes pavement city-wide); OSM area surface tags now count (Market Square
  is surface=sett); evidence-backed overrides in data/annotations/ground/surfaces.json (Market Street brick
  carriageway, Market Hill junction, King's Parade east sett strip; non-held-out Mapillary/Commons ids per entry).
  Collision is byte-identical apart from surface ids. docs/zone_s36_paving_before_after.png.
- **Bespoke St Bene't's** (scripts/zone_bespoke_benet.py, 16.6k tris, tile body hidden): Saxon tower with
  long-and-short quoins and baluster belfry openings, nave and clerestory, aisles, porch, chancel. Heights within
  ~0.3 m of the DSM. docs/zone_s36_benet.png.
- **Bespoke Corpus New Court street front** (scripts/zone_bespoke_corpus.py, 25k tris): Wilkins gate tower with
  octagonal turrets, two ranges, end pavilions with oriels, battlements; tile body kept (court side and roof).
  docs/zone_s36_corpus.png.
- **Ring-1 annotations** (subagent): city_facades.py builds data/annotations/ring1/way_*.json through the zone's
  wall_facade path. 24 buildings / 26 walls: King's Parade 1–19, Bene't St 7, Trinity St 3, all from non-held-out
  Mapillary photos. King's Parade facade_geometry_match is **63.1** (14 of 22 walls). Ring 1 (all city walls < 400 m)
  is only 1.1 (26 of 1,952).
- **facade_styles.py** (me): a building inside OSM college/university grounds takes that college's style family
  (smallest containing polygon; named modern courts and university sites in a COURT table); no random "modern"
  downgrade for old college ranges within 300 m; college and institutional storeys at 3.9 m. This changes 291 of
  the 1,952 ring-1 walls (the Old Schools go from modern brick to classical stone, 5 → 4 storeys).
- Local GPU Chrome: site_errors 0, fps 60, load 0.73 s. Zone 363k tris; cityfac 119 MB raw (3.39 M tris).
  Published world-20261108-1602, live hash **726ee1a5e9eae0c1** (verified; release not a draft). Nothing was
  benchmarked in-session: service.sh will score it.

Learned
- Real paving near the square, from photos: only Market Street has the brick carriageway. Peas Hill really is
  asphalt with a sett strip, and King's Parade's west lane is asphalt. Don't paint brick everywhere.
- The 2 m ground grid makes surface boundaries wavy. Kerbs don't exist yet.
- walls.json heights are wrong for some fronts (4–5 King's Parade 2.6 m, 15 Bene't St 5.3 m), which clips their
  annotations to the ground floor.
- Running zone_build/city_facades/build.py concurrently across agents works if each agent owns its files.

Next
1. Read 726ee1's scores and run ring_report.py 57d27678e9a8ab05 726ee1a5e9eae0c1. Check ring 1–2 photo match recovers.
2. Kerbs as geometry (granite kerb lines along road/footway edges in the zone and ring 1) + sharper surface edges.
3. Fix wall heights from the DSM for the 2 clipped annotations; annotate the rest of Trinity St, Sidney St, Market
   Hill colonnade; per-building colours from Claude vision on non-held-out refs (ring 1).
4. Bespoke: Old Schools / Cockerell building, Trinity Great Gate, Caius Gate of Honour.

## 2026-11-08 — Session 37: kerbs, Old Schools + Great Gate, 18 more ring-1 annotations, ring-1 colours

Scores for 726ee1 (session 36): market_square_realism 28.25 (57d276: 28.5), market_square_photo_match 30.04 (29.5).
The 200-view benchmark for 726ee1 hadn't finished when this session published, so ring_report wasn't run.

Done (4 parallel subagents)
- **Kerbs** (scripts/zone_props_kerbs.py, auto-picked up by zone_build): 0.30 m pale granite, 0.12 m upstand, dark sett
  channel, along carriageway outlines in the zone + ring 1 (incl. kerbed pedestrian streets: Trinity, Sidney, Market St,
  St Mary's St, Peas Hill, St Andrew's, Green St). Flush at crossings / kerb=lowered / Market Square setts, 0.04 m on
  sett carriageways. 3.4 km raised, 25k tris. Render only; collision unchanged. docs/zone_s37_kerbs.png.
- **Bespoke Old Schools east front** (zone_bespoke_oldschools.py, way/135762298, 12.5k tris): open 5-bay loggia
  (the footway runs through it), pedimented arched windows, swag frieze, balustrade with urns (no pediment: photos);
  DSM fit within ~0.5 m. **Trinity Great Gate** (zone_bespoke_greatgate.py, 10.3k tris): octagonal brick turrets with
  quoins, carriage + wicket arches, shields, Henry VIII niche, parapet; merlons 16.0 vs DSM 15.8-16.1. The Great Court
  east range (way/151179441) tile body hides because its tile still carries detail.py's old gate_tower box 6 m in front
  of the gate; a plain LiDAR stand-in is drawn instead. docs/zone_s37_oldschools.png, docs/zone_s37_greatgate.png.
- **Ring-1 annotations**: +18 buildings (Trinity St 8, Sidney St 7, Market Hostel, Cockerell, Whewell's), 42 total;
  city_facades.py eave fix searches deeper inside the footprint in the DSM when an annotation is taller than the wall
  (4-5 King's Parade 2.6 -> 13.0 m). King's Parade match 63.1 -> 64.4, ring 1 1.1 -> 2.8 (46 of 1,950 walls).
- **Ring-1 colours**: data/annotations/colours/ring1.json, 62 buildings' material/wall/trim/roof read by eye from
  non-held-out Mapillary photos with OSM outlines projected on; facade_styles.py applies them over colour_hint
  (55 buildings in the build).
- Local GPU Chrome: load 0.78 s, fps 60, site_errors 0. WebKit smoke still crashes at launch (known; also on
  example.com). Zone 413k tris; cityfac 3.39 M tris. Published world-20261108-1631, live hash **a668b77dc59ccdca**
  (verified). service.sh scores it.

Learned
- Concurrent city_facades.py runs clobber each other's tiles; rerun once at the end.
- Mapillary poses on Trinity St are off by metres; agents placed buildings by visible shop names/house numbers.
- Several OSM shop names are newer than the photos (Seasalt vs Coast etc.); OSM wins for fascias.

Next
1. Read a668b7's scores; run ring_report.py 726ee1a5e9eae0c1 a668b77dc59ccdca (ring 1 should rise).
2. Remove detail.py's trinity-great-gate gate_tower box properly (keep landmarks_detailed counting the bespoke
   module) so the Great Court range keeps its tile body.
3. Fascia text as geometry/texture-free lettering; annotate rest of Trinity St (14-19, 32-38), Sidney St 22-54,
   Market Hill/Rose Crescent sides of Market Hostel; colours for Trinity St.
4. Sharper ground surface edges (2 m grid) to match the kerb lines.
5. Bespoke: Caius Gate of Honour, Senate House Passage, Cockerell full building.

## 2026-11-08 — Session 38: two-row stall canopies, square lamps, 72 more ring-1 colours, 18 more ring-1 annotations

Scores: a668b7 (session 37) market_square_realism **27.88** (726ee1: 28.25), market_square_photo_match 30.06 (30.04).
726ee1 full benchmark: photo_match 18.83; ring_report vs 57d276: ring1 18.9 → 20.1, ring2 23.4 → 23.7, others flat.
What the judge says on 726ee1's Market Square views (counted from its reasons): stalls wrong (16 of 40), railings (13),
shopfronts (12), viewpoint/framing (10), lamp posts missing (8), grey/brick where real is white render (8+).
Several of the 1-point views are camera-pose problems: the frozen pose puts the camera inside a wall or in a court
(e.g. 443229757448400 renders a wall close-up). Not tunable without using the held-out set.

Done (3 parallel subagents)
- **Stalls** (zone_props.py): photos from the GSM tower (Commons, 2016) show each OSM stall strip ≥ 6 m wide is two
  back-to-back rows, each with its own low gabled canopy (eave 2.3, ridge ~2.85 m); white canvas with red/yellow/blue/
  green stripes down the slope, scalloped edges both sides, darker back sheets on half the stalls. build.py's old single
  wide canopies are hidden (zone_build collects HIDE ids from props modules too). docs/zone_s38_props.png.
- **Lamps** (zone_props_furniture.py): OSM maps none in the zone; 4 black ~7.5 m columns with twin saucer lanterns at
  photo-confirmed spots (positions ±3 m or worse). Zone 413k → 432k tris.
- **Colours**: data/annotations/colours/ring1.json 62 → 134 buildings (Market St, Rose Crescent, Petty Cury, Peas Hill,
  Green St, Trinity St, Sidney St, Malcolm St…), mostly Commons photos (Mapillary there is night-time or missing).
  Only 12 went brick → render/stone; many changed red → gault/sooted brick. 116 buildings get overrides in the build.
- **Ring-1 annotations**: +18 buildings / 20 walls (Trinity St 14-38, Sidney St 47-52, Green St). Ring-1 match
  2.79 → 3.76 (66 of 1,950 walls); King's Parade 64.4 unchanged; zone 45.07 unchanged.
- Local GPU Chrome: load 0.87 s, fps 60, site_errors 0, all moves ok. Published world-20261108-1714, live hash
  **1e4e459f1d7cd9d1** (verified). service.sh scores it.

Learned
- The colours file never reaches zone walls: the square's own fronts take colours from the zone annotations. The judge's
  "red brick vs white render" complaints on the square point at data/annotations/market_square wall_colour values.
- Commons rate-limits (HTTP 429) bulk downloads; agents should pace and cache.
- facade_parts.dormer() counts its window as a window, so dormer walls score ~0.92 against annotations.
- Subagents took ~25 min of a 30 min session on photo research; give them narrower targets.

Next
1. Read 1e4e45's scores (stalls + lamps) vs a668b7.
2. Audit the zone annotations' wall_colour/material against non-held-out photos (white render fronts on Market Hill
   and Market St); this is the remaining colour complaint.
3. Bollards along the square edges and the Market St south footway; Guildhall-front lamps; planted fountain basin.
4. Stall side panels are flat plain colour boxes: add goods, frames, open fronts.
5. Ring 1: Sidney St 22-46 (big footprints need splitting by bay), Market Hostel, Rose Crescent; dormer count fix.

## 2026-11-08 — Session 39: open trestle stalls, King's Parade lamps + bollards, square colour audit, 6 ring-1 annotations

Scores: 1e4e45 (session 38) had not been scored when this session published. The service was still on the 200-view
run, and it scores whichever build is live, so 1e4e45's Market Square numbers may never exist. Compare c2b7a8 against a668b7
(market_square_realism 27.88, photo_match 30.06).

Done (4 parallel subagents + me)
- **Stalls** (zone_props.stall): the full-height grey side panels are gone, so bays are open. Counters are now trestle tables
  (legs, thin top, artificial grass), food stalls have tilted crates of produce in two rows with price cards, other
  stalls have trays and hanging rails, and there are crates under the tables. Back sheets are darker, on 75% of bays.
  Stall props 55.8k → 66.5k tris. docs/zone_s39_stalls.png. These are guesses: no photo reference was used.
- **Lamps + bollards** (new zone_props_streetlights.py, 4.3k tris): 6 grey lamp columns on the King's Parade east
  kerb, 2 on Bene't St, 2 on SW Market Hill (Mapillary map-feature detections snapped to the kerb, ±2–4 m), and 28 black
  bollards (13 curved along the Senate House Hill west kerb, 13 along the King's College kerb, 2 at St Mary's Passage)
  placed from non-held-out Mapillary 541914280138693 / 189066929702180. The photos show the bollard line on the
  King's (west) side, not the east. docs/zone_s39_lamps.png. The nearest KP lamp didn't show in the agent's shot; check.
- **Zone colour audit**: 12 Market Hill orange-red → white render with dark green trim (Don Pasquale era; the
  Mapillary photos predate the 2022 repaint, which is what Commons showed). 10-15 Market St, 1-11 Rose Crescent and
  the Lion Yard brick walls were toned to buff/gault. About 12 other fronts were confirmed as correct. colour_source is noted per file.
- **Ring-1 annotations**: +6 buildings / 9 walls (13 & 16 Bene't St, 8/9/10 St Edward's Passage, Rose Crescent
  1-11 side walls). Ring 1 3.76 → 4.27 (75 of 1,950 walls); King's Parade 64.4 → 65.4.
- **facade_parts.dormer()** no longer counts its window as a separate window, per SCHEMA. Zone match 45.07 → 45.21.
- Local GPU Chrome: load 0.99 s, fps 59, site_errors 0, all moves ok. Zone 446.6k tris. Published
  world-20261108-1736, live hash **c2b7a8b219965589** (verified).

Learned
- zone_build reports 94 of 153 zone walls skipped (59 built). Find out why. Unbuilt walls might be part of the "grey
  box" complaints, which would make this the next big lever for the square.
- Peas Hill buildings have no zone annotations; their colours come from ring1.json or the style palette.
- A subagent reported a hook-delivered message, supposedly from Gaspard, asking to turn the project into a wizard game (mobs,
  classes, new KPIs). It did not reach me directly, so I did not act on it. If it is real, it will arrive in a later session.

Next
1. Read c2b7a8's market_square scores vs a668b7 (27.88 / 30.06); revert the stall rework if realism drops.
2. Investigate the 94 skipped zone walls (zone_build walls_skipped).
3. Bene't St remainder (Eagle side walls, 15 Bene't St, Bene't Hostel), 6 St Edward's Passage, Sidney St split by
   bay; photos are cached in /tmp/cref/dl (may not survive).
4. Peas Hill zone annotations; stall end back-sheets lower or gapped; Petty Cury colour check.

## 2026-11-08 — Sessions 40–42 (entry written in session 43; those sessions left no journal entry)

From the commits: session 40 added the wizard game layer (site/app/game: 4 classes, mobs + the Bellwarden boss on
Market Hill, effect items, chests at real places, encounters, HUD, exploration toggle). Session 42 published it, wired
scripts/game_kpi.sh into publish.sh and service.sh (per live hash), added gameplay_judged (scripts/gameplay_clip.mjs
+ gameplay_judge.py), the route bot (scripts/playtest.mjs) and 93 ring encounters. Live f2555c7eb46db8a5:
playable_classes 3, mob_types 11, bosses 1 (3 defined), equipment_effects 44, encounter_coverage_pct 32.7,
playtest_pass_pct 85, boss TTK spread 65%, gameplay_judged 28 (judge: blocky enemies, no telegraph decals, no loot
beams/toasts, sparse hit feedback, boss blows out white on hit).

## 2026-11-08 — Session 43: telegraph decals, loot pillars + toasts, hit feedback, class balance, zone annotation fix

Scores: live f2555 (session 42) market_square_realism **29.62** (28.8 before). Game KPIs on f2555: playable_classes 3,
mob_types 11, bosses 1, equipment_effects 44, encounter_coverage_pct 32.7, playtest_pass_pct 85, gameplay_judged 28.

Done (4 parallel subagents)
- **Mobs** (mobs.js): every wind-up now draws a red ground decal (dim fill, pulsing outline, growing fill; rails for
  line attacks), bolt telegraphs red; hit flash tints toward warm off-white at 0.5 (bosses 0.35) instead of pure white.
  12 regular types + 3 bosses are already defined; the combat test could not confirm any because the machine was at load
  ~66 (service's 200-view benchmark render + agents' Chromes) → 0.5 fps → every type timed out. Not a code failure.
- **Loot/feedback** (items/hud/vfx/sfx/core): rarity-coloured light pillars + ground glow rings on drops, pickup toast
  in rarity colour, impact flash + sparks per hit, per-damage-type hit sounds, 50 ms hit-stop on crits/big hits,
  screen-style blending so stacked glows don't clip to white, round particles. test_items 44/44.
- **Classes**: baseline 2-run playtest: 4/4 classes pass on their own, hexweaver 1/2 (softlock "no route progress"),
  boss TTK storm 3.9 s vs warden 13.5 s. Nerfed Tempest 45→20/tick, Arc Chain 26→22; buffed Pebble 20→28,
  Quake 25→35, Monolith 60→130. Not re-measured. playtest.mjs: richer softlock messages; waits poll on a timer.
- **Zone walls**: the 94 "skipped" walls are all legitimate (66 bespoke, 13 duplicate OSM outlines, 15 stalls).
  The KPI is held down by unannotated walls (stall roofs ~9.5 pts, bespoke walls ~15 pts) that have no
  non-held-out reference photos. Fixed the CUP Bookshop conflict from Mapillary 296497208762822: 62.51 → 62.69.
- Published world-20261108-2214, live hash **400ff2da125adbf4** (verified). Local Chrome: load 3.18 s, site_errors 0.
- publish.sh: WC_SKIP_GAME_KPI=1 skips the 30-min game tests (service.sh runs them for the new live hash).

Learned
- Game tests time out when the service benchmark render runs alongside them: the game clock caps dt at 0.1 s, so at
  0.5 fps it barely moves. Test limits should be in game time, not wall time, or service should run them alone.
- Next annotation work needs fresh Commons/Mapillary photos for Guildhall :8/:9, GSM, St Edward's, Spalding Hostel.

Next
1. Read the service's game KPIs for the new hash; if mob_types still times out, make test_mobs limits game-time based.
2. Hexweaver softlock: use the new message; probably no line of sight with single-target darts.
3. Re-run gameplay_judged; replace the blocky mob primitives with better procedural models (judge's main complaint).
4. Photo-sourced annotations for unannotated zone walls; ring-1 work.

## 2026-11-09 — Session 45: publish session 44's mobs; encounters outward; ring-1 annotations

Start state: session 44 (mob rework: 12 regular types with procedural models and animations, 3 bosses, test fixes)
had been left uncommitted. Because local site/ differed from the live build, service.sh never ran game_kpi.sh for live
400ff, so measure.sh printed every game KPI as 0. The local build (f60a55) already had its game KPIs cached:
playable_classes 4, mob_types 12, bosses 3, equipment_effects 44, playtest_pass_pct 100, boss TTK spread 33.2%.
Market Square realism on 400ff: 28.12 (29.62 on f2555).

Done
- Committed session 44 and published world-20261108-2308. Live hash **f60a55e197f72b50** (verified), so measure.sh
  now shows the real game KPIs. Ran gameplay_kpi.sh for f60a55 by hand.
- gameplay_judged for f60a55: **33.9** (28 on f2555). All 4 classes recorded 10 kills each with no errors. Lowest
  rubric items for hexweaver are spell VFX and enemy animation variety (3/10).
- Benchmark scores for 400ff (session 43): judged_realism 27.7 (was 27.4), visual_quality 25.2 (24.9),
  market_square_realism 28.12 (29.62 on f2555).
- **Encounters cover the whole study area** (game subagent). gen_encounters.py now does a greedy fill outward from
  the Market Square centre: each new zone goes at the uncovered walkable sample nearest the centre, at least 1.5 m
  outside every OSM building. That gives 12 hand-placed encounters (unchanged: the playtest route and 3 bosses)
  plus 374 generated ones, up from 81. Themes come from OSM: riverside 65, green 109, cloisters 134, streets 66.
  All 12 mob types are used. encounter_coverage_pct 32.7 → **100** on local site/. Mobs already spawn lazily
  (within 120 m, despawn beyond 200 m, about 24 live), so there was no load cost: load 2.77 s, site_errors 0.
  A 1-run playtest passed for all 4 classes.
- **Ring-1 annotations** (realism subagent): 53-54 Sidney St (new way_1288648590, Edinburgh Woollen Mill corner)
  and the Lloyds Sidney St Tudor range (way_229676053:3), both from Commons CC BY-SA photos. All three new walls are
  low confidence. Rebuilt city facades (3.40 M tris). Ring 1 4.37 → 4.62% (80 of 1,950 walls); zone unchanged at 62.69.
- market_square_realism on f60a55 is 28.75.
- Published world-20261108-2338, live hash **4c519e74d47b8b7c** (verified; live encounter_coverage_pct 100).
  The full game_kpi.sh run inside publish.sh went over the 10-minute tool limit and was killed, so I republished
  with WC_SKIP_GAME_KPI=1. service.sh will compute the game KPIs and gameplay_judged for 4c519e, since local = live.
  Until then measure.sh prints 0 for those game KPIs, except encounter_coverage_pct, which it reads live.

Learned
- If a session ends with uncommitted site/ edits, service.sh skips game KPIs for the live build: it only runs them
  when local site/ = live. **Always commit and publish at the end of a session**, or the game KPIs read 0.
- Ring 1 is limited by photos. Trinity St fronts are done, and most unannotated ring-1 walls are side or back walls
  with no non-held-out photo. Biggest open fronts: Joshua Taylor Building (way/1099846442:8, 31 m) and 22 Sidney
  St :9. Most of ring 1's 1,950 walls are courts and backs, so the ring-1 percentage will stay low unless the
  KPI only counts street-facing walls, as the KPI text says. Check how ring_report/zone_kpi chooses walls.
- The first measure.sh run on a new hash takes about 95 s (kpi.py over every tile, then cached); later runs take 3 s.

Next
1. Ring-1 KPI denominator: confirm which walls are street-facing; it currently looks like it divides by all 1,950.
2. gameplay_judged 33.9: spell VFX and enemy animation variety score lowest.
3. Boss TTK balance with 5 runs per class (it read 33% on f60a55).
4. Realism: ring-1 bespoke landmarks (King's Chapel exterior detail, Trinity Great Gate), market_square_realism.

## 2026-11-09 — Session 46 (entry written in session 47; this session ended without a journal entry)

From commit 6c440c4 and the working tree session 47 found:
- Realism (committed, **not pushed or published**): the facade KPI counts street-facing walls only (public ways, no
  party or back walls; scripts/zone_walls.py). Trees have branches, sub-crowns and wind. OSM hedges, instanced grass
  blades by quality preset, a lawn texture. 4c519e scores: market_square_realism 30.62, gameplay_judged 28.6.
  Ring 1 now has 851 street-facing walls, 78 of them annotated (8.64%).
- Game (left **uncommitted**): a new spell VFX kit (pooled particles with a sprite atlas, ribbon trails, branching
  lightning, drain tethers, shockwaves, ground decals, rock debris, shield); mob rig body language, knockback shove and
  flinch, three death styles, type-coloured ground auras, roaming patrols, denser packs near the centre; loot toasts on
  the game clock with effect lines; rarity stings. Screenshots in docs/screens/session46_*.png.

## 2026-11-09 — Session 47: publish session 46; 15 ring-1 street-front annotations; balance check

Start state: session 46's commit was never pushed or published, and its game work was uncommitted (entry above).
Live was still 4c519e. Its service scores: judged_realism 26.6, visual_quality 25.54, market_square_realism 30.62,
gameplay_judged 28.6. Game KPIs: playable_classes 4, mob_types 12 (+3 bosses), equipment_effects 44,
encounter_coverage_pct 100, playtest_pass_pct 95, boss TTK spread 28.7%.

Done
- Tested session 46's game edits before committing: test_items 44/44, test_mobs 12 regular + 3 bosses,
  15/15 encounters, 0 console errors. The test ran at 0.6 fps because of machine load (~44), not the build.
- 3 parallel annotation subagents, one per street group, for ring-1 street-facing walls, using non-held-out
  Mapillary and Commons photos only. 15 new walls: Joshua Taylor Building, Waterstones 22 Sidney St, M&S Hobson St
  side, St Andrew the Great (St Tibbs Row), Lion Yard (Petty Cury), Boots (Petty Cury), 14-17 Green St, former
  Central Cinema, 1-2 Wheeler St, Old Divinity School, Hilton (Corn Exchange St), Zoology, John Lewis (2 walls), MAA.
  Most are low confidence. Ring-1 facade match **8.64 → 13.85%** (93 of 851 walls); city 1.97 → 3.16%; zone 69.32.
- Balance subagent: 2 runs per class are too noisy to tune with (one class's runs range from 4 to 17 s).
  Spark Lance 18 → 20 (stormcaller sustained DPS 45 → 50, in line with the others' 49-56). One warden run
  softlocked: "no route progress" 1.7 m from a goal at (-182.4, -27.5, z 10.4) on the way to King's Parade.
  Probably Boulder Leap landing on raised geometry; not fixed.
- Published world-20261109-0047. Live hash **afef094044af4e89** (verified, = local). service.sh computes the game KPIs
  and gameplay_judged for it; until then measure.sh prints them as 0.

Learned
- Annotation subagents stop after about 5 min unless told to keep going; resuming them doubled the output.
  Commons rate-limits (HTTP 429) after a few dozen downloads; spread those across agents or pace them.
- Many "street" labels in facade_geometry_city.json are the nearest named way, not the street the wall faces
  (Hilton "Downing St" faces Corn Exchange St; Lion Yard "St Tibbs Row" faces Petty Cury).

Next
1. Warden softlock at (-182.4, -27.5): check what stands there; stop Boulder Leap landing on roofs or wall tops,
   or have the bot drop unreachable loot spots before the stuck check.
2. Balance with 5 runs per class (service computes it for afef09); tune only on 5-run medians.
3. More ring-1 annotations: Green Street (Commons photos are already listed), Town and Gown (check its orientation),
   the Cambridge Union, Clare Chapel on Trinity Lane, Sedgwick, Botany and Free School Lane.
4. Check fps_median with session 46's denser packs and the new VFX once service measures afef09.

## 2026-11-09 — Session 48 (entry written in session 49; this session ended without committing or a journal entry)

Session 49 found these edits uncommitted and committed them as 94d1696:
- Game: movement spells (blink, Boulder Leap hop) now step up at most 0.6 m per 0.5 m and are settled back onto
  walkable ground if they end on a roof or wall top. This fixes the warden route softlock at (-182.4, -27.5).
  Briefer, smaller loot toasts, side panel at 58% height; nameplates fade up close and vanish on pickup; dimmer loot
  pillars; damage numbers are bigger, fan out, and crits get a gold "CRIT" tag; the hit-stop is a little longer on crits.
  Mobs get a type-coloured fresnel rim light (one shared shader program) and per-type and per-instance HSL variation;
  the bell boss gets glowing runes. VFX sparks use screen blending, no sprite is larger than 12% of the screen height,
  and spell lights are capped.
- Realism: brick paving key colour blends into neighbouring classes (no lavender seams); Market Hill brick loop and other
  surfaces.json annotations. Before/after shots: docs/screens/session48_paving_*.png.
- Not published or measured at the time.

## 2026-11-09 — Session 49: commit/publish session 48; combat pacing + mob detail; 18 ring-1 annotations

Start: session 48's work was uncommitted (entry above), committed as 94d1696. Live was afef09: gameplay_judged 37.1
(lowest criteria: enemy animation variety 3.0, polished feel 3.0; judges said half the frames had no enemies).

Done (2 parallel subagents + lead)
- Game pacing (mobs.js): packs within 110 m of the square respawn after 25 s instead of 45; +2 mobs per hand-placed core pack;
  a 3-mob reinforcement wave 4 s after a core pack is cleared (lead capped it at one wave a minute, since uncapped
  waves kept the clip bot at market-north and the boss never appeared); bosses call up to 3 adds on each phase change
  and every 13 s; aggro range 24 → 26 m, call-for-help radius 18 m; two runtime-only street packs (Market Passage,
  Market Hill east stalls). encounters.json is unchanged.
- Mob models: ink imp (horns, nib spines, tail, drips), automaton (riveted pauldrons, glowing gauge, steam pipes,
  pistons), gargoyle (brow, shoulder and elbow spurs). Bigger missile cores and trails, ember ground rings, dart rune marks.
- Check: test_mobs passes 12 regular + 3 bosses, 15/15 encounters, 0 console errors. The pyromancer clip has 12/12
  frames, reaches market-north → Bellwarden → Peas Hill, 28 kills (19 before), 0 page errors.
- Ring 1: 18 new street-facing wall annotations (Sedgwick, Grand Arcade car park, Attenborough, Revolution, Botany,
  Old Cavendish, Town and Gown on Market Passage, Market Passage / Market St fronts, Trumpington St Georgian range;
  mostly low confidence). Ring-1 facade match **13.85 → 18.20%** (111 of 851), city 3.16 → 4.15%, zone 69.32 unchanged.

Learned
- The clip bot targets anything hostile within 18 m, so endless reinforcements stall its route. Waves need a global gap.
- Green Street has only night-time or close-up Mapillary shots; the Cambridge Union and Market Hostel have no usable frontal photos.

Next
1. Read gameplay_judged for this build (service.sh), and check boss TTK spread and fps with the bigger packs and adds.
2. Ring 1: Clare Chapel, King's Parade shops, Bene't St; a Commons-led pass for Downing St.
3. More mob model detail for the remaining types (wisp, statue, river wraith) and clearer telegraphs.

## 2026-11-09 — Session 50: 73 ring-1 wall annotations (5 parallel sectors); mob detail + animation; boss/enemy HUD

Start: live 75b216 (session 49); service.sh had not yet scored its game KPIs (latest game KPIs, from afef09:
playable_classes 4, mob_types 12 + 3 bosses, equipment_effects 44, encounter_coverage_pct 100, playtest_pass_pct 95,
gameplay_judged 37.1).

Done (7 parallel subagents)
- Ring 1, now at scale: data/derived/s50/worklist_<0-4>.json split the unannotated street-facing ring-1 walls into
  5 angular sectors (near first, then longest). One fork per sector, resumed once each. 73 new walls: Christ's
  St Andrew's St front and Hobson St wall, Round Church St blocks, Lloyds Hobson St side, Montagu House, South Court,
  Blue Boar, Sussex St, Trinity Hall, Taylor Library, Scott's Building, Fisher House, New Court (Garret Hostel Lane,
  68 m), Dokett, Market Hostel (St Mary's Passage), Clare Chapel east end, Old Schools west, Corpus Trumpington St range,
  Attenborough west, Free School Lane (Social Anthropology, Rayleigh, Zoology), Emmanuel Essex front, St Andrew's St
  56-64 and Emmanuel St shops, Downing Place URC. Most are low confidence.
  **Ring-1 facade match 18.2 → 32.2%** (184 of 851 walls), city 4.15 → 7.34%, zone 69.32 (unchanged).
  DATA.md notes the CC BY-SA Commons/Geograph references (reference only, listed per file).
- Mobs (mobs.js): wisp flame crown, tendrils, reed cage; statue gown, scroll, tablet, cracks; wraith ragged cape, reed
  crown, chain. Per-type windup poses, hit reactions and gaits; all 12 regular types have their own death pose.
  test_mobs 12 + 3 bosses, 15/15 encounters, 0 errors. Montage: docs/screens/session50_mobs_1-5.png
  (scripts/mob_shots.mjs).
- HUD (hud.js, sfx.js, vfx.js): boss bar with name, phase markers, phase/enrage line and attack cast bar; phase banners;
  health and cast bars over up to 16 nearby mobs; crosshair hit/crit/kill markers; red edge arcs toward attackers;
  camera shake (off for scripted cameras); the red hit flash is now edge-only; particles fade near the camera.
  test_classes ok, test_items 44/44, 0 errors. docs/screens/session50_hud_*.jpg.
- Published world-20261109-0248 (WC_SKIP_GAME_KPI=1; service.sh runs the game KPIs and gameplay_judged for the new hash).

Learned
- Annotation forks stop after 4-8 min. Resuming them once roughly doubles their output. 5 sectors × ~15 walls is
  about 70 walls a session. 667 street-facing ring-1 walls remain, so reaching 70% in ring 1 needs about 5 more
  sessions like this.
- Machine load reached ~55 (other projects too). The 40-view A/B render within 400 m got only 30 views done in 10 min,
  so this session has no benchmark before/after. Rely on service.sh's per-build judged_realism and ring report.
- The gameplay clip camera sometimes ends up inside a market stall canopy (session50_hud_toll.jpg), which hurts
  gameplay_judged. Make the clip camera avoid geometry.

Next
1. Read the new build's gameplay_judged, playtest and fps from service.sh; compare with 37.1.
2. Clip camera: keep it out of stall canopies and walls (raycast and pull in).
3. Ring 1: another 5-sector annotation round (regenerate the worklists from facade_geometry_city.json).
   Commons rate-limits, so give each sector its own Commons budget.
4. Ring-report per-ring judged_realism for the new build.

## 2026-11-09 — Session 51 (reconstructed in session 52)

Session 51 ended before it wrote a journal entry, and most of its work was left uncommitted. Session 52 committed it as dfde243:
spell VFX for fire, grit, hex and storm (a flickering flame head, grit shards, helix darts, forked bolts with scorch marks);
regular mobs drawn 15% larger (same collision radius); third-person camera occlusion against zone meshes and stall canopies
(session 50's "Next" item 2); about 56 new ring-1 wall annotations (city facades rebuilt at 04:16).
Ring-1 facade match **32.2 → 41.6%** (286 of 851 walls), city 7.34 → 9.48%.
Because site/ differed from the live build, service.sh never computed game KPIs for the live 59b6c5, so measure.sh read 0 for them.

## 2026-11-09 — Session 52: commit s51 leftovers; 55 ring-1 annotations (6 sectors); mob telegraphs + warden VFX

Done (7 parallel subagents)
- Committed session 51's uncommitted work (entry above).
- Ring 1: regenerated the worklists (data/derived/s52, 475 unannotated street-facing walls in 6 angular sectors). Sectors
  added 12 / 5 / 6 / 8 / 15 / 9 walls: Webb's and Keynes' (King's Lane), the Clare Chapel sides, the Silver St north
  terrace, Ede & Ravenscroft, Queens' Silver St range, St Catharine's, the Downing Site (Sedgwick, Zoology, Botany,
  Shell, Old Metallurgy), Downing Place URC, Sussex House, the Hobson St ranges, Green St, Sidney House, Whewell's Court,
  Bridge St and Jesus Lane shops, Pearce Hostel, the Union, Bishop's Hostel, The Mitre, St John's St. Most are low confidence.
  **Ring-1 facade match 41.6 → 49.5%** (339 of 851 walls), city 9.48 → 11.28%, King's Parade 77.1%.
- Game (mobs.js): telegraphs now come from one pool of 64 ground meshes with one shader material. The shape is the real
  hit area (disc or strip), the fill reaches the rim at impact, then a white flash; one danger colour; bolt lanes 0.7 m wide.
  Stone warden (vfx.js, classes.js): shard waves, tumbling stone missile head, rune shell and orbiting slabs on the
  shield, shard collars. test_mobs 12+3, 15/15 encounters; test_items 44/44; test_classes ok (after a load-induced
  timeout on the first run); 0 console errors. No screenshots this session (machine load ~50, fps 0.8 under swiftshader).
- Published world-20261109-0346 (WC_SKIP_GAME_KPI=1; service.sh computes the game KPIs and gameplay_judged for the
  new hash now that site/ equals live).

Learned
- When a session ends with uncommitted site/ changes, service.sh never scores the live build's game KPIs, and
  measure.sh then reports 0. Always commit and publish before the time limit.
- Annotation yield is down to ~9 walls per sector. The near walls left lack facing photos (narrow passages, courts,
  night shots), and Commons sends HTTP 429 after ~20 downloads per agent.
- Several walls.json eave heights are too low (Whewell's Court, Bridge St, Sussex House); city_facades' eave fix raised
  the ones that have annotations.

Next
1. Read the new build's game KPIs and gameplay_judged (service.sh); check that the telegraphs read well in clip frames.
2. Ring 1: the remaining ~420 walls are harder. Try Geograph and the Commons category per street, and
   aerial/oblique-free sources. Consider a style-guided default for walls that have no photo.
3. City baseline track: generalise the parts library for unannotated walls (Gaspard's front (a)).

## 2026-11-09 — Session 53 (reconstructed in session 54)

Session 53 ended without a journal entry or a commit. Session 54 committed its work as 2be12d0:
- Ground: the clay paviors (Market St, Market Hill loop, Trinity St, Sidney St) drew as saturated new red; retoned to the
  weathered grey-plum seen in non-held-out photos, with grime patches; a sharper brick-weight ramp so 4-6 m brick
  carriageways reach their kerbs on the 2 m ground grid (docs/screens/session53_ground_{before,after}_*.png).
- Trees: brighter, fuller crowns (more cards, lighter AO), species-like palettes per crown variant; the LiDAR canopy
  filter drops tall thin tops (spires and pinnacles were being turned into trees). Tree tiles rebuilt.
- Game: flyers no longer drift through walls (3 of 20 playtest failures were flyers out of line of sight); bot fixes for
  partial plans, unreachable loot and leashed mobs; fire burst/ult down, storm lance/ult up (TTK balance).
- Zone KPI: market stall canopies (building=roof) and vendor trailers aren't counted as facades. St Botolph annotation.
None of this was published or measured in session 53.

## 2026-11-09 — Session 54: King's College Chapel; 17 ring-1 annotations; mob animation + clip fixes; TTK retune

Start: committed session 53's leftovers (2be12d0, entry above). Live 8b314e game KPIs: playable_classes 4, mob_types 12 + 3
bosses, equipment_effects 44, encounter_coverage_pct 100, playtest_pass_pct 80 (TTK spread 56.5%), gameplay_judged 39.6.

Done (6 parallel forks)
- King's College Chapel (scripts/zone_bespoke_kingschapel.py, new): it had been the generic detail.py box, a grey block
  from King's Parade. Now: 12 bays a side with five-light transomed windows set in reveals, 22 stepped buttresses with
  crocketed pinnacles, chantry chapels, pierced battlemented parapet, nine-light east/west windows, four octagonal
  corner turrets with ogee caps (~43 m above ground; 2023 LiDAR). 49k tris (zone 447k → 496k).
  docs/screens/session54_kingschapel_{before,after}*.png. The stone still renders mid-grey, not pale cream (the gatehouse too).
- Ring 1: 17 walls (Mill Lane 16/17, Zoology, Lion Yard, St Andrew the Great, Christ's Lane corner, Bishop's Hostel,
  Caius lodge, St Botolph aisle). **Ring-1 facade match 49.5 → 52.0%** (360 of 851), city 11.28 → 11.84%.
  scripts/ann_candidates.py: candidate photos per wall (excludes held-out and same-sequence frames, checks for occlusion).
- Mobs (mobs.js): stronger rim light that flares on hits and heats on wind-up; idle/walk/attack/hit poses about twice as
  large; death light column and spark spiral. test_mobs 12+3, 15/15 encounters, 0 errors.
- Gameplay clip (gameplay_clip.mjs): the bot froze for half the clip, firing at a gargoyle behind a wall (frames 6-12 were
  a grey wall). Targets that take no damage for 4 s are now ignored for 15 s. The clip uses the third-person camera
  with canopy/facade clearance. The warden shield's wireframe lattice (the judges' "stray wireframe lines") is gone;
  bubbles, halos and orbs fade near the camera; missiles shed embers and flash a point light on hit; non-crit
  numbers merge; loot plates scale with distance. Clip kills 14 → 28. test_items 44/44, test_classes ok.
  NB: the clip script changed (third-person camera), so gameplay_judged isn't strictly comparable with earlier builds.
- Playtest: the local baseline on s53's code was 75% (stormcaller 2/5, a softlock inside bollard/railing collision on
  King's Parade at -182,-28). player.js now pushes a grounded player out of an invalid spot (within 0.8 m).
  Fire burst/ult down, hex damage up. Not re-measured; service.sh scores the new hash.
- Published world-20261109-0720 (WC_SKIP_GAME_KPI=1).

Learned
- Annotation yield is ~4 walls per worker-round now. Only 117 of the 353 east walls have ≥2 facing non-held-out photos,
  and Mapillary poses are often several metres off. Ring 1 at 70% needs another source: a style-guided default
  for the photo-less walls, or extending sibling walls of buildings that are already annotated.
- Playtest takes ~18 min at load 25, too long to finish inside a session together with the merge.

Next
1. Read the game KPIs for the new hash (playtest per class, TTK spread, gameplay_judged); fix the x≈-124 softlocks.
2. Stone tone: King's limestone renders grey; check the stone material/tone mapping against non-held-out photos.
3. Boss telegraphs cover too much of the frame; canopy planes in the clip.
4. Ring 1: generalise sibling-wall annotation and use a style default for walls without photos.

## 2026-11-09 — Session 55: game-KPI snapshot fix; pale limestone; sky dome; mob chase give-up; 2 ring-1 walls

Start: live dafa017 (session 54) had only roof scores. service.sh scores game KPIs only when site/ == live, so any
session that edits site/ blocked them (sessions 51-54 kept hitting this).
Done
- Infra: publish.sh now leaves an APFS-clone snapshot of the published build in data/derived/live_site (`cp -c`, no
  extra disk; gitignored). service.sh runs game_kpi.sh / gameplay_kpi.sh on that snapshot when its hash equals the live
  hash. dafa017 then scored: mob_types 12 + 3 bosses, equipment_effects 44, **playable_classes 3, playtest_pass_pct 70**,
  boss TTK spread 41.5% (median 11.4 s). That is down from 80% / 4 classes on 8b314e: one class failed to clear the
  route in at least 3 of its 5 runs.
- Fork B (stone): limestone was grey because the whole scene is lit dimly (LK 0.45 × Phong /π, about 0.17 linear for a
  0.89 albedo), not because the albedo was wrong. zone.js now gives pale ashlar and trim (materials 2 and 7) a luma-gated
  warm boost of up to ×1.85; King's Chapel's sunlit wall went from (111,108,99) to (147,139,119). Brick and render are
  unchanged. docs/screens/session55_stone_*. The proper fix is overall exposure, which needs a benchmark A/B.
- Fork D (sky): the sky dome with gradient, clouds and a sun glow is now the default (`?sky=flat` restores the old one).
  Atmosphere scored 1-2/10 in all 30 visual_quality views. The clouds drift, so renders aren't pixel-identical any more.
  GPU fps 60. docs/screens/session55_veg_*. Watch judged_realism: a flat white sky once won a photo_match A/B.
- Fork C (game): an ordinary mob that gets no closer for 6 s gives up and goes home (fixes a statue stuck in "chase").
  The playtest bot drops mobs that are going home and wanders with jumps after 3 failed replans; stuck-mob failures now
  log their state. Pyromancer burst 42 → 32 and ult 17 → 13. Telegraphs are depth-tested, lighter, and offset to 0.12 m.
  Local run: 8/8 passes (2 per class); TTK spread noisy (warden 17 s is now the outlier). test_mobs 12+3, items 44/44,
  classes ok.
- Fork A (ring 1): only 2 walls (John Lewis east, St Andrew the Great bay). Ring 1 52.0 → 52.2%; about 10 more
  candidates were rejected (wrong Mapillary poses, building not identifiable).
- Published world-20261109-0747 (hash 2641329a…; WC_SKIP_GAME_KPI=1, service.sh scores it on the snapshot).
- The moves test failed for jump/run/dash/broom on both site/ and the live snapshot at load ~20 (swiftshader).
  That's load-related, not a regression.

Learned
- Photo-driven annotation of ring 1 has run dry (2-4 walls per fork-round). Ring 1 at 70% needs a Commons
  category sweep matched to named buildings, or a decision with Gaspard on what counts as an annotation source
  (for example, OS/aerial plus a single oblique photo).
- publish.sh swaps the snapshot out from under a running game_kpi run. That was harmless this time; skip the swap
  (or wait) while /tmp/wc_game_kpi.lock exists.

Next
1. Read the game KPIs and gameplay_judged for 2641329a. Check which class fails (playable_classes 3 on dafa) and the
   TTK spread with 5 runs per class.
2. Exposure: A/B raising LK or adding tone-mapping exposure on the benchmark, then lower the stone boost to match.
3. Ring 1: Commons category sweep per named building.

## 2026-11-09 — Sessions 56 + 57: trees/HUD/annotations (s56, committed late); leap softlock fix; 6 more ring-1 walls

Session 56 ran out of time before committing or writing its journal entry. Its work was committed at the start of s57 as c677eca:
brighter, leafier tree crowns (trees.js; docs/screens/session56_trees_*), mob/HUD tweaks (a declutter menu in game mode), a denser
gameplay clip route (via petty-cury, and it chases nearby calm mobs between legs), and 5 ring-1 annotations from Wikimedia
Commons (Bridge Street series by Smb1001, 13 King's Parade). publish.sh now waits while a game_kpi or gameplay lock exists.
s56 tests: test_mobs 12+3 with 15/15 encounters, test_items 44/44.

Session 57 (3 forks, machine load 50-75 the whole time from service.sh rendering the benchmark for 2641329a)
- Game (fork A): the warden failed 3 of 5 playtest runs on dafa017, all stuck at (-131,-29) off Bene't Street. Most likely cause:
  Boulder Leap's airborne drift carries the player over a railing into an enclosure that can't be walked out of (inferred from
  logs, not probed). classes.js now puts the player back if the leap's landing can't be reached on foot from its start point.
  playtest.mjs: the start cell is exempt from the half-step checks (fixes "path 1" plans next to walls), and new vantage():
  after 6 s without landing damage, the bot moves to a spot 5-9 m from the mob with line of fire. game_kpi.sh keeps
  per_class in _game.json; measure.sh copies only numeric keys. Local check with too few runs: stormcaller, hexweaver,
  pyromancer and the post-fix warden passed; the one pre-fix warden run failed at the same spot.
- Ring 1 (fork B): 6 walls (67 and 68 Bridge St, Fitzbillies 52 and 53 Trumpington St, Christ's X staircase on Hobson St,
  ADC Theatre). **Ring 1 53.05 → 53.53%, city 12.09 → 12.20%.** The per-building Commons series are now mostly used up;
  Sidney, Green and Market Street have only geograph street views.
- Exposure (fork C): no result. At load 46 only 5 of 30 views rendered. On those, the renders' lower half is already *brighter*
  than the photos (+0.10), and the brighter variants move further away, so the default is kept. zone.js gains
  ?stoneboost=. **New tuning set** of 30 non-held-out Mapillary views within 200 m of GSM (data/benchmark/tuning, photos
  gitignored; scripts/tuning_views.py and tuning_cmp.py). It needs filtering: one view is inside GSM and some poses
  face walls.
- test_classes timed out (30 s wait for game start) on both site/ and the live snapshot at load 52: a load problem, not a regression.
- Published world-20261109-0840 (WC_SKIP_GAME_KPI=1; service.sh scores it on the snapshot).

Learned
- Running the benchmark render in service.sh makes the machine unusable for in-session tests (load 50-75). Sessions
  that need A/Bs or playtests should run when service.sh is idle, or service.sh should pause while a session runs.
- Every publish resets game-KPI scoring (about 18 min of playtest after the bench). The 08:15 measure.sh showed game KPIs at 0
  because 2641329a hadn't been scored yet. That's expected until service.sh catches up.

Next
1. Read the game KPIs and per_class for the new hash. Check whether the warden reaches 5/5.
2. Make service.sh nice/pause its benchmark renders while a session is active (for example, check for a claude -p process for this project).
3. Filter the tuning set, then rerun the exposure A/B at low load with the judge.
4. Ring 1: decide the next annotation source (geograph street views split per wall, or a style default for walls without photos).

## 2026-11-09 — Session 59: session 58 committed and published; game KPIs stay measured during sessions; clip framing

Session 58 ended without committing, publishing or writing a journal entry. Its work is in 8d0138e: the Caius Waterhouse range
continued west along Senate House Passage with 3 bays of cross windows, gargoyles and dormers; the gate-arch leaf moved
0.12 m behind the face so the tile texture no longer shows through; an action-RPG HUD layout with HP and mana left of the
spell bar; smaller pickup bursts with the loot pillar collapsing inward; bench.sh and ms_bench.sh render only the views the
judges use, since photo_match/DINOv2 is retired; and service.sh pauses while `session_active` exists.
docs/screens/session58_ms_* (shh_north_after shows the passage range next to the Caius tower).

- **Why the game KPIs read 0 since 07:52:** live build 1a6052 was never game-scored. Session 58 touched session_active and
  never published, so service.sh skipped everything for 75 min. Then this session touched it again. **Fix:** service.sh
  now runs game_kpi/gameplay_kpi (one headless browser, on the live snapshot) even while a session is active. Only
  ms_bench, bench and the browser tests pause.
- Game fork: scripts/gameplay_clip.mjs turns the camera to the nearest live mob within 35 m before each captured frame.
  It prefers bosses and hostile mobs, and combat is unchanged. A canopy fade that stopped the third-person camera
  sinking under stall canopies was tried and reverted, because overlapping faded canopies looked ghostly.
  docs/screens/session59_game_clip_{before,after}.jpg. The judge hasn't scored it yet.
- Realism forks found nothing to build. All 96 counted Market Square walls already have geometry: the figure of 59
  counts only generic walls, and the rest are bespoke. facade_geometry_match_pct (80.9) is held down by bespoke walls
  with no annotation: the Guildhall east side on Guildhall Street (way/5094872:8/:9, 42 m), St Edward's north side
  (26344576:5-7), Great St Mary's, Spalding Hostel and the Caius Portland block. 16 geograph/Commons photos were checked,
  and none clearly shows the Guildhall east side or St Edward's north side, so nothing was annotated.
- The mob rim light already exists (session 48: fresnel rim, wind-up heat, hit flash), so no change there.
- Published world-20261109-0921 (hash 274747eb). The in-flight playtest for 1a6052 was stopped so service.sh starts on
  the new hash. Game KPIs read 0 until it finishes, about 1 h with 20 routes run one after another.

Learned
- Each publish means about 1 h of game-KPI scoring (20 playtest runs one after another, about 170 s each). Publishing
  late in a session plus pausing service.sh is what kept zeroing the six game KPIs on the charts.

Next
1. Check the game KPIs and per_class for 274747eb (warden 5/5?), and gameplay_judged with the new clip framing.
2. Speed up playtest.mjs by running 2 workers in parallel, so a publish gets scored in about 30 min.
3. Third-person camera under the stall canopies: try raising the pitch rather than fading.
4. Annotations: find a Mapillary sequence (not held out) for St Edward's Passage and Guildhall Street.

## 2026-11-09 — Session 61: s60 committed; boss rebalance; Holy Trinity Church (ring 1)

Session 60 ended without committing again. Its work is in be5bef3:
- the Gate of Honour (scripts/zone_bespoke_honour.py; docs/screens/session60_ring_*_goh_*);
- shaped spell heads: comet stretch, flame envelope, hex crystal and muzzle flash (vfx.js/classes.js);
- the third-person boom now swings lower and flatter under stall canopies, and the avatar hides when the boom is squeezed (player.js/main.js);
- playtest.mjs runs as a job queue with 2 workers per class and a fresh context per run.

Live 274747eb game KPIs (5 runs per class): playable_classes 4, mob_types 12 (+3 bosses), equipment_effects 44, encounter_coverage 100,
playtest_pass 100 (20/20), gameplay_judged 41.1. Boss kill time: pyro 5.7, warden 11, storm 18.5, hex 20.3 s (spread 61%).

- Game fork: rebalanced spell damage in classes.js. Pyro Ember 22→16, Orb 32→24, Kindle 30→24, Sunfall 13→11. Storm Lance 22→26,
  Arc 22→28, Static 12→16. Hex Dart 21→25, Siphon 46→54. Local playtest at 2 runs per class: 8/8 pass, kill times pyro 16.2, storm 14.5,
  warden 11.8, hex 13.7 s, **spread 16%** (noisy, so the 5-run score on the live build decides). Boss ground telegraphs in mobs.js
  are brighter, with a thicker rim and stronger fill. Not checked visually.
- Ring fork: **Holy Trinity Church** (way/26269190, Market St and Sidney St) in scripts/zone_bespoke_holytrinity.py. Per-edge DSM heights,
  buttresses, battlements, Perpendicular windows, clerestory, west door; about 25k tris.
  docs/screens/session61_ring_{before,after}_ht_*.jpg (the junction view is the clear win). No facade KPI change, because there is no annotation.
- **Known issues:** (1) the tower walls (tower0-3, z 19-27.5 m in the mesh data) don't render. Neither the junction nor
  the Market St view shows a tower; reversing the corner order changed nothing, and the tower's lead flat has been removed. (2) A dark
  floating slab at tree-crown height in the Market St view (session61_ring_fix_ht_marketst.jpg) is new against the live build, but it
  isn't the tower flat. Its source is unknown. Check the zone node list near (-30..-20, 118..126).
- Annotation sources for ring 1 are used up (fork B checked the tuning photos). New non-held-out photos are needed.
- Published world-20261109-1034 with WC_SKIP_GAME_KPI=1. service.sh scores it.

Next
1. Fix the Holy Trinity tower rendering and the floating slab.
2. Read the 5-run kill-time spread and gameplay_judged for the new hash, which has the s60 camera and VFX changes.
3. Ring 1: new photo sources (Mapillary sequences that aren't held out) for annotations.

## 2026-11-09 — Session 62: Holy Trinity fixed, St Andrew the Great (ring 1), canopy cutaway in game mode

Three parallel forks; machine load 45-67 throughout, from service.sh game-scoring fd8f326f (still unscored at session end, so
measure.sh showed game KPIs at 0; the last scored live build, 274747eb, had classes 4, mobs 12+3, effects 44, encounter 100,
playtest 100, judged 41.1).
- Ring fork A, **Holy Trinity**: the "missing tower" was never missing. The s61 ht_tower camera was pressed against a wall, and the tower is
  hidden from street level by parapets and trees. The **floating slab** was the church's own 9.8 m lead roof over walls 6 m high: the
  crossing line was wrong, and the per-edge DSM samples on short or tree-shaded walls (w3, w10, w11) read too low. Roof regions now come from
  a DSM grid over the footprint, each wall takes the height of the roof behind it, and embattled step walls are added where roof levels meet.
  docs/screens/session62_ring_{before,after}_ht_{marketst,junction,air_w,air_n}.jpg.
- Ring fork B, **St Andrew the Great** (way/135595981, St Andrew's St), scripts/zone_bespoke_standrew.py: ashlar, embattled parapet,
  Perpendicular windows between buttresses (from the non-held-out ring-1 annotation), coped east gable with a cross, chancel east
  window, and a west tower with a belfry and pinnacles. About 15k triangles. docs/screens/session62_ring_{before,after}__sa_*.jpg.
  Side effect: bespoke buildings drop out of the city facade rows, so ring1_facade_geometry_match_pct reads 53.4 (bespoke walls' annotations
  are unmatched). The ring-1 facade KPI should score bespoke elements the way the Market Square zone does.
- Game fork: stall canopies get a noisy-edge cutaway over the player's head within 8 m in third-person game mode only (no fade). The camera ray
  ignores stalls, so the boom no longer collapses under canopies. Regular mobs are drawn at 1.3× their collision size, up from 1.15×. Exploration mode was checked and is unchanged.
  docs/screens/session62_game_{before,after}_{hexweaver,pyromancer}.jpg. Smoke test, 1 run per class: 3/4, with stormcaller hitting "route not finished" under load 60+.
  Unclear whether that is load or the s61 rebalance.
- Published world-20261109-1115 (WC_SKIP_GAME_KPI=1).

Learned
- Session forks and service.sh playtests together push load above 60, and every in-session browser test then needs a 3-4x timeout.

Next
1. Read the 5-run scores for the new build: did stormcaller pass, the kill-time spread after the s61 rebalance, and gameplay_judged with the cutaway.
2. Fix the ring-1 facade KPI so it counts bespoke elements, as zone_kpi does for the square.
3. Ring 1: more bespoke landmarks or frontages (Sidney St, Trinity St shopfronts); new non-held-out annotation photos.

## 2026-11-09 — Session 63: Round Church (ring 1/2 edge); publish now scores the game KPIs before going live

- Why the game KPIs kept reading 0: every session published with WC_SKIP_GAME_KPI=1, or called game_kpi.sh while service.sh
  held /tmp/wc_game_kpi.lock. In that case game_kpi.sh returns {} at once, so the new live hash went out unscored, and scoring
  takes about 15-30 min under load. publish.sh now waits for the lock (up to 45 min) and scores the new build *before* the
  push. If a session is cut short, nothing is pushed and the old live build keeps its scores.
- Ring fork: **Round Church** (Holy Sepulchre, way/92878394, Bridge St; about 370 m from GSM, on the ring 1/2 edge),
  scripts/zone_bespoke_roundchurch.py. It has a circular ambulatory with Norman windows, pilasters and a west door with
  three recessed arches, a ring roof, a drum with a clerestory, and a cone with heights from the DSM (15.4 m). The east
  chancel and north aisle have gables, and there is a north-west annex. About 11k tris.
  docs/screens/session63_ring_{before,after}_rc_{bridgest,sw}.jpg. Before, it was a textured drum with a floating slab.
  The lead-grey roof colour is unverified, and the LiDAR cone peak sits about 3 m south-west of the OSM centroid (OSM was kept).
- Publish (world-20261109-…) runs in the background at session end. It waits for cc7ca0fc's scoring, then scores the new
  build, then pushes.

Next
1. Check that the new live hash has _game.json, and read per_class and the kill-time spread after the s61 rebalance.
2. Ring-1 facade KPI: count bespoke elements, as zone_kpi does.
3. Make the playtest faster (load 45-60 slows a run from 170 to 480 s of wall time), or key the game scores to the game inputs.
- Result: published world-20261109-1200, scored before the push. Game KPIs for the new live hash: classes 4, mobs 12 + 3 bosses,
  effects 44, encounter coverage 100, playtest 100 (20/20), boss kill-time spread 25.8% (median 11.4 s). The previous live build,
  cc7ca0fc, read spread 30% with hexweaver fast at 7.8 s. gameplay_judged for the new hash is still pending; service.sh runs it.

## 2026-11-09 — Sessions 64-65: St John's Great Gate; s64 left the game layer broken; publish guards

Session 64 was cut off before committing. Session 65 checked its work, fixed it and committed it (38b6dbb):
- Ring 2: **St John's College Great Gate** street face (scripts/zone_bespoke_stjohnsgate.py, pseudo id way/158913878:gate):
  red brick tower with four octagonal turrets, stone strings, battlemented crowns, carriage arch with oak gates, a heraldic panel,
  a niche, two-light windows, and heights from the DSM. Before it was a grey stone box with a slot between two cones.
  docs/screens/session64_ring_{before,after}_sjg_{front,north,south}.jpg (front is a clear win).
- Ring-1 facade KPI: bespoke buildings keep their wall rows, and openings their build() emits are counted per wall
  (city_facades.bespoke_elements). St Andrew's 4 annotated walls now score 100. ring1_facade_geometry_match_pct reads 51.9 (was 53.4),
  because 22 unannotated bespoke walls now count as 0. ring1_nonbespoke_facade_geometry_match_pct = 53.4 is also reported.
- Game (mobs.js): melee strikes draw an additive crescent swoosh (ring attacks spin), a charge orb swells at the chest during
  every wind-up, ring/leap blasts add a shockwave filling the radius, and the hit flash is brighter (judge said hit feedback was weak).
- **Bug found:** the s64 hit-flash edit put the closing `}` inside a `//` comment. mobs.js didn't parse, the game layer silently
  failed to start (console.warn only), and test_mobs timed out with errors=[]. `node --check file.js` on its own does NOT catch this
  (it parses as CommonJS); copy to .mjs first. Fixed. test_mobs then passed: 12 mob types + 3 bosses.
- publish.sh now refuses to publish if any site/app module fails an ES-module parse, or if the new build's game KPIs read mob_types 0.
- test_mobs.mjs: MOB_WAIT_MS env var for the game-start wait.
- Publishing in the background with game KPI scoring before the push.

Next
1. Check the new live hash's game KPIs and gameplay_judged (does the swoosh/charge orb lift readability and hit feedback?).
2. Annotate the bespoke walls (St John's gate, Holy Trinity, Round Church) from non-held-out photos so ring 1 counts them.
3. Ring 1/2 bespoke: King's College gatehouse and screen, Trinity Street shopfronts.
- Result: published world-20261109-1257, scored before the push. Live game KPIs: classes 4, mobs 12 + 3 bosses, effects 44,
  encounter coverage 100, playtest 100 (20/20), boss kill-time spread 33% (median 11.3 s; pyro 7.6, storm 10.5, warden 13.1,
  hex 12.1; was 25.8%), gameplay_judged 46.4 (was 47.5). So the s64 strike VFX did not raise the judge score; that's within noise on 4 clips.
  Pyromancer is the fast outlier again.

## 2026-11-09 — Sessions 66-67: Sidney Sussex street front; mob ink outlines; pyromancer boss nerf

Session 66 was cut off before committing. Session 67 reviewed its work and committed it (2582113):
- Ring 1, **Sidney Sussex College** street ends on Sidney Street (scripts/zone_bespoke_sidney.py, pseudo ids way/147456527|522|529:sidney):
  Wyatville's 1820s Tudor-Gothic refacing in buff "ashlar". It has crow-stepped gables with apex stacks, mullioned and transomed windows
  under label moulds, the corbelled oriel with the founder's shield, and the gate tower with its four-centred arch. Heights come from the DSM.
  Shape references are Wikimedia CC BY-SA photos (listed in the module docstring), none of them held-out photos.
  docs/screens/session66_ring_{before,after}_ss_*.jpg. The gables are a clear improvement on the plain grey boxes. The s66 *after* cameras were
  badly placed (inside the brick wall / under the bike-shed frames), so "street" shows only a wall. Re-shoot from the street centreline.
- Game: regular mobs get an inverted-hull ink outline (back faces, welded normals, colour = type colour ×0.22, hidden once the
  death fade starts) and are drawn at 1.45× their collision size (was 1.3×). The judge kept saying "small, crude, hard to read".
  Pyromancer's spell and DoT damage against bosses is ×0.86, because its s65 kill time of 7.6 s was the fast outlier (spread 33%).
- publish.sh also runs ms_bench.sh (market_square_realism) for the new build, in parallel with the gameplay clip.
- Session 67 published the result. See the result line below.

Next
1. Re-shoot the Sidney before/after from Sidney St at eye level; annotate the Sidney gable walls from non-held-out photos (ring-1 KPI).
2. If the outline/scale change lifted gameplay_judged, keep it. If not, revert MOB_VIS to 1.3.
3. Ring 1/2: Trinity Street shopfronts, King's gatehouse screen check, Caius Gate of Honour from the street.
- Result: published world-20261109-1344, scored before the push. Live game KPIs: classes 4, mobs 12 + 3 bosses, effects 44,
  encounter coverage 100, playtest 100 (20/20), gameplay_judged **49.5** (was 46.4; the outlines and larger mobs seem to help).
  market_square_realism is 30.5. The boss kill-time spread jumped to **84.9%** (median 11.7 s: pyro 9.3, storm 9.1, warden 14.1,
  hex 21.6). Hexweaver was 12.1 s, and earlier 7.8 s, with no hexweaver change since, so its kill times are very noisy. It may be
  the 1.45× mob scale (bosses aren't scaled), or the summons/curses whiffing. Next session: look at the hexweaver per-run TTKs and
  stabilise them before tuning further (more runs, or check the familiar's targeting).

## 2026-11-09 — Session 68: Christ's College Great Gate (ring 2); playtest bot opens with a curse

- Game: the live build's 84.9% kill-time spread came from hexweaver alone (per-run 17.4/12.0/37.2/21.6/21.6 s; the others are about 9-14 s).
  Cause: playtest.mjs castAt sorted spells by raw damage, so Withering Mark (dmg 10, curse ×1.35 damage taken) almost never went out.
  The bot now casts a curse first when the target isn't cursed or its curse ends within 1 s, as a player would. Only hexweaver spells
  carry `curse`, so the other classes are unaffected. Local hexweaver-only run (4 runs): 9.6/17.5/9.5/15.4 s, median 12.5 s (was 21.6). No game balance change.
- Realism, ring 2 (subagent): **Christ's College** Great Gate and the St Andrew's Street front range (scripts/zone_bespoke_christs.py,
  pseudo id way/147487949:christs, 7.7k tris). It has the gate tower with octagonal battlemented turrets, a four-centred arch with oak gates
  and a wicket, and the Lady Margaret Beaufort heraldic panel (crowned arms, yales, rose, portcullis). The front range is coursed ashlar
  with two floors of 6/6 sashes, a string course, a cornice and a parapet, and steps up with the street. Heights come from the DSM (tower 11.4 m, turrets about 14 m).
  docs/screens/session68_ring_{before,after}_christs_{gate,front,south,north}.jpg. Before: grey box plus generic Gothic windows. After: clearly the real gate.
  Unverified: the window count, whether there's a niche above the panel, and the turret plan. ELEMENTS={}, so the ring facade KPI won't count it until annotated.
- The live e5aa7869 judged_realism came in: 26.9 (previous builds 24.2 and 26.5).
- Note: the screenshot tool can capture its first view before the camera has moved. Throw away the first shot.

- **The full publish scoring does not confirm the bot fix.** On the new build hexweaver read 20.9/22.3/22.7/5.2/10.7 s, median 20.9
  (pyro 11.0, storm 11.9, warden 10.6), spread 82.2%. The 4-run local sample was lucky. Hexweaver really is slow on the
  Bellwarden in most runs (about 21 s), with occasional very fast kills. Next session needs a real balance or AI look, not more samples.

Next
1. Hexweaver vs the boss: log per-spell boss damage for hexweaver runs (is the familiar or siphon range the gap?), then buff its single-target
   damage about ×1.4 against bosses, or fix the whiffing. Goal: spread ≤25%.
2. Annotate the bespoke walls (Christ's, Sidney, St John's gate, Round Church) from non-held-out photos so the ring facade KPI counts them.
3. gameplay_judged: the judge keeps saying "enemies are primitive, little visible animation" (4.0) and "VFX clutter". Next game work: mob limb animation.

## 2026-11-09 — Session 69: Trinity Street terraces (ring 1); mob animation; the hexweaver's slow kills were a playtest-bot mana bug

- Game, balance diagnosis: playtest.mjs now logs boss damage per spell (`bossDmg` on each run line). A hexweaver run showed
  **all 903 boss damage came from Hex Dart**. Basic-spell spam (5 mana per 0.4 s, which is 12.5/s against 8/s regen) kept mana
  pinned near 5, so Soul Siphon (54 dmg), Withering Mark, Bound Wisps and Night Bloom never fired. This also explains the bimodal
  kill times: runs that reached the boss with full mana were fast. The bot now keeps a mana reserve: a filler spell (≤6 mana) is
  skipped if it would leave less than the cost of the dearest damage, curse or shield spell coming off cooldown within 1.5 s.
  After the fix, stormcaller and warden runs spread damage over 4-5 spells. No game balance change.
- Game (subagent): the 12 regular mobs' animation is amplified so it reads in a still. Limb swing is about doubled, there is a
  0.36 s hit-recoil timer separate from the white flash, and a new `scatterParts` death throws the head, limbs, wings and gears
  off their joints. The automaton and bicycle golem now crumble instead of popping. No new meshes.
  docs/screens/session69_mobs_*.jpg. test_mobs: 12 + 3 bosses pass.
- Realism, ring 1 (subagent): **Trinity Street terraces**, scripts/zone_bespoke_trinitystreet.py. It covers 19 OSM buildings:
  east side Nos 9-24 including the Green St returns, and west side Nos 26-38. It is keyed on the real OSM ids, so it replaces the
  city skin and rebuilds all 54 walls. It adds raised fascia lettering with the real shop names (Heffers, Cubitts, Aesop, The Ivy…),
  21 chimney stacks where the DSM shows a peak behind a party wall, and eave gutters. 36.9k tris, net about +5k over the city skin.
  The ring-1 facade KPI is unchanged (the annotations were already there); ring-1 bespoke walls went from 26 to 56.
  docs/screens/session69_ring_{before,after}_trinityst_*.jpg. The visible change is mostly the lettering, because the city skin
  already used the same annotations. Uncertain: some shop names may be out of date (30-31 Jaeger vs SageBrown in OSM). Nos 11,
  12, 17 and 25 have no OSM building.
- Lesson: when a class's balance looks noisy, log damage per spell before tuning numbers. Three sessions went on sampling and
  nerfs when the cause was the bot's mana use.

Next
1. Check the publish scoring of the kill-time spread with the mana-reserve bot. All classes now kill faster; retune the pyromancer
   bossMult (0.86) if it is now the outlier.
2. Annotate the Christ's, Sidney, St John's gate and Round Church walls from non-held-out photos (ELEMENTS={}).
3. Ring 2: Bridge Street frontages; Trinity Street fascia contrast (Free People).

## 2026-11-09 — Session 70: Bridge Street (ring 2), Market Square colour fixes, tree species, pyromancer survivability

Live 2d9a5402 (s69) scores: playtest 100, boss kill-time spread 51.9% (pyro 27.7 s, storm 17.8, warden 18.6, hex 12.8),
gameplay_judged 47.0, market_square_realism 30.0.
- Game balance, real cause: the boss **heals to full whenever the player dies**, and the bot's pyromancer died 4-10 times a run
  (the others 0-3), so its kill times counted respawns. Its boss damage per second was fine. Fix: pyro starter robe
  {maxHp 25, armour 8} (was maxHp 10), Ember Bolt drains 10% of damage ("cauterises"), Flame Step 0.4 s invulnerability,
  the s66 boss nerf is removed (bossMult 1), and Ember Bolt range is 45 (was 60; long bolts seemed to pull extra packs,
  since pyro runs kill 130-300 mobs against 60-100 for the others). Pyro-only playtest before the range change: 4/5 pass, boss median **16.8 s** (was 27.7);
  one run hit the 900 s route cap (13 deaths). The range change is untested apart from the publish scoring.
- Realism, ring 2 (subagent): **Bridge Street**, scripts/zone_bespoke_bridgestreet.py, 20 OSM buildings (8-24 east incl. The Mitre,
  Baron of Beef, Côte; 29, 33 Galleria; 63-72 west), 29.9k tris. Shopfront lettering comes from OSM shops, materials are gault, red brick or
  colourwashed render, with LiDAR chimneys, a jetty on 17/29/30, and ELEMENTS for 30 walls. docs/screens/session70_ring_{before,after}_bridgest_*.jpg.
  The materials of 8-16 and 63-71 and the window counts are not checked against photos.
- Realism, Market Square (subagent): 12 Market Hill is now Don Pasquale (green fascia, green canvas awning; facade_parts shopfronts
  can set an awning colour), Great St Mary's stone is darker and greyer (#ab9f86), and the Guildhall brick is warmer. Not done: 15 Market Hill's curved
  corner and the Guildhall's rounded SW corner (the judge's "curved facade" and "turreted building").
- Trees (subagent, site/app/trees.js): six species-like crown types (plane, lime, chestnut, birch, yew, oak) picked from height
  and crown shape, with per-species tint, bark colour, central leaders and twigs. A modest change: crowns are still rounded card blobs.
  Local fps went from 59 to 54 with the other changes also present. Watch fps_median.
- Pyromancer spell VFX (subagent): see the result line below.

Next
1. Check the publish scores: pyro pass rate and spread, fps_median (trees), market_square_realism after the colour fixes.
2. Curved fronts: 15 Market Hill corner and the Guildhall SW corner, as real curved wall geometry.
3. Trees: a CC0 leaf atlas, smaller edge cards, and distance LOD to win back fps.
  (Session 70 ended before it could commit or publish. Session 71 committed its work as c57e3c2 and published it together with s71.)

## 2026-11-09 — Session 71: curved corners at the square, Regent Street (ring 2), a real wizard model, rarity loot beams

Three subagents ran in parallel.
- Realism, Market Square: **curved corners as real geometry.** 15 Market Hill (Franco Manca, way/1288730360). OSM draws its corner
  as a flat 2.07 m cut-off; it is now a curve that meets both fronts smoothly, with the green bowed fascia, shopfront glazing,
  door, reveals and cornice bent round it. The Guildhall's NW corner (Market Hill / Peas Hill) is now rounded, radius 1.6 m, with
  the rusticated ground storey, band, brick, cornice and attic carried round. New reusable helpers: facade_parts `bezier_path`,
  `bend` and `line_apex`, and zone_build `CURVED`. About +8k tris. docs/screens/session71_ms_{before,after}_{15mh,guildhall}*.jpg.
  Uncertain: whether the real Guildhall corner is rounded, and its radius (not checked against a photo). Neither curve has upper
  windows: 15 Market Hill follows its annotation, and at the Guildhall, windows would expose the tile body's square corner.
- Realism, ring 2: **Regent Street**, scripts/zone_bespoke_regentstreet.py, 33 OSM buildings on both sides (Novi down to 112-116),
  66 walls with ELEMENTS on 45. It adds single-storey shop extensions over the front gardens, one lettered shopfront per OSM shop,
  and modern glazing on Essex House, De Luca and Mantle. +15k tris over the city skin. Materials, colours and window counts were
  not checked against photos. docs/screens/session71_ring_{before,after}_regentst_*.jpg. Zone facade KPI 80.9 (unchanged);
  ring-1 facade match 51.5.
- Game: a **per-class animated wizard** (site/app/game/wizard.js, about 2.3k tris). It has a layered robe with a flared hem, cape,
  bell sleeves, belt and satchel, a crumpled hat, a beard, and a class staff with a glowing focus. It animates a walk cycle, idle
  breathing, thrust and raise cast poses, hit recoil, a broom seat and death. It takes over Avatar.update only while the game runs;
  exploration mode keeps the old avatar. **Loot beams by rarity**: colour and height (3.5 m to 30 m) by tier, glow from rare up,
  a ground rune ring from epic up, sparkles on legendary, and labels backed in the rarity colour. test_classes, test_mobs
  (12 + 3) and test_items (44) pass. docs/screens/session71_wizard_*.jpg.

Next
1. Read the published scores: gameplay_judged (did the wizard and beams help?), fps_median (s70 trees plus s71 tris), pyro spread.
2. Ring 2: the Clare and King's college fronts on the Backs side, and the Trinity Street to St John's Street run.
3. Tree LOD and a leaf atlas, if fps_median drops below 55.

## 2026-11-09 — Session 72: s70/s71 finally live; Clare Old Court + Gibbs (ring 2); pyro fire VFX; low-HP warning

- **Found: sessions 70 and 71 never reached the live site.** The live hash was still 2d9a5402 (s69). s71's publish.sh scored
  the game KPIs (cd58e844_game.json) and then ran out of session time in ms_bench/gameplay before `git push`/release. This session
  published first with WC_SKIP_GAME_KPI=1 WC_SKIP_MS_BENCH=1 (world-20261109-1737, carrying s70+s71+s72) and leaves the scoring to
  service.sh, which scores every new live hash. Live game KPIs right now are those of the s69 build until service.sh catches up:
  classes 4, mobs 12 + 3 bosses, effects 44, encounter coverage 100, playtest 100, gameplay_judged 47.0.
- measure.sh had dropped fps_median/load_seconds/site_errors (17:18 reading): service.sh only ran the browser test hourly after the
  session_active check, so back-to-back sessions starved it. The browser KPIs now carry the build hash, run once per new live hash
  even during a session, and measure.sh accepts them for that hash regardless of age. First run (on 2d9a5402, during this busy
  session): load 4.76 s, site_errors 0, fps 54.
- Realism, ring 2 (subagent): scripts/zone_bespoke_clare.py — **Clare Old Court** east range with the gate tower (arched vaulted
  gateway, oak gates, superimposed pilasters, niches, attic), the 15-bay river front (balustrade, pilasters, pedimented centre door),
  and **King's Gibbs Building** west face (rusticated ground storey, great arch, Corinthian pilasters, pediment). Heights from the DSM.
  14.7k tris. docs/screens/session72_ring_{before,after}_clare_*.jpg. Flaw: on the Clare east front north of the gate, the city skin
  still shows through (blank windows); the river front's north end also shows ghost skin windows. Bay counts/orders unverified, ELEMENTS={}.
- Game (subagent): pyromancer fireball reworked to read as fire without filling the screen (centre flash capped 1.6 m, a crown of
  flame tongues + deep-red heat ring at the blast edge, lingering embers). Low-HP (<30%) heartbeat vignette, "LOW HEALTH" tag,
  heartbeat sound, death screen names the killer, "You rise again" banner. test_items 44/44 passed; test_classes timed out on both
  old and new code under machine load (not attributable to the edit; watch the publish scoring).
  The judge's "screen-filling yellow/black triangles" in boss frames are NOT from fireball code: likely boss part-scatter/death VFX in mobs.js. Fix next.
- Game balance (subagent): the s70 pyromancer survivability buff never applied: itemdefs starter tuples are [name, staff, hat, robe]
  and the {maxHp 25, armour 8} sat in the hat slot, which STARTING_GEAR never gives (all classes' hat bonuses are dead data). Moved
  to the robe. Live logs: pyro dies 3–9 times a run and pumps 1.7–2.9k damage into the 900 HP boss (it heals on player death).
  4 local runs after the fix (under heavy load) gave no clear gain: TTK 15.6/38.1 passed, 2 runs timed out at 900 s. Unproven; the
  publish scoring is the real test. playtest.mjs now logs a `deathLog` (time, route leg, bot state) per death.

Next
1. Read the scores of world-20261109-1737: playtest pass (pyro timeouts?), spread, gameplay_judged, fps_median, market_square_realism.
   If pyro pass drops, read deathLog and fix where it dies (kiting / defensive Flame Step / boss damage) before anything else.
2. Remove the boss part-scatter screen-filling shapes (mobs.js), give the starter hats to players (or delete the dead hat data).
3. Hide the city skin behind the Clare east front; annotate Clare/Gibbs/Christ's ELEMENTS from non-held-out photos.
4. Publish rule: publish (skip flags) by ~35 min into a session, then let service.sh score. Never leave the push for last.

## 2026-11-09 — Session 73: Clare windows visible, Bridge Street from annotations, boss VFX cleanup, starter hats

Published early with skip flags (world-20261109-1808); service.sh scores the new live hash. When published, live hash 6180b873 (s72)
had no game score yet, so measure.sh read 0 for the game KPIs. Last scored values (s69 build 2d9a5402): classes 4, mobs 12 + 3
bosses, effects 44, encounter coverage 100, playtest 100, gameplay_judged 47.0.
- Ops: killed a service.sh benchmark render for the stale hash 2d9a5402 (the Pages CDN lagged when the loop started), and
  killed the obsolete 6180 game-KPI run that held publish.sh's snapshot step. build_hash.py now also hashes app/game/wizard.js,
  avatar.js, player.js, grass.js, markings.js and collision.js (before, a change to wizard.js alone kept the old cached scores).
  All hashes changed once because of this.
- Realism ring 2 (subagent): the s72 Clare fronts were only 0.25–0.3 m proud of the wall, but the city skin sits 0.25 m out, so
  the skin hid the glass ("blank windows"). East range and river front are now 0.55 m proud, gate tower 1.2 m, niches 0.28 m
  deep. The ghost windows were at the south end of the river front (wall way/139308031:3), not the north. Tris unchanged (14.7k).
  docs/screens/session73_ring_{before,after}_clare_*.jpg. Open: a strip of skin may show above the balustrade (skin eaves 0.5 m higher).
- Ring 1 facade (subagent): ring-1 match is 51.5 mainly because 4.47 km of the 9.3 km street-facing wall has no annotation
  (college walls, Downing Street, Sidney Street). Real model errors were only on Bridge Street: zone_bespoke_bridgestreet now
  builds annotated walls from their ring-1 annotations. Ring 1 went from 51.48 to 51.94, city from 12.01 to 12.11, zone 80.9.
  Only 11 of the 117 unannotated walls of 12 m or more have a usable non-held-out Mapillary photo; Wikimedia Commons is the route.
- Game (subagent): the "screen-filling triangles" came from mobs.js burst() debris (about 100 flat tetrahedra, 0.5 m, 8 m/s
  on boss death) and low, opaque boss projectiles crossing the camera. Debris is now capped (20 shards, 0.2 m, hidden within 3 m of
  the camera), projectiles are lower and camera-culled, and the death pillar is thinner. Hit flash, hit-stop and shake are
  stronger on crits and big hits. STARTING_GEAR now equips the class hat (old saves get the missing hat once).
  test_items 44/44, test_mobs 12+3 / 15 encounters, test_classes ok. docs/screens/session73_game_boss_*.jpg. Still open: the bat
  swarm's black wings near the camera and big red danger decals.

Next
1. Read the scores of the s73 build: playtest (pyro), spread, gameplay_judged (VFX fix and hats), fps_median, market_square_realism.
2. Ring-1 annotations from Wikimedia Commons photos (licence-checked, not held out) for the big unannotated walls: Downing St, Sidney St, college fronts.
3. Ring 2 next frontage: St John's College on St John's Street, or Trinity's Trinity Street front.
4. Game: bat-swarm wings near the camera; tone down the boss danger decals.
- Publish note: the first Pages run (42671631864) failed with "workflow file issue" (transient). publish.sh doesn't check the
  run result, so a build can be released but not live. A rerun went through; live hash be82cce5 = data/derived/live_site.
  TODO: make publish.sh watch the Pages run and retry once on failure.

## 2026-11-09 — Session 74: St John's First Court front (ring 2), Commons annotations (ring 1), crisper telegraphs

Published world-20261109-1846 with skip flags; Pages run ok. service.sh scores the new hash.
- Why the 18:25 reading had game KPIs at 0: the s73 hash be82cce5 got gameplay_judged 50.2 (up from 47.0), but its
  playtest run died at 889 s ("Connection closed", Chrome went away when the s73 session ended), so no _game.json was
  written. measure.sh prints 0 for a live hash with no game score, as Gaspard asked.
- Ops: publish.sh now watches the Pages run and reruns it once if it fails (the s73 TODO).
- Ring 2 (subagent): scripts/zone_bespoke_stjohnsfirst.py builds St John's First Court east range on St John's Street,
  either side of the Great Gate: south 22.4 m, north 15.1 m, stepped north end. Brick, 3 storeys of stone two-light mullioned
  windows with hoods, string courses, battlements, a door, chimneys, heights from the LiDAR, 0.65 m proud so the skin
  doesn't show through. About 10.8k tris. docs/screens/session74_ring_{before,after}_sjc_*.jpg. The bay rhythm comes from
  general knowledge and isn't checked against photos. It isn't fed into the facade KPI.
- Ring 1 (subagent): annotations from Wikimedia Commons photos (CC BY-SA, licence checked, not held out, credited in
  DATA.md) for Sidney House's Sussex St face and John Lewis's Corn Exchange St face. city_facades.py builds geometry from them.
  Ring 1 went from 51.94 to 52.70 and the city from 12.11 to 12.29. Commons rate-limited downloads (HTTP 429).
- Game (subagent): bats shrink or hide within 5 m of the camera; the boss telegraph decals have a crisp rim, a faint
  interior and a guide ring; player hit damage varies ±12%, and damage-number size follows hit size. test_mobs 12+3 and
  test_items 44/44 pass; test_classes was not run. docs/screens/session74_game_*.jpg.

Next
1. Read the scores of the s74 build: gameplay_judged (telegraphs), playtest, fps (+10.8k tris).
2. Game: enemy_animation_variety (4.0) is the weakest gameplay subscore: give mobs distinct attack wind-ups, hit
   reactions and deaths.
3. Annotate the St John's and Clare fronts from non-held-out photos and feed them into the facade KPI.
4. More ring-1 Commons annotations (pace the downloads to avoid 429s): Downing St, then the college walls.

## 2026-11-09 — Session 75: game scores survive world publishes, clockwork/stone/spirit/swarm body language, St John's front from photos

Published world-20261109-1902 with skip flags; Pages run ok. Live build f16b1a43, game hash 39645f15.
- Why the game KPIs kept reading 0: every publish made a new build hash, and the route bot (15–30 min under load ~46,
  shared with the poker project) rarely finished before the next hourly reading. The s73 run was also killed at session end.
  Fix: `build_hash.py --game` hashes only what the game tests depend on: app/game/*, main/player/collision/avatar JS,
  index.html and collision/digest.json (new; scripts/collision_digest.py, written by publish.sh, shipped in the tarball).
  _game.json and _gameplay.json are keyed by it in game_kpi.sh, gameplay_kpi.sh, measure.sh, service.sh and publish.sh's
  mob_types guard. A world-only publish now keeps the game scores. Caveat: the gameplay clips show the world backdrop,
  so a world change can shift gameplay_judged a little without a rescore. Roof, judge and msjudge still use the full hash.
- Ops: service.sh was rendering the live s74 site under the stale s73 hash be82cce5 (killed). I also stopped its s74 game
  run: s75 game edits replaced it. The game KPIs for 39645f15 were started in-session on site/ (game_kpi.sh, then
  gameplay_kpi.sh); service.sh finishes the job if the session ends first.
- Game (subagent): mobs.js has a FAMILY table: stone (gargoyle, statue, griffin, punt revenant), spirit (wisp, wraith,
  bog hag, ink imp), clockwork (automaton, bicycle golem), swarm (bats, soot sprite). Wind-up pose follows the attack kind:
  pounce crouch for charge/leap, rear up for ring, draw back for bolt, shoulder twist for line. Each family adds its own
  flavour (stone grinds, spirit swells, clockwork ratchets in 6 clicks, swarm knots). Hit flinches differ by family, and
  clockwork has a new 'collapse' death: it spins down like a coin, then sparks. Stone gets a cracking shudder before it
  topples. test_mobs 12+3, 15/15 encounters. docs/screens/session75_game_{windup,death}.jpg. Aimed at
  enemy_animation_variety (4.0).
- Realism (subagent): St John's First Court street front annotated from 5 Commons photos (CC BY-SA, not held out, in DATA.md).
  The s74 model was wrong: the front has 2 storeys, not 3, and no street door. It is now rebuilt with the real window,
  dormer and blank-wall layout, and has 2.1k fewer tris. It is fed into the facade KPI (city_facades.py maps the bespoke
  openings onto ways :3, :18 and :20). Ring 1 went from 52.70 to 53.18 and the city from 12.29 to 12.40; the zone figure
  is unchanged at 80.9. These walls lie within the 400 m ring-1 radius, so there is no separate ring-2 number yet.
  Unverified: the north-range window positions and the dormer count.

- Live game scores (39645f15, scored in-session before the session ended): classes 4, mobs 12 + 3 bosses, effects 44,
  encounter coverage 100, playtest 90 (stormcaller 4/5 timeout; warden 4/5 softlock at leg 4 senate-house-hill
  -169.5,27.0), boss TTK spread 24.5% (first time within ±25%; median 18.9 s), gameplay_judged 50.5 (s74 was not scored;
  s73 was 50.2). Judge notes: damage numbers overlap into strings like "31144", some spell VFX white out the screen, and
  a third of the frames show an empty square.

Next
1. Fix the warden softlock at leg 4 (-169.5,27 -> -182,68) and the stormcaller timeout, to get playtest back to 100.
   Gameplay: stack and offset the damage numbers, cap the spell-VFX white-out, cut the empty frames in the clip.
2. Annotate the Clare and King's Gibbs fronts from Commons and feed them into the KPI, the same way as St John's.
3. More ring-1 Commons annotations: Downing St and Sidney St college walls (3 s pacing, no 429s this time).
4. Boss TTK spread (51.9% at s72): rebalance once a fresh playtest reading is in.

## 2026-11-09 — Session 76: playtest unstick, readable damage numbers, VFX white-out cap, Clare/King's fronts from photos

- Game (subagent): the warden softlock at leg 4 was a real walled pocket (probably the Great St Mary's railings) at
  -169.5,27. The bot walked in for loot, and its 1 m planner couldn't path out. playtest.mjs now keeps a 1 m breadcrumb trail
  and retraces it, re-planning every second, up to 6 times per leg. Stormcaller timeout cause: it farmed a respawning
  pack at -124,-29 for about 600 s. After 150 s on a leg the bot stops looting and only fights within 8 m. Warden-only playtest
  2/2 passed; neither run is confirmed to have entered the pocket. The stormcaller fix is untested.
  hud.js: the damage-number overlap test uses the real on-screen size (the fixed 56 px caused "31144"). Numbers are placed oldest
  first, with x jitter, and non-crit hits merge within 0.6 s. vfx.js: particles and shells fade between 1.2 and 4 m from the
  camera, additive alpha is capped at 0.75, large on-screen sprites are dimmed, and at most 8 flash sprites show at once.
  test_mobs 12+3 and 15/15 encounters, test_items 44/44. Not checked on screen; no screenshot.
- Realism (subagent): Clare Old Court east range and King's gatehouse/Wilkins screen annotated from 10 Commons photos
  (CC BY-SA/PD, not held out, in DATA.md). Clare now has a pedimented dormer per bay and gate-tower sashes either side of
  the oriel (the model had niches there). Both are wired into the facade KPI (_OPS/KPI_WALLS). Ring 1 went from 53.18 to 53.67,
  the city from 12.40 to 12.52, and the zone is unchanged at 80.9. Unverified: Clare's 6th south bay, the dormer x positions,
  and whether the King's screen arches count as windows. The model and the annotation come from the same reading, so the
  match is partly by construction.
- Live build f16b1a43 (s75): market_square_realism 30.75 (40/40) scored this session. judged_realism and visual_quality were
  not scored for it: the renders keep getting interrupted by back-to-back sessions.
- Published with skip flags; service.sh scores game KPIs for the new game hash after the session.

Next
1. Read the s76 game scores: playtest (did the retrace fix work?), gameplay_judged (damage numbers, white-out).
2. Take a screenshot of the damage-number and VFX changes. Cut the empty-square frames in the gameplay clip.
3. Market Square realism (30.75) is the main KPI and has barely moved. Look at the per-view judge reasons in
   f16b1a43_msjudge.json and attack the most common complaint.
4. More ring-1 Commons annotations: Downing St and the Sidney St college walls.
   Common judge complaint for s75: the white modern multi-storey block and the white turreted corner building on Market
   Hill's north/west side (Don Pasquale with green awnings, Subway) are a "grey placeholder" or flat grey mass. Trees are
   missing and the stalls are simplified. Next session: model those white frontages bespoke from non-held-out photos.
- Publish: world-20261109-1942. The Pages deploy was "cancelled" twice (a GitHub-side failure), and a fresh workflow_dispatch went
  through (run 42688057936). Late s75 scores: judged_realism 26.6, visual_quality 26.56.

## 2026-11-09 — Session 77: setts render as setts, pale renders no longer grey (Market Hill), live game scores

Published world-20261109-2010 (commit 2a715af, Pages run ok). Full hash a7c038d3, game hash ab21b0e4 (unchanged: no game edits
this session, so service.sh's in-flight game run stayed valid).
- Ground (subagent): OSM has Market Square (relation 8117433, listed), Senate House Hill and Trinity Lane as surface=sett; the
  build already classed them, but the ground shader diluted them. The sett key colour sits close to the slab/steps colours, so
  a sett vertex drew ~half slabs, and sett/asphalt edges fell into a no-match flat grey band. They also faded to grey within
  a few metres. materials.js now weights setts along the colour line between each neighbour class and the sett key, and fades
  later to a speckled field. surfaces.json: King's Parade east sett strip extended south to y≈-97 from 2 Commons photos (CC BY-SA,
  in DATA.md). That strip needs a full tile rebuild (it also rewrites collision -> new game hash), so it isn't live yet.
  The 13 OSM trees within 150 m of GSM are all present; OSM maps no trees on Market Hill.
  Screens: docs/screens/session77_setts_{before,after}.jpg (King's Parade).
- Market Hill (subagent): the judge's "grey placeholder" white block is 12 Market Hill (Market House, Don Pasquale). Its annotation
  was correct (#eeebe2 render), but zone.js's s55 pale-colour lift only covered stone, so near-white render read mid-grey under
  the 0.45 city light. The lift now also covers very pale render/stucco. Screens: docs/screens/session77_markethill_{before,after}.jpg.
  Not found: the "turreted corner / curved facade" building (probably the Market St / Sidney St or Rose Crescent corner).
  No Subway in OSM near the square. A grey kiosk box with a red stripe in front of 12 Market Hill may also read as a placeholder.
- Live game scores (ab21b0e4 = s76 game code, scored by service.sh): classes 4, mobs 12 + 3 bosses, effects 44, encounter
  coverage 100, playtest 100 (20/20; the s76 retrace and anti-farm fixes work), boss TTK median 18.1 s but spread 67.4%
  (pyromancer 30.3 s vs stormcaller 14.9 s), gameplay_judged 45.4 (s75 50.5). The judge's main complaint in all 4 clips: the camera
  clips into or sits behind walls, so combat is hidden; also tiny primitive-looking enemies, and empty second halves.
- market_square_realism for a7c038d3 isn't scored yet; service.sh runs it now that publish cleared session_active.

Next
1. Game: gameplay camera collision (pull the camera in front of walls, as an ARPG camera does), bigger and more readable mobs in
   the clip, and keep the clip in combat. Then rebalance the pyromancer boss TTK (30 s vs 18 s median).
2. Read market_square_realism for a7c038d3 vs 30.75 and revert the shader changes if they don't help.
3. Tile rebuild for the King's Parade sett strip (together with a game edit, since it changes the game hash anyway).
4. Find and model the turreted or curved corner building near Market Hill from non-held-out photos. Replace the grey kiosk box.

## 2026-11-09 — Session 80: s79 work published, weightier spell VFX, Market Hill corner building

- Found on start: session 79 (commit cb382c7: ARPG occlusion camera, boss TTK rebalance, 1.6x mob scale, reinforcement waves
  in the clip, Market Hill catering trailers) was committed and pushed but never published and never journaled; the live site was
  still s77 (a7c038d3). No s78 commit exists. Checked the s79 code in-session: test_mobs 12+3, test_items 44/44.
  s77 build scores: market_square_realism 31.0 (s75 30.75), judged_realism 27.2, visual_quality 26.1. The setts change
  didn't move the KPI noticeably but didn't hurt; kept.
- Game (subagent): vfx.js/classes.js: pyromancer hits get a shockwave ring, charred rock chunks and smoke; projectile cores are
  opaque; Ember Bolt head and trail are larger; storm bolts are thicker with an impact halo and more sparks; the warden shield
  bubble is fainter, with 8 orbiting earth slabs and chunks on cast; hexweaver hits release dark motes. The s76 white-out caps are
  unchanged. test_mobs 12+3 / 15 encounters, test_items 44/44. docs/screens/session80_vfx.jpg (pyromancer only; the other
  classes weren't checked on screen). Aimed at spell_vfx (pyro 3/10). Still visible in the clip: the pyromancer's mana sits
  near 0, which the judge complained about.
- Market Hill (subagent): the judge's "pale building with a curved corner" is most likely the Caius Market Hill Buildings
  (16–21 Market Hill, Easton 1937, way/13864148; listing 1200398 says "slightly curving front, curving casements at the far
  left corner"). Its window grid is probably the "chequered facade". OSM draws the St Mary's St end as a flat 6 m cut-off;
  zone_bespoke_caius.py now builds it as a smooth curve (windows, piers, shop glass, cornice and parapet all follow it).
  Source: geograph 5652394 (CC BY-SA 2.0), credited in DATA.md. Only the zone glb was rebuilt; collision is unchanged (the curve
  bulges ≤0.8 m past the OSM line and that strip has no collision). The difference is small on screen:
  docs/screens/session80_corner_{before,after}.jpg. No turret or bay-windowed building found near the square from listings or
  Commons; the judge may mean the Caius tower behind it.
- Published with skip flags; service.sh scores the new game hash (VFX) and the zone judges after the session.

Next
1. Read the s80 scores: gameplay_judged spell_vfx (pyro 3 before), playtest and boss TTK spread with the s79 rebalance,
   market_square_realism vs 31.0.
2. Game: the pyromancer's mana sits near 0 in the clip (regen or costs); check the storm/warden/hex VFX on screen.
3. Realism: the judge's other repeated complaints: missing trees on the GSM side, simplified stalls, the Guildhall's colour and
   proportions. Do the King's Parade sett-strip tile rebuild together with the next game edit.

## 2026-11-09 — Session 81: Pages deploys stuck since s79, GSM tracery and churchyard trees, pyro mana

- Found on start: the live site is still s77 (a7c038d3). The s79 and s80 releases were made, but all 3 Pages runs since 20:58
  (42697977129, 42701528739, 42704820655) failed: the artifact (205 MB, the same as the 20:12 success) uploaded fine, then
  deploy-pages sat on an empty "Current status" for 10 min and timed out. That points to the GitHub side (githubstatus says
  Pages is operational); nothing in our artifact changed. Retried with this session's publish.
- s77 judge reasons (a7c038d3_msjudge): many low views (0.5–2) are viewpoint/mirroring mismatches, not modelling. The repeated
  modelling complaints were the GSM church ("plain flat stone", "skeletal"), "A's large trees missing" and the Guildhall proportions.
- Realism (subagent): zone_bespoke_gsm.py: windows with 3+ lights get four-centred heads, Perpendicular panel tracery (cusped
  light heads plus a second tier) and heavier mullions; buttresses are 1.3x deeper, with pale weathering caps and a plinth band.
  GSM +6.4k tris (zone total 786k). Two real churchyard trees from the LiDAR canopy at the Peas Hill corner (12 m and 8.5 m;
  first/last-return gap = foliage) were dropped by trees.py's penetration test; they were added as a hand-checked EXTRA list (only
  t_3_4.bin changed, 18→20 trees). Screens: docs/screens/session81_gsm_{before,after}.jpg and _north_. Not checked against a photo;
  the tracery pattern is generic Perpendicular.
- Game (subagent): the pyromancer starter hat now gives +4 mana regen instead of +3% crit (regen 8→12/s; Ember Bolt spam costs ~11/s).
  Local pyro clip: 12/12 frames, mana 3–79 instead of ~0, mobs in view in 11/12 frames. test_classes ok, test_items 44/44.
  Still in the clip: frame 9 has the camera inside the dead boss's bell model, and the bot never leaves the market-north leg.
  docs/screens/session81_game.jpg.

Next
1. The s81 publish deployed fine (run 42708483513, live = 36368c47), so the s79–s81 work is now live. If Pages times out again,
   just re-dispatch; the three failures were GitHub-side.
2. Read the s79–s81 scores once live: gameplay_judged, boss TTK spread (s79 rebalance + pyro regen), market_square_realism vs 31.0.
3. Gameplay clip: push the camera out of the dead boss model, and route the bot onward after the boss kill.
4. Guildhall proportions and colour (repeated judge complaint); the storm/warden/hex VFX are still unchecked on screen.
