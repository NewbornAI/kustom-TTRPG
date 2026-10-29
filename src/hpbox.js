/* The hit points of one thing on the screen: the keypad the sheet opens.

   A character's hit points and a creature's in a fight are the same question,
   so they are answered by the same keypad: the amount is typed first, then
   what it is. It docks at the bottom of the page, the four answers under the
   thumb, and it closes once one is given. Nothing is written until then, so a
   keypad left open changes nothing.

   The page owns what a move does to its record: this module reads the hit
   points it is handed, previews the four answers, and calls back with the
   kind and the amount. */
(function (root) {
  'use strict';

  root.SheetHpBox = function (getCore) {
    function C() { return getCore(); }

    var KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'del'];

    var WORDS = { damage: 'Damage', heal: 'Heal', set: 'Set', temp: 'Temp' };

    /* The keypad, over the page. opts: { hp, onMove(kind, amount), id,
       title }. The hp is { current, max, temp } and is read, never written. */
    function open(api, opts) {
      var o = opts || {};
      var core = C();
      var hp = o.hp || {};
      var typed = '';
      var keys = KEYS.map(function (k) {
        var label = k === 'del' ? '\u232b' : k;
        var aria = k === 'del' ? 'Delete a digit' : (k === 'C' ? 'Clear' : k);
        return '<button type="button" class="hpk" data-key="' + k + '" aria-label="' + aria + '">' + label + '</button>';
      }).join('');
      api.sheet.open({
        id: o.id || 'hpkeys',
        title: o.title || 'Hit points',
        dock: true,
        list: '<div class="hpkline"><span class="hpknow" id="hpkNow"></span><span class="hpkprev" id="hpkPrev"></span></div>' +
          '<div class="hpkshow" id="hpkShow">0</div>' +
          '<div class="hpkgrid">' + keys + '</div>' +
          '<div class="hpkacts">' +
          '<button type="button" class="hpka dmg" data-do="damage">Damage</button>' +
          '<button type="button" class="hpka heal" data-do="heal">Heal</button>' +
          '<button type="button" class="hpka set" data-do="set">Set</button>' +
          '<button type="button" class="hpka tmp" data-do="temp">Temp</button></div>',
        onPaint: function (root) { paint(root); },
        onList: function (ev) {
          var root = ev.currentTarget || document;
          var key = ev.target.closest('.hpk');
          if (key) {
            var k = key.dataset.key;
            if (k === 'C') typed = '';
            else if (k === 'del') typed = typed.slice(0, -1);
            else typed = (typed + k).replace(/^0+(?=\d)/, '').slice(0, 3);
            paint(root);
            return;
          }
          var act = ev.target.closest('.hpka');
          if (!act || act.disabled || !typed) return;
          var n = Number(typed);
          api.sheet.close();
          if (o.onMove) o.onMove(act.dataset.do, n);
        }
      });

      /* The line over the keys says where the hit points are and where each
         answer would take them, so the choice is made with the result in
         sight. */
      function paint(root) {
        var now = root.querySelector('#hpkNow');
        if (!now) return;
        var n = Number(typed) || 0;
        var temp = Number(hp.temp) || 0;
        now.textContent = hp.current + (hp.max ? ' / ' + hp.max : '') + (temp ? '  +' + temp + ' temp' : '');
        var dmg = core.SR.hpMove(hp, 'damage', n);
        var heal = core.SR.hpMove(hp, 'heal', n);
        root.querySelector('#hpkPrev').textContent = typed
          ? 'damage \u2192 ' + dmg.current + (dmg.temp ? ' +' + dmg.temp : '') + ' \u00b7 heal \u2192 ' + heal.current
          : '';
        var show = root.querySelector('#hpkShow');
        show.textContent = typed || '0';
        show.classList.toggle('empty', !typed);
        Array.prototype.forEach.call(root.querySelectorAll('.hpka'), function (b) {
          b.disabled = !typed;
          var word = WORDS[b.dataset.do];
          b.textContent = typed ? word + ' ' + typed : word;
        });
      }
    }

    return { open: open };
  };
})(typeof window !== 'undefined' ? window : this);
