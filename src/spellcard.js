/* The card of a spell: its fields and its words, opened from the summons,
   the stat block of a caster and the fight. One card, so a spell reads the
   same wherever its name is tapped. */
(function (root) {
  'use strict';

  root.SheetSpellCard = function (getCore) {
    function C() { return getCore(); }

    function book() { return C().library.bookByName || {}; }

    /* The card, once the book is in hand. */
    function show(api, spell, o) {
      var core = C();
      api.sheet.open({
        id: o.id || ('spell:' + spell.name),
        title: spell.name,
        meta: core.chrome.field('Level', spell.level) +
          core.chrome.field('Range', spell.range) +
          core.chrome.field('Duration', spell.duration) +
          core.chrome.field('Conc', spell.concentration ? 'Yes' : 'No', spell.concentration ? 'yes' : '') +
          core.chrome.field('Ritual', spell.ritual ? 'Yes' : 'No', spell.ritual ? 'rit' : ''),
        text: core.chrome.renderBlocks(spell.blocks) + core.chrome.sourceLine(spell.ref)
      });
    }

    /* A name opens its spell. A book that has not been read yet is read
       first, and a miss says so rather than opening nothing. */
    function open(api, name, opts) {
      var core = C();
      var o = opts || {};
      var spell = book()[name];
      if (spell) { show(api, spell, o); return; }
      core.library.data('spellbook').then(function (ok) {
        var found = ok ? book()[name] : null;
        if (found) show(api, found, o);
        else api.toast('The book does not have ' + name + '.');
      });
    }

    return { open: open };
  };
})(typeof window !== 'undefined' ? window : this);
