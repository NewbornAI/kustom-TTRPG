/* The feedback of the app: the line a spend or a refund says, the line a cast
   says, and the outline a tap leaves. One implementation for all of them, so
   a page never invents its own wording or its own flash. */
(function (root) {
  'use strict';

  root.SheetFeedback = function (deps) {
    var say = deps.say;      /* the one door to the line */
    var timer = null;

    /* A label and a count, written the way the sheet writes them. */
    function many(label, amount) {
      var n = Math.abs(Number(amount) || 1);
      return n === 1 ? label : label + 's';
    }

    function left(word) { return word === undefined || word === null ? '' : ' \u00b7 ' + word + ' left'; }

    /* A cast names the spell and the slot it went in: "Fireball cast at
       level 3", the line the sheet has always shown. */
    function cast(name, level) {
      say(name + ' cast at level ' + level);
    }

    /* A spend and a refund, both of them counted: "\u22122 sorcery points
       \u00b7 7 left", "2 sorcery points back \u00b7 9 left". */
    function spent(label, amount, leftCount) {
      var n = Math.abs(Number(amount) || 1);
      say('\u2212' + n + ' ' + many(label, n) + left(leftCount));
    }

    function back(label, amount, leftCount) {
      var n = Math.abs(Number(amount) || 1);
      say(n + ' ' + many(label, n) + ' back' + left(leftCount));
    }

    /* An attack that was rolled says what it gave: the total, the damage, and
       a critical when it was one. A creature's swing has no slot and no
       resource to name, so the line names the attack. */
    function roll(name, result) {
      if (!result) return;
      say(name + ' rolled ' + result.total + ', ' + result.damage + ' damage' +
        (result.crit ? ' \u00b7 critical' : ''));
    }

    /* A tap that triggers something leaves its mark on the control it
       acted on, for a moment, so the eye lands where the change happened. */
    function tap(node) {
      if (!node || !node.classList) return;
      node.classList.add('tapped');
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        Array.prototype.forEach.call(document.querySelectorAll('.tapped'), function (n) {
          n.classList.remove('tapped');
        });
      }, 350);
    }

    return { cast: cast, spent: spent, back: back, roll: roll, tap: tap };
  };
})(typeof window !== 'undefined' ? window : this);
