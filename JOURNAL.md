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

## 2026-11-10 QA s2
- scripts/wic_playtest.mjs main-path bot: quest_bot (prologue, 1 run/class) + route bot (Market Square encounters + Bellwarden, 2 runs/class), 60 s game-time soft-lock watchdog in both bots (WIC_SOFTLOCK_S; verified it fires at 3 s), console errors fail a run, harness runs excluded and logged. Trunk 38af3295: playtest_pass_pct 100 (12/12), 485 s wall. judged_game_quality 42.4 (V 38, Anim 23, Combat 54.9, Story 54, UI 43; was 39.9 on ea2b8370).

## 2026-11-10 — session 3 (lead)
- Merged QA (wic_playtest.mjs main-path bot, wic-rescore skill). Trunk 38af3295: judged 42.4, playtest 100, quests 1,
  fps 60, load 0.65. Other nodes had no new commits.
- Weakest judge sections: Animation 23, Visuals 38, UI 43. Added node Environment and VFX (Visuals), UI polish task
  for Gameplay, merge-gate task for QA; notes to Graphics (judge still sees blocky player) and Story (close 3711).

## 2026-11-10 — session 4 (lead)
- Merged Graphics (mob_rig/npc_rig/explore_rig, NPC glbs) and EnvVFX (golden hour, AgX, bloom, class spell VFX) -> b4c82868.
  feel 17/17, items 45, mobs 12+3, quest_bot 4/4; GPU perf 60 fps / 0.48 s. test_classes times out on merge (SwiftShader) -> QA c0ca.
- Judge b4c82868: 45 (Visuals 38->50, Animation 22 unchanged: player still reads as blocky/static) -> note to Graphics.

## 2026-11-10 — session 5 (lead)
- Merged Story quest 2 'Rung Down' -> 5d1d0338. quest_bot 4/4 (main_quests_shipped 2), playtest 12/12 (100).
- Judge 43.5 (V 45, Anim 18.5, Combat 57, Story 52, UI 43): within noise of 45. GPU perf fps 52 (was 60) -> Optimisation 5145.
- Recorder fails (menus/story scene ENOENT) when run alongside the playtest bot: run judge/perf alone, never in parallel.
- New task Story 6b1b: quest 3 in ring 2.

## 2026-11-10 — session 6 (lead)
- Merged Gameplay progression (fast-forward) -> 44f67e9a. progression 10/10, items 57/57, mobs 12+3, quest_bot 4/4.
- Scored: judged 46.2 (best yet; Anim 22->27), quests 2, playtest 100, fps 52, load 0.77. OK'd Gameplay to add bossTTK to quest_bot.

## 2026-11-10 — session 7 (lead)
- Merged Optimisation s2 (shadow proxies, shadow-caster LOD, grid raycast) -> 0657a325. fps 60 (p5 59), draws 2599->1743, load 0.52.
- Judged 0657a325: 45.4 this run, 44.3 averaged in measure.sh (V 48.5, Anim 22-24, Combat 55, Story 50-52, UI 44-45): unchanged within noise, as expected for a perf-only merge.
  quest_bot 4/4 (main_quests_shipped 2). The main-path playtest on this hash is left to service.sh (~35 min).
- Animation is still the weakest section after 3 builds -> note to Graphics to work from the judge's stated reasons.

## 2026-11-10 QA s3
- Merge gate tools/wic_gate.sh: 6 game tests run one at a time, JSON summary; GPU Chrome by default (155 s, all pass on
  0657a325), SwiftShader fallback (683 s with q=low). service.sh step 'gate' logs per hash (gate_ok, gate_tests,
  data/derived/wic_gate_log.jsonl). test_classes fixed on merged trunk (?q=low, 180 s load timeout, per-class output).
  wic_judge judge_meta now has section_spread / quality_spread.

## 2026-11-10 — session 8 (lead)
- service.sh scored 0657a325 playtest 100 -> committed. Merged QA gate (tools/wic_gate.sh, windowed GPU Chrome, 166 s).
  Gate on main: 5/6, test_feel dodgeIFrames flaked (2/2 standalone) -> note Gameplay; suggested retry-on-fail to QA.
- No other node committed since s7; open tasks unchanged (d623, 02a9, 8765, 0eb3, 6b1b, ef24). Notes to Graphics on Animation 22.

## 2026-11-10 — session 9 (lead)
- Merged EnvVFX s2 (interior-mapped window glass, sky reflections, wall weathering) -> fb1294bb. Gate 6/6 (155 s GPU), quests 2.
  Judged 45.2 (Visuals 50, Anim 22, UI 43); fps 60, load 0.66. Playtest left to service.sh.
- Notes: Story fade title card/caption in combat; Graphics replace blob wizard model with a limbed humanoid + cast clips.

## 2026-11-10 — chat (Gaspard Oliviers)
- Direction from Gaspard Oliviers: Gaspard wanted to see the game. A one-off task made the repo public (approval used),
  turned on Pages via Actions and published de19f70 (release world-20261110-0924) with scripts/publish.sh (game KPI and
  market-square scoring skipped); data/derived/live_site now exists, so measure.sh reads the published build.
- Set SITE_URL to https://haveyouseenmyquant-ctrl.github.io/wizards-in-cambridge/ (HTTP 200). Next sessions: publish
  every gated trunk build per standing notes; score the live build (it lacks the skipped KPI runs).
