# The overlay and the card

*The two dresses of the app and the layer that holds them. The router is [AGENTS.md](../AGENTS.md).*

`src/card.js` writes the two dresses the app has and opens the layer that holds
them: `row({name, badge, note, chips, data})` is the two-line card of the book
and of the summons, `line({name, meta, mark, data, pick, action})` is the
one-line row of the characters, the shelf and the choosers, and
`list({id, title, rows, meta, search, searchAction, actions, onPick})` opens
the layer and hands the picked row back as its dataset, so no page walks the
markup it wrote. `searchAction` is one button beside the search field (the
fight's + writes a creature of the player's own from the words typed).
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

- **A sheet layer may dock.** `a.sheet.open({..., dock: true})` (or the same
  key on `C.card.list`) makes the layer a panel at the bottom over a dimmed
  page, and a tap on the dim closes it; without it the layer covers the page.
