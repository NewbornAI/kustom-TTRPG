# The tests

*The four suites and the two tools that see a real DOM. The router is [AGENTS.md](../AGENTS.md).*

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
and a full store. It needs the `playwright` package, or the one playwright-cli
carries and the Chrome of the machine, and the repository takes no dependency:

```
node tools/smoke.mjs
```

The walk is the other, and it is the check of the pixels:

```
node .claude/skills/run-kustom-mandal/driver.mjs up
node tools/walk.mjs --origin http://127.0.0.1:8124 --out shots --tag base
```

It opens the built page at 360x720, plants the fixture of `tools/walk-seed.js`,
screenshots the six pages and the edit-mode gallery, and writes `<tag>.txt` with
one line per screen and its SHA-256, so two builds are compared by hash. It needs
`playwright-cli` on the PATH.
