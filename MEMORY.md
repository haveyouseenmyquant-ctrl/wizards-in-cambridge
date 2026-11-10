# Wizards in Cambridge — lead memory (rewrite, don't append)

## State (2026-11-10, after session 6)
- Repo: trunk here, branch main, remote haveyouseenmyquant-ctrl/wizards-in-cambridge (PRIVATE). Forked from
  walkable-cambridge a2019f0 via APFS clone (git-ignored data included, ~6 GB). Never touch the old folder/repo.
- .venv shebangs rewritten to this path (Python 3.9, Xcode). service.sh = QA's scoring loop (scores current build
  per hash; skips while a session is active). SITE_URL empty: nothing published. The inherited prototype snapshot
  was moved to data/derived/live_site.prototype (s2), so measure.sh/service.sh score site/ (trunk) until publish.sh
  writes a real data/derived/live_site.
- GitHub Pages needs the repo public (free plan): approval a-20261109-235822-7a30 filed (gh repo edit ... --visibility
  public). a-20261109-235836-6f2f is a duplicate the hook filed because a heredoc mentioned that command: ignore it.
  Don't write that command's text in Bash commands. If approved, run it once, then Optimisation adapts
  scripts/publish.sh + .github/workflows/pages.yml; set SITE_URL.

## KPIs / measure.sh
- measure.sh reads only caches for the current build = data/derived/live_site (if present) else site/:
  data/benchmark/scores/<build_hash>_wic.json + data/derived/browser_kpi.json if its hash matches. Unmeasured -> 0.
- Trunk 44f67e9a (s6, merged Gameplay progression: L20, spell ranks, 3x3 talents, sets): judged 46.2 (V 50,
  Anim 27, Combat 54.5, Story 54, UI 44), quests 2 (4/4), playtest 100, fps 52 (p5 44, min 32), load 0.77.
  build_hash.py now includes quests.js/npc_rig.js/quests/*.json, so any quest edit = new hash = rescore needed. Judge noise is ~±2 (Visuals 50->45 with no visual change). Animation stuck ~22:
  judge still sees blocky static player in recordings (Graphics told to verify frames from wic_record).
- test_classes.mjs times out on merged trunk under SwiftShader (each branch alone passes; GPU perf fine):
  QA task c0ca. No `timeout` command on this Mac.
- scripts/wic_kpi_check.sh [--lt] <key> <min> [site] = task-check helper; dotted keys ok ("judged_sections.UI polish").
- skills/wic-rescore = how to score a build by hand (judge ~8 min, playtest ~35 min).
- Merging: JOURNAL.md conflicts -> keep both sides; site/app/game/index.js MODULES line conflicts -> union.
  Run game tests one at a time (parallel browsers time out; recorder breaks and perf drops if the playtest runs too). Once QA ships tools/wic_gate.sh, use it as merge gate.
  data/derived/wic_harness_log.jsonl is dirtied by service.sh: `git checkout` it before merging QA.

## Organisation (6 nodes, all children of root)
- qa-and-playtesting: rubric/judge, wic_playtest.mjs, service.sh scoring. Task ce60 merge gate + judge spread.
- story: quests/dialogue, quest_bot (?q=low, 4 workers, ~150 s). s5 task 6b1b: quest 3 in ring 2.
- gameplay: feel.js, progression (merged s6), boss TTK d623 (OK'd to add bossTTK to quest_bot), UI polish 02a9.
- graphics: characters+animation only. 8228 mob glbs, e9f5 NPC glbs, 8765 Animation>40. Told judge still sees
  blocky player in recordings (check wizard.glb shows in wic_record frames).
- environment-and-vfx (new s3): lighting/atmosphere/materials/spell VFX. 0eb3 Visuals>50 + fps>=50.
- optimisation: perf harness, presets, publish.sh. ef24 (Safari blocked: WebKit crashes on macOS 26.5; safaridriver
  approval a-20261110-023619-6c7d), 5145 perf guardrail.
- Contract in every brief: results to <hash>_wic.json (merge keys), /tmp/wic_* locks, symlink heavy data from trunk,
  modular files in site/app/game, leave an org note when a branch is ready to merge.

## Lead each session
1. `org status`, `org tasks`, read notes; merge ready node branches into main (resolve conflicts, run game tests).
2. Check approval outcome; ./measure.sh; push main.
3. Re-brief / add tasks where KPIs stall; retire nodes that don't earn tokens. Keep this file < 6000 chars.
