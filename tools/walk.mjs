/* The walk: the shell's check, in a real browser.

   node tools/walk.mjs --origin http://127.0.0.1:8123 --out shots --tag base

   The shell is executed by no suite, because the suites have no DOM. The walk
   is what runs it: it opens the built page at 360x720, plants the fixture of
   tools/walk-seed.js, and screenshots the six pages and the edit-mode gallery.
   It writes <out>/<tag>.txt, one line per screen and the first sixteen hex of
   its SHA-256, and prints the same lines, so two builds can be compared by
   hash and the pixels are the check.

   It needs playwright-cli on the PATH, or PLAYWRIGHT_CLI_JS set to its entry
   script. It takes no npm dependency of its own. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- the command ---- */

function arg(name, fallback) {
  const at = process.argv.indexOf(name);
  if (at >= 0 && process.argv[at + 1]) return process.argv[at + 1];
  return fallback;
}

const origin = arg('--origin', 'http://127.0.0.1:8123');
const out = resolve(root, arg('--out', 'shots'));
const tag = arg('--tag', 'walk');

const SCREENS = ['character', 'volley', 'spells', 'features', 'summons', 'settings'];

/* ---- the browser, through playwright-cli ---- */

function cliScript() {
  if (process.env.PLAYWRIGHT_CLI_JS && existsSync(process.env.PLAYWRIGHT_CLI_JS)) return process.env.PLAYWRIGHT_CLI_JS;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    const globalRoot = execFileSync(npm, ['root', '-g'], { encoding: 'utf8', stdio: 'pipe' }).trim();
    const candidates = [
      join(globalRoot, '@playwright', 'cli', 'playwright-cli.js'),
      join(globalRoot, 'playwright-cli', 'node_modules', '@playwright', 'cli', 'playwright-cli.js')
    ];
    const found = candidates.filter((one) => existsSync(one));
    if (found.length) return found[0];
  } catch (e) {}
  try {
    const where = process.platform === 'win32' ? 'where.exe' : 'which';
    const shim = execFileSync(where, ['playwright-cli'], { encoding: 'utf8', stdio: 'pipe' }).split(/\r?\n/)[0].trim();
    const next = join(dirname(shim), 'node_modules', '@playwright', 'cli', 'playwright-cli.js');
    if (existsSync(next)) return next;
  } catch (e) {}
  return '';
}

const CLI = cliScript();
if (!CLI) {
  console.error('the walk needs playwright-cli: npm install -g playwright-cli, or set PLAYWRIGHT_CLI_JS');
  process.exit(1);
}

function run(args) {
  const out = spawnSync(process.execPath, [CLI].concat(args), { cwd: root, encoding: 'utf8', timeout: 180000 });
  if (out.status !== 0) {
    throw new Error('playwright-cli ' + args.slice(0, 2).join(' ') + ' failed: ' + String(out.stderr || out.stdout || '').trim());
  }
  return String(out.stdout || '');
}

function wait(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/* ---- the walk ---- */

const session = ['-s=walk-' + tag];
mkdirSync(out, { recursive: true });
const shot = (screen) => join(out, tag + '-' + screen + '.png');

try {
  run(session.concat(['open', origin + '/?v=walk1']));
  run(session.concat(['resize', '360', '720']));
  wait(900);
  run(session.concat(['eval', readFileSync(resolve(root, 'tools', 'walk-seed.js'), 'utf8')]));
  wait(2000);
  /* The build stamp on the settings page is the build and not the screen: it
     changes with every build, so it is frozen before the shot and the seven
     hashes compare across builds. */
  const FREEZE = "document.querySelectorAll('.updver').forEach(function(e){e.textContent='the build';})";
  SCREENS.forEach((screen) => {
    run(session.concat(['eval', "Sheet.show('" + screen + "')"]));
    wait(800);
    run(session.concat(['eval', FREEZE]));
    run(session.concat(['screenshot', '--hires', '--filename', shot(screen)]));
  });
  run(session.concat(['eval', "Sheet.show('character')"]));
  wait(500);
  run(session.concat(['click', "button[aria-label='Edit the proficiencies']"]));
  wait(600);
  run(session.concat(['eval', "document.querySelector('#charBody').scrollTop = 9999"]));
  wait(600);
  run(session.concat(['screenshot', '--hires', '--filename', shot('gallery')]));
} finally {
  try { run(session.concat(['close'])); } catch (e) {}
}

const files = SCREENS.concat(['gallery']).map((screen) => tag + '-' + screen + '.png').sort();
const lines = files.map((file) => {
  const bytes = readFileSync(join(out, file));
  return file + '  ' + createHash('sha256').update(bytes).digest('hex').slice(0, 16).toUpperCase();
});
writeFileSync(join(out, tag + '.txt'), lines.join('\n') + '\n', 'utf8');
console.log(lines.join('\n'));
