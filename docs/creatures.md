# The creatures

*A creature as a page holds it, and the card of a spell. The router is [AGENTS.md](../AGENTS.md). How the bestiary is keyed and loaded is in [data](data.md).*

- **`src/creature.js`**: a creature of the bestiary as a page holds it: the block by name and book, its numbers at a slot, its stat block, its attack boxes, one roll of one swing, the uses of a trait or an action (the tick, the count, the die a recharge is rolled on), the table an action rolls on (the eye rays of a beholder: a d10 picks the ray, the damage of that ray is rolled with it), and the spellcasting of a caster (its save DC, and the spells it lists, each a link to its card); a card may carry its own block (`card.block`, the empty `blank(name)` of a creature the player wrote); the summons and the fight both read it
- **`src/spellcard.js`**: the card of a spell: its level, range, duration, concentration, ritual and its words, opened by the summons, by the stat block of a caster and by the fight, so a spell reads the same wherever its name is tapped
