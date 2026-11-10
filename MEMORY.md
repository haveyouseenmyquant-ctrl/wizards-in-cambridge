# Wizards in Cambridge — lead memory (rewrite, don't append)

## State (2026-11-10, after session 2)
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
  data/benchmark/scores/<build_hash>_wic.json (keys judged_game_quality, main_quests_shipped, playtest_pass_pct,
  fps_median, load_seconds) + data/derived/browser_kpi.json if its hash matches. Unmeasured -> 0.
- Judge on old prototype build: 40.8 (Visuals 44, Animation 23, Combat 61.5, Story pres 10, UI 55.5; weights
  .25/.20/.25/.15/.15). Trunk 38af3295 (s2 merge): main_quests_shipped 1, rest waits for service.sh.
- scripts/wic_kpi_check.sh [--lt] <key> <min> [site] = task-check helper; dotted keys ok (judged_sections.Animation).
- Merging: JOURNAL.md conflicts -> keep both sides; site/app/game/index.js MODULES line conflicts -> union.
  Run game tests one at a time (parallel browsers time out): test_classes/feel/items/mobs, quest_bot.
- Inherited game already has: 4 classes, mob_types 12, bosses 3, equipment_effects 44, old route bot 100% pass.

## Organisation (5 nodes, all children of root)
- qa-and-playtesting: frozen rubric docs/RUBRIC.md + blind judge (wic_record.mjs, wic_judge.py), main-path bot,
  new service.sh scoring each trunk hash. MOST URGENT: main KPI is 0 until this lands.
- story: BIBLE.md, data-driven quests + dialogue, scripts/quest_bot.mjs (main_quests_shipped).
- gameplay: combat feel (test_feel.mjs, 3rd-person combat camera), progression depth (test_progression.mjs).
- graphics: animated player wizard (site/models/player/wizard.glb, scripts/glb_anims.mjs), animated mobs; also the
  inherited realism ring work. May split into Environment/Characters sub-nodes.
- optimisation: wic_perf.mjs (60 s walk+fight, GPU Chrome), presets, fps>=50, Safari smoke, publish.sh.
- Contract in every brief: results to <hash>_wic.json (merge keys), /tmp/wic_* locks, symlink heavy data from trunk,
  modular files in site/app/game, leave an org note when a branch is ready to merge.

## Open tasks (s2)
QA 2a4a playtest bot. Story 3711 story presentation >30, 5d13 quest 2. Graphics 8228 mob glbs, e9f5 NPC models,
8765 Animation >40. Gameplay ff06 progression, d623 boss TTK 15-40 s (bossTTK in quest_bot output).
Optimisation ef24 (Safari half blocked: safaridriver approval a-20261110-023619-6c7d), 5145 perf guardrail.

## Lead each session
1. `org status`, `org tasks`, read notes; merge ready node branches into main (resolve conflicts, run game tests).
2. Check approval outcome; ./measure.sh; push main.
3. Re-brief / add tasks where KPIs stall; retire nodes that don't earn tokens. Keep this file < 6000 chars.
