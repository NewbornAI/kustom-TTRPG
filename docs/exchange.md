# The exchange

*How a character arrives. The router is [AGENTS.md](../AGENTS.md). The format is in [package](package.md), the writing back in [shelf](shelf.md).*

A character travels as a package, and there are three ways for one to
arrive. None of them asks the player to type a secret.

- **A file.** `exportCharacter` writes the package and the phone offers it to
  send. `pickFile` opens the explorer of the phone, and a file control of the
  page is answered by the window's `onShowFileChooser`, so one page reads a
  file the same way on the web and in the app.
- **A link.** `linkOf(pkg)` packs the package into a link, squeezed and
  encoded, and the character rides in the fragment of the link, which no
  server ever sees. `importAny(text)` reads a link back, and falls back to
  `importUrl` when the text is the address of a file that holds a package.
- **The shelf.** A folder in the public repository of the app, read with no
  secret: `shelf.characters(ref)` and `shelf.branches()`. A branch is a
  shelf of a player, and anybody may open one. A row of the shelf carries the
  name, the raw address of the file and the address a browser shows.
- **The address of a file on GitHub is read as well as the raw one.**
  `rawAddress(url)` turns `github.com/o/r/blob/ref/path` and
  `github.com/o/r/raw/ref/path` into `raw.githubusercontent.com/o/r/ref/path`,
  because the page a browser shows answers no cross origin request and the
  raw file does. `importAny` and `importUrl` both go through it.
