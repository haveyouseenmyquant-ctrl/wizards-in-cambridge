# Trailer plan (draft v1)

For the Trailers and Content team. All footage must come from the real current build, captured by script
(scripts/gameplay_clip.mjs and scripts/wic_record.mjs drive the game deterministically) and recorded with the build
hash. Nothing is mocked up, painted over or rendered offline. Nothing is uploaded anywhere without request-approval.

## Format
- 60–75 s, 1920×1080 at 30 or 60 fps, captured with GPU Chrome rather than SwiftShader. Also a 15 s vertical cut (1080×1920) for phones.
- Music and sound: the game's own sound effects, plus CC0 or CC-BY music only, credited at the end and in DATA.md.
- Text cards in the landing page's style (serif, gold on night blue). No review quotes, numbers or dates that aren't true.

## Shot list
1. (0–6 s) Dusk on Market Hill in exploration mode: a slow walk past the market stalls. Card: "Cambridge. Dusk."
2. (6–10 s) Great St Mary's from the square; the bell strikes thirteen (sound from the game). Card: "The bells are ringing wrong."
3. (10–20 s) Class selection screen, then one quick spell from each of the four classes.
4. (20–40 s) Combat montage: gargoyle swoop, ink imps, Clockwork Porter charge, Stone Warden shield, Hex Weaver wisps.
5. (40–50 s) Broom flight over the rooftops toward King's Parade.
6. (50–60 s) The Bellwarden of Market Hill boss fight, cut on the hit that ends it.
7. (60–70 s) Title card, then "Free in your browser · in development", the Pages URL and the open-data credits.

## Capture steps
1. Pick a live build hash. Run the scripted fights for each class and the broom route at 1920×1080 on the GPU.
2. Choose the takes, cut them with ffmpeg (local, free) and put the result in docs/marketing/trailer/ with a frame list.
3. Score it with a blind judge, as for the page (trailer rubric still to be written).
