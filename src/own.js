/* The character's own library: the features, spells and items the books do
   not carry, kept on the character as data in the very shape of the books.

   A character holds them in rec.library = { features: [], spells: [],
   items: [] }. While it is played, they sit in the books the pages read
   (the spells of the spell book, the features by key, the weapons, the
   armour and the magic items), marked own, so every page finds a homebrew
   entry the way it finds one of the books, and no page knows the
   difference. Another character played takes its own out and puts its own
   in. The character's package carries its library, so a homebrew entry
   travels with the one who uses it.

   An entry is config, never code:
     feature  { name, uses, recovery, action, duration, text | blocks }
     spell    { name, level, school, time, range, duration, components,
                concentration, ritual, classes, text | blocks }
     item     { name, type: weapon | armour | shield | item, then for a
                weapon damage, damageType, properties, mastery, category;
                for armour category and ac and dex; for a shield ac; for an
                item acBonus, attackBonus, damageBonus; text | blocks } */
(function (root) {
  'use strict';

  root.SheetOwn = function (coreOf) {
    var MARK = '_own';
    var RECOVERY = ['short', 'long', 'special', 'sp', 'passive'];

    function lib() { return coreOf().library; }

    function slug(name) {
      return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function blocksOf(e) {
      if (Array.isArray(e.blocks) && e.blocks.length) return e.blocks;
      var t = String(e.text || '').trim();
      if (!t) return [];
      return t.split(/\n\s*\n/).map(function (p) { return { t: 'p', text: p.trim() }; });
    }

    function num(v, fallback) {
      var n = Number(v);
      return isFinite(n) ? n : fallback;
    }

    /* An entry made whole, or the reason it cannot be. */
    function shape(kind, e) {
      if (!e || typeof e !== 'object') return { error: 'an entry is an object' };
      var name = String(e.name || '').trim();
      if (!name) return { error: 'an entry needs a name' };
      var blocks = blocksOf(e);
      var base = { key: 'own-' + slug(name), name: name, source: 'Own', own: true, blocks: blocks };
      if (kind === 'feature') {
        var recovery = String(e.recovery || 'passive').toLowerCase();
        if (RECOVERY.indexOf(recovery) < 0) return { error: 'recovery is one of ' + RECOVERY.join(', ') };
        if (!blocks.length) return { error: 'a feature needs its words (text)' };
        base.uses = Math.max(0, Math.floor(num(e.uses, 0)));
        base.recovery = recovery;
        base.active = recovery !== 'passive';
        base.cost = recovery === 'sp' ? 'sp' : '';
        base.hidden = false;
        if (e.action) base.action = String(e.action);
        if (e.duration) base.duration = String(e.duration);
        if (e.desc) base.desc = String(e.desc);
        return { entry: base };
      }
      if (kind === 'spell') {
        var level = num(e.level, NaN);
        if (!(level >= 0 && level <= 9 && Math.floor(level) === level)) return { error: 'a spell needs a level from 0 to 9' };
        if (!blocks.length) return { error: 'a spell needs its words (text)' };
        base.level = level;
        ['school', 'time', 'range', 'duration', 'components'].forEach(function (k) { base[k] = String(e[k] || ''); });
        base.timeFull = base.time;
        base.concentration = !!e.concentration;
        base.ritual = !!e.ritual;
        base.classes = Array.isArray(e.classes) ? e.classes.map(String) : [];
        base.summons = false;
        base.creatures = [];
        return { entry: base };
      }
      if (kind === 'item') {
        var type = String(e.type || 'item').toLowerCase();
        base.type = type;
        if (type === 'weapon') {
          if (!/^\d+d\d+/.test(String(e.damage || ''))) return { error: 'a weapon needs its damage, such as 1d8' };
          base.damage = String(e.damage);
          base.damageType = String(e.damageType || '');
          base.properties = Array.isArray(e.properties) ? e.properties.map(String) : [];
          base.mastery = String(e.mastery || '');
          base.category = String(e.category || 'simple');
          base.kind = String(e.kind || 'Melee Weapon');
          /* A magic weapon's bonus is data the attack adds, not words. */
          var wb = e.bonus !== undefined ? num(e.bonus, 0) : 0;
          base.attackBonus = e.attackBonus !== undefined ? num(e.attackBonus, 0) : wb;
          base.damageBonus = e.damageBonus !== undefined ? num(e.damageBonus, 0) : wb;
          return { entry: base };
        }
        if (type === 'armour' || type === 'armor' || type === 'shield') {
          base.type = type === 'shield' ? 'shield' : 'armour';
          base.ac = num(e.ac, NaN);
          if (!isFinite(base.ac)) return { error: 'armour and a shield need their ac' };
          base.category = base.type === 'shield' ? 'shield' : String(e.category || 'light');
          base.dex = String(e.dex || (base.category === 'heavy' ? 'none' : base.category === 'medium' ? 'two' : 'full'));
          return { entry: base };
        }
        if (type !== 'item') return { error: 'type is weapon, armour, shield or item' };
        base.kind = String(e.kind || '');
        ['acBonus', 'attackBonus', 'damageBonus'].forEach(function (k) { if (e[k] !== undefined) base[k] = num(e[k], 0); });
        return { entry: base };
      }
      return { error: 'kind is feature, spell or item' };
    }

    /* Written into the character's library, in place of one of the same
       name. */
    function write(rec, kind, e) {
      var made = shape(kind, e);
      if (made.error) return made;
      var key = kind === 'feature' ? 'features' : kind === 'spell' ? 'spells' : 'items';
      rec.library = rec.library || {};
      var list = rec.library[key] = Array.isArray(rec.library[key]) ? rec.library[key] : [];
      var at = -1;
      list.forEach(function (x, i) { if (x.key === made.entry.key) at = i; });
      if (at >= 0) list[at] = made.entry; else list.push(made.entry);
      return { entry: made.entry, replaced: at >= 0 };
    }

    function remove(rec, key) {
      var gone = false;
      ['features', 'spells', 'items'].forEach(function (k) {
        var list = rec.library && rec.library[k];
        if (!Array.isArray(list)) return;
        var kept = list.filter(function (x) { return x.key !== key; });
        if (kept.length !== list.length) gone = true;
        rec.library[k] = kept;
      });
      return gone;
    }

    /* An array of the books with this character's own entries in it, and
       none of another's. The array remembers what it holds, so a repaint
       that changes nothing does nothing. */
    function held(arr) {
      var n = 0;
      for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i][MARK]) n += 1;
      return n;
    }

    /* A book read again empties its array in place, so the mark alone is
       not proof: the own entries must still be there. */
    function lay(arr, entries, sig, onAdd) {
      if (!Array.isArray(arr) || (arr[MARK] === sig && held(arr) === entries.length)) return;
      for (var i = arr.length - 1; i >= 0; i--) if (arr[i] && arr[i][MARK]) arr.splice(i, 1);
      entries.forEach(function (e) {
        var copy = JSON.parse(JSON.stringify(e));
        copy[MARK] = true;
        arr.push(copy);
        if (onAdd) onAdd(copy);
      });
      try { Object.defineProperty(arr, MARK, { value: sig, writable: true, configurable: true, enumerable: false }); } catch (e) { arr[MARK] = sig; }
    }

    function forget(map) {
      Object.keys(map).forEach(function (k) { if (map[k] && map[k][MARK]) delete map[k]; });
    }

    function sync(rec) {
      var L = lib();
      var own = (rec && rec.library) || {};
      var sig = JSON.stringify(own);
      var spells = own.spells || [];
      var features = own.features || [];
      var items = own.items || [];
      if (L.book.spells[MARK] !== sig || held(L.book.spells) !== spells.length) {
        forget(L.bookByName);
        lay(L.book.spells, spells, sig, function (s) { L.bookByName[s.name] = s; });
      }
      if (!L.features.features) L.features.features = [];
      if (L.features.features[MARK] !== sig || held(L.features.features) !== features.length) {
        forget(L.featureByKey);
        lay(L.features.features, features, sig, function (f) { L.featureByKey[f.key] = f; });
      }
      lay(L.weapons, items.filter(function (x) { return x.type === 'weapon'; }), sig);
      lay(L.gear.armour, items.filter(function (x) { return x.type === 'armour' || x.type === 'shield'; }), sig);
      lay(L.gear.magic, items.filter(function (x) { return x.type === 'item'; }), sig);
    }

    return { shape: shape, write: write, remove: remove, sync: sync };
  };
})(typeof window !== 'undefined' ? window : this);
