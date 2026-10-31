# The package

*The format a character travels in. The router is [AGENTS.md](../AGENTS.md). The ways it travels are in [exchange](exchange.md).*

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
