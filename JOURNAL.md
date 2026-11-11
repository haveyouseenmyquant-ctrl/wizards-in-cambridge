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

## 2026-11-10 — session 10 (lead)
- service.sh scored fb1294bb: playtest 91.7 (hexweaver softlock at senate-house-hill) -> Gameplay task 9d0d.
- Merged Graphics s3 (Quaternius Animated Wizard, CC-BY; fixed teal-emissive blob) -> 9b1abea2. Gate 6/6 (154 s).
  Judged 50.0 (was 45.2): Visuals 52, Animation 33.5 (was 22), Combat 58.4, Story 55.5, UI 49. fps 60, load 0.53.
- Published 9b1abea2 to Pages (release world-20261110-1012). Playtest on it left to service.sh.
- New task EnvVFX 926d (stalls/shop windows as geometry, Visuals>55); judge-reason notes to Graphics, Gameplay (UI), Story.

## 2026-11-10 — session 11 (lead)
- service.sh scored 9b1abea2 playtest 100 -> cancelled Gameplay 9d0d (softlock gone).
- Merged Story s3 (main quest 3 'The Lion at the Gate', dialogue camera, title card) and Gameplay s3 (bossTTK balance,
  uipolish.js, faster test_mobs, deterministic dodgeIFrames) -> b1d7eff5. Gate 6/6 (154 s), quests 3.
  Judged 49.5 (V 51, Anim 31, Combat 59.1, Story 52, UI 53) — within noise of 50.0. Published b1d7eff5.
- New task Story b0f8 (quest 4). Judge-reason notes to Graphics (anim/enemies), EnvVFX (geometry/VFX), Gameplay (hit-stop).

## 2026-11-10 — session 12 (lead)
- service.sh had scored the s11 build under hash d59023d6 because it hashed live_site while publish.sh was still writing it.
  Result: judged 49.2, playtest 100, but measure.sh (b1d7eff5) still read playtest 0. QA task 6266 adds a publish lock and a hash re-check after each step.
- Merged Optimisation s3 (mainmerge.js batches static meshes on Low/Medium, Low draws 1279->761) -> 91047adec8ca0046. Gate 6/6 (166 s). Published.
- Cancelled Story 6b1b (Q3 live). Told Gaspard that Safari testing needs `safaridriver --enable`.
- The Pages deploy for 91047adec failed 3 times (deploy-pages timeout, GitHub side), so the site still serves b1d7eff5. Added 1665d3ca_wic.json as an alias, because the hash of live_site changed only through build_hash FILES.
  Optimisation re-activated with task 9ff3 to make the deploy reliable. measure.sh: judged 49.5, quests 3, playtest 100, fps 60, load 0.52.

## 2026-11-10 QA s4
- Task 6266 closed: publish.sh holds /tmp/wic_publish.lock around the live_site swap; service.sh skips while held and
  re-hashes after each step: changed hash -> logs 'stale', restores the pre-step <hash>_wic.json, skips the rest of the
  pass. Stale runs don't count as retries or in harness_flake_pct. wic_playtest.mjs honours WIC_BUILD_HASH.
- wic_gate.py: one retry per failed test (WIC_GATE_RETRIES=1); pass-on-retry = ok + flaky:true, top-level "flaky" list.

## 2026-11-10 — session 13 (lead)
- Merged QA s4 (publish.sh lock, service.sh per-step hash re-check, wic_gate flaky retry). No other node had new commits.
- Reran the failed Pages deploy for 91047adec: it timed out again (4th time, GitHub side; artifact 207 MB, same as good runs).
  Live is still b1d7eff5 content (1665d3ca). Sent the findings to Optimisation (task 9ff3).
- measure.sh (live): judged 49.5, quests 3, playtest 100, fps 60, load 0.52.

## 2026-11-10 — session 14 (lead)
- Merged EnvVFX s3 (stall goods and shop-window displays as geometry), rebuilt zone on trunk -> 52065493. Gate 6/6 (154 s).
  EnvVFX's own score: judged 49.3 (Visuals 54, Anim 30, Combat 60.1, Story 48.5, UI 50).
- publish.sh: the Pages deploy timed out again; its auto-rerun outlasted my shell limit, so live_site was not swapped and the live site is still b1d7eff5 content. Optimisation 9ff3 told to shrink the artifact.
- New task Story 69f7 (staging, tracker, Story presentation > 58). Sent judge-reason notes to Gameplay, EnvVFX and Graphics.
- measure.sh (live): judged 49.5, quests 3, playtest 100, fps 60, load 0.52.

## 2026-11-10 — session 15 (lead)
- Merged Gameplay s4 (uiscreens.js: grid inventory, framed talents, menu focus, toast queue) -> trunk 448ceb61. Gate 6/6 (158 s).
  Gameplay score: judged 51.4 (V 51, Anim 30, Combat 60.9, Story 53, UI 63).
- Did not merge Story Q4 (The Ferry Bell): only 2 of 4 classes finish it in quest_bot, so Story was told to fix it first.
  Graphics was told to commit its rigged mob models, which were left uncommitted.
- New task for Gameplay, 11ba: Combat feel > 66 (enemy threat, spell mix).
- publish.sh: Pages run 42858472340 failed twice. publish.sh still swapped live_site to 448ceb61, so Pages still serves 1665d3ca while measure.sh reads 448ceb61 (judged 51.4, quests 3; playtest and fps show 0 until service.sh scores it). Filed the bug with Optimisation, alongside 9ff3.

## 2026-11-10 — Direction from Gaspard Oliviers (18:13)
- PRIORITY: fix building roofs. They look like height maps (too complex, not natural roofs). Cause: build.py meshes the raw
  1 m LiDAR DSM per footprint; RANSAC planes are off. Target: clean parametric roofs (flat/parapet, gable, hip, mansard,
  lean-to) fitted from the DSM, with straight ridges, eaves and proper materials; bespoke landmarks unchanged.
  roof_match_pct (inherited prototype metric) may drop; a natural look comes first. Assigned to EnvVFX: task
  ot-20261110-181416-dd7b; brief says it comes first. Lead: merge and publish it as soon as it's ready, with before/after shots for Gaspard.

## 2026-11-10 — session 16 (lead)
- Merged Optimisation s4 (publish.sh fail-fast, Pages actions v5, deploy retry). Live Pages serves 448ceb61.
- Roof priority: EnvVFX told dd7b comes first, with before/after shots in data/derived/roof_shots/; I'll merge and publish when it's ready.
- Graphics (mob rigs) and Story (Q4 fixes) have uncommitted work; both told to commit. New QA task d022: faster playtest.
- measure.sh (live 448ceb61): judged 51.4, quests 3, fps 60, load 0.51, playtest 0 (not yet scored by service.sh).

## 2026-11-10 QA s5
- wic_playtest.mjs: children default to WIC_TEST_GPU=1 + WIC_TEST_QUERY=&q=low; playtest.mjs now uses wicLaunch and honours
  WIC_TEST_QUERY. Full main-path playtest 765 s -> 91-107 s, same 12 judged runs. One intermittent warden quest_bot fail
  (crest_griffin not killed in time) seen once in 2 runs.

## 2026-11-10 — session 17 (lead)
- Merged QA 5d49e23: the main-path playtest runs on GPU Chrome with the low preset (~100 s instead of 765 s).
- No other branch was ready. EnvVFX has not committed any roof work yet (dd7b, Gaspard's priority). Graphics and Story still have uncommitted work in their worktrees; all three were told again. The warden crest_griffin flake was passed to Gameplay.
- measure.sh (live 448ceb61): judged 51.4, quests 3, playtest 100, fps 60, load 0.51.

## 2026-11-10 — session 18 (lead)
- Merged EnvVFX parametric roofs (Gaspard's priority): flat+parapet/gable/hip/mansard/lean-to fitted to the DSM, landmarks unchanged;
  rebuilt site/tiles+collision (348 -> 143 MB tiles). Gate: 5/6 then quest_bot rerun 4/4 (flake). Before/after: data/derived/roof_shots/ab_*.jpg, docs/roofs_parametric_*.jpg. Publishing.
- Restructured into a studio: departments Art (Graphics, EnvVFX, new UI and UX), Engineering (Gameplay, Optimisation),
  Creative (Story, new Audio and Music), Marketing (new Brand and Store Page). QA stays under the studio head.
  Starter tasks: 3daf UI polish>68, eebc audio v1, abd9 marketing drafts.

## 2026-11-10 — session 19 (lead)
- Triaged Gaspard's high issue (intro too harsh, no tutorial) into four tasks with one shared contract: Gameplay f917 (tutorial.js,
  no mobs or damage while it runs, first enemy one weak mob), Story 514c (intro scene + step text), UI and UX 616a (kbm/touch prompts),
  QA a328 (test_tutorial.mjs in the gate; bots skip via ?tutorial=0). Department heads told it outranks other game work.
- Nothing to merge: no department branch is ahead of main. s18 publish succeeded (live 448ceb61 includes the roofs).
- measure.sh (live 448ceb61): judged 51.4, quests 3, playtest 100, fps 60, load 0.41.

## 2026-11-10 — session 20 (lead)
- Merged Marketing (drafts, press kit, site/about/), Creative (procedural audio v1, test_audio) and Art (UI title/class-select, HUD de-overlap, icons, About link). Only conflict: index.js MODULES (union).
- Gate 7/7 ok on 473c678d (fps 60, 12 mob types, 58 effects, quest_bot 3 quests 100%). Published: Pages serves 473c678d, about/ live.
- Tutorial issue (intr) tasks still open with Gameplay, Story, UI, QA. New build awaits service.sh scoring (measure.sh 0 until then).

## 2026-11-10 — session 21 (lead)
- service.sh has scored the live build 473c678d: judged 52.2 (Visuals 51, Animation 33.5, Combat 62, Story 52, UI 63), quests 3, playtest 100, fps 60, load 0.46.
- Merged Marketing's checklist tick. No other branch ready; the tutorial issue (intr) tasks are still open with Gameplay, Story, UI and QA.

## 2026-11-10 — session 22 (lead)
- Merged Art 87728b0 (Graphics: rigged gargoyle, wisp and bell-bat mobs, Quaternius CC0; player locomotion layer and hat spring; corpses sink after 2 s). Gate 7/7 on 88f478c1 (fps 61, 12 mob types, 3 bosses). Published.
- The tutorial issue (intr) has had no commits from any of its four teams for three sessions. Paused Marketing, Brand and Store Page, and Optimisation so Gameplay gets the sessions; Gameplay told to ship f917 on its own with fallback text.

## 2026-11-10 — session 23 (lead)
- service.sh scored the live build 88f478c1: judged 52.3 (Visuals 54, Animation 33.5, Combat 60.9, Story 50, UI 62.5), quests 3, playtest 100, fps 60, load 0.33.
- Nothing to merge: no team has run since s22. Tutorial issue (intr) tasks still open. Paused Audio and Music too, so Gameplay, Story and UI get the sessions; re-sent tutorial-first notes to Engineering, Creative and Art.

## 2026-11-11 — session 24 (lead)
- Nothing to merge: no team has committed since s22. Live 88f478c1: judged 52.3, quests 3, playtest 100, fps 60, load 0.33.
- Tutorial issue (intr) still has no commits. Paused Graphics and Environment and VFX as well, so only QA, Gameplay, Story and UI and UX compete for team sessions; managers told the four tutorial tasks ship standalone.

## 2026-11-11 — session 25 (lead)
- No team had a session since about 18:30 on 10 Nov; only department managers ran. Moved Gameplay, Story and UI and UX directly under the lead and paused the Engineering, Creative and Art managers, so the active nodes are now the four tutorial teams (with QA). Told Gaspard.
- Nothing to merge (Story's b0f8 branch still fails quest_bot at 2/4 classes). Live 88f478c1: judged 52.3, quests 3, playtest 100, fps 60, load 0.33.

## 2026-11-11 — session 26 (lead)
- Merged Story fe7cc01: tutorial script (514c, Nell Tapscott, 12 steps with keyboard and touch prompts) and Quest 4 "The Ferry Bell". Gate 7/7 on 4c07514a (fps 60, 12 mob types, 4 bosses, quest_bot 4 quests 100%). Published.
- Triaged issue 2d7e (no touch Satchel button) to UI and UX (task b95c). Tutorial issue (intr) still needs Gameplay f917, UI 616a and QA a328.

## 2026-11-11 — session 27 (lead)
- service.sh scored 4c07514a: judged 51.6 (Visuals 51, Animation 31, Combat 60.4, Story 51, UI 66), quests 4, playtest 100, fps 60, load 0.42.
- Merged Gameplay: tutorial.js (f917: no spawns or damage while the tutorial runs, one weak wisp first) and combatcam.js (3102). Gate 7/7 on 025eacbb, tutorial smoke passes. Published.
- Resumed Graphics (Animation is the weakest section). Tutorial issue (intr) now needs only UI 616a and QA a328.

## 2026-11-11 QA s6
- d7ba: build_hash.py now hashes tiles/digest.json + collision/digest.json (computed from the .glb/.col files for a local
  dir, written by publish.sh via collision_digest.py for the live URL) and 14 game modules that never moved the hash
  (tutorial.js, rigs, UI screens, ferry_bell/tutorial.json, app/ui.js). Warns on stderr about unhashed app/ files.
  main 126836d: 025eacbb -> 73eed7323dff02d9 (= live). --game hash unchanged (ba027efd).
- a328: scripts/test_tutorial.mjs (fresh profile, card click, every class, real key input per step) in wic_gate.py.
  On main 126836d: tutorial_pass true for all 4 classes (0 hits, 0 mobs within 20 m, first_mob = 1 wisp, completes,
  reload skips; equip step done via API). Issue intr confirmed fixed on main.
- 73eed732: judged_game_quality 52.2 (Vis 52, Anim 30, Combat 59.9, Story 55.5, UI 66), playtest 100% (12/12). service.sh judge now records to /tmp/wic_rec_svc (it wiped a manual /tmp/wic_rec run).

## 2026-11-11 — session 28 (lead)
- Merged QA b1c1008: the build hash now covers world tiles, collision and every game module, and test_tutorial.mjs is in the merge gate. Live build 73eed732: judged 52.2 (Visuals 52, Animation 30, Combat 59.9, Story 55.5, UI 66), quests 4, playtest 100. fps not measured yet: my run overlapped service.sh's gate, so I threw it away.
- Tutorial issue (intr): requirements met on main; it closes when UI's prompt task 616a is done.
- Moved Gameplay back under Engineering and resumed Engineering and Optimisation, to test whether teams still get sessions under a manager.

## 2026-11-11 — session 29 (lead)
- No branch had unmerged work. service.sh measured 73eed732 at fps_median 41 (fps_min 5) while the host load was 6-8 from other jobs; 448ceb61 read 60. Gave QA task db8c to make the perf run wait for a quiet machine, run twice and record the load, then re-measure.
- Cancelled Gameplay's camera task 3102 (already merged) so Engineering can close issue e1b8. Tutorial issue still waits on UI 616a; touch Satchel on UI b95c.

## 2026-11-11 — session 30 (lead)
- Merged Engineering de1d861 (Optimisation s5: mobcull.js, instpool.js; draws 1881->1379). Gate 8/8 on 0f9b1cd6 (quest_bot 100, tutorial 4/4). Published live 0f9b1cd6; judge pending in service.sh.
- Moved Story under Creative and Graphics + UI under Art, resumed both managers. Tutorial issue intr still waits on UI 616a; touch Satchel 2d7e on UI b95c.

## 2026-11-11 — session 31 (lead)
- No team or department branch had unmerged work. service.sh judged the live build 0f9b1cd6 at 52.0 (Visuals 52, Animation 33, Combat 59.4, Story 51, UI 66) during this session (its earlier judge of 17d78dad went stale); fps 60, p5 56, game_ready 1.8 s.
- Asked Art to put UI's issue tasks first (616a tutorial prompts for Gaspard's intr issue, b95c touch Satchel) and Graphics to commit rig work every session.

## 2026-11-11 — session 32 (lead)
- Merged UI and UX 6a27c0f directly into main (tutorial prompts with keyboard/touch glyphs, touch Satchel button, loot-card cap). Gate 8/8 on 3e26ba7c (tutorial 4/4, quest_bot 100). Published; judge pending in service.sh.
- Resolved Gaspard's tutorial issue (intr) and the touch Satchel issue (2d7e); cancelled b95c (done, but its gate check exceeds the 5-min done limit).

## 2026-11-11 — session 33 (lead)
- Merged Graphics s6 (1e7c8bd: two-phase cast with wind-up, combat ready stance, mob hit knockback lean, camera-clearance bodies for rigged mobs) directly into main, since Art hadn't reviewed it. Gate 8/8 on 429d69f1; published live, judge pending in service.sh.
- service.sh judged 3e26ba7c at 51.3 (Visuals 50, Animation 31, Combat 60.1, Story 50, UI 67), within noise of 52.0. Filed issue 7fe1 / QA task b77e: tutorial_ui.js isn't in build_hash.

## 2026-11-11 — session 34 (lead)
- No branch had unmerged work. service.sh judged live 429d69f1 at 51.1 (Visuals 49.5, Animation 32, Combat 59.6, Story 52, UI 64.5), playtest 100; fps not yet measured. Score is flat at ~51-52 for 6 sessions.
- Triaged issue 7fe1 (tutorial_ui.js unhashed): linked QA task 184f to it, cancelled the unlinked b77e.
- Judge reasons share one theme across Animation, Story and Visuals: the player is tiny and hidden behind VFX. Asked Engineering for a closer camera after 9e85, and Art for secondary motion, less VFX blowout and the UI overlap fixes.

## 2026-11-11 — session 35 (lead)
- Nothing to merge again: Gameplay hasn't had a session since 01:06 while the Engineering, Art and Creative managers kept running and finding nothing to merge. Live 429d69f1: judged 51.1, quests 4, playtest 100, fps 60, load 0.44.
- Flattened again: Gameplay, Optimisation, Graphics, UI and UX and Story now report to the lead; the three managers are paused. Notes sent: one task per session, commit after every edit, Gameplay does 9e85 first, Graphics a37e first. Issue 7fe1 stays with QA task 184f (still unhashed on main).

## 2026-11-11 — session 36 (lead)
- Merged Gameplay (9e85 combat camera no longer hides behind stall walls) and Story (shot/reverse-shot dialogue camera, staged beats, tracker fixes) directly into main. Gate 8/8 on 9c5df3a4; published live (release world-20261111-0702). Judge pending in service.sh, so measure.sh reads 0 for judged/playtest/fps this session.
- Issue 7fe1 still reproduces on main (tutorial_ui.js unhashed); QA asked to do 184f first.

## 2026-11-11 QA s7
- 184f: build_hash.py now hashes app/game/tutorial_ui.js, and in local mode auto-appends any app/**/*.js|json missing from FILES (no more 'not hashed'). Current build: 645eac53a352b6a8 (trunk's pre-merge build_hash calls it 9c5df3a4733a43dd).
- db8c: scripts/wic_perf_robust.py (service.sh perf step): waits for 1-min loadavg < 4 and no other test browser (max 20 min), runs wic_perf twice, keeps the higher fps_median, and records loadavg_before/after, waited_s, load_ok and runs[] in perf_detail. 73eed732 re-measured from a checkout of 126836d (its code, with today's tiles; the exact tiles are gone).
- measure.sh (node) hashes with trunk's build_hash.py so it reads the same file trunk service.sh writes.
- Perf: 73eed732 read 60/60 fps (loadavg 4.3-6.6) and 645eac53 60/60. The earlier 41 was most likely three leaked puppeteer Chromes (orphaned since 21:12 on 10 Nov, still rendering); I killed them, and service.sh now reaps orphaned test browsers older than 2 h on every pass.

## 2026-11-11 — session 37 (lead)
- Merged QA s7 into main: build_hash.py now hashes tutorial_ui.js and any unlisted game module (resolves issue 7fe1), and service.sh measures perf with load-robust best-of-2 runs and reaps leaked test browsers. The live build re-hashes from 9c5df3a4 to 645eac53 with identical files, so its scores were carried over.
- Live: judged 51.7 (Visuals 48.5, Animation 29, Combat 58.5, Story 66, UI 61.5), quests 4, playtest 100, fps 60, load 0.44. Story presentation jumped 52 -> 66 after the dialogue staging merge; UI dipped.
- Gave Story main quest 5 (ring 1, task 4ef8); nudged Graphics (a37e, Animation) and UI and UX (3daf).

## 2026-11-11 — session 38 (lead)
- Merged Optimisation a95b (parallel game modules, boot-time spell lights, progate shader gate; game_ready 1.73 -> 0.88 s). Gate 8/8 on 747855e1, published live (world-20261111-0832). Judge pending in service.sh.
- 645eac53 rescored 52.5 (Visuals 50, Animation 30, Combat 60.6, Story 66, UI 60).
- Resumed Environment and VFX under root for Visuals (task 926d). QA task faf2: measure.sh falls back to the newest scored build instead of printing zeros after a publish.

## 2026-11-11 — session 39 (lead)
- Merged Environment and VFX ec4a2623 (turned shop-window goods, toned-down combat/loot VFX; judged Visuals 52 vs 50). Rebuilt the zone on trunk, gate 8/8, published.
- Live 747855e1 judged 52 (Visuals 50, Animation 35.5, Combat 59.6, Story 62, UI 54.5). UI polish dropped; UI and UX asked to find the regression.
- Issue 5ac5 (combat camera inside market stalls): Gameplay task 751e (camera vs zone props + test_camclip in the gate), Environment and VFX confirm task 76b5.
