/* The character page: the abilities, the saving throws, the skills, the hit
   points, the hit dice and the rests. It is the home of the app. */
(function () {
  'use strict';

  var C = Sheet.core;
  var D = SheetDrag();
  var SR = C.SR;
  var ABILITIES = C.SR.ABILITIES;
  var SKILLS = C.SR.SKILLS;

  var api = null;   /* the shell gives it at mount */
  var E = {};       /* the elements of the page */
  var CH = {};      /* the character */

  var noteTimer = null;
  /* The classes are a file beside the page, and this is what it fills. */
  /* The species of the books, and the rules of making a character: the
     point buy, the array, the background's increases. The creator and the
     fairy read them; the numbers are data, not code. */
  C.library.data('species', function (value) {
    C.library.species.length = 0;
    (value.species || []).forEach(function (s) { C.library.species.push(s); });
  });
  C.library.data('rules', function (value) {
    var r = C.library.rules;
    Object.keys(r).forEach(function (k) { delete r[k]; });
    Object.keys(value || {}).forEach(function (k) { r[k] = value[k]; });
  });

  C.library.data('classes', function (value) {
    (value.classes || []).forEach(function (c) { C.library.classData.push(c); });
  });

  /* One row of the sheet, from a feature of the data. */
  function featureRow(f) {
    return {
      key: f.key,
      name: f.name,
      source: f.source,
      active: !!f.active,
      max: f.uses || 0,
      left: f.uses || 0,
      recovery: f.recovery || 'passive',
      cost: f.cost || '',
      short: null,
      hidden: !!f.hidden
    };
  }

  /* A copy of a row, so two characters never share one. */
  function copyRow(f) {
    /* Every field the row carries is kept (its effect, its own words), and
       the ones the sheet reads are put in their shape: a row never loses
       what a page or the fairy wrote on it. */
    var keep = JSON.parse(JSON.stringify(f || {}));
    var shaped = {
      key: f.key,
      name: f.name,
      source: f.source || '',
      active: !!f.active,
      recovery: f.recovery || 'passive',
      bind: f.bind || null,
      max: f.max || 0,
      left: f.left || 0,
      cost: f.cost || '',
      short: (f.short === undefined || f.short === null) ? null : f.short,
      hidden: !!f.hidden,
      manual: !!f.manual
    };
    Object.keys(shaped).forEach(function (k) { keep[k] = shaped[k]; });
    return keep;
  }

  /* A new character is given the features of the app's own character. The
     ones that belong to a ready-made character say so in the data and wait
     for it. */
  /* The features a fresh character starts with travel in the page; the rest
     of the library is a file the app reads when a page asks for it. */
  var FEATURE_SEED = (C.library.seeds.features || []).map(featureRow);

  var CHAR_DEFAULTS = {
    name: '',
    level: 11,
    /* The split of the app's own character, a sorcerer 8 with a warlock 3.
       The level of a character is the sum of its classes. */
    classes: [
      { name: 'Sorcerer', level: 8, subclass: 'Wild Magic Sorcery' },
      { name: 'Warlock', level: 3, subclass: 'The Hexblade' }
    ],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 20 },
    saves: { str: 0, dex: 0, con: 1, int: 0, wis: 0, cha: 1 },
    skills: {},
    profs: [],
    features: FEATURE_SEED.concat([
      { key: 'warlockSlots', name: 'Warlock spell slots', source: 'Warlock', active: true, recovery: 'short', bind: 'warlock', max: 0, left: 0, short: null, hidden: true }
    ]),
    init: 0,
    ac: null,
    hp: { current: 0, max: 0, temp: 0 },
    dice: [].concat(
      [{ type: 10, spent: false }],
      [{ type: 6, spent: false }, { type: 6, spent: false }, { type: 6, spent: false }, { type: 6, spent: false },
       { type: 6, spent: false }, { type: 6, spent: false }, { type: 6, spent: false }, { type: 6, spent: false }]
    ),
    history: []
  };
  SKILLS.forEach(function (s) { CHAR_DEFAULTS.skills[s.key] = 0; });

  /* Every feature the app knows, by key, so a character can name the ones
     it was given. */
  var FEATURE_BY_KEY = {};
  (C.library.seeds.features || []).forEach(function (f) { FEATURE_BY_KEY[f.key] = featureRow(f); });
  CHAR_DEFAULTS.features.forEach(function (f) { FEATURE_BY_KEY[f.key] = f; });

  /* A key of the library resolves once the library is in, which is what the
     ready-made characters and the agent read. */
  function rowForKey(key) {
    if (FEATURE_BY_KEY[key]) return copyRow(FEATURE_BY_KEY[key]);
    return C.library.featureByKey[key] ? featureRow(C.library.featureByKey[key]) : null;
  }

  function commitChar() { api.save(); api.refresh(); }

  /* A proficiency is a number: 0 none, 1 proficient, 2 expertise. The state
     saved before the three states existed held a boolean, so it comes back
     as a plain proficiency. */
  function profValue(value) {
    if (value === true) return 1;
    if (value === false || value === undefined || value === null) return 0;
    var n = Number(value) || 0;
    if (n < 0) return 0;
    if (n > 2) return 2;
    return Math.floor(n);
  }

  /* ---- the state ---- */

  function seed(saved, fresh) {
    /* The features the character was given. A record that holds its own
       list is the truth, in the order it keeps them, and a list it emptied
       stays empty. One that holds none is built from the names it was made
       with, or from the list of the app's own character, and one that is
       new starts with nothing. */
    var own = (saved && Array.isArray(saved.features)) ? saved.features : null;
    var keys = null;
    if (!own) {
      if (saved && Array.isArray(saved.featureKeys)) keys = saved.featureKeys;
      else if (!fresh) keys = CHAR_DEFAULTS.features.map(function (f) { return f.key; });
    }
    var c = {
      name: '',
      level: CHAR_DEFAULTS.level,
      classes: CHAR_DEFAULTS.classes.map(function (k) {
        return { name: k.name, level: k.level, subclass: k.subclass || '' };
      }),
      abilities: {},
      saves: {},
      skills: {},
      profs: [],
      features: own ? [] : (keys || []).map(function (k) {
        return rowForKey(k);
      }).filter(Boolean),
      init: CHAR_DEFAULTS.init,
      ac: CHAR_DEFAULTS.ac,
      hp: { current: 0, max: 0, temp: 0 },
      dice: (CHAR_DEFAULTS.dice || []).map(function (d) { return { type: d.type, spent: false }; }),
      history: []
    };
    ABILITIES.forEach(function (a) {
      c.abilities[a.key] = CHAR_DEFAULTS.abilities[a.key];
      c.saves[a.key] = CHAR_DEFAULTS.saves[a.key];
    });
    SKILLS.forEach(function (s) { c.skills[s.key] = 0; });
    /* A character that is new starts from nothing: no name, no features,
       no dice, and the scores at ten. */
    if (fresh) {
      c.name = '';
      c.level = 1;
      c.classes = [];
      ABILITIES.forEach(function (a) {
        c.abilities[a.key] = 10;
        c.saves[a.key] = 0;
      });
      c.dice = [];
      c.init = 0;
      c.ac = null;
      c.hp = { current: 0, max: 0, temp: 0 };
      c.history = [];
    }
    if (saved && typeof saved === 'object') {
      if (typeof saved.name === 'string') c.name = saved.name;
      if (saved.level) c.level = Math.max(1, Math.min(20, Number(saved.level) || CHAR_DEFAULTS.level));
      if (Array.isArray(saved.classes)) {
        c.classes = saved.classes.filter(function (k) { return k && k.name; }).map(function (k) {
          return {
            name: String(k.name),
            level: Math.max(0, Math.min(20, Number(k.level) || 0)),
            subclass: k.subclass ? String(k.subclass) : ''
          };
        });
      }
      /* The initiative follows the dexterity until the player sets one. */
      if (saved.initTouched) {
        c.init = Number(saved.init) || 0;
        c.initTouched = true;
      }
      if (saved.ac !== undefined && saved.ac !== null && saved.ac !== '') c.ac = Number(saved.ac) || 0;
      ABILITIES.forEach(function (a) {
        if (saved.abilities && saved.abilities[a.key] !== undefined && saved.abilities[a.key] !== null) {
          c.abilities[a.key] = Math.max(0, Math.min(30, Number(saved.abilities[a.key]) || 0));
        }
        if (saved.saves && saved.saves[a.key] !== undefined) c.saves[a.key] = profValue(saved.saves[a.key]);
      });
      SKILLS.forEach(function (s) {
        if (saved.skills && saved.skills[s.key] !== undefined) c.skills[s.key] = profValue(saved.skills[s.key]);
      });
      if (saved.hp) {
        c.hp.current = Math.max(0, Number(saved.hp.current) || 0);
        c.hp.max = Math.max(0, Number(saved.hp.max) || 0);
        c.hp.temp = Math.max(0, Number(saved.hp.temp) || 0);
      }
      if (saved.dice && saved.dice.length) {
        c.dice = saved.dice.map(function (d) { return { type: Number(d.type) || 6, spent: !!d.spent }; });
      }
      /* The classes own the dice, and the record says which of them were
         spent, so a level up brings the new dice and keeps the old marks. */
      var fromClasses = diceFromClasses(c.classes);
      if (fromClasses.length) {
        var spentByType = {};
        (c.dice || []).forEach(function (d) { if (d.spent) spentByType[d.type] = (spentByType[d.type] || 0) + 1; });
        fromClasses.forEach(function (d) {
          if (spentByType[d.type]) { d.spent = true; spentByType[d.type] -= 1; }
        });
        c.dice = fromClasses;
      }
      if (saved.features && saved.features.length) {
        var savedByKey = {};
        saved.features.forEach(function (f) { savedByKey[f.key] = f; });
        c.features = c.features.map(function (f) {
          var s = savedByKey[f.key];
          if (!s) return f;
          var copy = Object.assign({}, f);
          if (s.name) copy.name = s.name;
          if (s.max !== undefined) copy.max = Math.max(0, Number(s.max) || 0);
          if (s.left !== undefined) copy.left = Math.max(0, Number(s.left) || 0);
          if (s.recovery !== undefined) copy.recovery = s.recovery;
          if (s.cost !== undefined) copy.cost = s.cost;
          if (s.short !== undefined) copy.short = s.short;
          if (s.manual) copy.manual = true;
          /* the hidden flag follows the data, unless the player moved it */
          copy.hidden = s.toggled ? !!s.hidden : !!f.hidden;
          return copy;
        });
        /* the features that are not in the seed any more */
        saved.features.forEach(function (f) {
          var known = c.features.some(function (x) { return x.key === f.key; });
          if (!known) c.features.push(copyRow(f));
        });
      }
      /* The features a class brings that the player removed stay removed. */
      if (Array.isArray(saved.dropped)) c.dropped = saved.dropped.filter(function (k) { return typeof k === 'string'; });
      /* The maximum of hit points set by hand, which the automatic one leaves be. */
      if (saved.hpManual) c.hpManual = true;
      /* The origin: the species and its choice, the background, how the
         scores were made, and the speed the species gives. */
      if (typeof saved.species === 'string') c.species = saved.species;
      if (typeof saved.speciesChoice === 'string') c.speciesChoice = saved.speciesChoice;
      if (saved.background && typeof saved.background === 'object') c.background = JSON.parse(JSON.stringify(saved.background));
      if (saved.creation && typeof saved.creation === 'object') c.creation = JSON.parse(JSON.stringify(saved.creation));
      if (Number(saved.speed) > 0) c.speed = Number(saved.speed);
      if (saved.profs && saved.profs.length) {
        c.profs = saved.profs.filter(function (p) { return p && p.id; }).map(function (p) {
          return { id: String(p.id), label: typeof p.label === 'string' ? p.label : '' };
        });
      }
      if (saved.history && saved.history.length) {
        c.history = saved.history.filter(function (h) { return h && typeof h === 'object'; }).slice(-60);
      }
    }
    /* The level of a character is the sum of its classes, when it has any. */
    if (c.classes.length) c.level = Math.max(1, Math.min(20, SR.classLevels(c.classes)));
    return c;
  }

  /* ---- the sheet ---- */

  function buildChar() {
    ABILITIES.forEach(function (a) {
      var tile = document.createElement('div');
      tile.className = 'ab';
      tile.innerHTML = '<span class="an">' + a.name + '</span>';

      /* The score, the modifier and the saving throw read on one line, so
         the tile is two rows rather than three. */
      var row = document.createElement('span');
      row.className = 'abrow';
      row.innerHTML = '<input class="cinput" type="number" inputmode="numeric" min="0" max="30" data-ab="' + a.key + '" aria-label="' + a.long + ' score">' +
        '<span class="am" data-mod="' + a.key + '">+0</span>';

      var save = document.createElement('span');
      save.className = 'prow';
      save.dataset.kind = 'save';
      save.dataset.key = a.key;
      save.innerHTML = '<span class="dot"></span><span class="vl">+0</span>';

      row.appendChild(save);
      tile.appendChild(row);
      E.charAbilities.appendChild(tile);
    });

    SKILLS.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'prow';
      row.dataset.kind = 'skill';
      row.dataset.key = s.key;
      row.innerHTML = '<span class="dot"></span><span class="nm">' + s.name + '</span>' +
        '<span class="abk">' + s.ab.toUpperCase() + '</span><span class="vl">+0</span>';
      E.charSkills.appendChild(row);
    });
  }

  function renderChar() {
    E.charBody.classList.toggle('editing', api.editing('character'));

    /* The numbers a player sets before the game are not changed at the
       table: the armor class, the initiative, the maximum of the hit points
       and the ability scores only take a keyboard in the edit mode. The
       current hit points stay live, since they move during play. */
    /* A piece of gear may carry an effect the sheet reads, and then the
       armour class comes from the gear rather than from the field. */
    var geared = C.SR.hasEffect(api.character());
    E.charAc.disabled = geared || !api.editing('character');
    E.charInit.disabled = !api.editing('character');
    E.charSpeed.disabled = !api.editing('character');
    /* The speed: the species' or the one set, with the effects (Mobile). */
    if (document.activeElement !== E.charSpeed) E.charSpeed.value = String(SR.speedOf(api.character()));
    E.charHpMax.disabled = !api.editing('character');
    E.hpCard.classList.toggle('editing', api.editing('character'));

    if (document.activeElement !== E.charAc) {
      E.charAc.value = geared ? String(C.SR.acOf(api.character()))
        : (CH.ac === null ? '' : String(CH.ac));
    }
    if (document.activeElement !== E.charInit) E.charInit.value = String(SR.initMod(CH, api.character()));
    if (document.activeElement !== E.charLevel) E.charLevel.value = String(CH.level);
    paintHp();

    ABILITIES.forEach(function (a) {
      var input = E.charAbilities.querySelector('[data-ab="' + a.key + '"]');
      if (input) {
        input.disabled = !api.editing('character');
        if (document.activeElement !== input) input.value = String(CH.abilities[a.key]);
      }
      var mod = E.charAbilities.querySelector('[data-mod="' + a.key + '"]');
      if (mod) mod.textContent = SR.sign(SR.abilityMod(CH.abilities[a.key]));
    });

    ABILITIES.forEach(function (a) {
      var row = E.charAbilities.querySelector('[data-kind="save"][data-key="' + a.key + '"]');
      if (!row) return;
      var v = Number(CH.saves[a.key]) || 0;
      row.classList.toggle('prof', v === 1);
      row.classList.toggle('exp', v === 2);
      row.querySelector('.vl').textContent = SR.sign(SR.saveMod(CH, a.key, api.character()));
      row.title = a.long + ' saving throw, ' + SR.profLabel(v);
    });

    SKILLS.forEach(function (s) {
      var row = E.charSkills.querySelector('[data-key="' + s.key + '"]');
      if (!row) return;
      var v = Number(CH.skills[s.key]) || 0;
      row.classList.toggle('prof', v === 1);
      row.classList.toggle('exp', v === 2);
      row.querySelector('.vl').textContent = SR.sign(SR.skillMod(CH, s.key, api.character()));
      row.title = s.name + ', ' + SR.profLabel(v);
    });

    /* The proficiency bonus is the bonus of the level, and the spell attack
       and the save DC live on the pages that roll them. */
    E.charProf.textContent = SR.sign(SR.profBonus(CH.level));

    var rows = C.library.classRows(CH);
    E.charLevel.disabled = rows.length > 0;
    /* The class line says the levels, so the box that adds them up shows
       only for a character with no class yet, where it is the level. */
    E.charLevelBox.style.display = rows.length ? 'none' : '';
    if (rows.length && document.activeElement !== E.charLevel) E.charLevel.value = String(SR.classLevels(rows));
    E.charClassSum.hidden = !rows.length;
    E.charClassSum.textContent = rows.map(function (r) {
      return r.name + ' ' + r.level + (r.subclass ? ', ' + r.subclass : '');
    }).join(' · ');

    renderDiceProfs();
    if (api.editing('character')) buildClasses();
  }

  /* ---- the classes ---- */

  function classes() {
    var ch = api.character().char;
    if (!Array.isArray(ch.classes)) ch.classes = [];
    return ch.classes;
  }

  /* The level of the character is the sum of its classes. */
  function syncLevel() {
    var ch = api.character().char;
    ch.level = Math.max(1, Math.min(20, SR.classLevels(ch.classes || [])));
  }

  function openClassPicker(index, onPick) {
    var list = C.library.classData.map(function (c) {
      var what = c.caster === 'full' ? 'full caster' : (c.caster === 'pact' ? 'pact magic' : ((c.caster === 'half' || c.caster === 'artificer') ? 'half caster' : 'no spellcasting'));
      return '<div class="crow" data-c="' + C.chrome.esc(c.name) + '"><span class="cn">' + C.chrome.esc(c.name) + '</span>' +
        '<span class="cl">' + C.chrome.esc(what + (c.ability ? ', ' + c.ability.toUpperCase() : '')) + '</span></div>';
    }).join('');
    api.sheet.open({
      id: 'pickclass',
      title: index >= 0 ? 'The class' : 'A class to add',
      list: list,
      onList: function (ev) {
        var row = ev.target.closest('[data-c]');
        if (!row) return;
        onPick(row.dataset.c);
        api.sheet.close();
      }
    });
  }

  function openSubclassPicker(index) {
    var row = classes()[index];
    if (!row) return;
    var info = C.library.classInfo(row.name);
    var list = ((info && info.subclasses) || []).map(function (s) {
      return '<div class="crow" data-s="' + C.chrome.esc(s.name) + '"><span class="cn">' + C.chrome.esc(s.name) + '</span>' +
        '<span class="cl">' + C.chrome.esc(s.source) + '</span></div>';
    }).join('') + '<div class="crow" data-s=""><span class="cn">No subclass</span></div>';
    api.sheet.open({
      id: 'picksub',
      title: info ? info.name : 'The subclass',
      meta: (info && info.subclassTitle) ? '<span>' + C.chrome.esc(info.subclassTitle) + '</span>' : '',
      list: list,
      onList: function (ev) {
        var picked = ev.target.closest('[data-s]');
        if (!picked) return;
        classes()[index].subclass = picked.dataset.s;
        api.sheet.close();
        commitChar();
      }
    });
  }

  function buildClasses() {
    if (!E.charClasses) return;
    var list = classes();
    E.charClasses.innerHTML = '';
    if (!list.length) {
      var none = document.createElement('p');
      none.className = 'note';
      none.textContent = 'No class yet. The plus adds one.';
      E.charClasses.appendChild(none);
    }
    list.forEach(function (k, ix) {
      var info = C.library.classInfo(k.name) || {};
      var what = info.caster === 'full' ? 'full caster' : (info.caster === 'pact' ? 'pact magic' : ((info.caster === 'half' || info.caster === 'artificer') ? 'half caster' : 'no spellcasting'));
      var row = document.createElement('div');
      row.className = 'srow clrow';
      row.dataset.ix = String(ix);
      row.innerHTML =
        '<span class="t"><button class="clname" type="button" data-pick="name">' + C.chrome.esc(k.name || 'A class') + '</button>' +
        '<button class="clsub" type="button" data-pick="sub">' + C.chrome.esc(k.subclass || 'no subclass') + '</button></span>' +
        '<span class="d">' + C.chrome.esc(what + (info.ability ? ', ' + info.ability.toUpperCase() : '')) + '</span>' +
        '<button class="mini" type="button" data-lv="-">&minus;</button>' +
        '<span class="clvl">' + k.level + '</span>' +
        '<button class="mini" type="button" data-lv="+">+</button>' +
        '<button class="cdel" type="button" data-del="1">&times;</button>';
      E.charClasses.appendChild(row);
    });
  }

  /* ---- the hit dice ---- */

  function dieSvg(type) {
    var pts = SR.DIE_SHAPES[type];
    if (!pts) {
      var built = [], i, a;
      for (i = 0; i < type; i++) {
        a = -Math.PI / 2 + i * 2 * Math.PI / type;
        built.push((12 + 9.2 * Math.cos(a)).toFixed(2) + ',' + (12 + 9.2 * Math.sin(a)).toFixed(2));
      }
      pts = built.join(' ');
    }
    var label = SR.DIE_LABEL[type] || { y: 15.4, size: 9 };
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<polygon points="' + pts + '" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<text x="12" y="' + label.y + '" text-anchor="middle" font-size="' + label.size + '" fill="currentColor" ' +
      'font-family="Cinzel, Georgia, serif">' + type + '</text></svg>';
  }

  /* The dice of a character are the dice of its classes: a sorcerer rolls
     a d6 and a warlock a d8. A character with no class keeps the ones it
     was given. */
  function diceFromClasses(classes) {
    var out = [];
    (classes || []).forEach(function (k) {
      var info = C.library.classInfo(k.name);
      var known = (C.library.seeds && C.library.seeds.dice) || {};
      var die = (info && info.hd) || known[k.name] || 6;
      var n = Number(k.level) || 0;
      for (var i = 0; i < n; i++) out.push({ type: die, spent: false });
    });
    return out;
  }

  function countDice(type) {
    var n = 0;
    (CH.dice || []).forEach(function (d) { if (d.type === type) n++; });
    return n;
  }

  /* The counters are built once for the shape they have, and their numbers
     are written into them after that, so the field the player types in is
     never rebuilt under his finger. */
  function buildDice(kinds, types) {
    E.diceBox.innerHTML = '';
    E.diceEdit.innerHTML = '';
    E.diceEdit.hidden = true;

    /* A counter is one element in both modes: the shape of the die, the
       count, the whole of it. The edit mode makes the count writable, and a
       count that is not being edited is a read-only field, so the edit mode
       has no rendering of its own to keep in step. */
    types.forEach(function (t) {
      var chip = document.createElement('div');
      chip.className = 'dcount';
      chip.dataset.type = String(t);
      if (!api.editing('character')) {
        /* A count that is not being edited is a control: it spends a die
           when it is tapped. */
        chip.setAttribute('role', 'button');
        chip.tabIndex = 0;
        chip.addEventListener('keydown', function (ev) {
          if (ev.key !== 'Enter' && ev.key !== ' ') return;
          ev.preventDefault();
          chip.click();
        });
      }
      chip.innerHTML = '<span class="dico">' + dieSvg(t) + '</span>' +
        '<span class="dnum">' +
        '<input class="dcur" type="number" inputmode="numeric" min="0" max="' + kinds[t].total +
        '" value="' + kinds[t].left + '" data-cur="' + t + '"' +
        (api.editing('character')
          ? ' aria-label="How many d' + t + ' are left"'
          : ' readonly tabindex="-1" aria-hidden="true"') +
        '>' +
        '<span class="dof">/ ' + kinds[t].total + '</span></span>';
      E.diceBox.appendChild(chip);
    });

    if (!types.length) {
      var none = document.createElement('span');
      none.className = 'dnote';
      none.textContent = 'No hit dice yet.';
      E.diceBox.appendChild(none);
    }
    if (!api.editing('character')) return;

    /* A character with a class takes its dice from the class, so it gets no
       rows to set them and nothing to read. */
    if (C.library.classRows(CH).length) return;
    var grid = document.createElement('div');
    grid.className = 'dicegrid';
    [12, 10, 8, 6].forEach(function (t) {
      var row = document.createElement('div');
      row.className = 'drow';
      row.innerHTML = '<span class="dico">' + dieSvg(t) + '</span>' +
        '<span class="dty">d' + t + '</span>' +
        '<button class="mini" type="button" data-type="' + t + '" data-sign="-">&minus;</button>' +
        '<span class="dval">' + countDice(t) + '</span>' +
        '<button class="mini" type="button" data-type="' + t + '" data-sign="+">+</button>';
      grid.appendChild(row);
    });
    E.diceEdit.appendChild(grid);
    /* An empty block is no block: it would hold a line of its own in the
       row and push the sheet down for nothing. */
    E.diceEdit.hidden = false;
  }

  function paintDice(kinds, types) {
    types.forEach(function (t) {
      var chip = E.diceBox.querySelector('.dcount[data-type="' + t + '"]');
      if (!chip) return;
      var field = chip.querySelector('.dcur');
      /* A count being typed in the edit mode keeps what is typed; a read-only
         one (a tap took a die) always shows what is left, focused or not. */
      if (field && (field.readOnly || document.activeElement !== field)) field.value = String(kinds[t].left);
      chip.classList.toggle('empty', !kinds[t].left);
      if (!api.editing('character')) {
        chip.setAttribute('aria-label',
          'Spend one d' + t + ', ' + kinds[t].left + ' of ' + kinds[t].total + ' left');
      }
    });
  }

  /* ---- the proficiencies ---- */

  var profSeq = 0;      /* names a new card, so two made in a moment are two */

  function profs() {
    var ch = api.character().char;
    if (!Array.isArray(ch.profs)) ch.profs = [];
    return ch.profs;
  }

  function buildProfs() {
    E.charProfs.innerHTML = '';
    var list = profs();
    if (!list.length) {
      if (!api.editing('character')) return;
      var none = document.createElement('p');
      none.className = 'note';
      none.textContent = 'Nothing yet. The plus adds one.';
      E.charProfs.appendChild(none);
      return;
    }
    list.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'pcard';
      card.dataset.id = p.id;
      card.innerHTML = api.editing('character')
        ? '<input class="plabel" type="text" data-id="' + p.id + '" value="' + C.chrome.esc(p.label) +
          '" aria-label="The proficiency">' +
          '<button class="pdel" type="button" data-del="' + p.id +
          '" aria-label="Remove this proficiency">&times;</button>'
        : '<span class="plabel">' + C.chrome.esc(p.label) + '</span>';
      E.charProfs.appendChild(card);
    });
  }

  function paintProfs() {
    profs().forEach(function (p) {
      var card = E.charProfs.querySelector('.pcard[data-id="' + p.id + '"]');
      if (!card) return;
      var span = card.querySelector('span.plabel');
      if (span && span.textContent !== p.label) span.textContent = p.label;
      var field = card.querySelector('input.plabel');
      if (field && document.activeElement !== field) field.value = p.label;
    });
  }

  /* The counters and the cards are built once for the shape they hold, and
     their numbers and labels are written into them after that, so the field
     being typed in is never rebuilt under the finger. One paint covers both,
     so a change of either builds both. */
  function renderDiceProfs() {
    /* One counter for each kind of die, in the row of the armor class and
       the initiative: the shape of the die, what is left of it over the
       whole of it. A tap spends one of them, and the edit mode sets what is
       left. */
    var kinds = {};
    (CH.dice || []).forEach(function (d) {
      if (!kinds[d.type]) kinds[d.type] = { total: 0, left: 0 };
      kinds[d.type].total += 1;
      if (!d.spent) kinds[d.type].left += 1;
    });
    var types = Object.keys(kinds).map(Number).sort(function (a, b) { return b - a; });
    var list = profs();
    if (E.addProf) E.addProf.hidden = !api.editing('character');
    api.paint([
      api.editing('character') ? 'edit' : 'view',
      C.library.classRows(CH).length ? 'class' : 'own',
      types.map(function (t) { return t + '/' + kinds[t].total; }).join(','),
      list.map(function (p) { return p.id; }).join(',')
    ], {
      build: function () { buildDice(kinds, types); buildProfs(); },
      render: function () { paintDice(kinds, types); paintProfs(); }
    });
  }

  /* The order of the cards on screen is the order of the list. */
  function saveProfOrder(keys) {
    var byId = {};
    profs().forEach(function (p) { byId[p.id] = p; });
    var next = [];
    keys.forEach(function (id) {
      if (byId[id]) next.push(byId[id]);
    });
    api.record.slice(api.character(), 'char').profs = next;
    commitChar();
  }

  /* ---- the hit points ---- */

  /* The card: the hit points, the maximum, the temporary ones as a chip, and
     a bar that fills to the hit points and carries the temporary ones after
     them. At zero the number turns the colour of a miss: the death saves are
     rolled at the table, so the sheet only says where the character stands. */
  function paintHp() {
    var hp = CH.hp;
    var temp = Math.max(0, Number(hp.temp) || 0);
    E.charHpNow.textContent = hp.current || hp.max ? String(hp.current) : '--';
    E.charHpNow.classList.toggle('down', hp.max > 0 && !hp.current);
    E.charHpNow.setAttribute('aria-label', 'Change the hit points, ' + hp.current +
      (hp.max ? ' of ' + hp.max : '') + (temp ? ', ' + temp + ' temporary' : ''));
    if (document.activeElement !== E.charHpMax) E.charHpMax.value = hp.max ? String(hp.max) : '';
    E.charHpTemp.hidden = !temp;
    E.charHpTemp.textContent = '+' + temp + ' temp';
    var whole = Math.max(hp.max, hp.current + temp, 1);
    E.charHpFill.style.width = (100 * Math.min(hp.current, whole) / whole) + '%';
    E.charHpTempFill.style.width = (100 * Math.min(temp, whole - Math.min(hp.current, whole)) / whole) + '%';
    E.charHpFill.classList.toggle('low', hp.max > 0 && hp.current <= hp.max / 4);
    E.charHpDown.disabled = !hp.current;
    E.charHpUp.disabled = hp.max > 0 && hp.current >= hp.max;
  }

  function setHp(next) {
    if (next === CH.hp.current) return;
    C.rest.push(api.character());
    CH.hp.current = next;
    commitChar();
  }

  /* A move from the keypad goes on the history as one step, says what it did
     in the line a spend says, and marks the card. */
  function moveHp(kind, amount) {
    var hp = CH.hp;
    var next = SR.hpMove(hp, kind, amount);
    if (next.current === hp.current && next.temp === (Number(hp.temp) || 0)) return false;
    var lost = hp.current - next.current;
    C.rest.push(api.character());
    hp.current = next.current;
    hp.temp = next.temp;
    commitChar();
    if (kind === 'damage') C.feedback.spent('hit point', Math.max(1, lost || amount), hp.current);
    else if (kind === 'heal') C.feedback.back('hit point', -lost, hp.current);
    else if (kind === 'temp') api.toast(next.temp + ' temporary hit point' + (next.temp === 1 ? '' : 's'));
    else api.toast('Hit points set to ' + hp.current);
    C.feedback.tap(E.hpCard);
    return true;
  }

  /* The keypad: the amount is typed first, then what it is. It docks at the
     bottom of the page, the four answers under the thumb, and closes once
     one is given. Nothing is written until then, so a keypad left open
     changes nothing. */
  var HP_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'del'];

  function openHpKeys() {
    var typed = '';
    var hp = CH.hp;
    var keys = HP_KEYS.map(function (k) {
      var label = k === 'del' ? '\u232b' : k;
      var aria = k === 'del' ? 'Delete a digit' : (k === 'C' ? 'Clear' : k);
      return '<button type="button" class="hpk" data-key="' + k + '" aria-label="' + aria + '">' + label + '</button>';
    }).join('');
    api.sheet.open({
      id: 'hpkeys',
      title: 'Hit points',
      dock: true,
      list: '<div class="hpkline"><span class="hpknow" id="hpkNow"></span><span class="hpkprev" id="hpkPrev"></span></div>' +
        '<div class="hpkshow" id="hpkShow">0</div>' +
        '<div class="hpkgrid">' + keys + '</div>' +
        '<div class="hpkacts">' +
        '<button type="button" class="hpka dmg" data-do="damage">Damage</button>' +
        '<button type="button" class="hpka heal" data-do="heal">Heal</button>' +
        '<button type="button" class="hpka set" data-do="set">Set</button>' +
        '<button type="button" class="hpka tmp" data-do="temp">Temp</button></div>',
      onPaint: function (root) { paintKeys(root); },
      onList: function (ev) {
        var root = ev.currentTarget || document;
        var key = ev.target.closest('.hpk');
        if (key) {
          var k = key.dataset.key;
          if (k === 'C') typed = '';
          else if (k === 'del') typed = typed.slice(0, -1);
          else typed = (typed + k).replace(/^0+(?=\d)/, '').slice(0, 3);
          paintKeys(root);
          return;
        }
        var act = ev.target.closest('.hpka');
        if (!act || act.disabled || !typed) return;
        var n = Number(typed);
        api.sheet.close();
        moveHp(act.dataset.do, n);
      }
    });

    /* The line over the keys says where the hit points are and where each
       answer would take them, so the choice is made with the result in
       sight. */
    function paintKeys(root) {
      var now = root.querySelector('#hpkNow');
      if (!now) return;
      var n = Number(typed) || 0;
      var temp = Number(hp.temp) || 0;
      now.textContent = hp.current + (hp.max ? ' / ' + hp.max : '') + (temp ? '  +' + temp + ' temp' : '');
      var dmg = SR.hpMove(hp, 'damage', n);
      var heal = SR.hpMove(hp, 'heal', n);
      root.querySelector('#hpkPrev').textContent = typed
        ? 'damage \u2192 ' + dmg.current + (dmg.temp ? ' +' + dmg.temp : '') + ' \u00b7 heal \u2192 ' + heal.current
        : '';
      var show = root.querySelector('#hpkShow');
      show.textContent = typed || '0';
      show.classList.toggle('empty', !typed);
      Array.prototype.forEach.call(root.querySelectorAll('.hpka'), function (b) {
        b.disabled = !typed;
        var word = { damage: 'Damage', heal: 'Heal', set: 'Set', temp: 'Temp' }[b.dataset.do];
        b.textContent = typed ? word + ' ' + typed : word;
      });
    }
  }

  /* ---- the rests ---- */

  /* The rest knows what it gives back and says so; the page paints the list
     and keeps nothing of the rule. A rest that gave nothing keeps the
     sentence, which is where it can say so. */
  function doRest(kind) {
    var out = C.rest.rest(kind, api.character());
    commitChar();
    if (out.gains && out.gains.length) gains(out.gains);
    else note(out.note);
    if (navigator.vibrate) navigator.vibrate([14, 40, 14]);
  }

  function note(message) {
    E.charNote.textContent = message;
    E.charGains.hidden = true;
    E.charGains.innerHTML = '';
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { E.charNote.textContent = ''; }, 2600);
  }

  /* What came back, two to a row, the count before the name, drawn as a
     notification: the gold on the dark ground of the line a cast says, in the
     same border and pill, and it arrives the way that line does. It stays a
     little longer than a sentence, since it is a list to read. */
  function gains(list) {
    E.charNote.textContent = '';
    E.charGains.innerHTML = list.map(function (g) {
      return '<span class="gain"><b>+' + g.n + '</b><span>' + C.chrome.esc(g.label) + '</span></span>';
    }).join('');
    E.charGains.hidden = false;
    /* The block stays in the page, so its arrival runs again by hand. */
    E.charGains.style.animation = 'none';
    void E.charGains.offsetWidth;
    E.charGains.style.animation = '';
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(function () {
      E.charGains.hidden = true;
      E.charGains.innerHTML = '';
    }, 4500);
  }

  /* ---- the page ---- */

  Sheet.page({
    id: 'character',
    glyph: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    title: function (a) {
      var c = a.character().char || {};
      return c.name || 'Character';
    },
    tab: 'Character',
    home: true,
    order: 0,
    slice: 'char',
    /* The name of the character is written where it is read: the banner is the
       field, and it is editable while the wrench is on. */
    rename: function (value, a) {
      var ch = a.character().char;
      var name = String(value || '').replace(/\s+/g, ' ').trim();
      if (!name || name === ch.name) return;
      ch.name = name;
      a.save();
    },
    blurb: 'The sheet of the character. It is always there.',
    css: [
      '.csname{display:flex;align-items:center;gap:8px;flex:0 0 auto}',
      '.csname[hidden]{display:none}',
      '.cnlevel{flex:0 0 auto;margin-left:auto;display:flex;align-items:baseline;gap:4px;padding:2px 7px 3px;border:1px solid var(--edge);border-radius:7px;background:rgba(255,255,255,.03);}',
      '.cnlevel .ck{font-size:9px;letter-spacing:.16em;color:var(--muted)}',
      '.cnlevel .cinput{width:1.7em;font-size:15px;text-align:center;font-variant-numeric:tabular-nums}',
      /* One row, always: the tiles share what the hit dice leave them. */
      '.ctop{display:flex;flex-wrap:nowrap;gap:6px;flex:0 0 auto}',
      /* The edit mode's dice editor takes a line of its own under the row. */
      '.ctop:has(> .diceedit:not([hidden])){flex-wrap:wrap}',
      '.ctile{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:1px;padding:5px 7px 6px;border:1px solid var(--edge);border-radius:8px;background:rgba(255,255,255,.03);}',
      '.ctile .ck{font-size:9px;letter-spacing:.16em;text-align:center;color:var(--muted)}',
      '.ctile .cinput{text-align:center}',
      '.cnum{font-family:var(--display);font-size:19px;font-weight:700;line-height:1.15;font-variant-numeric:tabular-nums;color:var(--ink);text-align:center}',
      /* The hit point card: the two steps a thumb wide on either side, the
         hit points, the maximum and the temporary chip over a bar. */
      '.hpcard{flex:0 0 auto;display:flex;align-items:stretch;gap:var(--gap-3);padding:10px;border:1px solid var(--edge);border-radius:var(--r-box);background:rgba(255,255,255,.035)}',
      '.hpstep{flex:0 0 48px;min-height:48px;border:1px solid var(--edge);border-radius:10px;background:rgba(255,255,255,.03);color:var(--muted);font-family:var(--sans);font-size:24px;line-height:1;padding:0;cursor:pointer;touch-action:manipulation}',
      '.hpstep.minus{color:rgb(var(--dis-rgb))}',
      '.hpstep.plus{color:var(--ink)}',
      '.hpstep:disabled{opacity:.35;cursor:default}',
      '.hpmid{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:6px;padding:2px 4px;cursor:pointer}',
      '.hptop{display:flex;align-items:baseline;gap:6px;min-width:0}',
      '.hptop .ck{flex:0 0 auto;font-size:10px;letter-spacing:.16em;color:var(--muted)}',
      '.hpnow{flex:0 0 auto;padding:0;border:0;background:none;color:var(--ink);font-family:var(--display);font-size:34px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;cursor:pointer}',
      '.hpnow.down{color:rgb(var(--miss-rgb))}',
      '.hpof{flex:0 0 auto;font-size:15px;color:var(--muted)}',
      '.hpmax{width:2.6em;flex:0 0 auto;font-family:var(--sans);font-size:15px;font-weight:400;color:var(--muted)}',
      '.hpmax:disabled{pointer-events:none;-webkit-text-fill-color:var(--muted);opacity:1}',
      '.hpcard.editing .hpmax{border-bottom:1px dashed var(--edge)}',
      '.hptemp{margin-left:auto;flex:0 0 auto;font-size:11px;padding:2px 8px;border:1px solid rgba(var(--temp-rgb),.55);border-radius:10px;color:rgb(var(--temp-rgb))}',
      '.hptemp[hidden]{display:none}',
      '.hpbar{display:flex;height:7px;border-radius:4px;background:rgba(255,255,255,.06);overflow:hidden}',
      '.hpbar i{display:block;height:100%;transition:width .2s ease-out}',
      '.hpfill{background:linear-gradient(90deg,rgba(var(--arcane-rgb),.55),var(--arcane))}',
      '.hpfill.low{background:rgb(var(--miss-rgb))}',
      '.hptempfill{background:rgb(var(--temp-rgb))}',
      '@media (prefers-reduced-motion:reduce){.hpbar i{transition:none}}',
      /* The keypad, docked at the bottom of the page. */
      '.hpkline{display:flex;align-items:baseline;gap:8px;font-size:12px;color:var(--muted)}',
      '.hpknow{flex:0 0 auto;font-family:var(--display);font-size:17px;font-weight:700;color:var(--ink);white-space:pre}',
      '.hpkprev{margin-left:auto;text-align:right}',
      '.hpkshow{height:60px;display:flex;align-items:center;justify-content:center;border:1px solid var(--edge);border-radius:var(--r-box);background:rgba(255,255,255,.03);font-family:var(--display);font-size:38px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}',
      '.hpkshow.empty{color:#5c5778}',
      '.hpkgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--gap-2)}',
      '.hpk{height:46px;border:1px solid var(--edge);border-radius:10px;background:rgba(255,255,255,.04);color:var(--ink);font-family:var(--sans);font-size:19px;cursor:pointer;touch-action:manipulation}',
      '.hpk:active{background:rgba(var(--arcane-rgb),.16)}',
      '.hpkacts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--gap-3)}',
      '.hpka{border-radius:var(--r-box);font-family:var(--sans);font-size:15px;font-weight:600;cursor:pointer;touch-action:manipulation}',
      '.hpka.dmg,.hpka.heal{height:56px}',
      '.hpka.set,.hpka.tmp{height:var(--tap);font-size:12.5px;font-weight:400}',
      '.hpka.dmg{border:1px solid rgba(var(--dis-rgb),.6);background:rgba(var(--dis-rgb),.16);color:rgb(var(--dis-rgb))}',
      '.hpka.heal{border:1px solid rgba(var(--heal-rgb),.6);background:rgba(var(--heal-rgb),.14);color:rgb(var(--heal-rgb))}',
      '.hpka.set{border:1px solid var(--edge);background:none;color:var(--ink)}',
      '.hpka.tmp{border:1px solid rgba(var(--temp-rgb),.45);background:none;color:rgb(var(--temp-rgb))}',
      '.hpka:disabled{opacity:.45;cursor:default}',
      '.dicebox{flex:0 1 auto;min-width:0;margin-left:auto;display:flex;flex-wrap:nowrap;justify-content:flex-end;align-items:stretch;gap:6px}',
      /* A hit die counter stands up, the die over its count, so the row of
         the armour class holds any number of them. */
      '.dicebox{gap:4px}',
      '.dicebox .dcount{flex-direction:column;justify-content:center;gap:1px;padding:4px 5px}',
      '.dicebox .dcount .dnum{align-items:center}',
      '.dicebox .dcount .dcur{text-align:center;font-size:13px}',
      '.dicebox .dcount .dico{width:18px;height:18px}',
      '.dicebox .dcount .dico svg{width:17px;height:17px}',
      /* Outside the edit mode the count is a reading, not a field: a tap on
         it goes to the counter. */
      '.dicebox .dcount .dcur[readonly]{pointer-events:none}',
      '.diceedit{flex:1 1 100%;min-width:0}',
      '.diceedit[hidden]{display:none}',
      '.die{width:30px;height:30px;padding:0;border:0;background:none;color:var(--arcane);cursor:pointer;display:flex;align-items:center;justify-content:center}',
      '.die svg{width:28px;height:28px;display:block}',
      '.die.spent{color:#6a6592}',
      '.die.spent svg polygon{stroke-dasharray:3 2.5}',
      '.dicebox .dnote,.diceedit .dnote{font-size:9.5px;color:#6f6a8d;letter-spacing:.04em}',
      /* A die counter wears the tile of the numbers beside it, AC, INIT and
         PROF, so the row reads as one row. */
      '.dcount{display:flex;align-items:center;gap:3px;padding:5px 6px 6px 4px;border:1px solid var(--edge);border-radius:8px;background:rgba(255,255,255,.03);color:var(--ink);cursor:pointer;}',
      '.dcount.empty{opacity:.45}',
      '.dcount .dico{width:20px;height:20px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:var(--arcane)}',
      '.dcount .dico svg{width:19px;height:19px;display:block}',
      '.dcount .dnum{display:flex;flex-direction:column;align-items:flex-start;line-height:1.1}',
      '.dcount .dof{font-size:9px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.dcount .dcur{width:1.5em;padding:0;border:0;background:none;color:var(--ink);font-family:var(--display);font-size:15px;line-height:1.1;font-variant-numeric:tabular-nums;text-align:left;outline:none;appearance:textfield;-moz-appearance:textfield}',
      '.dcount .dcur::-webkit-outer-spin-button,',
      '.dcount .dcur::-webkit-inner-spin-button{appearance:none;-webkit-appearance:none;margin:0}',
      '.dcount:active{border-color:rgba(var(--arcane-rgb),.6)}',
      '.dicegrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 10px;width:100%}',
      '.dicegrid .drow{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--muted)}',
      '.dicegrid .dico{width:20px;height:20px;display:flex;align-items:center;justify-content:center;color:var(--arcane)}',
      '.dicegrid .dico svg{width:18px;height:18px;display:block}',
      '.dicegrid .dty{min-width:2.1em;letter-spacing:.04em}',
      '.dicegrid .dval{font-family:var(--display);font-size:13px;color:var(--ink);min-width:1.3em;text-align:center}',
      '.abgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;flex:0 0 auto}',
      '.ab{display:flex;flex-direction:column;align-items:center;padding:4px 4px 2px;border:1px solid var(--edge);border-radius:8px;background:rgba(255,255,255,.03);}',
      '.ab .an{font-size:9px;line-height:1.15;letter-spacing:.16em;color:var(--muted)}',
      '.abrow{display:flex;align-items:baseline;justify-content:center;gap:4px;width:100%}',
      '.ab .cinput{text-align:center;font-size:20px;width:1.6em;flex:0 0 auto}',
      '.ab .am{flex:0 0 auto;min-width:1.7em;font-size:12px;color:var(--arcane);font-variant-numeric:tabular-nums}',
      '.ab .prow{flex:0 0 auto;padding:0 2px}',
      '.ab .prow .vl{min-width:1.9em;font-size:11px}',
      /* The skills stay alphabetical and the first column fills before the
         second, so the list reads down each column rather than across. */
      '.sgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:column;grid-template-rows:repeat(' + Math.ceil(SKILLS.length / 2) + ',auto);gap:1px 6px;flex:0 0 auto}',
      '.prow{display:flex;align-items:center;gap:5px;min-width:0;padding:1px 4px;border:1px solid transparent;border-radius:5px;}',
      '.prow .dot{width:6px;height:6px;flex:0 0 auto;border-radius:50%;border:1px solid #453f63}',
      '.prow.prof .dot{background:var(--gold);border-color:var(--gold);box-shadow:0 0 6px rgba(var(--gold-rgb),.45)}',
      '.prow.exp .dot{background:var(--gold);border-color:var(--gold);box-shadow:0 0 0 2px rgba(var(--gold-rgb),.4),0 0 8px rgba(var(--gold-rgb),.45)}',
      '.prow .nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#b9b3d6}',
      '.prow .nm.dim{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#6f6a8d}',
      '.prow .abk{flex:0 0 auto;font-size:8.5px;letter-spacing:.08em;color:#5c5778}',
      '.prow .vl{flex:0 0 auto;min-width:2.4em;text-align:right;font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--ink)}',
      '.prow.prof .vl{color:var(--gold)}',
      '.prow.exp .vl{color:#ffe0a0}',
      '.charbody.editing .prow{border-color:var(--edge);cursor:pointer}',
      '.charbody.editing .prow.prof{border-color:rgba(var(--gold-rgb),.35);background:rgba(var(--gold-rgb),.06)}',
      '.charbody.editing .prow.exp{border-color:rgba(var(--gold-rgb),.55);background:rgba(var(--gold-rgb),.12)}',
      '.pgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;flex:0 0 auto}',
      '.pgrid .note{grid-column:1/-1;margin:0}',
      '.pcard{display:flex;align-items:center;gap:4px;min-width:0;padding:5px 7px;border:1px solid var(--edge);border-radius:6px;background:rgba(255,255,255,.03);font-size:11px;color:#b9b3d6;}',
      '.pcard .plabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.pcard input.plabel{border:0;background:none;outline:none;padding:0;width:100%;font-family:var(--sans);font-size:11px;color:var(--ink)}',
      '.pcard .pdel{flex:0 0 auto;width:16px;height:16px;border:0;background:none;color:#d08a9c;font-size:14px;line-height:1;padding:0;cursor:pointer;display:none;align-items:center;justify-content:center}',
      '.charbody.editing .pcard .pdel{display:flex}',
      '.pcard.dragging{opacity:.95;border-color:var(--arcane);box-shadow:0 10px 24px rgba(0,0,0,.55)}',
      '.clsum{flex:1 1 auto;min-width:0;font-size:10.5px;line-height:1.3;color:var(--muted);letter-spacing:.01em}',
      '.clsum[hidden]{display:none}',
      '.clrow{display:flex;align-items:center;gap:6px}',
      '.clrow .t{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.clname{font:inherit;font-size:12px;color:var(--ink);background:none;border:none;padding:0;text-align:left;cursor:pointer}',
      '.clname:active{color:var(--arcane)}',
      '.clsub{font-size:10px;color:var(--muted);background:none;border:none;padding:0;text-align:left;cursor:pointer;align-self:flex-start}',
      '.clsub:active{color:var(--arcane)}',
      '.clrow .cdel{background:none;border:none;color:var(--muted);font:inherit;font-size:16px;line-height:1;padding:0 3px;cursor:pointer}',
      '.clrow .cdel:active{color:var(--gold)}',
      '.clvl{min-width:16px;text-align:center;font-variant-numeric:tabular-nums}',
      '.charstyle{display:none}',
      '.charbody.editing .charstyle{display:block}',
      '.charfoot{flex:0 0 auto;display:flex;flex-direction:column;gap:4px;padding-top:0}',
      '.charfoot .note{margin:0;min-height:13px}',
      '.charfoot .note:empty{display:none}',
      /* What a rest gave back, dressed as the notification the app already
         speaks in: the gold on the dark ground, the pill's border, two columns
         and the count in the display face. It arrives the way that line does
         and stands down for less motion. */
      '.charfoot .gains{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;padding:6px 12px 7px;border:1px solid rgba(var(--gold-rgb),.5);border-radius:14px;background:rgba(28,22,8,.95);color:var(--gold);font-size:10.5px;letter-spacing:.03em;text-align:center;animation:gainsIn .2s ease-out both}',
      '.charfoot .gains[hidden]{display:none}',
      '.charfoot .gain{display:flex;align-items:baseline;justify-content:center;gap:4px;min-width:0}',
      '.charfoot .gain b{flex:0 0 auto;font-family:var(--display);font-weight:700;font-size:13px;line-height:1.1;color:var(--gold);font-variant-numeric:tabular-nums}',
      '.charfoot .gain span{min-width:0;overflow-wrap:anywhere}',
      '@keyframes gainsIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion:reduce){.charfoot .gains{animation:none}}',
      '.charfoot .rests{display:flex;gap:6px}',
      '.rest{flex:1 1 0;min-height:var(--tap);display:flex;align-items:center;justify-content:center;gap:6px;padding:0 6px;border:1px solid var(--edge);border-radius:var(--r-control);background:rgba(255,255,255,.03);color:var(--muted);font-family:var(--sans);font-size:11.5px;letter-spacing:.06em;cursor:pointer;}',
      '.rest:active{border-color:rgba(var(--arcane-rgb),.5);color:var(--arcane);background:rgba(var(--arcane-rgb),.12)}',
      '.note{flex:0 0 auto;margin:0;font-size:10.5px;color:#7d7899}'
    ].join('\n'),
    html: [
      '<div class="charbody" id="charBody">',
      '  <div class="csname" id="charNameWrap">',
      '    <div class="clsum" id="charClassSum"></div>',
      '    <label class="cnlevel" for="charLevel">',
      '      <span class="ck">LV</span>',
      '      <input class="cinput" id="charLevel" type="number" inputmode="numeric" min="1" max="20" placeholder="1" aria-label="Character level">',
      '    </label>',
      '  </div>',
      '  <section class="hpcard" id="hpCard" aria-label="Hit points">',
      '    <button class="hpstep minus" id="charHpDown" type="button" aria-label="Lose a hit point">&minus;</button>',
      '    <div class="hpmid" id="charHpMid">',
      '      <span class="hptop">',
      '        <span class="ck">HP</span>',
      '        <button class="hpnow" id="charHpNow" type="button">--</button>',
      '        <span class="hpof">/</span>',
      '        <input class="cinput hpmax" id="charHpMax" type="text" inputmode="numeric" enterkeyhint="go" autocomplete="off" placeholder="--" aria-label="Maximum hit points">',
      '        <span class="hptemp" id="charHpTemp" hidden></span>',
      '      </span>',
      '      <span class="hpbar" aria-hidden="true"><i class="hpfill" id="charHpFill"></i><i class="hptempfill" id="charHpTempFill"></i></span>',
      '    </div>',
      '    <button class="hpstep plus" id="charHpUp" type="button" aria-label="Gain a hit point">+</button>',
      '  </section>',
      '  <div class="ctop">',
      '    <label class="ctile" for="charAc">',
      '      <span class="ck">AC</span>',
      '      <input class="cinput" id="charAc" type="number" inputmode="numeric" min="0" max="40" placeholder="--" aria-label="Armor class">',
      '    </label>',
      '    <label class="ctile" for="charInit">',
      '      <span class="ck">INIT</span>',
      '      <input class="cinput" id="charInit" type="number" inputmode="numeric" min="-9" max="20" placeholder="0" aria-label="Initiative modifier">',
      '    </label>',
      '    <label class="ctile" for="charSpeed">',
      '      <span class="ck">SPEED</span>',
      '      <input class="cinput" id="charSpeed" type="number" inputmode="numeric" min="0" max="200" step="5" placeholder="30" aria-label="Speed in feet">',
      '    </label>',
      '    <div class="ctile">',
      '      <span class="ck">PROF</span>',
      '      <span class="cnum" id="charProf">+0</span>',
      '    </div>',
      '    <div class="dicebox" id="diceBox"></div>',
      '    <div class="diceedit" id="diceEdit"></div>',
      '  </div>',
      '  <div class="cshead"><span>Abilities</span><span class="rule"></span></div>',
      '  <div class="abgrid" id="charAbilities"></div>',
      '  <div class="cshead"><span>Skills</span><span class="rule"></span></div>',
      '  <div class="sgrid" id="charSkills"></div>',
      '  <div class="cshead"><span>Proficiencies</span><span class="rule"></span>' +
        '<button class="mini" id="addProf" type="button" aria-label="Add a proficiency" hidden>+</button></div>',
      '  <div class="pgrid" id="charProfs"></div>',
      '  <div class="charstyle" id="charStyle">',
      '    <div class="cshead"><span>Classes</span><span class="rule"></span><button class="mini" id="addClass" type="button" aria-label="Add a class">+</button></div>',
      '    <div class="fcards" id="charClasses"></div>',
      '  </div>',
      '</div>',
      '<div class="charfoot">',
      '  <p class="note" id="charNote"></p>',
      '  <div class="gains" id="charGains" hidden></div>',
      '  <div class="rests">',
      '    <button class="rest" id="restShort" type="button">' + C.chrome.restIcon('short') + 'Short rest</button>',
      '    <button class="rest" id="restLong" type="button">' + C.chrome.restIcon('long') + 'Long rest</button>',
      '  </div>',
      '</div>'
    ].join('\n'),

    seed: seed,

    mount: function (root, a) {
    a.core.library.data('classes');
      api = a;
      CH = a.character().char;
      E = {
        charBody: root.querySelector('#charBody'),
        charAc: root.querySelector('#charAc'),
        hpCard: root.querySelector('#hpCard'),
        charHpMid: root.querySelector('#charHpMid'),
        charHpTemp: root.querySelector('#charHpTemp'),
        charHpFill: root.querySelector('#charHpFill'),
        charHpTempFill: root.querySelector('#charHpTempFill'),
        charInit: root.querySelector('#charInit'),
        charLevel: root.querySelector('#charLevel'),
        charLevelBox: root.querySelector('.cnlevel'),
        charHpNow: root.querySelector('#charHpNow'),
        charHpMax: root.querySelector('#charHpMax'),
        charHpDown: root.querySelector('#charHpDown'),
        charHpUp: root.querySelector('#charHpUp'),
        diceBox: root.querySelector('#diceBox'),
        diceEdit: root.querySelector('#diceEdit'),
        charAbilities: root.querySelector('#charAbilities'),
        charProf: root.querySelector('#charProf'),
        charSpeed: root.querySelector('#charSpeed'),
        charSkills: root.querySelector('#charSkills'),
        charProfs: root.querySelector('#charProfs'),
        addProf: root.querySelector('#addProf'),
        charClassSum: root.querySelector('#charClassSum'),
        charClasses: root.querySelector('#charClasses'),
        addClass: root.querySelector('#addClass'),

        charNote: root.querySelector('#charNote'),
        charGains: root.querySelector('#charGains'),
        restShort: root.querySelector('#restShort'),
        restLong: root.querySelector('#restLong')
      };

      buildChar();

      /* The classes are set in the section the wrench opens. */
      E.charClasses.addEventListener('click', function (ev) {
        var row = ev.target.closest('.clrow');
        if (!row) return;
        var ix = Number(row.dataset.ix);
        var pick = ev.target.closest('[data-pick]');
        if (pick) {
          if (pick.dataset.pick === 'name') {
            openClassPicker(ix, function (name) {
              classes()[ix].name = name;
              classes()[ix].subclass = '';
              syncLevel();
              commitChar();
            });
          } else {
            openSubclassPicker(ix);
          }
          return;
        }
        if (ev.target.closest('[data-del]')) {
          classes().splice(ix, 1);
          syncLevel();
          commitChar();
          return;
        }
        var step = ev.target.closest('[data-lv]');
        if (step) {
          var k = classes()[ix];
          k.level = Math.max(0, Math.min(20, k.level + (step.dataset.lv === '+' ? 1 : -1)));
          syncLevel();
          commitChar();
        }
      });

      E.addClass.addEventListener('click', function () {
        openClassPicker(-1, function (name) {
          classes().push({ name: name, level: 1, subclass: '' });
          syncLevel();
          commitChar();
        });
      });

      E.charAc.addEventListener('input', function () {
        var v = E.charAc.value.trim();
        CH.ac = v === '' ? null : Number(v);
        commitChar();
      });

      E.charInit.addEventListener('input', function () {
        var v = E.charInit.value.trim();
        /* What is typed is the total the player sees: the effects (Alert)
           are taken out of what is kept, so they are not counted twice. */
        var effects = SR.initMod({ init: 0, initTouched: true }, api.character());
        CH.init = (v === '' ? 0 : Number(v)) - effects;
        CH.initTouched = true;
        commitChar();
      });

      E.charSpeed.addEventListener('input', function () {
        var v = Number(E.charSpeed.value.trim());
        if (!isFinite(v) || v < 0) return;
        /* What is typed is the total seen: the effects come out of what is kept. */
        CH.speed = v - (SR.speedOf(api.character()) - (Number(CH.speed) || 30));
        commitChar();
      });

      E.charLevel.addEventListener('input', function () {
        var v = Number(E.charLevel.value);
        CH.level = Math.max(1, Math.min(20, isFinite(v) && v ? v : 1));
        commitChar();
      });

      E.charAbilities.addEventListener('input', function (ev) {
        var input = ev.target.closest('[data-ab]');
        if (!input) return;
        var v = input.value.trim();
        CH.abilities[input.dataset.ab] = v === '' ? 10 : Math.max(0, Math.min(30, Number(v) || 0));
        commitChar();
      });

      /* A tap on the hit points opens the keypad. The maximum is a field of
         the edit mode, so outside it the tap on the number goes to the card. */
      E.charHpMid.addEventListener('click', function (ev) {
        if (ev.target === E.charHpMax && !E.charHpMax.disabled) return;
        openHpKeys();
      });

      E.charHpMax.addEventListener('focus', function () {
        E.charHpMax.value = '';
        E.charHpMax.placeholder = String(CH.hp.max);
      });

      E.charHpMax.addEventListener('input', function () {
        var v = E.charHpMax.value.trim();
        /* A maximum is a number and not a move: a signed entry is left to
           the current hit points, where the arithmetic means something. */
        if (!/^[0-9]+$/.test(v)) return;
        /* A maximum typed by hand is the player's: the automatic one stops
           for this character until the settings turn it on again. */
        if (!CH.hpManual) { CH.hpManual = true; api.toast('Max hit points set by hand. Settings turns Auto back on'); }
        var max = Math.max(0, Number(v) || 0);
        CH.hp.max = max;
        if (max > 0 && CH.hp.current > max) CH.hp.current = max;
        commitChar();
      });

      E.charHpMax.addEventListener('blur', function () {
        E.charHpMax.placeholder = '--';
        E.charHpMax.value = CH.hp.max ? String(CH.hp.max) : '';
      });

      /* A maximum opens the same keypad, so its return key accepts it too. */
      E.charHpMax.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        commitChar();
        E.charHpMax.blur();
      });

      E.charHpUp.addEventListener('click', function () {
        setHp(SR.hpApply(CH.hp.current, CH.hp.max, 1));
      });

      E.charHpDown.addEventListener('click', function () {
        setHp(SR.hpApply(CH.hp.current, CH.hp.max, -1));
      });

      E.diceBox.addEventListener('click', function (ev) {
        var pick = ev.target.closest('[data-type][data-sign]');
        if (pick) {
          var type = Number(pick.dataset.type);
          var add = pick.dataset.sign === '+';
          var dice = CH.dice || (CH.dice = []);
          if (add) {
            dice.push({ type: type, spent: false });
          } else {
            for (var i = dice.length - 1; i >= 0; i--) {
              if (dice[i].type === type) { dice.splice(i, 1); break; }
            }
          }
          C.rest.push(api.character());
          commitChar();
          return;
        }
        /* A tap on a counter spends one of its dice. Outside the edit mode
           the count only goes down, and the edit mode sets it back. */
        if (api.editing('character')) return;
        var chip = ev.target.closest('.dcount[data-type]');
        if (!chip) return;
        var chipType = Number(chip.dataset.type);
        var list = CH.dice || (CH.dice = []);
        for (var j = 0; j < list.length; j++) {
          if (list[j].type !== chipType || list[j].spent) continue;
          C.rest.push(api.character());
          list[j].spent = true;
          commitChar();
          return;
        }
      });

      /* The edit mode sets what is left of each kind of die, which is the
         only way the count goes back up. */
      E.diceBox.addEventListener('input', function (ev) {
        var field = ev.target.closest ? ev.target.closest('[data-cur]') : null;
        if (!field) return;
        var curType = Number(field.dataset.cur);
        var want = Math.max(0, Math.floor(Number(field.value) || 0));
        var dice = CH.dice || (CH.dice = []);
        var seen = 0;
        var moved = false;
        dice.forEach(function (d) {
          if (d.type !== curType) return;
          seen += 1;
          var spent = seen > want;
          if (d.spent !== spent) moved = true;
          d.spent = spent;
        });
        if (!moved) return;
        C.rest.push(api.character());
        commitChar();
      });

      E.addProf.addEventListener('click', function () {
        profSeq += 1;
        profs().push({ id: 'p' + Date.now().toString(36) + '-' + profSeq, label: '' });
        commitChar();
      });

      E.charProfs.addEventListener('input', function (ev) {
        var field = ev.target.closest ? ev.target.closest('input.plabel') : null;
        if (!field) return;
        var id = field.dataset.id;
        profs().forEach(function (p) { if (p.id === id) p.label = field.value; });
        commitChar();
      });

      E.charProfs.addEventListener('click', function (ev) {
        var del = ev.target.closest('[data-del]');
        if (!del) return;
        var delId = del.dataset.del;
        api.character().char.profs = profs().filter(function (p) { return p.id !== delId; });
        commitChar();
      });

      /* A card is held and dragged to reorder it. The grid places by the
         nearest centre, so the last place is reachable. */
      D.list(E.charProfs, {
        row: '.pcard',
        key: 'id',
        ignore: 'button',
        layout: 'grid',
        onOrder: saveProfOrder
      });

      /* The proficiencies only move in the edit mode, so a stray tap at the
         table never changes a modifier. */
      E.charBody.addEventListener('click', function (ev) {
        if (!api.editing('character')) return;
        var row = ev.target.closest('.prow');
        if (!row) return;
        if (row.dataset.kind === 'save') CH.saves[row.dataset.key] = SR.nextProf(CH.saves[row.dataset.key]);
        else if (row.dataset.kind === 'skill') CH.skills[row.dataset.key] = SR.nextProf(CH.skills[row.dataset.key]);
        else return;
        commitChar();
      });

      E.restShort.addEventListener('click', function () { doRest('short'); });
      E.restLong.addEventListener('click', function () { doRest('long'); });
    },

    /* The wrench edits the proficiencies, and the shell keeps the flag and
       the pressed state. */
    head: function (root, a) {
      api = a;
      CH = a.character().char;
      root.appendChild(a.wrench({ label: 'Edit the proficiencies' }));
    },

    render: function (a) {
      api = a;
      CH = a.character().char;
      renderChar();
    }
  });
})();
