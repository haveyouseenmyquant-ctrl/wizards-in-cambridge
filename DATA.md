# Data sources and licences

Only free, openly licensed data that may be redistributed on a public website. Raw downloads live in
`data/raw/` (git-ignored, reproducible with the scripts below).

| Source | What | Licence | Attribution (in-game credits page) |
|---|---|---|---|
| OpenStreetMap via Overpass API (`https://overpass-api.de/api/interpreter`), snapshot 2026-11-07T19:55:51Z, bbox 52.1945,0.1030,52.2155,0.1380 (study area + ~200 m), all nodes/ways/relations with full recursion, `out meta` | Buildings, highways/paths, land use, water, bridges, trees | ODbL 1.0 | © OpenStreetMap contributors (openstreetmap.org/copyright) |
| Environment Agency LIDAR Composite DTM and First Return DSM 2022, 1 m (tiles TL4055, TL4555) | Terrain, building heights | OGL v3 | © Environment Agency copyright and/or database right 2022. All rights reserved. |
| Environment Agency National LiDAR Programme DTM/DSM/First Return DSM 2023, 1 m (same tiles) | Second epoch for checking heights; trees (canopy height = first-return DSM − DTM, scripts/trees.py) | OGL v3 | © Environment Agency copyright and/or database right 2023. All rights reserved. |
| OS OpenMap Local (2026-10, TL square, shapefile) | Building/road/water polygons as a cross-check | OGL v3 | Contains OS data © Crown copyright and database right 2026 |
| OS Open Roads (2026-10, GB GeoPackage) | Road network cross-check | OGL v3 | Contains OS data © Crown copyright and database right 2026 |
| OS Terrain 50 (2026-07, tile TL45) | Coarse terrain beyond LiDAR coverage | OGL v3 | Contains OS data © Crown copyright and database right 2026 |

No 50 cm or 25 cm EA LiDAR exists for this area (the EA survey search returned only 1 m and 2 m rasters).
OS Open Zoomstack was skipped (4.3 GB GeoPackage; OpenMap Local covers the same features at better detail).

Full download URLs, file sizes, survey dates and checks: `data/SOURCES_lidar_os.md`.
Scripts: OSM is fetched with the Overpass query above (see JOURNAL.md, session 1); LiDAR/OS with
`scripts/download_lidar_os.py`, mosaicked/clipped with `scripts/mosaic_lidar.py` into `data/lidar/`
(1 m, EPSG:27700, E 544000–546000, N 257400–259400).

Textures (session 10, `scripts/fetch_textures.py` → `site/tex/`, 1k diffuse JPEGs): Poly Haven, CC0 —
yellow_bricks, white_sandstone_blocks_02, grey_roof_tiles, asphalt_02, pavement_02, sparse_grass,
cobblestone_floor_08, gravel_floor (authors and URLs in `site/tex/textures.json`). Future textures: CC0 only. Photos from Wikimedia Commons/Mapillary only as visual
references, licence checked and credited per item in this file.

Facade annotation references (session 33, `data/raw/commons_ref/`, git-ignored): 16 Wikimedia Commons / Geograph
photos (CC BY-SA 2.0/4.0) of Petty Cury, Lion Yard and St Edward King and Martyr, used only as visual references for
the layout annotations in `data/annotations/market_square/` (file name, licence and author are listed in each
annotation's `sources`). No pixels from them are in the world.
Added in session 34 (same terms, licence checked via the Commons API): St Mary's Passage: "1 St Mary's Passage" and
"3 St Mary's Passage, Cambridge" (Smb1001, CC BY-SA 4.0), geograph 4994976 Cambridge Satchel Company (Hugh Venables),
6497174 Cuckoo and 7561311 Sahara (Mr Ignavy), 6094985 (John Sutton), 6887870 Ryder & Amies (Colin Smith); Petty Cury:
"Petty Cury, Cambridge" (Magnus Manske, CC BY-SA 3.0), geograph 1944505/1944508 (Stacey Harris), 4040570, 4332543,
5322026, 5897664, 5231641 (N Chadwick), 4350366 (Hugh Venables), 4353388 (Fernweh); Guildhall Street (Magnus Manske,
CC BY-SA 4.0), geograph 6095002 (John Sutton); Market Street: "Market Street, Cambridge" and "1, Market Street"
(Magnus Manske, CC BY-SA 3.0), geograph 4171681/4350410 (Hugh Venables); "St Edward's Passage, Cambridge, looking
toward Peas Hill (cropped)" (CC BY 1.0) and "3-4 St Edward's Passage" (Smb1001, CC BY-SA 4.0). Geograph photos are
CC BY-SA 2.0.
Ring-1 facade annotations (session 36, `data/annotations/ring1/`, used by `scripts/city_facades.py`): King's Parade
1-19, Bene't Street (3, 8 The Eagle, 9, 13, 15, Bene't Hostel, Bread & Meat) and Trinity Street 9, 10, 13, made from
64 non-held-out Mapillary photos (CC BY-SA 4.0, already in `data/raw/mapillary_facade/` and `mapillary_ref/`,
https://www.mapillary.com/app/?pKey=<id>; ids listed in each annotation's `sources`). Visual references only; no
pixels from them are in the world. No new Commons downloads.
Sessions 37-50 extended data/annotations/ring1/ (186 walls by session 50) from further non-held-out Mapillary frames and
Wikimedia Commons / Geograph photos (CC BY-SA 2.0/3.0/4.0; each file title or geograph id and its licence are listed in the
annotation's `sources`). Visual references for layout, proportion and colour only; no pixels from them are in the world.
Bespoke models (session 34, references for shape/proportion/colour only, credited in the module docstrings):
`scripts/zone_bespoke_caius.py`: Commons "Trinity Street – View SSW along Gonville & Caius…", "King's Parade – View
West into Senate House Passage…", "King's Parade – View North into Trinity Street…", "Market Hill – View NNW into Rose
Crescent" (Txllxt TxllxT, CC BY-SA 4.0), "1125528 … St Michael's Court" (Tilman2007, CC BY-SA 4.0);
`scripts/zone_bespoke_churches.py`: geograph 3803723 St Michael, Trinity Street (N Chadwick, CC BY-SA 2.0), Commons
St Michael's view east from the churchyard (Txllxt TxllxT, CC BY-SA 4.0), plus the St Edward's photos above.
`scripts/zone_bespoke_kings.py` (session 35, King's College gatehouse and screen): Commons "King's Parade – View WSW on
King's College Gatehouse 1828…", "King's Parade – View NW on Neo Gothic Gatehouse 1828…", "King's College – King's
Parade – View South along Gatehouse & Screen 1828…" (Txllxt TxllxT, CC BY-SA 4.0).
`scripts/zone_bespoke_benet.py` (session 36, St Bene't's Church, way/134521042): Commons "1126252 I CHURCH OF ST
BENE'T, BENE'T STREET Cambridge 20260523 0001.jpg", "… 0002.jpg", "… 0003.jpg" (Tilman2007, CC BY-SA 4.0) and
"Church in Cambridge.jpg" (Christopher, flickr 47038415@N00, CC BY 2.0); licences checked via the Commons API, used for
shape/proportion/colour only (belfry pair with baluster shaft, sound-holes, quoins, aisle gable, porch), no pixels.
`scripts/zone_bespoke_corpus.py` (session 36, Corpus Christi New Court, Trumpington Street front, way/148880379):
Commons "William Wilkins - Elevation for the West Front of the New Quadrangle of Corpus Christi College, Cambridge -
B1977.14.1066 - Yale Center for British Art.jpg" (Wilkins' elevation, Yale Center for British Art, CC0), geograph 7017873
"View of Corpus Christi College from Trumpington Street" (Robert Lamb) and 631710 "The Main Gate, Corpus Christi
College" (RichTea), both CC BY-SA 2.0; licences checked via the Commons API, used for shape/proportion/colour only, no
pixels.
`scripts/zone_bespoke_oldschools.py` (session 37, Old Schools east front by Stephen Wright, way/135762298): Commons
"Old Schools from Kings Parade, Cambridge, UK - Diliff.jpg" (Diliff, CC BY-SA 3.0) and "Cambridge - King's Parade -
View WNW on Old Schools 1837 & Senate House 1730.jpg" (Txllxt TxllxT, CC BY-SA 4.0); licences checked via the Commons
API, used for shape/proportion/colour only (5-bay open rusticated arcade, arched recesses with pedimented windows,
swag frieze, balustrade with urns), no pixels.
`scripts/zone_bespoke_greatgate.py` (session 37, Trinity College Great Gate, street face, part of way/151179441):
Commons "Great Gate, Trinity College, Cambridge (outside).jpg" (Hans Wolff, public domain) and "Cambridge - Trinity
Street - View West on the Great Gate of Trinity College early 17th century.jpg" (Txllxt TxllxT, CC BY-SA 4.0);
licences checked via the Commons API, used for shape/proportion/colour only (brick turrets with stone quoins, carriage
and wicket arches, shield band, Henry VIII niche, panelled battlements), no pixels. The range body under it is the
OSM footprint with the LiDAR DSM roof (data/lidar/dsm_1m.tif).
Market stalls / street furniture (session 34, `scripts/zone_props.py`, `scripts/zone_props_furniture.py`; same terms, licence checked via the Commons API): "Cambridge Market stalls at lunchtime" (Jonosunde, CC BY-SA 4.0), geograph 5652394 "Looking over the market stalls in Cambridge" (Richard Humphrey), 1133717 "Empty market stalls", 703624 "Cambridge Market" and 972242 "A vital part of Cambridge" (Sebastian Ballard), all CC BY-SA 2.0. Used only to read the stall look (white canvas with red/blue/green/yellow stripes down the slope, scalloped hems, scaffold frames, striped counter cloths, red side sheets); no pixels from them are in the world.

## Characters (graphics node, 10 Nov 2026)
- Player wizard `site/models/player/wizard.glb` (graphics s3, replaces the KayKit Mage): "Animated Wizard" by Quaternius
  (quaternius.com), CC-BY 3.0 as listed at https://poly.pizza/m/kttbFvCl2C (glb
  static.poly.pizza/7e77cc7a-eff9-4ebd-90a6-7728c265b092.glb). Trimmed by `scripts/build_char_glb.mjs` (12 clips renamed
  idle/walk/run/cast(Spell1)/cast_raise(Spell2)/cast_long(Staff_Attack)/hit(RecieveHit)/death/jump(Idle_Weapon)/dash(Roll)/
  block(Punch)/sit(Idle_Attacking), meshopt). Per-class robe/trim recolour of its texture and a procedural pointed hat
  at runtime (`site/app/game/wizard_rig.js`). Credited in the in-game credits.
- Mob models `site/models/mobs/{statue,wraith,automaton,imp}.glb`: KayKit "Skeletons" Character Pack 1.0
  (Skeleton_Warrior, _Mage, _Rogue, _Minion), Kay Lousberg, CC0 1.0, same trimming (idle/walk/run/attack/attack2/hit/
  death/spawn/taunt). Drawn in game by `site/app/game/mob_rig.js` for statue, river_wraith, automaton, ink_imp, punt_revenant.
- Mob model `site/models/mobs/golem.glb` (graphics s9, replaces the procedural bicycle_golem body): Quaternius
  "Animated Robot" via Poly Pizza, CC0 1.0, https://poly.pizza/m/QCm7qe9uNJ (glb
  static.poly.pizza/7d95dbce-8c73-489b-8298-f430b1f0dbdf.glb), trimmed by `scripts/build_char_glb.mjs` (idle, walk, run,
  attack Punch, attack2 Jump, hit No, death, taunt Yes), recoloured moss + rusted iron in mob_rig.js.
- Mob models `site/models/mobs/{gargoyle,wisp,bat}.glb` (graphics, replace the procedural gargoyle / wisp / bell_bats
  bodies): Quaternius "Ultimate Monsters" via Poly Pizza, CC0 1.0 as listed on each page: "Demon" (flying, winged)
  https://poly.pizza/m/Mo2ky6vkf8 (glb static.poly.pizza/c2e39eb4-4b8e-4d31-b014-d637bf4e15c6.glb) -> gargoyle.glb;
  "Ghost" https://poly.pizza/m/Iip30bDHmu (static.poly.pizza/810f60a2-6e45-4c4e-a0d5-da91cd7288bd.glb) -> wisp.glb;
  "Bat" https://poly.pizza/m/hNO9XvjlKa (static.poly.pizza/4ae13ae9-c257-41ed-86b5-1b4760924ebc.glb) -> bat.glb.
  Trimmed by `scripts/build_char_glb.mjs` (idle(Flying_Idle)/run(Fast_Flying)/attack(Punch)/attack2(Headbutt)/
  hit(HitReact)/death/taunt(No); bat: run(Bat_Flying)/attack/attack2/hit/death; walk/idle aliased at runtime), meshopt.
  Recoloured per material at runtime by `mob_rig.js` (grey stone gargoyle, glowing teal wisp, a 3-bat swarm). Credited in-game.
- Story NPC models `site/models/npcs/{nell,pip,absalom}.glb`: KayKit Adventurers 1.0 (`Rogue`, `Rogue_Hooded`, `Mage`
  without hat/weapons), Kay Lousberg, CC0 1.0; clips idle/talk(Interact)/walk/wave(Cheer)/hit/death; recoloured at
  runtime from the palettes in `site/app/game/quests/*.json` by `site/app/game/npc_rig.js`.

## Audio (audio node, 10 Nov 2026)
All sound and music is synthesised in the browser with WebAudio (oscillators and filtered noise); no audio files, samples
or third-party recordings are used (0 bytes of audio assets). The score and all sound designs are original. The Great St
Mary's chime is the "Cambridge Quarters" (composed for Great St Mary's in 1793, public domain), played on synthesised bells.
Code: site/app/game/audio.js, audio_world.js, audio_music.js, audio_game.js, sfx.js; checklist: docs/audio_checklist.md.

## Held-out benchmark (session 8)
- 200 Mapillary photos (CC-BY-SA 4.0, contributors credited per photo in `data/benchmark/benchmark.json`),
  picked once on 2026-11-07 by `scripts/make_benchmark.py` from 6,884 candidates in the study area. Frozen. These
  images, and any image in the same sequence within 15 m of one (`data/benchmark/heldout.json`), must never be used to
  build the world. The thumbnails are kept locally only (git-ignored) and are not part of the published site.
- Mapillary API: free client token for the app "walkable-cambridge" (account tobi_walkable_cam), kept in
  `data/mapillary_token` (git-ignored).
- Scoring: DINOv2 ViT-S/14 (facebook/dinov2-small, Apache-2.0), run locally. judged_realism / visual_quality: a Claude
  vision judge (claude-opus-5-5 via the local `claude` CLI), `scripts/judge.py`; fixed view lists in
  `data/benchmark/judge_views.json` (50) and `quality_views.json` (30).
- Facade photo masks (session 24, `scripts/masks.py`): UperNet ConvNeXt-small semantic segmentation
  (openmmlab/upernet-convnext-small, MIT licence, trained on ADE20K), run locally, finds people, bikes and vehicles in
  the facade photos so they are not baked into walls. Only the masks are used; nothing of the model ships.

Photo facades (session 12, `scripts/facades.py` → `site/facades/`, release asset only): wall pieces rectified from
Mapillary street-level photos (CC-BY-SA 4.0) through their SfM camera poses. The atlases are adaptations and are shared
under CC-BY-SA 4.0. Photo ids, URLs and contributors are in `site/facades/credits.json`, which the credits page links to.
Never used: the 200 held-out benchmark photos, or frames of the same sequence within 15 m of one (heldout.json
`sequence_near`). `--strict` also skips every frame of a held-out sequence. Downloaded 2048 px thumbnails are cached in
`data/raw/mapillary_facade/` (git-ignored, ~100 MB).

Ring-1 annotations, session 37 (`data/annotations/ring1/`; same terms, used only to read storeys, bays, shopfronts and colours; no pixels in the world): Commons "St Mary's Street, Cambridge.jpg" (Smb1001, CC BY-SA 4.0), "St Mary's Street. Cambridge - geograph 7416906" (Hugh Venables, CC BY-SA 2.0), "Cambridge - Trinity Lane - View East into Senate House Passage" (Txllxt TxllxT, CC BY-SA 4.0), "Senate House Passage - geograph 5893878" (N Chadwick, CC BY-SA 2.0); plus non-held-out Mapillary images (CC BY-SA 4.0) listed in each annotation's sources. Ring-1 colours (`data/annotations/colours/ring1.json`) were read from non-held-out Mapillary images listed per building.
Market stalls and lamps, session 38 (`scripts/zone_props.py`, `scripts/zone_props_furniture.py`; visual references only, no pixels in the world): Commons "View from Great St Mary's Cambridge - 02/03/09" (The wub, CC BY-SA 4.0; back-to-back stall canopies, stripe pattern, lamp positions), "Market Hill Cambridge UK" (Kestreltail, CC BY-SA 4.0), "Cambridge Market stalls at lunchtime" (Jonosunde, CC BY-SA 4.0), Flickr "Cambridge Market Square Market Hill…" (39393248930, 41158381652; CC BY-SA 2.0), "Cambridge market locked down" (Gyles Glover, CC BY 2.0); geograph (CC BY-SA 2.0, fetched from geograph.org.uk) 5032491, 5032495, 5231647, 5509393, 5524917, 5611626, 5617767, 5711942, 5716519, 5897665, 6025097, 6453814, 6457734, 7180141, 7193749, 7414782, 7790439, 7790440, 7866219, 7928883, 7928886, 8005736, 6052227, 6242734, 5652394, 5711954, 7023945, 7854854; non-held-out Mapillary (CC BY-SA 4.0) 138292341951529, 3304474719779190, 918215512073749, 484065959384228, 652094232632931, 153927726666858 (checked against benchmark.json, market_square.json and same-sequence frames within 20 m).

Market stalls, session 82 (`scripts/zone_props.py`; visual references only, no pixels in the world): Commons "Cambridge Market stalls at lunchtime" (Jonosunde, 2024, CC BY-SA 4.0: dark steel frame with two rails, open striped row ends, red/green PVC back and side sheets, green/white striped counter skirts) and geograph 3482689 "Market stalls in Cambridge" (2013, CC BY-SA 2.0).

Great St Mary's, session 81 (`scripts/zone_bespoke_gsm.py` Perpendicular panel-tracery window heads, deeper buttress set-offs; `scripts/trees.py` EXTRA): no new photo sources. The two south-east churchyard trees are read by hand from the EA NLP 2023 first-return DSM / DTM above (OGL v3); window and buttress forms from general knowledge of the building (no listing text or photo was consulted this session).

- Session 53 ring-1 annotation reference (layout only, not used as texture): Wikimedia Commons "Church of Saint Botolph, Cambridge (Southwest View - 01).jpg" (CC BY-SA) for data/annotations/ring1/way_59620751.json.
- Session 54 ring-1 east annotations (layout only, no pixels): non-held-out Mapillary (CC BY-SA 4.0) 805337440380095 (way_1039073567.json), 524354555416399 and 751816582152941 (way_131662340.json), 288790312952123 (way_135595981.json), 490320359088033 (way_40937938.json).
- Session 54 ring-1 west annotations (layout only, not used as texture): non-held-out Mapillary (CC BY-SA 4.0) 373174810684481, 847299059192996, 1116860688798837, 1150854562005657, 462542288294369, 747614172590399, 168155765243719 for data/annotations/ring1/way_393081416.json, way_136330924.json, way_201286462.json; 2865908173677254, 829517581246404 (way_59620751.json), 142407867788301, 1129882040864714 (way_166155937.json, way_166155936.json, way_137017454.json).
- Session 54, King's College Chapel bespoke model (`scripts/zone_bespoke_kingschapel.py`; shape and proportion references only, no pixels in the world): Wikimedia Commons category "King's College Chapel, Cambridge" exterior views, incl. "Cambridge - King's Parade - View NW on Neo Gothic Gatehouse 1828 by William Wilkins & King's College Chapel 1446-1544.jpg" (Txllxt TxllxT, CC BY-SA 4.0); heights from EA LiDAR 2023 (OGL v3); footprint from OSM way/164848633 (ODbL). No held-out benchmark photos used.
- Session 56 ring-1 annotation references (layout only, no pixels in the world): Wikimedia Commons "8-9 Bridge Street, Cambridge.jpg", "10 Bridge Street, Cambridge.jpg", "69 Bridge Street, Cambridge.jpg", "68 Bridge Street, Cambridge.jpg", "63-65 Bridge Street, Cambridge.jpg" (all Smb1001, CC BY-SA 4.0; licences checked via the Commons API) for data/annotations/ring1/way_965378229.json, way_1288750542.json, way_263621281.json and way_1288738594.json. No held-out benchmark photos used (the held-out set is Mapillary-only).
- Session 56 ring-1 annotation reference (layout only, no pixels in the world): Wikimedia Commons "1099908 II 13, KING'S PARADE Cambridge 20260523 0001.jpg" (Tilman2007, CC BY-SA 4.0; licence checked via the Commons API) for the St Edward's Passage side of 13 King's Parade in data/annotations/ring1/way_1036521057.json.
- Session 57 ring-1 annotation references (layout only, no pixels in the world; licences checked via the Commons API): Wikimedia Commons "67 Bridge Street, Cambridge.jpg" and "68 Bridge Street, Cambridge.jpg" (Smb1001, CC BY-SA 4.0) for way_1288738597.json / way_1288738599.json; "52 Trumpington Street, Cambridge.jpg", "53 Trumpington Street, Cambridge.jpg" (Smb1001, CC BY-SA 4.0) and "54 to 52 Trumpington Street, Cambridge.jpg" (Ethan Doyle White, CC BY-SA 4.0) for way_149032878.json / way_149032882.json; "32 Hobson Street, Cambridge.jpg" (Smb1001, CC BY-SA 4.0) for way_1047162156.json; "ADC Theatre Cambridge.jpg" (CC BY-SA 2.0, author not stated on the file page) for way_151527561.json. No held-out benchmark photos used.
- Session 74 ring-1 annotation references (layout only, no pixels in the world; licences checked via the Commons API; none are in data/benchmark, whose held-out set is Mapillary-only): Wikimedia Commons "Cambridge - Sidney Street - Sussex Street - View WSW on Sidney House 1939 by E.R.Barrow - Neo Georgian Style.jpg" (Txllxt TxllxT, CC BY-SA 4.0) and "Sussex Street - geograph.org.uk - 4332580.jpg" (N Chadwick, CC BY-SA 2.0) for the Sussex Street face way/135595983:4 in way_135595983.json; "John Lewis Store - geograph.org.uk - 5560238.jpg" (John M, CC BY-SA 2.0) and "John Lewis - geograph.org.uk - 4840835.jpg" (N Chadwick, CC BY-SA 2.0) for the Corn Exchange Street face way/40937939:31 in way_40937939.json. Images deleted after use.
- Session 75 ring-1/ring-2 annotation references (layout only, no pixels in the world; licences checked via the Commons API; none are in data/benchmark, whose held-out set is Mapillary-only): Wikimedia Commons "St John's College front, Cambridge.jpg" (The wub, CC BY-SA 3.0), "Trinity Street and St John's Great Gate, Cambridge - geograph.org.uk - 3898991.jpg" (Roger Kidd, CC BY-SA 2.0), "The Great Gate at St John's College, Cambridge - geograph.org.uk - 3928159.jpg" (Roger Kidd, CC BY-SA 2.0), "St John's College, Cambridge - geograph.org.uk - 4502608.jpg" (Anthony Foster, CC BY-SA 2.0) and "Great Gate of St John's College, Cambridge.jpg" (sailko, CC BY-SA 3.0) for the St John's Street faces of St John's College First Court (way/158913878:3, :18, :20) in data/annotations/ring1/way_158913878.json; scripts/zone_bespoke_stjohnsfirst.py follows it. Images deleted after use.
- Session 76 ring-1 annotation references for King's College gatehouse/Wilkins screen (King's Parade) and Clare College Old Court east range (layout only, no pixels in the world; licences checked via the Commons API; none are in data/benchmark, whose held-out set is Mapillary-only): Wikimedia Commons "Cambridge - King's College - King's Parade - View South along Gatehouse & Screen 1828 by William Wilkins.jpg" (Txllxt TxllxT, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Cambridge_-_King%27s_College_-_King%27s_Parade_-_View_South_along_Gatehouse_%26_Screen_1828_by_William_Wilkins.jpg); "Cambridge - King's College Chapel 1446-1544 - King's Parade - View NNW on Wilkins' Screen 1828 & Chapel.jpg" (Txllxt TxllxT, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Cambridge_-_King%27s_College_Chapel_1446-1544_-_King%27s_Parade_-_View_NNW_on_Wilkins%27_Screen_1828_%26_Chapel.jpg); "Cambridge - King's Parade - View WSW on King's College Gatehouse 1828 by William Wilkins.jpg" (Txllxt TxllxT, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Cambridge_-_King%27s_Parade_-_View_WSW_on_King%27s_College_Gatehouse_1828_by_William_Wilkins.jpg); "Cambridge - King's Parade - View West on William Wilkins' Neo Gothic Screen 1828.jpg" (Txllxt TxllxT, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Cambridge_-_King%27s_Parade_-_View_West_on_William_Wilkins%27_Neo_Gothic_Screen_1828.jpg); "King's College Gatehouse - geograph.org.uk - 1335739.jpg" (Stanley Howe, CC BY-SA 2.0, https://commons.wikimedia.org/wiki/File:King%27s_College_Gatehouse_-_geograph.org.uk_-_1335739.jpg); "1320280 I CLARE COLLEGE, THE BUILDINGS SURROUNDING PRINCIPAL COURT, east range Cambridge 20260523 0001.jpg" (Tilman2007, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:1320280_I_CLARE_COLLEGE,_THE_BUILDINGS_SURROUNDING_PRINCIPAL_COURT,_east_range_Cambridge_20260523_0001.jpg); "1320280 I CLARE COLLEGE, THE BUILDINGS SURROUNDING PRINCIPAL COURT, east range Cambridge 20260523 0002.jpg" (Tilman2007, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:1320280_I_CLARE_COLLEGE,_THE_BUILDINGS_SURROUNDING_PRINCIPAL_COURT,_east_range_Cambridge_20260523_0002.jpg); "Cambridge - King's College Chapel 1446-1544 - North Gate - View NW on Clare College.jpg" (Txllxt TxllxT, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Cambridge_-_King%27s_College_Chapel_1446-1544_-_North_Gate_-_View_NW_on_Clare_College.jpg); "Cambridge - Trinity Lane - Clare College, founded in 1326 - View West on Clare's Old Court 1618-1715.jpg" (Txllxt TxllxT, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Cambridge_-_Trinity_Lane_-_Clare_College,_founded_in_1326_-_View_West_on_Clare%27s_Old_Court_1618-1715.jpg); "East front of Clare College, Cambridge (O49772).jpg" (Godfrey Bingley, Public domain, https://commons.wikimedia.org/wiki/File:East_front_of_Clare_College,_Cambridge_(O49772).jpg).
- Session 77 ground-surface reference (layout only, no pixels in the world; licences checked via the Commons API; not in data/benchmark, whose held-out set is Mapillary-only), for `kings_parade_east_setts_south` in data/annotations/ground/surfaces.json: Wikimedia Commons "Along King's Parade - geograph.org.uk - 7058834.jpg" (John Sutton, CC BY-SA 2.0, https://commons.wikimedia.org/wiki/File:Along_King%27s_Parade_-_geograph.org.uk_-_7058834.jpg); "Cambridge - King's Parade - View SSW.jpg" (Txllxt TxllxT, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Cambridge_-_King%27s_Parade_-_View_SSW.jpg). OSM surface tags (ODbL): Market Square relation/8117433 surface=sett (Grade II listed cobbles), Senate House Hill way/4615503 and way/28344987 surface=sett, Trinity Lane way/43045543 surface=sett; King's Parade way/3993048 surface=asphalt.

Caius Market Hill Buildings (16-21 Market Hill, J. Murray Easton 1937), rounded St Mary's Street end, session 80 (`scripts/zone_bespoke_caius.py` ROUND; layout reference only, no pixels in the world): geograph 5652394 "Looking over the market stalls in Cambridge" (Richard Humphrey, CC BY-SA 2.0, already in data/raw/commons_ref) and the Historic England list entry 1200398 text (via britishlistedbuildings.co.uk).
