# custom-sheet, for an agent

*What this repository is, where the seams are, and how to change the sheet without reading all of it.*

The app is a character sheet and a dice roller for one table, on a phone. The shell
holds the pages, the store and the overlay. Every page is a file of its own under
`src/pages/`, and a page can be added, taken away or rewritten.

This file is a router. Find the job in the table below, read the two or three files
it names, and use the seam it names. The detail sits in `docs/`, one subject per file:
open only the one the job names. Nothing here is a changelog: the commits are.
The README is the human entry point; this file is the agent one.

## The shape of the repository

| Path | What lives there |
|---|---|
| `src/index.html` | the shell markup, the shell styles, and the two rules blocks |
| `src/shell.js` | the registry, the store, the overlay, the shared helpers, the packages, the update |
| `src/card.js` | the row of a list and the layer it opens, the two dresses of the app |
| `src/block.js` | what a page may contribute: a data file, a theme, an icon, a page of its own |
| `src/klass.js` | the class registry, and the mechanics read on a character; [characters](docs/characters.md) |
| `src/counter.js` | a limited resource: read it, spend one, give them back on a rest |
| `src/record.js` | the shape of a character: the store, the slices, the migrations, the package |
| `src/edit.js` | the edit mode: one flag per page |
| `src/rest.js` | what a short rest and a long rest give back, and the history they take back |
| `src/rebuild.js` | the paint of a page: the parts its markup was built from, so a repaint builds again only when they moved |
| `src/drag.js` | the drag of a reorderable list: the hold, the placement rule, the rows a strip carries, and the swipe rule across the page |
| `src/roll.js`, `src/cast.js`, `src/slider.js`, `src/attackbox.js`, `src/toggle.js`, `src/hpbox.js` | the blocks a page places: a roll, the cast button, the level slider, an attack, a toggle, the hit point keypad; [page](docs/page.md) |
| `src/creature.js` | a creature of the bestiary as a page holds it: its block, its numbers at a slot, its stat block, its rolls, its uses; [creatures](docs/creatures.md) |
| `src/spellcard.js` | the card of a spell, opened wherever its name is tapped; [creatures](docs/creatures.md) |
| `src/shelf.js` | the shelf: the sign in, the token, and the folder of characters on GitHub |
| `src/images.js` | the pictures, kept in IndexedDB beside the store so the store keeps its room; in memory a record holds its picture as before |
| `src/github.js` | the client of GitHub: the device calls, the renewal, the files and the branches |
| `src/bridge.js` | the calls to the phone's shell that go to the network, asked the async way; [phone](docs/phone.md) |
| `src/pages/*.js` | one file per page: its markup, its style, its behaviour |
| `SURFACE.md` | what an app-editing agent may touch, and the gate it must pass |
| `src/creator.js`, `src/origin.js` | the creator of a character from a class, and its origin; [characters](docs/characters.md) |
| `src/classes/*.js` | one plugin per class of the book; [characters](docs/characters.md) |
| `bookOf`, `hpFor`, `autoHp`, `createCharacter`, `C.library.weaponOf` | a feature's words, the maximum of hit points, the creator's skeleton, a weapon as the attack reads it; [characters](docs/characters.md) |
| the sheet language, `rec.layout`, `src/own.js`, `src/wire.js` | a value by name and its effects, a character's CSS, its own library, the wiring of a written page; [sheet language](docs/sheet-language.md) |
| `src/pages/agent.js` | the agent page, shown to the player as the Fairy; [fairy](docs/fairy.md) |
| `data/*.json` | the rules data, fetched by `tools/fetch-5e-data.mjs` |
| `app/` | the Android shell that wraps the same page |
| `tools/` | the build, the data fetch, the server, the icon maker, the package, the walk; `markup.mjs` owns the grammar of the upstream text |
| `test/*.test.mjs` | four suites, one per subject |
| `characters/` | the shelf: one package per file; private, never published |
| `dist/` | a build output, none of it tracked; the package ships as a release |
| `docs/` | the detail this file points to |

## The detail

| File | What it holds |
|---|---|
| [docs/page.md](docs/page.md) | what a page carries, what it gets on `a`, the three boxes of the core, the paint, the drag, the edit mode |
| [docs/record.md](docs/record.md) | the slices of a character and who owns each, the shape in `src/record.js` |
| [docs/data.md](docs/data.md) | how a data file is declared and read, and how the bestiary is keyed |
| [docs/overlay.md](docs/overlay.md) | the two dresses of a row, the layer, the ids of a layer |
| [docs/game-rules.md](docs/game-rules.md) | the two rules blocks, the rest, the four readings settled with Mandal, the attack page |
| [docs/characters.md](docs/characters.md) | the classes, the creator, the origin, the hit points, the words of a feature, the kits, the Randominator |
| [docs/creatures.md](docs/creatures.md) | the creature module and the card of a spell |
| [docs/sheet-language.md](docs/sheet-language.md) | the attributes and effects, a character's CSS, its own library, the wiring |
| [docs/fairy.md](docs/fairy.md) | the agent page, its sessions, its pictures, the routes of the server |
| [docs/package.md](docs/package.md) | the format of a package, its pages and their trust |
| [docs/exchange.md](docs/exchange.md) | the three ways a character arrives |
| [docs/shelf.md](docs/shelf.md) | the client of GitHub, the sign in, the token, the jobs of the shelf |
| [docs/tests.md](docs/tests.md) | the four suites, the harness, the smoke, the walk |
| [docs/shipping.md](docs/shipping.md) | the release, the update of a phone, the two repositories, the publish, a copy in a box |
| [docs/phone.md](docs/phone.md) | the bridge, the d8 crash, the installer, the back key |
| [docs/process.md](docs/process.md) | the test scenario and the two gates of a task |

## The commands

The whole list is in the README under [Build it](README.md#build-it). The loop an
agent runs is two commands:

```
node build.mjs            # src to dist/index.html, the font and the data inlined
node test/rules.test.mjs  # the rules, the data and the pages, about a thousand checks
```

Two repositories hold this tree: `NewbornAI/kustom-TTRPG` is public, `NewbornAI/kustom-mandal`
is private, and this working tree is the private one. The release, the update of a
phone and the publish are in [shipping](docs/shipping.md).

## The map: find your job

| If you want to | Read | Use the seam | Check |
|---|---|---|---|
| run the app and drive it in a browser | `.claude/skills/run-kustom-mandal/SKILL.md` | `driver.mjs` of that skill: `up`, `seed`, `set`, `click`, `store`, `shot`, `down`; it builds into `build/run` and leaves `dist/` alone | a screenshot you read, and `errors` |
| add a page | `src/pages/character.js`, `src/shell.js` (`page`), [page](docs/page.md) | `Sheet.page(spec)` | the page appears in the bar with its `glyph`, the slice seeds, a save and a load keep it |
| change the bar at the bottom | `src/shell.js` (`barOrder`, `barSplit`, `renderTabs`, `openMore`), `src/pages/settings.js` (`tabsSection`) | `state.ui.bar` is the player's order, `state.ui.barRows` is 1 or 2; one row shows four pages and More, two rows show every page | `tools/smoke.mjs`, the bar |
| change what a page looks like | that page | its own markup and style | the phone at 360x720 |
| hold a bar at the top of a page while the rest scrolls | `src/pages/spells.js` (`.lvbar`, `paintStuck`, `pickLevel`) | one scroller for the page and `position: sticky` on the bar; nothing folds | `tools/smoke.mjs`, the spells |
| turn a spell slot into sorcery points | `src/pages/spells.js` (`eat`, `paintEat`), `src/index.html` (`Rules.convertSlot`) | the Eat button spends a slot of the level on screen | `test/rules.test.mjs`, `tools/smoke.mjs`, the spells |
| take a swipe for a page, or keep one for a part | `src/shell.js` (`wireSwipe`, `keepsMove`), `src/drag.js` (`swipe`, `carrying`) | the move decides, not what it started on: a part that drags sideways itself says so with `data-swipe`; a range input, a focused field, a carried row and the sheet keep theirs | `tools/smoke.mjs`, the feel of a page |
| make part of a page editable | that page, `src/edit.js`, [page](docs/page.md) | `a.editing(id)`, `a.wrench({label})` | the wrench toggles, the pressed state survives a tab switch |
| change a rule of the game | `src/index.html`, the two rules blocks, [game rules](docs/game-rules.md) | `window.Rules`, `window.SheetRules` | `test/rules.test.mjs` |
| change what a rest gives back | `src/rest.js`, `src/counter.js`, [game rules](docs/game-rules.md) | `C.rest.rest(kind, rec)` | `test/rules.test.mjs`, the rest checks |
| make a change the back key takes back | `src/rest.js`, [game rules](docs/game-rules.md) | `C.rest.push(rec)` before the change; a page whose own slice belongs in the steps calls `C.rest.track(key)` once, and the slice is written back into the object it holds | `test/rules.test.mjs`, the rest checks |
| move the hit points | `src/pages/character.js` (`paintHp`, `moveHp`, `openHpKeys`), `src/index.html` (`SheetRules.hpMove`) | `SR.hpMove(hp, kind, amount)` with `damage`, `heal`, `set` or `temp` | `test/rules.test.mjs`, `tools/smoke.mjs`, the hit points |
| add a field to a character | the page that owns the slice, `src/record.js`, [record](docs/record.md) | the page's `seed`, `api.record.slice(rec, key)` | a save and a load, and a package round trip |
| spend or give back a limited resource | `src/counter.js` | `counterOf`, `spend`, `refill`, `set` | `test/rules.test.mjs`, the counter checks |
| start a class with its gear, or add an item from the books | `src/pages/equipment.js` (`KITS`, `catalogue`, `openPicker`), `data/items.json`, `tools/items.mjs`, [characters](docs/characters.md) | `KITS`, the + of the AC row; the picker carries every item of the books through `C.library.items`, while `data/gear.json` stays the narrow list the sheet computes with | the page, driven in the browser; `tools/smoke.mjs`, the item catalogue |
| give an item an effect on the sheet | `src/index.html` (`SheetRules`), `src/pages/equipment.js`, [sheet language](docs/sheet-language.md) | `acOf`, `effectValue` | `test/rules.test.mjs`, the effect checks |
| put a roll on a page, or draw one | `src/roll.js`, `src/index.html` (the rules block) | `C.roll.control(node, {label, set, onRoll})` where `set` is a string or a function read at the tap, and `C.roll.groups(list, {flat, total})` for a roll the page already holds | the control, driven in the browser; the boxes and the smite draw their dice with it |
| put the cast button at the bottom of a page | `src/cast.js`, `src/index.html` (the cast block) | `C.cast.row({buttons})`, last in the page | the page, driven in the browser |
| choose a level to cast or smite at | `src/slider.js`, `src/index.html` (the slider block) | `C.slider.row({levels, value, label, preview})`, `C.slider.wire(root, {levels, previewAt, onPick})` | the page, driven in the browser |
| draw one attack and its damage | `src/attackbox.js`, `src/index.html` (the attack box, the card) | `C.horizontalAttackBox.swing({...})` for a summon's swing, `C.verticalAttackBox.cell({...})` for a volley column, `C.attackCard.card({read, ix, fresh, pop, after})` for one roll of a turn read by `R.attackRead` | the summons' stat block, the volley and the attack sheet, driven |
| put a toggle or a segment on a page | `src/toggle.js`, `src/index.html` (the toggle block, `.seg`) | `C.toggle.chip({key, label, rgb, on, icon, pill, disabled})`; `C.toggle.fill(node, list, {cols})` for a grid that never reflows; `C.toggle.segment({key, aria, on, options})` for one choice out of a few | the volley, the attack sheet and the settings, driven |
| write the story, or have the fairy write it | `src/pages/backstory.js`, `src/pages/agent.js` (`write_backstory`), [fairy](docs/fairy.md) | `rec.backstory` | the page, driven; `test/rules.test.mjs` |
| roll a character from nothing | `src/shell.js` (`openRandomLevel`, `rollName`, `rollDice`), `data/rules.json`, `src/pages/agent.js` (`roll_name`), [characters](docs/characters.md) | the Randominator, through the creator's own checks | the phone, driven |
| play a turn of attacks | `src/pages/attack.js`, `data/weapons.json`, `src/index.html` (`Rules.throwAttack`, `attackRead`, `turnRead`), [game rules](docs/game-rules.md) | every step goes through `step(fn)`, which pushes the history first | `test/rules.test.mjs`, the attack sheet; `tools/smoke.mjs`, the attack sheet |
| give a character a picture | `src/pages/image.js`, `app/java/com/newbornai/customsheet/MainActivity.java` | `LONG`, `shrink`, and the window's `onShowFileChooser` | the file control in the app, and the package round trip |
| open a list on top of a page | `src/card.js`, [overlay](docs/overlay.md) | `list({id, title, rows, onPick})` | the layer opens, scrolls and picks |
| draw a row of a list | `src/card.js`, [overlay](docs/overlay.md) | `row(...)` for the two-line card, `line(...)` for the one-line row | the markup, and the dataset `onPick` gets |
| read a data file | `src/block.js`, `data/`, [data](docs/data.md) | `C.library.data(name, shape)`, and the file dropped in `data/` | the page that asks for it |
| put a creature of the bestiary in front of the table, or read its block | `src/pages/summons.js`, `src/pages/fight.js`, `src/creature.js`, [creatures](docs/creatures.md) | `C.creature.block(key)`, `derive(card, api)`, `openStat(card, api)`, `attackGroup(...)`, `roll(...)`, `castingBlocks(list)` | the page that shows it, and `test/rules.test.mjs` |
| open the card of a spell from a name | `src/spellcard.js`, [creatures](docs/creatures.md) | `C.spellCard.open(api, name, {id})`; a text names its spells as buttons with `data-spell` (`C.creature.castingBlocks`) | the summons, the fight and the stat block, driven |
| read a monster, or add one to the corpus | `data/bestiary.json`, `src/pages/summons.js` (`blockOf`), `tools/bestiary.mjs`, [data](docs/data.md) | `C.library.bestiary.creatures[key]` with the key `name\|book`, and `C.library.bestiary.byName[name]` for the preferred book; `node tools/fetch-5e-data.mjs` writes the file from the cache | `test/rules.test.mjs`, the bestiary block, and the page that reads it |
| change a sign in or a shelf call | `src/shelf.js`, `src/github.js`, [shelf](docs/shelf.md) | `SheetShelf` for the jobs, `SheetGit` for the calls | `test/github.test.mjs` |
| change the update route | `src/pages/settings.js`, `src/shell.js` (`installUpdate`), [shipping](docs/shipping.md) | the update block | the toast answers |
| add a colour or an icon | `src/block.js`, [package](docs/package.md) | the `themes` and `icons` a page carries | the gallery in the edit mode |
| let a page bring its own file, look or place | `src/block.js`, [page](docs/page.md) | `data`, `theme`, `icon`, `page(spec)` | `test/rules.test.mjs`, the block checks |
| add a class or change how it learns | `src/klass.js`, `src/classes/*.js`, [characters](docs/characters.md) | `SheetClasses.define(spec)` | `test/rules.test.mjs`, the class plugin checks |
| give a class a mechanic | `src/classes/<class>.js`, `src/klass.js`, [characters](docs/characters.md) | in the spec: `colour`, `counters`, `attacks(level)`, `sneak(level)`, `riders`, `flags(level)`; pages read them through `C.classes` | `test/rules.test.mjs`, the class plugins |
| change the fairy, its tools or its pictures | `src/pages/agent.js`, `tools/serve.mjs`, [fairy](docs/fairy.md) | `installPage`, `removePage`, `pageError`, `postJson`, `/agent`, `/paint` | `test/rules.test.mjs`, the phone, driven |
| read or write a value of the sheet by name | `src/index.html` (`ATTRIBUTES`, `sheetGet`, `sheetSet`), [sheet language](docs/sheet-language.md) | `attributeList()`, `sheet_get`, `sheet_set`, `set_effect` | `test/rules.test.mjs`, the effect checks |
| change the package, or how a character arrives | `src/record.js` (`packageOf`, `packageIn`), [package](docs/package.md), [exchange](docs/exchange.md) | `exportCharacter`, `linkOf`, `importAny`, `C.plugin(p)` | a package round trip, `tools/smoke.mjs` |
| ship a release, update a phone or publish the public tree | `tools/build-apk.ps1`, `tools/publish-public.mjs`, [shipping](docs/shipping.md) | `-Release`, `tools/srd-filter.mjs`, then the publish | `-Check <apk>`, the four suites |
| add a check, or run the smoke or the walk | `test/harness.mjs`, [tests](docs/tests.md) | `built()`, `source(name)`, `page(id, opts)`, `coreStub(parts)` | the four suites, `tools/smoke.mjs`, `tools/walk.mjs` |

If a job is missing from this table, add the row with the change. A row that is
wrong is worse than a row that is absent. A row stays one line, and what it cannot
hold goes to its file in `docs/`.

## The traps

- **The house server runs from this tree.** Port 8123 serves this checkout's
  `dist/` to the phones, so a bare `node build.mjs` moves the served page ahead of
  the package: a check builds with `--out`, as the suites, the smoke and the driver
  do. It also keeps the `tools/` code it started with, so a change of
  `tools/serve.mjs`, `tools/bestiary.mjs` or `tools/markup.mjs` reaches the phones
  only when it is restarted, with `SENSENOVA_API_KEY` in its environment.
- **Markup in `src/index.html` outside a script tag is dead.** The build inlines
  the script files it finds and nothing else. A page is a file in `src/pages/`;
  the only live markup in `index.html` is the shell itself.
- **A page or a class is a file dropped in its folder.** `index.html` names
  `pages/*.js` and `classes/*.js`, and the build inlines every file of the
  folder in the order of their names, so a new one touches nothing else. The
  place of a tab is the page's `order`, never the order of the files.
- **A class name is a page's own.** Two pages that style the same name fight by
  specificity, and nothing warns. Prefix a block that more than one page uses.
- **`dist/` is a build output.** Rebuild it, never edit it, and commit none of
  it: the package goes out as a release.
- **The package holds the page the build wrote.** `tools/build-apk.ps1` compares the
  two byte for byte and fails when they differ. [shipping](docs/shipping.md)
- **A class of the app that implements a generic interface crashes d8.** A lambda
  compiles and the package builds, so the back key answers through one. [phone](docs/phone.md)
- **The sign in has two routes.** A device flow on the phone, a pasted token in a
  browser. `src/shelf.js` owns both, and a page asks it for the job. [shelf](docs/shelf.md)
- **The installer is launched once, and the answer is the pause.** A second intent
  makes the installer show nothing, so `MainActivity.install()` fires one. [phone](docs/phone.md)
- **The store is one string with a ceiling.** localStorage holds about five
  megabytes. The pictures live in IndexedDB (`src/images.js`), the history is
  held to sixty steps and 64 KB a character (`src/rest.js`), and a write the
  store refuses says so in a toast. A slice that can grow without bound needs
  the same care.
- **The back key of the phone is the page's first.** A page that opens something of
  its own that back should close registers it with the sheet. [phone](docs/phone.md)
- **A hold selects nothing.** The whole `.app` is `user-select: none` with no
  long-press menu; a field and the text of a description take it back. A page
  never turns selection on for a card of its own.
- **The banner names the character, and a tap on the name opens the picture.** A page
  with no tab (the settings) shows its own title. [page](docs/page.md)
- **A call to the phone's shell that goes to the network is asked through
  `SheetBridge.call(name, args)`**, never on `SheetNet` directly: the plain
  calls hold the page until the network answers. The shell sends the token
  only to `github.com` and `api.github.com`; `request` refuses any other host.
- **The token is the one secret.** It lives in the store, it is never typed by
  hand into the app (a paste is accurate where a typing is not), and it never
  leaves the machine except to GitHub. No secret is in the repository.

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
- A task lands when its test scenario passes, and its line in STATUS.md carries the
  two gates (`-`, `+`, `x`, `>`). An answer that asks for more work sends it back to
  pending. The rules and Mandal's words are in [process](docs/process.md).
- Push by default in this repository. Mandal's words: "Push by default in this
  project (record it)". A verified commit goes to both remotes, `kustom` and
  `hdd`, without asking, and the package follows as a release
  (`tools/build-apk.ps1 -Release`) so the install link serves it.
- A commit message says what changed and carries no credit of the tool that
  wrote it: no `Co-Authored-By:` trailer and no session link. Mandal's words,
  2026-10-27: "Can we scrap this co-authored by claude ? I don't like it."
