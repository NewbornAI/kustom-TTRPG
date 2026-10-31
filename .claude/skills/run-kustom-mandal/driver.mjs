/* The driver of the running app: one command per line of a session, so an agent
   can build the page, serve it, hold it open at the size of the phone, plant a
   character, tap, look and read the store.

     node .claude/skills/run-kustom-mandal/driver.mjs up [port]

   The page is built into build/run and served from there, so the dist the phone
   is served stays as the package script left it. The browser stays open between
   commands, under the playwright-cli session `run`. The server and the port are
   written to shots/.run.json, so `down` stops only what `up` started. It takes
   no npm dependency of its own: it needs playwright-cli, like tools/walk.mjs. */
import { execFileSync, execSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const shots = join(root, 'shots');
const stateAt = join(shots, '.run.json');
const site = join('build', 'run');
const STORE = 'customsheet.state.v3';
const SESSION = '-s=run';
const DEFAULT_PORT = 8124;

/* ---- the browser, through playwright-cli ---- */

/* The shim on the PATH comes first: every command of a session asks, and
   `npm root -g` costs two seconds of each. */
function findCli() {
  if (process.env.PLAYWRIGHT_CLI_JS && existsSync(process.env.PLAYWRIGHT_CLI_JS)) return process.env.PLAYWRIGHT_CLI_JS;
  const entry = (folder) => join(folder, '@playwright', 'cli', 'playwright-cli.js');
  const asked = (command) => {
    try { return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim(); } catch (e) { return ''; }
  };
  const shim = asked((process.platform === 'win32' ? 'where.exe' : 'which') + ' playwright-cli').split(/\r?\n/)[0];
  if (shim && existsSync(entry(join(dirname(shim), 'node_modules')))) return entry(join(dirname(shim), 'node_modules'));
  const globalRoot = asked('npm root -g');
  if (globalRoot && existsSync(entry(globalRoot))) return entry(globalRoot);
  console.error('the driver needs playwright-cli: npm install -g @playwright/cli, or set PLAYWRIGHT_CLI_JS');
  process.exit(2);
}

let cliAt = '';

/* The script is run by node with no shell, so a selector or a piece of
   JavaScript reaches it whole, whatever quotes it holds. */
function cli(args, quiet) {
  cliAt = cliAt || findCli();
  const out = spawnSync(process.execPath, [cliAt, SESSION].concat(args), { cwd: root, encoding: 'utf8', timeout: 120000 });
  if (out.error) throw out.error;
  const text = String(out.stdout || '') + String(out.stderr || '');
  if (!quiet && (out.status !== 0 || /^### Error/m.test(text))) {
    console.error(text.trim());
    process.exit(1);
  }
  return text;
}

/* The answer of a command is its `### Result` section; the rest of what
   playwright-cli prints is the code it ran and the state of the page. */
function result(text) {
  const found = text.match(/^### Result\r?\n([\s\S]*?)(?=^### |\s*$(?![\s\S]))/m);
  return found ? found[1].trim() : '';
}

function evaluate(js) {
  const answer = result(cli(['eval', js]));
  try { return JSON.parse(answer); } catch (e) { return answer; }
}

function wait(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/* The page is up when the shell has run and a head has been drawn. */
function ready() {
  for (let tries = 0; tries < 40; tries += 1) {
    if (evaluate("!!(window.Sheet && document.querySelector('h1'))") === true) return;
    wait(250);
  }
  console.error('the page did not come up: read `errors`');
  process.exit(1);
}

/* ---- the server ---- */

function saved() {
  try { return JSON.parse(readFileSync(stateAt, 'utf8')); } catch (e) { return null; }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return false; }
}

async function answers(port) {
  try { return (await fetch('http://127.0.0.1:' + port + '/index.html')).ok; } catch (e) { return false; }
}

function build() {
  execFileSync(process.execPath, ['build.mjs', '--out', site], { cwd: root, stdio: 'inherit' });
}

/* What this server can answer beyond the page: none of it logs a console error
   when it is missing, so `up` says it. */
async function reach(port) {
  const base = 'http://127.0.0.1:' + port;
  const fairy = await fetch(base + '/agent').then((r) => r.json()).then((j) => j.ready).catch(() => false);
  const beasts = await fetch(base + '/bestiary/index.json').then((r) => r.ok).catch(() => false);
  return 'the fairy and the paint ' + (fairy ? 'answer' : 'have no key') + ', the bestiary route ' + (beasts ? 'answers' : 'has no cache');
}

async function up(port) {
  build();
  mkdirSync(shots, { recursive: true });
  const was = saved();
  const held = was && was.port === port && alive(was.pid);
  if (!held) {
    /* A port that answers here belongs to somebody else: a server of this
       driver would die on it and the browser would show that other build. */
    if (await answers(port)) {
      console.error('port ' + port + ' already answers and is not this driver\'s: leave it, and pass another port');
      process.exit(1);
    }
    if (was && alive(was.pid) && await answers(was.port)) process.kill(was.pid);
    const log = openSync(join(shots, '.run-server.log'), 'a');
    const server = spawn(process.execPath, ['tools/serve.mjs', String(port), '--dist', site], { cwd: root, detached: true, stdio: ['ignore', log, log], windowsHide: true });
    server.unref();
    writeFileSync(stateAt, JSON.stringify({ pid: server.pid, port: port }) + '\n', 'utf8');
    for (let tries = 0; tries < 60 && !(await answers(port)); tries += 1) wait(250);
    if (!(await answers(port))) {
      console.error('the server did not answer: read shots/.run-server.log');
      process.exit(1);
    }
  }
  /* A new session is a new device: an empty store and no character. */
  cli(['close'], true);
  cli(['open', 'http://127.0.0.1:' + port + '/']);
  cli(['resize', '360', '720']);
  ready();
  console.log('up on http://127.0.0.1:' + port + '/ at 360x720: ' + await reach(port));
}

/* ---- the commands ---- */

/* A character travels through the server rather than the command line: Windows
   holds a command line to about 32 KB, and a fixture is more than that. */
function plant(record) {
  const at = join(root, site, 'seed.json');
  writeFileSync(at, JSON.stringify({ characters: { c1: record }, current: 'c1', ui: { pages: null } }), 'utf8');
  cli(['eval', "fetch('/seed.json').then(function(r){return r.text();}).then(function(t){localStorage.setItem(" + JSON.stringify(STORE) + ',t);return t.length;})']);
  rmSync(at, { force: true });
  cli(['reload']);
  ready();
}

/* The store as JavaScript, for a read or a write of the played character. */
const PLAYED = 'var s=JSON.parse(localStorage.getItem(' + JSON.stringify(STORE) + '));';

function pathOf(dotted) {
  return (dotted || '').split('.').filter(Boolean).map((key) => '[' + JSON.stringify(key) + ']').join('');
}

const COMMANDS = {
  /* the build, the server and a new device */
  up: (args) => up(Number(args[0]) || DEFAULT_PORT),

  /* a change of src/: the build again and the page again, the store kept */
  reload: () => {
    build();
    cli(['reload']);
    ready();
    console.log('reloaded');
  },

  /* a character of test/fixtures by its name, or a package by its path, played */
  seed: (args) => {
    const name = args[0] || 'yngwie';
    const file = /\.json$/.test(name) ? (isAbsolute(name) ? name : join(root, name)) : join(root, 'test', 'fixtures', name + '.json');
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    plant(pkg.record);
    console.log('playing ' + pkg.name);
  },

  /* an empty store: the ways in */
  fresh: () => {
    cli(['eval', 'localStorage.clear()']);
    cli(['reload']);
    ready();
    console.log('an empty store');
  },

  page: (args) => {
    cli(['eval', 'Sheet.show(' + JSON.stringify(args[0]) + ')']);
    wait(500);
    const view = "document.getElementById('view-' + " + JSON.stringify(args[0]) + ')';
    if (evaluate('!!(' + view + ' && ' + view + '.offsetParent)') !== true) {
      console.error('no page ' + args[0] + ' on screen: read `snapshot`, it may be off for this character');
      process.exit(1);
    }
    console.log('on ' + args[0]);
  },

  click: (args) => {
    cli(['click', args[0]]);
    wait(300);
    console.log('clicked');
  },

  /* the accessibility tree, with the names a selector can use */
  snapshot: () => {
    console.log(cli(['snapshot']).replace(/^[\s\S]*?```yaml\r?\n/, '').replace(/```[\s\S]*$/, '').trimEnd());
  },

  eval: (args) => {
    console.log(JSON.stringify(evaluate(args[0]), null, 2));
  },

  /* the character being played as the store holds it, or one path of it */
  store: (args) => {
    console.log(JSON.stringify(evaluate('(function(){' + PLAYED + 'return s.characters[s.current]' + pathOf(args[0]) + ';})()'), null, 2));
  },

  /* one path of the character being played, set to a JSON value, and the page
     again: what a fixture does not hold, a fight, a page turned on */
  set: (args) => {
    cli(['eval', '(function(){' + PLAYED + 's.characters[s.current]' + pathOf(args[0]) + '=' + args[1] + ';localStorage.setItem(' + JSON.stringify(STORE) + ',JSON.stringify(s));})()']);
    cli(['reload']);
    ready();
    console.log('set ' + args[0]);
  },

  shot: (args) => {
    mkdirSync(shots, { recursive: true });
    const file = join('shots', (args[0] || 'run') + '.png');
    cli(['screenshot', '--filename=' + file]);
    console.log(file);
  },

  errors: () => {
    console.log(result(cli(['console', 'error'])));
  },

  /* any other command of playwright-cli, in this session */
  pw: (args) => {
    console.log(cli(args).trim());
  },

  down: async () => {
    cli(['close'], true);
    const was = saved();
    if (was && alive(was.pid) && await answers(was.port)) process.kill(was.pid);
    rmSync(stateAt, { force: true });
    console.log('down');
  }
};

const [name, ...rest] = process.argv.slice(2);
if (!COMMANDS[name]) {
  console.error('commands: ' + Object.keys(COMMANDS).join(', '));
  process.exit(2);
}
/* A state file can outlive its server, across a reboot. */
if (name !== 'up' && name !== 'down') {
  const was = saved();
  if (!was || !alive(was.pid)) {
    console.error('nothing is up: run the `up` command first');
    process.exit(1);
  }
}
await COMMANDS[name](rest);
