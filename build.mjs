import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const src = resolve(root, 'src');
/* The output is a parameter so a test run can build somewhere of its own and
   leave the dist the phone is served alone. */
const outAt = process.argv.indexOf('--out');
const out = resolve(root, outAt > -1 && process.argv[outAt + 1] ? process.argv[outAt + 1] : 'dist');

/* A checkout on Windows may hand a file with CRLF, so every text the build
   reads or writes is made one here, the page and the data beside it: the
   build is the same bytes whoever checks it out, and the size the suite
   checks is the size of the build and not of the checkout. The page's own
   text is not the whole story, the JSON the build inserts into it counts
   too. */
const plain = (text) => text.replace(/\r\n/g, '\n');

const html = plain(readFileSync(resolve(src, 'index.html'), 'utf8'));
const font = readFileSync(resolve(src, 'cinzel.woff2')).toString('base64');

const marker = "url('cinzel.woff2')";
if (!html.includes(marker)) throw new Error('font reference not found in src/index.html');

/* One block of the page is filled by the build. A renamed id fails here,
   rather than shipping a page whose block is empty and says nothing. */
function fill(page, id, value) {
  const tag = new RegExp('(<script id="' + id + '-data" type="application/json">)[\\s\\S]*?(<\\/script>)');
  if (!tag.test(page)) throw new Error('the ' + id + '-data block is not in the page');
  return page.replace(tag, (m, open, close) => open + value + close);
}

/* The files that travel beside the page: every JSON file of data/, so a page
   that brings a file of its own writes no line here. The two the build
   writes into the page itself stay out. The book, the library and the
   bestiary are re-serialised so the phone reads one line, and the classes are
   copied as they are. */
const INLINED = ['wild-magic-surge-xphb', 'conditions'];
const AS_IS = ['classes'];
const FILES = readdirSync(resolve(root, 'data'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  .filter((name) => INLINED.indexOf(name) < 0)
  .sort()
  .map((name) => ({ name, json: AS_IS.indexOf(name) < 0 }));
mkdirSync(resolve(out, 'data'), { recursive: true });
const data = {};
FILES.forEach((file) => {
  const text = plain(readFileSync(resolve(root, 'data', file.name + '.json'), 'utf8'));
  data[file.name] = file.json ? JSON.parse(text) : text;
  writeFileSync(resolve(out, 'data', file.name + '.json'), file.json ? JSON.stringify(data[file.name]) + '\n' : text, 'utf8');
});

/* What a character needs at the start: the features it is seeded with, and
   the spells of the app's own sheet. The seed is the build's own job, not a
   copy of what a page declares. */
const classJson = JSON.parse(data.classes);
const hitDice = {};
(classJson.classes || []).forEach((c) => { hitDice[c.name] = Number(c.hd) || 6; });
/* The page carries the stamp of the build it is. The version a phone compares
   against is the version of the package it would install, so version.json is
   written by the APK build from the page that went into the package, never
   here: a page built and not packaged would otherwise advertise an update
   that installs the build before it, and the offer would never end. */
const version = new Date().toISOString();

const seeds = {
  features: (data.features.features || []).filter((f) => f.seed),
  spells: ((data.spellbook.seed || [])).map((s) => ({ name: s.name, level: s.level })),
  dice: hitDice
};

let built = html.replace(marker, "url('data:font/woff2;base64," + font + "')");
built = fill(built, 'surge', plain(readFileSync(resolve(root, 'data', 'wild-magic-surge-xphb.json'), 'utf8')).trim());
built = fill(built, 'conditions', plain(readFileSync(resolve(root, 'data', 'conditions.json'), 'utf8')).trim());
built = fill(built, 'version', JSON.stringify({ version: version }));
built = fill(built, 'seed', JSON.stringify(seeds));

/* The pages and the shell are separate files, and the built page holds
   them inside, so the phone needs one file and nothing else. */
/* A script tag may name a folder with a star, pages/*.js: every file of it
   is inlined, in the order of their names. A page or a class is then a file
   dropped in the folder, and the page that lists them is not touched. */
built = built.replace(/<script src="([^"*]+)\/\*\.js"><\/script>/g, (m, dir) => {
  const at = resolve(src, dir);
  if (!existsSync(at)) throw new Error('the folder ' + dir + ' is missing');
  return readdirSync(at).filter((f) => f.endsWith('.js')).sort()
    .map((f) => '<script src="' + dir + '/' + f + '"></script>').join('\n');
});
const scripts = [...built.matchAll(/<script src="([^"]+)"><\/script>/g)];
for (const m of scripts) {
  const file = resolve(src, m[1]);
  if (!existsSync(file)) throw new Error('the script ' + m[1] + ' is missing');
  const code = plain(readFileSync(file, 'utf8'));
  built = built.replace(m[0], () => '<script>\n' + code + '\n</script>');
}
if (/<script src=/.test(built)) throw new Error('a script was not inlined');

mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'index.html'), built, 'utf8');

const kb = (Buffer.byteLength(built) / 1024).toFixed(1);
console.log(relative(root, resolve(out, 'index.html')).split('\\').join('/') + ' written: ' + kb + ' KB (font ' + (font.length / 1024).toFixed(1) + ' KB base64)');
