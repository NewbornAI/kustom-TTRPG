# The phone

*The Android shell and what it answers. The router is [AGENTS.md](../AGENTS.md). The package is built by `tools/build-apk.ps1`: [shipping](shipping.md).*

- **`src/bridge.js`**: the calls to the phone's shell that go to the network, asked the async way (`requestAsync`, `fetchUrlAsync`, `downloadAsync`, `installAsync`) so the page never freezes while one waits

- **A call to the phone's shell that goes to the network is asked through
  `SheetBridge.call(name, args)`**, never on `SheetNet` directly: the plain
  calls hold the page until the network answers. The shell sends the token
  only to `github.com` and `api.github.com`; `request` refuses any other host.
- **A class of the app that implements a generic interface crashes d8.** The
  d8 of build-tools 34.0.0 dies with a NullPointerException on the class file
  (measured 2026-10-26 on `implements ValueCallback<String>`, a named class
  and an anonymous one alike). A lambda compiles to an instruction d8 reads
  after the class, and the package builds, so the back key answers through
  one.
- **The installer is launched once, and the answer is the pause.** A second
  `ACTION_VIEW` fired while the phone is still starting the installer
  re-delivers the intent to the installer's task, and the installer then shows
  no dialog at all. `MainActivity.install()` fires one intent and waits four
  seconds for the window to pause; the pause is `ok`, and anything else is said
  to the player, whose next tap is the recovery. Measured 2026-10-26: a 1.2 s
  wait fired the retry while the installer was coming up, the update sat with
  nothing on screen for thirty seconds, and the following tap installed it at
  once.
- **The back key of the phone is the page's first.** `MainActivity.onBackPressed`
  asks `window.__sheetBack()`, which closes what is open over the page, then
  leaves the settings, then takes back the last change (the rewind, which the
  head shows only in a browser). It answers `closed`, `rewound` or `none`, and
  only `none` sends the app to the background. A page that opens something
  of its own that back should close registers it with the sheet, so the
  shell can see it.
