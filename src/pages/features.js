/* The features page: what the character has, what is left of it, and the
   rests that give it back. */
(function () {
  'use strict';

  var C = Sheet.core;
  var SR = C.SR;
  var D = SheetDrag();

  var api = null;   /* the shell gives it at mount */
  var E = {};       /* the elements of the page */

  var deleting = null;

  /* The library is one big file, and the app hands it over its bridge in one
     piece, so the read waits for the frame the page has painted: the first
     show of the page costs its own cards and nothing else. */
  function afterPaint(fn) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { setTimeout(fn, 0); });
    } else {
      setTimeout(fn, 0);
    }
  }

  /* The library of features is a file beside the page, and this is what it
     fills when it arrives. */
  C.library.data('features', function (value) {
    C.library.features.features = value.features || [];
    C.library.features.features.forEach(function (f) { C.library.featureByKey[f.key] = f; });
  });

  /* The feats of the books, for a feat on the sheet to find its text. */
  C.library.data('feats', function (value) {
    C.library.feats.length = 0;
    (value.feats || []).forEach(function (f) { C.library.feats.push(f); });
  });

  /* The library lands after the page does, and the shell repaints when it
     does, so the map is the one the shell fills. */
  var FEATURE_BY_KEY = C.library.featureByKey;

  /* ---- what a feature says, from data ----

     A feature on the sheet is a record, and its words come from data, never
     from code: the record's own blocks when it carries them (a feature made
     by hand or by the agent is just JSON), then the book of features by its
     key, then the feats and the features of the books by its name. So a new
     feature is one record, and a feat of the books shows its text the moment
     its name is on the sheet. */
  function norm(name) {
    return String(name || '').toLowerCase().replace(/^feat:\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /* A trait of the character's species, by its key, with the option the
     character chose written under it. */
  function speciesTrait(f) {
    if (!/^species-/.test(String(f.key || ''))) return null;
    if (!C.library.species.length) { C.library.data('species'); return null; }
    var found = null;
    C.library.species.forEach(function (s) { s.traits.forEach(function (t) { if (t.key === f.key) found = { s: s, t: t }; }); });
    if (!found) return null;
    var blocks = found.t.blocks.slice();
    var pick = (api.character().char || {}).speciesChoice;
    var opt = pick && found.t.choice && found.t.choice.options.filter(function (o) { return o.name === pick; })[0];
    if (opt) blocks.push({ t: 'p', lead: 'Your choice: ' + opt.name + '.', text: opt.gives });
    return { blocks: blocks, ref: found.s.ref };
  }

  function bookOf(f) {
    var trait = speciesTrait(f);
    if (trait) return trait;
    var byKey = FEATURE_BY_KEY[f.key];
    if (Array.isArray(f.blocks) && f.blocks.length) return { blocks: f.blocks, desc: f.desc, ref: f.ref || (byKey && byKey.ref), action: f.action || (byKey && byKey.action), duration: f.duration || (byKey && byKey.duration) };
    if (typeof f.text === 'string' && f.text.trim()) {
      return { blocks: f.text.trim().split(/\n\s*\n/).map(function (t) { return { t: 'p', text: t.trim() }; }), desc: f.desc, ref: f.ref, action: f.action, duration: f.duration };
    }
    if (byKey && byKey.blocks && byKey.blocks.length) return byKey;
    var n = norm(f.name);
    if (!n) return byKey || {};
    if (!C.library.feats.length) C.library.data('feats');
    var feat = C.library.feats.filter(function (x) { return norm(x.name) === n; })[0];
    if (feat) return { blocks: feat.blocks, ref: feat.ref, head: feat.head };
    var any = (C.library.features.features || []).filter(function (x) { return norm(x.name) === n; })[0];
    return any || byKey || {};
  }

  var NEW_TYPES = [
    { id: 'short', label: 'short rest' },
    { id: 'long', label: 'long rest' },
    { id: 'special', label: 'special' },
    { id: 'passive', label: 'passive' }
  ];

  function commitChar() { api.save(); api.refresh(); }

  function features() { return api.character().char.features; }

  /* The feature waiting to be removed, and the question under it. */
  function featureByKey(key) {
    var found = null;
    features().forEach(function (f) { if (f.key === key) found = f; });
    return found;
  }

  /* How many uses are left. The counter module reads it, so a feature bound
     to the pact slots reads the same counter here as it does there. */
  function featureCount(f) {
    return C.counter.counterOf(api.character(), 'feature:' + f.key) || { left: 0, max: 0 };
  }

  function eyeSvg(hidden) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<path d="M2 12s3.7-6.5 10-6.5S22 12 22 12s-3.7 6.5-10 6.5S2 12 2 12z"/>' +
      '<circle cx="12" cy="12" r="2.6"/>' +
      (hidden ? '<path d="M3.5 3.5l17 17"/>' : '') +
      '</svg>';
  }

  /* The uses of a feature: how many are left and when they come back. */
  function usesText(f) {
    if (f.cost === 'sp') return '1 SP';
    if (!f.max) return '';
    if (f.recovery === 'short' || f.recovery === 'long') return f.left + ' / ' + f.recovery;
    return String(f.left);
  }

  function recoveryWord(f) {
    if (f.recovery === 'short' || f.recovery === 'long') return f.recovery;
    if (f.recovery === 'special') return 'special';
    return '';
  }

  /* ---- the cards ---- */

  function buildFeatureCards() {
    E.featureActive.innerHTML = '';
    E.featurePassive.innerHTML = '';
    features().forEach(function (f) {
      var card = document.createElement('div');
      card.className = 'fcard';
      card.dataset.key = f.key;
      card.innerHTML =
        '<div class="top"><span class="t" data-role="name"></span>' +
        '<span class="fsrc"></span>' +
        '<button class="fuses" type="button" data-role="uses"></button>' +
        '<input class="fusesin" type="number" inputmode="numeric" min="0" max="99" data-role="usesin" aria-label="Uses left">' +
        '<span class="fslash">/</span>' +
        '<input class="fmaxin" type="number" inputmode="numeric" min="0" max="99" data-role="maxin" aria-label="Maximum uses">' +
        '<span class="frec"></span></div>' +
        '<div class="fm"><span class="fdesc"><i class="fdt"></i>' +
        '<input class="fdin" type="text" data-role="descin" maxlength="120" autocomplete="off" aria-label="A short description of the feature">' +
        '<span class="fdx"></span></span>' +
        '<button class="feye" type="button" data-role="eye" aria-label="Hide the feature"></button>' +
        '<button class="fdel" type="button" data-role="del" aria-label="Remove the feature">&times;</button></div>' +
        '<div class="fconfirm"><span>Remove it?</span>' +
        '<button class="yes" type="button" data-role="yes">Remove</button>' +
        '<button class="no" type="button" data-role="no">Keep</button></div>';
      /* A feature that cannot be spent and does not come back on a rest is
         not an active one, whatever the record says: it is always on. */
      var spendable = !!Number(f.max) || !!f.cost || f.recovery === 'sp' ||
        f.recovery === 'short' || f.recovery === 'long' || f.recovery === 'special';
      (f.active && spendable ? E.featureActive : E.featurePassive).appendChild(card);
    });
  }

  /* The book's own words, made short: its summary when it has one, else
     its first sentence, cut at a word. */
  function shortOf(data) {
    if (data && data.desc) return data.desc;
    var first = ((data && data.blocks) || []).filter(function (b) { return b && b.t === 'p' && b.text; })[0];
    if (!first) return '';
    var text = String(first.text).replace(/\[\[\w+:([^\]]*)\]\]/g, '$1');
    var sentence = (text.match(/^.*?[.!?](\s|$)/) || [text])[0].trim();
    if (sentence.length <= 90) return sentence;
    return sentence.slice(0, 88).replace(/\s+\S*$/, '') + '\u2026';
  }

  function renderFeatureCards() {
    E.featureBody.classList.toggle('editing', api.editing('features'));
    features().forEach(function (f) {
      var card = E.featureBody.querySelector('.fcard[data-key="' + f.key + '"]');
      if (!card) return;
      var data = bookOf(f);
      card.classList.toggle('hidden', !!f.hidden);

      var name = card.querySelector('[data-role="name"]');
      name.textContent = f.name;
      name.setAttribute('aria-label', 'Read ' + f.name);

      card.querySelector('.fsrc').innerHTML = C.library.sourceTag(f.source);

      /* The uses are the count and the rest that brings them back, drawn: an
         hourglass for a short rest, a moon for a long one. */
      var text = usesText(f);
      var uses = card.querySelector('[data-role="uses"]');
      var back = (f.max && (f.recovery === 'short' || f.recovery === 'long')) ? f.recovery : '';
      uses.innerHTML = back ? '<span>' + f.left + '</span>' + C.chrome.restIcon(back) : C.chrome.esc(text);
      uses.hidden = !text;
      uses.classList.toggle('sp', f.recovery === 'sp');
      uses.setAttribute('aria-label', f.name + ': ' + (back ? f.left + ' left, back on a ' + back + ' rest' : text));

      /* A feature of the library starts with no counter, so the two fields
         are there in the edit mode for the player to give it one. */
      var input = card.querySelector('[data-role="usesin"]');
      if (input && document.activeElement !== input) input.value = String(f.left || 0);
      input.hidden = !f.max && !api.editing('features');

      var maxInput = card.querySelector('[data-role="maxin"]');
      if (maxInput && document.activeElement !== maxInput) maxInput.value = String(f.max || 0);
      maxInput.hidden = !f.max && !api.editing('features');

      var rec = card.querySelector('.frec');
      rec.textContent = api.editing('features') ? (recoveryWord(f) ? ' ' + recoveryWord(f) : '') : '';

      /* A short description in italics: the player's own, or the book's
         summary, or the first sentence of the book's text. In the edit mode
         it is a field; emptied, it goes back to the book's. */
      var editing = api.editing('features');
      var dt = card.querySelector('.fdt');
      var din = card.querySelector('.fdin');
      var fallback = shortOf(data);
      dt.textContent = f.desc || fallback;
      dt.hidden = editing || !(f.desc || fallback);
      din.hidden = !editing;
      din.placeholder = fallback || 'A short description';
      if (document.activeElement !== din) din.value = f.desc || '';
      var bits = [];
      if (data.action) bits.push(data.action);
      if (data.duration) bits.push(data.duration);
      card.querySelector('.fdx').textContent = bits.length ? ((dt.hidden ? '' : ' \u00b7 ') + bits.join(' \u00b7 ')) : '';

      var eye = card.querySelector('[data-role="eye"]');
      eye.innerHTML = eyeSvg(f.hidden);
      eye.setAttribute('aria-label', f.hidden ? 'Show the feature' : 'Hide the feature');

      card.classList.toggle('confirming', deleting === f.key);
    });
  }

  /* ---- the description of a feature ---- */

  function openFeature(key) {
    var f = featureByKey(key);
    if (!f) return;
    var data = bookOf(f);
    var meta = C.chrome.field('Source', f.source);
    if (data.head) meta += C.chrome.field('Type', data.head);
    if (f.max || f.recovery === 'sp') meta += C.chrome.field('Uses', usesText(f));
    if (data.action) meta += C.chrome.field('Action', data.action);
    if (data.duration) meta += C.chrome.field('Duration', data.duration);
    if (f.recovery === 'sp') meta += C.chrome.field('Cost', '1 sorcery point');
    else if (f.recovery === 'short' || f.recovery === 'long') meta += C.chrome.field('Recovery', f.recovery + ' rest');
    else if (f.recovery === 'special') meta += C.chrome.field('Recovery', 'special');

    if (f.effect) meta += C.chrome.field('Effect', f.effect);
    api.sheet.open({
      id: 'feature:' + key,
      title: f.name,
      /* What the feature does to the sheet, in the language of the effects:
         checked as it is left, written when it reads. */
      list: '<div class="feff"><label class="fk" for="featEffect">Effect on the sheet</label>' +
        '<input class="sheet-search" id="featEffect" type="text" autocomplete="off" spellcheck="false" placeholder="e.g. init + prof" value="' + C.chrome.esc(f.effect || '') + '">' +
        '<div class="fwhy" id="featEffectWhy">' + C.chrome.esc(effectHelp()) + '</div></div>',
      onPaint: function (root) {
        var field = root.querySelector('#featEffect');
        var why = root.querySelector('#featEffectWhy');
        if (!field) return;
        field.addEventListener('change', function () {
          var text = field.value.trim();
          var problems = C.SR.effectCheck(text, api.character().char, api.character());
          if (problems.length) { why.textContent = problems[0]; why.classList.add('bad'); return; }
          C.rest.push(api.character());
          if (text) f.effect = text; else delete f.effect;
          why.textContent = text ? 'Read: ' + text : effectHelp();
          why.classList.remove('bad');
          commitChar();
        });
      },
      meta: meta + C.library.sourceTag(f.source),
      text: (data.blocks && data.blocks.length ? C.chrome.renderBlocks(data.blocks)
        : '<p class="fnone">No text in the books for ' + C.chrome.esc(f.name) + '. Write one in the record of the feature (its blocks), or ask the agent.</p>') +
        C.chrome.sourceLine(data.ref)
    });
  }

  function effectHelp() {
    return 'TARGET + or = FORMULA, several split by ; : init + prof, hpMax + 2 * level, speed + 10, AC + 1, save.all + 1, skill.stealth + dex.mod. Words: prof, level, rogue.level, dex, dex.mod, and any attribute.';
  }

  /* ---- the picker: the feats and the species of the books ----

     The + of the page opens the books: a search, a filter (species, origin
     feats, fighting styles, epic boons, the other feats), and a card for
     each with its name, the ability it raises and its prerequisite. A tap
     on a card reads it whole; its + puts it on the sheet. A feature of the
     player's own is a button away. */
  var KINDS = [
    { id: '', label: 'All' },
    { id: 'species', label: 'Species' },
    { id: 'origin', label: 'Origin' },
    { id: 'fs', label: 'Fighting style' },
    { id: 'boon', label: 'Boon' },
    { id: 'feat', label: 'Feat' }
  ];

  function kindOf(feat) {
    var c = String(feat.category || '');
    if (/origin/i.test(c)) return 'origin';
    if (/fighting style/i.test(c)) return 'fs';
    if (/boon/i.test(c)) return 'boon';
    return 'feat';
  }

  var AB_SHORT = { Strength: 'Str', Dexterity: 'Dex', Constitution: 'Con', Intelligence: 'Int', Wisdom: 'Wis', Charisma: 'Cha' };

  /* The ability a feat raises, short: "+1 Int, Wis or Cha". */
  function abilityOf(feat) {
    var b = (feat.blocks || []).filter(function (x) { return x && /ability score/i.test(x.lead || ''); })[0];
    if (!b) return '';
    var names = (String(b.text).match(/Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma/g) || [])
      .filter(function (x, i, l) { return l.indexOf(x) === i; }).map(function (x) { return AB_SHORT[x]; });
    var by = (String(b.text).match(/by (\d+)/) || [])[1] || '1';
    if (!names.length) return 'An ability +' + by;
    if (names.length === 6) return '+' + by + ' to any ability';
    return '+' + by + ' ' + (names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] : names[0]);
  }

  function entries() {
    var out = [];
    C.library.species.forEach(function (sp) {
      out.push({ kind: 'species', name: sp.name, source: sp.source, data: sp,
        ability: sp.size + ' \u00b7 ' + sp.speed + ' ft' + (sp.darkvision ? ' \u00b7 darkvision ' + sp.darkvision : ''), prereq: '' });
    });
    C.library.feats.forEach(function (f) {
      out.push({ kind: kindOf(f), name: f.name, source: f.source, data: f, ability: abilityOf(f), prereq: f.prerequisite || '' });
    });
    return out;
  }

  function slugOf(name) { return norm(name).replace(/ /g, '-'); }

  function onSheet(x) {
    if (x.kind === 'species') return (api.character().char || {}).species === x.name;
    return features().some(function (f) { return f.key === 'feat-' + slugOf(x.name) || norm(f.name) === norm(x.name); });
  }

  /* A feat on the sheet: one row; its words are read from the feats by its
     name, so nothing of it is copied. */
  function addFeat(feat) {
    if (features().some(function (f) { return f.key === 'feat-' + slugOf(feat.name) || norm(f.name) === norm(feat.name); })) {
      api.toast(feat.name + ' is already on the sheet');
      return;
    }
    C.rest.push(api.character());
    features().push({ key: 'feat-' + slugOf(feat.name), name: feat.name, source: 'Feat', active: false, recovery: 'passive',
      cost: '', bind: null, max: 0, left: 0, short: null, hidden: false });
    commitChar();
    api.toast(feat.name + ' added');
  }

  /* A species on the sheet: its traits, through the creator's own rules,
     in place of the species it had; a trait that asks for a choice asks it
     first. */
  function addSpecies(sp, choice) {
    var ask = sp.traits.filter(function (t) { return t.choice; })[0];
    if (ask && !choice) {
      api.sheet.open({
        id: 'fpchoice',
        title: ask.choice.label,
        list: ask.choice.options.map(function (o) {
          return C.card.line({ name: { text: o.name }, meta: { text: o.gives }, data: { opt: o.name }, pick: true });
        }).join(''),
        onList: function (ev) {
          var b = ev.target.closest('[data-opt]');
          if (!b) return;
          api.sheet.close();
          addSpecies(sp, b.dataset.opt);
        }
      });
      return;
    }
    var rec = api.character();
    C.rest.push(rec);
    var ch = rec.char;
    ch.features = features().filter(function (f) { return !/^species-/.test(String(f.key || '')); });
    delete ch.speciesChoice;
    var done = C.origin.apply(rec, { species: sp.name, speciesChoice: choice || undefined });
    if (done.error) { api.toast(done.error); return; }
    commitChar();
    api.toast(sp.name + (choice ? ' (' + choice + ')' : '') + ' is the species now');
  }

  function addEntry(x) {
    if (x.kind === 'species') addSpecies(x.data); else addFeat(x.data);
  }

  /* An entry read whole, with its + at the bottom. */
  function openEntry(x) {
    var d = x.data;
    var text = '';
    if (x.kind === 'species') {
      d.traits.forEach(function (t) {
        text += '<h3>' + C.chrome.esc(t.name) + '</h3>' + C.chrome.renderBlocks(t.blocks);
        if (t.choice) text += '<p><b>' + C.chrome.esc(t.choice.label) + ':</b> ' + C.chrome.esc(t.choice.options.map(function (o) { return o.name; }).join(', ')) + '</p>';
      });
    } else {
      text = C.chrome.renderBlocks(d.blocks);
    }
    var meta = '';
    if (x.kind !== 'species' && d.category) meta += C.chrome.field('Type', d.category);
    if (x.prereq) meta += C.chrome.field('Prerequisite', x.prereq);
    if (x.ability) meta += C.chrome.field(x.kind === 'species' ? 'Size and speed' : 'Ability', x.ability);
    api.sheet.open({
      id: 'fpentry',
      title: x.name,
      meta: meta + C.library.sourceTag(x.source),
      text: text + C.chrome.sourceLine(d.ref),
      actions: [{ label: onSheet(x) ? (x.kind === 'species' ? 'The species now' : 'On the sheet') : 'Add', onClick: function () {
        if (onSheet(x)) return;
        api.sheet.close();
        addEntry(x);
      } }]
    });
  }

  function openFeaturePicker() {
    var f = { kind: '', text: '' };
    var waiting = !C.library.feats.length || !C.library.species.length;
    if (waiting) Promise.all([C.library.data('feats'), C.library.data('species')]).then(function () { paint(); });
    var list = [];
    function paint() {
      list = entries();
      var t = f.text.trim().toLowerCase();
      var shown = list.filter(function (x) {
        return (!f.kind || x.kind === f.kind) && (!t || x.name.toLowerCase().indexOf(t) >= 0 || x.ability.toLowerCase().indexOf(t) >= 0);
      });
      var html = '<div class="fpfils">' + KINDS.map(function (k) {
        var on = f.kind === k.id;
        return '<button type="button" class="fpfil" data-kind="' + k.id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + C.chrome.esc(k.label) + '</button>';
      }).join('') + '</div>';
      if (!list.length) html += '<div class="empty">The books are on their way.</div>';
      else {
        html += '<div class="fpcards">' + shown.slice(0, 80).map(function (x) {
          var i = list.indexOf(x);
          var has = onSheet(x);
          return '<div class="fpcard" data-entry="' + i + '" role="button" tabindex="0">' +
            '<div class="fpbody"><div class="fpn">' + C.chrome.esc(x.name) + C.library.sourceTag(x.source) + '</div>' +
            (x.ability ? '<div class="fpa">' + C.chrome.esc(x.ability) + '</div>' : '') +
            (x.prereq ? '<div class="fpp">' + C.chrome.esc(x.prereq) + '</div>' : '') + '</div>' +
            '<button type="button" class="fpadd' + (has ? ' on' : '') + '" data-add="' + i + '" aria-label="' + (has ? x.name + ' is on the sheet' : 'Add ' + x.name) + '">' + (has ? '\u2713' : '+') + '</button></div>';
        }).join('') + '</div>' +
          (shown.length > 80 ? '<div class="empty">' + (shown.length - 80) + ' more: narrow the search.</div>' : '') +
          (shown.length ? '' : '<div class="empty">Nothing matches.</div>');
      }
      api.sheet.open({
        id: 'featurepicker',
        title: 'Add a feature',
        search: true,
        placeholder: 'Search the feats and the species',
        list: html,
        onSearch: function (term) { f.text = term || ''; paint(); },
        onList: function (ev) {
          var k = ev.target.closest('[data-kind]');
          if (k) { f.kind = k.dataset.kind; paint(); return; }
          var add = ev.target.closest('[data-add]');
          if (add) {
            var a = list[Number(add.dataset.add)];
            if (!a || onSheet(a)) return;
            addEntry(a);
            if (a.kind === 'feat' || a.kind === 'origin' || a.kind === 'fs' || a.kind === 'boon') paint();
            return;
          }
          var card = ev.target.closest('[data-entry]');
          if (card) openEntry(list[Number(card.dataset.entry)]);
        },
        actions: [{ label: 'Custom feature', kind: 'quiet', onClick: function () { openNewFeature(); } }]
      });
    }
    paint();
  }

  /* ---- the creation of a feature: a name and a recovery type ---- */

  function openNewFeature() {
    var picked = 'short';
    api.sheet.open({
      id: 'newfeature',
      title: 'New feature',
      metaClass: 'sheet-meta one',
      meta: '<input class="sheet-search" id="featureName" type="text" placeholder="Name of the feature" aria-label="Name of the feature">',
      text: '<div class="fnew">' + NEW_TYPES.map(function (t) {
        return '<button class="fnewtype" type="button" data-type="' + t.id + '">' + t.label + '</button>';
      }).join('') + '</div>',
      actions: [{
        label: 'Create',
        onClick: function (root) {
          var field = root.querySelector('#featureName');
          var name = (field && field.value ? field.value : '').trim() || 'New feature';
          var passive = picked === 'passive';
          features().push({
            key: 'f' + Date.now(),
            name: name,
            source: 'Feat',
            active: !passive,
            recovery: picked,
            cost: '',
            bind: null,
            max: passive ? 0 : 1,
            left: passive ? 0 : 1,
            short: null,
            hidden: false
          });
          api.sheet.close();
          commitChar();
        }
      }],
      onPaint: function (root) {
        var buttons = root.querySelectorAll('.fnewtype');
        Array.prototype.forEach.call(buttons, function (b) {
          b.addEventListener('click', function () {
            picked = b.dataset.type;
            Array.prototype.forEach.call(buttons, function (x) { x.classList.toggle('on', x === b); });
          });
        });
        if (buttons[0]) buttons[0].classList.add('on');
      }
    });
  }

  /* ---- one tap spends a use, and at zero it gives one back. The bend luck
     feature costs a sorcery point rather than a use. ---- */

  function spendFeature(f) {
    var rec = api.character();
    var key = 'feature:' + f.key;
    /* The feature that costs a sorcery point spends that, and the tap gives
       one back when there is none left to spend. */
    if (f.cost === 'sp') {
      var out = C.counter.spend(rec, key);
      if (out.ok) {
        C.feedback.spent('sorcery point', 1, out.left);
      } else {
        var back = C.counter.refill(rec, 'sp', 'long');
        C.feedback.back('sorcery point', 1, back.left);
      }
      commitChar();
      C.chrome.bumpSp();
      return;
    }
    var now = C.counter.counterOf(rec, key);
    if (!now || !now.max) return;
    /* A class may say what a use does: a pool spends an amount, and a use
       may heal or say a line of its own. */
    var cls = C.classes ? C.classes.useOf(rec, f.key) : null;
    if (cls && cls.pool && now.left > 0) { openPool(f, cls); return; }
    C.rest.push(api.character());
    /* An empty counter fills to one on the tap, the way the sheet has always
       done it, and a full one gives one back. */
    if (now.left > 0) {
      var out = C.counter.spend(rec, key);
      var line = cls && cls.use ? cls.use(useContext()) : '';
      commitChar();
      if (line) api.toast(line);
      else C.feedback.spent('use', 1, out.left);
      return;
    }
    C.counter.set(rec, key, 1);
    commitChar();
  }

  /* What a class's use can do on the sheet: roll a set and heal the
     character, the hit points held to their maximum. */
  function useContext() {
    return {
      roll: function (text) { return C.R.rollSet(C.R.setIn(text), Math.random); },
      heal: function (n) {
        var hp = api.character().char.hp || (api.character().char.hp = { current: 0, max: 0, temp: 0 });
        var before = hp.current;
        hp.current = C.SR.hpMove(hp, 'heal', n).current;
        return hp.current - before;
      }
    };
  }

  /* A pool spends an amount: a stepper up to what is left, then either the
     character heals by it or it is spent on another creature. */
  function openPool(f, cls) {
    var now = C.counter.counterOf(api.character(), 'feature:' + f.key);
    var n = Math.min(5, now.left);
    function paint() { var v = document.getElementById('poolN'); if (v) v.textContent = String(n); }
    function spend(heal) {
      var rec = api.character();
      C.rest.push(rec);
      C.counter.set(rec, 'feature:' + f.key, now.left - n);
      var got = heal ? useContext().heal(n) : 0;
      api.sheet.close();
      commitChar();
      api.toast(f.name + ' \u2212' + n + (heal ? ', ' + got + ' hit point' + (got === 1 ? '' : 's') + ' back' : '') +
        ' \u00b7 ' + (now.left - n) + ' left of ' + now.max);
    }
    api.sheet.open({
      id: 'pool:' + f.key,
      title: f.name,
      dock: true,
      list: '<div class="bigstep"><button type="button" data-step="-" aria-label="Less">&minus;</button>' +
        '<span class="bigval"><span class="bigk">' + now.left + ' LEFT</span><span id="poolN">' + n + '</span></span>' +
        '<button type="button" data-step="+" aria-label="More">+</button></div>',
      onList: function (ev) {
        var b = ev.target.closest('[data-step]');
        if (!b) return;
        n = Math.max(1, Math.min(now.left, n + (b.dataset.step === '+' ? 1 : -1)));
        paint();
      },
      actions: (cls.heals ? [{ label: 'Heal me', onClick: function () { spend(true); } }] : [])
        .concat([{ label: 'Spend', onClick: function () { spend(false); } }])
    });
  }

  /* The order the cards sit in becomes the order of the list. */
  function saveFeatureOrder(keys) {
    var byKey = {};
    features().forEach(function (f) { byKey[f.key] = f; });
    var others = features().filter(function (f) { return keys.indexOf(f.key) < 0; });
    api.record.slice(api.character(), 'char').features = keys.map(function (k) { return byKey[k]; }).concat(others);
    api.save();
    renderFeatureCards();
  }

  /* ---- the page ---- */

  Sheet.page({
    id: 'features',
    glyph: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z',
    title: 'Features',
    order: 3,
    blurb: 'What the character has and what is left of it.',
    on: true,
    css: [
      '.fpfils{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}',
      '.fpfil{flex:0 0 auto;min-height:32px;padding:0 12px;border:1px solid var(--edge);border-radius:16px;background:none;color:var(--muted);font-family:var(--sans);font-size:12px;cursor:pointer}',
      '.fpfil[aria-pressed="true"]{border-color:rgba(var(--arcane-rgb),.6);background:rgba(var(--arcane-rgb),.16);color:var(--ink)}',
      '.fpcards{display:flex;flex-direction:column;gap:6px}',
      '.fpcard{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 10px;border:1px solid var(--edge);border-radius:6px;background:rgba(255,255,255,.03);cursor:pointer}',
      '.fpbody{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.fpn{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink)}',
      '.fpa{font-size:11.5px;color:var(--ink);opacity:.85}',
      '.fpp{font-size:11px;font-style:italic;color:var(--muted)}',
      '.fpadd{flex:0 0 auto;width:40px;height:40px;border:1px solid rgba(var(--arcane-rgb),.5);border-radius:var(--r-control);background:rgba(var(--arcane-rgb),.14);color:var(--ink);font-size:20px;line-height:1;cursor:pointer}',
      '.fpadd.on{border-color:var(--edge);background:none;color:var(--muted);font-size:16px;cursor:default}',
      '.feff{margin:12px 0 4px;display:flex;flex-direction:column;gap:6px}',
      '.feff .fk{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}',
      '.feff .fwhy{font-size:11.5px;line-height:1.4;color:var(--muted)}',
      '.feff .fwhy.bad{color:rgb(var(--miss-rgb))}',
      '.flist{display:flex;flex-direction:column;gap:2px;flex:0 0 auto}',
      '.frow{display:flex;align-items:center;gap:6px;min-width:0;padding:2px 4px;border:1px solid transparent;border-radius:5px}',
      '.frow .fname{flex:1 1 auto;min-width:0;background:none;border:0;outline:none;color:#b9b3d6;font-family:var(--sans);font-size:11px;padding:0}',
      '.frow .ftag{flex:0 0 auto;border:1px solid var(--edge);border-radius:3px;background:none;color:#6f6a8d;font-size:8.5px;letter-spacing:.06em;padding:2px 4px;cursor:pointer;white-space:nowrap}',
      '.frow .ftag[data-rec="short"]{color:var(--gold);border-color:rgba(var(--gold-rgb),.4)}',
      '.frow .ftag[data-rec="long"]{color:#9dbcff;border-color:rgba(110,155,255,.4)}',
      '.frow .fuse{flex:0 0 auto;min-width:1.5em;border:1px solid var(--edge);border-radius:3px;background:none;color:var(--ink);font-family:var(--display);font-size:13px;padding:1px 2px;cursor:pointer}',
      '.frow .fof{flex:0 0 auto;color:#5c5778;font-size:11px}',
      '.frow .fmax{flex:0 0 auto;width:2.1em;border:0;background:none;color:var(--muted);font-family:var(--display);font-size:12px;text-align:right;outline:none;padding:0}',
      '.frow .fdel{flex:0 0 auto;width:20px;height:20px;border:0;background:none;color:#6f6a8d;font-size:15px;line-height:1;cursor:pointer;padding:0;display:none}',
      '.frow .feye{flex:0 0 auto;width:20px;height:20px;border:0;background:none;color:#6f6a8d;cursor:pointer;padding:0;display:none;align-items:center;justify-content:center}',
      '.frow .feye svg{width:14px;height:14px;display:block}',
      '.frow.hidden{display:none}',
      '.charbody.editing .frow{border-color:var(--edge)}',
      '.charbody.editing .frow .fdel,.charbody.editing .frow .feye{display:flex}',
      '.charbody.editing .frow.hidden{display:flex}',
      '.charbody.editing .frow.hidden .fname,.charbody.editing .frow.hidden .ftag,.charbody.editing .frow.hidden .fuse,.charbody.editing .frow.hidden .fof,.charbody.editing .frow.hidden .fmax{opacity:.4}',
      '.fcard{border:1px solid var(--edge);border-radius:5px;background:rgba(255,255,255,.03);padding:7px 8px}',
      '.fcard .top{display:flex;align-items:center;gap:8px}',
      '.fcard .t{flex:1 1 auto;min-width:0;font-size:12.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}',
      '.fcard .t:active{color:var(--arcane)}',
      '.fcard .fm{display:flex;align-items:flex-start;gap:6px;margin-top:3px;font-size:10px;color:var(--muted);line-height:1.45}',
      '.fcard .fm .fdesc{flex:1 1 auto;min-width:0}',
      '.fcard .fdt{font-style:italic}',
      '.fcard .fdin{width:100%;padding:2px 0;border:0;border-bottom:1px dashed var(--edge);background:none;outline:none;color:var(--ink);font-family:var(--sans);font-size:11px;font-style:italic}',
      '.fcard .fdin::placeholder{color:var(--muted)}',
      '.fcard .src{flex:0 0 auto;font-size:9.5px;color:var(--muted);border:1px solid var(--edge);border-radius:3px;padding:0 4px;white-space:nowrap}',
      '.fcard .src.sorc{color:#ff8fb0;border-color:rgba(255,111,168,.45);background:rgba(255,111,168,.10)}',
      '.fcard .src.warlock{color:#9dbcff;border-color:rgba(110,155,255,.45);background:rgba(110,155,255,.10)}',
      '.fcard .src.izzet{color:#e6ebff;border-color:rgba(140,160,255,.5);background:linear-gradient(90deg,rgba(110,155,255,.26) 0 50%,rgba(255,111,168,.26) 50% 100%)}',
      '.fcard .src.elf{color:#8fe084;border-color:rgba(122,216,111,.45);background:rgba(122,216,111,.10)}',
      '.fcard .src.bard{color:#c9a7ff;border-color:rgba(178,132,255,.45);background:rgba(178,132,255,.10)}',
      '.fcard .feye{flex:0 0 auto;width:18px;height:18px;border:0;background:none;color:#6f6a8d;cursor:pointer;padding:0;display:none;align-items:center;justify-content:center}',
      '.fcard .feye svg{width:12px;height:12px;display:block}',
      '.fnew{display:flex;flex-wrap:wrap;gap:6px}',
      '.fnewtype{border:1px solid var(--edge);border-radius:6px;background:none;color:var(--muted);font-family:var(--sans);font-size:11px;padding:7px 11px;cursor:pointer}',
      '.fnewtype.on{border-color:rgba(122,216,111,.5);background:rgba(122,216,111,.12);color:#8fe084}',
      '.fcard.dragging{opacity:.95;border-color:var(--arcane);box-shadow:0 10px 24px rgba(0,0,0,.55)}',
      '.fcard .fdel{flex:0 0 auto;width:18px;height:18px;border:0;background:none;color:#d08a9c;cursor:pointer;padding:0;display:none;align-items:center;justify-content:center;font-size:16px;line-height:1}',
      '.charbody.editing .fcard .feye,.charbody.editing .fcard .fdel{display:flex}',
      '.fcard .fconfirm{display:none;align-items:center;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid var(--edge);font-size:10.5px;color:var(--muted)}',
      '.fcard.confirming .fconfirm{display:flex}',
      '.fcard .fconfirm button{border:1px solid var(--edge);border-radius:5px;background:none;color:var(--muted);font-family:var(--sans);font-size:10.5px;padding:4px 9px;cursor:pointer}',
      '.fcard .fconfirm button.yes{border-color:rgba(208,138,156,.5);color:#d08a9c}',
      '.fcard .fuses{flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;font-family:var(--display);font-size:12px;color:var(--arcane);border:1px solid var(--edge);border-radius:4px;background:none;padding:3px 6px;cursor:pointer;font-variant-numeric:tabular-nums}',
      '.fcard .fuses .resticon{width:12px;height:12px;color:var(--muted)}',
      '.fcard .fusesin{display:none;flex:0 0 auto;width:2.8em;border:1px solid var(--edge);border-radius:4px;background:none;color:var(--ink);font-family:var(--display);font-size:12px;padding:3px 3px;text-align:center;font-variant-numeric:tabular-nums}',
      '.fcard .fmaxin{display:none;flex:0 0 auto;width:2.8em;border:1px solid var(--edge);border-radius:4px;background:none;color:var(--muted);font-family:var(--display);font-size:12px;padding:3px 3px;text-align:center;font-variant-numeric:tabular-nums}',
      '.fcard .fslash{display:none;flex:0 0 auto;color:#5c5778;font-size:11px}',
      '.fcard .frec{display:none;flex:0 0 auto;font-family:var(--display);font-size:12px;color:var(--muted)}',
      '.charbody.editing .fcard .fuses{display:none}',
      '.charbody.editing .fcard .fusesin,.charbody.editing .fcard .fmaxin,.charbody.editing .fcard .fslash{display:block}',
      '.charbody.editing .fcard .frec{display:inline}',
      '.fcard .fuses.sp{color:var(--gold);border-color:rgba(var(--gold-rgb),.35)}',
      '.fcard.hidden{display:none}',
      '.charbody.editing .fcard.hidden{display:block;opacity:.45}',
    ].join('\n'),
    html: [
      '<div class="charbody" id="featureBody">',
      '  ' + C.chrome.sectionHead('Active', { action: { id: 'addFeature', label: 'Add a feature' } }),
      '  <div class="fcards" id="featureActive"></div>',
      '  ' + C.chrome.sectionHead('Passive'),
      '  <div class="fcards" id="featurePassive"></div>',
      '</div>'
    ].join('\n'),

    mount: function (root, a) {
      /* The page is already on screen from the character it holds, and the
         library only fills the descriptions, so it can wait for the frame. */
      afterPaint(function () { a.core.library.data('features'); });
      api = a;
      E = {
        featureBody: root.querySelector('#featureBody'),
        featureActive: root.querySelector('#featureActive'),
        featurePassive: root.querySelector('#featurePassive'),
        addFeature: root.querySelector('#addFeature')
      };

      E.featureBody.addEventListener('input', function (ev) {
        var roleEl = ev.target.closest ? ev.target.closest('[data-role]') : null;
        if (!roleEl || (roleEl.dataset.role !== 'usesin' && roleEl.dataset.role !== 'maxin' && roleEl.dataset.role !== 'descin')) return;
        var card = roleEl.closest('.fcard');
        if (!card) return;
        var f = featureByKey(card.dataset.key);
        if (!f) return;
        if (roleEl.dataset.role === 'descin') {
          /* The field keeps its caret: the description is kept, not painted. */
          var d = roleEl.value.trim();
          if (d) f.desc = d; else delete f.desc;
          api.save();
          return;
        }
        if (roleEl.dataset.role === 'usesin') {
          f.left = Math.max(0, Math.min(99, Number(roleEl.value) || 0));
        } else if (roleEl.dataset.role === 'maxin') {
          f.max = Math.max(0, Math.min(99, Number(roleEl.value) || 0));
          /* A maximum set by hand is the player's: the class no longer moves it. */
          f.manual = true;
          if (f.left > f.max) f.left = f.max;
        } else return;
        commitChar();
      });

      E.featureBody.addEventListener('click', function (ev) {
        if (drag.wasDragged()) return;
        var card = ev.target.closest('.fcard');
        if (!card) return;
        var f = featureByKey(card.dataset.key);
        if (!f) return;
        /* The eye holds a drawing, so the role is found from the closest
           element that carries one. */
        var roleEl = ev.target.closest ? ev.target.closest('[data-role]') : null;
        var role = roleEl ? roleEl.dataset.role : null;

        if (role === 'uses') { spendFeature(f); return; }
        if (role === 'name') { openFeature(f.key); return; }

        if (!api.editing('features')) return;

        if (role === 'eye') {
          f.hidden = !f.hidden;
          f.toggled = true;
          commitChar();
          return;
        }
        if (role === 'del') {
          deleting = f.key;
          commitChar();
          return;
        }
        if (role === 'no') {
          deleting = null;
          commitChar();
          return;
        }
        if (role === 'yes') {
          var chs = api.record.slice(api.character(), 'char');
          chs.features = features().filter(function (x) { return x.key !== f.key; });
          /* A feature a class brings stays gone once the player removed it. */
          chs.dropped = (chs.dropped || []).concat([f.key]);
          deleting = null;
          commitChar();
        }
      });

      /* The cards can be dragged to reorder them, and the order is the
         record's. */
      var drag = D.list(E.featureBody, {
        row: '.fcard',
        key: 'key',
        ignore: 'input, button',
        layout: 'list',
        onOrder: saveFeatureOrder
      });

      E.addFeature.addEventListener('click', function () { openFeaturePicker(); });
    },

    /* The wrench edits the features, and the shell keeps the flag and the
       pressed state. */
    head: function (root, a) {
      api = a;
      root.appendChild(a.wrench({ label: 'Edit the features' }));
    },

    render: function (a) {
      api = a;
      /* The cards are built for one character and for the features it
         holds. Playing another one builds its own list, so the first
         character's cards never stay on screen, and a feature plugged into
         the character while it is on screen gets a card of its own. */
      a.paint([a.state.current, features().map(function (f) { return f.key; })], {
        build: buildFeatureCards,
        render: renderFeatureCards
      });
    }
  });
})();
