/**
 * The species of the 2024 handbook, from the cached races of 5e.tools.
 *
 *   node tools/species.mjs
 *
 * Each species carries its size, its speed, its darkvision, its traits with
 * their text, and the choice a trait asks for when it has one (the lineage
 * of an elf, the ancestry of a dragonborn, the legacy of a tiefling): the
 * name of the choice and its options, each with what it gives. The fetch of
 * the data calls the same function, so a fresh fetch writes it too.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clean, blocksFrom, cellText } from './markup.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large' };

function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/* The options a trait asks to choose from: the rows of its table, or the
   named items of its list. */
function choiceOf(trait) {
  let found = null;
  const walk = (n) => {
    if (found || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'table' && Array.isArray(n.rows) && n.rows.length > 1) {
      const head = (n.colLabels || []).map((c) => clean(cellText(c)));
      found = {
        label: clean(n.caption || trait.name),
        columns: head,
        options: n.rows.map((r) => ({ name: clean(cellText(r[0])), gives: r.slice(1).map((c, i) => (head[i + 1] ? head[i + 1] + ': ' : '') + clean(cellText(c))).join('; ') }))
      };
      return;
    }
    if (n.type === 'list' && Array.isArray(n.items) && n.items.length > 1 && n.items.every((it) => it && it.name)) {
      found = {
        label: clean(trait.name),
        columns: [],
        options: n.items.map((it) => ({ name: clean(it.name), gives: clean([].concat(it.entries || it.entry || []).map((e) => (typeof e === 'string' ? e : '')).join(' ')) }))
      };
      return;
    }
    Object.keys(n).forEach((k) => walk(n[k]));
  };
  walk(trait.entries);
  return found;
}

export function writeSpecies(cache) {
  const file = resolve(cache, 'races.json');
  if (!existsSync(file)) throw new Error('no races.json in the cache: run node tools/fetch-5e-data.mjs first');
  const races = JSON.parse(readFileSync(file, 'utf8')).race || [];
  const species = races.filter((r) => r.source === 'XPHB').map((r) => {
    const traits = (r.entries || []).filter((e) => e && e.type === 'entries' && e.name).map((t) => {
      const out = { key: 'species-' + slug(r.name) + '-' + slug(t.name), name: clean(t.name), blocks: blocksFrom(t.entries) };
      const choice = choiceOf(t);
      if (choice) out.choice = choice;
      return out;
    });
    const speed = typeof r.speed === 'number' ? r.speed : (r.speed && r.speed.walk) || 30;
    return {
      name: r.name,
      source: r.source,
      ref: { book: r.source, page: Number(r.page) || 0 },
      size: (r.size || ['M']).map((s) => SIZE[s] || s).join(' or '),
      speed: speed,
      darkvision: Number(r.darkvision) || 0,
      type: (r.creatureTypes || ['humanoid']).join(', '),
      traits: traits
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(resolve(root, 'data', 'species.json'), JSON.stringify({
    edition: 'The species of the 2024 handbook, the text from 5e.tools',
    source: 'https://5e.tools',
    fetched: new Date().toISOString().slice(0, 10),
    species: species
  }, null, 2) + '\n', 'utf8');
  return species;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const list = writeSpecies(resolve(root, 'tools', '.5e-cache'));
  console.log('wrote ' + list.length + ' species: ' + list.map((s) => s.name + ' (' + s.traits.length + ' traits' +
    (s.traits.some((t) => t.choice) ? ', choose ' + s.traits.filter((t) => t.choice).map((t) => t.choice.label).join(', ') : '') + ')').join(', '));
}
