/* The volley page: the spell slider, the toggles, the beams and the tally. */
(function () {
  'use strict';

  var C = Sheet.core;
  var R = C.R;

  var api = null;   /* the shell gives it at mount */
  var E = {};       /* the elements of the page */
  var S = {};       /* the state of the page */

  /* The six toggles, in a grid of three by two that never reflows: Elem
     carries its dice as a pill while it is on, and Quicken stays in its cell
     off Eldritch Blast, greyed, so nothing moves under the thumb. */
  var CHIPS = [
    { key: 'advantage', label: 'Adv',      rgb: '154,209,255', icon: 'M12 20V5M6 11l6-6 6 6' },
    { key: 'hex',       label: 'Hex',      rgb: '122,216,111', icon: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z' },
    { key: 'curse',     label: 'Curse',    rgb: '255,111,168', icon: 'M12 3l7.8 13.5H4.2zM12 21 4.2 7.5h15.6z' },
    { key: 'elem',      label: 'Elem',     rgb: '255,212,71',  icon: 'M13 2 4 14h7l-1 8 9-12h-7z',
      pill: { key: 'elemPlus', label: '2d', aria: 'Elem dice, two or three' } },
    { key: 'quicken',   label: 'Quicken',  rgb: '92,214,220',  icon: 'M5 6l6 6-6 6M12 6l6 6-6 6', only: 'eb' },
    { key: 'autocrit',  label: 'Crit',     rgb: '255,196,77',  icon: 'M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M4.9 19.1l3.5-3.5M15.6 8.4l3.5-3.5' }
  ];

  var TYPE_RGB = {
    force: '110,155,255',
    fire: '255,132,70',
    lightning: '255,212,71',
    necrotic: '122,216,111'
  };

  /* The two casts of the turn, each rolled by its own tap and kept when
     the other changes: the quickened cast is a second cast, not a re-roll. */
  var rolled = { first: null, quick: null };
  var over = { first: {}, quick: {} };   /* the beams a tap has flipped */
  var seen = null;          /* the character the rolls belong to */
  var ATK = R.ATTACK_MOD;   /* the attack bonus of the caster */
  var FLAT = 0;             /* the modifier that rides on the damage */

  function commit() { api.save(); api.refresh(); }

  /* The state of the caster, with the numbers of the character sheet in
     it: the attack bonus and the modifier the damage carries. */
  function casting() {
    var st = Object.assign({}, S);
    var ch = api.character().char;
    if (ch && ch.abilities) {
      st.attackMod = C.SR.spellAttack(ch);
      st.flatMod = C.SR.abilityMod(ch.abilities.cha);
    }
    return st;
  }

  /* Rolls one cast and keeps it: the other cast, already rolled, is not
     touched. */
  function castOnce(part) {
    var result = R.rollVolley(casting(), undefined, part);
    rolled[part] = result;
    over[part] = {};   /* a new roll is a new truth */
    renderBoard(part);
    renderTally();
    var anyCrit = result.beams.some(function (b) { return b.crit; });
    if (navigator.vibrate) navigator.vibrate(anyCrit ? [14, 45, 18] : 16);
  }

  function setState(patch) {
    var keys = Object.keys(patch);
    /* The quicken is the one toggle that does not change a die: it adds a
       second cast beside the first, so the roll that is already there stays
       and only folds to make room. */
    /* The quicken adds a second cast and the crit changes only what comes
       next: neither touches the roll already on the board. */
    var keepRolled = keys.length === 1 && (keys[0] === 'quicken' || keys[0] === 'autocrit');
    keys.forEach(function (k) { S[k] = patch[k]; });
    if (!S.elem) S.elemPlus = false;
    if (S.power !== 'eb') S.quicken = false;
    if (!keepRolled) { rolled.first = null; rolled.quick = null; }
    commit();
  }


  /* ---- the board ---- */

  function previewGroups() {
    var power = R.powerOf(S.power);
    var groups = [];
    power.dice.forEach(function (d) { groups.push({ label: d.n + 'd' + d.s, type: d.type }); });
    if (S.hex) groups.push({ label: '1d6', type: 'necrotic' });
    if (S.elem) groups.push({ label: S.elemPlus ? '3d8' : '2d8', type: 'lightning' });
    return groups;
  }

  /* The kinds a damage names, once each, in the order the groups came. */
  function kindsOf(groups) {
    var types = [];
    groups.forEach(function (g) { if (types.indexOf(g.type) === -1) types.push(g.type); });
    return types;
  }

  /* A column of the board, drawn by the stacked box: the page says what to
     draw, which is the damage of the beam or the preview of the next one, and
     the block says how it looks. A miss keeps the attack roll and loses the
     damage, and the cell's outline says which it is. */
  function cellHtml(beam, miss) {
    var power = R.powerOf(S.power);
    if (!beam) return C.verticalAttackBox.cell({ bare: true });
    var groups = beam ? beam.groups : previewGroups();
    return C.verticalAttackBox.cell({
      groups: groups,
      types: kindsOf(groups),
      bonus: ATK,
      flat: beam ? beam.flat : FLAT + (S.curse ? 4 : 0),
      flatType: R.primaryType(power),
      res: beam ? { rolls: beam.rolls, kept: beam.kept, total: beam.total, damage: beam.damage } : null,
      miss: !!miss
    });
  }

  /* The shape of the board: the cells of the two rows and the line between
     them, built once and kept. A cast only writes the row it rolled, so the
     other one is never touched and never redraws. */
  var board = { key: '', cells: { first: [], quick: [] }, shown: { first: null, quick: null } };

  function boardKey() {
    var power = R.powerOf(S.power);
    return power.id + '|' + (R.quickened(S) ? 'quick' : 'plain');
  }

  function makeCells(count, part, startAt) {
    var out = [];
    for (var k = 0; k < count; k++) {
      var cell = document.createElement('article');
      cell.className = 'vcell ' + part + (part === 'quick' ? ' vquick' : '');
      cell.style.animation = 'none';
      cell.style.setProperty('--i', String(startAt + k));
      cell.innerHTML = cellHtml(null);
      E.grid.appendChild(cell);
      out.push(cell);
    }
    return out;
  }

  function buildBoard() {
    var power = R.powerOf(S.power);
    var n = power.attacks;
    var quick = R.quickened(S);
    E.grid.style.setProperty('--cols', n === 4 ? '2' : '3');
    E.grid.classList.toggle('vquick', quick);
    E.grid.innerHTML = '';
    board.key = boardKey();
    board.shown = { first: null, quick: null };
    board.cells = { first: makeCells(n, 'first', 0), quick: [] };
    if (quick) {
      var sep = document.createElement('div');
      sep.className = 'vrowsep';
      sep.innerHTML = '<span>Quickened</span>';
      E.grid.appendChild(sep);
      board.cells.quick = makeCells(R.QUICKEN_ATTACKS, 'quick', n);
    }
  }

  /* One row, written from the cast it holds. A row whose cast has not
     changed is left alone. */
  function paintRow(part, animate, force) {
    var roll = rolled[part];
    if (!force && !animate && board.shown[part] === roll) return;
    var list = board.cells[part] || [];
    for (var k = 0; k < list.length; k++) {
      var cell = list[k];
      var beam = roll ? roll.beams[k] : null;
      var preview = beam ? beam.groups : previewGroups();
      cell.style.setProperty('--beam', TYPE_RGB[preview[0] ? preview[0].type : 'force'] || '155,123,255');
      cell.classList.remove('vcrit', 'vmiss', 'vghost');
      var st = 'hit';
      if (beam) {
        st = C.horizontalAttackBox.state({ rolls: beam.rolls, roll: beam.kept, total: beam.total, damage: beam.damage, crit: beam.crit },
          null, over[part][k]);
        if (st === 'crit') cell.classList.add('vcrit');
        if (st === 'miss') cell.classList.add('vmiss');
      } else {
        cell.classList.add('vghost');
      }
      cell.innerHTML = cellHtml(beam, st === 'miss');
      if (animate) {
        cell.style.animation = 'none';
        void cell.offsetWidth;      /* the rise runs again for the row that rolled */
        cell.style.animation = '';
      }
    }
    board.shown[part] = roll;
  }

  /* The cell a node sits in, and the part it belongs to. */
  function cellAt(node) {
    var parts = ['first', 'quick'], p, k;
    for (p = 0; p < parts.length; p++) {
      var list = board.cells[parts[p]] || [];
      for (k = 0; k < list.length; k++) if (list[k] === node) return { part: parts[p], k: k };
    }
    return null;
  }

  function renderBoard(animatePart) {
    if (board.key !== boardKey()) buildBoard();
    paintRow('first', animatePart === 'first');
    paintRow('quick', animatePart === 'quick');
  }

  /* The tally: each cast on its own, the total of the turn after the equals
     sign, then the kinds. A cast that has not been rolled is a dash. */
  function renderTally() {
    var quick = R.quickened(S);
    /* The tally counts the beams as they stand, the ones a tap flipped
       included, so the total of the turn answers every tap. */
    var a = rolled.first ? R.tally(rolled.first, null, over.first) : null;
    var b = quick && rolled.quick ? R.tally(rolled.quick, null, over.quick) : null;
    if (!a && !b) {
      /* Before a cast the board says once what every beam will roll: the
         bonus to hit, then the dice and the flat of the damage. */
      var power = R.powerOf(S.power);
      var groups = previewGroups();
      E.tally.innerHTML = '<div class="vtline vpreview">' +
        C.verticalAttackBox.preview(groups, R.primaryType(power), FLAT + (S.curse ? 4 : 0), ATK) +
        '</div><div class="vtline vtypes">' +
        kindsOf(groups).map(function (t) { return '<em class="' + t + '">' + t + '</em>'; }).join('') +
        '</div>';
      return;
    }
    var hits = (a ? a.hits : 0) + (b ? b.hits : 0);
    var crits = (a ? a.crits : 0) + (b ? b.crits : 0);
    var total = (a ? a.total : 0) + (b ? b.total : 0);
    var byType = {}, order = [];
    [a, b].forEach(function (t) {
      if (!t) return;
      t.order.forEach(function (type) {
        if (order.indexOf(type) < 0) order.push(type);
        byType[type] = (byType[type] || 0) + t.byType[type];
      });
    });

    var out = '<div class="vtline">';
    if (quick) {
      out += '<span class="vsub">' + (a ? a.total : '&ndash;') + '</span>' +
        '<span class="vop">+</span>' +
        '<span class="vsub">' + (b ? b.total : '&ndash;') + '</span>' +
        '<span class="vop">=</span>';
    }
    out += '<span class="vbig">' + total + '</span><span class="vunit">damage</span>';
    /* The hits are counted once a beam was tapped to a miss, the one way the
       board learns of one: the target's armour class is the table's. */
    var beams = (a ? rolled.first.beams.length : 0) + (b ? rolled.quick.beams.length : 0);
    if (hits < beams || crits) {
      out += '<span class="vextra">' + hits + ' hit' + (hits === 1 ? '' : 's');
      if (crits) out += ' &middot; ' + crits + ' crit' + (crits === 1 ? '' : 's');
      out += '</span>';
    }
    out += '</div>';
    /* the flat bonus sits in its own type, so the tally shows it there */
    out += '<div class="vtline vtypes">';
    order.forEach(function (type) {
      out += '<em class="' + type + '">' + byType[type] + ' ' + type + '</em>';
    });
    out += '</div>';
    E.tally.innerHTML = out;
  }

  /* ---- the page ---- */

  Sheet.page({
    id: 'volley',
    glyph: 'M13 2 4 14h7l-1 8 9-12h-7z',
    title: 'Volley',
    order: 1,
    blurb: 'The spell slider, the toggles and the beams.',
    on: true,
  css: [
    '.vslider{flex:0 0 auto}',
    '.vslider input[type=range]{-webkit-appearance:none;appearance:none;display:block;width:100%;height:28px;margin:0;padding:0;background:transparent}',
    '.vslider input[type=range]:focus-visible{outline:2px solid var(--arcane);outline-offset:3px;border-radius:6px}',
    '.vslider input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(90deg,var(--arcane) 0 var(--fill,0%),rgba(255,255,255,.13) var(--fill,0%) 100%)}',
    '.vslider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;margin-top:-11px;border-radius:50%;border:1px solid rgba(255,255,255,.42);background:radial-gradient(circle at 34% 28%,#dccaff,#8a68f5 58%,#5a3fd2);box-shadow:0 3px 10px rgba(0,0,0,.6)}',
    '.vslider input[type=range]::-moz-range-track{height:4px;border-radius:2px;background:rgba(255,255,255,.13)}',
    '.vslider input[type=range]::-moz-range-progress{height:4px;border-radius:2px;background:var(--arcane)}',
    '.vslider input[type=range]::-moz-range-thumb{width:24px;height:24px;border-radius:50%;border:1px solid rgba(255,255,255,.42);background:#8a68f5;box-shadow:0 3px 10px rgba(0,0,0,.6)}',
    '.vstops{position:relative;height:15px}',
    '.vstop{position:absolute;top:0;transform:translateX(-50%);padding:1px 2px;border:0;background:none;color:#615c7d;font-family:var(--sans);font-size:10px;letter-spacing:.06em;cursor:pointer;white-space:nowrap}',
    '.vstop.on{color:var(--arcane);font-weight:600}',
    '.vstop:focus-visible{outline:2px solid var(--arcane);outline-offset:1px;border-radius:3px}',
    '.vchips{flex:0 0 auto;min-width:0}',
    '.vboard{touch-action:pan-y;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;scrollbar-width:none}',
    '.vboard::-webkit-scrollbar{width:0;height:0}',
    '.vgrid{flex:1 1 auto;display:grid;grid-template-columns:repeat(var(--cols,3),minmax(0,1fr));gap:6px;align-content:stretch}',
    '.vgrid.vquick{grid-template-rows:1fr auto 1fr}',

    '.vrowsep{grid-column:1 / -1;display:flex;align-items:center;gap:8px;padding:1px 0;color:var(--muted);font-size:8.5px;letter-spacing:.18em;text-transform:uppercase}',
    '.vrowsep::before,.vrowsep::after{content:\'\';flex:1 1 auto;height:1px;background:var(--edge)}',

    /* the beam: everything in it is centred */
    '.vcell{display:flex;flex-direction:column;align-items:center;gap:4px;padding:7px 5px 8px;border:1px solid var(--edge);border-radius:5px;background:radial-gradient(120% 55% at 50% 54%,rgba(var(--beam,var(--arcane-rgb)),.22),transparent 72%),linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012));min-width:0;animation:vrise .22s ease-out both;animation-delay:calc(var(--i,0) * 45ms)}',
    '@keyframes vrise{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}',
    '.vcell.vquick{border-color:rgba(92,214,220,.30)}',
    /* the outcome of a beam is its outline: gold for a crit, rose for a miss, the plain edge for a hit */
    '.vcell.vcrit{border-color:rgba(var(--gold-rgb),.7);box-shadow:0 0 0 1px rgba(var(--gold-rgb),.2),0 8px 22px rgba(var(--gold-rgb),.14)}',
    '.vcell.vmiss{border-color:rgba(208,138,156,.66);box-shadow:0 0 0 1px rgba(208,138,156,.12)}',
    '.vcell.vghost{opacity:.55;animation:none}',

    /* the tally of all the rays: the total, then the kinds */
    '.vtally{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:1px;min-height:22px;font-size:10.5px;color:var(--muted)}',
    '.vtline{display:flex;align-items:baseline;gap:6px;justify-content:center}',
    '.vbig{font-family:var(--display);font-weight:700;font-size:20px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}',
    '.vunit{color:var(--muted)}',
    '.vextra{color:#7d7899}',
    '.vtypes{gap:8px}',
    '.vsub{font-family:var(--display);font-weight:700;font-size:16px;line-height:1;color:#9a93bd;font-variant-numeric:tabular-nums}',
    '.vop{color:#615c7d;font-size:11px}',
    '.vtypes em{font-style:normal}',
    '.vnote{color:#615c7d}',

    '@media (prefers-reduced-motion:reduce){.vcell{animation:none}}'
  ].join('\n'),

    html: [
      '<div class="vslider">',
      '  <input id="power" type="range" min="0" max="4" step="1" value="0" aria-label="Spell power">',
      '  <div class="vstops" id="stops"></div>',
      '</div>',
      '<div class="vchips" id="chips" data-bar></div>',
      '<div class="vboard" id="board">',
      '  <div class="vgrid" id="grid"></div>',
      '</div>',
      '<div class="vtally" id="tally"></div>',
      /* The cast block, in the shared look, last in the page: the one place
         the app puts it. */
      C.cast.row({ buttons: [
        { id: 'cast', label: 'Cast' },
        { id: 'castQuick', label: 'Quicken', quick: true, hidden: true }
      ] })
    ].join('\n'),

    seed: function (saved, fresh) {
      var s = {
        power: 'eb', advantage: false, hex: false, curse: false,
        elem: false, elemPlus: false, quicken: false, autocrit: false
      };
      if (saved && typeof saved === 'object') {
        Object.keys(s).forEach(function (k) {
          if (saved[k] !== undefined && saved[k] !== null) s[k] = saved[k];
        });
      }
      if (!R.powerOf || s.power !== R.powerOf(s.power).id) s.power = 'eb';
      if (!s.elem) s.elemPlus = false;
      if (s.power !== 'eb') s.quicken = false;
      return s;
    },

    mount: function (root, a) {
      api = a;
      S = a.character().volley;
      E = {
        power: root.querySelector('#power'),
        stops: root.querySelector('#stops'),
        chips: root.querySelector('#chips'),
        grid: root.querySelector('#grid'),
        tally: root.querySelector('#tally'),
        cast: root.querySelector('#cast'),
        castQuick: root.querySelector('#castQuick')
      };

      E.power.addEventListener('input', function () {
        var p = R.POWERS[Number(E.power.value)];
        setState({ power: p.id });
      });

      R.POWERS.forEach(function (p, i) {
        var stop = document.createElement('button');
        stop.type = 'button';
        stop.className = 'vstop';
        stop.textContent = p.short;
        stop.style.left = 'calc(13px + (100% - 26px) * ' + (i / (R.POWERS.length - 1)) + ')';
        stop.addEventListener('click', function () {
          E.power.value = String(i);
          setState({ power: p.id });
        });
        E.stops.appendChild(stop);
      });

      /* The toggles are the one chip block: the shell draws them and shapes
         the row, the page says what a tap means, and one tap turns one on or
         off. */
      C.toggle.fill(E.chips, CHIPS, { cols: 3 });
      E.chips.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('.vchip') : null;
        if (!b || b.disabled) return;
        var key = b.dataset.key;
        var patch = {};
        patch[key] = !S[key];
        if (key === 'elem' && !patch.elem) patch.elemPlus = false;
        setState(patch);
      });

      /* A tap on a beam flips its hit for this roll alone: the cell says what
         the beam is, and the tally of the turn follows it. The next roll
         clears the flip. */
      E.grid.addEventListener('click', function (ev) {
        var cell = ev.target.closest ? ev.target.closest('.vcell') : null;
        if (!cell) return;
        var at = cellAt(cell);
        if (!at || !rolled[at.part]) return;
        over[at.part][at.k] = !over[at.part][at.k];
        paintRow(at.part, false, true);
        renderTally();
      });

      /* One tap per cast: the spell, and the quickened cast beside it. */
      E.cast.addEventListener('click', function () { castOnce('first'); });
      E.castQuick.addEventListener('click', function () { castOnce('quick'); });
    },

    render: function (a) {
      api = a;
      /* A roll belongs to the character that rolled it, so a character that
         comes in with its own sheet starts the board empty. */
      if (seen !== a.character()) {
        seen = a.character();
        rolled = { first: null, quick: null };
        board.key = '';
      }
      S = a.character().volley;
      var st = casting();
      ATK = R.attackMod(st);
      FLAT = R.flatMod(st, R.powerOf(S.power));
      var power = R.powerOf(S.power);

      E.power.value = String(R.POWERS.indexOf(power));
      var span = Number(E.power.max) - Number(E.power.min);
      E.power.style.setProperty('--fill', (span ? (Number(E.power.value) - Number(E.power.min)) / span * 100 : 0) + '%');

      Array.prototype.forEach.call(E.stops.children, function (s, i) {
        s.classList.toggle('on', R.POWERS[i].id === power.id);
      });

      CHIPS.forEach(function (chip) {
        var b = E.chips.querySelector('.vchip[data-key="' + chip.key + '"]');
        if (!b) return;
        b.setAttribute('aria-pressed', S[chip.key] ? 'true' : 'false');
        if (chip.only) b.disabled = S.power !== chip.only;
        if (chip.pill) {
          var pill = E.chips.querySelector('.vchip[data-key="' + chip.pill.key + '"]');
          pill.hidden = !S[chip.key];
          pill.textContent = S[chip.pill.key] ? '3d' : '2d';
          pill.setAttribute('aria-pressed', S[chip.pill.key] ? 'true' : 'false');
        }
      });

      E.castQuick.hidden = !R.quickened(S);
      renderBoard(null);
      renderTally();
    }
  });
})();
