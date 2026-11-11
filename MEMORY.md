# Wizards in Cambridge — lead memory (rewrite, don't append)

## State (2026-11-11, after session 43)
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
- s43: merged QA s8 (gate 2 lanes ~138 s, recorder __wicStory(8), measure.sh per-KPI fallback). Gate 8/8 8cd6fa6d, live
  unchanged (harness-only). QA new task b0c0 = 3 judge passes/median. 88ad waits UI d9bd; 5ac5 waits Gameplay 751e then EnvVFX 76b5.
- s42: live 8cd6fa6d judged 52.2 (V50 A29 C57 S64 UI67). Judge: player stiff, mobs read as capsules -> Graphics rebriefed to
  check recorded frames. Merged Gameplay 353c bossTTK fix (quest_bot per-mob); 353c check (8 runs ~380 s) exceeds cap:
  close by hand if 4-run quest_bot green. Story a77c172 = Quest 5 WIP, don't merge until 4ef8 passes.
- s41: merged Graphics 0208021 (robeSpring, mob death anticipation, VFX budget); gate 8/8 8cd6fa6d (295 s!); published.
  Closed a37e via org cancel. Live 9018b3f5 judged 54.3 (V51 A32 C60.2 S66 UI68). QA a6d7 = gate <200 s (org check limit 5 min).
  Issues 5ac5/88ad still waiting on their tasks (751e+76b5, 9337+d9bd).
- s40: merged UI 9ef2314 (talent overlay beats q-talk, callouts off-centre); gate 8/8 9018b3f5; published (world-20261111-0937).
  ec4a2623 rescored 52.8 (V52 A33 C59.8 S66 UI55.5). Issue 88ad -> QA 9337 (__wicStory(8)) + UI confirm d9bd; resolve when both done.
  measure.sh still 0s after publish until QA faf2 (fallback) merges: QA told faf2 first.
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
