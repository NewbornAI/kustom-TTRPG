/**
 * The stat blocks of the bestiary.
 *
 * The books come from 5e.tools and sit in the cache. The fetcher shapes the
 * creatures the app names into data/bestiary.json, and the server that
 * holds the whole bestiary shapes the others the same way, so a creature
 * looks the same wherever it comes from.
 *
 * A block may come in forms: the celestial spirit is an avenger or a
 * defender, the same creature with another armour class and another
 * attack. The forms are the versions of the block upstream, and the card
 * carries the one that was chosen.
 *
 * The numbers the book writes as words are read here too: the armour class
 * of a spirit is the level of the calling spell, and the damage of an
 * attack grows with the slot that paid for it.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { creatureText, actionOf, termOf } from './markup.mjs';

/* The books, in the order a name without a book is looked up. The 2024
   handbook comes first, then the 2024 monsters, then the old ones. */
export const BOOKS = ['xphb', 'xmm', 'mm', 'au', 'tce', 'phb', 'xge', 'ftd', 'skt', 'mpmm', 'vgm', 'scc'];

/* Every monster of every book, by the lowercased name. A name can sit in
   more than one book, so the entry holds them all. */
export function loadBestiary(cacheDir) {
  const all = {};
  BOOKS.forEach((book) => {
    const file = resolve(cacheDir, 'bestiary-' + book + '.json');
    if (!existsSync(file)) return;
    const json = JSON.parse(readFileSync(file, 'utf8'));
    (json.monster || []).forEach((m) => {
      const key = String(m.name || '').toLowerCase();
      if (!key) return;
      if (!all[key]) all[key] = [];
      all[key].push({ name: m.name, source: m.source || book.toUpperCase(), cr: m.cr || '', entry: m });
    });
  });
  return all;
}

/* The block a reference names. The book of the reference wins when it says
   one, and the first of the name is taken otherwise. */
export function resolveCreature(all, name, source) {
  const key = String(name || '').toLowerCase();
  if (!key || !all[key]) return null;
  const list = all[key];
  if (source) {
    const want = String(source).toLowerCase();
    for (const item of list) {
      if (String(item.source).toLowerCase() === want) return item;
    }
  }
  return list[0];
}

/* ---- the numbers the book writes as words ---- */

/* The terms of a formula, in the order the book writes them. */
function termsOf(text) {
  const body = String(text || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .trim();
  if (!body) return null;
  if (body.indexOf(',') >= 0) return null;          /* a table of sizes */
  const parts = body.split(/\s+plus\s+|\s*\+\s*/i).map((p) => p.trim()).filter(Boolean);
  const terms = [];
  for (const part of parts) {
    const t = termOf(part);
    if (!t) return null;
    terms.push(t);
  }
  return terms.length ? terms : null;
}

/* The words in brackets at the end of a branch: "Brute only", "Air only". */
function qualifierOf(text) {
  const m = String(text || '').match(/\(([^)]*)\)\s*$/);
  return m ? m[1].trim() : '';
}

/* The formula of a number, with the branches it has: the block of the
   battle familiar says "30 (Brute only) or 20 (Flyer or Stalker only) + 5
   for each spell level above 2", and the tail belongs to both. */
export function parseFormula(text) {
  if (!text) return null;
  const raw = String(text).trim();
  const parts = splitOn(raw, /\s+or\s+/i);
  const branches = [];
  let tail = [];
  parts.forEach((part, ix) => {
    let body = part;
    if (parts.length > 1 && ix === parts.length - 1) {
      const cut = lastPlus(body);
      if (cut > 0) {
        const rest = termsOf(body.slice(cut));
        if (rest) { tail = rest; body = body.slice(0, cut); }
      }
    }
    const terms = termsOf(body);
    if (!terms) return;
    branches.push({ qualifier: qualifierOf(body), terms: terms.concat(tail) });
  });
  if (!branches.length) return null;
  return { text: raw, branches: branches };
}

/* The number of attacks of a multiattack, when the book counts them by the
   level of the calling spell. */
export function parseMultiattack(text) {
  if (/equal to half this spell'?s level/i.test(String(text || ''))) return { half: true };
  return null;
}

/* ---- the whole stat block ---- */

const ABILITY_NAMES = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma'
};

const SKILL_NAMES = {
  acrobatics: 'Acrobatics', 'animal handling': 'Animal Handling', arcana: 'Arcana',
  athletics: 'Athletics', deception: 'Deception', history: 'History',
  insight: 'Insight', intimidation: 'Intimidation', investigation: 'Investigation',
  medicine: 'Medicine', nature: 'Nature', perception: 'Perception',
  performance: 'Performance', persuasion: 'Persuasion', religion: 'Religion',
  'sleight of hand': 'Sleight of Hand', stealth: 'Stealth', survival: 'Survival'
};

const ALIGNMENTS = { G: 'Good', N: 'Neutral', E: 'Evil', U: 'Unaligned', A: 'Any alignment' };

/* The six abilities of the creature, with the names the book writes. */
function abilitiesOf(entry) {
  const out = [];
  ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach((k) => {
    if (typeof entry[k] === 'number') out.push({ name: ABILITY_NAMES[k], score: entry[k] });
  });
  return out.length ? out : null;
}

/* The name a skill is written with. */
function skillName(key) {
  const k = String(key || '').toLowerCase().replace(/_/g, ' ');
  if (SKILL_NAMES[k]) return SKILL_NAMES[k];
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/* The saving throws, the way the book writes them. */
function savesOf(entry) {
  const save = entry.save;
  if (!save || typeof save !== 'object') return null;
  const out = [];
  Object.keys(save).forEach((k) => {
    out.push({ key: k, name: ABILITY_NAMES[k] || skillName(k), value: String(save[k]) });
  });
  return out.length ? out : null;
}

/* The skills the creature has a gift for. */
function skillsOf(entry) {
  const skill = entry.skill;
  if (!skill || typeof skill !== 'object') return null;
  const out = [];
  Object.keys(skill).forEach((k) => {
    out.push({ name: skillName(k), value: String(skill[k]) });
  });
  return out.length ? out : null;
}

/* A list the book writes: the names, and the note that goes with them. The
   names and the notes carry tags like any other text (a sense says the
   darkness is magical, a vulnerability names a spell), so they are read
   through the same reader. */
function listOf(value, key) {
  if (!value) return null;
  const out = [];
  [].concat(value).forEach((item) => {
    if (typeof item === 'string') {
      const text = creatureText(item.trim());
      if (text) out.push({ text: text, note: '' });
      return;
    }
    if (!item || typeof item !== 'object') return;
    const names = [].concat(item[key] || []).map((x) => creatureText(String(x))).filter(Boolean);
    if (!names.length) return;
    out.push({ text: names.join(', '), note: item.note ? creatureText(String(item.note)) : '' });
  });
  return out.length ? out : null;
}

/* The senses of the creature. The passive Perception is a sense of its own:
   a hawk and a riding horse have no other one, and a block that read the
   list alone gave them none. */
function sensesOf(entry) {
  const out = listOf(entry.senses, 'senses') || [];
  if (typeof entry.passive === 'number') {
    out.push({ text: 'passive Perception ' + entry.passive, note: '' });
  }
  return out.length ? out : null;
}

/* The languages it speaks and understands. */
function languagesOf(entry) {
  const out = listOf(entry.languages, 'languages');
  return out ? out.map((l) => l.text).join(', ') : '';
}

/* The alignment, as the book writes it. */
function alignmentOf(entry) {
  const a = entry.alignment;
  if (typeof a === 'string') return ALIGNMENTS[a.toUpperCase()] || a;
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    if (a.special) return String(a.special);
    if (typeof a.type === 'string') return ALIGNMENTS[a.type.toUpperCase()] || a.type;
    return '';
  }
  const list = [].concat(a || []).filter(Boolean);
  if (!list.length) return '';
  return list.map((x) => ALIGNMENTS[String(x).toUpperCase()] || String(x)).join(' ');
}

/* The spellcasting of the creature, with the spells it knows. */
function spellcastingOf(value) {
  const out = [];
  [].concat(value || []).forEach((s) => {
    if (!s || typeof s !== 'object') return;
    const header = (s.headerEntries || []).map((e) => (typeof e === 'string' ? e : '')).join(' ');
    const will = (s.will || []).map((e) => (typeof e === 'string' ? e : '')).join(', ');
    const daily = [];
    Object.keys(s.daily || {}).forEach((k) => {
      const spells = (s.daily[k] || []).map((e) => (typeof e === 'string' ? e : '')).join(', ');
      if (!spells) return;
      const times = /e$/.test(k) ? 'each day' : k + '/day';
      daily.push(times + ': ' + spells);
    });
    const body = [will ? 'At will: ' + will : '', daily.join('. ')].filter(Boolean).join('. ');
    out.push({ name: creatureText(s.name || 'Spellcasting'), header: creatureText(header), text: creatureText(body) });
  });
  return out.length ? out : null;
}
/* ---- the block of a creature ---- */

/* The armour class: a number, or the words that make one. */
function armourClass(entry) {
  const out = { ac: 0, text: '' };
  const ac = entry.ac;
  if (typeof ac === 'number') { out.ac = ac; return out; }
  if (Array.isArray(ac) && ac.length) {
    const first = ac[0];
    if (typeof first === 'number') { out.ac = first; return out; }
    if (first && typeof first.ac === 'number') out.ac = first.ac;
    else if (first && first.special) out.text = String(first.special);
    return out;
  }
  if (ac && typeof ac === 'object') {
    if (typeof ac.ac === 'number') out.ac = ac.ac;
    else if (ac.special) out.text = String(ac.special);
  }
  return out;
}

/* The hit points: a number, or the words that make one. */
function hitPoints(entry) {
  const out = { hp: 0, text: '' };
  const hp = entry.hp;
  if (!hp || typeof hp !== 'object') return out;
  if (typeof hp.average === 'number') {
    out.hp = hp.average;
    out.text = hp.formula ? String(hp.formula) : '';
    return out;
  }
  if (hp.special) out.text = String(hp.special);
  return out;
}

/* The speed, in the order the book gives it. */
function speedOf(entry) {
  const sp = entry.speed;
  if (typeof sp === 'string') return sp;
  if (!sp || typeof sp !== 'object') return '';
  const bits = [];
  Object.keys(sp).forEach((k) => {
    if (k === 'canHover') return;
    const v = sp[k];
    if (typeof v === 'number') { bits.push(k + ' ' + v + ' ft.'); return; }
    if (v && typeof v === 'object' && v.number) {
      bits.push(k + ' ' + v.number + ' ft.' + (v.condition ? ' ' + v.condition : ''));
    }
  });
  return bits.join(', ');
}

/* The experience a challenge is worth. The 2024 table, which is the one
   the books of the app are written in. */
const XP = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, 1: 200, 2: 450, 3: 700, 4: 1100,
  5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400,
  13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000,
  20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000,
  27: 105000, 28: 120000, 29: 135000, 30: 155000
};

function xpOf(cr) {
  const key = String(cr || '').trim();
  return XP[key] !== undefined ? XP[key] : 0;
}

/* The challenge of a creature: the text of it, and the experience it is
   worth. A challenge may come with the numbers of its lair beside it. */
function challengeOf(entry) {
  const cr = entry.cr;
  if (!cr) return { cr: '', xp: 0 };
  if (typeof cr === 'object') {
    const text = String(cr.cr || '');
    return { cr: text, xp: Number(cr.xp) || xpOf(text) };
  }
  const text = String(cr);
  return { cr: text, xp: xpOf(text) };
}

/* The proficiency bonus of a challenge. */
function profOf(cr) {
  const text = String(cr || '').trim();
  if (!text) return 0;
  let n = Number(text);
  if (text.indexOf('/') >= 0) {
    const bits = text.split('/');
    n = Number(bits[0]) / Number(bits[1]);
  }
  if (!isFinite(n) || n <= 0) return 0;
  return 2 + Math.floor(n / 4);
}

/* The initiative of a creature: the dexterity modifier, and what the book
   adds to it. A monster may be proficient in initiative, or expert in it,
   and some have advantage on it. */
function initiativeOf(entry, cr) {
  const init = entry.initiative;
  if (!init || typeof init !== 'object') return null;
  const dex = typeof entry.dex === 'number' ? Math.floor((entry.dex - 10) / 2) : 0;
  if (init.dex !== undefined) {
    const n = Number(String(init.dex).replace(/[^0-9+-]/g, ''));
    if (isFinite(n)) return { value: n, advantage: false };
  }
  if (init.proficiency !== undefined) {
    const times = Number(init.proficiency) || 1;
    return { value: dex + times * profOf(cr), advantage: false, proficiency: times };
  }
  if (init.advantageMode === 'adv') return { value: dex, advantage: true };
  return null;
}

/* A list of words, the way a stat block writes one: "Celestial, Fey, or
   Fiend". */
function words(list) {
  const out = [].concat(list || []).map((w) => {
    const text = String(w || '');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }).filter(Boolean);
  if (out.length < 2) return out.join('');
  return out.slice(0, -1).join(', ') + ', or ' + out[out.length - 1];
}

/* The kind of creature, as the book says it. The battle familiar and the
   otherworldly steed do not have one kind: the caster chooses, and the block
   says so. */
function typeOf(entry) {
  const t = entry.type;
  if (typeof t === 'string') return t;
  if (!t || typeof t !== 'object') return '';
  if (t.type && typeof t.type === 'object') {
    if (t.type.choose) return words(t.type.choose);
    return t.type.type || '';
  }
  if (typeof t.type === 'string') return t.type;
  return '';
}

/* The sizes the book writes as letters. */
const SIZES = {
  S: 'Small', M: 'Medium', L: 'Large', T: 'Tiny',
  H: 'Huge', G: 'Gargantuan', F: 'Fragmentary', V: 'Varies'
};

/* The size, which a creature may have in more than one shape. */
function sizeOf(entry) {
  const one = (v) => SIZES[String(v || '').toUpperCase()] || String(v || '');
  const s = entry.size;
  if (typeof s === 'string') return one(s);
  if (Array.isArray(s)) return s.map(one).join(' or ');
  return '';
}

/* The things the creature can do, and the things it is. A bonus action and
   a reaction are sections of their own, so they are not folded into the
   actions: a block that kept them there listed its fey step twice. */
function rawActions(entry) {
  return [].concat(entry.action || []);
}

/* The words of an entry, lists included. A summon keeps the effects of its
   moods in a list under its step, and a block that reads only the paragraphs
   ends on "based on the spirit's chosen mood" with nothing after it. */
function entriesText(entries) {
  const out = [];
  (entries || []).forEach((e) => {
    if (typeof e === 'string') { out.push(e); return; }
    if (!e || typeof e !== 'object') return;
    if (e.type === 'list' && Array.isArray(e.items)) {
      e.items.forEach((item) => {
        if (typeof item === 'string') { out.push(item); return; }
        if (!item || typeof item !== 'object') return;
        const name = item.name ? String(item.name) + '.' : '';
        out.push((name + ' ' + entriesText(item.entries)).trim());
      });
      return;
    }
    if (e.name) {
      out.push((String(e.name) + '. ' + entriesText(e.entries)).trim());
      return;
    }
    out.push(entriesText(e.entries));
  });
  return out.filter((x) => x).join(' ');
}

function rawTraits(entry) {
  return entry.trait || [];
}

function shapeActions(list) {
  return (list || []).map((a) => {
    const raw = entriesText(a.entries);
    /* The action is read in one call, so the tags are read before the text
       is cleaned and the bonus cannot come back empty. */
    const read = actionOf(raw);
    const out = {
      /* A name carries tags too: an action that recharges is written with
         one, and the block says the recharge in its name. */
      name: creatureText(a.name || ''),
      bonus: read.bonus,
      damage: read.damage,
      damageParts: read.damageParts,
      type: read.type,
      text: read.text
    };
    if (/multiattack/i.test(a.name || '')) {
      const count = parseMultiattack(raw);
      if (count) out.count = count;
    }
    return out;
  });
}

function shapeTraits(list) {
  const out = [];
  (list || []).forEach((t) => {
    const raw = entriesText(t.entries);
    const text = creatureText(raw);
    if (!text) return;
    out.push({ name: creatureText(t.name || ''), text: text });
  });
  return out;
}

/* The patches a version makes to the block: it takes an action away, or
   renames one, or gives it another text. */
function applyPatches(list, patches) {
  let out = [].concat(list || []).map((a) => Object.assign({}, a));
  (patches ? [].concat(patches) : []).forEach((op) => {
    if (!op || !op.mode) return;
    if (op.mode === 'removeArr') {
      const names = [].concat(op.names || []);
      out = out.filter((a) => names.indexOf(a.name) < 0);
      return;
    }
    if (op.mode === 'renameArr' && op.renames) {
      out.forEach((a) => { if (a.name === op.renames.rename) a.name = op.renames.with; });
      return;
    }
    if (op.mode === 'replaceArr' && op.items) {
      const ix = out.findIndex((a) => a.name === op.replace);
      if (ix >= 0) out[ix] = op.items;
      return;
    }
    if (op.mode === 'appendArr' && op.entries) {
      out = out.concat(op.entries);
    }
  });
  return out;
}

/* The section a version carries, or the one of the block: a version that
   sets the field, an empty list included, has said what the section is. */
function sectionOf(v, entry, key) {
  return Object.prototype.hasOwnProperty.call(v, key) ? v[key] : entry[key];
}

/* The forms of a creature: the versions of the block upstream. A version may
   take an action away, rename one, or give it another text, and it may do the
   same to a trait, a bonus action, a reaction or a spellcasting list: a patch
   that reached only the actions left the steed with all three of its bonus
   actions and the fey spirit with the moods of another form. A version that
   is a template rather than a form, the damage types of the draconic spirit,
   is no form the player can pick. */
function formsOf(entry) {
  const versions = (entry._versions || []).filter((v) => v && v.name && !v._abstract);
  if (!versions.length) return [];
  const base = String(entry.name || '');
  return versions.map((v) => {
    const mod = v._mod || {};
    const label = String(v.name).replace(base, '').replace(/[()]/g, '').trim() || String(v.name);
    const ac = v.ac ? armourClass(v) : armourClass(entry);
    const hp = v.hp ? hitPoints(v) : hitPoints(entry);
    return {
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: label,
      ac: ac.ac,
      acText: ac.text,
      acTerms: parseFormula(ac.text),
      hp: hp.hp,
      hpText: hp.text,
      hpTerms: parseFormula(hp.text),
      speed: v.speed ? speedOf(v) : speedOf(entry),
      actions: shapeActions(applyPatches(rawActions(entry), mod.action)),
      traits: shapeTraits(applyPatches(rawTraits(entry), mod.trait)),
      bonusActions: shapeTraits(applyPatches(sectionOf(v, entry, 'bonus'), mod.bonus)),
      reactions: shapeTraits(applyPatches(sectionOf(v, entry, 'reaction'), mod.reaction)),
      legendary: shapeTraits(applyPatches(sectionOf(v, entry, 'legendary'), mod.legendary)),
      spellcasting: spellcastingOf(sectionOf(v, entry, 'spellcasting'))
    };
  });
}

/* The block, as the app holds it. */
export function creatureRecord(item) {
  const entry = item.entry || item;
  const ac = armourClass(entry);
  const hp = hitPoints(entry);
  const challenge = challengeOf(entry);
  const out = {
    name: entry.name || item.name || '',
    source: entry.source || item.source || '',
    cr: challenge.cr,
    xp: challenge.xp,
    initiative: initiativeOf(entry, challenge.cr),
    speed: speedOf(entry),
    size: sizeOf(entry),
    type: typeOf(entry),
    ac: ac.ac,
    acText: ac.text,
    acTerms: parseFormula(ac.text),
    hp: hp.hp,
    hpText: hp.text,
    hpTerms: parseFormula(hp.text),
    actions: shapeActions(rawActions(entry)),
    traits: shapeTraits(rawTraits(entry)),
    alignment: alignmentOf(entry),
    ability: abilitiesOf(entry),
    saves: savesOf(entry),
    skills: skillsOf(entry),
    senses: sensesOf(entry),
    languages: languagesOf(entry),
    resist: listOf(entry.resist, 'resist'),
    immune: listOf(entry.immune, 'immune'),
    vulnerable: listOf(entry.vulnerable, 'vulnerable'),
    conditionImmune: listOf(entry.conditionImmune, 'conditionImmune'),
    reactions: shapeTraits(entry.reaction),
    bonusActions: shapeTraits(entry.bonus),
    legendary: shapeTraits(entry.legendary),
    legendaryActions: typeof entry.legendaryActions === 'number' ? entry.legendaryActions : null,
    spellcasting: spellcastingOf(entry.spellcasting),
    note: entry.pbNote ? String(entry.pbNote) : ''
  };
  const forms = formsOf(entry);
  if (forms.length) out.forms = forms;
  return out;
}

/* ---- the helpers of the formulas ---- */

/* Split a text on a pattern, but not inside brackets. */
function splitOn(text, pattern) {
  const out = [];
  let depth = 0;
  let current = '';
  const words = String(text).split(/(\s+)/);
  for (const word of words) {
    const bare = word.trim();
    if (depth === 0 && bare && pattern.test(bare)) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += word;
    for (const ch of word) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
  }
  out.push(current.trim());
  return out.filter(Boolean);
}

/* The place of the last plus that is not inside brackets. */
function lastPlus(text) {
  let depth = 0;
  let at = -1;
  const str = String(text);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '+' && depth === 0) at = i;
  }
  return at;
}
