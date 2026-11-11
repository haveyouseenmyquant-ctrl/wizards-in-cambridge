# Wizards in Cambridge — lead memory (rewrite, don't append)

## State (2026-11-11, after session 46)
- Repo: trunk here, branch main, remote haveyouseenmyquant-ctrl/wizards-in-cambridge (PUBLIC since 2026-11-10). Forked from
  walkable-cambridge a2019f0 via APFS clone (git-ignored data included, ~6 GB). Never touch the old folder/repo.
- .venv shebangs rewritten to this path (Python 3.9, Xcode). service.sh = QA's scoring loop (scores current build
  per hash; skips while a session is active). Published: Pages (GitHub Actions) live at SITE_URL
  https://haveyouseenmyquant-ctrl.github.io/wizards-in-cambridge/ ; build de19f70 = release world-20261110-0924, published
  by a one-off task; s10 published 9b1abea2 (release world-20261110-1012) via
  `WC_SKIP_GAME_KPI=1 WC_SKIP_MS_BENCH=1 scripts/publish.sh` (~5 min; rm /tmp/world.tar.gz after). data/derived/live_site exists, so
  measure.sh scores the PUBLISHED build. Keep publishing each good trunk build with scripts/publish.sh. Visibility
  approval a-20261109-235822-7a30 is used up: never run that command again.

## KPIs / measure.sh
- s46: live 7fc02ea6 judged 53.5 (V50 A32.5 C59.6 S65 UI66). Merged UI s4 (1e67676), gate 8/8 1afa7a11 (139 s, quest_bot 31 s),
  published (world-20261111-1305). Issue 3311 -> Story bea2 (step-8 hold; then UI d9bd confirms 88ad). 11c7 -> Gameplay f130 (after 751e).
- s45: service judged 81004214 = 55.2 (V52 A37 C61.1 S66 UI64). Merged EnvVFX clutter (zone_props_clutter.py); site/zone is
  git-ignored -> after ANY zone_props* merge run `.venv/bin/python -I scripts/zone_build.py` (~20 s) before gate/publish.
  Gate 8/8 7fc02ea6, published (world-20261111-1245); its 53.5 is EnvVFX branch judge, service rescores. Rebriefed EnvVFX (facade mouldings/wear, not clutter) + Graphics (readable full-body poses).
- s44: merged Optimisation s7 (shadowproxy spread, wic_perf perf_detail.worst_frames [s,ms]); gate 8/8 81004214 (139 s);
  published (world-20261111-1215). Issue 5d62 -> Graphics 919d. QA f46f = quest_bot <150 s parallel (before b0c0) so Story 4ef8 fits cap.
- s42: live 8cd6fa6d judged 52.2 (V50 A29 C57 S64 UI67). Judge: player stiff, mobs read as capsules -> Graphics rebriefed to
  check recorded frames. Merged Gameplay 353c bossTTK fix (quest_bot per-mob); 353c check (8 runs ~380 s) exceeds cap:
  close by hand if 4-run quest_bot green. Story a77c172 = Quest 5 WIP, don't merge until 4ef8 passes.
- NEVER run wic_perf while service.sh/gate runs a browser: my s28 run read 41 fps (contaminated, deleted). Another project
  (poker service.sh train.py) holds 3 CPU cores for hours -> can depress fps. 025eacbb perf read 49 once.
- s18: merged EnvVFX parametric roofs (65c4c0e). Tiles/collision are git-ignored and NOT in build_hash (only via collision/digest.json from publish.sh):
  after a roof/world merge run `.venv/bin/python -I scripts/build.py --out /tmp/wb` and copy ONLY tiles/ + collision/ into site/ (not manifest).
  Gate quest_bot flaked 75% once, rerun 100% (hexweaver boss TTK 222 s). Published s18 (log /tmp/wic_publish_s18.log).
- measure.sh reads only caches for the current build = data/derived/live_site (if present) else site/:
  data/benchmark/scores/<build_hash>_wic.json + data/derived/browser_kpi.json if its hash matches. Unmeasured -> 0.
- Judge noise ~±2. build_hash.py includes quests.js/npc_rig.js/quests/*.json: any quest edit = new hash = rescore.
- test_classes.mjs times out on merged trunk under SwiftShader (each branch alone passes; GPU perf fine):
  QA task c0ca. No `timeout` command on this Mac.
- scripts/wic_kpi_check.sh [--lt] <key> <min> [site] = task-check helper; dotted keys ok ("judged_sections.UI polish").
- skills/wic-rescore = how to score a build by hand (judge ~8 min, playtest ~35 min).
- org cancel <task> works for tasks fixed elsewhere; org done only by the assignee.
- Force-push hook false-positives on Bash calls mixing push+rm: always run `git push` in its own call.
- Merging: JOURNAL.md conflicts -> keep both sides; site/app/game/index.js MODULES line conflicts -> union.
  Run game tests one at a time (parallel browsers time out; recorder breaks and perf drops if the playtest runs too). Merge gate = tools/wic_gate.sh site (~170 s GPU Chrome, last line JSON). test_feel dodgeIFrames flaked once in gate (Gameplay told).
  data/derived/wic_harness_log.jsonl is dirtied by service.sh: `git checkout` it before merging QA.

## Organisation (studio since s18, 13 nodes; Gaspard 10 Nov direction)
- s35 TREE: teams under root, dept managers paused (they starved teams of sessions). Resume a manager only if its teams ship steadily.
- Root = studio head. Departments (managers only review/merge/assign; teams merge into dept branch, dept into main):
  Art -> graphics (chars+anim; 8765 Animation>40; rig work UNCOMMITTED 2 sessions), environment-and-vfx (926d stalls Visuals>55), ui-and-ux (new; 3daf UI polish>68).
  Engineering -> gameplay (11ba Combat>66, quest_bot flakes), optimisation (ef24 Safari blocked on Gaspard's safaridriver --enable).
  Creative -> story (b0f8 Q4 Ferry Bell, 2 unmerged commits, quest_bot 2/4; 69f7 staging), audio-and-music (new; eebc audio v1).
  Marketing -> brand-and-store-page (new; abd9 drafts + press kit). Keep marketing <= 1/5 of sessions; Trailers/Community later only if earned.
  qa-and-playtesting stays directly under root (one-team Quality dept = overhead). Retire teams that don't produce.
- Contract in every brief: results to <hash>_wic.json, /tmp/wic_* locks, symlink heavy data, modular site/app/game files, gate before ready, commit before 45-min limit.

## Lead each session
1. `org status`, `org tasks`, read notes; merge ready DEPARTMENT branches (and QA) into main (resolve conflicts, run game tests).
2. Check approval outcome; ./measure.sh; push main.
3. Re-brief / add tasks where KPIs stall; retire nodes that don't earn tokens. Keep this file < 6000 chars.
