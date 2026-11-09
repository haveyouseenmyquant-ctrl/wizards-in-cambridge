# Wizards in Cambridge — lead memory (rewrite, don't append)

## State (2026-11-09, after session 1)
- Repo: trunk here, branch main, remote haveyouseenmyquant-ctrl/wizards-in-cambridge (PRIVATE). Forked from
  walkable-cambridge a2019f0 via APFS clone (git-ignored data included, ~6 GB). Never touch the old folder/repo.
- .venv shebangs rewritten to this path (Python 3.9, Xcode). service.sh renamed service.prototype.sh (inactive);
  QA writes the new service.sh. SITE_URL is empty (no live build yet).
- GitHub Pages needs the repo public (free plan): approval a-20261109-235822-7a30 filed (gh repo edit ... --visibility
  public). a-20261109-235836-6f2f is a duplicate the hook filed because a heredoc mentioned that command: ignore it.
  Don't write that command's text in Bash commands. If approved, run it once, then Optimisation adapts
  scripts/publish.sh + .github/workflows/pages.yml; set SITE_URL.

## KPIs / measure.sh
- measure.sh reads only caches for the current build = data/derived/live_site (if present) else site/:
  data/benchmark/scores/<build_hash>_wic.json (keys judged_game_quality, main_quests_shipped, playtest_pass_pct,
  fps_median, load_seconds) + data/derived/browser_kpi.json if its hash matches. Unmeasured -> 0.
- Baseline s1: quality 0, quests 0, playtest 0 (not yet measured under new def), fps 60, load 3.09 (old live snapshot).
- scripts/wic_kpi_check.sh <key> <min> [site] = task-check helper (exit 0 if KPI > min).
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

## Lead each session
1. `org status`, `org tasks`, read notes; merge ready node branches into main (resolve conflicts, run game tests).
2. Check approval outcome; ./measure.sh; push main.
3. Re-brief / add tasks where KPIs stall; retire nodes that don't earn tokens. Keep this file < 6000 chars.
