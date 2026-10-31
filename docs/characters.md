# The characters

*The classes, the creator, and the numbers a character is built from. The router is [AGENTS.md](../AGENTS.md). The record itself is in [record](record.md).*

## The classes

- **`src/klass.js`**: the class registry: the shape of a class plugin, one file per class under `classes/`, and the mechanics read on a character (`sync`, `attacks`, `sneak`, `has`, `riders`, `useOf`, `colourOf`)
- **`src/classes/*.js`**: one file per class of the book: its level 1 features, its learning rule and its mechanics (the colour, the counters with their counts as code, the attacks, the riders, the sneak dice, the flags); the hit die, the saves and the ability are read from `data/classes.json`
- **To give a class a mechanic.** Read `src/classes/<class>.js`, `src/klass.js`. Use: in the spec: `colour`, `counters` (keys, `uses(level, rec)` as `SheetClasses.step([[level, value], ...])`, `recovery`, `short`, `add`, `pool`, `heals`, `use(level, ctx)`), `attacks(level)`, `sneak(level)`, `riders`, `flags(level)`; pages read them through `C.classes`, and the shell runs `sync(rec)` before every paint. Check: `test/rules.test.mjs`, the class plugins; a class's numbers live in its plugin, and a number the book writes in words is checked against its text.

## The creator and the origin

- **`createCharacter` (api)**: the creator's skeleton from words (class, level, subclass, name, scores), played at once: the agent's `create_character`
- **`src/creator.js`**: the creator of a character from a class: one screen, a top bar (level, the choices made as cards, create), a tab for each choice (class, archetype from level 3, species with its choices, abilities with base, background and final, the custom background), a card opening the book's description and its Select button; it draws and keeps the choices, and the shell hands it `make` (skeleton, origin, add)
- **`src/origin.js`**: the origin of a character (species and its choice, point buy or standard array, a custom background with its increases, Origin feat, two skills and a tool), checked and written in one place for the creator and the fairy; the numbers come from `data/rules.json`, the species from `data/species.json` (`tools/species.mjs`, from the cache)
- **To roll a character from nothing.** Read `src/shell.js` (`openRandomLevel`, `rollName`, `rollDice`), `data/rules.json`, `src/pages/agent.js` (`roll_name`). Use: the Randominator rolls the class, the level, the subclass, the species and its lineage, the six scores (four d6, the three highest), and a background of its own, through the creator's own checks, then asks a fairy to name it (`roll_name`), dress it and paint it. Check: the phone, driven.

## The numbers and the words

- **`src/pages/features.js` (`bookOf`)**: a feature's words come from data, never code: the record's own `blocks` or `text`, then `data/features.json` by key, then `data/feats.json` and `data/features.json` by name; the agent's `add_feature` puts a feature of the books on the sheet as one record
- **`hpFor` / `autoHp` (shell)**: the maximum of hit points from the classes (`hd` of `data/classes.json`) and Constitution: the whole die at the first level, the average rounded up after, at least 1 a level; it follows by itself, and the current hit points move by what it moved, unless `rec.char.hpManual` (Settings, or a maximum typed on the character page)
- **`C.library.weaponOf` (equipment)**: a weapon of the sheet as the attack reads it: the weapon of the books by `base` or name (homebrew included), a magic item of the same name for its bonus (its base read from its name), then the row's own `damage`, `attackBonus`, `damageBonus`; a tap on an item reads it, and a weapon picks its base and bonus there
- **To start a class with its gear, or add an item from the books.** Read `src/pages/equipment.js` (`KITS`, `catalogue`, `openPicker`). Use: a fresh character with a class gets its kit; the + of the AC row opens every weapon, armour, shield and magic item, filtered by type, book and text, and Custom for an empty row; the weapons and the gear are `C.library.weapons` and `C.library.gear`. Check: the page, driven in the browser.
