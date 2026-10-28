/* The card: the row of a list of the overlay, and the layer that list opens.

   The app has two dresses and both live here, because both are blocks: the
   two-line card of the book and of the summons, and the one-line row of the
   characters, the shelf and the choosers. What a row means stays in the page.
   This module writes the markup and hands the picked row back as its dataset,
   so no page walks the list to find out what was hit.

   A one-line row is either the control or it holds one, never both: with a
   pick the row itself is the button, and with an action the name is the
   button and the row is not. A screen reader then never meets a button
   inside a button, which is why the character switcher keeps its delete. */
(function (root) {
  'use strict';

  /* The layer a list opens, and the escaper of the shell, which is the one
     the rest of the app writes markup with. */
  root.SheetCard = function (sheet, esc) {
    /* A field is either its text or an object that carries what the row
       needs of it, so a plain field stays plain. */
    function part(value) {
      if (value === undefined || value === null) return {};
      if (typeof value === 'string') return { text: value };
      return value;
    }

    function plain(value) {
      return value === undefined || value === null ? '' : String(value);
    }

    /* The data of an element, written in the order it was given so a row
       reads the same every time it is painted. */
    function attrs(data) {
      var out = '';
      if (!data) return out;
      Object.keys(data).forEach(function (key) {
        var value = data[key];
        if (value === undefined || value === null) return;
        out += ' data-' + key + '="' + esc(value) + '"';
      });
      return out;
    }

    function labelled(aria) {
      return aria ? ' aria-label="' + esc(aria) + '"' : '';
    }

    /* The two-line card of a list: the name and what the page puts beside
       it. The fields are the content of the row; the row, its classes and
       the place of each piece belong to this module. The badge is the button
       of the name line, the chips are the buttons of the note line, and the
       data is what the page recognises the row by. */
    function cardRow(spec) {
      var row = spec || {};
      var name = part(row.name);
      var badge = row.badge ? part(row.badge) : null;
      var html = '<div class="row"' + attrs(row.data) + '><div class="g1">' +
        '<span class="gn tappable"' + attrs(name.data) + labelled(name.aria) + '>' +
        esc(plain(name.text)) + '</span>';
      if (badge) {
        html += '<button type="button" class="gadd"' + attrs(badge.data) + labelled(badge.aria) + '>' +
          esc(plain(badge.text)) + '</button>';
      }
      html += '</div><div class="g2">';
      (row.chips || []).forEach(function (chip) {
        var c = part(chip);
        /* A chip that says whether it is on says so to a screen reader as
           well, so the state is never carried by the colour alone. */
        var label = c.aria || (c.title && c.on !== undefined ? c.title + (c.on ? ', on' : ', off') : '');
        html += '<button type="button" class="gcls' + (c.on ? ' on' : '') + '"' + attrs(c.data) +
          (c.title ? ' title="' + esc(c.title) + '"' : '') + labelled(label) + '>' +
          esc(plain(c.text)) + '</button>';
      });
      html += '<span class="gs">' + esc(plain(row.note)) + '</span></div></div>';
      return html;
    }

    /* The one-line row of a list: the name, the note beside it, the mark of
       the one being played, and the action it holds. The pick says the row
       is the control; without it the row holds its action and the name is
       the button. */
    function cardLine(spec) {
      var row = spec || {};
      if (row.pick && row.action) {
        throw new Error('a line is the control or it holds one, not both');
      }
      var name = part(row.name);
      var meta = row.meta ? part(row.meta) : null;
      var mark = row.mark ? part(row.mark) : null;
      var action = row.action ? part(row.action) : null;
      var html = row.pick
        ? '<div class="crow" role="button" tabindex="0"' + attrs(row.data) + '>'
        : '<div class="crow"' + (action ? '' : attrs(row.data)) + '>';
      if (action) {
        html += '<button type="button" class="cn"' + attrs(row.data) + labelled(name.aria) + '>' +
          esc(plain(name.text)) + '</button>';
      } else {
        html += '<span class="cn">' + esc(plain(name.text)) + '</span>';
      }
      if (meta) html += '<span class="cl"' + attrs(meta.data) + '>' + esc(plain(meta.text)) + '</span>';
      if (mark) html += '<span class="cm">' + esc(plain(mark.text)) + '</span>';
      if (action) {
        html += '<button type="button" class="cdel"' + attrs(action.data) + labelled(action.aria) + '>&times;</button>';
      }
      return html + '</div>';
    }

    /* The layer a list opens. The rows are the markup the page wrote, in
       whichever dress, and the pick of a row is its dataset, so the page
       never walks the list to find what was hit. Every other key of a layer
       passes through, because a list is a layer: the search, the actions,
       the level filter and the paint of the page all still work. */
    function list(opts) {
      var spec = opts || {};
      var layer = {};
      Object.keys(spec).forEach(function (key) {
        if (key === 'rows' || key === 'onPick') return;
        layer[key] = spec[key];
      });
      layer.id = spec.id || slug(spec.title);
      layer.list = Array.isArray(spec.rows) ? spec.rows.join('') : (spec.rows || '');
      layer.onList = function (ev) { pick(ev, spec.onPick); };
      sheet.open(layer);
      return layer;
    }

    /* A layer is known by its id, so the same list opened again replaces the
       layer it was on and keeps the place it was read at. */
    function slug(title) {
      return String(title || 'list').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'list';
    }

    /* What was hit: a chip, the badge of a card, the action of a line, the
       name when the name is the button, the row when the row is. */
    function pick(ev, onPick) {
      if (!onPick || !ev || !ev.target) return;
      var target = ev.target;
      var hit = target.closest('.gcls') || target.closest('.gadd') || target.closest('.cdel') || target.closest('.mtile');
      if (hit) { onPick(hit.dataset, ev); return; }
      var named = target.closest('button.cn');
      if (named) { onPick(named.dataset, ev); return; }
      var control = target.closest('.crow[role="button"]') || target.closest('.row');
      if (control) onPick(control.dataset, ev);
    }

    return { row: cardRow, line: cardLine, list: list };
  };
})(typeof window !== 'undefined' ? window : this);
