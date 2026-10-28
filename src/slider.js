/* The level slider: a level to cast a spell or smite at, in the look the
   spell page has always used. A page hands the levels it offers, the level it
   starts on, the word of the label and the words of the preview; the slider
   stops only on the levels it was given and hands each move back. What a
   level does stays with the page, which passes the preview and the tap. */
(function (root) {
  'use strict';

  root.SheetSlider = function () {
    /* The levels in order. A page that offers a range passes every level of
       it, a page with holes in what it has passes only those. */
    function levelsOf(opts) {
      return (opts.levels || []).slice().sort(function (a, b) { return a - b; });
    }

    /* The level nearest to a value, so a thumb between two stops lands on
       one the page offers. */
    function nearest(opts, value) {
      var levels = levelsOf(opts);
      if (!levels.length) return 0;
      var want = Number(value);
      var best = levels[0];
      levels.forEach(function (lv) {
        if (Math.abs(lv - want) < Math.abs(best - want)) best = lv;
      });
      return best;
    }

    /* The nine levels are the track; the levels offered are the band on it,
       and the none level, when a page has one, sits at the left end. */
    function edge(opts) {
      var levels = levelsOf(opts);
      var min = opts.none !== undefined ? 0 : 1;
      var off = opts.none !== undefined ? 1 : 0;
      var on = levels.filter(function (lv) { return lv >= off; });
      return { min: min, max: 9, lo: on.length ? on[0] : min, hi: on.length ? on[on.length - 1] : min };
    }

    function at(edgeOf, level) {
      var span = edgeOf.max - edgeOf.min;
      return (span ? (level - edgeOf.min) / span * 100 : 0).toFixed(1) + '%';
    }

    /* The row: the word, the level on it, the slider and the preview. A page
       with no level to offer gets the row greyed and disabled. */
    function row(opts) {
      var o = opts || {};
      var levels = levelsOf(o);
      var edgeOf = edge(o);
      var on = nearest(o, o.value);
      var label = o.none !== undefined && on === o.none ? (o.noneLabel || '\u2013') : String(on);
      return '<div class="lvlrow' + (levels.length ? '' : ' off') + '"' + (o.id ? ' id="' + o.id + '"' : '') + '>' +
        '<div class="lvlhead"><span class="lvlk">' + (o.label || 'SLOT') + '</span>' +
        '<span class="lvln">' + label + '</span>' +
        '<input class="lvlrange" type="range" min="' + edgeOf.min + '" max="' + edgeOf.max + '" step="1" value="' + on + '"' +
        ' style="--a:' + at(edgeOf, edgeOf.lo) + ';--b:' + at(edgeOf, edgeOf.hi) + '"' +
        (levels.length ? '' : ' disabled') +
        ' aria-label="' + (o.aria || ('The level, ' + edgeOf.min + ' to ' + edgeOf.max)) + '"></div>' +
        '<div class="lvlprev">' + (o.preview || '') + '</div></div>';
    }

    /* The slider as it moves: the value stops on a level it was given, the
       number and the preview follow, and the page hears the level. */
    function wire(root, opts) {
      var o = opts || {};
      var levels = levelsOf(o);
      var input = root.querySelector('.lvlrange');
      var num = root.querySelector('.lvln');
      var preview = root.querySelector('.lvlprev');
      if (!input || !levels.length) return null;
      function show(done) {
        var level = nearest(o, input.value);
        if (input.value !== String(level)) input.value = String(level);
        if (num) num.textContent = (o.none !== undefined && level === o.none) ? (o.noneLabel || '\u2013') : String(level);
        if (preview && o.previewAt) preview.innerHTML = o.previewAt(level);
        /* The page hears every move, and is told which one is the end of it:
           a page that writes the level down writes it once, not on every
           pixel of the drag. */
        if (o.onPick) o.onPick(level, !!done);
        return level;
      }
      input.addEventListener('input', function () { show(false); });
      input.addEventListener('change', function () { show(true); });
      show(false);
      return show;
    }

    return { row: row, wire: wire, nearest: nearest };
  };
})(typeof window !== 'undefined' ? window : this);
