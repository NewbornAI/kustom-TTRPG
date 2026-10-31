# The page

*What a page carries, what it gets, and the helpers it leans on. The router is [AGENTS.md](../AGENTS.md).*

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

## The blocks a page places

- **`src/roll.js`**: the roll block: the control a page places and rolls on a tap, and the one rendering of a roll the sheet draws
- **`src/cast.js`**: the cast block: the button at the bottom of a page that casts, and the row that holds it
- **`src/slider.js`**: the level slider: the level to cast a spell or smite at, and the preview of what it does
- **`src/attackbox.js`**: the attack box: one swing of an attack, its die, its roll and its damage
- **`src/hpbox.js`**: the keypad that changes the hit points of one thing, docked at the bottom: the character sheet and a creature of a fight answer the same question with it
- **`src/toggle.js`**: the toggle: a chip that turns one thing on or off

## The banner

- **The name in the banner opens the picture.** A tap on it shows the
  character's picture over the whole screen (`openPicture`, the `#viewer`),
  and back closes it first.
- **The banner names the character.** The tab says the page, so a page with
  a tab shows the character's name in the head; a page with no tab (the
  settings) shows its own title.
