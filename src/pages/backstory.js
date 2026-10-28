/* The background page: the story of the character, in the player's words or
   a fairy's. It is plain text on the record, read as paragraphs, and written
   in a box while the page is in edit mode. The fairy reads it before it
   paints, so the picture carries the story and not only the class. */
(function () {
  'use strict';

  var api = null;
  var E = {};

  function slice() {
    var rec = api.character();
    if (!rec.backstory || typeof rec.backstory !== 'object') rec.backstory = { text: '' };
    if (typeof rec.backstory.text !== 'string') rec.backstory.text = '';
    return rec.backstory;
  }

  function seed(saved) {
    var s = (saved && typeof saved === 'object') ? saved : {};
    if (typeof s.text !== 'string') s.text = '';
    return s;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function paint() {
    var editing = api.editing('backstory');
    var text = slice().text;
    E.view.hidden = editing;
    E.edit.hidden = !editing;
    if (document.activeElement !== E.edit) E.edit.value = text;
    var paras = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    E.view.innerHTML = paras.length
      ? paras.map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('')
      : '<p class="bsnone">No background yet: the wrench writes one, or ask a fairy.</p>';
  }

  Sheet.page({
    id: 'backstory',
    glyph: 'M5 4h11l3 3v13H5zM8 9h8M8 12.5h8M8 16h5',
    title: 'Background',
    tab: 'Background',
    order: 8,
    on: false,
    blurb: 'The story of the character: why it took to the road.',
    slice: 'backstory',
    seed: seed,
    css: [
      '.bsview{flex:1 1 auto;min-height:0;overflow-y:auto;scrollbar-width:none;padding:4px 2px 12px;color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.55}',
      '.bsview p{margin:0 0 10px}',
      '.bsview .bsnone{color:var(--muted);font-style:italic}',
      '.bsedit{flex:1 1 auto;min-height:0;width:100%;box-sizing:border-box;resize:none;padding:10px 11px;border:1px solid var(--edge);border-radius:var(--r-box);background:rgba(255,255,255,.03);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.55;outline:none}'
    ].join('\n'),
    html: [
      '<div class="charbody" id="bsBody">',
      '  <div class="bsview" id="bsView"></div>',
      '  <textarea class="bsedit" id="bsEdit" placeholder="Why did this character leave home and take to the road?" aria-label="The background of the character" hidden></textarea>',
      '</div>'
    ].join('\n'),

    mount: function (root, a) {
      api = a;
      E = { view: root.querySelector('#bsView'), edit: root.querySelector('#bsEdit') };
      /* Saved as it is typed, without a repaint, so the caret stays put. */
      E.edit.addEventListener('input', function () {
        slice().text = E.edit.value;
        api.save();
      });
      E.edit.addEventListener('blur', function () { api.refresh(); });
    },

    head: function (root, a) {
      api = a;
      root.appendChild(a.wrench({ label: 'Edit the background' }));
    },

    render: function (a) {
      api = a;
      paint();
    }
  });
})();
