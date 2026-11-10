# Positioning: Wizards in Cambridge

Draft v1, 10 Nov 2026, Brand and Store Page team. Every claim here comes from the current build
(448ceb612bcec57f, live on GitHub Pages) or the repo. Check numbers again before reusing them, because the game changes every day.

## One line

**A free wizard action RPG you play in your browser, set in a model of Cambridge city centre built from open map data.**

## Short pitch (about 50 words)

Something is wrong with the bells of Cambridge. Great St Mary's strikes the hour and then strikes once more. Pick one
of four wizard classes and fight gargoyles, ink imps, clockwork porters and river wraiths across Market Hill and King's
Parade, in a city modelled from OpenStreetMap and Environment Agency LiDAR. Free, no install, no account.

## Who it is for

1. **People who know Cambridge**: students, alumni, residents and visitors who would like to see Market Hill, King's
   Parade and Senate House Hill turned into a place to fight. The real streets are the draw.
2. **Browser-game players** who want an action RPG they can start in one click on a laptop or phone, with no download
   and no account.
3. **Open-data and web-graphics people** who are curious how far a city built from OSM, LiDAR and CC0 assets can go
   with three.js in a browser.

## Pillars (each one is true of the current build)

| Pillar | Evidence in the build |
|---|---|
| Real streets, open data | The city centre is built from OpenStreetMap (ODbL), EA LiDAR and OS OpenData (OGL v3); credits are in the game (Menu → Credits) and in DATA.md |
| Four classes that play differently | Pyromancer, Stormcaller, Stone Warden and Hex Weaver, each with 6 spells and a 3-tier talent tree (site/app/game/classes.js) |
| Monsters from local folklore | 12 mob types, including Rooftop Gargoyle, Will-o'-the-Cam, Library Ink Imp, Clockwork Porter and Cam Wraith; 3 bosses (scores/448ceb61_wic.json) |
| A story about the bells | 3 main quests: *The Thirteenth Chime*, *The Lion at the Gate*, *Rung Down* (site/app/game/quests/) |
| Loot with effects | 58 distinct equipment effects, rarity tiers, chests and drops (equipment_effects in the scores file) |
| Instant and free | Runs in Chrome and Safari, desktop and phone, with keyboard, mouse, gamepad or touch; progress is saved in the browser; no accounts, no servers, no tracking |
| Walk or fight | Exploration mode (`?explore`) hides the enemies and the HUD so you can just walk the city |

## Tone

Wry, local and a little eerie: a Cambridge evening in which the bells are off. Plain English. No hype words.

## Truth rules for all copy (Head of Marketing, 10 Nov 2026)

- Don't call it **AAA**, "next-gen" or "photoreal". The blind judge scores the current build at 51.4/100
  (judged_game_quality), so call it a game **in active development**.
- Don't invent reviews, quotes, player numbers, ratings, awards or release dates. There are no reviews yet; say so,
  or leave them out.
- Use screenshots and footage from the real build only (docs/marketing/press_kit/, with the build hash recorded).
- Original IP: compare it to no franchise and don't name one. Real colleges and shops are scenery, not partners or
  sponsors. No real living people.
- Don't promise features the build doesn't have, such as multiplayer, the whole city or a release date.

## Honest caveats to state where relevant

- It is in development. The art is a mix of parametric geometry and simple models, and the quality varies from street
  to street; the area around Market Square has had the most work.
- The playable area is a fixed study area of central Cambridge (52.1975–52.2125 N, 0.1080–0.1330 E).
- Made by Tobi, an AI agent operated by Gaspard Oliviers. Say so plainly; don't hide it.
