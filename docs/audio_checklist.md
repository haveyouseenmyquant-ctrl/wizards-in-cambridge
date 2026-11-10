# Audio checklist

One line per sound item. `- [x]` = implemented; `- [ ]` = not yet. The id in backticks is what `scripts/test_audio.mjs`
checks: it drives the real game in headless Chrome and counts WebAudio source starts per item (`window.__audio.counts`).
`audio_coverage_pct` = items verified in the browser / all items x 100. All sounds are procedural WebAudio (no files).
Code: `site/app/game/audio.js` (engine, buses, volume/mute UI), `sfx.js` (one-shot recipes), `audio_game.js` (mob voices),
`audio_world.js` (footsteps, ambience, bells), `audio_music.js` (score).

## Spells (one cast sound per spell, per class)

### Pyromancer
- [x] `spell.pyromancer.ember_bolt` Ember Bolt (recipe `ember`)
- [x] `spell.pyromancer.cinder_spray` Cinder Spray (recipe `spray`)
- [x] `spell.pyromancer.fireburst` Fireburst Orb (recipe `orb`)
- [x] `spell.pyromancer.flame_step` Flame Step (recipe `flamestep`)
- [x] `spell.pyromancer.kindle_ring` Kindle Ring (recipe `kindle`)
- [x] `spell.pyromancer.sunfall` Sunfall (recipe `sunfall`)

### Stormcaller
- [x] `spell.stormcaller.spark_lance` Spark Lance (recipe `lance`)
- [x] `spell.stormcaller.arc_chain` Arc Chain (recipe `arc`)
- [x] `spell.stormcaller.gale_burst` Gale Burst (recipe `gale`)
- [x] `spell.stormcaller.wind_dash` Wind Dash (recipe `winddash`)
- [x] `spell.stormcaller.static_field` Static Field (recipe `static`)
- [x] `spell.stormcaller.tempest` Tempest (recipe `tempest`)

### Stone Warden
- [x] `spell.warden.pebble_shot` Pebble Shot (recipe `pebble`)
- [x] `spell.warden.granite_skin` Granite Skin (recipe `granite`)
- [x] `spell.warden.quake_stomp` Quake Stomp (recipe `quake`)
- [x] `spell.warden.boulder_leap` Boulder Leap (recipe `leap`)
- [x] `spell.warden.rootbind` Rootbind Spikes (recipe `spikes`)
- [x] `spell.warden.monolith` Monolith Ward (recipe `monolith`)

### Hex Weaver
- [x] `spell.hexweaver.hex_dart` Hex Dart (recipe `dart`)
- [x] `spell.hexweaver.withering_mark` Withering Mark (recipe `mark`)
- [x] `spell.hexweaver.soul_siphon` Soul Siphon (recipe `siphon`)
- [x] `spell.hexweaver.shade_step` Shade Step (recipe `shade`)
- [x] `spell.hexweaver.bound_wisps` Bound Wisps (recipe `wisp`)
- [x] `spell.hexweaver.night_bloom` Night Bloom (recipe `bloom`)

## Mobs (attack wind-up, hit, death per type; bosses included)
- [x] `mob.gargoyle.attack` Rooftop Gargoyle: attack wind-up
- [x] `mob.gargoyle.hit` Rooftop Gargoyle: takes a hit
- [x] `mob.gargoyle.death` Rooftop Gargoyle: death
- [x] `mob.wisp.attack` Will-o'-the-Cam: attack wind-up
- [x] `mob.wisp.hit` Will-o'-the-Cam: takes a hit
- [x] `mob.wisp.death` Will-o'-the-Cam: death
- [x] `mob.statue.attack` Wakened Founder Statue: attack wind-up
- [x] `mob.statue.hit` Wakened Founder Statue: takes a hit
- [x] `mob.statue.death` Wakened Founder Statue: death
- [x] `mob.ink_imp.attack` Library Ink Imp: attack wind-up
- [x] `mob.ink_imp.hit` Library Ink Imp: takes a hit
- [x] `mob.ink_imp.death` Library Ink Imp: death
- [x] `mob.automaton.attack` Clockwork Porter: attack wind-up
- [x] `mob.automaton.hit` Clockwork Porter: takes a hit
- [x] `mob.automaton.death` Clockwork Porter: death
- [x] `mob.river_wraith.attack` Cam Wraith: attack wind-up
- [x] `mob.river_wraith.hit` Cam Wraith: takes a hit
- [x] `mob.river_wraith.death` Cam Wraith: death
- [x] `mob.bog_hag.attack` Fen Lantern-Hag: attack wind-up
- [x] `mob.bog_hag.hit` Fen Lantern-Hag: takes a hit
- [x] `mob.bog_hag.death` Fen Lantern-Hag: death
- [x] `mob.punt_revenant.attack` Punt-Pole Revenant: attack wind-up
- [x] `mob.punt_revenant.hit` Punt-Pole Revenant: takes a hit
- [x] `mob.punt_revenant.death` Punt-Pole Revenant: death
- [x] `mob.bell_bats.attack` Bell-Rope Bat Swarm: attack wind-up
- [x] `mob.bell_bats.hit` Bell-Rope Bat Swarm: takes a hit
- [x] `mob.bell_bats.death` Bell-Rope Bat Swarm: death
- [x] `mob.soot_sprite.attack` Chimney-Soot Sprite: attack wind-up
- [x] `mob.soot_sprite.hit` Chimney-Soot Sprite: takes a hit
- [x] `mob.soot_sprite.death` Chimney-Soot Sprite: death
- [x] `mob.crest_griffin.attack` Gatehouse Crest Griffin: attack wind-up
- [x] `mob.crest_griffin.hit` Gatehouse Crest Griffin: takes a hit
- [x] `mob.crest_griffin.death` Gatehouse Crest Griffin: death
- [x] `mob.bicycle_golem.attack` Mossbound Bicycle-Golem: attack wind-up
- [x] `mob.bicycle_golem.hit` Mossbound Bicycle-Golem: takes a hit
- [x] `mob.bicycle_golem.death` Mossbound Bicycle-Golem: death
- [x] `mob.bellwarden.attack` The Bellwarden of Market Hill: attack wind-up
- [x] `mob.bellwarden.hit` The Bellwarden of Market Hill: takes a hit
- [x] `mob.bellwarden.death` The Bellwarden of Market Hill: death
- [x] `mob.chimekeeper.attack` The Chime-keeper of St Mary's: attack wind-up
- [x] `mob.chimekeeper.hit` The Chime-keeper of St Mary's: takes a hit
- [x] `mob.chimekeeper.death` The Chime-keeper of St Mary's: death
- [x] `mob.gatehouse_lion.attack` The Gatehouse Lion of King's: attack wind-up
- [x] `mob.gatehouse_lion.hit` The Gatehouse Lion of King's: takes a hit
- [x] `mob.gatehouse_lion.death` The Gatehouse Lion of King's: death

## Footsteps by surface (collision surface class under the player)
- [x] `foot.cobbles` granite setts / cobbles (Market Square, King's Parade, college courts)
- [x] `foot.stone` York stone paving, steps, brick paviors
- [x] `foot.grass` lawns, parks, the Backs (and earth paths)
- [x] `foot.tarmac` roads
- [x] `foot.wood` bridge decks

## City ambience
- [x] `amb.market` Market Square murmur and stall clatter (fades with distance from the square)
- [x] `amb.river` the Cam: flowing water, drips and laps near open water
- [x] `amb.birds` songbird phrases (more on grass)
- [x] `amb.bikes` passing bicycles: freewheel ticking across the stereo field and bells
- [x] `amb.city` distant town hum bed

## Great St Mary's bells (local clock, spatialised from the tower)
- [x] `bells.quarters` Cambridge Quarters on the quarter hours
- [x] `bells.hour` the hour struck on the tenor

## Music (original generative score; game mode only)
- [x] `music.explore.market` explore theme: Market Square / centre
- [x] `music.explore.river` explore theme: the river and the Backs
- [x] `music.explore.colleges` explore theme: colleges and streets
- [x] `music.combat.market` combat: centre
- [x] `music.combat.river` combat: river
- [x] `music.combat.colleges` combat: colleges
- [x] `music.boss.bellwarden` boss: the Bellwarden of Market Hill
- [x] `music.boss.chimekeeper` boss: the Chime-keeper of St Mary's
- [x] `music.boss.gatehouse_lion` boss: the Gatehouse Lion of King's

## Player feedback
- [x] `ui.levelup` level-up fanfare
- [x] `ui.hurt` player takes damage

## Settings and modes
- [x] `settings.mute` mute (M key / speaker button) stops every new sound
- [x] `settings.volume` master volume slider applies and is saved in localStorage
- [x] `mode.explore` exploration mode: footsteps and ambience play, music is off
