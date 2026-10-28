/* The drag: the gestures of the app, read in one place.

   A list: a press is held 320 ms before it carries a row, so a swipe still
   scrolls the page; a move of more than 8 px before the hold ends gives the
   press back to the scroll. Once a row is carried, the move writes it where
   the point says, with the rule of a list (the vertical middle of a row) or
   of a grid (the nearest centre), and the release hands the page the new
   order as keys. A click that follows a drag is swallowed once, so the row
   does not open under the finger.

   A page: a move across it says which way the finger went, and a move that
   is short or more down than across says nothing, so the scroll of a page is
   never a swipe. Nothing reads a move up or down: that is the scroll's.

   The rules are pure, so they are checked without a document. */
(function (root) {
  'use strict';

  var HOLD = 320;
  var SLOP = 8;
  var SWIPE = 60;   /* how far a swipe travels */
  var FLAT = 1.5;   /* how much flatter than tall it has to be */

  /* Where the dragged row goes. rects is every other row of the list in
     screen order, as { top, bottom, left, right }, and point is the finger.
     The list rule: the first row whose vertical middle is below the point,
     or the end of the list. The grid rule: the nearest centre, and before
     that row when the point is left of its centre in its band, otherwise
     above it. */
  function place(rects, point, layout) {
    var i, r;
    if (layout === 'grid') {
      var best = 0, bestDist = -1, before = true;
      for (i = 0; i < rects.length; i++) {
        r = rects[i];
        var cx = r.left + (r.right - r.left) / 2;
        var cy = r.top + (r.bottom - r.top) / 2;
        var dist = Math.abs(point.x - cx) + Math.abs(point.y - cy);
        if (bestDist < 0 || dist < bestDist) {
          bestDist = dist;
          best = i;
          before = (point.y >= r.top && point.y <= r.bottom) ? (point.x < cx) : (point.y < cy);
        }
      }
      return { index: best, before: before };
    }
    for (i = 0; i < rects.length; i++) {
      r = rects[i];
      if (point.y < r.top + (r.bottom - r.top) / 2) return { index: i, before: true };
    }
    return { index: rects.length, before: true };
  }

  /* The page a step across the strip's grid opens. rows is the layout, one
     array of page ids per row, and the step is one column inside the row for
     a sideways move or one row at the same column for a move up or down. The
     columns and the rows both wrap, so an end is never a dead end. A row move
     that lands on a column the target row does not have falls back to that
     row's last column, so a short row is still reachable. A step from a page
     the layout does not hold goes nowhere. */
  function step(rows, from, dx, dy) {
    var r = -1, c = -1, i;
    if (!rows || !rows.length) return '';
    for (i = 0; i < rows.length && r < 0; i++) {
      var at = rows[i].indexOf(from);
      if (at >= 0) { r = i; c = at; }
    }
    if (r < 0) return '';
    if (dy) {
      r = (r + dy + rows.length) % rows.length;
      if (!rows[r].length) return '';
      if (c > rows[r].length - 1) c = rows[r].length - 1;
    } else if (dx) {
      if (!rows[r].length) return '';
      c = (c + dx + rows[r].length) % rows[r].length;
    }
    return rows[r][c] || '';
  }

  /* Which way a move across the page went: -1 to the left, 1 to the right,
     and 0 for a move that is too short or more down than across, which is
     the scroll of the page. */
  function swipe(from, to) {
    var dx = Number(to.x) - Number(from.x);
    var dy = Number(to.y) - Number(from.y);
    if (Math.abs(dx) < SWIPE) return 0;
    if (Math.abs(dx) < Math.abs(dy) * FLAT) return 0;
    return dx < 0 ? -1 : 1;
  }

  /* The gesture of one list. The container holds the rows, and the page says
     which row it is, what names it, and what to do with the order. */
  function list(container, opts) {
    /* The click that follows a drag is swallowed once. */
    var dragged = false;
    /* A row is carried between the hold and the release, and a page that
       reads the same finger asks so a swipe is not read as one. */
    var carried = false;

    container.addEventListener('pointerdown', function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;
      if (opts.ignore && target.closest(opts.ignore)) return;
      var row = target.closest(opts.row);
      if (!row) return;
      var startX = ev.clientX, startY = ev.clientY, timer = null, moving = false;
      /* Every other row, in the order it sits on screen. */
      function others() {
        return Array.prototype.slice.call(container.querySelectorAll(opts.row)).filter(function (r) {
          return r !== row;
        });
      }

      /* The row the carried one goes before, and on which side of it. */
      function spot(point) {
        var items = others();
        if (!items.length) return null;
        var rects = items.map(function (r) {
          var box = r.getBoundingClientRect();
          return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
        });
        var out = place(rects, point, opts.layout);
        return { row: items[out.index] || null, before: out.before };
      }

      function order() {
        return Array.prototype.slice.call(container.querySelectorAll(opts.row)).map(function (r) {
          return r.dataset[opts.key];
        });
      }

      function begin() {
        timer = null;
        moving = true;
        carried = true;
        row.classList.add('dragging');
        if (navigator.vibrate) navigator.vibrate(12);
      }

      function move(e) {
        if (!moving) {
          if (Math.abs(e.clientY - startY) > SLOP || Math.abs(e.clientX - startX) > SLOP) {
            if (timer) { clearTimeout(timer); timer = null; }
            cleanup();
          }
          return;
        }
        if (e.cancelable) e.preventDefault();
        var at = spot({ x: e.clientX, y: e.clientY });
        if (!at) return;
        var host = at.row ? at.row.parentNode : container;
        if (!at.row || at.before) host.insertBefore(row, at.row || null);
        else host.insertBefore(row, at.row.nextSibling);
      }

      function up() {
        if (timer) { clearTimeout(timer); timer = null; }
        if (moving) {
          row.classList.remove('dragging');
          dragged = true;
          setTimeout(function () { dragged = false; }, 80);
          if (opts.onOrder) opts.onOrder(order());
        }
        cleanup();
      }

      function blockScroll(e) { if (moving && e.cancelable) e.preventDefault(); }
      function cleanup() {
        carried = false;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        window.removeEventListener('touchmove', blockScroll);
      }

      timer = setTimeout(begin, HOLD);
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      window.addEventListener('touchmove', blockScroll, { passive: false });
    });

    return {
      /* True once after a drag ended, false otherwise. */
      wasDragged: function () {
        if (!dragged) return false;
        dragged = false;
        return true;
      },
      /* True while a row is held and carried, so another gesture of the
         same finger stands down. */
      carrying: function () { return carried; }
    };
  }

  root.SheetDrag = function () {
    return { list: list, place: place, step: step, swipe: swipe, HOLD: HOLD, SLOP: SLOP };
  };
})(typeof window !== 'undefined' ? window : this);
