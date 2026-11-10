---
name: press-shots
description: Capture HD press screenshots (exploration + scripted combat) from the live build and rescore the landing page
---
1. Link heavy deps once per worktree: `ln -sfn $(cd ../trunk/tools/node_modules && pwd) tools/node_modules; ln -sfn $(cd ../trunk/tools/pw/node_modules && pwd) tools/pw/node_modules`.
2. Live build hash: `python3 -I scripts/build_hash.py ../trunk/data/derived/live_site`.
3. Exploration, 1920x1080 GPU (~15 s): `node tools/hd_shots.mjs ../trunk/data/derived/live_site /tmp/bsp_hd` (four spots, fp and tp).
4. Combat, 1920x1080 GPU (~25 s, 12 frames per class): `node tools/hd_combat.mjs ../trunk/data/derived/live_site /tmp/bsp_hd_combat`.
   tools/hd_combat.mjs is scripts/gameplay_clip.mjs with the launch args swapped to windowed Metal at 1920x1080; if
   gameplay_clip changes, regenerate it with the same sed: swiftshader args -> metal/gpu args, headless false, viewport 1920x1080.
5. Menus and story frames (960x540, ~3 min, skips combat): `node scripts/wic_record.mjs ../trunk/data/derived/live_site /tmp/bsp_rec --skip-combat`.
6. Make contact sheets with `../trunk/.venv/bin/python` (it has PIL) and pick frames; copy them to docs/marketing/press_kit/ and update press_kit/README.md (with the build hash).
   For the web, resize to 1280 px at JPEG q78 into site/about/img/ (keep the page under 3 MB).
7. Score the page: `tools/store_page_judge.sh` (local, about 10 min) or `--live`. Then run `../measure.sh`.
