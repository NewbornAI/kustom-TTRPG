/* The counter: a limited resource of a character, read, spent and given back
   in one place.

   A feature's uses, a spell slot, the pact slots, the sorcery points and the
   uses of a summon are one thing: a number left and a number it comes back
   to. The page draws the counter and decides nothing; this module counts it
   over the record it is handed, so it needs no page and no document. */
(function (root) {
  'use strict';

  root.SheetCounter = function () {
    /* feature:<key>, slot:<level>, warlock, sp, summon:<id>:<action> */
    function split(key) {
      var parts = String(key || '').split(':');
      return { kind: parts[0], rest: parts.slice(1) };
    }

    function featuresOf(rec) { return (rec && rec.char && rec.char.features) || []; }
    function summonsOf(rec) { return (rec && rec.summons && rec.summons.list) || []; }

    function featureOf(rec, key) {
      var list = featuresOf(rec);
      for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
      return null;
    }

    function summonOf(rec, id) {
      var list = summonsOf(rec);
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    }

    /* The feature whose counter is the pact slots and not its own uses. */
    function warlockOf(rec) {
      var list = featuresOf(rec);
      for (var i = 0; i < list.length; i++) if (list[i].bind === 'warlock') return list[i];
      return null;
    }

    /* The spell side of the record: read without writing, or made ready. */
    function spellOf(rec) { return (rec && rec.spells) || {}; }

    function spellFor(rec) {
      if (!rec.spells) rec.spells = {};
      if (!rec.spells.left) rec.spells.left = {};
      if (!rec.spells.max) rec.spells.max = {};
      return rec.spells;
    }

    function number(value) { return Number(value) || 0; }

    /* What is left of a counter and what it comes back to, or null when the
       record holds no such counter. */
    function counterOf(rec, key) {
      var parts = split(key);
      var spell = spellOf(rec);
      if (parts.kind === 'feature') {
        var f = featureOf(rec, parts.rest.join(':'));
        if (!f) return null;
        if (f.bind === 'warlock') return { left: number(spell.warlockLeft), max: number(spell.warlockMax) };
        return { left: number(f.left), max: number(f.max) };
      }
      if (parts.kind === 'slot') {
        var lv = number(parts.rest[0]);
        return { left: number(spell.left && spell.left[lv]), max: number(spell.max && spell.max[lv]) };
      }
      if (parts.kind === 'warlock') return { left: number(spell.warlockLeft), max: number(spell.warlockMax) };
      if (parts.kind === 'sp') return { left: number(spell.sp), max: number(spell.spMax) };
      if (parts.kind === 'summon') {
        var card = summonOf(rec, parts.rest[0]);
        if (!card) return null;
        var u = (card.uses || {})[parts.rest.slice(1).join(':')];
        if (!u) return null;
        return { left: number(u.left), max: number(u.max) };
      }
      return null;
    }

    /* A counter put at a number, never under zero and never over its max. */
    function set(rec, key, left) {
      var parts = split(key);
      var now = counterOf(rec, key);
      if (!now) return null;
      var value = Math.max(0, Math.min(now.max, number(left)));
      if (parts.kind === 'feature') {
        var f = featureOf(rec, parts.rest.join(':'));
        if (f.bind === 'warlock') spellFor(rec).warlockLeft = value;
        else f.left = value;
      } else if (parts.kind === 'slot') {
        spellFor(rec).left[number(parts.rest[0])] = value;
      } else if (parts.kind === 'warlock') {
        spellFor(rec).warlockLeft = value;
      } else if (parts.kind === 'sp') {
        spellFor(rec).sp = value;
      } else if (parts.kind === 'summon') {
        var card = summonOf(rec, parts.rest[0]);
        var action = parts.rest.slice(1).join(':');
        card.uses = card.uses || {};
        card.uses[action] = { left: value, max: number((card.uses[action] || {}).max) };
      }
      return counterOf(rec, key);
    }

    /* One tap spends one. A feature that costs a sorcery point spends that
       instead of its own use, and a slot of the pact level spends the pact
       slot before the ordinary one. */
    function spend(rec, key) {
      var parts = split(key);
      var now = counterOf(rec, key);
      if (!now) return { ok: false, why: 'no such counter' };
      var f = parts.kind === 'feature' ? featureOf(rec, parts.rest.join(':')) : null;
      if (f && f.cost === 'sp') {
        var sp = counterOf(rec, 'sp');
        if (!sp || sp.left <= 0) return { ok: false, why: 'no sorcery point', left: sp ? sp.left : 0, max: sp ? sp.max : 0 };
        spellFor(rec).sp = sp.left - 1;
        return { ok: true, paid: 'sp', left: sp.left - 1, max: sp.max };
      }
      if (parts.kind === 'slot') {
        var spell = spellFor(rec);
        var lv = number(parts.rest[0]);
        var pact = number(spell.warlockLevel);
        if (lv === pact && number(spell.warlockLeft) > 0) {
          spell.warlockLeft = number(spell.warlockLeft) - 1;
          return { ok: true, paid: 'warlock', left: spell.warlockLeft, max: number(spell.warlockMax) };
        }
      }
      if (now.left <= 0) return { ok: false, why: 'empty', left: 0, max: now.max };
      var after = set(rec, key, now.left - 1);
      return { ok: true, left: after.left, max: after.max };
    }

    /* A long rest fills everything; a short rest fills what says it comes
       back on a short rest. */
    function refill(rec, key, kind) {
      var parts = split(key);
      var now = counterOf(rec, key);
      if (!now) return null;
      var long = kind !== 'short';
      var f = parts.kind === 'feature' ? featureOf(rec, parts.rest.join(':')) : null;
      if (f) {
        if (f.bind === 'warlock') {
          var w = warlockOf(rec);
          if (long || (w && w.recovery === 'short')) set(rec, key, now.max);
          return counterOf(rec, key);
        }
        if (long) { set(rec, key, now.max); return counterOf(rec, key); }
        if (f.recovery === 'short') {
          var give = f.short === null || f.short === undefined ? now.max : number(f.short);
          set(rec, key, Math.min(now.max, now.left + give));
        }
        return counterOf(rec, key);
      }
      if (parts.kind === 'warlock') {
        var pact = warlockOf(rec);
        if (long || (pact && pact.recovery === 'short')) set(rec, key, now.max);
        return counterOf(rec, key);
      }
      if (long) set(rec, key, now.max);
      return counterOf(rec, key);
    }

    /* Every counter of the record, so a rest can give them all back. */
    function keys(rec) {
      var out = [];
      featuresOf(rec).forEach(function (f) {
        if (f.bind || f.max || f.cost === 'sp') out.push('feature:' + f.key);
      });
      var spell = spellOf(rec);
      Object.keys(spell.max || {}).forEach(function (lv) {
        if (number(spell.max[lv]) > 0) out.push('slot:' + lv);
      });
      if (number(spell.warlockMax) > 0) out.push('warlock');
      if (number(spell.spMax) > 0) out.push('sp');
      summonsOf(rec).forEach(function (card) {
        Object.keys(card.uses || {}).forEach(function (action) { out.push('summon:' + card.id + ':' + action); });
      });
      return out;
    }

    return {
      counterOf: counterOf,
      spend: spend,
      refill: refill,
      set: set,
      keys: keys
    };
  };
})(typeof window !== 'undefined' ? window : this);
