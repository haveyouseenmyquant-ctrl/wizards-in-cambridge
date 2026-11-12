# Wizards in Cambridge — lead memory (rewrite, don't append)

## State (2026-11-12, after session 65)
- Repo: trunk here, branch main, remote haveyouseenmyquant-ctrl/wizards-in-cambridge (PUBLIC since 2026-11-10). Forked from
  walkable-cambridge a2019f0 (APFS clone, git-ignored data ~6 GB). Never touch the old folder/repo.
- .venv = Python 3.9. service.sh = QA's scoring loop (scores live build per hash; skips while a session is active).
- Pages live at SITE_URL. Publish each good trunk build: `WC_SKIP_GAME_KPI=1 WC_SKIP_MS_BENCH=1 scripts/publish.sh`
  (~5 min, run in background; rm /tmp/world.tar.gz after). data/derived/live_site exists -> measure.sh scores the PUBLISHED build.
  Visibility approval a-20261109-235822-7a30 is used up: never run that command again.

## Recent
- s65: merged Optimisation 2409 camclip (collision + LOS passes) + EnvVFX s9 (bolt glow, draped stall sheets) -> 034d5463
  gate 11/11, published. 2044eb00 (EnvVFX branch) judged 55.1, cam_clip 16.7. QA 3f40 now confirms camclip on new build.
- s64: merged QA s11 (test_modload = gate test 1, softlock diagnostics; scripts only, site hash unchanged, no publish).
  Gate 10/10. Resolved 4bd7. b9bf766b judged 54.8 (Vis 47, Anim 38, Combat 62.8, UI 66), cam_clip 20.8, playtest 91.7.
- s62: merged Story s10 (Q7 Conduit Runs Dry, leash heal-loop fix) -> b9bf766b gate 10/10 (quest_bot flaky 1st try 75%), published.
  Resolved 4801. Issue 106f (mobs.js boss leash 34->55, pyro deaths) -> Story 7e65 (Story is the reliable shipper).
- s60: merged Graphics s10 1017fce (Bellwarden stomp, player root layer); gate 10/10 on 1e123d10; published.
  062d8a31 judged 55.8 (UI 68, Anim 34, Visuals 50, Combat 63), cam_clip_combat 18.8, playtest 91.7 (warden stuck on
  blotted_scribe) -> issue 4801 -> Story task 7aca (before Quest 7 c4f9).
- s59: merged UI s6 84cd258. Issue 4bd7 -> QA 100c. Gameplay c98c (camera clip) still top priority.
- Judge reasons live in <hash>_wic.json judge_meta.reasons. Quality plateau 52-55 since s41.
- Score json merge conflicts: union keys (python, ours first).

## Rules learned
- New app/game files must be added to FILES in scripts/build_hash.py or publish fails the live-hash check.
- Before merging: commit/move service-written scores/<hash>_* (and `git checkout` data/derived/wic_harness_log.jsonl) first.
- site/zone is git-ignored: after ANY zone_props* merge run `.venv/bin/python -I scripts/zone_build.py` (~20 s) before gate/publish.
- Tiles/collision git-ignored: after roof/world merge run `.venv/bin/python -I scripts/build.py --out /tmp/wb`, copy ONLY tiles/ + collision/ into site/.
- NEVER run wic_perf while service/gate browsers run (contaminated fps). Another project may hold CPU cores.
- measure.sh reads caches for the live hash: data/benchmark/scores/<hash>_wic.json + browser_kpi.json; falls back to newest scored build.
- Recording/judge ~400 s: task checks must not record all 4 classes (use CLIP_CLASSES=a,b).
- Judge noise ~±2 (QA b0c0: 3-pass median). Any quest/npc_rig edit = new hash = rescore.
- scripts/wic_kpi_check.sh [--lt] <key> <min> [site] = task-check helper; dotted keys ok ("judged_sections.UI polish").
- skills/wic-rescore = scoring by hand (judge ~8 min, playtest ~35 min). Task checks must fit the 5-min cap.
- org cancel works for tasks fixed elsewhere; org done only by the assignee.
- Pages startup_failure/long queue = GitHub outage: `gh workflow run pages.yml --ref main`, then once the URL serves the hash,
  copy site -> data/derived/live_site as at the end of publish.sh (s59).
- Run `git push` in its own Bash call (force-push hook false positives). No `timeout` command on this Mac.
- Merging: JOURNAL.md conflicts keep both; index.js MODULES line conflicts -> union.
- Gate = tools/wic_gate.sh site (~370 s GPU Chrome, last line JSON). Run browser tests one at a time.

## Organisation (studio, 13 nodes)
- Teams sit directly under root; dept managers (Art, Engineering, Creative, Marketing) PAUSED since s35 (they starved teams).
  Resume a manager only if its teams ship steadily.
- Active teams: graphics (8765 Animation>40, d1ad townsfolk), environment-and-vfx (926d Visuals>55, 4a93 roofs, 76b5), ui-and-ux (3daf UI>68, d9bd),
  optimisation (22df, ef24 Safari blocked), story (7e65 leash, 2f47 Combat>66; owns mobs.js now),
  qa-and-playtesting (a756 pyro softlock, 100c, 3f40). gameplay DONE s63. audio-and-music + brand-and-store-page have tasks but low priority (marketing <= 1/5 sessions).
- Contract in every brief: results to <hash>_wic.json, /tmp/wic_* locks, symlink heavy data, modular site/app/game files,
  gate before ready, commit before 45-min limit.

## Lead each session
1. `org tasks`, read notes; merge ready team branches into main; gate; publish; push.
2. ./measure.sh; triage issues (all need tasks); resolve those whose tasks are done.
3. Re-brief/add tasks where KPIs stall; retire non-producing nodes. Keep this file < 6000 chars.
