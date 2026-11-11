// Story-owned mob types (bosses for main quests), registered into the shared mob system without editing its table.
// Each type may borrow another type's model and part animation via `model`; Graphics can give it a bespoke model later.
import { registerMobType } from './mobs.js';

// Quest 5 "The Saxon Bell": every crossed-out word in eight centuries of bell-books, risen as one hunched ink scribe.
// Borrows the ink imp's body at boss scale; phase II blots the page (ink rain, nib rush) and calls imps out of itself.
registerMobType({ id: 'blotted_scribe', model: 'ink_imp', death: 'dissolve', scale: 4.2, name: 'The Blotted Scribe of Bene\'t Street', boss: true,
  hp: 820, speed: 3.0, radius: 1.4, xp: 460, aggro: 17, leash: 34, color: 0x7a60ff, knockResist: 1, deathDur: 1.6,
  loot: [{ rarity: 'rare', chance: 1 }, { rarity: 'rare', chance: 0.6 }, { rarity: 'epic', chance: 0.5 }, { rarity: 'legendary', chance: 0.16 }],
  phases: [   // I: the scribe writes (quill slash, backwards curse, blot); II: the page is ruined (ink rain, nib rush, more blots)
    { at: 1.0, attacks: ['slash', 'curse', 'blot'] },
    { at: 0.5, attacks: ['slash', 'curse', 'rain', 'rush'], speed: 1.3, windup: 0.8, cd: 0.75, enrage: true },
  ],
  attacks: [
    { id: 'slash', name: 'Quill Stroke', kind: 'line', range: 4, len: 5, w: 2.6, windup: 0.75, cd: 2.2, dmg: 16 },
    { id: 'curse', name: 'Curse Written Backwards', kind: 'bolt', range: 16, minRange: 3, windup: 0.9, cd: 3.5, dmg: 14, speed: 12, color: 0x30206a },
    { id: 'blot', name: 'Blot', kind: 'ring', range: 6, r: 6, windup: 1.3, cd: 6, dmg: 16, recover: 0.8 },
    { id: 'rain', name: 'Ink Rain', kind: 'cascade', range: 20, n: 6, r: 2.2, windup: 1.2, cd: 7, dmg: 18 },
    { id: 'rush', name: 'Nib Rush', kind: 'charge', range: 16, minRange: 3, len: 15, w: 2.4, windup: 0.9, cd: 5, dmg: 20, speed: 19 },
  ] }, ['ink_imp', 'soot_sprite']);

// Quest 6 "The Mainspring": the guardian of Trinity Street's hidden ward-clock, a brass-and-oak automaton the size of a
// shop-front. Borrows the Clockwork Porter's body at boss scale; every attack lands on the beat (fixed, even cooldowns),
// and phase II slips a cog (the beat quickens) and winds Porters and Bicycle-Golems off the street.
registerMobType({ id: 'escapement_engine', model: 'automaton', death: 'collapse', scale: 2.7, name: 'The Escapement Engine of Trinity Street', boss: true,
  hp: 980, speed: 2.4, radius: 1.5, xp: 520, aggro: 18, leash: 34, color: 0xd8a040, knockResist: 1, deathDur: 1.8,
  loot: [{ rarity: 'rare', chance: 1 }, { rarity: 'rare', chance: 0.6 }, { rarity: 'epic', chance: 0.55 }, { rarity: 'legendary', chance: 0.18 }],
  phases: [   // I: tick, tock, strike (all on a 2 s beat); II: a cog slips, the beat quickens and the pendulum charges
    { at: 1.0, attacks: ['tick', 'tock', 'strike'] },
    { at: 0.5, attacks: ['tick', 'strike', 'escape', 'pendulum'], speed: 1.25, windup: 0.85, cd: 0.75, enrage: true },
  ],
  attacks: [
    { id: 'tick', name: 'Tick', kind: 'line', range: 4.5, len: 6, w: 2.8, windup: 0.8, cd: 2, dmg: 17 },
    { id: 'tock', name: 'Tock', kind: 'bolt', range: 16, minRange: 3, windup: 0.8, cd: 4, dmg: 14, speed: 13, color: 0xe8b050 },
    { id: 'strike', name: 'Striking the Quarter', kind: 'ring', range: 6, r: 6.5, windup: 1.4, cd: 6, dmg: 18, recover: 0.8 },
    { id: 'escape', name: 'Escapement Slip', kind: 'cascade', range: 20, n: 5, r: 2.4, windup: 1.2, cd: 6, dmg: 18 },
    { id: 'pendulum', name: 'Pendulum Drive', kind: 'charge', range: 16, minRange: 3, len: 15, w: 2.6, windup: 0.9, cd: 4, dmg: 21, speed: 18 },
  ] }, ['automaton', 'bicycle_golem']);
