#!/usr/bin/env node
/* Publishes the licence-clean build of the app to the public repository.

   The private tree carries the whole corpus, the characters and the history.
   The public one may carry none of the non-SRD text, so this script assembles
   the tracked tree, swaps `data/` for the SRD-only build made by
   `tools/srd-filter.mjs`, drops `characters/`, replaces the house address of
   this machine, refuses to publish when a private word survives, runs the
   suites, then commits and pushes the result.

     node tools/publish-public.mjs                  # check, commit, push
     node tools/publish-public.mjs --no-push        # everything but the push
     node tools/publish-public.mjs --srd elsewhere  # another corpus

   History is the public repository's own: one commit per publish, authored
   NewbornAI, so no other account ever appears as a contributor. The commit
   names the private commit it was built from. */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const REPO = arg('--repo', 'NewbornAI/kustom-TTRPG');
const SRD = resolve(root, arg('--srd', 'build/srd-data'));
const PUSH = process.argv.indexOf('--no-push') < 0;
const CHECK = process.argv.indexOf('--no-check') < 0;
const BRANCH = 'main';
const NAME = 'NewbornAI';
const MAIL = 'mandal@newbornai.dev';

/* The files the app reads beside the page. A missing one is not a smaller
   corpus, it is a page that cannot start. */
const NEEDED = ['bestiary', 'classes', 'conditions', 'feats', 'features', 'gear', 'rules', 'species', 'spellbook', 'weapons'];

function run(cmd, args, cwd, quiet) {
  const r = spawnSync(cmd, args, { cwd: cwd, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });
  if (r.status !== 0) {
    const text = quiet ? String(r.stdout || '') + String(r.stderr || '') : '';
    throw new Error(cmd + ' ' + args.join(' ') + ' failed' + (text ? ': ' + text.trim() : ''));
  }
  return quiet ? String(r.stdout || '') : '';
}

function git(args, cwd, quiet) {
  return run('git', ['-c', 'user.name=' + NAME, '-c', 'user.email=' + MAIL].concat(args), cwd, quiet);
}

/* ---- the tree to publish ---- */

const work = join(tmpdir(), 'custom-sheet-public');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const tree = join(work, 'tree');
mkdirSync(tree, { recursive: true });

const tar = join(work, 'head.tar');
git(['archive', '--format=tar', '-o', tar, 'HEAD'], root, true);
run('tar', ['-xf', tar, '-C', tree], work, true);
console.log('tree: ' + readdirSync(tree).length + ' entries from HEAD');

/* The characters are the reason the public repository exists and the reason
   they cannot be in it. */
rmSync(join(tree, 'characters'), { recursive: true, force: true });

/* The task artifacts and the status are the working notes of the private tree:
   they name the box, the addresses and the decisions in flight. */
rmSync(join(tree, 'tasks'), { recursive: true, force: true });
rmSync(join(tree, 'STATUS.md'), { force: true });

/* ---- the corpus ---- */

if (!existsSync(SRD)) throw new Error('no SRD corpus at ' + SRD + ': run tools/srd-filter.mjs first');
const kept = {};
NEEDED.forEach((name) => {
  const at = join(SRD, name + '.json');
  if (!existsSync(at)) throw new Error('the SRD corpus has no ' + name + '.json');
  kept[name] = true;
});
rmSync(join(tree, 'data'), { recursive: true, force: true });
mkdirSync(join(tree, 'data'), { recursive: true });
NEEDED.forEach((name) => cpSync(join(SRD, name + '.json'), join(tree, 'data', name + '.json')));

/* The spell book of the private tree carries Mandal's own sheet and seed, and
   the features carry his table of uses: none of that travels. */
const bookAt = join(tree, 'data', 'spellbook.json');
const book = JSON.parse(readFileSync(bookAt, 'utf8'));
delete book.sheet;
delete book.seed;
writeFileSync(bookAt, JSON.stringify(book, null, 2) + '\n', 'utf8');

const featAt = join(tree, 'data', 'features.json');
const featFile = JSON.parse(readFileSync(featAt, 'utf8'));
const before = (featFile.features || []).length;
featFile.features = (featFile.features || []).filter((f) => !f.seed);
writeFileSync(featAt, JSON.stringify(featFile, null, 2) + '\n', 'utf8');
console.log('features: ' + before + ' -> ' + featFile.features.length + ' (the seeded table stays private)');

/* The build inlines the surge table, so a corpus without one cannot build.
   The Wild Magic table is not SRD content: the public page carries an empty
   one and the page says nothing where the table would be. */
const surgeAt = join(tree, 'data', 'wild-magic-surge-xphb.json');
if (!existsSync(surgeAt)) {
  writeFileSync(surgeAt, JSON.stringify({ name: 'Wild Magic Surge', edition: 'not part of the SRD', source: '', fetched: '', rows: [] }, null, 2) + '\n', 'utf8');
  console.log('surge: an empty table (not SRD content)');
}

/* ---- the words of this machine ---- */

const shellAt = join(tree, 'src', 'shell.js');
let shell = readFileSync(shellAt, 'utf8');
if (shell.indexOf('192.168.0.125') < 0) throw new Error('the house address moved: check src/shell.js before publishing');
shell = shell.replace("'http://192.168.0.125:8123'", "''");
/* A character link is a fragment behind the repository of the app: the private
   tree names the private repository, the public build names its own, or the
   link a stranger receives lands on a page they cannot read. */
if (shell.indexOf('NewbornAI/kustom-mandal#') < 0) throw new Error('the link base moved: check src/shell.js before publishing');
shell = shell.replace('NewbornAI/kustom-mandal#', REPO + '#');
writeFileSync(shellAt, shell, 'utf8');

const apkAt = join(tree, 'tools', 'build-apk.ps1');
let apk = readFileSync(apkAt, 'utf8');
apk = apk.split('NewbornAI/kustom-mandal').join(REPO);
writeFileSync(apkAt, apk, 'utf8');

/* The icon generator reaches for a playwright install by an absolute path on
   this machine: a tool of the private tree, not of the public one. */
rmSync(join(tree, 'tools', 'make-icons.mjs'), { force: true });

const PRIVATE = [/efilo/i, /192\.168\.0\.125/, /BOGOS/i, /mandal@/i, /truand\./i];
const hits = [];
(function scan(dir) {
  for (const entry of readdirSync(dir)) {
    const at = join(dir, entry);
    const info = statSync(at);
    if (info.isDirectory()) { scan(at); continue; }
    if (info.size > 4000000) continue;
    /* this file names the patterns it looks for */
    if (relative(tree, at) === join('tools', 'publish-public.mjs')) continue;
    const text = readFileSync(at, 'latin1');
    PRIVATE.forEach((re) => { if (re.test(text)) hits.push(relative(tree, at) + ' matches ' + re); });
  }
})(tree);
if (hits.length) throw new Error('private words in the public tree:\n' + hits.slice(0, 20).join('\n'));

/* ---- it builds and it passes ---- */

/* The four suites read the corpus, and some of what they check is not in the
   SRD (the surge table, the seeded spell list, a dozen spells of the sheet), so
   they run here, against the tree that carries the whole corpus. The public
   tree is the same code with a smaller corpus: it is checked by its build and
   by the smoke test, which drives the shell in a browser. */
if (CHECK) {
  ['rules', 'github', 'address', 'markup'].forEach((name) => run('node', ['test/' + name + '.test.mjs'], root));
  run('node', ['build.mjs'], tree);
  run('node', ['tools/smoke.mjs'], tree);
  rmSync(join(tree, 'dist'), { recursive: true, force: true });
}

/* ---- the public history ---- */

const pub = join(work, 'pub');
run('git', ['clone', '--quiet', 'https://github.com/' + REPO + '.git', pub], work);
if (!existsSync(join(pub, '.git'))) throw new Error('the clone of ' + REPO + ' has no .git');

/* what the clone has and the tree does not goes, .git aside */
(function prune(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git') continue;
    const at = join(dir, entry);
    const mirrored = join(tree, relative(pub, at));
    if (statSync(at).isDirectory()) {
      if (!existsSync(mirrored)) { rmSync(at, { recursive: true, force: true }); continue; }
      prune(at);
    } else if (!existsSync(mirrored)) rmSync(at, { force: true });
  }
})(pub);

cpSync(tree, pub, { recursive: true, filter: (from) => relative(tree, from).split('\\')[0] !== '.git' });

const head = git(['rev-parse', '--short', 'HEAD'], root, true).trim();
git(['add', '-A'], pub);
const dirty = git(['status', '--porcelain'], pub, true).trim();
if (!dirty) { console.log('the public tree is already up to date'); process.exit(0); }
git(['commit', '-m', 'Publish the SRD build from custom-sheet ' + head, '--quiet'], pub);
console.log('commit: ' + git(['log', '-1', '--format=%h %s'], pub, true).trim());
if (!PUSH) { console.log('not pushed (--no-push): ' + pub); process.exit(0); }
git(['push', 'origin', 'HEAD:' + BRANCH, '--quiet'], pub);
console.log('pushed to https://github.com/' + REPO);
