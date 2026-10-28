/* The roll block: one control a page places, rolled on a tap, drawn in the
   dice the rest of the app draws.

   control(node, opts) builds it inside a node the page owns. opts.set is what
   it rolls: a set written out ("2d6+1"), or a function called at the tap that
   returns one, so a page can compute it or read a control it assembled beside
   it. Before a roll the control shows the dice of the set, dimmed; after it,
   the dice that fell and their total. It returns { roll, clear, result }, so a
   page that moves the control its set reads can drop a result that no longer
   answers it.

   groups(list, opts) is that drawing on its own: the shape of each die, the
   numbers it rolled, an optional flat and an optional total. It is the one
   rendering of a roll the sheet has, the attack box's damage and the line its
   smite adds included, so a page that shows a roll does not invent a second
   look for the same dice.

   The numbers are the rules module's: R.setIn reads a set and R.rollSet throws
   it and adds it up. This file draws and taps, and it rolls no die of its own. */
(function (root) {
  'use strict';

  root.SheetRoll = function (deps) {
    var rules = deps.rules;
    var dieIcon = deps.dieIcon;
    var esc = deps.esc;

    /* The kind of die a group is: the one it says, or the one its label
       writes as 2d6. */
    function sidesOf(g) {
      if (g && g.sides) return Number(g.sides);
      var m = String((g && g.label) || '').match(/d(\d+)/i);
      return m ? Number(m[1]) : 6;
    }

    /* A set, however the page handed it in: written out, already read by
       R.setIn, or the empty set. */
    function setOf(handed) {
      if (typeof handed === 'string') return rules.setIn(handed);
      if (handed && handed.dice) return handed;
      return { dice: [], flat: 0 };
    }

    /* The drawing: one group per kind of die, the numbers that fell beside
       the shape of the die, the flat after them, and the total when the
       caller wants it. A group that has not rolled shows a dash, which is the
       same ghost the rest of the sheet uses for a number that is not there. */
    function groups(list, opts) {
      var o = opts || {};
      var out = '';
      (list || []).forEach(function (g) {
        var fell = (g && g.rolls) || [];
        var col = (g && g.colour) || o.colour || '';
        out += '<span class="sgres">' +
          '<span class="sdmini">' + dieIcon(sidesOf(g)) + '</span>' +
          '<span class="snum2' + (fell.length ? '' : ' sghost') + '"' +
          (col ? ' style="color:' + col + '"' : '') + '>' +
          (fell.length ? fell.join(',') : '--') + '</span></span>';
      });
      if (!out) out = '<span class="snum2 sghost">--</span>';
      if (o.flat) out += '<span class="rflat">' + (o.flat > 0 ? '+' : '') + o.flat + '</span>';
      if (typeof o.total === 'number') out += '<span class="rtot">= ' + o.total + '</span>';
      return '<span class="rgrps">' + out + '</span>';
    }

    /* One control, built into the node the page hands it. The node is the
       page's; what goes in it is this block's. */
    function control(node, opts) {
      var o = opts || {};
      var last = null;
      var E = {};

      node.innerHTML = '<button class="rctl" type="button">' +
        (o.label ? '<span class="rlab">' + esc(o.label) + '</span>' : '') +
        '<span class="rout"></span></button>';
      var btn = node.firstChild;
      btn.setAttribute('aria-label', o.aria || (o.label ? 'Roll ' + o.label : 'Roll'));
      E.out = btn.querySelector('.rout');

      /* What it rolls now. A function is read at the tap, so a set that rides
         on a slider the page assembled is read when it is thrown, not when
         the control was built. */
      function setNow() {
        return setOf(typeof o.set === 'function' ? o.set() : o.set);
      }

      function paint() {
        var out;
        if (last) {
          out = groups(last.groups, { flat: last.flat, total: last.total });
        } else {
          var set = null;
          try { set = setNow(); } catch (err) { set = null; }
          out = set ? groups(set.dice, { flat: set.flat }) : groups([], {});
        }
        E.out.innerHTML = out;
      }

      function roll() {
        last = rules.rollSet(setNow(), Math.random);
        paint();
        if (o.onRoll) o.onRoll(last);
        return last;
      }

      function clear() {
        last = null;
        paint();
      }

      btn.addEventListener('click', roll);
      paint();

      return {
        roll: roll,
        clear: clear,
        result: function () { return last; }
      };
    }

    return { control: control, groups: groups };
  };
})(typeof window !== 'undefined' ? window : this);
