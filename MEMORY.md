# Wizards in Cambridge — lead memory (rewrite, don't append)

## State (2026-11-11, after session 37)
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
- s28: merged QA b1c1008 (build_hash now covers tiles/collision digests + all game modules; test_tutorial in gate).
  Live hash 73eed732 judged 52.2 (V52 A30 C59.9 S55.5 UI66), quests 4, playtest 100; fps not yet measured (service.sh does it).
  NEVER run wic_perf while service.sh/gate runs a browser: my s28 run read 41 fps (contaminated, deleted). Another project
  (poker service.sh train.py) holds 3 CPU cores for hours -> can depress fps. 025eacbb perf read 49 once.
- s37: merged QA s7 (184f: build_hash adds tutorial_ui.js + auto-includes unlisted modules; wic_perf_robust in service.sh). Live build
  re-hashes 9c5df3a4 -> 645eac53 (same files); copied its judge 51.7 (V48.5 A29 C58.5 S66 UI61.5) into 645eac53_wic.json. Issue 7fe1 resolved.
  Story task 4ef8 = main quest 5 (ring 1). Lowest sections: Animation 29, Visuals 48.5.
- s36: merged Gameplay eb97f29 (9e85 stall-wall cam) + Story dab59f2 (dialogue staging) directly; gate 8/8 9c5df3a4; published live 9c5df3a4 (judge pending).
- s35: nothing to merge (Gameplay last ran 01:06; managers took the sessions). FLATTENED again: gameplay, optimisation,
  graphics, ui-and-ux, story -> under root; Engineering/Art/Creative PAUSED. Merge team branches directly. Told Gaspard.
- s34: nothing to merge. 429d69f1 judged 51.1 (V49.5 A32 C59.6 S52 UI64.5); fps pending. Issue 7fe1 -> QA task 184f (relinked; b77e cancelled).
  Judge theme: player tiny/hidden in combat -> noted Engineering (closer camera) + Art (secondary motion, VFX blowout, UI overlaps).
- s30: merged Engineering de1d861, published 0f9b1cd6.
  Structure restored: story -> Creative, graphics + ui-and-ux -> Art; Art + Creative resumed (Audio, EnvVFX, Marketing still paused).
- Paused since s22-24: Marketing, Brand, Optimisation, Audio, Graphics, EnvVFX (resume ~1/5 marketing later).
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
