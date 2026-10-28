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
  /* The bestiary is a file beside the page, and this is what it fills. */
  C.library.data('bestiary', function (value) {
    C.library.bestiary.creatures = value.creatures || {};
  });

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

  /* ---- the creatures the app knows ---- */

  function library() { return (C.library.bestiary && C.library.bestiary.creatures) || {}; }

  /* A creature is found by the name the data carries, which is the lowercased
     name. The name of a creature may carry its size, as the animated objects
     do, so a name that is not there is looked for without it. */
  function creatureByName(name) {
    if (!name) return null;
    var all = library();
    var key = String(name).toLowerCase();
    if (all[key]) return all[key];
    var bare = key.replace(/\s*\([^)]*\)\s*$/, '');
    if (all[bare]) return all[bare];
    var keys = Object.keys(all);
    for (var i = 0; i < keys.length; i++) {
      if (String(all[keys[i]].name || '').toLowerCase() === key) return all[keys[i]];
    }
    return null;
  }

  function keyOf(block) {
    var all = library();
    var keys = Object.keys(all);
    for (var i = 0; i < keys.length; i++) {
      if (all[keys[i]] === block) return keys[i];
    }
    return '';
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

  /* ---- the numbers of a summon ---- */

  /* What the block of a creature says, worked out with the level of the
     calling spell, the proficiency of the caster and the levels of the
     classes the block names. */
  function context(card) {
    var ch = (api.character().char) || {};
    return {
      level: card.slot >= 0 ? card.slot : null,
      prof: (C.SR && C.SR.profBonus && ch.level) ? C.SR.profBonus(ch.level) : null,
      classLevel: function (name) {
        var found = null;
        (ch.classes || []).forEach(function (k) {
          if (found === null && String(k.name || '').toLowerCase() === name) found = Number(k.level) || 0;
        });
        return found;
      },
      mod: function (ability) {
        var score = Number((ch.abilities || {})[ability]);
        if (!score) return null;
        return C.SR && C.SR.abilityMod ? C.SR.abilityMod(score) : 0;
      }
    };
  }

  /* The terms of a formula, added up. A number the book does not give is
     not a number the app can make up. */
  function evalTerms(terms, ctx) {
    if (!terms || !terms.length) return null;
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (t.const !== undefined) { total += t.const; continue; }
      if (t.level) { if (ctx.level === null) return null; total += ctx.level; continue; }
      if (t.perLevel) { if (ctx.level === null) return null; total += t.perLevel * ctx.level; continue; }
      if (t.perLevelAbove) {
        if (ctx.level === null) return null;
        total += t.perLevelAbove * Math.max(0, ctx.level - t.above);
        continue;
      }
      if (t.prof) { if (ctx.prof === null) return null; total += ctx.prof; continue; }
      if (t.ability) {
        var mod = ctx.mod(t.ability);
        if (mod === null) return null;
        total += mod;
        continue;
      }
      if (t.class) {
        var lv = ctx.classLevel(t.class);
        if (lv === null) return null;
        total += (t.per || 1) * lv;
        continue;
      }
      return null;
    }
    return total;
  }

  /* The branch of a formula that belongs to a form: the block of the battle
     familiar says "30 (Brute only) or 20 (Flyer or Stalker only)". */
  function branchFor(formula, formName) {
    if (!formula || !formula.branches || !formula.branches.length) return null;
    if (formula.branches.length === 1) return formula.branches[0];
    var needle = String(formName || '').toLowerCase();
    for (var i = 0; i < formula.branches.length; i++) {
      var words = String(formula.branches[i].qualifier || '').toLowerCase()
        .replace(/only/g, '').split(/[^a-z0-9]+/).filter(Boolean);
      for (var j = 0; j < words.length; j++) {
        if (words[j] === needle) return formula.branches[i];
      }
    }
    return formula.branches[0];
  }

  /* The damage of an attack, with the level of the slot in it. */
  function deriveDamage(parts, ctx) {
    if (!parts || !parts.dice) return null;
    var count = parts.dice.count;
    if (parts.dice.levelCount !== undefined) {
      if (ctx.level === null) return null;
      count = Math.max(1, ctx.level + parts.dice.levelCount);
    }
    if (count === undefined || count === null) return null;
    var flat = evalTerms(parts.flat || [], ctx);
    if (flat === null) return null;
    var text = count + 'd' + parts.dice.size;
    if (flat) text += ' + ' + flat;
    return text;
  }

  /* The attack of a spell, which carries the attack of the caster. */
  function deriveBonus(a, ctx) {
    if (a.bonus) return a.bonus;
    if (!/spell attack modifier/i.test(a.text || '')) return '';
    var ch = api.character().char || {};
    if (!ch.level || !C.SR || !C.SR.spellAttack) return '';
    var bonus = C.SR.spellAttack(ch, C.library.primaryAbility ? C.library.primaryAbility(ch) : 'cha');
    return (bonus >= 0 ? '+' : '') + bonus;
  }

  /* How many attacks a multiattack makes at this level. */
  function deriveCount(count, ctx) {
    if (!count) return null;
    if (count.half) {
      if (ctx.level === null) return null;
      return Math.floor(ctx.level / 2);
    }
    return null;
  }

  /* Everything the card of a summon shows, worked out of its block, the form
     it took and the slot that paid for it. */
  function derive(card) {
    var block = library()[card.key];
    if (!block) return null;
    var form = null;
    if (block.forms) {
      block.forms.forEach(function (f) { if (f.id === card.form) form = f; });
      if (!form) form = block.forms[0];
    }
    var ctx = context(card);
    var name = form ? form.name : '';
    var ac = evalTerms((branchFor(form ? form.acTerms : block.acTerms, name) || {}).terms, ctx);
    var hp = evalTerms((branchFor(form ? form.hpTerms : block.hpTerms, name) || {}).terms, ctx);
    var raw = form ? form.actions : block.actions;
    /* The multiattack says how many attacks the creature makes, so every
       attack of that creature is made that many times. */
    var multi = null;
    raw.forEach(function (a) { if (a.count) multi = deriveCount(a.count, ctx); });
    var actions = raw.map(function (a) {
      return {
        name: a.name,
        text: a.text,
        bonus: deriveBonus(a, ctx),
        damage: deriveDamage(a.damageParts, ctx) || a.damage || '',
        count: deriveCount(a.count, ctx),
        type: a.type || '',
        attack: /^(Melee|Ranged) (weapon |spell )?attack:/i.test(a.text || ''),
        multi: a.count ? null : multi
      };
    });
    return { ac: ac, hpMax: hp, actions: actions, form: form, block: block };
  }

  /* The levels a slot may take: from the level of the spell that called
     the creature to the highest slot the character has left. A creature a
     feature brings has no level at all, and then there is nothing to move. */
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
    var before = derive(card);
    var full = !!(before && before.hpMax !== null && before.hpMax !== undefined &&
      card.hp === before.hpMax);
    change();
    var after = derive(card);
    if (full && after && after.hpMax !== null && after.hpMax !== undefined) card.hp = after.hpMax;
  }

  /* ---- the stat block of the creature ---- */

  /* A list the book writes, as a line of text. */
  function listText(list) {
    if (!list || !list.length) return '';
    return list.map(function (x) {
      return x.note ? x.text + ' (' + x.note + ')' : x.text;
    }).join(', ');
  }

  /* The proficiency of the caster, which the creatures of a summon are
     bound to. */
  function profOf() {
    var rec = api.character() || {};
    var ch = rec.char || {};
    return (C.SR && C.SR.profBonus && ch.level) ? C.SR.profBonus(ch.level) : 0;
  }

  /* A number with its sign, the way the app writes them. */
  function sign(n) {
    n = Number(n) || 0;
    return (n > 0 ? '+' : '') + n;
  }

  /* The key of an ability, from the name the book writes. */
  function shortKey(name) {
    var key = String(name || '').toLowerCase();
    var found = '';
    (C.SR.ABILITIES || []).forEach(function (a) { if (a.long.toLowerCase() === key) found = a.key; });
    return found || key;
  }

  /* The saving throw the book writes, with the words of the caster put
     right: a bonus that rides on the proficiency of the caster. */
  function saveValue(text) {
    var raw = String(text || '').replace(/PB/i, String(profOf()));
    var bits = raw.match(/[+-]?\d+/g);
    if (!bits) return null;
    var total = 0;
    bits.forEach(function (x) { total += Number(x); });
    return total;
  }

  /* The saving throw of an ability: the modifier of the ability, and
     whether the creature is proficient in it. The book decides to begin
     with, and the player can say otherwise. */
  function saveState(card, block, key, mod) {
    var book = null;
    (block.saves || []).forEach(function (s) { if (s.key === key) book = s; });
    var on = card.saves && card.saves[key] !== undefined ? !!card.saves[key] : !!book;
    var value = mod;
    if (on) {
      value = book ? saveValue(book.value) : mod + profOf();
    }
    if (value === null || !isFinite(value)) value = mod;
    return { on: on, value: value };
  }

  /* The abilities, at the top of the block: the names above the scores and
     the saving throws under them, the way a stat block writes them. The
     dot is a proficiency, the way it is on the sheet of a character. */
  function abilityRow(card, block) {
    var scores = {};
    (block.ability || []).forEach(function (a) { scores[shortKey(a.name)] = a.score; });
    var names = '', values = '', saves = '';
    (C.SR.ABILITIES || []).forEach(function (a) {
      var score = scores[a.key];
      if (score === undefined) return;
      var mod = C.SR && C.SR.abilityMod ? C.SR.abilityMod(score) : Math.floor((score - 10) / 2);
      var save = saveState(card, block, a.key, mod);
      names += '<span>' + C.chrome.esc(a.name) + '</span>';
      values += '<span>' + score + '<em>' + sign(mod) + '</em></span>';
      saves += '<span class="sabsave' + (save.on ? ' on' : '') + '"><button type="button" class="savetog' + (save.on ? ' on' : '') + '" ' +
        'data-save="' + a.key + '" aria-label="Proficient in the ' + a.long + ' saving throw"></button>' +
        sign(save.value) + '</span>';
    });
    if (!names) return '';
    return '<div class="sabil">' +
      '<div class="sabrow sab-h">' + names + '</div>' +
      '<div class="sabrow sab-v">' + values + '</div>' +
      '<div class="sabrow sab-s">' + saves + '</div></div>';
  }

  /* One named thing of the block: its name and what it says. */
  function statLine(name, text) {
    if (!text) return '';
    return '<p><b>' + C.chrome.esc(name) + '.</b> ' + C.chrome.markup(text) + '</p>';
  }

  /* The fields of the block: the numbers and the words around them. */
  function statFields(block, out, card) {
    var form = out ? out.form : null;
    /* The numbers of the card are the numbers of the block at the slot it
       was called with. */
    var ac = out && out.ac !== null && out.ac !== undefined ? out.ac : (form && form.ac ? form.ac : block.ac);
    var hp = out && out.hpMax !== null && out.hpMax !== undefined ? out.hpMax : (form && form.hp ? form.hp : block.hp);
    var acText = form && form.acText ? form.acText : block.acText;
    var hpText = form && form.hpText ? form.hpText : block.hpText;
    /* The initiative is the dexterity of the creature, unless the book says
       otherwise: a monster may be proficient in initiative, or expert in
       it, and some have advantage on it. */
    var dex = 0;
    (block.ability || []).forEach(function (a) {
      if (shortKey(a.name) === 'dex') dex = C.SR && C.SR.abilityMod ? C.SR.abilityMod(a.score) : Math.floor((a.score - 10) / 2);
    });
    var init = block.initiative;
    var initText = sign(init ? init.value : dex) + (init && init.advantage ? ' (adv)' : '');
    var cr = block.cr ? block.cr + ' (' + (block.xp || 0) + ' XP)' : 'None (XP 0)';
    /* The form has its own speed: the brute and the stalker of the battle
       familiar do not fly, and only the flyer does. */
    var speed = form && form.speed ? form.speed : block.speed;
    return abilityRow(card, block) +
      C.chrome.field('Speed', speed) +
      C.chrome.field('Initiative', initText) +
      C.chrome.field('Resistance', listText(block.resist)) +
      C.chrome.field('Vuln.', listText(block.vulnerable)) +
      C.chrome.field('Immune', listText(block.immune)) +
      C.chrome.field('Cond.Imm', listText(block.conditionImmune)) +
      '<div class="sspace"></div>' +
      C.chrome.field('Senses', listText(block.senses), '', true) +
      C.chrome.field('Skills', listText(block.skills), '', true) +
      '<div class="sspace"></div>' +
      C.chrome.field('AC', acText ? ac + ' (' + acText + ')' : String(ac || ''), '', true) +
      C.chrome.field('HP', hpText ? hp + ' (' + hpText + ')' : String(hp || ''), '', true) +
      '<div class="sspace"></div>' +
      C.chrome.field('Lang.', block.languages, '', true) +
      C.chrome.field('Align', block.alignment) +
      C.chrome.field('CR', cr);
  }

  /* The text of the block: the traits, the actions and the rest. Every
     section of the block has one on the form too, so the bonus actions, the
     reactions and the spellcasting of the creature that was called are the
     ones the form has: the steed keeps one of its three. */
  function statText(block, out, card) {
    var form = out ? out.form : null;
    var actions = form ? form.actions : block.actions;
    var traits = form ? form.traits : block.traits;
    var bonus = form && form.bonusActions ? form.bonusActions : block.bonusActions;
    var reactions = form && form.reactions ? form.reactions : block.reactions;
    var legendary = form && form.legendary ? form.legendary : block.legendary;
    var casting = form && form.spellcasting ? form.spellcasting : block.spellcasting;
    var html = '';
    function section(title, list) {
      if (!list || !list.length) return;
      html += '<h3>' + C.chrome.esc(title) + '</h3>';
      list.forEach(function (x) { html += statLine(x.name, spoken(x.text)); });
    }
    section('Traits', traits);
    section('Actions', actions);
    section('Bonus Actions', bonus);
    section('Reactions', reactions);
    section('Legendary Actions', legendary);
    if (casting && casting.length) {
      html += '<h3>Spellcasting</h3>';
      casting.forEach(function (x) {
        html += '<p><b>' + C.chrome.esc(x.name) + '.</b> ' + C.chrome.markup(spoken(x.header)) + '</p>';
        if (x.text) html += '<p>' + C.chrome.markup(spoken(x.text)) + '</p>';
      });
    }
    return html;
  }

  /* The full description shows the words of the book, not the numbers they
     work out to: the spell's level stays the spell's level, and the
     proficiency of the caster stays PB. The card itself carries the numbers
     the creature was called with. */
  function spoken(text) {
    return String(text || '').replace(/summonSpellLevel/gi, "the spell's level");
  }

  /* The stat block of the creature, in the overlay of the app. */
  function openStat(card) {
    var block = library()[card.key];
    if (!block) { api.toast('the app does not carry its block'); return; }
    var out = derive(card);
    api.sheet.open({
      id: 'stat:' + card.key,
      title: block.name,
      tag: (block.size ? block.size + ' ' : '') + block.type,
      metaClass: 'sheet-meta statmeta',
      meta: statFields(block, out, card),
      text: statText(block, out, card),
      onPaint: function (root) {
        /* The dot of a saving throw says the creature is proficient in it, and
           the book decides to begin with. */
        var dots = root.querySelectorAll('[data-save]');
        Array.prototype.forEach.call(dots, function (dot) {
          dot.addEventListener('click', function () {
            var key = dot.dataset.save;
            var on = saveState(card, block, key, 0).on;
            if (!card.saves) card.saves = {};
            card.saves[key] = !on;
            api.save();
            openStat(card);
          });
        });
      }
    });
  }
  /* ---- the cards ---- */

  /* The type of a damage. The book says it, and an action that gives hit
     points back is a healing whatever it does not say. The colour it wears
     is the attack box's. */
  function damageType(a) {
    if (a.type) return a.type;
    if (/regain|restore|heal/i.test(a.text || '')) return 'healing';
    return '';
  }

  /* The rolls an attack holds: one per swing of the attack. */
  function rollsOf(card, name) {
    var v = card.rolls ? card.rolls[name] : null;
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }

  /* The number of the bonus, when the book writes one. */
  function bonusOf(text) {
    if (text === undefined || text === null || text === '') return null;
    var n = Number(String(text).replace(/[^0-9.+-]/g, ''));
    return isFinite(n) ? n : null;
  }

  /* The kind of an attack and how far it reaches. */
  function attackKind(a) {
    var m = String(a.text || '').match(/^((?:Melee|Ranged)\s+(?:weapon\s+|spell\s+)?attack)/i);
    return m ? m[1] : '';
  }

  function attackRange(a) {
    var t = String(a.text || '');
    var m = t.match(/\brange\s+([^.;,]+)/i);
    if (m) return m[1].trim();
    m = t.match(/\breach\s+([^.;,]+)/i);
    if (m) return 'reach ' + m[1].trim();
    return '';
  }

  /* A formula without the spaces around the plus. */
  function compact(text) {
    return String(text || '').replace(/\s*\+\s*/g, '+').trim();
  }

  /* One swing of an attack: the attack box, with the numbers of the block
     and the roll it kept. The box is the block's; the numbers are this
     page's. */
  function swingBlock(a, edit, res, ix) {
    var bonus = edit && edit.bonus !== undefined && edit.bonus !== '' ? edit.bonus : a.bonus;
    var damage = edit && edit.damage !== undefined && edit.damage !== '' ? edit.damage : a.damage;
    var type = damageType(a);
    return C.horizontalAttackBox.swing({
      name: a.name,
      kind: attackKind(a),
      bonus: bonus,
      bonusOf: bonusOf(bonus),
      range: attackRange(a),
      damage: compact(damage),
      type: type,
      groups: res ? res.groups : (C.R && C.R.diceIn ? C.R.diceIn(damage || '') : []),
      flat: res ? res.flat : (C.R && C.R.flatIn ? C.R.flatIn(damage || '') : 0),
      res: res,
      ix: ix
    });
  }

  /* The same box with the wrench on: the numbers are fields. */
  function editBlock(a, edit) {
    var bonus = edit && edit.bonus !== undefined && edit.bonus !== '' ? edit.bonus : a.bonus;
    var damage = edit && edit.damage !== undefined && edit.damage !== '' ? edit.damage : a.damage;
    var type = damageType(a);
    return C.horizontalAttackBox.edit({
      name: a.name,
      kind: attackKind(a),
      bonus: bonus,
      damage: damage,
      type: type,
      range: attackRange(a)
    });
  }

  /* All the swings of an attack, under the one name of the attack. */
  function attackGroup(a, edit, rolls) {
    var out = '<div class="sgroup">';
    if (api.editing('summons')) {
      out += editBlock(a, edit);
    } else {
      var swings = a.multi && a.multi > 0 ? a.multi : 1;
      for (var i = 0; i < swings; i++) out += swingBlock(a, edit, rolls[i] || null, i);
    }
    out += '</div>';
    return out;
  }
  /* An action that can be used a number of times a day, like the healing
     touch of a spirit. The book says so in the name of the action. */
  function limitedOf(a) {
    var m = String(a.name || '').match(/\((\d+)\s*\/\s*Day\)/i);
    if (!m) return null;
    return { max: Number(m[1]) || 1, name: String(a.name || '').replace(/\s*\([^)]*\)\s*$/, '') };
  }

  /* An action that is not an attack: a healing, a touch. It shows its dice
     and it does not roll. */
  function noteRow(a, edit, uses) {
    var damage = edit && edit.damage !== undefined && edit.damage !== '' ? edit.damage : a.damage;
    var type = damageType(a);
    var limit = limitedOf(a);
    var label = limit ? limit.name : a.name;
    var out = '<div class="snoteblock" data-name="' + C.chrome.esc(a.name) + '">' +
      '<span class="satkname">' + C.chrome.esc(label) + '</span>';
    if (limit) {
      var u = uses ? uses[a.name] : null;
      var left = u ? Number(u.left) || 0 : limit.max;
      out += '<button type="button" class="suses' + (left ? '' : ' out') + '" data-role="use" ' +
        'aria-label="Use the ' + C.chrome.esc(label) + '">' + left + '/' + limit.max + '</button>';
    }
    if (api.editing('summons')) {
      out += '<input class="scin satkdamage" data-role="atkdamage" type="text" value="' + C.chrome.esc(damage) + '" aria-label="Damage of the action">';
    } else if (damage) {
      out += '<span class="sformula">' + C.chrome.esc(compact(damage)) + '</span>';
    }
    if (type) out += '<em class="stype" style="color:' + C.horizontalAttackBox.colour(type) + '">' + C.chrome.esc(type) + '</em>';
    out += '</div>';
    return out;
  }

  function cardHtml(s) {
    var block = library()[s.key];
    var out = derive(s);
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
        if (!a.attack) return noteRow(a, edit[a.name], s.uses);
        return attackGroup(a, edit[a.name], rollsOf(s, a.name));
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
      var name = card.source.slice(6);
      var spell = C.library.bookByName[name];
      if (!spell) { api.toast('the book does not have it'); return; }
      api.sheet.open({
        id: 'summonspell:' + name,
        title: spell.name,
        meta: C.chrome.field('Level', spell.level) + C.chrome.field('Range', spell.range) +
          C.chrome.field('Duration', spell.duration) +
          C.chrome.field('Conc', spell.concentration ? 'Yes' : 'No', spell.concentration ? 'yes' : ''),
        text: C.chrome.renderBlocks(spell.blocks)
      });
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
    var full = derive(s);
    if (full && full.hpMax !== null && full.hpMax !== undefined) s.hp = full.hpMax;
    /* The actions that can be used a number of times a day come with their
       uses, and they are spent one by one. */
    (full ? full.actions : []).forEach(function (a) {
      var limit = limitedOf(a);
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
        var block = creatureByName(name);
        if (!block) return;
        var key = keyOf(block);
        /* What the creature was called with last time, if it was called at
           all, and the form is dropped when the book no longer has it. */
        var last = picks()[pickKey({ source: src.id, key: key })] || null;
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
        var full = derive(draft);
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
      var block = creatureByName(name);
      return { key: keyOf(block), name: block ? block.name : name, cr: block ? block.cr : '' };
    });
    if (!rows.length) {
      /* A source that names nothing leaves the choice to the player, so the
         whole library is offered. */
      rows = Object.keys(library()).map(function (key) {
        var block = library()[key];
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
        var block = library()[picked.key];
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

  /* ---- the roll of an attack ---- */

  function roll(card, name, ix) {
    var out = derive(card);
    if (!out) return;
    var action = null;
    out.actions.forEach(function (a) { if (a.name === name) action = a; });
    if (!action || !action.attack) return;
    var edit = (card.edit && card.edit.attacks && card.edit.attacks[name]) || {};
    var bonus = edit.bonus !== undefined && edit.bonus !== '' ? edit.bonus : action.bonus;
    var damage = edit.damage !== undefined && edit.damage !== '' ? edit.damage : action.damage;
    var result = C.R.rollAttack(bonus, damage, !!card.adv);
    if (!card.rolls) card.rolls = {};
    var list = rollsOf(card, name);
    while (list.length <= ix) list.push(null);
    list[ix] = result;
    card.rolls[name] = list;
    api.markDirty('cards');
    commit();
    /* The swing says what it gave, in the one line the app gives feedback
       with. The cards are written again with the roll under them, so the
       outline goes on the box that is on the screen after that, not on the one
       the finger left behind. */
    C.feedback.roll(name, result);
    var shown = E.list && E.list.querySelectorAll ? E.list.querySelectorAll('.sblock[data-name]') : [];
    for (var k = 0; k < shown.length; k++) {
      if (shown[k].dataset && shown[k].dataset.name === name &&
        Number(shown[k].dataset.ix || 0) === ix) { C.feedback.tap(shown[k]); break; }
    }
    if (navigator.vibrate) navigator.vibrate(result.crit ? [14, 45, 14] : 16);
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
      '.satk{display:flex;flex-direction:column;gap:6px}',
      '.sgroup{display:flex;flex-direction:column;gap:4px}',
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
      '.satkname{flex:1 1 auto;min-width:0;font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.sabil{grid-column:1 / -1;display:flex;flex-direction:column;gap:2px;margin:0 0 3px}',
      '.sabrow{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}',
      '.sab-h span{font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#635e7e;text-align:center}',
      '.sab-v span{font-family:var(--display);font-size:15px;line-height:1.1;color:var(--ink);text-align:center;font-variant-numeric:tabular-nums}',
      '.sab-v em{font-style:normal;font-family:var(--sans);font-size:9px;color:var(--muted);margin-left:2px}',
      '.sab-s span{display:flex;align-items:center;justify-content:center;gap:4px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}',
      '.sabsave.on{color:var(--gold)}',
      '.savetog{width:7px;height:7px;flex:0 0 auto;border-radius:50%;border:1px solid #453f63;background:none;padding:0;cursor:pointer}',
      '.savetog.on{background:var(--gold);border-color:var(--gold);box-shadow:0 0 6px rgba(var(--gold-rgb),.45)}',
      '.sspace{grid-column:1 / -1;height:3px}',
      '.statmeta .f{grid-template-columns:5.4em minmax(0,1fr)}',
      '.suses{border:1px solid var(--edge);border-radius:999px;background:none;color:var(--ink);font:inherit;font-size:10.5px;line-height:1.4;padding:1px 9px;cursor:pointer;font-variant-numeric:tabular-nums}',
      '.suses.out{color:#6f6a8d}',
      '.schip{border:1px solid var(--edge);border-radius:999px;background:none;color:var(--muted);font:inherit;font-size:10px;letter-spacing:.08em;line-height:1.4;padding:2px 9px;margin-left:auto;cursor:pointer;white-space:nowrap}',
      '.schip.on{border-color:rgba(var(--arcane-rgb),.55);color:var(--arcane);background:rgba(var(--arcane-rgb),.12)}',
      '.snoteblock{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;font-size:12px}',
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
        roll(s, name, ix);
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
            var blk = library()[s.key];
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
          if (role === 'stat') { openStat(s); return; }
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
            var done = rollsOf(s, first.dataset.name);
            var swings = group.querySelectorAll('.sblock').length;
            var at = 0;
            for (var i = 0; i < swings; i++) { if (!done[i]) { at = i; break; } }
            roll(s, first.dataset.name, at);
            return;
          }
        }
        /* Anywhere else on the card is the stat block, which is the thing a
           player wants from a creature at the table. */
        openStat(s);
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
      Object.keys(library()).length,
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
