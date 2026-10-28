/* The wiring of a written page: what a page an agent or a package writes may
   do with attributes alone, so a tracker, a pool or a die needs no listener
   of its own and cannot be half wired.

   Every value is named by a path in the record, dotted from the top
   ("ward.dice", "spells.sp"), or by a counter of the counter module after an
   at sign ("@sp", "@slot:3", "@feature:<key>"). A path that is not there yet
   reads 0 and is made on the first write.

     data-show="path"        the value, as text; a counter shows "left / max"
     data-pips="path"        a row of pips, data-max of them, the value lit
     data-add="path"         adds data-n (1 by default, may be negative), held
                             between data-min (0) and data-max; data-cost="@sp"
                             spends that counter data-cost-n times first
     data-set="path"         sets data-value (a number, or text)
     data-spend="@counter"   spends one of a counter
     data-toggle="path"      turns a value on and off; the button is pressed
                             (aria-pressed) while it is on
     data-range="path"       on an <input type="range">: the slider shows the
                             value and writes it when moved (min, max, step)
     data-roll="2d8+3"       rolls, with {path} replaced by its value, and
                             draws the dice in the page's [data-roll-out]

   A write lands on the page's own slice, spells or char, and nowhere else.
   After a click the sheet is saved and every page repaints; on every
   repaint the shown values are painted again, and a button that cannot act
   is turned off. */
(function (root) {
  'use strict';

  root.SheetWire = function (coreOf) {
    function C() { return coreOf ? coreOf() : null; }
    var BAD = /^(__proto__|prototype|constructor)$/;

    function partsOf(path) {
      return String(path || '').split('.').filter(Boolean);
    }

    function read(rec, path) {
      var p = String(path || '').trim();
      if (p.charAt(0) === '@') {
        var c = C() && C().counter.counterOf(rec, p.slice(1));
        return c ? c.left : 0;
      }
      if (/^-?\d+(\.\d+)?$/.test(p)) return Number(p);
      var at = rec;
      var parts = partsOf(p);
      for (var i = 0; i < parts.length; i++) {
        if (at === null || at === undefined || typeof at !== 'object') return 0;
        at = at[parts[i]];
      }
      return at === undefined || at === null ? 0 : at;
    }

    function shown(rec, path) {
      var p = String(path || '').trim();
      if (p.charAt(0) === '@') {
        var c = C() && C().counter.counterOf(rec, p.slice(1));
        return c ? c.left + ' / ' + c.max : '-';
      }
      return String(read(rec, p));
    }

    /* A write is held to the page's own slice, the spells and the char. */
    function write(rec, path, value, own) {
      var parts = partsOf(path);
      if (!parts.length || parts.some(function (x) { return BAD.test(x); })) return 'no path';
      if ([own, 'spells', 'char'].indexOf(parts[0]) < 0) return 'a page writes its own slice (' + own + '), spells or char, not ' + parts[0];
      var at = rec;
      for (var i = 0; i < parts.length - 1; i++) {
        if (at[parts[i]] === undefined || at[parts[i]] === null || typeof at[parts[i]] !== 'object') at[parts[i]] = {};
        at = at[parts[i]];
      }
      at[parts[parts.length - 1]] = value;
      return '';
    }

    function bound(rec, el, name, fallback) {
      var v = el.getAttribute(name);
      if (v === null || v === '') return fallback;
      return Number(read(rec, v));
    }

    /* How far an add can go from here, so the button is off at the bounds. */
    function addable(rec, el) {
      var n = Number(el.getAttribute('data-n') || 1);
      var now = Number(read(rec, el.getAttribute('data-add'))) || 0;
      var lo = bound(rec, el, 'data-min', 0);
      var hi = bound(rec, el, 'data-max', Infinity);
      var next = Math.max(lo, Math.min(hi, now + n));
      if (next === now) return 0;
      var cost = el.getAttribute('data-cost');
      if (cost && n > 0) {
        var need = Number(el.getAttribute('data-cost-n') || 1);
        var c = C() && C().counter.counterOf(rec, cost.replace(/^@/, ''));
        if (!c || c.left < need) return 0;
      }
      return next - now;
    }

    function fill(text, rec) {
      return String(text || '').replace(/\{([^}]+)\}/g, function (m, p) { return String(read(rec, p)); });
    }

    function paint(box, a) {
      if (!box) return;
      var rec = a.character();
      Array.prototype.forEach.call(box.querySelectorAll('[data-show]'), function (el) {
        el.textContent = shown(rec, el.getAttribute('data-show'));
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-pips]'), function (el) {
        var max = Math.max(0, Math.min(40, bound(rec, el, 'data-max', 0)));
        var lit = Number(read(rec, el.getAttribute('data-pips'))) || 0;
        var out = '';
        for (var i = 0; i < max; i++) out += '<span class="wpip' + (i < lit ? ' on' : '') + '"></span>';
        el.innerHTML = out;
      });
      Array.prototype.forEach.call(box.querySelectorAll('button[data-add]'), function (el) {
        el.disabled = !addable(rec, el);
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-toggle]'), function (el) {
        el.setAttribute('aria-pressed', read(rec, el.getAttribute('data-toggle')) ? 'true' : 'false');
      });
      Array.prototype.forEach.call(box.querySelectorAll('input[data-range]'), function (el) {
        if (document.activeElement !== el) el.value = String(Number(read(rec, el.getAttribute('data-range'))) || 0);
      });
      Array.prototype.forEach.call(box.querySelectorAll('button[data-spend]'), function (el) {
        var c = C() && C().counter.counterOf(rec, el.getAttribute('data-spend').replace(/^@/, ''));
        el.disabled = !c || c.left <= 0;
      });
    }

    function act(el, a, own, box) {
      var core = C();
      var rec = a.character();
      var why = '';
      if (el.hasAttribute('data-roll')) {
        var text = fill(el.getAttribute('data-roll'), rec);
        var res = core.R.rollSet(core.R.setIn(text), Math.random);
        var out = box.querySelector('[data-roll-out]');
        if (out) out.innerHTML = core.roll.groups(res.groups, { flat: res.flat, total: res.total });
        else a.toast(text + ': ' + res.total);
        return;
      }
      core.rest.push(rec);
      if (el.hasAttribute('data-add')) {
        var step = addable(rec, el);
        if (!step) return;
        var cost = el.getAttribute('data-cost');
        if (cost && step > 0) {
          var need = Number(el.getAttribute('data-cost-n') || 1);
          for (var i = 0; i < need; i++) {
            var paid = core.counter.spend(rec, cost.replace(/^@/, ''));
            if (!paid || !paid.ok) { a.toast((paid && paid.why) || 'nothing left to spend'); return; }
          }
        }
        why = write(rec, el.getAttribute('data-add'), (Number(read(rec, el.getAttribute('data-add'))) || 0) + step, own);
      } else if (el.hasAttribute('data-set')) {
        var v = el.getAttribute('data-value');
        why = write(rec, el.getAttribute('data-set'), /^-?\d+(\.\d+)?$/.test(v || '') ? Number(v) : v, own);
      } else if (el.hasAttribute('data-toggle')) {
        why = write(rec, el.getAttribute('data-toggle'), !read(rec, el.getAttribute('data-toggle')), own);
      } else if (el.hasAttribute('data-range')) {
        why = write(rec, el.getAttribute('data-range'), Number(el.value), own);
      } else if (el.hasAttribute('data-spend')) {
        var s = core.counter.spend(rec, el.getAttribute('data-spend').replace(/^@/, ''));
        if (!s || !s.ok) why = (s && s.why) || 'nothing left to spend';
      }
      if (why) { a.toast(why); return; }
      a.save();
      a.refresh();
    }

    /* The page's root gets one listener for every wired button in it. */
    function mount(box, a, own) {
      box.addEventListener('click', function (ev) {
        var el = ev.target.closest('[data-add],[data-set],[data-spend],[data-roll],[data-toggle]');
        if (!el || !box.contains(el) || el.disabled) return;
        act(el, a, own, box);
      });
      /* A slider writes once it is let go, so a drag is one change. */
      box.addEventListener('change', function (ev) {
        var el = ev.target.closest('input[data-range]');
        if (el && box.contains(el)) act(el, a, own, box);
      });
    }

    return { mount: mount, paint: paint, read: read, CSS: '.plugbar>*,.plugpanel.chiprow>*{margin:0}:where(input[data-range]){width:100%;accent-color:var(--arcane)}:where(button[data-add],button[data-set],button[data-spend],button[data-roll],button[data-toggle]){min-height:var(--tap);margin:4px 6px 4px 0;padding:0 14px;border:1px solid rgba(var(--arcane-rgb),.5);border-radius:var(--r-control);background:rgba(var(--arcane-rgb),.15);color:var(--ink);font-family:var(--sans);font-size:14px;cursor:pointer}:where(button[data-add],button[data-set],button[data-spend],button[data-roll],button[data-toggle]):disabled{opacity:.4}:where([data-roll-out]){min-height:28px;margin:4px 0}.wpip{display:inline-block;width:12px;height:12px;margin:0 4px 0 0;border:1.5px solid rgba(var(--arcane-rgb),.7);border-radius:50%}.wpip.on{background:rgb(var(--arcane-rgb))}' };
  };
})(typeof window !== 'undefined' ? window : this);
