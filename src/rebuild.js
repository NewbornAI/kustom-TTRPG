/* The rebuild: what a page's markup was built from, and the paint that keeps
   it.

   A page that builds its markup once and paints it on every repaint has to
   know when the thing it built has moved, and only then: a repaint that
   changes nothing must keep the markup, or a field loses the focus under the
   finger. A page hands its parts to the paint with the two functions, and
   the module builds again only when those parts moved. A change the parts
   cannot see is a mark, which moves the key of that page once, so the next
   paint builds again. The key belongs to the page, so a page paints once:
   two lists that move apart are two parts of one paint, and a mark of
   either builds both. */
(function (root) {
  'use strict';

  root.SheetRebuild = function () {
    /* The marks of each page, by page id and by the name of the part. */
    var marks = {};

    /* The key each page painted last, so the same parts keep the markup. */
    var last = {};

    function part(value) {
      if (value === undefined || value === null) return '';
      return Array.isArray(value) ? value.join(',') : String(value);
    }

    /* The key a page's markup was built from: the parts it names, in order,
       and the marks it has made since it was built. */
    function signature(pageId, parts) {
      var out = [];
      (parts || []).forEach(function (value) { out.push(part(value)); });
      var page = marks[pageId] || {};
      Object.keys(page).sort().forEach(function (key) { out.push(key + ':' + page[key]); });
      return out.join('|');
    }

    /* The paint of a page: build its markup when the parts moved, then
       render it either way. A page that only builds passes build alone. */
    function paint(pageId, parts, fns) {
      var sig = signature(pageId, parts);
      if (last[pageId] !== sig) { last[pageId] = sig; if (fns.build) fns.build(); }
      if (fns.render) fns.render();
      return sig;
    }

    /* A page says that something it painted has changed and its parts do not
       say so. The next signature of that page differs from the last one. */
    function markDirty(pageId, key) {
      var page = marks[pageId] || (marks[pageId] = {});
      page[key] = (page[key] || 0) + 1;
    }

    /* A page that leaves the app, or is mounted again, starts from nothing:
       its next paint builds, because the markup it built is gone. */
    function forget(pageId) {
      delete last[pageId];
      delete marks[pageId];
    }

    return { signature: signature, paint: paint, markDirty: markDirty, forget: forget };
  };
})(typeof window !== 'undefined' ? window : this);
