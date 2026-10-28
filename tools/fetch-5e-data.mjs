/**
 * Pulls the 2024 Player's Handbook data this app needs from 5e.tools and
 * writes the files the app reads beside the page: the wild magic surge
 * table, the spell book, the features, the classes, the bestiary and the
 * catalogue of feats.
 *
 *   node tools/fetch-5e-data.mjs
 *
 * The spell book is built from the character's own sheet (data/spell-sheet.csv)
 * plus the sorcerer and warlock lists, so the app can offer a grimoire.
 * The catalogue of feats holds the feats of the books this repository reads,
 * the 2024 handbook first, and the file it writes names them.
 * The raw upstream files are downloaded into tools/.5e-cache/ and are not in git.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clean, textOf, cellText, blocksFrom, references } from './markup.mjs';
import { BOOKS, loadBestiary, resolveCreature, creatureRecord } from './bestiary.mjs';
import { writeSpecies } from './species.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(root, 'tools', '.5e-cache');
mkdirSync(cache, { recursive: true });

const BASE = 'https://5e.tools/data/';

function download(url, file) {
  const out = resolve(cache, file);
  if (existsSync(out) && readFileSync(out).length > 1000) return out;
  console.log('downloading ' + url);
  const r = spawnSync('curl.exe', ['-sSL', '--fail', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', '-o', out, url], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('curl failed for ' + url);
  return out;
}

/* ---------- the sheet ---------- */

function parseSheet(csv) {
  const rows = [];
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { quoted = !quoted; continue; }
      if (ch === ',' && !quoted) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    if (cells.length < 3) continue;
    if (cells[0].trim().toLowerCase() === 'source') continue;
    const source = cells[0].trim();
    const level = Number(cells[1]);
    if (!source || !Number.isFinite(level) || level < 0) continue;
    for (const raw of cells.slice(2).join(',').split(',')) {
      const item = raw.trim();
      if (!item) continue;
      let name = item;
      let hint = null;
      const m = item.match(/^https?:\/\/[^#]*#(.+)$/);
      if (m) {
        const bits = decodeURIComponent(m[1]).split('_');
        hint = bits.pop();
        name = bits.join('_');
      }
      rows.push({ name: name, level: level, source: source, hint: hint });
    }
  }
  return rows;
}

/* ---------- 5e.tools markup ---------- */

/* The cleaning of the upstream markup, the tags that name a creature and
   the blocks they lead to live in markup.mjs, so the fetcher and the
   bestiary read the same text the same way. */

/* ---------- formatters ---------- */

const TIME_UNITS = {
  action: ['action', 'actions'],
  bonus: ['bonus action', 'bonus actions'],
  reaction: ['reaction', 'reactions'],
  minute: ['minute', 'minutes'],
  hour: ['hour', 'hours'],
  day: ['day', 'days'],
  second: ['second', 'seconds'],
  round: ['round', 'rounds']
};

function unitWords(unit, n) {
  const pair = TIME_UNITS[unit];
  if (!pair) return unit;
  return n > 1 ? pair[1] : pair[0];
}

/* The casting time, short for the card and whole for the full page: a
   reaction carries the trigger it waits for. */
function formatTime(time) {
  if (!Array.isArray(time)) return { short: '', full: '' };
  const short = time.map((t) => {
    const unit = String(t.unit || '');
    const n = t.number || 1;
    if (unit === 'action') return n > 1 ? n + ' actions' : 'Action';
    if (unit === 'bonus') return n > 1 ? n + ' bonus actions' : 'Bonus Action';
    if (unit === 'reaction') return n > 1 ? n + ' reactions' : 'Reaction';
    return n + ' ' + unitWords(unit, n);
  }).join(' or ');
  const full = time.map((t) => {
    const unit = String(t.unit || '');
    const n = t.number || 1;
    const one = n + ' ' + unitWords(unit, n);
    return t.condition ? one + ', ' + clean(t.condition) : one;
  }).join(' or ');
  return { short: short, full: full };
}

function formatRange(range) {
  if (!range) return '';
  const d = range.distance;
  if (d && d.type === 'self') return 'Self' + (d.amount ? ' (' + d.amount + ' feet)' : '');
  if (d && d.type === 'touch') return 'Touch';
  const amt = d && d.amount ? d.amount + ' ' + (d.type === 'foot' ? 'feet' : d.type) : '';
  switch (range.type) {
    case 'point': return amt || 'Special';
    case 'self': return d ? 'Self (' + amt + ')' : 'Self';
    case 'sphere': return amt ? amt + ' radius' : 'Sphere';
    case 'cone': return amt ? amt + ' cone' : 'Cone';
    case 'line': return amt ? amt + ' line' : 'Line';
    default: return amt || 'Special';
  }
}

function plural(unit, n) {
  if (n === 1) return unit;
  if (unit === 'minute') return 'minutes';
  if (unit === 'hour') return 'hours';
  if (unit === 'day') return 'days';
  if (unit === 'second') return 'seconds';
  if (unit === 'round') return 'rounds';
  return unit ? unit + 's' : unit;
}

function formatDuration(duration) {
  if (!Array.isArray(duration)) return '';
  return duration.map((d) => {
    if (d.type === 'instant') return 'Instantaneous';
    if (d.type === 'permanent') return 'Permanent';
    if (d.type === 'special') return 'Special';
    if (d.duration) {
      const amount = d.duration.amount;
      const unit = String(d.duration.type || '');
      return amount ? amount + ' ' + plural(unit, amount) : unit;
    }
    return String(d.type || '');
  }).join(' or ');
}

/* ---------- the surge table ---------- */

const classData = JSON.parse(readFileSync(download(BASE + 'class/class-sorcerer.json', 'class-sorcerer.json'), 'utf8'));
const surgeFeature = classData.subclassFeature.find((f) => f.classSource === 'XPHB' && f.name === 'Wild Magic Surge');
if (!surgeFeature) throw new Error('the Wild Magic Surge feature was not found');
const table = surgeFeature.entries.find((e) => e && e.type === 'table');
if (!table) throw new Error('the surge table was not found');

const surgeRows = [];
for (const row of table.rows) {
  const range = String(row[0]).replace(/[–—]/g, '-').trim();
  const m = range.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) throw new Error('bad range: ' + row[0]);
  let from = Number(m[1]);
  let to = Number(m[2]);
  if (to < from) to = 100;
  surgeRows.push({ from, to, text: textOf(row[1]) });
}
surgeRows.sort((a, b) => a.from - b.from);
let covered = 0;
for (const r of surgeRows) {
  if (r.from !== covered + 1) throw new Error('gap in the surge table at ' + r.from);
  covered = r.to;
}
if (covered !== 100) throw new Error('the surge table covers ' + covered);

writeFileSync(
  resolve(root, 'data', 'wild-magic-surge-xphb.json'),
  JSON.stringify({
    name: 'Wild Magic Surge',
    edition: "2024 Player's Handbook, the Wild Magic Surge table",
    source: 'https://5e.tools/classes.html#sorcerer_xphb',
    fetched: new Date().toISOString().slice(0, 10),
    rows: surgeRows
  }, null, 2) + '\n',
  'utf8'
);
console.log('surge table: ' + surgeRows.length + ' rows covering 1-100');

/* ---------- the conditions ---------- */

/* The 2024 conditions in the words of the book, so the pop-up a condition
   opens carries its text rather than only a link out. The 2024 printing wins
   a name it shares with an older one. */
const conditionSource = {};
JSON.parse(readFileSync(download(BASE + 'conditionsdiseases.json', 'conditionsdiseases.json'), 'utf8')).condition
  .forEach((c) => {
    if (!c || !c.name) return;
    if (c.source === 'XPHB') conditionSource[c.name] = c;
    else if (!conditionSource[c.name]) conditionSource[c.name] = c;
  });
const conditionList = Object.keys(conditionSource).map((name) => {
  const c = conditionSource[name];
  return { name: name, source: c.source || '', ref: refOf(c), blocks: blocksFrom(c.entries) };
}).filter((c) => c.blocks.length);
conditionList.sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  resolve(root, 'data', 'conditions.json'),
  JSON.stringify({
    edition: "The 2024 conditions of the Player's Handbook, the text from 5e.tools",
    source: 'https://5e.tools/conditionsdiseases.html',
    fetched: new Date().toISOString().slice(0, 10),
    conditions: conditionList
  }, null, 2) + '\n',
  'utf8'
);
console.log('wrote ' + conditionList.length + ' conditions');

/* ---------- the spell data ---------- */

const SOURCES = ['XPHB', 'PHB', 'XGE', 'AU', 'SCC', 'FTD', 'TCE'];
const files = { XPHB: 'spells/spells-xphb.json', PHB: 'spells/spells-phb.json', XGE: 'spells/spells-xge.json', AU: 'spells/spells-au.json', SCC: 'spells/spells-scc.json', FTD: 'spells/spells-ftd.json', TCE: 'spells/spells-tce.json' };
const bySource = {};
for (const src of SOURCES) {
  const list = JSON.parse(readFileSync(download(BASE + files[src], 'spells-' + src.toLowerCase() + '.json'), 'utf8')).spell;
  bySource[src] = list;
}

const lookup = JSON.parse(readFileSync(download(BASE + 'generated/gendata-spell-source-lookup.json', 'gendata-spell-source-lookup.json'), 'utf8'));

/* The classes the app knows: the eight of the 2024 handbook, and the
   hexblade, the warlock subclass the character plays. */
const CLASSES = ['Sorcerer', 'Warlock', 'Wizard', 'Bard', 'Cleric', 'Druid', 'Ranger', 'Paladin'];
const SUBCLASSES = ['Hexblade'];

/* Who can learn a spell: the classes that have it, and the subclasses that
   add it. A 2024 handbook spell carries its classes in `class`, and a spell
   of an older book carries them per edition in `classVariant`, where the
   2024 variant is the one the app reads. */
function sourcesFor(name, edition) {
  const key = String(name).toLowerCase();
  const entry = (lookup[String(edition || 'xphb').toLowerCase()] || {})[key] || lookup.xphb[key];
  const out = [];
  if (!entry) return out;
  const classes = (entry.class && entry.class.XPHB) ||
    (entry.classVariant && (entry.classVariant.XPHB || entry.classVariant.PHB)) || null;
  if (classes) {
    for (const c of CLASSES) if (classes[c] && out.indexOf(c) < 0) out.push(c);
  }
  if (entry.subclass && entry.subclass.XPHB) {
    for (const cls of Object.keys(entry.subclass.XPHB)) {
      const bySource = entry.subclass.XPHB[cls];
      for (const src of Object.keys(bySource)) {
        for (const sub of Object.keys(bySource[src])) {
          if (SUBCLASSES.indexOf(sub) >= 0 && out.indexOf(sub) < 0) out.push(sub);
        }
      }
    }
  }
  return out;
}

function norm(name) { return String(name).toLowerCase().replace(/[^a-z0-9]/g, ''); }

const index = {};
for (const src of SOURCES) {
  for (const s of bySource[src]) {
    const key = norm(s.name);
    if (!index[key]) index[key] = [];
    index[key].push(Object.assign({}, s, { _src: src }));
  }
}

/* The creatures a piece of upstream text names, and the book each
   block is in, which the bestiary needs to find it. */
const creatureSources = {};
function creatureNames(node) {
  /* The same creature is named twice in a text, once in each case, and the
     name is kept as it was written the first time. */
  const names = [];
  const seen = {};
  references(node).forEach((r) => {
    const key = r.name.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    names.push(r.name);
    if (!creatureSources[r.name]) creatureSources[r.name] = r.source;
  });
  return names;
}

/* A spell calls a creature when its text names one. The conjure spells
   of the 2024 handbook name none, for the pack they bring is an effect and
   not a creature with a block, so they are no summons. */

function spellRecord(spell, sourceTag) {
  const time = formatTime(spell.time);
  const creatures = creatureNames([spell.entries, spell.entriesHigherLevel]);
  return {
    name: spell.name,
    level: spell.level,
    school: spell.school || '',
    time: time.short,
    timeFull: time.full,
    range: formatRange(spell.range),
    duration: formatDuration(spell.duration),
    components: ['v', 's', 'm'].filter((k) => spell.components && spell.components[k]).map((k) => k.toUpperCase()).join(''),
    ritual: (spell.miscTags || []).includes('RITUAL'),
    /* In the 2024 data the concentration flag sits on the duration. */
    concentration: !!(spell.concentration || (Array.isArray(spell.duration) && spell.duration.some((d) => d && d.concentration))),
    source: sourceTag || '',
    ref: refOf(spell),
    classes: [],
    /* A spell summons when it names a creature, and the creatures it names
       are the blocks the player can call. */
    summons: creatures.length > 0,
    creatures: creatures,
    blocks: blocksFrom(spell.entries).concat(blocksFrom(spell.entriesHigherLevel))
  };
}

/* The same class, written two ways on the sheet: the hexblade's second
   level list is written "hex", the izzet engineer is written both ways, and
   the elf is written "high elf" on some lines. */
const SOURCE_ALIAS = { 'izzet': 'Izzet engineer', 'high elf': 'Elf', 'elf': 'Elf', 'hex': 'Hexblade' };
function canonSource(source) {
  const name = String(source || '').trim();
  return SOURCE_ALIAS[name.toLowerCase()] || name;
}

const sheet = parseSheet(readFileSync(resolve(root, 'data', 'spell-sheet.csv'), 'utf8'));
const seed = [];
const book = new Map();

for (const row of sheet) {
  const key = norm(row.name);
  const candidates = index[key] || [];
  const pick = candidates.find((c) => c._src === row.hint) || candidates.find((c) => c._src === 'XPHB') || candidates[0];
  if (!pick) { console.log('not found: ' + row.name + ' (' + row.source + ')'); continue; }
  seed.push({ name: pick.name, level: row.level, source: canonSource(row.source) });
  if (!book.has(pick.name)) book.set(pick.name, spellRecord(pick, canonSource(row.source)));
}

/* every spell the classes can learn, and the classes of each one */
for (const spell of bySource.XPHB) {
  const classes = sourcesFor(spell.name);
  if (!classes.length) continue;
  if (book.has(spell.name)) {
    const rec = book.get(spell.name);
    rec.classes = classes;
    if (!rec.source) rec.source = classes[0];
    continue;
  }
  const rec = spellRecord(spell, classes[0]);
  rec.classes = classes;
  book.set(spell.name, rec);
}

/* The spells the grimoire of the second character names and the classes of
   the app do not bring: they live in books outside the handbook, so they are
   named here with the name and the source 5e.tools carries. The classes are
   left out, since the lookup of the classes covers the 2024 handbook only. */
const EXTRA_SPELLS = [
  { name: "Raulothim's Psychic Lance", source: 'FTD' },
  { name: 'Scatter', source: 'XGE' },
  { name: "Tasha's Otherworldly Guise", source: 'TCE' }
];

for (const want of EXTRA_SPELLS) {
  const candidates = index[norm(want.name)] || [];
  const pick = candidates.find((c) => c._src === want.source) || candidates.find((c) => c._src === 'XPHB') || candidates[0];
  if (!pick) { console.log('not found: ' + want.name); continue; }
  if (book.has(pick.name)) continue;
  const classes = sourcesFor(pick.name, want.source);
  const rec = spellRecord(pick, classes[0] || '');
  rec.classes = classes;
  book.set(pick.name, rec);
}

/* the source the sheet gave a spell joins the classes that can learn it */
for (const row of seed) {
  const rec = book.get(row.name);
  if (!rec) continue;
  const source = canonSource(row.source);
  if (rec.classes.indexOf(source) < 0) rec.classes.push(source);
}

const spells = [...book.values()].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

writeFileSync(
  resolve(root, 'data', 'spellbook.json'),
  JSON.stringify({
    edition: "2024 Player's Handbook, every spell the classes can learn, the character's own sheet, and the grimoire's spells from the books outside it",
    source: 'https://5e.tools/spells.html',
    fetched: new Date().toISOString().slice(0, 10),
    sheet: 'data/spell-sheet.csv',
    seed: seed,
    spells: spells
  }, null, 2) + '\n',
  'utf8'
);

/* ---------- the features ---------- */

/* The features the character tracks. The short text, the uses and the
   recovery are Mandal's own table of 2026-10-22; the long text is pulled
   from 5e.tools. */
const FEATURE_SPECS = [
  { key: 'innateSorcery', name: 'Innate sorcery', source: 'Sorcerer', active: true, uses: 2, recovery: 'long', action: 'B', duration: '1 min', desc: 'DC +1, advantage attack w/ spells sorcerer', from: { file: 'class-sorcerer', list: 'classFeature', name: 'Innate Sorcery', source: 'XPHB' } },
  { key: 'metamagic', name: 'Metamagic', source: 'Sorcerer', active: true, uses: 8, recovery: 'long', action: '', duration: '', desc: 'Heighten + quicken', hidden: true, from: { file: 'class-sorcerer', list: 'classFeature', name: 'Metamagic', source: 'XPHB' } },
  { key: 'tidesOfChaos', name: 'Tides of chaos', source: 'Wild Magic', active: true, uses: 1, recovery: 'long', action: '', duration: '', desc: 'Advantage, on spell slot: roll surge to refund', from: { file: 'class-sorcerer', list: 'subclassFeature', name: 'Tides of Chaos', source: 'XPHB' } },
  { key: 'sorcerousRest', name: 'Sorcerous rest', source: 'Sorcerer', active: true, uses: 1, recovery: 'long', action: '', duration: '', desc: 'Regain 1/2 sorc level SP', hidden: true, from: { file: 'class-sorcerer', list: 'classFeature', name: 'Sorcerous Restoration', source: 'XPHB' } },
  { key: 'bendLuck', name: 'Bend luck', source: 'Wild Magic', active: true, uses: 0, recovery: 'special', cost: 'sp', action: 'R', duration: '', desc: 'Creature I can see rolls D20: +/-1d4', from: { file: 'class-sorcerer', list: 'subclassFeature', name: 'Bend Luck', source: 'XPHB' } },
  { key: 'magicalCunning', name: 'Magical Cunning', source: 'Warlock', active: true, uses: 1, recovery: 'long', action: '', duration: '1 min', desc: 'Regain 1 spell slot', hidden: true, from: { file: 'class-warlock', list: 'classFeature', name: 'Magical Cunning', source: 'XPHB' } },
  { key: 'hexCurse', name: 'Hexblade curse', source: 'Hexblade', active: true, uses: 1, recovery: 'short', action: 'B', duration: '1 min', desc: '+PRO damage, crit 19+, regain CHA+lvl hp', from: { file: 'class-warlock', list: 'subclassFeature', name: "Hexblade's Curse", source: 'XGE' } },
  { key: 'elvenLineageI', name: 'Elven Lineage I', source: 'High Elf', active: true, uses: 1, recovery: 'long', action: '', duration: '', desc: 'Detect Magic for free', from: { file: 'races', name: 'Elf', source: 'XPHB', entry: 'Elven Lineage' } },
  { key: 'elvenLineageII', name: 'Elven Lineage II', source: 'High Elf', active: true, uses: 1, recovery: 'long', action: '', duration: '', desc: 'Misty Step for free', from: { file: 'races', name: 'Elf', source: 'XPHB', entry: 'Elven Lineage' } },

  { key: 'sorceryIncarnate', name: 'Sorc incarnate', source: 'Sorcerer', active: false, desc: 'Spend 2 SP: regain innate sorcery', from: { file: 'class-sorcerer', list: 'classFeature', name: 'Sorcery Incarnate', source: 'XPHB' } },
  { key: 'devilsSight', name: "Devil's sight", source: 'Warlock', active: false, desc: 'Darkvision 120 ft, see darkness', from: { file: 'optionalfeatures', name: "Devil's Sight", source: 'PHB' } },
  { key: 'repellingBlast', name: 'Repelling blast', source: 'Warlock', active: false, desc: 'Hit: push 10 feet straight away from you', from: { file: 'optionalfeatures', name: 'Repelling Blast', source: 'PHB' } },
  { key: 'agonisingBlast', name: 'Agonising blast', source: 'Warlock', active: false, desc: '+CHA damage', from: { file: 'optionalfeatures', name: 'Agonizing Blast', source: 'PHB' } },
  { key: 'wildSurge', name: 'Wild surge', source: 'Wild Magic', active: false, desc: 'Every spell slot: roll d20, 20 = roll surge', from: { file: 'class-sorcerer', list: 'subclassFeature', name: 'Wild Magic Surge', source: 'XPHB' } },
  { key: 'hexWarrior', name: 'Hex Warrior', source: 'Hexblade', active: false, desc: 'Linked weapon attacks with CHA', from: { file: 'class-warlock', list: 'subclassFeature', name: 'Hex Warrior', source: 'XGE' } },
  { key: 'trance', name: 'Trance', source: 'Elf', active: false, desc: 'Sleep 4h, conscious', from: { file: 'races', name: 'Elf', source: 'XPHB', entry: 'Trance' } },
  { key: 'feyAncestry', name: 'Fey Ancestry', source: 'Elf', active: false, desc: 'Advantage vs Charm', from: { file: 'races', name: 'Elf', source: 'XPHB', entry: 'Fey Ancestry' } },
  { key: 'elvenAccuracy', name: 'Elven Accuracy', source: 'Feat', active: false, desc: 'Attacks roll 3d20 on advantage', from: { file: 'feats', name: 'Elven Accuracy' } },

  /* The bard of the second character: the 2024 class, the college of
     creation of 2022, and the three feats of the sheet. */
  { key: 'bardicInspiration', name: 'Bardic inspiration', source: 'Bard', preset: 'bard', active: true, uses: 5, recovery: 'short', action: 'B', duration: '1 hour', desc: 'd10 die, CHA mod uses, short rest', from: { file: 'class-bard', list: 'classFeature', name: 'Bardic Inspiration', source: 'XPHB' } },
  { key: 'fontOfInspiration', name: 'Font of inspiration', source: 'Bard', preset: 'bard', active: false, desc: 'A slot buys an inspiration back', from: { file: 'class-bard', list: 'classFeature', name: 'Font of Inspiration', source: 'XPHB' } },
  { key: 'jackOfAllTrades', name: 'Jack of all trades', source: 'Bard', preset: 'bard', active: false, desc: 'Half the proficiency on the checks you lack', from: { file: 'class-bard', list: 'classFeature', name: 'Jack of All Trades', source: 'XPHB' } },
  { key: 'expertise', name: 'Expertise', source: 'Bard', preset: 'bard', active: false, desc: 'Four skills carry double proficiency', from: { file: 'class-bard', list: 'classFeature', name: 'Expertise', source: 'XPHB' } },
  { key: 'countercharm', name: 'Countercharm', source: 'Bard', preset: 'bard', active: false, recovery: 'passive', action: 'R', desc: 'Reroll a charm or fear save, with advantage', from: { file: 'class-bard', list: 'classFeature', name: 'Countercharm', source: 'XPHB' } },
  { key: 'magicalSecrets', name: 'Magical secrets', source: 'Bard', preset: 'bard', active: false, desc: 'Any list can fill the new prepared spells', from: { file: 'class-bard', list: 'classFeature', name: 'Magical Secrets', source: 'XPHB' } },
  { key: 'moteOfPotential', name: 'Mote of potential', source: 'Creation', preset: 'bard', active: false, recovery: 'passive', desc: 'The inspiration die does one more thing', from: { file: 'class-bard', list: 'subclassFeature', name: 'Mote of Potential', source: 'TCE' } },
  { key: 'performanceOfCreation', name: 'Performance of creation', source: 'Creation', preset: 'bard', active: true, uses: 1, recovery: 'long', action: 'A', desc: 'Create one item, 20 gp a bard level', from: { file: 'class-bard', list: 'subclassFeature', name: 'Performance of Creation', source: 'TCE' } },
  { key: 'animatingPerformance', name: 'Animating performance', source: 'Creation', preset: 'bard', active: true, uses: 1, recovery: 'long', action: 'A', desc: 'An item walks as a dancing item, one hour', from: { file: 'class-bard', list: 'subclassFeature', name: 'Animating Performance', source: 'TCE' } },
  { key: 'musician', name: 'Musician', source: 'Feat', preset: 'bard', active: false, desc: 'Three instruments, a song that inspires', from: { file: 'feats', name: 'Musician' } },
  { key: 'conjurationAdept', name: 'Conjuration adept', source: 'Feat', preset: 'bard', active: false, desc: 'Conjuration spells always prepared', from: { file: 'feats', name: 'Conjuration Adept' } },
  { key: 'abjurationAdept', name: 'Abjuration adept', source: 'Feat', preset: 'bard', active: false, desc: 'Abjuration spells always prepared, a ward', from: { file: 'feats', name: 'Abjuration Adept' } }
];

function classFile(name) {
  return JSON.parse(readFileSync(download(BASE + 'class/class-' + name + '.json', 'class-' + name + '.json'), 'utf8'));
}

/* ---- where a thing comes from ---- */

/* The book and the page of a piece of the book, so a reader can look it up:
   "Source: AU, page 28". */
function refOf(record) {
  if (!record || !record.source) return null;
  /* A thing the book does not page still names its book, and the page is
     zero until one is known. */
  return { book: String(record.source), page: Number(record.page) || 0 };
}

const ABILITY_WORDS = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma'
};

/* A list of words the way a sentence writes one: "Intelligence, Wisdom, or
   Charisma". */
function words(list) {
  const out = [].concat(list || []).filter(Boolean);
  if (out.length < 2) return out.join('');
  return out.slice(0, -1).join(', ') + ', or ' + out[out.length - 1];
}

/* The name a reference writes, without the book it points at. */
function refName(text) {
  return String(text || '').split('|')[0].trim();
}

/* The kind of feat, as the 2024 books write it. */
const FEAT_CATEGORY = {
  G: 'General Feat',
  O: 'Origin Feat',
  FS: 'Fighting Style Feat',
  'FS:P': 'Fighting Style Feat',
  'FS:R': 'Fighting Style Feat',
  EB: 'Epic Boon Feat',
  D: 'Dragonmark Feat',
  DG: 'Dragonmark Feat'
};

/* The prerequisites of a feat, in the order the book writes them. A shape
   this reader does not know is left out rather than guessed at. */
function prerequisiteText(list) {
  const parts = [];
  [].concat(list || []).forEach((p) => {
    if (!p || typeof p !== 'object') return;
    if (p.level !== undefined) parts.push('Level ' + p.level + '+');
    if (p.ability) {
      [].concat(p.ability).forEach((a) => Object.keys(a || {}).forEach((k) => {
        if (ABILITY_WORDS[k]) parts.push(ABILITY_WORDS[k] + ' ' + a[k] + '+');
      }));
    }
    if (p.spellcasting2020) parts.push('Spellcasting or Pact Magic Feature');
    if (p.spellcastingFeature || p.spellcasting) parts.push('Spellcasting Feature');
    if (p.other) parts.push(String(p.other));
    if (p.otherSummary && p.otherSummary.entry) parts.push(String(p.otherSummary.entry));
    if (p.feat) parts.push(words([].concat(p.feat).map(refName)));
    if (p.race) parts.push(words([].concat(p.race).map((r) => refName(r && r.name))));
    if (p.background) parts.push(words([].concat(p.background).map((b) => clean((b && b.displayEntry) || (b && b.name) || ''))));
    if (p.feature) parts.push(words([].concat(p.feature).map(refName)));
  });
  return parts.filter(Boolean).join('; ');
}

/* The line a feat opens on: "General Feat (Prerequisites: Level 4+;
   Spellcasting or Pact Magic Feature)". */
function featHead(record) {
  const bits = [];
  const kind = FEAT_CATEGORY[String(record.category || '')];
  const pre = prerequisiteText(record.prerequisite);
  if (kind) bits.push(kind);
  if (pre) bits.push('(Prerequisites: ' + pre + ')');
  return bits.join(' ');
}

/* What the ability score increase of a feat says, as the book writes it. */
function abilityText(list) {
  const out = [];
  [].concat(list || []).forEach((a) => {
    if (!a || typeof a !== 'object') return;
    /* A hidden part is a rule the book writes in its own text already, so
       it is not read twice. */
    if (a.hidden) return;
    if (a.choose && a.choose.from && a.choose.from.length) {
      out.push('Increase your ' + words(a.choose.from.map((k) => ABILITY_WORDS[k] || k)) +
        ' by ' + (Number(a.choose.amount) || 1) + ', to a maximum of 20.');
      return;
    }
    Object.keys(a).forEach((k) => {
      if (ABILITY_WORDS[k]) out.push('Increase your ' + ABILITY_WORDS[k] + ' by ' + a[k] + ', to a maximum of 20.');
    });
  });
  return out.join(' ');
}

/* The record a feature spec points at, so its text, its book and its page
   come from the one place. */
function featureRecord(spec) {
  if (spec.file === 'class-sorcerer' || spec.file === 'class-warlock' || spec.file === 'class-bard') {
    const data = spec.file === 'class-sorcerer' ? classData : classFile(spec.file.slice(6));
    const list = data[spec.list] || [];
    return list.find((f) => f.name === spec.name && f.source === spec.source) || null;
  }
  if (spec.file === 'races') {
    const races = JSON.parse(readFileSync(download(BASE + 'races.json', 'races.json'), 'utf8'));
    const race = (races.race || []).find((r) => r.name === spec.name && r.source === spec.source);
    if (!race) return null;
    if (!spec.entry) return race;
    let found = null;
    const walk = (n) => {
      if (found) return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n && typeof n === 'object') {
        if (n.name === spec.entry && n.type === 'entries') { found = n.entries; return; }
        for (const k of Object.keys(n)) walk(n[k]);
      }
    };
    walk(race.entries);
    return found ? { entries: found, source: race.source, page: race.page } : null;
  }
  if (spec.file === 'feats') {
    const feats = JSON.parse(readFileSync(download(BASE + 'feats.json', 'feats.json'), 'utf8'));
    return (feats.feat || []).find((f) => f.name === spec.name) || null;
  }
  if (spec.file === 'optionalfeatures') {
    const opt = JSON.parse(readFileSync(download(BASE + 'optionalfeatures.json', 'optionalfeatures.json'), 'utf8'));
    return (opt.optionalfeature || []).find((f) => f.name === spec.name && f.source === spec.source) || null;
  }
  return null;
}

const featureList = [];
for (const spec of FEATURE_SPECS) {
  const record = featureRecord(spec.from);
  const entries = record ? record.entries : null;
  if (!entries) { console.log('feature not found: ' + spec.name); continue; }
  /* A feat opens on its kind and what it asks of the player, and the ability
     score it raises is a paragraph of the book rather than one of its
     entries, so the two are read here and put in front of the text. */
  const blocks = [];
  if (spec.from.file === 'feats') {
    const head = featHead(record);
    if (head) blocks.push({ t: 'p', text: head });
    const ability = abilityText(record.ability);
    if (ability) blocks.push({ t: 'p', lead: 'Ability Score Increase.', text: ability });
  }
  blocks.push(...blocksFrom(entries));
  const feature = {
    key: spec.key,
    name: spec.name,
    source: spec.source,
    /* The book and the page it sits on, so a reader can look it up. */
    ref: refOf(record),
    active: !!spec.active,
    uses: spec.uses || 0,
    recovery: spec.recovery || 'passive',
    cost: spec.cost || '',
    hidden: !!spec.hidden,
    action: spec.action || '',
    duration: spec.duration || '',
    desc: spec.desc || '',
    /* A feature that names a creature brings it to the table. */
    creatures: creatureNames(entries),
    summons: creatureNames(entries).length > 0,
    blocks: blocks
  };
  /* A feature that belongs to a ready-made character says which one it
     waits for; the rest seed a new character. */
  if (spec.preset) feature.preset = spec.preset;
  else feature.seed = true;
  featureList.push(feature);
}

writeFileSync(
  resolve(root, 'data', 'features.json'),
  JSON.stringify({
    edition: "The features of the app's own character and of the ready-made bard, with the long text from 5e.tools",
    source: 'https://5e.tools',
    fetched: new Date().toISOString().slice(0, 10),
    features: featureList
  }, null, 2) + '\n',
  'utf8'
);
console.log('wrote ' + featureList.length + ' features');

/* ---------- the classes ---------- */

/* The twelve classes of the 2024 handbook, each with how it casts, the die
   it rolls for hit points, the saves it grants, and every subclass that is
   not a reprint of one of them. The multiclass rules and the ready-made
   characters read this file. */
/* The proficiencies of a class, in words: the armour (light, medium,
   heavy, shield), the weapons, the tools, and the skills to choose from. */
function proficienciesOf(p) {
  const words = (list) => [].concat(list || []).map((x) => clean(typeof x === 'string' ? x : (x && x.full) || '')).filter(Boolean);
  const out = { armour: words(p && p.armor), weapons: words(p && p.weapons), tools: words(p && p.tools), skills: null };
  const choose = p && [].concat(p.skills || []).map((s) => s && s.choose).filter(Boolean)[0];
  if (choose) out.skills = { choose: Number(choose.count) || 1, from: (choose.from || []).map((x) => clean(String(x))) };
  else if (p && p.skills) {
    const any = [].concat(p.skills).map((s) => s && s.any).filter(Boolean)[0];
    if (any) out.skills = { choose: Number(any) || 1, from: ['any'] };
  }
  return out;
}

const CLASS_NAMES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
const CASTER = { 'full': 'full', '1/2': 'half', '1/3': 'third', 'pact': 'pact', 'artificer': 'artificer' };
const classes = [];
for (const name of CLASS_NAMES) {
  const file = 'class-' + name.toLowerCase() + '.json';
  const data = JSON.parse(readFileSync(download(BASE + 'class/class-' + name.toLowerCase() + '.json', file), 'utf8'));
  const list = data.class || [];
  const cls = list.find((c) => c.source === 'XPHB') || list.find((c) => !c.reprintedAs) || list[0];
  if (!cls) { console.log('class not found: ' + name); continue; }
  /* The newest printing of each archetype. A subclass that carries the
     marker of a reprint is an old one, and so is any copy that shares its
     short name, since 5e.tools keeps an unmarked alias of it beside the
     marked one. When two remain under the same short name the 2024 printing
     wins. */
  const everySub = (data.subclass || []).filter((s) => s.className === name);
  const deadShort = {}, liveSource = {};
  everySub.forEach((s) => {
    if (!s.reprintedAs) return;
    const bits = String(s.reprintedAs[0] || '').split('|');
    const oldShort = String(s.shortName || s.name).toLowerCase();
    const newShort = String(bits[0] || '').toLowerCase();
    /* a reprint under a new name kills the old name, a reprint under the
       same name keeps only the printing it points at */
    if (!newShort || newShort === oldShort) liveSource[oldShort] = bits[2] || 'XPHB';
    else deadShort[oldShort] = true;
  });
  const subs = everySub
    .filter((s) => {
      const short = String(s.shortName || s.name).toLowerCase();
      if (deadShort[short] || s.reprintedAs) return false;
      if (liveSource[short]) return s.source === liveSource[short];
      return true;
    })
    .sort((a, b) => (b.source === 'XPHB' ? 1 : 0) - (a.source === 'XPHB' ? 1 : 0))
    .filter((s, i, list) => list.findIndex((x) => (x.shortName || x.name) === (s.shortName || s.name)) === i)
    .map((s) => ({ name: s.name, short: s.shortName || s.name, source: s.source }))
    .sort((a, b) => a.name.localeCompare(b.name));
  classes.push({
    name: name,
    source: cls.source,
    ability: cls.spellcastingAbility || '',
    caster: CASTER[cls.casterProgression] || '',
    /* How many spells the class prepares at each level, one entry per level
       from one to twenty. A class that prepares none carries an empty list. */
    prepared: cls.preparedSpellsProgression || [],
    hd: cls.hd ? cls.hd.faces : 8,
    saves: cls.proficiency || [],
    /* What the class is trained in at level 1, and what it gives a
       character that takes it as a second class: armour, weapons, tools,
       and the skills it lets choose. */
    proficiencies: proficienciesOf(cls.startingProficiencies),
    multiclass: proficienciesOf((cls.multiclassing || {}).proficienciesGained),
    subclassTitle: cls.subclassTitle || '',
    subclasses: subs
  });
}
writeFileSync(
  resolve(root, 'data', 'classes.json'),
  JSON.stringify({
    edition: "The 2024 Player's Handbook classes, with every subclass that is not a reprint",
    source: 'https://5e.tools/classes.html',
    fetched: new Date().toISOString().slice(0, 10),
    classes: classes
  }, null, 2) + '\n',
  'utf8'
);
console.log('wrote ' + classes.length + ' classes and ' + classes.reduce((n, c) => n + c.subclasses.length, 0) + ' subclasses');

/* ---------- the library of features ---------- */

/* Every class and subclass feature of the twelve classes and their newest
   archetypes: the blocks a skeleton is built from. The curated table above
   keeps its own keys and its own words beside them. */

function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const SKIP = /^(ability score improvement|subclass feature|epic boon|.* versatility)$/;
const takenKeys = {};
featureList.forEach((f) => { takenKeys[f.key] = true; });

const library = [];
for (const c of classes) {
  const data = JSON.parse(readFileSync(resolve(cache, 'class-' + c.name.toLowerCase() + '.json'), 'utf8'));
  const add = (name, sub, level, entries, record) => {
    const clean = String(name || '').trim();
    if (!clean || SKIP.test(clean.toLowerCase())) return;
    /* A feature of the curated table is not one of a class: it keeps its
       own key, and the class keeps its own entry beside it. Skipping by
       the name alone took Expertise from every class, and Bardic
       Inspiration from every bard. */
    const blocks = blocksFrom(entries);
    if (!blocks.length) return;                 /* a reference with no text of its own */
    const key = slug(c.name) + (sub ? '-' + slug(sub) : '') + '-' + (level || 0) + '-' + slug(clean);
    if (takenKeys[key]) return;
    takenKeys[key] = true;
    library.push({
      key: key,
      name: clean,
      source: sub || c.name,
      ref: refOf(record),
      class: c.name,
      subclass: sub || '',
      level: Number(level) || 0,
      active: false,
      uses: 0,
      recovery: 'passive',
      cost: '',
      hidden: false,
      action: '',
      duration: '',
      desc: '',
      /* A feature that names a creature brings it to the table. */
      creatures: creatureNames(entries),
      blocks: blocks
    });
    library[library.length - 1].summons = library[library.length - 1].creatures.length > 0;
  };
  (data.classFeature || [])
    .filter((f) => f.className === c.name && f.classSource === 'XPHB' && f.source === 'XPHB')
    .forEach((f) => add(f.name, '', f.level, f.entries, f));
  c.subclasses.forEach((s) => {
    (data.subclassFeature || [])
      .filter((f) => f.subclassShortName === s.short && f.subclassSource === s.source)
      .forEach((f) => add(f.name, s.short, f.level, f.entries, f));
  });
}
featureList.push.apply(featureList, library);

writeFileSync(
  resolve(root, 'data', 'features.json'),
  JSON.stringify({
    edition: "The character's own table of 2026-10-22, then every feature of the 2024 classes and their newest archetypes, the long text from 5e.tools",
    source: 'https://5e.tools',
    fetched: new Date().toISOString().slice(0, 10),
    features: featureList
  }, null, 2) + '\n',
  'utf8'
);
console.log('wrote ' + featureList.length + ' features (the library adds ' + library.length + ')');

const byLevel = {};
for (const s of seed) (byLevel[s.level] = byLevel[s.level] || []).push(s.name + ' (' + s.source + ')');
for (const lv of Object.keys(byLevel).sort((a, b) => a - b)) console.log('level ' + lv + ': ' + byLevel[lv].join(', '));
console.log('wrote ' + spells.length + ' spells, ' + seed.length + ' of them on the sheet');

/* ---------- the bestiary ---------- */

/* The books of monsters come down with the rest of the data. The app only
   carries the blocks its own text names, and the machine that serves it
   holds the rest. */
for (const book of BOOKS) download(BASE + 'bestiary/bestiary-' + book + '.json', 'bestiary-' + book + '.json');

const all = loadBestiary(cache);

/* Every creature the app names: the spells of the book and the features of
   the library. */
const wanted = {};
const wantedBy = (name) => {
  const key = String(name).toLowerCase();
  if (!wanted[key]) wanted[key] = { name: name, source: creatureSources[name] || '' };
};
spells.forEach((s) => (s.creatures || []).forEach(wantedBy));
featureList.forEach((f) => (f.creatures || []).forEach(wantedBy));

const creatures = {};
const missing = [];
Object.keys(wanted).forEach((key) => {
  const want = wanted[key];
  const item = resolveCreature(all, want.name, want.source);
  if (!item) { missing.push(want.name); return; }
  creatures[key] = creatureRecord(item);
});

writeFileSync(
  resolve(root, 'data', 'bestiary.json'),
  JSON.stringify({
    edition: "The stat blocks the app names, from the bestiary of 5e.tools",
    source: 'https://5e.tools/bestiary.html',
    fetched: new Date().toISOString().slice(0, 10),
    creatures: creatures
  }, null, 2) + '\n',
  'utf8'
);
console.log('wrote ' + Object.keys(creatures).length + ' creatures' + (missing.length ? ', and missed ' + missing.join(', ') : ''));

/* ---------- the catalogue of feats ---------- */

/* The books of the feats the repository reads: the spells it fetches, the
   classes it fetches, the races and the optional features it reads. A feat
   of a book the app does not know is a feat the app cannot offer, so the
   catalogue holds the books the app already has. */
function booksRead() {
  const out = {};
  const add = (name) => { if (name) out[String(name)] = true; };
  Object.keys(bySource).forEach(add);
  CLASS_NAMES.forEach((name) => {
    const data = classFile(name.toLowerCase());
    ['classFeature', 'subclassFeature'].forEach((list) => {
      (data[list] || []).forEach((f) => add(f.source));
    });
  });
  const races = JSON.parse(readFileSync(download(BASE + 'races.json', 'races.json'), 'utf8'));
  (races.race || []).forEach((r) => add(r.source));
  const opt = JSON.parse(readFileSync(download(BASE + 'optionalfeatures.json', 'optionalfeatures.json'), 'utf8'));
  (opt.optionalfeature || []).forEach((f) => add(f.source));
  return out;
}

const knownBooks = booksRead();
const featBook = JSON.parse(readFileSync(download(BASE + 'feats.json', 'feats.json'), 'utf8'));

/* A feat that carries the mark of a reprint is the older printing, and the
   printing it points at is the one that stands: the feats the 2014
   handbook wrote and the 2024 handbook reprinted are read from the 2024
   handbook. */
const feats = (featBook.feat || [])
  .filter((f) => !(f.reprintedAs || []).length)
  .filter((f) => knownBooks[f.source]);

/* The 2024 handbook first, the other books after it, and the feats of a book
   in the order of their names. */
const FEAT_FIRST = ['XPHB'];
const bookRank = (source) => {
  const at = FEAT_FIRST.indexOf(source);
  return at < 0 ? FEAT_FIRST.length : at;
};
feats.sort((a, b) => bookRank(a.source) - bookRank(b.source) ||
  String(a.source).localeCompare(String(b.source)) || a.name.localeCompare(b.name));

const catalogue = feats.map((f) => {
  const blocks = [];
  /* The ability score a feat raises is a rule of the book and not one of
     its entries, so it is read here and put in front of the text. */
  const ability = abilityText(f.ability);
  if (ability) blocks.push({ t: 'p', lead: 'Ability Score Increase.', text: ability });
  blocks.push(...blocksFrom(f.entries));
  return {
    name: f.name,
    source: f.source,
    /* The kind of the feat, in the words of the book. A book that names no
       kind for its feats leaves it empty. */
    category: FEAT_CATEGORY[String(f.category || '')] || '',
    prerequisite: prerequisiteText(f.prerequisite),
    head: featHead(f),
    blocks: blocks,
    /* The book and the page it sits on, so a reader can look it up. */
    ref: refOf(f)
  };
});

const featSources = [];
feats.forEach((f) => { if (featSources.indexOf(f.source) < 0) featSources.push(f.source); });

writeFileSync(
  resolve(root, 'data', 'feats.json'),
  JSON.stringify({
    edition: 'The feats of the books this app reads, the 2024 handbook first: ' + featSources.join(', '),
    source: 'https://5e.tools/feats.html',
    fetched: new Date().toISOString().slice(0, 10),
    feats: catalogue
  }, null, 2) + '\n',
  'utf8'
);
console.log('wrote ' + catalogue.length + ' feats of ' + featSources.length + ' books (' + featSources.join(', ') + ')');

/* ---------- the weapons ---------- */

/* The weapons of the books this app reads, the 2024 handbook first. The
   app has never carried a weapon's damage, so it is read from the book's
   own table rather than guessed at: the die and the kind of damage, the
   property words, the mastery, and the text of a weapon that carries one. */
const DAMAGE_WORD = { B: 'bludgeoning', P: 'piercing', S: 'slashing' };

const itemBook = JSON.parse(readFileSync(download(BASE + 'items-base.json', 'items-base.json'), 'utf8'));

/* A weapon is a melee or a ranged item, and the table writes both kinds on
   the page of the book it comes from. */
function isWeapon(item) { return /^[MR](\||$)/.test(String(item.type || '')); }

/* The word a property entry carries: the book names it in the entry it
   opens on. */
function propertyName(entry) {
  if (!entry) return '';
  const named = [].concat(entry.entries || []).find((e) => e && e.name);
  return String((named && named.name) || entry.name || '').trim();
}

/* The property of a weapon as the book writes it: its reference names the
   entry, and a reference that carries a note keeps it. A property the book
   of this printing does not carry is left out rather than guessed at. */
function propertyWords(item) {
  const out = [];
  [].concat(item.property || []).forEach((p) => {
    const code = typeof p === 'string' ? p : (p && p.uid) || '';
    const bits = String(code).split('|');
    const abbr = bits[0], src = bits[1] || item.source;
    const list = itemBook.itemProperty || [];
    const entry = list.find((x) => x.abbreviation === abbr && x.source === src) ||
      list.find((x) => x.abbreviation === abbr && x.source === item.source);
    const name = propertyName(entry);
    if (!name) return;
    out.push(name + (p && p.note ? ' (' + p.note + ')' : ''));
  });
  return out;
}

/* The mastery of a weapon, named the way the table names it. */
function masteryWord(item) {
  const m = [].concat(item.mastery || [])[0];
  const code = typeof m === 'string' ? m : (m && m.uid) || '';
  return String(code).split('|')[0];
}

/* The kind of weapon the table names: a melee or a ranged weapon. */
function kindWord(item) {
  const bits = String(item.type || '').split('|');
  const list = itemBook.itemType || [];
  const entry = list.find((x) => x.abbreviation === bits[0] && x.source === (bits[1] || item.source)) ||
    list.find((x) => x.abbreviation === bits[0] && x.source === item.source);
  return entry ? String(entry.name || '') : '';
}

/* A weapon that carries the mark of a reprint is the older printing, and
   the printing it points at is the one that stands: the 2014 handbook's
   table is not offered beside the 2024 one. */
const weaponSourcesSeen = (item) => !(item.reprintedAs || []).length && !!knownBooks[item.source];
const weapons = (itemBook.baseitem || [])
  .filter(isWeapon)
  .filter(weaponSourcesSeen)
  .map((w) => ({
    name: w.name,
    source: w.source,
    category: w.weaponCategory || '',
    kind: kindWord(w),
    damage: w.dmg1 || '',
    damageType: DAMAGE_WORD[String(w.dmgType || '')] || '',
    properties: propertyWords(w),
    mastery: masteryWord(w),
    /* The book and the page it sits on, so a reader can look it up. */
    ref: refOf(w),
    blocks: blocksFrom(w.entries)
  }));

/* The 2024 handbook first, the other books after it, and the weapons of a
   book in the order of their names. */
const WEAPON_FIRST = ['XPHB'];
const weaponRank = (source) => {
  const at = WEAPON_FIRST.indexOf(source);
  return at < 0 ? WEAPON_FIRST.length : at;
};
weapons.sort((a, b) => weaponRank(a.source) - weaponRank(b.source) ||
  String(a.source).localeCompare(String(b.source)) || a.name.localeCompare(b.name));

const weaponSources = [];
weapons.forEach((w) => { if (weaponSources.indexOf(w.source) < 0) weaponSources.push(w.source); });

writeFileSync(
  resolve(root, 'data', 'weapons.json'),
  JSON.stringify({
    edition: 'The weapons of the books this app reads, the 2024 handbook first: ' + weaponSources.join(', '),
    source: 'https://5e.tools/items.html',
    fetched: new Date().toISOString().slice(0, 10),
    weapons: weapons
  }, null, 2) + '\n',
  'utf8'
);
console.log('wrote ' + weapons.length + ' weapons of ' + weaponSources.length + ' books (' + weaponSources.join(', ') + ')');

/* ---------- the gear ---------- */

/* The armour and the magic items of the books this app reads. The armour
   gives an armour class, the dexterity that reaches it, the strength it
   asks for and the note it leaves on a stealth check. The magic items
   carry the one bonus Mandal allows: to the armour class, or to the attack
   and the damage of a weapon. Nothing else about them is kept. */
const itemList = JSON.parse(readFileSync(download(BASE + 'items.json', 'items.json'), 'utf8')).item || [];

/* The books of the gear: the books the app reads, and the printing their
   items are reprinted in, because the newer printing is the one that
   stands. The magic items of the 2024 handbook live in the 2024 Dungeon
   Master's Guide, which the 2014 one points at. */
function gearBooks() {
  const out = Object.assign({}, knownBooks);
  const mark = (list) => list.forEach((item) => {
    if (!out[item.source]) return;
    (item.reprintedAs || []).forEach((r) => {
      const uid = typeof r === 'string' ? r : (r && r.uid) || '';
      const bits = String(uid).split('|');
      if (bits[1]) out[bits[1]] = true;
    });
  });
  mark(itemBook.baseitem || []);
  mark(itemList);
  return out;
}
const gearBook = gearBooks();

/* The kind of armour the table names: a light armour, a medium one, a
   heavy one, or a shield. */
const ARMOUR_KIND = { LA: 'light', MA: 'medium', HA: 'heavy', S: 'shield' };
function armourKind(item) { return ARMOUR_KIND[String(item.type || '').split('|')[0]] || ''; }

/* The dexterity that reaches the armour class, as the handbook's equipment
   table writes it: a light armour takes the whole modifier, a medium one
   takes it up to two, a heavy one ignores it. */
const DEX_OF_KIND = { light: 'full', medium: 'two', heavy: 'none', shield: 'none' };

/* The bonus the book writes: "+1" is one. */
function bonusNumber(text) {
  const n = Number(String(text === undefined || text === null ? '' : text).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}

/* An item that carries the mark of a reprint is the older printing, and the
   printing it points at is the one that stands. */
const gearSeen = (item) => !(item.reprintedAs || []).length && !!gearBook[item.source];

/* The text of an item. Some items keep their text in a shared entry and
   point at it, and the shared text holds the values of the item in its
   placeholders: the dragon scale mail is written once for the seven
   dragons, and each one names its own colour and its own resistance. */
function itemEntries(item) {
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
        const shared = (itemBook.itemEntry || []).find((e) => e.name === bits[0] && e.source === (bits[1] || item.source));
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

/* The armour: the base table of the books and the magic armour of the same
   books, each with the class it gives and the dexterity that reaches it. */
const armour = []
  .concat((itemBook.baseitem || []).filter((i) => armourKind(i)))
  .concat(itemList.filter((i) => armourKind(i)))
  .filter(gearSeen)
  .map((i) => ({
    name: i.name,
    source: i.source,
    category: armourKind(i),
    ac: Number(i.ac) || 0,
    dex: DEX_OF_KIND[armourKind(i)],
    /* The strength it asks for, and the note it leaves on a stealth check,
       when the book writes them. */
    strength: i.strength === undefined ? undefined : Number(i.strength) || 0,
    stealth: i.stealth,
    /* A magic armour adds to the class it gives. */
    acBonus: i.bonusAc === undefined ? undefined : bonusNumber(i.bonusAc),
    /* The book and the page it sits on, so a reader can look it up. */
    ref: refOf(i),
    blocks: blocksFrom(itemEntries(i))
  }));

/* What a magic item does to the sheet, in the sheet language: the armour
   class, the saving throws, the spell attack and save DC, the speed. A
   weapon's own bonus is its attackBonus and damageBonus, read by the attack
   page, so it is not written here twice. */
function effectOfItem(i) {
  const out = [];
  const add = (target, raw) => {
    const n = bonusNumber(raw);
    if (n) out.push(target + (n > 0 ? ' + ' + n : ' - ' + (-n)));
  };
  if (i.bonusAc !== undefined) add('AC', i.bonusAc);
  if (i.bonusSavingThrow !== undefined) add('save.all', i.bonusSavingThrow);
  if (i.bonusSpellAttack !== undefined) add('spellAttack', i.bonusSpellAttack);
  if (i.bonusSpellSaveDc !== undefined) add('spellDC', i.bonusSpellSaveDc);
  const speed = i.modifySpeed && i.modifySpeed.bonus;
  if (speed && (speed['*'] !== undefined || speed.walk !== undefined)) add('speed', speed['*'] !== undefined ? speed['*'] : speed.walk);
  return out.join('; ');
}

/* The magic items that alter the sheet: a bonus to the armour class, the
   saving throws or the spells, or a bonus to the attack and the damage of
   a weapon. The armour is in its own list, so it is not here twice. */
const magic = itemList
  .filter((i) => !armourKind(i))
  .filter(gearSeen)
  .map((i) => ({
    name: i.name,
    source: i.source,
    kind: kindWord(i),
    acBonus: i.bonusAc === undefined ? undefined : bonusNumber(i.bonusAc),
    attackBonus: i.bonusWeaponAttack !== undefined ? bonusNumber(i.bonusWeaponAttack)
      : (i.bonusWeapon === undefined ? undefined : bonusNumber(i.bonusWeapon)),
    damageBonus: i.bonusWeaponDamage !== undefined ? bonusNumber(i.bonusWeaponDamage)
      : (i.bonusWeapon === undefined ? undefined : bonusNumber(i.bonusWeapon)),
    effect: effectOfItem(i) || undefined,
    /* The book and the page it sits on, so a reader can look it up. */
    ref: refOf(i),
    blocks: blocksFrom(itemEntries(i))
  }))
  .filter((i) => i.acBonus !== undefined || i.attackBonus !== undefined || i.damageBonus !== undefined || i.effect);

/* The 2024 handbook first, the other books after it, and the gear of a book
   in the order of their names. */
const GEAR_FIRST = ['XPHB'];
const gearRank = (source) => {
  const at = GEAR_FIRST.indexOf(source);
  return at < 0 ? GEAR_FIRST.length : at;
};
const gearOrder = (a, b) => gearRank(a.source) - gearRank(b.source) ||
  String(a.source).localeCompare(String(b.source)) || a.name.localeCompare(b.name);
armour.sort(gearOrder);
magic.sort(gearOrder);

const gearSources = [];
armour.concat(magic).forEach((g) => { if (gearSources.indexOf(g.source) < 0) gearSources.push(g.source); });

writeFileSync(
  resolve(root, 'data', 'gear.json'),
  JSON.stringify({
    edition: 'The armour of the books this app reads and the magic items that alter the sheet, the 2024 handbook first: ' + gearSources.join(', '),
    source: 'https://5e.tools/items.html',
    fetched: new Date().toISOString().slice(0, 10),
    armour: armour,
    magic: magic
  }, null, 2) + '\n',
  'utf8'
);
console.log('wrote ' + armour.length + ' pieces of armour and ' + magic.length + ' magic items of ' + gearSources.length + ' books (' + gearSources.join(', ') + ')');

/* ---------- the species ---------- */

/* The species of the 2024 handbook, with their traits and the choice each
   asks for, written by their own module so it runs alone on the cache too. */
download(BASE + 'races.json', 'races.json');
console.log('wrote ' + writeSpecies(cache).length + ' species');
