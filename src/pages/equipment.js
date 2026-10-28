/* The equipment page: what the character carries, and what it does. An
   armour, a weapon or a tool is a row; an item that is worn may carry an
   effect, a formula in the small language the rules read (baseAC=15+min(@dex.mod,2),
   AC+2), and a weapon carries its mastery as text. The armour class the gear
   gives is read from the rules, so the sheet and this page agree. */
(function () {
  'use strict';

  var C = Sheet.core;
  var SR = C.SR;

  var api = null;
  var E = {};

  var KINDS = [
    { id: 'armour', host: 'armour', label: 'Armour' },
    { id: 'weapon', host: 'weapons', label: 'Weapons' },
    { id: 'tool', host: 'tools', label: 'Tools' }
  ];

  function commit() { api.save(); api.refresh(); }

  function gear() {
    var rec = api.character();
    if (!rec.equipment) rec.equipment = { items: [] };
    if (!Array.isArray(rec.equipment.items)) rec.equipment.items = [];
    return rec.equipment.items;
  }

  function itemOf(id) {
    var found = null;
    gear().forEach(function (it) { if (it.id === id) found = it; });
    return found;
  }

  function newItem(kind) {
    return {
      id: 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
      name: 'New ' + kind,
      category: kind,
      /* a weapon made by hand is meant to be swung: it starts worn */
      equipped: kind === 'weapon',
      effect: '',
      mastery: ''
    };
  }

  /* The armour of the book and the magic items, declared here; the weapons
     are the attack page's file, shared through the library. */
  C.library.data('gear', function (json) {
    var g = C.library.gear;
    g.armour.length = 0;
    g.magic.length = 0;
    (json.armour || []).forEach(function (a) { g.armour.push(a); });
    (json.magic || []).forEach(function (m) { g.magic.push(m); });
  });

  /* What a class starts with, so a new character can attack and stands in
     the armour its class wears: a weapon or two of the book, the armour and
     the shield where the class carries them. Name, kind, effect, mastery. */
  var KITS = {
    Barbarian: [['Greataxe', 'weapon', '', 'Cleave'], ['Handaxe', 'weapon', '', 'Vex']],
    Bard: [['Leather Armor', 'armour', 'baseAC=11+@dex.mod', ''], ['Dagger', 'weapon', '', 'Nick']],
    Cleric: [['Chain Shirt', 'armour', 'baseAC=13+min(@dex.mod,2)', ''], ['Shield', 'armour', 'AC+2', ''], ['Mace', 'weapon', '', 'Sap']],
    Druid: [['Leather Armor', 'armour', 'baseAC=11+@dex.mod', ''], ['Shield', 'armour', 'AC+2', ''], ['Sickle', 'weapon', '', 'Nick']],
    Fighter: [['Chain Mail', 'armour', 'baseAC=16', ''], ['Greatsword', 'weapon', '', 'Graze'], ['Javelin', 'weapon', '', 'Slow']],
    Monk: [['Spear', 'weapon', '', 'Sap'], ['Dagger', 'weapon', '', 'Nick']],
    Paladin: [['Chain Mail', 'armour', 'baseAC=16', ''], ['Shield', 'armour', 'AC+2', ''], ['Longsword', 'weapon', '', 'Sap'], ['Javelin', 'weapon', '', 'Slow']],
    Ranger: [['Studded Leather Armor', 'armour', 'baseAC=12+@dex.mod', ''], ['Scimitar', 'weapon', '', 'Nick'], ['Shortsword', 'weapon', '', 'Vex'], ['Longbow', 'weapon', '', 'Slow']],
    Rogue: [['Leather Armor', 'armour', 'baseAC=11+@dex.mod', ''], ['Dagger', 'weapon', '', 'Nick'], ['Shortsword', 'weapon', '', 'Vex'], ['Shortbow', 'weapon', '', 'Vex']],
    Sorcerer: [['Spear', 'weapon', '', 'Sap'], ['Dagger', 'weapon', '', 'Nick']],
    Warlock: [['Leather Armor', 'armour', 'baseAC=11+@dex.mod', ''], ['Sickle', 'weapon', '', 'Nick'], ['Dagger', 'weapon', '', 'Nick']],
    Wizard: [['Quarterstaff', 'weapon', '', 'Topple'], ['Dagger', 'weapon', '', 'Nick']]
  };

  function kitOf(rec) {
    var k = ((rec && rec.char && rec.char.classes) || [])[0];
    var kit = k && KITS[k.name];
    if (!kit) return null;
    return kit.map(function (x, i) {
      return { id: 'k' + i + x[0].replace(/[^a-z]/gi, ''), name: x[0], category: x[1], equipped: true, effect: x[2], mastery: x[3] };
    });
  }

  /* The two items the page starts a character with when it has no class:
     the half plate Wendy wears, and the shield she holds. */
  function seedItems() {
    return [
      { id: 'halfPlate', name: 'Half plate', category: 'armour', equipped: true, effect: 'baseAC=15+min(@dex.mod,2)', mastery: '' },
      { id: 'shield', name: 'Shield', category: 'armour', equipped: true, effect: 'AC+2', mastery: '' }
    ];
  }

  /* A new character starts with the half plate and the shield; one that was
     already saved keeps what it carries, an empty list if it carries
     nothing. */
  function seed(saved, fresh, rec) {
    var s = (saved && typeof saved === 'object') ? saved : {};
    if (!Array.isArray(s.items)) s.items = fresh ? (kitOf(rec) || seedItems()) : [];
    return s;
  }

  /* ---- the catalogue: everything the books carry, to pick from ---- */

  function armourEffect(a) {
    if (a.category === 'shield') return 'AC+' + (Number(a.ac) || 2);
    if (a.dex === 'full') return 'baseAC=' + a.ac + '+@dex.mod';
    if (a.dex === 'two') return 'baseAC=' + a.ac + '+min(@dex.mod,2)';
    return 'baseAC=' + a.ac;
  }

  /* One list of every item: the weapons, the armour and the shields, and the
     magic items that change the sheet, each with its type and its book. */
  function catalogue() {
    var out = [];
    (C.library.weapons || []).forEach(function (w) {
      out.push({ name: w.name, type: 'Weapon', source: w.source, category: 'weapon', effect: '', mastery: w.mastery || '',
        note: [w.damage, w.damageType].filter(Boolean).join(' ') });
    });
    (C.library.gear.armour || []).forEach(function (a) {
      out.push({ name: a.name, type: a.category === 'shield' ? 'Shield' : 'Armour', source: a.source, category: 'armour',
        effect: armourEffect(a), mastery: '', note: (a.category === 'shield' ? '+' : 'AC ') + a.ac + (a.category === 'shield' ? ' AC' : '') });
    });
    (C.library.gear.magic || []).forEach(function (m) {
      var weapon = /weapon/i.test(m.kind || '') || (!!m.attackBonus && !m.acBonus);
      /* The item's effect in the sheet language (AC + 1; save.all + 1),
         written by the fetch from what the book says it does. */
      out.push({ name: m.name, type: 'Magic', source: m.source, category: m.acBonus ? 'armour' : (weapon ? 'weapon' : 'tool'),
        effect: m.effect || (m.acBonus ? 'AC + ' + m.acBonus : ''), mastery: '',
        note: [m.attackBonus ? '+' + m.attackBonus + ' to hit' : '', m.damageBonus ? '+' + m.damageBonus + ' damage' : '', m.acBonus ? '+' + m.acBonus + ' AC' : ''].filter(Boolean).join(', ') });
    });
    return out;
  }

  /* The row an item of the books (or of the character's own library) takes
     on the sheet, by its name: what the + puts there, for the agent too. */
  C.library.gearRow = function (name) {
    var n = String(name || '').toLowerCase().trim();
    var x = catalogue().filter(function (c) { return c.name.toLowerCase() === n; })[0];
    if (!x) return null;
    var it = newItem(x.category);
    it.name = x.name;
    it.effect = x.effect;
    it.mastery = x.mastery;
    it.equipped = true;
    return it;
  };

  var TYPES = ['Weapon', 'Armour', 'Shield', 'Magic', 'Custom'];

  /* The picker: a search, the types and the books as filters, then the
     items; a tap adds one, worn, and says so. Custom adds an empty row of
     the kind picked, for what no book holds. */
  function openPicker() {
    C.library.data('weapons');
    C.library.data('gear');
    var f = { type: '', source: '', text: '' };

    function paint() {
      var all = catalogue();
      var sources = [];
      all.forEach(function (x) { if (sources.indexOf(x.source) < 0) sources.push(x.source); });
      sources.sort(function (a, b) { return a === 'XPHB' ? -1 : (b === 'XPHB' ? 1 : a.localeCompare(b)); });
      var t = f.text.trim().toLowerCase();
      var shown = all.filter(function (x) {
        return (!f.type || x.type === f.type) && (!f.source || x.source === f.source) &&
          (!t || x.name.toLowerCase().indexOf(t) >= 0);
      });
      var chip = function (key, value, label) {
        var on = f[key] === value;
        return '<button type="button" class="gfil" data-' + key + '="' + C.chrome.esc(value) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + C.chrome.esc(label) + '</button>';
      };
      var html = '<div class="gfils">' + chip('type', '', 'All') + TYPES.map(function (x) { return chip('type', x, x); }).join('') + '</div>';
      if (f.type !== 'Custom') {
        html += '<div class="gfils gsrc" data-swipe>' + chip('source', '', 'Every book') + sources.map(function (x) { return chip('source', x, x); }).join('') + '</div>';
      }
      if (f.type === 'Custom') {
        html += ['armour', 'weapon', 'tool'].map(function (k) {
          return C.card.line({ name: { text: 'A new ' + (k === 'armour' ? 'piece of armour' : k) }, data: { custom: k }, pick: true });
        }).join('');
      } else if (!all.length) {
        html += '<div class="empty">The books are on their way.</div>';
      } else {
        html += shown.slice(0, 120).map(function (x) {
          return C.card.line({ name: { text: x.name }, meta: { text: x.note ? x.note + ' \u00b7 ' + x.source : x.source }, data: { item: all.indexOf(x) }, pick: true });
        }).join('') + (shown.length > 120 ? '<div class="empty">' + (shown.length - 120) + ' more: narrow the search.</div>' : '') +
          (shown.length ? '' : '<div class="empty">Nothing matches.</div>');
      }
      api.sheet.open({
        id: 'gearpicker',
        title: 'Add an item',
        search: true,
        placeholder: 'Search the items',
        list: html,
        onSearch: function (term) { f.text = term || ''; paint(); },
        onList: function (ev) {
          var b = ev.target.closest('[data-type],[data-source],[data-item],[data-custom]');
          if (!b) return;
          if (b.dataset.type !== undefined) { f.type = b.dataset.type; paint(); return; }
          if (b.dataset.source !== undefined) { f.source = b.dataset.source; paint(); return; }
          if (b.dataset.custom !== undefined) { gear().push(newItem(b.dataset.custom)); api.sheet.close(); commit(); return; }
          var x = all[Number(b.dataset.item)];
          if (!x) return;
          var it = newItem(x.category);
          it.name = x.name;
          it.effect = x.effect;
          it.mastery = x.mastery;
          it.equipped = true;
          gear().push(it);
          api.sheet.close();
          commit();
          api.toast(x.name + ' added');
        }
      });
    }
    paint();
  }

  /* ---- the rows ---- */

  /* ---- what an item is, from data ----

     An item on the sheet is a row: a name, a category, worn or not, and
     what the player set on it. Its stats come from data: the weapon of the
     books (the homebrew of the character's library included) named by its
     base or its name, the magic item of the same name for its bonus, then
     what the row itself says. A magic weapon names no base, so its base is
     the weapon of the books its name holds (a Dagger in "Many Keyholes
     Dagger"), until the player picks one. */
  function byName(list, name) {
    var n = String(name || '').trim().toLowerCase();
    return (list || []).filter(function (x) { return String(x.name).toLowerCase() === n; })[0] || null;
  }

  function baseInName(name) {
    var n = ' ' + String(name || '').toLowerCase() + ' ';
    var best = null;
    (C.library.weapons || []).forEach(function (w) {
      var wn = String(w.name).toLowerCase();
      if (n.indexOf(' ' + wn + ' ') >= 0 || n.indexOf(' ' + wn + ',') >= 0 || n.indexOf(' ' + wn + 's ') >= 0) {
        if (!best || wn.length > best.name.length) best = w;
      }
    });
    return best;
  }

  function entryOf(it) {
    if (!it) return {};
    var weapon = byName(C.library.weapons, it.base || it.name);
    var magic = byName((C.library.gear || {}).magic, it.name);
    var armour = byName((C.library.gear || {}).armour, it.name);
    return { weapon: weapon, magic: magic, armour: armour };
  }

  /* A weapon as the attack reads it, or null when the sheet cannot say
     what it deals. */
  C.library.weaponOf = function (it) {
    if (!it || it.category !== 'weapon') return null;
    var e = entryOf(it);
    var base = e.weapon || (it.base ? null : baseInName(it.name));
    var w = {
      name: it.name,
      base: base ? base.name : '',
      damage: it.damage || (base && base.damage) || '',
      damageType: it.damageType || (base && base.damageType) || '',
      properties: it.properties || (base && base.properties) || [],
      kind: (base && base.kind) || (e.magic && e.magic.kind) || 'Melee Weapon',
      mastery: it.mastery || (base && base.mastery) || '',
      attackBonus: Number(it.attackBonus !== undefined ? it.attackBonus : (e.magic && e.magic.attackBonus) || (e.weapon && e.weapon.attackBonus) || 0) || 0,
      damageBonus: Number(it.damageBonus !== undefined ? it.damageBonus : (e.magic && e.magic.damageBonus) || (e.weapon && e.weapon.damageBonus) || 0) || 0
    };
    return w.damage ? w : null;
  };

  function bonusText(w) {
    var a = w.attackBonus, d = w.damageBonus;
    if (!a && !d) return '';
    if (a === d) return '+' + a + ' to hit and damage';
    return [a ? '+' + a + ' to hit' : '', d ? '+' + d + ' damage' : ''].filter(Boolean).join(', ');
  }

  /* The item opened: its stats and its words. A weapon can be given the
     weapon of the books it is, and a magic bonus, so a weapon the player
     named swings in the attack page. */
  function openItem(id) {
    var it = itemOf(id);
    if (!it) return;
    var e = entryOf(it);
    var w = C.library.weaponOf(it);
    var meta = C.chrome.field('Kind', it.category === 'weapon' ? 'Weapon' : it.category === 'armour' ? 'Armour' : 'Gear');
    if (it.category === 'weapon') {
      meta += w ? C.chrome.field('Damage', w.damage + (w.damageType ? ' ' + w.damageType : '')) : C.chrome.field('Damage', 'none yet: pick its weapon below');
      if (w && w.properties.length) meta += C.chrome.field('Properties', w.properties.join(', '));
      if (w && w.mastery) meta += C.chrome.field('Mastery', w.mastery);
      if (w && bonusText(w)) meta += C.chrome.field('Bonus', bonusText(w));
      if (w && w.base && w.base !== it.name) meta += C.chrome.field('Weapon', w.base);
    }
    if (e.armour) meta += C.chrome.field('AC', (e.armour.category === 'shield' ? '+' : '') + e.armour.ac);
    if (it.effect) meta += C.chrome.field('Effect', it.effect);
    var book = e.magic || e.weapon || e.armour;
    var words = book && book.blocks && book.blocks.length ? C.chrome.renderBlocks(book.blocks)
      : (it.text ? '<p>' + C.chrome.esc(it.text) + '</p>' : '');
    var list = '';
    if (it.category === 'weapon') {
      var have = w ? (it.attackBonus !== undefined ? Number(it.attackBonus) : w.attackBonus) : 0;
      list = '<div class="gihead">Magic bonus</div>' +
        C.toggle.segment({ key: 'bonus', aria: 'The magic bonus of the weapon', on: String(have || 0),
          options: [{ id: '0', label: '+0' }, { id: '1', label: '+1' }, { id: '2', label: '+2' }, { id: '3', label: '+3' }] }) +
        '<div class="gihead">The weapon it is</div><div class="gibases">' + (C.library.weapons || []).map(function (x) {
          var on = w && w.base === x.name;
          return '<button type="button" class="gfil" data-base="' + C.chrome.esc(x.name) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + C.chrome.esc(x.name) + '</button>';
        }).join('') + '</div>';
    }
    api.sheet.open({
      id: 'item:' + id,
      title: it.name,
      meta: meta + (book && book.source ? C.library.sourceTag(book.source) : ''),
      text: (words || (it.category === 'weapon' ? '' : '<p class="fnone">No words in the books for this item.</p>')) + (book && book.ref ? C.chrome.sourceLine(book.ref) : ''),
      list: list,
      onList: function (ev) {
        var b = ev.target.closest('button');
        if (!b) return;
        if (b.dataset.bonus !== undefined) { C.rest.push(api.character()); it.attackBonus = Number(b.dataset.bonus); it.damageBonus = Number(b.dataset.bonus); }
        else if (b.dataset.base) { C.rest.push(api.character()); it.base = b.dataset.base; }
        else return;
        commit();
        openItem(id);
      }
    });
  }

  /* What a weapon deals, on its row. */
  function weaponLine(it) {
    var w = C.library.weaponOf(it);
    if (!w) return '<span class="gwl warn">no damage: tap to pick its weapon</span>';
    return '<span class="gwl">' + C.chrome.esc(w.damage + (w.damageBonus ? '+' + w.damageBonus : '') + ' ' + w.damageType + (w.attackBonus ? ' \u00b7 +' + w.attackBonus + ' to hit' : '')) + '</span>';
  }

  function input(field, value, label, placeholder) {
    return '<input class="gin" data-field="' + field + '" value="' + C.chrome.esc(value || '') + '" ' +
      'placeholder="' + C.chrome.esc(placeholder || '') + '" aria-label="' + C.chrome.esc(label) + '">';
  }

  function rowHtml(it, editing) {
    return '<div class="gitem" data-id="' + C.chrome.esc(it.id) + '">' +
      '<span class="gtop">' +
      '<span class="gn">' + input('name', it.name, 'Name of the item', 'name') + '</span>' +
      '<button class="gworn" type="button" data-worn="1"></button>' +
      '<button class="gdel" type="button" data-del="1" aria-label="Remove the item">&times;</button>' +
      '</span>' +
      /* An empty field says nothing outside the edit mode: "no effect" on
         every row is a fact the empty field already shows. */
      '<span class="gbot">' + (editing || it.category !== 'weapon' ? '' : weaponLine(it)) +
      input('effect', it.effect, 'The effect of the item on the sheet', editing ? 'no effect' : '') +
      (it.category === 'weapon' ? input('mastery', it.mastery, 'The weapon mastery', editing ? 'no mastery' : '') : '') +
      '</span></div>';
  }

  function renderKind(kind, editing) {
    var host = E[kind.host];
    host.innerHTML = '';
    gear().forEach(function (it) {
      if (it.category === kind.id) host.innerHTML += rowHtml(it, editing);
    });
  }

  /* The armour class the gear gives, and whether the armour sets it. */
  function renderAc() {
    var rec = api.character();
    E.ac.textContent = String(SR.acOf(rec));
    E.from.textContent = SR.hasBaseAC(rec) ? 'from the armour'
      : (SR.hasEffect(rec) ? 'the sheet and the gear' : '');
  }

  function renderRows() {
    var editing = api.editing('equipment');
    KINDS.forEach(function (kind) { renderKind(kind, editing); });
    E.body.classList.toggle('editing', editing);
    Array.prototype.forEach.call(E.body.querySelectorAll('.gin'), function (i) { i.readOnly = !editing; });
    Array.prototype.forEach.call(E.body.querySelectorAll('.gitem'), function (row) {
      var it = itemOf(row.dataset.id);
      if (!it) return;
      var worn = row.querySelector('[data-worn]');
      worn.textContent = it.equipped ? 'Worn' : 'Stowed';
      worn.classList.toggle('on', !!it.equipped);
      worn.setAttribute('aria-label', (it.equipped ? 'Take off ' : 'Put on ') + it.name);
      worn.setAttribute('aria-pressed', it.equipped ? 'true' : 'false');
    });
    E.addArmour.hidden = !editing;
    E.addWeapon.hidden = !editing;
    E.addTool.hidden = !editing;
    renderAc();
  }

  /* An item picked before the books carried its whole effect has what the
     picker wrote then (AC+1 on a cloak of protection): it takes the book's
     effect now. An effect the player wrote is left alone. */
  function upgradeEffects() {
    var magic = (C.library.gear || {}).magic || [];
    if (!magic.length) return;
    var moved = false;
    gear().forEach(function (it) {
      var m = byName(magic, it.name);
      if (!m || !m.effect || it.effect === m.effect) return;
      var old = String(it.effect || '').replace(/\s+/g, '');
      if (old === '' || (m.acBonus && old === 'AC+' + m.acBonus)) { it.effect = m.effect; moved = true; }
    });
    if (moved) api.save();
  }

  function paint() { upgradeEffects(); renderRows(); }

  Sheet.page({
    id: 'equipment',
    glyph: 'M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0',
    title: 'Equipment',
    tab: 'Gear',
    order: 5,
    on: true,
    blurb: 'What the character carries, and what it does.',
    slice: 'equipment',
    seed: seed,
    css: [
      '.gsum{flex:0 0 auto;display:flex;align-items:baseline;gap:8px;padding:7px 10px;border:1px solid var(--edge);border-radius:8px;background:rgba(255,255,255,.03)}',
      '.gsum .gk{font-size:9px;letter-spacing:.16em;color:var(--muted)}',
      '.gsum .gv{font-family:var(--display);font-size:22px;color:var(--ink);font-variant-numeric:tabular-nums}',
      '.gsum .gfrom{margin-left:auto;font-size:10px;color:var(--muted)}',
      '.gitem{display:flex;flex-direction:column;gap:3px;padding:6px 8px;border:1px solid var(--edge);border-radius:6px;background:rgba(255,255,255,.03);cursor:pointer}',
      '.gwl{flex:0 0 auto;font-size:10.5px;color:var(--muted);white-space:nowrap}',
      '.gwl.warn{color:rgb(var(--miss-rgb))}',
      '.gihead{margin:12px 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}',
      '.gibases{display:flex;flex-wrap:wrap;gap:6px}',
      '.gitem .gtop,.gitem .gbot{display:flex;align-items:center;gap:6px;min-width:0}',
      '.gitem .gn{flex:1 1 auto;min-width:0}',
      '.gin{width:100%;border:0;background:none;outline:none;padding:0;font-family:var(--sans);font-size:11.5px;color:var(--ink)}',
      '.gin:read-only{pointer-events:none}',
      '.gbot .gin{font-size:10.5px;color:var(--muted)}',
      '.gbot .gin[data-field="effect"]{font-variant-numeric:tabular-nums}',
      '.gworn{flex:0 0 auto;border:1px solid var(--edge);border-radius:999px;background:none;color:var(--muted);font-family:var(--sans);font-size:9.5px;letter-spacing:.08em;padding:3px 8px;cursor:pointer}',
      '.gworn.on{color:var(--gold);border-color:rgba(var(--gold-rgb),.5);background:rgba(var(--gold-rgb),.10)}',
      '.gdel{flex:0 0 auto;width:18px;height:18px;border:0;background:none;color:#d08a9c;font-size:15px;line-height:1;padding:0;cursor:pointer;display:none;align-items:center;justify-content:center}',
      '.charbody.editing .gdel{display:flex}',
      '.gprow{padding:2px 4px;font-size:11.5px;color:#b9b3d6}',
      '.gsum .gfrom{margin-left:auto}',
      '.gadd{flex:0 0 auto;align-self:center;width:var(--tap);height:var(--tap);margin-left:8px;border:1px solid rgba(var(--arcane-rgb),.5);border-radius:var(--r-control);background:rgba(var(--arcane-rgb),.14);color:var(--ink);font-size:22px;line-height:1;cursor:pointer}',
      /* The picker's filters: the types, then the books in a row of their own. */
      '.gfils{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px}',
      '.gfils.gsrc{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}',
      '.gfil{flex:0 0 auto;min-height:32px;padding:0 12px;border:1px solid var(--edge);border-radius:16px;background:none;color:var(--muted);font-family:var(--sans);font-size:12px;cursor:pointer}',
      '.gfil[aria-pressed="true"]{border-color:rgba(var(--arcane-rgb),.6);background:rgba(var(--arcane-rgb),.16);color:var(--ink)}'
    ].join('\n'),
    html: [
      '<div class="charbody" id="gearBody">',
      '  <div class="gsum"><span class="gk">AC</span><span class="gv" id="gearAc">--</span><span class="gfrom" id="gearFrom"></span>' +
        '<button class="gadd" id="gearAdd" type="button" aria-label="Add an item">+</button></div>',
      '  ' + C.chrome.sectionHead('Armour', { action: { id: 'addArmour', label: 'Add a piece of armour' } }),
      '  <div class="fcards" id="gearArmour"></div>',
      '  ' + C.chrome.sectionHead('Weapons', { action: { id: 'addWeapon', label: 'Add a weapon' } }),
      '  <div class="fcards" id="gearWeapons"></div>',
      '  ' + C.chrome.sectionHead('Tools', { action: { id: 'addTool', label: 'Add a tool' } }),
      '  <div class="fcards" id="gearTools"></div>',
      '</div>'
    ].join('\n'),

    mount: function (root, a) {
      api = a;
      E = {
        body: root.querySelector('#gearBody'),
        ac: root.querySelector('#gearAc'),
        from: root.querySelector('#gearFrom'),
        armour: root.querySelector('#gearArmour'),
        weapons: root.querySelector('#gearWeapons'),
        tools: root.querySelector('#gearTools'),
        addArmour: root.querySelector('#addArmour'),
        addWeapon: root.querySelector('#addWeapon'),
        addTool: root.querySelector('#addTool'),
        add: root.querySelector('#gearAdd')
      };
      E.add.addEventListener('click', openPicker);

      E.body.addEventListener('click', function (ev) {
        var row = ev.target.closest('.gitem');
        var kind = null;
        if (row) {
          var it = itemOf(row.dataset.id);
          if (!it) return;
          if (ev.target.closest('[data-worn]')) { it.equipped = !it.equipped; commit(); return; }
          if (ev.target.closest('[data-del]')) {
            var rec = api.character();
            rec.equipment.items = gear().filter(function (x) { return x.id !== it.id; });
            commit();
            return;
          }
          /* Outside the edit mode a tap reads the item. */
          if (!api.editing('equipment')) { openItem(it.id); return; }
        }
        if (!api.editing('equipment')) return;
        if (ev.target.closest('#addArmour')) kind = 'armour';
        else if (ev.target.closest('#addWeapon')) kind = 'weapon';
        else if (ev.target.closest('#addTool')) kind = 'tool';
        if (!kind) return;
        gear().push(newItem(kind));
        commit();
      });

      E.body.addEventListener('input', function (ev) {
        var field = ev.target.closest ? ev.target.closest('.gin') : null;
        if (!field) return;
        var row = field.closest('.gitem');
        var it = row ? itemOf(row.dataset.id) : null;
        if (!it) return;
        if (field.dataset.field === 'name') it.name = field.value;
        else if (field.dataset.field === 'effect') it.effect = field.value;
        else if (field.dataset.field === 'mastery') it.mastery = field.value;
        else return;
        /* The field keeps the caret, so only the armour class is painted
           again while the formula is typed. */
        api.save();
        if (field.dataset.field === 'effect') renderAc();
      });
    },

    head: function (root, a) {
      api = a;
      root.appendChild(a.wrench({ label: 'Edit the equipment' }));
    },

    render: function (a) {
      api = a;
      /* The weapons and the magic items: a magic weapon's bonus is read
         from its entry. */
      C.library.data('weapons');
      C.library.data('gear');
      paint();
    }
  });
})();
