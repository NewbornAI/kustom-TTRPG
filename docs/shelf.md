# The shelf writes back

*The client of GitHub and the jobs of the shelf. The router is [AGENTS.md](../AGENTS.md).*

`src/github.js` is the client and `src/shelf.js` is the job. The client
answers to two transports: the shell of the phone (`SheetNet.request(url,
method, body, token)`, which answers with `{status, body}`) and the network
of a browser (`fetch`, which GitHub lets across origins for the API but not
for a sign in). The device flow is a POST to
`https://github.com/login/device/code` then a poll of
`https://github.com/login/oauth/access_token`; the client id is public and
lives in that file, and no secret is needed.

The token is kept in the store, under `state.ui.gh` and `state.ui.token`,
and the login under `state.ui.login`. The write path is one call:
`putFile` PUTs a file into `characters/` on a branch, through the contents
API, so a branch that is not there yet is made with `createBranch` first.
`createRepo` makes a repository of the player and `forkRepo` forks the one
of the project.

The jobs a page asks for: `repo()`, `setRepo(name)`, `branch()`,
`setBranch(name)`, `signedIn()`, `waiting()`, `begin()`, `wait(onDone)`,
`last()`, `token()`, `setToken(t)`, `characters(ref)`, `branches()`,
`put(rec, message)`, `remove(fileName)`, `makeRepo(name, isPrivate)` and
`fork()`.

## The sign in

- **The sign in has two routes.** On the phone it is a device flow: the app
  asks GitHub for a code, the player approves it in a browser, and the app
  waits, so a sign in survives the app being closed. A page of a browser
  cannot run that flow, so it takes a token pasted instead. `src/shelf.js`
  owns both, and a page asks it for the job.
