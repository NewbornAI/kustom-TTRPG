# The record

*The shape of a character. The router is [AGENTS.md](../AGENTS.md).*

A character is one record in the store, under `state.characters[id]`. The record
is a bag of slices, and each slice belongs to the page that reads it:

| Key | Owner | What it holds |
|---|---|---|
| `char` | the character page | the name, the classes, the scores, the hit points (`current`, `max`, `temp`), the features, the dice, the history |
| `spells` | the spells page | the slots, the sorcery points, the lists, the toggles |
| `volley` | the volley page | the spell and the toggles; a beam is a hit until a tap says it missed |
| `summons` | the summons page | the creatures at the table and the settings each was called with |
| `fight` | the fight page | the creatures of a battle, their initiative and their hit points, and the counter that says whose turn it is |
| `equipment` | the equipment page | the items the character carries, the effect each has when worn, and its mastery |
| `image` | the image page | the picture of the character, a data URL downscaled to 720 px on the long side |
| `backstory` | the Background page | the story of the character as plain text, about 100 words, and the page turns itself on for a character that has one |
| `attack` | the attack page | the way and the weapon it attacks with, Adv, Dis and the rider, and the turn: its rolls (both d20s and every die thrown up front), the bonus action and the smite; tracked by the history |
| `pages` | the shell | which pages this character plays with |
| `theme`, `icon` | the shell | its look |
| `pluginPages` | the shell | the pages a package brought in |

A page that owns a slice declares it with `slice` and fills it with `seed`; the
record seeds every slice of every character at boot.

`src/record.js` holds the shape: `of(state, id)`, `slice(rec, key)`,
`set(rec, key, value)`, `seed(rec, fresh)`, `migrate(saved)`, `load(storage)`,
`pagesOn(rec, ui)`, `packageOf(rec)` and `packageIn(pkg)`. The store key and the
three names it had before live there too, so the shell carries none of them, and
the shell and the settings ask the same function which pages are on.

A package carries every slice a page declares, and every slice no page owns yet,
so a slice that is declared is a slice that travels: a summon survives an export,
a push to the shelf and a link. What a slice holds stays with the page.

A page writes its slice through the `api` it gets at mount, never through the
core: the core carries the helpers a page reads, and a check keeps every name a
page reaches in step with what the core actually carries.
