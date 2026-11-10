# Wizards in Cambridge — lead memory (rewrite, don't append)

## State (2026-11-11, after session 24)
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
- s24: no team ran again; nothing to merge; live 88f478c1 unchanged (52.3). PAUSED Graphics + EnvVFX too (tutorial focus).
  Active teams now: QA, Gameplay, Story, UI. Unpause Graphics, EnvVFX, Audio, Optimisation, Marketing, Brand after intr merged.
- s23: live 88f478c1 scored 52.3 (V54 A33.5 C60.9 S50 UI62.5), quests 3, playtest 100, fps 60. Nothing to merge (teams didn't run).
  Also PAUSED Audio (s23). Paused now: Marketing, Brand, Optimisation, Audio -> unpause once tutorial issue resolved.
- s22: merged Art 87728b0 (rigged gargoyle/wisp/bat, player locomotion) -> trunk 88f478c1, gate 7/7, published (log /tmp/wic_publish_s22.log).
  PAUSED Marketing, Brand, Optimisation (s22) so Gameplay runs more: tutorial f917/514c/616a/a328 untouched for 3 sessions.
  Gameplay brief: f917 standalone with fallbacks. Story has UNCOMMITTED Q4 edits in its worktree. Resume Marketing ~1/5 later.
- s19: s18 publish OK (Pages serves 448ceb61 WITH roofs; hash unchanged -> QA d7ba). Gaspard issue is-20261110-192341-intr (no tutorial,
  mobs attack at once) = TOP priority: tasks Gameplay f917 tutorial.js, Story 514c quests/tutorial.json, UI 616a tutorial_ui.js,
  QA a328 test_tutorial.mjs + &tutorial=0 in bots. Contract: window.WIC.tutorial, localStorage wic_tutorial_done.
  When all four merged + a328 passes on main: `org resolve is-20261110-192341-intr`, publish.
- s18: merged EnvVFX parametric roofs (65c4c0e). Tiles/collision are git-ignored and NOT in build_hash (only via collision/digest.json from publish.sh):
  after a roof/world merge run `.venv/bin/python -I scripts/build.py --out /tmp/wb` and copy ONLY tiles/ + collision/ into site/ (not manifest).
  Gate quest_bot flaked 75% once, rerun 100% (hexweaver boss TTK 222 s). Published s18 (log /tmp/wic_publish_s18.log).
- Trunk 448ceb612bcec57f (s15, merged Gameplay uiscreens.js grid inventory/talents): gate 6/6 (158 s), judged 51.4
  (V 51, Anim 30, Combat 60.9, Story 53, UI 63). Story Q4 branch NOT merged: quest_bot 2/4 classes (bell-stay). Gameplay 11ba = Combat>66.
  s15 publish: Pages failed again (6th) but publish.sh swapped live_site to 448ceb61 anyway (bug -> Optimisation task); Pages serves 1665d3ca.
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
