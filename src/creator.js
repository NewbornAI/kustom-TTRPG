/* The creator: a character from a class, built on one screen that updates as
   it is touched, instead of a step after a step.

   The top bar holds the level, the choices made so far as cards (a tap on one
   goes back to it) and the way out. Under it, one tab per choice: the class,
   the archetype (only from level 3), the species, the abilities, the
   background. A card opens the book's description of what it is; its Select
   button chooses it, and the body moves on to the next choice. Nothing is
   asked twice and nothing is required: what is left alone stays at its
   default, and Create makes the character from what is there.

   The module draws and keeps the choices. What a class is, how a skeleton is
   built and how an origin is checked and written stay with the shell and the
   origin module, which the creator is handed. */
(function (root) {
  'use strict';

  root.SheetCreator = function (deps) {
    var core = deps.core;
    var esc = deps.esc;

    var ABS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    var NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
    var TABS = [
      { id: 'class', label: 'Class' },
      { id: 'sub', label: 'Archetype' },
      { id: 'species', label: 'Species' },
      { id: 'abilities', label: 'Abilities' },
      { id: 'background', label: 'Background' },
      { id: 'skills', label: 'Proficiencies' },
      { id: 'theme', label: 'Theme' }
    ];
    var ICON_BACK = 'M15 5l-7 7 7 7';
    var ICON_SKIP = 'M5 5l8 7-8 7zM13 5l8 7-8 7z';
    var ICON_CHECK = 'M5 12.5l4.5 4.5L19 7';

    var layer = null;       /* the screen, made once */
    var st = null;          /* the choices of this creation */
    var E = {};

    function fresh() {
      return {
        name: '', level: 1, cls: '', sub: '', species: '', choice: '',
        tab: 'class', detail: null,
        method: 'pointbuy', scores: pointBase(), seen: false,
        bgMode: 'two', inc: {},
        feat: '', skills: [], tool: '', featText: '',
        classSkills: [], skillSrc: 'class',
        theme: '', icon: '', lore: ''
      };
    }

    function rules() { return core.library.rules || {}; }
    function pointBase() { return { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }; }
    function arrayBase() {
      var arr = rules().standardArray || [15, 14, 13, 12, 10, 8];
      return { str: arr[0], dex: arr[1], con: arr[2], int: arr[3], wis: arr[4], cha: arr[5] };
    }
    function icon(d, cls) {
      return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    function mod(v) { var m = Math.floor((v - 10) / 2); return (m >= 0 ? '+' : '−') + Math.abs(m); }

    function classes() { return deps.classes(); }
    function classNamed(n) { return classes().filter(function (c) { return c.name === n; })[0] || null; }
    function subOf(cls, n) { return ((cls && cls.subclasses) || []).filter(function (s) { return s.name === n; })[0] || null; }
    function speciesList() { return core.library.species || []; }
    function speciesNamed(n) { return core.origin.speciesOf(n); }
    function choiceTrait(sp) { return sp && sp.traits.filter(function (t) { return t.choice; })[0] || null; }
    function showsSub() { return st.level >= 3 && !!st.cls; }

    /* ---- the shape of the screen ---- */

    function build() {
      var el = document.createElement('div');
      el.className = 'creator';
      el.hidden = true;
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Create a character');
      el.innerHTML =
        '<div class="crbar">' +
          '<button type="button" class="cricon" data-do="close" aria-label="Back">' + icon(ICON_BACK) + '</button>' +
          '<input class="crname" id="crName" type="text" placeholder="Name" autocomplete="off" aria-label="Name of the character">' +
          '<label class="crlevel"><span class="crk">LV</span>' +
            '<input type="number" id="crLevel" min="1" max="20" step="1" inputmode="numeric" aria-label="Level, 1 to 20" value="1"></label>' +
          '<button type="button" class="cricon go" data-do="create" aria-label="Create the character with what is chosen">' + icon(ICON_SKIP) + '</button>' +
        '</div>' +
        '<div class="crtabs" id="crTabs" role="tablist"></div>' +
        '<div class="crbody" id="crBody"></div>' +
        '<div class="crdetail" id="crDetail" hidden></div>';
      document.body.appendChild(el);
      E = {
        root: el,
        level: el.querySelector('#crLevel'),
        name: el.querySelector('#crName'),
        tabs: el.querySelector('#crTabs'),
        body: el.querySelector('#crBody'),
        detail: el.querySelector('#crDetail')
      };
      el.addEventListener('click', onClick);
      /* A card is a control, so a keyboard reaches it too. */
      el.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        var c = ev.target.closest && ev.target.closest('.crcard');
        if (c && c === ev.target) { ev.preventDefault(); openDetail(c.dataset.open); }
      });
      E.name.addEventListener('input', function () { st.name = E.name.value; });
      /* The level is typed: it counts as soon as it is a level, and a value
         that is not one is put right when the field is left. */
      E.level.addEventListener('input', function () {
        var v = Math.floor(Number(E.level.value));
        if (v >= 1 && v <= 20) setLevel(v);
      });
      E.level.addEventListener('change', function () {
        var v = Math.floor(Number(E.level.value));
        setLevel(v >= 1 ? Math.min(20, v) : 1);
        E.level.value = String(st.level);
      });
      return el;
    }

    function setLevel(v) {
      if (v === st.level) return;
      st.level = v;
      if (!showsSub()) {
        st.sub = '';
        if (st.tab === 'sub') st.tab = 'species';
      }
      paintTabs();
      if (st.tab === 'sub') paintBody();
    }

    function tabsNow() { return TABS.filter(function (t) { return t.id !== 'sub' || showsSub(); }); }

    /* A tab that has its choice is named after it: Class becomes Wizard. */
    function labelOf(t) {
      if (t.id === 'class' && st.cls) return st.cls;
      if (t.id === 'sub' && st.sub) { var sb = subOf(classNamed(st.cls), st.sub); return sb ? (sb.short || sb.name) : t.label; }
      if (t.id === 'species' && st.species) return st.species + (st.choice ? ' \u00b7 ' + st.choice : '');
      return t.label;
    }

    function paintTabs() {
      E.tabs.innerHTML = tabsNow().map(function (t) {
        var on = t.id === st.tab;
        var done = (t.id === 'class' && st.cls) || (t.id === 'sub' && st.sub) || (t.id === 'species' && st.species) ||
          (t.id === 'abilities' && st.seen) || (t.id === 'background' && (st.feat || st.tool)) ||
          (t.id === 'skills' && (st.classSkills.length || st.skills.length)) || (t.id === 'theme' && (st.theme || st.icon || st.lore));
        return '<button type="button" role="tab" class="crtab' + (on ? ' on' : '') + (done ? ' done' : '') + '" data-tab="' + t.id +
          '" aria-selected="' + (on ? 'true' : 'false') + '">' + esc(labelOf(t)) + '</button>';
      }).join('');
      var cur = E.tabs.querySelector('.on');
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    }

    function goTab(id) {
      st.tab = id;
      closeDetail();
      paintTabs();
      paintBody();
      E.body.scrollTop = 0;
    }

    /* After a choice, the next one: the archetype only when there is one to
       choose, and the abilities once the species is whole. */
    function advance(from) {
      var order = tabsNow().map(function (t) { return t.id; });
      var at = order.indexOf(from);
      if (at >= 0 && at < order.length - 1) goTab(order[at + 1]);
      else { paintTabs(); paintBody(); }
    }

    /* ---- the cards ---- */

    function card(o) {
      var on = o.on;
      return '<div class="crcard' + (on ? ' on' : '') + '" role="button" tabindex="0" data-open="' + esc(o.id) + '">' +
        '<span class="crn">' + esc(o.name) + '</span>' +
        (o.meta ? '<span class="crm">' + esc(o.meta) + '</span>' : '') +
        '<button type="button" class="crpick' + (on ? ' on' : '') + '" data-pick="' + esc(o.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
          ' aria-label="' + (on ? 'Chosen: ' : 'Choose ') + esc(o.name) + '">' + (on ? icon(ICON_CHECK) : 'Select') + '</button>' +
        '</div>';
    }

    function casterWord(c) {
      return c === 'full' ? 'full caster' : c === 'half' ? 'half caster' : c === 'third' ? 'third caster' : c === 'pact' ? 'pact magic' : '';
    }

    function classCards() {
      return '<div class="crgrid">' + classes().map(function (c) {
        var saves = (c.saves || []).map(function (a) { return a.toUpperCase(); }).join(' ');
        return card({ id: c.name, name: c.name, on: st.cls === c.name,
          meta: 'd' + (c.hd || 6) + ' · ' + (casterWord(c.caster) || 'no spells') + (saves ? ' · ' + saves : '') });
      }).join('') + '</div>';
    }

    function subCards() {
      var cls = classNamed(st.cls);
      var list = (cls && cls.subclasses) || [];
      if (!list.length) return '<p class="crnone">' + esc(st.cls) + ' has no archetype in the books.</p>';
      return '<div class="crgrid">' + list.map(function (s) {
        return card({ id: s.name, name: s.short || s.name, meta: s.source || '', on: st.sub === s.name });
      }).join('') + '</div>';
    }

    function speciesCards() {
      var list = speciesList();
      if (!list.length) return '<p class="crnone">The species did not arrive.</p>';
      var out = '<div class="crgrid">';
      list.forEach(function (sp) {
        var on = st.species === sp.name;
        out += card({ id: sp.name, name: sp.name, on: on,
          meta: sp.size + ' · ' + sp.speed + ' ft' + (sp.darkvision ? ' · dark ' + sp.darkvision : '') });
        var ask = on && choiceTrait(sp);
        /* A choice opens under its species, wide buttons across both columns. */
        if (ask) {
          out += '<div class="crchoices"><div class="crchead">' + esc(ask.choice.label) + '</div>' +
            ask.choice.options.map(function (o) {
              var chosen = st.choice === o.name;
              return '<button type="button" class="crchoice' + (chosen ? ' on' : '') + '" data-choice="' + esc(o.name) + '" aria-pressed="' + (chosen ? 'true' : 'false') + '">' +
                '<span class="crn">' + esc(o.name) + '</span>' + (o.gives ? '<span class="crm">' + esc(o.gives) + '</span>' : '') + '</button>';
            }).join('') + '</div>';
        }
      });
      return out + '</div>';
    }

    /* ---- the abilities: base, background, final ---- */

    function bgCycle() { return st.bgMode === 'two' ? [0, 2, 1] : [0, 1]; }

    function bgFilled() {
      return ABS.map(function (a) { return st.inc[a] || 0; }).filter(Boolean).sort().reverse();
    }

    function abilitiesBody() {
      var pb = rules().pointBuy || { budget: 27, min: 8, max: 15, cost: {} };
      var cost = core.origin.pointCost(st.scores);
      var head;
      if (st.method === 'pointbuy') head = cost.error ? '<span class="owarn">' + esc(cost.error) + '</span>' : '<b>' + cost.left + '</b> of ' + pb.budget + ' points left';
      else head = core.origin.check({ method: 'array', scores: st.scores }).why.length ? 'Give each value once' : 'Each value used once';
      var filled = bgFilled();
      var want = st.bgMode === 'two' ? [2, 1] : [1, 1, 1];
      var pips = want.map(function (w, i) {
        return '<span class="crpip' + (i < filled.length ? ' on' : '') + '">+' + w + '</span>';
      }).join('');
      var rows = ABS.map(function (a) {
        var base = st.scores[a], bg = st.inc[a] || 0, fin = base + bg;
        return '<div class="crab">' +
          '<span class="crak">' + NAMES[a] + '</span>' +
          '<span class="crstep"><button type="button" data-ab="' + a + '" data-d="-1" aria-label="Lower ' + NAMES[a] + '">&minus;</button>' +
            '<span class="crv">' + base + '</span>' +
            '<button type="button" data-ab="' + a + '" data-d="1" aria-label="Raise ' + NAMES[a] + '">+</button></span>' +
          '<button type="button" class="crbg' + (bg ? ' on' : '') + '" data-bg="' + a + '" aria-label="Background bonus to ' + NAMES[a] + '">' + (bg ? '+' + bg : '') + '</button>' +
          '<span class="crfin' + (fin > 20 ? ' crover' : '') + '"><b>' + fin + '</b><i>' + mod(fin) + '</i></span></div>';
      }).join('');
      return '<div class="crmethod">' + core.toggle.segment({ key: 'method', aria: 'How the scores are made', on: st.method,
          options: [{ id: 'pointbuy', label: 'Point buy' }, { id: 'array', label: 'Standard array' }] }) + '</div>' +
        '<div class="crhead">' + head + '</div>' +
        '<div class="crab crabh"><span></span><span class="crc">Base</span><span class="crc">BG</span><span class="crc">Final</span></div>' +
        '<div class="crabs">' + rows + '</div>' +
        '<div class="crbgmode">' + core.toggle.segment({ key: 'bgmode', aria: 'How the background raises the scores', on: st.bgMode,
          options: [{ id: 'two', label: '+2 +1' }, { id: 'three', label: '+1 +1 +1' }] }) +
          '<span class="crpips" aria-label="Background bonuses given">' + pips + '</span></div>';
    }

    /* ---- the background ---- */

    /* The origin feat, the way the picker of the features shows the books: a
       search, and a card for each feat with its name, the ability it raises
       and its prerequisite; a tap reads it whole, the + puts it on. */
    function featCards() {
      var t = st.featText.trim().toLowerCase();
      var list = core.origin.originFeats().filter(function (f) {
        return !t || f.name.toLowerCase().indexOf(t) >= 0 || core.origin.featAbility(f).toLowerCase().indexOf(t) >= 0;
      });
      if (!list.length) return '<div class="crnone">' + (t ? 'Nothing matches.' : 'The feats are not here yet.') + '</div>';
      return list.map(function (f) {
        var has = st.feat === f.name, ab = core.origin.featAbility(f);
        return '<div class="crfp" data-open="' + esc(f.name) + '" role="button" tabindex="0">' +
          '<div class="crfpb"><div class="crfpn">' + esc(f.name) + (deps.sourceTag ? deps.sourceTag(f.source) : '') + '</div>' +
          (ab ? '<div class="crfpa">' + esc(ab) + '</div>' : '') +
          (f.prerequisite ? '<div class="crfpp">' + esc(f.prerequisite) + '</div>' : '') + '</div>' +
          '<button type="button" class="crfpadd' + (has ? ' on' : '') + '" data-pick="' + esc(f.name) + '" aria-pressed="' + (has ? 'true' : 'false') + '" aria-label="' +
          (has ? esc(f.name) + ' is chosen' : 'Choose ' + esc(f.name)) + '">' + (has ? '\u2713' : '+') + '</button></div>';
      }).join('');
    }

    function backgroundBody() {
      return '<div class="crhead">An Origin feat</div>' +
        '<input class="sheet-search" id="crFeatQ" type="search" placeholder="Search the feats" value="' + esc(st.featText) + '" aria-label="Search the origin feats">' +
        '<div class="crfps" id="crFeats">' + featCards() + '</div>' +
        '<div class="crhead">A tool</div>' +
        '<input class="sheet-search" id="crTool" type="text" placeholder="e.g. Thieves\u2019 tools" value="' + esc(st.tool) + '" aria-label="A tool">';
    }

    /* ---- the proficiencies: the skills, as the sheet draws them ---- */

    function skillName(n) { return String(n).toLowerCase().replace(/[^a-z]/g, ''); }

    function classFrom() {
      var c = classNamed(st.cls), p = c && c.proficiencies && c.proficiencies.skills;
      return p ? { choose: p.choose || 0, from: (p.from || []).map(skillName) } : { choose: 0, from: [] };
    }

    function finalScore(a) { return st.seen ? st.scores[a] + (st.inc[a] || 0) : 10; }

    function skillsBody() {
      var cf = classFrom();
      var pb = deps.SR().profBonus(st.level);
      var rows = (deps.SR().SKILLS || []).map(function (k) {
        var byClass = st.classSkills.indexOf(k.key) >= 0, byBg = st.skills.indexOf(k.key) >= 0;
        var can = st.skillSrc === 'class' ? (cf.from.indexOf(skillName(k.key)) >= 0 && !byBg) : !byClass;
        var m = Math.floor((finalScore(k.ab) - 10) / 2) + (byClass || byBg ? pb : 0);
        return '<button type="button" class="crsk' + (byClass ? ' crprof' : '') + (byBg ? ' crprof bg' : '') + (can || byClass || byBg ? '' : ' off') + '" data-skill="' + k.key + '" aria-pressed="' + (byClass || byBg ? 'true' : 'false') + '">' +
          '<span class="crdot"></span><span class="crnm">' + esc(k.name) + '</span><span class="crabk">' + k.ab.toUpperCase() + '</span>' +
          '<span class="crvl">' + (m >= 0 ? '+' : '\u2212') + Math.abs(m) + '</span></button>';
      }).join('');
      var half = Math.ceil((deps.SR().SKILLS || []).length / 2);
      return '<div class="crmethod">' + core.toggle.segment({ key: 'skillsrc', aria: 'Which skills are picked', on: st.skillSrc,
          options: [{ id: 'class', label: 'Class ' + st.classSkills.length + '/' + cf.choose }, { id: 'bg', label: 'Background ' + st.skills.length + '/2' }] }) + '</div>' +
        (st.cls ? '' : '<div class="crnone">Choose a class to pick its skills.</div>') +
        '<div class="crsks" style="grid-template-rows:repeat(' + half + ',auto)">' + rows + '</div>';
    }

    /* ---- the theme: colours, icon and lore ---- */

    function themeBody() {
      var ch = core.chrome;
      var themes = ch.themes.map(function (t) {
        var on = st.theme === t.id;
        return '<button type="button" class="crcell' + (on ? ' on' : '') + '" data-theme="' + esc(t.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' + esc(t.label + ', ' + t.blurb) + '">' +
          '<span class="crsw" style="background:' + t.swatch[0] + ';border-color:' + t.swatch[1] + '"><i style="background:' + t.swatch[1] + '"></i><i style="background:' + t.swatch[2] + '"></i></span>' +
          '<span class="crcn">' + esc(t.label) + '</span></button>';
      }).join('');
      var now = ch.iconOf({ icon: st.icon });
      var icons = Object.keys(ch.icons).map(function (k) {
        var on = now === k && !!st.icon;
        return '<button type="button" class="crcell crico' + (on ? ' on' : '') + '" data-icon="' + esc(k) + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' + esc(ch.icons[k].label + ', ' + ch.icons[k].blurb) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' + ch.icons[k].svg + '</svg></button>';
      }).join('');
      return '<div class="crhead">Colours</div><div class="crcells">' + themes + '</div>' +
        '<div class="crhead">Icon</div><div class="crcells crcells6">' + icons + '</div>' +
        '<div class="crhead">Lore</div>' +
        '<textarea class="crlore" id="crLore" rows="5" placeholder="Why did this character leave home and take to the road?" aria-label="The background story of the character">' + esc(st.lore) + '</textarea>';
    }

    function paintBody() {
      var html = '';
      if (st.tab === 'class') html = classCards();
      else if (st.tab === 'sub') html = subCards();
      else if (st.tab === 'species') html = speciesCards();
      else if (st.tab === 'abilities') { st.seen = true; html = abilitiesBody(); }
      else if (st.tab === 'skills') html = skillsBody();
      else if (st.tab === 'theme') html = themeBody();
      else html = backgroundBody();
      var keep = E.body.scrollTop;
      E.body.innerHTML = html;
      E.body.scrollTop = keep;
      var tool = E.body.querySelector('#crTool');
      if (tool) tool.addEventListener('input', function () { st.tool = tool.value; });
      var lore = E.body.querySelector('#crLore');
      if (lore) lore.addEventListener('input', function () { st.lore = lore.value; });
      var q = E.body.querySelector('#crFeatQ');
      if (q) q.addEventListener('input', function () {
        st.featText = q.value;
        E.body.querySelector('#crFeats').innerHTML = featCards();
      });
      if (st.tab === 'abilities') paintTabs();
    }

    /* ---- the description of a card ---- */

    function featuresOf(className, subShort) {
      var out = [];
      var by = deps.featureByKey();
      Object.keys(by).forEach(function (key) {
        var f = by[key];
        if (f.class !== className) return;
        if (subShort ? f.subclass !== subShort : f.subclass) return;
        if (!subShort && /subclass$/i.test(f.name)) return;
        out.push(f);
      });
      return out.sort(function (a, b) { return (Number(a.level) || 0) - (Number(b.level) || 0); });
    }

    function featureHtml(list) {
      var level = -1, html = '';
      list.forEach(function (f) {
        var lv = Number(f.level) || 0;
        if (lv !== level) { level = lv; html += '<h4 class="crlv">' + (lv ? 'Level ' + lv : 'Always') + '</h4>'; }
        html += '<h3>' + esc(f.name) + '</h3>' + deps.renderBlocks(f.blocks || []);
      });
      return html || '<p class="crnone">The book has nothing written for it yet.</p>';
    }

    function listWords(a) { return (a || []).join(', '); }

    function describe(kind, id) {
      if (kind === 'class') {
        var c = classNamed(id);
        if (!c) return null;
        var p = c.proficiencies || {};
        var sk = p.skills ? 'choose ' + p.skills.choose + ' of ' + listWords(p.skills.from) : '';
        var facts = [
          ['Hit die', 'd' + (c.hd || 6)],
          ['Saves', (c.saves || []).map(function (a) { return NAMES[a] || a; }).join(', ')],
          ['Armour', listWords(p.armour) || 'none'],
          ['Weapons', listWords(p.weapons)],
          ['Skills', sk],
          ['Magic', casterWord(c.caster) || 'none']
        ].filter(function (r) { return r[1]; });
        return { title: c.name, tag: 'Class',
          html: '<dl class="crfacts">' + facts.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' +
            featureHtml(featuresOf(c.name, '')) };
      }
      if (kind === 'sub') {
        var cls = classNamed(st.cls), s = subOf(cls, id);
        if (!s) return null;
        return { title: s.name, tag: s.source || 'Archetype', html: featureHtml(featuresOf(cls.name, s.short)) };
      }
      if (kind === 'feat') {
        var ft = core.origin.originFeats().filter(function (f) { return f.name === id; })[0];
        if (!ft) return null;
        var ab = core.origin.featAbility(ft);
        return { title: ft.name, tag: 'Origin feat',
          html: ((ab || ft.prerequisite) ? '<dl class="crfacts">' + (ab ? '<dt>Raises</dt><dd>' + esc(ab) + '</dd>' : '') +
            (ft.prerequisite ? '<dt>Needs</dt><dd>' + esc(ft.prerequisite) + '</dd>' : '') + '</dl>' : '') + deps.renderBlocks(ft.blocks || []) };
      }
      var sp = speciesNamed(id);
      if (!sp) return null;
      var bits = [['Size', sp.size], ['Speed', sp.speed + ' ft'], ['Darkvision', sp.darkvision ? sp.darkvision + ' ft' : ''], ['Type', sp.type]].filter(function (r) { return r[1]; });
      return { title: sp.name, tag: 'Species',
        html: '<dl class="crfacts">' + bits.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' +
          sp.traits.map(function (t) { return '<h3>' + esc(t.name) + '</h3>' + deps.renderBlocks(t.blocks || []); }).join('') };
    }

    function kindNow() { return st.tab === 'background' ? 'feat' : st.tab; }

    function openDetail(id) {
      var kind = kindNow();
      var d = describe(kind, id);
      if (!d) return;
      st.detail = { kind: kind, id: id };
      var on = isChosen(kind, id);
      E.detail.innerHTML =
        '<div class="crbar"><button type="button" class="cricon" data-do="undetail" aria-label="Back">' + icon(ICON_BACK) + '</button>' +
          '<h2 class="crtitle">' + esc(d.title) + '</h2><span class="crtag">' + esc(d.tag) + '</span></div>' +
        '<div class="crtext">' + d.html + '</div>' +
        '<div class="crfoot"><button type="button" class="crmake' + (on ? ' on' : '') + '" data-pick="' + esc(id) + '">' + (on ? 'Chosen' : 'Select') + '</button></div>';
      E.detail.hidden = false;
      E.detail.querySelector('.crtext').scrollTop = 0;
    }

    function closeDetail() {
      st.detail = null;
      E.detail.hidden = true;
      E.detail.innerHTML = '';
    }

    function isChosen(kind, id) {
      return (kind === 'feat' && st.feat === id) || (kind === 'class' && st.cls === id) || (kind === 'sub' && st.sub === id) || (kind === 'species' && st.species === id);
    }

    /* ---- choosing ---- */

    function pick(kind, id) {
      var was = isChosen(kind, id);
      if (kind === 'feat') {
        st.feat = was ? '' : id;
        closeDetail();
        paintTabs();
        paintBody();
        return;
      }
      if (kind === 'class') {
        if (was) { st.cls = ''; st.classSkills = []; }
        else { if (st.cls !== id) { st.sub = ''; st.classSkills = []; } st.cls = id; }
      } else if (kind === 'sub') {
        st.sub = was ? '' : id;
      } else {
        if (was) { st.species = ''; st.choice = ''; }
        else { if (st.species !== id) st.choice = ''; st.species = id; }
      }
      closeDetail();
      paintTabs();
      if (was) { paintBody(); return; }
      if (kind === 'species' && choiceTrait(speciesNamed(id))) { paintBody(); return; }
      advance(kind === 'class' ? 'class' : kind);
    }

    function stepScore(a, d) {
      var pb = rules().pointBuy || { min: 8, max: 15 };
      var arr = (rules().standardArray || [15, 14, 13, 12, 10, 8]).slice().sort(function (x, y) { return x - y; });
      if (st.method === 'pointbuy') st.scores[a] = Math.max(pb.min, Math.min(pb.max, st.scores[a] + d));
      else {
        var i = arr.indexOf(st.scores[a]);
        st.scores[a] = arr[Math.max(0, Math.min(arr.length - 1, (i < 0 ? 0 : i) + d))];
      }
    }

    /* A tap on the background column goes to the next bonus the plan still
       has: +2 then +1 in the first plan, +1 on up to three in the other. */
    function cycleBg(a) {
      var cyc = bgCycle();
      var now = st.inc[a] || 0;
      var used = {};
      ABS.forEach(function (x) { if (x !== a && st.inc[x]) used[st.inc[x]] = (used[st.inc[x]] || 0) + 1; });
      var cap = st.bgMode === 'two' ? 1 : 3;
      var i = cyc.indexOf(now);
      for (var n = 1; n <= cyc.length; n++) {
        var v = cyc[(i + n) % cyc.length];
        if (!v || (used[v] || 0) < cap) { if (v) st.inc[a] = v; else delete st.inc[a]; return; }
      }
    }

    /* A skill goes to the list that is being filled: the class's (from its
       own choices, as many as it gives) or the background's two. A skill
       the other list has is not offered. */
    function pickSkill(key) {
      var cf = classFrom();
      var list = st.skillSrc === 'class' ? st.classSkills : st.skills;
      var other = st.skillSrc === 'class' ? st.skills : st.classSkills;
      var at = list.indexOf(key);
      if (at >= 0) list.splice(at, 1);
      else {
        if (other.indexOf(key) >= 0) return;
        if (st.skillSrc === 'class') {
          if (cf.from.indexOf(skillName(key)) < 0) return;
          list.push(key);
          if (list.length > cf.choose) list.shift();
        } else {
          list.push(key);
          if (list.length > 2) list.shift();
        }
      }
      paintBody();
      paintTabs();
    }

    function onClick(ev) {
      var t = ev.target;
      var go = t.closest('[data-do]');
      if (go) {
        var what = go.dataset['do'];
        if (what === 'close') close();
        else if (what === 'undetail') closeDetail();
        else if (what === 'create') create();
        return;
      }
      var pk = t.closest('[data-pick]');
      if (pk) { pick(st.detail ? st.detail.kind : kindNow(), pk.dataset.pick); return; }
      var tab = t.closest('[data-tab]');
      if (tab) { goTab(tab.dataset.tab); return; }
      var ch = t.closest('[data-choice]');
      if (ch) {
        st.choice = st.choice === ch.dataset.choice ? '' : ch.dataset.choice;
          if (st.choice) advance('species'); else paintBody();
        return;
      }
      var op = t.closest('[data-open]');
      if (op) { openDetail(op.dataset.open); return; }
      var seg = t.closest('.seg button');
      if (seg) {
        if (seg.dataset.method && seg.dataset.method !== st.method) {
          st.method = seg.dataset.method;
          st.scores = st.method === 'array' ? arrayBase() : pointBase();
          paintBody();
        } else if (seg.dataset.skillsrc && seg.dataset.skillsrc !== st.skillSrc) {
          st.skillSrc = seg.dataset.skillsrc;
          paintBody();
        } else if (seg.dataset.bgmode && seg.dataset.bgmode !== st.bgMode) {
          st.bgMode = seg.dataset.bgmode;
          st.inc = {};
          paintBody();
        }
        return;
      }
      var ab = t.closest('[data-ab]');
      if (ab) { stepScore(ab.dataset.ab, Number(ab.dataset.d)); paintBody(); return; }
      var bg = t.closest('[data-bg]');
      if (bg) { cycleBg(bg.dataset.bg); paintBody(); return; }
      var sk = t.closest('[data-skill]');
      if (sk) { pickSkill(sk.dataset.skill); return; }
      var th = t.closest('[data-theme]');
      if (th) { st.theme = st.theme === th.dataset.theme ? '' : th.dataset.theme; paintBody(); paintTabs(); return; }
      var ic = t.closest('[data-icon]');
      if (ic) { st.icon = st.icon === ic.dataset.icon ? '' : ic.dataset.icon; paintBody(); paintTabs(); }
    }

    /* ---- making the character ---- */

    /* From what is chosen: a part that fails its check is left out and said,
       so a half-done tab never stops the character. */
    function create() {
      var left = [];
      var origin = {};
      if (st.species) { origin.species = st.species; if (st.choice) origin.speciesChoice = st.choice; }
      if (st.seen) {
        var c = core.origin.check({ method: st.method, scores: st.scores });
        if (c.why.length) left.push('the scores');
        else { origin.method = st.method; origin.scores = JSON.parse(JSON.stringify(st.scores)); }
      }
      var inc = Object.keys(st.inc).length ? st.inc : null;
      if (inc || st.feat || st.skills.length || st.tool) {
        var bg = { name: 'Custom', increase: inc || {}, feat: st.feat, skills: st.skills.slice(), tool: st.tool };
        var probe = Object.assign({}, origin, { background: bg });
        if (core.origin.check(probe).why.length) {
          /* the bonuses are the usual reason: a plan that is not whole */
          bg.increase = {};
          if (inc) left.push('the background bonuses');
          probe = Object.assign({}, origin, { background: bg });
          if (core.origin.check(probe).why.length) { bg = null; left.push('the background'); }
        }
        if (bg) origin.background = bg;
      }
      var made = deps.make({ className: st.cls, level: st.level, sub: st.sub, name: st.name.trim(), origin: origin,
        classSkills: st.classSkills.slice(), theme: st.theme, icon: st.icon, lore: st.lore.trim() });
      if (made && made.error) { deps.toast(made.error); return; }
      close();
      if (left.length) deps.toast('Left out: ' + left.join(', '));
    }

    function open() {
      if (!layer) layer = build();
      st = fresh();
      E.level.value = '1';
      E.name.value = '';
      closeDetail();
      layer.hidden = false;
      paintTabs();
      paintBody();
    }

    function close() {
      if (layer) layer.hidden = true;
    }

    /* The back key: a description first, then the screen itself. */
    function back() {
      if (!layer || layer.hidden) return false;
      if (st.detail) closeDetail(); else close();
      return true;
    }

    return { open: open, close: close, back: back };
  };
})(typeof window !== 'undefined' ? window : this);
