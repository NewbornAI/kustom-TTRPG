/* The items of the books this app reads, from the cached 5e.tools files.
 *
 *   node tools/items.mjs            # write data/items.json from the cache
 *
 * The gear the sheet reads is the narrow list of tools/gear: the armour and the
 * magic items that change a number on the sheet. This module owns the whole
 * catalogue beside it, every item of the same books, with the words the book
 * gives it, so a player can find a ring, a potion or an amulet the sheet does
 * not compute. The fetch of the data calls the same function, so a fresh fetch
 * writes it too.
 *
 * The book set is the one the app reads: the bestiary's books, and the printing
 * an item is reprinted in, because the newer printing is the one that stands.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocksFrom } from './markup.mjs';
import { BOOKS, loadBestiary } from './bestiary.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readCache(cache, name) {
  return JSON.parse(readFileSync(resolve(cache, name), 'utf8'));
}

/* The books the app reads, read from the cache the fetch already holds: the
   monsters of the bestiary, the class and subclass features, the feats, the
   races and the optional features. It is the same set the fetcher derives for
   the feats and the gear, so the catalogue and the shelf cannot drift. */
function booksOnTheShelf(cache) {
  const out = {};
  BOOKS.forEach((b) => { out[b.toUpperCase()] = true; });
  const add = (list) => (list || []).forEach((r) => { if (r && r.source) out[r.source] = true; });
  const all = loadBestiary(cache);
  Object.keys(all).forEach((key) => add(all[key].map((e) => ({ source: e.source }))));
  add(readCache(cache, 'races.json').race);
  add(readCache(cache, 'optionalfeatures.json').optionalfeature);
  add(readCache(cache, 'feats.json').feat);
  readdirSync(cache).forEach((file) => {
    const m = /^class-([a-z]+)\.json$/.exec(file);
    if (!m) return;
    const data = readCache(cache, file);
    add(data.classFeature);
    add(data.subclassFeature);
  });
  return out;
}

/* The books of the catalogue: the books the app reads, then the printing each
   item of those books was reprinted in. A book that only prints a reprint is
   read because of it, never on its own. */
export function itemBooks(sources, items, base, cache) {
  const out = Object.assign({}, sources || booksOnTheShelf(cache || resolve(root, 'tools', '.5e-cache')));
  const mark = (list) => list.forEach((item) => {
    if (!out[item.source]) return;
    (item.reprintedAs || []).forEach((r) => {
      const bits = String(typeof r === 'string' ? r : (r && r.uid) || '').split('|');
      if (bits[1]) out[bits[1]] = true;
    });
  });
  mark(base.baseitem || []);
  mark(items);
  return out;
}

/* The text of an item. Some items keep their text in a shared entry and point
   at it, and the shared text holds the values of the item in its placeholders:
   the dragon scale mail is written once for the seven dragons, and each one
   names its own colour and its own resistance. */
export function itemEntries(item, base) {
  const value = (field) => {
    const v = item[field];
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  };
  const fill = (node) => {
    if (typeof node === 'string') return node
      .replace(/\{\{getFullImmRes item\.([A-Za-z0-9_]+)\}\}/g, (m, field) => {
        const v = value(field);
        return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
      })
      .replace(/\{\{item\.([A-Za-z0-9_]+)\}\}/g, (m, field) => value(field));
    if (Array.isArray(node)) return node.map(fill);
    if (node && typeof node === 'object') {
      const out = {};
      Object.keys(node).forEach((k) => { out[k] = fill(node[k]); });
      return out;
    }
    return node;
  };
  const out = [];
  (item.entries || []).forEach((entry) => {
    if (typeof entry === 'string') {
      const m = entry.match(/^\{#itemEntry ([^}]*)\}$/);
      if (m) {
        const bits = m[1].split('|');
        const shared = (base.itemEntry || []).find((e) => e.name === bits[0] && e.source === (bits[1] || item.source));
        if (shared) {
          fill(shared.entriesTemplate || []).forEach((e) => out.push(e));
          return;
        }
      }
    }
    out.push(fill(entry));
  });
  return out;
}

/* The kind of an item in the words of the book: the type table names the
   weapon, the potion, the ring; a wondrous item carries no type code at all. */
function kindOf(item, base) {
  if (item.wondrous) return 'Wondrous Item';
  const bits = String(item.type || '').split('|');
  if (!bits[0]) return 'Item';
  const list = base.itemType || [];
  const entry = list.find((x) => x.abbreviation === bits[0] && x.source === (bits[1] || item.source)) ||
    list.find((x) => x.abbreviation === bits[0]);
  return entry ? String(entry.name || 'Item') : 'Item';
}

/* The rarity the book writes, or the word it writes instead of one. */
function rarityOf(item) {
  const r = item.rarity;
  if (!r) return '';
  return String(r).trim();
}

/* The attunement: false, true, or the condition the book writes beside it
   ("by a spellcaster"). */
function attuneOf(item) {
  const a = item.reqAttune;
  if (!a) return false;
  if (a === true) return true;
  const text = String(a).trim();
  return text || true;
}

/* The catalogue, in the order the app reads its books: the 2024 handbook first,
   then the book, then the name. */
export function writeItems(options) {
  const cache = resolve(options && options.cache ? options.cache : resolve(root, 'tools', '.5e-cache'));
  const items = readCache(cache, 'items.json').item || [];
  const base = readCache(cache, 'items-base.json');
  const books = (options && options.books) || itemBooks(null, items, base);
  const seen = {};
  const out = [];
  items.forEach((item) => {
    if (!books[item.source]) return;
    if ((item.reprintedAs || []).length) return;
    const key = String(item.name).toLowerCase() + '|' + item.source;
    if (seen[key]) return;
    seen[key] = true;
    out.push({
      name: item.name,
      source: item.source,
      kind: kindOf(item, base),
      rarity: rarityOf(item),
      attune: attuneOf(item),
      weight: Number(item.weight) || 0,
      value: Number(item.value) || 0,
      ref: item.page ? { book: String(item.source), page: Number(item.page) } : { book: String(item.source), page: 0 },
      blocks: blocksFrom(itemEntries(item, base))
    });
  });
  const rank = (source) => (source === 'XPHB' ? -1 : 0);
  out.sort((a, b) => rank(a.source) - rank(b.source) ||
    String(a.source).localeCompare(String(b.source)) || a.name.localeCompare(b.name));
  const sources = [];
  out.forEach((i) => { if (sources.indexOf(i.source) < 0) sources.push(i.source); });
  const file = {
    edition: 'Every item of the books this app reads, the 2024 handbook first: ' + sources.join(', '),
    source: 'https://5e.tools/items.html',
    fetched: new Date().toISOString().slice(0, 10),
    items: out
  };
  writeFileSync(resolve(root, 'data', 'items.json'), JSON.stringify(file, null, 2) + '\n', 'utf8');
  return out;
}

/* Run alone: the whole catalogue of the books the bestiary reads. */
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/tools/items.mjs')) {
  const written = writeItems();
  const sources = [];
  written.forEach((i) => { if (sources.indexOf(i.source) < 0) sources.push(i.source); });
  console.log('wrote ' + written.length + ' items of ' + sources.length + ' books (' + sources.join(', ') + ')');
}
