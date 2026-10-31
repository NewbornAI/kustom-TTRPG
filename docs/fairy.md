# The fairy

*The agent page and the routes of the server behind it. The router is [AGENTS.md](../AGENTS.md). What it writes is in [sheet language](sheet-language.md).*

`src/pages/agent.js` is the agent page, shown to the player as the Fairy (a session is a fairy; `write_theme` makes a theme of colours that travels in a hidden page of the character): a model on the serving machine reads the sheet and the books, changes the sheet's slices and writes its own pages through `installPage`, `removePage` and `pageError`.

## A run

The fairy:

- asks up to three numbered questions with its pick before a change;
- builds pages from the wired attributes, as a tab or as a panel inside a page of the app (`into`, `at`: `bar` joins the page's row of chips, the one a page marks with `data-bar`, and a page without one gets a row at its top; `top` and `bottom` the shell mounts it in that page's scrolling body and puts it back when the page paints its body anew);
- presses every button of a page it wrote on a copy of the sheet and fixes what fails;
- folds the model's reasoning under the thinking line;
- backs the character up before its first change;
- undoes a run whole.

A call that times out or fails is tried again after 5, 15, 30 and 60 seconds with "continue", then a button tries by hand, and the send button stops a run.

## The sessions

Its conversations are sessions, kept per character in the phone's store (the last twenty), with a new one and a list to go back to any.

## The pictures and the story

- `paint_picture` draws the character and puts the picture on the Image page.
- `write_backstory` writes the story the painter reads first (30 words, two sentences).
- The picture model draws every word it is given, so a concept is one plain sentence of at most 25 words with at most one telling detail placed precisely, the story is distilled rather than handed over, and `paint_choices` takes three concepts that are three readings of the character, the app dealing each picture its own setting and light.
- `paint_choices` draws two or three of them, the same character and style, each different in the parts the player did not name, and shows them full screen with the arrows at the bottom corners, a swipe and a Pick button (`api.gallery`), so only the picked one is kept.
- `repaint_picture` changes one thing in a picture that is already there (the pixels go back to the model's edit route, so the face stays).
- `theme_from_picture` reads the drawing's ground, ink and accent on a 32 px copy and makes a theme of them.

The fairy describes what to draw, the house server calls SenseNova's image model with the app's own look (ink and wash, high fantasy, `PICTURE_STYLE`), and the page fits the answer to 720 px of webp before it lands (`C.images.fit`), one step of the history.

- **To write the story, or have the fairy write it.** Read `src/pages/backstory.js`, `src/pages/agent.js` (`write_backstory`). Use: the page reads and writes `rec.backstory`; the fairy writes it in at most 30 words and two sentences, the event that pushed the character out and what it wants now, and a longer one is sent back unless the player asked. Check: the page, driven; `test/rules.test.mjs`.

The Randominator asks a fairy to name a character (`roll_name`): [characters](characters.md).

## The routes

The phone posts through `postJson`, to the `agent` bridge of `MainActivity` (house network, paths `/agent` and `/paint`, no token, 240 s for a picture); `tools/serve.mjs` holds the key, forwards the conversation to SenseNova and draws the pictures.

The server also answers for the fairy: `POST /agent` forwards a conversation to SenseNova's chat model and `POST /paint` draws one picture, both with `SENSENOVA_API_KEY` in the environment of the server, both read-only to it, and `GET` on either says whether the key is there. The picture is 768 square (`SENSENOVA_IMAGE_SIZE`) and comes back as a data URL, because the address the model answers with expires and the phone may be off the network when it does; `SENSENOVA_IMAGE_MODEL` names another image model. A picture takes about forty seconds.
