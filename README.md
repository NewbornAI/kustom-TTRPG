# custom-sheet

*Open source character sheet tracker designed for agents. The goal: character tracker fully customizable via natural language.*

A character sheet and a dice roller for one table, on a phone. The sheet is a single web page, and the same page ships as an Android app that works with no network at all.

The rules text comes from the SRD. The characters are yours. The shape of the app is a set of pages, and any of them can be added, taken away or rewritten, by hand or by an agent.

## The pages

| Page | What it does |
|---|---|
| character | The sheet of the character. It is always there. |
| spells | The spell slots, the sorcery points and the list of spells. |
| features | What the character has and what is left of it. |
| volley | The spell slider, the toggles and the beams. |
| summons | The creatures at the table. Off until the settings turn it on. |
| fight | The creatures of a large battle, in the order they act: the initiative, the hit points, the statuses each carries as icons, the attacks of its block under its row, and the uses of its traits and actions, ticked, counted, a recharge rolled on its die. Off until the settings turn it on. |
| equipment | What the character carries, the effect each item has, and the kit its class starts with. |
| image | The picture of the character, kept beside the store. |
| attack | A turn of attacks: the Action with its way and weapon, the riders, the bonus action. Off until the settings turn it on. |
| background | The story of the character: the event that pushed them out, and what they want now. Off until the character has one. |
| settings | The pages of the app, the shelf, the exchange and the update. |

Each page is one file in `src/pages/` and carries its own blurb. The seams and the house rules are in [`AGENTS.md`](AGENTS.md), the package format in [`docs/package.md`](docs/package.md).

## Install it

### On a phone

The APK carries the page in its assets, so it works offline and keeps its characters between launches.

```
https://github.com/NewbornAI/kustom-TTRPG/releases/latest/download/custom-sheet.apk
```

Open that on the phone, allow the install, and the icon lands on the home screen. A private repository answers that link with a 404 unless the browser is signed in to GitHub with access to it. The signing key is deliberately not in this repository, so an APK you build yourself cannot update that one in place: uninstall the old one first.

### On a desktop

```
node build.mjs
node tools/serve.mjs 8123
```

Then open `http://127.0.0.1:8123/index.html`. The build comes first: `dist/` is written by it and is not in the repository. That server also holds the bestiary, and the summons page fetches a creature from it when the app does not carry the one you need.

## Build it

```
node build.mjs                                  # src to dist, the font and the data inlined
node test/rules.test.mjs                        # the rules engine and the data
node test/github.test.mjs                       # the sign in and the calls to GitHub
node test/address.test.mjs                      # the address of a file on GitHub
node test/markup.test.mjs                       # the grammar of the upstream text
node tools/smoke.mjs                            # the shell in Chromium (needs playwright)
node tools/fetch-5e-data.mjs                    # refetch the data from 5e.tools
node tools/serve.mjs                            # serve the build and the whole bestiary
powershell -ExecutionPolicy Bypass -File tools/build-apk.ps1            # add -Release to publish it
```

The Android shell needs the command line tools, android-34 and build-tools; `tools/install-android-sdk.ps1` puts them in place.

## The data

The text of the rules comes from the System Reference Document, fetched into the files under `data/`.

Two repositories hold this app. [`kustom-TTRPG`](https://github.com/NewbornAI/kustom-TTRPG) is the public one: the code and only the SRD material. `kustom-mandal` is private and carries the whole corpus, including the parts of the books that are not in the SRD, and the characters of the table. The corpus here is the full one; `node tools/publish-public.mjs` builds the public tree from it, swapping `data/` for the SRD-only build `node tools/srd-filter.mjs` makes, dropping `characters/` and the working notes, running the suites and pushing one commit.

| File | What it holds |
|---|---|
| `rules.json` | how a character is made: the point buy and the standard array, the background increases and the custom backgrounds, and the rules text behind them |
| `classes.json` | the twelve classes of the 2024 handbook and their 123 archetypes |
| `features.json` | the features of those classes and archetypes, with their text |
| `spellbook.json` | the spells, with the classes that can learn each one |
| `bestiary.json` | every monster of the books the app carries, 1 164 of them, one printing per name and the newest (the 2024 book over the 2014 one, the Multiverse over Volo), keyed by name and book, with the whole stat block: the actions, the traits, the senses, the saves and the initiative, every damage of a blow with its kind (a trident that bites for piercing and burns for force keeps both), and the tables an action rolls on, the eye rays of a beholder being ten rows of a d10 |
| `wild-magic-surge-xphb.json` | the surge table; the public build carries an empty one, since the table is not SRD |
| `spell-sheet.csv` | the spells of the sheet of the table, one line each; private only |

`tools/fetch-5e-data.mjs` pulls them from 5e.tools, and the build writes them beside the page so the page itself stays small. The bestiary is the one the app reads from the shell: the summons calls a creature out of it, and the fight page tracks one. In the public tree the filter keeps the 656 monsters the SRD carries and leaves the rest behind.

## The characters

A device with no character opens on the ways in: a class, the Randominator, a file someone sent, a link, or a character from the shelf. Nothing is ever decided by the dice alone unless you ask: the Randominator rolls a whole character (class, level, subclass, species, scores, a background of its own) through the creator's own checks, then asks the fairy to name it, dress it and paint it. Nothing ships inside the app.

**The shelf** is `characters/`, one package per file, read by every app with no secret at all. Drop a file in and commit it, or open a branch for a character that is not ready to share. The app can also write back to GitHub with a device flow, so nobody types a token. The format is in [`docs/package.md`](docs/package.md) and the calls in [`docs/shelf.md`](docs/shelf.md).

**A campaign** is a repository the game master runs, one per table, and the shelf of every player in it. In the settings, under Campaign, the game master taps *Start a campaign*, names it, and the app opens the two pages of GitHub it needs already filled in: a private repository, and a key limited to that one repository (Contents, read and write). GitHub starts that page on All repositories and takes no address for the choice, so the app checks the pasted key and refuses one that opens more than the campaign. The key is pasted back with one tap, the app writes `campaign.json` to prove it works, and shows the invite: a QR code to scan across the table and a link to send. A player taps *Join a campaign* and pastes the link or scans the code, and types nothing. A character's picture is a file of its own beside it (`characters/pip.webp`), written only when it changes, so it can be seen on GitHub and arrives with the character. Players can join several campaigns, and *Play* on any row of Campaign switches the shelf in one tap, the shelf of a sign in included, and every key stays. *Forget*, under the row's menu, removes a key from that phone and offers the invite first; the owner of the repository can come back without one, by *Start a campaign* with a new key, skipping the repository step. The invite holds the key, so anyone with it can read and change that repository's characters: it is for the table only, the game master can revoke the key on GitHub, and the history of the repository keeps every version of every character.

## For agents

The README is the human entry point. [`AGENTS.md`](AGENTS.md) is the agent one: the layout, a table of jobs, the traps and the house rules, each pointing to its detail in `docs/` (the record, the package format, the fairy and the rest). Start there if you are about to change something.

## The licence

The code is under the MIT licence, in `LICENSE`.

The text of the rules in the data files is under the Creative Commons Attribution 4.0 International Licence, and `NOTICE` says where it came from, names the licence and links it. The data was taken from 5e.tools and laid out by this project.

Dungeons & Dragons, D&D and the D20 logo are trademarks of Wizards of the Coast LLC. This project is not affiliated with, endorsed by or sponsored by Wizards of the Coast. The font Cinzel is under the SIL Open Font Licence 1.1.

## The layout

```
src/          the shell and one file per page
data/         the rules data
app/          the Android shell that wraps the same page
tools/        the build, the data fetch, the server, the icon maker
test/         the test suites
characters/   the shelf: one package per file
dist/         the build output, and the package that ships
docs/         the detail behind AGENTS.md, one subject per file
```

One file per subject. The file-level map and the table of jobs are in [`AGENTS.md`](AGENTS.md).
