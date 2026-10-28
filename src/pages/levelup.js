/* The level up page: what the next level of a class gives, from the books, and
   the choices it asks, in one place. It opens from the level row of the
   character page and stays out of the bar: a player reaches it where the level
   is read, not by scrolling a page in edit mode. */
(function () {
  'use strict';

  var C = Sheet.core;
  var SR = C.SR;

  var api = null;
  var E = {};

  /* The books are the ones the shell and the other pages fill: this page reads
     them, it does not register a shape of its own, or it would take the file
     from the page that does. */
  function classes() { return C.library.classData || []; }
  function features() { return (C.library.features && C.library.features.features) || []; }
  function feats() { return C.library.feats || []; }

  function books() {
    return Promise.all([C.library.data('classes'), C.library.data('features'), C.library.data('feats')]);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function ch() { var rec = api.character() || {}; return rec.char || rec; }
  function rows() { return ch().classes || []; }

  function infoOf(name) {
    return classes().filter(function (c) { return c.name === name; })[0] || null;
  }

  function shortOf(info, subName) {
    var found = info && (info.subclasses || []).filter(function (s) { return s.name === subName; })[0];
    return found ? (found.short || found.name) : '';
  }

  /* The level a class grants its subclass: the first level it names one. */
  function subclassLevel(name) {
    var at = 21;
    features().forEach(function (f) {
      if (f.class === name && /subclass$/i.test(String(f.name || ''))) at = Math.min(at, Number(f.level) || 21);
    });
    return at === 21 ? 3 : at;
  }

  /* The features a class and its subclass give exactly at one level, the
     subclass being the one chosen on this screen or the one already worn. */
  function gainsAt(info, row, level, chosen) {
    var sub = shortOf(info, chosen || row.subclass);
    return features().filter(function (f) {
      if (f.class !== info.name) return false;
      if (Number(f.level) !== level) return false;
      if (/subclass$/i.test(String(f.name || ''))) return false;
      if (f.subclass) {
        if (!sub) return false;
        if (f.subclass !== sub) return false;
        if (f.name === (chosen || row.subclass) || f.name === sub) return false;
      }
      return true;
    });
  }

  /* The levels a class asks an Ability Score Improvement at. The corpus skips
     that feature, since it is a choice and not something a sheet tracks, so
     the levels of the books stand here: four, eight, twelve and sixteen for
     every class. A fighter and a rogue take two more; that progression belongs
     in the corpus and is recorded in tasks/level-up-page.md. */
  var ASI_LEVELS = [4, 8, 12, 16];

  var ABILITIES = [
    { key: 'str', label: 'STR' }, { key: 'dex', label: 'DEX' }, { key: 'con', label: 'CON' },
    { key: 'int', label: 'INT' }, { key: 'wis', label: 'WIS' }, { key: 'cha', label: 'CHA' }
  ];

  var pickAt = -1;
  var choiceSub = '';
  var choiceAsi = '';
  var asiFirst = '';
  var asiSecond = '';
  var choiceFeat = '';

  function pickIndex() {
    var list = rows();
    if (pickAt >= 0 && pickAt < list.length) return pickAt;
    var best = 0;
    list.forEach(function (r, i) { if ((Number(r.level) || 0) > (Number(list[best].level) || 0)) best = i; });
    return best;
  }

  function totalLevel() {
    var n = 0;
    rows().forEach(function (r) { n += Number(r.level) || 0; });
    return n || ch().level || 1;
  }

  function textOf(f) {
    return (f.blocks || []).map(function (b) { return String(b && b.text || '').trim(); }).filter(Boolean).join('\n\n');
  }

  function abilitySelect(id, value) {
    return '<select class="lvsel" id="' + id + '">' + ABILITIES.map(function (a) {
      return '<option value="' + a.key + '"' + (a.key === value ? ' selected' : '') + '>' + a.label + '</option>';
    }).join('') + '</select>';
  }

  function featSelect() {
    var list = feats().slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    return '<select class="lvsel lvfeat" id="lvFeat">' +
      '<option value="">take no feat</option>' +
      list.map(function (f) { return '<option value="' + esc(f.name) + '"' + (f.name === choiceFeat ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join('') +
    '</select>';
  }

  function subclassBlock(info, row, level) {
    if (row.subclass) return '<p class="lvsaid">Subclass: <b>' + esc(row.subclass) + '</b></p>';
    if (level !== subclassLevel(info.name)) return '';
    var subs = info.subclasses || [];
    if (!subs.length) return '';
    return '<div class="lvask"><div class="lvaskhead">Choose a ' + esc(info.subclassTitle || 'subclass') + '</div>' +
      '<div class="lvchips">' + subs.map(function (s) {
        return '<button class="lvchip' + (s.name === choiceSub ? ' on' : '') + '" type="button" data-sub="' + esc(s.name) + '">' + esc(s.short || s.name) + '</button>';
      }).join('') + '</div></div>';
  }

  function asiBlock(level) {
    if (ASI_LEVELS.indexOf(level) < 0) return '';
    var box = '<div class="lvask"><div class="lvaskhead">Ability Score Improvement</div>' +
      '<div class="lvchips">' +
      '<button class="lvchip' + (choiceAsi === 'two' ? ' on' : '') + '" type="button" data-asi="two">+2 to one</button>' +
      '<button class="lvchip' + (choiceAsi === 'pair' ? ' on' : '') + '" type="button" data-asi="pair">+1 to two</button>' +
      '<button class="lvchip' + (choiceAsi === 'feat' ? ' on' : '') + '" type="button" data-asi="feat">a feat</button>' +
      '</div>';
    if (choiceAsi === 'two') box += '<div class="lvpick">' + abilitySelect('lvAb1', asiFirst) + '</div>';
    if (choiceAsi === 'pair') box += '<div class="lvpick">' + abilitySelect('lvAb1', asiFirst) + abilitySelect('lvAb2', asiSecond) + '</div>';
    if (choiceAsi === 'feat') box += '<div class="lvpick">' + featSelect() + '</div>';
    return box + '</div>';
  }

  function spellLine(info, row, level) {
    if (!C.classes || typeof C.classes.ready !== 'function') return '';
    var now = C.classes.ready(info.name, Number(row.level) || 1);
    var then = C.classes.ready(info.name, level);
    if (!then) return '';
    var grew = then - now;
    return '<p class="lvsaid">Spells ready: ' + then + (grew > 0 ? ' (+' + grew + ')' : '') +
      ' <button class="lvlink" type="button" id="lvSpells">open the spell list</button></p>';
  }

  function paint() {
    var list = rows();
    if (!list.length) {
      E.body.innerHTML = '<p class="lvsaid">This character has no class yet: make one on the character page.</p>';
      return;
    }
    var at = pickIndex();
    var row = list[at];
    var info = infoOf(row.name);
    if (!info) { E.body.innerHTML = '<p class="lvsaid">The books do not carry the class ' + esc(row.name) + '.</p>'; return; }
    var level = Math.min(20, (Number(row.level) || 1) + 1);
    var gain = gainsAt(info, row, level, choiceSub);
    var conMod = SR.abilityMod((ch().abilities || {}).con || 10);
    var hp = Math.max(1, (Number(info.hd) || 6) + conMod);
    var wasProf = SR.profBonus(totalLevel());
    var prof = SR.profBonus(totalLevel() + 1);

    var head = '<div class="lvhead"><div class="lvtitle"><b>' + esc(row.name) + '</b>' +
      '<span>' + esc(String(row.level)) + '</span><i>&rarr;</i><span class="lvto">' + esc(String(level)) + '</span></div>' +
      (list.length > 1 ? '<div class="lvchips lvwhich">' + list.map(function (r, i) {
        return '<button class="lvchip' + (i === at ? ' on' : '') + '" type="button" data-row="' + i + '">' + esc(r.name) + ' ' + esc(String(r.level)) + '</button>';
      }).join('') + '</div>' : '') + '</div>';

    var summary = '<div class="lvlinebox">' +
      '<div class="lvline"><span>Hit points</span><b>+' + hp + '</b></div>' +
      '<div class="lvline"><span>Proficiency</span><b>' + SR.sign(prof) + (prof !== wasProf ? ' <i>was ' + SR.sign(wasProf) + '</i>' : '') + '</b></div>' +
      '</div>';

    var gains = gain.length
      ? gain.map(function (f) {
        var body = textOf(f);
        return '<div class="lvgain"><div class="lvgname">' + esc(f.name) + '</div>' +
          (body ? '<div class="lvgtext">' + body.split(/\n\n/).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>' : '') +
          '</div>';
      }).join('')
      : '<p class="lvsaid">No new feature at this level: hit points and slots only.</p>';

    var choices = subclassBlock(info, row, level) + asiBlock(level) + spellLine(info, row, level);

    E.body.innerHTML = head + summary + '<div class="lvsect">What you gain</div>' + gains +
      (choices ? '<div class="lvsect">What you choose</div>' + choices : '') +
      '<div class="lvfoot"><button class="lvgo" type="button" id="lvGo">Take level ' + level + '</button>' +
      '<button class="lvback" type="button" id="lvBack">Not now</button></div>';

    wire(info, row, level);
  }

  function wire(info, row, level) {
    Array.prototype.forEach.call(E.body.querySelectorAll('[data-sub]'), function (b) {
      b.addEventListener('click', function () { choiceSub = b.getAttribute('data-sub'); paint(); });
    });
    Array.prototype.forEach.call(E.body.querySelectorAll('[data-asi]'), function (b) {
      b.addEventListener('click', function () { choiceAsi = b.getAttribute('data-asi'); paint(); });
    });
    Array.prototype.forEach.call(E.body.querySelectorAll('[data-row]'), function (b) {
      b.addEventListener('click', function () { pickAt = Number(b.getAttribute('data-row')) || 0; paint(); });
    });
    if (E.body.querySelector('#lvAb1')) E.body.querySelector('#lvAb1').addEventListener('change', function () { asiFirst = this.value; });
    if (E.body.querySelector('#lvAb2')) E.body.querySelector('#lvAb2').addEventListener('change', function () { asiSecond = this.value; });
    if (E.body.querySelector('#lvFeat')) E.body.querySelector('#lvFeat').addEventListener('change', function () { choiceFeat = this.value; });
    if (E.body.querySelector('#lvSpells')) E.body.querySelector('#lvSpells').addEventListener('click', function () { Sheet.show('spells'); });
    if (E.body.querySelector('#lvBack')) E.body.querySelector('#lvBack').addEventListener('click', function () { Sheet.show('character'); });
    if (E.body.querySelector('#lvGo')) E.body.querySelector('#lvGo').addEventListener('click', function () { take(info, row, level); });
  }

  function take(info, row, level) {
    if (!row.subclass && level >= subclassLevel(info.name) && (info.subclasses || []).length && !choiceSub) {
      api.toast('choose a ' + (info.subclassTitle || 'subclass'));
      return;
    }
    if (choiceAsi === 'two' && !asiFirst) { api.toast('choose the ability to raise'); return; }
    if (choiceAsi === 'pair' && (!asiFirst || !asiSecond || asiFirst === asiSecond)) { api.toast('choose two different abilities'); return; }
    if (choiceAsi === 'feat' && !choiceFeat) { api.toast('choose a feat'); return; }

    var c = ch();
    var live = (c.classes || []).filter(function (r) { return r.name === info.name; })[0];
    if (!live) return;
    live.level = level;
    if (choiceSub) live.subclass = choiceSub;
    c.level = (c.classes || []).reduce(function (n, r) { return n + (Number(r.level) || 0); }, 0);

    c.features = Array.isArray(c.features) ? c.features : [];
    var have = {};
    c.features.forEach(function (f) { have[f.key] = true; });
    var short = shortOf(info, live.subclass);
    features().forEach(function (f) {
      if (f.class !== info.name || Number(f.level) > level) return;
      if (/subclass$/i.test(String(f.name || ''))) return;
      if (f.subclass && (!short || f.subclass !== short)) return;
      if (have[f.key]) return;
      c.features.push({ key: f.key, name: f.name, source: f.subclass || f.class, active: !!f.active,
        max: f.uses || 0, left: f.uses || 0, recovery: f.recovery || 'passive', cost: f.cost || '', short: null, hidden: !!f.hidden });
      have[f.key] = true;
    });

    if (choiceAsi === 'two' && asiFirst) raise(c, asiFirst, 2);
    if (choiceAsi === 'pair' && asiFirst && asiSecond) { raise(c, asiFirst, 1); raise(c, asiSecond, 1); }
    if (choiceAsi === 'feat' && choiceFeat) {
      var feat = feats().filter(function (f) { return f.name === choiceFeat; })[0];
      if (feat) c.features.push({ key: 'feat-' + String(feat.name).toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: feat.name, source: 'Feat', active: false, max: 0, left: 0, recovery: 'passive', cost: '', short: null, hidden: false });
    }

    choiceSub = ''; choiceAsi = ''; asiFirst = ''; asiSecond = ''; choiceFeat = '';
    api.save();
    api.refresh();
    api.toast(info.name + ' ' + level);
    Sheet.show('character');
  }

  function raise(c, key, by) {
    c.abilities = c.abilities || {};
    var v = Number(c.abilities[key]) || 10;
    /* The 20 is the ceiling of the books: the score itself, not the modifier. */
    c.abilities[key] = Math.min(20, v + by);
  }

  Sheet.page({
    id: 'levelup',
    title: 'Level up',
    hidden: true,
    on: false,
    back: 'character',
    blurb: 'What the next level gives, and the choices it asks.',
    css: [
      '.lvbody{flex:1 1 auto;min-height:0;overflow-y:auto;scrollbar-width:none;padding:2px 2px 14px;color:var(--ink);font-family:var(--sans);font-size:13.5px;line-height:1.5}',
      '.lvbody::-webkit-scrollbar{display:none}',
      '.lvhead{display:flex;flex-direction:column;gap:8px;margin:2px 0 10px}',
      '.lvtitle{display:flex;align-items:baseline;gap:8px;font-family:var(--display)}',
      '.lvtitle b{font-size:19px;font-weight:700;color:var(--gold)}',
      '.lvtitle span{font-size:17px;color:var(--ink)}',
      '.lvtitle i{font-style:normal;color:var(--muted)}',
      '.lvtitle .lvto{color:var(--arcane);font-weight:700}',
      '.lvchips{display:flex;flex-wrap:wrap;gap:6px}',
      '.lvchip{min-height:34px;padding:0 11px;border:1px solid var(--edge);border-radius:var(--r-control);background:rgba(255,255,255,.03);color:var(--muted);font-family:var(--sans);font-size:12px;letter-spacing:.04em;cursor:pointer}',
      '.lvchip.on{border-color:rgba(var(--arcane-rgb),.65);color:var(--arcane);background:rgba(var(--arcane-rgb),.14)}',
      '.lvlinebox{display:flex;gap:6px;margin:0 0 12px}',
      '.lvline{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:1px;padding:6px 8px 7px;border:1px solid var(--edge);border-radius:8px;background:rgba(255,255,255,.03)}',
      '.lvline span{font-size:9px;letter-spacing:.16em;color:var(--muted);text-transform:uppercase}',
      '.lvline b{font-family:var(--display);font-size:15px;font-weight:700;color:var(--ink)}',
      '.lvline b i{font-style:normal;font-weight:400;font-size:11px;color:var(--muted)}',
      '.lvsect{margin:12px 0 6px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}',
      '.lvgain{margin:0 0 8px;padding:8px 10px;border:1px solid var(--edge);border-radius:var(--r-box);background:rgba(255,255,255,.025)}',
      '.lvgname{font-family:var(--display);font-size:14px;font-weight:700;color:var(--gold);margin:0 0 4px}',
      '.lvgtext{color:var(--ink);font-size:12.5px}',
      '.lvgtext p{margin:0 0 6px}',
      '.lvsaid{margin:0 0 8px;color:var(--muted);font-size:12px}',
      '.lvask{margin:0 0 10px}',
      '.lvaskhead{font-family:var(--display);font-size:13px;color:var(--ink);margin:0 0 6px}',
      '.lvpick{display:flex;gap:6px;margin:6px 0}',
      '.lvsel{flex:1 1 0;min-width:0;min-height:34px;padding:0 8px;border:1px solid var(--edge);border-radius:var(--r-control);background:rgba(255,255,255,.04);color:var(--ink);font-family:var(--sans);font-size:12.5px}',
      '.lvlink{padding:0;border:0;background:none;color:var(--arcane);font-family:var(--sans);font-size:12px;text-decoration:underline;cursor:pointer}',
      '.lvfoot{display:flex;gap:8px;margin:14px 0 0}',
      '.lvgo{flex:2 1 0;min-height:var(--tap);border:1px solid rgba(var(--arcane-rgb),.6);border-radius:var(--r-control);background:rgba(var(--arcane-rgb),.18);color:var(--arcane);font-family:var(--display);font-size:14px;font-weight:700;cursor:pointer}',
      '.lvback{flex:1 1 0;min-height:var(--tap);border:1px solid var(--edge);border-radius:var(--r-control);background:rgba(255,255,255,.03);color:var(--muted);font-family:var(--sans);font-size:12px;cursor:pointer}'
    ].join('\n'),
    html: '<div class="lvbody" id="lvBody"></div>',
    mount: function (root, a) {
      api = a;
      E = { body: root.querySelector('#lvBody') };
      paint();
      books().then(function () { paint(); });
    },
    render: function (a) {
      api = a;
      paint();
    }
  });
})();
