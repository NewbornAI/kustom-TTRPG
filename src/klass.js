/* The class plugin: what a class of the book does at its first level, and how
   it learns its spells. A class is a file of its own under classes/ that
   registers here, the way a page registers with the block, so a class can be
   added, taken away or rewritten without the shell reading a list. This
   module holds the registry and the shape, and it touches no document.

   What the book says of a class (its hit die, its saves, its ability, its kind
   of caster and how many spells it has ready at each level) is read from
   data/classes.json and never written in a plugin: the data is the one
   source. A plugin carries what the data does not, the level 1 features it
   bundles and the rule it learns by, and it may carry a count of its own as
   code when its learning is not a column of the book.

   It also carries the class's mechanics as code, because the data has them
   only in prose: the colour of its tag, the counters its features keep (how
   many uses at each level, and how a rest gives them back), the line a use
   says, the attacks of its Attack action, its Sneak Attack dice, the riders
   it adds on the attack sheet, and the flags a page reads (Metamagic, Font of
   Magic). A table by level is written with `step`, so a plugin reads as the
   book's own column. `sync(rec)` keeps the counters of a character in step
   with its levels, the way the spell slots follow the classes. */
(function (root) {
  'use strict';

  var classes = [];
  var book = [];   /* the rows of data/classes.json, filled in place by the loader */

  /* The rows of the book this registry reads. The array is the live one the
     loader fills, so the data may arrive after the plugins. */
  function useBook(rows) {
    if (Array.isArray(rows)) book = rows;
    return book;
  }

  function rowOf(name) {
    var found = null;
    book.forEach(function (c) { if (c.name === name) found = c; });
    return found || {};
  }

  /* A column of a class table: pairs of the level it starts at and the value
     from there, read at a level. */
  function step(pairs) {
    return function (level) {
      var out = 0;
      (pairs || []).forEach(function (p) { if (level >= p[0]) out = p[1]; });
      return out;
    };
  }

  function define(spec) {
    if (!spec || !spec.name) throw new Error('a class plugin needs a name');
    var at = -1;
    classes.forEach(function (c, i) { if (c.name === spec.name) at = i; });
    spec.level1 = spec.level1 || [];
    spec.learning = spec.learning || { kind: 'none', rule: '' };
    if (at >= 0) classes[at] = spec; else classes.push(spec);
    return spec;
  }

  /* A class as a page reads it: the row of the book, and the plugin over it. */
  function merged(spec) {
    var row = rowOf(spec.name);
    return {
      name: spec.name,
      source: row.source || '',
      hd: Number(row.hd) || 0,
      saves: (row.saves || []).slice(),
      ability: row.ability || '',
      caster: row.caster || '',
      prepared: (row.prepared || []).slice(),
      level1: spec.level1,
      learning: spec.learning,
      colour: spec.colour || ''
    };
  }

  /* ---- the mechanics, read on a character ---- */

  function number(v) { return Number(v) || 0; }

  /* The classes of a character with their plugins and their levels. */
  function levelsOf(rec) {
    var ch = (rec && rec.char) || {};
    var out = [];
    (ch.classes || []).forEach(function (k) {
      if (!k || !k.name) return;
      var spec = null;
      classes.forEach(function (c) { if (c.name === k.name) spec = c; });
      if (spec) out.push({ spec: spec, level: Math.max(0, number(k.level)), subclass: k.subclass || '' });
    });
    return out;
  }

  function levelOf(rec, name) {
    var lv = 0;
    levelsOf(rec).forEach(function (x) { if (x.spec.name === name) lv = x.level; });
    return lv;
  }

  function rowsOf(rec) { return (rec && rec.char && rec.char.features) || []; }

  function rowFor(rec, counter) {
    var found = null;
    rowsOf(rec).forEach(function (f) { if (!found && counter.keys.indexOf(f.key) >= 0) found = f; });
    return found;
  }

  /* The counters a character's classes keep, each with its level. */
  function countersOf(rec) {
    var out = [];
    levelsOf(rec).forEach(function (x) {
      (x.spec.counters || []).forEach(function (c) {
        if (x.level >= (c.from || 1)) out.push({ counter: c, level: x.level, cls: x.spec.name });
      });
    });
    return out;
  }

  /* The counter a row of the sheet is, when a class keeps it. */
  function counterOf(rec, key) {
    var found = null;
    countersOf(rec).forEach(function (x) { if (!found && x.counter.keys.indexOf(key) >= 0) found = x; });
    return found;
  }

  /* The counters follow the levels: the maximum is the class's at its level,
     what was spent stays spent, and a row the player set by hand (`manual`)
     is left alone. A counter the data has no row for, and the player never
     removed, is added. Answers whether anything moved. */
  function sync(rec) {
    if (!rec || !rec.char) return false;
    var ch = rec.char;
    if (!Array.isArray(ch.features)) ch.features = [];
    var dropped = ch.dropped || [];
    var moved = false;
    countersOf(rec).forEach(function (x) {
      var c = x.counter;
      var max = Math.max(0, number(c.uses(x.level, rec)));
      var recovery = typeof c.recovery === 'function' ? c.recovery(x.level) : (c.recovery || 'long');
      var short = c.short === undefined ? null : c.short;
      var row = rowFor(rec, c);
      if (!row) {
        if (!c.add || c.keys.some(function (k) { return dropped.indexOf(k) >= 0; })) return;
        ch.features.push({ key: c.keys[0], name: c.name, source: x.cls, active: true, recovery: recovery,
          bind: null, max: max, left: max, cost: '', short: short, hidden: false });
        moved = true;
        return;
      }
      if (row.manual) return;
      if (number(row.max) !== max) {
        row.left = Math.max(0, Math.min(max, number(row.left) + (max - number(row.max))));
        row.max = max;
        moved = true;
      }
      if (row.recovery !== recovery || row.short !== short || !row.active) {
        row.recovery = recovery;
        row.short = short;
        row.active = true;
        moved = true;
      }
    });
    return moved;
  }

  /* What a use of a counter does, when its class says: a line to say, and
     what it moved (a heal, for one). A pool spends an amount, not one. */
  function useOf(rec, key) {
    var x = counterOf(rec, key);
    if (!x) return null;
    return { pool: !!x.counter.pool, heals: !!x.counter.heals, level: x.level,
      use: x.counter.use ? function (ctx) { return x.counter.use(x.level, ctx, rec); } : null };
  }

  /* The attacks of the Attack action: the most any class gives at its level,
     and a subclass feature of the sheet that says Extra Attack. */
  function attacks(rec) {
    var n = 1;
    levelsOf(rec).forEach(function (x) { if (x.spec.attacks) n = Math.max(n, number(x.spec.attacks(x.level)) || 1); });
    rowsOf(rec).forEach(function (f) {
      var k = String(f.key || '');
      if (/three-extra-attacks$/.test(k)) n = Math.max(n, 4);
      else if (/two-extra-attacks$/.test(k)) n = Math.max(n, 3);
      else if (/-extra-attack$/.test(k)) n = Math.max(n, 2);
    });
    return n;
  }

  /* Sneak Attack's dice at the rogue's level, written as the book writes a
     set: "3d6". Empty without the class. */
  function sneak(rec) {
    var out = '';
    levelsOf(rec).forEach(function (x) { if (x.spec.sneak && x.level) out = x.spec.sneak(x.level) || out; });
    return out;
  }

  /* A flag a page reads, true when any class raises it at its level. */
  function has(rec, flag) {
    return levelsOf(rec).some(function (x) { return !!(x.spec.flags && x.spec.flags(x.level)[flag]); });
  }

  /* The riders a class adds on the attack sheet, with their level. */
  function riders(rec) {
    var out = [];
    levelsOf(rec).forEach(function (x) {
      (x.spec.riders || []).forEach(function (r) {
        if (x.level >= (r.from || 1)) out.push({ rider: r, level: x.level, cls: x.spec.name });
      });
    });
    return out;
  }

  /* The colour of a tag: a class, or a subclass by its name or its short
     name, takes the colour of its class. */
  function colourOf(name) {
    var n = String(name || '').trim().toLowerCase();
    if (!n) return '';
    var out = '';
    classes.forEach(function (c) {
      if (out || !c.colour) return;
      if (c.name.toLowerCase() === n) { out = c.colour; return; }
      (rowOf(c.name).subclasses || []).forEach(function (sub) {
        if (String(sub.name || '').toLowerCase() === n || String(sub.short || '').toLowerCase() === n) out = c.colour;
      });
    });
    return out;
  }

  function all() { return classes.map(merged); }

  function byName(name) {
    var found = null;
    classes.forEach(function (c) { if (c.name === name) found = c; });
    return found ? merged(found) : null;
  }

  /* The level 1 features the class bundles, by the names the library writes. */
  function firstLevel(name) {
    var c = byName(name);
    return c ? c.level1.slice() : [];
  }

  function learningOf(name) {
    var c = byName(name);
    return c ? c.learning : null;
  }

  /* How many spells the class has ready at a level: the count the plugin
     carries as code, or else the column of the book. A class that learns
     none has none. */
  function ready(name, level) {
    var c = byName(name);
    if (!c || c.learning.kind === 'none') return 0;
    if (typeof c.learning.count === 'function') return Number(c.learning.count(level)) || 0;
    return Number(c.prepared[level - 1]) || 0;
  }

  root.SheetClasses = {
    book: useBook,
    define: define,
    all: all,
    byName: byName,
    firstLevel: firstLevel,
    learningOf: learningOf,
    ready: ready,
    step: step,
    levelOf: levelOf,
    sync: sync,
    counterOf: counterOf,
    useOf: useOf,
    attacks: attacks,
    sneak: sneak,
    has: has,
    riders: riders,
    colourOf: colourOf
  };
})(typeof window !== 'undefined' ? window : this);
