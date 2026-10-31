---
name: run-kustom-mandal
description: Build, run, start, serve, test and drive the custom-sheet character sheet app in a real browser at phone size. Use when asked to run or launch the app, take a screenshot of a page, tap through the sheet, plant a character, set up a fight, check a UI change in the running app, or run the suites, the smoke and the walk.
---

The app is one built page. Drive it through `.claude/skills/run-kustom-mandal/driver.mjs`, which builds it into `build/run/`, serves that on its own port and holds it open in headless Chrome at 360x720. It never writes `dist/`, which the house server hands out. All paths are relative to the repository root. Verified on Windows with Git Bash.

## Prerequisites

Node and playwright-cli on the PATH, with Chrome installed. The repository takes no npm dependency, so there is no install step. When the driver says playwright-cli is missing, install the npm package `@playwright/cli` globally.

```bash
node -v
```

```bash
playwright-cli --version
```

## Run (agent path)

Each command below is a separate run of about three seconds; the browser and the server stay up between them.

```bash
node .claude/skills/run-kustom-mandal/driver.mjs up
```

`up` ends by saying what this server can answer: read that line before you test the fairy, the paint or the bestiary route.

```bash
node .claude/skills/run-kustom-mandal/driver.mjs seed yngwie
```

```bash
node .claude/skills/run-kustom-mandal/driver.mjs click "button[aria-label='Lose a hit point']"
```

```bash
node .claude/skills/run-kustom-mandal/driver.mjs store char.hp
```

```bash
node .claude/skills/run-kustom-mandal/driver.mjs shot after-hit
```

Then read `shots/after-hit.png`, and check the console:

```bash
node .claude/skills/run-kustom-mandal/driver.mjs errors
```

Stop when done. It stops only what `up` started:

```bash
node .claude/skills/run-kustom-mandal/driver.mjs down
```

| Command | What it does |
|---|---|
| `up [port]` | builds, serves on 8124 or the port given, opens a new device with an empty store |
| `reload` | after a change of `src/` or `data/`: builds and reloads, the store kept |
| `seed [name or path]` | plays `yngwie`, `wendy` or `oko` from `test/fixtures/`, or a package file by its path ending in `.json` |
| `set <path> <json>` | sets a dotted path of the played character and reloads: a page turned on, a fight |
| `fresh` | empties the store, which opens the ways in (From a class, Randominator, From a file, From a link, GitHub) |
| `page <id>` | shows a page (`character`, `spells`, `features`, `summons`, `fight`, `volley`, `equipment`, `attack`, `agent`, `settings`...) and fails if it is not on screen |
| `click <selector>` | clicks, then waits 300 ms for the repaint |
| `snapshot` | the accessibility tree: read it to find the labels to click |
| `store [path]` | the played character as the store holds it, or a dotted path of it |
| `eval <js>` | one JavaScript expression in the page, its value as JSON; a `;` between statements is a SyntaxError, so wrap them in `(function(){...})()` |
| `shot <name>` | writes `shots/<name>.png` |
| `errors` | the console errors, or `Total messages: 0` |
| `pw <args...>` | any other playwright-cli command, in this session |
| `down` | closes the browser and stops the server |

Selectors that worked: `button[aria-label='...']` for the labels `snapshot` prints, `button:has-text('Damage')`, `#charHpNow` (opens the keypad), `button.hpk[data-key='7']` (a key of it), `#sheetClose` (closes the layer).

Example, 7 damage through the keypad:

```bash
node .claude/skills/run-kustom-mandal/driver.mjs click "#charHpNow"
```

```bash
node .claude/skills/run-kustom-mandal/driver.mjs click "button.hpk[data-key='7']"
```

```bash
node .claude/skills/run-kustom-mandal/driver.mjs click "button:has-text('Damage')"
```

Example, a fight, which no fixture holds. Turn the page on first, because `set` reloads:

```bash
node .claude/skills/run-kustom-mandal/driver.mjs set pages '["fight","spells","features","summons"]'
```

```bash
node .claude/skills/run-kustom-mandal/driver.mjs set fight '{"counter":100,"list":[{"id":"a","key":"mezzoloth|xmm","name":"Mezzoloth","init":22,"rolled":true,"hp":75,"hpMax":75,"ac":18,"open":true,"rolls":{},"saves":{},"edit":{}}]}'
```

```bash
node .claude/skills/run-kustom-mandal/driver.mjs page fight
```

## Test

```bash
node test/rules.test.mjs
```

```bash
node test/github.test.mjs
```

```bash
node test/address.test.mjs
```

```bash
node test/markup.test.mjs
```

Each ends on `all ... checks pass`, and none writes `dist/`. The shell in a real browser, about 50 seconds, on a throwaway build and port of its own:

```bash
node tools/smoke.mjs
```

The pixels, about 70 seconds, with the driver up. It writes seven screens and `shots/run.txt` with their hashes. Two walks of one build give the same hashes, so a hash that moved between builds is a finding:

```bash
node tools/walk.mjs --origin http://127.0.0.1:8124 --out shots --tag run
```

## Gotchas

- **Port 8123 belongs to the house server,** which phones and the fairy depend on. On the machine that builds it runs from this very checkout and serves its `dist/`. Never stop it and never test against it. That is why the driver defaults to 8124, refuses a port that already answers and builds elsewhere. A bare `node build.mjs` still writes `dist/`, so the served page moves ahead of the package: use `reload`, or `--out`.
- **A running server keeps the code it started with.** `reload` builds the page but does not restart `tools/serve.mjs`, and neither does a second `up`. After a change of `tools/serve.mjs`, `tools/bestiary.mjs` or `tools/markup.mjs`, run `down` and then `up`.
- **What the server here holds decides what works.** `/agent` and `/paint` need `SENSENOVA_API_KEY` in the environment of `up`: without it the fairy says so on its page. `/bestiary/index.json` answers 503 until `tools/.5e-cache/` is fetched, which a fresh clone has not done. `/version.json` is always a 404 here, because only the package script writes it and the driver does not serve `dist/`, so test the update route on a phone.
- **The hit points of a seed do not hold.** `autoHp` follows the classes and Constitution unless `char.hpManual` is set, so a package's number is not the sheet's. Read `store char.hp` for the real starting value.
- **`up` is a new device.** The browser's store lives in memory, so `up` loses the character. Use `reload` after a code change.
- **`page` shows a page the character has turned off.** `page attack` succeeds while `store pages` does not list it, and the bar has no tab for it. To see the bar as a player does, `set pages` first.
- **A selector must match one element.** `button[aria-label='Close']` matches the layer's close and the hidden `#condClose` of the conditions, and fails as a strict mode violation. Use the id.
- **The package is not this skill's job.** `tools/build-apk.ps1` rewrites `dist/version.json` and `dist/custom-sheet.apk`, which the house server offers to phones, and its `-Release` flag publishes. A checkout with no `keys/custom-sheet.keystore` makes a new key, and a package signed by it cannot update an installed app.
- **`shots/`, `build/` and `.playwright-cli/` are ignored,** so screenshots, the driver's build, its `.run.json` and its server log stay out of a commit.

## Troubleshooting

- **`port 8123 already answers and is not this driver's`**: the refusal above. Run `up` with no port.
- **`Error: net::ERR_CONNECTION_REFUSED` from the walk**: no server on that port. Run `up` first.
- **`does not match any elements` from `click`**: the page has no such control, often because no character is planted. Read `snapshot`.
- **`strict mode violation` from `click`**: the selector matched more than one element, and the error lists them. Use one of the locators it names.
- **`nothing is up: run the up command first`**: a command ran before `up`, after `down`, or after a reboot took the server away.
- **`the page did not come up`**: the build is broken or the page threw at boot. Run `errors`, then `node test/rules.test.mjs`.
