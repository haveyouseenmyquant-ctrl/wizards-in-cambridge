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
- Live snapshot 36368c4767036e1c (what measure.sh reads): 40.8 (V 44, Anim 23, Combat 61.5, Story 10, UI 55.5).
- service.sh (new): scores each new build hash with judge, playtest, quest bot and perf, one at a time, skipped while
  a session is active; harness-vs-game failures logged to data/derived/wic_harness_log.jsonl.
## 2026-11-10 Optimisation s1
- New harness scripts/wic_perf.mjs: GPU Chrome (ANGLE Metal, Apple M4), 1280x720, default preset, load to __walkReady,
  then 60 s scripted walk over Market Hill (spawn -> market-north -> market-south -> back) fighting the encounters as
  Pyromancer (100 % of ticks with a mob in range, ~190 casts, ~25 kills, up to 36 live mobs). Writes fps_median,
  load_seconds, perf_detail to <hash>_wic.json and data/derived/browser_kpi.json.
- Baseline (57c98a87): fps_median 60 (vsync cap), p5 56, load 0.48 s, 2279 draw calls, 4.5 M tris.
- Quality presets: site/app/quality.js (Low/Medium/High/Ultra; ?q= per load, menu button cycles + saves localStorage
  'wic_quality'; default High on desktop, Low on touch). Drives pixel-ratio cap, shadow map size, facade radius, tree
  cards, VFX particles, fog, GTAO on Ultra. Build 8579b103 High: fps 60, p5 59, load 0.54 s. Low 1298 calls / 2.4 M tris.
- safari_ok = 0: every Playwright WebKit build (2388, 2389, 2391 from 1.66-alpha-2026-11-09) crashes its WebContent
  process at launch on macOS 26.5.2 (even data: URLs); safaridriver needs `--enable` (admin). Not a site problem.

## 2026-11-10 — session 2 (lead)
- Merged all 5 node branches (QA rubric/judge/service.sh, Optimisation perf harness+presets, Gameplay feel.js,
  Graphics rigged wizard, Story quests+prologue). Tests on merged trunk 38af3295: classes ok, feel 17/17, items 45,
  mobs 12+3 bosses, quest_bot 4/4 (main_quests_shipped 1).
- Old prototype snapshot moved aside (live_site.prototype): KPIs now score trunk until a real publish.
- New tasks aimed at the weakest judge sections (Story presentation 10, Animation 23), quest 2, boss TTK, perf guardrail.
