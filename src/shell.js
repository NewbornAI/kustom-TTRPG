/* The shell of the app: the pages that are on, the tabs that carry them,
   the store they share, and the overlay any of them can open. */
(function () {
  'use strict';

  var R = window.Rules;
  var SR = window.SheetRules;
  /* What a page may contribute: the data files, the themes, the icons and the
     pages themselves. */
  var BLOCK = window.SheetBlock(function () { return core; });
  /* The shape of a character: the store, the slices, the seeds and the
     package. */
  var RECORD = window.SheetRecord(BLOCK);
  /* The edit mode of a page: one flag for the whole app, and the one wrench
     that turns it. */
  var EDIT = window.SheetEdit();
  /* A limited resource and the rest that gives it back: the rest counts the
     record through the counter module, so it names no counter of its own. */
  var COUNTER = window.SheetCounter();
  var REST = window.SheetRest(COUNTER);
  /* What a page's markup was built from: the key that says whether a repaint
     has anything to build. */
  var REBUILD = window.SheetRebuild();
  /* The gestures: the hold that reorders a list, and the swipe across the
     page that moves to the next tab. */
  var DRAG = window.SheetDrag();
  /* The one line and the one mark a spend, a refund or a tap leaves. */
  var FEEDBACK = window.SheetFeedback({ say: toast });
  /* A creature of the bestiary as a page holds it: its numbers, its stat
     block and its attack boxes. The summons calls one and the fight tracks
     one, so the two read it through the same module. */
  var CREATURE = window.SheetCreature(function () { return core; });
  /* The keypad that changes the hit points of one thing: a character and a
     creature of a fight answer the same question, so they open the same one. */
  var HPBOX = window.SheetHpBox(function () { return core; });
  /* The card of a spell: the summons, the stat block of a caster and the fight
     open the same one, so a spell reads the same wherever its name is tapped. */
  var SPELLCARD = window.SheetSpellCard(function () { return core; });

  /* ---- the registry ---- */

  var PAGES = BLOCK.pages();
  var MOUNTED = {};
  var current = '';

  /* A page joins the app by describing itself. The block decides whether the
     name is free and where the page sits; the style of a page is a tag of the
     shell, so it is made here. */
  function page(spec) {
    /* A page written again takes the place of the one on screen: the old
       one is unmounted first, so its markup and its mount do not linger. */
    var again = MOUNTED[spec && spec.id];
    var added = BLOCK.page(spec);
    if (again) unmountPage(added.id);
    if (added.css) styleFor(added);
    if (again && current === added.id) show(added.id);
    /* A panel goes into its page at once when the page is already there. */
    if (added.into && MOUNTED[added.into]) { mountPage(added.id); renderPage(added); }
    return added;
  }

  /* A page leaves the screen: its section, its paint and its own unmount, if
     it carries one. It stays in the registry and mounts again when shown. */
  function unmountPage(id) {
    var m = MOUNTED[id];
    if (!m) return false;
    try { if (m.spec.unmount) m.spec.unmount(m.section, api); } catch (e) {}
    if (m.section.parentNode) m.section.parentNode.removeChild(m.section);
    delete MOUNTED[id];
    REBUILD.forget(id);
    return true;
  }

  /* A page leaves the app: unmounted, out of the registry, its style gone. */
  function unregisterPage(id) {
    unmountPage(id);
    var gone = BLOCK.remove(id);
    var style = document.getElementById('style-' + id);
    if (style && style.parentNode) style.parentNode.removeChild(style);
    return gone;
  }

  /* The style of a page lives in a tag of its own, so a page that comes in a
     package carries its own with it. */
  function styleFor(spec) {
    var el = document.getElementById('style-' + spec.id);
    if (!el) {
      el = document.createElement('style');
      el.id = 'style-' + spec.id;
      document.head.appendChild(el);
    }
    el.textContent = spec.css || '';
  }

  /* An address goes to the browser of the phone, so a sign in can be
     approved there while the app waits at home. A page of a browser opens
     it in a new tab. */
  function openUrl(url) {
    if (window.SheetNet && window.SheetNet.openUrl) {
      try {
        return window.SheetNet.openUrl(url);
      } catch (e) {
        return 'error ' + String((e && e.message) || e);
      }
    }
    window.open(url, '_blank');
    return 'ok';
  }

  /* ---- what the build brought with it ---- */

  function readJson(id) {
    try { return JSON.parse(document.getElementById(id).textContent); } catch (e) { return {}; }
  }

  var SURGE = readJson('surge-data');
  var SEEDS = readJson('seed-data');
  var VERSION = (readJson('version-data') || {}).version || '';
  var CONDITIONS = readJson('conditions-data');

  /* The condition a description names, by the name it writes, so the pop-up
     carries the words of the book rather than a link out. */
  var CONDITION_BY_NAME = {};
  (CONDITIONS.conditions || []).forEach(function (c) {
    if (c && c.name) CONDITION_BY_NAME[String(c.name).toLowerCase()] = c;
  });

  /* ---- the data on disk ---- */

  /* The book, the library of features and the classes live in files beside
     the page and are read when a page asks for one, so a launch only pays
     for the character. Each has a live shape filled in place, so a page that
     took its reference at load sees the data arrive. */
  var BOOK = { spells: [], seed: [] };
  var FEATURES = { features: [] };
  var CLASSDATA = [];
  /* The class plugins read what the book says of a class from the same rows. */
  if (window.SheetClasses) window.SheetClasses.book(CLASSDATA);
  var BESTIARY = { creatures: {}, byName: {} };
  /* The bestiary is the whole corpus of the books, and more than one page
     reads it: the summons calls a creature, a fight tracks one. So the shell
     owns its shape rather than a page, and no page declares the file. The
     blocks are keyed by the name and the book; the index from a name to its
     block keeps the first book of the name, which is the one the app
     prefers, so a lookup by name has one answer. */
  BLOCK.data('bestiary', function (value) {
    var all = (value && value.creatures) || {};
    var index = {};
    Object.keys(all).forEach(function (key) {
      var name = String(all[key].name || '').toLowerCase();
      if (name && !index[name]) index[name] = key;
    });
    BESTIARY.creatures = all;
    BESTIARY.byName = index;
  });
  var SPELL_BY_NAME = {};
  var FEATURE_BY_KEY = {};
  var LOADING = {};
  var DATA_ERROR = {};

  /* The bridge of the phone, whichever side answers. The app adds it under
     two names, so a call asks the one that holds it rather than the one that
     was hoped for. */
  function phone(name) {
    if (window.SheetShell && typeof window.SheetShell[name] === 'function') return window.SheetShell;
    if (window.SheetNet && typeof window.SheetNet[name] === 'function') return window.SheetNet;
    return null;
  }

  /* The shell reads a file out of the app when it is there, and a page on
     the web fetches it. Either way the file is read when a page asks. */
  function readFile(file) {
    var shell = phone('read');
    if (shell) {
      try {
        var answer = shell.read(file);
        if (answer && typeof answer.then === 'function') {
          return answer.then(function (text) {
            if (text) return text;
            throw new Error('the app could not read ' + file);
          });
        }
        if (answer) return Promise.resolve(answer);
        return Promise.reject(new Error('the app could not read ' + file));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return fetch(file).then(function (r) {
      if (!r.ok) throw new Error(file + ': ' + r.status);
      return r.text();
    });
  }

  /* An answer from another origin comes through the shell, because the
     page cannot fetch it and the other origin cannot answer it. */
  function readUrl(url) {
    var asked = window.SheetBridge.call('fetchUrl', [url]);
    if (asked) {
      return asked.then(function (text) {
        if (text && String(text).indexOf('error ') !== 0) return text;
        throw new Error(text || 'no answer');
      });
    }
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ': ' + r.status);
      return r.text();
    });
  }

  /* The app updates itself: the shell fetches the new build into the
     storage of the app and hands it to the installer of the phone, which is
     the whole update. The browser is never asked as well, because the
     installer it would answer with is a download of the same file into a
     folder the phone then has to be told about. */
  /* A JSON body sent to the machine that serves the app, and its JSON
     answer. On the phone the shell sends it, because the page is https and
     the machine answers on the network of the house; in a browser the page
     posts it itself. */
  function postJson(url, body) {
    var text = JSON.stringify(body);
    var asked = window.SheetBridge.has('agent') ? window.SheetBridge.call('agent', [url, text]) : null;
    if (asked) {
      return asked.then(function (out) {
        if (!out || String(out).indexOf('error ') === 0) throw new Error(out || 'no answer');
        var env = JSON.parse(out);
        if (env.status < 200 || env.status > 299) throw new Error(env.status + ' ' + String(env.body || '').slice(0, 200));
        return JSON.parse(env.body);
      });
    }
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text }).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) throw new Error(r.status + ' ' + t.slice(0, 200));
        return JSON.parse(t);
      });
    });
  }

  function installUpdate(url) {
    var B = window.SheetBridge;
    if (!B.has('download') || !B.has('install')) {
      /* A page in a browser is served the newest build every time it
         loads, so the update of one is the page itself, loaded again. */
      setTimeout(function () { window.location.reload(); }, 500);
      return Promise.resolve('the page loads again');
    }
    return B.call('download', [url]).then(function (text) {
      if (!text || String(text).indexOf('error ') === 0) {
        return String(text || 'the download did not answer');
      }
      /* The answer is the window pausing, which the phone waits for, so it is
         the fact and not the attempt. Whatever it says is said to the player:
         a build that arrived short, or a launch the phone dropped, reaches the
         screen instead of a silence, and the tap that follows is the
         recovery. */
      return B.call('install', []).then(function (said) {
        return said === 'ok' ? 'ok' : String(said || 'the installer did not open');
      }, function (e) {
        return String((e && e.message) || e);
      });
    });
  }

  /* The address of the machine that serves the app. The update route asks
     it for a newer build, and the summons tab asks it for the creatures the
     app does not carry. */
  function server() {
    var ui = state.ui || {};
    if (ui.server) return ui.server;
    /* In a browser the page is served by the machine it talks to, so its own
       origin is the server: this machine on the house network, or a box that
       carries the same routes. The phone carries the page inside the app at
       an origin of its own, and talks to the house machine instead. */
    var app = window.SheetBridge && window.SheetBridge.has && window.SheetBridge.has('agent');
    if (!app && typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && location.hostname !== 'sheet.local') {
      return location.origin;
    }
    return '';
  }

  /* A page declares the file it reads with the shape the file fills, and
     reads it when it wants it: the loader names no file of its own. */
  function data(name, shape) {
    if (typeof shape === 'function') return BLOCK.data(name, shape);
    if (LOADING[name]) return LOADING[name];
    var file = 'data/' + name + '.json';
    LOADING[name] = readFile(file)
      .then(function (text) { return JSON.parse(text); })
      .then(function (value) {
        BLOCK.fill(name, value);
        delete DATA_ERROR[name];        /* a retry that worked clears the reason */
        if (current) refresh();
        return true;
      })
      .catch(function (e) {
        DATA_ERROR[name] = String((e && e.message) || e);
        delete LOADING[name];          /* so a later try reads it again */
        if (current) refresh();
        return false;
      });
    return LOADING[name];
  }

  /* ---- the style of a character ---- */

  /* The colours the app can wear. The first has no attribute of its own:
     it is the one the app came with. The three colours of the swatch are
     the ground, the accent and the light. */
  var THEMES = BLOCK.themes();
  [
    { id: '', label: 'Violet', blurb: 'The colours the app came with', swatch: ['#08070f', '#9b7bff', '#ffc44d'] },
    { id: 'blueRed', label: 'Blue and red', blurb: 'An electric blue, a hot red', swatch: ['#070a14', '#4c8dff', '#ff4b5c'] },
    { id: 'emerald', label: 'Emerald', blurb: 'A deep green, a warm gold', swatch: ['#060f0b', '#34d399', '#ffd166'] },
    { id: 'ember', label: 'Ember', blurb: 'A forge and its coals', swatch: ['#100807', '#ff7a45', '#ffd23f'] },
    { id: 'frost', label: 'Frost', blurb: 'Ice and pale light', swatch: ['#060a12', '#7fd8ff', '#c7a4ff'] },
    { id: 'crimson', label: 'Crimson', blurb: 'Blood and brass', swatch: ['#0d0509', '#ff4d6d', '#ffc44d'] },
    { id: 'verdigris', label: 'Verdigris', blurb: 'Old copper, green patina', swatch: ['#05100f', '#2dd4bf', '#f0b27a'] },
    { id: 'steel', label: 'Steel', blurb: 'Grey iron and a flame', swatch: ['#0a0b0e', '#b8c6e0', '#ff9f43'] },
    { id: 'heavyMetal', label: 'Heavy metal', blurb: 'Black leather, chrome and a hot red', swatch: ['#050506', '#d3d7de', '#ff4757'] }
  ].forEach(BLOCK.theme);


  /* The line icons share one dress. */
  function o(body) {
    return '<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + body + '</g>';
  }

  /* The icons the head of the app can carry, all drawn in the same box and
     the same weight. */
  var ICONS = BLOCK.icons();
  [
    { id: 'sigil',
      label: 'Rune',
      blurb: 'The rune the app came with',
      svg: '<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width=".9" opacity=".55"/>' +
        '<path d="M12 2.2V6M12 18v3.8M2.2 12H6M18 12h3.8" stroke="currentColor" stroke-width=".9" opacity=".35"/>' +
        '<path d="M12 6.4L17.6 12 12 17.6 6.4 12z" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
        '<circle cx="12" cy="12" r="1.7" fill="currentColor"/>'
    },
    { id: 'guitar',
      label: 'Guitar',
      blurb: 'Six strings, plugged in',
      svg: '<g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12.9 10.6c-.5-2 .3-3.6 1.7-4.6-1.5-.9-3.4-.6-4.4.8-.7 1-1.4 1.7-2.6 2.1-2.1.7-3.4 2.8-3.1 4.9.4 2.1 2.4 3.6 4.5 3.2 1.6-.2 2.8-1.3 3.3-2.9.4-1.1 1-1.8 2.2-2.1"/>' +
        '<path d="M12.6 12.1 18.4 6.3"/><path d="M17.5 5.2l1.4 1.4 2.3-2.3a1 1 0 0 0-1.4-1.4z"/>' +
        '<path d="M6 14.8l1.9 1.9"/></g>'
    },
    { id: 'sword',
      label: 'Sword',
      blurb: 'A blade and its guard',
      svg: o('<path d="M12 2.6 13.7 8v7.2h-3.4V8Z"/><path d="M7.4 16.6h9.2"/><path d="M12 16.6v4.2"/><path d="M10.2 20.8h3.6"/>')
    },
    { id: 'shield',
      label: 'Shield',
      blurb: 'A heater shield',
      svg: o('<path d="M12 3.2 19 5.8v5.7c0 5-3.2 8.3-7 9.9-3.8-1.6-7-4.9-7-9.9V5.8Z"/><path d="M8.8 9.6 12 7.6l3.2 2"/>')
    },
    { id: 'hammer',
      label: 'Hammer',
      blurb: 'A warhammer',
      svg: o('<path d="M12 21V9.4"/><path d="M7 4.4h10v5H7Z"/><path d="M9.4 4.4v5M14.6 4.4v5"/>')
    },
    { id: 'bow',
      label: 'Bow',
      blurb: 'A drawn bow',
      svg: o('<path d="M7 3.6c7 2.6 7 14.2 0 16.8"/><path d="M7 3.6v16.8"/><path d="M7 12h11.4"/><path d="M15.6 9.4 18.6 12l-3 2.6"/><path d="M9.8 10.4 7.6 12l2.2 1.6"/>')
    },
    { id: 'dagger',
      label: 'Dagger',
      blurb: 'A short blade',
      svg: o('<path d="M12 3.2 13.2 8.6v4h-2.4v-4Z"/><path d="M8.8 12.8h6.4"/><path d="M12 12.8v4.6"/><path d="M10.4 17.6h3.2"/>')
    },
    { id: 'flame',
      label: 'Flame',
      blurb: 'A fire that burns',
      svg: o('<path d="M12 2.8c2.8 3.6 6.4 6.4 6.4 10.8a6.4 6.4 0 0 1-12.8 0c0-3 1.8-4.6 3-6.2.6 1.6 1.2 2.6 2.4 3.2-.6-3.2 0-5.6 1-7.8Z"/><path d="M12 11c1 2 2.4 3.4 2.4 5.4a2.4 2.4 0 0 1-4.8 0c0-1.4.8-2.6 2.4-5.4Z"/>')
    },
    { id: 'eye',
      label: 'Eye',
      blurb: 'A watching eye',
      svg: o('<path d="M2.8 12C5.6 7.6 8.6 5.8 12 5.8s6.4 1.8 9.2 6.2c-2.8 4.4-5.8 6.2-9.2 6.2S5.6 16.4 2.8 12Z"/><circle cx="12" cy="12" r="2.6"/>')
    },
    { id: 'leaf',
      label: 'Leaf',
      blurb: 'A leaf and its rib',
      svg: o('<path d="M19.6 4.4C9.4 4.2 4.4 10 4.4 15.4c0 3 1.6 4.8 4 4.8 7 0 11.4-6.8 11.2-15.8Z"/><path d="M6.6 18.2c2.4-3.6 5.8-7.6 11-11"/>')
    },
    { id: 'book',
      label: 'Book',
      blurb: 'An open book',
      svg: o('<path d="M4.6 4.4c2.4-1 5.2-.7 7.4.6 2.2-1.3 5-1.6 7.4-.6v14.2c-2.4-1-5.2-.7-7.4.6-2.2-1.3-5-1.6-7.4-.6Z"/><path d="M12 5v14.2"/>')
    },
    { id: 'sun',
      label: 'Sun',
      blurb: 'A sun and its rays',
      svg: o('<circle cx="12" cy="12" r="3.8"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8"/>')
    },
    { id: 'fist',
      label: 'Fist',
      blurb: 'A closed fist',
      svg: o('<path d="M6.4 11.6V9a1.5 1.5 0 0 1 3 0V7a1.5 1.5 0 0 1 3 0v.4a1.5 1.5 0 0 1 3 0v2.4a1.6 1.6 0 0 1 2.8 1v3.8c0 3.4-2.4 5.8-6.1 5.8s-5.7-2.4-5.7-5.8Z"/><path d="M9.4 12.4v2.2M12.4 12.2v2.4"/>')
    },
    { id: 'skull',
      label: 'Skull',
      blurb: 'A skull',
      svg: o('<path d="M12 3.4c4.4 0 7.4 3 7.4 6.8 0 2.2-1.2 3.8-2.8 4.8v4H14v-2.2h-1.2V19h-1.6v-2.2H10V19H7.4v-4c-1.6-1-2.8-2.6-2.8-4.8C4.6 6.4 7.6 3.4 12 3.4Z"/><circle cx="9.4" cy="10.2" r="1.7"/><circle cx="14.6" cy="10.2" r="1.7"/><path d="M12 12.4 13 14.2h-2Z"/>')
    }
  ].forEach(BLOCK.icon);

  function themeOf(rec) {
    var wanted = rec && rec.theme;
    return THEMES.filter(function (t) { return t.id === wanted; })[0] || THEMES[0];
  }

  function iconOf(rec) {
    return (rec && rec.icon && ICONS[rec.icon]) ? rec.icon : 'sigil';
  }

  /* A theme a page brought carries its own colours, and its rule is written
     in a tag of its own the first time the character wears it, the way a
     page's style is written when the page joins. A theme the app ships has
     its rule in the page already, so it asks for no tag. */
  function themeStyle(theme) {
    var css = BLOCK.themeRule(theme);
    if (!css) return;
    var id = 'style-theme-' + theme.id;
    var tag = document.getElementById(id);
    if (!tag) {
      tag = document.createElement('style');
      tag.id = id;
      document.head.appendChild(tag);
    }
    if (tag.textContent !== css) tag.textContent = css;
  }

  /* The colours and the icon belong to the character being played, so they
     move when the character does. */
  function applyStyle() {
    var rec = state.characters[state.current] || {};
    var theme = themeOf(rec);
    if (theme.id) document.body.setAttribute('data-theme', theme.id);
    else document.body.removeAttribute('data-theme');
    themeStyle(theme);
    layoutStyle(rec);
    if (el.sigil) el.sigil.innerHTML = ICONS[iconOf(rec)].svg;
    paintTitle();
    paintRewind();
  }

  /* ---- the layout of a character's pages ----

     A character may carry style rules of its own for a page (the fairy
     writes them, to resize, hide or rearrange what a page shows):
     rec.layout = { pageId: css }. Every selector is held inside that page
     (#view-<page> ...), nothing is fetched (no url, no import), and the
     rules are worn only while the character is played. */
  function scopeCss(pageId, css) {
    var src = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!src) return { css: '' };
    if (/url\s*\(|@import|expression\s*\(|<\/?style|javascript:/i.test(src)) return { why: 'the rules may not fetch anything: no url(), no @import' };
    if (src.length > 6000) return { why: 'the rules are too long: keep them under 6000 characters' };
    var scope = '#view-' + pageId;
    var out = '';
    var at = 0;
    function selectorList(text) {
      var parts = text.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (!parts.length) throw new Error('a rule without a selector');
      return parts.map(function (sel) {
        if (/^(html|body|:root)\b/i.test(sel)) throw new Error('"' + sel + '" is outside the page: a rule styles what is inside ' + scope);
        if (sel === '&' || sel === ':scope') return scope;
        return scope + ' ' + sel.replace(/^&\s*/, '');
      }).join(',');
    }
    function block(stop) {
      var text = '';
      while (at < src.length) {
        var open = src.indexOf('{', at);
        var close = src.indexOf('}', at);
        if (close >= 0 && (open < 0 || close < open)) {
          if (src.slice(at, close).trim()) throw new Error('a declaration outside a rule: ' + src.slice(at, close).trim().slice(0, 40));
          at = close + 1;
          if (stop) return text;
          throw new Error('a } with no { before it');
        }
        if (open < 0) {
          if (src.slice(at).trim()) throw new Error('the rules end without their {}');
          at = src.length;
          break;
        }
        var head = src.slice(at, open).trim();
        at = open + 1;
        if (/^@media\b/i.test(head)) {
          text += head + '{' + block(true) + '}';
          continue;
        }
        if (head.charAt(0) === '@') throw new Error('only @media is allowed among the @ rules');
        var end = src.indexOf('}', at);
        if (end < 0) throw new Error('a rule is not closed');
        var body = src.slice(at, end);
        if (body.indexOf('{') >= 0) throw new Error('a rule inside a rule: only @media holds rules');
        at = end + 1;
        text += selectorList(head) + '{' + body.trim() + '}';
      }
      return text;
    }
    try { out = block(false); } catch (e) { return { why: e.message }; }
    return { css: out };
  }

  function layoutStyle(rec) {
    var tag = document.getElementById('style-layout');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'style-layout';
      document.head.appendChild(tag);
    }
    var text = '';
    Object.keys((rec && rec.layout) || {}).forEach(function (id) {
      var scoped = scopeCss(id, rec.layout[id]);
      if (scoped.css) text += '/* ' + id + ' */\n' + scoped.css + '\n';
    });
    if (tag.textContent !== text) tag.textContent = text;
  }

  /* The rules of a page written for the character played, or taken away
     when empty. The answer says why rules were refused. */
  function setLayout(pageId, css) {
    var rec = state.characters[state.current];
    if (!rec) return { ok: false, why: 'no character is played' };
    if (!PAGES.some(function (p) { return p.id === pageId; })) return { ok: false, why: 'no page ' + pageId + ': one of ' + PAGES.map(function (p) { return p.id; }).join(', ') };
    var scoped = scopeCss(pageId, css);
    if (scoped.why) return { ok: false, why: scoped.why };
    rec.layout = rec.layout || {};
    if (scoped.css) rec.layout[pageId] = String(css).trim(); else delete rec.layout[pageId];
    save();
    applyStyle();
    return { ok: true, worn: scoped.css };
  }

  /* What a page is made of, for the one who would change its layout: each
     element with its id, its classes, a few of its words and its box, and
     whether its children wrap to a second line or its content overflows. */
  function layoutMap(pageId) {
    var m = MOUNTED[pageId];
    if (!m) return { error: 'the page ' + pageId + ' is not open yet: show it first' };
    var count = 0;
    var base = m.section.getBoundingClientRect();
    function node(e, depth) {
      if (count > 160 || depth > 6) return null;
      var r = e.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      count += 1;
      var kids = Array.prototype.slice.call(e.children);
      var tops = {};
      kids.forEach(function (k) { var kr = k.getBoundingClientRect(); if (kr.width) tops[Math.round(kr.top)] = true; });
      var out = { tag: e.tagName.toLowerCase() };
      if (e.id) out.id = e.id;
      if (e.className && typeof e.className === 'string' && e.className.trim()) out['class'] = e.className.trim();
      var own = Array.prototype.filter.call(e.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); })
        .map(function (n) { return n.textContent.trim(); }).join(' ');
      if (!own && (e.tagName === 'INPUT' || e.tagName === 'BUTTON')) own = e.value || e.getAttribute('aria-label') || '';
      if (own) out.text = own.slice(0, 30);
      out.box = [Math.round(r.left - base.left), Math.round(r.top - base.top), Math.round(r.width), Math.round(r.height)].join(',');
      /* A row that wraps is a flex row whose children fall on a second
         line; a column, a grid or a list is meant to stack. */
      var cs = getComputedStyle(e);
      if (Object.keys(tops).length > 1 && kids.length > 1 && /flex/.test(cs.display) && /^row/.test(cs.flexDirection) && cs.flexWrap !== 'nowrap') {
        out.wraps = Object.keys(tops).length + ' lines';
      }
      if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible') out.overflows = true;
      var list = kids.map(function (k) { return node(k, depth + 1); }).filter(Boolean);
      if (list.length) out.children = list;
      return out;
    }
    return { page: pageId, width: Math.round(base.width), tree: node(m.section, 0), rules: ((state.characters[state.current] || {}).layout || {})[pageId] || '' };
  }

  /* ---- the shared helpers ---- */

  function esc(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* The marked pieces of a spell text: the damage in red, the saving
     throws in blue, and the conditions, which carry the reference. */
  function markup(text) {
    var out = esc(text);
    out = out.replace(/\[\[d:([^\]]*)\]\]/g, '<span class="tdmg">$1</span>');
    out = out.replace(/\[\[s:([^\]]*)\]\]/g, '<span class="tsav">$1</span>');
    out = out.replace(/\[\[c:([^\]]*)\]\]/g, '<span class="tcond" data-cond="$1" title="https://5e.tools/conditionsdiseases.html">$1</span>');
    return out;
  }

  /* One labelled field of a summary. */
  function field(label, value, cls, wide) {
    var text = value ? String(value) : '-';
    return '<span class="f' + (wide ? ' wide' : '') + '"><span class="k">' + esc(label) + '</span>' +
      '<span class="v' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span></span>';
  }

  /* The head of a list: the label, the rule that fills the row, and at most
     one small action at the far right. A page that builds a list of its own
     puts it above the rows, so the head and the rows read as one block. */
  function sectionHead(label, opts) {
    opts = opts || {};
    var action = opts.action;
    return '<div class="cshead"><span' + (opts.id ? ' id="' + esc(opts.id) + '"' : '') + '>' +
      esc(label) + '</span><span class="rule"></span>' +
      (action ? '<button class="mini" type="button" id="' + esc(action.id) + '" ' +
        'aria-label="' + esc(action.label) + '">+</button>' : '') +
      '</div>';
  }

  /* The source line of a description, as a link out to the book. */
  function sourceLine(ref) {
    var link = sourceLink(ref);
    return link ? '<p class="srcline">' + link + '</p>' : '';
  }

  /* The text of a spell or a feature, in blocks. */
  function renderBlocks(blocks) {
    var html = '';
    (blocks || []).forEach(function (b) {
      if (b.t === 'p') {
        html += '<p>' + (b.lead ? '<b>' + esc(b.lead) + '</b> ' : '') + markup(b.text) + '</p>';
      }
      else if (b.t === 'h') html += '<h3>' + markup(b.text) + '</h3>';
      else if (b.t === 'list') {
        html += '<ul>' + b.items.map(function (i) { return '<li>' + markup(i) + '</li>'; }).join('') + '</ul>';
      } else if (b.t === 'table') {
        if (b.caption) html += '<div class="tcap">' + esc(b.caption) + '</div>';
        html += '<table>';
        if (b.head && b.head.length) {
          html += '<thead><tr>' + b.head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead>';
        }
        html += '<tbody>' + b.rows.map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + markup(c) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
      }
    });
    return html;
  }

  /* The shape of a die, the way the app draws them: a d6 is a square, a
     d20 a hexagon. The rules hold the points and where the number sits. */
  function diePoints(sides) {
    var pts = (SR && SR.DIE_SHAPES) ? SR.DIE_SHAPES[sides] : '';
    if (pts) return pts;
    var built = [], i, a;
    for (i = 0; i < sides; i++) {
      a = -Math.PI / 2 + i * 2 * Math.PI / sides;
      built.push((12 + 9.2 * Math.cos(a)).toFixed(2) + ',' + (12 + 9.2 * Math.sin(a)).toFixed(2));
    }
    return built.join(' ');
  }

  /* The two rests, drawn: an hourglass for the short one, a moon for the
     long one, so a button or a count says which without the word. */
  var REST_ICON = {
    short: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9',
    long: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'
  };

  function restIcon(kind) {
    var d = REST_ICON[kind];
    if (!d) return '';
    return '<svg class="resticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
  }

  /* The die, with nothing in it. */
  function dieIcon(sides) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<polygon points="' + diePoints(sides) + '" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  }

  /* The die, with a number in it. */
  function dieBig(sides, number) {
    var lab = (SR && SR.DIE_LABEL && SR.DIE_LABEL[sides]) ? SR.DIE_LABEL[sides] : { y: 15, size: 9 };
    var out = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<polygon points="' + diePoints(sides) + '" fill="none" stroke="currentColor" stroke-width="1.5"/>';
    if (number !== '' && number !== null && number !== undefined) {
      out += '<text x="12" y="' + lab.y + '" text-anchor="middle" font-size="' + lab.size + '" fill="currentColor" ' +
        'font-family="Cinzel, Georgia, serif">' + number + '</text>';
    }
    return out + '</svg>';
  }
  /* The same class, written two ways on the sheet. */
  var SOURCE_CANON = {
    'izzet': 'Izzet engineer', 'high elf': 'High Elf', 'elf': 'High Elf', 'hex': 'Hexblade'
  };

  function canonSource(source) {
    var name = String(source || '').trim();
    return SOURCE_CANON[name.toLowerCase()] || name;
  }

  /* The class of the book, and the short name its button carries. */
  var CLASS_SHORT = {
    'Sorcerer': 'Sor', 'Warlock': 'War', 'Wizard': 'Wiz', 'Bard': 'Bar',
    'Cleric': 'Cle', 'Druid': 'Dru', 'Ranger': 'Ran', 'Paladin': 'Pal',
    'Hexblade': 'Hex', 'Izzet engineer': 'Izz', 'High Elf': 'Elf', 'Elf': 'Elf', 'elf': 'Elf'
  };

  function classShort(name) {
    return CLASS_SHORT[name] || String(name || '').slice(0, 3);
  }

  /* The class a spell came from, as the app colours it. */
  var SOURCE_CLASS = {
    'sorcerer': 'sorc',
    'wild magic': 'sorc',
    'warlock': 'warlock',
    'hexblade': 'warlock',
    'hex': 'warlock',
    'izzet': 'izzet',
    'izzet engineer': 'izzet',
    'elf': 'elf',
    'high elf': 'elf',
    'bard': 'bard',
    'creation': 'bard'
  };

  function sourceClass(source) {
    return SOURCE_CLASS[String(source || '').trim().toLowerCase()] || '';
  }

  /* A tag of a source: the looks the sheet already had (the sorcerer, the
     warlock, the Izzet engineer, the elf, the bard), and otherwise the colour
     of the class the source is, or the class of the subclass it names. */
  function sourceTag(source) {
    if (!source) return '';
    var name = canonSource(source);
    var cls = sourceClass(name);
    var rgb = !cls && window.SheetClasses ? window.SheetClasses.colourOf(name) : '';
    var style = rgb ? ' style="color:rgb(' + rgb + ');border-color:rgba(' + rgb + ',.45);background:rgba(' + rgb + ',.10)"' : '';
    return '<span class="src' + (cls ? ' ' + cls : '') + '"' + style + '>' + esc(name) + '</span>';
  }

  /* The book and the page a thing sits on, as words and as the address of
     the page in the book: "Source: AU, page 28" and
     https://5e.tools/book.html#au.page:28. Every item of the book carries
     its own, so a player can read where a rule comes from. */
  function sourceLink(ref) {
    if (!ref || !ref.book) return '';
    var label = 'Source: ' + ref.book + (ref.page ? ', page ' + ref.page : '');
    var url = 'https://5e.tools/book.html#' + String(ref.book).toLowerCase() +
      (ref.page ? '.page:' + ref.page : '');
    return '<a class="srclink" href="' + esc(url) + '" target="_blank" rel="noreferrer">' + esc(label) + '</a>';
  }

  /* A class of the book, by name. */
  function classInfo(name) {
    for (var i = 0; i < CLASSDATA.length; i++) if (CLASSDATA[i].name === name) return CLASSDATA[i];
    return null;
  }

  /* The classes of a character, with what the rules need of each one. */
  function classRows(ch) {
    return ((ch && ch.classes) || []).map(function (k) {
      var info = classInfo(k.name) || {};
      return {
        name: k.name,
        level: Math.max(0, Number(k.level) || 0),
        subclass: k.subclass || '',
        ability: info.ability || '',
        caster: info.caster || ''
      };
    });
  }

  /* The class that carries the most levels, whose ability the app reads for
     the character as a whole. */
  function primaryClass(ch) {
    var best = null;
    classRows(ch).forEach(function (r) {
      if (!r.ability) return;
      if (!best || r.level > best.level) best = r;
    });
    return best;
  }

  function primaryAbility(ch) {
    var p = primaryClass(ch);
    return p ? p.ability : 'cha';
  }

  /* The wrench of the page on screen. The edit mode is one flag for the whole
     app, so the shell owns the button, its pressed state and the repaint, and
     a page says only what its button is called. */
  var wrenchEl = null;

  function paintWrench() {
    if (!wrenchEl) return;
    wrenchEl.setAttribute('aria-pressed', EDIT.of(current) ? 'true' : 'false');
  }

  function wrench(spec) {
    var pageId = current;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'wrench';
    b.setAttribute('aria-label', spec.label);
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';
    b.setAttribute('aria-pressed', EDIT.of(pageId) ? 'true' : 'false');
    b.addEventListener('click', function () {
      EDIT.toggle(pageId);
      refresh();
    });
    wrenchEl = b;
    return b;
  }

  /* The history of the character: a snapshot before every change a rest
     can take back. */
  function pushSnapshot(api) {
    REST.push(api.character());
  }

  /* One history holds every counter, so the rewind is a button of the shell
     and not of a page. It is on the head when there is a change to take back,
     and it goes when the history runs out. */
  function paintRewind() {
    if (!el.rewind) return;
    var rec = state.characters[state.current];
    var n = (rec && rec.char && rec.char.history) ? rec.char.history.length : 0;
    /* The phone's back key is the rewind there, so the head keeps the
       button for a page in a browser only. */
    el.rewind.hidden = !n || isPhone();
    el.rewind.title = n ? n + (n === 1 ? ' change' : ' changes') + ' to take back' : '';
  }

  /* The sorcery points bump when they move. */
  function bumpSp() {
    var el = document.getElementById('spValue');
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /* Drops a feature of the library into the character being played and
     repaints, the way the agent will. */
  function plugFeature(key) {
    var rec = state.characters[state.current];
    if (!rec || !rec.char || !FEATURE_BY_KEY[key]) return false;
    if (rec.char.features.some(function (f) { return f.key === key; })) return true;
    var f = FEATURE_BY_KEY[key];
    rec.char.features.push({
      key: f.key,
      name: f.name,
      source: f.source || '',
      active: !!f.active,
      recovery: f.recovery || 'passive',
      bind: f.bind || null,
      max: Number(f.uses) || 0,
      left: Number(f.uses) || 0,
      cost: f.cost || '',
      short: f.short === undefined ? null : f.short,
      hidden: !!f.hidden
    });
    save();
    refresh();
    return true;
  }

  /* The shelf is a module of its own: the sign in, the token and the folder
     of characters are its jobs, and the shell hands it the client, the store
     and the opener of a URL. It goes on the exchange box as one door. */
  var SHELF = window.SheetShelf({
    net: window.SheetGit,
    store: {
      get: function (key) { return (state.ui || {})[key]; },
      set: function (key, value) { state.ui = state.ui || {}; state.ui[key] = value; save(); }
    },
    openUrl: openUrl,
    packageOf: packageOf
  });

  var core = {
    /* the fairy's door, opened by its page: the shell hands it a request */
    fairy: null,
    R: R,
    SR: SR,
    counter: COUNTER,
    rest: REST,
    feedback: FEEDBACK,
    creature: CREATURE,
    hpBox: HPBOX,
    spellCard: SPELLCARD,
    library: {
      book: BOOK,
      bookByName: SPELL_BY_NAME,
      features: FEATURES,
      featureByKey: FEATURE_BY_KEY,
      bestiary: BESTIARY,
      classData: CLASSDATA,
      classInfo: classInfo,
      classRows: classRows,
      canonSource: canonSource,
      classShort: classShort,
      sourceTag: sourceTag,
      primaryAbility: primaryAbility,
      seeds: SEEDS,
      surge: SURGE,
      /* the weapons and the gear of the books, filled by the pages that
         declare their files, read by every page that needs them */
      weapons: [],
      gear: { armour: [], magic: [] },
      /* the feats of the books, filled by the features page */
      feats: [],
      /* the species of the books and the rules of making a character,
         filled by the character page */
      species: [],
      rules: {},
      /* the row an item of the books takes on the sheet, by its name: the
         equipment page fills it */
      gearRow: null,
      /* a weapon of the sheet as the attack reads it: its damage, its
         properties and its bonus, from the books and the row; the
         equipment page fills it */
      weaponOf: null,
      data: data,
      dataError: DATA_ERROR
    },
    chrome: {
      esc: esc,
      markup: markup,
      field: field,
      sectionHead: sectionHead,
      renderBlocks: renderBlocks,
      sourceLine: sourceLine,
      dieIcon: dieIcon,
      restIcon: restIcon,
      themes: THEMES,
      icons: ICONS,
      iconOf: iconOf,
      isPhone: isPhone,
      bumpSp: bumpSp
    },
    exchange: {
      exportCharacter: exportCharacter,
      packageOf: packageOf,
      openPasteLink: openPasteLink,
      linkOf: linkOf,
      shareLink: shareLink,
      pickFile: pickFile,
      readUrl: readUrl,
      postJson: postJson,
      server: server,
      version: VERSION,
      installUpdate: installUpdate,
      openUrl: openUrl,
      inviteLink: inviteLink,
      readInvite: readInvite,
      joinInvite: joinInvite,
      clipText: clipText,
      scanQr: scanQr,
      qrSvg: qrSvg,
      shelf: SHELF
    }
  };

  /* ---- the store ---- */

  /* The pages a character starts with: each page says whether it is one of
     them, so the app keeps no list of its own. */
  function defaultPages() { return BLOCK.defaults(); }

  var state = RECORD.load(window.localStorage);

  /* The pictures live beside the store, so the store keeps room for the
     rest; a picture written there writes the store again without it. */
  var IMAGES = window.SheetImages({ onStored: function () { save(); } });
  core.images = IMAGES;   /* a page that draws a picture fits it the same way */

  /* A store that is full refuses the write, and the player hears it once,
     until a write goes through again: a change that is not kept is never
     silent. */
  var unsaved = false;

  function save() {
    IMAGES.sync(state);
    try {
      localStorage.setItem(RECORD.STORE, IMAGES.storeText(state));
      unsaved = false;
    } catch (e) {
      if (!unsaved) toast('That change was not saved: the storage of the app is full.');
      unsaved = true;
    }
  }

  /* ---- the overlay ---- */

  var sheet = (function () {
    var stack = [];
    var term = '';

    function top() { return stack[stack.length - 1]; }

    /* Opening the layer that is already on top replaces it, so a page can
       paint itself again without stacking a copy. */
    function open(layer) {
      var t = top();
      /* The layer that leaves keeps the place it was read at, so the one
         under a spell comes back where it was when the spell closes. */
      if (t) {
        t.scroll = el.sheetIn.scrollTop;
        if (t.id === layer.id && layer.scroll === undefined) layer.scroll = t.scroll;
      }
      if (t && t.id === layer.id) {
        /* the same layer again replaces the one on top */
        stack[stack.length - 1] = layer;
      } else {
        stack.push(layer);
        if (layer.search) term = '';
      }
      paint();
    }

    function close() {
      var layer = stack.pop();
      if (layer) layer.scroll = el.sheetIn.scrollTop;
      if (layer && layer.onClose) layer.onClose();
      if (!stack.length) {
        el.sheet.hidden = true;
        el.sheetMeta.innerHTML = '';
        el.sheetText.innerHTML = '';
        el.sheetList.innerHTML = '';
        return;
      }
      paint();
    }

    function paint() {
      var layer = top();
      /* A new layer does not carry the pop-up of the description under it. */
      el.condTip.hidden = true;
      if (!layer) { el.sheet.hidden = true; return; }
      el.sheet.classList.toggle('dock', !!layer.dock);
      el.sheet.hidden = false;
      el.sheetTitle.textContent = layer.title || '';
      el.sheetTag.textContent = layer.tag || '';
      el.sheetTag.hidden = !layer.tag;
      el.sheetMeta.className = layer.metaClass || 'sheet-meta';
      el.sheetMeta.innerHTML = layer.meta || '';
      el.sheetText.innerHTML = layer.text || '';
      el.sheetList.innerHTML = typeof layer.list === 'string' ? layer.list : '';
      el.sheetList.hidden = !layer.list;
      el.sheetSearch.hidden = !layer.search;
      if (layer.search) el.sheetSearch.value = term;
      el.sheetSearch.placeholder = layer.placeholder || 'Search the grimoire';
      el.grimoireLevel.hidden = !layer.level;
      if (layer.level) {
        el.grimoireLevel.textContent = layer.levelLabel || '';
        el.grimoireLevel.setAttribute('aria-pressed', layer.levelOn ? 'true' : 'false');
      }
      el.sheetActions.innerHTML = '';
      (layer.actions || []).forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button';
        if (a.kind) b.className = a.kind;
        b.textContent = a.label;
        b.addEventListener('click', function () { a.onClick(el.sheet); });
        el.sheetActions.appendChild(b);
      });
      if (layer.onPaint) layer.onPaint(el.sheet);
      /* The list is written from a string, so the place of the layer is put
         back by hand once it is on screen. */
      el.sheetIn.scrollTop = layer.scroll || 0;
    }

    function closeAll() {
      while (stack.length) {
        var layer = stack.pop();
        if (layer && layer.onClose) layer.onClose();
      }
      el.sheet.hidden = true;
      el.sheetMeta.innerHTML = '';
      el.sheetText.innerHTML = '';
      el.sheetList.innerHTML = '';
    }

    return {
      open: open,
      close: close,
      closeAll: closeAll,
      top: top,
      search: function () { return term; },
      setSearch: function (v) { term = v; }
    };
  })();

  /* The rows of a list and the layer it opens are one module, and it is
     handed the layer it paints into and the escaper of the app. */
  var CARD = window.SheetCard(sheet, esc);
  core.card = CARD;

  /* The cast block: the button at the bottom of a page that casts, in the
     volley's look. The attack page asks for the same row. */
  core.cast = window.SheetCast();

  /* The roll block: the control a page places and the drawing of a roll. It
     draws with the dice of the shell and throws them with the rules, so it is
     handed both. */
  core.roll = window.SheetRoll({ rules: R, dieIcon: dieIcon, esc: esc });

  /* The level slider, the two attack boxes and the toggle: the spell page's
     slider, the summon's swing and the volley's column, the volley's chip, each
     one block. The boxes are named by the way they read, across and stacked, so
     a brief that names one cannot be read as the other. Both are handed the
     roll block, because a box draws its damage in the one rendering of a roll
     the sheet has. */
  core.slider = window.SheetSlider();
  var ATTACK = window.SheetAttackBox({ dieBig: dieBig, dieIcon: dieIcon, esc: esc, roll: core.roll });
  core.horizontalAttackBox = ATTACK.horizontal;
  core.verticalAttackBox = ATTACK.vertical;
  core.attackCard = ATTACK.card;
  /* The class plugins: the mechanics of each class, read on a character. */
  core.classes = window.SheetClasses;
  core.toggle = window.SheetToggle();
  /* The character's own library, laid into the books while it is played. */
  core.own = window.SheetOwn(function () { return core; });
  /* The ability a character casts with, for the attributes of the rules
     (the spell save DC, the spell attack). */
  SR.hooks.primary = function (ch) { return primaryAbility(ch); };
  /* The origin of a character: its species, its scores, its background. */
  core.origin = window.SheetOrigin(function () { return core; });

  /* ---- the toast ---- */

  var toastTimer = null;

  function toast(message) {
    el.spentToast.textContent = message;
    el.spentToast.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.spentToast.classList.remove('on'); }, 3000);
  }

  /* ---- the characters ---- */

  function characterList() {
    return Object.keys(state.characters).map(function (id) {
      var rec = state.characters[id] || {};
      var ch = rec.char || {};
      return {
        id: id,
        rec: rec,
        name: ch.name || 'Unnamed character',
        level: ch.level ? 'level ' + ch.level : '',
        line: classLine(ch),
        current: id === state.current
      };
    });
  }

  function homeId() {
    var home = PAGES.filter(function (p) { return p.home; })[0];
    return home ? home.id : current;
  }

  /* The list of the characters, top down, and the way to add one. A device
     that holds none opens on the ways in, which is the same list. */
  /* The characters are cards: the picture of each, or its icon on its own
     colours when it has none, then its icon and its name over its classes.
     A tap on the card plays it; the cross in its corner removes it; the
     last card adds one. The card of the one being played is lit. */
  function characterCard(c) {
    var theme = themeOf(c.rec);
    var sw = theme.swatch || ['#08070f', '#9b7bff', '#ffc44d'];
    var icon = ICONS[iconOf(c.rec)];
    var pic = c.rec.image && c.rec.image.data;
    var glyphOf = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (icon ? icon.svg : '') + '</svg>';
    return '<div class="ccard' + (c.current ? ' here' : '') + '" style="--cc:' + esc(sw[1]) + ';--cg:' + esc(sw[0]) + '">' +
      '<button type="button" class="ccpick" data-id="' + esc(c.id) + '" aria-label="' +
        esc((c.current ? 'Playing ' : 'Play ') + c.name) + '">' +
      '<span class="ccpic">' + (pic ? '<img src="' + esc(pic) + '" alt="">' : '<span class="ccbig">' + glyphOf + '</span>') + '</span>' +
      '<span class="ccname"><span class="ccico">' + glyphOf + '</span><span class="ccn">' + esc(c.name) + '</span></span>' +
      '<span class="ccline">' + esc(c.line || c.level) + '</span></button>' +
      '<button type="button" class="ccdel" data-del="' + esc(c.id) + '" aria-label="Remove ' + esc(c.name) + '">&times;</button>' +
      '</div>';
  }

  function openCharacters() {
    var list = characterList();
    if (!list.length) { openIntake(); return; }
    sheet.open({
      id: 'characters',
      title: 'Characters',
      list: '<div class="ccards">' + list.map(characterCard).join('') +
        '<button type="button" class="ccard ccadd" data-add="1"><span class="ccplus">+</span><span>Add a character</span></button></div>',
      onList: function (ev) {
        var t = ev.target.closest('[data-del],[data-add],[data-id]');
        if (!t) return;
        if (t.dataset.del !== undefined) { openRemoveCharacter(t.dataset.del); return; }
        if (t.dataset.add !== undefined) { openIntake(); return; }
        switchCharacter(t.dataset.id);
      }
    });
  }

  function reshow() {
    var on = enabled().some(function (p) { return p.id === current; });
    show(on ? current : homeId());
  }

  function switchCharacter(id) {
    if (!state.characters[id]) return;
    state.current = id;
    registerPluginPages(state.characters[id]);
    save();
    sheet.closeAll();
    reshow();
  }

  /* The ways a character gets into the app. One list with two callers: the
     switcher when it holds nothing, and its add row. A page that owns a way
     in puts it here, so no flow is written twice. */
  function intakes() {
    var list = [
      {
        id: 'class',
        label: 'From a class',
        run: function () {
          /* The class, the library and the origin books have to be there
             before the creator can show them. */
          data('classes').then(function (ok) {
            return ok ? Promise.all([data('features'), data('species'), data('rules'), data('feats')]).then(function () { return true; }) : false;
          }).then(function (ok) {
            if (ok) openClassChooser();
          });
        }
      },
      {
        id: 'random',
        label: 'Randominator',
        run: openRandomLevel
      },
      {
        id: 'file',
        label: 'From a file',
        run: function () { pickFile(); }
      },
      {
        id: 'link',
        label: 'From a link',
        run: openPasteLink
      }
    ];
    return list;
  }

  /* The ways in are tiles a thumb finds, each with its drawing. */
  var INTAKE_GLYPH = {
    'class': 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
    blank: 'M12 5v14M5 12h14',
    random: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01',
    file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'
  };

  function intakeRows() {
    return '<div class="mtiles intiles">' + intakes().map(function (a) {
      return '<button type="button" class="mtile" data-intake="' + a.id + '">' +
        glyphSvg(INTAKE_GLYPH[a.id] || GLYPH_PAGE) + '<span>' + esc(a.label) + '</span></button>';
    }).join('') + '</div>';
  }

  /* The file of a character is named after it, so the name of the file is
     the name to show. */
  function shelfLabel(file) {
    var n = String(file || '').replace(/\.json$/i, '').replace(/[-_]+/g, ' ').trim();
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'A character';
  }

  /* The classes of a character of the shelf, the way a player says them: the
     class and its level, never the archetype, which is a word of the sheet
     and not of the table. */
  function classLine(ch) {
    var bits = [];
    ((ch && ch.classes) || []).forEach(function (k) {
      if (k && k.name) bits.push(k.name + (k.level ? ' ' + k.level : ''));
    });
    if (!bits.length && ch && ch.level) bits.push('level ' + ch.level);
    return bits.join(' \u00b7 ');
  }

  /* The mark of the shelf, drawn in the same line and the same weight as the
     icons of the head. */
  var GH_MARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" aria-hidden="true" focusable="false">' +
    '<circle cx="6.5" cy="5" r="2.1"/><circle cx="6.5" cy="19" r="2.1"/><circle cx="17.5" cy="9" r="2.1"/>' +
    '<path d="M6.5 7.1v9.8"/><path d="M17.5 11.1v1.4c0 2.2-1.9 3.4-4 3.4H8.6"/></svg>';

  /* The ways in. The shelf is one row that stays closed: a new device does
     not call GitHub on the way in, because the network is not there every
     time and the shelf is not the quick route to a character. The row is the
     only thing on this screen that reaches the network, and it opens the
     characters the shelf holds, each with its classes and its level. */
  function openIntake() {
    var gh = { open: false, state: 'idle', chars: [] };

    function ghBody() {
      if (gh.state === 'loading') return '<div class="ghnote">asking GitHub</div>';
      if (gh.state === 'failed') {
        return '<div class="ghnote">GitHub did not answer</div>' +
          '<div class="crow" role="button" tabindex="0" data-ghretry="1"><span class="cn">Try again</span></div>';
      }
      if (gh.state === 'none') return '<div class="ghnote">Start or join a campaign in the settings, and its characters are here.</div>';
      if (!gh.chars.length) return '<div class="ghnote">The shelf holds no character yet.</div>';
      return gh.chars.map(function (c) {
        return CARD.line({
          name: { text: shelfLabel(c.name) },
          meta: { text: '', data: { classes: '1' } },
          data: { shelf: c.url },
          pick: true
        });
      }).join('');
    }

    function paint() {
      CARD.list({
        id: 'intake',
        title: 'A character',
        dock: true,
        rows: intakeRows() +
          '<div class="crow ghrow' + (gh.open ? ' open' : '') + '" role="button" tabindex="0" data-gh="1">' +
          '<span class="ghico">' + GH_MARK + '</span>' +
          '<span class="cn">' + esc(SHELF.current() ? SHELF.current().name : 'GitHub') + '</span>' +
          '<span class="ghchev"></span></div>' +
          (gh.open ? '<div class="ghlist">' + ghBody() + '</div>' : ''),
        onPick: onPick
      });
      if (gh.open && gh.state === 'ready') labelChars();
    }

    /* The record of each character is read once the list is on screen, and
       its classes are written into the row it belongs to, so the list is
       painted once and nothing moves under the finger. */
    /* A character of the shelf is read through the API, with the key of
       the campaign, and by its address when the API will not say. */
    function shelfText(c, bare) {
      return SHELF.read(c.name, c.ref, bare).catch(function () { return readUrl(c.url); });
    }

    function labelChars() {
      gh.chars.forEach(function (c) {
        shelfText(c, true).then(function (text) {
          var pkg = JSON.parse(text);
          var ch = (pkg && pkg.record && pkg.record.char) || (pkg && pkg.char) || {};
          var line = classLine(ch);
          if (!line) return;
          var layer = sheet.top();
          if (!layer || layer.id !== 'intake') return;
          var rows = el.sheetList.querySelectorAll('[data-shelf]');
          for (var i = 0; i < rows.length; i++) {
            if (rows[i].dataset.shelf !== c.url) continue;
            var cell = rows[i].querySelector('[data-classes]');
            if (cell) cell.textContent = line;
            return;
          }
        }).catch(function () {});
      });
    }

    function load() {
      if (!SHELF.hasShelf()) { gh.state = 'none'; paint(); return; }
      gh.state = 'loading';
      paint();
      SHELF.characters('').then(function (chars) {
        gh.chars = chars || [];
        gh.state = 'ready';
        paint();
      }).catch(function () {
        gh.state = 'failed';
        paint();
      });
    }

    function onPick(picked) {
      if (!picked) return;
      if (picked.ghretry !== undefined) { load(); return; }
      if (picked.gh !== undefined) {
        if (gh.open) { gh.open = false; paint(); return; }
        gh.open = true;
        if (gh.state === 'ready') paint(); else load();
        return;
      }
      if (picked.shelf !== undefined) {
        var entry = gh.chars.filter(function (c) { return c.url === picked.shelf; })[0];
        (entry ? shelfText(entry).then(importPackage) : importUrl(picked.shelf)).then(function (answer) {
          toast(landed(answer, 'that character did not come'));
        }).catch(function (e) { toast(String((e && e.message) || e)); });
        return;
      }
      if (picked.intake === undefined) return;
      var one = intakes().filter(function (a) { return a.id === picked.intake; })[0];
      if (one) one.run();
    }

    paint();
  }

  /* A link the player pasted. The link and the address of a file on GitHub
     both come in by the same door, so there is one way to read them. */
  function openPasteLink() {
    sheet.open({
      id: 'pastelink',
      title: 'From a link',
      dock: true,
      metaClass: 'sheet-meta one',
      meta: '<input class="sheet-search" id="pasteLink" type="url" placeholder="the link of a character" aria-label="The link of a character">',
      actions: [{
        label: 'Fetch',
        onClick: function (root) {
          var field = root.querySelector('#pasteLink');
          var where = field && field.value ? field.value.trim() : '';
          if (!where) return;
          if (readInvite(where)) {
            joinInvite(where).then(function (answer) {
              if (answer.ok) sheet.close();
              toast(answer.ok ? 'you joined ' + answer.campaign.name : answer.why);
              refresh();
            });
            return;
          }
          importAny(where).then(function (answer) {
            toast(landed(answer, 'that link holds no character'));
          });
        }
      }]
    });
  }

  /* ---- the packages ---- */

  /* A character leaves the app as a package: the record writes it, with
     every slice a page owns, and the pages it carries travel beside it. */
  function packageOf(rec) { return RECORD.packageOf(rec); }

  /* One character, one name, wherever it sits: the file is named after the
     character. The export, the shelf write and the shelf read all use it. */
  function packageName(rec) {
    var name = ((rec.char && rec.char.name) || 'character').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'character';
    return name + '.json';
  }

  /* A name that is taken does not stop the import: the new one is called
     something else, so nothing is ever replaced by accident. */
  function freeName(name) {
    var taken = {};
    Object.keys(state.characters).forEach(function (id) {
      taken[((state.characters[id].char || {}).name || '').toLowerCase()] = true;
    });
    var out = name;
    var n = 2;
    while (taken[out.toLowerCase()]) { out = name + ' ' + n; n += 1; }
    return out;
  }

  /* A page of a package joins the app by the same door as a page the app
     ships, with every key a page may carry, so it is not a cousin of one. */
  function registerPluginPage(p) {
    var spec = BLOCK.plugin(p);
    if (!spec) return null;
    /* The same page registered again is the page already there. */
    var there = PAGES.filter(function (x) { return x.id === spec.id; })[0];
    if (there && there.plugin && there.source === spec.source) return there;
    try {
      return page(spec);
    } catch (e) {
      toast(String((e && e.message) || e));
      return null;
    }
  }

  /* The pages of a package belong to the character that brought them: they
     are registered when it is played, and the pages of the one before go,
     so one character's package never runs on another's sheet. */
  function registerPluginPages(rec) {
    var wanted = {};
    ((rec && rec.pluginPages) || []).forEach(function (p) { if (p && p.id) wanted[p.id] = true; });
    PAGES.filter(function (x) { return x.plugin && !wanted[x.id]; })
      .map(function (x) { return x.id; })
      .forEach(unregisterPage);
    ((rec && rec.pluginPages) || []).forEach(function (p) { registerPluginPage(p); });
  }

  /* A page written while the app runs, the agent's way in: it belongs to
     the character being played, like a page a package brought, travels in
     its package, and is turned on. An id of the app is refused. What the
     page said when it compiled is in the answer, so the writer can fix it. */
  function installPage(p) {
    var rec = state.characters[state.current];
    if (!rec) return { ok: false, why: 'no character is played' };
    if (!p || !/^[a-z][a-z0-9-]{1,30}$/.test(String(p.id || ''))) return { ok: false, why: 'the id must be 2 to 31 lowercase letters, digits or dashes' };
    if (PAGES.some(function (x) { return x.id === p.id && !x.plugin; })) return { ok: false, why: 'the id ' + p.id + ' is a page of the app' };
    if (p.into && (p.into === 'agent' || !PAGES.some(function (x) { return x.id === p.into && !x.plugin; }))) {
      return { ok: false, why: 'a panel goes into a page of the app: ' + PAGES.filter(function (x) { return !x.plugin && !x.hidden && x.id !== 'agent'; }).map(function (x) { return x.id; }).join(', ') };
    }
    var spec = registerPluginPage(p);
    if (!spec) return { ok: false, why: 'the page did not register' };
    rec.pluginPages = (rec.pluginPages || []).filter(function (x) { return x.id !== p.id; }).concat([p]);
    /* A tab is turned on; a panel shows wherever its page does. */
    if (!p.into) {
      var list = rec.pages ? rec.pages.slice() : defaultPages();
      if (list.indexOf(p.id) < 0) list.push(p.id);
      rec.pages = list;
    }
    save();
    return { ok: !spec.error, why: spec.error || '' };
  }

  function removePage(id) {
    var rec = state.characters[state.current];
    if (!rec) return false;
    var had = (rec.pluginPages || []).some(function (x) { return x.id === id; });
    rec.pluginPages = (rec.pluginPages || []).filter(function (x) { return x.id !== id; });
    rec.pages = (rec.pages || []).filter(function (x) { return x !== id; });
    unregisterPage(id);
    save();
    return had;
  }

  /* What a page shows when it broke, or nothing. */
  function pageErrorOf(id) {
    var m = MOUNTED[id];
    var box = m && m.section.querySelector('.page-error');
    return box ? box.textContent : '';
  }

  /* A package that brings pages brings code, and the code runs with the
     rights of the app: it can read the sheet and the sign in to GitHub. The
     player sees the pages and chooses, once, at the import. The character
     comes in either way. */
  function askForPages(pkg, pages) {
    return new Promise(function (done) {
      var answered = false;
      function answer(withPages) {
        if (answered) return;
        answered = true;
        sheet.close();
        done(withPages);
      }
      var names = pages.map(function (p) {
        return '<li>' + esc((p && (p.title || p.id)) || 'a page') + '</li>';
      }).join('');
      sheet.open({
        id: 'pkgpages',
        title: (pkg.name || 'This character') + ' brings pages',
        text: '<p>' + esc('These pages carry their own code. It runs like the app itself: it can read every character and your GitHub sign in. Take them only from someone you trust.') + '</p><ul>' + names + '</ul>',
        actions: [
          { label: 'With its pages', onClick: function () { answer(true); } },
          { label: 'Without', onClick: function () { answer(false); } }
        ],
        onClose: function () { answer(false); }
      });
    });
  }

  function importPackage(text) {
    var pkg = null;
    try { pkg = JSON.parse(text); } catch (e) { return Promise.resolve({ ok: false, why: 'that file is not a character' }); }
    if (!pkg || (pkg.kind !== 'custom-sheet-character' && pkg.kind !== 'dnd-sheet-character') || !pkg.record) {
      return Promise.resolve({ ok: false, why: 'that file is not a character' });
    }
    var pages = (Array.isArray(pkg.pages) ? pkg.pages : []).filter(function (p) { return p && p.id; });
    if (!pages.length) return Promise.resolve(landPackage(pkg, []));
    return askForPages(pkg, pages).then(function (withPages) {
      return landPackage(pkg, withPages ? pages : []);
    });
  }

  function landPackage(pkg, pages) {
    /* The pages of the package are registered before the record is seeded,
       so a page that carries a slice arrives with it filled. */
    var refused = [];
    pages = pages.filter(function (p) {
      if (registerPluginPage(p)) return true;
      refused.push(p.title || p.id);
      return false;
    });
    var rec = RECORD.packageIn(pkg);
    rec.char.name = freeName((rec.char.name || pkg.name || 'Unnamed character'));
    /* The pages of the package are registered and the character plays them. */
    if (pages.length) {
      rec.pluginPages = pages;
      var list = rec.pages ? rec.pages.slice() : defaultPages();
      pages.forEach(function (p) {
        if (p && p.id && list.indexOf(p.id) < 0) list.push(p.id);
      });
      rec.pages = list;
    }
    addCharacter(rec);
    return { ok: true, name: rec.char.name, refused: refused };
  }

  /* The line an import leaves: who arrived, and a page that was refused. */
  function landed(answer, fallback) {
    if (!answer || !answer.ok) return (answer && answer.why) || fallback;
    var line = answer.name + ' is here';
    if (answer.refused && answer.refused.length) line += ', without ' + answer.refused.join(', ');
    return line + '.';
  }

  /* The export goes to the phone, which offers it to send. */
  function exportCharacter() {
    var rec = state.characters[state.current];
    if (!rec) return { ok: false, why: 'no character' };
    var name = packageName(rec);
    var text = JSON.stringify(packageOf(rec), null, 2);
    var shell = phone('share');
    if (shell) {
      try {
        var answer = shell.share(name, text);
        if (answer && answer.indexOf('error ') === 0) return { ok: false, why: answer };
        return { ok: true, name: name };
      } catch (e) {
        return { ok: false, why: String((e && e.message) || e) };
      }
    }
    /* On the web the file is offered as a download. */
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return { ok: true, name: name };
    } catch (e) {
      return { ok: false, why: String((e && e.message) || e) };
    }
  }

  /* ---- the exchange ---- */

  /* A character leaves the app as a package, and there are three ways for it
     to arrive: a file, a link, and the shelf. None of them asks the player
     to type a secret. */

  /* A link carries the character itself. The package is packed, squeezed
     and written into the link, so the two ends need nothing in common but
     the link. The character rides in the fragment of the link, and a
     fragment never reaches a server. */
  function toBase64Url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    var s = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var raw = atob(s);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function squeeze(text) {
    if (typeof CompressionStream === 'undefined') return Promise.resolve(null);
    try {
      var stream = new CompressionStream('gzip');
      var writer = stream.writable.getWriter();
      writer.write(new TextEncoder().encode(text));
      writer.close();
      return new Response(stream.readable).arrayBuffer().then(function (buf) {
        return new Uint8Array(buf);
      });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function unsqueeze(bytes) {
    var stream = new DecompressionStream('gzip');
    var writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Response(stream.readable).text();
  }

  /* The link a character travels in. It opens the repository of the app, the
     private one that carries the characters and the whole corpus; the character
     itself travels in the fragment, so the page behind it is only a host. */
  var LINK_BASE = 'https://github.com/NewbornAI/kustom-TTRPG#';

  function linkOf(pkg) {
    var json = JSON.stringify(pkg);
    return squeeze(json).then(function (packed) {
      if (!packed) return LINK_BASE + 'p=0' + toBase64Url(new TextEncoder().encode(json));
      return LINK_BASE + 'p=1' + toBase64Url(packed);
    });
  }

  /* ---- the invite of a campaign ----

     The game master's repository and its key travel in a link, the way a
     character does: in the fragment, which a browser never sends to GitHub.
     The same text is drawn as a QR code on the game master's screen, so a
     player joins by copying the link from a message or by pointing the
     camera at the screen, and never types. */
  function inviteLink(c) {
    var body = JSON.stringify({ v: 1, n: (c && c.name) || '', r: (c && c.repo) || '', k: (c && c.key) || '' });
    return LINK_BASE + 'c=' + toBase64Url(new TextEncoder().encode(body));
  }

  function readInvite(text) {
    var m = String(text || '').match(/[#&]c=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    try {
      var o = JSON.parse(new TextDecoder().decode(fromBase64Url(m[1])));
      if (!o || !o.r) return null;
      return { name: String(o.n || ''), repo: String(o.r), key: String(o.k || '') };
    } catch (e) {
      return null;
    }
  }

  /* An invite comes in: the key is tried on the repository, and the
     campaign becomes the shelf. */
  function joinInvite(text) {
    var invite = readInvite(text);
    if (!invite) return Promise.resolve({ ok: false, why: 'that is not the invite of a campaign' });
    return SHELF.joinCampaign(invite).then(function (answer) {
      if (answer.ok) save();
      return answer;
    });
  }

  /* The words on the clipboard: the phone's shell reads them, a browser
     asks for them. Either may say no, and the answer is then empty. */
  function clipText() {
    var shell = phone('clipText');
    if (shell) {
      try { return Promise.resolve(String(shell.clipText() || '')); } catch (e) { return Promise.resolve(''); }
    }
    if (navigator.clipboard && navigator.clipboard.readText) {
      return navigator.clipboard.readText().then(function (t) { return String(t || ''); }).catch(function () { return ''; });
    }
    return Promise.resolve('');
  }

  function qrSvg(text, label) {
    return window.SheetQR ? window.SheetQR.svg(text, { label: label }) : '';
  }

  /* The camera reads the QR code of an invite. The phone's WebView carries a
     barcode detector; a screen without one, or without a camera, is told to
     paste instead. The camera stops as soon as the sheet closes. */
  function scanQr() {
    var can = typeof window.BarcodeDetector === 'function' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (!can) return Promise.resolve({ ok: false, why: 'this screen cannot read a QR code: copy the invite link and paste it instead' });
    return new Promise(function (done) {
      var stream = null;
      var timer = null;
      var finished = false;
      var detector = null;
      try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) {
        done({ ok: false, why: 'this screen cannot read a QR code: copy the invite link and paste it instead' });
        return;
      }
      function stop(result) {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        done(result);
      }
      sheet.open({
        id: 'scanqr',
        title: 'Scan the invite',
        dock: true,
        metaClass: 'sheet-meta one',
        meta: '<video class="qrcam" id="qrCam" playsinline muted autoplay></video>' +
          '<span>Point the camera at the code on the game master\'s screen.</span>',
        actions: [{ label: 'Cancel', kind: 'quiet', onClick: function () { sheet.close(); } }],
        onClose: function () { stop({ ok: false, why: '' }); }
      });
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (got) {
        stream = got;
        if (finished) { got.getTracks().forEach(function (t) { t.stop(); }); return; }
        var video = document.getElementById('qrCam');
        if (!video) { stop({ ok: false, why: '' }); return; }
        video.srcObject = got;
        var playing = video.play();
        if (playing && playing.catch) playing.catch(function () {});
        /* A detector the phone cannot run (the service behind it is missing)
           fails every time: after a few misses the player is told to paste. */
        var misses = 0;
        (function look() {
          if (finished) return;
          detector.detect(video).then(function (codes) {
            misses = 0;
            var hit = (codes || []).map(function (c) { return c && c.rawValue; }).filter(Boolean)[0];
            if (hit) { stop({ ok: true, text: hit }); sheet.close(); return; }
            timer = setTimeout(look, 250);
          }).catch(function () {
            misses += 1;
            if (misses >= 8) {
              stop({ ok: false, why: 'this phone cannot read a QR code: copy the invite link and paste it instead' });
              sheet.close();
              return;
            }
            timer = setTimeout(look, 400);
          });
        })();
      }).catch(function (e) {
        stop({ ok: false, why: 'the camera did not open' + (e && e.name === 'NotAllowedError' ? ': the phone said no' : '') });
        sheet.close();
      });
    });
  }

  /* A link that carries a character comes back in. */
  function importLink(text) {
    var m = String(text || '').match(/[#&]p=([^&]+)/);
    if (!m) return Promise.resolve({ ok: false, why: 'that link carries no character' });
    var packed = m[1];
    var flag = packed.charAt(0);
    try {
      var bytes = fromBase64Url(packed.slice(1));
      if (flag === '1') {
        return unsqueeze(bytes).then(function (body) { return importPackage(body); });
      }
      return importPackage(new TextDecoder().decode(bytes));
    } catch (e) {
      return Promise.resolve({ ok: false, why: 'that link carries no character' });
    }
  }

  /* A link leaves the app: the phone offers it to send, the web puts it in
     the clipboard. */
  function shareLink(url) {
    var shell = phone('shareText');
    if (shell) {
      try {
        var answer = shell.shareText(url);
        if (answer && answer.indexOf('error ') === 0) return Promise.resolve(answer);
        return Promise.resolve('ok');
      } catch (e) {
        return Promise.resolve(String((e && e.message) || e));
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(url).then(function () {
        return 'copied';
      }).catch(function () {
        return 'not copied';
      });
    }
    return Promise.resolve('not copied');
  }

  /* The phone has an explorer and a share sheet, the web has neither. */
  function isPhone() {
    return !!phone('pick');
  }

  /* The address of a file on GitHub, the one a browser shows, is turned
     into the address of the file itself, so a player can paste either. */
  function rawAddress(url) {
    var blob = String(url || '').match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (blob) return 'https://raw.githubusercontent.com/' + blob[1] + '/' + blob[2] + '/' + blob[3] + '/' + blob[4];
    var raw = String(url || '').match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/);
    if (raw) return 'https://raw.githubusercontent.com/' + raw[1] + '/' + raw[2] + '/' + raw[3] + '/' + raw[4];
    return String(url || '');
  }

  /* A package that comes in by a link, or by the address of a file that
     holds one. */
  function importAny(text) {
    var where = String(text || '').trim();
    if (!where) return Promise.resolve({ ok: false, why: 'nothing to fetch' });
    if (/[#&]p=/.test(where)) return importLink(where);
    return importUrl(rawAddress(where));
  }

  /* A package that comes in by a link: the machine that holds the file
     answers, and the package lands the way one from a file lands. */
  function importUrl(url) {
    var where = rawAddress(String(url || '').trim());
    if (!where) return Promise.resolve({ ok: false, why: 'no link' });
    return readUrl(where).then(function (text) {
      return importPackage(text);
    }).catch(function (e) {
      return { ok: false, why: String((e && e.message) || e) };
    });
  }

  /* The file the player picked comes back to the page. */
  window.__sheetPicked = function (name) {
    var shell = phone('pickedText');
    var text = shell ? shell.pickedText() : '';
    if (!text) return;
    importPackage(text).then(function (answer) {
      toast(landed(answer, 'that file is not a character'));
    });
  };

  function pickFile() {
    var shell = phone('pick');
    if (shell) {
      try {
        var answer = shell.pick();
        if (answer && answer.indexOf('error ') === 0) toast(answer);
        return true;
      } catch (e) {
        toast(String((e && e.message) || e));
        return false;
      }
    }
    /* There is no explorer of the phone on the web, so the page opens one
       of its own and reads the package the player chose. */
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        importPackage(String(reader.result || '')).then(function (answer) {
          toast(landed(answer, 'that file is not a character'));
        });
        if (input.parentNode) input.parentNode.removeChild(input);
      };
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
    return true;
  }

  /* A character from a class: the creator, one screen that updates as it is
     touched (src/creator.js). The skeleton is built from the class data and
     the library, and the origin checked and written by the origin module,
     the one the fairy uses too. */
  function makeCharacter(spec) {
    var rec = skeleton(spec.className, spec.level, spec.sub, spec.name);
    /* The skills of the class, chosen on the proficiencies tab, are proficient
       before the origin adds its own. */
    rec.char.skills = rec.char.skills || {};
    (spec.classSkills || []).forEach(function (k) { rec.char.skills[k] = 1; });
    var done = core.origin.apply(rec, spec.origin);
    if (done.error) return { error: done.error };
    if (spec.theme) rec.theme = spec.theme;
    if (spec.icon) rec.icon = spec.icon;
    /* A story the player wrote is theirs: the Background page is on, and a
       fairy that paints reads it as written. */
    if (spec.lore) {
      rec.backstory = { text: spec.lore };
      if (Array.isArray(rec.pages) && rec.pages.indexOf('backstory') < 0) {
        var at = rec.pages.indexOf('agent');
        if (at < 0) rec.pages.push('backstory'); else rec.pages.splice(at, 0, 'backstory');
      }
    }
    addCharacter(rec);
    return { ok: true };
  }

  var CREATOR = window.SheetCreator({
    core: core,
    esc: esc,
    classes: function () { return CLASSDATA; },
    featureByKey: function () { return FEATURE_BY_KEY; },
    renderBlocks: renderBlocks,
    SR: function () { return SR; },
    sourceTag: function (x) { return core.library.sourceTag(x); },
    toast: toast,
    make: makeCharacter
  });

  function openClassChooser() {
    if (!CLASSDATA.length) {
      CARD.list({
        id: 'classchooser',
        title: 'A class',
        metaClass: 'sheet-meta one',
        meta: '<span>The class file did not arrive.</span>',
        rows: ''
      });
      return;
    }
    CREATOR.open();
  }

  /* The skeleton: the class, the level, the archetype, the features those
     bring and the saves of the class. */
  function skeleton(className, level, subclass, name) {
    var cls = null;
    CLASSDATA.forEach(function (c) { if (c.name === className) cls = c; });
    var sub = null;
    if (cls && subclass) {
      (cls.subclasses || []).forEach(function (s) { if (s.name === subclass) sub = s; });
    }
    var keys = [];
    Object.keys(FEATURE_BY_KEY).forEach(function (key) {
      var f = FEATURE_BY_KEY[key];
      if (f.class !== className) return;
      if (Number(f.level) > level) return;
      if (/subclass$/i.test(f.name)) return;        /* a heading, not a feature */
      if (f.subclass) {
        if (!sub || f.subclass !== sub.short) return;
        if (f.name === sub.name) return;             /* the note of the archetype */
      }
      keys.push(key);
    });
    var saves = {};
    SR.ABILITIES.forEach(function (a) { saves[a.key] = 0; });
    ((cls && cls.saves) || []).forEach(function (a) { saves[a] = 1; });
    var rec = RECORD.seed({
      char: {
        name: name || '',
        level: level,
        classes: [{ name: className, level: level, subclass: subclass || '' }],
        saves: saves,
        featureKeys: keys
      }
    }, true);
    rec.pages = firstTabs(cls, subclass);
    return rec;
  }

  /* The tabs a new character starts with: its sheet, its features, its
     spells when its class casts (or its attacks when it does not), and the
     fairy. The player turns any other on in the settings. */
  function firstTabs(cls, subclass) {
    var casts = !!(cls && cls.caster) || /eldritch knight|arcane trickster/i.test(subclass || '');
    return ['character', 'features', casts ? 'spells' : 'attack', 'agent'].filter(function (id) {
      return PAGES.some(function (p) { return p.id === id; });
    });
  }

  function addCharacter(rec) {
    var id = 'c' + Date.now();
    state.characters[id] = rec;
    state.current = id;
    registerPluginPages(rec);
    save();
    sheet.closeAll();
    show(homeId());
  }

  /* A character made from words, the agent's way to the creator: the same
     skeleton the creator builds (the class, the level, the archetype, the
     features those bring and the saves), with its scores when given. It is
     played at once, with the pages of the one that asked, so the agent's
     page is still there. */
  function createCharacter(o) {
    o = o || {};
    return Promise.all([data('classes'), data('features'), data('species'), data('rules'), data('feats')]).then(function () {
      var want = String(o.className || '').toLowerCase();
      var cls = CLASSDATA.filter(function (c) { return c.name.toLowerCase() === want; })[0];
      if (!cls) return { error: 'no class "' + o.className + '": one of ' + CLASSDATA.map(function (c) { return c.name; }).join(', ') };
      var level = Math.max(1, Math.min(20, Math.floor(Number(o.level) || 1)));
      var sub = '';
      if (o.subclass) {
        var w = String(o.subclass).toLowerCase();
        var s = (cls.subclasses || []).filter(function (x) { return x.name.toLowerCase() === w || String(x.short || '').toLowerCase() === w; })[0];
        if (!s) return { error: 'no subclass "' + o.subclass + '" for ' + cls.name + ': one of ' + (cls.subclasses || []).map(function (x) { return x.name; }).join(', ') };
        sub = s.name;
      }
      var name = String(o.name || '').trim() || 'New character';
      var rec = skeleton(cls.name, level, sub, name);
      /* The origin goes through the same checks as the creator's: the
         species and its choice, the point buy or the array, the background. */
      var origin = { species: o.species, speciesChoice: o.speciesChoice };
      if (o.abilities) { origin.scores = o.abilities; origin.method = o.method || 'manual'; }
      if (o.background) origin.background = o.background;
      var made = core.origin.apply(rec, origin);
      if (made.error) return { error: made.error };
      addCharacter(rec);
      return { id: state.current, name: name, className: cls.name, level: level, subclass: sub,
        species: rec.char.species || '', abilities: rec.char.abilities, background: rec.char.background || null, featuresAdded: made.added };
    });
  }

  /* ---- the Randominator ----

     The level asked of the player (the game master decides it), then every
     other choice of the creator made by the dice: the class,
     the subclass once the level has one, the species and its lineage, the
     six abilities rolled (four d6, the three highest), and a background of
     its own (its increases, an Origin feat, two skills, a tool). The random
     numbers are the browser's cryptographic ones. The character is made
     through the creator's own checks, then a new fairy names it (ten names,
     one rolled by the app), dresses it in a theme and paints it. */
  function rng(n) {
    var max = Math.max(1, Math.floor(n));
    var c = window.crypto || window.msCrypto;
    if (c && c.getRandomValues) {
      var limit = Math.floor(4294967296 / max) * max;
      var buf = new Uint32Array(1);
      do { c.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  }
  core.rng = rng;

  function pick(list) { return list[rng(list.length)]; }

  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = rng(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* Four d6, the three highest. */
  function rollScore() {
    var dice = [1 + rng(6), 1 + rng(6), 1 + rng(6), 1 + rng(6)];
    var kept = dice.slice().sort(function (a, b) { return b - a; }).slice(0, 3);
    return { dice: dice, score: kept[0] + kept[1] + kept[2] };
  }

  /* The level is the game master's, not the dice's: it is asked first. */
  function openRandomLevel() {
    var level = 1;
    sheet.open({
      id: 'randomlevel',
      title: 'Randominator',
      dock: true,
      metaClass: 'sheet-meta one',
      meta: '<span>The level is the game master\'s; the dice choose the rest.</span>',
      list: '<div class="bigstep">' +
        '<button type="button" data-step="-" aria-label="One level less">&minus;</button>' +
        '<span class="bigval"><span class="bigk">LEVEL</span><span id="randLevel">1</span></span>' +
        '<button type="button" data-step="+" aria-label="One level more">+</button>' +
        '</div>',
      onList: function (ev) {
        var step = ev.target.closest('[data-step]');
        if (!step) return;
        level = Math.max(1, Math.min(20, level + (step.dataset.step === '+' ? 1 : -1)));
        var num = document.getElementById('randLevel');
        if (num) num.textContent = String(level);
      },
      actions: [{ label: 'Roll', onClick: function () { sheet.closeAll(); randominate(level); } }]
    });
  }

  function randominate(chosenLevel) {
    Promise.all([data('classes'), data('features'), data('species'), data('rules'), data('feats')]).then(function () {
      if (!CLASSDATA.length) { toast('the classes are not here yet'); return; }
      var cls = pick(CLASSDATA);
      var level = Math.max(1, Math.min(20, Math.floor(Number(chosenLevel)) || 1));
      var sub = level >= 3 && (cls.subclasses || []).length ? pick(cls.subclasses).name : '';
      var origin = {};
      var sp = core.library.species.length ? pick(core.library.species) : null;
      if (sp) {
        origin.species = sp.name;
        var ask = sp.traits.filter(function (t) { return t.choice; })[0];
        if (ask) origin.speciesChoice = pick(ask.choice.options).name;
      }
      var rolls = {};
      origin.scores = {};
      SR.ABILITIES.forEach(function (a) { var r = rollScore(); rolls[a.key] = r.dice; origin.scores[a.key] = r.score; });
      origin.method = 'manual';
      var abs = shuffled(SR.ABILITIES.map(function (a) { return a.key; }));
      var increase = {};
      if (rng(2)) { increase[abs[0]] = 2; increase[abs[1]] = 1; }
      else { increase[abs[0]] = 1; increase[abs[1]] = 1; increase[abs[2]] = 1; }
      var feats = core.origin.originFeats();
      var tools = ((core.library.rules.customBackground || {}).toolChoices) || [];
      origin.background = {
        name: 'Custom',
        increase: increase,
        feat: feats.length ? pick(feats).name : '',
        skills: shuffled((SR.SKILLS || []).map(function (k) { return k.key; })).slice(0, 2),
        tool: tools.length ? pick(tools) : ''
      };
      var rec = skeleton(cls.name, level, sub, 'Unnamed');
      var made = core.origin.apply(rec, origin);
      if (made.error) { toast(made.error); return; }
      rec.char.creation = { method: 'rolled', rolls: rolls, base: origin.scores };
      addCharacter(rec);
      var what = [origin.speciesChoice || '', origin.species || '', sub || cls.name, level].filter(Boolean).join(' ');
      toast('Rolled: ' + what);
      /* A new fairy names it, dresses it and paints it. */
      show('agent');
      if (core.fairy && core.fairy.ask) {
        core.fairy.ask('Randominator: this character was rolled, every choice by the dice (' + what + '). ' +
          'Read the sheet, then propose ten names that fit its species, its class and its background, and call roll_name with all ten: the app rolls one. ' +
          'Then write its background with write_backstory: at most 30 words on why it became an adventurer, drawn from its species, class, background, feat and skills. ' +
          'Then make it a theme that fits it with write_theme, and paint three pictures of it with paint_choices: three concepts distilled from the story, three different readings of the character, so the player picks the one that fits. ' +
          'Do not ask anything: every choice is the dice\'s. Report the name rolled, the story in a line, the theme and the pictures.', { fresh: true });
      }
    });
  }

  function openBlankCharacter() {
    sheet.open({
      id: 'blankcharacter',
      title: 'New character',
      dock: true,
      metaClass: 'sheet-meta one',
      meta: '<input class="sheet-search" id="newCharName" type="text" placeholder="Name of the character" aria-label="Name of the character">',
      actions: [{
        label: 'Create',
        onClick: function (root) {
          var field = root.querySelector('#newCharName');
          var name = (field && field.value ? field.value : '').trim() || 'New character';
          var rec = RECORD.seed({}, true);
          rec.char.name = name;
          rec.pages = firstTabs(null, '');
          addCharacter(rec);
        }
      }]
    });
  }

  function openRemoveCharacter(id) {
    var c = characterList().filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    sheet.open({
      id: 'remove:' + id,
      title: 'Remove ' + c.name + '?',
      metaClass: 'sheet-meta one',
      meta: '<span>The character and everything on it goes away.</span>',
      actions: [
        { label: 'Keep', onClick: function () { sheet.close(); } },
        { label: 'Remove', kind: 'danger', onClick: function () { removeCharacter(id); } }
      ]
    });
  }

  function removeCharacter(id) {
    var ids = Object.keys(state.characters);
    delete state.characters[id];
    if (state.current === id) {
      state.current = ids.filter(function (x) { return x !== id; })[0] || '';
    }
    registerPluginPages(state.characters[state.current]);
    save();
    sheet.closeAll();
    /* The last one leaves the app with nothing to play, so it goes back to
       the ways in. */
    if (!Object.keys(state.characters).length) { openCharacters(); return; }
    reshow();
    openCharacters();
  }

  /* ---- the swipe ---- */

  /* A swipe across the page moves to the page beside it: to the left for the
     next tab, to the right for the one before. The move decides, not what it
     started on: a swipe that begins on a button, a card or a toggle is still a
     swipe, and the click under the finger is swallowed. Only what drags
     sideways on its own keeps the move: a range input, a text field being
     typed in, a row a long press is carrying, the sheet open over the page,
     and an element that says so with data-swipe. Which move counts as a swipe
     is the drag module's rule, so no page and this shell can disagree about
     it. */

  /* The click that follows a swipe is swallowed once, so the control the
     finger left on does not fire under it. */
  function swallow() {
    function block(ev) {
      document.removeEventListener('click', block, true);
      ev.stopPropagation();
      ev.preventDefault();
    }
    document.addEventListener('click', block, true);
    setTimeout(function () { document.removeEventListener('click', block, true); }, 500);
  }

  var KEEPS_MOVE = 'input[type="range"], .sheet, [data-swipe]';

  function keepsMove(target) {
    if (document.querySelector('.dragging')) return true;
    if (!target || !target.closest) return false;
    if (target.closest(KEEPS_MOVE)) return true;
    var field = target.closest('input, textarea, select, [contenteditable="true"]');
    return !!field && field === document.activeElement;
  }

  /* A swipe is read on the release and the page changes then: nothing slides,
     so a drag never waits on an animation to catch up. It starts on the page
     and may end anywhere, the edge of the screen included, so the release is
     read on the window. A row that starts being carried during the move ends
     the swipe, so the hold keeps the row. */
  function wireSwipe() {
    var from = null;
    el.views.addEventListener('pointerdown', function (ev) {
      from = null;
      if (ev.button !== undefined && ev.button !== 0) return;
      if (keepsMove(ev.target)) return;
      from = { x: ev.clientX, y: ev.clientY };
    });
    window.addEventListener('pointermove', function () {
      if (from && document.querySelector('.dragging')) from = null;
    }, { passive: true });
    window.addEventListener('pointercancel', function () { from = null; });
    window.addEventListener('pointerup', function (ev) {
      var start = from;
      from = null;
      if (!start) return;
      /* Left is the page after this one, right the one before, so the drag
         module's -1 for a move to the left asks for the next step, and the
         order wraps at its ends. The settings has no tab of its own, so a
         step from there goes nowhere. */
      var way = DRAG.swipe(start, { x: ev.clientX, y: ev.clientY });
      if (!way) return;
      var next = DRAG.step(swipeGrid(), current, -way, 0);
      if (!next) return;
      show(next);
      swallow();
    });
  }

  /* ---- the elements of the shell ---- */

  /* The characters are one tap from the head of the app, beside the wrench,
     so they can be changed from any page. */
  function wireHead() {
    if (el.charBtn) el.charBtn.addEventListener('click', openCharacters);
  }

  var el = {
    sigil: document.getElementById('sigil'),
    pageTitle: document.getElementById('pageTitle'),
    head: document.getElementById('headSlot'),
    bar: document.getElementById('bar'),
    viewer: document.getElementById('viewer'),
    viewerImg: document.getElementById('viewerImg'),
    viewerPrev: document.getElementById('viewerPrev'),
    viewerNext: document.getElementById('viewerNext'),
    viewerFoot: document.getElementById('viewerFoot'),
    viewerCount: document.getElementById('viewerCount'),
    viewerPick: document.getElementById('viewerPick'),
    gear: document.getElementById('gear'),
    rewind: document.getElementById('rewind'),
    charBtn: document.getElementById('charBtn'),
    views: document.getElementById('views'),
      spentToast: document.getElementById('spentToast'),
    sheet: document.getElementById('sheet'),
    sheetTitle: document.getElementById('sheetTitle'),
  sheetTag: document.getElementById('sheetTag'),
    sheetMeta: document.getElementById('sheetMeta'),
    sheetText: document.getElementById('sheetText'),
    sheetList: document.getElementById('sheetList'),
    sheetIn: document.querySelector('.sheet-in'),
    sheetActions: document.getElementById('sheetActions'),
    sheetSearch: document.getElementById('sheetSearch'),
    sheetClose: document.getElementById('sheetClose'),
    grimoireLevel: document.getElementById('grimoireLevel'),
    condTip: document.getElementById('condTip'),
    condName: document.getElementById('condName'),
    condText: document.getElementById('condText'),
    condClose: document.getElementById('condClose')
  };

  /* ---- the tabs ---- */

  /* The pages a character plays with. They sit on the character, so a
     bard can live without the volley page the warlock plays, and a
     character that never chose keeps the pages of the app. */
  function pagesOf() {
    return RECORD.pagesOn(state.characters[state.current] || {}, state.ui);
  }

  function enabled() {
    var on = pagesOf();
    return PAGES.filter(function (p) {
      if (p.hidden) return false;
      if (p.home) return true;
      return on.indexOf(p.id) >= 0;
    }).sort(function (a, b) { return a.order - b.order; });
  }

  /* The label of a tab, which can be shorter than the name of the page, and
     the name of the page itself, which the head of the app carries. */
  function label(p) {
    if (p.tab) return p.tab;
    return titleOf(p);
  }

  function titleOf(p) {
    return typeof p.title === 'function' ? p.title(api) : p.title;
  }

  /* The banner names the character, the one fact no other part of the
     screen says: the tab already says which page this is. A page with no
     tab of its own, the settings, keeps its name, because nothing else on
     the screen would say it. */
  function bannerOf(p) {
    if (p.hidden) return titleOf(p);
    var rec = state.characters[state.current];
    var name = rec && rec.char && rec.char.name;
    return name || titleOf(p);
  }

  /* The name of the page in the banner. A page that declares `rename` has it
     editable in the edit mode and read only outside it, and the element never
     changes, so the name keeps its place and its weight either way. */
  function paintTitle() {
    var p = PAGES.filter(function (x) { return x.id === current; })[0];
    if (!p) return;
    var editing = typeof p.rename === 'function' && EDIT.of(current);
    if (!editing) el.pageTitle.textContent = bannerOf(p);
    if (typeof p.rename !== 'function') el.pageTitle.removeAttribute('contenteditable');
    else el.pageTitle.setAttribute('contenteditable', editing ? 'true' : 'false');
    if (editing) el.pageTitle.setAttribute('spellcheck', 'false');
    else el.pageTitle.removeAttribute('spellcheck');
    el.pageTitle.classList.toggle('haspic', !editing && !p.hidden && !!pictureOf());
  }

  /* The picture of the character being played, when it has one. */
  function pictureOf() {
    var rec = state.characters[state.current];
    return (rec && rec.image && rec.image.data) || '';
  }

  /* The picture over the whole screen. One picture is a look: a tap anywhere
     or the back key closes it. A choice of pictures is a review: the arrows in
     the bottom corners and a swipe move between them, the count says which,
     and a Pick button hands the one on screen to whoever asked for the choice.
     A character with no picture yet is taken to the page that sets one. */
  var VIEW = null;   /* {pictures, at, pick} while the viewer shows a choice */

  function paintViewer() {
    if (!VIEW) return;
    el.viewerImg.src = VIEW.pictures[VIEW.at];
    var many = VIEW.pictures.length > 1;
    el.viewerPrev.hidden = !many;
    el.viewerNext.hidden = !many;
    el.viewerFoot.hidden = !many;
    el.viewerCount.textContent = many ? (VIEW.at + 1) + ' / ' + VIEW.pictures.length : '';
    el.viewerPick.hidden = !VIEW.pick;
    el.viewer.setAttribute('aria-label', many
      ? 'The pictures to choose from, ' + (VIEW.at + 1) + ' of ' + VIEW.pictures.length
      : 'The picture of the character');
  }

  function openPicture(pictures, pick) {
    var list = (pictures || []).filter(function (x) { return typeof x === 'string' && x; });
    if (!list.length) {
      if (enabled().some(function (x) { return x.id === 'image'; })) show('image');
      return;
    }
    VIEW = { pictures: list, at: 0, pick: typeof pick === 'function' ? pick : null };
    paintViewer();
    el.viewer.hidden = false;
  }

  function stepPicture(by) {
    if (!VIEW || VIEW.pictures.length < 2) return;
    VIEW.at = (VIEW.at + by + VIEW.pictures.length) % VIEW.pictures.length;
    paintViewer();
  }

  function closePicture() {
    el.viewer.hidden = true;
    el.viewerImg.removeAttribute('src');
    VIEW = null;
  }

  function pictureOpen() {
    var p = pageById(current);
    if (!p || p.hidden) return;
    if (typeof p.rename === 'function' && EDIT.of(current)) return;
    openPicture(pictureOf() ? [pictureOf()] : [], null);
  }

  /* The screen the settings was opened from. The gear is a door both ways:
     the tap that opened the settings is the tap that closes them, so the
     player comes back to the page they left rather than to the first one. */
  var settingsFrom = '';

  function leaveSettings() {
    var on = enabled().some(function (p) { return p.id === settingsFrom; });
    show(on ? settingsFrom : homeId());
  }

  /* ---- the bar ---- */

  /* The bar at the bottom names every page by an icon and a word. It takes
     one row, the first four pages of the player's order and More for the
     rest, or two, every page and no More: the player chooses in the
     settings, and the choice is the app's, saved with the rest of the ui, so
     it outlives a character. Five pages fit one row without a More. */
  var BAR_ROW = 5;
  var GLYPH_MORE = 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z';
  var GLYPH_PAGE = 'M5 5h14v14H5z';

  function barRows() {
    return Number((state.ui || {}).barRows) === 2 ? 2 : 1;
  }

  /* The player's order of the pages that are on. It is matched against the
     pages every time it is read: a page turned off leaves it, a page turned
     on joins at the end, so a stale order never hides a page. The rows of
     the old strip are read once as an order. What the match settles is
     written down, so a new page keeps the place it was first given. */
  function barOrder() {
    var ids = enabled().map(function (p) { return p.id; });
    var ui = state.ui || {};
    var saved = ui.bar;
    if (!saved && ui.tabs) saved = [].concat.apply([], ui.tabs);
    var out = [], seen = {};
    (saved || []).forEach(function (id) {
      if (ids.indexOf(id) >= 0 && !seen[id]) { seen[id] = true; out.push(id); }
    });
    ids.forEach(function (id) { if (!seen[id]) out.push(id); });
    if (JSON.stringify(ui.bar) !== JSON.stringify(out) || ui.tabs) {
      state.ui = ui;
      ui.bar = out;
      delete ui.tabs;
      delete ui.tabRows;
      delete ui.tabsOn;
      save();
    }
    return out;
  }

  /* What the bar shows, and what waits under More. */
  function barSplit() {
    var order = barOrder();
    if (barRows() === 2 || order.length <= BAR_ROW) return { shown: order, more: [] };
    return { shown: order.slice(0, BAR_ROW - 1), more: order.slice(BAR_ROW - 1) };
  }

  function glyphOf(p) {
    return (p && typeof p.glyph === 'string' && /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-]+$/.test(p.glyph)) ? p.glyph : GLYPH_PAGE;
  }

  function glyphSvg(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
  }

  function pageById(id) {
    return PAGES.filter(function (x) { return x.id === id; })[0];
  }

  /* One item of the bar: the icon over the word. */
  function barButton(id, cls) {
    var p = pageById(id);
    return '<button type="button" class="' + cls + '" data-page="' + esc(id) + '">' +
      glyphSvg(glyphOf(p)) + '<span>' + esc(label(p)) + '</span></button>';
  }

  /* The bar is rebuilt only when its pages, their names or its rows change;
     the page on screen is a mark on the item, painted every time. */
  var barSig = '';

  function renderTabs() {
    var split = barSplit();
    var n = split.shown.length + (split.more.length ? 1 : 0);
    var sig = barRows() + '|' + split.shown.map(function (id) { return id + ':' + label(pageById(id)); }).join(',') +
      '|' + split.more.join(',');
    if (sig !== barSig) {
      barSig = sig;
      var html = split.shown.map(function (id) { return barButton(id, 'baritem'); }).join('');
      if (split.more.length) {
        html += '<button type="button" class="baritem barmore" data-more="1" aria-haspopup="dialog">' +
          glyphSvg(GLYPH_MORE) + '<span>More</span></button>';
      }
      el.bar.innerHTML = html;
      var cols = barRows() === 2 ? Math.min(BAR_ROW, Math.ceil(n / 2)) : n;
      el.bar.style.setProperty('--cols', String(Math.max(1, cols)));
      el.bar.classList.toggle('two', barRows() === 2 && n > cols);
    }
    var inMore = split.more.indexOf(current) >= 0;
    Array.prototype.forEach.call(el.bar.querySelectorAll('.baritem'), function (b) {
      var here = b.dataset.more ? inMore : b.dataset.page === current;
      if (here) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    el.gear.setAttribute('aria-pressed', current === 'settings' ? 'true' : 'false');
    /* The line that says a spend rises above the bar. */
    document.documentElement.style.setProperty('--bar-h', el.bar.offsetHeight + 'px');
  }

  /* More opens the rest of the pages as tiles, docked at the bottom, with the
     characters and the settings after them. Every page is a tile, the ones
     in the bar first, so a hold carries a page into the bar or out of it:
     the first four tiles are the bar. */
  function openMore() {
    var order = barOrder();
    var tiles = order.map(function (id, i) {
      return barButton(id, 'mtile' + (i < BAR_ROW - 1 ? ' inbar' : '') + (id === current ? ' here' : ''));
    }).join('');
    var drag = null;
    sheet.open({
      id: 'more',
      title: 'Pages',
      dock: true,
      list: '<div class="mtiles" id="moreTiles">' + tiles + '</div>' +
        '<div class="mtiles mfoot"><button type="button" class="mtile" data-act="characters">' +
        glyphSvg('M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6') +
        '<span>Characters</span></button><button type="button" class="mtile" data-act="settings">' +
        glyphSvg('M3 7h7.7M15.3 7h5.7M3 12h3.7M11.3 12h9.7M3 17h11.7M19.3 17h1.7M13 4.7a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6zM9 9.7a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6zM17 14.7a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6z') +
        '<span>Settings</span></button></div>',
      onPaint: function (root) {
        var box = root.querySelector('#moreTiles');
        drag = DRAG.list(box, {
          row: '.mtile',
          key: 'page',
          layout: 'grid',
          onOrder: function (ids) {
            state.ui = state.ui || {};
            state.ui.bar = ids;
            save();
            renderTabs();
            Array.prototype.forEach.call(box.querySelectorAll('.mtile'), function (t, i) {
              t.classList.toggle('inbar', i < BAR_ROW - 1);
            });
          }
        });
      },
      onList: function (ev) {
        var t = ev.target.closest('.mtile');
        if (!t || (drag && drag.wasDragged())) return;
        if (t.dataset.act === 'characters') { sheet.close(); openCharacters(); return; }
        if (t.dataset.act === 'settings') { sheet.close(); settingsFrom = current; show('settings'); return; }
        if (t.dataset.page) { sheet.close(); show(t.dataset.page); }
      }
    });
  }

  /* The bar is the player's too: a hold carries an item along it. */
  var barDrag = DRAG.list(el.bar, {
    row: '.baritem:not(.barmore)',
    key: 'page',
    layout: 'grid',
    onOrder: function (ids) {
      var rest = barOrder().filter(function (id) { return ids.indexOf(id) < 0; });
      state.ui = state.ui || {};
      state.ui.bar = ids.concat(rest);
      save();
      barSig = '';
      renderTabs();
    }
  });

  el.bar.addEventListener('click', function (ev) {
    var b = ev.target.closest('.baritem');
    if (!b || barDrag.wasDragged()) return;
    if (b.dataset.more) { openMore(); return; }
    show(b.dataset.page);
  });

  /* The order a swipe reads: every page of the bar's order, the ones under
     More included, so every page is a swipe away. */
  function swipeGrid() {
    return [barOrder()];
  }

  /* A page is mounted once, when it is first shown or the moment a slide
     needs the page beside it; after that it stays in the app, so its state
     and its scroll place are kept. The mount is a step of its own so the
     slide lifts a neighbour in without going through a page change. */
  function mountPage(id) {
    var p = PAGES.filter(function (x) { return x.id === id; })[0];
    if (!p || MOUNTED[id]) return false;
    if (p.into) return mountPanel(p);
    var section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-' + id;
    if (p.html) section.innerHTML = p.html;
    el.views.appendChild(section);
    MOUNTED[id] = { spec: p, section: section };
    /* The panels of this page go in once its own mount has found its nodes. */
    var host = mountHost(id);
    if (p.error) { pageError(section, p, p.error); return true; }
    try {
      if (p.mount) p.mount(section, api);
    } catch (e) {
      pageError(section, p, 'mount: ' + String((e && e.message) || e));
    }
    host();
    return true;
  }

  /* A panel is a page that lives in another: its box sits at the top or the
     bottom of the scrolling body of its page, the first element the page
     draws, and it is mounted, painted and broken like any page. */
  function mountPanel(p) {
    var host = MOUNTED[p.into];
    if (!host || host.spec.into) return false;
    var box = document.createElement('div');
    box.className = 'plugpanel';
    box.id = 'view-' + p.id;
    box.setAttribute('data-panel', p.id);
    if (p.html) box.innerHTML = p.html;
    MOUNTED[p.id] = { spec: p, section: box };
    placePanel(p, box);
    if (p.error) { pageError(box, p, p.error); return true; }
    try {
      if (p.mount) p.mount(box, api);
    } catch (e) {
      pageError(box, p, 'mount: ' + String((e && e.message) || e));
    }
    return true;
  }

  /* The scrolling body of a page: the first box in it that scrolls, or its
     first element. */
  function scrollerOf(section) {
    var queue = Array.prototype.slice.call(section.children);
    for (var i = 0; i < queue.length && i < 60; i++) {
      var y = getComputedStyle(queue[i]).overflowY;
      if (y === 'auto' || y === 'scroll') return queue[i];
      Array.prototype.push.apply(queue, queue[i].children);
    }
    return section.firstElementChild || section;
  }

  /* A panel is put in its place, and again when its page painted its body
     anew and took it out: the box is the same, its listeners with it. */
  function placePanel(p, box) {
    var host = MOUNTED[p.into];
    if (!host) return;
    if (p.at === 'bar') { barPanel(host, box); return; }
    if (host.section.contains(box)) return;
    var body = scrollerOf(host.section);
    if (p.at === 'top') body.insertBefore(box, body.firstChild);
    else body.appendChild(box);
  }

  /* A panel in the bar of its page: the row of chips the page marks with
     data-bar (Wild and Eat on spells), its children chips among the page's
     own. A page with no bar gets one, at the top of its body. */
  function barPanel(host, box) {
    var bar = host.section.querySelector('[data-bar]');
    if (bar) {
      box.classList.add('plugbar');
      box.classList.remove('chiprow');
      if (box.parentNode !== bar) bar.appendChild(box);
      if (box.children.length) bar.hidden = false;
    } else {
      box.classList.remove('plugbar');
      if (!host.section.contains(box)) {
        var body = scrollerOf(host.section);
        body.insertBefore(box, body.firstChild);
      }
    }
    Array.prototype.forEach.call(box.children, function (c) {
      if (c.tagName === 'BUTTON') c.classList.add('vchip');
    });
    var row = bar || box;
    if (!row.classList.contains('chipgrid')) core.toggle.shape(row);
  }

  function panelsOf(id) {
    return PAGES.filter(function (x) { return x.into === id; });
  }

  /* The panels of a page, mounted once the page has mounted. */
  function mountHost(id) {
    return function () { panelsOf(id).forEach(function (x) { mountPage(x.id); }); };
  }

  /* A page that breaks says so where it would have been, with the reason,
     instead of a blank page: what a page under work most needs to show. */
  function pageError(section, p, why) {
    var box = section.querySelector('.page-error');
    if (!box) {
      box = document.createElement('div');
      box.className = 'page-error';
      section.insertBefore(box, section.firstChild);
    }
    box.textContent = 'The page ' + (p.title || p.id) + ' broke. ' + why;
  }

  /* A render that throws leaves the reason on the page and the app running. */
  /* The counters of the classes follow the levels before a page paints, the
     way the slots follow them on the spells page. */
  function syncClasses() {
    var rec = state.characters[state.current];
    var moved = rec && window.SheetClasses && window.SheetClasses.sync(rec);
    if (autoHp(rec)) moved = true;
    if (moved) save();
  }

  /* The maximum of hit points, from the classes and Constitution: the first
     level of the first class gives its whole die, every level after gives
     the die's average rounded up (a d6 gives 4), and each level adds the
     Constitution modifier, never less than 1 a level. The maximum follows
     the levels and the score by itself, and the current hit points move by
     what the maximum moved, unless the character's maximum is set by hand
     (rec.char.hpManual, a switch of the settings). */
  function hpFor(rec) {
    var ch = rec && rec.char;
    if (!ch || !Array.isArray(ch.classes) || !ch.classes.length) return 0;
    var con = Math.floor(((Number(ch.abilities && ch.abilities.con) || 10) - 10) / 2);
    var total = 0;
    var first = true;
    for (var i = 0; i < ch.classes.length; i++) {
      var c = ch.classes[i];
      var info = CLASSDATA.filter(function (x) { return x.name === c.name; })[0];
      var die = info && Number(info.hd);
      if (!die) return 0;
      for (var lv = 0; lv < (Number(c.level) || 0); lv++) {
        total += Math.max(1, (first ? die : die / 2 + 1) + con);
        first = false;
      }
    }
    return total;
  }

  function autoHp(rec) {
    if (!rec || !rec.char || rec.char.hpManual) return false;
    var base = hpFor(rec);
    if (!base) return false;
    /* Tough and the rest: the effects on hpMax add to what the classes give. */
    var max = SR.withEffects(rec, base, ['hpMax']);
    var hp = rec.char.hp = rec.char.hp || { current: 0, max: 0, temp: 0 };
    var was = Number(hp.max) || 0;
    if (was === max) return false;
    var now = Number(hp.current) || 0;
    hp.current = was ? Math.max(0, Math.min(max, now + (max - was))) : max;
    hp.max = max;
    return true;
  }

  function renderPage(p) {
    if (!p || !p.render || p.error) return;
    syncClasses();
    core.own.sync(state.characters[state.current]);
    try {
      p.render(api);
    } catch (e) {
      var m = MOUNTED[p.id];
      if (m) pageError(m.section, p, 'render: ' + String((e && e.message) || e));
    }
    /* A page paints, then the panels in it. */
    if (!p.into) panelsOf(p.id).forEach(function (x) {
      if (!MOUNTED[x.id]) return;
      renderPage(x);
      placePanel(x, MOUNTED[x.id].section);
    });
  }

  /* A page is mounted the first time it is shown, and stays in the app
     after that, so its state and its scroll place are kept. */
  function show(id) {
    var p = PAGES.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    /* A panel is shown by its page, scrolled to. */
    if (p.into) {
      show(p.into);
      var box = MOUNTED[p.id] && MOUNTED[p.id].section;
      if (box && box.scrollIntoView) box.scrollIntoView({ block: 'nearest' });
      return;
    }
    /* The page changes under the description that was open over it, so a
       description goes when its page does. */
    if (current !== id) sheet.closeAll();
    current = id;

    mountPage(id);

    Object.keys(MOUNTED).forEach(function (k) {
      MOUNTED[k].section.classList.toggle('on', k === id);
    });

    el.head.innerHTML = '';
    wrenchEl = null;
    if (p.head) p.head(el.head, api);

    renderTabs();
    applyStyle();
    paintTitle();
    renderPage(p);
  }

  /* A page says what its markup was built from as parts, and the shell keys
     them over the page on screen: the same parts mean the page keeps what it
     painted. A page that knows something moved without the parts saying so
     marks it, and the next paint builds again. */
  function markDirty(key) {
    REBUILD.markDirty(current, key);
  }

  /* The settings' control of the bar: one row or two. It writes the ui,
     saves it and repaints the bar. */
  function setBarRows(count) {
    state.ui = state.ui || {};
    state.ui.barRows = Number(count) === 2 ? 2 : 1;
    save();
    renderTabs();
  }

  function refresh() {
    renderTabs();
    applyStyle();
    paintWrench();
    var m = MOUNTED[current];
    if (m) renderPage(m.spec);
  }

  /* ---- the interface the pages get ---- */

  var api = {
    state: state,
    save: save,
    refresh: refresh,
    show: show,
    toast: toast,
    sheet: sheet,
    core: core,
    pages: PAGES,
    defaultPages: defaultPages,
    pagesOn: pagesOf,
    record: RECORD,
    /* the edit mode of a page, and the wrench that turns it */
    editing: EDIT.editing,
    wrench: wrench,
    /* the paint of a page, and the mark of a known change */
    paint: function (parts, fns) { return REBUILD.paint(current, parts, fns); },
    markDirty: markDirty,
    /* the character being played */
    character: function () { return state.characters[state.current] || {}; },
    characters: function () { return state.characters; },
    openCharacters: openCharacters,
    /* a choice of pictures over the whole screen, and the pick handed back */
    gallery: function (pictures, pick) { openPicture(pictures, pick); },
    /* the pages written while the app runs */
    installPage: installPage,
    removePage: removePage,
    pageError: pageErrorOf,
    setLayout: setLayout,
    layoutMap: layoutMap,
    /* the rows of the bar, and the control of the settings */
    barRows: barRows,
    createCharacter: createCharacter,
    hpFor: hpFor,
    setBarRows: setBarRows
  };

  /* ---- the wiring of the shell ---- */

  /* The name in the banner, when the page declares it editable: it is written
     as it is typed, and it goes back to the record when the field is left. */
  el.pageTitle.addEventListener('input', function () {
    var p = PAGES.filter(function (x) { return x.id === current; })[0];
    if (!p || typeof p.rename !== 'function' || !EDIT.of(current)) return;
    p.rename(String(el.pageTitle.textContent || '').replace(/\s+/g, ' ').trim(), api);
  });
  el.pageTitle.addEventListener('blur', function () {
    var p = PAGES.filter(function (x) { return x.id === current; })[0];
    if (!p || typeof p.rename !== 'function' || !EDIT.of(current)) return;
    el.pageTitle.textContent = titleOf(p);
  });
  el.pageTitle.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); el.pageTitle.blur(); }
  });

  el.pageTitle.addEventListener('click', pictureOpen);
  el.viewer.addEventListener('click', function (ev) {
    if (!VIEW) { closePicture(); return; }
    if (ev.target.closest && ev.target.closest('.vnav, .vpick, .vcount')) return;
    if (viewSwiped && Date.now() - viewSwiped < 350) return;
    /* A choice stays on screen until one is picked or the back key closes it,
       because the pictures live only in this screen. */
    if (VIEW.pick) return;
    closePicture();
  });
  el.viewerPrev.addEventListener('click', function (ev) { ev.stopPropagation(); stepPicture(-1); });
  el.viewerNext.addEventListener('click', function (ev) { ev.stopPropagation(); stepPicture(1); });
  el.viewerPick.addEventListener('click', function (ev) {
    ev.stopPropagation();
    if (!VIEW || !VIEW.pick) return;
    var chosen = VIEW.pictures[VIEW.at];
    var pick = VIEW.pick;
    closePicture();
    pick(chosen);
  });

  /* A swipe across the picture moves between the pictures, the way the pages
     do, and a tap still closes the look. The tap that follows a swipe is the
     swipe's own, so it does not close what the finger just moved. */
  var viewFrom = null;
  var viewSwiped = 0;
  el.viewer.addEventListener('pointerdown', function (ev) {
    viewFrom = ev.button === undefined || ev.button === 0 ? { x: ev.clientX, y: ev.clientY } : null;
  });
  el.viewer.addEventListener('pointercancel', function () { viewFrom = null; });
  window.addEventListener('pointerup', function (ev) {
    var start = viewFrom;
    viewFrom = null;
    if (!start || !VIEW || VIEW.pictures.length < 2) return;
    var way = DRAG.swipe(start, { x: ev.clientX, y: ev.clientY });
    if (!way) return;
    viewSwiped = Date.now();
    stepPicture(way < 0 ? 1 : -1);
  });

  el.gear.addEventListener('click', function () {
    if (current === 'settings') { leaveSettings(); return; }
    settingsFrom = current;
    show('settings');
  });

  /* The one rewind takes back the last change any counter on a page made, and
     it says so the way a rest does. */
  function rewindOnce() {
    var rec = state.characters[state.current];
    if (!rec) return false;
    var out = REST.rewind(rec);
    if (!out) return false;
    sheet.closeAll();
    save();
    refresh();
    toast(out.note);
    return true;
  }

  el.rewind.addEventListener('click', rewindOnce);

  /* The back of the phone, asked by the app before it does anything: what is
     open over the page closes first, then the settings go back to the page
     they were opened from, then the last change is taken back. The answer
     says which, and 'none' lets the app step aside. */
  window.__sheetBack = function () {
    if (!el.viewer.hidden) { closePicture(); return 'closed'; }
    if (CREATOR.back()) return 'closed';
    if (sheet.top()) { sheet.close(); return 'closed'; }
    if (!el.condTip.hidden) { el.condTip.hidden = true; return 'closed'; }
    if (current === 'settings') { leaveSettings(); return 'closed'; }
    /* A page reached from a page, like the level up, is not a tab of the bar:
       back returns to the page it was opened from. */
    var open = PAGES.filter(function (x) { return x.id === current; })[0];
    if (open && open.back && barOrder().indexOf(current) < 0) { show(open.back); return 'closed'; }
    return rewindOnce() ? 'rewound' : 'none';
  };
  wireHead();
  wireSwipe();
  el.sheetClose.addEventListener('click', function () { sheet.close(); });
  el.sheet.addEventListener('click', function (ev) { if (ev.target === el.sheet) sheet.close(); });
  el.sheetSearch.addEventListener('input', function () {
    sheet.setSearch(el.sheetSearch.value);
    var layer = sheet.top();
    if (layer && layer.onSearch) layer.onSearch(el.sheetSearch.value);
  });
  el.grimoireLevel.addEventListener('click', function () {
    var layer = sheet.top();
    if (layer && layer.onLevel) layer.onLevel();
  });
  el.sheetList.addEventListener('click', function (ev) {
    var layer = sheet.top();
    if (layer && layer.onList) layer.onList(ev);
  });
  /* A row that carries a role is a control, so a keyboard reaches it too. */
  el.sheetList.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var row = ev.target.closest('[role="button"]');
    if (!row || row !== ev.target) return;
    ev.preventDefault();
    row.click();
  });
  /* A condition opens its own words, in a panel pinned to the bottom of the
     page, over the description it was read in. A condition the pop-up itself
     names opens the same way. */
  function openCondition(name) {
    var c = CONDITION_BY_NAME[String(name || '').toLowerCase()];
    el.condName.textContent = name;
    el.condText.innerHTML = (c && c.blocks && c.blocks.length)
      ? renderBlocks(c.blocks)
      : '<p>' + esc('The book has no words for ' + name + ' here.') + '</p>';
    el.condTip.hidden = false;
  }
  el.sheet.addEventListener('click', function (ev) {
    var cond = ev.target.closest('.tcond');
    if (!cond) return;
    openCondition(cond.dataset.cond);
  });
  el.condClose.addEventListener('click', function () { el.condTip.hidden = true; });

  /* ---- the boot ---- */

  function boot() {
    /* every page seeds the slice it owns, for every character */
    Object.keys(state.characters).forEach(function (id) {
      RECORD.seed(state.characters[id], false);
    });
    /* Only the character being played brings its package pages. */
    registerPluginPages(state.characters[state.current]);
    save();
    /* Every page reads a character, so a device that holds none shows the
       ways in and no page at all. */
    /* A sign in that was waiting when the app went away picks itself back
       up, so an approval in the browser is never lost. The shell is the only
       one awake, so it says the sentence and repaints. */
    if (!SHELF.signedIn() && SHELF.waiting()) SHELF.wait(function (ok) {
      if (!ok) return;
      toast(SHELF.last());
      refresh();
    });
    if (!Object.keys(state.characters).length) { openCharacters(); return; }
    var home = PAGES.filter(function (p) { return p.home; })[0];
    show(home ? home.id : (enabled()[0] || PAGES[0]).id);
  }

  /* The app comes back from the browser where the code was approved, so
     the wait is picked up again there. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || SHELF.signedIn() || !SHELF.waiting()) return;
    SHELF.wait(function (ok) {
      if (!ok) return;
      toast(SHELF.last());
      refresh();
    });
  });

  /* A tap that triggers something leaves its mark on the control it acted
     on: one listener for the whole app, on the controls that do something. */
  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('button,[data-tap]') : null;
    if (el) FEEDBACK.tap(el);
  }, true);

  window.Sheet = { page: page, core: core, show: show };

  /* The pictures come back from beside the store before the first paint and
     the first write. A store that does not answer in time does not hold the
     app back: the boot goes on, and the pictures arrive with a repaint. */
  var booted = false;
  function start() {
    if (booted) return;
    booted = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
  IMAGES.load(state).then(function () {
    if (booted && current) refresh();
    start();
  });
  setTimeout(start, 2500);
})();
