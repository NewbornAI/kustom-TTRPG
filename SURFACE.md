# The surface an app-editing agent may touch, and the gate it must pass

*What a small model may change while the app is in use, and the check that decides whether the change stands.*

This is the contract for `tasks/in-app-sensenova-agent.md` and
`tasks/harness-squared-sensenova.md`. AGENTS.md is the router for whoever edits
the repository; this file is the surface of the one agent that edits the app.

## The surface

> Its surface is whatever it can plug in hot. The loop can include you editing the app/ API to facilitate, as one of the branches.

Read mechanically, hot means the source the build reads and the data beside it,
with no reinstall of the phone:

| It may | In | Through |
|---|---|---|
| add, rewrite or drop a page | `src/pages/<id>.js` | `Sheet.page`; the build picks up every file of the folder |
| add a class | `src/classes/<name>.js` | the class registry, `src/klass.js` |
| add rules data | `data/*.json` | `tools/fetch-5e-data.mjs`, never a hand-written value |
| reach a seam a page lacks | `src/shell.js`, `src/block.js`, `src/card.js`, `src/record.js` | as a branch of its own, which meets the same gate |
| look at what it did | the suites, the walk, the page in a browser | `node build.mjs`, `test/*.test.mjs`, `tools/walk.mjs`, playwright-cli |

Out of its surface on purpose: `characters/`, which is Mandal's shelf; the store
of the phone; the keystore and the package; and the backup of the run.

## The gate

> Acceptance gate: the agent can answer control requests without breaking the app or style. it follows repo conventions, uses the books' data and never invents values. It asks minimal questions to show instead, but it does inform the user of what's done, missing or unclear in 1 bullet point each. It can test its own code and look at the visual output. All data is mechanically backed up somewhere it can't access before it touches it.

Line by line, what makes each sentence true:

- **Neither the app nor the style breaks.** A clean worktree, `node build.mjs`,
  the four suites, then the walk. A hash that moved is a finding to explain and
  not a pass, and a page styles only what that page writes.
- **The conventions of the repository.** One commit per slice, terse sentence
  case, the seams AGENTS.md names, one writer per file.
- **The book's data, and no invented value.** Every number, name and die comes
  from `data/*.json`. A value the book does not carry is a question and never a
  guess, a fighting style the data lacks or a feat the library does not hold.
- **A question instead of a guess, and a short report.** What is unclear is
  asked in prose, in the shortest question that settles it. What it says when it
  is done is at most three bullets of one line each: what is done, what is
  missing, what is unclear.
- **It tests its own code and looks at the visual output.** The suites for the
  code, the walk for the pixels, playwright-cli for the behaviour a screenshot
  cannot show, and the pictures read back.
- **The backup comes first.** Before the first edit of a run, every character it
  will touch is exported to the shelf and the tree is committed on a branch.
  Both sit outside its surface, so the loop cannot reach them.

## The control requests, verbatim

The five Mandal expects most. They are the acceptance suite: a run is good when
one of them lands and the gate holds.

1. create Amgo: wizard 5, fighter 2. Human, Alert, War caster. Full-plate and shield. Fighting style: AC+1 (defensive ?).
2. level up for Wendy, and show me the list of feats she can take
3. give Oko a rapier +1 and a ring of spell storing, with a UI to manage it
4. create an image for Oko: he looks like an elf with purple scales on its forearms, purple paint around the eyes, and a playful smile
5. create an attack tab for Oko's True strike spell, with advantage and quicken buttons, and an option to cast Divine smite on top of it at any level.

## What each one leans on, measured today

| Request | What it needs | State |
|---|---|---|
| 1 | the package, the class plugins, the seed of a character | the creation flow reads a class, a level, the subclass, the species with its lineage, a custom background and the class's gear kit; the `+` of the Features page opens the books and puts a feat or a species on the sheet (the fighting styles and the epic boons are kinds of it), and the `+` of the gear page adds any item. The Randominator rolls the whole character through the same checks. What is missing is a fighting style chosen as part of the creation rather than added afterwards. |
| 2 | the feats a class may take | the catalogue is `data/feats.json`, 231 feats in their kinds, and the Features page lists them with a search and the kinds for a filter, each card carrying the ability it raises and its prerequisite. What is missing is the check that a given character may take one (its prerequisite against the sheet), and the spells a feat grants, which the fetcher does not read yet. |
| 3 | the language an item's effect is written in | half there. `SheetRules` reads `baseAC` and `AC+2`; a magic weapon's bonus to the attack and a ring that stores spells have no shape yet. |
| 4 | the image page, and the model that draws | the page holds one webp data URL in the record, fitted to 720 px and kept beside the store. The app draws it itself: the fairy writes the brief (one plain sentence of at most 25 words, the story read first) and the house server calls SenseNova U1.5 Lite at 768 square through `/paint`; three concepts make three pictures to pick from. The `sensenova` skill is the same model outside the app. |
| 5 | a page plugin | `src/pages/attack.js` is a turn sheet: the Action with its way and weapon, Adv, Dis and the rider, its rolls as cards, the bonus action (Quicken or a smite), and every step on the history so the back key takes it back. The count of attacks and Sneak Attack's dice come from the class plugins, and the weapon's die from `data/weapons.json`. It is off by default and turned on for a character in Settings. It is the worked example the loop should read first. |

The order I would take them in is 5, 4, 2, 3, 1, smallest seam first.
