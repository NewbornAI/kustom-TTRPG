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

    /* An empty block, for a creature the player writes rather than one the
       books carry: its name, and every number at nothing until the player
       gives it one. The card keeps it, and the fight fills its numbers. */
    function blank(name) {
      return {
        name: String(name || ''), source: '', cr: '', ac: 0, acText: '', acTerms: null,
        hp: 0, hpText: '', hpTerms: null, ability: [], saves: [], skills: null, senses: [],
        languages: '', alignment: '', resist: [], immune: [], vulnerable: [], conditionImmune: [],
        actions: [], traits: [], bonusActions: [], reactions: [], legendary: [], spellcasting: null
      };
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
      /* A card may carry its own block, a creature the player wrote rather
         than one of the books: the page keeps it on the card. */
      var found = card.block || block(card.key);
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
          /* A blow of several kinds keeps them apart, each with its own
             formula and the kind it deals. */
          damages: (a.damages || []).map(function (d) {
            return { formula: deriveDamage(d.parts, ctx) || d.dice, type: d.type || '' };
          }),
          count: deriveCount(a.count, ctx),
          type: a.type || '',
          attack: /^(Melee|Ranged)( or (Melee|Ranged))? (weapon |spell )?attack:/i.test(a.text || ''),
          multi: a.count ? null : multi,
          /* An action that rolls on a table keeps the table: the eye rays of
             a beholder are a d10 and ten rows, and a page rolls it. */
          table: a.table || null
        };
      });
      /* The sections of the block, so a page can read the traits and the
         bonus actions the way it reads the actions. */
      function section(name) {
        if (form && form[name]) return form[name];
        return found[name] || [];
      }
      return {
        ac: ac, hpMax: hp, actions: actions, form: form, block: found,
        traits: section('traits'),
        bonusActions: section('bonusActions'),
        reactions: section('reactions'),
        spellcasting: section('spellcasting')
      };
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
      var casting = (out && out.spellcasting) || [];
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
      if (casting.length) {
        html += '<h3>Spellcasting</h3>' + castingBlocks(casting);
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

    /* ---- the spells of a caster ---- */

    /* The spells of the book, by the name a text writes: the longest name
       first, so "Detect Magic" is read as one spell and not as "Detect" and
       "Magic". A book that has not been read yet links nothing, and the page
       paints again when it lands. */
    function spellNames() {
      var core = C();
      var out = [];
      ((core.library.book && core.library.book.spells) || []).forEach(function (s) {
        if (s && s.name) out.push(String(s.name));
      });
      return out.sort(function (a, b) { return b.length - a.length; });
    }

    function reEsc(text) { return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    /* The text of a caster with the spells it names as buttons: a tap opens
       the spell. A name the book does not hold stays plain words. */
    function spellText(text) {
      var core = C();
      var src = String(text || '');
      var names = spellNames();
      if (!names.length) return core.chrome.markup(src);
      var lower = {};
      (core.library.book.spells || []).forEach(function (s) {
        if (s && s.name) lower[String(s.name).toLowerCase()] = s.name;
      });
      var pattern = new RegExp('\\b(' + names.map(reEsc).join('|') + ')\\b', 'gi');
      var out = '';
      var at = 0;
      var m;
      while ((m = pattern.exec(src)) !== null) {
        if (m.index > at) out += core.chrome.markup(src.slice(at, m.index));
        var word = m[1];
        var name = lower[word.toLowerCase()] || word;
        out += '<button type="button" class="splink" data-spell="' + core.chrome.esc(name) + '" ' +
          'aria-label="Open the spell ' + core.chrome.esc(name) + '">' + core.chrome.esc(word) + '</button>';
        at = m.index + word.length;
      }
      if (at < src.length) out += core.chrome.markup(src.slice(at));
      return out;
    }

    /* One entry of a caster's spellcasting: the save DC, the attack and the
       ability of the caster are read from its header and shown once, as the
       chips of the row, so the header they leave behind does not say them
       again. */
    function castingOf(entry) {
      var header = spoken(entry && entry.header);
      var dc = header.match(/spell save DC\s*(\d+)/i);
      var hit = header.match(/([+-]\d+)\s+to hit with spell attacks/i);
      return {
        name: String((entry && entry.name) || ''),
        dc: dc ? Number(dc[1]) : null,
        hit: hit ? hit[1] : '',
        header: header.replace(/\s*\(\s*spell save DC[^)]*\)/i, ''),
        text: spoken(entry && entry.text)
      };
    }

    /* The spellcasting of a caster, the way the actions of a fight read it
       and the way the stat block writes it: the name, the DC of its save, the
       spells it lists, each one a link to its card. */
    function castingBlocks(entries) {
      var core = C();
      var list = entries || [];
      if (!list.length) return '';
      return list.map(function (entry) {
        var c = castingOf(entry);
        var out = '<div class="scast" data-name="' + core.chrome.esc(c.name) + '">' +
          '<div class="scasthead"><span class="scastname">' + core.chrome.esc(c.name) + '</span>';
        if (c.dc !== null || c.hit) {
          out += '<span class="scastmeta">';
          if (c.dc !== null) out += '<span class="scastdc" title="Spell save DC"><em>DC</em>' + c.dc + '</span>';
          if (c.hit) out += '<span class="scastab" title="To hit with spell attacks">' + core.chrome.esc(c.hit) + '</span>';
          out += '</span>';
        }
        out += '</div>';
        if (c.header) out += '<p class="scasttext">' + spellText(c.header) + '</p>';
        if (c.text) out += '<p class="scasttext scastlist">' + spellText(c.text) + '</p>';
        return out + '</div>';
      }).join('');
    }

    /* The links of a caster's spells, wired where the text was painted. The
       card is the spell card module's, so a name opens the same card from the
       stat block, from the fight and from the summons. */
    function wireSpells(root, api, prefix) {
      var core = C();
      var links = root.querySelectorAll ? root.querySelectorAll('[data-spell]') : [];
      Array.prototype.forEach.call(links, function (link) {
        link.addEventListener('click', function () {
          core.spellCard.open(api, link.dataset.spell, { id: (prefix || 'statspell:') + link.dataset.spell });
        });
      });
    }

    /* The stat block of the creature, in the overlay of the app. A tap on the
       dot of a saving throw turns the proficiency, the way the sheet does. */
    function openStat(card, api) {
      var found = card.block || block(card.key);
      if (!found) { api.toast('the app does not carry its block'); return; }
      var out = derive(card, api);
      var core = C();
      var casting = (out && out.spellcasting) || [];
      /* The spells a caster lists are links, so the book is read before the
         card is shown; a book that cannot be read still shows the words. */
      if (casting.length && !(core.library.book.spells || []).length) {
        core.library.data('spellbook').then(function (ok) {
          if (ok) openStat(card, api);
          else showStat(found, out, card, api);
        });
        return;
      }
      showStat(found, out, card, api);
    }

    function showStat(found, out, card, api) {
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
          wireSpells(root, api);
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
      var edited = edit && edit.damage !== undefined && edit.damage !== '';
      var parts = (!edited && a.damages && a.damages.length
        ? a.damages
        : [{ formula: edited ? edit.damage : a.damage, type: damageType(a) }]
      ).map(function (p) { return { formula: compact(p.formula), type: p.type }; });
      var formula = parts.map(function (p) { return p.formula; }).join('+');
      return core.horizontalAttackBox.swing({
        name: a.name,
        kind: attackKind(a),
        bonus: bonus,
        bonusOf: bonusOf(bonus),
        range: attackRange(a),
        damage: formula,
        damages: parts,
        type: parts[0] ? parts[0].type : damageType(a),
        groups: res ? res.groups : (core.R && core.R.diceIn ? core.R.diceIn(formula) : []),
        flat: res ? res.flat : (core.R && core.R.flatIn ? core.R.flatIn(formula) : 0),
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
       action is read without a counter; a page that has room for the words
       passes true and the action's sentence is read under its name, which is
       what a multiattack of a beholder needs. */
    function noteRow(a, edit, uses, editing, showText) {
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
      if (showText && a.text) out += '<p class="sttext">' + core.chrome.markup(a.text) + '</p>';
      return out;
    }

    /* ---- the uses of a trait or an action ---- */

    /* The uses the name of an ability carries: "Spores (Recharge 5-6)" comes
       back on the roll of a die, "Stunning Screech (1/Day)" comes back with
       the day, "Legendary Resistance (3/Day)" three times. */
    function usesOf(name) {
      var text = String(name || '');
      var day = text.match(/\(\s*(\d+)\s*\/\s*Day\s*\)/i);
      if (day) return { kind: 'day', max: Math.max(1, Number(day[1]) || 1) };
      var re = text.match(/\(\s*Recharge\s+(\d)(?:\s*[-\u2013]\s*(\d))?\s*\)/i);
      if (re) {
        var lo = Math.max(2, Number(re[1]) || 6);
        return { kind: 'recharge', min: lo, max: re[2] ? Math.max(lo, Number(re[2])) : lo };
      }
      return null;
    }

    /* The name of an ability without the uses it carries. */
    function useLabel(name) {
      return String(name || '').replace(/\s*\([^)]*\)\s*$/, '');
    }

    /* What is left of an ability: the card keeps one state per name, and an
       ability that has never been touched is full. */
    function usesState(card, name, uses) {
      if (!card.uses) card.uses = {};
      var st = card.uses[name];
      /* A recharge is one thing: it is available or it is spent, and the die
         is what brings it back. A day counts its uses. */
      var full = uses.kind === 'recharge' ? 1 : uses.max;
      if (!st || typeof st !== 'object') st = card.uses[name] = { left: full, max: full };
      if (typeof st.left !== 'number') st.left = full;
      if (typeof st.max !== 'number' || st.max > full) st.max = full;
      return st;
    }

    /* Every trait and action of the block that carries a recharge or a day:
       the row of a tick, the name, the words of its uses and, for a recharge,
       the die that rolls it back. */
    function useRows(card, out, editing) {
      var core = C();
      var list = [];
      ['actions', 'traits', 'bonusActions', 'reactions'].forEach(function (key) {
        ((out && out[key]) || []).forEach(function (a) {
          var uses = usesOf(a.name);
          if (uses) list.push({ name: a.name, uses: uses });
        });
      });
      if (!list.length) return '';
      var html = '<div class="usehead"><span class="usekey">Uses</span></div>';
      html += list.map(function (item) {
        var uses = item.uses;
        var st = usesState(card, item.name, uses);
        var on = st.left > 0;
        var note = uses.kind === 'recharge' ? 'Recharge ' + uses.min + '\u2013' + uses.max
          : uses.max + '/day';
        var label = useLabel(item.name);
        var row = '<div class="userow" data-name="' + core.chrome.esc(item.name) + '">' +
          '<button type="button" class="usetick' + (on ? ' on' : '') + '" data-role="use" ' +
            'aria-pressed="' + (on ? 'true' : 'false') + '" ' +
            'aria-label="' + core.chrome.esc(label) + ', ' + (on ? 'available' : 'used') + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
            '<rect x="3" y="3" width="18" height="18" rx="4"/>' +
            (on ? '<path d="M7.5 12.5l3 3 6-6.5"/>' : '') + '</svg></button>' +
          '<span class="usename">' + core.chrome.esc(label) + '</span>' +
          '<span class="usenote">' + core.chrome.esc(note) + '</span>' +
          (uses.kind === 'day' ? '<span class="usecount' + (on ? '' : ' out') + '">' + st.left + '/' + st.max + '</span>' : '') +
          (uses.kind === 'recharge' && !editing
            ? '<button type="button" class="usedie" data-role="recharge" aria-label="Roll the recharge of ' +
              core.chrome.esc(label) + '">d6</button>'
            : '') +
          '</div>';
        return row;
      }).join('');
      return html;
    }

    /* One tap on the tick: a day spends one of its uses, and a day with none
       left gives them all back, the way the sheet refills a counter; a
       recharge is used or it is not. */
    function spendUse(card, name, api, opts) {
      var o = opts || {};
      var core = C();
      var uses = usesOf(name);
      if (!uses) return false;
      var st = usesState(card, name, uses);
      if (uses.kind === 'day') {
        st.left = st.left > 0 ? st.left - 1 : st.max;
      } else {
        st.left = st.left > 0 ? 0 : 1;
      }
      api.markDirty(o.mark || 'cards');
      api.save();
      api.refresh();
      if (uses.kind === 'day' && st.left === st.max && st.max > 1) {
        core.feedback.back('use of ' + useLabel(name), st.max, st.left);
      } else {
        core.feedback.spent('use of ' + useLabel(name), 1, Math.max(0, st.left));
      }
      return true;
    }

    /* The die of a recharge: a d6 against the number the book prints, and the
       ability comes back on it or stays spent. */
    function rollRecharge(card, name, api, opts) {
      var o = opts || {};
      var core = C();
      var uses = usesOf(name);
      if (!uses || uses.kind !== 'recharge') return false;
      var st = usesState(card, name, uses);
      var die = core.R.rollDice(1, 6);
      var back = die.total >= uses.min;
      st.left = back ? 1 : 0;
      api.markDirty(o.mark || 'cards');
      api.save();
      api.refresh();
      core.feedback.pick(useLabel(name), die.total, back ? 'recharged' : 'still spent');
      return true;
    }

    /* ---- the table an action rolls on ---- */

    /* An action that rolls on a table, the eye rays of a beholder: its name,
       the die that rolls the row, and the row the last roll landed on with
       the damage it rolled. The die is a button; the row, its words and its
       damage are read under it. */
    function tableGroup(a, result, editing) {
      var core = C();
      var table = a.table;
      var sides = table.die.sides;
      var out = '<div class="stable" data-name="' + core.chrome.esc(a.name) + '">' +
        '<div class="stabletop"><span class="satkname">' + core.chrome.esc(a.name) + '</span>';
      if (!editing) {
        out += '<button type="button" class="stdie" data-role="table" data-name="' + core.chrome.esc(a.name) + '" ' +
          'aria-label="Roll the ' + core.chrome.esc(a.name) + ', a d' + sides + '">' +
          core.chrome.dieIcon(sides) + '<span>d' + sides + '</span></button>';
      }
      out += '</div>';
      if (result) {
        var damage = result.damage;
        out += '<div class="stres">' +
          '<span class="stnum">' + result.n + '</span>' +
          '<span class="stname">\u00b7 ' + core.chrome.esc(result.name) + '</span>' +
          (damage ? '<span class="stdmg">' + core.chrome.esc(compact(damage.formula)) + ' \u2192 ' + damage.total + '</span>' +
            (damage.type ? '<em class="stype" style="color:' + core.horizontalAttackBox.colour(damage.type) + '">' +
              core.chrome.esc(damage.type) + '</em>' : '') : '') +
          '</div>' +
          '<p class="sttext">' + core.chrome.markup(result.text) + '</p>';
      }
      return out + '</div>';
    }

    /* One roll of a table, kept on the card: the die, the row it landed on,
       and the damage of that row rolled at the same time, since the table's
       row is what says what the dice are for. The page says what to mark
       dirty and where the boxes are. */
    function rollTable(card, name, api, opts) {
      var o = opts || {};
      var core = C();
      var out = derive(card, api);
      if (!out) return false;
      var action = null;
      out.actions.forEach(function (a) { if (a.name === name) action = a; });
      if (!action || !action.table) return false;
      var table = action.table;
      var die = core.R.rollDice(table.die.count, table.die.sides);
      var row = null;
      table.rows.forEach(function (r) {
        if (!row && die.total >= r.n && die.total <= (r.to === undefined ? r.n : r.to)) row = r;
      });
      if (!row) row = table.rows[table.rows.length - 1];
      var damage = null;
      if (row.damageParts && row.damageParts.dice && !row.damageParts.dice.levelCount) {
        var parts = row.damageParts;
        var rolled = core.R.rollDice(parts.dice.count, parts.dice.size);
        var flat = 0;
        (parts.flat || []).forEach(function (t) { if (t.const !== undefined) flat += t.const; });
        damage = { rolls: rolled.rolls, total: rolled.total + flat, formula: row.damage, type: row.type };
      }
      if (!card.tables) card.tables = {};
      card.tables[name] = { die: die, n: row.n, name: row.name, text: row.text, damage: damage };
      api.markDirty(o.mark || 'cards');
      api.save();
      api.refresh();
      core.feedback.pick(name, die.total, row.name);
      var shown = o.root && o.root.querySelectorAll ? o.root.querySelectorAll('.stdie[data-name]') : [];
      for (var k = 0; k < shown.length; k++) {
        if (shown[k].dataset && shown[k].dataset.name === name) { core.feedback.tap(shown[k]); break; }
      }
      return true;
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
      var edited = edit.damage !== undefined && edit.damage !== '';
      /* A blow of several kinds rolls all of them at once, so its damage is
         the sum of the parts the book writes. */
      var damage = edited ? edit.damage
        : (action.damages && action.damages.length
          ? action.damages.map(function (d) { return compact(d.formula); }).join(' + ')
          : action.damage);
      var result = C().R.rollAttack(bonus, damage, !!card.adv);
      /* The kinds of a blow that deals several ride on the groups of its
         damage, in the order the book writes them. */
      if (action.damages && action.damages.length) {
        var typed = action.damages.filter(function (d) { return /\d*d\d+/i.test(d.formula || ''); });
        result.damages = action.damages;
        (result.groups || []).forEach(function (g, i) { if (typed[i]) g.type = typed[i].type; });
      }
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
      blank: blank,
      byName: byName,
      keyOf: keyOf,
      dexOf: dexOf,
      initBonus: initBonus,
      acOf: acOf,
      hpOf: hpOf,
      derive: derive,
      openStat: openStat,
      castingBlocks: castingBlocks,
      castingOf: castingOf,
      attackGroup: attackGroup,
      noteRow: noteRow,
      tableGroup: tableGroup,
      usesOf: usesOf,
      useLabel: useLabel,
      useRows: useRows,
      spendUse: spendUse,
      rollRecharge: rollRecharge,
      limitedOf: limitedOf,
      rollsOf: rollsOf,
      roll: roll,
      rollTable: rollTable
    };
  };
})(typeof window !== 'undefined' ? window : this);
