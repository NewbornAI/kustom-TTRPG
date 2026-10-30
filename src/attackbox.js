/* The attack boxes: the ways one attack is drawn, and the tap that rolls
   it. The card is the third: one roll of a turn on the attack sheet, the hit
   inside the big d20 and the damage beside it. The across box is a swing of an attack, the way the summon stat block
   draws it: the attack and its damage on the left, the die in the middle, the
   roll and its total on the right. The stacked box is one column of a page
   that lays its attacks out in a row: the hit in a die at the top, a beam, the
   damage under it. Each box is the markup and the look; what to roll stays with
   the page, and so does the verdict on the roll. The tap a swing answers is the
   across box's own: wire() hands a swing to the page, so every caller rolls the
   same way. The names say which box is which, because a brief that says "the
   attack box" was read as the wrong one once. */
(function (root) {
  'use strict';

  root.SheetAttackBox = function (deps) {
    var dieBig = deps.dieBig;
    var dieIcon = deps.dieIcon;
    var esc = deps.esc;
    var roll = deps.roll;

    /* The colour of a damage type, which is the look of the box and not of
       a page. An action that gives hit points back is a healing whatever it
       does not say. */
    var TYPES = {
      radiant: [255, 217, 138],
      fire: [255, 132, 70],
      lightning: [255, 212, 71],
      cold: [127, 216, 255],
      acid: [185, 227, 74],
      necrotic: [95, 208, 160],
      poison: [154, 216, 79],
      psychic: [255, 122, 217],
      force: [110, 155, 255],
      thunder: [183, 155, 255],
      bludgeoning: [201, 195, 221],
      piercing: [201, 195, 221],
      slashing: [201, 195, 221],
      healing: [122, 216, 111]
    };

    function colour(type) {
      var c = TYPES[type];
      return c ? 'rgb(' + c.join(',') + ')' : '';
    }

    function trio(type) {
      var c = TYPES[type];
      return c ? c.join(',') : '';
    }

    /* The kind of die a group of dice is. */
    function sidesOf(label) {
      var m = String(label || '').match(/d(\d+)/i);
      return m ? Number(m[1]) : 6;
    }

    function sign(value) {
      return value > 0 ? '+' + value : String(value);
    }

    /* The dice that were thrown away, when the roll had the advantage. A
       caller names the die it kept either way: a swing says roll, a beam says
       kept. */
    function others(res) {
      if (!res || !res.rolls || res.rolls.length < 2) return '';
      var kept = res.kept === undefined ? res.roll : res.kept;
      var at = res.rolls.indexOf(kept);
      var out = [];
      res.rolls.forEach(function (v, i) { if (i !== at) out.push(v); });
      return out.join(' ');
    }

    /* The state of one swing: a hit, a miss or a critical hit, carried by the
       outline alone. A roll with no target armour class is a hit, a natural
       twenty is a critical hit, and `flip` is the player overruling the sheet
       on the roll: it turns a hit into a miss and a miss into a hit, the
       critical included, so every tap changes what the box says. */
    function state(res, ac, flip) {
      if (!res) return 'hit';
      var hit = !!res.crit || ac === null || ac === undefined || ac === '' ||
        Number(res.total) >= Number(ac);
      if (flip) hit = !hit;
      if (!hit) return 'miss';
      return res.crit ? 'crit' : 'hit';
    }

    /* The dice of a damage: the shape of the die, then what it rolled, drawn
       by the one rendering of a roll the sheet has. A group may carry a
       colour of its own, for a smite that rides on it. */
    function diceShapes(groups, rolled, base) {
      return roll.groups((groups || []).map(function (g) {
        return {
          sides: sidesOf(g.label),
          rolls: rolled ? (g.rolls || []) : null,
          colour: g.colour || colour(g.type) || base
        };
      }), {});
    }

    /* ---- the across box ---- */

    /* The tap a swing answers: the die in the box, or the box itself, with the
       fields and the controls inside it keeping their own taps. One listener on
       the root, so a repaint of the box does not lose it, and the page decides
       what a roll means. */
    function wire(root, onRoll) {
      if (!root || !onRoll) return;
      root.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest('input, textarea, select')) return;
        var role = t.closest('[data-role]');
        if (role && role.dataset.role !== 'roll') return;
        var box = t.closest('.sblock[data-name]');
        if (!box) return;
        onRoll(Number(box.dataset.ix) || 0, box.dataset.name, box);
      });
    }

    /* The reach, as the book writes it: "600 ft - RANGED", "5 ft - MELEE". */
    function reachOf(range, kind) {
      var dist = String(range || '').replace(/^(range|reach)\s+/i, '').trim();
      var word = /melee/i.test(kind || '') ? 'MELEE' : (/ranged/i.test(kind || '') ? 'RANGED' : '');
      if (!dist) return word;
      return dist + (word ? ' - ' + word : '');
    }

    /* One swing: the attack on the left, its damage under it, the die in the
       middle, what was rolled and what it adds up to on the right. */
    /* The kinds of a blow: one, or several when the book deals two (the
       trident of a mezzoloth is piercing and force). A caller that names one
       damage keeps the single line it always had. */
    function partsOf(o) {
      if (o.damages && o.damages.length) return o.damages;
      return [{ formula: o.damage || '', type: o.type || '' }];
    }

    /* The kinds written after the total, each in its colour. */
    function kindsOf(parts) {
      var types = [];
      parts.forEach(function (p) { if (p.type && types.indexOf(p.type) < 0) types.push(p.type); });
      return types.map(function (t) {
        var c = colour(t);
        return '<em class="stype"' + (c ? ' style="color:' + c + '"' : '') + '>' + esc(t) + '</em>';
      }).join('<span class="splus">+</span>');
    }

    function swing(opts) {
      var o = opts || {};
      var res = o.res || null;
      var parts = partsOf(o);
      var first = parts[0] || { formula: '', type: '' };
      var col = colour(first.type);
      var beam = trio(first.type);
      var trioStyle = beam ? ' style="--beam:' + beam + '"' : '';
      /* The dice of a blow of several kinds take the colour of the kind they
         come from, in the order the book writes them. */
      var typed = parts.filter(function (p) { return /\d*d\d+/i.test(p.formula || ''); });
      var groups = (o.groups || []).map(function (g, i) {
        if (g.type || !typed[i]) return g;
        return { label: g.label, rolls: g.rolls, count: g.count, sides: g.sides, type: typed[i].type };
      });
      var die = dieBig(20, res ? res.total : '');
      var st = o.state || state(res, o.ac, o.flip);
      var out = '<div class="sblock' + (st === 'crit' ? ' crit' : '') + (st === 'miss' ? ' miss' : '') + '"' +
        ' data-name="' + esc(o.name || '') + '" data-ix="' + (o.ix || 0) + '" data-tap' + trioStyle + '>';
      out += '<div class="shead"><span class="sname">' + esc(o.name || '') + '</span>' +
        (reachOf(o.range, o.kind) ? '<span class="sreach">' + esc(reachOf(o.range, o.kind)) + '</span>' : '') + '</div>';
      out += '<div class="satkgrid">';
      out += '<div class="scell-atk"><span class="sk">Attack</span>' +
        '<span class="snum2">' + esc(o.bonus || '') + '</span></div>';
      out += '<div class="scell-dmg"><span class="sk">Damage</span>' +
        parts.map(function (p) {
          var c = colour(p.type);
          return '<span class="sformula"' + (c ? ' style="color:' + c + '"' : '') + '>' + esc(p.formula || '') + '</span>';
        }).join('<span class="splus">+</span>') + '</div>';
      out += '<div class="scell-die"><button type="button" class="sdie" data-role="roll"' +
        ' data-ix="' + (o.ix || 0) + '" aria-label="Roll the attack">' + die + '</button></div>';
      out += '<div class="scell-hit"><span class="sdmini">' + dieIcon(20) + '</span>' +
        '<span class="snum2">' + (res ? res.roll : '--') + '</span>' +
        (others(res) ? '<span class="sother">' + others(res) + '</span>' : '') +
        (o.bonusOf !== null && o.bonusOf !== undefined ? '<span class="smod">' + sign(o.bonusOf) + '</span>' : '') + '</div>';
      /* A miss deals nothing, so the damage roll and its total stay off the
         box; the outline and the attack roll say the rest. */
      if (st !== 'miss') {
        out += '<div class="scell-dmgres">' + diceShapes(groups, !!res, col) +
          (o.flat ? '<span class="smod">' + sign(o.flat) + '</span>' : '') + '</div>';
        out += '<div class="scell-dmgtot"><span class="snum2"' + (col ? ' style="color:' + col + '"' : '') + '>' +
          (res ? res.damage : '--') + '</span>' + kindsOf(parts) + '</div>';
      }
      out += '</div>';
      /* A line the page brings rides inside the box, under the swing: the
         smite of the attack page is one, and the summon brings none. */
      (o.lines || []).forEach(function (line) { out += line; });
      out += '</div>';
      return out;
    }

    /* The same box with the wrench on: the two numbers are fields. */
    function edit(opts) {
      var o = opts || {};
      var out = '<div class="sblock" data-name="' + esc(o.name || '') + '">';
      out += '<div class="shead"><span class="sname">' + esc(o.name || '') + '</span>' +
        (reachOf(o.range, o.kind) ? '<span class="sreach">' + esc(reachOf(o.range, o.kind)) + '</span>' : '') + '</div>';
      out += '<div class="satkgrid">';
      out += '<div class="scell-atk"><span class="sk">Attack</span>' +
        '<input class="scin satkbonus" data-role="atkbonus" type="text" value="' + esc(o.bonus || '') + '" aria-label="Attack bonus">' + '</div>';
      out += '<div class="scell-dmg"><span class="sk">Damage</span>' +
        '<input class="scin satkdamage" data-role="atkdamage" type="text" value="' + esc(o.damage || '') + '" aria-label="Damage of the attack">' +
        (o.type ? '<em class="stype"' + (colour(o.type) ? ' style="color:' + colour(o.type) + '"' : '') + '>' + esc(o.type) + '</em>' : '') + '</div>';
      out += '</div></div>';
      return out;
    }

    /* ---- the stacked box ---- */

    function groupTotal(rolls) {
      var n = 0;
      for (var i = 0; i < rolls.length; i++) n += rolls[i];
      return n;
    }

    /* One group of damage: the shape of its die, then what it rolled, or the
       formula while it has not rolled. A group is drawn and is not a control:
       what it rolled rides in its title, and the page's own tap is the
       column's. The type is a class, so the kind keeps its colour. */
    function groupHtml(g, rolled) {
      var title = rolled ? ' title="' + g.rolls.join(', ') + '"' : '';
      var value = rolled ? groupTotal(g.rolls) : (g.label || '--');
      return '<span class="vg ' + g.type + '"' + title + '>' +
        dieIcon(sidesOf(g.label)) +
        '<span class="vgn' + (rolled ? '' : ' vghost') + '">' + value + '</span></span>';
    }

    /* The chain is one line when it fits and breaks between its groups when
       it does not. A plus rides with what follows it and the flat rides with
       the last group, so a break never leaves either of them on their own. */
    function chain(groups, rolled, flatType, flat) {
      var units = [];
      groups.forEach(function (g, i) {
        units.push({ plus: i > 0, html: groupHtml(g, rolled) });
      });
      if (flat) {
        var tail = '<span class="vplus">+</span><span class="vflat ' + flatType + '">' + flat + '</span>';
        if (units.length) units[units.length - 1].tail = tail;
        else units.push({ plus: false, html: '<span class="vflat ' + flatType + '">' + flat + '</span>' });
      }
      return units.map(function (u) {
        var inner = (u.plus ? '<span class="vplus">+</span>' : '') + u.html + (u.tail || '');
        return (u.plus || u.tail) ? '<span class="vtail">' + inner + '</span>' : inner;
      }).join('');
    }

    /* What every column of a board will roll, said once under it: the d20
       and the bonus to hit, then the dice and the flat of the damage. */
    function preview(groups, flatType, flat, bonus) {
      return '<span class="vmini">' + dieIcon(20) + '</span>' +
        '<span class="vmod">' + sign(Number(bonus) || 0) + '</span>' +
        '<span class="vdice">' + chain(groups || [], false, flatType || '', flat) + '</span>';
    }

    /* One column: the hit in a die at the top with what was rolled under it,
       the beam, then the damage. A miss keeps the hit and loses the damage,
       and the page's outline on the column says which it is, so no word rides
       inside. The page says what to draw: the groups of its damage, the flat
       it adds, the kinds it names, and the roll, or nothing for the column
       that has not rolled yet. */
    function cell(opts) {
      var o = opts || {};
      var res = o.res || null;
      var groups = o.groups || [];
      var kinds = o.types || [];
      var out = '';
      out += '<div class="vhit">';
      out += '<span class="vdie">' + dieBig(20, res ? res.total : '') + '</span>';
      /* A bare column is one that has not rolled: the page says what every
         column will roll once, under the board, so a column does not repeat
         it. */
      if (o.bare) return out + '</div><div class="vbeam"></div>';
      out += '<span class="vsum">';
      out += '<span class="vmini">' + dieIcon(20) + '</span>';
      out += '<span class="vroll' + (res ? '' : ' vghost') + '">' + (res ? res.kept : '--') + '</span>';
      if (others(res)) out += '<span class="vother">' + others(res) + '</span>';
      if (o.bonus !== null && o.bonus !== undefined && o.bonus !== '') out += '<span class="vmod">' + sign(o.bonus) + '</span>';
      out += '</span>';
      out += '</div>';
      out += '<div class="vbeam"></div>';
      if (o.miss) return out;
      /* the damage: the total, the kinds under it, the dice that made it */
      out += '<div class="vdmg">';
      out += '<div class="vdt' + (res ? '' : ' vghost') + '">' + (res ? res.damage : '--') + '</div>';
      out += '<div class="vkinds">';
      kinds.forEach(function (t) { out += '<em class="' + t + '">' + t + '</em>'; });
      out += '</div>';
      out += '<div class="vdice">' + chain(groups, !!res, o.flatType || '', o.flat) + '</div></div>';
      return out;
    }

    /* ---- the card: one roll of a turn ---- */

    /* The icon a part of the damage rides with, drawn in its own ink so the
       reader knows the rider without a word: True Strike's spark, Sneak
       Attack's blade, the smite's sun. */
    var RIDERS = {
      upgrade: { name: 'True Strike', ink: '#ffd98a', d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z' },
      sneak: { name: 'Sneak Attack', ink: '#c9b6ff', d: 'M14.5 3.5l6 6L10 20H4v-6zM8 12l4 4' },
      smite: { name: 'Divine Smite', ink: '#ffd27a', d: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v3M12 19v3M2 12h3M19 12h3' }
    };

    function rider(key) {
      var r = RIDERS[key];
      if (!r) return '';
      return '<svg class="acrider" viewBox="0 0 24 24" fill="none" stroke="' + r.ink + '" stroke-width="1.9" ' +
        'stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="' + r.name + '"><path d="' + r.d + '"/></svg>';
    }

    /* The types under the total: one type is its word, a split is each part
       with its own number, each in its colour. */
    function typesOf(read) {
      var order = read.order || [];
      if (!read.hit || !order.length) return '';
      return order.map(function (t) {
        var c = trio(t);
        return '<em' + (c ? ' style="color:rgba(' + c + ',.9)"' : '') + '>' +
          esc(order.length === 1 ? t : read.byType[t] + ' ' + t) + '</em>';
      }).join('');
    }

    /* One roll of a turn, read by the rules: the card a page lays out under
       its controls. The whole card is the tap that says hit or miss; a page
       may hang a line under it (a reminder of a mastery). `fresh` lands the
       dice once, `pop` pops a total that changed. */
    function card(o) {
      var read = o.read;
      var st = !read.hit ? 'miss' : (read.crit ? 'crit' : 'hit');
      var cls = 'acard ' + st + (read.kept === 1 ? ' nat1' : '') + (o.fresh ? ' fresh' : '') + (o.pop ? ' popped' : '');
      var out = '<div class="' + cls + '" data-ix="' + (o.ix || 0) + '">';
      out += '<button type="button" class="acflip" data-flip="' + (o.ix || 0) + '" aria-label="' +
        esc((read.hit ? (read.crit ? 'A critical hit, ' : 'A hit, ') + read.toHit + ', ' + read.damage + ' damage, tap to mark it a miss'
          : 'A miss, ' + read.toHit + ', tap to mark it a hit')) + '">';
      out += '<span class="acd20">' + dieIcon(20) + '<span class="achit">' + read.toHit + '</span></span>';
      out += '<span class="acmid"><span class="acnat"><span class="acmini">' + dieIcon(20) + '</span>' +
        '<span class="acnatk">' + read.kept + '</span>' +
        (read.other !== null && read.other !== undefined ? '<s class="acnato">' + read.other + '</s>' : '') + '</span>';
      out += '<span class="acdice">';
      var k = 0;
      var flatAt = -1;
      read.parts.forEach(function (p, i) { if (p.key === 'base' || p.key === 'upgrade') flatAt = i; });
      read.parts.forEach(function (p, i) {
        k += 1;
        out += '<span class="acpart" style="--k:' + Math.min(280, k * 35) + 'ms">' + rider(p.key) +
          roll.groups([{ sides: p.sides, rolls: p.rolls, colour: colour(p.type) }], {}) +
          (i === flatAt && read.flat ? '<span class="rflat">' + sign(read.flat) + '</span>' : '') + '</span>';
      });
      out += '</span></span>';
      out += '<span class="acdmg"><span class="actot">' + (read.hit ? read.damage : '\u2013') + '</span>' +
        '<span class="actypes">' + typesOf(read) + '</span></span>';
      out += '</button>' + (o.after || '') + '</div>';
      return out;
    }

    return {
      horizontal: { swing: swing, edit: edit, wire: wire, colour: colour, trio: trio, reach: reachOf, state: state },
      vertical: { cell: cell, state: state, preview: preview },
      card: { card: card, colour: colour, trio: trio }
    };
  };
})(typeof window !== 'undefined' ? window : this);
