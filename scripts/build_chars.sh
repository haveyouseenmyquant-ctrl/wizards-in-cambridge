#!/bin/bash
# Rebuild the character models from the CC0 KayKit packs (download to /tmp/wic_dl, trim with build_char_glb.mjs).
# usage: GT=<dir with @gltf-transform/{core,functions,extensions} + meshoptimizer in node_modules> scripts/build_chars.sh
set -e; cd "$(dirname "$0")/.."
D=/tmp/wic_dl; mkdir -p $D site/models/player site/models/mobs
B=https://raw.githubusercontent.com/KayKit-Game-Assets
[ -f $D/Mage.glb ] || curl -sSL -o $D/Mage.glb $B/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/Mage.glb
for s in Mage Minion Rogue Warrior; do [ -f $D/Skeleton_$s.glb ] || curl -sSL -o $D/Skeleton_$s.glb $B/KayKit-Character-Pack-Skeletons-1.0/main/addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_$s.glb; done
# player wizard: Quaternius "Animated Wizard" (CC-BY 3.0, poly.pizza/m/kttbFvCl2C)
[ -f $D/q_wizard.glb ] || curl -sSL -o $D/q_wizard.glb https://static.poly.pizza/7e77cc7a-eff9-4ebd-90a6-7728c265b092.glb
Q=CharacterArmature
node scripts/build_char_glb.mjs $D/q_wizard.glb site/models/player/wizard.glb "{\"clips\":{\"idle\":\"$Q|Idle\",\"walk\":\"$Q|Walk\",\"run\":\"$Q|Run\",\"cast\":\"$Q|Spell1\",\"cast_raise\":\"$Q|Spell2\",\"cast_long\":\"$Q|Staff_Attack\",\"hit\":\"$Q|RecieveHit\",\"death\":\"$Q|Death\",\"jump\":\"$Q|Idle_Weapon\",\"dash\":\"$Q|Roll\",\"block\":\"$Q|Punch\",\"sit\":\"$Q|Idle_Attacking\"}}"
# (old KayKit Mage player, kept for reference)
: node scripts/build_char_glb.mjs $D/Mage.glb /tmp/wic_dl/kaykit_wizard.glb '{"clips":{"idle":"Idle","walk":"Walking_A","run":"Running_A","cast":"Spellcast_Shoot","cast_raise":"Spellcast_Raise","cast_long":"Spellcast_Long","hit":"Hit_A","death":"Death_A","jump":"Jump_Full_Short","dash":"Dodge_Forward","block":"Blocking","sit":"Sit_Chair_Idle"},"drop":["Spellbook","Spellbook_open","1H_Wand"]}'
mob() { node scripts/build_char_glb.mjs $D/$1.glb site/models/mobs/$2.glb "{\"clips\":{\"idle\":\"Idle_Combat\",\"walk\":\"Walking_D_Skeletons\",\"run\":\"Running_C\",\"attack\":\"$3\",\"attack2\":\"$4\",\"hit\":\"Hit_A\",\"death\":\"Death_C_Skeletons\",\"spawn\":\"Spawn_Ground_Skeletons\",\"taunt\":\"Taunt\"}}"; }
mob Skeleton_Warrior statue 1H_Melee_Attack_Chop 2H_Melee_Attack_Spin
mob Skeleton_Mage wraith Spellcast_Shoot Spellcast_Raise
mob Skeleton_Rogue automaton Unarmed_Melee_Attack_Punch_A Unarmed_Melee_Attack_Kick
mob Skeleton_Minion imp Unarmed_Melee_Attack_Punch_B Throw
# flying mobs: Quaternius Ultimate Monsters (CC0, poly.pizza/m/Mo2ky6vkf8 Demon, /m/Iip30bDHmu Ghost, /m/hNO9XvjlKa Bat);
# a source clip can only be used once, so walk (and the bat's idle) are aliased in mob_rig.js
qm() { [ -f $D/q_$1.glb ] || curl -sSL -o $D/q_$1.glb https://static.poly.pizza/$2.glb; }
qm demon c2e39eb4-4b8e-4d31-b014-d637bf4e15c6; qm ghost 810f60a2-6e45-4c4e-a0d5-da91cd7288bd; qm bat 4ae13ae9-c257-41ed-86b5-1b4760924ebc
F="\"idle\":\"$Q|Flying_Idle\",\"run\":\"$Q|Fast_Flying\",\"attack\":\"$Q|Punch\",\"attack2\":\"$Q|Headbutt\",\"hit\":\"$Q|HitReact\",\"death\":\"$Q|Death\",\"taunt\":\"$Q|No\""
node scripts/build_char_glb.mjs $D/q_demon.glb site/models/mobs/gargoyle.glb "{\"clips\":{$F}}"
node scripts/build_char_glb.mjs $D/q_ghost.glb site/models/mobs/wisp.glb "{\"clips\":{$F}}"
B=BatArmature; node scripts/build_char_glb.mjs $D/q_bat.glb site/models/mobs/bat.glb "{\"clips\":{\"run\":\"$B|Bat_Flying\",\"attack\":\"$B|Bat_Attack\",\"attack2\":\"$B|Bat_Attack2\",\"hit\":\"$B|Bat_Hit\",\"death\":\"$B|Bat_Death\"}}"
# bicycle golem: Quaternius Animated Robot (CC0, poly.pizza/m/QCm7qe9uNJ), recoloured moss + rusted iron in mob_rig.js
qm robot 7d95dbce-8c73-489b-8298-f430b1f0dbdf; R=RobotArmature
node scripts/build_char_glb.mjs $D/q_robot.glb site/models/mobs/golem.glb "{\"clips\":{\"idle\":\"$R|Robot_Idle\",\"walk\":\"$R|Robot_Walking\",\"run\":\"$R|Robot_Running\",\"attack\":\"$R|Robot_Punch\",\"attack2\":\"$R|Robot_Jump\",\"hit\":\"$R|Robot_No\",\"death\":\"$R|Robot_Death\",\"taunt\":\"$R|Robot_Yes\"}}"
# story NPCs (Adventurers pack): talk = Interact, wave = Cheer
for s in Rogue Rogue_Hooded; do [ -f $D/$s.glb ] || curl -sSL -o $D/$s.glb $B/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/$s.glb; done
mkdir -p site/models/npcs; C='"idle":"Idle","talk":"Interact","walk":"Walking_A","wave":"Cheer","hit":"Hit_A","death":"Death_A"'
node scripts/build_char_glb.mjs $D/Rogue.glb site/models/npcs/nell.glb "{\"clips\":{$C},\"drop\":[\"Knife_Offhand\",\"1H_Crossbow\",\"2H_Crossbow\",\"Knife\",\"Throwable\",\"Rogue_Cape\"]}"
node scripts/build_char_glb.mjs $D/Rogue_Hooded.glb site/models/npcs/pip.glb "{\"clips\":{$C},\"drop\":[\"Knife_Offhand\",\"1H_Crossbow\",\"2H_Crossbow\",\"Knife\",\"Throwable\"]}"
node scripts/build_char_glb.mjs $D/Mage.glb site/models/npcs/absalom.glb "{\"clips\":{$C},\"drop\":[\"Spellbook\",\"Spellbook_open\",\"1H_Wand\",\"2H_Staff\",\"Mage_Hat\"]}"
