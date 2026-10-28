/* The pictures: kept beside the store rather than in it.

   The store of the app is one string in localStorage, and the browser gives
   it about five megabytes. A picture is a quarter of a megabyte, so a few of
   them fill it, and a full store refuses every change after that. The
   pictures live in IndexedDB instead, one per character, and the store keeps
   a mark where the picture was.

   In memory nothing moves: a record holds its picture in image.data the way
   it always has, so the image page, the package, the link and the shelf read
   it as before. Only the copy written to localStorage leaves the data out,
   and only for a picture IndexedDB has confirmed it holds, so a picture is
   never in neither place. Where IndexedDB is missing, the picture stays in
   the store as it did. */
(function (root) {
  'use strict';

  root.SheetImages = function (opts) {
    var NAME = 'customsheet.images';
    var STORE = 'images';
    var onStored = (opts && opts.onStored) || function () {};
    var db = null;
    var loaded = false;
    var held = {};     /* what IndexedDB holds, by character id, confirmed */
    var pending = {};  /* what is being written, by character id */

    function idb() {
      try { return root.indexedDB || null; } catch (e) { return null; }
    }

    function open() {
      return new Promise(function (done) {
        var factory = idb();
        if (!factory) return done(null);
        try {
          var req = factory.open(NAME, 1);
          req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
          req.onsuccess = function () { done(req.result); };
          req.onerror = function () { done(null); };
          req.onblocked = function () { done(null); };
        } catch (e) {
          done(null);
        }
      });
    }

    /* Every picture IndexedDB holds, by character id. */
    function readAll() {
      return new Promise(function (done) {
        var out = {};
        try {
          var req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
          req.onsuccess = function () {
            var cur = req.result;
            if (!cur) return done(out);
            out[cur.key] = cur.value;
            cur.continue();
          };
          req.onerror = function () { done(out); };
        } catch (e) {
          done(out);
        }
      });
    }

    /* The pictures go back into the records that marked them apart. The
       store is not written before this, so a mark is never taken for an
       empty picture. */
    function load(state) {
      return open().then(function (opened) {
        db = opened;
        if (!db) return state;
        return readAll().then(function (all) {
          Object.keys(all).forEach(function (id) { held[id] = all[id]; });
          Object.keys(state.characters || {}).forEach(function (id) {
            var img = state.characters[id].image;
            if (img && img.stored === 'apart') {
              /* A mark with nothing behind it is a picture a write never
                 reached; what the record still carries is better than the
                 empty slot, and the next write settles it. */
              img.data = all[id] || img.data || '';
              delete img.stored;
            }
          });
          return state;
        });
      }).then(function (s) { loaded = true; return s; }, function () { loaded = true; return state; });
    }

    function write(id, data) {
      if (!db) return;
      pending[id] = data;
      try {
        var tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE);
        if (data) store.put(data, id); else store.delete(id);
        tx.oncomplete = function () {
          if (pending[id] !== data) return;
          delete pending[id];
          if (data) held[id] = data; else delete held[id];
          onStored();
        };
        tx.onerror = function () { if (pending[id] === data) delete pending[id]; };
      } catch (e) {
        delete pending[id];
      }
    }

    /* The pictures that moved since the last write go to IndexedDB, and the
       pictures of a character that left go with it. */
    function sync(state) {
      if (!db || !loaded) return;
      var chars = state.characters || {};
      Object.keys(chars).forEach(function (id) {
        var img = chars[id].image;
        var data = (img && typeof img.data === 'string') ? img.data : '';
        if (img && img.stored === 'apart') return;
        var known = pending[id] !== undefined ? pending[id] : (held[id] || '');
        if (known !== data) write(id, data);
      });
      Object.keys(held).forEach(function (id) {
        if (!chars[id] && pending[id] === undefined) write(id, '');
      });
    }

    /* The store as it is written to localStorage: a picture IndexedDB holds
       is a mark, every other one stays where it is. */
    function storeText(state) {
      if (!db || !loaded) return JSON.stringify(state);
      var chars = {};
      Object.keys(state.characters || {}).forEach(function (id) {
        var rec = state.characters[id];
        var img = rec.image;
        if (img && img.data && held[id] === img.data && pending[id] === undefined) {
          var copy = {};
          Object.keys(rec).forEach(function (k) { copy[k] = rec[k]; });
          var mark = {};
          Object.keys(img).forEach(function (k) { mark[k] = img[k]; });
          mark.data = '';
          mark.stored = 'apart';
          copy.image = mark;
          chars[id] = copy;
        } else {
          chars[id] = rec;
        }
      });
      var out = {};
      Object.keys(state).forEach(function (k) { out[k] = state[k]; });
      out.characters = chars;
      return JSON.stringify(out);
    }

    /* A picture fitted for the store: 720 px on its long side, webp, the
       shape the picture page keeps. It takes a data URL, the way a drawn
       picture arrives from the machine that serves the app, and answers a
       smaller one, so a drawn picture and a chosen one land the same size. */
    var FIT_LONG = 720;
    var FIT_QUALITY = 0.82;

    function fit(dataUrl) {
      return new Promise(function (done) {
        var text = String(dataUrl || '');
        if (text.indexOf('data:image/') !== 0) { done(''); return; }
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth || 1;
          var h = img.naturalHeight || 1;
          var k = Math.min(1, FIT_LONG / Math.max(w, h));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * k));
          canvas.height = Math.max(1, Math.round(h * k));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          done(canvas.toDataURL('image/webp', FIT_QUALITY));
        };
        img.onerror = function () { done(''); };
        img.src = text;
      });
    }

    return { load: load, sync: sync, storeText: storeText, fit: fit };
  };
})(typeof window !== 'undefined' ? window : this);
