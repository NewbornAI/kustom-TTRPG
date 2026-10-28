/* The rest: what a short rest and a long rest give back, and the sentence
   that says it.

   A rest touches a known list of things: the hit points and the temporary
   ones, the hit dice, the
   uses of the features, the spell slots, the pact slots, the sorcery points
   and the two toggles of the spell tab, and on a long rest the uses of the
   creatures at the table. The counters come back through the counter module,
   one key at a time, so the uses of a summon are no more special than a
   feature's; this module knows what a rest is, what it can take back, and
   how to say it. */
(function (root) {
  'use strict';

  root.SheetRest = function (counter) {
    /* The history holds at most this many steps, and at most this weight of
       JSON per character, so the store keeps room for the rest. */
    var HISTORY_MAX = 60;
    var HISTORY_BYTES = 64 * 1024;

    function number(value) { return Number(value) || 0; }

    /* The slices a page asked the history to keep beside the counters: a
       page whose steps the back key takes back, the turn of the attack page,
       says so with track(key), and every step copies that slice whole. */
    var TRACKED = [];

    function track(key) {
      if (key && TRACKED.indexOf(key) < 0) TRACKED.push(String(key));
    }

    function clone(value) {
      return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function featuresOf(rec) { return (rec && rec.char && rec.char.features) || []; }
    function spellOf(rec) { return (rec && rec.spells) || {}; }
    function summonsOf(rec) { return (rec && rec.summons && rec.summons.list) || []; }

    /* A copy of a feature keeps every field it has: the source, the kind of
       recovery, the cost of a use, and whether it is active. */
    function copyFeature(f) {
      var out = {}, k;
      for (k in f) out[k] = f[k];
      out.recovery = (f.recovery === 'short' || f.recovery === 'long' ||
        f.recovery === 'special' || f.recovery === 'passive') ? f.recovery : 'none';
      out.bind = f.bind === 'warlock' ? 'warlock' : null;
      out.max = number(f.max);
      out.left = number(f.left);
      out.short = (f.short === undefined || f.short === null) ? null : Number(f.short);
      out.active = !!f.active;
      out.hidden = !!f.hidden;
      return out;
    }

    function copySlots(left) {
      var out = {}, k;
      for (k in (left || {})) out[k] = number(left[k]);
      return out;
    }

    /* A creature of the table, with its uses copied, so a rewind brings the
       uses of a summon back like any other counter. */
    function copySummons(list) {
      return (list || []).map(function (card) {
        var out = {}, k;
        for (k in card) out[k] = card[k];
        out.uses = {};
        Object.keys(card.uses || {}).forEach(function (name) {
          out.uses[name] = { left: number(card.uses[name].left), max: number(card.uses[name].max) };
        });
        return out;
      });
    }

    /* Everything a rest can touch, so the rewind can put it back. */
    function snapshot(rec) {
      var ch = (rec && rec.char) || {};
      var spell = spellOf(rec);
      var hp = ch.hp || {};
      var slices = {};
      TRACKED.forEach(function (key) { if (rec && rec[key] !== undefined) slices[key] = clone(rec[key]); });
      return {
        hp: number(hp.current),
        hpmax: number(hp.max),
        temp: number(hp.temp),
        slices: slices,
        dice: (ch.dice || []).map(function (d) { return { type: d.type, spent: !!d.spent }; }),
        features: featuresOf(rec).map(copyFeature),
        summons: copySummons(summonsOf(rec)),
        left: copySlots(spell.left),
        warlockLeft: number(spell.warlockLeft),
        sp: number(spell.sp),
        cunning: !!spell.cunning,
        sorcRest: !!spell.sorcRest
      };
    }

    /* That state written back onto the record. The record keeps its identity
       because a page holds it across a repaint, and the volley board belongs
       to the character it was rolled for. */
    function apply(rec, state) {
      var ch = rec.char || (rec.char = {});
      var spell = rec.spells || (rec.spells = {});
      if (!ch.hp) ch.hp = {};
      ch.hp.current = state.hp;
      ch.hp.max = state.hpmax;
      /* A step written before the temporary hit points joined it leaves them
         alone, and a tracked slice is written back into the object the page
         holds, so the page keeps its reference. */
      if (state.temp !== undefined) ch.hp.temp = number(state.temp);
      Object.keys(state.slices || {}).forEach(function (key) {
        var into = rec[key];
        var from = clone(state.slices[key]);
        if (!into || typeof into !== 'object' || Array.isArray(into) || !from || typeof from !== 'object') {
          rec[key] = from;
          return;
        }
        Object.keys(into).forEach(function (k) { delete into[k]; });
        Object.keys(from).forEach(function (k) { into[k] = from[k]; });
      });
      if (state.dice) ch.dice = state.dice;
      ch.features = state.features;
      /* A history written before the summons joined it holds no list, so the
         creatures at the table are left alone by that older entry. */
      if (state.summons) {
        if (!rec.summons) rec.summons = {};
        rec.summons.list = state.summons;
      }
      spell.left = state.left;
      spell.warlockLeft = state.warlockLeft;
      spell.sp = state.sp;
      spell.cunning = state.cunning;
      spell.sorcRest = state.sorcRest;
      return rec;
    }

    /* The history of the character: the state before a change a rest can
       take back. A rest writes one itself; a page writes one before a change
       of its own, with the state it took when the change began. */
    function push(rec, state) {
      var ch = rec.char || (rec.char = {});
      if (!ch.history) ch.history = [];
      ch.history.push(state || snapshot(rec));
      if (ch.history.length > HISTORY_MAX) ch.history.shift();
      /* A long sheet makes a heavy step, so the history is held to a weight
         as well as a count: the oldest steps go first, the last one stays. */
      while (ch.history.length > 1 && JSON.stringify(ch.history).length > HISTORY_BYTES) ch.history.shift();
      return rec;
    }

    /* The name of the feature that binds the pact slots. */
    function warlockName(state) {
      var found = null;
      (state.features || []).forEach(function (f) { if (!found && f.bind === 'warlock') found = f.name; });
      return found || 'Warlock spell slots';
    }

    /* What the rest actually gave back, as the pairs the page prints: how
       many, and of what. The hit point dice are counted here, so a long rest
       that gave only the dice back can no longer say it gave nothing. */
    function gainsOf(before, after) {
      var out = [];
      var gave = function (n, label) { if (n > 0) out.push({ n: n, label: label }); };

      gave(number(after.hp) - number(before.hp), 'Hit points');

      var dice = 0;
      (after.dice || []).forEach(function (d, i) {
        var was = (before.dice || [])[i];
        if (was && was.spent && !d.spent) dice++;
      });
      gave(dice, 'Hit point dice');

      var slots = 0;
      Object.keys(after.left || {}).forEach(function (lv) {
        slots += Math.max(0, number(after.left[lv]) - number((before.left || {})[lv]));
      });
      gave(slots, 'Spell slots');
      gave(number(after.warlockLeft) - number(before.warlockLeft), warlockName(after));
      gave(number(after.sp) - number(before.sp), 'Sorcery points');

      (after.features || []).forEach(function (f, i) {
        var was = (before.features || [])[i];
        if (was) gave(number(f.left) - number(was.left), f.name);
      });

      /* The actions of the creatures at the table come back like a feature's
         uses, so the list names them the same way: the count, then the
         creature and its action, the way the summons card reads. */
      (after.summons || []).forEach(function (card, i) {
        var was = (before.summons || [])[i];
        if (!was) return;
        Object.keys(card.uses || {}).forEach(function (name) {
          var had = (was.uses || {})[name];
          gave(number(card.uses[name].left) - number(had && had.left),
            card.name ? card.name + ' \u00b7 ' + name : name);
        });
      });
      return out;
    }

    /* The same list as one sentence, for a reader that hears it and for a
       place with no room for the two columns. */
    function noteOf(kind, gains) {
      var body = gains.map(function (g) { return '+' + g.n + ' ' + g.label; }).join(', ');
      if (kind === 'long') {
        return 'Long rest' + (gains.length ? ': ' + body + ' back.' : ': nothing to give back.');
      }
      return 'Short rest' + (gains.length ? ': ' + body + ' back.' : ': nothing to give back yet.');
    }

    /* A rest: the state before it goes on the history, every counter comes
       back through the counter module, and a long rest also fills the hit
       points, gives the dice back and clears the two toggles of the spell
       tab. What came back comes out as a list the page prints, and as one
       sentence beside it. */
    function rest(kind, rec) {
      var before = snapshot(rec);
      var ch = rec.char || (rec.char = {});
      var spell = rec.spells || (rec.spells = {});
      push(rec, before);
      counter.keys(rec).forEach(function (key) { counter.refill(rec, key, kind); });
      if (kind !== 'short') {
        if (!ch.hp) ch.hp = {};
        ch.hp.current = number(ch.hp.max);
        /* The temporary hit points last until a long rest ends. */
        ch.hp.temp = 0;
        (ch.dice || []).forEach(function (d) { d.spent = false; });
        spell.cunning = false;
        spell.sorcRest = false;
      }
      /* The features go back through the copy the snapshot uses, so a rest
         leaves the shape the record is read with whatever it came in as, and
         the two toggles of the spell tab stay booleans. */
      ch.features = featuresOf(rec).map(copyFeature);
      spell.cunning = !!spell.cunning;
      spell.sorcRest = !!spell.sorcRest;
      var gains = gainsOf(before, snapshot(rec));
      return { rec: rec, note: noteOf(kind, gains), gains: gains };
    }

    /* The rewind brings back the state before the last change, or null when
       there is nothing to take back. */
    function rewind(rec) {
      var ch = (rec && rec.char) || {};
      var history = (ch.history || []).slice();
      if (!history.length) return null;
      var state = history.pop();
      ch.history = history;
      apply(rec, state);
      return { rec: rec, note: 'Rewound to before the last change.' };
    }

    return {
      snapshot: snapshot,
      push: push,
      rest: rest,
      rewind: rewind,
      track: track
    };
  };
})(typeof window !== 'undefined' ? window : this);
