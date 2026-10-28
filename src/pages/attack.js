/* The attack page: a turn of attacks, one screen. The Action holds the way
   the character attacks (an Attack, or True Strike when the cantrip is in its
   lists), the weapon it swings, Advantage, Disadvantage and the riders, then
   the rolls of the Action under them. The Bonus action holds what may follow
   (a quickened True Strike, a smite after a melee hit), one of them a turn.

   Every number comes from the record, the rules block or the book: the
   weapons and their dice from the worn weapons and data/weapons.json, the
   count of attacks from an Extra Attack feature, Sneak Attack's dice from the
   feature's own text, the bonuses from the sheet, the slots and the sorcery
   points from the counter module. A piece whose source is missing is not
   shown. The turn lives in the slice and every step of it goes on the
   history, so the back key takes back a roll, a flip, a toggle, a smite (the
   slot and the bonus action with it) or a quicken (the points with it). */
(function () {
  'use strict';

  var C = Sheet.core;
  var R = C.R;
  var SR = C.SR;

  var api = null;
  var E = {};
  var WEAPONS = C.library.weapons || [];   /* the weapons of the book, shared with the equipment */
  var fresh = -1;      /* the roll that just landed: its dice land once */
  var shown = {};      /* the total each card showed, so a change pops */

  /* The file this page reads, and the shape it fills. */
  C.library.data('weapons', function (json) {
    WEAPONS.length = 0;
    (json.weapons || []).forEach(function (w) { WEAPONS.push(w); });
  });

  /* The turn is part of the history: the back key takes back its steps. */
  C.rest.track('attack');

  var ICON = {
    attack: 'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
    ts: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
    adv: 'M12 2.8 19.97 7.4v9.2L12 21.2 4.03 16.6V7.4zM12 15.5v-7M9 11l3-3 3 3',
    dis: 'M12 2.8 19.97 7.4v9.2L12 21.2 4.03 16.6V7.4zM12 8.5v7M9 13l3 3 3-3',
    sneak: 'M14.5 3.5l6 6L10 20H4v-6zM8 12l4 4',
    rage: 'M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-4 0-7z',
    quicken: 'M4 6l8 6-8 6zM12 6l8 6-8 6z',
    smite: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1',
    vex: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v4M12 18v4M2 12h4M18 12h4',
    turn: 'M3.5 12a8.5 8.5 0 1 0 2.8-6.3M3.5 4.4v5.2h5.2'
  };

  function commit() { api.save(); api.refresh(); }

  function glyph(d, cls) {
    return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
  }

  /* The slice: the choices of the turn and its rolls. An older slice (the
     weapon, the advantage, a quicken flag and a smite level) keeps its
     weapon and its advantage. */
  function seed(saved) {
    var s = (saved && typeof saved === 'object') ? saved : {};
    var adv = !!(s.adv || s.advantage);
    return {
      way: typeof s.way === 'string' ? s.way : '',
      weapon: typeof s.weapon === 'string' ? s.weapon : '',
      adv: adv,
      dis: !adv && !!s.dis,
      sneak: s.sneak !== false,
      rage: !!s.rage,
      rolls: Array.isArray(s.rolls) ? s.rolls.filter(function (r) { return r && typeof r.a === 'number'; }) : [],
      bonus: s.bonus === 'quicken' || s.bonus === 'smite' ? s.bonus : '',
      smite: (s.smite && typeof s.smite === 'object' && Array.isArray(s.smite.rolls)) ? s.smite : null
    };
  }

  function turn() {
    var rec = api.character();
    if (!rec.attack || !Array.isArray(rec.attack.rolls)) rec.attack = seed(rec.attack);
    return rec.attack;
  }

  /* ---- what the sheet says ---- */

  function ch() { return api.character().char || {}; }

  function level() { return Number(ch().level) || SR.classLevels(ch().classes || []) || 1; }

  function features() { return ch().features || []; }

  function hasFeature(re) {
    return features().some(function (f) { return re.test(String(f.key || '')) || re.test(String(f.name || '')); });
  }

  function hasSpell(name) {
    var lists = ((api.character().spells || {}).lists) || {};
    return Object.keys(lists).some(function (lv) { return (lists[lv] || []).indexOf(name) >= 0; });
  }

  /* The weapons the character wears, each with its entry in the book. The
     player writes the name, so the reading is not case sensitive. */
  function bookWeapon(item) {
    var key = String((item && item.name) || '').trim().toLowerCase(), found = null;
    WEAPONS.forEach(function (w) { if (String(w.name).toLowerCase() === key) found = w; });
    return found;
  }

  function worn() {
    return ((api.character().equipment || {}).items || []).filter(function (it) {
      return it && it.category === 'weapon' && it.equipped;
    });
  }

  /* A worn weapon swings with what the equipment page says it is: the
     weapon of the books by its base or its name, a magic bonus, the row's
     own stats. One the sheet cannot read the damage of is named under the
     card, so the player knows where to fix it. */
  function statsOf(it) {
    return C.library.weaponOf ? C.library.weaponOf(it) : bookWeapon(it);
  }

  function armed() {
    return worn().map(function (it) { return { item: it, book: statsOf(it) }; })
      .filter(function (x) { return x.book && x.book.damage; });
  }

  function unarmed() {
    return worn().filter(function (it) { return !statsOf(it); });
  }

  function chosen(arms) {
    var want = turn().weapon, i;
    for (i = 0; i < arms.length; i++) if (arms[i].item.id === want) return arms[i];
    return arms[0] || null;
  }

  function props(w) { return (w.properties || []).map(function (p) { return String(p).toLowerCase(); }); }

  function ranged(w) { return /ranged/i.test(w.kind || ''); }

  function finesse(w) { return props(w).indexOf('finesse') >= 0; }

  /* The ways the Action attacks: an Attack with the weapon, and True Strike
     when the cantrip is in the character's lists. Both swing the weapon. */
  function waysOf(arms) {
    if (!arms.length) return [];
    var out = [{ id: 'attack', label: 'Attack', short: 'Attack', icon: ICON.attack }];
    if (hasSpell('True Strike')) out.push({ id: 'ts', label: 'True Strike', short: 'True', icon: ICON.ts });
    return out;
  }

  function wayOf(ways) {
    var want = turn().way, i;
    for (i = 0; i < ways.length; i++) if (ways[i].id === want) return ways[i];
    return ways[ways.length - 1] || null;
  }

  /* How many rolls the Action makes: an Attack counts the Extra Attack the
     sheet holds, True Strike is one cast. */
  /* How many rolls the Action makes: an Attack counts the attacks the
     character's classes give (Extra Attack and the rest, the class plugins'
     tables), True Strike is one cast. */
  function attacksOf(way) {
    if (!way || way.id !== 'attack') return 1;
    return C.classes.attacks(api.character());
  }

  /* Sneak Attack's dice at the rogue's level, from the rogue's plugin. No
     rogue level, no dice, and no toggle. */
  function sneakDice() {
    var text = C.classes.sneak(api.character());
    var d = text ? R.setIn(text).dice[0] : null;
    return d ? { count: d.count, sides: d.sides } : null;
  }

  /* The riders the classes add, Rage for one: on while the player says so,
     and spent from its counter when turned on. */
  function riderOf(key) {
    return C.classes.riders(api.character()).filter(function (x) { return x.rider.key === key; })[0] || null;
  }

  function sorceryPoints() {
    var sp = C.counter.counterOf(api.character(), 'sp');
    return sp ? sp.left : 0;
  }

  function canQuickenAt(way) {
    return !!way && way.id === 'ts' && (C.classes.has(api.character(), 'metamagic') || hasFeature(/metamagic/i));
  }

  /* The levels a smite can spend, with what is left at each: the slots the
     sheet holds, the pact slots at their level included. */
  function smiteLevels() {
    var rec = api.character();
    var spells = rec.spells || {};
    var pactLv = Number(spells.warlockLevel) || 0;
    var out = [], lv;
    for (lv = 1; lv <= 9; lv++) {
      var slot = C.counter.counterOf(rec, 'slot:' + lv);
      var max = slot ? slot.max : 0, left = slot ? slot.left : 0;
      if (lv === pactLv) {
        var pact = C.counter.counterOf(rec, 'warlock');
        if (pact) { max += pact.max; left += pact.left; }
      }
      if (max > 0) out.push({ lv: lv, left: left });
    }
    return out;
  }

  /* What one roll is made of, for the rules block to throw: the bonus to
     hit, the flat on the damage, the type, the sets of dice. An Attack
     reads Strength, Dexterity for a ranged weapon, the better of the two for
     a finesse one; True Strike reads the casting ability and deals radiant
     damage, with the extra dice its upgrade names at the character's level. */
  function specOf(way, x, part) {
    var c = ch();
    var w = x.book;
    var set = R.setIn(w.damage);
    var d = set.dice[0] || null;
    var bonus, mod, type, upgrade = null;
    var rec = api.character();
    if (way.id === 'ts') {
      var ab = C.library.primaryAbility(c);
      /* True Strike is a spell attack: the effects on spellAttack count. */
      bonus = SR.withEffects(rec, SR.spellAttack(c, ab), ['spellAttack']);
      mod = SR.abilityMod((c.abilities || {})[ab]);
      type = 'radiant';
      var up = SR.cantripUpgrade(C.library.bookByName['True Strike'], level());
      var u = up ? R.setIn(up).dice[0] : null;
      if (u) upgrade = { sides: u.sides, count: u.count };
    } else {
      var str = SR.abilityMod((c.abilities || {}).str);
      var dex = SR.abilityMod((c.abilities || {}).dex);
      mod = ranged(w) ? dex : (finesse(w) ? Math.max(str, dex) : str);
      bonus = mod + SR.profBonus(level()) + (Number(w.attackBonus) || 0);
      type = w.damageType || '';
      /* A magic weapon's bonus is on the damage as well as the hit. */
      mod += Number(w.damageBonus) || 0;
      /* The effects of the features and the gear: Archery, Dueling and the
         rest, on every weapon or on melee or ranged ones. */
      var reach = ranged(w) ? 'ranged' : 'melee';
      bonus = SR.withEffects(rec, bonus, ['attack', 'attack.' + reach]);
      mod = SR.withEffects(rec, mod, ['damage', 'damage.' + reach]);
      /* Rage adds its damage to a melee attack made with Strength. */
      var rage = riderOf('rage');
      if (rage && turn().rage && !ranged(w) && (!finesse(w) || str >= dex)) mod += rage.rider.damage(rage.level);
    }
    return {
      part: part, way: way.id, weapon: x.item.id,
      bonus: bonus, mod: mod + set.flat, type: type,
      melee: !ranged(w),
      sneakable: ranged(w) || finesse(w),
      vex: /vex/i.test(x.item.mastery || w.mastery || ''),
      base: d ? { sides: d.sides, count: d.count } : null,
      upgrade: upgrade,
      sneak: sneakDice()
    };
  }

  function modeOf(t) { return t.adv ? 'adv' : (t.dis ? 'dis' : 'norm'); }

  function actionRolls(t) { return t.rolls.filter(function (r) { return r.part === 'action'; }).length; }

  /* ---- the steps of a turn: each one goes on the history first ---- */

  function step(fn) {
    var rec = api.character();
    C.rest.push(rec);
    fn(turn(), rec);
    commit();
  }

  /* The one button: the next roll of the Action, and once the Action is
     rolled, a new turn with its first roll. */
  function strike() {
    var arms = armed(), x = chosen(arms), way = wayOf(waysOf(arms));
    if (!x || !way) return;
    var done = actionRolls(turn()) >= attacksOf(way);
    step(function (t) {
      if (done) { t.rolls = []; t.bonus = ''; t.smite = null; shown = {}; }
      t.rolls.push(R.throwAttack(specOf(way, x, 'action'), modeOf(t)));
      fresh = t.rolls.length - 1;
    });
    if (navigator.vibrate) navigator.vibrate(16);
  }

  /* Advantage and Disadvantage set the next rolls and re-read the last one:
     "you had disadvantage on that one" is one tap. Turning one on turns the
     other off. */
  function setMode(which) {
    step(function (t) {
      if (which === 'adv') { t.adv = !t.adv; if (t.adv) t.dis = false; }
      else { t.dis = !t.dis; if (t.dis) t.adv = false; }
      var last = t.rolls[t.rolls.length - 1];
      if (last) last.mode = modeOf(t);
    });
  }

  /* Rage on spends a use, said the way a spend is; Rage off gives nothing
     back, because it was spent when it began. */
  function toggleRage() {
    var r = riderOf('rage');
    if (!r) return;
    var key = 'feature:' + r.rider.spends;
    if (!turn().rage) {
      var now = C.counter.counterOf(api.character(), key);
      if (!now || now.left < 1) { api.toast('No Rage left'); return; }
    }
    var left = null;
    step(function (t, rec) {
      t.rage = !t.rage;
      if (t.rage) left = C.counter.spend(rec, key).left;
    });
    if (left !== null) C.feedback.spent('Rage', 1, left);
  }

  function flip(ix) {
    step(function (t) { if (t.rolls[ix]) t.rolls[ix].flip = !t.rolls[ix].flip; });
  }

  /* Vex gives advantage to the next attack, which may be at another
     creature, so it is a reminder the player turns on, never a rule. */
  function vex(ix) {
    step(function (t) {
      var r = t.rolls[ix];
      if (!r) return;
      r.vexed = !r.vexed;
      if (r.vexed) { t.adv = true; t.dis = false; }
    });
  }

  function quicken() {
    var arms = armed(), x = chosen(arms), way = wayOf(waysOf(arms));
    var t = turn();
    if (!x || !canQuickenAt(way) || t.bonus || sorceryPoints() < 2) return;
    step(function (t2, rec) {
      C.counter.spend(rec, 'sp');
      C.counter.spend(rec, 'sp');
      t2.bonus = 'quicken';
      t2.rolls.push(R.throwAttack(specOf(way, x, 'bonus'), modeOf(t2)));
      fresh = t2.rolls.length - 1;
    });
    C.feedback.spent('sorcery point', 2, sorceryPoints());
  }

  /* The smite rides the last melee hit of the Action. It spends a slot of
     the level picked, the pact slot when that level has no other, and the
     bonus action; its dice double on a critical hit. */
  function smite(lv) {
    var t = turn();
    var read = R.turnRead(t);
    if (t.bonus || read.smiteAt < 0 || !hasSpell('Divine Smite')) return;
    var rec = api.character();
    var key = 'slot:' + lv;
    var slot = C.counter.counterOf(rec, key);
    if (!slot || slot.left < 1) {
      var pactLv = Number((rec.spells || {}).warlockLevel) || 0;
      var pact = C.counter.counterOf(rec, 'warlock');
      if (lv !== pactLv || !pact || pact.left < 1) return;
      key = 'warlock';
    }
    var at = read.smiteAt;
    var left = 0;
    step(function (t2, rec2) {
      var paid = C.counter.spend(rec2, key);
      left = paid.left;
      var set = R.smiteSet(lv, false).dice[0];
      var thrown = R.throwSet({ sides: set.sides, count: set.count });
      t2.bonus = 'smite';
      t2.smite = { at: at, lv: lv, sides: thrown.sides, count: thrown.count, rolls: thrown.rolls };
    });
    C.feedback.spent('spell slot', 1, left);
    if (navigator.vibrate) navigator.vibrate([14, 45, 18]);
  }

  /* ---- the drawing ---- */

  function dots(n, filled, rgb) {
    var out = '';
    for (var i = 0; i < n; i++) out += '<i class="atkdot' + (i < filled ? ' on' : '') + '" style="--dot:' + rgb + '"></i>';
    return out;
  }

  function head(label, extra) {
    return '<div class="atkhead"><span>' + label + '</span>' + extra + '<span class="rule"></span></div>';
  }

  function cards(t, read, part) {
    var out = '';
    t.rolls.forEach(function (r, i) {
      if (r.part !== part) return;
      var x = read.reads[i];
      var pop = shown[i] !== undefined && shown[i] !== x.damage;
      shown[i] = x.damage;
      var after = '';
      if (x.hit && r.vex && r.part === 'action') {
        after = '<div class="atkafter"><button type="button" class="atkvex" data-vex="' + i + '" aria-pressed="' +
          (r.vexed ? 'true' : 'false') + '" aria-label="Vex: advantage on the next attack">' + glyph(ICON.vex) + 'Vex</button></div>';
      }
      out += C.attackCard.card({ read: x, ix: i, fresh: i === fresh, pop: pop && i !== fresh, after: after });
    });
    return out;
  }

  function paint() {
    var t = turn();
    var arms = armed();
    var ways = waysOf(arms);
    var way = wayOf(ways);
    var x = chosen(arms);
    var count = attacksOf(way);
    var read = R.turnRead(t);
    var nAction = actionRolls(t);
    var done = nAction >= count;

    /* The head carries the total of the turn once there are two damage rolls
       to add up: one roll says its total in its own card. */
    if (E.turnTotal) {
      E.turnTotal.hidden = read.hits < 2;
      E.turnTotal.querySelector('.atktt').textContent = String(read.total);
    }

    if (!worn().length || !arms.length) {
      var stowed = ((api.character().equipment || {}).items || []).filter(function (it) { return it && it.category === 'weapon' && !it.equipped; });
      E.body.innerHTML = '<div class="atkempty"><span>' +
        (unarmed().length ? C.chrome.esc(unarmed()[0].name || 'That weapon') + ' has no damage yet: tap it on the Equipment page and pick the weapon it is.'
          : stowed.length ? C.chrome.esc(stowed[0].name || 'The weapon') + ' is stowed: wear it on the Equipment page.'
          : 'No weapon is worn.') +
        '</span><button class="stog" type="button" data-go="equipment">Equipment</button></div>';
      E.cast.disabled = true;
      E.cast.innerHTML = '<span>Attack</span>';
      return;
    }

    var html = head('Action', '<span class="atkdots">' + dots(count, nAction, 'var(--arcane-rgb)') + '</span>');
    var weaponList = arms.map(function (a) {
      var d = R.setIn(a.book.damage).dice[0];
      return {
        id: C.chrome.esc(a.item.id), aria: C.chrome.esc(a.item.name),
        label: C.chrome.esc(String(a.item.name || '').replace(/^hand\s+/i, '').replace(/^(.)/, function (c) { return c.toUpperCase(); })),
        svg: C.chrome.dieIcon(d ? d.sides : 6)
      };
    });
    html += '<div class="atkpick' + (ways.length > 1 ? ' two' : '') + '">' +
      (ways.length > 1 ? C.toggle.segment({ key: 'way', aria: 'Attack', on: way.id,
        options: ways.map(function (w) { return { id: w.id, label: w.short, aria: w.label, icon: w.icon }; }) }) : '') +
      C.toggle.segment({ key: 'weapon', aria: 'Weapon', on: x.item.id, options: weaponList }) + '</div>';

    /* Adv, Dis and the rider of the turn: the toggle block, a fixed row. */
    var toggles = [
      { key: 'adv', label: 'Adv', aria: 'Advantage', on: t.adv, rgb: 'var(--adv-rgb)', icon: ICON.adv },
      { key: 'dis', label: 'Dis', aria: 'Disadvantage', on: t.dis, rgb: 'var(--dis-rgb)', icon: ICON.dis }
    ];
    if (sneakDice()) toggles.push({ key: 'sneak', label: 'Sneak', aria: 'Sneak Attack, once a turn', on: t.sneak, rgb: '201,182,255', icon: ICON.sneak });
    if (riderOf('rage')) toggles.push({ key: 'rage', label: 'Rage', aria: 'Rage, on until you end it', on: t.rage, rgb: '240,90,80', icon: ICON.rage });
    html += '<div class="chipgrid atktogs" data-bar style="--cols:' + toggles.length + '">' + toggles.map(C.toggle.chip).join('') + '</div>';
    html += cards(t, read, 'action');

    /* The bonus action: Quicken for a sorcerer who casts True Strike, the
       smite levels for a character who holds the spell. One a turn. The
       smite is drawn only with a level to spend: a character who holds the
       spell and has no slot would otherwise carry an empty sun in a frame. */
    var quick = canQuickenAt(way) || t.bonus === 'quicken';
    var levels = smiteLevels();
    var smiting = hasSpell('Divine Smite') && levels.length > 0;
    if (quick || smiting) {
      html += head('Bonus', '<span class="atkdots">' + dots(1, t.bonus ? 1 : 0, 'var(--quick-rgb)') + '</span>');
      html += '<div class="atkbonus">';
      if (quick) {
        var canQ = canQuickenAt(way) && !t.bonus && sorceryPoints() >= 2;
        html += '<button type="button" class="atkquick" id="atkQuicken"' + (canQ ? '' : ' disabled') +
          ' aria-label="Quicken True Strike, two sorcery points' + (t.bonus ? ', the bonus action is used' : '') + '">' +
          glyph(ICON.quicken) + '<span class="atksp" aria-hidden="true"><i></i><i></i></span></button>';
      }
      if (smiting) {
        var canS = !t.bonus && read.smiteAt >= 0;
        html += '<div class="atksmite' + (canS ? ' live' : '') + '">' +
          '<svg class="atksun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" role="img" aria-label="Divine Smite"><path d="' + ICON.smite + '"/></svg>' +
          levels.map(function (s) {
            var off = !canS || s.left < 1;
            var pips = '';
            for (var i = 0; i < Math.min(4, s.left); i++) pips += '<i></i>';
            return '<button type="button" class="atklv" data-smite="' + s.lv + '"' + (off ? ' disabled' : '') +
              ' aria-label="Smite at level ' + s.lv + ', ' + s.left + ' slot' + (s.left === 1 ? '' : 's') + ' left">' +
              '<span>' + s.lv + '</span><span class="atkpips" aria-hidden="true">' + pips + '</span></button>';
          }).join('') + '</div>';
      }
      html += '</div>';
      html += cards(t, read, 'bonus');
    }
    E.body.innerHTML = html;
    fresh = -1;

    /* The button says which roll it throws, and turns into a new turn once
       the Action is rolled. */
    var label = way.label + (count > 1 ? ' ' + (done ? 1 : nAction + 1) : '');
    E.cast.disabled = false;
    E.cast.innerHTML = (done ? glyph(ICON.turn, 'atknew') : '') + '<span>' + C.chrome.esc(label) + '</span>';
    E.cast.setAttribute('aria-label', (done ? 'A new turn: ' : '') + way.label +
      (count > 1 ? ', attack ' + (done ? 1 : nAction + 1) + ' of ' + count : ''));
  }

  Sheet.page({
    id: 'attack',
    glyph: 'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
    title: 'Attack',
    tab: 'Attack',
    order: 7,
    on: false,
    blurb: 'A turn of attacks: the Action, the riders, and the bonus action that follows.',
    slice: 'attack',
    seed: seed,
    css: [
      '.atkbody{flex:1 1 auto;min-height:0;overflow-y:auto;scrollbar-width:none;display:flex;flex-direction:column;gap:7px;padding-bottom:6px}',
      '.atkbody::-webkit-scrollbar{width:0}',
      '.atkhead{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}',
      '.atkhead .rule{flex:1 1 auto;height:1px;background:var(--edge)}',
      '.atkdots{display:flex;gap:4px}',
      '.atkdot{width:8px;height:8px;border-radius:4px;border:1px solid #5c5778}',
      '.atkdot.on{border-color:transparent;background:rgb(var(--dot))}',
      /* The two choices of the Action, the way and the weapon, side by side
         when there are two ways. */
      '.atkpick{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--gap-2)}',
      '.atkpick.two{grid-template-columns:repeat(2,minmax(0,1fr))}',
      /* The reminder a hit carries under its card. */
      '.atkafter{display:flex;gap:6px;padding:0 10px 8px 76px}',
      '.atkvex{height:28px;display:inline-flex;align-items:center;gap:4px;padding:0 10px;border:1px dashed #3a3454;border-radius:14px;background:none;color:var(--muted);font-family:var(--sans);font-size:11.5px;cursor:pointer}',
      '.atkvex svg{width:13px;height:13px}',
      '.atkvex[aria-pressed="true"]{border-style:solid;border-color:rgba(var(--adv-rgb),.6);background:rgba(var(--adv-rgb),.12);color:rgb(var(--adv-rgb))}',
      /* The bonus action: Quicken, then the smite with a button a level. */
      '.atkbonus{display:flex;gap:var(--gap-2)}',
      '.atkquick{flex:0 0 76px;height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid rgba(var(--quick-rgb),.6);border-radius:var(--r-control);background:rgba(var(--quick-rgb),.12);color:rgb(var(--quick-rgb));cursor:pointer}',
      '.atkquick svg{width:16px;height:16px}',
      '.atkquick:disabled{border-color:var(--edge);border-style:dashed;background:none;color:#4d4866;cursor:default}',
      '.atksp{display:flex;gap:3px}',
      '.atksp i{width:5px;height:5px;border-radius:3px;background:currentColor}',
      '.atksmite{flex:1 1 auto;min-width:0;height:44px;display:flex;align-items:center;gap:3px;padding:3px;border:1px solid var(--edge);border-radius:var(--r-control);color:#4d4866}',
      '.atksmite.live{border-color:rgba(var(--gold-rgb),.45);color:var(--gold)}',
      '.atksun{width:16px;height:16px;flex:0 0 auto;margin:0 2px 0 4px}',
      '.atklv{flex:1 1 0;min-width:0;height:36px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:0;border:1px solid rgba(var(--gold-rgb),.5);border-radius:var(--r-chip);background:rgba(var(--gold-rgb),.1);color:var(--gold);font-family:var(--display);font-size:13px;line-height:1;cursor:pointer;touch-action:manipulation}',
      '.atklv:disabled{border-color:transparent;background:none;color:#4d4866;cursor:default}',
      '.atkpips{display:flex;gap:2px;min-height:4px}',
      '.atkpips i{width:4px;height:4px;border-radius:2px;background:currentColor}',
      '.atkempty{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 2px;font-size:12px;color:var(--muted)}',
      /* The total of the turn, in the head, once there are two to add. */
      '.atkturn{display:flex;align-items:center;gap:5px;color:var(--muted)}',
      '.atkturn[hidden]{display:none}',
      '.atkturn svg{width:16px;height:16px}',
      '.atktt{font-family:var(--display);font-size:22px;font-weight:700;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}',
      '.atknew{width:18px;height:18px;margin-right:8px;flex:0 0 auto}'
    ].join('\n'),
    html: [
      '<div class="atkbody" id="atkBody"></div>',
      /* The cast block, in the shared look, last in the page. */
      C.cast.row({ buttons: [{ id: 'atkCast', label: 'Attack' }] })
    ].join('\n'),

    mount: function (root, a) {
      api = a;
      E = {
        body: root.querySelector('#atkBody'),
        cast: root.querySelector('#atkCast'),
        turnTotal: E.turnTotal || null
      };
      E.cast.addEventListener('click', strike);
      /* One listener for the whole body: the markup is painted again on
         every step, so the taps are read by what they hit. */
      E.body.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var b;
        if ((b = t.closest('[data-way]'))) { var w = b.dataset.way; if (turn().way !== w) step(function (tt) { tt.way = w; }); return; }
        if ((b = t.closest('[data-weapon]'))) { var id = b.dataset.weapon; if (turn().weapon !== id) step(function (tt) { tt.weapon = id; }); return; }
        if ((b = t.closest('.atktogs .vchip'))) {
          var key = b.dataset.key;
          if (key === 'sneak') step(function (tt) { tt.sneak = !tt.sneak; });
          else if (key === 'rage') toggleRage();
          else setMode(key);
          return;
        }
        if ((b = t.closest('[data-vex]'))) { vex(Number(b.dataset.vex)); return; }
        if ((b = t.closest('[data-flip]'))) { flip(Number(b.dataset.flip)); return; }
        if ((b = t.closest('#atkQuicken'))) { quicken(); return; }
        if ((b = t.closest('[data-smite]'))) { if (!b.disabled) smite(Number(b.dataset.smite)); return; }
        if ((b = t.closest('[data-go]'))) api.show(b.dataset.go);
      });
    },

    /* The total of the turn sits in the head of the app, where it is seen
       whatever the scroll of the cards. */
    head: function (root, a) {
      api = a;
      var span = document.createElement('span');
      span.className = 'atkturn';
      span.hidden = true;
      span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" role="img" aria-label="Damage this turn">' +
        '<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="9"/></svg><span class="atktt">0</span>';
      root.appendChild(span);
      E.turnTotal = span;
    },

    render: function (a) {
      api = a;
      /* The weapons, the spells and the features are read on the first
         paint, and a second call while a file is on its way is the same. */
      C.library.data('weapons');
      C.library.data('gear');
      C.library.data('spellbook');
      C.library.data('features');
      paint();
    }
  });
})();
