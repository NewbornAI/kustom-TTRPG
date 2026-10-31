/**
 * Builds the licence-clean copy of the rules data: the records 5e.tools marks
 * as System Reference Document content, and nothing else.
 *
 *   node tools/srd-filter.mjs --out build/srd-data
 *
 * A record is legal when a flagged entry of the same normalised name sits in
 * the same book: `srd: true` is SRD 5.1, `srd52: true` is SRD 5.2. The book is
 * read from the record's own `ref` (a 5e.tools address, its `_xphb` token, or
 * the `{book, page}` the fetch writes) and, for a record the fetch wrote
 * without one, from its `source`. A record whose book carries no flag is
 * dropped even when a same-named entry of another book is flagged, because the
 * two wordings are not the same text.
 *
 * One form says more than a flag and is dropped all the same. `srd52: "Arcane
 * Hand"` is 5e.tools saying the entry is SRD 5.2 under another name, the name
 * the licence keeps because the book's own is a proper noun. The record we hold
 * still carries the book's name, and a filter does not rename, so it cannot
 * travel: those are the drops the report says out loud.
 *
 * The output keeps the shape of data/: the same filenames, the same keys in
 * the same order, the same top-level metadata, only fewer records. The personal seed and the sheet reference leave the public copy of
 * the spell book. Nothing is sorted, nothing is stamped, and two runs write
 * two identical directories.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* The lists of 5e.tools an SRD entry may sit in. The families below name the
   lists each output file was built from, so a feat is not kept because a race
   of the same name is flagged. */
const LISTS = [
  'spell', 'monster', 'item', 'baseitem', 'feat', 'race', 'subrace',
  'condition', 'optionalfeature', 'class', 'subclass', 'classFeature', 'subclassFeature'
];

/* The lists the cache must carry. A missing one is a cache that was never
   fetched, and a filter over half a cache is a corpus nobody can trust. */
const REQUIRED = LISTS.slice();

/* The books the repository reads as its core. A drop of one of these is the
   one a reader notices, so it is said first in the report. */
const CORE = { XPHB: true, PHB: true, XMM: true, MM: true, XDMG: true, DMG: true };

function fail(message) {
  console.error('srd-filter: ' + message);
  process.exit(1);
}

/* ---------- the arguments ---------- */

function readArgs() {
  const out = { out: resolve(root, 'build', 'srd-data'), cache: resolve(root, 'tools', '.5e-cache') };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log('node tools/srd-filter.mjs --out build/srd-data');
      console.log('');
      console.log('  --out <dir>    where the clean copy goes (default build/srd-data)');
      console.log('  --cache <dir>  the raw 5e.tools data (default tools/.5e-cache)');
      process.exit(0);
    } else if (a === '--out' || a === '--cache') {
      const value = argv[++i];
      if (!value) fail(a + ' needs a directory');
      out[a.slice(2)] = resolve(process.cwd(), value);
    } else if (a.indexOf('--out=') === 0) {
      out.out = resolve(process.cwd(), a.slice(6));
    } else if (a.indexOf('--cache=') === 0) {
      out.cache = resolve(process.cwd(), a.slice(8));
    } else {
      fail('unknown argument: ' + a);
    }
  }
  return out;
}

/* ---------- the names and the books ---------- */

function norm(name) {
  return String(name === undefined || name === null ? '' : name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* The book a record belongs to: the `_xphb` token of a 5e.tools address, the
   `{book, page}` the fetch writes, or the `source` it keeps for a record that
   carries no reference at all (a creature, a class). */
function bookOf(record) {
  if (!record || typeof record !== 'object') return '';
  const ref = record.ref;
  if (typeof ref === 'string') {
    const hash = ref.indexOf('#') >= 0 ? ref.slice(ref.lastIndexOf('#') + 1) : '';
    const bits = decodeURIComponent(hash).split('_');
    if (hash && bits.length > 1) return String(bits.pop()).toUpperCase();
    return '';
  }
  if (ref && typeof ref === 'object' && ref.book) return String(ref.book).toUpperCase();
  if (typeof record.source === 'string' && record.source) return record.source.toUpperCase();
  return '';
}

/* ---------- the cache ---------- */

/* One index per list: a normalised name, then the books that carry it and
   whether that book flags the entry. A name and a book are the key, because
   2014 and 2024 reprints share a name and share nothing else. */
function makeIndex(cacheDir) {
  if (!existsSync(cacheDir)) fail('no cache at ' + cacheDir + ': run node tools/fetch-5e-data.mjs first');
  const files = readdirSync(cacheDir).filter((f) => /\.json$/i.test(f)).sort();
  if (!files.length) fail('the cache at ' + cacheDir + ' holds no json');
  const index = {};
  const flagged = {};
  const renamed = {};
  const books = {};
  for (const file of files) {
    let all;
    try {
      all = JSON.parse(readFileSync(resolve(cacheDir, file), 'utf8'));
    } catch (e) {
      fail('the cache file ' + file + ' does not parse: ' + e.message);
    }
    for (const list of LISTS) {
      const rows = all[list];
      if (!Array.isArray(rows)) continue;
      books[list] = true;
      const byName = index[list] || (index[list] = new Map());
      for (const row of rows) {
        if (!row || typeof row.name !== 'string' || !row.name) continue;
        const key = norm(row.name);
        const book = String(row.source || '').toUpperCase();
        const flag = row.srd === true || row.srd52 === true;
        const other = (typeof row.srd === 'string' && row.srd) ||
          (typeof row.srd52 === 'string' && row.srd52) || '';
        let entry = byName.get(key);
        if (!entry) byName.set(key, (entry = new Map()));
        const before = entry.get(book) || { flag: false, renamed: '' };
        entry.set(book, { flag: before.flag || flag, renamed: before.renamed || other });
        if (flag) {
          const set = flagged[key] || (flagged[key] = new Set());
          set.add(book);
        }
        if (other) {
          let names = renamed[key];
          if (!names) renamed[key] = (names = new Map());
          if (!names.get(book)) names.set(book, other);
        }
      }
    }
  }
  for (const list of REQUIRED) {
    if (!books[list]) fail('the cache carries no ' + list + ' list: run node tools/fetch-5e-data.mjs');
  }
  return { index, flagged, renamed };
}

const args = readArgs();
const corpus = makeIndex(args.cache);
const index = corpus.index;
const flaggedNames = corpus.flagged;
const renamedNames = corpus.renamed;

/* The one test: a flagged entry of the same name in the same book. */
function isLegal(lists, record) {
  const key = norm(record.name);
  const book = bookOf(record);
  if (!key || !book) return false;
  for (const list of lists) {
    const byName = index[list];
    if (!byName) continue;
    const entry = byName.get(key);
    const hit = entry && entry.get(book);
    if (hit && hit.flag) return true;
  }
  return false;
}

/* ---------- the data ---------- */

const dataDir = resolve(root, 'data');

function readData(name) {
  const file = resolve(dataDir, name);
  if (!existsSync(file)) fail('no ' + name + ' in data/');
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    fail('data/' + name + ' does not parse: ' + e.message);
  }
}

/* A shallow copy that swaps one key, so the keys keep their order and the
   metadata is the metadata of data/ rather than a rewriting of it. */
function rewrite(data, keys) {
  const out = {};
  for (const k of Object.keys(data)) out[k] = Object.prototype.hasOwnProperty.call(keys, k) ? keys[k] : data[k];
  return out;
}

/* ---------- the report ---------- */

const rows = [];
const surprises = [];

function family(file, kept, drops) {
  rows.push({ file: file, kept: kept, dropped: drops.length });
  surprises.push({ file: file, drops: drops, kept: kept });
}

/* The SRD name a dropped record is flagged under, when 5e.tools named it
   somewhere else: the reprint and the renamed entry. */
function renamedAs(record) {
  const book = bookOf(record);
  const names = renamedNames[norm(record.name)];
  return (names && names.get(book)) || '';
}

/* The drops a reader did not see coming: a record 5e.tools flags under an SRD
   name while our copy keeps the book's, then a name flagged under another
   book (the collision the book token exists for), then an entry of a core
   book with no flag of its own. */
function surpriseList(drops, limit) {
  const scored = [];
  for (let i = 0; i < drops.length; i++) {
    const record = drops[i];
    const name = String(record.name || '');
    const book = bookOf(record) || '?';
    const other = renamedAs(record);
    const elsewhere = flaggedNames[norm(name)];
    let rank = 0;
    let why = '';
    if (other) {
      rank = 3;
      why = 'SRD content that 5e.tools names ' + other + '; a filter does not rename, so it is dropped';
    } else if (elsewhere && elsewhere.size && !elsewhere.has(book)) {
      rank = 2;
      why = 'an SRD entry of this name exists only under ' + Array.from(elsewhere).sort().join(', ');
    } else if (CORE[book]) {
      rank = 1;
      why = 'core book ' + book + ', and 5e.tools flags no entry of this name in it';
    }
    if (rank) scored.push({ rank: rank, why: why, name: name, book: book, at: i });
  }
  scored.sort((a, b) => b.rank - a.rank ||
    String(a.book).localeCompare(String(b.book)) ||
    String(a.name).localeCompare(String(b.name)) ||
    a.at - b.at);
  return scored.slice(0, limit);
}

function keep(records, lists, drops) {
  const kept = [];
  for (const record of records) {
    if (isLegal(lists, record)) kept.push(record);
    else drops.push(record);
  }
  return kept;
}

/* Every kept record must stand on a flagged name, whatever its book: that is
   the promise the corpus makes to a licence, and it is checked after the
   filtering rather than trusted to it. */
function verify(file, kept) {
  for (const record of kept) {
    const key = norm(record.name);
    if (!key) fail(file + ': a kept record carries no name');
    if (!flaggedNames[key] || !flaggedNames[key].size) {
      fail(file + ': kept ' + record.name + ' with no SRD entry under that name');
    }
  }
}

/* ---------- the files ---------- */

const write = {};

/* bestiary.json: an object keyed by lowercase creature name. */
{
  const data = readData('bestiary.json');
  const drops = [];
  const creatures = {};
  for (const key of Object.keys(data.creatures || {})) {
    const record = data.creatures[key];
    if (isLegal(['monster'], record)) creatures[key] = record;
    else drops.push(record);
  }
  verify('bestiary.json', Object.keys(creatures).map((k) => creatures[k]));
  family('bestiary.json', Object.keys(creatures).length, drops);
  write['bestiary.json'] = rewrite(data, { creatures: creatures });
}

/* classes.json: the class records, and the subclasses inside each of them. */
{
  const data = readData('classes.json');
  const drops = [];
  const classDrops = [];
  const kept = [];
  const bare = [];
  for (const record of data.classes || []) {
    if (!isLegal(['class'], record)) { classDrops.push(record); drops.push(record); continue; }
    const subs = [];
    for (const sub of record.subclasses || []) {
      if (isLegal(['subclass'], sub)) subs.push(sub);
      else { drops.push(sub); }
    }
    if (!subs.length && (record.subclasses || []).length) bare.push(record.name);
    kept.push(record);
    record.subclasses = subs;
  }
  verify('classes.json', kept);
  family('classes.json', kept.length, classDrops);
  const subsKept = kept.reduce((n, c) => n + c.subclasses.length, 0);
  const subsDropped = drops.length - classDrops.length;
  rows[rows.length - 1].extra = 'subclasses kept ' + subsKept + ', dropped ' + subsDropped;
  rows[rows.length - 1].bare = bare;
  write['classes.json'] = rewrite(data, { classes: kept });
}

{
  const data = readData('conditions.json');
  const drops = [];
  const kept = keep(data.conditions || [], ['condition'], drops);
  verify('conditions.json', kept);
  family('conditions.json', kept.length, drops);
  write['conditions.json'] = rewrite(data, { conditions: kept });
}

{
  const data = readData('feats.json');
  const drops = [];
  const kept = keep(data.feats || [], ['feat'], drops);
  verify('feats.json', kept);
  family('feats.json', kept.length, drops);
  write['feats.json'] = rewrite(data, { feats: kept });
}

/* features.json: the curated table and the library. The fetch built it from
   the class features, the subclass features, the optional features, the feats
   and the races, so those five lists are the family. */
{
  const data = readData('features.json');
  const drops = [];
  const lists = ['classFeature', 'subclassFeature', 'optionalfeature', 'feat', 'race'];
  const kept = keep(data.features || [], lists, drops);
  verify('features.json', kept);
  family('features.json', kept.length, drops);
  const curated = (data.features || []).filter((f) => f.seed || f.preset);
  const curatedKept = kept.filter((f) => f.seed || f.preset);
  rows[rows.length - 1].extra = 'curated ' + curatedKept.length + ' of ' + curated.length;
  write['features.json'] = rewrite(data, { features: kept });
}

/* gear.json: the armour and the magic items, two arrays. */
{
  const data = readData('gear.json');
  const drops = [];
  const armour = keep(data.armour || [], ['baseitem'], drops);
  const magic = keep(data.magic || [], ['item'], drops);
  verify('gear.json', armour.concat(magic));
  family('gear.json', armour.length + magic.length, drops);
  rows[rows.length - 1].extra = 'armour ' + armour.length + ', magic ' + magic.length;
  write['gear.json'] = rewrite(data, { armour: armour, magic: magic });
}

/* items.json: every item of the books the app reads. The catalogue is not the
   gear the sheet computes with, so it is filtered on its own. */
{
  const data = readData('items.json');
  const drops = [];
  const kept = keep(data.items || [], ['item'], drops);
  verify('items.json', kept);
  family('items.json', kept.length, drops);
  write['items.json'] = rewrite(data, { items: kept });
}

/* rules.json is our own writing, not a book's, so it travels whole. */
{
  const data = readData('rules.json');
  family('rules.json', (data.rules || []).length, []);
  rows[rows.length - 1].incidental = true;
  write['rules.json'] = data;
}

{
  const data = readData('species.json');
  const drops = [];
  const kept = keep(data.species || [], ['race'], drops);
  verify('species.json', kept);
  family('species.json', kept.length, drops);
  write['species.json'] = rewrite(data, { species: kept });
}

/* spellbook.json: the spells, and neither the personal seed nor the sheet it
   was read from, since both name one table's character. */
{
  const data = readData('spellbook.json');
  const drops = [];
  const kept = keep(data.spells || [], ['spell'], drops);
  verify('spellbook.json', kept);
  family('spellbook.json', kept.length, drops);
  const out = {};
  for (const key of Object.keys(data)) {
    if (key === 'sheet' || key === 'seed') continue;
    out[key] = key === 'spells' ? kept : data[key];
  }
  write['spellbook.json'] = out;
}

{
  const data = readData('weapons.json');
  const drops = [];
  const kept = keep(data.weapons || [], ['baseitem'], drops);
  verify('weapons.json', kept);
  family('weapons.json', kept.length, drops);
  write['weapons.json'] = rewrite(data, { weapons: kept });
}

/* ---------- the gate ---------- */

/* A family that comes out empty is a broken cache or a broken index, never a
   corpus, so nothing is written and the run fails. */
for (const row of rows) {
  if (!row.kept) fail(row.file + ' comes out empty');
}
if (!write['gear.json'].armour.length) fail('gear.json comes out with no armour');
if (!write['gear.json'].magic.length) fail('gear.json comes out with no magic item');

/* ---------- the write ---------- */

if (!existsSync(args.out)) mkdirSync(args.out, { recursive: true });
for (const file of Object.keys(write)) {
  writeFileSync(resolve(args.out, file), JSON.stringify(write[file], null, 2) + '\n', 'utf8');
}

/* ---------- the answer ---------- */

const pad = (text, n) => (String(text) + '                                ').slice(0, n);
console.log('srd-filter: ' + args.out);
console.log('');
console.log('  ' + pad('file', 20) + pad('kept', 8) + pad('dropped', 9) + 'note');
let keptTotal = 0;
let droppedTotal = 0;
for (const row of rows) {
  keptTotal += row.kept;
  droppedTotal += row.dropped;
  const note = row.incidental ? 'copied unchanged, our own writing' : (row.extra || '');
  console.log('  ' + pad(row.file, 20) + pad(String(row.kept), 8) + pad(String(row.dropped), 9) + note);
}
console.log('');
console.log('  ' + keptTotal + ' records kept, ' + droppedTotal + ' dropped');

for (const part of surprises) {
  if (!part.drops.length) continue;
  const list = surpriseList(part.drops, 10);
  console.log('');
  console.log('  ' + part.file + ', the ten drops that surprise:');
  if (!list.length) {
    console.log('    nothing of a core book and nothing held by another book: every drop is a record of a book outside the SRD');
    continue;
  }
  for (const item of list) console.log('    - ' + item.name + ' (' + item.book + '): ' + item.why);
}

const renamedDropped = [];
for (const part of surprises) {
  for (const record of part.drops) {
    const other = renamedAs(record);
    if (other) renamedDropped.push(String(record.name) + ' (' + bookOf(record) + ') is ' + other);
  }
}
if (renamedDropped.length) {
  console.log('');
  console.log('  dropped because 5e.tools files them under an SRD name:');
  for (const line of renamedDropped) console.log('    - ' + line);
}

for (const row of rows) {
  if (row.bare && row.bare.length) {
    console.log('');
    console.log('  a class left with no subclass: ' + row.bare.join(', '));
  }
}

console.log('');
console.log('  verified: every kept record stands on a flagged 5e.tools entry');
