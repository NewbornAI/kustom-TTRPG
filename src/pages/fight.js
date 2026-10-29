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

  /* The fight of the character: the creatures and the counter. */
  function slice() {
    var rec = api.character();
    if (!rec.fight) rec.fight = { list: [], counter: 100 };
    if (!Array.isArray(rec.fight.list)) rec.fight.list = [];
    if (typeof rec.fight.counter !== 'number') rec.fight.counter = 100;
    return rec.fight;
  }

  function combatants() { return slice().list; }

  function commit() { api.save(); api.refresh(); }

  function byId(id) {
    var found = null;
    combatants().forEach(function (c) { if (c.id === id) found = c; });
    return found;
  }

  /* The order the table acts in: the initiative from the highest, the name
     for two creatures that share one. */
  function order() {
    return combatants().slice().sort(function (a, b) {
      var d = (Number(b.init) || 0) - (Number(a.init) || 0);
      if (d) return d;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  /* A creature is lit while its initiative is at or above the counter: it is
     still to act in this round. */
  function lit(c) {
    return (Number(c.init) || 0) >= (Number(slice().counter) || 0);
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
      init: 100,
      rolled: false,
      hp: hp,
      hpMax: hp,
      ac: C.creature.acOf(block, out),
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
      if (!a.attack) return C.creature.noteRow(a, null, null, false);
      return C.creature.attackGroup(a, null, C.creature.rollsOf(c, a.name), false);
    }).join('') + '</div>';
    return html;
  }

  function rowHtml(c) {
    var on = lit(c);
    var editing = api.editing('fight');
    var html = '<div class="inirow' + (on ? ' lit' : '') + '" data-id="' + esc(c.id) + '">';
    /* The initiative: the die that rolls it while it waits, the number once
       it was rolled, and a field in the edit mode. */
    if (editing) {
      html += '<input class="iniinit ininum" data-role="init" type="number" inputmode="numeric" value="' +
        (Number(c.init) || 0) + '" aria-label="Initiative of ' + esc(c.name) + '">';
    } else {
      html += '<button type="button" class="iniinit' + (c.rolled ? '' : ' waiting') + '" data-role="roll" ' +
        'aria-label="' + (c.rolled ? 'Roll the initiative of ' + esc(c.name) + ' again' : 'Roll the initiative of ' + esc(c.name)) + '">' +
        (c.rolled ? '' : C.chrome.dieIcon(20)) +
        '<span>' + (Number(c.init) || 0) + '</span></button>';
    }
    html += '<div class="inimid">' +
      '<button type="button" class="ininame" data-role="stat" aria-label="The stat block of ' + esc(c.name) + '">' +
        esc(c.name) + '</button>' +
      '<div class="inimeta">' +
        '<span class="iniac">AC ' + esc(c.ac) + '</span>' +
        '<button type="button" class="inihp" data-role="hp" aria-label="The hit points of ' + esc(c.name) + '">' +
          (Number(c.hp) || 0) + ' / ' + (Number(c.hpMax) || 0) + '</button>' +
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
    if (c.open) html += '<div class="iniatk">' + attacksHtml(c) + '</div>';
    return html;
  }

  function buildRows() {
    var list = order();
    E.list.innerHTML = list.map(rowHtml).join('');
    if (E.empty) E.empty.hidden = list.length > 0;
  }

  /* What the rows were built from: the creatures and what a row shows of
     them, the counter that lights them, and the mode. */
  function parts(a) {
    return [
      a.state.current,
      combatants().map(function (c) {
        return [c.id, c.init, c.rolled ? 1 : 0, c.hp, c.hpMax, c.ac, c.open ? 1 : 0].join(':');
      }).join('|'),
      slice().counter,
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
    var counter = Number(s.counter) || 0;
    var inits = combatants().map(function (c) { return Number(c.init) || 0; });
    var candidates = inits.filter(function (n) { return dir < 0 ? n < counter : n > counter; });
    if (candidates.length) {
      s.counter = dir < 0 ? Math.max.apply(null, candidates) : Math.min.apply(null, candidates);
    } else {
      /* The round is over going down, and the other arrow comes back from the
         top to the last creature of the round, so an arrow pressed one time
         too many is taken back by the one beside it. */
      s.counter = dir < 0 || !inits.length ? 100 : Math.min.apply(null, inits);
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
        { id: 'fightPrev', label: '\u25b2', aria: 'The turn before' },
        { id: 'fightNext', label: '\u25bc', quick: true, aria: 'The next turn' }
      ] })
    ].join('\n'),

    css: [
      '.inibar{flex:0 0 auto;padding:0 2px 4px}',
      '.inirow{display:flex;align-items:center;gap:8px;border:1px solid var(--edge);border-radius:8px;' +
        'background:rgba(255,255,255,.03);padding:5px 7px;min-height:54px}',
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
      '.inimeta{display:flex;align-items:center;gap:10px;font-size:10.5px;color:var(--muted)}',
      '.iniac{letter-spacing:.04em;font-variant-numeric:tabular-nums}',
      '.inihp{background:none;border:0;padding:0;font:inherit;font-size:11px;color:var(--ink);cursor:pointer;' +
        'font-variant-numeric:tabular-nums}',
      '.inihp:active{color:var(--gold)}',
      '.iniexp{flex:0 0 auto;width:28px;height:28px;display:flex;align-items:center;justify-content:center;' +
        'border:0;border-radius:6px;background:none;color:var(--muted);cursor:pointer;padding:0}',
      '.iniexp svg{width:16px;height:16px;display:block;transition:transform .16s}',
      '.iniexp.on svg{transform:rotate(180deg)}',
      '.inix{flex:0 0 auto;width:24px;height:24px;border:1px solid rgba(var(--miss-rgb),.55);border-radius:6px;' +
        'background:none;color:rgb(var(--miss-rgb));font-size:15px;line-height:1;cursor:pointer;padding:0}',
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
        var row = box.closest ? box.closest('.inirow') : null;
        var c = row ? byId(row.dataset.id) : null;
        if (!c || !name) return;
        C.creature.roll(c, name, ix, api, { mark: 'rows', root: root });
      });

      /* The initiative is typed in the edit mode, and the list sorts itself
         when the field is left rather than under the finger. */
      root.addEventListener('input', function (ev) {
        var field = ev.target.closest ? ev.target.closest('[data-role="init"]') : null;
        if (!field) return;
        var row = field.closest('.inirow');
        var c = row ? byId(row.dataset.id) : null;
        if (!c) return;
        if (field.value === '') return;
        var n = Number(field.value);
        if (!isFinite(n)) return;
        c.init = n;
        c.rolled = true;
        api.save();
      });
      root.addEventListener('change', function (ev) {
        var field = ev.target.closest ? ev.target.closest('[data-role="init"]') : null;
        if (!field) return;
        api.markDirty('rows');
        commit();
      });

      root.addEventListener('click', function (ev) {
        var roleEl = ev.target.closest ? ev.target.closest('[data-role]') : null;
        var row = ev.target.closest ? ev.target.closest('.inirow') : null;
        var c = row ? byId(row.dataset.id) : null;
        if (roleEl && c) {
          var role = roleEl.dataset.role;
          if (role === 'roll') { rollInit(c, roleEl); return; }
          if (role === 'stat') { C.creature.openStat(c, api); return; }
          if (role === 'hp') { openHp(c); return; }
          if (role === 'open') {
            c.open = !c.open;
            api.markDirty('rows');
            commit();
            return;
          }
          if (role === 'remove') { remove(c); return; }
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
