# The rules

*The two blocks that hold the game, the rest, and the readings settled with Mandal. The router is [AGENTS.md](../AGENTS.md).*

Two blocks in `src/index.html` hold the game, and neither touches the DOM:
`window.Rules` for the rolls and `window.SheetRules` for the character maths,
the modifiers, the bonuses, the proficiency, the save DC, the small formula an
item of equipment carries for the armour class (`baseAC=15+min(@dex.mod,2)`,
`AC+2`, read by `effectValue` and `acOf`), and the dice a higher slot buys
(`castPreview`, read by the cast slider of a spell). The suite pulls
both out of the page and runs them in a `vm`, so a change to a rule is a change
to the test.

The rest is not one of them. `src/rest.js` holds what a short rest and a long
rest give back, with `snapshot`, `push`, `rest` and `rewind` over the record it
is handed, and it counts that record through the counter module, so a use of a
summon comes back like any other counter.

Four readings were settled with Mandal, and the code shows the choice without
showing that it was one:

- Divine Smite is the spell, not the paladin feature that shares its name. It is
  cast as a bonus action immediately after a hit, spends one of the character's
  shared spell slots, and its dice double when that hit was a critical one. A
  page that offers it reads the character's spells for it, never the features
  and never the class level.

- Minor element and its plus chip are one choice, not two layers, 2d8 lightning
  or 3d8 once the chip is on. The `EXTRAS` table in the rules block is the knob.
- Scorching ray carries no flat bonus, only eldritch blast does, which is why
  each power carries a `flat` field.
- Advantage rolls 3d20 rather than the 2d20 of the book, because the
  specification says so.

## The attack page

- **To play a turn of attacks.** Read `src/pages/attack.js`, `data/weapons.json`, `src/index.html` (`Rules.throwAttack`, `attackRead`, `turnRead`). Use: the page derives every piece from the sheet (ways, weapons, Extra Attack, Sneak Attack's dice from its text, Metamagic, Divine Smite) and keeps the turn in its slice; every step goes through `step(fn)`, which pushes the history first. Check: `test/rules.test.mjs`, the attack sheet; `tools/smoke.mjs`, the attack sheet.
