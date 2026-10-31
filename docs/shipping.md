# Shipping

*The release, the update of a phone, the two repositories and the publish. The router is [AGENTS.md](../AGENTS.md).*

## The release and the update

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

- **The package holds the page the build wrote.** `tools/build-apk.ps1` ends by
  comparing `assets/index.html` inside the signed package with `dist/index.html`
  byte for byte, and fails when they differ; the only block it names as
  re-stamped is `version-data`, never a wildcard.

## The two repositories and the publish

Two repositories hold this tree. `NewbornAI/kustom-TTRPG` is public and carries the
code and only SRD content; `NewbornAI/kustom-mandal` is private and carries the full
corpus and the characters. This working tree is the private one.

```
node tools/srd-filter.mjs --out build/srd-data  # the SRD-only corpus, from data/ and the 5e.tools cache
node tools/publish-public.mjs                   # assemble, check, commit and push the public tree
```

The publish takes `build/srd-data` as it finds it, so a corpus change needs the
filter run first: a publish without it republishes the corpus before the change
and says the tree is up to date. It also reads `HEAD`, so the private commit
comes before the publish, never after.

The publish drops `characters/`, `tasks/`, `STATUS.md` and the seeded features, swaps
`data/` for the SRD build, empties the house address in `src/shell.js`, refuses a tree
that still carries a machine path, the LAN address or another account, then runs the build and the four
suites before the commit. One commit per publish, authored NewbornAI, naming the
private commit it came from.

The publish scans every file of the tree it assembles for private words, `docs/` included, so a page of `docs/` carries no machine path, LAN address or other account.

## A copy on another network

A copy for somebody on another network goes to an Upstash Box: the archive is `dist/` and the three files the server imports (`tools/serve.mjs`, `tools/bestiary.mjs`, `tools/markup.mjs`), uploaded and checked by its sha256 inside the box; the key goes to `/workspace/home/custom-sheet/.env` at mode 600, never in the archive; `start.sh` starts `node tools/serve.mjs 3000` detached with that env, the box's init command is `sh /workspace/home/custom-sheet/start.sh`, and `box public-url 3000` prints the address. The page takes its own origin as the server there, so a browser needs no setting; an installed package still points at the house network.
