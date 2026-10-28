/* The bridge: a call to the shell of the phone that does not hold the page.

   The phone's shell answers some calls by going to the network: a GitHub
   call, a file of another origin, the download of an update and the launch
   of the installer. Asked the plain way, the page waits for the answer and
   the screen freezes with it. The shell also answers each of them as
   name + Async: the call returns at once, the work runs on a thread of the
   shell, and the answer comes back through window.__sheetNetDone. call()
   asks that way when the shell offers it, the plain way when it does not,
   and answers a promise of the text either way; null means the phone has no
   such call and the page goes to the network itself. */
(function (root) {
  'use strict';

  var waiting = {};
  var next = 0;

  root.__sheetNetDone = function (id, text) {
    var done = waiting[id];
    if (!done) return;
    delete waiting[id];
    done(text);
  };

  function net() { return root.SheetNet || null; }

  function has(name) {
    var n = net();
    return !!(n && (typeof n[name + 'Async'] === 'function' || typeof n[name] === 'function'));
  }

  function call(name, args) {
    var n = net();
    if (!n) return null;
    args = args || [];
    if (typeof n[name + 'Async'] === 'function') {
      return new Promise(function (resolve, reject) {
        next += 1;
        var id = String(next);
        waiting[id] = resolve;
        try {
          n[name + 'Async'].apply(n, [id].concat(args));
        } catch (e) {
          delete waiting[id];
          reject(e);
        }
      });
    }
    if (typeof n[name] === 'function') {
      try {
        return Promise.resolve(n[name].apply(n, args));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return null;
  }

  root.SheetBridge = { call: call, has: has };
})(typeof window !== 'undefined' ? window : this);
