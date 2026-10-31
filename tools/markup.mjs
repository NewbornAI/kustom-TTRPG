/**
 * The markup of 5e.tools, and the numbers it writes as words.
 *
 * The upstream text holds tags like {@creature Battle Familiar|AU} and
 * {@damage 2d4 + 2}, and the numbers a formula is made of ("the spell's
 * level", "your proficiency bonus"). This module owns that grammar: one
 * reader of the tags, one parser of a damage, and the terms of a formula.
 * The fetcher and the bestiary both read the same text through it, so the
 * book and the bestiary cannot drift apart.
 */
const ABILITIES = { DEX: 'Dexterity', STR: 'Strength', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' };

/* The ability of a saving throw, as the book writes it: {@actSave wis} or
   {@actSave DEX}, and either reads as the name of the ability. */
function saveAbility(text) {
  return String(text || '').split(',').map((a) => {
    const word = a.trim();
    if (!word) return '';
    return ABILITIES[word.toUpperCase()] || word.charAt(0).toUpperCase() + word.slice(1);
  }).filter((x) => x).join(' or ');
}

/* One tag: the name, and the body before its parts. */
const TAG = /\{@([a-zA-Z]+)(?:\s+([^}|]*))?(?:\|([^}|]*))?(?:\|([^}]*))?\}/g;

/* The damage tag carries the type that follows it: "{@damage 8d6} Fire
   damage". It is read before the generic reader, because the type sits
   outside the tag and the generic reader cannot see it. A scaled damage
   carries the base dice, the levels it covers, and the dice added per level:
   "{@scaledamage 2d8 + 1d6|1-9|1d6}" adds 1d6, so the added dice stay out of
   the base damage line. A tag with no third part keeps the first. */
function damageTags(text) {
  return text
    .replace(/\{@damage ([^}]+)\}(\s+([A-Z][a-z]+)( damage)?)?/g, (m, dice, gap, type, dmg) =>
      '[[d:' + dice + (gap ? ' ' + type + (dmg || '') : '') + ']]')
    .replace(/\{@scaledamage ([^}|]*)\|([^}|]*)\|([^}|]*)\}/g, (m, base, range, added) => '[[d:' + (added || base) + ']]')
    .replace(/\{@scaledamage ([^}|]+)(?:\|[^}]*)?\}/g, (m, dice) => '[[d:' + dice + ']]');
}

/* One reader of the 5e.tools tags. The grammar is the same for the book and
   for the bestiary; the two differ only in what a tag becomes, which is the
   renderer handed in. */
function readTags(text, render) {
  /* A filter is a link to a list of 5e.tools: its first part is the words
     the sentence reads, the rest is where it points. */
  let out = String(text).replace(/\{@filter ([^|}]*)[^}]*}/g, '$1');
  out = damageTags(out);
  out = out.replace(TAG, (m, tag, body) => render(tag, String(body || '').trim()));
  out = out.replace(/\{@[a-zA-Z]+\s*}/g, '');
  /* The saving throws, in blue. */
  out = out.replace(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/g, '[[s:$1 saving throw]]');
  return out.replace(/\s+/g, ' ').trim();
}

/* The tags of a spell or a feature, as the book writes them. */
export function clean(text) {
  if (typeof text !== 'string') return '';
  return readTags(text, (tag, body) => {
    if (tag === 'condition') return '[[c:' + body + ']]';
    if (tag === 'actSave') return saveAbility(body) + ' saving throw';
    if (tag === 'hit') return 'on a hit, ' + body;
    if (tag === 'recharge') return 'recharges on a ' + body;
    if (tag === 'atk') return body.replace(/^(\w)(\w*)/, (x, a, r) => a.toUpperCase() + r) + ' attack';
    if (tag === 'dc') return 'DC ' + body;
    if (tag === 'note') return 'Note: ' + body;
    return body;
  });
}

/* The range of an attack: the tags m, mw, r, rw, ms and rs. */
const RANGES = { m: 'Melee attack:', mw: 'Melee weapon attack:', ms: 'Melee spell attack:', r: 'Ranged attack:', rw: 'Ranged weapon attack:', rs: 'Ranged spell attack:' };

/* The kinds of attack a creature may choose between when the tag carries
   more than one, {@atk m,r}. The book reads it as either, so the words are
   joined rather than dropped. */
const KIND_WORDS = {
  m: 'Melee', mw: 'Melee weapon', ms: 'Melee spell',
  r: 'Ranged', rw: 'Ranged weapon', rs: 'Ranged spell'
};

/* The tags of a creature's block, as the book writes them. */
export function creatureText(text) {
  if (typeof text !== 'string') return '';
  const out = readTags(text, (tag, body) => {
    if (tag === 'atk' || tag === 'atkr') {
      /* The book writes one tag for a choice, {@atk m,r}, and both kinds are
         the same attack, so they read as one line. */
      const kinds = body.split(',');
      if (kinds.length > 1) {
        return kinds.map((k) => KIND_WORDS[k] || k).join(' or ') + ' attack:';
      }
      return RANGES[body] || (KIND_WORDS[body] ? KIND_WORDS[body] + ' attack:' : body);
    }
    if (tag === 'hit') return '+' + body + ' to hit';
    if (tag === 'hitYourSpellAttack') return 'your spell attack modifier';
    if (tag === 'h') return '';
    if (tag === 'condition') return '[[c:' + body + ']]';
    if (tag === 'actSave') return saveAbility(body) + ' saving throw';
    if (tag === 'dc') return 'DC ' + body;
    /* A bare {@recharge} is the 5-6 the book prints after an action's name. */
    if (tag === 'recharge') return body ? 'recharges on a ' + body : '(Recharge 5-6)';
    if (tag === 'note') return 'Note: ' + body;
    return body;
  });
  /* The 2014 blocks print their hit tag and then the words "to hit" again,
     so the reader would say it twice. */
  return out.replace(/to hit to hit/g, 'to hit');
}

/* ---- the numbers the book writes as words ---- */

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
};

const ABILITY_KEYS = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha'
};

function wordNumber(text) {
  const word = String(text || '').toLowerCase();
  if (/^\d+$/.test(word)) return Number(word);
  return WORD_NUMBERS[word] || 0;
}

/* One term of a formula: a number, the level of the calling spell, the
   proficiency, a modifier, or the level of a class. */
export function termOf(text) {
  const t = String(text || '').toLowerCase().trim();
  let m;
  if ((m = t.match(/^(\d+)$/))) return { const: Number(m[1]) };
  if (/^(the spell'?s level|the level of the spell|the spell level|summonspelllevel)$/.test(t)) return { level: 1 };
  if ((m = t.match(/^(\d+)\s+per\s+spell\s+level$/))) return { perLevel: Number(m[1]) };
  if ((m = t.match(/^(\d+)\s+for\s+each\s+spell\s+level\s+above\s+(\d+)(?:st|nd|rd|th)?$/))) {
    return { perLevelAbove: Number(m[1]), above: Number(m[2]) };
  }
  if (/^pb$/.test(t)) return { prof: 1 };
  if ((m = t.match(/^your\s+(\w+)\s+modifier$/))) {
    const key = ABILITY_KEYS[m[1].toLowerCase()];
    return key ? { ability: key } : null;
  }
  if ((m = t.match(/^(\w+)\s+times\s+your\s+(\w+)\s+level$/))) {
    const n = wordNumber(m[1]);
    return n ? { class: m[2].toLowerCase(), per: n } : null;
  }
  if ((m = t.match(/^your\s+(\w+)\s+level$/))) return { class: m[1].toLowerCase(), per: 1 };
  return null;
}

/* The damage of an attack: the dice, and what is added to them. */
export function parseDamage(text) {
  if (!text) return null;
  const raw = String(text).split('|')[0].trim();
  const parts = raw.split(/\s*\+\s*/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0].toLowerCase();
  let dice = null;
  let m = first.match(/^\(\s*summonspelllevel\s*-\s*(\d+)\s*\)\s*d(\d+)$/);
  if (m) dice = { size: Number(m[2]), levelCount: -Number(m[1]) };
  if (!dice) {
    m = first.match(/^(\d*)d(\d+)$/);
    if (!m) return null;
    dice = { size: Number(m[2]), count: m[1] ? Number(m[1]) : 1 };
  }
  const flat = [];
  for (let i = 1; i < parts.length; i++) {
    const t = termOf(parts[i]);
    if (!t) return null;
    flat.push(t);
  }
  return { dice: dice, flat: flat };
}

export function textOf(entries) {
  if (typeof entries === 'string') return clean(entries);
  if (Array.isArray(entries)) return entries.map(textOf).filter(Boolean).join(' ');
  if (entries && typeof entries === 'object') {
    /* A body may sit in `entries` or in `entry`, the singular form a list
       item and a table cell use. */
    if (entries.entries) return textOf(entries.entries);
    if (entries.entry) return textOf(entries.entry);
    if (entries.text) return clean(entries.text);
    if (entries.name) return clean(entries.name);
  }
  return '';
}

/* A table cell can be a die roll rather than a word. */
export function cellText(cell) {
  if (typeof cell === 'string') return clean(cell);
  if (!cell || typeof cell !== 'object') return '';
  if (cell.type === 'cell' && cell.roll) {
    const r = cell.roll;
    if (r.exact !== undefined) return String(r.exact);
    if (r.min !== undefined && r.max !== undefined) return r.min + '-' + r.max;
    if (r.dice) return clean(String(r.dice) + (r.faces ? 'd' + r.faces : ''));
    if (r.note) return clean(r.note);
  }
  return textOf(cell);
}

export function blocksFrom(entries) {
  const out = [];
  for (const e of entries || []) {
    if (typeof e === 'string') {
      const t = clean(e);
      if (t) out.push({ t: 'p', text: t });
      continue;
    }
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'entries' || e.type === 'section' || e.type === 'subsection') {
      if (e.name) out.push({ t: 'h', text: clean(e.name) });
      out.push(...blocksFrom(e.entries));
      continue;
    }
    if (e.type === 'table') {
      out.push({
        t: 'table',
        caption: clean(e.caption || ''),
        head: (e.colLabels || []).map((h) => clean(h)),
        rows: (e.rows || []).map((r) => (Array.isArray(r) ? r : [r]).map(cellText))
      });
      continue;
    }
    if (e.type === 'list') {
      /* An item of a list may name itself and keep its body in one field:
         "Determine surprise. The DM determines whether...". */
      const items = (e.items || []).map((i) => {
        if (typeof i === 'string') return clean(i);
        if (i && i.name && (i.entry || i.entries)) {
          const body = textOf(i.entry || i.entries);
          return body ? clean(i.name).replace(/[.:;,]$/, '') + '. ' + body : clean(i.name);
        }
        return textOf(i);
      }).filter(Boolean);
      if (items.length) out.push({ t: 'list', items });
      continue;
    }
    if (e.type === 'inset') {
      const t = clean(e.title || 'Read aloud') + ': ' + textOf(e.entries);
      if (t) out.push({ t: 'p', text: t });
      continue;
    }
    if (e.type && e.type.startsWith('ability')) {
      const attrs = (e.attributes || []).map((a) => clean(a)).join(' or ');
      const bits = [];
      if (attrs) bits.push(attrs + ' saving throw');
      if (e.action) bits.push(clean(e.action));
      if (e.dc) bits.push('DC ' + e.dc);
      if (e.atk) bits.push('attack');
      const t = bits.join(', ');
      if (t) out.push({ t: 'p', text: t });
      continue;
    }
    if (e.entries) { out.push(...blocksFrom(e.entries)); continue; }
    if (e.entry) {
      if (e.name) out.push({ t: 'h', text: clean(e.name) });
      out.push(...blocksFrom([e.entry]));
      continue;
    }
    if (e.text) { out.push({ t: 'p', text: clean(e.text) }); continue; }
    if (e.name) { out.push({ t: 'h', text: clean(e.name) }); }
  }
  return out;
}

/* ---- the creatures the text names ---- */

/* A tag that names a creature: {@creature Battle Familiar|AU}. The parts
   are the name, the book the block is in, and sometimes a third part that
   is a plural or a note. */
export function references(node) {
  const out = [];
  const re = /\{@creature\s+([^|}]*?)(?:\|([^|}]*?))?(?:\|([^}]*?))?\}/g;
  const walk = (value) => {
    if (typeof value === 'string') {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(value))) {
        const name = String(m[1] || '').trim();
        if (name) out.push({ name: name, source: String(m[2] || '').trim(), note: String(m[3] || '').trim() });
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    Object.keys(value).forEach((k) => walk(value[k]));
  };
  walk(node);
  return out;
}

/* The attack of a creature: what it hits with and what it does. The bonus
   is the number of the hit tag, the damage the dice of the damage tag, and
   the type the word that follows it. */
export function attackOf(text) {
  /* Every damage the blow deals, each with the word that types it: the
     trident of a mezzoloth is a d8 of piercing and a 3d6 of force, and a
     single damage field would keep only the first of them. */
  const out = { bonus: '', damage: '', type: '', damages: [] };
  if (typeof text !== 'string') return out;
  const hit = text.match(/\{@hit (-?\d+)\}/);
  if (hit) out.bonus = hit[1];
  const re = /\{@(?:scaledamage|damage)\s+([^}|]+)[^}]*\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const dice = String(m[1]).trim();
    if (!dice) continue;
    /* The type is the word after the tag, behind the bracket the book writes
       it in: "9 (2d4 + 4) Slashing damage". */
    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
    const typed = tail.match(/^\)?\s*([A-Za-z]+)\s+damage/i);
    out.damages.push({ dice: dice, type: typed ? typed[1].toLowerCase() : '' });
  }
  /* an action that heals or restores carries its amount in a dice tag */
  if (!out.damages.length) {
    const dice = text.match(/\{@dice\s+([^}|]+)/);
    if (dice) out.damages.push({ dice: dice[1].trim(), type: '' });
  }
  if (out.damages.length) {
    out.damage = out.damages[0].dice;
    const typed = out.damages.filter((d) => d.type)[0];
    out.type = typed ? typed.type : '';
  }
  return out;
}

/* One action of a creature, read in the one order that works: the bonus and
   the damage come from the tags, and only then is the text cleaned. Read the
   text first and the tags are gone, so the bonus comes back empty with no
   error; that is why the two are one call, and why nothing outside calls
   attackOf and creatureText apart for the same text. */
export function actionOf(text) {
  const atk = attackOf(text);
  return {
    bonus: atk.bonus,
    damage: atk.damage,
    damageParts: parseDamage(atk.damage),
    type: atk.type,
    damages: atk.damages,
    text: creatureText(text)
  };
}
