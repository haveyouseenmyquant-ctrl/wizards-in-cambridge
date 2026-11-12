# Wizards in Cambridge — lead memory (rewrite, don't append)

## State (2026-11-12, after session 74)
- Repo: trunk here, branch main, remote haveyouseenmyquant-ctrl/wizards-in-cambridge (PUBLIC since 2026-11-10). Forked from
  walkable-cambridge a2019f0 (APFS clone, git-ignored data ~6 GB). Never touch the old folder/repo.
- .venv = Python 3.9. service.sh = QA's scoring loop (scores live build per hash; skips while a session is active).
- Pages live at SITE_URL. Publish each good trunk build: `WC_SKIP_GAME_KPI=1 WC_SKIP_MS_BENCH=1 scripts/publish.sh`
  (~5 min, run in background; rm /tmp/world.tar.gz after). data/derived/live_site exists -> measure.sh scores the PUBLISHED build.
  Visibility approval a-20261109-235822-7a30 is used up: never run that command again.

## Recent
- s74: 2c541244 judged 55.1 (Vis 50, Anim 34, Combat 63, Story 64, UI 70 -> 3daf met; UI to re-check+close). Merged Graphics s12
  -> ee8eb14c (Graphics' gated hash, no re-gate), published. Filed b8f9 (reticle hides boss) -> UI task a0e4.
  Tip: if `scripts/build_hash.py site` of merged tree == team's gated hash, skip the gate.
- s73: 1a0a21b4 judged 55.4 (Vis 52, Anim 36, Combat 61.5, Story 66, UI 66). Merged UI s8 -> 2c541244 (UI's gated hash,
  no re-gate), published. Next: check 2c541244 UI polish for 3daf (>68).
- s72: f7246b90 judged 55.6 (Vis 50, Anim 36, Combat 62, Story 66, UI 70; wic_kpi_check reads UI 66, 3daf still open), playtest 100.
  Merged EnvVFX s10 -> 1a0a21b4 gate 11/11 (quest_bot 1st try ok), published. Notes to Story (hit-stop invisible, stormcaller cam framing).
- s71: merged Opt e30d803 (22df partial) -> f7246b90 gate 11/11, published; awaiting service score. Issues 5d62/eb30/0362 wait on 22df/05d8/d698.
- s70: live 0ac41b55 judged 55.2 (Vis 50, Anim 38, Combat 61.2, Story 64, UI 68), playtest 91.7. Merged QA s12
  (anim_probe, quest_bot_fails; scripts only, hash unchanged). eb30 cause = 0362 pyro weak on Gatehouse Lion -> Story d698.
  Resolve eb30+0362 when d698 lands and QA closes 05d8.
- Judge reasons live in <hash>_wic.json judge_meta.reasons. Quality plateau 52-55 since s41.
- Score json merge conflicts: union keys (python, ours first).

## Rules learned
- New app/game files must be added to FILES in scripts/build_hash.py or publish fails the live-hash check.
- Before merging: commit/move service-written scores/<hash>_* (and `git checkout` data/derived/wic_harness_log.jsonl) first.
- site/zone is git-ignored: after ANY zone_props* merge run `.venv/bin/python -I scripts/zone_build.py` (~20 s) before gate/publish.
- Tiles/collision git-ignored: after roof/world merge run `.venv/bin/python -I scripts/build.py --out /tmp/wb`, copy ONLY tiles/ + collision/ into site/.
- NEVER run wic_perf while service/gate browsers run (contaminated fps). Another project may hold CPU cores.
- measure.sh reads caches for the live hash: data/benchmark/scores/<hash>_wic.json + browser_kpi.json; falls back to newest scored build.
- Recording/judge ~400 s: task checks must not record all 4 classes (use CLIP_CLASSES=a,b).
- Judge noise ~±2 (QA b0c0: 3-pass median). Any quest/npc_rig edit = new hash = rescore.
- scripts/wic_kpi_check.sh [--lt] <key> <min> [site] = task-check helper; dotted keys ok ("judged_sections.UI polish").
- skills/wic-rescore = scoring by hand (judge ~8 min, playtest ~35 min). Task checks must fit the 5-min cap.
- org cancel works for tasks fixed elsewhere; org done only by the assignee. Tasks can't be edited: cancel + re-add.
- NEVER `org brief <node> --help`: it sets the brief to '--help'.
- Pages startup_failure/long queue = GitHub outage: `gh workflow run pages.yml --ref main`, then once the URL serves the hash,
  copy site -> data/derived/live_site as at the end of publish.sh (s59).
- Run `git push` in its own Bash call (force-push hook false positives). No `timeout` command on this Mac.
- Merging: JOURNAL.md conflicts keep both; index.js MODULES line conflicts -> union.
- Gate = tools/wic_gate.sh site (~370 s GPU Chrome, last line JSON). Run browser tests one at a time.

## Organisation (studio, 13 nodes)
- Teams sit directly under root; dept managers (Art, Engineering, Creative, Marketing) PAUSED since s35 (they starved teams).
  Resume a manager only if its teams ship steadily.
- Active teams: graphics (8765 Animation>40, d1ad townsfolk), environment-and-vfx (926d Visuals>55, 4a93 roofs, 76b5), ui-and-ux (3daf UI>68, d9bd),
  optimisation (22df, ef24 Safari blocked), story (d698 pyro balance first, then 2f47 Combat>66; owns mobs.js + combat),
  qa-and-playtesting (05d8 quest_bot flake, waits on Story d698). gameplay DONE s63. audio-and-music + brand-and-store-page have tasks but low priority (marketing <= 1/5 sessions).
- Contract in every brief: results to <hash>_wic.json, /tmp/wic_* locks, symlink heavy data, modular site/app/game files,
  gate before ready, commit before 45-min limit.

## Lead each session
1. `org tasks`, read notes; merge ready team branches into main; gate; publish; push.
2. ./measure.sh; triage issues (all need tasks); resolve those whose tasks are done.
3. Re-brief/add tasks where KPIs stall; retire non-producing nodes. Keep this file < 6000 chars.
