/* The origin of a character: its species, its ability scores and its
   background, the three choices of the 2024 rules that come before the
   class. The creator of the phone and the fairy both go through here, so
   the rules are checked one way: the point buy and the array from the rules
   file, the species and their choices from the species file, the origin
   feats from the feats.

   An origin is data:
     { species, speciesChoice,
       method: 'pointbuy' | 'array' | 'manual', scores: {str..cha},
       background: { increase: {ability: 2 | 1}, feat, skills: [key, key], tool } }
   Every part may be left out; what is given is checked, and applied whole
   or not at all. */
(function (root) {
  'use strict';

  root.SheetOrigin = function (coreOf) {
    var ABS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

    function lib() { return coreOf().library; }

    function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

    function speciesOf(name) {
      var n = norm(name);
      return lib().species.filter(function (s) { return norm(s.name) === n; })[0] || null;
    }

    function originFeats() {
      return lib().feats.filter(function (f) { return /origin/i.test(f.category || ''); });
    }

    function skillOf(name) {
      var n = norm(name);
      return (coreOf().SR.SKILLS || []).filter(function (s) { return norm(s.key) === n || norm(s.name) === n; })[0] || null;
    }

    /* What the point buy costs, from the rules file. */
    function pointCost(scores) {
      var pb = lib().rules.pointBuy;
      if (!pb) return { error: 'the rules of the point buy are not here yet' };
      var total = 0;
      for (var i = 0; i < ABS.length; i++) {
        var v = Number(scores[ABS[i]]);
        if (!(v >= pb.min && v <= pb.max)) return { error: ABS[i] + ' is ' + scores[ABS[i]] + ': the point buy keeps every score from ' + pb.min + ' to ' + pb.max };
        total += Number(pb.cost[String(v)]) || 0;
      }
      if (total > pb.budget) return { error: 'the scores cost ' + total + ' points, over the ' + pb.budget + ' of the point buy', spent: total };
      return { spent: total, left: pb.budget - total };
    }

    /* The origin checked, made whole: the reasons it cannot be, or the
       parts to write. */
    function check(o) {
      o = o || {};
      var out = { why: [] };
      if (o.species) {
        var sp = speciesOf(o.species);
        if (!sp) out.why.push('no species "' + o.species + '": one of ' + lib().species.map(function (s) { return s.name; }).join(', '));
        else {
          out.species = sp;
          var ask = sp.traits.filter(function (t) { return t.choice; })[0];
          if (o.speciesChoice) {
            var opt = ask && ask.choice.options.filter(function (x) { return norm(x.name) === norm(o.speciesChoice) || norm(x.name).indexOf(norm(o.speciesChoice)) === 0; })[0];
            if (!opt) out.why.push(sp.name + ' has no "' + o.speciesChoice + '"' + (ask ? ': ' + ask.choice.label + ' is one of ' + ask.choice.options.map(function (x) { return x.name; }).join(', ') : ''));
            else { out.choice = opt.name; out.choiceTrait = ask.key; }
          }
        }
      }
      if (o.scores) {
        var base = {};
        ABS.forEach(function (a) { base[a] = Math.floor(Number(o.scores[a])) || 0; });
        var method = o.method || 'manual';
        if (method === 'pointbuy') {
          var cost = pointCost(base);
          if (cost.error) out.why.push(cost.error); else out.spent = cost.spent;
        } else if (method === 'array') {
          var want = (lib().rules.standardArray || []).slice().sort().join(',');
          var got = ABS.map(function (a) { return base[a]; }).sort().join(',');
          if (want !== got) out.why.push('the standard array is ' + (lib().rules.standardArray || []).join(', ') + ', one to each ability');
        } else if (ABS.some(function (a) { return base[a] < 1 || base[a] > 30; })) {
          out.why.push('a score is from 1 to 30');
        }
        out.base = base;
        out.method = method;
      }
      var bg = o.background;
      if (bg) {
        var inc = {};
        Object.keys(bg.increase || {}).forEach(function (k) {
          var a = String(k).toLowerCase().slice(0, 3);
          if (ABS.indexOf(a) >= 0 && Number(bg.increase[k])) inc[a] = Number(bg.increase[k]);
        });
        var plan = Object.keys(inc).map(function (a) { return inc[a]; }).sort().reverse().join(',');
        var plans = ((lib().rules.backgroundIncrease || {}).plans || [[2, 1], [1, 1, 1]]).map(function (p) { return p.join(','); });
        if (Object.keys(inc).length && plans.indexOf(plan) < 0) out.why.push('a background raises one score by 2 and another by 1, or three scores by 1');
        out.increase = inc;
        if (bg.feat) {
          var n = norm(bg.feat);
          var feat = originFeats().filter(function (f) { return norm(f.name) === n; })[0];
          if (!feat) out.why.push('"' + bg.feat + '" is not an Origin feat: one of ' + originFeats().map(function (f) { return f.name; }).join(', '));
          else out.feat = feat;
        }
        var skills = [];
        (bg.skills || []).forEach(function (s) {
          var k = skillOf(s);
          if (!k) out.why.push('no skill "' + s + '"');
          else if (skills.indexOf(k.key) < 0) skills.push(k.key);
        });
        if (skills.length > 2) out.why.push('a custom background gives two skills');
        out.skills = skills;
        out.tool = String(bg.tool || '').trim();
        out.background = String(bg.name || 'Custom').trim() || 'Custom';
      }
      var cap = (lib().rules.backgroundIncrease || {}).cap || 20;
      if (out.base && out.increase) {
        ABS.forEach(function (a) { if ((out.base[a] || 0) + (out.increase[a] || 0) > cap && out.increase[a]) out.why.push(a + ' would go over ' + cap); });
      }
      return out;
    }

    /* Written onto the record: the species and its traits on the features,
       the scores with the background's increases, the origin feat and the
       two skills. */
    function apply(rec, o) {
      var c = check(o);
      if (c.why.length) return { error: c.why.join('; ') };
      var ch = rec.char;
      ch.features = Array.isArray(ch.features) ? ch.features : [];
      var have = {};
      ch.features.forEach(function (f) { have[f.key] = true; });
      var added = [];
      function row(key, name, source) {
        if (have[key]) return;
        have[key] = true;
        ch.features.push({ key: key, name: name, source: source, active: false, max: 0, left: 0, recovery: 'passive', cost: '', short: null, hidden: false });
        added.push(name);
      }
      if (c.species) {
        ch.species = c.species.name;
        if (c.choice) ch.speciesChoice = c.choice;
        if (c.species.speed) ch.speed = c.species.speed;
        c.species.traits.forEach(function (t) {
          row(t.key, t.name + (t.key === c.choiceTrait && c.choice ? ' (' + c.choice + ')' : ''), c.species.name);
        });
      }
      if (c.base) {
        ch.abilities = ch.abilities || {};
        ABS.forEach(function (a) { ch.abilities[a] = c.base[a] + ((c.increase || {})[a] || 0); });
        ch.creation = { method: c.method, base: c.base };
      } else if (c.increase) {
        ABS.forEach(function (a) { if (c.increase[a]) ch.abilities[a] = Math.min(20, (Number(ch.abilities[a]) || 10) + c.increase[a]); });
      }
      if (o && o.background) {
        ch.background = { name: c.background, increase: c.increase || {}, feat: c.feat ? c.feat.name : '', skills: c.skills || [], tool: c.tool || '' };
        if (c.feat) row('feat-' + norm(c.feat.name).replace(/ /g, '-'), c.feat.name, 'Feat');
        ch.skills = ch.skills || {};
        (c.skills || []).forEach(function (k) { if (!(Number(ch.skills[k]) > 0)) ch.skills[k] = 1; });
      }
      return { ok: true, added: added, abilities: ch.abilities, spent: c.spent };
    }

    /* The ability a feat raises, short: "+1 Int, Wis or Cha". One reading for
       the picker of the features and the creator's origin feat. */
    var AB_SHORT = { Strength: 'Str', Dexterity: 'Dex', Constitution: 'Con', Intelligence: 'Int', Wisdom: 'Wis', Charisma: 'Cha' };
    function featAbility(feat) {
      var b = (feat.blocks || []).filter(function (x) { return x && /ability score/i.test(x.lead || ''); })[0];
      if (!b) return '';
      var names = (String(b.text).match(/Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma/g) || [])
        .filter(function (x, i, l) { return l.indexOf(x) === i; }).map(function (x) { return AB_SHORT[x]; });
      var by = (String(b.text).match(/by (\d+)/) || [])[1] || '1';
      if (!names.length) return 'An ability +' + by;
      if (names.length === 6) return '+' + by + ' to any ability';
      return '+' + by + ' ' + (names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] : names[0]);
    }

    return { featAbility: featAbility, check: check, apply: apply, pointCost: pointCost, originFeats: originFeats, speciesOf: speciesOf, ABS: ABS };
  };
})(typeof window !== 'undefined' ? window : this);
