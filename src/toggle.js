/* The toggle: one shape for the custom buttons of the app. Adv and Hex and
   Cunning and the rest are rectangles that centre their word, share the width
   of their row, and take two rows split as evenly as the count allows when one
   row cannot hold them, by wrapping or by a word wider than its share. A page
   may ask for a fixed grid instead, a chip may carry an icon before its word,
   and a pill beside it for a choice of its own. A page
   asks for the chip, puts it where it goes and
   keeps the handler: the block writes the word, the colour and the pressed
   state, and the page decides what the state means. */
(function (root) {
  'use strict';

  root.SheetToggle = function () {
    /* One chip. The small one is a shorter word, a size smaller and no
       different a shape. */
    /* An icon rides before the word when the chip carries one: one SVG path
       on a 24 box, stroked in the colour of the word. */
    function glyph(d) {
      if (!d || !/^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-]+$/.test(d)) return '';
      return '<svg class="vchipi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
    }

    function button(o) {
      return '<button type="button" class="vchip' + (o.cls ? ' ' + o.cls : '') + (o.small ? ' small' : '') + '"' +
        (o.id ? ' id="' + o.id + '"' : '') +
        (o.key ? ' data-key="' + o.key + '"' : '') +
        ' aria-pressed="' + (o.on ? 'true' : 'false') + '"' +
        (o.title ? ' title="' + o.title + '"' : '') +
        (o.aria ? ' aria-label="' + o.aria + '"' : '') +
        (o.rgb ? ' style="--crgb:' + o.rgb + '"' : '') +
        (o.disabled ? ' disabled' : '') +
        (o.hidden ? ' hidden' : '') + '>' + glyph(o.icon) + (o.label || '') + '</button>';
    }

    /* A chip may carry a pill on its right, a second choice that belongs to
       it (the dice of Elem), shown while the chip is on. The two are one
       shape with two taps. */
    function chip(opts) {
      var o = opts || {};
      if (!o.pill) return button(o);
      return '<span class="chippair" data-pair="' + (o.key || '') + '"' + (o.rgb ? ' style="--crgb:' + o.rgb + '"' : '') +
        (o.hidden ? ' hidden' : '') + '>' + button({ key: o.key, id: o.id, label: o.label, icon: o.icon, on: o.on, cls: o.cls }) +
        button({ key: o.pill.key, label: o.pill.label, aria: o.pill.aria, on: o.pill.on, cls: 'chippill', hidden: !o.on }) +
        '</span>';
    }

    /* The shape of a row, measured where it stands: every button at its own
       width first, then the count of columns the row takes. All of them in one
       row when their words fit, otherwise two rows split evenly with the first
       taking the odd one, so five compete as three then two and never as four
       then one. A row the page wrote itself is shaped the same way. */
    function shape(node, again) {
      if (!node) return 0;
      /* A page mounts before the shell shows it, so the row has no width yet:
         the measure is taken again on the next frame, when it has one. */
      if (!node.clientWidth) {
        if (!again && typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function () { shape(node, true); });
        }
        return 0;
      }
      node.classList.add('chiprow', 'measure');
      node.style.removeProperty('--cols');
      /* The chips are the cells of the row: its children, and the children
         of a panel that joined it, whose own box steps aside. */
      var items = [];
      Array.prototype.forEach.call(node.children, function (c) {
        if (c.classList.contains('plugbar')) Array.prototype.push.apply(items, c.children);
        else items.push(c);
      });
      items = items.filter(function (b) { return !b.hidden; });
      var cols = items.length;
      if (items.length) {
        var top = items[0].offsetTop;
        var wrapped = items.some(function (b) { return b.offsetTop !== top; });
        /* A word wider than the share it would get is a row that does not
           have the room either, so it takes the two rows as well. */
        var basis = (node.clientWidth - 6 * (items.length - 1)) / items.length;
        var crowded = basis > 0 && items.some(function (b) { return b.offsetWidth > basis + 1; });
        if (wrapped || crowded) cols = Math.ceil(items.length / 2);
      }
      node.classList.remove('measure');
      node.style.setProperty('--cols', String(cols || 1));
      return cols;
    }

    /* A segment: one choice out of a few, side by side in one frame, the
       picked one lit. Each option may carry an icon (a path, or the markup of
       a drawing the page made) before its word; the page names the data key
       its tap reads. */
    function segment(opts) {
      var o = opts || {};
      var key = String(o.key || 'pick').replace(/[^a-z0-9-]/gi, '');
      return '<div class="seg" role="radiogroup"' + (o.aria ? ' aria-label="' + o.aria + '"' : '') + '>' +
        (o.options || []).map(function (opt) {
          var on = opt.id === o.on;
          var icon = opt.svg || glyph(opt.icon);
          return '<button type="button" role="radio" aria-checked="' + (on ? 'true' : 'false') + '"' +
            ' data-' + key + '="' + opt.id + '"' + (opt.aria ? ' aria-label="' + opt.aria + '"' : '') + '>' +
            icon + '<span>' + (opt.label || '') + '</span></button>';
        }).join('') + '</div>';
    }

    /* A row of chips from the list the page keeps, then its shape. A page
       that wants a grid that never reflows asks for its columns, and the
       chips keep their place whatever is on or off. */
    function fill(node, list, opts) {
      if (!node) return 0;
      node.innerHTML = (list || []).map(chip).join('');
      var cols = opts && Number(opts.cols);
      if (cols) {
        node.classList.add('chipgrid');
        node.style.setProperty('--cols', String(cols));
        return cols;
      }
      return shape(node);
    }

    return { chip: chip, fill: fill, shape: shape, segment: segment };
  };
})(typeof window !== 'undefined' ? window : this);
