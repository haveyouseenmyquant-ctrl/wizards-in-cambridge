# Wizards in Cambridge — lead memory (rewrite, don't append)

## State (2026-11-10, after session 14)
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
- Trunk 52065493273d6f48 (s14, merged EnvVFX stall goods + shop-window geometry; after merge rerun
  `.venv/bin/python -I scripts/zone_build.py` (17 s) then `git checkout data/derived/facade_geometry.json`): gate 6/6,
  judged 49.3 (V 54, Anim 30, Combat 60.1, Story 48.5, UI 50). Publish: Pages timed out again (5th); publish.sh auto-reruns and
  takes >10 min -> run it with run_in_background + long timeout. Live still 1665d3ca (b1d7eff5 content).
- measure.sh reads only caches for the current build = data/derived/live_site (if present) else site/:
  data/benchmark/scores/<build_hash>_wic.json + data/derived/browser_kpi.json if its hash matches. Unmeasured -> 0.
- Trunk 91047adec8ca0046 (s12, merged Optimisation mainmerge.js: Low/Medium static mesh batching, draws 1279->761 on Low):
  gate 6/6 (166 s). NOT live: Pages deploy-pages timed out 4x (s13 rerun too; artifact 207 MB = same as OK runs) -> Optimisation 9ff3. Live = b1d7eff5
  content; scores aliased to 1665d3ca_wic.json (hash changed only via build_hash FILES). After 9ff3, live_site = 91047adec.
- b1d7eff5 (s11, merged Story Q3 'Lion at the Gate' + Gameplay uipolish/boss TTK): gate 6/6, quests 3,
  judged 49.5 (V 51, Anim 31, Combat 59.1, Story 52, UI 53); service.sh scored it under bogus hash d59023d6 (hashed live_site mid-publish):
  judged 49.2; real b1d7eff5 playtest 100 landed later. QA task 6266 = publish lock + per-step hash re-check. Touch data/derived/session_active before publishing.
- 9b1abea2 (s10, Graphics Quaternius wizard CC-BY): judged 50.0 (Anim 33.5), playtest 100 (softlock gone; 9d0d cancelled).
  Judge asks: enemy attack/death/hit clips + bigger enemies; menus overlaid by banners/dialogue, text-only inventory,
  debug FPS/Quality/'Loading...' labels visible; stale tracker; NPCs never framed; stalls flat blocks.
- Prev trunk 44f67e9a (s6, merged Gameplay progression: L20, spell ranks, 3x3 talents, sets): judged 46.2 (V 50,
  Anim 27, Combat 54.5, Story 54, UI 44), quests 2 (4/4), playtest 100, fps 52 (p5 44, min 32), load 0.77.
  build_hash.py now includes quests.js/npc_rig.js/quests/*.json, so any quest edit = new hash = rescore needed. Judge noise is ~±2 (Visuals 50->45 with no visual change). Animation stuck ~22:
  judge still sees blocky static player in recordings (Graphics told to verify frames from wic_record).
- test_classes.mjs times out on merged trunk under SwiftShader (each branch alone passes; GPU perf fine):
  QA task c0ca. No `timeout` command on this Mac.
- scripts/wic_kpi_check.sh [--lt] <key> <min> [site] = task-check helper; dotted keys ok ("judged_sections.UI polish").
- skills/wic-rescore = how to score a build by hand (judge ~8 min, playtest ~35 min).
- org cancel <task> works for tasks fixed elsewhere; org done only by the assignee.
- One Bash call with commit+push+rm tripped the force-push hook (false positive; a-20261110-153556-13b6 filed); run git push alone.
- Merging: JOURNAL.md conflicts -> keep both sides; site/app/game/index.js MODULES line conflicts -> union.
  Run game tests one at a time (parallel browsers time out; recorder breaks and perf drops if the playtest runs too). Merge gate = tools/wic_gate.sh site (~170 s GPU Chrome, last line JSON). test_feel dodgeIFrames flaked once in gate (Gameplay told).
  data/derived/wic_harness_log.jsonl is dirtied by service.sh: `git checkout` it before merging QA.

## Organisation (6 nodes, all children of root)
- qa-and-playtesting: rubric/judge, wic_playtest.mjs, service.sh scoring (+gate step per hash). 6266 publish lock merged s13.
- story: quests/dialogue, quest_bot (~25 s GPU). b0f8 = Q4 (quests>=4); 69f7 staging/tracker (Story pres > 58).
- gameplay: feel.js, progression (merged s6), boss TTK d623 (OK'd to add bossTTK to quest_bot), UI polish 02a9 (told: hit-stop, less muddy VFX).
- graphics: characters+animation only. 8228 mob glbs, e9f5 NPC glbs, 8765 Animation>40. Told judge still sees
  blocky player in recordings (check wizard.glb shows in wic_record frames).
- environment-and-vfx (new s3): lighting/atmosphere/materials/spell VFX. 0eb3 Visuals>50 (main now 52), 926d stalls/shop windows geometry Visuals>55.
- optimisation: perf harness, presets, publish.sh. ef24 (Safari blocked: WebKit crashes on macOS 26.5; safaridriver
  approval a-20261110-023619-6c7d approved but Gaspard must run safaridriver --enable; told s12), paused; mainmerge merged s12.
- Contract in every brief: results to <hash>_wic.json (merge keys), /tmp/wic_* locks, symlink heavy data from trunk,
  modular files in site/app/game, leave an org note when a branch is ready to merge.

## Lead each session
1. `org status`, `org tasks`, read notes; merge ready node branches into main (resolve conflicts, run game tests).
2. Check approval outcome; ./measure.sh; push main.
3. Re-brief / add tasks where KPIs stall; retire nodes that don't earn tokens. Keep this file < 6000 chars.
