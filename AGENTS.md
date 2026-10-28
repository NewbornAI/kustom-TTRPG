# custom-sheet, for an agent

*What this repository is, where the seams are, and how to change the sheet without reading all of it.*

The app is a character sheet and a dice roller for one table, on a phone. The shell
holds the pages, the store and the overlay. Every page is a file of its own under
`src/pages/`, and a page can be added, taken away or rewritten.

This file is a router. Find the job in the table below, read the two or three files
it names, and use the seam it names. Nothing here is a changelog: the commits are.
The README is the human entry point; this file is the agent one.

## The shape of the repository

| Path | What lives there |
|---|---|
| `src/index.html` | the shell markup, the shell styles, and the two rules blocks |
| `src/shell.js` | the registry, the store, the overlay, the shared helpers, the packages, the update |
| `src/card.js` | the row of a list and the layer it opens, the two dresses of the app |
| `src/block.js` | what a page may contribute: a data file, a theme, an icon, a page of its own |
| `src/klass.js` | the class registry: the shape of a class plugin, one file per class under `classes/`, and the mechanics read on a character (`sync`, `attacks`, `sneak`, `has`, `riders`, `useOf`, `colourOf`) |
| `src/counter.js` | a limited resource: read it, spend one, give them back on a rest |
| `src/record.js` | the shape of a character: the store, the slices, the migrations, the package |
| `src/edit.js` | the edit mode: one flag per page |
| `src/rest.js` | what a short rest and a long rest give back, and the history they take back |
| `src/rebuild.js` | the paint of a page: the parts its markup was built from, so a repaint builds again only when they moved |
| `src/drag.js` | the drag of a reorderable list: the hold, the placement rule, the rows a strip carries, and the swipe rule across the page |
| `src/roll.js` | the roll block: the control a page places and rolls on a tap, and the one rendering of a roll the sheet draws |
| `src/cast.js` | the cast block: the button at the bottom of a page that casts, and the row that holds it |
| `src/slider.js` | the level slider: the level to cast a spell or smite at, and the preview of what it does |
| `src/attackbox.js` | the attack box: one swing of an attack, its die, its roll and its damage |
| `src/toggle.js` | the toggle: a chip that turns one thing on or off |
| `src/shelf.js` | the shelf: the sign in, the token, and the folder of characters on GitHub |
| `src/images.js` | the pictures, kept in IndexedDB beside the store so the store keeps its room; in memory a record holds its picture as before |
| `src/github.js` | the client of GitHub: the device calls, the renewal, the files and the branches |
| `src/bridge.js` | the calls to the phone's shell that go to the network, asked the async way (`requestAsync`, `fetchUrlAsync`, `downloadAsync`, `installAsync`) so the page never freezes while one waits |
| `src/pages/*.js` | one file per page: its markup, its style, its behaviour |
| `SURFACE.md` | what an app-editing agent may touch, and the gate it must pass |
| `src/pages/features.js` (`bookOf`) | a feature's words come from data, never code: the record's own `blocks` or `text`, then `data/features.json` by key, then `data/feats.json` and `data/features.json` by name; the agent's `add_feature` puts a feature of the books on the sheet as one record |
| `hpFor` / `autoHp` (shell) | the maximum of hit points from the classes (`hd` of `data/classes.json`) and Constitution: the whole die at the first level, the average rounded up after, at least 1 a level; it follows by itself, and the current hit points move by what it moved, unless `rec.char.hpManual` (Settings, or a maximum typed on the character page) |
| `createCharacter` (api) | the creator's skeleton from words (class, level, subclass, name, scores), played at once: the agent's `create_character` |
| `src/origin.js` | the origin of a character (species and its choice, point buy or standard array, a custom background with its increases, Origin feat, two skills and a tool), checked and written in one place for the creator and the fairy; the numbers come from `data/rules.json`, the species from `data/species.json` (`tools/species.mjs`, from the cache) |
| `C.library.weaponOf` (equipment) | a weapon of the sheet as the attack reads it: the weapon of the books by `base` or name (homebrew included), a magic item of the same name for its bonus (its base read from its name), then the row's own `damage`, `attackBonus`, `damageBonus`; a tap on an item reads it, and a weapon picks its base and bonus there |
| the sheet language (`src/index.html`, the rules: `ATTRIBUTES`, `effectValue`, `sheetGet`, `sheetSet`, `effectsOf`, `withEffects`) | every value of a character has a name (`init`, `AC`, `save.dex`, `skill.stealth.prof`, `hpMax`, `slot.3`, `uses.<key>`…); a formula reads any of them, a set writes the settable ones once, and an effect (`init + prof`; several split by `;`) on a feature or a worn item moves the ones marked effect every time the sheet is drawn. `attributeList()` is the documentation the fairy reads; its tools are `sheet_get`, `sheet_set`, `set_effect` |
| `rec.layout` (shell: `scopeCss`, `setLayout`, `layoutMap`) | a character's own CSS for a page, each selector held inside `#view-<page>`, no `url()` or `@import`, worn while it is played; the fairy reads `layout_map` (elements, boxes, what wraps or overflows) and writes `style_page` |
| `src/own.js` | the character's own library: `rec.library = {features, spells, items}`, entries in the shape of the books (config, never code), laid into the in-memory books while the character is played (`core.own.sync` before each paint) so every page finds them like book entries; `core.own.write` checks an entry's shape |
| `src/wire.js` | the wiring of a written page: `data-show`, `data-pips`, `data-add` (with `data-cost`), `data-set`, `data-spend` and `data-roll` work with no listener, save the sheet and repaint; `block.js` runs it around every plugin page's mount and render, and gives page code `C`, the core |
| `src/pages/agent.js` | the agent page, shown to the player as the Fairy (a session is a fairy; `write_theme` makes a theme of colours that travels in a hidden page of the character): a model on the serving machine reads the sheet and the books, changes the sheet's slices and writes its own pages through `installPage`, `removePage` and `pageError`; it asks up to three numbered questions with its pick before a change, builds pages from the wired attributes, as a tab or as a panel inside a page of the app (`into`, `at`: `bar` joins the page's row of chips, the one a page marks with `data-bar`, and a page without one gets a row at its top; `top` and `bottom` the shell mounts it in that page's scrolling body and puts it back when the page paints its body anew), presses every button of a page it wrote on a copy of the sheet and fixes what fails, folds the model's reasoning under the thinking line, backs the character up before its first change, and undoes a run whole. A call that times out or fails is tried again after 5, 15, 30 and 60 seconds with "continue", then a button tries by hand, and the send button stops a run. Its conversations are sessions, kept per character in the phone's store (the last twenty), with a new one and a list to go back to any. `paint_picture` draws the character and puts the picture on the Image page, `write_backstory` writes the story the painter reads first (30 words, two sentences); the picture model draws every word it is given, so a concept is one plain sentence of at most 25 words with at most one telling detail placed precisely, the story is distilled rather than handed over, and `paint_choices` takes three concepts that are three readings of the character, the app dealing each picture its own setting and light; `paint_choices` draws two or three of them, the same character and style, each different in the parts the player did not name, and shows them full screen with the arrows at the bottom corners, a swipe and a Pick button (`api.gallery`), so only the picked one is kept; `repaint_picture` changes one thing in a picture that is already there (the pixels go back to the model's edit route, so the face stays) and `theme_from_picture` reads the drawing's ground, ink and accent on a 32 px copy and makes a theme of them: the fairy describes what to draw, the house server calls SenseNova's image model with the app's own look (ink and wash, high fantasy, `PICTURE_STYLE`), and the page fits the answer to 720 px of webp before it lands (`C.images.fit`), one step of the history. The phone posts through `postJson`, to the `agent` bridge of `MainActivity` (house network, paths `/agent` and `/paint`, no token, 240 s for a picture); `tools/serve.mjs` holds the key, forwards the conversation to SenseNova and draws the pictures |
| `src/classes/*.js` | one file per class of the book: its level 1 features, its learning rule and its mechanics (the colour, the counters with their counts as code, the attacks, the riders, the sneak dice, the flags); the hit die, the saves and the ability are read from `data/classes.json` |
| `data/*.json` | the rules data, fetched by `tools/fetch-5e-data.mjs` |
| `app/` | the Android shell that wraps the same page |
| `tools/` | the build, the data fetch, the server, the icon maker, the package, the walk; `markup.mjs` owns the grammar of the upstream text |
| `test/*.test.mjs` | four suites, one per subject |
| `characters/` | the shelf: one package per file; private, never published |
| `dist/` | a build output, none of it tracked; the package ships as a release |

`dist/` is written by the build: the page, the data beside it, the version. None of
that is tracked, so a commit carries source only. The package, `dist/custom-sheet.apk`,
is not tracked either: it ships as the latest GitHub release, which the install link
of the README points at, with `tools/build-apk.ps1 -Release`. The copy in `dist/`
stays on the machine that builds, because the next package must carry its
certificate, and a dist older than `src/` or `data/` is refused:
`tools/build-apk.ps1` compares the signing certificate with `apksigner` and says
build first, and `-Check <apk>` verifies one package against the keystore.

A phone asks the machine for `/version.json` and installs `/custom-sheet.apk`, so the two
must speak of the same build. `tools/build-apk.ps1` writes `version.json` from the page it
packaged, and `build.mjs` does not write it. `node build.mjs` alone therefore leaves the
phone on the build it already has while the offer of a newer one never ends, so a change
reaches the phone only when the package script runs after it.

## The commands

The whole list is in the README under [Build it](README.md#build-it). The loop an
agent runs is two commands:

```
node build.mjs            # src to dist/index.html, the font and the data inlined
node test/rules.test.mjs  # the rules, the data and the pages, about a thousand checks
```

Two repositories hold this tree. `NewbornAI/kustom-TTRPG` is public and carries the
code and only SRD content; `NewbornAI/kustom-mandal` is private and carries the full
corpus and the characters. This working tree is the private one.

```
node tools/srd-filter.mjs --out build/srd-data  # the SRD-only corpus, from data/ and the 5e.tools cache
node tools/publish-public.mjs                   # assemble, check, commit and push the public tree
```

The publish drops `characters/`, `tasks/`, `STATUS.md` and the seeded features, swaps
`data/` for the SRD build, empties the house address in `src/shell.js`, refuses a tree
that still carries a machine path, the LAN address or another account, then runs the build and the four
suites before the commit. One commit per publish, authored NewbornAI, naming the
private commit it came from.

## The map: find your job

| If you want to | Read | Use the seam | Check |
|---|---|---|---|
| add a page | `src/pages/character.js`, `src/shell.js` (`page`) | `Sheet.page(spec)` | the page appears in the bar with its `glyph`, the slice seeds, a save and a load keep it |
| change the bar at the bottom | `src/shell.js` (`barOrder`, `barSplit`, `renderTabs`, `openMore`), `src/pages/settings.js` (`tabsSection`) | `state.ui.bar` is the player's order, `state.ui.barRows` is 1 or 2; one row shows four pages and More, two rows show every page | `tools/smoke.mjs`, the bar |
| change what a page looks like | that page | its own markup and style | the phone at 360x720 |
| hold a bar at the top of a page while the rest scrolls | `src/pages/spells.js` (`.lvbar`, `paintStuck`, `pickLevel`) | one scroller for the page and `position: sticky` on the bar; nothing folds | `tools/smoke.mjs`, the spells |
| turn a spell slot into sorcery points | `src/pages/spells.js` (`eat`, `paintEat`), `src/index.html` (`Rules.convertSlot`) | the Eat button spends a slot of the level on screen | `test/rules.test.mjs`, `tools/smoke.mjs`, the spells |
| take a swipe for a page, or keep one for a part | `src/shell.js` (`wireSwipe`, `keepsMove`), `src/drag.js` (`swipe`, `carrying`) | the move decides, not what it started on: a part that drags sideways itself says so with `data-swipe`; a range input, a focused field, a carried row and the sheet keep theirs | `tools/smoke.mjs`, the feel of a page |
| make part of a page editable | that page, `src/edit.js` | `a.editing(id)`, `a.wrench({label})` | the wrench toggles, the pressed state survives a tab switch |
| change a rule of the game | `src/index.html`, the two rules blocks | `window.Rules`, `window.SheetRules` | `test/rules.test.mjs` |
| change what a rest gives back | `src/rest.js`, `src/counter.js` | `C.rest.rest(kind, rec)` | `test/rules.test.mjs`, the rest checks |
| make a change the back key takes back | `src/rest.js` | `C.rest.push(rec)` before the change; a page whose own slice belongs in the steps calls `C.rest.track(key)` once, and the slice is written back into the object it holds | `test/rules.test.mjs`, the rest checks |
| move the hit points | `src/pages/character.js` (`paintHp`, `moveHp`, `openHpKeys`), `src/index.html` (`SheetRules.hpMove`) | `SR.hpMove(hp, kind, amount)` with `damage`, `heal`, `set` or `temp` | `test/rules.test.mjs`, `tools/smoke.mjs`, the hit points |
| add a field to a character | the page that owns the slice, `src/record.js` | the page's `seed`, `api.record.slice(rec, key)` | a save and a load, and a package round trip |
| spend or give back a limited resource | `src/counter.js` | `counterOf`, `spend`, `refill`, `set` | `test/rules.test.mjs`, the counter checks |
| start a class with its gear, or add an item from the books | `src/pages/equipment.js` (`KITS`, `catalogue`, `openPicker`) | a fresh character with a class gets its kit; the + of the AC row opens every weapon, armour, shield and magic item, filtered by type, book and text, and Custom for an empty row; the weapons and the gear are `C.library.weapons` and `C.library.gear` | the page, driven in the browser |
| give an item an effect on the sheet | `src/index.html` (`SheetRules`), `src/pages/equipment.js` | `acOf`, `effectValue` | `test/rules.test.mjs`, the effect checks |
| put a roll on a page, or draw one | `src/roll.js`, `src/index.html` (the rules block) | `C.roll.control(node, {label, set, onRoll})` where `set` is a string or a function read at the tap, and `C.roll.groups(list, {flat, total})` for a roll the page already holds | the control, driven in the browser; the boxes and the smite draw their dice with it |
| put the cast button at the bottom of a page | `src/cast.js`, `src/index.html` (the cast block) | `C.cast.row({buttons})`, last in the page | the page, driven in the browser |
| choose a level to cast or smite at | `src/slider.js`, `src/index.html` (the slider block) | `C.slider.row({levels, value, label, preview})`, `C.slider.wire(root, {levels, previewAt, onPick})` | the page, driven in the browser |
| draw one attack and its damage | `src/attackbox.js`, `src/index.html` (the attack box, the card) | `C.horizontalAttackBox.swing({...})` for a summon's swing, `C.verticalAttackBox.cell({...})` for a volley column, `C.attackCard.card({read, ix, fresh, pop, after})` for one roll of a turn read by `R.attackRead` | the summons' stat block, the volley and the attack sheet, driven |
| put a toggle or a segment on a page | `src/toggle.js`, `src/index.html` (the toggle block, `.seg`) | `C.toggle.chip({key, label, rgb, on, icon, pill, disabled})`; `C.toggle.fill(node, list, {cols})` for a grid that never reflows; `C.toggle.segment({key, aria, on, options})` for one choice out of a few | the volley, the attack sheet and the settings, driven |
| write the story, or have the fairy write it | `src/pages/backstory.js`, `src/pages/agent.js` (`write_backstory`) | the page reads and writes `rec.backstory`; the fairy writes it in at most 30 words and two sentences, the event that pushed the character out and what it wants now, and a longer one is sent back unless the player asked | the page, driven; `test/rules.test.mjs` |
| roll a character from nothing | `src/shell.js` (`openRandomLevel`, `rollName`, `rollDice`), `data/rules.json`, `src/pages/agent.js` (`roll_name`) | the Randominator rolls the class, the level, the subclass, the species and its lineage, the six scores (four d6, the three highest), and a background of its own, through the creator's own checks, then asks a fairy to name it (`roll_name`), dress it and paint it | the phone, driven |
| play a turn of attacks | `src/pages/attack.js`, `data/weapons.json`, `src/index.html` (`Rules.throwAttack`, `attackRead`, `turnRead`) | the page derives every piece from the sheet (ways, weapons, Extra Attack, Sneak Attack's dice from its text, Metamagic, Divine Smite) and keeps the turn in its slice; every step goes through `step(fn)`, which pushes the history first | `test/rules.test.mjs`, the attack sheet; `tools/smoke.mjs`, the attack sheet |
| give a character a picture | `src/pages/image.js`, `app/java/com/newbornai/customsheet/MainActivity.java` | `LONG`, `shrink`, and the window's `onShowFileChooser` | the file control in the app, and the package round trip |
| open a list on top of a page | `src/card.js` | `list({id, title, rows, onPick})` | the layer opens, scrolls and picks |
| draw a row of a list | `src/card.js` | `row(...)` for the two-line card, `line(...)` for the one-line row | the markup, and the dataset `onPick` gets |
| read a data file | `src/block.js`, `data/` | `C.library.data(name, shape)`, and the file dropped in `data/` | the page that asks for it |
| change a sign in or a shelf call | `src/shelf.js`, `src/github.js` | `SheetShelf` for the jobs, `SheetGit` for the calls | `test/github.test.mjs` |
| change the update route | `src/pages/settings.js`, `src/shell.js` (`installUpdate`) | the update block | the toast answers |
| add a colour or an icon | `src/block.js` | the `themes` and `icons` a page carries | the gallery in the edit mode |
| let a page bring its own file, look or place | `src/block.js` | `data`, `theme`, `icon`, `page(spec)` | `test/rules.test.mjs`, the block checks |
| add a class or change how it learns | `src/klass.js`, `src/classes/*.js` | `SheetClasses.define(spec)` | `test/rules.test.mjs`, the class plugin checks |
| give a class a mechanic | `src/classes/<class>.js`, `src/klass.js` | in the spec: `colour`, `counters` (keys, `uses(level, rec)` as `SheetClasses.step([[level, value], ...])`, `recovery`, `short`, `add`, `pool`, `heals`, `use(level, ctx)`), `attacks(level)`, `sneak(level)`, `riders`, `flags(level)`; pages read them through `C.classes`, and the shell runs `sync(rec)` before every paint | `test/rules.test.mjs`, the class plugins; a class's numbers live in its plugin, and a number the book writes in words is checked against its text |

If a job is missing from this table, add the row with the change. A row that is
wrong is worse than a row that is absent.

## The page

A page describes itself and the shell gives it a tab.

```js
Sheet.page({
  id: 'notes',
  title: 'Notes',
  order: 5,
  blurb: 'The notes of the character.',
  html: '<div class="charbody" id="notesBody"></div>',
  mount: function (root, a) { /* find the nodes */ },
  render: function (a) { /* paint them */ }
});
```

A page may also carry `hidden` (no tab of its own, the gear opens it), `home`
(the page the app opens on), `tab` (a shorter label than its title), `glyph`
(its icon in the bar: one SVG path on a 24 by 24 box, drawn as a 1.8 stroke;
a page without one gets a square), `on: true`
(it is one of the pages a character starts with, and the default set is the
list of those), `slice` (the key it owns in the record of a character),
`seed(saved, fresh, rec)` (what a new character starts from), `css` (its own
styles) and `themes` and `icons` (the look the page brings with it, registered
when the page joins). A page is off by default and the player turns it on in
the settings.
A page's `head(root, a)` adds its own action to the head of the app, between
the characters and the settings; the shell owns that order, the size of the
three buttons and the gap between them, so a page never sets the place of its
own button.

A page that comes in a package is the same page: `C.plugin(p)` compiles its
`mount` and `render` from source and carries every key, `home`, `hidden`,
`tab`, `glyph`, `slice`, `seed` and `head` included. A package page with a slice and
a seed arrives with its slice filled. What it does not get is trust: it runs
with the rights of the app, so an import that brings pages asks the player
first, with or without them. A package page never takes the id of a page of
the app, it belongs to the character that brought it (registered when that
character is played, gone when another is), and a page whose code does not
compile or throws shows the reason in a `.page-error` box where it would have
been.

A page written again, `Sheet.page(spec)` with an id already mounted, is
unmounted first and mounted again if it is on screen; a page may carry
`unmount(root, a)` to let go of what it holds. The shell's `unmountPage(id)`
and `unregisterPage(id)` are the two steps, and `REBUILD.forget(id)` makes the
next paint build.

The page gets `a` at mount and at render:

| On `a` | What it is |
|---|---|
| `a.character()` | the record of the character being played |
| `a.characters()` | every character, by id |
| `a.state` | the whole store |
| `a.save()` | write the store down |
| `a.refresh()` | paint the page again |
| `a.show(id)` | go to a page |
| `a.toast(text)` | say something for a moment |
| `a.sheet.open(layer)` | open the overlay |
| `a.editing(pageId)` | is that page in its edit mode |
| `a.wrench({label})` | the button of the edit mode for this page, pressed state included |
| `a.paint(parts, {build, render})` | paint the page, and build its markup only when the parts moved |
| `a.markDirty(key)` | tell the repaint that something the parts do not carry has changed |
| `a.core` | the modules and the three boxes, below |
| `a.pages` | the pages that exist |

The helpers on `a.core` are the ones a page leans on, and they sit in three
boxes beside the modules:

- `C.library` holds the rules data and the lookups over it: `book`,
  `bookByName`, `features`, `featureByKey`, `bestiary`, `classData`,
  `classInfo`, `classRows`, `canonSource`, `classShort`, `sourceTag`,
  `primaryAbility`, `seeds`, `surge`, `data(name, shape)` and `dataError`.
- `C.chrome` holds the markup and the drawings: `esc`, `markup`, `field`,
  `sectionHead`, `renderBlocks`, `sourceLine`, `dieIcon`, `restIcon` (the
  hourglass and the moon), `themes`, `icons`, `iconOf`, `isPhone` and
  `bumpSp`.
- `C.exchange` holds the files, the links and the update:
  `exportCharacter`, `packageOf`, `openPasteLink`, `linkOf`, `shareLink`,
  `pickFile`, `readUrl`, `server`, `version`, `installUpdate`, `openUrl` and
  `shelf`.

The modules stay at the top of the core: `C.R` for the rolls, `C.SR` for the
character maths, and `C.card`, `C.counter`, `C.roll` and `C.rest` beside them.
A name no page reaches is not in a box.

`C.exchange.shelf` is one door: the sign in, the token and the shelf are the
jobs of `src/shelf.js`, and a page calls `shelf.repo()`, `shelf.signedIn()`,
`shelf.begin()`, `shelf.put(rec)` and the rest rather than the steps behind
them.

The shell repaints a page whenever the data arrives, so a page that builds its
markup once paints it through `a.paint(parts, {build, render})`: the parts are
what the markup was built from, `build` writes it, `render` paints it, and the
shell builds again only when the parts moved. A page that only builds passes
`build` alone. A page keeps no key of its own: the key belongs to the page, so
two lists that move apart are two parts of one paint. A change the parts do not
carry, a tap that spends a use, says `a.markDirty(key)` instead of building by
hand. `src/rebuild.js` holds the paint and the mark, and the rule is written in
its header.

A page that holds a reorderable list hands it to the drag module:
`D.list(container, {row, key, ignore, layout, onOrder})` owns the gesture and
the placement, and hands the order back as keys; `drag.wasDragged()` swallows
the click that follows a drag. The page keeps only the container and what to do
with the order.

The edit mode is one flag per page, held by `src/edit.js`: a page asks
`a.editing('its-id')` and puts `a.wrench({label})` in its head, and the shell
owns the button, the toggle and the pressed state. A page never keeps a flag of
its own, and the house rule holds: the mode changes what a part can do, not how
it looks.

## The record

A character is one record in the store, under `state.characters[id]`. The record
is a bag of slices, and each slice belongs to the page that reads it:

| Key | Owner | What it holds |
|---|---|---|
| `char` | the character page | the name, the classes, the scores, the hit points (`current`, `max`, `temp`), the features, the dice, the history |
| `spells` | the spells page | the slots, the sorcery points, the lists, the toggles |
| `volley` | the volley page | the spell and the toggles; a beam is a hit until a tap says it missed |
| `summons` | the summons page | the creatures at the table and the settings each was called with |
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

## The data

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

The declaration is the whole seam: the loader no longer names a file, so a page
that brings a fifth one writes no shell code. A file no page declared is read
and dropped, so the table of the settings that says which files are here is the
list of the declarations. A JSON file dropped in `data/` is written beside the
page by the build with no line to add; the two the build writes into the page
itself, the surge table and the conditions, are the exceptions it names.

## The overlay and the card

`src/card.js` writes the two dresses the app has and opens the layer that holds
them: `row({name, badge, note, chips, data})` is the two-line card of the book
and of the summons, `line({name, meta, mark, data, pick, action})` is the
one-line row of the characters, the shelf and the choosers, and
`list({id, title, rows, meta, search, actions, onPick})` opens the layer and
hands the picked row back as its dataset, so no page walks the markup it wrote.
A one-line row is either the control or it holds one, never both: with `pick`
the row is the button, with `action` the name is the button and a delete sits
beside it. That is what keeps a button out of a button. What a row means, which
rows to show and what a chip does stay in the page.

`a.sheet.open({ id, title, meta, list, onList })` is the older door to the same
overlay, for the layers that are a form rather than a list. `onList` gets the
click, and `ev.target.closest(...)` finds the row. A layer
keeps the place it was scrolled to when another opens on top of it, and the id
is what tells the shell that the layer being opened is the one already there, so
two layers must not share one. To see the ids in use:

```
grep -n "id: '" src/*.js src/pages/*.js
```

A layer that is about one thing names it `thing:key` (`feature:sharpshooter`,
`summonspell:fireball`, `remove:<id>`), so a second layer of the same kind cannot
take the place of the first.

## The rules

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

## The tests

| Suite | What it covers | How it reaches it |
|---|---|---|
| `test/rules.test.mjs` | the rolls, the character maths, the rest, the data, and the pages | it pulls the two rules blocks out of `src/index.html` and runs them in a `vm`; a page is run through `test/harness.mjs` with a core built from the real modules |
| `test/github.test.mjs` | the client, the sign in and the shelf | a stub `window` and a fake client |
| `test/address.test.mjs` | the address of a file on GitHub | pure functions |
| `test/markup.test.mjs` | the grammar of the upstream text: the tags, the damage and the terms | string fixtures, no network and no cache |

`test/fixtures/` holds the character packages the rules suite reads, one file
per character. `characters/` is the shelf, so a character pushed from the app
moves it; the checks read a frozen copy instead.

`test/harness.mjs` is the one way into the app for the suites: `built()` runs the
build once per process, `source(name)` reads a file of `src`, `page(id, opts)`
runs a page, and `coreStub(parts)` builds its core in the shape of the real one.
It does not mount a page in a DOM.

What the suites do not cover is the shell in a real DOM: no suite mounts a
page. Two tools do. `tools/smoke.mjs` drives the shell's own behaviour in
Chromium and answers `ok`/`no` lines like a suite: the boot, the picture kept
beside the store, the import of a package that brings pages and the question
it asks, a package page refused the id of a page of the app, a page that does
not compile, a page written again, the pages of a character leaving with it,
and a full store. It needs the `playwright` package, and the repository takes
no dependency:

```
node tools/smoke.mjs
```

The server also answers for the fairy: `POST /agent` forwards a conversation to SenseNova's chat model and `POST /paint` draws one picture, both with `SENSENOVA_API_KEY` in the environment of the server, both read-only to it, and `GET` on either says whether the key is there. The picture is 768 square (`SENSENOVA_IMAGE_SIZE`) and comes back as a data URL, because the address the model answers with expires and the phone may be off the network when it does; `SENSENOVA_IMAGE_MODEL` names another image model. A picture takes about forty seconds.

A copy for somebody on another network goes to an Upstash Box: the archive is `dist/` and the three files the server imports (`tools/serve.mjs`, `tools/bestiary.mjs`, `tools/markup.mjs`), uploaded and checked by its sha256 inside the box; the key goes to `/workspace/home/custom-sheet/.env` at mode 600, never in the archive; `start.sh` starts `node tools/serve.mjs 3000` detached with that env, the box's init command is `sh /workspace/home/custom-sheet/start.sh`, and `box public-url 3000` prints the address. The page takes its own origin as the server there, so a browser needs no setting; an installed package still points at the house network.

The walk is the other, and it is the check of the pixels:

```
node tools/serve.mjs 8123
node tools/walk.mjs --origin http://127.0.0.1:8123 --out shots --tag base
```

It opens the built page at 360x720, plants the fixture of `tools/walk-seed.js`,
screenshots the six pages and the edit-mode gallery, and writes `<tag>.txt` with
one line per screen and its SHA-256, so two builds are compared by hash. It needs
`playwright-cli` on the PATH.

## The traps

- **Markup in `src/index.html` outside a script tag is dead.** The build inlines
  the script files it finds and nothing else. A page is a file in `src/pages/`;
  the only live markup in `index.html` is the shell itself.
- **A page or a class is a file dropped in its folder.** `index.html` names
  `pages/*.js` and `classes/*.js`, and the build inlines every file of the
  folder in the order of their names, so a new one touches nothing else. The
  place of a tab is the page's `order`, never the order of the files.
- **A class name is a page's own.** Two pages that style the same name fight by
  specificity, and nothing warns. Prefix a block that more than one page uses.
- **The edit mode changes what a part can do, not how it looks.** One element, one
  style; a field the edit mode turns writable is read-only outside it.
- **`dist/` is a build output.** Rebuild it, never edit it, and commit none of
  it: the package goes out as a release.
- **The package holds the page the build wrote.** `tools/build-apk.ps1` ends by
  comparing `assets/index.html` inside the signed package with `dist/index.html`
  byte for byte, and fails when they differ; the only block it names as
  re-stamped is `version-data`, never a wildcard.
- **A class of the app that implements a generic interface crashes d8.** The
  d8 of build-tools 34.0.0 dies with a NullPointerException on the class file
  (measured 2026-10-26 on `implements ValueCallback<String>`, a named class
  and an anonymous one alike). A lambda compiles to an instruction d8 reads
  after the class, and the package builds, so the back key answers through
  one.
- **The sign in has two routes.** On the phone it is a device flow: the app
  asks GitHub for a code, the player approves it in a browser, and the app
  waits, so a sign in survives the app being closed. A page of a browser
  cannot run that flow, so it takes a token pasted instead. `src/shelf.js`
  owns both, and a page asks it for the job.
- **The installer is launched once, and the answer is the pause.** A second
  `ACTION_VIEW` fired while the phone is still starting the installer
  re-delivers the intent to the installer's task, and the installer then shows
  no dialog at all. `MainActivity.install()` fires one intent and waits four
  seconds for the window to pause; the pause is `ok`, and anything else is said
  to the player, whose next tap is the recovery. Measured 2026-10-26: a 1.2 s
  wait fired the retry while the installer was coming up, the update sat with
  nothing on screen for thirty seconds, and the following tap installed it at
  once.
- **The store is one string with a ceiling.** localStorage holds about five
  megabytes. The pictures live in IndexedDB (`src/images.js`), the history is
  held to sixty steps and 64 KB a character (`src/rest.js`), and a write the
  store refuses says so in a toast. A slice that can grow without bound needs
  the same care.
- **The back key of the phone is the page's first.** `MainActivity.onBackPressed`
  asks `window.__sheetBack()`, which closes what is open over the page, then
  leaves the settings, then takes back the last change (the rewind, which the
  head shows only in a browser). It answers `closed`, `rewound` or `none`, and
  only `none` sends the app to the background. A page that opens something
  of its own that back should close registers it with the sheet, so the
  shell can see it.
- **A hold selects nothing.** The whole `.app` is `user-select: none` with no
  long-press menu; a field and the text of a description take it back. A page
  never turns selection on for a card of its own.
- **A sheet layer may dock.** `a.sheet.open({..., dock: true})` (or the same
  key on `C.card.list`) makes the layer a panel at the bottom over a dimmed
  page, and a tap on the dim closes it; without it the layer covers the page.
- **The name in the banner opens the picture.** A tap on it shows the
  character's picture over the whole screen (`openPicture`, the `#viewer`),
  and back closes it first.
- **The banner names the character.** The tab says the page, so a page with
  a tab shows the character's name in the head; a page with no tab (the
  settings) shows its own title.
- **A call to the phone's shell that goes to the network is asked through
  `SheetBridge.call(name, args)`**, never on `SheetNet` directly: the plain
  calls hold the page until the network answers. The shell sends the token
  only to `github.com` and `api.github.com`; `request` refuses any other host.
- **The token is the one secret.** It lives in the store, it is never typed by
  hand into the app (a paste is accurate where a typing is not), and it never
  leaves the machine except to GitHub. No secret is in the repository.

## The package

A character leaves the app as a package, and a package can carry pages of its
own.

```json
{
  "kind": "custom-sheet-character",
  "version": 1,
  "name": "Yngwie",
  "saved": "2026-10-22T18:00:00.000Z",
  "record": {
    "char": {}, "spells": {}, "volley": {},
    "pages": ["volley", "spells", "features"],
    "theme": "blueRed", "icon": "guitar"
  },
  "pages": [
    {
      "id": "notes",
      "title": "Notes",
      "order": 5,
      "blurb": "The notes of the character.",
      "html": "<div class=\"charbody\" id=\"notesBody\"></div>",
      "css": "#notesBody { color: var(--ink); }",
      "mount": "function (root, a) { ... }",
      "render": "function (a) { ... }"
    }
  ]
}
```

A page may carry `themes` and `icons` beside its markup. A theme brings its own
palette in `vars`, a map of CSS custom properties, and the shell writes the rule
for it in a tag of its own the first time a character wears it, so a theme a
package brings applies like one of the eight the app ships. A theme id is
checked before it can reach the css. The gallery already lists what the
registries hold, so a contributed look sits beside the shipped ones.

The `mount` and the `render` of a plugin page are the source of a function,
and they run with the rights of the app itself. A package is only as safe as
the person who sent it, which is why the import of one that carries pages
names them and asks: with its pages, or without.

An import never replaces a character that is already there. A name that is
taken gets a number at the end.

## The exchange

A character travels as a package, and there are three ways for one to
arrive. None of them asks the player to type a secret.

- **A file.** `exportCharacter` writes the package and the phone offers it to
  send. `pickFile` opens the explorer of the phone, and a file control of the
  page is answered by the window's `onShowFileChooser`, so one page reads a
  file the same way on the web and in the app.
- **A link.** `linkOf(pkg)` packs the package into a link, squeezed and
  encoded, and the character rides in the fragment of the link, which no
  server ever sees. `importAny(text)` reads a link back, and falls back to
  `importUrl` when the text is the address of a file that holds a package.
- **The shelf.** A folder in the public repository of the app, read with no
  secret: `shelf.characters(ref)` and `shelf.branches()`. A branch is a
  shelf of a player, and anybody may open one. A row of the shelf carries the
  name, the raw address of the file and the address a browser shows.
- **The address of a file on GitHub is read as well as the raw one.**
  `rawAddress(url)` turns `github.com/o/r/blob/ref/path` and
  `github.com/o/r/raw/ref/path` into `raw.githubusercontent.com/o/r/ref/path`,
  because the page a browser shows answers no cross origin request and the
  raw file does. `importAny` and `importUrl` both go through it.

## The shelf writes back

`src/github.js` is the client and `src/shelf.js` is the job. The client
answers to two transports: the shell of the phone (`SheetNet.request(url,
method, body, token)`, which answers with `{status, body}`) and the network
of a browser (`fetch`, which GitHub lets across origins for the API but not
for a sign in). The device flow is a POST to
`https://github.com/login/device/code` then a poll of
`https://github.com/login/oauth/access_token`; the client id is public and
lives in that file, and no secret is needed.

The token is kept in the store, under `state.ui.gh` and `state.ui.token`,
and the login under `state.ui.login`. The write path is one call:
`putFile` PUTs a file into `characters/` on a branch, through the contents
API, so a branch that is not there yet is made with `createBranch` first.
`createRepo` makes a repository of the player and `forkRepo` forks the one
of the project.

The jobs a page asks for: `repo()`, `setRepo(name)`, `branch()`,
`setBranch(name)`, `signedIn()`, `waiting()`, `begin()`, `wait(onDone)`,
`last()`, `token()`, `setToken(t)`, `characters(ref)`, `branches()`,
`put(rec, message)`, `remove(fileName)`, `makeRepo(name, isPrivate)` and
`fork()`.

## The house rules

- Mandal's words: "The ideal state: everything is a plugin or a block that
  can be reused, added, removed or rearranged with minimal effort". A page, a
  block, a theme or an icon that cannot be added or taken away without editing
  the shell is a fault in the shape.
- English, and the prose has no em dashes.
- A phone screen follows the five principles of the `mobile-design` skill: show
  instead of telling, spatial grouping, room for the words that matter, fewer
  taps to the frequent action, and lazy by default with capped background
  loading. Measuring a screen against them is a review, and the commits carry it.
- The data files carry the text of the SRD and stay under Creative Commons
  Attribution 4.0. The code is under the MIT licence. The NOTICE file says
  where the text came from, and it travels with any change to the data.
- The signing key is not in the repository, on purpose. A published key would
  let anybody sign an update of the app. The build makes one when it is
  missing.
- The edit mode changes what a part can do, not how it looks. A part that is
  the same in both modes is one element with one style, and a field the edit
  mode turns writable is read-only outside it rather than replaced by a span,
  so nothing changes scale when the wrench is pressed.
- One writer per file. Read before you write, and run the test after.
- The shelf holds one file per character on `main`, and a branch is for a
  character that is not ready to be shared yet.
- Reuse helpers wherever possible, for style consistency. Mandal's words. A
  block that exists is reused and not written again: the level slider
  (`C.slider`), the attack box (`C.attackbox`), the toggle (`C.toggle`) and
  the line that says what was spent are one implementation each, and a second
  one is a fault in the shape.
- Build tailor-made but adaptable. Mandal's words: "options tied to a specific
  feature, item or other data stay hidden if they are missing". A control that
  serves one feature, spell or item shows only for a character who has it, so a
  page never offers what the sheet cannot do.
- Any tap that triggers something gives feedback by briefly outlining the
  container or an icon related to the trigger. Mandal's words. The eye lands
  where the change happened.
- Resource expenditure or refund always gives feedback, in the style of the
  line that pops up when a spell is cast at a level, "Fireball cast at level
  3". Mandal's words. One helper carries that line, and a spend or a refund
  that says nothing is a fault.
- The cast button sits at the bottom of the page, where the volley puts it.
  Mandal's words: "it's not at the same spot on the screen (bottom in volley,
  which is good)". A page that casts uses the one cast block and its place:
  `C.cast.row({buttons})`, last in the page, with the look in the shell and
  the handler in the page.
- Each page has a settings surface of its own, where every option beyond the
  default can be toggled and configured where it makes sense, reached from the
  settings by tapping the page. Mandal's words. It is a mechanism the shell
  carries and a page declares its options into, not a rule for an agent to
  follow: a page with no options shows its on and off and nothing else.
- The library is the point. Mandal's words: "We need to build a library of
  blocks, data, tools and skills to assemble until sensenova can reliably
  answer requests". The five control requests in SURFACE.md are the target, and
  every one that lands should leave a block, a data file or a skill behind it.
- The test scenario gates a task. Mandal's words, 2026-10-26: "the task artifact
  template contains a test scenario that gates completion". A task is landed
  when its scenario passes, not when its code is written, and the artifact
  carries the scenario it was checked against.
- Two gates, and the marker carries them. The first character of a task's line
  in STATUS.md says where it stands: `-` no review, `+` the independent
  evaluator ran its test scenario and it passed, `x` Mandal read it and it
  closes, `>` Mandal read it and sent it back with his words after `=>`. The
  evaluator is a worker that did not do the work: it flips `-` to `+` and
  never deletes, and Bulle moves a `>` line back to pending, writes the words
  into the artifact and sets its state to pending. Mandal's words, 2026-10-26:
  "I'll gate the items as well by editing STATUS.md". A line marked `x` is
  deleted in the commit that carries the review, and not before.
- The state of a task follows its answers. An answer that asks for more work
  sends the artifact back to pending, and a correction reopens it, so a landed
  list never carries a task that is not done.
- Push by default in this repository. Mandal's words: "Push by default in this
  project (record it)". A verified commit goes to both remotes, `github` and
  `hdd`, without asking, and the package follows as a release
  (`tools/build-apk.ps1 -Release`) so the install link serves it.
- A commit message says what changed and carries no credit of the tool that
  wrote it: no `Co-Authored-By:` trailer and no session link. Mandal's words,
  2026-10-27: "Can we scrap this co-authored by claude ? I don't like it."
