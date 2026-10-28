/* The edit mode: one flag per page, and the one wrench that turns it.

   A page asks whether it is in the edit mode instead of keeping a flag of
   its own, and the shell keeps the pressed state of the button in one place.
   The mode changes what a part of the page can do, not how it looks, so this
   module is the flag and nothing else: no markup, no document, no store. */
(function (root) {
  'use strict';

  root.SheetEdit = function () {
    /* The pages that are in the edit mode, by the id of the page. A page
       that was never toggled is out of it, so a reload starts on the sheet
       the player reads. */
    var flags = {};

    /* Whether a page is in the edit mode. */
    function of(pageId) { return flags[pageId] === true; }

    /* The same read under the name a page asks it by. */
    function editing(pageId) { return of(pageId); }

    /* The wrench: a page is in the edit mode after it, or out of it. */
    function toggle(pageId) {
      flags[pageId] = !of(pageId);
      return flags[pageId];
    }

    return { of: of, editing: editing, toggle: toggle };
  };
})(typeof window !== 'undefined' ? window : this);
