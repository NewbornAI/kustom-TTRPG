/* The record: the shape of a character, in one place.

   A character is a set of slices, and each slice belongs to a page: the
   character page owns char, the spells page owns spells, the summons page
   owns summons, and so on. This module reads the store, moves the two old
   shapes on, seeds a new character from the pages, and writes a package with
   every slice it holds, so nothing is lost on the way out. What a slice
   holds stays with the page that owns it. */
(function (root) {
  'use strict';

  root.SheetRecord = function (block) {
    /* The store of this app, and the three names it had before. */
    var STORE = 'customsheet.state.v3';
    var OLD_STORES = ['dndsheet.state.v3', 'volley.state.v1', 'volley.state.v2'];

    /* The key a page owns in the record. */
    function keyOf(page) { return (page && (page.slice || page.id)) || ''; }

    /* The record of a character, or an empty one. */
    function of(state, id) {
      if (!state || !state.characters) return {};
      return state.characters[id] || {};
    }

    /* A slice of a character, made ready for a page that wants to write it. */
    function slice(rec, key) {
      if (!rec[key] || typeof rec[key] !== 'object') rec[key] = {};
      return rec[key];
    }

    function set(rec, key, value) {
      rec[key] = value;
      return value;
    }

    /* Every page seeds the slice it owns, and a character that is new starts
       from nothing. */
    function seed(rec, fresh) {
      (block ? block.pages() : []).forEach(function (page) {
        if (!page.seed) return;
        var key = keyOf(page);
        rec[key] = page.seed(rec[key] || {}, !!fresh, rec);
      });
      return rec;
    }

    /* The two first versions of the store, moved into the characters. The
       first held the slices of the volley and one character, the second held
       the same three slices. */
    function migrate(saved) {
      var out = { characters: {}, current: '', ui: (saved && saved.ui) || { pages: null } };
      /* Nothing at all was ever saved, so there is no character to carry and
         the app opens on the ways in. */
      if (!saved || (!saved.spells && !saved.volley && !saved.char)) return out;
      var rec = {};
      if (saved.spells || saved.volley) {
        /* the second version: three slices */
        rec.volley = saved.volley || {};
        rec.spells = saved.spells || {};
        rec.char = saved.char || {};
      } else {
        /* the first version: the slices of the spell tab and the fields of
           the volley, side by side */
        rec.volley = {};
        ['power', 'advantage', 'hex', 'curse', 'elem', 'elemPlus', 'quicken', 'ac'].forEach(function (k) {
          if (saved[k] !== undefined) rec.volley[k] = saved[k];
        });
        rec.spells = saved.spell || {};
        rec.char = saved.char || {};
      }
      out.characters.c1 = rec;
      out.current = 'c1';
      return out;
    }

    /* The store as it was last written, whichever of the four names holds it. */
    function read(storage) {
      var keys = [STORE].concat(OLD_STORES);
      for (var i = 0; i < keys.length; i++) {
        try {
          var raw = storage.getItem(keys[i]);
          if (raw) {
            var saved = JSON.parse(raw) || {};
            if (saved && typeof saved === 'object') return saved;
          }
        } catch (e) {}
      }
      return {};
    }

    /* The whole store of the app, with the old shapes moved on. */
    function load(storage) {
      var saved = read(storage);
      if (!saved.characters) saved = migrate(saved);
      var out = { characters: {}, current: '', ui: { pages: null } };
      Object.keys(out).forEach(function (k) {
        if (saved[k] !== undefined && saved[k] !== null) out[k] = saved[k];
      });
      if (!out.ui) out.ui = { pages: null };
      if (out.ui.pages === undefined) out.ui.pages = null;
      if (!out.current || !out.characters[out.current]) {
        out.current = Object.keys(out.characters)[0] || '';
      }
      return out;
    }

    /* Which pages are on: the character's own choice, then the app's, then
       the pages that say they are one of them. One answer, for the shell and
       for the settings alike. */
    function pagesOn(rec, ui) {
      if (rec && rec.pages) return rec.pages;
      if (ui && ui.pages) return ui.pages;
      return block ? block.defaults() : [];
    }

    /* A character leaves the app as a package: every slice the pages own, so
       a page that comes later is carried without a list to keep in step. */
    function packageOf(rec) {
      var slices = {};
      (block ? block.pages() : []).forEach(function (page) {
        var key = keyOf(page);
        if (key && rec[key] !== undefined) slices[key] = rec[key];
      });
      /* the slices no page owns yet travel as they are */
      Object.keys(rec).forEach(function (key) {
        if (key === 'pages' || key === 'theme' || key === 'icon' || key === 'pluginPages') return;
        if (slices[key] === undefined) slices[key] = rec[key];
      });
      slices.pages = rec.pages;
      slices.theme = rec.theme;
      slices.icon = rec.icon;
      return {
        kind: 'custom-sheet-character',
        version: 1,
        name: (rec.char && rec.char.name) || 'Unnamed character',
        record: slices,
        pages: rec.pluginPages || []
      };
    }

    /* The record a package brings, with the slices it carries and the rest
       seeded from the pages. */
    function packageIn(pkg) {
      return seed(JSON.parse(JSON.stringify(pkg.record || {})), false);
    }

    return {
      STORE: STORE,
      OLD_STORES: OLD_STORES,
      keyOf: keyOf,
      of: of,
      slice: slice,
      set: set,
      seed: seed,
      migrate: migrate,
      read: read,
      load: load,
      pagesOn: pagesOn,
      packageOf: packageOf,
      packageIn: packageIn
    };
  };
})(typeof window !== 'undefined' ? window : this);
