/* The spells page: the slots, the sorcery points and the list of spells. */
(function () {
  'use strict';

  var C = Sheet.core;
  var D = SheetDrag();
  var R = C.R;
  var SR = C.SR;
  var LEVELS = C.R.LEVELS;
  var WARLOCK_LEVEL = C.R.WARLOCK_LEVEL;

  var api = null;   /* the shell gives it at mount */
  var E = {};       /* the elements of the page */
  var S = {};       /* the state of the page */

  /* The book is a file beside the page, read when the page asks for it. The
     page says what the file fills, so the loader names no file of its own. */
  C.library.data('spellbook', function (value) {
    C.library.book.spells = value.spells || [];
    C.library.book.seed = value.seed || [];
    C.library.book.spells.forEach(function (spell) { C.library.bookByName[spell.name] = spell; });
  });

  var SPELL_DEFAULTS = {
    dc: 17,
    dcTouched: false,
    sp: 8,
    spMax: 8,
    cunning: false,
    sorcRest: false,
    sorcererLevel: 8,
    max: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
    left: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
    warlockMax: 2,
    warlockLeft: 2,
    warlockLevel: 2,
    slotsTouched: false,
    selected: 1,
    lists: {},
    /* The source of each spell is the character's own: the class or the
       feature that granted it. A spell with no entry has no source, and the
       flag says whether the player ever named one, since an empty map means
       nothing either way. */
    sources: {},
    sourcesTouched: false,
    /* How many scrolls of a spell the character holds, by name: only the
       spells whose source is Scroll carry one, and one with none here is one. */
    qty: {},
    pick: '',
    classes: {},
    levelFilter: true,
    surge: null
  };

  /* The spells of the app's own sheet travel in the page; the book itself is
     a file the app reads when the spells page opens. */
  var SPELL_SEED = C.library.seeds.spells || [];

  function commit() { api.save(); api.refresh(); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---- the state ---- */

  function seed(saved, fresh, rec) {
    var s = {};
    Object.keys(SPELL_DEFAULTS).forEach(function (k) { s[k] = SPELL_DEFAULTS[k]; });
    /* A character that is new holds nothing: no point, no slot, no spell.
       Its own record is read after, so one made from a ready-made
       character keeps everything that character was given. */
    if (fresh) {
      s.sp = 0;
      s.spMax = 0;
      s.max = {};
      s.left = {};
      s.warlockMax = 0;
      s.warlockLeft = 0;
      s.sorcererLevel = 1;
      s.classes = {};
      s.levelFilter = true;
      s.dcTouched = false;
    }
    if (saved && typeof saved === 'object') {
      Object.keys(SPELL_DEFAULTS).forEach(function (k) {
        if (saved[k] !== undefined && saved[k] !== null && typeof saved[k] === typeof SPELL_DEFAULTS[k]) s[k] = saved[k];
      });
      if (saved.classes) {
        s.classes = {};
        /* the class names were canonicalised, so an old key follows */
        Object.keys(saved.classes).forEach(function (k) { s.classes[C.library.canonSource(k)] = !!saved.classes[k]; });
      }
      if (saved.levelFilter !== undefined) s.levelFilter = !!saved.levelFilter;
      /* A save DC the player moved in an earlier version stays where it was
         put, and from now on it follows the character. */
      if (saved.dc !== undefined && Number(saved.dc) !== 17) s.dcTouched = true;
      if (saved.max) { s.max = {}; Object.keys(SPELL_DEFAULTS.max).forEach(function (k) { s.max[k] = Number(saved.max[k]) || 0; }); }
      if (saved.left) { s.left = {}; Object.keys(SPELL_DEFAULTS.left).forEach(function (k) { s.left[k] = Number(saved.left[k]) || 0; }); }
    }
    /* The spells of the character come first: a level it filled itself
       stays the way it left it, an empty one included. */
    var lists = {};
    LEVELS.forEach(function (lv) {
      var own = (saved && saved.lists && saved.lists[lv]) || null;
      if (own) {
        /* Until the book is in there is nothing to check a name against. */
        lists[lv] = C.library.book.spells.length ? own.filter(function (n) { return C.library.bookByName[n]; }) : own.slice();
        return;
      }
      if (fresh) { lists[lv] = []; return; }
      lists[lv] = SPELL_SEED.filter(function (sp) { return sp.level === lv; }).map(function (sp) { return sp.name; });
    });
    s.lists = lists;
    /* The slots of a character that holds classes come from the multiclass
       table, and its pact slots from the warlock level. The wrench can set
       them by hand, and they then stay where they are put. */
    if (!s.slotsTouched && rec && rec.char && Array.isArray(rec.char.classes) && rec.char.classes.length) {
      var rows = C.library.classRows(rec.char);
      var slots = SR.slotsFor(SR.casterLevel(rows));
      var pact = SR.pactFor(SR.warlockLevel(rows));
      var max = {}, left = {};
      LEVELS.forEach(function (lv) {
        if (!lv) return;
        var want = slots[lv] || 0;
        var before = Number(s.max[lv]) || 0;
        max[lv] = want;
        left[lv] = Math.max(0, Math.min(want, (Number(s.left[lv]) || 0) + (want - before)));
      });
      s.max = max;
      s.left = left;
      var wl = Number(s.warlockLeft) || 0;
      var wb = Number(s.warlockMax) || 0;
      s.warlockLevel = pact.level;
      s.warlockMax = pact.max;
      s.warlockLeft = Math.max(0, Math.min(pact.max, wl + (pact.max - wb)));
    }

    /* A record that names its own sources keeps exactly those. One saved
       before a character could name them takes the ones of the book, which
       are the ones of the sheet the book was built from, and a character
       that is new starts with none. */
    /* A character that named its own sources keeps exactly those, even when
       it cleared every one of them. One that never named any takes the ones
       of the book, which arrives after it does: the page fills them the
       first time it is painted with the book in hand. */
    /* The spells a wizard has prepared out of its book, by name. */
    s.prepared = {};
    if (saved && saved.prepared && typeof saved.prepared === 'object') {
      Object.keys(saved.prepared).forEach(function (n) { if (saved.prepared[n]) s.prepared[n] = true; });
    }

    s.qty = {};
    if (saved && saved.qty && typeof saved.qty === 'object') {
      Object.keys(saved.qty).forEach(function (n) {
        var q = Math.floor(Number(saved.qty[n]));
        if (isFinite(q) && q >= 0) s.qty[n] = Math.min(99, q);
      });
    }

    var named = saved && saved.sources && typeof saved.sources === 'object' &&
      (Object.keys(saved.sources).length > 0 || saved.sourcesTouched);
    s.sources = {};
    if (named) {
      /* A source the character names is kept even when the book has not
         arrived yet, or the names it holds would be lost. */
      Object.keys(saved.sources).forEach(function (n) {
        if (!saved.sources[n]) return;
        if (C.library.book.spells.length && !C.library.bookByName[n]) return;
        var one = saved.sources[n];
        if (Array.isArray(one)) {
          one = one.map(function (x) { return String(x || '').trim(); }).filter(function (x, i, l) { return x && l.indexOf(x) === i; });
          if (!one.length) return;
          s.sources[n] = one.length === 1 ? one[0] : one;
        } else s.sources[n] = String(one);
      });
    } else if (!fresh) {
      LEVELS.forEach(function (lv) {
        (lists[lv] || []).forEach(function (n) {
          var spell = C.library.bookByName[n];
          if (spell && spell.source) s.sources[n] = C.library.canonSource(spell.source);
        });
      });
    }
    return s;
  }

  /* ---- the strip of levels ---- */

  function pipButton(full, lv, n, warlock) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pip' + (warlock ? ' wl' : '') + (full ? ' full' : '');
    b.dataset.lv = String(lv);
    b.dataset.n = String(n);
    if (warlock) b.dataset.wl = '1';
    b.setAttribute('aria-label', (warlock ? 'Warlock slot ' : 'Slot ') + n);
    return b;
  }

  function editButton(sign, lv, warlock) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini';
    b.textContent = sign;
    b.dataset.edit = sign === '+' ? 'add' : 'take';
    b.dataset.lv = String(lv);
    if (warlock) b.dataset.wl = '1';
    return b;
  }

  /* The slots a level holds, the pact slots of its level included. */
  function countsOf() {
    return LEVELS.map(function (lv) {
      return (S.max[lv] || 0) + (lv === S.warlockLevel ? (S.warlockMax || 0) : 0);
    });
  }

  function leftAt(lv) {
    var left = Math.min(S.left[lv] || 0, S.max[lv] || 0);
    if (lv === S.warlockLevel) left += Math.min(S.warlockLeft || 0, S.warlockMax || 0);
    return left;
  }

  /* The levels are a bar of ten: the number, and under it the slots left
     at that level, so the bar still says it once the slots have scrolled
     away under it. A tap on a level shows its spells. The slots hang under
     the bar, one column a level, top aligned, the pact slots last in their
     column. In the edit mode the column holds the two steps of its maximum
     instead of its slots. */
  function renderLevels() {
    var editing = api.editing('spells');
    var counts = countsOf();
    E.lvBar.innerHTML = LEVELS.map(function (lv, ix) {
      var on = lv === S.selected;
      var count = lv === 0 ? '∞' : (counts[ix] ? String(leftAt(lv)) : '');
      return '<button type="button" class="lvb' + (on ? ' on' : '') + (lv > 0 && !counts[ix] ? ' dim' : '') + '"' +
        ' data-lv="' + lv + '" aria-current="' + (on ? 'true' : 'false') + '"' +
        ' aria-label="Level ' + lv + (lv && counts[ix] ? ', ' + leftAt(lv) + ' of ' + counts[ix] + ' slots left' : '') + '">' +
        '<span class="n">' + lv + '</span><span class="c">' + count + '</span></button>';
    }).join('');

    E.levels.innerHTML = '';
    E.levels.classList.toggle('editing', editing);
    E.levels.hidden = !editing && !counts.some(function (n, ix) { return LEVELS[ix] > 0 && n > 0; });
    LEVELS.forEach(function (lv, ix) {
      var max = S.max[lv] || 0;
      var left = Math.min(S.left[lv] || 0, max);
      var col = document.createElement('div');
      col.className = 'lv' + (lv === S.selected ? ' on' : '');
      col.dataset.lv = String(lv);

      var pips = document.createElement('span');
      pips.className = 'pips';
      for (var i = 1; i <= max; i++) pips.appendChild(pipButton(i <= left, lv, i, false));
      if (lv === S.warlockLevel && S.warlockMax) {
        for (var w = 1; w <= S.warlockMax; w++) pips.appendChild(pipButton(w <= S.warlockLeft, lv, w, true));
      }
      col.appendChild(pips);

      var edit = document.createElement('span');
      edit.className = 'edit';
      if (lv > 0) {
        edit.appendChild(editButton('+', lv, false));
        edit.appendChild(editButton('-', lv, false));
      }
      if (lv === S.warlockLevel && S.warlockMax) {
        var wl = document.createElement('span');
        wl.className = 'plus';
        wl.textContent = 'W';
        edit.appendChild(wl);
        edit.appendChild(editButton('+', lv, true));
        edit.appendChild(editButton('-', lv, true));
      }
      col.appendChild(edit);
      E.levels.appendChild(col);
    });
  }

  /* The bar casts a shadow once it is held at the top, so the list going
     under it reads as going under. */
  function paintStuck() {
    if (!E.scroll) return;
    var natural = E.levels.hidden ? E.listHead.offsetTop : E.levels.offsetTop;
    E.lvBar.classList.toggle('stuck', E.scroll.scrollTop > natural - E.lvBar.offsetHeight + 1);
  }

  /* A level picked from the bar once the bar is held at the top brings its
     slots back into sight, so the list starts from its first spell. */
  function pickLevel(lv) {
    if (lv === S.selected) return;
    S.selected = lv;
    commit();
    var top = E.sbar.offsetHeight;
    if (E.scroll.scrollTop > top) E.scroll.scrollTop = top;
  }

  /* Font of Magic: one tap spends a slot of the level on screen and gives
     that many sorcery points back. Shown with the sorcery points, which are
     the feature; dim at level 0, with no slot left there, or with the points
     already full. */
  function eatMove() {
    return R.convertSlot({ sp: S.sp, spMax: S.spMax, left: S.left, warlockLeft: S.warlockLeft }, S.selected, S.warlockLevel);
  }

  function paintEat() {
    var lv = S.selected;
    E.eat.hidden = !(S.spMax > 0);
    var why = !lv ? 'A cantrip has no slot'
      : (S.sp >= S.spMax ? 'Your sorcery points are full'
        : (!eatMove() ? 'No level ' + lv + ' slot left' : ''));
    E.eat.disabled = !!why;
    E.eat.setAttribute('aria-label', lv ? 'Eat a level ' + lv + ' slot for ' + lv + ' sorcery point' + (lv > 1 ? 's' : '') + (why ? ', ' + why : '') : why);
    E.eat.title = why || ('A level ' + lv + ' slot becomes ' + lv + ' sorcery point' + (lv > 1 ? 's' : ''));
  }

  function eat() {
    var moved = eatMove();
    if (!moved) return;
    var lv = S.selected;
    var before = C.rest.snapshot(api.character());
    S.left[lv] = moved.left;
    S.warlockLeft = moved.warlockLeft;
    S.sp = moved.sp;
    C.rest.push(api.character(), before);
    commit();
    bumpSp();
    api.toast('Level ' + lv + ' slot eaten · +' + moved.gained + ' sorcery point' + (moved.gained === 1 ? '' : 's'));
    C.feedback.tap(E.spStat);
  }

  /* ---- the list of spells ---- */

  /* The summary of a spell: the same fields, in the same order, on every
     card, so the labels line up down the list. */
  function spellFields(spell, full) {
    var comps = spell.components ? spell.components.split('').join(' ') : '-';
    var time = full ? (spell.timeFull || spell.time) : spell.time;
    var hasTrigger = !!(full && spell.timeFull && spell.timeFull !== spell.time);
    return C.chrome.field('Cast', time, '', hasTrigger) +
      C.chrome.field('Range', spell.range) +
      C.chrome.field('Duration', spell.duration) +
      C.chrome.field('Comps', comps, 'cmp') +
      C.chrome.field('Conc', spell.concentration ? 'Yes' : 'No', spell.concentration ? 'yes' : '') +
      C.chrome.field('Ritual', spell.ritual ? 'Yes' : 'No', spell.ritual ? 'rit' : '');
  }

  /* The words a card is too narrow for, written short. Only the units are
     touched, so a value still reads as itself. */
  function short(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/\bInstantaneous\b/g, 'Instant')
      .replace(/\bfeet\b/g, 'ft')
      .replace(/\bminutes\b/g, 'min')
      .replace(/\bminute\b/g, 'min');
  }

  /* The line under the name of a spell: the casting time, the range, the
     duration, and the mark of a spell that holds concentration. Four columns
     of one width, so the values line up down the list and the eye reads a
     column instead of a card. */
  function spellLine(spell) {
    return '<span>' + C.chrome.esc(short(spell.time)) + '</span>' +
      '<span>' + C.chrome.esc(short(spell.range)) + '</span>' +
      '<span>' + C.chrome.esc(short(spell.duration)) + '</span>' +
      '<span class="conc">' + (spell.concentration ? 'conc' : '') + '</span>';
  }

  /* How many spells of each class the lists hold, against the number the
     class prepares at its level. A cantrip is not prepared and an archetype
     or a feature grants its spells for free, so neither counts: only a
     spell whose source is the class itself does. */
  function preparedByClass() {
    var out = C.library.classRows(api.character().char).map(function (k) {
      var info = C.library.classInfo(k.name) || {};
      var table = info.prepared || [];
      return {
        name: k.name,
        n: 0,
        max: (table.length >= k.level) ? (table[k.level - 1] || 0) : 0
      };
    });
    if (!out.length) return out;
    LEVELS.forEach(function (lv) {
      if (!lv) return;
      (S.lists[lv] || []).forEach(function (name) {
        var canon = ownSource(name);
        if (!canon) return;
        /* A wizard's count is of the spells it prepared, not of its book. */
        if (canon === 'Wizard' && !S.prepared[name]) return;
        out.forEach(function (c) { if (canon === c.name) c.n += 1; });
      });
    });
    return out;
  }

  /* One small card for each class, in the row of the DC. */
  function renderClassCards() {
    if (!E.dcStat) return;
    var bar = E.dcStat.parentNode;
    Array.prototype.slice.call(bar.querySelectorAll('.spcard.own')).forEach(function (el) {
      bar.removeChild(el);
    });
    /* The toggles sit in a line of their own, so the cards go before
       them, and after every other card. */
    var anchor = bar.querySelector('.togs');
    preparedByClass().forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'spcard own';
      card.title = c.max
        ? c.n + ' of the ' + c.max + ' spells ' + c.name + ' prepares'
        : c.n + ' spells of ' + c.name;
      card.innerHTML = '<span class="k">' + C.chrome.esc(c.name) + '</span>' +
        '<span class="row"><span class="v">' + c.n + '</span>' +
        (c.max ? '<span class="of">/ ' + c.max + '</span>' : '') + '</span>';
      if (anchor && anchor.parentNode === bar) bar.insertBefore(card, anchor);
      else bar.appendChild(card);
    });
  }

  /* The sources of a spell, as a list: a spell learned from a class and
     held as a scroll has both. One source is kept as a plain string. */
  function srcList(name) {
    var v = S.sources[name];
    if (!v) return [];
    return (Array.isArray(v) ? v : [v]).map(function (x) { return C.library.canonSource(x); }).filter(Boolean);
  }

  function setSrcList(name, list) {
    if (!list.length) delete S.sources[name];
    else S.sources[name] = list.length === 1 ? list[0] : list;
  }

  function tagsOf(name, fallback) {
    var l = srcList(name);
    if (!l.length) return fallback ? C.library.sourceTag(fallback) : '';
    return l.map(function (x) { return C.library.sourceTag(x); }).join('');
  }

  /* A scroll is a spell one of whose sources is Scroll; it carries a count. */
  function isScroll(name) {
    return srcList(name).some(function (x) { return x.toLowerCase() === 'scroll'; });
  }

  function scrolls(name) {
    return S.qty[name] === undefined ? 1 : S.qty[name];
  }

  function renderSpellList() {
    var list = S.lists[S.selected] || [];
    E.spellList.innerHTML = '';
    /* A book that could not be read says so where the spells would be, with
       the one thing to do about it. */
    if (!C.library.book.spells.length && C.library.dataError.spellbook) {
      var failed = document.createElement('div');
      failed.className = 'empty failed';
      failed.innerHTML = '<span>The spells could not be read.</span>' +
        '<button class="stog" type="button" data-retry="spellbook">Retry</button>';
      E.spellList.appendChild(failed);
      return;
    }
    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No spells at level ' + S.selected + ' yet.';
      E.spellList.appendChild(empty);
      return;
    }
    list.forEach(function (name) {
      var spell = C.library.bookByName[name];
      if (!spell) return;
      var card = document.createElement('div');
      card.className = 'card';
      card.dataset.name = name;
      var prep = preparable(name)
        ? '<button type="button" class="prep' + (S.prepared[name] ? ' on' : '') + '" data-prep="1" role="checkbox" aria-checked="' +
          (S.prepared[name] ? 'true' : 'false') + '" aria-label="Prepared: ' + C.chrome.esc(spell.name) + '"><i></i></button>'
        : '';
      /* A spell a wizard can prepare carries its box at the left of the
         card, the height of both its lines. */
      card.classList.toggle('haspre', !!prep);
      card.classList.toggle('unprepared', !!prep && !S.prepared[name]);
      var scroll = isScroll(name);
      card.classList.toggle('outof', scroll && scrolls(name) === 0);
      var body = '<div class="top"><span class="t">' + C.chrome.esc(spell.name) + '</span>' +
        tagsOf(name, prep ? 'Wizard' : '') +
        (scroll ? '<span class="qty"><button type="button" data-qty="-1" aria-label="One scroll less of ' + C.chrome.esc(spell.name) + '">&minus;</button>' +
          '<b>' + scrolls(name) + '</b><button type="button" data-qty="1" aria-label="One scroll more of ' + C.chrome.esc(spell.name) + '">+</button></span>' : '') +
        '</div><div class="sub">' + spellLine(spell) + '</div>';
      card.innerHTML = prep ? prep + '<div class="cbody">' + body + '</div>' : body;
      E.spellList.appendChild(card);
    });
  }

  /* The level a spell sits in, or -1 when it is not in the list. */
  function listLevelOf(name) {
    for (var i = 0; i < LEVELS.length; i++) {
      var list = S.lists[LEVELS[i]] || [];
      if (list.indexOf(name) >= 0) return LEVELS[i];
    }
    return -1;
  }

  /* The classes of the character, by name. */
  function classNames() {
    return ((api.character().char || {}).classes || []).map(function (c) { return c.name; }).filter(Boolean);
  }

  /* Every name the books give as a source: the classes, their subclasses,
     and the sources the spell book was built with (the sheet of the app's
     own character). A source a player wrote in (a scroll, a wish) is none of
     them. */
  var bookSources = null;
  function isBookSource(name) {
    if (!bookSources) {
      if (!C.library.book.spells.length || !(C.library.classData || []).length) return false;
      bookSources = {};
      (C.library.classData || []).forEach(function (c) {
        bookSources[c.name] = true;
        (c.subclasses || []).forEach(function (x) { bookSources[x.name] = true; bookSources[x.short] = true; });
      });
      C.library.book.spells.forEach(function (sp) { if (sp.source) bookSources[C.library.canonSource(sp.source)] = true; });
    }
    return !!bookSources[name];
  }

  /* A source that names a class or subclass of the books this character
     does not have, which is a source it was handed by mistake: the book's
     own, from the character it was built for. */
  function foreignSource(src) {
    var canon = C.library.canonSource(src);
    if (!canon || sourceChoices().indexOf(canon) >= 0) return false;
    return isBookSource(canon);
  }

  /* The class a spell comes from for this character: one of its classes
     whose list holds the spell, else its first class. */
  function sourceFor(name) {
    var spell = C.library.bookByName[name] || {};
    var mine = classNames();
    var holds = mine.filter(function (c) { return (spell.classes || []).indexOf(c) >= 0; })[0];
    return holds || mine[0] || '';
  }

  /* The sources of the spells, set from the character's own classes: a spell
     with none takes the class whose list holds it on a sheet that never had
     any, and a source naming a class the character does not have
     is moved to one it does. A source the player wrote in stays. */
  function syncSources() {
    if (!C.library.book.spells.length) return;
    var moved = false;
    /* Sources are filled in only on a sheet that never had any; a sheet that
       has some keeps its empty ones empty. */
    var fill = !S.sourcesTouched && !Object.keys(S.sources || {}).length;
    LEVELS.forEach(function (lv) {
      (S.lists[lv] || []).forEach(function (n) {
        var now = S.sources[n];
        if (Array.isArray(now)) return;
        if (now ? !foreignSource(now) : !fill) return;
        var to = sourceFor(n);
        if (to && to !== now) { S.sources[n] = to; moved = true; }
      });
    });
    if (moved) api.save();
  }

  /* ---- the spells a wizard prepares ----

     A wizard keeps a book and prepares some of it: a spell whose source is
     the Wizard carries a box, and its count is of the boxes ticked. */
  function preparable(name) {
    var spell = C.library.bookByName[name];
    return !!spell && spell.level > 0 && ownSource(name) === 'Wizard';
  }

  /* The source a spell counts under: the one it names, or, when it names
     none, the character's class whose list holds it. Never the book's. */
  function ownSource(name) {
    var l = srcList(name);
    /* the class it was learned with, not the scroll it is also held as */
    var own = l.filter(function (x) { return x.toLowerCase() !== 'scroll'; })[0];
    return own || (l.length ? l[0] : sourceFor(name));
  }

  /* The save DC is the character's, until the player moves it here. */
  function saveDC() {
    if (S.dcTouched) return S.dc;
    var ch = api.character().char;
    /* Worked out, the effects count (a robe of the archmagi: spellDC + 2). */
    if (ch && ch.abilities) return C.SR.withEffects(api.character(), C.SR.spellDC(ch, C.library.primaryAbility(ch)), ['spellDC']);
    return S.dc;
  }

  /* The slots follow the classes until the wrench sets them by hand, so a
     class that gains a level moves them at once. */
  function syncSlots() {
    if (S.slotsTouched) return;
    var ch = api.character().char;
    if (!ch || !Array.isArray(ch.classes) || !ch.classes.length) return;
    var rows = C.library.classRows(ch);
    var want = SR.slotsFor(SR.casterLevel(rows));
    var pact = SR.pactFor(SR.warlockLevel(rows));
    var changed = false;
    /* The level of the sorcerer follows its class: the sorcerer rest gives
       half of it back in points. */
    var sorcLevel = 0;
    rows.forEach(function (r) { if (r.name === 'Sorcerer') sorcLevel += r.level; });
    if (sorcLevel && Number(S.sorcererLevel) !== sorcLevel) {
      S.sorcererLevel = sorcLevel;
      changed = true;
    }
    LEVELS.forEach(function (lv) {
      if (!lv) return;
      var wantMax = want[lv] || 0;
      var before = Number(S.max[lv]) || 0;
      if (before !== wantMax) {
        S.left[lv] = Math.max(0, Math.min(wantMax, (Number(S.left[lv]) || 0) + (wantMax - before)));
        S.max[lv] = wantMax;
        changed = true;
      }
    });
    if (Number(S.warlockMax) !== pact.max || Number(S.warlockLevel) !== pact.level) {
      S.warlockLeft = Math.max(0, Math.min(pact.max, (Number(S.warlockLeft) || 0) + (pact.max - (Number(S.warlockMax) || 0))));
      S.warlockMax = pact.max;
      S.warlockLevel = pact.level;
      changed = true;
    }
    if (changed) api.save();
  }

  function renderSpells() {
    syncSlots();
    syncSources();
    E.dcValue.textContent = saveDC();
    E.spValue.textContent = S.sp + '/' + S.spMax;
    /* A character with no sorcery point and no pact slot has no use for
       the sorcerer's controls, and one with no wild surge has no use for
       the table, so they go away rather than sit there doing nothing. */
    var sorc = S.spMax > 0;
    var wild = (api.character().char.features || []).some(function (f) { return f.key === 'wildSurge'; });
    E.spStat.hidden = !sorc;
    E.sorcRest.hidden = !sorc;
    E.cunning.hidden = !(S.warlockMax > 0);
    E.wildSurge.hidden = !wild;
    E.togs.hidden = !(sorc || S.warlockMax > 0 || wild);
    /* The four buttons take the one shape the custom buttons share. */
    if (!E.togs.hidden) C.toggle.shape(E.togs);
    E.cunning.setAttribute('aria-pressed', S.cunning ? 'true' : 'false');
    E.sorcRest.setAttribute('aria-pressed', S.sorcRest ? 'true' : 'false');
    E.sorcRest.title = 'Restores ' + Math.floor(S.sorcererLevel / 2) + ' sorcery points';
    E.dcStat.classList.toggle('editing', api.editing('spells'));
    renderClassCards();
    var list = S.lists[S.selected] || [];
    E.listTitle.textContent = 'Level ' + S.selected + ' spells · ' + list.length;
    renderLevels();
    paintEat();
    renderSpellList();
    paintStuck();
  }

  /* ---- the source of a spell ---- */

  /* What a character can declare as the source of a spell: the sources its
     own features name, which are its classes and the features that grant a
     spell, and the ones it already uses. A feat is a feature of its own and
     not a class, so it is left out. */
  function sourceChoices() {
    var ch = api.character().char || {};
    var out = [];
    function add(name) {
      name = String(name || '').trim();
      if (!name || name === 'Feat') return;
      if (out.indexOf(name) < 0) out.push(name);
    }
    (ch.classes || []).forEach(function (c) { add(c.name); });
    add('Scroll');
    (ch.features || []).forEach(function (f) { add(C.library.canonSource(f.source)); });
    /* A source in use that the player wrote in stays a choice; one that
       names a class of the books the character does not have does not. */
    var own = out.slice();
    Object.keys(S.sources || {}).forEach(function (n) {
      srcList(n).forEach(function (canon) {
        if (own.indexOf(canon) >= 0 || !isBookSource(canon)) add(canon);
      });
    });
    return out;
  }

  /* The source the next spell learns with. Nothing picked means the first
     class of the character, which is what a spell usually comes from. */
  function pickValue() {
    if (S.pick === 'none') return '';
    if (S.pick && sourceChoices().indexOf(S.pick) >= 0) return S.pick;
    return sourceChoices()[0] || '';
  }

  /* The row that declares it. */
  function sourceRow(own) {
    /* own: the sources of one spell, several allowed; none: the one the
       next spell learns with. */
    var chosen = own ? own : (pickValue() ? [pickValue()] : []);
    var html = '<div class="srcpick" id="srcpick"><span class="k">SOURCE</span>';
    sourceChoices().forEach(function (name) {
      var on = chosen.indexOf(name) >= 0;
      html += '<button type="button" class="spick' + (on ? ' on' : '') + '" data-src="' + C.chrome.esc(name) + '" ' +
        'aria-pressed="' + (on ? 'true' : 'false') + '">' + C.chrome.esc(name) + '</button>';
    });
    html += '<button type="button" class="spick' + (chosen.length ? '' : ' on') + '" data-src="none" ' +
      'aria-pressed="' + (chosen.length ? 'false' : 'true') + '">None</button></div>';
    return html;
  }

  function pickOn(root, onPick, onDone) {
    var row = root.querySelector('#srcpick');
    if (!row) return;
    row.addEventListener('click', function (ev) {
      var b = ev.target.closest('.spick');
      if (!b) return;
      S.pick = b.dataset.src;
      onPick(b.dataset.src === 'none' ? '' : b.dataset.src);
      onDone();
    });
  }

  /* ---- the cast slider of a spell ---- */

  /* The levels a spell may be cast at: its own level up to the highest slot
     the character has left, the pact slot counted among them. */
  function castRange(spell) {
    var lo = Number(spell.level) || 0;
    if (!lo) return null;
    var hi = 0, lv;
    for (lv = 1; lv <= 9; lv++) if ((S.left[lv] || 0) > 0) hi = lv;
    if ((S.warlockLeft || 0) > 0 && S.warlockLevel > hi) hi = S.warlockLevel;
    return hi >= lo ? { lo: lo, hi: hi } : null;
  }

  /* Where the slot of a level comes from: a regular slot first, the pact
     slot when the level is the pact's and no regular slot is left. */
  function slotKind(at) {
    if ((S.left[at] || 0) > 0) return 'slot';
    if (at === S.warlockLevel && (S.warlockLeft || 0) > 0) return 'pact';
    return '';
  }

  /* The live preview of the cast: the dice the spell deals at that level,
     what the slot adds, or the words that grow with it. */
  function previewHtml(spell, at) {
    var p = C.SR.castPreview(spell, at);
    if (!p) return '<span class="cnone">No higher slot changes it.</span>';
    var bits = [];
    if (p.dice) bits.push(C.chrome.markup('[[d:' + p.dice.n + 'd' + p.dice.sides +
      (p.dice.type ? ' ' + p.dice.type : '') + ']]'));
    if (p.add) bits.push('<span class="cplus">+' + p.add.n + 'd' + p.add.sides + '</span>');
    if (p.targets) bits.push('<span class="cplus">' + p.targets + ' more target' + (p.targets === 1 ? '' : 's') + '</span>');
    if (!bits.length && p.words.length) return C.chrome.renderBlocks(p.words);
    return bits.join(' ');
  }

  /* The levels a spell may be cast at, as the slider takes them. */
  function castLevels(range) {
    var out = [], lv;
    if (!range) return out;
    for (lv = range.lo; lv <= range.hi; lv++) out.push(lv);
    return out;
  }

  /* The row the description casts from: the level slider, in the look the
     page has always used, greyed from end to end when there is no slot. */
  function castRow(spell) {
    var range = castRange(spell);
    var at = range ? range.lo : (Number(spell.level) || 1);
    return C.slider.row({
      id: 'castRow',
      label: 'SLOT',
      levels: castLevels(range),
      value: at,
      preview: range ? previewHtml(spell, at) : '<span class="cnone">No slot to cast it with.</span>',
      aria: 'The level of the slot' + (range ? ', ' + range.lo + ' to ' + range.hi : ', none')
    });
  }

  /* The slider previews as it moves, and hands the level to the cast: the
     button of the layer says the level it would cast at. */
  function wireCast(root, spell, range, onPick) {
    var act = root.querySelector('.cast');
    return C.slider.wire(root, {
      levels: castLevels(range),
      previewAt: function (at) {
        return slotKind(at) ? previewHtml(spell, at)
          : '<span class="cnone">No level ' + at + ' slot left.</span>';
      },
      onPick: function (at) {
        if (act) act.textContent = 'Cast at level ' + at;
        onPick(at);
      }
    });
  }

  /* Casting spends the slot the slider chose and says so. */
  function castSpell(name, at) {
    var spell = C.library.bookByName[name];
    var kind = slotKind(at);
    if (!spell) return;
    if (!kind) { api.toast('No level ' + at + ' slot left.'); return; }
    var before = C.rest.snapshot(api.character());
    if (kind === 'slot') S.left[at] = Math.max(0, (S.left[at] || 0) - 1);
    else S.warlockLeft = Math.max(0, (S.warlockLeft || 0) - 1);
    C.rest.push(api.character(), before);
    api.sheet.close();
    commit();
    C.feedback.cast(spell.name, at);
    if (navigator.vibrate) navigator.vibrate(16);
  }

  /* ---- the spell of the page ---- */

  function openSpell(name) {
    var spell = C.library.bookByName[name];
    if (!spell) return;
    var learned = listLevelOf(name) >= 0 && Number(spell.level) > 0;
    var range = learned ? castRange(spell) : null;
    var picked = range ? range.lo : 0;
    var actions = [];
    if (learned) {
      actions.push({
        label: range ? 'Cast at level ' + range.lo : 'No slot',
        kind: 'cast',
        onClick: function () {
          if (!range) { api.toast('No slot to cast ' + spell.name + '.'); return; }
          castSpell(name, picked);
        }
      });
    }
    actions.push({
      label: 'Remove from level ' + S.selected,
      kind: 'danger',
      onClick: function () {
        var list = S.lists[S.selected] || [];
        var ix = list.indexOf(name);
        if (ix >= 0) list.splice(ix, 1);
        delete S.sources[name];
        api.sheet.close();
        commit();
      }
    });
    api.sheet.open({
      id: 'spell:' + name,
      title: spell.name,
      meta: C.chrome.field('Level', spell.level) + spellFields(spell, true) + tagsOf(name, ''),
      text: (learned ? castRow(spell) : '') + sourceRow(srcList(name)) + C.chrome.renderBlocks(spell.blocks) + C.chrome.sourceLine(spell.ref),
      actions: actions,
      onPaint: function (root) {
        if (learned) wireCast(root, spell, range, function (at) { picked = at; });
        /* A tap adds a source or takes it away, so a spell can be a class
           spell and a scroll at once; None clears them. */
        var row = root.querySelector('#srcpick');
        if (row) row.addEventListener('click', function (ev) {
          var b = ev.target.closest('.spick');
          if (!b) return;
          var l = srcList(name);
          if (b.dataset.src === 'none') l = [];
          else if (l.indexOf(b.dataset.src) >= 0) l = l.filter(function (x) { return x !== b.dataset.src; });
          else l.push(b.dataset.src);
          S.sourcesTouched = true;
          setSrcList(name, l);
          api.save();
          openSpell(name);
          renderSpellList();
        });
      }
    });
  }

  /* ---- the grimoire ---- */

  function grimoireTitle(lv) {
    var on = S.classes || {};
    var active = Object.keys(on).filter(function (c) { return on[c]; });
    var byLevel = S.levelFilter !== false;
    return 'Grimoire' + (byLevel ? ', level ' + lv : '') +
      (active.length ? ' \u00b7 ' + active.join(', ') : '');
  }

  function grimoireList(lv, q) {
    var on = S.classes || {};
    var active = Object.keys(on).filter(function (c) { return on[c]; });
    var byLevel = S.levelFilter !== false;
    var rows = (C.library.book.spells || [])
      .filter(function (s) { return byLevel ? s.level === lv : true; })
      .filter(function (s) {
        if (!active.length) return true;
        /* A class is compared by its one name, so Elf and High Elf are the
           same filter. */
        return (s.classes || []).some(function (c) { return active.indexOf(C.library.canonSource(c)) >= 0; });
      })
      .filter(function (s) {
        if (!q) return true;
        var needle = q.toLowerCase();
        if (s.name.toLowerCase().indexOf(needle) >= 0) return true;
        /* A player looking for the spells of a class says its name, so the
           classes of a spell answer to it as well. */
        return (s.classes || []).some(function (c) { return c.toLowerCase().indexOf(needle) >= 0; });
      });

    if (!rows.length) {
      if (!(C.library.book.spells || []).length) {
        return '<div class="empty">The book has not arrived yet.</div>';
      }
      return '<div class="empty">' + C.chrome.esc(active.length
        ? 'No spell of ' + active.join(', ') + (byLevel ? ' at this level' : '') + '.'
        : 'Nothing matches.') + '</div>';
    }

    return rows.map(function (s) {
      var at = listLevelOf(s.name);
      var added = at >= 0;
      /* A chip is a class of the book, and the spell says which ones it
         answers to. */
      var chips = (s.classes || []).map(function (c) {
        var name = C.library.canonSource(c);
        return { text: C.library.classShort(name), title: name, on: !!on[name], data: { cls: name } };
      });
      return C.card.row({
        name: { text: s.name, aria: 'Read ' + s.name },
        /* The badge adds the spell to the level or takes it out, and it says
           which of the two it will do. */
        badge: {
          text: added ? '\u2713' : '+',
          aria: (added ? 'Unlearn ' : 'Add ') + s.name,
          data: { add: s.name }
        },
        chips: chips,
        note: added ? 'in level ' + at : s.time,
        data: { name: s.name }
      });
    }).join('');
  }

  /* The level of the list, one slider: 0 to 9, and All at the end. The
     rows follow when it is let go; while it moves, only its ticks do. */
  function levelSlider(lv) {
    var all = S.levelFilter === false;
    var v = all ? 10 : lv;
    var ticks = '';
    for (var i = 0; i <= 10; i++) ticks += '<span' + (i === v ? ' class="on"' : '') + '>' + (i === 10 ? 'All' : i) + '</span>';
    return '<div class="glvl"><input class="lvlrange glrange" id="glRange" type="range" min="0" max="10" step="1" value="' + v + '" aria-label="Level of the spells, 0 to 9 or all">' +
      '<div class="glticks" id="glTicks">' + ticks + '</div></div>';
  }

  function openGrimoire(lv) {
    S.selected = lv;
    C.card.list({
      id: 'grimoire',
      title: grimoireTitle(lv),
      metaClass: 'sheet-meta one',
      meta: sourceRow() + levelSlider(lv),
      rows: grimoireList(lv, (api.sheet.search() || '').toLowerCase()),
      search: true,
      /* The source picker sits above the list, so it is wired once the layer
         is on screen. */
      onPaint: function (root) {
        pickOn(root, function () {}, function () { api.save(); openGrimoire(lv); });
        var range = root.querySelector('#glRange');
        if (range) {
          range.addEventListener('input', function () {
            Array.prototype.forEach.call(root.querySelectorAll('#glTicks span'), function (t, i) { t.classList.toggle('on', i === Number(range.value)); });
          });
          range.addEventListener('change', function () {
            var n = Number(range.value);
            S.levelFilter = n !== 10;
            api.save();
            openGrimoire(n === 10 ? lv : n);
          });
        }
      },
      onSearch: function () { openGrimoire(lv); },
      onPick: function (picked) {
        if (picked.cls !== undefined) {
          S.classes[picked.cls] = !S.classes[picked.cls];
          api.save();
          openGrimoire(lv);
          return;
        }
        if (picked.add !== undefined) {
          var level = listLevelOf(picked.add);
          if (level >= 0) {
            var list = S.lists[level] || [];
            var ix = list.indexOf(picked.add);
            if (ix >= 0) list.splice(ix, 1);
            delete S.sources[picked.add];
          } else {
            /* a spell goes to the level it has, whatever tab or filter the
               grimoire was opened from */
            var book = C.library.bookByName[picked.add];
            var at = book && book.level !== undefined ? Number(book.level) : S.selected;
            var target = S.lists[at] || (S.lists[at] = []);
            if (target.indexOf(picked.add) < 0) target.push(picked.add);
            /* the spell takes the source declared above the list */
            if (pickValue()) {
              S.sources[picked.add] = pickValue();
              S.sourcesTouched = true;
            } else delete S.sources[picked.add];
          }
          api.save();
          openGrimoire(lv);
          renderSpellList();
          return;
        }
        if (picked.name !== undefined) openSpell(picked.name);
      }
    });
    commit();
  }

  /* ---- the wild magic surge ---- */

  function openSurge() {
    var s = S.surge;
    var html = '<button class="surgelarge" type="button" id="surgeRoll" aria-label="Roll the wild magic surge">' +
      '<span class="surged100">' + (s ? s.roll : '--') + '</span></button>';
    if (s) {
      html += '<p>' + C.chrome.markup(s.text) + '</p>';
      if (s.dice && s.dice.length) {
        html += '<p>' + s.dice.map(function (d) {
          return C.chrome.esc(d.label) + ': ' + d.values.join(' + ') + ' = ' + d.total;
        }).join('<br>') + '</p>';
      }
    } else {
      html += '<p>Roll the surge to see what the wild magic does.</p>';
    }

    api.sheet.open({
      id: 'surge',
      title: 'Wild magic surge',
      meta: s
        ? C.chrome.field('Range', pad2(s.from) + '-' + pad2(s.to)) + C.chrome.field('Roll', 'd100: ' + s.roll)
        : C.chrome.field('Roll', 'd100'),
      text: html,
      actions: [{ label: 'Roll the surge', onClick: rollSurge }],
      onPaint: function (root) {
        var big = root.querySelector('#surgeRoll');
        if (big) big.addEventListener('click', rollSurge);
      }
    });
  }

  function rollSurge() {
    if (!C.library.surge.rows || !C.library.surge.rows.length) {
      api.toast('The surge table did not load.');
      return;
    }
    var result = R.rollSurge(C.library.surge.rows);
    S.surge = { roll: result.roll, from: result.from, to: result.to, text: result.text, dice: result.dice };
    api.save();
    openSurge();
    if (navigator.vibrate) navigator.vibrate(result.dice.length ? [14, 45, 14] : 16);
  }

  /* ---- the page ---- */

  Sheet.page({
    id: 'spells',
    glyph: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
    title: 'Spells',
    order: 2,
    blurb: 'The spell slots, the sorcery points and the list of spells.',
    on: true,
    css: [
      '.sbar{display:flex;gap:8px;align-items:center;flex:0 0 auto;flex-wrap:wrap}',
      '.togs{flex:1 1 100%;min-width:0}',
      '.spcard{flex:1 1 58px;min-width:0;max-width:110px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:4px 6px 5px;border:1px solid var(--edge);border-radius:8px;background:rgba(255,255,255,.03);}',
      '.spcard[hidden]{display:none}',
      '.srcpick{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:7px}',
      '.srcpick .k{font-size:9.5px;letter-spacing:.08em;color:var(--muted);margin-right:1px}',
      '.spick{font:inherit;font-size:10px;line-height:1;padding:4px 7px;border-radius:4px;border:1px solid var(--edge);background:none;color:var(--muted);cursor:pointer}',
      '.spick.on{border-color:rgba(var(--arcane-rgb),.55);color:var(--arcane);background:rgba(var(--arcane-rgb),.12)}',
      '.spick:focus-visible{outline:2px solid var(--arcane);outline-offset:1px}',
      '.tog[hidden]{display:none}',
      '.spcard .k{max-width:100%;font-size:9px;letter-spacing:.16em;text-align:center;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.spcard .row{display:flex;align-items:center;justify-content:center;gap:3px;min-width:0}',
      '.spcard .mini{display:none}',
      '.spcard.editing .mini,.spcard.live .mini{display:flex}',
      '.spcard .of{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.spcard .v{font-family:var(--display);font-size:19px;font-weight:700;line-height:1.15;color:var(--ink);font-variant-numeric:tabular-nums;text-align:center;}',
      '@keyframes bump{0%{transform:scale(1)}30%{transform:scale(1.2);color:var(--gold)}100%{transform:scale(1)}}',
      '.spcard .v.bump{animation:bump .45s ease-out;display:inline-block}',
      /* The shape of the three toggles is the shell's, the row's own; the page
         keeps their colour, which is the gold of a rest and the arcane of the
         wild surge. */
      '.tog[aria-pressed="true"]{border-color:rgba(var(--gold-rgb),.5);background:rgba(var(--gold-rgb),.10);color:var(--gold)}',
      '.tog.wild{color:var(--arcane);border-color:rgba(var(--arcane-rgb),.35)}',
      '.tog.wild:active{background:rgba(var(--arcane-rgb),.14);color:var(--arcane)}',
      '.surgelarge{display:block;width:100%;border:0;background:none;padding:4px 0 12px;cursor:pointer}',
      '.surged100{font-family:var(--display);font-weight:700;font-size:52px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums;text-shadow:0 0 26px rgba(var(--arcane-rgb),.35)}',
      '.surgelarge:active .surged100{color:var(--arcane)}',
      '.tog:disabled{opacity:.4;cursor:default}',
      /* The level bar: ten levels, the number over the slots left, held at
         the top of the page once the slots scroll away under it. */
      '.lvbar{position:sticky;top:0;z-index:2;flex:0 0 auto;display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:3px;padding:4px 2px;border-top:1px solid var(--edge);border-bottom:1px solid var(--edge);background:var(--void)}',
      '.lvbar::after{content:"";position:absolute;left:0;right:0;top:100%;height:12px;background:linear-gradient(rgba(0,0,0,.45),transparent);opacity:0;pointer-events:none;transition:opacity .15s ease}',
      '.lvbar.stuck::after{opacity:1}',
      '.lvb{height:var(--tap);min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:0;border:1px solid transparent;border-radius:var(--r-chip);background:none;color:#c9c4e4;font-family:var(--sans);cursor:pointer;touch-action:manipulation}',
      '.lvb .n{font-size:14px;line-height:1}',
      '.lvb .c{font-size:10px;line-height:1;min-height:10px;color:var(--muted);font-variant-numeric:tabular-nums}',
      '.lvb.dim{color:#4d4866}',
      '.lvb.on{border-color:rgba(var(--arcane-rgb),.6);background:rgba(var(--arcane-rgb),.18);color:var(--ink)}',
      '.lvb:focus-visible{outline:2px solid var(--arcane);outline-offset:1px}',
      '@media (prefers-reduced-motion:reduce){.lvbar::after{transition:none}}',
      /* The slots hang under the bar: one column a level, top aligned. */
      '.slotstrip{flex:0 0 auto;display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:3px;padding:4px 2px 2px;align-items:start}',
      '.slotstrip[hidden]{display:none}',
      '.lv{display:flex;flex-direction:column;align-items:stretch;gap:3px;min-width:0;cursor:pointer}',
      '.pips{display:flex;flex-direction:column;align-items:stretch;gap:3px;width:100%}',
      '.pip{width:100%;height:13px;border-radius:7px;border:1px solid var(--edge);background:transparent;flex:0 0 auto;padding:0;cursor:pointer;touch-action:manipulation}',
      '.pip.full{background:var(--arcane);border-color:var(--arcane)}',
      '.pip.wl{border-color:rgba(79,209,181,.45)}',
      '.pip.wl.full{background:#4fd1b5;border-color:#4fd1b5}',
      '.lv .plus{font-size:9px;color:#4f4a6b;text-align:center}',
      '.lv .edit{display:none;flex-direction:column;align-items:center;gap:3px}',
      '.slotstrip.editing .edit{display:flex}',
      '.slotstrip.editing .pips{display:none}',
      /* Eat, the fourth button of the row: a slot becomes sorcery points. */
      '.tog.eat{display:flex;align-items:center;justify-content:center;gap:4px;color:rgba(255,212,71,.95);border-color:rgba(255,212,71,.45);background:rgba(255,212,71,.07)}',
      '.tog.eat svg{width:14px;height:14px;flex:0 0 auto}',
      '.tog.eat:disabled{opacity:1;border-style:dashed;border-color:var(--edge);background:none;color:#4d4866}',
      '.empty.failed{display:flex;align-items:center;gap:10px;justify-content:space-between}',
      /* The words inside the slider's preview, which are this page's. */
      '.cplus{color:var(--muted)}',
      '.cnone{color:#615c7d}',
      /* The page is one scroller: the numbers, the buttons, the bar, the
         slots and the spells, so nothing folds and the bar alone stays. */
      '.grimoire{touch-action:pan-y;flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:column;gap:7px;overflow-y:auto;scrollbar-width:none;padding-bottom:12px}',
      '.spells{display:flex;flex-direction:column;gap:6px}',
      '.grimoire::-webkit-scrollbar{width:0}',
      '.card{border:1px solid var(--edge);border-radius:5px;background:rgba(255,255,255,.03);padding:7px 8px;cursor:pointer;touch-action:pan-y;}',
      '.card .top{display:flex;align-items:center;gap:8px}',
      '.card.haspre{display:flex;align-items:stretch;padding-left:0}',
      '.card .cbody{flex:1 1 auto;min-width:0}',
      '.card .prep{flex:0 0 40px;align-self:stretch;display:flex;align-items:center;justify-content:center;margin:-7px 8px -7px 0;padding:0;border:0;border-right:1px solid var(--edge);border-radius:5px 0 0 5px;background:none;cursor:pointer}',
      '.card .prep i{position:relative;width:20px;height:20px;border:1.5px solid rgba(var(--arcane-rgb),.7);border-radius:4px}',
      '.card .prep.on{background:rgba(var(--arcane-rgb),.12)}',
      '.card .prep.on i{background:rgb(var(--arcane-rgb));border-color:rgb(var(--arcane-rgb))}',
      '.card .prep.on i::after{content:"";position:absolute;left:5.5px;top:1.5px;width:5px;height:10px;border:solid var(--void);border-width:0 2px 2px 0;transform:rotate(45deg)}',
      '.card.unprepared .t{color:var(--muted)}',
      '.glvl{margin-top:6px}',
      '.glrange{width:100%;display:block}',
      '.glticks{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));margin-top:2px;font-size:11px;color:var(--muted);text-align:center}',
      '.glticks .on{color:var(--arcane);font-weight:700}',
      '.card.outof .t{color:var(--muted);text-decoration:line-through}',
      '.card .qty{flex:0 0 auto;display:flex;align-items:center;gap:2px;margin:-4px -4px -4px 0}',
      '.card .qty button{width:34px;height:34px;border:1px solid var(--edge);border-radius:var(--r-control);background:rgba(255,255,255,.04);color:var(--ink);font-size:17px;line-height:1;padding:0;cursor:pointer;touch-action:manipulation}',
      '.card .qty b{min-width:1.7em;text-align:center;font-family:var(--display);font-size:15px;font-variant-numeric:tabular-nums}',
      '.card .t{flex:1 1 auto;min-width:0;font-size:12.5px;color:var(--ink);line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.card .sub{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:6px;margin-top:3px;font-size:11px;line-height:1.35;color:var(--muted)}',
      '.card .sub > *{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.card .sub .conc{color:var(--gold);letter-spacing:.04em}',
      '.card .src{flex:0 0 auto;font-size:9.5px;color:var(--muted);border:1px solid var(--edge);border-radius:3px;padding:0 4px;white-space:nowrap}',
      '.card .src.sorc{color:#ff8fb0;border-color:rgba(255,111,168,.45);background:rgba(255,111,168,.10)}',
      '.card .src.warlock{color:#9dbcff;border-color:rgba(110,155,255,.45);background:rgba(110,155,255,.10)}',
      '.card .src.izzet{color:#e6ebff;border-color:rgba(140,160,255,.5);background:linear-gradient(90deg,rgba(110,155,255,.26) 0 50%,rgba(255,111,168,.26) 50% 100%)}',
      '.card .src.elf{color:#8fe084;border-color:rgba(122,216,111,.45);background:rgba(122,216,111,.10)}',
      '.card .src.bard{color:#c9a7ff;border-color:rgba(178,132,255,.45);background:rgba(178,132,255,.10)}',
      '.card.dragging{opacity:.95;border-color:var(--arcane);box-shadow:0 10px 24px rgba(0,0,0,.55)}',
      '.f .v.cmp{color:var(--arcane);letter-spacing:.08em}',
      '.f .v.rit{color:var(--gold)}',
      '.card.ghost{opacity:.25}',
      '@media (prefers-reduced-motion:reduce){.spcard .v.bump{animation:none}}',
    ].join('\n'),
    html: [
      '<div class="grimoire" id="spellScroll">',
      '<div class="sbar">',
      '  <div class="spcard editing" id="dcStat">',
      '    <span class="k">DC</span>',
      '    <span class="row">',
      '      <button class="mini" type="button" data-act="dc-" aria-label="Lower the DC">&minus;</button>',
      '      <span class="v" id="dcValue">17</span>',
      '      <button class="mini" type="button" data-act="dc+" aria-label="Raise the DC">+</button>',
      '    </span>',
      '  </div>',
      '  <div class="spcard live" id="spStat">',
      '    <span class="k">SP</span>',
      '    <span class="row">',
      '      <button class="mini" type="button" data-act="sp-" aria-label="Spend a sorcery point">&minus;</button>',
      '      <span class="v" id="spValue">8/8</span>',
      '      <button class="mini" type="button" data-act="sp+" aria-label="Regain a sorcery point">+</button>',
      '    </span>',
      '  </div>',
      '  <div class="togs" data-bar>',
      '    <button class="tog" id="cunning" type="button" aria-pressed="false" title="Restores 1 warlock slot">Cunning</button>',
      '    <button class="tog" id="sorcRest" type="button" aria-pressed="false" title="Restores half your sorcerer level in sorcery points">Sorc rest</button>',
      '    <button class="tog wild" id="wildSurge" type="button" title="The wild magic surge">Wild</button>',
      '    <button class="tog eat" id="eatSlot" type="button">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
        '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>Eat</button>',
      '  </div>',
      '</div>',
      '<nav class="lvbar" id="lvBar" aria-label="Spell level"></nav>',
      '<div class="slotstrip" id="levels"></div>',
      C.chrome.sectionHead('Level 1 spells', { id: 'listTitle', action: { id: 'addSpell', label: 'Add a spell' } }),
      '<div class="spells" id="spellList"></div>',
      '</div>'
    ].join('\n'),

    seed: seed,

    mount: function (root, a) {
    a.core.library.data('spellbook');
      api = a;
      S = a.character().spells;
      E = {
        dcStat: root.querySelector('#dcStat'),
        dcValue: root.querySelector('#dcValue'),
        spValue: root.querySelector('#spValue'),
        spStat: root.querySelector('#spStat'),
        cunning: root.querySelector('#cunning'),
        sorcRest: root.querySelector('#sorcRest'),
        wildSurge: root.querySelector('#wildSurge'),
        togs: root.querySelector('.togs'),
        eat: root.querySelector('#eatSlot'),
        scroll: root.querySelector('#spellScroll'),
        sbar: root.querySelector('.sbar'),
        lvBar: root.querySelector('#lvBar'),
        levels: root.querySelector('#levels'),
        listTitle: root.querySelector('#listTitle'),
        listHead: root.querySelector('#listTitle').closest('.cshead'),
        addSpell: root.querySelector('#addSpell'),
        spellList: root.querySelector('#spellList')
      };

      E.cunning.addEventListener('click', function () {
        var beforeCunning = C.rest.snapshot(api.character());
        S.cunning = !S.cunning;
        if (S.cunning) S.warlockLeft = Math.min(S.warlockMax, S.warlockLeft + 1);
        else S.warlockLeft = Math.max(0, S.warlockLeft - 1);
        C.rest.push(api.character(), beforeCunning);
        commit();
      });

      E.sorcRest.addEventListener('click', function () {
        var gain = Math.floor(S.sorcererLevel / 2);
        var beforeRest = C.rest.snapshot(api.character());
        S.sorcRest = !S.sorcRest;
        if (S.sorcRest) S.sp = Math.min(S.spMax, S.sp + gain);
        else S.sp = Math.max(0, S.sp - gain);
        C.rest.push(api.character(), beforeRest);
        commit();
        bumpSp();
      });

      E.wildSurge.addEventListener('click', function () { openSurge(); });
      E.eat.addEventListener('click', eat);

      E.lvBar.addEventListener('click', function (ev) {
        var b = ev.target.closest('.lvb');
        if (b) pickLevel(Number(b.dataset.lv));
      });
      E.scroll.addEventListener('scroll', paintStuck, { passive: true });

      E.addSpell.addEventListener('click', function () { openGrimoire(S.selected); });

      root.querySelector('.sbar').addEventListener('click', function (ev) {
        var m = ev.target.closest('.mini[data-act]');
        if (!m) return;
        var act = m.dataset.act;
        if (act === 'dc+') { S.dc = saveDC() + 1; S.dcTouched = true; }
        else if (act === 'dc-') { S.dc = Math.max(0, saveDC() - 1); S.dcTouched = true; }
        else if (act === 'sp+') {
          var beforeSp = C.rest.snapshot(api.character());
          C.counter.set(api.character(), 'sp', S.sp + 1);
          C.rest.push(api.character(), beforeSp);
          C.feedback.back('sorcery point', 1, S.sp + 1);
        } else if (act === 'sp-') {
          var beforeSpend = C.rest.snapshot(api.character());
          C.counter.spend(api.character(), 'sp');
          C.rest.push(api.character(), beforeSpend);
          C.feedback.spent('sorcery point', 1, Math.max(0, S.sp - 1));
        }
        commit();
      });

      E.levels.addEventListener('click', function (ev) {
        var pip = ev.target.closest('.pip');
        if (pip) {
          var lv = Number(pip.dataset.lv), n = Number(pip.dataset.n);
          var key = pip.dataset.wl ? 'warlock' : 'slot:' + lv;
          /* A full pip spends one; an empty one fills up to the pip that was
             tapped, because that is how many the player says are left. */
          var beforePip = C.rest.snapshot(api.character());
          var hadPip = (C.counter.counterOf(api.character(), key) || {}).left || 0;
          if (pip.classList.contains('full')) C.counter.spend(api.character(), key);
          else C.counter.set(api.character(), key, n);
          var nowPip = (C.counter.counterOf(api.character(), key) || {}).left || 0;
          if (nowPip < hadPip) C.feedback.spent('spell slot', hadPip - nowPip, nowPip);
          else if (nowPip > hadPip) C.feedback.back('spell slot', nowPip - hadPip, nowPip);
          C.rest.push(api.character(), beforePip);
          commit();
          return;
        }
        var eb = ev.target.closest('.edit .mini');
        if (eb) {
          var l = Number(eb.dataset.lv);
          var d = eb.dataset.edit === 'add' ? 1 : -1;
          if (eb.dataset.wl) {
            var wBefore = S.warlockMax;
            S.slotsTouched = true;
            S.warlockMax = Math.max(0, Math.min(9, wBefore + d));
            if (S.warlockMax > wBefore) S.warlockLeft = Math.min(S.warlockMax, S.warlockLeft + (S.warlockMax - wBefore));
            else S.warlockLeft = Math.min(S.warlockLeft, S.warlockMax);
          } else {
            var before = S.max[l] || 0;
            S.slotsTouched = true;
            S.max[l] = Math.max(0, Math.min(9, before + d));
            if (S.max[l] > before) S.left[l] = Math.min(S.max[l], (S.left[l] || 0) + (S.max[l] - before));
            else S.left[l] = Math.min(S.left[l], S.max[l]);
          }
          commit();
          return;
        }
        var row = ev.target.closest('.lv');
        if (row && row.dataset.lv !== undefined) pickLevel(Number(row.dataset.lv));
      });

      E.spellList.addEventListener('click', function (ev) {
        var retry = ev.target.closest('[data-retry]');
        if (retry) { C.library.data(retry.dataset.retry); return; }
        if (drag.wasDragged()) return;
        var q = ev.target.closest('[data-qty]');
        if (q) {
          var nm = q.closest('.card').dataset.name;
          C.rest.push(api.character());
          S.qty[nm] = Math.max(0, Math.min(99, scrolls(nm) + Number(q.dataset.qty)));
          api.save();
          api.refresh();
          return;
        }
        var box = ev.target.closest('[data-prep]');
        if (box) {
          var at = box.closest('.card').dataset.name;
          C.rest.push(api.character());
          if (S.prepared[at]) delete S.prepared[at]; else S.prepared[at] = true;
          api.save();
          api.refresh();
          return;
        }
        var card = ev.target.closest('.card');
        if (card) openSpell(card.dataset.name);
      });

      /* The cards can be dragged to reorder them, and the order is the
         list's. */
      var drag = D.list(E.spellList, {
        row: '.card',
        key: 'name',
        layout: 'list',
        onOrder: function (keys) { S.lists[S.selected] = keys; api.save(); }
      });
    },

    /* The wrench edits the maximum of the slots, and the shell keeps the flag
       and the pressed state. */
    head: function (root, a) {
      api = a;
      S = a.character().spells;
      root.appendChild(a.wrench({ label: 'Edit the slot maximums' }));
    },

    render: function (a) {
      api = a;
      S = a.character().spells;
      renderSpells();
    }
  });

  function bumpSp() {
    E.spValue.classList.remove('bump');
    void E.spValue.offsetWidth;
    E.spValue.classList.add('bump');
  }
})();
