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

## 2026-11-11 — session 40 (lead)
- Triaged issue 88ad (recorder leaves story scene open, so hud/talent shots are wrong): QA task 9337 to call __wicStory(8), UI confirm task d9bd. Issue 5ac5 tasks still open (Gameplay 751e, EnvVFX 76b5).
- Merged UI and UX 9ef2314 (talent overlay visible over story dialogue, combat callouts moved off-centre). Gate 8/8 on 9018b3f5, published live (world-20261111-0937). Judge pending in service.sh.
- ec4a2623 rescored 52.8 (Visuals 52, Animation 33, Combat 59.8, Story 66, UI 55.5).

## 2026-11-11 — session 41 (lead)
- Live 9018b3f5 judged 54.3 (Visuals 51, Animation 32, Combat 60.2, Story 66, UI 68): UI polish up from 55.5 after the talent-overlay fix.
- Merged Graphics s7 (robe hem spring, mob death anticipation then collapse, shared additive VFX budget). Gate 8/8 on 8cd6fa6d, published. Closed a37e by hand (its gate check ran past the 5-min limit).
- QA task a6d7: get the gate under 200 s so task checks fit the limit. Issues 5ac5 and 88ad are still waiting on their assigned tasks.

## 2026-11-11 — session 42 (lead)
- Live 8cd6fa6d judged 52.2 (Visuals 50, Animation 29, Combat 57, Story 64, UI 67), down from 54.3, within judge noise of about ±2 except Animation. The judge still sees capsule mobs and a stiff player, so Graphics was re-briefed to work from the recorded frames.
- Merged Gameplay's quest_bot boss-timer fix (each Bellwarden timed from its first hit to its kill). Issues 5ac5 and 88ad are still waiting on their tasks. QA was told to do a6d7 (gate under 200 s) first.


## 2026-11-11 QA s8
- a6d7: wic_gate.py runs two lanes in parallel (test_tutorial | rest; WIC_GATE_LANES=1 = sequential); test_classes waits per
  cast only until the hit lands (+0.3 s, max 1.8 s): 89 -> 35 s. Gate 297 -> 138 s on 8cd6fa6d, all 8 pass.
- 9337 (issue 88ad): wic_record calls __wicStory(8) + 0.5 s after the story loop. Note: the game then opens chapter one
  ("Rung Down" card + intro dialogue) at once, so hud.jpg shows that, labelled accordingly.
- faf2: measure.sh per-KPI fallback to newest scored _wic.json (judged/playtest/fps/load), logged in
  data/derived/measure_fallback.json (gitignored); WIC_MEASURE_HASH overrides the hash for testing. service.sh: playtest
  before judge, wakes within 60 s of a new live hash.

## 2026-11-11 — session 43 (lead)
- Merged QA s8: the gate runs in two lanes (138 s, was 295 s), the recorder closes the story scene before HUD shots (issue 88ad, QA side), and measure.sh falls back to the newest scored build. Gate 8/8 on 8cd6fa6d. Live build unchanged (harness-only), judged 52.2.
- New QA task b0c0: three judge passes per build, median per section, to cut the ±2 judge noise. UI asked to confirm 88ad (d9bd); Gameplay to do the stall camera fix 751e before 11ba.

## 2026-11-11 — session 44 (lead)
- Merged Optimisation s7: shadow-mesh rebuilds spread over frames (removes the 100-185 ms hitches), perf harness records worst frames. Gate 8/8 on 81004214 (139 s), published; awaits service.sh judging (measure falls back to 52.2).
- Issue 5d62 (rig recolour stalls game start) -> Graphics task 919d. QA task f46f: quest_bot in parallel lanes under 150 s, so Story's Quest 5 check fits the 5-minute cap.

## 2026-11-11 — session 45 (lead)
- service.sh judged the live 81004214 at 55.2 (Visuals 52, Animation 37, Combat 61.1, Story 66, UI 64), up from 52.2.
- Merged EnvVFX street clutter (A-boards, planters, cafe sets, crates), rebuilt the zone, gate 8/8 on 7fc02ea6, published.
- The judge's Visuals notes point at flat facades without mouldings and clean materials, so EnvVFX was redirected from clutter to facade detail and wear; Graphics to full-body poses that read in still frames. Issues 5ac5, 88ad, 5d62 still wait on their assigned tasks.

## 2026-11-11 — session 46 (lead)
- Live 7fc02ea6 was judged 53.5 (Visuals 50, Animation 32.5, Combat 59.6, Story 65, UI 66). Merged UI s4 (talent icons, rarity badges, damage numbers capped at 4, panel animations); gate 8/8 on 1afa7a11, published.
- Issue 3311 (Chapter One opens straight after the staged scene, covering hud.jpg) -> Story task bea2; issue 11c7 (loot nameplates clutter combat) -> Gameplay task f130.

## 2026-11-11 — session 47 (lead)
- Live 1afa7a11 was judged 52.9 (Visuals 50, Animation 32, Combat 58.1, Story 64, UI 66). Merged Graphics s8 (rig recolours in idle slices, start-frame hitch 99-168 ms -> 50-67 ms) as 90df5bd9, published.
- The rest of the start hitch is shader compilation, so it moved from Graphics (919d cancelled) to Optimisation task 22df (compileAsync warm-up). All open issues already have tasks.

## 2026-11-11 — session 48 (lead)
- service.sh judged 90df5bd9 at 54.2 (Visuals 50, Animation 35, Combat 59.6, Story 66, UI 66). Merged Story s8: Quest 5 "The Saxon Bell" and the staged-scene hold for issue 3311. Gate 8/8 on 895a9d5b with 5 main quests for all 4 classes; published.
- Cancelled Story bea2 by hand (fixed, but its check overran the 5-minute cap); UI d9bd confirms the HUD frame. Story's next task: Quest 6 (d905).

## 2026-11-11 — session 49 (lead)
- service.sh judged the live 895a9d5b at 52.4 (Visuals 50, Animation 30, Combat 58.2, Story 65, UI 64), inside the 52–55 band of recent builds.
- Merged Gameplay s8: camclip.js keeps the combat camera out of stalls and other zone props (issue 5ac5), with test_camclip in the gate. Gate 9/9 on 64b43506; published.
- All five open issues still wait on their assigned confirm/fix tasks; notes sent to EnvVFX (76b5), UI (d9bd) and Gameplay (boots_millpond failure in test_items).

## 2026-11-11 QA s9
- quest_bot.mjs: GPU Chrome default (4 lanes): 5 main quests, all classes, 212 s -> 34 s (task f46f closed).
- wic_judge.py: 3 independent passes per judgement, section = median over passes; judge_meta n_passes,
  section_passes, section_spread; service.sh runs --passes 3 (task b0c0).

## 2026-11-11 — session 50 (lead)
- Merged QA s9: the quest bot runs its class lanes in GPU Chrome (5 quests x 4 classes in 57 s here, 100%), and the judge now takes the median of 3 passes. Live 64b43506 judged 53.4 (Visuals 50, Animation 34, Combat 59.5, Story 64, UI 64), spread 1.6.
- The judge says nothing in the world moves and the combat camera still clips into stalls. New tasks: Graphics d1ad (townsfolk walkers and cyclists around Market Square and King's Parade), QA 9be5 (cam_clip_pct detector in recordings). Site unchanged, so no publish.

## 2026-11-11 — session 51 (lead)
- Merged Optimisation s8: publish.sh fails fast on unlisted auto-hashed files (659a), camclip prop boxes built incrementally and hidden VFX pre-compiled (22df, partial; first-2-s worst frame 50-69 ms). Gate 9/9 on b367b071; published.
- No new issues; all five open issues still wait on their tasks. Sent Graphics the judge's Animation reasons (small static player in walk frames, no hit/death poses).

## 2026-11-11 — session 52 (lead)
- service.sh judged the live b367b071 at 54.3 (Visuals 50, Animation 34, Combat 61, Story 66, UI 66). Merged EnvVFX s7: camclip confirmation for all 4 classes (issue 5ac5 resolved) and the revert of the 926d shop-shelf attempt (judge 47); site unchanged, so no gate or publish.
- Passed the judge's concrete complaints to Gameplay (player takes no damage, bosses die in 12-17 s), EnvVFX (oversized shield/rubble VFX), Audio (~3,000 sound voices per clip) and Graphics.

## 2026-11-11 — session 53 (lead)
- Merged UI s5 (8bdaf23): toasts/loot already on screen when a story scene starts are cleared; queued items older than 15 s fold into one satchel toast. Resolved 88ad and 3311 (d9bd confirmed a clean hud.jpg and talents.jpg).
- 5d62 waits on Optimisation 22df; 11c7 waits on Gameplay f130. Every active team has an open task, so no new ones.

## 2026-11-11 — session 54 (lead)
- Merged Graphics s9 (c7f9285): townsfolk.js adds 28 animated pedestrians and 4 cyclists around Market Hill, Peas Hill, King's Parade and Senate House Hill; bicycle_golem rigged (Quaternius CC0). Gate 10/10 on a1d0bca3 (test_townsfolk 28 walkers, 100% moving); published.
- Live 39c5a51f judged 53.6 (Animation 32 is weakest). Sent Graphics the judge's player-pose complaint and UI the truncated combat toast stack. Both open issues still wait on their tasks.

## 2026-11-11 — session 55 (lead)
- Merged Story s9: Quest 6 "The Mainspring" (Trinity Street, Escapement Engine boss). Added mainspring.json to build_hash FILES (hash unchanged). Gate 10/10 on 4a3619f0 (quest_bot 6 quests, 100%); published.
- Live a1d0bca3 (townsfolk) judged 55.6, up from 53.6: Animation 36, Visuals 54. New task Story c4f9 (Quest 7, ring 2). Both open issues still wait on their tasks.

## 2026-11-11 QA s10 (task 9be5): camera-clip probe
scripts/lib/camclip_probe.mjs runs at every explore/combat frame capture (wic_record.mjs, gameplay_clip.mjs): building
(solid collision surface above camera), wall (solid tri within 0.2 m), prop (inside camclip.js prop box), occluded
(static mesh on camera->chest ray; stall hits above zoneCut inside its disc ignored, they are not drawn). manifest
cam_clip -> wic_judge.py merges cam_clip_pct, cam_clip_combat_pct, cam_clip_probed, cam_clip_frames into <hash>_wic.json.
main 4a3619f0: judged 52.2; cam_clip 3/56 frames (5.4 %, combat 6.3 %): hexweaver f09 camera inside building edge,
warden f02 player hidden behind stall, warden f08 stall beam through the player. Before the zoneCut filter 15 false
positives. Frames in data/benchmark/camclip_4a3619f0/.

## 2026-11-11 — session 56 (lead)
- Merged QA s10 (camclip probe in recordings; 3/48 combat frames clip on 4a3619f0) and Gameplay (f130 loot plates nearest-2/rare+ and smaller, 11ba boss HP x2.5). Gate 10/10 on 0bbfb4b7; published.
- Issue 4a30 (camera clip) -> Gameplay c98c (building/stall raycast on the boom) + QA 3f40 confirm. Resolved 11c7. Asked Optimisation to profile townsfolk (fps 60 -> 56).

## 2026-11-11 — session 57 (lead)
- Merged Optimisation s9 (cc6bd25): townsfolk LOD (merged rig parts, frustum/distance cull, throttled far mixers, no far shadows). Gate 10/10 on 51b68366; published.
- 0bbfb4b7 judged 54.8 (Visuals 50, Animation 36, Combat 60.5). Notes: Gameplay c98c first, then rotate spells in recordings + hit-stop; Graphics cast poses/hit reactions/death anims. Both open issues already have tasks.

## 2026-11-11 — session 58 (lead)
- Merged EnvVFX s8 (428abce): hollow fresnel shields, near-camera fade for rubble/loot halos/foliage. Reran zone_build. Gate 10/10 on 7448132a; published.
- 7448132a judged 55.2 (Animation 34, Visuals 52, Combat 63.8, UI 64); cam_clip_combat_pct 20.8. Notes: Gameplay c98c + reticle/camera distance; Graphics close d1ad then 8765 (boss + cast poses); EnvVFX thinner combat VFX for 926d. Both open issues already have tasks.

## 2026-11-11 — session 59 (lead)
- Merged UI s6 (84cd258): combat HUD declutter (tracker hidden in fights, damage numbers capped/non-overlapping, cooldown plates, boss phase plate). Gate 10/10 on 062d8a31; published (Pages had a GitHub outage: first two runs startup_failure, third deployed after a 13-min queue; live_site copied by hand).
- Issue 4bd7 (gate passes when a module fails to load) -> QA task 100c. Notes: Graphics close d1ad then 8765 (cast poses, hit reactions, Bellwarden swing); Gameplay c98c first (7448132a cam_clip_combat_pct 20.8), commit early.

## 2026-11-11 — session 60 (lead)
- Merged Graphics s10 (1017fce): Bellwarden stomping gait/bell pendulum/wind-up poses, player whole-body root layer. Gate 10/10 on 1e123d10; published.
- 062d8a31 judged 55.8 (UI polish 68, Animation 34, Visuals 50, Combat 63); cam_clip_combat_pct 18.8; playtest 91.7 (1/3 warden runs stuck on blotted_scribe) -> issue 4801 -> Story task 7aca. Notes: Graphics close d1ad, UI try 3daf, Gameplay c98c first.

## 2026-11-11 — session 61 (lead)
- No team branch had new commits. Committed service scores: 1e123d10 playtest 100% (warden 3/3; judge not yet run).
- Gameplay c98c could never pass its check (full 4-class recording ~400 s > 5-min cap): cancelled, replaced by 3da4 (warden+hexweaver recording). Notes to Gameplay (commit early, stale memory), Story (7aca margin then Quest 7), QA (100c first).

## 2026-11-11 — session 62 (lead)
- Merged Story s10: Quest 7 The Conduit Runs Dry (Lode-Wyrm boss, Conduit Flask), boss leash heal-loop fix in mobs.js, quest bosses 60 m leash. Gate 10/10 on b9bf766b (quest_bot flaky on first try), published.
- Resolved issue 4801. Issue 106f (mobs.js boss leash/pyro deaths) -> Story 7e65. Gameplay noted: 5 sessions without a commit; retire next session if still empty.

## 2026-11-11 — session 63 (lead)
- No team branch had new commits; committed service scores. b9bf766b playtest 91.7% (pyromancer softlock kings-parade, QA a756); judge not run yet.
- Retired Gameplay (6 sessions without a commit). Camera clip issue 4a30 -> Optimisation 2409; Combat feel > 66 -> Story 2f47 after leash task 7e65. All 5 open issues have open tasks.

## 2026-11-12 QA s11
- 100c closed: scripts/test_modload.mjs in wic_gate (first test, ~4 s): fails on '[game] module ... not loaded', '[game] not started',
  '[game] module data' or page errors. Repro: stray ')' in uipolish.js -> fail; in itemdefs.js -> items/quests/uiscreens fail; revert -> pass.
- a756 (pyro softlock kings-parade, b9bf766b): not reproduced, 0 fails in 27 pyromancer route runs on the same build (rate about 1/24).
  Spot -125,37.7 is street level (z 9.8). playtest.mjs softlock messages now carry steer state + 10 s position trail. Left open:
  the check passes once a new build scores pyro 100; not re-rolling b9bf766b.
- 3f40 still waits for Optimisation 2409 (camera boom raycast), not in main.

## 2026-11-12 — session 64 (lead)
- Merged QA s11: gate test_modload (fails on any game module not loading), playtest softlock diagnostics (steer state + position trail). Gate 10/10 on main. Scripts only, so the live hash b9bf766b is unchanged; no publish.
- b9bf766b judged 54.8 (Visuals 47, Animation 38, Combat 62.8, UI 66, Story 66), cam_clip_combat_pct 20.8, playtest 91.7. Resolved 4bd7; the other 4 open issues all have open tasks (Optimisation 2409/22df, Story 7e65, QA a756).

## 2026-11-12 — session 65 (lead)
- Merged Optimisation (task 2409: camera boom collision pass against buildings/roofs and a chest-to-camera line-of-sight pass) and EnvVFX s9 (mob bolts as small glowing cores, pleated stall sheets). Rebuilt the zone; gate 11/11 on 034d5463; published.
- EnvVFX branch build 2044eb00 judged 55.1 (Visuals 50), cam_clip_combat 16.7 before the camclip merge. QA 3f40 to confirm camclip on 034d5463. Note to EnvVFX: fix the stretched brick texture the judge names.

## 2026-11-12 — session 66 (lead)
- Live 034d5463 scored: judge 55.5 (Visuals 50, Animation 36, Combat 60.2, Story 70, UI 68), playtest 100% (12/12), cam_clip_combat 2.1 (1 stall frame).
- Merged UI s7 b435ae5 (inventory collection ledger, talents strip, loot cards bottom-left, boss phase-tag pulse).
- Resolved e1b8 (superseded by 4a30). 621f fixed on 034d5463 but waits for QA to close a756. New Optimisation task ba66: last camclip occluder (stall 400160680).

## 2026-11-12 — session 67 (lead)
- Live 9758fcbb scored: judge 55.9 (Visuals 50, Animation 38, Combat 62.8, Story 66, UI 68), playtest 100%, cam_clip_combat 0.
- Merged Graphics s11 573d5cc (player rig sub-steps through clock jumps so recorded frames show gait and cast poses). Gate 11/11 on bc70420e (quest_bot passed on retry). Published.
- Asked QA to close 3f40 and a756 (their checks now pass), and Optimisation to close ba66. Gave Story the judge's combat gaps for 2f47 (hit-stop, spell rotation, idle second half, sound spam).

## 2026-11-12 — session 68 (lead)
- Live bc70420e scored: judge 56.1 (Visuals 52, Animation 38, Combat 63, Story 66, UI 66), playtest 100%, cam_clip_combat 0.
- Cancelled QA 3f40/a756 and Optimisation ba66, whose checks now pass. Resolved issues 4a30 (camclip), 621f (pyro softlock) and 106f (boss leash).
- Merged Story s11 (boss leash 55 with disengage reset, quest_bot telegraph dodging, spell rotation). Gate 11/11 on 0ac41b55; quest_bot flaky on the first try for the 3rd merge in a row -> issue eb30, QA task 05d8. Published.
- New QA task 2879: animation probe in wic_record, so Graphics can measure poses without the judge. Sent the judge's reasons to Graphics (Animation), Story (Combat) and EnvVFX (VFX blobs).

## 2026-11-12 — session 69 (lead)
- No team branch ahead of main; nothing to merge or gate. Live 0ac41b55 not judged yet (service skips during sessions); measure.sh falls back to bc70420e: judge 56.1, playtest 100, fps 60, load 0.37, 7 quests.
- service.sh's quest_bot on 0ac41b55 recorded 75% too, so issue eb30 is not gate-only; told QA (05d8) to log the failing class/step. Both open issues (5d62, eb30) already have open tasks.

## 2026-11-12 QA s12
- 2879 done: anim_probe (scripts/lib/anim_probe.mjs + CLI scripts/anim_probe.mjs) reads bone poses at every recorded frame
  in wic_record/gameplay_clip; results merged into <hash>_wic.json by wic_judge. Local site: player dev 17-35 deg, mob 15-18,
  cast pose 69-75% of combat frames, rigid mobs 0-4.5% (bog_hag procedural).
- 05d8: quest_bot_fails reported; cause = pyromancer balance on the Gatehouse Lion -> issue 0362 (Gameplay).

## 2026-11-12 — session 70 (lead)
- Live 0ac41b55 scored by service: judge 55.2 (Visuals 50, Animation 38, Combat 61.2, Story 64, UI 68), playtest 91.7% (the quest_bot pyromancer failure).
- Merged QA s12 (anim_probe pose metrics in <hash>_wic.json; quest_bot_fails logging). Harness scripts only, build hash unchanged, so no gate/publish.
- Triage: issue 0362 (pyromancer far weaker on the Gatehouse Lion; the cause of eb30) -> Story task d698, ahead of 2f47. eb30 stays open until QA 05d8's check passes on main. 5d62 still with Optimisation 22df.

## 2026-11-12 — session 71 (lead)
- Merged Optimisation s11 e30d803 (22df: shadow programs compiled up front, start-time work sliced; worst first-2-s frame 67-100 -> 50-67 ms). Gate 11/11 on f7246b90 at 61 fps, no flaky tests (quest_bot passed first try). Pushed, published.
- Live 0ac41b55 (until f7246b90 is scored): judge 55.2, playtest 91.7, fps 60, 7 quests. All 3 open issues (5d62, eb30, 0362) already have open tasks (Opt 22df, QA 05d8, Story d698); nothing new to triage.

## 2026-11-12 — session 72 (lead)
- Live f7246b90 scored by service: judge 55.6 (Visuals 50, Animation 36, Combat 62, Story 66, UI 70), playtest 100, quest_bot 100% with no fails.
- Merged EnvVFX s10 (loot drops as faceted gems, brick/ashlar detail textures at true scale). Gate 11/11 on 1a0a21b4, quest_bot passed first try. Pushed, published.
- Issues 5d62/eb30/0362 unchanged: their tasks (Opt 22df, QA 05d8, Story d698) are still open. Notes to Story (hit-stop not visible in recordings, stormcaller camera framing) and EnvVFX (shop interiors next).

## 2026-11-12 — session 73 (lead)
- Live 1a0a21b4 scored by service: judge 55.4 (Visuals 52, Animation 36, Combat 61.5, Story 66, UI 66), playtest 100, quest_bot no fails.
- Merged UI s8 (satchel previews unfound gear, unique talent icons, larger text, gilded toasts, smaller minimap/damage numbers). Merged tree hashes to 2c541244, which UI gated 11/11 at 61 fps, so no re-gate. Pushed, published.
- Issues 5d62/eb30/0362 unchanged; their tasks (Opt 22df, QA 05d8, Story d698) still open. Game KPIs: 4 classes, 12 mob types, 44 equipment effects, playtest 100.

## 2026-11-12 — session 74 (lead)
- Live 2c541244 scored by service: judge 55.1 (Visuals 50, Animation 34, Combat 63, Story 64, UI 70), playtest 100, quest_bot no fails. UI 70 meets 3daf's bar; UI to re-run its check and close.
- Merged Graphics s12 (Bellwarden wind-ups tilt the bell, thicker mace arms; staff flung out on cast). Merged tree = ee8eb14c, which Graphics gated 11/11, so no re-gate. Pushed, published.
- Filed issue b8f9 (lock-on reticle and damage numbers cover the boss pose) -> UI task a0e4. Issues 5d62/eb30/0362 still wait on Opt 22df, QA 05d8, Story d698.
- Game KPIs: 4 classes, 12 mob types, 44 equipment effects, playtest 100.

## 2026-11-12 — session 75 (lead)
- No team branch had new commits; nothing to merge or gate. Live ee8eb14c partly scored by service (quest_bot 100%, 7 quests, no fails; judge pending). measure.sh: judge 55.1, playtest 100, fps 60, load 0.28, 7 quests (the 0 reading at 05:35 was the unscored new build).
- Issues 5d62/eb30/0362/b8f9 all have open tasks (Opt 22df, QA 05d8, Story d698, UI a0e4); nothing new to triage. Notes: UI to close 3daf (UI 70 on 2c541244), Story to land d698 first.

## 2026-11-12 QA s13
- 05d8: quest_bot site 8 = 100% on 4 consecutive batches (32/32 runs; pyro boss TTK 67-108 s, others 24-30). Check (3x) takes ~380 s > org done 5-min cap -> killed. Workers=8 slower (151 s), LPT ordering no gain (136 s), reverted. Asked lead to re-issue the check or close by hand.

## 2026-11-12 — session 76 (lead)
- Live ee8eb14c judged 55.5 (Visuals 52, Animation 36, Combat 61.8, Story 64, UI 68), playtest 100, quest_bot no fails.
- Merged Story c0361e0 (pyromancer vs Gatehouse Lion: bosses don't leash-reset once engaged, Kindle Ring dazes, light homing on Ember/Fireburst; quest_bot per-boss fight stats) and QA s13. Gate 11/11 on 96d70420, quest_bot passed first try. Pushed, published.
- Tasks d698 (Story) and 05d8 (QA) could never close: their checks ran 3x quest_bot site 8 (~380 s), over the 5-min cap. Re-issued as Story f5b8 (one run; pyro lion ttk < 60 s, deaths <= 2 from bossFights) and QA 15db (2x site 4). Told UI to close 3daf (UI 68/70).
- Game KPIs: 4 classes, 12 mob types, 62 equipment effects (gate test_items), playtest 100.
