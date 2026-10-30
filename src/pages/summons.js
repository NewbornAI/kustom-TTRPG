/* The summons page: the creatures a character has called to the table.
   A summon carries a name the player may rename, an armour class, the hit
   points, the attacks with their bonus and their damage, and the slot that
   paid for it. What the block of the creature says is worked out with the
   level of that slot, so a spirit that is called at a higher level carries
   the numbers of that level.

   The stats are edited with the wrench, the way the rest of the app edits
   a character. What is left when the wrench is off is the table: the hit
   points to move and the attacks to roll. */
(function () {
  'use strict';

  var C = Sheet.core;

  var api = null;       /* the shell gives it at mount */
  var E = {};           /* the elements of the page */
  var machine = null;   /* the creatures the machine holds, once it answered */
  var hpOpened = null;  /* the hit points the open box was opened on */
  var hpMaxOpened = ''; /* the maximum the open box was opened on */
  /* ---- the slice of the character ---- */

  function slice() {
    var rec = api.character();
    if (!rec.summons) rec.summons = { list: [] };
    if (!rec.summons.list) rec.summons.list = [];
    return rec.summons;
  }

  function summons() { return slice().list; }

  /* The level and the form a creature was last called with belong to the
     creature, not to the card, so the next call of it opens on them. */
  function pickKey(card) {
    return String(card.source || '') + '|' + String(card.key || '');
  }

  function picks() {
    var s = slice();
    if (!s.picks || typeof s.picks !== 'object') s.picks = {};
    return s.picks;
  }

  /* What a creature was called with, under the key it is called by now. A
     key written before the corpus held every book is the name alone, so the
     name finds the pick again rather than losing it. */
  function pickOf(sourceId, key) {
    var all = picks();
    var one = all[String(sourceId) + '|' + key];
    if (one) return one;
    var bare = String(key).split('|')[0];
    return all[String(sourceId) + '|' + bare] || null;
  }

  function rememberPick(card) {
    if (!card || !card.source || !card.key) return;
    var one = { form: card.form || '' };
    if (card.slot !== -1 && card.slot !== null && card.slot !== undefined) one.slot = Number(card.slot) || 0;
    picks()[pickKey(card)] = one;
  }

  function commit() { api.save(); api.refresh(); }

  function byId(id) {
    var found = null;
    summons().forEach(function (s) { if (s.id === id) found = s; });
    return found;
  }

  /* ---- the summons the character can call ---- */

  /* A spell summons when the book says so, and a feature brings a creature
     when its text names one. What the character already has is the seed. */
  function sources() {
    var rec = api.character();
    var out = [];
    var S = rec.spells || {};
    var lists = S.lists || {};
    Object.keys(lists).forEach(function (lv) {
      (lists[lv] || []).forEach(function (name) {
        var spell = C.library.bookByName[name];
        if (!spell || !spell.summons) return;
        out.push({
          id: 'spell:' + name,
          kind: 'spell',
          name: spell.name,
          level: spell.level,
          concentration: !!spell.concentration,
          creatures: spell.creatures || []
        });
      });
    });
    var feats = (rec.char && rec.char.features) || [];
    feats.forEach(function (f) {
      var data = C.library.featureByKey[f.key];
      if (!data || !data.creatures || !data.creatures.length) return;
      out.push({
        id: 'feature:' + f.key,
        kind: 'feature',
        name: data.name,
        level: null,
        concentration: false,
        creatures: data.creatures
      });
    });
    return out;
  }

  function sourceById(id) {
    var found = null;
    sources().forEach(function (s) { if (s.id === id) found = s; });
    return found;
  }

  function slotRange(card) {
    /* The level of the spell is read from the book rather than from the list
       of what the character can call, since the book arrives after the card
       does and a range is not worth a card that moves. */
    var id = String(card.source || '');
    if (id.indexOf('spell:') !== 0) return null;
    var spell = C.library.bookByName[id.slice(6)];
    var lo = spell && spell.level ? Number(spell.level) : Number(card.slot);
    if (!lo || lo < 1) return null;
    var left = (api.character().spells && api.character().spells.left) || {};
    var hi = Math.max(lo, Number(card.slot) || lo);
    for (var lv = lo; lv <= 9; lv++) {
      if ((Number(left[lv]) || 0) > 0) hi = lv;
    }
    return { lo: lo, hi: Math.max(lo, hi) };
  }

  /* A creature that was at full hit points follows its new maximum when the
     level or the form changes, so a summon nobody hurt stays whole. */
  function keepFull(card, change) {
    var before = C.creature.derive(card, api);
    var full = !!(before && before.hpMax !== null && before.hpMax !== undefined &&
      card.hp === before.hpMax);
    change();
    var after = C.creature.derive(card, api);
    if (full && after && after.hpMax !== null && after.hpMax !== undefined) card.hp = after.hpMax;
  }

  function cardHtml(s) {
    var block = C.creature.block(s.key);
    var out = C.creature.derive(s, api);
    var forms = block && block.forms && block.forms.length ? block.forms : null;
    var actions = out ? out.actions : [];
    var edit = (s.edit && s.edit.attacks) || {};
    var ac = s.edit && s.edit.ac !== undefined && s.edit.ac !== ''
      ? s.edit.ac
      : (out && out.ac !== null && out.ac !== undefined ? String(out.ac) : '');
    var max = s.edit && s.edit.hpMax !== undefined && s.edit.hpMax !== ''
      ? s.edit.hpMax
      : (out && out.hpMax !== null && out.hpMax !== undefined ? String(out.hpMax) : '');
    var html = '<div class="scard' + (s.draft ? ' sdraft' : '') + '" data-id="' + C.chrome.esc(s.id) + '">' +
      '<div class="sstop">' +
        (api.editing('summons') && !s.draft
          ? '<input class="sname" data-role="name" value="' + C.chrome.esc(s.name) + '" aria-label="Name of the summon">'
          : '<button type="button" class="sname snamebtn" data-role="stat" aria-label="The stat block of the summon">' + C.chrome.esc(s.name) + '</button>') +
        '<button type="button" class="ssrc" data-role="source" title="' + C.chrome.esc(block ? block.name : (s.spell || '')) + '" aria-label="Open what called it">' + C.chrome.esc(s.spell || '') + '</button>' +
        (s.draft ? '' : '<button type="button" class="sdel" data-role="dismiss" aria-label="Dismiss the summon">&times;</button>') +
      '</div>';

    if (s.draft) {
      /* A creature that is not at the table yet has no hit points to spend
         and no advantage to roll: the card is the choice, and the plus under
         it is the call. */
      html += '<div class="sline"><span class="sk">AC</span><span class="sval">' + C.chrome.esc(ac) + '</span>' +
        '<span class="sk">HP</span><span class="sval">' + C.chrome.esc(max) + '</span></div>';
    } else {
      html += '<div class="sline">' +
        '<span class="sk">AC</span>';
      if (api.editing('summons')) {
        html += '<input class="scin snum" data-role="ac" type="number" inputmode="numeric" value="' + C.chrome.esc(ac) + '" aria-label="Armour class of the summon">';
      } else {
        html += '<span class="sval">' + C.chrome.esc(ac) + '</span>';
      }
      html += '<span class="sk">HP</span>' +
        '<button type="button" class="sstep" data-role="hpdown" aria-label="One hit point less">&minus;</button>' +
        '<input class="scin snum" data-role="hp" type="text" inputmode="decimal" autocomplete="off" value="' + (s.hp || 0) + '" aria-label="Hit points of the summon">' +
        '<button type="button" class="sstep" data-role="hpup" aria-label="One hit point more">+</button>' +
        '<span class="sof">of ';
      if (api.editing('summons')) {
        html += '<input class="scin snum" data-role="hpmax" type="text" inputmode="decimal" autocomplete="off" value="' + C.chrome.esc(max) + '" aria-label="Maximum hit points of the summon">';
      } else {
        html += '<span class="sval">' + C.chrome.esc(max) + '</span>';
      }
      html += '</span>' +
        '<button type="button" class="schip' + (s.adv ? ' on' : '') + '" data-role="adv" aria-pressed="' +
        (s.adv ? 'true' : 'false') + '" aria-label="Roll with advantage">Adv</button>' +
        '</div>';
    }
    /* The slot and the form are the two choices of a call, so they are set
       in the edit mode and on the page that calls a creature, and read
       nowhere else. The slider runs the nine levels and only lets the thumb
       stop on the ones the character can cast; a feature brings its creature
       at no level, so the slider is grey from end to end. */
    if (api.editing('summons') || s.draft) {
      var range = slotRange(s);
      var lo = range ? range.lo : 1;
      var hi = range ? range.hi : 1;
      var at = range ? Math.max(lo, Math.min(hi, Number(s.slot) || lo)) : 1;
      var a = ((lo - 1) / 8 * 100).toFixed(1) + '%';
      var b = ((hi - 1) / 8 * 100).toFixed(1) + '%';
      html += '<div class="sslot' + (range ? '' : ' off') + '">' +
        '<span class="sk">Slot</span>' +
        '<span class="slv">' + (range ? String(at) : '&ndash;') + '</span>' +
        '<input class="slider" type="range" min="1" max="9" step="1" value="' + at + '"' +
          ' style="--a:' + a + ';--b:' + b + '" data-role="slot"' +
          (range ? '' : ' disabled') +
          ' aria-label="The level of the slot' + (range ? ', ' + lo + ' to ' + hi : ', none') + '">' +
        (s.concentration ? '<span class="sconc">Conc</span>' : '') +
        '</div>';
      if (forms) {
        var active = s.form || forms[0].id;
        html += '<div class="sforms">' + forms.map(function (f) {
          var on = f.id === active;
          return '<button type="button" class="sfpick' + (on ? ' on' : '') + '" data-role="form" ' +
            'data-form="' + C.chrome.esc(f.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" ' +
            'aria-label="The form of the summon, ' + C.chrome.esc(f.name) + '">' + C.chrome.esc(f.name) + '</button>';
        }).join('') + '</div>';
      }
    }
    /* The card of the call page takes the call where a summon shows its
       attacks: the whole card is the choice, and this is the tap. */
    if (s.draft) {
      html += '<button type="button" class="scall" data-role="call" aria-label="Call ' +
        C.chrome.esc(s.name) + '">+</button>';
    } else if (actions.length) {
      /* The multiattack rides the label of the attacks: how many of them
         the creature makes. */
      var multi = null;
      actions.forEach(function (a) { if (a.count) multi = a; });
      html += '<div class="sline"><span class="sk">Attacks</span>' +
        (multi ? '<span class="ssep">-</span><span class="sk">' + C.chrome.esc(multi.name) + '</span>' +
          '<span class="smultin">&times;' + multi.count + '</span>' : '') + '</div>';
      html += '<div class="satk">' + actions.map(function (a) {
        if (a.count) return '';
        if (!a.attack) return C.creature.noteRow(a, edit[a.name], s.uses, api.editing('summons'));
        return C.creature.attackGroup(a, edit[a.name], C.creature.rollsOf(s, a.name), api.editing('summons'));
      }).join('') + '</div>';
    }
    return html + '</div>';
  }

  function buildCards() {
    E.list.innerHTML = summons().map(cardHtml).join('');
    E.empty.hidden = summons().length > 0;
  }

  /* The spell or the feature the creature came from, opened in the
     overlay of the app. */
  function openSource(card) {
    if (!card.source) return;
    if (card.source.indexOf('spell:') === 0) {
      C.spellCard.open(api, card.source.slice(6), { id: 'summonspell:' + card.source.slice(6) });
      return;
    }
    if (card.source.indexOf('feature:') === 0) {
      var key = card.source.slice(8);
      var f = C.library.featureByKey[key];
      if (!f) { api.toast('the library does not have it'); return; }
      api.sheet.open({
        id: 'summonfeature:' + key,
        title: f.name,
        meta: C.chrome.field('Action', f.action) + C.chrome.field('Duration', f.duration),
        text: C.chrome.renderBlocks(f.blocks)
      });
    }
  }
  /* ---- the creature that comes to the table ---- */

  function addSummon(source, block, key, like) {
    var s = {
      id: 's' + Date.now() + Math.floor(Math.random() * 1000),
      name: block ? block.name : source.name,
      key: key || '',
      form: like && like.form ? like.form : '',
      slot: like && like.slot !== undefined ? like.slot
        : (source.level === null || source.level === undefined ? -1 : source.level),
      hp: 0,
      spell: source.name,
      source: source.id,
      concentration: !!source.concentration,
      adv: false,
      edit: { ac: '', hpMax: '', attacks: {} },
      uses: {},
      rolls: {}
    };
    summons().push(s);
    rememberPick(s);
    /* The creature comes to the table with its hit points full. */
    var full = C.creature.derive(s, api);
    if (full && full.hpMax !== null && full.hpMax !== undefined) s.hp = full.hpMax;
    /* The actions that can be used a number of times a day come with their
       uses, and they are spent one by one. */
    (full ? full.actions : []).forEach(function (a) {
      var limit = C.creature.limitedOf(a);
      if (!limit) return;
      s.uses[a.name] = { left: limit.max, max: limit.max };
    });
    /* The call page is the way in, so the card that comes to the table
       closes it. */
    closeCall();
    commit();
    api.toast(s.name + ' comes to the table');
  }

  /* ---- the page that calls a creature ---- */

  /* Every creature the character can call, as the card of the table in its
     edit dress, with the call in place of the attacks. The cards are
     choices rather than summons, so they live in a map of their own and the
     level and the form picked here are what the summon comes in with. */
  var drafts = {};
  var panelFor = null;

  function cardOf(id) {
    return byId(id) || drafts[id] || null;
  }

  function closeCall() {
    if (!E.callPanel) return;
    E.callPanel.hidden = true;
    if (E.body) E.body.hidden = false;
    drafts = {};
    E.callList.innerHTML = '';
  }

  function openCall() {
    drafts = {};
    panelFor = api.state.current;
    var html = '';
    var list = sources();
    var n = 0;
    if (!list.length) {
      html = '<div class="empty">Nothing of this character calls a creature yet.</div>';
    }
    list.forEach(function (src) {
      var names = src.creatures || [];
      if (!names.length) {
        /* A source that names nothing leaves the choice to the player, and
           the whole library is too many cards to draw here. */
        html += '<div class="scallmore"><span class="sk">' + C.chrome.esc(src.name) + '</span>' +
          '<button type="button" class="sfpick" data-open="' + C.chrome.esc(src.id) + '" ' +
          'aria-label="Choose the creature of ' + C.chrome.esc(src.name) + '">Choose a creature</button></div>';
        return;
      }
      names.forEach(function (name) {
        var block = C.creature.byName(name);
        if (!block) return;
        var key = C.creature.keyOf(block);
        /* What the creature was called with last time, if it was called at
           all, and the form is dropped when the book no longer has it. */
        var last = pickOf(src.id, key);
        var want = src.level === null || src.level === undefined ? -1 : src.level;
        if (last && last.slot !== undefined) want = last.slot;
        var form = '';
        if (last && last.form) {
          (block.forms || []).forEach(function (f) { if (f.id === last.form) form = last.form; });
        }
        var draft = {
          id: 'd' + (n++),
          draft: true,
          name: block.name,
          key: key,
          form: form,
          slot: want,
          hp: 0,
          spell: src.name,
          source: src.id,
          concentration: !!src.concentration,
          adv: false,
          edit: { ac: '', hpMax: '', attacks: {} },
          uses: {},
          rolls: {}
        };
        /* A level the character cannot pay for now is brought back into
           what the slots allow. */
        var range = slotRange(draft);
        if (range) draft.slot = Math.max(range.lo, Math.min(range.hi, Number(draft.slot) || range.lo));
        var full = C.creature.derive(draft, api);
        if (full && full.hpMax !== null && full.hpMax !== undefined) draft.hp = full.hpMax;
        drafts[draft.id] = draft;
        html += cardHtml(draft);
      });
    });
    if (!html) html = '<div class="empty">Nothing of this character calls a creature yet.</div>';
    E.callList.innerHTML = html;
    /* The list of the table goes away under the page, so nothing of it shows
       through and no second ground is painted over the first. */
    if (E.body) E.body.hidden = true;
    E.callPanel.hidden = false;
  }

  /* ---- the overlay: the creature itself ---- */

  function creatureRows(source, q) {
    var needle = String(q || '').toLowerCase();
    var html = '';

    /* What the source names comes first: the Battle Familiar, the Dancing
       Item, the animals of the Find Familiar. */
    var rows = (source.creatures || []).map(function (name) {
      var block = C.creature.byName(name);
      return { key: C.creature.keyOf(block), name: block ? block.name : name, cr: block ? block.cr : '' };
    });
    if (!rows.length) {
      /* A source that names nothing leaves the choice to the player, so the
         whole library is offered. */
      rows = Object.keys(C.library.bestiary.creatures || {}).map(function (key) {
        var block = C.library.bestiary.creatures[key];
        return { key: key, name: block.name, cr: block.cr };
      });
    }
    rows = rows.filter(function (r) {
      if (!needle) return true;
      return String(r.name).toLowerCase().indexOf(needle) >= 0;
    });
    rows.slice(0, 60).forEach(function (r) {
      html += C.card.row({
        name: { text: r.name, aria: 'Call a ' + r.name },
        note: r.cr ? 'CR ' + r.cr : '',
        data: { key: r.key }
      });
    });
    if (rows.length > 60) {
      html += '<div class="empty">And ' + (rows.length - 60) + ' more. Type to narrow the list.</div>';
    }

    /* The machine keeps the creatures the app does not carry. */
    if (machine) {
      machine.filter(function (m) {
        if (!needle) return false;
        return String(m.name).toLowerCase().indexOf(needle) >= 0;
      }).slice(0, 40).forEach(function (m) {
        html += C.card.row({
          name: { text: m.name, aria: 'Call a ' + m.name },
          note: m.cr ? 'CR ' + m.cr : '',
          data: { far: m.key }
        });
      });
    }
    html += C.card.row({
      name: { text: 'Look on the machine', aria: 'Look for another creature on the machine' },
      note: 'every creature it holds',
      data: { machine: '1' }
    });
    if (!html) html = '<div class="empty">Nothing matches.</div>';
    return html;
  }

  function openCreatures(src) {
    var source = sourceById(src);
    if (!source) return;
    var q = api.sheet.search() || '';
    C.card.list({
      id: 'summoncreature',
      title: source.name,
      metaClass: 'sheet-meta one',
      meta: '<span>' + C.chrome.esc(source.level === null ? 'a feature of the character' : 'level ' + source.level + ' spell') + '</span>',
      rows: creatureRows(source, q),
      search: true,
      onSearch: function () { openCreatures(src); },
      onPick: function (picked) {
        if (picked.far !== undefined) { fetchCreature(picked.far, source); return; }
        if (picked.machine !== undefined) { fetchIndex(source); return; }
        if (picked.key === undefined) return;
        var block = C.creature.block(picked.key);
        if (!block) return;
        addSummon(source, block, picked.key);
        api.sheet.closeAll();
      }
    });
  }

  /* The machine that serves the app holds the creatures the app does not
     carry. It answers with the list of them, then with one at a time. */
  function address() {
    var a = C.exchange.server ? C.exchange.server() : '';
    return String(a || '').replace(/\/$/, '');
  }

  function fetchIndex(source) {
    var where = address();
    if (!where) { api.toast('The machine that serves the app has no address.'); return; }
    api.toast('asking the machine');
    C.exchange.readUrl(where + '/bestiary/index.json')
      .then(function (text) {
        var answer = JSON.parse(text);
        machine = answer.creatures || [];
        openCreatures(source.id);
      })
      .catch(function () { api.toast('the machine did not answer'); });
  }

  function fetchCreature(key, source) {
    var where = address();
    if (!where) { api.toast('The machine that serves the app has no address.'); return; }
    C.exchange.readUrl(where + '/bestiary/' + encodeURIComponent(key) + '.json')
      .then(function (text) {
        var block = JSON.parse(text);
        addSummon(source, block, key);
        api.sheet.closeAll();
      })
      .catch(function () { api.toast('the machine did not answer'); });
  }

  /* ---- the page ---- */

  Sheet.page({
    id: 'summons',
    glyph: 'M12 3c3 3 5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 2-6 5-9zM9 21h6',
    title: 'Summons',
    tab: 'Summons',
    order: 4,
    blurb: 'The creatures at the table.',
    slice: 'summons',
    seed: function (saved) {
      if (saved && saved.list) {
        if (!saved.picks || typeof saved.picks !== 'object') saved.picks = {};
        return saved;
      }
      return { list: [], picks: {} };
    },
    html: [
      '<div class="charbody" id="summonBody">',
      '  <div class="cshead"><span>At the table</span><span class="rule"></span><button class="mini" id="callSummon" type="button" aria-label="Call a creature">+</button></div>',
      '  <div class="fcards" id="summonList"></div>',
      '  <div class="empty" id="summonEmpty" hidden>No creature at the table.</div>',
      '</div>',
      '<div class="callpanel" id="callPanel" hidden>',
      '  <div class="cshead"><span>Call a creature</span><span class="rule"></span><button class="mini" id="callClose" type="button" aria-label="Close the call">&times;</button></div>',
      '  <div class="calllist" id="callList"></div>',
      '</div>'
    ].join('\n'),

    css: [
      '.scard{border:1px solid var(--edge);border-radius:5px;background:rgba(255,255,255,.03);padding:7px 8px;display:flex;flex-direction:column;gap:6px}',
      '.sstop{display:flex;align-items:center;gap:6px}',
      '.sname{flex:1 1 auto;min-width:0;font:inherit;font-size:15px;color:var(--ink);background:none;border:none;border-bottom:1px solid var(--edge);padding:2px 0}',
      '.snamebtn{text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ssrc{font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%;background:none;border:none;padding:0;font:inherit;font-size:10px;cursor:pointer;text-align:right}',
      '.ssrc:active{color:var(--arcane)}',
      '.sdel{background:none;border:none;color:var(--muted);font:inherit;font-size:18px;line-height:1;padding:0 3px;cursor:pointer;flex:0 0 auto}',
      '.sdel:active{color:var(--gold)}',
      '.sline{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:12px;color:var(--muted)}',
      '.sval{font-size:12.5px;color:var(--ink);min-width:20px}',
      '.sof{display:inline-flex;align-items:center;gap:3px}',
      '.sstep{width:22px;height:22px;border-radius:5px;border:1px solid var(--edge);background:none;color:var(--ink);font:inherit;font-size:14px;line-height:1;cursor:pointer;flex:0 0 auto;padding:0}',
      '.sstep:active{border-color:var(--arcane);color:var(--arcane)}',
      '.sconc{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold)}',
      /* The slot of the creature, on a slider that greys the levels it
         cannot use, and the forms it can take, as toggles under it. */
      '.sslot{display:flex;align-items:center;gap:7px}',
      '.sslot .sk{flex:0 0 auto}',
      '.sslot .slv{flex:0 0 auto;font-family:var(--display);font-weight:700;font-size:14px;line-height:1;color:var(--ink);min-width:1.1em;text-align:center}',
      '.sslot .sconc{flex:0 0 auto;margin-left:auto}',
      '.sslot .slider{-webkit-appearance:none;appearance:none;flex:1 1 auto;min-width:0;height:24px;margin:0;background:transparent}',
      '.sslot .slider:focus-visible{outline:2px solid var(--arcane);outline-offset:3px;border-radius:6px}',
      '.sslot .slider::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(90deg,rgba(255,255,255,.10) 0 var(--a,0%),var(--arcane) var(--a,0%) var(--b,100%),rgba(255,255,255,.10) var(--b,100%) 100%)}',
      '.sslot .slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;margin-top:-8px;border-radius:50%;border:1px solid rgba(255,255,255,.42);background:radial-gradient(circle at 34% 28%,#dccaff,#8a68f5 58%,#5a3fd2);box-shadow:0 2px 8px rgba(0,0,0,.5)}',
      '.sslot .slider::-moz-range-track{height:4px;border-radius:2px;background:rgba(255,255,255,.10)}',
      '.sslot .slider::-moz-range-progress{height:4px;border-radius:2px;background:var(--arcane)}',
      '.sslot .slider::-moz-range-thumb{width:18px;height:18px;border-radius:50%;border:1px solid rgba(255,255,255,.42);background:#8a68f5}',
      '.sslot.off{opacity:.45}',
      '.sslot.off .slider::-webkit-slider-runnable-track{background:rgba(255,255,255,.08)}',
      '.sslot.off .slider::-webkit-slider-thumb{background:#4a4560;border-color:#3b3750;box-shadow:none}',
      '.sforms{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}',
      '.sfpick{font:inherit;font-size:11px;line-height:1;padding:7px 11px;min-height:28px;border-radius:999px;border:1px solid var(--edge);background:rgba(255,255,255,.03);color:var(--muted);cursor:pointer}',
      '.sfpick.on{border-color:rgba(var(--arcane-rgb),.55);color:var(--arcane);background:rgba(var(--arcane-rgb),.12)}',
      /* The page that calls a creature: it sits over the list of the table,
         under the tabs, with the scroll of its own. */
      /* The page paints nothing of its own: the list of the table is hidden
         under it, so the ground behind it is the ground of the app. */
      '.callpanel{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;gap:7px;padding:0;background:none}',
      '.callpanel[hidden]{display:none}',
      '#summonBody[hidden]{display:none}',
      '.calllist{touch-action:pan-y;flex:1 1 auto;min-height:0;overflow-y:auto;scrollbar-width:none;display:flex;flex-direction:column;gap:7px;padding-bottom:18px}',
      '.calllist::-webkit-scrollbar{width:0}',
      /* The call of a creature: a large plus where a summon shows its
         attacks, in the colour of the secondary. */
      '.scall{flex:0 0 auto;width:100%;height:56px;border-radius:14px;border:1px solid rgba(var(--gold-rgb),.45);background:linear-gradient(180deg,rgba(var(--gold-rgb),.18),rgba(var(--gold-rgb),.05));color:var(--gold);font-family:var(--sans);font-size:30px;line-height:1;letter-spacing:0;padding:0;cursor:pointer}',
      '.scall:active{background:rgba(var(--gold-rgb),.28)}',
      '.scall:focus-visible{outline:2px solid var(--gold);outline-offset:2px}',
      '.scallmore{display:flex;align-items:center;gap:8px;padding:4px 2px}',
      '.scallmore .sk{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.schip{border:1px solid var(--edge);border-radius:999px;background:none;color:var(--muted);font:inherit;font-size:10px;letter-spacing:.08em;line-height:1.4;padding:2px 9px;margin-left:auto;cursor:pointer;white-space:nowrap}',
      '.schip.on{border-color:rgba(var(--arcane-rgb),.55);color:var(--arcane);background:rgba(var(--arcane-rgb),.12)}',
      '.ssep{font-size:10.5px;color:#6f6a8d;white-space:nowrap}',
      '.smulti{display:flex;align-items:center;gap:6px;padding:1px 0}',
      '.smultin{font-size:11px;color:var(--gold);font-variant-numeric:tabular-nums}',
      '.scard .satkbonus{width:58px;text-align:right}',
      '.scard .satkdamage{flex:1 1 auto;min-width:0}',
      '.scin{font-family:var(--sans);font-size:12.5px;color:var(--ink);background:rgba(255,255,255,.04);border:1px solid var(--edge);border-radius:4px;padding:2px 4px;min-width:0}',
      '.snum{width:44px;text-align:center}',

    ].join('\n'),

    mount: function (root, a) {
      /* The book and the library of features are what tell the page what the
         character can call, so both are asked for. */
      C.library.data('bestiary');
      C.library.data('spellbook');
      C.library.data('features');
      api = a;
      E = {
        body: root.querySelector('#summonBody'),
        list: root.querySelector('#summonList'),
        empty: root.querySelector('#summonEmpty'),
        call: root.querySelector('#callSummon'),
        callPanel: root.querySelector('#callPanel'),
        callList: root.querySelector('#callList'),
        callClose: root.querySelector('#callClose')
      };

      /* The plus opens the page that calls a creature, which sits over the
         list of the table. */
      E.call.addEventListener('click', function () { openCall(); });
      if (E.callClose) E.callClose.addEventListener('click', function () { closeCall(); });

      /* A swing rolls on a tap on the box, and the box is the one that decides
         what counts as that tap. The card the box sits in names the summon,
         and the edit mode turns a tap on the box into a tap on a field. */
      C.horizontalAttackBox.wire(root, function (ix, name, box) {
        if (api.editing('summons')) return;
        var card = box.closest ? box.closest('.scard') : null;
        var s = card ? cardOf(card.dataset.id) : null;
        if (!s || !name) return;
        C.creature.roll(s, name, ix, api, { mark: 'cards', root: E.list });
      });

      /* The hit point box of a creature opens empty with its hit points in
         the background, so a tap never has to delete what is there. A bare
         number sets them, a signed one moves them from the value the box
         opened on. The maximum is a number and not a move, so a signed
         entry is left to the current hit points. */
      root.addEventListener('focusin', function (ev) {
        var box = ev.target.closest ? ev.target.closest('[data-role="hp"], [data-role="hpmax"]') : null;
        if (!box) return;
        var card = box.closest('.scard');
        var s = card ? cardOf(card.dataset.id) : null;
        if (!s) return;
        var role = box.dataset.role;
        if (role === 'hp') {
          hpOpened = s.hp;
          box.placeholder = String(s.hp || 0);
        } else {
          hpMaxOpened = box.value;
          box.placeholder = box.value;
        }
        box.value = '';
      });

      root.addEventListener('focusout', function (ev) {
        var box = ev.target.closest ? ev.target.closest('[data-role="hp"], [data-role="hpmax"]') : null;
        if (!box) return;
        var card = box.closest('.scard');
        var s = card ? cardOf(card.dataset.id) : null;
        if (!s) return;
        if (box.dataset.role === 'hp') {
          hpOpened = null;
          box.placeholder = '';
          box.value = String(s.hp || 0);
          return;
        }
        var held = s.edit && s.edit.hpMax !== undefined && s.edit.hpMax !== '' ? s.edit.hpMax : hpMaxOpened;
        hpMaxOpened = '';
        box.placeholder = '';
        box.value = held;
      });

      /* Every field of a card is the character's own, and it is written
         down as it is typed. */
      root.addEventListener('input', function (ev) {
        var roleEl = ev.target.closest ? ev.target.closest('[data-role]') : null;
        if (!roleEl) return;
        var card = roleEl.closest('.scard');
        if (!card) return;
        var s = cardOf(card.dataset.id);
        if (!s) return;
        var role = roleEl.dataset.role;
        if (role === 'name') s.name = roleEl.value;
        else if (role === 'hp') {
          var from = hpOpened === null ? s.hp : hpOpened;
          var next = C.SR.hpEntry(roleEl.value, from, 0);
          if (next === null) return;
          s.hp = Math.max(0, Math.min(999, next));
        }
        else if (role === 'ac' || role === 'hpmax') {
          /* The maximum is a number, not a move along the current. */
          if (role === 'hpmax' && !/^[0-9]*$/.test(roleEl.value.trim())) return;
          if (!s.edit) s.edit = { ac: '', hpMax: '', attacks: {} };
          s.edit[role] = roleEl.value;
        } else if (role === 'slot') {
          var range = slotRange(s);
          if (!range) return;
          var v = Math.max(range.lo, Math.min(range.hi, Number(roleEl.value) || range.lo));
          if (roleEl.value !== String(v)) roleEl.value = String(v);
          keepFull(s, function () { s.slot = v; });
          rememberPick(s);
          var label = card.querySelector('.slv');
          if (label) label.textContent = String(v);
        } else if (role === 'atkbonus' || role === 'atkdamage') {
          var row = roleEl.closest('[data-name]');
          if (!row) return;
          if (!s.edit) s.edit = { ac: '', hpMax: '', attacks: {} };
          if (!s.edit.attacks) s.edit.attacks = {};
          var name = row.dataset.name;
          if (!s.edit.attacks[name]) s.edit.attacks[name] = { bonus: '', damage: '' };
          s.edit.attacks[name][role === 'atkbonus' ? 'bonus' : 'damage'] = roleEl.value;
        } else return;
        api.save();
      });

      /* The numbers of the creature follow the slot, and the card is written
         again when the thumb is let go rather than under it. A card of the
         call page is written again on its own, so the list of the table and
         the scroll of the page stay where they are. */
      root.addEventListener('change', function (ev) {
        var slider = ev.target.closest ? ev.target.closest('[data-role="slot"]') : null;
        if (!slider) return;
        var card = slider.closest('.scard');
        var s = card ? cardOf(card.dataset.id) : null;
        if (!s) return;
        if (s.draft) { card.outerHTML = cardHtml(s); return; }
        api.markDirty('cards');
        commit();
      });

      root.addEventListener('click', function (ev) {
        /* A source that names nothing sends the choice to the overlay, since
           the whole library is too many cards to draw in the call page. */
        var pick = ev.target.closest ? ev.target.closest('[data-open]') : null;
        if (pick) { openCreatures(pick.dataset.open); return; }
        var roleEl = ev.target.closest ? ev.target.closest('[data-role]') : null;
        var card = ev.target.closest ? ev.target.closest('.scard') : null;
        if (!card) return;
        var s = cardOf(card.dataset.id);
        if (!s) return;
        if (roleEl) {
          var role = roleEl.dataset.role;
          if (role === 'form') {
            keepFull(s, function () { s.form = roleEl.dataset.form || ''; });
            rememberPick(s);
            if (s.draft) {
              /* The chips are painted where they are, so the choice does not
                 redraw the card under the finger. */
              Array.prototype.forEach.call(card.querySelectorAll('.sfpick'), function (b) {
                var on = b === roleEl;
                b.classList.toggle('on', on);
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
              });
              /* The choice is the character's, so it is written down even
                 when the creature is not called yet. */
              api.save();
              return;
            }
            api.markDirty('cards');
            commit();
            return;
          }
          /* The big plus of the call page is the summon itself. */
          if (role === 'call') {
            var src = sourceById(s.source);
            var blk = C.creature.block(s.key);
            if (!src || !blk) return;
            addSummon(src, blk, s.key, s);
            return;
          }
          /* The slider and the fields of the card work themselves, so a tap
             on one of them is not a tap on the card. */
          if (role === 'slot') return;
          if (role === 'dismiss') {
            slice().list = summons().filter(function (x) { return x.id !== s.id; });
            api.markDirty('cards');
            commit();
            api.toast(s.name + ' is dismissed');
            return;
          }
          if (role === 'hpup' || role === 'hpdown') {
            var step = role === 'hpup' ? 1 : -1;
            s.hp = Math.max(0, Math.min(999, (Number(s.hp) || 0) + step));
            api.markDirty('cards');
            commit();
            return;
          }
          /* The die and the body of a swing are the attack box's own taps,
             which it hands back to this page as a roll. */
          if (role === 'roll') return;
          /* The advantage of the card: the die is rolled twice. */
          if (role === 'adv') {
            s.adv = !s.adv;
            api.markDirty('cards');
            commit();
            return;
          }
          /* A use of a limited action is spent. */
          if (role === 'use') {
            var useBlock = roleEl.closest('[data-name]');
            if (!useBlock) return;
            var beforeUse = C.rest.snapshot(api.character());
            var spent = C.counter.spend(api.character(), 'summon:' + s.id + ':' + useBlock.dataset.name);
            if (!spent.ok) return;
            C.feedback.spent('use of ' + (useBlock.dataset.name || 'the summon'), 1, spent.left);
            C.rest.push(api.character(), beforeUse);
            api.markDirty('cards');
            commit();
            return;
          }
          /* The spell or the feature the creature came from. */
          if (role === 'source') { openSource(s); return; }
          /* The stat block of the creature. */
          if (role === 'stat') { C.creature.openStat(s, api); return; }
          return;
        }
        if (api.editing('summons')) return;
        /* A tap inside the box of an attack is the box's, and it rolls the
           swing the tap landed on. Nothing is left to do here. */
        if (ev.target.closest && ev.target.closest('.sblock')) return;
        /* The head of an attack is part of the same container, so it rolls
           too: the swing still to come, or the first one again once every
           swing of a multiattack has a result. The edit mode never gets
           here, so a field of the block is edited and not rolled. */
        var group = ev.target.closest ? ev.target.closest('.sgroup') : null;
        if (group) {
          var first = group.querySelector('.sblock[data-name]');
          if (first) {
            var done = C.creature.rollsOf(s, first.dataset.name);
            var swings = group.querySelectorAll('.sblock').length;
            var at = 0;
            for (var i = 0; i < swings; i++) { if (!done[i]) { at = i; break; } }
            C.creature.roll(s, first.dataset.name, at, api, { mark: 'cards', root: E.list });
            return;
          }
        }
        /* Anywhere else on the card is the stat block, which is the thing a
           player wants from a creature at the table. */
        C.creature.openStat(s, api);
      });
    },

    /* The wrench edits the stats, the way it edits a character, and the shell
       keeps the flag and the pressed state. */
    head: function (root, a) {
      api = a;
      root.appendChild(a.wrench({ label: 'Edit the summons' }));
    },

    render: function (a) {
      api = a;
      /* The cards belong to one character, so playing another one builds
         its own list. */
      a.paint(cardsParts(a), { build: buildCards, render: paintCards });
    }
  });

  /* The call page belongs to a character, so another one closes it. */
  function paintCards() {
    if (E.callPanel && !E.callPanel.hidden && panelFor !== api.state.current) closeCall();
  }

  /* What the cards were built for: the character, the creatures it has, the
     two libraries that say what a card holds, the mode it is read in, and the
     uses of the limited actions, which a rest gives back and the card writes
     into its own text. A handler that changes a card it knows about marks the
     cards, and the next paint builds them again. */
  function cardsParts(a) {
    return [
      a.state.current,
      summons().map(function (s) { return s.id; }),
      Object.keys(C.library.bestiary.creatures || {}).length,
      (C.library.book.spells || []).length,
      a.editing('summons') ? 'edit' : 'read',
      summons().map(function (s) {
        var uses = s.uses || {};
        return s.id + ':' + Object.keys(uses).sort().map(function (name) {
          return name + '=' + (Number(uses[name].left) || 0);
        }).join(';');
      })
    ];
  }
})();
