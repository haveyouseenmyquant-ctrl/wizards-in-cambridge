# Issue 5ac5 camclip fix: confirmed (Env & VFX s7, 2026-11-11)

Main 1f3acbe merged into node/wizards-in-cambridge--environment-and-vfx; site/zone rebuilt with zone_build.py.

- `node scripts/test_camclip.mjs site`: ok=true, camclip_frames_inside=0 of 32832 samples, 114 spots, 204 prop boxes.
- Combat re-recorded with `scripts/gameplay_clip.mjs site data/derived/camclip_frames` (4 classes x 12 frames).
  Checked by eye: data/derived/camclip_frames/{pyromancer,stormcaller,warden,hexweaver}/frame_10.jpg (the old
  stall-clip spot). No clipping: the camera is clear of the stalls in all four frames. In the stormcaller frame it is
  lifted above the stall aisle, as intended.
- Side note (VFX, my area): the stormcaller dash puff in that frame is a big flat white disc, which washes out the screen.
