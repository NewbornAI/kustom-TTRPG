# The data

*How a data file is declared and read. The router is [AGENTS.md](../AGENTS.md).*

The loader reads `data/features.json`, `data/spellbook.json`, `data/classes.json`,
`data/bestiary.json` and `data/weapons.json` when a page asks, and fills the
live shapes in place: `C.library.featureByKey`, `C.library.bookByName`,
`C.library.classData`, `C.library.bestiary`. The weapons are the attack page's
and it holds its own list. A page that took its reference at load still sees
the data arrive, because the shell repaints.

A page declares the file it reads, and how the file fills the shape the page
already holds:

```js
C.library.data('probes', function (json) { PROBES.length = 0; json.forEach(push); });
```

The bestiary is the one file the shell declares rather than a page, because
more than one page reads it: the summons calls a creature, the fight tracks
one. Its blocks are keyed by the name and the book (`goblin|mm`), and a name
keeps one block: the newest printing, since two editions of one monster are
two answers to the same question (`tools/bestiary.mjs` holds the year of each
book and decides). `C.library.bestiary.byName` maps a name to its block, and a
card saved against an older printing finds the block by name. A page reads it with
`blockOf(key)` and never registers a shape for it.

`data/items.json` is the catalogue of every item of the books the app reads,
written by `tools/items.mjs`, which the fetch calls as well. It is not the gear
the sheet computes with: `data/gear.json` holds the armour and the magic items
that change a number, and the catalogue holds all 1,404 of them, so a picker can
offer an amulet the sheet does not compute. The equipment page reads it when the
picker opens, and the file is a megabyte and a half, so nothing else reads it.

The declaration is the whole seam: the loader no longer names a file, so a page
that brings a fifth one writes no shell code. A file no page declared is read
and dropped, so the table of the settings that says which files are here is the
list of the declarations. A JSON file dropped in `data/` is written beside the
page by the build with no line to add; the two the build writes into the page
itself, the surge table and the conditions, are the exceptions it names.
