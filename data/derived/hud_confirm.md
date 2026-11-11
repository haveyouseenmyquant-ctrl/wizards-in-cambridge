# HUD / talents confirmation (issues 88ad, 3311) — UI s5, 2026-11-11

Status: CONFIRMED.

Recorded `node scripts/wic_record.mjs site /tmp/wic_ui_s5c --skip-combat` on branch node/wizards-in-cambridge--ui-and-ux
after merging main 2c589da (has QA's `__wicStory(8)` and Story's step-8 hold).

- menus/hud.jpg (copy: data/derived/ui_shots/s5_hud.jpg): in-game HUD only — HP/mana bars, spell bar, minimap,
  tracker showing "Quest complete: The Thirteenth Chime". No quest card, no dialogue box, no stale loot/toast cards.
- menus/talents.jpg (copy: data/derived/ui_shots/s5_talents.jpg): Pyromancer talent screen, 3 tiers x 3 talents, HUD hidden.

UI fix in the same pass: toasts/loot cards that were up when a story scene started (starter gear, "You walk the path…")
used to sit out the paused scene and reappear in hud.jpg; uiframe.js now clears them when a scene starts, and
uiscreens.js drops queued toasts older than 15 s and folds stale common loot into one "N items added" toast.
