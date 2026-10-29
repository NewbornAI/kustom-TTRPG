/* The creature: a block of the bestiary as a page holds it.

   The summons calls one to the table and the fight tracks one, so the
   numbers of a block, its stat block and its attack boxes are one module.
   A card is the record a page keeps of a creature: the key of its block, the
   form it took, the slot that paid for it, its hit points, the rolls of its
   attacks and the saving throws the player moved.

   Nothing here writes to the store. A page hands its api and the module
   saves through it, so the same block is read the same way by every page. */
(function (root) {
  'use strict';

  root.SheetCreature = function (getCore) {
    function C() { return getCore(); }

    /* ---- the blocks of the bestiary ---- */

    function library() {
      var core = C();
      return (core.library.bestiary && core.library.bestiary.creatures) || {};
    }

    function index() {
      var core = C();
      return (core.library.bestiary && core.library.bestiary.byName) || {};
    }

    /* The block of a key. The blocks are keyed by the name and the book, and a
       name keeps one block, the newest printing. A card written against a
       printing the corpus no longer holds (the 2014 skeleton, or a key from
       before the corpus held every book) finds its creature by name, since the
       name is the part of the key before the book. */
    function block(key) {
      if (!key) return null;
      var all = library();
      var found = all[key];
      if (found) return found;
      var byKey = index()[key];
      if (byKey && all[byKey]) return all[byKey];
      return byName(String(key).split('|')[0]);
    }

    /* A creature is found by the name the data carries, which is the
       lowercased name. The name of a creature may carry its size, as the
       animated objects do, so a name that is not there is looked for
       without it. */
    function byName(name) {
      if (!name) return null;
      var all = library();
      var key = String(name).toLowerCase();
      var byKey = index();
      if (byKey[key] && all[byKey[key]]) return all[byKey[key]];
      var bare = key.replace(/\s*\([^)]*\)\s*$/, '');
      if (byKey[bare] && all[byKey[bare]]) return all[byKey[bare]];
      var keys = Object.keys(all);
      for (var i = 0; i < keys.length; i++) {
        if (String(all[keys[i]].name || '').toLowerCase() === key) return all[keys[i]];
      }
      return null;
    }

    /* The key of a block, which is its name and its book. */
    function keyOf(block) {
      if (!block) return '';
      var out = String(block.name || '').toLowerCase() + '|' + String(block.source || '').toLowerCase();
      if (library()[out]) return out;
      var all = library();
      var keys = Object.keys(all);
      for (var i = 0; i < keys.length; i++) {
        if (all[keys[i]] === block) return keys[i];
      }
      return out;
    }

    /* ---- the numbers of a block ---- */

    /* The modifier of the dexterity of the creature. */
    function dexOf(block) {
      var core = C();
      var dex = 0;
      ((block && block.ability) || []).forEach(function (a) {
        if (String(a.name || '').toLowerCase() === 'dexterity') {
          dex = core.SR && core.SR.abilityMod ? core.SR.abilityMod(a.score) : Math.floor((a.score - 10) / 2);
        }
      });
      return dex;
    }

    /* The initiative of a creature: the book's own when it gives one, which
       may be proficient or expert or at advantage, and the dexterity
       otherwise. */
    function initBonus(block) {
      if (!block) return 0;
      return block.initiative ? Number(block.initiative.value) || 0 : dexOf(block);
    }

    /* The armour class and the hit points of a block, at the slot a card was
       called with when it has one. */
    function acOf(block, out) {
      var form = out && out.form;
      var ac = out && out.ac !== null && out.ac !== undefined ? out.ac : (form && form.ac ? form.ac : block.ac);
      return ac === null || ac === undefined ? 0 : ac;
    }

    function hpOf(block, out) {
      var form = out && out.form;
      var hp = out && out.hpMax !== null && out.hpMax !== undefined ? out.hpMax : (form && form.hp ? form.hp : block.hp);
      return hp === null || hp === undefined ? 0 : hp;
    }

    /* What the block of a creature says, worked out with the level of the
       calling spell, the proficiency of the caster and the levels of the
       classes the block names. */
    function context(card, api) {
      var core = C();
      var ch = (api.character().char) || {};
      return {
        level: card.slot >= 0 ? card.slot : null,
        prof: (core.SR && core.SR.profBonus && ch.level) ? core.SR.profBonus(ch.level) : null,
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
          return core.SR && core.SR.abilityMod ? core.SR.abilityMod(score) : 0;
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
    function deriveBonus(a, ctx, api) {
      if (a.bonus) return a.bonus;
      if (!/spell attack modifier/i.test(a.text || '')) return '';
      var core = C();
      var ch = api.character().char || {};
      if (!ch.level || !core.SR || !core.SR.spellAttack) return '';
      var bonus = core.SR.spellAttack(ch, core.library.primaryAbility ? core.library.primaryAbility(ch) : 'cha');
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

    /* Everything a page shows of a creature, worked out of its block, the
       form it took and the slot that paid for it. */
    function derive(card, api) {
      var found = block(card.key);
      if (!found) return null;
      var form = null;
      if (found.forms) {
        found.forms.forEach(function (f) { if (f.id === card.form) form = f; });
        if (!form) form = found.forms[0];
      }
      var ctx = context(card, api);
      var name = form ? form.name : '';
      var ac = evalTerms((branchFor(form ? form.acTerms : found.acTerms, name) || {}).terms, ctx);
      var hp = evalTerms((branchFor(form ? form.hpTerms : found.hpTerms, name) || {}).terms, ctx);
      var raw = form ? form.actions : found.actions;
      /* The multiattack says how many attacks the creature makes, so every
         attack of that creature is made that many times. */
      var multi = null;
      raw.forEach(function (a) { if (a.count) multi = deriveCount(a.count, ctx); });
      var actions = raw.map(function (a) {
        return {
          name: a.name,
          text: a.text,
          bonus: deriveBonus(a, ctx, api),
          damage: deriveDamage(a.damageParts, ctx) || a.damage || '',
          count: deriveCount(a.count, ctx),
          type: a.type || '',
          attack: /^(Melee|Ranged)( or (Melee|Ranged))? (weapon |spell )?attack:/i.test(a.text || ''),
          multi: a.count ? null : multi
        };
      });
      return { ac: ac, hpMax: hp, actions: actions, form: form, block: found };
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
    function profOf(api) {
      var core = C();
      var rec = api.character() || {};
      var ch = rec.char || {};
      return (core.SR && core.SR.profBonus && ch.level) ? core.SR.profBonus(ch.level) : 0;
    }

    /* A number with its sign, the way the app writes them. */
    function sign(n) {
      n = Number(n) || 0;
      return (n > 0 ? '+' : '') + n;
    }

    /* The key of an ability, from the name the book writes. */
    function shortKey(name) {
      var core = C();
      var key = String(name || '').toLowerCase();
      var found = '';
      (core.SR.ABILITIES || []).forEach(function (a) { if (a.long.toLowerCase() === key) found = a.key; });
      return found || key;
    }

    /* The saving throw the book writes, with the words of the caster put
       right: a bonus that rides on the proficiency of the caster. */
    function saveValue(text, api) {
      var raw = String(text || '').replace(/PB/i, String(profOf(api)));
      var bits = raw.match(/[+-]?\d+/g);
      if (!bits) return null;
      var total = 0;
      bits.forEach(function (x) { total += Number(x); });
      return total;
    }

    /* The saving throw of an ability: the modifier of the ability, and
       whether the creature is proficient in it. The book decides to begin
       with, and the player can say otherwise. */
    function saveState(card, found, key, mod, api) {
      var book = null;
      (found.saves || []).forEach(function (s) { if (s.key === key) book = s; });
      var on = card.saves && card.saves[key] !== undefined ? !!card.saves[key] : !!book;
      var value = mod;
      if (on) {
        value = book ? saveValue(book.value, api) : mod + profOf(api);
      }
      if (value === null || !isFinite(value)) value = mod;
      return { on: on, value: value };
    }

    /* The abilities, at the top of the block: the names above the scores and
       the saving throws under them, the way a stat block writes them. The
       dot is a proficiency, the way it is on the sheet of a character. */
    function abilityRow(card, found, api) {
      var core = C();
      var scores = {};
      (found.ability || []).forEach(function (a) { scores[shortKey(a.name)] = a.score; });
      var names = '', values = '', saves = '';
      (core.SR.ABILITIES || []).forEach(function (a) {
        var score = scores[a.key];
        if (score === undefined) return;
        var mod = core.SR && core.SR.abilityMod ? core.SR.abilityMod(score) : Math.floor((score - 10) / 2);
        var save = saveState(card, found, a.key, mod, api);
        names += '<span>' + core.chrome.esc(a.name) + '</span>';
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
      return '<p><b>' + C().chrome.esc(name) + '.</b> ' + C().chrome.markup(text) + '</p>';
    }

    /* The fields of the block: the numbers and the words around them. */
    function statFields(found, out, card, api) {
      var core = C();
      var form = out ? out.form : null;
      /* The numbers of the card are the numbers of the block at the slot it
         was called with. */
      var ac = acOf(found, out);
      var hp = hpOf(found, out);
      var acText = form && form.acText ? form.acText : found.acText;
      var hpText = form && form.hpText ? form.hpText : found.hpText;
      var init = found.initiative;
      var initText = sign(initBonus(found)) + (init && init.advantage ? ' (adv)' : '');
      var cr = found.cr ? found.cr + ' (' + (found.xp || 0) + ' XP)' : 'None (XP 0)';
      /* The form has its own speed: the brute and the stalker of the battle
         familiar do not fly, and only the flyer does. */
      var speed = form && form.speed ? form.speed : found.speed;
      return abilityRow(card, found, api) +
        core.chrome.field('Speed', speed) +
        core.chrome.field('Initiative', initText) +
        core.chrome.field('Resistance', listText(found.resist)) +
        core.chrome.field('Vuln.', listText(found.vulnerable)) +
        core.chrome.field('Immune', listText(found.immune)) +
        core.chrome.field('Cond.Imm', listText(found.conditionImmune)) +
        '<div class="sspace"></div>' +
        core.chrome.field('Senses', listText(found.senses), '', true) +
        core.chrome.field('Skills', listText(found.skills), '', true) +
        '<div class="sspace"></div>' +
        core.chrome.field('AC', acText ? ac + ' (' + acText + ')' : String(ac || ''), '', true) +
        core.chrome.field('HP', hpText ? hp + ' (' + hpText + ')' : String(hp || ''), '', true) +
        '<div class="sspace"></div>' +
        core.chrome.field('Lang.', found.languages, '', true) +
        core.chrome.field('Align', found.alignment) +
        core.chrome.field('CR', cr);
    }

    /* The text of the block: the traits, the actions and the rest. Every
       section of the block has one on the form too, so the bonus actions, the
       reactions and the spellcasting of the creature that was called are the
       ones the form has: the steed keeps one of its three. */
    function statText(found, out, card) {
      var core = C();
      var form = out ? out.form : null;
      var actions = form ? form.actions : found.actions;
      var traits = form ? form.traits : found.traits;
      var bonus = form && form.bonusActions ? form.bonusActions : found.bonusActions;
      var reactions = form && form.reactions ? form.reactions : found.reactions;
      var legendary = form && form.legendary ? form.legendary : found.legendary;
      var casting = form && form.spellcasting ? form.spellcasting : found.spellcasting;
      var html = '';
      function section(title, list) {
        if (!list || !list.length) return;
        html += '<h3>' + core.chrome.esc(title) + '</h3>';
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
          html += '<p><b>' + core.chrome.esc(x.name) + '.</b> ' + core.chrome.markup(spoken(x.header)) + '</p>';
          if (x.text) html += '<p>' + core.chrome.markup(spoken(x.text)) + '</p>';
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

    /* The stat block of the creature, in the overlay of the app. A tap on the
       dot of a saving throw turns the proficiency, the way the sheet does. */
    function openStat(card, api) {
      var found = block(card.key);
      if (!found) { api.toast('the app does not carry its block'); return; }
      var out = derive(card, api);
      api.sheet.open({
        id: 'stat:' + card.key,
        title: found.name,
        tag: (found.size ? found.size + ' ' : '') + found.type,
        metaClass: 'sheet-meta statmeta',
        meta: statFields(found, out, card, api),
        text: statText(found, out, card),
        onPaint: function (root) {
          var dots = root.querySelectorAll('[data-save]');
          Array.prototype.forEach.call(dots, function (dot) {
            dot.addEventListener('click', function () {
              var key = dot.dataset.save;
              var on = saveState(card, found, key, 0, api).on;
              if (!card.saves) card.saves = {};
              card.saves[key] = !on;
              api.save();
              openStat(card, api);
            });
          });
        }
      });
    }

    /* ---- the attack boxes ---- */

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
      var m = String(a.text || '').match(/^((?:Melee|Ranged)(?: or (?:Melee|Ranged))?\s+(?:weapon\s+|spell\s+)?attack)/i);
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
       and the roll it kept. The box is the block's; the numbers are the
       page's. */
    function swingBlock(a, edit, res, ix) {
      var core = C();
      var bonus = edit && edit.bonus !== undefined && edit.bonus !== '' ? edit.bonus : a.bonus;
      var damage = edit && edit.damage !== undefined && edit.damage !== '' ? edit.damage : a.damage;
      return core.horizontalAttackBox.swing({
        name: a.name,
        kind: attackKind(a),
        bonus: bonus,
        bonusOf: bonusOf(bonus),
        range: attackRange(a),
        damage: compact(damage),
        type: damageType(a),
        groups: res ? res.groups : (core.R && core.R.diceIn ? core.R.diceIn(damage || '') : []),
        flat: res ? res.flat : (core.R && core.R.flatIn ? core.R.flatIn(damage || '') : 0),
        res: res,
        ix: ix
      });
    }

    /* The same box with the wrench on: the numbers are fields. */
    function editBlock(a, edit) {
      var core = C();
      var bonus = edit && edit.bonus !== undefined && edit.bonus !== '' ? edit.bonus : a.bonus;
      var damage = edit && edit.damage !== undefined && edit.damage !== '' ? edit.damage : a.damage;
      return core.horizontalAttackBox.edit({
        name: a.name,
        kind: attackKind(a),
        bonus: bonus,
        damage: damage,
        type: damageType(a),
        range: attackRange(a)
      });
    }

    /* All the swings of an attack, under the one name of the attack. */
    function attackGroup(a, edit, rolls, editing) {
      var out = '<div class="sgroup">';
      if (editing) {
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
       and it does not roll. A page that keeps no uses passes null and the
       action is read without a counter. */
    function noteRow(a, edit, uses, editing) {
      var core = C();
      var damage = edit && edit.damage !== undefined && edit.damage !== '' ? edit.damage : a.damage;
      var type = damageType(a);
      var limit = uses === null ? null : limitedOf(a);
      var label = limit ? limit.name : a.name;
      var out = '<div class="snoteblock" data-name="' + core.chrome.esc(a.name) + '">' +
        '<span class="satkname">' + core.chrome.esc(label) + '</span>';
      if (limit) {
        var u = uses ? uses[a.name] : null;
        var left = u ? Number(u.left) || 0 : limit.max;
        out += '<button type="button" class="suses' + (left ? '' : ' out') + '" data-role="use" ' +
          'aria-label="Use the ' + core.chrome.esc(label) + '">' + left + '/' + limit.max + '</button>';
      }
      if (editing) {
        out += '<input class="scin satkdamage" data-role="atkdamage" type="text" value="' + core.chrome.esc(damage) + '" aria-label="Damage of the action">';
      } else if (damage) {
        out += '<span class="sformula">' + core.chrome.esc(compact(damage)) + '</span>';
      }
      if (type) out += '<em class="stype" style="color:' + core.horizontalAttackBox.colour(type) + '">' + core.chrome.esc(type) + '</em>';
      out += '</div>';
      return out;
    }

    /* ---- the roll of an attack ---- */

    /* One swing of an attack, rolled and kept on the card. The page says
       where the cards live (the root it painted) and what to mark dirty, so
       the outline of the roll lands on the box that is on the screen. */
    function roll(card, name, ix, api, opts) {
      var o = opts || {};
      var out = derive(card, api);
      if (!out) return false;
      var action = null;
      out.actions.forEach(function (a) { if (a.name === name) action = a; });
      if (!action || !action.attack) return false;
      var edit = (card.edit && card.edit.attacks && card.edit.attacks[name]) || {};
      var bonus = edit.bonus !== undefined && edit.bonus !== '' ? edit.bonus : action.bonus;
      var damage = edit.damage !== undefined && edit.damage !== '' ? edit.damage : action.damage;
      var result = C().R.rollAttack(bonus, damage, !!card.adv);
      if (!card.rolls) card.rolls = {};
      var list = rollsOf(card, name);
      while (list.length <= ix) list.push(null);
      list[ix] = result;
      card.rolls[name] = list;
      api.markDirty(o.mark || 'cards');
      api.save();
      api.refresh();
      C().feedback.roll(name, result);
      var shown = o.root && o.root.querySelectorAll ? o.root.querySelectorAll('.sblock[data-name]') : [];
      for (var k = 0; k < shown.length; k++) {
        if (shown[k].dataset && shown[k].dataset.name === name &&
          Number(shown[k].dataset.ix || 0) === ix) { C().feedback.tap(shown[k]); break; }
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(result.crit ? [14, 45, 14] : 16);
      return true;
    }

    return {
      block: block,
      byName: byName,
      keyOf: keyOf,
      dexOf: dexOf,
      initBonus: initBonus,
      acOf: acOf,
      hpOf: hpOf,
      derive: derive,
      openStat: openStat,
      attackGroup: attackGroup,
      noteRow: noteRow,
      limitedOf: limitedOf,
      rollsOf: rollsOf,
      roll: roll
    };
  };
})(typeof window !== 'undefined' ? window : this);
