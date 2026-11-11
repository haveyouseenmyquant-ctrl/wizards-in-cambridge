# Issue 88ad check (UI task d9bd), 2026-11-11, main 478319d

Recording: `node scripts/wic_record.mjs site /tmp/wic_ui_d9bd --skip-combat` (recorder has `__wicStory(8)`).

- menus/talents.jpg (/tmp/wic_ui_d9bd/menus/talents.jpg): OK. The full Pyromancer talent screen shows (3 tiers x 3 talents), with no story box over it.
- menus/hud.jpg (/tmp/wic_ui_d9bd/menus/hud.jpg): NOT OK yet. `__wicStory(8)` ends the prologue scene, but quests.js
  begins the next chapter on the next tick (st.phase 'idle', st.cardT <= 0), so 0.5 s later the frame shows the
  "CHAPTER ONE / Rung Down" card and a dialogue box instead of the plain HUD.
  Filed as issue is-20261111-135501-3311 (Story + QA): delay the next chapter after a staged scene (st.cardT) or shoot hud.jpg before stepping.

Status: the talent half is done; the HUD half is waiting on 3311.
