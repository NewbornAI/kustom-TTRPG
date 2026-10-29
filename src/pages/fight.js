/* The fight: the creatures of a large battle, in the order they act.

   The game master rolls the initiative of each creature, and the list sorts
   itself: the highest first, the name when two share one. A creature that
   has not rolled yet stands at 100 with the die that rolls it, so the ones
   still to roll wait at the top and the order of the battle is read from the
   top down.

   Two arrows at the bottom move the counter, which is the initiative of the
   turn being played: a creature at or above it is lit, the ones below have
   acted and dim. The counter is not a number on the screen, it is the
   boundary the light draws.

   A row carries what the table needs of a creature: its initiative, its name,
   its armour class, its hit points, and the attacks of its block under the
   chevron. A tap on the name reads the whole stat block, the way the summons
   does, and the hit points open the keypad of the sheet. */
(function () {
  'use strict';

  var C = Sheet.core;

  var api = null;
  var E = {};

  /* Above any initiative a table rolls, and the place a creature waits at
     before its initiative is rolled: an empty initiative is the top of the
     order, so the creatures still to roll stand above the ones that did. */
  var TOP = 999;

  /* The fight of the character: the creatures and the counter. */
  function slice() {
    var rec = api.character();
    if (!rec.fight) rec.fight = { list: [], counter: 100 };
    if (!Array.isArray(rec.fight.list)) rec.fight.list = [];
    if (typeof rec.fight.counter !== 'number') rec.fight.counter = 100;
    /* The place a creature waits at used to be 100 written in its initiative;
       an empty initiative is what waits now, so an old card is read as one. */
    rec.fight.list.forEach(function (c) {
      if (!c.rolled && Number(c.init) === 100) c.init = null;
    });
    return rec.fight;
  }

  function combatants() { return slice().list; }

  function commit() { api.save(); api.refresh(); }

  function byId(id) {
    var found = null;
    combatants().forEach(function (c) { if (c.id === id) found = c; });
    return found;
  }

  /* The order the table acts in: the creatures still to roll first, then the
     initiative from the highest, the name for two creatures that share one. */
  function order() {
    return combatants().slice().sort(function (a, b) {
      var ea = a.init === null || a.init === undefined || a.init === '';
      var eb = b.init === null || b.init === undefined || b.init === '';
      if (ea !== eb) return ea ? -1 : 1;
      if (!ea) {
        var d = (Number(b.init) || 0) - (Number(a.init) || 0);
        if (d) return d;
      }
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  /* The top of the order: the empty initiative of a creature still to roll
     when there is one, the highest initiative otherwise, and the sentinel in
     an empty fight or a fight where every creature waits. */
  function topInit() {
    var top = 0;
    var any = false;
    var waiting = false;
    combatants().forEach(function (c) {
      if (c.init === null || c.init === undefined || c.init === '') { waiting = true; return; }
      var n = Number(c.init) || 0;
      if (!any || n > top) { top = n; any = true; }
    });
    if (waiting || !any) return TOP;
    return top;
  }

  /* The counter is the initiative of the turn being played. It is read at the
     top of the order when it sits above it, because a counter above the
     highest initiative lights no creature at all, and a fight that lights
     nothing reads as broken rather than as waiting. */
  function counter() {
    var stored = Number(slice().counter);
    if (!isFinite(stored)) return topInit();
    return Math.min(stored, topInit());
  }

  /* A creature is lit while its initiative is at or above the counter: it is
     the one playing, or one that has played. The rest are still to act, and a
     creature that has not rolled waits at the top, so it is lit. */
  function lit(c) {
    if (c.init === null || c.init === undefined || c.init === '') return true;
    return (Number(c.init) || 0) >= counter();
  }

  /* ---- the creature that joins ---- */

  /* The bestiary, as a list to search. The name, the challenge and the book
     are what a game master looks for; the tap adds the block to the fight
     with its hit points full and its initiative waiting. */
  function openBestiary() {
    var all = C.library.bestiary.creatures || {};
    var needle = String(api.sheet.search() || '').toLowerCase();
    var keys = Object.keys(all).sort(function (a, b) {
      return String(all[a].name || '').localeCompare(String(all[b].name || ''));
    });
    var rows = [];
    var found = 0;
    for (var i = 0; i < keys.length; i++) {
      var block = all[keys[i]];
      var name = String(block.name || '');
      if (needle && name.toLowerCase().indexOf(needle) < 0) continue;
      found++;
      if (rows.length >= 80) continue;
      rows.push(C.card.row({
        name: { text: name, aria: 'Add ' + name + ' to the fight' },
        note: 'CR ' + (block.cr || '0') + ' \u00b7 ' + String(block.source || ''),
        data: { key: keys[i] }
      }));
    }
    if (!rows.length) rows.push('<div class="empty">No creature of that name.</div>');
    else if (found > rows.length) {
      rows.push('<div class="empty">And ' + (found - rows.length) + ' more. Type to narrow the list.</div>');
    }
    C.card.list({
      id: 'fightbestiary',
      title: 'The bestiary',
      metaClass: 'sheet-meta one',
      meta: '<span>' + Object.keys(all).length + ' creatures</span>',
      rows: rows,
      search: true,
      placeholder: 'Search a creature',
      onSearch: function () { openBestiary(); },
      onPick: function (picked) {
        if (!picked.key) return;
        addCreature(picked.key);
      }
    });
  }

  /* A creature comes to the fight at full hit points, with the initiative of
     the block as its bonus and no roll yet. */
  function addCreature(key) {
    var block = C.creature.block(key);
    if (!block) return;
    var card = { key: key, form: '', slot: null, rolls: {}, saves: {} };
    var out = C.creature.derive(card, api);
    var hp = C.creature.hpOf(block, out);
    var c = {
      id: 'f' + Date.now() + Math.floor(Math.random() * 1000),
      key: key,
      name: block.name,
      init: null,
      rolled: false,
      hp: hp,
      hpMax: hp,
      ac: C.creature.acOf(block, out),
      status: [],
      open: false,
      rolls: {},
      saves: {},
      edit: { ac: '', hpMax: '', attacks: {} }
    };
    combatants().push(c);
    api.markDirty('rows');
    commit();
    api.toast(c.name + ' joins the fight');
    api.sheet.closeAll();
  }

  function remove(c) {
    C.rest.push(api.character());
    slice().list = combatants().filter(function (x) { return x.id !== c.id; });
    api.markDirty('rows');
    commit();
    api.toast(c.name + ' leaves the fight');
  }

  /* ---- the statuses of a creature ---- */

  /* The conditions of the book, each with the colour it wears and a glyph
     that says what it does at 14 pixels: the eye it cannot use, the heart it
     follows, the lock of a body that will not move. A status the book does
     not name is the player's own words, kept as a chip. */
  var STATUS = [
    { key: 'blinded', label: 'Blinded', colour: '#8f8aa8', path: 'M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5zM4.5 19.5l15-15' },
    { key: 'charmed', label: 'Charmed', colour: '#ff7ab6', path: 'M12 20s-7-4.4-7-9a3.8 3.8 0 0 1 7-2.3A3.8 3.8 0 0 1 19 11c0 4.6-7 9-7 9z' },
    { key: 'deafened', label: 'Deafened', colour: '#7fb3d5', path: 'M4 9v6h4l5 4V5L8 9zM16.5 9.5l5 5M21.5 9.5l-5 5' },
    { key: 'exhaustion', label: 'Exhaustion', colour: '#e0a63a', path: 'M3 8h15v8H3zM21 11v2M6.5 11v2' },
    { key: 'frightened', label: 'Frightened', colour: '#b48cff', path: 'M12 4v9.5M12 17.5v.5' },
    { key: 'grappled', label: 'Grappled', colour: '#e08b4a', path: 'M7 12V9a1.7 1.7 0 0 1 3.4 0v3M10.4 12V6.5a1.7 1.7 0 0 1 3.4 0V12M13.8 12V8a1.7 1.7 0 0 1 3.4 0v6.5a5.5 5.5 0 0 1-5.5 5.5h-1a5.5 5.5 0 0 1-5.5-5.5V13a1.7 1.7 0 0 1 3.4 0' },
    { key: 'incapacitated', label: 'Incapacitated', colour: '#d9534f', path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM6 18L18 6' },
    { key: 'invisible', label: 'Invisible', colour: '#7fd8ff', path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', dash: '2 2.6' },
    { key: 'paralyzed', label: 'Paralyzed', colour: '#6f8cff', path: 'M6.5 11h11v9.5h-11zM9 11V8a3 3 0 0 1 6 0v3' },
    { key: 'petrified', label: 'Petrified', colour: '#9aa0a6', path: 'M4.5 9.5l4-4.5 6 1 5 5-2 7.5-7 1.5-5-4z' },
    { key: 'poisoned', label: 'Poisoned', colour: '#7ad86f', path: 'M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0c0-4.4 6-10.8 6-10.8z' },
    { key: 'prone', label: 'Prone', colour: '#c9a27a', path: 'M3 17h11M17.5 17H21M4.5 13.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' },
    { key: 'restrained', label: 'Restrained', colour: '#8fa3bf', path: 'M10 14l4-4M8 16l-1.4 1.4a3.6 3.6 0 0 1-5.1-5.1L4.6 9.2a3.6 3.6 0 0 1 5.1 0M16 8l1.4-1.4a3.6 3.6 0 0 1 5.1 5.1L19.4 14.8a3.6 3.6 0 0 1-5.1 0' },
    { key: 'stunned', label: 'Stunned', colour: '#ffc44d', path: 'M12 3l2 6.5 6.5 2-6.5 2-2 6.5-2-6.5L3.5 11.5 10 9.5z' },
    { key: 'unconscious', label: 'Unconscious', colour: '#6f6a8d', path: 'M5 6h8l-8 8h8M15 14h4l-4 4h4' }
  ];

  var STATUS_BY_KEY = {};
  STATUS.forEach(function (s) { STATUS_BY_KEY[s.key] = s; });

  /* The statuses of a creature: the key of a condition, or the words of one
     the book does not name. */
  function statuses(c) {
    if (!Array.isArray(c.status)) c.status = [];
    return c.status;
  }

  function hasStatus(c, key) {
    var found = false;
    statuses(c).forEach(function (s) { if (s.key === key) found = true; });
    return found;
  }

  function toggleStatus(c, key) {
    var list = statuses(c);
    var at = -1;
    list.forEach(function (s, i) { if (s.key === key) at = i; });
    if (at >= 0) list.splice(at, 1);
    else list.push({ key: key });
    api.markDirty('rows');
    commit();
  }

  function addCustomStatus(c, text) {
    var words = String(text || '').trim().slice(0, 24);
    if (!words) return;
    statuses(c).push({ text: words });
    api.markDirty('rows');
    commit();
    api.toast(words + ' on ' + c.name);
  }

  function dropCustomStatus(c, text) {
    c.status = statuses(c).filter(function (s) { return s.text !== text; });
    api.markDirty('rows');
    commit();
  }

  /* The glyph of a status, in the disc of its colour. */
  function statusIcon(s, cls) {
    var known = STATUS_BY_KEY[s.key];
    var colour = known ? known.colour : '#9b93c9';
    var path = known ? known.path : 'M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM12 8v5M12 16v.5';
    var dash = known && known.dash ? ' stroke-dasharray="' + known.dash + '"' : '';
    return '<span class="' + cls + '" style="--st:' + colour + '" title="' + esc(known ? known.label : s.text) + '" ' +
      'aria-label="' + esc(known ? known.label : s.text) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false"' + dash + '><path d="' + path + '"/></svg></span>';
  }

  /* The statuses on the row, at most three, and the number of the rest. */
  function statusRow(c) {
    var list = statuses(c);
    var out = '<span class="inists">';
    list.slice(0, 3).forEach(function (s) {
      out += s.text
        ? '<span class="inisttxt" title="' + esc(s.text) + '">' + esc(s.text) + '</span>'
        : statusIcon(s, 'inist');
    });
    if (list.length > 3) {
      var rest = list.slice(3).map(function (s) {
        var known = STATUS_BY_KEY[s.key];
        return known ? known.label : s.text;
      }).join(', ');
      out += '<span class="inistmore" title="' + esc(rest) + '" aria-label="' + esc(rest) + '">+' +
        (list.length - 3) + '</span>';
    }
    out += '</span>';
    return out;
  }

  /* The layer of the statuses: every condition as a button with its icon and
     its name, on or off for this creature, and a field for a status of the
     player's own. Tapping a condition adds it or takes it away. */
  function openStatus(c) {
    var out = '<div class="fstgrid">';
    STATUS.forEach(function (s) {
      var on = hasStatus(c, s.key);
      out += '<button type="button" class="fstog' + (on ? ' on' : '') + '" data-status="' + s.key + '" ' +
        'aria-pressed="' + (on ? 'true' : 'false') + '">' + statusIcon(s, 'fsticon') +
        '<span>' + esc(s.label) + '</span></button>';
    });
    out += '</div>';
    var mine = statuses(c).filter(function (s) { return s.text; });
    if (mine.length) {
      out += '<div class="fstmine">' + mine.map(function (s) {
        return '<button type="button" class="fstchip" data-drop="' + esc(s.text) + '" ' +
          'aria-label="Remove ' + esc(s.text) + '">' + esc(s.text) + ' &times;</button>';
      }).join('') + '</div>';
    }
    out += '<div class="fstnew">' +
      '<input type="text" id="fstatNew" class="fstfield" placeholder="A status of your own" ' +
        'aria-label="A status of your own" maxlength="24">' +
      '<button type="button" class="fstadd" data-custom="add" aria-label="Add the status">Add</button>' +
      '</div>';
    api.sheet.open({
      id: 'fightstatus:' + c.id,
      title: c.name,
      dock: true,
      list: out,
      onList: function (ev) {
        var root = ev.currentTarget || document;
        var pick = ev.target.closest ? ev.target.closest('[data-status]') : null;
        if (pick) {
          toggleStatus(c, pick.dataset.status);
          C.feedback.tap(pick);
          openStatus(c);
          return;
        }
        var chip = ev.target.closest ? ev.target.closest('[data-drop]') : null;
        if (chip) {
          dropCustomStatus(c, chip.dataset.drop);
          openStatus(c);
          return;
        }
        var add = ev.target.closest ? ev.target.closest('[data-custom]') : null;
        if (!add) return;
        var field = root.querySelector('#fstatNew');
        if (!field) return;
        addCustomStatus(c, field.value);
        field.value = '';
        openStatus(c);
      }
    });
  }

  /* ---- the rows ---- */

  function esc(text) { return C.chrome.esc(text); }

  /* The attacks of the block, under the chevron: the same boxes the summons
     rolls, read from the same module. The fight keeps no uses, so an action
     that is not an attack shows its dice without a counter. */
  function attacksHtml(c) {
    var out = C.creature.derive(c, api);
    var actions = out ? out.actions : [];
    if (!actions.length) return '<div class="ininote">No attack in the block.</div>';
    var multi = null;
    actions.forEach(function (a) { if (a.count) multi = a; });
    var html = '<div class="inihead"><span class="inikey">Attacks</span>' +
      (multi ? '<span class="inisep">-</span><span class="inikey">' + esc(multi.name) + '</span>' +
        '<span class="inimult">\u00d7' + multi.count + '</span>' : '') + '</div>';
    html += '<div class="satk">' + actions.map(function (a) {
      if (a.count) return '';
      /* An action that rolls on a table, the eye rays of a beholder, is rolled
         rather than swung: one die picks the ray, and the damage of that ray
         is rolled with it. */
      if (a.table) return C.creature.tableGroup(a, (c.tables || {})[a.name], false);
      if (!a.attack) return C.creature.noteRow(a, null, null, false, true);
      return C.creature.attackGroup(a, null, C.creature.rollsOf(c, a.name), false);
    }).join('') + '</div>';
    return html;
  }

  function rowHtml(c) {
    var on = lit(c);
    var editing = api.editing('fight');
    var html = '<div class="inirow' + (on ? ' lit' : '') + '" data-id="' + esc(c.id) + '">';
    /* The initiative: the die alone while it waits, the number once it was
       rolled, and a field in the edit mode. */
    var blank = c.init === null || c.init === undefined || c.init === '';
    if (editing) {
      html += '<input class="iniinit ininum" data-role="init" type="number" inputmode="numeric" value="' +
        (blank ? '' : Number(c.init)) + '" aria-label="Initiative of ' + esc(c.name) + '">';
    } else {
      html += '<button type="button" class="iniinit' + (blank ? ' waiting' : '') + '" data-role="init-roll" ' +
        'aria-label="' + (blank ? 'Roll the initiative of ' + esc(c.name) : 'Roll the initiative of ' + esc(c.name) + ' again') + '">' +
        (blank
          ? C.chrome.dieIcon(20)
          : '<span>' + Number(c.init) + '</span>') + '</button>';
    }
    html += '<div class="inimid">' +
      (editing
        ? '<input class="ininame ininamefield" data-role="name" type="text" value="' + esc(c.name) + '" aria-label="Name of the creature">'
        : '<button type="button" class="ininame" data-role="stat" aria-label="The stat block of ' + esc(c.name) + '">' +
          esc(c.name) + '</button>') +
      '<div class="inimeta">' +
        '<span class="iniac">AC ' + esc(c.ac) + '</span>' +
        '<button type="button" class="inihp" data-role="hp" aria-label="The hit points of ' + esc(c.name) + '">' +
          (Number(c.hp) || 0) + ' / ' + (Number(c.hpMax) || 0) + '</button>' +
        statusRow(c) +
        '<button type="button" class="inistadd" data-role="status" aria-label="Add a status to ' + esc(c.name) + '">+</button>' +
      '</div>' +
    '</div>';
    html += '<button type="button" class="iniexp' + (c.open ? ' on' : '') + '" data-role="open" ' +
      'aria-expanded="' + (c.open ? 'true' : 'false') + '" aria-label="The attacks of ' + esc(c.name) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg></button>';
    if (editing) {
      html += '<button type="button" class="inix" data-role="remove" aria-label="Remove ' + esc(c.name) + ' from the fight">&times;</button>';
    }
    html += '</div>';
    /* The attacks sit under the row rather than inside it, so the block of a
       swing names the creature it belongs to as the row does. */
    if (c.open) html += '<div class="iniatk" data-id="' + esc(c.id) + '">' + attacksHtml(c) + '</div>';
    return html;
  }

  function buildRows() {
    var list = order();
    E.list.innerHTML = list.map(rowHtml).join('');
    if (E.empty) E.empty.hidden = list.length > 0;
  }

  /* What the rows were built from: the creatures and what a row shows of
     them, the counter that lights them, the mode, and the corpus itself, so a
     row opened before the bestiary arrived is built again with its attacks. */
  function parts(a) {
    return [
      a.state.current,
      Object.keys(C.library.bestiary.creatures || {}).length,
      combatants().map(function (c) {
        return [c.id, c.init, c.rolled ? 1 : 0, c.hp, c.hpMax, c.ac, c.open ? 1 : 0].join(':');
      }).join('|'),
      counter(),
      a.editing('fight') ? 'edit' : 'read'
    ];
  }

  /* ---- the turn ---- */

  /* The counter steps to the initiative of the next creature, or of the one
     before, so a press is one creature and never a number to count down. At
     the end of the round it goes back to the top, where everybody is lit
     again. */
  function step(dir) {
    var s = slice();
    var now = counter();
    var inits = combatants().map(function (c) {
      if (c.init === null || c.init === undefined || c.init === '') return null;
      return Number(c.init) || 0;
    }).filter(function (n) { return n !== null; });
    if (!inits.length) {
      s.counter = TOP;
    } else {
      var candidates = inits.filter(function (n) { return dir < 0 ? n < now : n > now; });
      if (candidates.length) {
        s.counter = dir < 0 ? Math.max.apply(null, candidates) : Math.min.apply(null, candidates);
      } else {
        /* The round is over going down, and the other arrow comes back from
           the top to the last creature of the round, so an arrow pressed one
           time too many is taken back by the one beside it. */
        s.counter = dir < 0 ? topInit() : Math.min.apply(null, inits);
      }
    }
    api.markDirty('rows');
    commit();
  }

  /* ---- the hit points ---- */

  function moveHp(c, kind, amount) {
    var hp = { current: Number(c.hp) || 0, max: Number(c.hpMax) || 0, temp: 0 };
    var next = C.SR.hpMove(hp, kind, amount);
    if (next.current === hp.current) return;
    var lost = hp.current - next.current;
    C.rest.push(api.character());
    c.hp = next.current;
    api.markDirty('rows');
    commit();
    if (kind === 'damage') C.feedback.spent('hit point', Math.max(1, lost || amount), c.hp);
    else if (kind === 'heal') C.feedback.back('hit point', -lost, c.hp);
    else api.toast('Hit points set to ' + c.hp);
  }

  function openHp(c) {
    C.hpBox.open(api, {
      id: 'fight:' + c.id,
      title: c.name,
      hp: { current: Number(c.hp) || 0, max: Number(c.hpMax) || 0, temp: 0 },
      onMove: function (kind, amount) { moveHp(c, kind, amount); }
    });
  }

  /* ---- the initiative ---- */

  function rollInit(c, button) {
    var block = C.creature.block(c.key);
    var result = C.R.rollInitiative(C.creature.initBonus(block));
    c.init = result.total;
    c.rolled = true;
    api.markDirty('rows');
    commit();
    if (button) C.feedback.tap(button);
  }

  /* ---- the page ---- */

  Sheet.page({
    id: 'fight',
    glyph: 'M6 3v18M6 4h11l-2.5 4L17 12H6',
    title: 'Fight',
    tab: 'Fight',
    order: 10,
    blurb: 'The creatures of a large battle, in the order they act.',
    slice: 'fight',
    seed: function (saved) {
      var s = { list: [], counter: 100 };
      if (saved && typeof saved === 'object') {
        if (Array.isArray(saved.list)) s.list = saved.list;
        if (typeof saved.counter === 'number') s.counter = saved.counter;
      }
      return s;
    },

    html: [
      '<div class="inibar">' +
        C.chrome.sectionHead('Initiative', { action: { id: 'fightAdd', label: 'Add a creature from the bestiary' } }) +
      '</div>',
      '<div class="charbody">',
      '  <div id="fightList"></div>',
      '  <div class="empty" id="fightEmpty" hidden>No creature in the fight.</div>',
      '</div>',
      /* The turn, in the shared look of the cast bar: the two arrows are the
         one place the battle moves. */
      C.cast.row({ buttons: [
        { id: 'fightPrev', label: '\u25b2', quick: true, aria: 'The turn before' },
        { id: 'fightNext', label: '\u25bc', aria: 'The next turn' }
      ] })
    ].join('\n'),

    css: [
      '.inibar{flex:0 0 auto;padding:0 2px 4px}',
      /* Ten rows fit a phone: the row is 48, the badge keeps its 44 of touch. */
      '.inirow{display:flex;align-items:center;gap:8px;border:1px solid var(--edge);border-radius:8px;' +
        'background:rgba(255,255,255,.03);padding:2px 6px;min-height:48px}',
      '.inirow.lit{border-color:rgba(var(--arcane-rgb),.42);background:rgba(var(--arcane-rgb),.06)}',
      '.inirow:not(.lit) .ininame,.inirow:not(.lit) .inimeta{opacity:.45}',
      '.iniinit{flex:0 0 auto;width:44px;min-height:44px;display:flex;flex-direction:column;align-items:center;' +
        'justify-content:center;gap:1px;padding:0;border:1px solid var(--edge);border-radius:8px;background:none;' +
        'color:var(--muted);font-family:var(--display);font-weight:700;font-size:15px;line-height:1;cursor:pointer;' +
        'font-variant-numeric:tabular-nums;touch-action:manipulation}',
      '.inirow.lit .iniinit{color:var(--arcane);border-color:rgba(var(--arcane-rgb),.5)}',
      '.iniinit svg{width:15px;height:15px;display:block}',
      '.iniinit.waiting{color:#8a84a8}',
      '.ininum{text-align:center;font-family:var(--display);font-size:15px}',
      '.inimid{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.ininame{min-width:0;background:none;border:0;padding:0;font:inherit;font-size:13px;color:var(--ink);' +
        'text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ininame:active{color:var(--arcane)}',
      '.ininamefield{width:100%;min-width:0;background:none;border:0;border-bottom:1px solid var(--edge);' +
        'border-radius:0;padding:0 0 1px;font:inherit;font-size:13px;color:var(--ink)}',
      '.ininamefield:focus{outline:none;border-bottom-color:var(--arcane);color:var(--arcane)}',
      '.inimeta{display:flex;align-items:center;gap:10px;font-size:10.5px;color:var(--muted)}',
      '.iniac{letter-spacing:.04em;font-variant-numeric:tabular-nums}',
      '.inihp{background:none;border:0;padding:0;font:inherit;font-size:11px;color:var(--ink);cursor:pointer;' +
        'font-variant-numeric:tabular-nums}',
      '.inihp:active{color:var(--gold)}',
      '.inists{display:flex;align-items:center;gap:3px;min-width:0}',
      '.inist{flex:0 0 auto;width:18px;height:18px;display:flex;align-items:center;justify-content:center;' +
        'border-radius:50%;color:var(--st);background:color-mix(in srgb, var(--st) 16%, transparent);' +
        'border:1px solid color-mix(in srgb, var(--st) 55%, transparent)}',
      '.inist svg{width:12px;height:12px;display:block}',
      '.inisttxt{flex:0 0 auto;max-width:74px;height:18px;display:flex;align-items:center;padding:0 6px;' +
        'border:1px solid var(--edge);border-radius:9px;font-size:9.5px;color:var(--ink);' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.inistmore{flex:0 0 auto;font-size:9.5px;color:var(--muted);font-variant-numeric:tabular-nums}',
      '.inistadd{flex:0 0 auto;width:20px;height:20px;display:flex;align-items:center;justify-content:center;' +
        'border:1px dashed var(--edge);border-radius:50%;background:none;color:var(--muted);' +
        'font-size:12px;line-height:1;padding:0;cursor:pointer}',
      '.inistadd:active{color:var(--arcane);border-color:rgba(var(--arcane-rgb),.6)}',
      /* the layer of the statuses */
      '.fstgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
      '.fstog{display:flex;align-items:center;gap:8px;min-height:44px;padding:4px 8px;border:1px solid var(--edge);' +
        'border-radius:8px;background:none;color:var(--ink);font:inherit;font-size:12px;cursor:pointer;text-align:left}',
      '.fstog.on{border-color:rgba(var(--arcane-rgb),.55);background:rgba(var(--arcane-rgb),.1)}',
      '.fsticon{flex:0 0 auto;width:26px;height:26px;display:flex;align-items:center;justify-content:center;' +
        'border-radius:50%;color:var(--st);background:color-mix(in srgb, var(--st) 16%, transparent);' +
        'border:1px solid color-mix(in srgb, var(--st) 55%, transparent)}',
      '.fsticon svg{width:17px;height:17px;display:block}',
      '.fstmine{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
      '.fstchip{display:flex;align-items:center;gap:5px;min-height:30px;padding:0 10px;border:1px solid var(--edge);' +
        'border-radius:999px;background:rgba(255,255,255,.03);color:var(--ink);font:inherit;font-size:12px;cursor:pointer}',
      '.fstnew{display:flex;gap:6px;margin-top:10px}',
      '.fstfield{flex:1 1 auto;min-width:0;min-height:38px;padding:0 10px;border:1px solid var(--edge);border-radius:8px;' +
        'background:rgba(255,255,255,.03);color:var(--ink);font-family:var(--sans);font-size:13px}',
      '.fstadd{flex:0 0 auto;min-height:38px;padding:0 14px;border:1px solid rgba(var(--arcane-rgb),.5);border-radius:8px;' +
        'background:rgba(var(--arcane-rgb),.14);color:var(--ink);font-family:var(--sans);font-size:13px;cursor:pointer}',
      '.iniexp{flex:0 0 auto;width:34px;height:34px;display:flex;align-items:center;justify-content:center;' +
        'border:0;border-radius:6px;background:none;color:var(--muted);cursor:pointer;padding:0}',
      '.iniexp svg{width:16px;height:16px;display:block;transition:transform .16s}',
      '.iniexp.on svg{transform:rotate(180deg)}',
      '.inix{flex:0 0 auto;width:28px;height:28px;border:1px solid rgba(var(--miss-rgb),.55);border-radius:6px;' +
        'background:none;color:rgb(var(--miss-rgb));font-size:16px;line-height:1;cursor:pointer;padding:0}',
      '.iniatk{margin:2px 0 0 52px;display:flex;flex-direction:column;gap:5px}',
      '.inihead{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--muted)}',
      '.inikey{letter-spacing:.1em;text-transform:uppercase;color:#6f6a8d}',
      '.inisep{color:#4f4a6b}',
      '.inimult{color:var(--gold);font-variant-numeric:tabular-nums}',
      '.ininote{font-size:11px;color:var(--muted)}'
    ].join('\n'),

    mount: function (root, a) {
      C.library.data('bestiary');
      api = a;
      /* The fight slice is one the back key takes back: a creature removed by
         mistake comes back with the step. */
      C.rest.track('fight');
      E = {
        list: root.querySelector('#fightList'),
        empty: root.querySelector('#fightEmpty'),
        add: root.querySelector('#fightAdd'),
        prev: root.querySelector('#fightPrev'),
        next: root.querySelector('#fightNext')
      };
      E.add.addEventListener('click', function () { openBestiary(); });
      /* The down arrow is the next turn, which is the lower initiative. */
      E.prev.addEventListener('click', function () { step(1); });
      E.next.addEventListener('click', function () { step(-1); });

      /* A swing rolls on a tap of its box, the way it does in the summons:
         the box decides what counts as that tap. */
      C.horizontalAttackBox.wire(root, function (ix, name, box) {
        /* The row and the attacks under it carry the same id, so a swing of
           an open row finds its creature. */
        var holder = box.closest ? box.closest('[data-id]') : null;
        var c = holder ? byId(holder.dataset.id) : null;
        if (!c || !name) return;
        C.creature.roll(c, name, ix, api, { mark: 'rows', root: root });
      });

      /* The initiative and the name are typed in the edit mode, and the list
         sorts itself when the field is left rather than under the finger. An
         initiative emptied by hand puts the creature back among the ones
         still to roll. */
      root.addEventListener('input', function (ev) {
        var field = ev.target.closest ? ev.target.closest('[data-role="init"], [data-role="name"]') : null;
        if (!field) return;
        var row = field.closest('.inirow');
        var c = row ? byId(row.dataset.id) : null;
        if (!c) return;
        if (field.dataset.role === 'name') {
          c.name = field.value;
          api.save();
          return;
        }
        if (field.value === '') { c.init = null; c.rolled = false; api.save(); return; }
        var n = Number(field.value);
        if (!isFinite(n)) return;
        c.init = n;
        c.rolled = true;
        api.save();
      });
      root.addEventListener('change', function (ev) {
        var field = ev.target.closest ? ev.target.closest('[data-role="init"], [data-role="name"]') : null;
        if (!field) return;
        api.markDirty('rows');
        commit();
      });

      root.addEventListener('click', function (ev) {
        var roleEl = ev.target.closest ? ev.target.closest('[data-role]') : null;
        /* The attacks under a row carry the id of the row, so a die of the
           block reaches the creature it belongs to. */
        var row = ev.target.closest ? ev.target.closest('[data-id]') : null;
        var c = row ? byId(row.dataset.id) : null;
        if (roleEl && c) {
          var role = roleEl.dataset.role;
          if (role === 'init-roll') { rollInit(c, roleEl); return; }
          if (role === 'table') { C.creature.rollTable(c, roleEl.dataset.name, api, { mark: 'rows', root: root }); return; }
          /* The die and the body of a swing are the attack box's own taps,
             which it hands back to the page as a roll. */
          if (role === 'roll') return;
          if (role === 'stat') { C.creature.openStat(c, api); return; }
          if (role === 'hp') { openHp(c); return; }
          if (role === 'status') { openStatus(c); return; }
          if (role === 'open') {
            c.open = !c.open;
            api.markDirty('rows');
            commit();
            return;
          }
          if (role === 'remove') { remove(c); return; }
          /* A field of the edit mode works itself, and the row under it is
             not a tap. */
          if (role === 'init' || role === 'name') return;
          return;
        }
        /* A tap on the box of a swing is the box's own. */
        if (ev.target.closest && ev.target.closest('.sblock')) return;
        /* Anywhere else on the row reads the creature. */
        if (c) C.creature.openStat(c, api);
      });
    },

    head: function (root, a) {
      api = a;
      root.appendChild(a.wrench({ label: 'Edit the fight' }));
    },

    render: function (a) {
      api = a;
      a.paint(parts(a), { build: buildRows });
    }
  });
})();
