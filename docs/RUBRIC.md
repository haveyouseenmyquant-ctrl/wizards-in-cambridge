# Wizards in Cambridge: AAA quality rubric (FROZEN)

Version 1, frozen 2026-11-10. Changes need Gaspard's approval; a changed rubric gets a new version number and
its scores are not compared with earlier versions.

This rubric defines `judged_game_quality`. A blind vision judge (`scripts/wic_judge.py`, local `claude` CLI,
model claude-opus-5-5, Read tool only) scores contact sheets from the fixed scripted recordings of one build
(`scripts/wic_record.mjs`) against the anchors below. The judge sees only this rubric, the frames and a neutral
description of each recording; never build history, session notes, journals or earlier scores.

Scoring: each of the five sections gets an integer 0-100, read against the anchors (interpolate between them).
`judged_game_quality` = the weighted mean of the five sections, rounded to 0.1. The reference point for 100 is a
current, big-budget commercial third-person action RPG at release quality. Judge only what is visible in the
frames (and the event summary where one is given); a feature with no visible evidence scores as absent. Missing
recordings for a section (for example no dialogue scene exists yet) score that section as shown, which may be 0.

| Section | Weight | Recordings it is judged on |
|---|---|---|
| Visuals | 0.25 | exploration walk, combat |
| Animation | 0.20 | combat, exploration walk |
| Combat feel | 0.25 | combat (one per class) |
| Story presentation | 0.15 | story / dialogue scene |
| UI polish | 0.15 | menus and HUD, combat |

## Visuals

World, characters, materials, lighting and atmosphere as seen in the frames.

- **0**: Nothing recognisable renders: blank, broken or placeholder screens.
- **20**: Untextured or flat-shaded blocks; uniform lighting with no shadows; primitive shapes stand in for characters.
- **40**: A coherent world with basic textures and simple shadows, but low geometric detail, repetitive or stretched
  materials, visible popping or holes, simple characters with little detail; looks like an early prototype.
- **60**: Consistent art direction; detailed buildings and props; physically plausible materials; real-time shadows
  and some ambient occlusion; characters with readable silhouettes and textured clothing. Clearly below commercial
  release quality in density, lighting richness or character detail.
- **80**: Rich, dense environments with fine geometric detail (mouldings, wear, clutter, vegetation); convincing
  lighting with soft shadows, bounce light, atmospheric depth and post-processing; high-detail characters and
  enemies; very few visible artefacts. Close to a mid-budget commercial release.
- **100**: Release-quality AAA fidelity: cinematic lighting and atmosphere, dense hand-crafted detail everywhere,
  high-fidelity characters with detailed cloth and hair, polished VFX integration, no visible artefacts.

## Animation

How characters, enemies and the world move, inferred from pose variety and motion cues across frames.

- **0**: No animation: characters are absent or frozen in a single pose.
- **20**: Rigid objects sliding or rotating; no limb movement; T-poses or identical poses in every frame.
- **40**: Basic looping walk / idle cycles; attacks shown only as projectiles or effects without matching body
  motion; enemies share one or two simple animations.
- **60**: Distinct idle, locomotion, cast and hit-reaction animations for the player; enemies have their own attack
  and death animations; some blending, but stiff transitions or foot sliding are visible.
- **80**: Fluid, weighty animation with anticipation and follow-through; clear wind-ups on enemy attacks; varied
  death and hit reactions; secondary motion (robes, hair, props); environmental motion (foliage, water, crowds).
- **100**: AAA motion quality: motion-matched or hand-polished locomotion, contextual animations, expressive faces,
  seamless blending, physics-driven secondary motion and believable crowds.

## Combat feel

Readability, impact and depth of spell combat for every class, judged from the combat recordings and their event
summaries (casts, hits, crits, kills, damage taken, loot, deaths).

- **0**: No combat happens: no enemies, no attacks, or the player cannot act.
- **20**: Enemies and attacks exist but are hard to read; no feedback on hits; one repetitive attack; enemies barely
  react.
- **40**: Working combat with a few distinct spells and visible hits, but weak impact (little or no hit flash,
  knockback, damage numbers or sound), poorly telegraphed enemy attacks and little difference between classes.
- **60**: Several distinct spells per class with readable effects; hit feedback (flashes, numbers, knockback,
  sound); enemies telegraph attacks; classes play differently; a boss with phases; loot drops with rarity cues.
- **80**: Punchy, readable combat: strong VFX with clear shapes, hit-stop and screen feedback, crowd control that
  visibly changes fights, varied enemy behaviours and formations, mobility used in combat, exciting loot moments.
- **100**: Best-in-genre feel: every cast and hit lands with weight, perfectly readable chaos, deep build variety
  visible in play, memorable boss encounters with distinct mechanics.

## Story presentation

How the game presents its original story: dialogue, characters, quest framing and cinematic moments.

- **0**: No story presentation visible: no dialogue, no quest text, no characters to talk to.
- **20**: Story exists only as plain text (a static paragraph, a bare quest name) with no characters or framing.
- **40**: Dialogue boxes with speaker names and a quest log or objective tracker; characters are generic or absent
  from the frame; little staging.
- **60**: Named characters on screen during dialogue, portraits or framed shots, quest objectives integrated in the
  world (markers, waypoints), a consistent tone and an original premise that is clear from what is shown.
- **80**: Staged conversations with camera framing and character animation, branching choices, voiced or richly
  written lines, quest moments tied to real locations, clear narrative stakes.
- **100**: AAA narrative presentation: fully staged cinematics, expressive performances, seamless transitions
  between play and story, memorable characters and set pieces.

## UI polish

HUD, menus (class selection, inventory, talents), feedback text and overall interface craft.

- **0**: No UI, or UI that is broken (overlapping, cut off, unreadable).
- **20**: Debug-style text and default browser controls; no visual design.
- **40**: Functional HUD (health, mana, spell bar) and menus with plain styling; inconsistent fonts or layout;
  cluttered or hard to read over the scene.
- **60**: A consistent visual style across HUD and menus; readable cooldowns, resources and targets; item tooltips
  with rarity colours; clear class selection; minor layout or hierarchy issues.
- **80**: Polished, themed UI with strong hierarchy, icons, animation and feedback; uncluttered during combat;
  inventory and talent screens that are clear and attractive.
- **100**: AAA interface craft: bespoke art direction, flawless readability at every moment, elegant transitions,
  and every system clearly communicated.
