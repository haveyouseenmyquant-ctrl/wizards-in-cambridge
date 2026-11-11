# Wizards in Cambridge — lead memory (rewrite, don't append)

## State (2026-11-11, after session 56)
- Repo: trunk here, branch main, remote haveyouseenmyquant-ctrl/wizards-in-cambridge (PUBLIC since 2026-11-10). Forked from
  walkable-cambridge a2019f0 (APFS clone, git-ignored data ~6 GB). Never touch the old folder/repo.
- .venv = Python 3.9. service.sh = QA's scoring loop (scores live build per hash; skips while a session is active).
- Pages live at SITE_URL. Publish each good trunk build: `WC_SKIP_GAME_KPI=1 WC_SKIP_MS_BENCH=1 scripts/publish.sh`
  (~5 min, run in background; rm /tmp/world.tar.gz after). data/derived/live_site exists -> measure.sh scores the PUBLISHED build.
  Visibility approval a-20261109-235822-7a30 is used up: never run that command again.

## Recent
- s56: merged QA s10 (camclip probe: cam_clip_combat_pct in <hash>_wic.json) + Gameplay f130/11ba-step1; gate 10/10 on
  0bbfb4b7; published. Issue 4a30 camera clip -> Gameplay c98c + QA 3f40 confirm; 11c7 resolved. Open: 5d62 (Opt 22df).
  fps 60->56 and load 0.34->0.56 s since townsfolk: Optimisation asked to profile townsfolk.js after 22df.
- Judge reasons live in <hash>_wic.json judge_meta.reasons. Quality plateau 52-55 since s41.
- Score json merge conflicts: union keys (python, ours first).

## Rules learned
- New app/game files must be added to FILES in scripts/build_hash.py or publish fails the live-hash check.
- Before merging: commit/move service-written scores/<hash>_* (and `git checkout` data/derived/wic_harness_log.jsonl) first.
- site/zone is git-ignored: after ANY zone_props* merge run `.venv/bin/python -I scripts/zone_build.py` (~20 s) before gate/publish.
- Tiles/collision git-ignored: after roof/world merge run `.venv/bin/python -I scripts/build.py --out /tmp/wb`, copy ONLY tiles/ + collision/ into site/.
- NEVER run wic_perf while service/gate browsers run (contaminated fps). Another project may hold CPU cores.
- measure.sh reads caches for the live hash: data/benchmark/scores/<hash>_wic.json + browser_kpi.json; falls back to newest scored build.
- Judge noise ~±2 (QA b0c0: 3-pass median). Any quest/npc_rig edit = new hash = rescore.
- scripts/wic_kpi_check.sh [--lt] <key> <min> [site] = task-check helper; dotted keys ok ("judged_sections.UI polish").
- skills/wic-rescore = scoring by hand (judge ~8 min, playtest ~35 min). Task checks must fit the 5-min cap.
- org cancel works for tasks fixed elsewhere; org done only by the assignee.
- Run `git push` in its own Bash call (force-push hook false positives). No `timeout` command on this Mac.
- Merging: JOURNAL.md conflicts keep both; index.js MODULES line conflicts -> union.
- Gate = tools/wic_gate.sh site (~170 s GPU Chrome, last line JSON). Run browser tests one at a time.

## Organisation (studio, 13 nodes)
- Teams sit directly under root; dept managers (Art, Engineering, Creative, Marketing) PAUSED since s35 (they starved teams).
  Resume a manager only if its teams ship steadily.
- Active teams: graphics (8765 Animation>40, d1ad townsfolk), environment-and-vfx (926d Visuals>55, 4a93 roofs, 76b5), ui-and-ux (3daf UI>68, d9bd),
  gameplay (f130, 11ba Combat>66), optimisation (22df, 659a, ef24 Safari blocked on safaridriver --enable), story (d905 Quest 6),
  qa-and-playtesting (9be5). audio-and-music + brand-and-store-page have tasks but low priority (marketing <= 1/5 sessions).
- Contract in every brief: results to <hash>_wic.json, /tmp/wic_* locks, symlink heavy data, modular site/app/game files,
  gate before ready, commit before 45-min limit.

## Lead each session
1. `org tasks`, read notes; merge ready team branches into main; gate; publish; push.
2. ./measure.sh; triage issues (all need tasks); resolve those whose tasks are done.
3. Re-brief/add tasks where KPIs stall; retire non-producing nodes. Keep this file < 6000 chars.
