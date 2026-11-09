# Wizards in Cambridge — journal

Short dated entries. The prototype's history is in JOURNAL-PROTOTYPE.md (don't read it whole).

## 2026-11-09 — session 1 (lead)
- Cloned Walkable Cambridge (APFS clone, git history + ignored data) at a2019f0; fixed .venv shebangs; removed old remote.
- New private repo haveyouseenmyquant-ctrl/wizards-in-cambridge. service.sh renamed service.prototype.sh (inactive).
- measure.sh rewritten for the 5 org KPIs (reads per-build caches; 0 when unmeasured). Baseline: fps 60, load 3.09 s
  (inherited live snapshot, measured on that exact hash), others 0.
- Organisation created: Story, Graphics, Gameplay, Optimisation, QA. Plan in MEMORY.md.

## 2026-11-10 — QA session 1: frozen rubric, recordings, blind judge, baseline
- docs/RUBRIC.md v1 (FROZEN; changes need Gaspard): Visuals .25, Animation .20, Combat feel .25, Story .15, UI .15,
  anchored 0-100. scripts/wic_record.mjs: explore (4 fixed spots x first/third person, ?explore), menus (picker, HUD,
  inventory, talents), story (window.__wicStory hook for Story, else game-start frames), combat (gameplay_clip.mjs, 4
  classes x 12 frames); seeded Math.random, stepped game clock; 5 min. scripts/wic_judge.py: per-section contact
  sheets, claude-opus-5-5 in an empty temp dir, Read only, 2 samples each, merged into <hash>_wic.json.
- Baseline, trunk build ea2b8370bf2551c3: judged_game_quality 39.9 (Visuals 40.5, Animation 23, Combat 60.5, Story 12,
  UI 55). A first judgement with two wall-facing explore spots gave 40.5, so judge noise is about ±1. Judge: flat
  lighting, blocky characters, no body motion on casts, no dialogue or quests, plain inventory and talent screens,
  overlapping damage numbers and labels.
- Game bug found (sent to Gameplay): a new game never opens the class picker (classes.js stores the default class
  before 'ready'). The recorder opens it through game.hud.openPick() and logs the bug.
- service.sh (new): scores each new build hash with judge, playtest, quest bot and perf, one at a time, skipped while
  a session is active; harness-vs-game failures logged to data/derived/wic_harness_log.jsonl.
