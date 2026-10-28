import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import * as harness from './harness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = harness.source('index.html');
const block = html.match(/<script id="rules">([\s\S]*?)<\/script>/);
if (!block) throw new Error('rules block not found');

const ctx = vm.createContext({});
vm.runInContext(block[1], ctx);
const R = ctx.Rules;

const sheetBlock = html.match(/<script id="sheet-rules">([\s\S]*?)<\/script>/);
if (!sheetBlock) throw new Error('sheet rules block not found');
const sheetCtx = vm.createContext({});
vm.runInContext(sheetBlock[1], sheetCtx);
const C = sheetCtx.SheetRules;

/* The one rendering of a roll the sheet has: the block run with the rules of
   this suite and a die of its own, for the blocks that draw their dice with
   it. A block is never handed a double of itself. */
function rollBlock(dieIcon) {
  const ctx = vm.createContext({});
  vm.runInContext(harness.source('roll.js'), ctx);
  return ctx.SheetRoll({
    rules: R,
    dieIcon: dieIcon || ((sides) => '<svg viewBox="0 0 24 24" data-d="' + sides + '"></svg>'),
    esc: (t) => String(t === undefined || t === null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  });
}

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + '\n        got      ' + a + '\n        expected ' + e);
}

const maxRoll = () => 0.999999;
const minRoll = () => 0;
const nearNineteen = () => 0.9;

console.log('the harness');
{
  /* The build the suite reads runs from the sources now, so a stale dist
     cannot pass an inlining check. A page is run with a core the harness
     refuses to let answer a name the real core does not carry. */
  const dist = harness.built();
  check('the build answers the page it wrote',
    dist.html.indexOf('window.Sheet = { page: page, core: core, show: show };') >= 0, true);
  check('and a data file beside it', dist.data('features').features.length > 100, true);
  const stub = harness.coreStub({ SR: C, library: { data: () => null, featureByKey: {} }, chrome: { esc: (t) => t, sectionHead: () => '', restIcon: () => '' }, counter: {} });
  check('a stub carries the boxes a page asks for', [!!stub.library, !!stub.chrome, !!stub.counter], [true, true, true]);
  const spec = harness.page('features', { core: stub });
  check('a page comes back as the spec it registered', [spec.id, typeof spec.mount], ['features', 'function']);
  check('and a stub refuses a name the core does not carry', (() => {
    try { harness.coreStub({ library: { madeUp: 1 } }); return 'no error'; }
    catch (err) { return err.message; }
  })(), 'the core carries no library.madeUp');
}

/* The one load order that matters: every module the shell builds from is
   inlined before it, and a module added later cannot be forgotten. */
const MODULES = ['github.js', 'block.js', 'card.js', 'counter.js', 'record.js', 'edit.js', 'rest.js', 'rebuild.js', 'drag.js', 'roll.js', 'cast.js', 'slider.js', 'attackbox.js', 'toggle.js', 'shelf.js', 'klass.js'];
check('every module is inlined before the shell', MODULES.filter((file) => {
  const at = html.indexOf('src="' + file + '"');
  return at < 0 || at > html.indexOf('src="shell.js"');
}), []);

console.log('a set of dice');
{
  /* A set is what the sheet writes: 2d6+1 is two d6 and one more. The block
     draws it and the tray throws it, so the reading and the rolling belong
     here, where no document is needed. */
  check('a set reads its dice and its flat',
    JSON.stringify(R.setIn('2d6+1')), JSON.stringify({ dice: [{ sides: 6, count: 2 }], flat: 1 }));
  check('a die written without a count is one',
    JSON.stringify(R.setIn('d20')), JSON.stringify({ dice: [{ sides: 20, count: 1 }], flat: 0 }));
  check('two kinds stay apart',
    R.setIn('1d10 + 1d6 + 5').dice.map((d) => d.count + 'd' + d.sides).join('+'), '1d10+1d6');
  check('and the flat rides beside them', R.setIn('1d10 + 1d6 + 5').flat, 5);
  check('an empty set rolls nothing', R.rollSet(R.setIn(''), minRoll).total, 0);
  const low = R.rollSet(R.setIn('2d6+1'), minRoll);
  check('every die that fell', low.groups[0].rolls.join(' '), '1 1');
  check('the total adds the flat once', low.total, 3);
  const high = R.rollSet(R.setIn('2d6+1'), maxRoll);
  check('a die that falls is a die of its kind', high.groups[0].rolls.join(' '), '6 6');
  check('and the total is the dice and the flat', high.total, 13);
  check('a kind asked for with no count is left out',
    R.rollSet({ dice: [{ sides: 6, count: 0 }] }, minRoll).total, 0);
}

console.log('the divine smite');
{
  /* The dice of the smite are the book's own words: the spell says 2d8, and
     one d8 more for every slot level above the first. */
  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  const smite = book.spells.find((s) => s.name === 'Divine Smite');
  check('the book carries the smite', !!smite, true);
  check('and its text names the dice',
    [smite.blocks.map((b) => b.text).join(' ').indexOf('2d8') >= 0,
      smite.blocks.map((b) => b.text).join(' ').indexOf('1d8') >= 0].join('/'), 'true/true');
  check('a first-level slot buys 2d8',
    JSON.stringify(R.smiteSet(1)), '{"dice":[{"sides":8,"count":2}],"flat":0}');
  check('and a third-level slot 4d8',
    R.smiteSet(3).dice[0].count, 4);
  check('a smite with no level still buys the first', R.smiteSet(0).dice[0].count, 2);
  check('and it rolls on the dice of the app', R.rollSet(R.smiteSet(2), maxRoll).total, 24);
  check('a critical hit doubles the dice of a first-level smite', R.smiteSet(1, true).dice[0].count, 4);
  check('and a third-level one doubles to eight', R.smiteSet(3, true).dice[0].count, 8);
  check('the doubling rides the slot and not the roll', R.smiteSet(2, false).dice[0].count, 3);
}

console.log('the roll block');
{
  /* The block is one file: the control a page places, and the one rendering
     of a roll the sheet has. It rolls no die of its own: the rolling is the
     rules' and the drawings are the shell's. */
  const src = harness.source('roll.js');
  check('the block registers', harness.built().html.indexOf('root.SheetRoll = function') >= 0, true);
  check('and the core carries it', harness.source('shell.js').indexOf('core.roll = window.SheetRoll(') >= 0, true);
  check('it builds a control in the node it is handed',
    src.indexOf('function control(node, opts)') >= 0, true);
  check('and the set it rolls may be computed at the tap',
    src.indexOf("typeof o.set === 'function' ? o.set() : o.set") >= 0, true);
  check('a roll is drawn by one rendering', src.indexOf('function groups(list, opts)') >= 0, true);
  check("the rolling is the rules module's", src.indexOf('rules.rollSet(setNow(), Math.random)') >= 0, true);
  check("the dice are the app's drawings", src.indexOf('dieIcon(sidesOf(g))') >= 0, true);
  /* The two attack boxes and the smite draw their dice with it, so the sheet
     has one rendering of a roll and no page invents a second. */
  check('the attack box draws its damage with it',
    harness.source('attackbox.js').indexOf('roll.groups(') >= 0, true);
  check('and the card of the attack sheet draws its parts with it',
    harness.source('attackbox.js').indexOf("roll.groups([{ sides: p.sides, rolls: p.rolls, colour: colour(p.type) }], {})") >= 0, true);
  /* No roll opens a roller: there is no tray, and the volley's dice are not a
     control, they are what the cast threw. */
  const volley = harness.source('pages/volley.js');
  check('no roll opens a roller',
    [volley.indexOf('data-set') >= 0, volley.indexOf('C.dice') >= 0].join('/'), 'false/false');
  check('and the tray is gone', harness.built().html.indexOf('dtray') < 0, true);
}

console.log('the cast block');
{
  /* One block for the button at the bottom of a page that casts: the volley's
     look, asked for by the volley and by the attack page, and no look of its
     own kept in either. */
  check('the block registers', harness.built().html.indexOf('root.SheetCast = function') >= 0, true);
  check('and the core carries it', harness.source('shell.js').indexOf('core.cast = window.SheetCast();') >= 0, true);
  const volleySrc = harness.source('pages/volley.js');
  const attackSrc = harness.source('pages/attack.js');
  check('both pages ask the block for the row',
    [volleySrc.indexOf('C.cast.row(') >= 0, attackSrc.indexOf('C.cast.row(') >= 0].join('/'), 'true/true');
  check('and neither keeps the button of its own',
    [volleySrc.indexOf('.vcast') < 0, attackSrc.indexOf('.atkcast') < 0].join('/'), 'true/true');
}

console.log('the level slider, the attack box and the toggle');
{
  /* The spell page's slider, the summon's attack box and the volley's chip,
     one block each: the page asks for it and keeps the handler, and the look
     is the shell's. */
  check('the slider registers', harness.built().html.indexOf('root.SheetSlider = function') >= 0, true);
  check('and the core carries it', harness.source('shell.js').indexOf('core.slider = window.SheetSlider()') >= 0, true);
  check('the attack box registers', harness.built().html.indexOf('root.SheetAttackBox = function') >= 0, true);
  check('and the core carries both boxes by their orientation',
    [harness.source('shell.js').indexOf('core.horizontalAttackBox = ATTACK.horizontal') >= 0,
      harness.source('shell.js').indexOf('core.verticalAttackBox = ATTACK.vertical') >= 0].join('/'),
    'true/true');
  check('the toggle registers', harness.built().html.indexOf('root.SheetToggle = function') >= 0, true);
  check('and the core carries it', harness.source('shell.js').indexOf('core.toggle = window.SheetToggle()') >= 0, true);
  const spellsSrc = harness.source('pages/spells.js');
  const summonsSrc = harness.source('pages/summons.js');
  const volleySrc = harness.source('pages/volley.js');
  const attackSrc = harness.source('pages/attack.js');
  check('the spell page asks the slider for the level',
    [spellsSrc.indexOf('C.slider.row(') >= 0, spellsSrc.indexOf('C.slider.wire(') >= 0].join('/'), 'true/true');
  check('the summons ask the across box for the roll, the attack sheet the card',
    [summonsSrc.indexOf('C.horizontalAttackBox.swing(') >= 0, summonsSrc.indexOf('C.horizontalAttackBox.edit(') >= 0,
      attackSrc.indexOf('C.attackCard.card(') >= 0].join('/'), 'true/true/true');
  /* The box carries the attack's name, and its reach right inside it, the way
     the book writes it. The summon no longer names the attack above the box,
     so the name is said once. */
  const boxCtx = vm.createContext({});
  vm.runInContext(harness.source('attackbox.js'), boxCtx);
  const boxes = boxCtx.SheetAttackBox({
    dieBig: () => '<svg></svg>', dieIcon: () => '<svg></svg>', esc: (t) => String(t), roll: rollBlock()
  });
  const box = boxes.horizontal;
  check('the reach reads the way the book writes it',
    [box.reach('range 600 ft', 'Ranged spell attack'), box.reach('reach 5 ft', 'Melee weapon attack'),
      box.reach('', 'Ranged Weapon')].join('/'), '600 ft - RANGED/5 ft - MELEE/RANGED');
  const swing = box.swing({ name: 'Longbow', kind: 'Ranged weapon attack', range: 'range 600 ft', bonus: '+5', damage: '1d8+3' });
  check('the box carries the attack name as its header',
    swing.indexOf('class="sname">Longbow') >= 0, true);
  check('and the reach right inside it', swing.indexOf('class="sreach">600 ft - RANGED') >= 0, true);
  check('the summon no longer names the attack above the box',
    summonsSrc.indexOf('satkhead') < 0, true);
  /* The three states are the outline alone: a roll with no armour class is a
     hit, a low total against one is a miss, a critical hit is its own state,
     and a tap overrules the hit. A miss carries no damage roll. */
  check('a roll with no target armour class is a hit',
    [box.state({ total: 3 }, null), box.state({ total: 3 }, '')].join('/'), 'hit/hit');
  check('a total under the armour class misses', box.state({ total: 9 }, 15), 'miss');
  check('and one at or over it hits', box.state({ total: 15 }, 15), 'hit');
  check('a critical hit is its own state, whatever the class', box.state({ total: 2, crit: true }, 20), 'crit');
  check('and a tap overrules any of them to a miss', box.state({ total: 20, crit: true }, 15, true), 'miss');
  check('a tap overrules a miss back to a hit', box.state({ total: 9 }, 15, true), 'hit');
  const missedBox = box.swing({ name: 'Longbow', res: { total: 9, roll: 9, damage: 4, crit: false }, state: 'miss' });
  check('the box of a miss carries no damage roll',
    [missedBox.indexOf('scell-dmgres') < 0, missedBox.indexOf('scell-hit') >= 0].join('/'), 'true/true');
  check('the box of a critical hit keeps its outline class',
    box.swing({ name: 'Longbow', res: { total: 20, roll: 20, damage: 9, crit: true } }).indexOf('class="sblock crit"') >= 0,
    true);
  /* The three outlines are the box's own, so no page draws one beside it. */
  check('the box draws the outline of a miss itself', missedBox.indexOf('class="sblock miss"') >= 0, true);
  check('and the attack page keeps no class of the box',
    attackSrc.indexOf('atkmiss') < 0, true);
  check('the volley cells take their state from the block',
    [volleySrc.indexOf('C.horizontalAttackBox.state(') >= 0, volleySrc.indexOf('vmiss') >= 0,
      volleySrc.indexOf('vcrit') >= 0].join('/'), 'true/true/true');
  check('and a tap overrules one beam, and a new roll clears it',
    [volleySrc.indexOf('over[at.part][at.k] = !over[at.part][at.k]') >= 0,
      volleySrc.indexOf('over[part] = {};') >= 0].join('/'), 'true/true');
  check('no page reads a target armour class any more',
    [attackSrc.indexOf('targetAc') < 0, volleySrc.indexOf('S.ac') < 0].join('/'), 'true/true');
  /* The tap that rolls a swing is the box's, so both callers get it the same
     way: the page says what a roll is, and the box says what counts as the
     tap. The attack page therefore rolls on a tap of the box, as the summon
     does, and the tap that overrules a hit is the volley's alone. */
  check('the summons let the box take the tap of a swing',
    summonsSrc.indexOf('C.horizontalAttackBox.wire(') >= 0, true);
  check('and neither wires the die by hand',
    [summonsSrc.indexOf("role === 'roll') {") < 0, summonsSrc.indexOf("closest('.sblock')") >= 0].join('/'),
    'true/true');
  check('the attack page no longer hides the die of the box',
    attackSrc.indexOf('rollable') < 0, true);
  check('and the attack sheet reads the verdict from the rules, a tap flipping it',
    [attackSrc.indexOf('R.turnRead(t)') >= 0, attackSrc.indexOf('t.rolls[ix].flip = !t.rolls[ix].flip') >= 0].join('/'),
    'true/true');
  check('and the state is never a word on the attack page',
    [attackSrc.indexOf("atkflag crit") < 0, attackSrc.indexOf("'missed'") < 0].join('/'), 'true/true');
  check('the volley asks the block for a grid of three that never reflows',
    volleySrc.indexOf('C.toggle.fill(E.chips, CHIPS, { cols: 3 })') >= 0, true);
  /* The six toggles: an icon each, Elem carrying its dice as a pill, Quicken
     greyed in its cell off Eldritch Blast, and no target armour class: a tap
     on a beam says hit or miss. */
  const vctx = vm.createContext({});
  vm.runInContext(harness.source('toggle.js'), vctx);
  const T = vctx.SheetToggle();
  const pair = T.chip({ key: 'elem', label: 'Elem', icon: 'M13 2 4 14h7l-1 8 9-12h-7z', on: true,
    pill: { key: 'elemPlus', label: '2d', aria: 'Elem dice' } });
  check('a chip carries its icon before its word', /<svg class="vchipi"[^>]*><path d="M13 2 4 14h7l-1 8 9-12h-7z"\/><\/svg>Elem/.test(pair), true);
  check('and a pill beside it, shown while the chip is on',
    [pair.indexOf('class="chippair"') >= 0, /chippill"[^>]*data-key="elemPlus"/.test(pair), pair.indexOf(' hidden>2d') < 0].join('/'), 'true/true/true');
  check('an icon is a path and nothing else', T.chip({ key: 'x', label: 'X', icon: '"><script>' }).indexOf('<svg') < 0, true);
  check('the volley has six toggles and no plus chip',
    [(volleySrc.match(/\{ key: '(advantage|hex|curse|elem|quicken|autocrit)'/g) || []).length,
      volleySrc.indexOf("label: '+'") < 0].join('/'), '6/true');
  check('quicken greys in its cell off Eldritch Blast',
    volleySrc.indexOf('if (chip.only) b.disabled = S.power !== chip.only;') >= 0, true);
  check('and the target armour class is gone from the volley',
    [volleySrc.indexOf('id="ac"') < 0, volleySrc.indexOf('S.ac') < 0, volleySrc.indexOf('head: function') < 0].join('/'),
    'true/true/true');
  check('and the attack sheet asks it for its toggles and its two segments',
    [attackSrc.indexOf('toggles.map(C.toggle.chip)') >= 0, attackSrc.indexOf("C.toggle.segment({ key: 'way'") >= 0,
      attackSrc.indexOf("C.toggle.segment({ key: 'weapon'") >= 0].join('/'), 'true/true/true');
  check('a segment is one block, the settings asking for it too',
    [harness.source('pages/settings.js').indexOf("C.toggle.segment({ key: 'rows'") >= 0,
      harness.source('index.html').indexOf('.seg{display:flex;') >= 0,
      harness.source('pages/settings.js').indexOf('.barseg') < 0].join('/'), 'true/true/true');
  /* The custom buttons are one shape: the row measures itself and the block
     splits it into two even rows when one cannot hold the words. */
  const toggleSrc = harness.source('toggle.js');
  check('the block carries the row of custom buttons',
    toggleSrc.indexOf('return { chip: chip, fill: fill, shape: shape, segment: segment };') >= 0, true);
  check('a row that does not fit takes two, the first taking the odd one',
    toggleSrc.indexOf('if (wrapped || crowded) cols = Math.ceil(items.length / 2);') >= 0, true);
  check('and a word wider than its share is a row that does not fit',
    toggleSrc.indexOf('items.some(function (b) { return b.offsetWidth > basis + 1; })') >= 0, true);
  check('a page that mounts hidden is measured when it has a width',
    toggleSrc.indexOf('requestAnimationFrame(function () { shape(node, true); })') >= 0, true);
  check('the shell writes the shape of a chip once',
    [harness.source('index.html').indexOf('.chiprow>button,.chiprow>.plugbar>button{') >= 0,
      volleySrc.indexOf('.vchip{') < 0, attackSrc.indexOf('.atkchip{') < 0,
      spellsSrc.indexOf('.tog{') < 0].join('/'), 'true/true/true/true');
  check('and none of them keeps the look of its own',
    [spellsSrc.indexOf('.crange') < 0, volleySrc.indexOf('.vchip{') < 0,
      summonsSrc.indexOf('.sblock{') < 0, attackSrc.indexOf('.atkline') < 0].join('/'),
    'true/true/true/true');
}

console.log('the feedback of a roll');
{
  /* One line says what a swing gave, in the voice of the line a cast says,
     and the box it was tapped on carries the outline. */
  const ctx = vm.createContext({});
  vm.runInContext(harness.source('feedback.js'), ctx);
  const lines = [];
  const feedback = ctx.SheetFeedback({ say: (t) => lines.push(t) });
  feedback.roll('Radiant Bow', { total: 17, damage: 12, crit: false });
  check('a rolled attack says what it gave', lines[0], 'Radiant Bow rolled 17, 12 damage');
  feedback.roll('Radiant Bow', { total: 20, damage: 18, crit: true });
  check('and a critical says so', lines[1], 'Radiant Bow rolled 20, 18 damage \u00b7 critical');
  check('the summons asks for that line',
    harness.source('pages/summons.js').indexOf('C.feedback.roll(') >= 0, true);
  const boxSrc = harness.source('attackbox.js');
  check('and the swing it was tapped on takes the outline',
    [boxSrc.indexOf('data-tap') >= 0,
      boxSrc.indexOf('data-tap') < boxSrc.indexOf('function edit(opts)')].join('/'),
    'true/true');
}

console.log('default eldritch blast');
{
  const v = R.rollVolley({ power: 'eb' }, minRoll);
  check('three beams', v.beams.length, 3);
  check('attack total is d20 + 9', v.beams[0].total, 10);
  check('damage is 1d10 + 5', v.beams[0].damage, 6);
  check('one damage group', v.beams[0].groups.length, 1);
  check('group label', v.beams[0].groups[0].label, '1d10');
  check('group type', v.beams[0].groups[0].type, 'force');
  check('no badge without an AC', v.beams[0].hit, null);
}

console.log('natural 20 doubles the damage dice');
{
  const v = R.rollVolley({ power: 'eb' }, maxRoll);
  check('crit', v.beams[0].crit, true);
  check('two d10 instead of one', v.beams[0].groups[0].label, '2d10');
  check('damage is 2d10 + 5, flat not doubled', v.beams[0].damage, 25);
  check('attack total', v.beams[0].total, 29);
}

console.log('the crit button');
{
  /* The crit button turns every further roll into a critical, whatever the
     die says: the player uses it on a target that cannot dodge. */
  const plain = R.rollVolley({ power: 'eb' }, minRoll);
  check('a one is not a crit without the button', plain.beams[0].crit, false);
  const auto = R.rollVolley({ power: 'eb', autocrit: true }, minRoll);
  check('every beam is a critical with it', auto.beams.every((b) => b.crit), true);
  check('and every damage group doubles', auto.beams[0].groups[0].label, '2d10');
  check('the hex dice double too',
    R.rollVolley({ power: 'eb', hex: true, autocrit: true }, minRoll).beams[0].groups[1].label, '2d6');
  check('the flat is not doubled', auto.beams[0].flat, 5);
}

console.log('curse');
{
  const v = R.rollVolley({ power: 'eb' }, nearNineteen);
  check('19 is not a crit without curse', v.beams[0].crit, false);
  const c = R.rollVolley({ power: 'eb', curse: true }, nearNineteen);
  check('19 is a crit with curse', c.beams[0].crit, true);
  check('curse adds 4 flat', c.beams[0].flat, 9);
  check('crit damage is 2d10 + 9', c.beams[0].damage, 29);
}

console.log('advantage');
{
  const v = R.rollVolley({ power: 'eb', advantage: true }, nearNineteen);
  check('three d20', v.beams[0].rolls.length, 3);
  check('keeps the highest', v.beams[0].kept, 19);
  check('total uses the kept die', v.beams[0].total, 28);
}

console.log('hex');
{
  const v = R.rollVolley({ power: 'eb', hex: true }, minRoll);
  check('adds a d6', v.beams[0].groups.length, 2);
  check('necrotic', v.beams[0].groups[1].type, 'necrotic');
  check('1d6 label', v.beams[0].groups[1].label, '1d6');
  check('damage is 1d10 + 1d6 + 5', v.beams[0].damage, 7);
  const c = R.rollVolley({ power: 'eb', hex: true }, maxRoll);
  check('crit doubles the hex dice too', c.beams[0].groups[1].label, '2d6');
}

console.log('minor elementals');
{
  const v = R.rollVolley({ power: 'eb', elem: true }, minRoll);
  check('adds 2d8 lightning', v.beams[0].groups[1].label, '2d8');
  check('lightning type', v.beams[0].groups[1].type, 'lightning');
  const p = R.rollVolley({ power: 'eb', elem: true, elemPlus: true }, minRoll);
  check('elem plus upgrades rather than stacks', p.beams[0].groups.length, 2);
  check('the lightning is 3d8', p.beams[0].groups[1].label, '3d8');
  check('damage is 1d10 + 3d8 + 5', p.beams[0].damage, 9);
  const c = R.rollVolley({ power: 'eb', elem: true, elemPlus: true }, maxRoll);
  check('a critical doubles it to 6d8', c.beams[0].groups[1].label, '6d8');
}

console.log('scorching ray');
{
  check('SR2 has three beams', R.rollVolley({ power: 'sr2' }, minRoll).beams.length, 3);
  check('SR3 has four beams', R.rollVolley({ power: 'sr3' }, minRoll).beams.length, 4);
  check('SR4 has five beams', R.rollVolley({ power: 'sr4' }, minRoll).beams.length, 5);
  check('SR5 has six beams', R.rollVolley({ power: 'sr5' }, minRoll).beams.length, 6);
  const v = R.rollVolley({ power: 'sr2' }, minRoll);
  check('2d6 fire', [v.beams[0].groups[0].label, v.beams[0].groups[0].type], ['2d6', 'fire']);
  check('no flat bonus', v.beams[0].flat, 0);
  check('damage is 2d6', v.beams[0].damage, 2);
}

console.log('target AC');
{
  const v = R.rollVolley({ power: 'eb', ac: 15 }, minRoll);
  check('10 against AC 15 misses', v.beams[0].hit, false);
  const h = R.rollVolley({ power: 'eb', ac: 5 }, minRoll);
  check('10 against AC 5 hits', h.beams[0].hit, true);
  const t = R.tally(R.rollVolley({ power: 'eb', ac: 15 }, minRoll), 15);
  check('a miss adds no damage', t.total, 0);
  const t2 = R.tally(R.rollVolley({ power: 'eb', ac: 5 }, minRoll), 5);
  check('three hits add up', [t2.hits, t2.total], [3, 18]);
  /* The tap on a beam flips its verdict, so the total of the turn follows it:
     a hit taken back leaves the count, a miss called a hit joins it. */
  const flipped = R.tally(R.rollVolley({ power: 'eb', ac: 5 }, minRoll), 5, { 0: true, 1: true });
  check('a beam taken back leaves the total', [flipped.hits, flipped.total], [1, 6]);
  const called = R.tally(R.rollVolley({ power: 'eb', ac: 15 }, minRoll), 15, { 0: true });
  check('a miss called a hit joins it', [called.hits, called.total], [1, 6]);
  const critFlip = R.tally(R.rollVolley({ power: 'eb', ac: 5 }, maxRoll), 5, { 0: true });
  check('a critical taken back is no critical', [critFlip.hits, critFlip.crits], [2, 2]);
}


console.log('the flat bonus');
{
  const v = R.rollVolley({ power: 'eb' }, minRoll);
  check('the flat is force damage', v.flatType, 'force');
  check('the primary type of eldritch blast', R.primaryType(R.powerOf('eb')), 'force');
  const t = R.tally(v, null);
  check('the flat sits in the force pile', t.byType.force, 18);
  check('and it is not a pile of its own', t.order, ['force']);
  check('the total is the same', t.total, 18);
  const c = R.tally(R.rollVolley({ power: 'eb', curse: true }, minRoll), null);
  check('the curse flat is force too', c.byType.force, 30);
  const s = R.tally(R.rollVolley({ power: 'sr2', curse: true }, minRoll), null);
  check('on a scorching ray the flat is fire', s.byType.fire, 18);
  check('and no force there', s.byType.force, undefined);
  const crit = R.tally(R.rollVolley({ power: 'eb' }, maxRoll), null);
  check('a critical doubles the dice, not the flat', crit.byType.force, 75);
}

console.log('the numbers of the caster');
{
  check('the spell keeps its own attack', R.attackMod({ power: 'eb' }), 9);
  check('the character can give the attack', R.attackMod({ power: 'eb', attackMod: 7 }), 7);
  const v = R.rollVolley({ power: 'eb', attackMod: 7 }, minRoll);
  check('the attack uses it', v.beams[0].total, 8);
  check('the spell keeps its own flat', R.flatMod({ power: 'eb' }, R.powerOf('eb')), 5);
  check('the character can give the flat', R.flatMod({ power: 'eb', flatMod: 3 }, R.powerOf('eb')), 3);
  const f = R.rollVolley({ power: 'eb', flatMod: 3 }, minRoll);
  check('the damage carries it', f.beams[0].damage, 4);
  check('a scorching ray has no flat', R.flatMod({ power: 'sr2', flatMod: 3 }, R.powerOf('sr2')), 0);
}

console.log('quicken');
{
  check('off by default', R.quickened({ power: 'eb' }), false);
  check('on for eldritch blast', R.quickened({ power: 'eb', quicken: true }), true);
  check('not for a scorching ray', R.quickened({ power: 'sr3', quicken: true }), false);
  check('the board shows three beams', R.beamCount({ power: 'eb' }), 3);
  check('and six when quickened', R.beamCount({ power: 'eb', quicken: true }), 6);
  check('a scorching ray keeps its own count', R.beamCount({ power: 'sr3', quicken: true }), 4);
  const v = R.rollVolley({ power: 'eb', quicken: true }, minRoll);
  check('six beams are rolled', v.beams.length, 6);
  check('the second row is marked', v.beams.slice(3).every((b) => b.quick), true);
  check('the first row is not', v.beams.slice(0, 3).some((b) => b.quick), false);
  check('every beam rolls its own attack', v.beams[3].total, 10);
  const t = R.tally(v, null);
  check('the tally counts both rows', t.total, 36);
  check('and the force pile holds all of it', t.byType.force, 36);
  const h = R.rollVolley({ power: 'eb', quicken: true, hex: true }, minRoll);
  check('the quickened row carries the hex too', h.beams[3].groups.length, 2);
  const q = R.rollVolley({ power: 'sr3', quicken: true }, minRoll);
  check('a quickened scorching ray stays at four beams', q.beams.length, 4);
}

console.log('wild magic surge');
{
  const surge = JSON.parse(readFileSync(resolve(root, 'data', 'wild-magic-surge-xphb.json'), 'utf8'));
  check('twenty five rows', surge.rows.length, 25);

  const seen = new Array(101).fill(0);
  surge.rows.forEach((r) => { for (let v = r.from; v <= r.to; v++) seen[v]++; });
  check('every value from 1 to 100 is covered once', seen.slice(1).every((n) => n === 1), true);

  const first = (v) => { let used = false; return () => { if (!used) { used = true; return (v - 0.5) / 100; } return 0.5; }; };
  let maps = true;
  for (let v = 1; v <= 100; v++) {
    const r = R.rollSurge(surge.rows, first(v));
    if (r.roll !== v || r.from > v || r.to < v) { maps = false; break; }
  }
  check('the d100 lands on the row that covers it', maps, true);

  check('finds 2d10 in a sentence', R.diceIn('You regain 2d10 hit points.').map((d) => d.label), ['2d10']);
  check('reads a d10 as one die', R.diceIn('Roll a d10. Your height changes.').map((d) => d.label), ['1d10']);
  check('ignores a spell level', R.diceIn('You cast Fireball as a 3rd-level spell centered on yourself.').length, 0);
  check('ignores feet and minutes', R.diceIn('A creature within 30 feet of you is poisoned for 1 minute.').length, 0);

  const hitRow = surge.rows.find((r) => /2d10 Hit Points/.test(r.text));
  check('a row that asks for dice exists', !!hitRow, true);
  const hit = R.rollSurge(surge.rows, first(hitRow.from));
  check('lands on that row', [hit.from, hit.to], [hitRow.from, hitRow.to]);
  check('rolls the dice the row asks for', hit.dice.map((d) => d.label).indexOf('2d10') >= 0, true);
  check('keeps the row text', hit.text, hitRow.text);

  const plainRow = surge.rows.find((r) => !/\dd\d+/.test(r.text));
  const plain = R.rollSurge(surge.rows, first(plainRow.from));
  check('a row without dice rolls nothing', plain.dice.length, 0);
}

console.log('the spell book');
{
  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  check('the book has spells', book.spells.length > 150, true);
  check('the sheet seeded the list', book.seed.length > 40, true);
  check('every seeded spell is in the book', book.seed.filter((s) => !book.spells.some((x) => x.name === s.name)).length, 0);
  check('every seeded spell names its source', book.seed.every((s) => !!s.source), true);
  const seedLevels = {};
  for (const s of book.seed) seedLevels[s.level] = (seedLevels[s.level] || 0) + 1;
  check('the sheet has cantrips', seedLevels[0] > 5, true);
  check('the sheet has level 5 spells', seedLevels[5] > 0, true);
  const eb = book.spells.find((s) => s.name === 'Eldritch Blast');
  check('eldritch blast is a cantrip', eb.level, 0);
  check('it has a casting time', eb.time.length > 0, true);
  check('it has a range', eb.range.length > 0, true);
  check('it has components', eb.components.length > 0, true);
  check('it has blocks', eb.blocks.length > 0, true);
  check('every spell carries its book and page', book.spells.every((s) => !!s.ref && !!s.ref.book && s.ref.page > 0), true);
  check('eldritch blast opens on the wizard page', eb.ref.book + '/' + eb.ref.page, 'XPHB/267');
  const fb = book.spells.find((s) => s.name === 'Fireball');
  check('fireball has the higher level section', fb.blocks.some((b) => b.t === 'h' && /Using a Higher-Level Spell Slot/.test(b.text)), true);
  check('a spell carries a table', book.spells.some((s) => s.blocks.some((b) => b.t === 'table')), true);
  const hex = book.spells.find((s) => s.name === 'Hex');
  check('hex is a level 1 spell', hex.level, 1);
  const shield = book.spells.find((s) => s.name === 'Shield');
  check('shield reaches self', shield.range, 'Self');
  const fog = book.spells.find((s) => s.name === 'Fog Cloud');
  check('fog cloud holds concentration', fog.concentration, true);
  check('magic missile does not', book.spells.find((s) => s.name === 'Magic Missile').concentration, false);
  check('durations read in the plural', book.spells.find((s) => s.name === 'Detect Magic').duration, '10 minutes');
  check('the sheet seeded the level 2 spells', book.seed.filter((s) => s.level === 2).length, 11);
  const fireball = book.spells.find((s) => s.name === 'Fireball');
  check('the damage is marked', fireball.blocks[0].text.indexOf('[[d:8d6 Fire damage]]') >= 0, true);
  check('the saving throw is marked', fireball.blocks[0].text.indexOf('[[s:Dexterity saving throw]]') >= 0, true);
  const hold = book.spells.find((s) => s.name === 'Hold Person');
  check('the condition is marked', hold.blocks[0].text.indexOf('[[c:Paralyzed]]') >= 0, true);
  const chaos = book.spells.find((s) => s.name === 'Chaos Bolt');
  check('chaos bolt keeps its base damage', chaos.blocks[0].text.indexOf('[[d:2d8 + 1d6]]') >= 0, true);
  const chaosUp = chaos.blocks.filter((b) => b.t === 'p' && b.text.indexOf('extra damage') >= 0).map((b) => b.text)[0] || '';
  check('and its higher slots add 1d6, not the base dice',
    [chaosUp.indexOf('[[d:1d6]]') >= 0, chaosUp.indexOf('2d8')].join('/'), 'true/-1');
}

console.log('the conditions');
{
  /* A condition named in a description opens its own words, so the words
     travel in the page the build writes and the shell reads them there. */
  const conditions = JSON.parse(readFileSync(resolve(root, 'data', 'conditions.json'), 'utf8')).conditions;
  const byName = {};
  conditions.forEach((c) => { byName[c.name] = c; });
  check('the 2024 conditions are here', conditions.length, 15);
  check('every one carries its words', conditions.every((c) => c.blocks && c.blocks.length > 0), true);
  check('and its book and page', conditions.every((c) => !!c.ref && !!c.ref.book && c.ref.page > 0), true);
  check('the one a spell names reads',
    byName.Paralyzed.blocks.map((b) => b.text).join(' ').indexOf('Speed is 0') >= 0, true);
  check('a condition a condition names is here too', !!byName.Incapacitated, true);
  const block = harness.built().html.match(/<script id="conditions-data" type="application\/json">([\s\S]*?)<\/script>/);
  check('the build writes the conditions into the page', block ? JSON.parse(block[1]).conditions.length : 0, 15);
  check('and the shell reads them there', harness.source('shell.js').indexOf("readJson('conditions-data')") >= 0, true);
}

console.log('the classes of the book');
{
  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  check('the book holds every spell of the classes', book.spells.length > 350, true);
  check('every spell names a class', book.spells.every((s) => s.classes && s.classes.length > 0), true);
  /* The three spells the grimoire of the second character names and the
     classes of the app do not bring: they come from books outside the
     handbook, with the name and the source 5e.tools has. */
  const extra = ["Raulothim's Psychic Lance", 'Scatter', "Tasha's Otherworldly Guise"];
  check('the book carries the spells outside the handbook',
    extra.filter((n) => !book.spells.some((s) => s.name === n)), []);
  check('at the level their book gives them',
    extra.map((n) => book.spells.filter((s) => s.name === n)[0].level).join('/'), '4/6/6');
  check('from the books they come from',
    extra.map((n) => book.spells.filter((s) => s.name === n)[0].ref.book).join('/'), 'FTD/XGE/TCE');
  check('and the classes that can learn them',
    book.spells.filter((s) => s.name === 'Scatter')[0].classes.join('/'), 'Sorcerer/Warlock/Wizard');

  const shield = book.spells.find((s) => s.name === 'Shield');
  check('shield keeps the sorcerer', shield.classes.indexOf('Sorcerer') >= 0, true);
  check('shield keeps the wizard', shield.classes.indexOf('Wizard') >= 0, true);
  check('shield keeps the hexblade', shield.classes.indexOf('Hexblade') >= 0, true);
  check('the card shows the short casting time', shield.time, 'Reaction');
  check('the full page keeps the trigger', shield.timeFull, '1 reaction, which you take when you are hit by an attack roll or targeted by the Magic Missile spell');

  const smite = book.spells.find((s) => s.name === 'Searing Smite');
  check('a smite keeps its trigger', /^1 bonus action, which you take/.test(smite.timeFull), true);

  const eb = book.spells.find((s) => s.name === 'Eldritch Blast');
  check('a spell without a trigger has no clause', !/which/.test(eb.timeFull), true);
  check('the whole time still reads', eb.timeFull, '1 action');

  const sorcerer = book.spells.filter((s) => s.classes.indexOf('Sorcerer') >= 0);
  check('the sorcerer has spells in the book', sorcerer.length > 100, true);
  const hexblade = book.spells.filter((s) => s.classes.indexOf('Hexblade') >= 0);
  check('the hexblade brings his expanded list', hexblade.length >= 10, true);
  check('the hexblade brings blur', hexblade.some((s) => s.name === 'Blur'), true);
  check('the hex spelling of a source becomes the hexblade', book.spells.find((s) => s.name === 'Blur').classes.indexOf('Hexblade') >= 0, true);
  check('the sheet sources are in the classes', book.spells.find((s) => s.name === 'Produce Flame').classes.indexOf('Izzet engineer') >= 0, true);
}

console.log('the spell levels');
{
  check('cantrip to ninth', R.LEVELS.join(','), '0,1,2,3,4,5,6,7,8,9');
  check('the warlock slots sit at level 2', R.WARLOCK_LEVEL, 2);
  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  check('the book has spells for every level shown', R.LEVELS.every((lv) => book.spells.some((s) => s.level === lv)), true);
}

console.log('turning a spell slot into sorcery points');
{
  const spell = { sp: 3, spMax: 8, left: { 1: 4, 2: 3, 3: 3 } };
  check('a level 2 slot gives 2 points', R.convertSlot(spell, 2), { left: 2, warlockLeft: 0, usedWarlock: false, sp: 5, gained: 2 });
  check('a level 1 slot gives 1 point', R.convertSlot({ sp: 0, spMax: 8, left: { 1: 2 } }, 1), { left: 1, warlockLeft: 0, usedWarlock: false, sp: 1, gained: 1 });
  check('a level 3 slot gives 3 points', R.convertSlot({ sp: 0, spMax: 8, left: { 3: 1 } }, 3), { left: 0, warlockLeft: 0, usedWarlock: false, sp: 3, gained: 3 });
  check('no slot, no points', R.convertSlot({ sp: 0, spMax: 8, left: { 2: 0 } }, 2), null);
  check('cantrips are not slots', R.convertSlot({ sp: 0, spMax: 8, left: { 0: 9 } }, 0), null);
  check('full points take no slot', R.convertSlot({ sp: 8, spMax: 8, left: { 2: 3 } }, 2), null);
  check('the points stop at the maximum', R.convertSlot({ sp: 7, spMax: 8, left: { 3: 1 } }, 3), { left: 0, warlockLeft: 0, usedWarlock: false, sp: 8, gained: 1 });
  check('the warlock slots go first', R.convertSlot({ sp: 0, spMax: 8, left: { 2: 3 }, warlockLeft: 2 }, 2), { left: 3, warlockLeft: 1, usedWarlock: true, sp: 2, gained: 2 });
  check('the sorcerer slot is next', R.convertSlot({ sp: 0, spMax: 8, left: { 2: 3 }, warlockLeft: 0 }, 2), { left: 2, warlockLeft: 0, usedWarlock: false, sp: 2, gained: 2 });
  check('the warlock slots are only at level 2', R.convertSlot({ sp: 0, spMax: 8, left: { 3: 1 }, warlockLeft: 2 }, 3), { left: 0, warlockLeft: 2, usedWarlock: false, sp: 3, gained: 3 });
}

console.log('the character sheet');
{
    check('six abilities', C.ABILITIES.length, 6);
    check('eighteen skills', C.SKILLS.length, 18);
    check('twenty is a plus five', C.abilityMod(20), 5);
    check('ten is a zero', C.abilityMod(10), 0);
    check('nine is a minus one', C.abilityMod(9), -1);
    check('eight is a minus one', C.abilityMod(8), -1);
    check('seven is a minus two', C.abilityMod(7), -2);
    check('level one gives a plus two', C.profBonus(1), 2);
    check('level eight gives a plus three', C.profBonus(8), 3);
    check('level nine gives a plus four', C.profBonus(9), 4);
    check('level seventeen gives a plus six', C.profBonus(17), 6);

    const hero = {
      level: 9,
      abilities: { str: 10, dex: 14, con: 16, int: 8, wis: 12, cha: 20 },
      saves: { str: 0, dex: 0, con: 1, int: 0, wis: 0, cha: 1 },
      skills: { athletics: 1, perception: 1 }
    };
    check('a proficient save takes the proficiency', C.saveMod(hero, 'cha'), 9);
    check('a plain save does not', C.saveMod(hero, 'str'), 0);
    check('a proficient skill takes the proficiency', C.skillMod(hero, 'athletics'), 4);
    check('a plain skill does not', C.skillMod(hero, 'stealth'), 2);
    check('the spell attack is charisma and proficiency', C.spellAttack(hero), 9);
    check('the save DC is eight plus both', C.spellDC(hero), 17);
    check('the attack agrees with the volley', C.spellAttack(hero), R.ATTACK_MOD);
    check('the DC agrees with the spell tab', C.spellDC(hero), 17);

    check('the proficiency cycles to proficient', C.nextProf(0), 1);
    check('the proficiency cycles to expertise', C.nextProf(1), 2);
    check('the proficiency cycles back to none', C.nextProf(2), 0);
    check('a row starts without proficiency', C.profLabel(0), 'not proficient');
    check('one is proficient', C.profLabel(1), 'proficient');
    check('two is expertise', C.profLabel(2), 'expertise');
    check('expertise takes the saving throw proficiency twice', C.saveMod({ level: hero.level, abilities: hero.abilities, saves: { cha: 2 } }, 'cha'), 13);
    check('expertise takes the skill proficiency twice', C.skillMod({ level: hero.level, abilities: hero.abilities, skills: { athletics: 2 } }, 'athletics'), 8);
    check('no proficiency leaves the ability alone', C.skillMod({ level: hero.level, abilities: hero.abilities, skills: { athletics: 0 } }, 'athletics'), 0);

    check('hit points stop at zero', C.hpApply(3, 10, -5), 0);
    check('hit points stop at the maximum', C.hpApply(9, 10, 4), 10);
    check('hit points move by one', C.hpApply(9, 10, -1), 8);

    /* What a tapped hit point box does with what was typed: the box opens
       empty, so a bare number is the whole of it, and a signed one is a move
       from the value it was opened on. */
    check('a bare number sets the hit points', C.hpEntry('12', 57, 60), 12);
    check('a minus moves them down', C.hpEntry('-5', 57, 60), 52);
    check('a plus moves them up', C.hpEntry('+1', 57, 60), 58);
    check('a move stops at zero', C.hpEntry('-99', 57, 60), 0);
    check('and at the maximum', C.hpEntry('+99', 57, 60), 60);
    check('an empty box leaves them alone', C.hpEntry('', 57, 60), null);
    check('a half-typed entry too', C.hpEntry('-', 57, 60), null);
    check('and so does anything that is not a number', C.hpEntry('five', 57, 60), null);
    check('a set stops at the maximum too', C.hpEntry('999', 57, 60), 60);

    /* The keypad's moves: damage takes the temporary hit points first, a
       heal leaves them, and a new temporary amount replaces the old one. */
    const hp = { current: 71, max: 82, temp: 5 };
    check('damage takes the temporary hit points first', C.hpMove(hp, 'damage', 11), { current: 65, temp: 0 });
    check('damage under the temporary ones leaves the hit points', C.hpMove(hp, 'damage', 3), { current: 71, temp: 2 });
    check('damage stops at zero', C.hpMove(hp, 'damage', 200), { current: 0, temp: 0 });
    check('a heal stops at the maximum and keeps the temporary ones', C.hpMove(hp, 'heal', 30), { current: 82, temp: 5 });
    check('a set is the hit points themselves, held to the maximum', C.hpMove(hp, 'set', 90), { current: 82, temp: 5 });
    check('a new temporary amount replaces the old one', C.hpMove(hp, 'temp', 3), { current: 71, temp: 3 });
    check('the move leaves the record alone', hp, { current: 71, max: 82, temp: 5 });
}

console.log('the rests');
{
  /* One module for what a rest gives back: it counts the record through the
     counter module, keeps the state it can take back, and says what came back
     in one sentence. */
  const counterSrc = harness.source('counter.js');
  const cctx = vm.createContext({});
  vm.runInContext(counterSrc, cctx);
  const restSrc = harness.source('rest.js');
  const rctx = vm.createContext({});
  vm.runInContext(restSrc, rctx);
  const rest = rctx.SheetRest(cctx.SheetCounter());

  const hero = {
    level: 9,
    hp: { current: 12, max: 38 },
    features: [
      { key: 'warlockSlots', name: 'Warlock spell slots', recovery: 'short', bind: 'warlock', max: 0, left: 0, short: null },
      { key: 'hexCurse', name: 'Hexblade curse', recovery: 'short', bind: null, max: 2, left: 0, short: 1 },
      { key: 'invuln', name: 'Invulnerability', recovery: 'long', bind: null, max: 1, left: 0, short: null }
    ]
  };
  const spell = {
    left: { 1: 4, 2: 3, 3: 3, 4: 2 },
    max: { 1: 4, 2: 3, 3: 3, 4: 2 },
    warlockMax: 2,
    warlockLeft: 0,
    sp: 3,
    spMax: 8,
    cunning: true,
    sorcRest: false
  };
  const record = () => ({ char: JSON.parse(JSON.stringify(hero)), spells: JSON.parse(JSON.stringify(spell)) });

  const rec = record();
  const short = rest.rest('short', rec);
  check('a rest hands the record back', short.rec === rec, true);
  check('a short rest leaves the hit points alone', short.rec.char.hp.current, 12);
  check('a short rest leaves the spell slots alone', short.rec.spells.left, { 1: 4, 2: 3, 3: 3, 4: 2 });
  check('a short rest leaves the sorcery points alone', short.rec.spells.sp, 3);
  check('a short rest gives the warlock slots back', short.rec.spells.warlockLeft, 2);
  check('a short rest gives one use of the hexblade curse', short.rec.char.features[1].left, 1);
  check('a short rest leaves a long rest feature alone', short.rec.char.features[2].left, 0);
  check('a short rest keeps the cunning', short.rec.spells.cunning, true);
  check('and the rest says what came back', short.note, 'Short rest: +2 Warlock spell slots, +1 Hexblade curse back.');
  check('the list of what came back is the pairs the page prints',
    short.gains.map((g) => '+' + g.n + ' ' + g.label).join(' | '), '+2 Warlock spell slots | +1 Hexblade curse');
  check('the rest writes the state before it on the history', short.rec.char.history.length, 1);
  check('and the history holds the hit points it had', short.rec.char.history[0].hp, 12);

  const withCost = {
    hp: { current: 12, max: 38 },
    features: [
      { key: 'bendLuck', name: 'Bend luck', source: 'Wild Magic', active: true, recovery: 'special', cost: 'sp', max: 0, left: 0, short: null, hidden: false },
      { key: 'trance', name: 'Trance', source: 'Elf', active: false, recovery: 'passive', max: 0, left: 0, short: null, hidden: false }
    ]
  };
  const cost = () => ({ char: JSON.parse(JSON.stringify(withCost)), spells: JSON.parse(JSON.stringify(spell)) });
  const rested = rest.rest('long', cost());
  check('a rest keeps the cost of a use', rested.rec.char.features[0].cost, 'sp');
  check('a rest keeps the kind of recovery', rested.rec.char.features[0].recovery, 'special');
  check('a rest keeps the source', rested.rec.char.features[0].source, 'Wild Magic');
  check('a rest keeps a passive feature passive', rested.rec.char.features[1].active, false);
  check('a rest keeps the recovery of a passive feature', rested.rec.char.features[1].recovery, 'passive');

  const long = rest.rest('long', record());
  check('a long rest fills the hit points', long.rec.char.hp.current, 38);
  check('a long rest says what came back', long.note,
    'Long rest: +26 Hit points, +2 Warlock spell slots, +5 Sorcery points, +2 Hexblade curse, +1 Invulnerability back.');
  check('and lists it in the order the page prints',
    long.gains.map((g) => '+' + g.n + ' ' + g.label).join(' | '),
    '+26 Hit points | +2 Warlock spell slots | +5 Sorcery points | +2 Hexblade curse | +1 Invulnerability');
  /* The hit point dice come back on a long rest, and a rest that gave only
     them back cannot say it gave nothing. */
  const spentDice = {
    char: { hp: { current: 30, max: 30 }, dice: [{ type: 8, spent: true }, { type: 8, spent: true }, { type: 8, spent: false }], features: [] },
    spells: {}
  };
  const diceBack = rest.rest('long', spentDice);
  check('a long rest gives the hit point dice back', diceBack.rec.char.dice.map((d) => d.spent).join(','), 'false,false,false');
  check('and says so rather than nothing', diceBack.note, 'Long rest: +2 Hit point dice back.');
  check('the list carries the dice', diceBack.gains[0].label + ' ' + diceBack.gains[0].n, 'Hit point dice 2');
  const nothing = rest.rest('long', { char: { hp: { current: 30, max: 30 }, dice: [], features: [] }, spells: {} });
  check('a rest that gave nothing still says so', nothing.note, 'Long rest: nothing to give back.');
  check('and prints no list at all', nothing.gains.length, 0);
  /* The uses of the creatures at the table come back on a long rest, counted
     like any other counter. */
  const withUses = record();
  withUses.summons = { list: [{ id: 's1', name: 'Celestial Spirit', uses: { 'Healing Touch (1/Day)': { left: 0, max: 1 } } }] };
  const restedSummons = rest.rest('long', withUses);
  check('a long rest gives the uses back', restedSummons.rec.summons.list[0].uses['Healing Touch (1/Day)'].left, 1);
  check('and the maximum stays', restedSummons.rec.summons.list[0].uses['Healing Touch (1/Day)'].max, 1);
  check('the creature itself is untouched', restedSummons.rec.summons.list[0].name, 'Celestial Spirit');
  check('and the list names the use it gave back',
    restedSummons.gains.map((g) => '+' + g.n + ' ' + g.label).join(' | '),
    '+26 Hit points | +2 Warlock spell slots | +5 Sorcery points | +2 Hexblade curse | +1 Invulnerability | +1 Celestial Spirit \u00b7 Healing Touch (1/Day)');
  check('the sentence names it too',
    restedSummons.note.indexOf('Celestial Spirit \u00b7 Healing Touch (1/Day)') >= 0, true);
  const shortUses = record();
  shortUses.summons = { list: [{ id: 's1', name: 'Celestial Spirit', uses: { 'Healing Touch (1/Day)': { left: 0, max: 1 } } }] };
  check('a short rest leaves the uses and does not name them',
    rest.rest('short', shortUses).gains.map((g) => g.label).indexOf('Celestial Spirit \u00b7 Healing Touch (1/Day)'), -1);
  check('a long rest fills the spell slots', long.rec.spells.left, { 1: 4, 2: 3, 3: 3, 4: 2 });
  check('a long rest fills the warlock slots', long.rec.spells.warlockLeft, 2);
  check('a long rest fills the sorcery points', long.rec.spells.sp, 8);
  check('a long rest gives every feature back', long.rec.char.features[1].left, 2);
  check('a long rest gives a long rest feature back', long.rec.char.features[2].left, 1);
  check('a long rest makes the cunning available again', long.rec.spells.cunning, false);

  const spent = record();
  spent.spells.left = { 1: 0, 2: 1 };
  check('a long rest fills a spent level', rest.rest('long', spent).rec.spells.left, { 1: 4, 2: 3, 3: 3, 4: 2 });

  const snap = rest.snapshot(record());
  check('a snapshot holds the hit points', snap.hp, 12);
  check('a snapshot holds the features', snap.features[1].left, 0);
  check('a snapshot holds the slots', snap.left, { 1: 4, 2: 3, 3: 3, 4: 2 });
  check('a snapshot holds the warlock slots', snap.warlockLeft, 0);

  /* A rewind takes the last change back, and a record with no history has
     nothing to take back. */
  const rewound = rest.rest('long', record());
  const back = rest.rewind(rewound.rec);
  check('a rewind takes the last rest back', back.rec.char.hp.current, 12);
  check('and the uses with it', back.rec.char.features[1].left, 0);
  check('and the history with them', back.rec.char.history.length, 0);
  check('the rewind says what it did', back.note, 'Rewound to before the last change.');
  check('a rewind with nothing to undo does nothing', rest.rewind(record()), null);

  /* One history holds every counter, so a change a page makes is taken back
     the same way a rest is: the slot, the point, the die and the use of a
     summon all come back from the state the page pushed before it moved. */
  const count = cctx.SheetCounter();
  const spentRec = record();
  spentRec.char.dice = [{ type: 8, spent: false }, { type: 8, spent: false }];
  spentRec.summons = { list: [{ id: 's1', name: 'A spirit', uses: { 'Healing Touch (1/Day)': { left: 1, max: 1 } } }] };
  const beforeMove = rest.snapshot(spentRec);
  count.spend(spentRec, 'slot:1');
  count.spend(spentRec, 'sp');
  spentRec.char.dice[0].spent = true;
  count.spend(spentRec, 'summon:s1:Healing Touch (1/Day)');
  rest.push(spentRec, beforeMove);
  const takenBack = rest.rewind(spentRec);
  check('one rewind takes a spell slot back', takenBack.rec.spells.left[1], 4);
  check('and a sorcery point', takenBack.rec.spells.sp, 3);
  check('and a hit point die', takenBack.rec.char.dice[0].spent, false);
  check('and the use of a summon', takenBack.rec.summons.list[0].uses['Healing Touch (1/Day)'].left, 1);
  check('and the rewind leaves the record it was handed', takenBack.rec, spentRec);
  check('the history keeps the last sixty changes', (() => {
    const one = record();
    for (let i = 0; i < 65; i++) rest.push(one);
    return one.char.history.length;
  })(), 60);

  /* The dice a rest gives back, the shape of each one untouched. */
  const diceRec = () => ({
    char: {
      hp: { current: 12, max: 38 },
      dice: [{ type: 6, spent: true }, { type: 6, spent: false }, { type: 10, spent: true }],
      features: []
    },
    spells: { left: {}, max: {}, warlockMax: 0, warlockLeft: 0, sp: 0, spMax: 8, cunning: false, sorcRest: false }
  });
  check('a long rest gives every die back', rest.rest('long', diceRec()).rec.char.dice.map((d) => d.spent), [false, false, false]);
  check('a short rest leaves the dice alone', rest.rest('short', diceRec()).rec.char.dice.map((d) => d.spent), [true, false, true]);
  check('a snapshot holds the dice', rest.snapshot(diceRec()).dice.map((d) => d.spent), [true, false, true]);

  /* The temporary hit points are part of a step, and a long rest ends them.
     A page that wants its own slice taken back with the rest asks with
     track(key); the slice is written back into the object the page holds. */
  const tempRec = diceRec();
  tempRec.char.hp.temp = 5;
  check('a snapshot holds the temporary hit points', rest.snapshot(tempRec).temp, 5);
  check('a short rest keeps them', rest.rest('short', diceRec()).rec.char.hp.temp, undefined);
  check('a long rest ends them', rest.rest('long', tempRec).rec.char.hp.temp, 0);
  check('and a rewind of it brings them back', rest.rewind(tempRec).rec.char.hp.temp, 5);
  const turnRest = rctx.SheetRest(cctx.SheetCounter());
  turnRest.track('attack');
  const turnRec = diceRec();
  turnRec.attack = { way: 'attack', rolls: [] };
  const held = turnRec.attack;
  turnRest.push(turnRec);
  turnRec.attack.rolls.push({ a: 17 });
  turnRec.attack.bonus = 'smite';
  turnRest.rewind(turnRec);
  check('a tracked slice is taken back with the step', turnRec.attack, { way: 'attack', rolls: [] });
  check('into the object the page holds', turnRec.attack === held, true);
  check('and a slice nobody tracked is left out of a step', rest.snapshot(turnRec).slices, {});

  /* The rules block keeps the game, and the rest is one module. The module's
     checks above drive the real function, so the shell's wiring is the walk's
     business and the page is the only thing left to read here. */
  const pageSrc = harness.source('pages/character.js');
  check('the character page asks for a rest and paints its sentence',
    [pageSrc.indexOf('C.rest.rest(kind, api.character())'), pageSrc.indexOf('note(out.note)')].filter((i) => i < 0), []);
  check('the rest travels with the page', harness.built().html.indexOf('root.SheetRest = function') >= 0, true);
}

console.log('the hit point card');
{
  /* The hit points are a card at the top of the sheet: the two steps a thumb
     wide, the number, the maximum, the temporary chip and a bar. A tap on the
     number opens a keypad docked at the bottom: the amount first, then what
     it is. */
  const src = harness.source('pages/character.js');
  check('the card sits above the armour class and the initiative',
    src.indexOf('<section class="hpcard" id="hpCard"') < src.indexOf('<div class="ctop">'), true);
  check('the steps are a thumb wide',
    /\.hpstep\{flex:0 0 48px;min-height:48px/.test(src), true);
  check('the old strip and its sign are gone',
    [src.indexOf('id="hpSign"') < 0, src.indexOf('.hpstrip') < 0].join('/'), 'true/true');
  check('the number opens the keypad, docked at the bottom',
    [src.indexOf("id: 'hpkeys',") >= 0, src.indexOf('dock: true,') >= 0,
      src.indexOf('openHpKeys();') >= 0].join('/'), 'true/true/true');
  check('the keypad answers damage, heal, set and temp',
    ['data-do="damage"', 'data-do="heal"', 'data-do="set"', 'data-do="temp"'].filter((k) => src.indexOf(k) < 0), []);
  check('one move is one step of the history, and it says what it did',
    [src.indexOf('var next = SR.hpMove(hp, kind, amount);') >= 0,
      src.indexOf("C.feedback.spent('hit point'") >= 0, src.indexOf('C.feedback.tap(E.hpCard);') >= 0].join('/'),
    'true/true/true');
  check('a character carries temporary hit points from its seed',
    src.indexOf('c.hp.temp = Math.max(0, Number(saved.hp.temp) || 0);') >= 0, true);
  check('and no death saves: they are rolled at the table', /death ?save/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), false);
}

console.log('the rests drawn');
{
  /* The two rests are drawn, an hourglass and a moon, on the buttons of the
     sheet and beside the count of a feature, so neither says SHORT or LONG
     in letters. The armour class says where it comes from only when the
     gear has a hand in it. */
  const shell = harness.source('shell.js');
  const charSrc = harness.source('pages/character.js');
  const featSrc = harness.source('pages/features.js');
  check('the shell draws the two rests, one icon each',
    [shell.indexOf('function restIcon(kind)') >= 0, shell.indexOf('restIcon: restIcon,') >= 0].join('/'), 'true/true');
  check('the rest buttons carry them',
    [charSrc.indexOf("C.chrome.restIcon('short') + 'Short rest") >= 0, charSrc.indexOf("C.chrome.restIcon('long') + 'Long rest") >= 0].join('/'), 'true/true');
  check('and a feature counts its uses beside the rest that brings them back',
    [featSrc.indexOf("uses.innerHTML = back ? '<span>' + f.left + '</span>' + C.chrome.restIcon(back)") >= 0,
      featSrc.indexOf("' left, back on a ' + back + ' rest'") >= 0].join('/'), 'true/true');
  check('the armour class no longer says it is as written',
    harness.source('pages/equipment.js').indexOf('as written on the sheet') < 0, true);
}

console.log('the attack of a summon');
{
  /* The whole attack container is the tap that rolls it: the swing block, and
     the head over it that names the attack. The die keeps its own tap, and
     the edit mode never reaches the roll, so a field of the block is edited. */
  const src = harness.source('pages/summons.js');
  check('the block of a swing is a tap that rolls it', src.indexOf("closest('.sblock')") >= 0, true);
  check('and the head of the attack is the same tap', src.indexOf("closest('.sgroup')") >= 0, true);
  check('which rolls the swing still to come, or the first again',
    src.indexOf('if (!done[i]) { at = i; break; }') >= 0, true);
  check('and the edit mode rolls nothing',
    src.indexOf("if (api.editing('summons')) return;") >= 0, true);
}

console.log('the shapes of the dice');
{
  const points = (k) => C.DIE_SHAPES[k].split(' ').length;
  check('the d6 is a square', points(6), 4);
  check('the d8 is a diamond', points(8), 4);
  check('the d10 is a kite', points(10), 5);
  check('the d12 is a pentagon', points(12), 5);
  check('every die has a shape', [4, 6, 8, 10, 12].every((k) => !!C.DIE_SHAPES[k]), true);
  check('every die has a place for its number', [4, 6, 8, 10, 12].every((k) => !!C.DIE_LABEL[k]), true);
  check('the d6 is square, not round', C.DIE_SHAPES[6].indexOf('19,19') >= 0, true);
  check('the d10 has a point at the bottom', C.DIE_SHAPES[10].indexOf('12,21') >= 0, true);
}

console.log('the features');
{
  const data = JSON.parse(readFileSync(resolve(root, 'data', 'features.json'), 'utf8'));
  check("the library and the character's own table", data.features.length, 1039);
  const active = data.features.filter((f) => f.active);
  const passive = data.features.filter((f) => !f.active);
  check('the active ones', active.length, 12);
  check('the passive ones', passive.length, 1027);
  check('every feature says where it comes from', data.features.every((f) => !!f.source), true);
  check('the curated ones have a summary', data.features.filter((f) => f.seed || f.preset).every((f) => !!f.desc), true);
  check('every feature has the long text', data.features.every((f) => f.blocks && f.blocks.length > 0), true);
  check('every feature knows the book and the page it sits on', data.features.every((f) => !!f.ref && !!f.ref.book && f.ref.page > 0), true);
  const adept = data.features.find((f) => f.key === 'abjurationAdept');
  check('a feat opens on its kind and what it asks for', adept.blocks[0].text,
    'General Feat (Prerequisites: Level 4+; Spellcasting or Pact Magic Feature)');
  check('then on the ability it raises', adept.blocks[1].lead + ' ' + adept.blocks[1].text,
    'Ability Score Increase. Increase your Intelligence, Wisdom, or Charisma by 1, to a maximum of 20.');
  check('and it names the Astral book at page 28', adept.ref.book + '/' + adept.ref.page, 'AU/28');
  check('a feat that raises no ability keeps its kind line alone',
    data.features.find((f) => f.key === 'musician').blocks[0].text, 'Origin Feat');
  const innate = data.features.find((f) => f.key === 'innateSorcery');
  check('innate sorcery has two uses', innate.uses, 2);
  check('innate sorcery comes back on a long rest', innate.recovery, 'long');
  const curse = data.features.find((f) => f.key === 'hexCurse');
  check('the hexblade curse has one use', curse.uses, 1);
  check('the hexblade curse comes back on a short rest', curse.recovery, 'short');
  const luck = data.features.find((f) => f.key === 'bendLuck');
  check('bend luck is a special feature', luck.recovery, 'special');
  check('bend luck costs a sorcery point', luck.cost, 'sp');
  check('the passive features say so', data.features.find((f) => f.key === 'trance').recovery, 'passive');
  check('the hexblade curse is the 2014 one', curse.blocks[0].text.indexOf('baleful curse') >= 0, true);
  check('the features the spell tab tracks start hidden', data.features.filter((f) => f.hidden).map((f) => f.key).join(','), 'metamagic,sorcerousRest,magicalCunning');
  check('the wild surge is the 2024 one', data.features.find((f) => f.key === 'wildSurge').blocks[0].text.indexOf('1d20') >= 0, true);
  const library = data.features.filter((f) => !f.seed && !f.preset);
  const perClass = {};
  library.forEach((f) => { perClass[f.class] = (perClass[f.class] || 0) + 1; });
  check('the library holds all twelve classes', Object.keys(perClass).length, 12);
  check('every feature of the library names its class and its level', library.every((f) => !!f.class && f.level >= 1), true);
  check('and carries its text', library.every((f) => f.blocks.length > 0), true);
  check('the wizard of level two has its features', library.filter((f) => f.class === 'Wizard' && f.level <= 2).length >= 4, true);
  check('the lore of the bard arrives at three', library.filter((f) => f.subclass === 'Lore' && f.level === 3).length >= 2, true);
}

console.log('the catalogue of feats');
{
  /* The catalogue is the list of the feats the app can offer, and the
     fighting styles are in it: the book writes them as feats of their own. */
  const data = harness.built().data('feats');
  const feats = data.feats || [];
  check('the catalogue holds the feats of the books', feats.length > 150, true);
  check('the file names the books it holds', data.edition.indexOf('XPHB') >= 0, true);
  check('every feat names itself and its book', feats.every((f) => !!f.name && !!f.source), true);
  check('every feat knows the book it sits in', feats.every((f) => !!f.ref && !!f.ref.book), true);
  check('and every feat of the 2024 handbook knows its page', feats.filter((f) => f.source === 'XPHB').every((f) => f.ref.page > 0), true);
  check('the 2024 handbook comes first', feats[0].source, 'XPHB');
  check('every feat of the 2024 handbook names its kind', feats.filter((f) => f.source === 'XPHB').every((f) => !!f.category), true);
  check('the kinds are the words of the book', [...new Set(feats.map((f) => f.category).filter(Boolean))].sort().join(', '),
    'Dragonmark Feat, Epic Boon Feat, Fighting Style Feat, General Feat, Origin Feat');
  const defense = feats.find((f) => f.name === 'Defense');
  check('defense is a fighting style', defense.category, 'Fighting Style Feat');
  check('and it names the feature it asks for', defense.prerequisite, 'Fighting Style');
  check('and it carries its text', defense.blocks.length > 0, true);
  check('the text is the book\'s', defense.blocks[0].text.indexOf('+1 bonus to Armor Class') >= 0, true);
  check('and it opens on its kind and what it asks for', defense.head, 'Fighting Style Feat (Prerequisites: Fighting Style)');
  check('the fighting styles are in it', feats.filter((f) => f.category === 'Fighting Style Feat').map((f) => f.name).sort().join(', '),
    'Arcane Warrior, Archery, Blessed Warrior, Blind Fighting, Defense, Druidic Warrior, Dueling, Great Weapon Fighting, Interception, Protection, Thrown Weapon Fighting, Two-Weapon Fighting, Unarmed Fighting');
  const war = feats.find((f) => f.name === 'War Caster');
  check('a feat that raises an ability says so', war.blocks[0].lead + ' ' + war.blocks[0].text,
    'Ability Score Increase. Increase your Intelligence, Wisdom, or Charisma by 1, to a maximum of 20.');
  check('a feat that raises none does not', feats.find((f) => f.name === 'Alert').blocks[0].lead || '', '');
  check('and a feat that writes the raise in its own text is not told twice', feats.find((f) => f.name === 'Ability Score Improvement').blocks[0].lead || '', '');
}
console.log('the weapons of the book');
{
  /* The app had no weapon damage anywhere, so the book's own table is the
     only place a die can come from. */
  const data = harness.built().data('weapons');
  const weapons = data.weapons || [];
  const byName = (n) => weapons.filter((w) => w.name === n)[0];
  const handbook = weapons.filter((w) => w.source === 'XPHB');
  check('the catalogue holds the table of the handbook', handbook.length >= 35, true);
  check('the file names the books it holds', data.edition.indexOf('XPHB') >= 0, true);
  check('the 2024 handbook comes first', weapons[0].source, 'XPHB');
  check('every weapon names itself and its book', weapons.every((w) => !!w.name && !!w.source), true);
  check('and knows the book it sits in', weapons.every((w) => !!w.ref && !!w.ref.book), true);
  check('every weapon of the handbook knows its page', handbook.every((w) => w.ref.page > 0), true);
  check('every weapon of the handbook carries a die and a kind of damage',
    handbook.every((w) => /^(\d+d\d+|\d+)$/.test(w.damage) && !!w.damageType), true);
  check('every kind of damage is a word of the book',
    weapons.every((w) => !w.damageType || ['bludgeoning', 'piercing', 'slashing'].indexOf(w.damageType) >= 0), true);
  check('the rapier is a d8 of piercing',
    [byName('Rapier').damage, byName('Rapier').damageType].join('/'), '1d8/piercing');
  check('and a martial melee weapon of finesse and vex',
    [byName('Rapier').category, byName('Rapier').kind, byName('Rapier').properties.join(','), byName('Rapier').mastery].join('/'),
    'martial/Melee Weapon/Finesse/Vex');
  check('the rapier is printed once', weapons.filter((w) => w.name === 'Rapier').length, 1);
  check('a ranged weapon says so', byName('Hand Crossbow').kind, 'Ranged Weapon');
  check('and its properties are the words of the book',
    byName('Hand Crossbow').properties.join(', '), 'Ammunition, Light, Loading');
  check('a property with a note keeps it',
    byName('Lance').properties.join(', '), 'Heavy, Reach, Two-Handed (unless mounted)');
  check('and a weapon with text carries it',
    byName('Lance').blocks[0].text.indexOf('two hands') >= 0, true);
}

console.log('the source line');
{
  /* The line a description closes on: the book and the page, and the address
     of that page in the book. The helper is the shell's, so the suite pulls
     it out and runs it the way it runs the rules blocks. */
  const shellSrc = harness.source('shell.js');
  const body = (name) => {
    const m = shellSrc.match(new RegExp('function ' + name + '\\(ref\\) \\{([\\s\\S]*?)\\n  \\}'));
    if (!m) throw new Error(name + ' is not where the suite looks for it');
    return m[1];
  };
  const srcCtx = vm.createContext({});
  vm.runInContext(
    'function esc(t){ return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }\n' +
    'function sourceLink(ref) {' + body('sourceLink') + '}\n' +
    'function sourceLine(ref) {' + body('sourceLine') + '}\n' +
    'var line = sourceLine;',
    srcCtx);
  const line = srcCtx.line;
  check('a source line names the book and the page',
    line({ book: 'AU', page: 28 }).indexOf('Source: AU, page 28') >= 0, true);
  check('and links to that page in the book',
    line({ book: 'AU', page: 28 }).indexOf('https://5e.tools/book.html#au.page:28') >= 0, true);
  check('the link is the class the shell styles',
    line({ book: 'AU', page: 28 }).indexOf('class="srclink"') >= 0, true);
  check('a book with no page still reads', line({ book: 'XPHB' }).indexOf('#xphb') >= 0, true);
  check('and nothing to point at is no line', line(null), '');
}

console.log('the themes of the app');
{
  /* The gallery offers a cell per theme and the page paints a rule per theme,
     and the two lists sit in different files, so they are held together here:
     a theme the gallery offers must paint, and a rule nobody offers is dead
     colour. The theme the app came with wears no attribute. */
  const shellSrc = harness.source('shell.js');
  const listed = shellSrc.match(/var THEMES = BLOCK\.themes\(\);\n  \[([\s\S]*?)\n  \]\.forEach\(BLOCK\.theme\);/);
  if (!listed) throw new Error('the theme list is not where the suite looks for it');
  const ids = [...listed[1].matchAll(/\{ id: '([^']*)'/g)].map((m) => m[1]);
  const painted = [...html.matchAll(/body\[data-theme="([^"]+)"\]\{/g)].map((m) => m[1]);
  check('the gallery lists nine themes, the first with no attribute', [ids.length, ids[0]].join('/'), '9/');
  check('every theme the gallery offers paints', ids.filter((id) => id && painted.indexOf(id) < 0), []);
  check('and every colour block is a theme the gallery offers', painted.filter((id) => ids.indexOf(id) < 0), []);
  check('the heavy metal theme for Wendy is one of them', ids.indexOf('heavyMetal') >= 0, true);
}

console.log('the section head');
{
  /* One block builds the head of a list on the spells page and on the
     features page: the label, the rule that fills the row, and at most one
     small action at the far right. */
  const shellSrc = harness.source('shell.js');
  const m = shellSrc.match(/function sectionHead\(([\s\S]*?)\n  \}/);
  if (!m) throw new Error('sectionHead is not where the suite looks for it');
  const hctx = vm.createContext({});
  vm.runInContext('function esc(t){ return String(t); }\nfunction sectionHead(' + m[1] + '}', hctx);
  const head = hctx.sectionHead;
  const plain = head('Passive');
  check('a head carries its label and a rule, and no button',
    [plain.indexOf('Passive') >= 0, plain.indexOf('class="rule"') >= 0, plain.indexOf('<button')].join('/'), 'true/true/-1');
  const plus = head('Active', { action: { id: 'addFeature', label: 'Add a feature' } });
  check('an action is one small button with its name',
    [plus.indexOf('class="mini"') >= 0, plus.indexOf('id="addFeature"') >= 0, plus.indexOf('aria-label="Add a feature"') >= 0].join('/'),
    'true/true/true');
  check('and a label can carry an id the page repaints',
    head('Level 1 spells', { id: 'listTitle' }).indexOf('<span id="listTitle">') >= 0, true);
  check('both pages build their head with it',
    ['pages/spells.js', 'pages/features.js'].filter((f) => harness.source(f).indexOf('C.chrome.sectionHead') >= 0),
    ['pages/spells.js', 'pages/features.js']);
  check('and neither builds the head itself',
    ['pages/spells.js', 'pages/features.js'].filter((f) => harness.source(f).indexOf('class="cshead"') >= 0), []);
}

console.log('the one rewind');
{
  /* One history holds every counter, so the control belongs to the shell and
     sits on the head left of the settings, and every page that moves a
     counter writes the state it had on the history first. */
  const page = harness.built().html;
  check('the head carries the rewind left of the settings gear',
    page.indexOf('id="rewind"') >= 0 && page.indexOf('id="rewind"') < page.indexOf('id="gear"'), true);
  check('the character page no longer carries its own',
    harness.source('pages/character.js').indexOf('charHpRewind') >= 0, false);
  check('every page that moves a counter writes the history first',
    ['pages/spells.js', 'pages/summons.js'].filter((f) => harness.source(f).indexOf('C.rest.push') < 0), []);
}

console.log('the slots scroll with the list');
{
  /* The page is one scroller: the numbers, the four buttons, the bar of
     levels, the slots and the spells. Nothing folds: the bar alone is held
     at the top once the slots scroll away, the numbers on top and the slots
     hanging under them, and a level changes from the bar. */
  const src = harness.source('pages/spells.js');
  check('the fold and its state are gone',
    ['SLIDE_AT', 'paintFold', 'foldPull', 'foldWheel', 'settleSoon', 'slotFold', 'foldcol'].filter((k) => src.indexOf(k) >= 0), []);
  check('and so is the sideways swipe of the list',
    [src.indexOf('data-swipe') < 0, src.indexOf('wireLevelSwipe') < 0].join('/'), 'true/true');
  check('the page scrolls as one, and the bar of levels is held at the top',
    [src.indexOf('<div class="grimoire" id="spellScroll">') >= 0,
      /\.lvbar\{position:sticky;top:0/.test(src),
      src.indexOf('<nav class="lvbar" id="lvBar" aria-label="Spell level"></nav>') < src.indexOf('<div class="slotstrip" id="levels"></div>')].join('/'),
    'true/true/true');
  check('the slots hang under the numbers, one column a level, top aligned',
    /\.slotstrip\{[^}]*grid-template-columns:repeat\(10,minmax\(0,1fr\)\)[^}]*align-items:start/.test(src), true);
  check('a level is picked from the bar, and the slots come back into sight',
    [src.indexOf('if (b) pickLevel(Number(b.dataset.lv));') >= 0,
      src.indexOf('if (E.scroll.scrollTop > top) E.scroll.scrollTop = top;') >= 0].join('/'), 'true/true');
  check('the bar casts its shadow once it is held',
    [src.indexOf("E.lvBar.classList.toggle('stuck'") >= 0, src.indexOf('.lvbar.stuck::after{opacity:1}') >= 0].join('/'), 'true/true');
  /* Font of Magic is one button beside the three, and it spends a slot of
     the level on screen; the bolt under every column is gone. */
  check('Eat is the fourth button of the row, and the bolts are gone',
    [src.indexOf('id="eatSlot"') > src.indexOf('id="wildSurge"'), src.indexOf("className = 'bolt'") < 0].join('/'), 'true/true');
  check('Eat spends a slot of the level on screen, as one step that says so',
    [src.indexOf('R.convertSlot({ sp: S.sp, spMax: S.spMax, left: S.left, warlockLeft: S.warlockLeft }, S.selected, S.warlockLevel)') >= 0,
      src.indexOf('C.rest.push(api.character(), before);') >= 0,
      src.indexOf("api.toast('Level ' + lv + ' slot eaten") >= 0].join('/'), 'true/true/true');
  check('and it shows only with the sorcery points',
    src.indexOf('E.eat.hidden = !(S.spMax > 0);') >= 0, true);
  /* A book that could not be read says so in the list, with a retry. */
  check('a book that failed says so, with a retry',
    [src.indexOf('The spells could not be read.') >= 0, src.indexOf('data-retry="spellbook"') >= 0,
      harness.source('shell.js').indexOf('delete DATA_ERROR[name];') >= 0].join('/'), 'true/true/true');
}

console.log('the swipe of the pages');
{
  /* The page changes on the release, and nothing slides: a swipe is one page
     change, read once, the way the spell list reads its levels. The scrollers
     of the page let the horizontal drag through, so the browser does not take
     it for a scroll and cancel it. */
  const shell = harness.source('shell.js');
  const html = harness.built().html;
  check('the swipe is read on the release, not on a slide',
    [shell.indexOf('DRAG.swipe(start, { x: ev.clientX, y: ev.clientY })') >= 0,
      shell.indexOf('translateX') < 0].join('/'), 'true/true');
  check('and it moves a step across the grid of tabs',
    [shell.indexOf('DRAG.step(swipeGrid(), current, -way, 0)') >= 0,
      shell.indexOf('show(next);') >= 0].join('/'), 'true/true');
  /* The direction is Mandal's, read by its outcome in the grid: a swipe left
     asks for the column after the page, so the shell passes -way, and a right
     swipe on the first column wraps onto the row's last. The step itself is
     run over the layout in the drag block below, so the outcome is checked
     and not only the call. */
  check('a swipe left asks for the column after the page, and right the one before',
    shell.indexOf('DRAG.step(swipeGrid(), current, -way, 0)') >= 0, true);

  check('a page is still mounted on its own',
    [shell.indexOf('function mountPage') >= 0, shell.indexOf('mountPage(id)') >= 0].join('/'), 'true/true');
  check('the views keep the vertical pan and take the horizontal one',
    html.indexOf('touch-action:pan-y') >= 0, true);
  /* The move decides, not what it started on: a swipe that begins on a button
     is a swipe. Only what drags sideways on its own keeps the move, and every
     part of a page lets the sideways move through by a rule that weighs
     nothing. */
  check('a swipe that starts on a control is still a swipe',
    [shell.indexOf("var GESTURE = 'input, button") < 0,
      shell.indexOf('if (keepsMove(ev.target)) return;') >= 0,
      html.indexOf(':where(.views *){touch-action:pan-y}') >= 0].join('/'), 'true/true/true');
  check('a range input, the sheet and a part marked data-swipe keep their move',
    shell.indexOf("var KEEPS_MOVE = 'input[type=\"range\"], .sheet, [data-swipe]';") >= 0, true);
  check('a text field keeps the move only while it is typed in',
    shell.indexOf('return !!field && field === document.activeElement;') >= 0, true);
  check('and a row carried during the move ends the swipe',
    shell.indexOf("if (from && document.querySelector('.dragging')) from = null;") >= 0, true);
  /* A hold never selects text, the phone's own menu included, and a field
     and a description keep their selection. */
  const app = (html.match(/\.app\{[\s\S]*?\n\}/) || [''])[0];
  check('a hold selects nothing in the app',
    [/user-select:none/.test(app), /-webkit-touch-callout:none/.test(app)].join('/'), 'true/true');
  check('but a field and a description keep their words',
    html.indexOf('.app input,.app textarea,.app [contenteditable="true"],.sheet-text{-webkit-user-select:text;user-select:text') >= 0, true);
  check('and so do the pages that scroll',
    html.indexOf('touch-action:pan-y') >= 0 && html.indexOf('.charbody{') >= 0,
    true);
}

console.log('the first paint of a gallery');
{
  /* The fourteen icons of the settings raster as one layer of their own, so
     the first paint of the page does not stall a frame on them. The same rule
     rode the character page while the gallery lived there, and it left with
     the gallery. */
  const settings = harness.source('pages/settings.js');
  const character = harness.source('pages/character.js');
  check('the icon gallery of the settings carries its own layer',
    settings.indexOf("'.gal.icons{grid-template-columns:repeat(7,1fr);gap:4px;will-change:transform}'") >= 0, true);
  check('and the character page no longer carries the gallery',
    [character.indexOf('charIcons') < 0, character.indexOf('will-change:transform') < 0].join('/'), 'true/true');
  check('the fourteen icons are one button each on the settings',
    settings.indexOf('Object.keys(C.chrome.icons).forEach') >= 0, true);
}

console.log('the cast level of a spell');
{
  /* A description carries a slider: it previews the dice of the chosen slot
     live, and the cast spends it. The levels the character has no slot for
     are greyed like the summon slider. */
  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  const byName = {};
  book.spells.forEach((s) => { byName[s.name] = s; });
  const at = C.castPreview(byName.Fireball, 3);
  check('a spell at its own level deals its own dice',
    at.dice.n + 'd' + at.dice.sides + ' ' + at.dice.type, '8d6 Fire damage');
  check('and a higher slot does not step', at.steps, 0);
  const up = C.castPreview(byName.Fireball, 5);
  check('a level five fireball deals two more dice', up.dice.n + 'd' + up.dice.sides, '10d6');
  check('and the slot it grew by is two', up.steps, 2);
  check('the dice of the slot do not ride twice', up.add, null);
  check('a healing grows the same way',
    C.castPreview(byName['Cure Wounds'], 3).dice.n + 'd' + C.castPreview(byName['Cure Wounds'], 3).dice.sides, '6d8');
  check('a spell that adds a target counts it', C.castPreview(byName.Bless, 3).targets, 2);
  check('a spell with no higher level changes nothing', C.castPreview(byName.Shield, 5), null);
  check('and no spell is no preview', C.castPreview(null, 3), null);

  const src = harness.source('pages/spells.js');
  check('the description carries the cast slider',
    [src.indexOf('C.slider.row(') >= 0, src.indexOf('C.slider.wire(') >= 0].join('/'), 'true/true');
  check('with the levels of no slot greyed out',
    [src.indexOf('function slotKind') >= 0, src.indexOf('function castRange') >= 0,
      src.indexOf('levels: castLevels(range)') >= 0].join('/'), 'true/true/true');
  check('and the cast spends the slot it chose',
    [src.indexOf('function castSpell') >= 0,
      src.indexOf('S.left[at] = Math.max(0, (S.left[at] || 0) - 1)') >= 0].join('/'), 'true/true');
}

console.log('the settings without the shelf');
{
  /* The shelf left the settings: the switcher reads it and the update push
     writes it, so the rows, the sign in and the choosers are gone, and the
     address a push leaves behind stays. */
  const src = harness.source('pages/settings.js');
  check('the shelf rows left the settings',
    [src.indexOf('#settingsShelf') < 0, src.indexOf('function shelfRows') < 0, src.indexOf('openShelf') < 0].join('/'),
    'true/true/true');
  check('and its choosers went with them',
    [src.indexOf('function shelfRows') < 0, src.indexOf('function ownFork') < 0, src.indexOf('function takeOff') < 0].join('/'),
    'true/true/true');
  check('the update push still writes the shelf', src.indexOf('function putOnShelf') >= 0, true);
}

console.log('the exchange and the push');
{
  /* The exchange is a card per route, each with the two directions, and the
     push of the update block is the one door to signing in. */
  const src = harness.source('pages/settings.js');
  check('the four exchange rows left the page',
    [src.indexOf('The character as a file') < 0, src.indexOf('From a file') < 0,
      src.indexOf('The character as a link') < 0, src.indexOf('From a link') < 0].join('/'),
    'true/true/true/true');
  check('the file card brings one in and sends one out',
    [src.indexOf('function routeCard') >= 0, src.indexOf('C.exchange.pickFile()') >= 0,
      src.indexOf('C.exchange.exportCharacter()') >= 0].join('/'), 'true/true/true');
  check('and the link card does the same',
    [src.indexOf('ICON_LINK') >= 0, src.indexOf('C.exchange.openPasteLink()') >= 0, src.indexOf('function sendLink') >= 0].join('/'),
    'true/true/true');
  check('the push is the one door to signing in',
    [src.indexOf('function connect') >= 0, src.indexOf('shelf.signedIn() ? Promise.resolve(true) : connect()') >= 0,
      src.indexOf("title: 'Connect to GitHub'") >= 0].join('/'), 'true/true/true');
}

console.log('the class plugins');
{
  /* Each class of the book is a file under classes/ that registers with the
     class registry: its level 1 features and its learning. What the book
     says of a class, its die, its saves and its counts, is read from the data. */
  const kctx = vm.createContext({});
  vm.runInContext(harness.source('klass.js'), kctx);
  const classes = JSON.parse(readFileSync(resolve(root, 'data', 'classes.json'), 'utf8')).classes;
  const features = JSON.parse(readFileSync(resolve(root, 'data', 'features.json'), 'utf8')).features;
  const slugs = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];
  slugs.forEach((s) => vm.runInContext(harness.source('classes/' + s + '.js'), kctx));
  check('a plugin carries no number the book holds',
    slugs.filter((s) => /\b(hd|saves|caster|count)\s*:|var table/.test(harness.source('classes/' + s + '.js'))), []);
  check('a class read before the book arrives has no die yet', kctx.SheetClasses.byName('Wizard').hd, 0);
  kctx.SheetClasses.book(classes);
  const plugins = kctx.SheetClasses.all();
  check('a plugin per class', plugins.length, 12);
  check('every class of the book has one', classes.filter((c) => !kctx.SheetClasses.byName(c.name)).map((c) => c.name), []);
  check('and every plugin names a class of the book',
    plugins.filter((p) => !classes.some((c) => c.name === p.name)).map((p) => p.name), []);
  check('each carries its die, its saves, its ability and its kind of caster',
    plugins.filter((p) => {
      const c = classes.filter((x) => x.name === p.name)[0];
      return c.hd !== p.hd || c.saves.join(',') !== p.saves.join(',') ||
        c.caster !== p.caster || (c.ability || '') !== p.ability;
    }).map((p) => p.name), []);
  check('every level 1 feature it bundles belongs to it',
    (() => {
      const bad = [];
      plugins.forEach((p) => {
        p.level1.forEach((name) => {
          const found = features.some((f) => f.name === name &&
            ((f.class === p.name && f.subclass === '' && f.level === 1) ||
              (!f.class && (f.seed || f.preset) && f.source === p.name)));
          if (!found) bad.push(p.name + ' ' + name);
        });
      });
      return bad;
    })(), []);
  const casters = ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'];
  check('the casters carry a learning kind and the others carry none',
    plugins.filter((p) => (casters.indexOf(p.name) >= 0) !== (p.learning.kind !== 'none')).map((p) => p.name), []);
  check('the wizard prepares from a book and the sorcerer learns a list',
    [kctx.SheetClasses.learningOf('Wizard').kind, kctx.SheetClasses.learningOf('Sorcerer').kind].join('/'), 'spellbook/known');
  check('the count of a class is the number the data gives at four levels',
    casters.filter((n) => {
      const c = classes.filter((x) => x.name === n)[0];
      const table = c.prepared || [];
      return [1, 5, 11, 20].some((lv) => Number(table[lv - 1] || 0) !== kctx.SheetClasses.ready(n, lv));
    }), []);
  check('and a class with no spell has none at any level',
    ['Barbarian', 'Fighter', 'Monk', 'Rogue'].filter((n) => kctx.SheetClasses.ready(n, 1) !== 0 || kctx.SheetClasses.ready(n, 20) !== 0), []);

  /* The mechanics as code: the colour of each class, the counters its
     features keep by level, and the attacks, dice and flags the pages read.
     Where the book writes a number in its text, the table agrees with it. */
  const K = kctx.SheetClasses;
  const colours = plugins.map((p) => p.colour);
  check('every class has a colour of its own', [colours.filter(Boolean).length, new Set(colours).size], [12, 12]);
  check('a subclass takes the colour of its class, by its name or its short name',
    [K.colourOf('Clockwork'), K.colourOf('Path of the Ancestral Guardian'), K.colourOf('Scroll')],
    [K.byName('Sorcerer').colour, K.byName('Barbarian').colour, '']);
  const textOf = (key) => (features.filter((f) => f.key === key)[0] || { blocks: [] }).blocks.map((b) => b.text || (b.items || []).join(' ')).join(' ');
  const rec = (classes, feats, abilities) => ({ char: { classes, features: feats || [], abilities: abilities || {} } });
  check('Sneak Attack is the die the book names at level 1, one more every odd level',
    [/\[\[d:1d6\]\]/.test(textOf('rogue-1-sneak-attack')), K.sneak(rec([{ name: 'Rogue', level: 1 }])),
      K.sneak(rec([{ name: 'Rogue', level: 5 }])), K.sneak(rec([{ name: 'Wizard', level: 5 }]))], [true, '1d6', '3d6', '']);
  check('the counts the book writes in words agree with the tables',
    [/twice/.test(textOf('fighter-1-second-wind')), /five times your Paladin level/.test(textOf('paladin-1-lay-on-hands')),
      /twice/.test(textOf('ranger-1-favored-enemy')), /half your Wizard level \(round up\)/.test(textOf('wizard-1-arcane-recovery')) && /until you finish a Long Rest/.test(textOf('wizard-1-arcane-recovery'))], [true, true, true, true]);
  const barb = rec([{ name: 'Barbarian', level: 1 }], [{ key: 'barbarian-1-rage', name: 'Rage', max: 0, left: 0, recovery: 'passive' }]);
  check('a counter takes the uses of its level and its rest', [K.sync(barb), barb.char.features[0].max, barb.char.features[0].left,
    barb.char.features[0].recovery, barb.char.features[0].short], [true, 2, 2, 'long', 1]);
  barb.char.features[0].left = 1;
  barb.char.classes[0].level = 3;
  K.sync(barb);
  check('a level up adds the new use and keeps a spent one spent', [barb.char.features[0].max, barb.char.features[0].left], [3, 2]);
  check('and nothing moves when nothing changed', K.sync(barb), false);
  barb.char.features[0].manual = true;
  barb.char.classes[0].level = 6;
  K.sync(barb);
  check('a maximum the player set by hand is left alone', barb.char.features[0].max, 3);
  const bard = rec([{ name: 'Bard', level: 5 }], [], { cha: 16 });
  K.sync(bard);
  check('a counter the data has no row for is brought by its class',
    [bard.char.features.length, bard.char.features[0].name, bard.char.features[0].max, bard.char.features[0].recovery], [1, 'Bardic Inspiration', 3, 'short']);
  const gone = rec([{ name: 'Bard', level: 1 }], [], { cha: 16 });
  gone.char.dropped = ['bard-1-bardic-inspiration'];
  K.sync(gone);
  check('and stays gone once the player removed it', gone.char.features.length, 0);
  check('the attacks of the Attack action follow the classes and the subclass features',
    [K.attacks(rec([{ name: 'Fighter', level: 11 }])), K.attacks(rec([{ name: 'Paladin', level: 5 }])),
      K.attacks(rec([{ name: 'Wizard', level: 6 }], [{ key: 'wizard-bladesinger-6-extra-attack' }])), K.attacks(rec([{ name: 'Rogue', level: 9 }]))],
    [3, 2, 2, 1]);
  check('Metamagic and Font of Magic come at sorcerer level 2',
    [K.has(rec([{ name: 'Sorcerer', level: 1 }]), 'metamagic'), K.has(rec([{ name: 'Sorcerer', level: 2 }]), 'fontOfMagic')], [false, true]);
  const fighter = rec([{ name: 'Fighter', level: 3 }], [{ key: 'fighter-1-second-wind', name: 'Second Wind', max: 2, left: 2, recovery: 'long' }]);
  const healed = [];
  const line = K.useOf(fighter, 'fighter-1-second-wind').use({ roll: () => ({ total: 6 }), heal: (n) => { healed.push(n); return n; } });
  check('Second Wind heals 1d10 plus the fighter level, and says so', [healed, line], [[9], 'Second Wind: 6 + 3, 9 hit points back']);
  check('Lay on Hands is a pool of five a level that heals',
    [(() => { const p = rec([{ name: 'Paladin', level: 3 }], [{ key: 'paladin-1-lay-on-hands' }]); K.sync(p); return p.char.features[0].max; })(),
      K.useOf(rec([{ name: 'Paladin', level: 1 }]), 'paladin-1-lay-on-hands').pool], [15, true]);
  check('Rage rides the attack sheet with its damage by level',
    K.riders(rec([{ name: 'Barbarian', level: 9 }])).map((x) => x.rider.key + ' +' + x.rider.damage(x.level)), ['rage +3']);
}

console.log('the agent');
{
  /* The agent's page holds the gate of SURFACE.md: the rules it is told, the
     surface it may write, the backup before the first change, and the key
     that stays on the machine that serves the app. */
  const src = harness.source('pages/agent.js');
  const serve = readFileSync(resolve(root, 'tools', 'serve.mjs'), 'utf8');
  const java = readFileSync(resolve(root, 'app', 'java', 'com', 'newbornai', 'customsheet', 'MainActivity.java'), 'utf8');
  check('it is told to use the books, ask up to three numbered questions with its pick, and report in three bullets',
    [/from the books \(the lookup tool\) or from the player/.test(src), /Ask at most 3 questions, numbered 1\. 2\. 3\., each with the option you recommend/.test(src),
      /Done: \.\.\., Missing: \.\.\., Unclear: \.\.\./.test(src)].join('/'), 'true/true/true');
  check('its tools are the sheet, the books, its pages, and a look at them',
    ['read_sheet', 'lookup', 'update_sheet', 'write_page', 'look_at_page', 'remove_page'].filter((t) => src.indexOf("name: '" + t + "'") < 0), []);
  check('it writes only the slices of the sheet and its own pages',
    [src.indexOf("var WRITABLE = ['char', 'spells', 'equipment', 'volley', 'attack', 'summons'];") >= 0, /__proto__\|prototype\|constructor/.test(src)].join('/'), 'true/true');
  check('the character is copied aside before the first change, and the run undoes whole',
    [src.indexOf("localStorage.setItem(BACKUP + api.state.current, JSON.stringify({ session: undoOwner, rec: rec() }))") >= 0, src.indexOf('function undoRun()') >= 0,
      src.indexOf("if (name === 'update_sheet') { backup(); C.rest.push(rec());") >= 0].join('/'), 'true/true/true');
  check('the key of the model stays on the machine that serves the app',
    [serve.indexOf('process.env.SENSENOVA_API_KEY') >= 0, src.indexOf('SENSENOVA_API_KEY') < 0 || src.indexOf("'The machine that serves the app has no key") >= 0].join('/'), 'true/true');
  check('the phone posts only to the /agent route of the house network, with no token',
    [java.indexOf('"/agent".equals(u.getPath())') >= 0, java.indexOf('h.startsWith("192.168.")') >= 0,
      java.indexOf('if (withToken && !github(url))') < 0].join('/'), 'true/true/true');

  /* A picture is the house look, drawn on the machine that serves the app, and
     fitted to the phone's store before it lands on the Image page. The phone
     reaches the picture route on the house network like the agent's. */
  check('a picture is drawn in the house look, by a tool of its own',
    [/var PICTURE_STYLE = 'hand-drawn ink and watercolour illustration/.test(src), src.indexOf("name: 'paint_picture'") >= 0].join('/'),
    'true/true');
  check('every picture, a new one through the portrait brief or a change, is kept from the gloss of a digital painting',
    (src.match(/\.concat\(PICTURE_NOT\)/g) || []).length, 2);
  check('the Randominator asks for three pictures to pick from', harness.source('shell.js').indexOf('paint three pictures of it with paint_choices') >= 0, true);
  check('the picture comes from the picture route of the house server, which holds the key',
    [serve.indexOf("path === '/paint'") >= 0, /process\.env\.SENSENOVA_IMAGE_MODEL/.test(serve),
      /process\.env\.SENSENOVA_IMAGE_SIZE/.test(serve), serve.indexOf("'/images/generations'") >= 0].join('/'),
    'true/true/true/true');
  check('the phone reaches the picture route too, and waits longer for it than for the model',
    [java.indexOf('"/paint".equals(u.getPath())') >= 0, java.indexOf('/paint".equals(new java.net.URL(url).getPath()) ? 240000 : 120000') >= 0].join('/'),
    'true/true');
  /* The store writes a picture beside the record by itself, and marks it apart
     only once it is there. A page that wrote the mark by hand made the store
     skip the write, and the picture died with the next launch: measured
     2026-10-28, the drawn pictures of the phone were lost on an update. */
  check('a drawn picture is fitted to 720 px, webp, and left to the store to keep',
    [harness.source('images.js').indexOf('function fit(dataUrl)') >= 0,
      harness.source('images.js').indexOf('FIT_LONG = 720') >= 0,
      harness.source('shell.js').indexOf('core.images = IMAGES;') >= 0,
      src.indexOf('C.images.fit(json.data)') >= 0, src.indexOf("stored = 'apart'") < 0].join('/'),
    'true/true/true/true/true');
  check('a mark with nothing behind it keeps what the record still carries',
    harness.source('images.js').indexOf('all[id] || img.data') >= 0, true);
  /* A repaint hands the pixels already on the sheet back to the model, and a
     theme of the picture reads the drawing itself. */
  check('a picture that exists is changed, not painted again, and the pixels go back with the change',
    [/name: 'repaint_picture'/.test(src), src.indexOf('return repaintPicture(args);') >= 0,
      src.indexOf('}, now);') >= 0, serve.indexOf("'/images/edits'") >= 0, serve.indexOf("asked.image.indexOf('data:image/')") >= 0].join('/'),
    'true/true/true/true/true');
  check('a choice of pictures is drawn once per picture, each with its own take and setting, and an age only when the fairy gave one take',
    [/name: 'paint_choices'/.test(src), src.indexOf('function paintChoices(args)') >= 0,
      src.indexOf('var ages = dealt(TAKES.age, count), settings = dealt(TAKES.setting, count);') >= 0,
      src.indexOf('api.gallery(made,') >= 0].join('/'), 'true/true/true/true');
  check('the screen shows a choice with arrows, a count, a pick, and a swipe between the pictures',
    [harness.source('index.html').indexOf('id="viewerPrev"') >= 0,
      harness.source('index.html').indexOf('id="viewerPick"') >= 0,
      harness.source('shell.js').indexOf('function stepPicture(by)') >= 0,
      harness.source('shell.js').indexOf('function pictureOpen()') >= 0,
      harness.source('shell.js').indexOf('gallery: function (pictures, pick)') >= 0,
      harness.source('shell.js').indexOf("el.viewer.addEventListener('pointerdown'") >= 0].join('/'),
    'true/true/true/true/true/true');
  check('a theme is made of the picture\'s own ground, ink and accent, and worn',
    [src.indexOf('function paletteOf(dataUrl)') >= 0, src.indexOf('function themeFromPicture(args)') >= 0,
      src.indexOf('return paletteOf(data).then(') >= 0, src.indexOf('writeTheme({ name: name, ground: colours.ground') >= 0,
      src.indexOf('return themeFromPicture(args);') >= 0].join('/'), 'true/true/true/true/true');
}

{
  const src = harness.source('pages/agent.js');
  check('it builds pages from wired attributes, and every button is pressed before it reports',
    [/WIRED ATTRIBUTES, not JavaScript/.test(src), src.indexOf('function pressAll(id)') >= 0, /Fix every button that is not "works"/.test(src)].join('/'), 'true/true/true');
  check('the thinking line folds the model\'s own reasoning, which is never sent back',
    [/msg\.reasoning_content \|\| msg\.reasoning/.test(src), src.indexOf("HISTORY.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls || undefined });") >= 0].join('/'), 'true/true');
}

{
  const src = harness.source('pages/agent.js');
  const shell = harness.source('shell.js');
  check('a panel lives inside a page of the app, put back when the page paints its body anew',
    [shell.indexOf('function mountPanel(p)') >= 0, shell.indexOf('placePanel(x, MOUNTED[x.id].section);') >= 0,
      /a panel goes into a page of the app/.test(shell), /into: \{ type: 'string'/.test(src)].join('/'), 'true/true/true/true');
  check('each character keeps its sessions, a new one starts empty, and only the run\'s own session undoes it',
    [src.indexOf("var STORE = 'customsheet.agent.sessions.';") >= 0, src.indexOf('function startSession()') >= 0,
      src.indexOf('undoOwner === SESSIONS.current') >= 0].join('/'), 'true/true/true');
}

{
  const src = harness.source('pages/agent.js');
  const shell = harness.source('shell.js');
  const java = readFileSync(resolve(root, 'app', 'java', 'com', 'newbornai', 'customsheet', 'MainActivity.java'), 'utf8');
  check('a panel joins the bar of its page, and the agent is told to choose the bar there',
    [shell.indexOf('function barPanel(host, box)') >= 0, /put buttons, toggles, trackers and sliders in its BAR/.test(src)].join('/'), 'true/true');
  check('a run that loses the model tries again with "continue", and the send button stops it',
    [src.indexOf('var WAITS = [5, 15, 30, 60];') >= 0, src.indexOf("HISTORY.push({ role: 'user', content: 'continue' })") >= 0,
      src.indexOf('if (busy) { stopRun(); return; }') >= 0].join('/'), 'true/true/true');
  check('the installer opens in a fresh task of its own, at an address new for every build',
    [java.indexOf('intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);') >= 0, java.indexOf('appendQueryParameter("v", String.valueOf(file.lastModified()))') >= 0].join('/'), 'true/true');
}

{
  const src = harness.source('pages/agent.js');
  const feats = harness.source('pages/features.js');
  check('a feature reads its words from data: its own record, then the books by key, then the feats and features by name',
    [feats.indexOf('function bookOf(f)') >= 0, /C\.library\.feats\.filter\(function \(x\) \{ return norm\(x\.name\) === n; \}\)/.test(feats)].join('/'), 'true/true');
  check('the agent adds a feature from the books with one tool, after the books are read',
    [src.indexOf("name: 'add_feature'") >= 0, src.indexOf("Promise.all([C.library.data('feats'), C.library.data('features')])") >= 0].join('/'), 'true/true');
  check('its answers are drawn as Markdown from escaped text, and OK takes its recommendations',
    [src.indexOf("var lines = C.chrome.esc(String(text || '')).split") >= 0, src.indexOf("ask('OK, go with your recommendations.')") >= 0].join('/'), 'true/true');
}

{
  const own = harness.source('own.js');
  const src = harness.source('pages/agent.js');
  check('a character carries its own features, spells and items as data, laid into the books while it is played',
    [own.indexOf('function sync(rec)') >= 0, own.indexOf("var key = kind === 'feature' ? 'features' : kind === 'spell' ? 'spells' : 'items';") >= 0,
      harness.source('shell.js').indexOf('core.own.sync(state.characters[state.current]);') >= 0].join('/'), 'true/true/true');
  check('the agent writes what the books lack into the library, and puts every entry on the sheet by its name',
    ['library_write', 'add_spell', 'add_item', 'add_feature'].filter((t) => src.indexOf("name: '" + t + "'") < 0), []);
}

{
  const shell = harness.source('shell.js');
  const src = harness.source('pages/agent.js');
  check('the maximum of hit points follows the classes and Constitution: the whole die first, the average rounded up after',
    [shell.indexOf('total += Math.max(1, (first ? die : die / 2 + 1) + con);') >= 0, shell.indexOf('if (!rec || !rec.char || rec.char.hpManual) return false;') >= 0,
      harness.source('pages/character.js').indexOf('if (saved.hpManual) c.hpManual = true;') >= 0].join('/'), 'true/true/true');
  check('the agent makes a character through the creator\'s own skeleton, and the conversation moves with it',
    [shell.indexOf('var rec = skeleton(cls.name, level, sub, name);') >= 0, src.indexOf("name: 'create_character'") >= 0, src.indexOf('SESSIONS.list.unshift(moving);') >= 0].join('/'), 'true/true/true');
  check('two rows of the bar are lower than one', harness.source('index.html').indexOf('.bar.two .baritem{height:38px;') >= 0, true);
}

{
  const src = harness.source('pages/agent.js');
  check('a lookup reads its book first, lists a class by level, and a miss is final: the second says stop and ask',
    [src.indexOf('return Promise.all(FILES[k].map(function (f) { return C.library.data(f); }))') >= 0,
      src.indexOf("'STOP searching. Tell the player it is not in the books, and ask them what it does; or use what the books carry instead.'") >= 0,
      src.indexOf('a book still loading answers on the next try') < 0].join('/'), 'true/true/true');
  check('a level up is one tool that gives every feature of the class and subclass up to the level',
    [src.indexOf("name: 'set_class'") >= 0, src.indexOf('function setClass(args)') >= 0].join('/'), 'true/true');
}

{
  const sp = harness.source('pages/spells.js');
  const src = harness.source('pages/agent.js');
  check('a spell\'s source is the character\'s own class, and one naming a class it does not have is moved',
    [sp.indexOf('function foreignSource(src)') >= 0, sp.indexOf('function sourceFor(name)') >= 0,
      src.indexOf("var src = asked || mine.filter(function (c) { return (s.classes || []).indexOf(c) >= 0; })[0] || mine[0] || '';") >= 0].join('/'), 'true/true/true');
  check('a wizard prepares from its book, and its count is of the spells prepared',
    [sp.indexOf("if (canon === 'Wizard' && !S.prepared[name]) return;") >= 0, sp.indexOf('function preparable(name)') >= 0].join('/'), 'true/true');
}

{
  const src = harness.source('pages/agent.js');
  check('the agent sees a rule whole and the numbers the app works out, and never quotes a rule from memory',
    [src.indexOf('if (out.length && out.length <= 2) { TEXT_ROOM = 8000; out = search(k, args); TEXT_ROOM = 600; }') >= 0,
      src.indexOf('preparedByLevel: c.prepared || []') >= 0, src.indexOf('out.workedOut = {') >= 0,
      /Never state a rule, a number or a formula from memory/.test(src)].join('/'), 'true/true/true/true');
}

{
  const src = harness.source('pages/agent.js');
  check('the agent is a fairy, and the fairies are fickle and get bored',
    [src.indexOf("title: 'Fairy',") >= 0, /The fairies are fickle: check the result and tell them what\\'s wrong\. They also get bored quickly/.test(src)].join('/'), 'true/true');
  check('a fairy makes a theme of colours, worn by the character, with its contrast checked',
    [src.indexOf("name: 'write_theme'") >= 0, src.indexOf("hidden: true, html: '', themes: [theme]") >= 0, src.indexOf('function contrast(a, b)') >= 0].join('/'), 'true/true/true');
}

{
  const origin = harness.source('origin.js');
  const shell = harness.source('shell.js');
  const src = harness.source('pages/agent.js');
  const rules = JSON.parse(readFileSync(resolve(root, 'data', 'rules.json'), 'utf8'));
  const species = JSON.parse(readFileSync(resolve(root, 'data', 'species.json'), 'utf8')).species;
  check('the point buy is data: 27 points, 8 to 15, a 15 costs 9 and a 14 costs 7',
    [rules.pointBuy.budget, rules.pointBuy.min, rules.pointBuy.max, rules.pointBuy.cost['15'], rules.pointBuy.cost['14']].join('/'), '27/8/15/9/7');
  check('the standard array and the background increases are data', [rules.standardArray.join(','), rules.backgroundIncrease.plans.map((p) => p.join('+')).join(' or ')].join(' | '), '15,14,13,12,10,8 | 2+1 or 1+1+1');
  check('the ten species of the 2024 handbook, each with its traits, and the elf chooses a lineage',
    [species.length, species.every((x) => x.traits.length), (species.find((x) => x.name === 'Elf').traits.find((t) => t.choice) || {}).choice.options.map((o) => o.name).join(',')].join('/'), '10/true/Drow,High Elf,Wood Elf');
  check('the creator and the fairy write an origin through the one module',
    [origin.indexOf('function apply(rec, o)') >= 0, shell.indexOf('var done = core.origin.apply(rec, spec.origin);') >= 0, shell.indexOf('var made = core.origin.apply(rec, origin);') >= 0].join('/'), 'true/true/true');
  check('the fairy can look up the species and the rules of making a character',
    [src.indexOf("species: ['species'], rule: ['rules']") >= 0, src.indexOf('speciesChoice: { type: ') >= 0].join('/'), 'true/true');
}

{
  const classes = JSON.parse(readFileSync(resolve(root, 'data', 'classes.json'), 'utf8')).classes;
  const feats = JSON.parse(readFileSync(resolve(root, 'data', 'features.json'), 'utf8')).features;
  const rogue = classes.find((c) => c.name === 'Rogue');
  check('each class carries its armour and weapon proficiencies, and what it gives as a second class',
    [rogue.proficiencies.armour.join(','), rogue.proficiencies.tools.join(','), rogue.proficiencies.skills.choose, classes.find((c) => c.name === 'Fighter').multiclass.weapons.join(','), classes.every((c) => c.proficiencies && c.multiclass)].join('/'),
    "light/Thieves' Tools/4/martial/true");
  check('a class keeps every feature the curated table also names: Expertise for the rogue, the bard\'s inspiration',
    ['rogue-1-expertise', 'bard-1-bardic-inspiration', 'bard-2-jack-of-all-trades', 'sorcerer-1-innate-sorcery', 'warlock-2-magical-cunning'].filter((k) => !feats.some((f) => f.key === k)), []);
  check('the fairy reads the proficiencies of the character and of a class', [harness.source('pages/agent.js').indexOf('proficiencies: proficienciesOf(r)') >= 0, harness.source('pages/agent.js').indexOf('asSecondClass: c.multiclass || null,') >= 0].join('/'), 'true/true');
}

{
  const eq = harness.source('pages/equipment.js');
  const atk = harness.source('pages/attack.js');
  const src = harness.source('pages/agent.js');
  const shell = harness.source('shell.js');
  check('a weapon is read from data: its base or its name, a magic entry for its bonus, the row\'s own stats',
    [eq.indexOf('C.library.weaponOf = function (it) {') >= 0, atk.indexOf('return worn().map(function (it) { return { item: it, book: statsOf(it) }; })') >= 0,
      atk.indexOf("bonus = mod + SR.profBonus(level()) + (Number(w.attackBonus) || 0);") >= 0].join('/'), 'true/true/true');
  check('an item opens on a tap, and a weapon picks the weapon it is and its bonus',
    [eq.indexOf("if (!api.editing('equipment')) { openItem(it.id); return; }") >= 0, eq.indexOf('data-base=') >= 0].join('/'), 'true/true');
  check('the fairy\'s item says what the attack rolls', src.indexOf('attackRolls:') >= 0, true);
  check('a new character starts on its sheet, its features, its spells or its attacks, and the fairy',
    shell.indexOf("return ['character', 'features', casts ? 'spells' : 'attack', 'agent']") >= 0, true);
}

{
  const src = harness.source('pages/agent.js');
  check('the fairy reads, sets and gives effects in the sheet language', ['sheet_get', 'sheet_set', 'set_effect'].filter((t) => src.indexOf("name: '" + t + "'") < 0), []);
  check('a feature\'s card writes its effect, checked first', harness.source('pages/features.js').indexOf('var problems = C.SR.effectCheck(text, api.character().char, api.character());') >= 0, true);
}

{
  const chs = harness.source('pages/character.js');
  const atk = harness.source('pages/attack.js');
  check('a feature row keeps every field it carries when the sheet loads, its effect with it',
    [chs.indexOf('var keep = JSON.parse(JSON.stringify(f || {}));') >= 0, chs.indexOf('Object.keys(shaped).forEach(function (k) { keep[k] = shaped[k]; });') >= 0].join('/'), 'true/true');
  check('a weapon attack takes the effects on attack and damage, melee or ranged',
    [atk.indexOf("bonus = SR.withEffects(rec, bonus, ['attack', 'attack.' + reach]);") >= 0, atk.indexOf("mod = SR.withEffects(rec, mod, ['damage', 'damage.' + reach]);") >= 0].join('/'), 'true/true');
  check('the spells page counts the effects on the DC, and the sheet shows the speed',
    [harness.source('pages/spells.js').indexOf("['spellDC']") >= 0, chs.indexOf('SR.speedOf(api.character())') >= 0].join('/'), 'true/true');
}

{
  const gear = JSON.parse(readFileSync(resolve(root, 'data', 'gear.json'), 'utf8')).magic;
  const by = (n) => (gear.find((x) => x.name === n) || {}).effect;
  check('a magic item carries what it does in the sheet language: the cloak its armour class and its saves',
    [by('Cloak of Protection'), by('Robe of the Archmagi')].join(' | '), 'AC + 1; save.all + 1 | spellAttack + 2; spellDC + 2');
  check('an item picked with the old effect takes the book\'s', harness.source('pages/equipment.js').indexOf('function upgradeEffects()') >= 0, true);
}

{
  const feats = harness.source('pages/features.js');
  check('a feature card carries a short description in italics, the player\'s or the book\'s, editable',
    [feats.indexOf('function shortOf(data)') >= 0, feats.indexOf("'.fcard .fdt{font-style:italic}',") >= 0, feats.indexOf("roleEl.dataset.role === 'descin'") >= 0].join('/'), 'true/true/true');
  check('a portrait in the switcher sits near its top, so the head stays whole', harness.source('index.html').indexOf('object-fit:cover;object-position:50% 10%;') >= 0, true);
}

{
  const shell = harness.source('shell.js');
  const src = harness.source('pages/agent.js');
  const chs = harness.source('pages/character.js');
  check('a character\'s own rules for a page are held inside it, and fetch nothing',
    [shell.indexOf('function scopeCss(pageId, css)') >= 0, /url\\s\*\\\(\|@import/.test(shell), shell.indexOf("var scope = '#view-' + pageId;") >= 0].join('/'), 'true/true/true');
  check('the fairy maps a page and restyles it', ['layout_map', 'style_page'].filter((t) => src.indexOf("name: '" + t + "'") < 0), []);
  check('the row of the armour class never wraps, and the hit dice stand up',
    [chs.indexOf("'.ctop{display:flex;flex-wrap:nowrap;gap:6px;flex:0 0 auto}',") >= 0, chs.indexOf("'.dicebox .dcount{flex-direction:column;justify-content:center;gap:1px;padding:4px 5px}',") >= 0].join('/'), 'true/true');
}

check('a tapped hit die shows what is left even when its count has the focus',
  [harness.source('pages/character.js').indexOf('if (field && (field.readOnly || document.activeElement !== field)) field.value = String(kinds[t].left);') >= 0,
    harness.source('pages/character.js').indexOf("'.dicebox .dcount .dcur[readonly]{pointer-events:none}',") >= 0].join('/'), 'true/true');

{
  const shell = harness.source('shell.js');
  const src = harness.source('pages/agent.js');
  check('the Randominator asks the level, then rolls every other choice with the cryptographic dice, the abilities four d6 keeping three',
    [shell.indexOf("run: openRandomLevel") >= 0 && shell.indexOf('var level = 1 + rng(20);') < 0, shell.indexOf('c.getRandomValues(buf)') >= 0, shell.indexOf('slice().sort(function (a, b) { return b - a; }).slice(0, 3)') >= 0,
      shell.indexOf('var made = core.origin.apply(rec, origin);') >= 0].join('/'), 'true/true/true/true');
  check('a new fairy names it among ten, the app rolling the name, then themes and paints it',
    [shell.indexOf("core.fairy.ask('Randominator:") >= 0, src.indexOf("name: 'roll_name'") >= 0, src.indexOf('var rolled = names[C.rng ? C.rng(names.length)') >= 0].join('/'), 'true/true/true');
}

{
  const feats = harness.source('pages/features.js');
  check('the + of the features opens the feats and the species, filtered and searched, and a feature of one\'s own stays a button',
    [feats.indexOf("E.addFeature.addEventListener('click', function () { openFeaturePicker(); });") >= 0,
      ["{ id: 'species', label: 'Species' }", "{ id: 'origin', label: 'Origin' }", "{ id: 'fs', label: 'Fighting style' }", "{ id: 'boon', label: 'Boon' }", "{ id: 'feat', label: 'Feat' }"].every((k) => feats.indexOf(k) >= 0),
      feats.indexOf("actions: [{ label: 'Custom feature', kind: 'quiet', onClick: function () { openNewFeature(); } }]") >= 0].join('/'), 'true/true/true');
  check('a species added goes through the creator\'s rules, in place of the one before', feats.indexOf('var done = C.origin.apply(rec, { species: sp.name, speciesChoice: choice || undefined });') >= 0, true);
}

{
  const story = harness.source('pages/backstory.js');
  const src = harness.source('pages/agent.js');
  const shell = harness.source('shell.js');
  check('the Background page is plain text, read as paragraphs and written in edit mode',
    [story.indexOf("id: 'backstory'") >= 0, story.indexOf("api.editing('backstory')") >= 0, story.indexOf("a.wrench({ label: 'Edit the background' })") >= 0,
      story.indexOf('if (document.activeElement !== E.edit) E.edit.value = text;') >= 0].join('/'), 'true/true/true/true');
  check('the fairy writes the background, and reads it before it paints',
    [src.indexOf("name: 'write_backstory'") >= 0, src.indexOf("if (name === 'write_backstory') return writeBackstory(args);") >= 0,
      src.indexOf("'backstory', 'pages']") >= 0].join('/'), 'true/true/true');
  check('a brief is short: who sits from the sheet without weapons, one concept, and no story or art list for the literal painter',
    [src.indexOf("it.category === 'armour'") >= 0, src.indexOf("'one person only', 'no weapons'") >= 0, src.indexOf('brief.story') < 0, src.indexOf('art_direction') < 0,
      src.indexOf("return drawPicture(portrait(concept, null), '');") >= 0].join('/'), 'true/true/true/true/true');
  const chr = harness.source('pages/character.js');
  check('two inspirations sit beside the hit points: heroic on every sheet, bardic where the feature is or the wrench turned it on',
    [chr.indexOf('id="inspCol"') >= 0, chr.indexOf("key: 'heroic', id: 'inspHeroic'") >= 0, chr.indexOf("f.key === 'bardicInspiration'") >= 0,
      chr.indexOf('i.bardicShown = !i.bardicShown;') >= 0, chr.indexOf('bardicShown: !!saved.inspiration.bardicShown') >= 0].join('/'), 'true/true/true/true/true');
  check('the background is thirty words, and a longer one is refused unless the player asked',
    [src.indexOf('at most 30 words, two short sentences') >= 0, src.indexOf("if (words > 40 && !(args && args.long))") >= 0, shell.indexOf('write_backstory: at most 30 words') >= 0].join('/'), 'true/true/true');
  check('the Randominator writes the story before it paints', shell.indexOf('Then write its background with write_backstory') >= 0 &&
    shell.indexOf('Then write its background') < shell.indexOf('paint three pictures of it with paint_choices'), true);
}

console.log('the upgrade of a cantrip');
{
  /* True Strike's extra radiant dice come from its own paragraph in the book. */
  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8')).spells;
  const ts = book.filter((x) => x.name === 'True Strike')[0];
  check('True Strike adds nothing below the fifth level', C.cantripUpgrade(ts, 4), '');
  check('and the dice the book names at 5, 11, 17 and 20',
    [5, 11, 17, 20].map((lv) => C.cantripUpgrade(ts, lv)), ['1d6', '2d6', '3d6', '3d6']);
  check('a spell with no upgrade names nothing', C.cantripUpgrade({ blocks: [{ t: 'p', text: 'no upgrade' }] }, 20), '');
  check('and no spell at all names nothing', C.cantripUpgrade(undefined, 20), '');
}

console.log('the effect of equipment');
{
  /* A piece of gear carries its effect as a small formula, and the armour
     class the sheet reads comes from it. The half plate and the shield are
     Wendy's. */
  const ch = { ac: 12, abilities: { dex: 14, str: 8 } };
  const rec = (items) => ({ char: ch, equipment: { items: items } });
  check('a formula reads the numbers and the dexterity it allows', C.effectValue('15+min(@dex.mod,2)', ch), 17);
  check('a formula that allows none', C.effectValue('15+min(@dex.mod,0)', ch), 15);
  check('a product binds before a sum', C.effectValue('2*3+1', ch), 7);
  check('the half plate sets the base of the armour class',
    C.acOf(rec([{ equipped: true, effect: 'baseAC=15+min(@dex.mod,2)' }])), 17);
  check('the shield adds two to it',
    C.acOf(rec([{ equipped: true, effect: 'baseAC=15+min(@dex.mod,2)' }, { equipped: true, effect: 'AC+2' }])), 19);
  check('a stowed item says nothing', C.acOf(rec([{ equipped: false, effect: 'AC+2' }])), 12);
  check('no gear reads the sheet', C.acOf(rec([])), 12);
  check('a sheet with no armour class is ten and the dexterity',
    C.acOf({ char: { abilities: { dex: 16 } } }), 13);
  check('a broken formula is nothing rather than a crash',
    C.acOf(rec([{ equipped: true, effect: 'AC+' }])), 12);
  check('the sheet knows the gear decides', C.hasEffect(rec([{ equipped: true, effect: 'AC+2' }])), true);
  check('and when the armour sets the base', C.hasBaseAC(rec([{ equipped: true, effect: 'baseAC=15' }])), true);
}

console.log('the sheet language');
{
  /* Every value of the sheet has a name: a formula reads any of them, a
     set writes one once, and an effect on a feature or a worn item moves
     one every time the sheet is drawn. */
  const hero = () => ({
    char: { level: 5, classes: [{ name: 'Rogue', level: 5 }], abilities: { str: 8, dex: 16, con: 14, int: 10, wis: 12, cha: 10 },
      saves: { dex: 1 }, skills: { stealth: 1 }, hp: { current: 20, max: 33, temp: 0 },
      features: [{ key: 'feat-alert', name: 'Alert', effect: 'init + prof' }] },
    equipment: { items: [{ name: 'Cloak of Protection', equipped: true, effect: 'AC + 1; save.all + 1' }] },
    spells: { sp: 0, spMax: 0 }
  });
  const r = hero();
  check('a formula reads the words: prof, level, a class level, a modifier, a score',
    ['prof', 'level', 'rogue.level', 'dex.mod', '@dex.mod', 'dex', 'prof + dex.mod'].map((f) => C.sheetGet(r, f)).join(','), '3,5,5,3,3,16,6');
  check('Alert puts the proficiency on the initiative', C.sheetGet(r, 'init'), 6);
  check('a cloak puts one on the armour class and every save', [C.sheetGet(r, 'AC'), C.sheetGet(r, 'save.dex'), C.sheetGet(r, 'save.str')].join(','), '14,7,0');
  check('a skill reads its proficiency and its effects', C.sheetGet(r, 'skill.stealth'), 6);
  check('a set writes once, from a formula', JSON.stringify([C.sheetSet(r, 'skill.stealth.prof = 2').after, C.sheetSet(r, 'hp = hpMax').after, C.sheetSet(r, 'dex += 2').after]), '[2,33,18]');
  check('a value only an effect moves is not set', (() => { try { C.sheetSet(r, 'save.dex = 9'); return 'set'; } catch (e) { return /read, not set/.test(e.message); } })(), true);
  check('an unknown word is said, not guessed', (() => { try { C.sheetGet(r, 'luck + 1'); return 'read'; } catch (e) { return /not a word/.test(e.message); } })(), true);
  check('an effect is checked before it is written', [C.effectCheck('init + prof', r.char, r).length, C.effectCheck('init + luck', r.char, r).length, C.effectCheck('mood + 1', r.char, r).length].join(','), '0,1,1');
  check('Tough adds two a level to the maximum', C.withEffects({ char: { level: 4, features: [{ effect: 'hpMax + 2 * level' }] } }, 30, ['hpMax']), 38);
  check('an effect that reads what it moves does not loop', (() => { const x = hero(); x.char.features.push({ effect: 'init + init' }); return typeof C.sheetGet(x, 'init'); })(), 'number');
  const archer = { char: { level: 1, abilities: { dex: 16, wis: 16 }, classes: [{ name: 'Fighter', level: 1 }],
    features: [{ name: 'Archery', effect: 'attack.ranged + 2' }, { name: 'Dueling', effect: 'damage.melee + 2' }, { name: 'Robe', effect: 'spellDC + 2; spellAttack + 2' }, { name: 'Mobile', effect: 'speed + 10' }], speed: 30 }, spells: {} };
  check('Archery moves the ranged hit, Dueling the melee damage, and neither the other',
    ['attack.ranged', 'attack.melee', 'damage.melee', 'damage.ranged', 'attack'].map((f) => C.sheetGet(archer, f)).join(','), '2,0,2,0,0');
  check('the spell DC and the spell attack take their effects', [C.sheetGet(archer, 'spellDC') - C.spellDC(archer.char, 'cha'), C.sheetGet(archer, 'spellAttack') - C.spellAttack(archer.char, 'cha')].join(','), '2,2');
  check('Mobile adds ten feet to the speed', C.sheetGet(archer, 'speed'), 40);
  check('the attributes are listed for the fairy, each with what it is', C.attributeList().filter((a) => ['init', 'skill.stealth.prof', 'slot.3', 'spellDC', 'hpMax'].indexOf(a.name) >= 0).length, 5);
}

console.log('the equipment page');
{
  const stub = harness.coreStub({
    SR: C,
    library: { data: () => null, featureByKey: {} },
    chrome: { sectionHead: () => '', esc: (t) => String(t), restIcon: () => '' }
  });
  const spec = harness.page('equipment', { core: stub });
  check('the equipment page registers', [spec.id, spec.slice, spec.on].join('/'), 'equipment/equipment/true');
  const seeded = spec.seed(null, true, {});
  check('it seeds the half plate and the shield', seeded.items.map((i) => i.name).join(' | '), 'Half plate | Shield');
  check('the half plate sets the base of the armour class', seeded.items[0].effect, 'baseAC=15+min(@dex.mod,2)');
  check('and the shield adds two', seeded.items[1].effect, 'AC+2');
  check('both start worn', seeded.items.every((i) => i.equipped), true);
  check('and the two give nineteen on a dexterity of fourteen',
    C.acOf({ char: { ac: 10, abilities: { dex: 14 } }, equipment: seeded }), 19);
}

console.log('the image page');
{
  /* A picture belongs to the character, so the page keeps it in the record
     and a package carries it like every other slice. What goes in the store
     is a small copy: the file is drawn on a canvas first. */
  const stub = harness.coreStub({
    chrome: { iconOf: () => 'guitar', icons: { guitar: { svg: '<path d="M0 0"/>' } }, esc: (t) => String(t) }
  });
  const spec = harness.page('image', { core: stub });
  const src = harness.source('pages/image.js');
  check('the image page registers', [spec.id, spec.slice, spec.tab, spec.on].join('/'), 'image/image/Image/true');
  check('a new character has no picture', spec.seed(null, true, {}).data, '');
  check('and one already saved keeps its own',
    spec.seed({ data: 'data:image/webp;base64,AA' }, false, {}).data, 'data:image/webp;base64,AA');
  check('it takes a file from the player',
    [spec.html.indexOf('type="file"') >= 0, spec.html.indexOf('accept="image/*"') >= 0].join('/'), 'true/true');
  check('the file is downscaled on a canvas',
    [src.indexOf("canvas.toDataURL('image/webp', QUALITY)") >= 0,
      src.indexOf('var LONG = 720;') >= 0].join('/'), 'true/true');
  check('the edit mode carries the upload and the way to take it away',
    [spec.html.indexOf('id="imgPick"') >= 0, spec.html.indexOf('id="imgTake"') >= 0,
      typeof spec.head === 'function'].join('/'), 'true/true/true');
  check('and the empty frame is the icon of the character',
    spec.html.indexOf('id="imgNone"') >= 0, true);
}

console.log('the attack sheet');
{
  /* A turn of attacks on one screen. The rules block throws a roll whole,
     both d20s and every die a critical would double, and reads it: so
     Advantage named after the roll, a tap that says miss, a rider moved to
     another hit, all re-read the dice and never throw them again. */
  const seq = (list) => { let i = 0; return () => (list[i++ % list.length] - 1) / 20 + 0.001; };
  const spec = { way: 'ts', weapon: 'rapier', bonus: 9, mod: 5, type: 'radiant', melee: true, sneakable: true, vex: true,
    base: { sides: 8, count: 1 }, upgrade: { sides: 6, count: 2 }, sneak: { sides: 6, count: 1 } };
  /* The d20s fall at 17 then 8; the damage dice fall after them. */
  const r = R.throwAttack(spec, 'norm', seq([17, 8, 7, 3, 5, 6, 1, 2, 6, 4]));
  check('a roll throws both d20s', [r.a, r.b], [17, 8]);
  check('and twice the dice of every set it can carry',
    [r.base.rolls.length, r.upgrade.rolls.length, r.sneak.rolls.length], [2, 4, 2]);
  const plain = R.attackRead(r, {});
  check('a straight roll keeps the first d20 and adds the bonus', [plain.kept, plain.other, plain.toHit], [17, null, 26]);
  const first = (set, n) => set.rolls.slice(0, n).reduce((a, b) => a + b, 0);
  check('a hit deals the weapon die, the upgrade and the flat, all radiant',
    [plain.hit, plain.crit, plain.damage, plain.order], [true, false, first(r.base, 1) + first(r.upgrade, 2) + 5, ['radiant']]);
  check('the rider lands only where the turn says', R.attackRead(r, { sneak: true }).damage, plain.damage + first(r.sneak, 1));
  check('advantage named afterwards re-reads the same dice',
    [R.attackRead(Object.assign({}, r, { mode: 'adv' }), {}).kept, R.attackRead(Object.assign({}, r, { mode: 'dis' }), {}).kept,
      R.attackRead(Object.assign({}, r, { mode: 'dis' }), {}).other], [17, 8, 17]);
  check('a tap says miss, and a miss deals nothing',
    [R.attackRead(Object.assign({}, r, { flip: true }), {}).hit, R.attackRead(Object.assign({}, r, { flip: true }), {}).damage], [false, 0]);
  const twenty = Object.assign({}, r, { a: 20 });
  const crit = R.attackRead(twenty, {});
  check('a natural twenty doubles every die, never the flat',
    [crit.crit, crit.parts.map((p) => p.rolls.length), crit.damage], [true, [2, 4], first(r.base, 2) + first(r.upgrade, 4) + 5]);
  check('a natural one misses, and a tap makes it a hit',
    [R.attackRead(Object.assign({}, r, { a: 1 }), {}).hit, R.attackRead(Object.assign({}, r, { a: 1, flip: true }), {}).hit], [false, true]);
  const split = R.attackRead(Object.assign({}, r, { type: 'piercing', upgrade: null }), { smite: { sides: 8, count: 2, rolls: [5, 7, 1, 1] } });
  check('a split damage names each type with its number',
    [split.order, split.byType], [['piercing', 'radiant'], { piercing: first(r.base, 1) + 5, radiant: 12 }]);
  /* The turn: the once-a-turn rider takes the first hit that can carry it and
     moves on when that one is tapped to a miss; a smite rides its roll; the
     last melee hit of the Action is where a smite would go. */
  const two = [Object.assign({}, r), Object.assign({}, r, { a: 12 })];
  const t1 = R.turnRead({ rolls: two, sneak: true });
  check('the rider lands on the first hit', t1.sneakAt, 0);
  two[0].flip = true;
  const t2 = R.turnRead({ rolls: two, sneak: true });
  check('and moves to the next one when that hit is a miss', [t2.sneakAt, t2.hits], [1, 1]);
  check('a smite would ride the last melee hit of the Action', t1.smiteAt, 1);
  check('nothing rides a turn with the rider off', R.turnRead({ rolls: two, sneak: false }).sneakAt, -1);
  check('the total adds the hits', t1.total, t1.reads[0].damage + t1.reads[1].damage);
  check('a bonus roll is never where a smite goes',
    R.turnRead({ rolls: [Object.assign({}, r, { part: 'bonus' })] }).smiteAt, -1);

  /* The page: every piece is derived, and hidden without its source. */
  const src = harness.source('pages/attack.js');
  check('the turn is a slice the history keeps', src.indexOf("C.rest.track('attack');") >= 0, true);
  check('every step goes on the history first',
    [src.indexOf('function step(fn) {\n    var rec = api.character();\n    C.rest.push(rec);') >= 0,
      (src.match(/step\(function/g) || []).length >= 8].join('/'), 'true/true');
  check('the count of attacks and the Sneak Attack dice are the class plugins\'',
    [src.indexOf('return C.classes.attacks(api.character());') >= 0,
      src.indexOf('var text = C.classes.sneak(api.character());') >= 0].join('/'), 'true/true');
  check('True Strike reads the casting ability, is radiant, and grows with the book',
    [src.indexOf("bonus = SR.withEffects(rec, SR.spellAttack(c, ab), ['spellAttack']);") >= 0, src.indexOf("type = 'radiant';") >= 0,
      src.indexOf("SR.cantripUpgrade(C.library.bookByName['True Strike'], level())") >= 0].join('/'), 'true/true/true');
  check('Quicken needs Metamagic and True Strike, and spends two points',
    [src.indexOf("way.id === 'ts' && (C.classes.has(api.character(), 'metamagic') || hasFeature(/metamagic/i))") >= 0,
      src.indexOf("C.counter.spend(rec, 'sp');\n      C.counter.spend(rec, 'sp');") >= 0].join('/'), 'true/true');
  check('the smite is the spell, rides a melee hit, and spends a slot through the counter',
    [src.indexOf("hasSpell('Divine Smite')") >= 0, src.indexOf('read.smiteAt < 0') >= 0,
      src.indexOf('C.counter.spend(rec2, key)') >= 0, src.indexOf('R.smiteSet(lv, false)') >= 0].join('/'), 'true/true/true/true');
  check('one bonus action a turn', [src.indexOf('if (t.bonus || read.smiteAt < 0') >= 0, src.indexOf('|| t.bonus ||') >= 0].join('/'), 'true/true');
  /* A character who holds the spell and has no slot draws no sun: the row
     goes with its levels. */
  check('a smite with no level to spend draws no row',
    [src.indexOf('var levels = smiteLevels();') >= 0,
      src.indexOf("var smiting = hasSpell('Divine Smite') && levels.length > 0;") >= 0].join('/'), 'true/true');
  check('Vex is a reminder the player turns on, never a rule',
    [src.indexOf('r.vexed = !r.vexed;') >= 0, src.indexOf('if (r.vexed) { t.adv = true; t.dis = false; }') >= 0].join('/'), 'true/true');
  check('no target armour class', /\bac\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), false);

  /* The page run on a sheet: Oko, a rapier and a hand crossbow, True Strike
     and Divine Smite in his lists, Sneak Attack and Metamagic among his
     features. The rolls are thrown by the real rules block. */
  const castCtx = vm.createContext({});
  vm.runInContext(harness.source('cast.js'), castCtx);
  const toggleCtx = vm.createContext({});
  vm.runInContext(harness.source('toggle.js'), toggleCtx);
  const cardCtx = vm.createContext({});
  vm.runInContext(harness.source('attackbox.js'), cardCtx);
  const cards = cardCtx.SheetAttackBox({
    dieBig: () => '<svg></svg>', dieIcon: () => '<svg></svg>', esc: (t) => String(t), roll: rollBlock()
  });
  const plugCtx = vm.createContext({});
  vm.runInContext(harness.source('klass.js'), plugCtx);
  ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard']
    .forEach((n) => vm.runInContext(harness.source('classes/' + n + '.js'), plugCtx));
  const weaponsFile = harness.built().data('weapons');
  const featuresFile = harness.built().data('features');
  const featureByKey = {};
  featuresFile.features.forEach((f) => { featureByKey[f.key] = f; });
  const okoRec = {
    char: { level: 11, abilities: { str: 13, dex: 14, cha: 20 },
      classes: [{ name: 'Sorcerer', level: 9 }, { name: 'Rogue', level: 1 }, { name: 'Paladin', level: 1 }],
      features: [{ key: 'rogue-1-sneak-attack', name: 'Sneak Attack' }, { key: 'metamagic', name: 'Metamagic' }] },
    equipment: { items: [
      { id: 'rapier', name: 'Rapier', category: 'weapon', equipped: true, mastery: 'Vex' },
      { id: 'handCrossbow', name: 'Hand crossbow', category: 'weapon', equipped: true, mastery: 'Vex' }] },
    spells: { lists: { 0: ['True Strike'], 1: ['Divine Smite'] }, sp: 9, spMax: 9, left: { 1: 4, 2: 3 }, max: { 1: 4, 2: 3 } }
  };
  const pushed = [];
  const said = [];
  const stub = harness.coreStub({
    R: R, SR: C,
    library: { data: (name, fill) => { if (name === 'weapons' && fill) fill(weaponsFile); return null; },
      primaryAbility: () => 'cha', featureByKey: featureByKey, bookByName: {} },
    chrome: { esc: (t) => String(t), dieIcon: () => '<svg></svg>' },
    counter: {
      counterOf: (rec, key) => key === 'sp' ? { left: rec.spells.sp, max: rec.spells.spMax }
        : (key.indexOf('slot:') === 0 ? { left: rec.spells.left[key.slice(5)] || 0, max: rec.spells.max[key.slice(5)] || 0 } : null),
      spend: (rec, key) => {
        if (key === 'sp') { rec.spells.sp -= 1; return { ok: true, left: rec.spells.sp }; }
        const lv = key.slice(5); rec.spells.left[lv] -= 1; return { ok: true, left: rec.spells.left[lv] };
      }
    },
    rest: { track: () => {}, push: (rec) => pushed.push(JSON.stringify(rec.attack)) },
    feedback: { spent: (label, n, left) => said.push(label + ' ' + n + ' ' + left) },
    cast: castCtx.SheetCast(),
    toggle: toggleCtx.SheetToggle(),
    attackCard: cards.card,
    classes: plugCtx.SheetClasses
  });
  const page = harness.page('attack', { core: stub, navigator: {} });
  check('the attack page registers', [page.id, page.slice, page.tab, page.order, page.on].join('/'), 'attack/attack/Attack/7/false');
  check('a new character starts with no roll and the rider on',
    JSON.stringify(page.seed(null, true, {})), '{"way":"","weapon":"","adv":false,"dis":false,"sneak":true,"rage":false,"rolls":[],"bonus":"","smite":null}');
  check('and an older slice keeps its weapon and its advantage',
    JSON.stringify(page.seed({ weapon: 'rapier', advantage: true, quicken: true, smite: 3 }, false, {})),
    '{"way":"","weapon":"rapier","adv":true,"dis":false,"sneak":true,"rage":false,"rolls":[],"bonus":"","smite":null}');
  const el = () => {
    const e = { innerHTML: '', textContent: '', hidden: false, disabled: false, listeners: {}, attrs: {},
      addEventListener: (k, fn) => { e.listeners[k] = fn; }, setAttribute: (k, v) => { e.attrs[k] = String(v); },
      querySelector: () => el() };
    return e;
  };
  const byId = {};
  const root = { querySelector: (sel) => byId[sel] || (byId[sel] = el()) };
  okoRec.attack = page.seed(null, true, okoRec);
  const api = { character: () => okoRec, save: () => {}, refresh: () => page.render(api), show: () => {}, toast: () => {} };
  page.mount(root, api);
  page.render(api);
  const body = () => byId['#atkBody'].innerHTML;
  check('Oko has two ways, two weapons, and Adv, Dis and Sneak',
    [(body().match(/data-way="/g) || []).length, (body().match(/data-weapon="/g) || []).length,
      (body().match(/data-key="(adv|dis|sneak)"/g) || []).length], [2, 2, 3]);
  check('and a bonus action of Quicken and the smite levels',
    [body().indexOf('id="atkQuicken"') >= 0, (body().match(/data-smite="/g) || []).length], [true, 2]);
  check('the one button names True Strike, one roll', byId['#atkCast'].innerHTML, '<span>True Strike</span>');
  byId['#atkCast'].listeners.click();
  check('a press throws a roll, as one step of the history',
    [okoRec.attack.rolls.length, pushed.length, okoRec.attack.rolls[0].type], [1, 1, 'radiant']);
  check('and the card arrives', (body().match(/class="acard /g) || []).length, 1);
  check('the button then starts a new turn', byId['#atkCast'].attrs['aria-label'], 'A new turn: True Strike');
  const click = (attr) => byId['#atkBody'].listeners.click({ target: { closest: (sel) => (sel === attr ? { dataset: { key: 'adv', flip: '0' }, disabled: false } : null) } });
  click('.atktogs .vchip');
  check('Adv after the roll re-reads it, as a step', [okoRec.attack.adv, okoRec.attack.rolls[0].mode, pushed.length], [true, 'adv', 2]);
  const before = okoRec.spells.sp;
  byId['#atkBody'].listeners.click({ target: { closest: (sel) => (sel === '#atkQuicken' ? {} : null) } });
  check('Quicken spends two points and the bonus action, and throws a bonus roll',
    [before - okoRec.spells.sp, okoRec.attack.bonus, okoRec.attack.rolls[1].part, said[0]], [2, 'quicken', 'bonus', 'sorcery point 2 7']);
  check('with the bonus action spent, no smite', (body().match(/data-smite="\d+" disabled/g) || []).length, 2);
  /* A character without the sources sees none of the pieces. */
  okoRec.char.features = [];
  okoRec.char.classes = [{ name: 'Sorcerer', level: 1 }];
  okoRec.spells.lists = { 0: [] };
  okoRec.attack = page.seed(null, true, okoRec);
  page.render(api);
  check('without the cantrip, the feature or the spell, only the Attack and its weapons',
    [(body().match(/data-way="/g) || []).length, body().indexOf('data-key="sneak"') < 0, body().indexOf('atkQuicken') < 0,
      body().indexOf('data-smite') < 0], [0, true, true, true]);
  okoRec.equipment.items = [];
  page.render(api);
  check('and without a weapon worn, it says so and points to the equipment',
    [body().indexOf('No weapon is worn.') >= 0, body().indexOf('data-go="equipment"') >= 0, byId['#atkCast'].disabled], [true, true, true]);
}

console.log('the classes and the multiclass rules');
{
  const data = JSON.parse(readFileSync(resolve(root, 'data', 'classes.json'), 'utf8')).classes;
  const byName = (n) => data.filter((c) => c.name === n)[0];
  check('twelve classes', data.length, 12);
  check('every class gives its hit die', data.every((c) => c.hd >= 6 && c.hd <= 12), true);
  check('the classes that cast name their ability', data.filter((c) => !!c.ability).map((c) => c.name).join(','), 'Bard,Cleric,Druid,Paladin,Ranger,Sorcerer,Warlock,Wizard');
  check('the bard is a full caster', byName('Bard').caster, 'full');
  check('the warlock is pact magic', byName('Warlock').caster, 'pact');
  check('the paladin of 2024 counts as half', C.casterLevel([{ level: 5, caster: byName('Paladin').caster }]), 2);
  check('the bard has the creation and the lore', ['College of Creation', 'College of Lore'].every((n) => byName('Bard').subclasses.some((s) => s.name === n)), true);
  check('and the lore is printed once, the 2024 way', byName('Bard').subclasses.filter((s) => s.name === 'College of Lore')[0].source, 'XPHB');

  check('a full caster counts its level', C.casterLevel([{ level: 8, caster: 'full' }, { level: 3, caster: 'pact' }]), 8);
  check('a half caster counts half', C.casterLevel([{ level: 5, caster: 'full' }, { level: 4, caster: 'half' }]), 7);
  check('the pact magic adds nothing', C.casterLevel([{ level: 3, caster: 'pact' }]), 0);
  check('the slots of a caster of eight', [C.slotsFor(8)[1], C.slotsFor(8)[2], C.slotsFor(8)[3], C.slotsFor(8)[4], C.slotsFor(8)[5]].join(''), '43320');
  check('the slots of a caster of eleven', [C.slotsFor(11)[5], C.slotsFor(11)[6], C.slotsFor(11)[7]].join(''), '210');
  check('a caster of twenty', C.slotsFor(20)[9], 1);
  check('the pact slots of a warlock three', JSON.stringify(C.pactFor(3)), '{"max":2,"level":2}');
  check('and of a warlock eleven', JSON.stringify(C.pactFor(11)), '{"max":3,"level":5}');
  check('the warlock level of a character', C.warlockLevel([{ name: 'Sorcerer', level: 8 }, { name: 'Warlock', level: 3 }]), 3);
  check('no warlock, no pact slot', C.pactFor(C.warlockLevel([{ name: 'Bard', level: 11 }])).max, 0);
  check('the spell attack of a charisma caster', C.spellAttack({ abilities: { cha: 20, int: 18 }, level: 11 }), 9);
  check('and of a wizard', C.spellAttack({ abilities: { cha: 20, int: 18 }, level: 11 }, 'int'), 8);
  check('the DC of a wizard of eleven', C.spellDC({ abilities: { int: 18 }, level: 11 }, 'int'), 16);
}

console.log('initiative');
{
  check('it follows the dexterity', C.initMod({ abilities: { dex: 14 } }), 2);
  check('a score of eight gives a minus one', C.initMod({ abilities: { dex: 8 } }), -1);
  check('a score of ten gives nothing', C.initMod({ abilities: { dex: 10 } }), 0);
  check('a set initiative wins', C.initMod({ abilities: { dex: 14 }, init: 5, initTouched: true }), 5);
  check('and a set zero keeps its zero', C.initMod({ abilities: { dex: 14 }, init: 0, initTouched: true }), 0);
}

console.log('seeding a character from the data');
{
  const features = JSON.parse(readFileSync(resolve(root, 'data', 'features.json'), 'utf8'));
  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  /* The packages under test/fixtures are frozen on purpose: characters/
     is the shelf, and a character pushed from the app moves it. */
  const pkg = JSON.parse(readFileSync(resolve(root, 'test', 'fixtures', 'yngwie.json'), 'utf8'));
  const classes = JSON.parse(readFileSync(resolve(root, 'data', 'classes.json'), 'utf8')).classes;
  const bard = { id: 'bardCreation', name: pkg.name, rec: pkg.record };
  const levelOf = {};
  book.spells.forEach((s) => { levelOf[s.name] = s.level; });

  check('the example travels as a package', pkg.kind + '/' + pkg.version, 'custom-sheet-character/1');
  check('the bard of the sheet', bard.id, 'bardCreation');
  const known = features.features.map((f) => f.key);
  check('every feature it holds is known', bard.rec.char.features.every((f) => known.indexOf(f.key) >= 0), true);
  check('the twelve it brings are its own', features.features.filter((f) => f.preset === 'bard').length, 12);
  check('the eighteen of the app wait for a new character', features.features.filter((f) => f.seed).length, 18);
  check('the level of the sheet', bard.rec.char.level, 11);
  check('the class of the sheet', JSON.stringify(bard.rec.char.classes), '[{"name":"Bard","level":11,"subclass":"College of Creation"}]');
  const prepared = (n) => (classes.filter((c) => c.name === n)[0] || {}).prepared || [];
  check('the sorcerer prepares twelve spells at level eight', prepared('Sorcerer')[7], 12);
  check('and the warlock four at level three', prepared('Warlock')[2], 4);
  check('and a class that casts nothing prepares none', prepared('Fighter').length, 0);
  check('the name of the sheet', bard.name + '/' + bard.rec.char.name, 'Yngwie/Yngwie');
  check('the six scores of the sheet', ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => bard.rec.char.abilities[k]).join('/'), '8/14/14/10/12/19');
  check('it comes with its own colours and icon', bard.rec.theme + '/' + bard.rec.icon, 'blueRed/guitar');
  check('it sets no initiative, the dexterity gives it', bard.rec.char.initTouched === undefined, true);
  check('eleven hit dice, all d8', bard.rec.char.dice.length + 'd' + bard.rec.char.dice[0].type, '11d8');
  check('proficient in the two bard saves', bard.rec.char.saves.dex + '/' + bard.rec.char.saves.cha, '1/1');
  const slots = bard.rec.spells.max;
  check('the slots of a level 11 bard', [slots[1], slots[2], slots[3], slots[4], slots[5], slots[6]].join(''), '433321');
  check('no pact slot and no sorcery point', bard.rec.spells.warlockMax + '/' + bard.rec.spells.spMax, '0/0');
  check('no volley page', bard.rec.pages.indexOf('volley'), -1);
  const listed = [];
  Object.keys(bard.rec.spells.lists).forEach((lv) => bard.rec.spells.lists[lv].forEach((n) => listed.push(lv + ':' + n)));
  check('every spell it holds is in the book', listed.every((x) => levelOf[x.split(':')[1]] !== undefined), true);
  check('every spell sits at its own level', listed.every((x) => levelOf[x.split(':')[1]] === Number(x.split(':')[0])), true);
  check('the twenty one spells of the character', listed.length, 21);
  const declared = bard.rec.spells.sources;
  check('every spell of the preset names its source', Object.keys(declared).length, 21);
  check('five come from the conjuration adept', Object.keys(declared).filter((n) => declared[n] === 'Conjuration adept').length, 5);
  check('shield comes from the abjuration adept', declared.Shield, 'Abjuration adept');
  /* The five the class and the elf bring name a class and a race, and no
     feature of the library carries that name, so the check of the feat
     reaches the ten that come from one. */
  const fromFeat = Object.keys(declared).filter((n) => features.features.some((f) => f.name === declared[n]));
  check('the ten of the feats name a feature', fromFeat.length, 10);
  check('and each one is the feature that grants it', fromFeat.every((n) => {
    const feat = features.features.filter((f) => f.name === declared[n])[0];
    return JSON.stringify(feat.blocks).indexOf('"' + n + '"') >= 0;
  }), true);
  check('the grimoire opens with every filter off', JSON.stringify(bard.rec.spells.classes), '{"Bard":false,"Wizard":false,"Druid":false}');

  /* The two pages that hold a character read their own slice, so the way
     from the ready-made record to the sheet is checked here. */
  const taken = {};
  const core = harness.coreStub({
    R: R, SR: C,
    chrome: { sectionHead: () => '', restIcon: () => '' },
    library: {
      book: book, bookByName: {},
      features: features, featureByKey: {},
      seeds: {
        features: features.features.filter((f) => f.seed),
        spells: (book.seed || []).map((s) => ({ name: s.name, level: s.level }))
      },
      data: () => Promise.resolve(true),
      classInfo: (name) => classes.filter((c) => c.name === name)[0] || null,
      classRows: (ch) => (ch.classes || []).map((k) => {
        const info = classes.filter((c) => c.name === k.name)[0] || {};
        return { name: k.name, level: k.level, subclass: k.subclass || '', ability: info.ability, caster: info.caster, hd: info.hd };
      }),
      canonSource: (s) => s
    }
  });
  book.spells.forEach((s) => { core.library.bookByName[s.name] = s; });
  features.features.forEach((f) => { core.library.featureByKey[f.key] = f; });
  /* The level slider is the real one: the description of a spell opens it. */
  const sliderCtx = vm.createContext({});
  vm.runInContext(harness.source('slider.js'), sliderCtx);
  core.slider = sliderCtx.SheetSlider();
  taken.character = harness.page('character', { core: core, navigator: { vibrate: () => {} } });
  taken.spells = harness.page('spells', { core: core, navigator: { vibrate: () => {} } });

  /* The name is on the banner, so the card does not say it a second time.
     The level stays where it was, and the banner keeps naming the character. */
  check('the character card carries no name field', taken.character.html.indexOf('id="charName"'), -1);
  check('and keeps its level', taken.character.html.indexOf('id="charLevel"') >= 0, true);
  check('the name stays the title of the banner',
    taken.character.title({ character: () => ({ char: { name: 'Wendy' } }) }), 'Wendy');

  const char = taken.character.seed(bard.rec.char, true);
  check('the ready-made features arrive whole', char.features.length, bard.rec.char.features.length);
  check('and they are its own', char.features.map((f) => f.key).indexOf('musician') >= 0, true);
  check('a feature keeps its uses', char.features.filter((f) => f.key === 'bardicInspiration')[0].max, bard.rec.char.features.filter((f) => f.key === 'bardicInspiration')[0].max);
  check('the level survives the seeding', char.level, 11);
  check('the class survives it too', char.classes.length + ' ' + char.classes[0].name, '1 Bard');
  check('charisma 19 and level 11 give a spell attack of +8', C.spellAttack(char), 8);
  check('and a save DC of 16', C.spellDC(char), 16);
  check('the bard rolls eleven d8', char.dice.filter((d) => d.type === 8).length + 'd8', '11d8');
  check('and no other die', char.dice.filter((d) => d.type !== 8).length, 0);
  check('and an initiative of +2', C.initMod(char), 2);
  const own = taken.character.seed({}, false);
  check('the app\'s own character keeps its features', own.features.length, 19);
  check('the dice of the app\'s own character come from the classes', own.dice.filter((d) => d.type === 6).length + 'd6 and ' + own.dice.filter((d) => d.type === 8).length + 'd8', '8d6 and 3d8');
  check('and its own numbers', own.level + '/' + own.abilities.cha, '11/20');
  const blank = taken.character.seed({}, true);
  check('a character from nothing has no feature', blank.features.length, 0);
  check('and the scores of the floor', blank.abilities.cha, 10);
  check('the bard carries his proficiencies', char.profs.map((p) => p.label).join(', '), 'Light armour, Simple weapons, Electric guitar');
  check('a character from nothing has none', blank.profs.length, 0);
  check('a card that is not named is dropped', taken.character.seed({ profs: [{ id: 'a', label: 'Light armour' }, { label: 'no name' }] }, false).profs.length, 1);
  check('and a label that is not a string reads empty', taken.character.seed({ profs: [{ id: 'b' }] }, false).profs[0].label, '');
  const spell = taken.spells.seed(bard.rec.spells, true);
  check('the ready-made spells travel', spell.lists[1].join(','), 'Entangle,Shield');
  check('a level it left empty stays empty', spell.lists[7].length, 0);
  check('the slots travel too', [spell.max[1], spell.max[5]].join('/'), '4/2');
  check('the source of a spell is the character\'s own', spell.sources.Shield, 'Abjuration adept');
  const old = taken.spells.seed({ lists: { 1: ['Shield'] } }, false);
  check('a record saved before this takes the sources of the book', old.sources.Shield, 'Hexblade');
  const mine = taken.spells.seed({ lists: { 1: ['Shield'] }, sources: { Shield: 'Warlock' } }, false);
  check('a record that names its own keeps exactly them', JSON.stringify(mine.sources), '{"Shield":"Warlock"}');
  const silent = taken.spells.seed({ lists: { 1: ['Shield'] }, sources: {} }, false);
  check('a record that never named a source takes the ones of the book', silent.sources.Shield, 'Hexblade');
  const cleared = taken.spells.seed({ lists: { 1: ['Shield'] }, sources: {}, sourcesTouched: true }, false);
  check('and one that cleared them all keeps them cleared', JSON.stringify(cleared.sources), '{}');
  const kept = taken.spells.seed({ lists: { 1: [] } }, false);
  check('a level the player emptied stays empty', kept.lists[1].length, 0);
  check('and the rest keeps the app\'s spells', kept.lists[0].length, 10);
}

console.log('the page the phone opens at launch');
{
  const built = harness.built().html;
  const block = built.match(/<script id="surge-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!block) { check('the table is inlined', false, true); }
  else {
    const parsed = JSON.parse(block[1]);
    check('the table is inlined with twenty five rows', parsed.rows.length, 25);
    check('the inlined table matches the data file', parsed.rows[0].text, JSON.parse(readFileSync(resolve(root, 'data', 'wild-magic-surge-xphb.json'), 'utf8')).rows[0].text);
  }
  const sheetBlock = built.match(/<script id="sheet-rules">([\s\S]*?)<\/script>/);
  check('the sheet rules travel with the page', !!sheetBlock, true);
  /* The library, the book and the classes are files beside the page, read
     when a page asks for one, so a launch only pays for the character. */
  const seedBlock = built.match(/<script id="seed-data" type="application\/json">([\s\S]*?)<\/script>/);
  check('the seeds travel with the page', !!seedBlock, true);
  if (seedBlock) {
    const seeds = JSON.parse(seedBlock[1]);
    check('the eighteen features a fresh character starts with', seeds.features.length, 18);
    check('and the spells of the sheet', seeds.spells.length > 20, true);
    check('each with the level it sits at', seeds.spells.every((s) => s.name && s.level >= 0), true);
  }
  check('the page carries no library', built.indexOf('"key": "wizard-1-arcane-recovery"') < 0, true);
  const distFeatures = harness.built().data('features');
  check('the library sits beside the page', distFeatures.features.length, 1039);
  check('and matches the data file', distFeatures.features.length, JSON.parse(readFileSync(resolve(root, 'data', 'features.json'), 'utf8')).features.length);
  const distClasses = harness.built().data('classes');
  check('the classes sit beside it too', distClasses.classes.length, 12);
  /* The page carries the character and the rules, never the libraries. What
     it must not carry is the book and the bestiary, which are 1.8 MB between
     them, and the two markers below are a sentence of each. The number is a
     coarse tripwire far above the page, not a budget, so no slice has to trim
     prose to fit a number: it was 600000 and the page reached it, then 640000
     and the page reached that too, then 700000 when the agent page joined,
     then 800000, and the agent's tools reached that too, so it is 900000
     then 900000 when the fairy painted and laid out pages, so it is 1000000
     now: a book inlined would still cross it, the page being close to
     900000 and the spell book alone over half a megabyte. */
  check('the page is small without them', built.length < 1000000, true);
  const bookMarker = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8')).spells[0].blocks[0].text;
  const beastMarker = JSON.parse(readFileSync(resolve(root, 'data', 'bestiary.json'), 'utf8')).creatures.ghast.traits[0].text;
  check('the book did not come inside the page', bookMarker.length > 40 && built.indexOf(bookMarker) < 0, true);
  check('nor did the bestiary', beastMarker.length > 20 && built.indexOf(beastMarker) < 0, true);
  check('no character travels inside the page', /<script id="character-data"/.test(built), false);
  const distBook = harness.built().data('spellbook');
  check('the book sits beside the page', distBook.spells.length > 100, true);
  check('and matches the data file', distBook.spells[0].name, JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8')).spells[0].name);

  /* The build fills the blocks the page declares, and a renamed block is a
     build that fails rather than a page that ships an empty one. The proof is
     the build itself, run in a copy, so the repository is never touched. */
  const copied = (name) => {
    const dir = mkdtempSync(join(tmpdir(), 'custom-sheet-' + name + '-'));
    cpSync(resolve(root, 'src'), resolve(dir, 'src'), { recursive: true });
    cpSync(resolve(root, 'data'), resolve(dir, 'data'), { recursive: true });
    cpSync(resolve(root, 'build.mjs'), resolve(dir, 'build.mjs'));
    return dir;
  };
  const renamed = copied('renamed');
  const untouched = copied('untouched');
  try {
    const page = resolve(renamed, 'src', 'index.html');
    writeFileSync(page, readFileSync(page, 'utf8').replace('id="version-data"', 'id="version-block"'));
    check('a renamed block fails the build', (() => {
      try {
        execFileSync(process.execPath, [resolve(renamed, 'build.mjs')], { cwd: renamed, stdio: 'pipe' });
        return 'built';
      } catch (err) {
        return String(err.stderr || '').indexOf('the version-data block is not in the page') >= 0 ? 'named' : 'other';
      }
    })(), 'named');
    check('and the untouched copy builds', (() => {
      try {
        execFileSync(process.execPath, [resolve(untouched, 'build.mjs')], { cwd: untouched, stdio: 'pipe' });
        return 'built';
      } catch (err) {
        return String(err.stderr || err);
      }
    })(), 'built');

    /* The build is the same bytes whoever checks the tree out. Windows hands
       one checkout CRLF and the next LF, in the page and in the data the
       build inserts into it, so the two are built and compared with the
       stamped version block normalised. */
    const crlf = copied('crlf');
    const lf = copied('lf');
    try {
      ['src/index.html', 'data/wild-magic-surge-xphb.json'].forEach((f) => {
        const p = resolve(crlf, f);
        writeFileSync(p, readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
        const q = resolve(lf, f);
        writeFileSync(q, readFileSync(q, 'utf8').replace(/\r\n/g, '\n'));
      });
      execFileSync(process.execPath, [resolve(crlf, 'build.mjs')], { cwd: crlf, stdio: 'pipe' });
      execFileSync(process.execPath, [resolve(lf, 'build.mjs')], { cwd: lf, stdio: 'pipe' });
      const stamp = /<script id="version-data" type="application\/json">[^<]*<\/script>/;
      check('a CRLF checkout builds the page an LF one builds',
        readFileSync(resolve(crlf, 'dist', 'index.html'), 'utf8').replace(stamp, 'V'),
        readFileSync(resolve(lf, 'dist', 'index.html'), 'utf8').replace(stamp, 'V'));
    } catch (err) {
      check('a CRLF checkout builds the page an LF one builds', String((err && err.message) || err), 'built');
    } finally {
      rmSync(crlf, { recursive: true, force: true });
      rmSync(lf, { recursive: true, force: true });
    }
  } finally {
    rmSync(renamed, { recursive: true, force: true });
    rmSync(untouched, { recursive: true, force: true });
  }
}


console.log('the paladin of the sheet');
{
  /* OKO's shared sheet: a sorcerer 9, a rogue 1 and a paladin 1, with the
     spells of the grimoire. His own sheet plays no volley and no summons. */
  const pkg = JSON.parse(readFileSync(resolve(root, 'test', 'fixtures', 'oko.json'), 'utf8'));
  const rec = pkg.record;
  const features = JSON.parse(readFileSync(resolve(root, 'data', 'features.json'), 'utf8')).features;
  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  const levelOf = {};
  book.spells.forEach((s) => { levelOf[s.name] = s.level; });
  check('the sheet travels as a package', [pkg.kind, pkg.version, pkg.name].join('/'), 'custom-sheet-character/1/Oko');
  check('it is a sorcerer, a rogue and a paladin',
    rec.char.classes.map((c) => c.name + ' ' + c.level).join(', '), 'Sorcerer 9, Rogue 1, Paladin 1');
  check('and a level eleven character', rec.char.level, 11);
  check('the six scores of the sheet', ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => rec.char.abilities[k]).join('/'), '13/14/12/12/8/20');
  const known = features.map((f) => f.key);
  check('every feature it holds is known', rec.char.features.every((f) => known.indexOf(f.key) >= 0), true);
  check('the expertise of the sheet', rec.char.skills.stealth + '/' + rec.char.skills.athletics, '2/2');
  check('no volley and no summons on his sheet', rec.pages.filter((p) => p === 'volley' || p === 'summons'), []);
  check('and its gear page is on', rec.pages.indexOf('equipment') >= 0, true);
  const appSlots = C.slotsFor(9);
  check('the slots of a level 9 sorcerer',
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => rec.spells.max[l] || 0).join(''),
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => Number(appSlots[l]) || 0).join(''));
  check('and the sorcery points of the level', rec.spells.spMax, 9);
  const listed = [];
  Object.keys(rec.spells.lists).forEach((lv) => rec.spells.lists[lv].forEach((n) => listed.push(lv + ':' + n)));
  check('every spell it holds is in the book', listed.every((x) => levelOf[x.split(':')[1]] !== undefined), true);
  check('every spell sits at its own level', listed.every((x) => levelOf[x.split(':')[1]] === Number(x.split(':')[0])), true);
  check('the grimoire gives it sixty six spells', listed.length, 66);
  check('and the three outside the book keep the source the sheet gave them',
    ["Raulothim's Psychic Lance", 'Scatter', "Tasha's Otherworldly Guise"].map((n) => rec.spells.sources[n]).join('/'),
    'Sorcerer/Wish/Wish');
  check('every source names a spell of the lists',
    Object.keys(rec.spells.sources).filter((n) => listed.indexOf(Object.keys(rec.spells.lists)[0] + ':' + n) >= 0 ||
      !Object.keys(rec.spells.lists).some((lv) => rec.spells.lists[lv].indexOf(n) >= 0)), []);
  check('the rapier and the hand crossbow are its gear', rec.equipment.items.map((i) => i.name).join(' | '), 'Rapier | Hand crossbow');
  check('and the two masteries are text', rec.equipment.items.every((i) => i.mastery === 'Vex'), true);
}

console.log('the roll of an attack');
{
  const half = () => 0.5;
  const top = () => 0.999;
  check('the flat of a damage is the number on the dice', R.flatIn('1d10 + 11'), 11);
  check('and there may be more than one', R.flatIn('2d6 + 3 + 5'), 8);
  check('a damage of dice alone has no flat', R.flatIn('2d6'), 0);
  const roll = R.rollAttack(8, '1d10 + 11', false, half);
  check('the d20 is rolled', roll.roll, 11);
  check('the total carries the bonus', roll.total, 19);
  check('the damage is the dice and the flat', roll.damage, 17);
  check('the dice are named', roll.groups[0].label, '1d10');
  check('the roll does not know the target', roll.hit, undefined);
  check('and it rolls one die', roll.rolls.length, 1);
  const crit = R.rollAttack(8, '1d10 + 11', false, top);
  check('a natural twenty is a critical', crit.crit, true);
  check('and it doubles the dice', crit.groups[0].label, '2d10');
  check('so the damage is bigger', crit.damage, 31);
  /* The advantage rolls the die twice and keeps the better one. */
  let call = 0;
  const two = () => { call++; return call === 1 ? 0.3 : 0.9; };
  const adv = R.rollAttack(8, '1d10 + 11', true, two);
  check('the die is rolled twice', adv.rolls.length, 2);
  check('and the better one is kept', adv.roll, 19);
  check('the total follows the kept one', adv.total, 27);
  const flat = R.rollAttack(8, '1d10 + 11', true, half);
  check('a single roll is not an advantage', flat.rolls.length, 2);
  check('and the same die twice keeps the same', flat.roll, 11);
}
console.log('the bestiary');
{
  const bestiary = JSON.parse(readFileSync(resolve(root, 'data', 'bestiary.json'), 'utf8'));
  const creatures = bestiary.creatures || {};
  const keys = Object.keys(creatures);
  check('the bestiary travels with the app', keys.length > 20, true);
  check('the battle familiar is one of them', !!creatures['battle familiar'], true);
  check('and the dancing item of the bard', !!creatures['dancing item'], true);
  check('a block whose armour class is a formula says so', creatures['battle familiar'].acText, "11 + the spell's level + 2 (Brute only)");
  check('and holds no number for it', creatures['battle familiar'].ac, 0);
  check('a block with numbers holds them', creatures['skeleton'].ac, 14);
  check('and its hit points', creatures['skeleton'].hp, 13);
  check('an attack carries its bonus', creatures['skeleton'].actions[0].bonus, '5');
  check('and its damage', creatures['skeleton'].actions[0].damage, '1d6 + 3');
  check('the type of a creature is its kind', creatures['skeleton'].type, 'undead');
  /* The whole stat block travels with the creature. */
  check('a block carries the resistances', creatures['celestial spirit'].resist[0].text, 'radiant');
  check('and the condition immunities', creatures['celestial spirit'].conditionImmune.length, 2);
  check('and the senses', creatures['celestial spirit'].senses[0].text, 'Darkvision 60 ft.');
  check('and the six abilities', creatures['celestial spirit'].ability.length, 6);
  check('and the languages', creatures['celestial spirit'].languages, 'Celestial, understands the languages you know');
  check('and the size in words', creatures['celestial spirit'].size, 'Large');
  check('and the alignment', creatures['celestial spirit'].alignment, 'Neutral');
  check('and the traits of a monster', creatures['cat'].traits[0].name, 'Jumper');
  check('and the experience of the challenge', creatures['ghast'].xp, 450);
  check('and the saving throws with their key', creatures['ghast'].saves[0].key, 'wis');
  check('and the bonus the book writes for them', creatures['ghast'].saves[0].value, '+2');
  /* The initiative of a monster is the dexterity, unless the book says
     otherwise: a monster may be proficient in initiative. */
  check('a creature with no initiative keeps the dexterity', creatures['ghast'].initiative, null);
  check('and one that is proficient carries it', creatures['wight'].initiative.proficiency, 1);
  check('the initiative is the dexterity and the proficiency', creatures['wight'].initiative.value, 4);
  check('the challenge of a monster is its text', creatures['ghast'].cr, '2');
  /* The block keeps what the source says: the kind the caster chooses, the
     passive Perception that is a sense on its own, and, on a form, the speed
     and the sections the version patches. */
  check('the kind a creature chooses is named', creatures['battle familiar'].type, 'Celestial, Fey, or Fiend');
  check('and the other creatures that choose too', creatures['vestige companion'].type, 'Celestial, Fiend, or Undead');
  check('a creature with no other sense keeps its passive Perception', creatures['hawk'].senses[0].text, 'passive Perception 16');
  check('a form carries its own speed', creatures['battle familiar'].forms[0].speed, 'walk 40 ft., swim 30 ft.');
  check('and the flyer the one it flies at', creatures['battle familiar'].forms[1].speed, 'walk 40 ft., fly 30 ft. (hover), swim 30 ft.');
  check('a form keeps only the bonus action of its kind', creatures['otherworldly steed'].forms[0].bonusActions.length, 1);
  check('and it is the one of that kind', creatures['otherworldly steed'].forms[0].bonusActions[0].name, 'Healing Touch (Recharges after a Long Rest)');
  check('a version that clears the reactions is read', creatures['construct spirit'].forms.filter((f) => f.id === 'metal')[0].reactions.length, 0);
  check('and the one that renames it keeps its own', creatures['construct spirit'].forms.filter((f) => f.id === 'clay')[0].reactions[0].name, 'Berserk Lashing');
  check('the fey spirit keeps the mood of its form', creatures['fey spirit'].forms[0].bonusActions[0].text.indexOf('Advantage') >= 0, true);
  check('a template is no form the player can pick', (creatures['draconic spirit'].forms || []).length, 0);

  const book = JSON.parse(readFileSync(resolve(root, 'data', 'spellbook.json'), 'utf8'));
  const summoning = book.spells.filter((s) => s.summons);
  check('the spells that call a creature are marked', summoning.length, 19);
  check('the find familiar is one of them', summoning.some((s) => s.name === 'Find Familiar'), true);
  check('the conjure animals is not one, it is an effect', summoning.some((s) => s.name === 'Conjure Animals'), false);
  check('nor the conjure elemental', summoning.some((s) => s.name === 'Conjure Elemental'), false);
  check('nor the conjure minor elementals', summoning.some((s) => s.name === 'Conjure Minor Elementals'), false);
  check('nor the unseen servant, it has no block', summoning.some((s) => s.name === 'Unseen Servant'), false);
  check('a spell that calls nothing is not marked', summoning.some((s) => s.name === "Bigby's Hand"), false);
  check('nor a conjure of weapons', summoning.some((s) => s.name === 'Conjure Volley'), false);
  check('nor a polymorph', summoning.some((s) => s.name === 'True Polymorph'), false);
  check('the familiar names the beasts it brings', (book.spells.filter((s) => s.name === 'Find Familiar')[0].creatures || []).length, 11);
  check('a conjure names no creature at all', (book.spells.filter((s) => s.name === 'Conjure Animals')[0].creatures || []).length, 0);
  check('and the summon fey names the spirit it brings', (book.spells.filter((s) => s.name === 'Summon Fey')[0].creatures || []).join(', '), 'Fey Spirit');

  const features = JSON.parse(readFileSync(resolve(root, 'data', 'features.json'), 'utf8')).features;
  const classes = JSON.parse(readFileSync(resolve(root, 'data', 'classes.json'), 'utf8')).classes;
  check('a feature that brings a creature names it', (features.filter((f) => f.key === 'animatingPerformance')[0].creatures || []).join(', '), 'Dancing Item');
  check('and it says it summons', features.filter((f) => f.key === 'animatingPerformance')[0].summons, true);
  check('a feature that brings nothing does not', features.filter((f) => f.key === 'countercharm')[0].summons, false);

  /* What the character holds is the seed of the tab: the summons it can
     already call, the three of the bard and the five of the sorcerer. */
  const libraryOf = (rec) => {
    const out = [];
    const lists = rec.spells.lists || {};
    Object.keys(lists).forEach((lv) => (lists[lv] || []).forEach((n) => {
      const spell = book.spells.filter((x) => x.name === n)[0];
      if (spell && spell.summons) out.push(spell.name);
    }));
    (rec.char.features || []).forEach((f) => {
      const data = features.filter((x) => x.key === f.key)[0];
      if (data && data.creatures && data.creatures.length) out.push(data.name);
    });
    return out;
  };
  const bardRec = JSON.parse(readFileSync(resolve(root, 'test', 'fixtures', 'yngwie.json'), 'utf8')).record;
  const wendyRec = JSON.parse(readFileSync(resolve(root, 'test', 'fixtures', 'wendy.json'), 'utf8')).record;
  check('the bard calls three', libraryOf(bardRec).length, 3);
  check('the two spirits and the dancing item', libraryOf(bardRec).join(', '), 'Summon Fey, Summon Celestial, Animating performance');
  check('the sorcerer calls two', libraryOf(wendyRec).length, 2);
  check('the familiar and the objects', libraryOf(wendyRec).join(', '), 'Battle Familiar, Animate Objects');

  /* The page reads the same things, so it is run here with a character and
     a shell that answer, and what it offers is what the data says. */
  /* The feedback block is the real one, so a tap on a swing says the line the
     app says. */
  const fbCtx = vm.createContext({});
  vm.runInContext(harness.source('feedback.js'), fbCtx);
  const said = [];
  /* The dice the app draws, handed to the boxes the way the shell hands them. */
  const dieIcon = (sides) => {
    const pts = C.DIE_SHAPES[sides] || '';
    return '<svg viewBox="0 0 24 24"><polygon points="' + pts + '"/></svg>';
  };
  const dieBig = (sides, number) => {
    const lab = C.DIE_LABEL[sides] || { y: 15, size: 9 };
    let out = '<svg viewBox="0 0 24 24"><polygon points="' + C.DIE_SHAPES[sides] + '"/';
    if (number !== '' && number !== null && number !== undefined) {
      out += '<text x="12" y="' + lab.y + '" font-size="' + lab.size + '">' + number + '</text>';
    }
    return out + '</svg>';
  };
  const core = harness.coreStub({
    R: R, SR: C,
    feedback: fbCtx.SheetFeedback({ say: (t) => said.push(t) }),
    library: {
      book: book, bookByName: {},
      features: features, featureByKey: {},
      bestiary: { creatures: creatures },
      sourceTag: () => '',
      primaryAbility: () => 'cha',
      data: () => Promise.resolve(true),
      classInfo: (name) => classes.filter((c) => c.name === name)[0] || null,
      classRows: (ch) => (ch.classes || []).map((k) => {
        const info = classes.filter((c) => c.name === k.name)[0] || {};
        return { name: k.name, level: k.level, subclass: k.subclass || '', ability: info.ability, caster: info.caster, hd: info.hd };
      }),
      canonSource: (s) => s
    },
    chrome: {
      esc: (t) => String(t === undefined || t === null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      markup: (t) => String(t === undefined || t === null ? '' : t),
      field: () => '',
      renderBlocks: () => ''
    },
    exchange: {
      server: () => 'http://127.0.0.1:8123',
      readUrl: () => Promise.reject(new Error('no machine'))
    }
  });
  book.spells.forEach((s) => { core.library.bookByName[s.name] = s; });
  features.forEach((f) => { core.library.featureByKey[f.key] = f; });
  /* The attack box is the real one, drawn with the dice of this stub and with
     the one rendering of a roll the sheet has. */
  const boxCtx = vm.createContext({});
  vm.runInContext(harness.source('attackbox.js'), boxCtx);
  const summonBoxes = boxCtx.SheetAttackBox({
    dieBig: dieBig, dieIcon: dieIcon, esc: core.chrome.esc,
    roll: rollBlock(dieIcon)
  });
  core.horizontalAttackBox = summonBoxes.horizontal;
  core.verticalAttackBox = summonBoxes.vertical;
  const taken = {};
  taken.summons = harness.page('summons', { core: core, navigator: { vibrate: () => {} } });

  const fakeEl = () => {
    const el = {
      innerHTML: '', textContent: '', value: '', hidden: false, dataset: {},
      listeners: {},
      children: [],
      /* The shape the row block writes: a column count as a custom property,
         and the two classes a row carries while it is measured. */
      style: { setProperty: () => {}, removeProperty: () => {} },
      classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },

      /* An element keeps every listener of a kind, the way a browser does, so
         a page that adds one beside another still has both. */
      addEventListener: (kind, fn) => { (el.listeners[kind] = el.listeners[kind] || []).push(fn); },
      fire: (kind, ev) => { (el.listeners[kind] || []).forEach((fn) => fn(ev)); },
      querySelector: () => fakeEl(),
      querySelectorAll: () => [],
      closest: () => null,
      appendChild: (c) => { el.children.push(c); },
      click: () => { el.fire('click', { target: el }); }
    };
    return el;
  };
  /* The rebuild helpers of the shell, the way it hands them to a page: the
     paint of the cards, and the mark a handler leaves when it knows a card
     moved. The rest is the real one, so the uses it gives back are real. */
  const rbCtx = vm.createContext({});
  vm.runInContext(harness.source('rebuild.js'), rbCtx);
  const rebuild = rbCtx.SheetRebuild();
  const counterCtx = vm.createContext({});
  vm.runInContext(harness.source('counter.js'), counterCtx);
  const restCtx = vm.createContext({});
  vm.runInContext(harness.source('rest.js'), restCtx);
  const restOf = restCtx.SheetRest(counterCtx.SheetCounter());

  const page = fakeEl();
  const opened = [];
  const api = {
    character: () => bardRec,
    characters: () => ({ c1: bardRec }),
    state: { current: 'c1', ui: {} },
    save: () => {}, refresh: () => {}, toast: () => {},
    editing: () => false,
    wrench: () => fakeEl(),
    paint: (parts, fns) => rebuild.paint('summons', parts, fns),
    markDirty: (key) => rebuild.markDirty('summons', key),
    sheet: { open: (layer) => { opened.push(layer); }, search: () => '', close: () => {}, closeAll: () => {} },
    core: core
  };
  /* The elements of the page are kept by their selector, so the call page
     can be read after the plus is tapped. */
  const els = {};
  const fakeFor = (sel) => (els[sel] ? els[sel] : (els[sel] = fakeEl()));
  page.querySelector = (sel) => fakeFor(sel);
  taken.summons.mount(page, api);
  els['#callPanel'].hidden = true;
  els['#callSummon'].click();
  const call = els['#callList'].innerHTML || '';
  check('the plus opens the page that calls a creature', els['#callPanel'].hidden, false);
  check('and it draws the three of the bard', (call.match(/class="scard sdraft"/g) || []).length, 3);
  check('each card is the call itself', (call.match(/data-role="call"/g) || []).length, 3);
  check('and the slot of a summon runs from its level to the highest slot left',
    /--a:25\.0%;--b:62\.5%/.test(call), true);
  check('a card of the call page says nothing of a dismiss', /data-role="dismiss"/.test(call), false);
  check('and the list of the table is not opened by it', opened.length, 0);

  /* What a creature was called with last time comes back with it. */
  bardRec.summons.picks = { 'spell:Summon Fey|fey spirit': { slot: 4, form: 'mirthful' } };
  els['#callSummon'].click();
  const again = els['#callList'].innerHTML || '';
  check('the level picked last time comes back with the creature', /class="slv">4</.test(again), true);
  check('and the form picked last time is on', /class="sfpick on"[^>]*data-form="mirthful"/.test(again), true);
  bardRec.summons.picks = {};
  const seeded = taken.summons.seed({}, true);
  check('a new character holds no creature', seeded.list.length, 0);

  /* The numbers the book writes as words, and the forms a creature comes
     in. */
  const celestial = creatures['celestial spirit'];
  check('the celestial spirit comes in two forms', (celestial.forms || []).length, 2);
  const avenger = (celestial.forms || []).filter((f) => f.id === 'avenger')[0];
  const defender = (celestial.forms || []).filter((f) => f.id === 'defender')[0];
  check('the avenger has its own armour class', avenger.acTerms.branches[0].terms[0].const, 11);
  check('and the defender another', defender.acTerms.branches[0].terms[0].const, 13);
  check('the avenger shoots a bow', avenger.actions.map((a) => a.name).indexOf('Radiant Bow') >= 0, true);
  check('and the defender has no bow', defender.actions.map((a) => a.name).indexOf('Radiant Bow'), -1);
  check('the defender has a mace', defender.actions.map((a) => a.name).indexOf('Radiant Mace') >= 0, true);
  check('the multiattack is counted by the level', avenger.actions[0].count.half, true);
  check('the hit points grow with the slot', celestial.hpTerms.branches[0].terms[1].perLevelAbove, 10);
  check('and only above the fifth level', celestial.hpTerms.branches[0].terms[1].above, 5);
  check('the armour class grows with the slot too', avenger.acTerms.branches[0].terms[1].level, 1);
  check('the damage of the bow is two dice of six', avenger.actions[1].damageParts.dice.count, 2);
  check('and the slot is added to it', avenger.actions[1].damageParts.flat[1].level, 1);
  check('the dancing item takes the proficiency of the caster', creatures['dancing item'].actions[0].damageParts.flat[0].prof, 1);

  /* The attack of a creature: one roll per attack, the hit roll in its die,
     and nothing about the target, because the player does not know it. */
  const wizard = JSON.parse(readFileSync(resolve(root, 'test', 'fixtures', 'yngwie.json'), 'utf8')).record;
  wizard.pages = ['spells', 'features', 'summons'];
  wizard.summons = { list: [{
    id: 's1', name: 'Celestial Spirit', key: 'celestial spirit', form: 'avenger',
    slot: 5, hp: 40, spell: 'Summon Celestial', concentration: true,
    edit: { ac: '', hpMax: '', attacks: {} }, rolls: {}
  }] };
  const body = fakeEl();
  const list2 = fakeEl();
  /* The cards are built when the list is written again, so the number of
     writes is what a rebuild is counted by. */
  let builds = 0;
  Object.defineProperty(list2, 'innerHTML', {
    configurable: true,
    get: () => list2.text || '',
    set: (value) => { builds += 1; list2.text = value; }
  });
  const page2 = fakeEl();
  page2.call = fakeEl();
  page2.querySelector = (sel) => (sel === '#callSummon' ? page2.call
    : (sel === '#summonBody' ? body : (sel === '#summonList' ? list2 : fakeEl())));
  const api2 = Object.assign({}, api, {
    character: () => wizard,
    characters: () => ({ c1: wizard })
  });
  taken.summons.mount(page2, api2);
  /* The die of a swing is the tap that rolls it. */
  /* The tap lands on the die; the box the block hands back carries the swing,
     and the card around it names the summon. */
  const onDie = (name, ix) => {
    const box = { dataset: { name: name, ix: String(ix) },
      closest: (sel) => (sel === '.scard' ? { dataset: { id: 's1' } } : null) };
    return {
      closest: (sel) => {
        if (sel === '[data-role]') return { dataset: { role: 'roll', ix: String(ix) } };
        if (sel === '.sblock[data-name]') return box;
        if (sel === '.scard') return { dataset: { id: 's1' } };
        if (sel === '[data-name]') return { dataset: { name: name } };
        return null;
      }
    };
  };
  page2.fire('click', { target: onDie('Radiant Bow', 0) });
  const held = wizard.summons.list[0].rolls['Radiant Bow'];
  check('the swing holds one roll', held.length, 1);
  check('and the swing says what it gave in the one line',
    [/^Radiant Bow rolled \d+, \d+ damage/.test(said[said.length - 1] || ''), said.length > 0].join('/'),
    'true/true');
  check('the roll does not say whether it hit', held[0].hit, undefined);
  /* the d20 is a real roll, and a crit doubles the dice */
  check('the roll carries the dice of the bow', ['2d6', '4d6'].indexOf(held[0].groups[0].label) >= 0, true);
  check('and the slot is in the flat of the damage', held[0].flat, 7);
  page2.fire('click', { target: onDie('Radiant Bow', 1) });
  check('the second swing holds its own roll', wizard.summons.list[0].rolls['Radiant Bow'].length, 2);
  page2.fire('click', { target: onDie('Radiant Bow', 1) });
  check('and it is rolled again, not added to', wizard.summons.list[0].rolls['Radiant Bow'].length, 2);

  /* The block of a swing is the button, not only the die in it. */
  const onSwing = (name, ix) => {
    const box = { dataset: { name: name, ix: String(ix) },
      closest: (sel) => (sel === '.scard' ? { dataset: { id: 's1' } } : null) };
    return {
      closest: (sel) => {
        if (sel === '[data-open]' || sel === '[data-role]') return null;
        if (sel === '.sblock' || sel === '.sblock[data-name]') return box;
        if (sel === '.scard') return { dataset: { id: 's1' } };
        return null;
      }
    };
  };
  const beforeBlock = wizard.summons.list[0].rolls['Radiant Bow'][0];
  page2.fire('click', { target: onSwing('Radiant Bow', 0) });
  const afterBlock = wizard.summons.list[0].rolls['Radiant Bow'][0];
  check('a tap on the block of an attack rolls that swing', afterBlock !== beforeBlock, true);

  /* The hit points of a creature move with the buttons of the card. */
  const onHp = (role) => ({
    closest: (sel) => {
      if (sel === '[data-role]') return { dataset: { role: role } };
      if (sel === '.scard') return { dataset: { id: 's1' } };
      return null;
    }
  });
  const before = wizard.summons.list[0].hp;
  page2.fire('click', { target: onHp('hpup') });
  check('the hit point button moves the creature', wizard.summons.list[0].hp, before + 1);
  page2.fire('click', { target: onHp('hpdown') });
  check('and the other one takes it back', wizard.summons.list[0].hp, before);

  /* The hit point box of a creature opens empty with its value behind it,
     and a signed entry is a move rather than a set. */
  const hpBox = (hp) => {
    const el = { dataset: { role: 'hp' }, value: String(hp), placeholder: '' };
    el.closest = (sel) => (sel === '.scard' ? { dataset: { id: 's1' } }
      : (sel === '[data-role="hp"], [data-role="hpmax"]' || sel === '[data-role]' ? el : null));
    return el;
  };
  const hpOpen = hpBox(before);
  page2.fire('focusin', { target: hpOpen });
  page2.fire('input', { target: hpOpen });
  check('the hit point box opens empty', hpOpen.value, '');
  check('and the hit points sit in the background', hpOpen.placeholder, String(before));
  hpOpen.value = '-5';
  page2.fire('input', { target: hpOpen });
  check('a minus moves the creature hit points', wizard.summons.list[0].hp, before - 5);
  hpOpen.value = '12';
  page2.fire('input', { target: hpOpen });
  check('and a bare number sets them', wizard.summons.list[0].hp, 12);
  hpOpen.value = '-';
  page2.fire('input', { target: hpOpen });
  check('a half-typed entry leaves them alone', wizard.summons.list[0].hp, 12);
  page2.fire('focusout', { target: hpOpen });
  check('the box shows the value again when it is let go', hpOpen.value, '12');
  wizard.summons.list[0].hp = before;

  /* The wrench of the page is the flag the shell owns: on, the card of a
     creature holds the fields of its stats; off, it reads them. */
  api2.editing = () => true;
  taken.summons.render(api2);
  check('the edit mode turns the stats of a card into fields',
    list2.innerHTML.indexOf('data-role="ac"') >= 0, true);
  api2.editing = () => false;
  taken.summons.render(api2);
  check('and out of it the card reads them again',
    list2.innerHTML.indexOf('data-role="ac"'), -1);

  /* The key the cards are built from. A long rest gives the uses of a
     limited action back, and the card writes the uses into its own text, so
     the uses are part of the key and the next repaint builds the card again
     without a handler marking it. */
  wizard.summons.list[0].uses = { 'Healing Touch (1/Day)': { left: 0, max: 1 } };
  taken.summons.render(api2);
  check('the card says the uses are spent', /data-role="use"[^>]*>0\/1</.test(list2.innerHTML), true);
  const was = builds;
  restOf.rest('long', wizard);
  taken.summons.render(api2);
  check('a long rest builds the summon cards, because the uses are in the key', builds, was + 1);
  check('and the card says the use came back', /data-role="use"[^>]*>1\/1</.test(list2.innerHTML), true);

  /* A repaint that changes nothing keeps the cards, and a mark is what a
     handler says when it knows the card moved. */
  const still = builds;
  taken.summons.render(api2);
  check('a repaint that changes nothing builds nothing', builds, still);
  api2.markDirty('cards');
  taken.summons.render(api2);
  check('a mark builds the cards once', builds, still + 1);
  taken.summons.render(api2);
  check('and the mark is spent with that build', builds, still + 1);

  /* A creature that is called comes to the table with its hit points full. */
  wizard.summons.list.length = 0;
  const page3 = fakeEl();
  const els3 = {};
  page3.querySelector = (sel) => (els3[sel] ? els3[sel] : (els3[sel] = fakeEl()));
  const opened3 = [];
  const api3 = Object.assign({}, api, {
    character: () => wizard,
    characters: () => ({ c1: wizard }),
    sheet: { open: (layer) => { opened3.push(layer); }, search: () => '', close: () => {}, closeAll: () => {} }
  });
  taken.summons.mount(page3, api3);
  els3['#callPanel'].hidden = true;
  els3['#callSummon'].click();
  const call3 = els3['#callList'].innerHTML || '';
  check('the call page draws the three of the bard', (call3.match(/class="scard sdraft"/g) || []).length, 3);
  check('and opens no sheet of its own', opened3.length, 0);
  const chunk = call3.split('<div class="scard').filter((c) => c.indexOf('Celestial Spirit') >= 0)[0] || '';
  const cardId = (chunk.match(/data-id="([^"]+)"/) || [])[1];
  check('the celestial spirit is one of the cards', !!cardId, true);
  const onCall = (id) => ({
    closest: (s) => {
      if (s === '[data-open]') return null;
      if (s === '[data-role]') return { dataset: { role: 'call' } };
      if (s === '.scard') return { dataset: { id: id } };
      return null;
    }
  });
  page3.fire('click', { target: onCall(cardId) });
  check('the plus of a card brings the creature to the table', wizard.summons.list.length, 1);
  check('and it comes with its hit points full', wizard.summons.list[0].hp, 40);
  check('which are the hit points of the block', creatures['celestial spirit'].hpTerms.branches[0].terms[0].const, 40);
  check('and the call page is closed again', els3['#callPanel'].hidden, true);

  /* The stat block of a creature at the table shows the form it was called
     with: the kind the caster chose, the speed of that form and its own
     features. The fields are drawn here the way the shell draws them, since
     this core answers an empty string for them. */
  wizard.summons.list = [{
    id: 's2', name: 'Battle Familiar', key: 'battle familiar', form: 'brute',
    slot: 2, hp: 30, spell: 'Battle Familiar', concentration: false,
    edit: { ac: '', hpMax: '', attacks: {} }, rolls: {}
  }];
  const statCore = Object.assign({}, core, { chrome: Object.assign({}, core.chrome) });
  statCore.chrome.field = (label, value, cls, wide) => '<span class="f' + (wide ? ' wide' : '') +
    '"><span class="k">' + label + '</span><span class="v">' +
    (value === undefined || value === null || value === '' ? '-' : String(value)) + '</span></span>';
  const statPage = harness.page('summons', { core: statCore, navigator: { vibrate: () => {} } });
  const page4 = fakeEl();
  const opened4 = [];
  const api4 = Object.assign({}, api2, {
    sheet: { open: (layer) => { opened4.push(layer); }, search: () => '', close: () => {}, closeAll: () => {} },
    core: statCore
  });
  statPage.mount(page4, api4);
  const onStat = {
    closest: (sel) => (sel === '.scard' ? { dataset: { id: 's2' } }
      : (sel === '[data-role]' ? { dataset: { role: 'stat' } } : null))
  };
  page4.fire('click', { target: onStat });
  const brute = opened4[opened4.length - 1];
  check('the stat block of the creature opens on the tap of its name', brute.id, 'stat:battle familiar');
  check('and it wears the kind the caster chose', brute.tag, 'Medium Celestial, Fey, or Fiend');
  check('the form of the creature says its own speed', /walk 40 ft\., swim 30 ft\./.test(brute.meta), true);
  check('and not the fly of another form', /fly 30/.test(brute.meta), false);
  check('the features of the form are the ones it has', /Talented/.test(brute.text), true);
  check('and the one of another form is not there', /Flyby/.test(brute.text), false);
  wizard.summons.list[0].form = 'flyer';
  page4.fire('click', { target: onStat });
  const flyer = opened4[opened4.length - 1];
  check('another form flies', /fly 30 ft\. \(hover\)/.test(flyer.meta), true);
  check('and carries its own feature', /Flyby/.test(flyer.text), true);
  wizard.summons.list.length = 0;
}
console.log('the card of a list');
{
  /* The module is loaded the way the page loads it: its source in a context
     of its own, and the factory handed the layer and the escaper of the
     shell. */
  const cardSrc = harness.source('card.js');
  const cardCtx = vm.createContext({});
  vm.runInContext(cardSrc, cardCtx);
  const esc = (t) => String(t === undefined || t === null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const opened = [];
  const card = cardCtx.SheetCard({ open: (layer) => opened.push(layer) }, esc);

  /* The two dresses, byte for byte: the card of the book and the row of the
     characters, so the look cannot move under the module. */
  check('the card of a spell is one row, name, badge, chips and note',
    card.row({
      name: { text: 'Shield', aria: 'Read Shield' },
      badge: { text: '+', aria: 'Add Shield', data: { add: 'Shield' } },
      chips: [{ text: 'Wiz', title: 'Wizard', on: false, data: { cls: 'Wizard' } }],
      note: '1 reaction',
      data: { name: 'Shield' }
    }),
    '<div class="row" data-name="Shield"><div class="g1"><span class="gn tappable" aria-label="Read Shield">Shield</span>' +
    '<button type="button" class="gadd" data-add="Shield" aria-label="Add Shield">+</button></div><div class="g2">' +
    '<button type="button" class="gcls" data-cls="Wizard" title="Wizard" aria-label="Wizard, off">Wiz</button>' +
    '<span class="gs">1 reaction</span></div></div>');
  check('a chip that is on says so in its class and to a screen reader',
    card.row({ name: 'Shield', chips: [{ text: 'Wiz', title: 'Wizard', on: true, data: { cls: 'Wizard' } }] }),
    '<div class="row"><div class="g1"><span class="gn tappable">Shield</span></div><div class="g2">' +
    '<button type="button" class="gcls on" data-cls="Wizard" title="Wizard" aria-label="Wizard, on">Wiz</button>' +
    '<span class="gs"></span></div></div>');
  check('the card of a source carries the data the page picks it by',
    card.row({ name: { text: 'Summon Fey', aria: 'Call with Summon Fey' }, note: 'level 3 \u00b7 Fey Spirit', data: { src: 'spell:Summon Fey' } }),
    '<div class="row" data-src="spell:Summon Fey"><div class="g1"><span class="gn tappable" aria-label="Call with Summon Fey">' +
    'Summon Fey</span></div><div class="g2"><span class="gs">level 3 \u00b7 Fey Spirit</span></div></div>');
  check('the line of a character that is played, the name being the button',
    card.line({
      name: { text: 'Yngwie', aria: 'Play Yngwie' },
      meta: { text: 'level 11' },
      mark: 'playing',
      data: { id: 'c1' },
      action: { aria: 'Remove Yngwie', data: { del: 'c1' } }
    }),
    '<div class="crow"><button type="button" class="cn" data-id="c1" aria-label="Play Yngwie">Yngwie</button>' +
    '<span class="cl">level 11</span><span class="cm">playing</span>' +
    '<button type="button" class="cdel" data-del="c1" aria-label="Remove Yngwie">&times;</button></div>');
  check('a character that is not the one played carries no mark',
    card.line({ name: { text: 'Wendy', aria: 'Play Wendy' }, meta: { text: '' }, data: { id: 'c2' }, action: { aria: 'Remove Wendy', data: { del: 'c2' } } }),
    '<div class="crow"><button type="button" class="cn" data-id="c2" aria-label="Play Wendy">Wendy</button>' +
    '<span class="cl"></span><button type="button" class="cdel" data-del="c2" aria-label="Remove Wendy">&times;</button></div>');
  check('the line that is the control is the button itself',
    card.line({ name: { text: 'From a file' }, data: { intake: 'file' }, pick: true }),
    '<div class="crow" role="button" tabindex="0" data-intake="file"><span class="cn">From a file</span></div>');
  check('and it can carry a note that is filled later',
    card.line({ name: { text: 'Yngwie' }, meta: { text: '', data: { classes: '1' } }, data: { shelf: 'https://raw/x.json' }, pick: true }),
    '<div class="crow" role="button" tabindex="0" data-shelf="https://raw/x.json"><span class="cn">Yngwie</span>' +
    '<span class="cl" data-classes="1"></span></div>');
  check('a row is the control or it holds one, never both', (() => {
    try { card.line({ name: 'X', pick: true, action: { aria: 'Remove X', data: { del: 'c1' } } }); return 'no error'; }
    catch (e) { return e.message; }
  })(), 'a line is the control or it holds one, not both');

  /* The layer: the rows, the search and the rest of the layer pass through,
     and the pick of a row is its dataset. */
  const rows = card.line({ name: { text: 'From a file' }, data: { intake: 'file' }, pick: true });
  card.list({
    id: 'intake',
    title: 'A character',
    metaClass: 'sheet-meta one',
    meta: '<span>What brings it</span>',
    rows: rows,
    search: true,
    actions: [{ label: 'Fetch' }],
    level: true,
    levelLabel: 'Level 1',
    onPick: () => {}
  });
  check('a list opens one layer', opened.length, 1);
  check('the layer keeps its id, so the same list replaces itself', opened[0].id, 'intake');
  check('and the rows are its list', opened[0].list, rows);
  check('the search, the actions and the level filter pass through',
    [opened[0].search, opened[0].actions.length, opened[0].level, opened[0].levelLabel].join('/'), 'true/1/true/Level 1');
  check('the list has no rows key of its own', opened[0].rows === undefined, true);

  const got = [];
  card.list({ id: 'probe', title: 'Probe', rows: '', onPick: (dataset, ev) => got.push([dataset, !!ev]) });
  const click = (hits) => opened[opened.length - 1].onList({ target: { closest: (sel) => (hits[sel] ? { dataset: hits[sel] } : null) } });
  click({ '.gcls': { cls: 'Bard' } });
  check('a chip hands back the chip', JSON.stringify(got[0][0]), '{"cls":"Bard"}');
  click({ '.gadd': { add: 'Shield' } });
  check('the badge hands back the badge', JSON.stringify(got[1][0]), '{"add":"Shield"}');
  click({ 'button.cn': { id: 'c1' } });
  check('the name of a row that holds its action hands back the row', JSON.stringify(got[2][0]), '{"id":"c1"}');
  click({ '.cdel': { del: 'c1' } });
  check('and the delete hands back the delete', JSON.stringify(got[3][0]), '{"del":"c1"}');
  click({ '.crow[role="button"]': { intake: 'file' } });
  check('the line that is the control hands back the row', JSON.stringify(got[4][0]), '{"intake":"file"}');
  click({ '.row': { name: 'Shield' } });
  check('the card hands back the row', JSON.stringify(got[5][0]), '{"name":"Shield"}');
  click({});
  check('and the padding of a row that is not the control picks nothing', got.length, 6);
  check('the page is handed the event as well', got[0][1], true);

  /* The module travels with the page, and the section above drove it with a
     stub layer, so the shell's wiring is the walk's business. */
  check('the card travels with the page', harness.built().html.indexOf('root.SheetCard = function') >= 0, true);
}

console.log('the drag of a list');
{
  /* The module is loaded the way the page loads it, and its pure half is
     checked without a document. */
  const dragSrc = harness.source('drag.js');
  const dragCtx = vm.createContext({});
  vm.runInContext(dragSrc, dragCtx);
  const D = dragCtx.SheetDrag();
  check('the drag hands a page the gesture and its placement',
    [typeof D.list, typeof D.place].join('/'), 'function/function');
  check('the hold is 320 ms and the slop 8 px', [D.HOLD, D.SLOP], [320, 8]);

  /* The rule of a list: the first vertical middle below the point, or the
     end of the list. */
  const rows = [
    { top: 0, bottom: 20, left: 0, right: 100 },
    { top: 20, bottom: 40, left: 0, right: 100 },
    { top: 40, bottom: 60, left: 0, right: 100 }
  ];
  check('a point above the middle of the first row goes first',
    D.place(rows, { x: 10, y: 5 }, 'list'), { index: 0, before: true });
  check('a point between two rows goes below the first of them',
    D.place(rows, { x: 10, y: 25 }, 'list'), { index: 1, before: true });
  check('a point below the last row goes at the end',
    D.place(rows, { x: 10, y: 90 }, 'list'), { index: 3, before: true });

  /* The rule of a grid: the nearest centre, and the side of it. */
  const cells = [
    { top: 0, bottom: 40, left: 0, right: 100 },
    { top: 0, bottom: 40, left: 100, right: 200 }
  ];
  check('the nearest row of the grid wins', D.place(cells, { x: 30, y: 20 }, 'grid').index, 0);
  check('a point left of its centre goes before it', D.place(cells, { x: 30, y: 20 }, 'grid').before, true);
  check('a point right of its centre goes after it', D.place(cells, { x: 70, y: 20 }, 'grid').before, false);
  check('and the other row is placed by its own centre',
    D.place(cells, { x: 170, y: 20 }, 'grid'), { index: 1, before: false });

  /* The rule of a swipe: far enough across, and flatter than it is tall. */
  check('a move to the left is a swipe left', D.swipe({ x: 300, y: 120 }, { x: 180, y: 124 }), -1);
  check('a move to the right is a swipe right', D.swipe({ x: 120, y: 120 }, { x: 260, y: 118 }), 1);
  check('a move that is too short is no swipe', D.swipe({ x: 300, y: 120 }, { x: 270, y: 120 }), 0);
  check('and a move down the page is a scroll', D.swipe({ x: 300, y: 120 }, { x: 220, y: 300 }), 0);

  /* The move up and down the strip is gone: it fought the scroll of the
     page. */
  check('no move up or down turns the page', typeof D.swipeY, 'undefined');

  /* The step of the strip's grid: one column inside the row, or one row at
     the same column, with the columns and the rows wrapping and a short
     target row falling back to its last column. */
  const grid = [
    ['character', 'volley', 'spells'],
    ['features', 'summons']
  ];
  check('the grid step sits beside the placement and the swipe', typeof D.step, 'function');
  check('a sideways step moves one column and wraps within the row',
    [D.step(grid, 'character', 1, 0), D.step(grid, 'spells', 1, 0), D.step(grid, 'character', -1, 0)],
    ['volley', 'character', 'spells']);
  check('a step down keeps the column and wraps the rows',
    [D.step(grid, 'character', 0, 1), D.step(grid, 'features', 0, 1), D.step(grid, 'summons', 0, -1)],
    ['features', 'character', 'volley']);
  check('a row move onto a short row falls back to its last column',
    [D.step(grid, 'spells', 0, 1), D.step(grid, 'spells', 0, -1)], ['summons', 'summons']);
  check('and a step from a page the layout does not hold goes nowhere',
    [D.step(grid, 'settings', 1, 0), D.step(grid, 'settings', 0, 1)], ['', '']);

  check('the strip placement is gone with the strip', typeof D.stripPlace, 'undefined');

  /* The module travels with the page; the gesture itself is driven above. */
  check('the drag travels with the page', harness.built().html.indexOf('root.SheetDrag = function') >= 0, true);
}

console.log('the bar');
{
  /* The bar at the bottom names every page by an icon and a word: one row of
     four pages and More, or two rows of every page. The order is the
     player's, matched against the pages on every read. The shell runs in no
     suite, so these are tripwires on its own text; the smoke test drives the
     bar in Chromium and the walk carries the pixels. */
  const shell = harness.source('shell.js');
  const page = harness.source('index.html');
  const settingsSrc = harness.source('pages/settings.js');
  check('the strip of tabs is gone',
    [page.indexOf('id="tabStrip"') < 0, page.indexOf('.tablist{') < 0, shell.indexOf('function tabRows') < 0].join('/'),
    'true/true/true');
  check('the bar sits at the bottom of the app, under the pages',
    page.indexOf('<nav class="bar" id="bar" aria-label="Pages"></nav>') > page.indexOf('<div class="views" id="views">'), true);
  check('one row holds four pages and More, two rows every page',
    [shell.indexOf('var BAR_ROW = 5;') >= 0,
      shell.indexOf('if (barRows() === 2 || order.length <= BAR_ROW) return { shown: order, more: [] };') >= 0,
      shell.indexOf('return { shown: order.slice(0, BAR_ROW - 1), more: order.slice(BAR_ROW - 1) };') >= 0].join('/'),
    'true/true/true');
  check('the order is matched against the pages on every read, so it goes stale safely',
    [shell.indexOf('if (ids.indexOf(id) >= 0 && !seen[id]) { seen[id] = true; out.push(id); }') >= 0,
      shell.indexOf('ids.forEach(function (id) { if (!seen[id]) out.push(id); });') >= 0].join('/'), 'true/true');
  check('the rows of the old strip are read once as an order',
    [shell.indexOf('if (!saved && ui.tabs) saved = [].concat.apply([], ui.tabs);') >= 0,
      shell.indexOf('delete ui.tabs;') >= 0].join('/'), 'true/true');
  check('More is the page on screen when the page is under it',
    shell.indexOf('var here = b.dataset.more ? inMore : b.dataset.page === current;') >= 0, true);
  check('every page brings its own icon, and a page without one gets a square',
    [harness.source('pages/volley.js').indexOf("glyph: 'M13 2 4 14h7l-1 8 9-12h-7z'") >= 0,
      shell.indexOf("var GLYPH_PAGE = 'M5 5h14v14H5z';") >= 0,
      harness.source('block.js').indexOf("glyph: typeof p.glyph === 'string' ? p.glyph : ''") >= 0].join('/'), 'true/true/true');
  check('an icon is a path and nothing else',
    shell.indexOf("/^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\\-]+$/.test(p.glyph)") >= 0, true);
  check('the More sheet docks at the bottom, every page a tile the hold carries',
    [shell.indexOf("id: 'more',") >= 0, shell.indexOf('dock: true,') >= 0,
      shell.indexOf("row: '.mtile',") >= 0].join('/'), 'true/true/true');
  check('the bar is carried along too, More staying put',
    shell.indexOf("row: '.baritem:not(.barmore)',") >= 0, true);
  check('a swipe walks every page of the order, More\'s included',
    shell.indexOf('return [barOrder()];') >= 0, true);
  check('the settings carry one control for the bar: one row or two',
    [settingsSrc.indexOf('<span class="t">Bar</span>') >= 0,
      settingsSrc.indexOf("api.setBarRows(Number(b.dataset.rows));") >= 0,
      settingsSrc.indexOf('min="1" max="3" step="1"') < 0].join('/'), 'true/true/true');
  check('the shell keeps the rows of the bar in the ui',
    [shell.indexOf('function barRows()') >= 0, shell.indexOf("state.ui.barRows = Number(count) === 2 ? 2 : 1;") >= 0].join('/'),
    'true/true');
  check('the line that says a spend rises above the bar',
    [page.indexOf('var(--bar-h, 0px) + 8px') >= 0, shell.indexOf("setProperty('--bar-h'") >= 0].join('/'), 'true/true');
}

console.log('the style of a page lives with the page');
{
  /* A page carries its own look, the shell carries what it paints, and a
     page's rule is anchored on a class that page writes. That is what keeps
     a page from styling another page's element by accident. */
  const read = (f) => harness.source(f);
  const ids = ['character', 'volley', 'spells', 'features', 'summons', 'equipment', 'image', 'backstory', 'attack', 'settings'];

  /* The pages are loaded the way the app loads them, so what is checked is
     the style each one registers and not the text of its file. The cast block
     is the real one, because its markup is what the checks below read. */
  const castCtx = vm.createContext({});
  vm.runInContext(harness.source('cast.js'), castCtx);
  const toggleCtx = vm.createContext({});
  vm.runInContext(harness.source('toggle.js'), toggleCtx);
  const styleCore = harness.coreStub({
    R: R, SR: C,
    chrome: { sectionHead: () => '', restIcon: () => '' },
    library: { data: () => null, seeds: {}, featureByKey: {} },
    exchange: { shelf: null },
    rest: { track: () => {} },
    cast: castCtx.SheetCast(),
    toggle: toggleCtx.SheetToggle()
  });
  const specs = {};
  ids.forEach((id) => { specs[id] = harness.page(id, { core: styleCore }); });
  check('every page registers', ids.filter((id) => !!specs[id]).length, 10);
  check('and each one carries its own style',
    ids.filter((id) => specs[id] && typeof specs[id].css === 'string' && specs[id].css.length > 0).length, 10);

  const rulesOf = (css) => {
    const out = [];
    const no = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(no))) out.push({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] });
    return out;
  };
  const classesOf = (sel) => {
    const out = [];
    const re = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g;
    let m;
    while ((m = re.exec(sel))) out.push(m[1]);
    return out;
  };
  /* The classes of the compound a rule hangs off: the one that decides what
     the rule can reach. */
  const leadOf = (sel) => {
    const out = [];
    sel.split(',').forEach((one) => {
      const lead = one.trim().split(/[\s>+~]+/)[0] || '';
      classesOf(lead).forEach((c) => out.push(c));
    });
    return out;
  };
  /* What a file writes: a class attribute, a classList call, a className,
     and a piece of a class list such as ' on'. */
  const written = (text) => {
    const set = new Set();
    let m;
    const one = /class=(?:\\?["'])([^"'\\]*)/g;
    while ((m = one.exec(text))) m[1].split(/\s+/).forEach((t) => { if (/^-?[A-Za-z_][A-Za-z0-9_-]*$/.test(t)) set.add(t); });
    const two = /classList\.(?:add|remove|toggle|contains)\(\s*'([^']+)'/g;
    while ((m = two.exec(text))) m[1].split(/\s+/).forEach((t) => set.add(t));
    const three = /className\s*=\s*'([^']+)'/g;
    while ((m = three.exec(text))) m[1].split(/\s+/).forEach((t) => set.add(t));
    /* A class can be written in a piece, the way a conditional class is:
       ' on', ' hidden'. A bare quoted word is not one, or a single letter
       of the code would read as a class. */
    const piece = /['"] ([A-Za-z_][A-Za-z0-9_-]*)['"]/g;
    while ((m = piece.exec(text))) set.add(m[1]);
    return set;
  };
  const writes = { shell: written(read('shell.js') + read('card.js') + read('cast.js') + read('slider.js') + read('attackbox.js') + read('toggle.js') + read('roll.js') + html.slice(html.indexOf('</style>'))) };
  ids.forEach((id) => { writes[id] = written(read('pages/' + id + '.js')); });

  const leaks = [];
  ids.forEach((id) => {
    rulesOf(specs[id].css).forEach((rule) => {
      leadOf(rule.sel).forEach((cls) => {
        const others = ids.filter((q) => q !== id && writes[q].has(cls));
        if (others.length && !writes[id].has(cls)) leaks.push(id + ' ' + rule.sel);
      });
    });
  });
  check('no page styles a class only another page writes', [...new Set(leaks)].join(' | '), '');

  /* The shell keeps the settings rows and the rule about the finger, which
     names the classes it turns the selection off for. */
  const settings = new Set(['srow', 'stog', 'sico']);
  const shellCss = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const strays = [];
  rulesOf(shellCss).forEach((rule) => {
    if (rule.body.indexOf('user-select') >= 0) return;
    /* The field block is painted by core.field, so a page hands it a class
       and the shell styles it: that is the one block that works backwards. */
    if (/^\.f(\s|,|:|\.|$)/.test(rule.sel)) return;
    classesOf(rule.sel).forEach((cls) => {
      const who = ids.filter((id) => writes[id].has(cls));
      if (who.length === 1 && !writes.shell.has(cls) && !settings.has(cls)) strays.push(cls + ' (' + who[0] + ')');
    });
  });
  check('the shell styles no class of one page, save the settings rows', [...new Set(strays)].join(' | '), '');

  /* The blocks more than one page paints stay with the shell. */
  const shared = ['.f{', '.f .k{', '.mini{', '.empty{', '.row', '.crow{', '.sheet-search{', '.cshead{', '.srcline{', '.castbar{', '.castbtn{', '.lvlrow{', '.lvlrange{', '.sblock{', '.satkgrid{', '.chiprow{'];
  check('the shell keeps the blocks more than one page paints', shared.filter((s) => shellCss.indexOf(s) < 0), []);
  /* And the rules a page owns are in that page, not in the shell. */
  const moved = ['.hpstrip{', '.slotstrip{', '.fcard{', '.updblock{', '.csname{', '.cname-btn'];
  check('the shell no longer styles the pages', moved.filter((s) => shellCss.indexOf(s) >= 0), []);
  check('the character page carries its own rules', rulesOf(specs.character.css).length > 90, true);
  check('the look moved to the settings, with its own rules',
    [specs.settings.css.indexOf('.gcell') >= 0, specs.settings.html.indexOf('settingsThemes') >= 0,
      specs.settings.html.indexOf('settingsIcons') >= 0].join('/'), 'true/true/true');
  check('and left the character page',
    [specs.character.html.indexOf('charThemes') < 0, specs.character.html.indexOf('charIcons') < 0,
      specs.character.css.indexOf('.gcell') < 0].join('/'), 'true/true/true');
  check('the skills fill the first column before the second',
    [specs.character.css.indexOf('grid-auto-flow:column') >= 0,
      specs.character.css.indexOf('grid-template-rows:repeat(9,auto)') >= 0].join('/'), 'true/true');
  check('the spells page too', rulesOf(specs.spells.css).length > 70, true);
  check('the features page too', rulesOf(specs.features.css).length > 40, true);
  check('and the settings page carries the update block', specs.settings.css.indexOf('.updblock') >= 0, true);
  /* The update is the section the settings opens on. */
  check('the update section is the first of the settings',
    specs.settings.html.indexOf('settingsUpdate') < specs.settings.html.indexOf('settingsList'), true);
  /* The cast button is one block, in the volley's look, at the bottom of a
     page that casts: both pages get it from the shell, and neither styles it. */
  check('the cast button is the shell\'s block',
    [specs.volley.html.indexOf('class="castbtn"') >= 0, specs.attack.html.indexOf('class="castbtn"') >= 0,
      specs.volley.css.indexOf('.castbtn') < 0, specs.attack.css.indexOf('.castbtn') < 0].join('/'),
    'true/true/true/true');
  check('the volley asks for its second cast too',
    specs.volley.html.indexOf('class="castbtn castbtn-quick"') >= 0, true);
  check('the attack page puts its cast button below the result',
    specs.attack.html.indexOf('id="atkCast"') > specs.attack.html.indexOf('id="atkBody"'), true);
  /* The text selection is off for the whole app, so a card of any page,
     one written tomorrow included, is held without a selection; no page
     turns it back on for a card of its own. */
  const appRule = (shellCss.match(/\.app\{[^}]*\}/) || [''])[0];
  check('the held and dragged cards of every page select nothing',
    [/user-select:none/.test(appRule),
      ids.filter((id) => /user-select:text/.test(specs[id].css || '')).length].join('/'), 'true/0');
}

console.log('what a page may contribute');
{
  /* The block holds the registries a page brings things to: a data file and
     what it fills, a theme, an icon, and the page itself. */
  const blockSrc = harness.source('block.js');
  const bctx = vm.createContext({});
  vm.runInContext(blockSrc, bctx);
  const block = bctx.SheetBlock();

  check('a page joins the registry', block.page({ id: 'one', title: 'One' }).order, 0);
  check('the second one sits after it', block.page({ id: 'two' }).order, 1);
  check('two pages may not want the same id', (() => {
    try { block.page({ id: 'one' }); return 'no error'; } catch (e) { return e.message; }
  })(), 'two pages want the id one');
  check('the pages a character starts with are the ones that say so',
    (block.page({ id: 'three', on: true }), block.defaults()), ['three']);

  /* A page of a package carries every key a page may carry, with the rules
     compiled, and it replaces the page it is named after. */
  const plugin = block.plugin({
    id: 'one',
    title: 'One of a package',
    blurb: 'From a package.',
    order: 7,
    html: '<div id="p"></div>',
    css: '#p{color:red}',
    hidden: true,
    home: true,
    tab: 'P',
    slice: 'pkg',
    mount: 'function (root) { root.mounted = true; }',
    render: 'function (a) { return a ? 1 : 0; }',
    seed: 'function (s, fresh, rec) { s.visits = (s.visits || 0) + 1; return s; }',
    head: 'function (root) { return root; }'
  });
  check('a page of a package keeps its place, its slice and its marks',
    [plugin.order, plugin.slice, plugin.hidden, plugin.home, plugin.tab].join('/'), '7/pkg/true/true/P');
  check('its mount is a function that runs', (() => { const root = {}; plugin.mount(root); return root.mounted; })(), true);
  check('its seed fills the slice it owns', plugin.seed({}).visits, 1);
  check('and its head is a function too', typeof plugin.head, 'function');
  check('a page of a package never takes the place of a page of the app', (() => {
    try { block.page(plugin); return 'no error'; } catch (e) { return e.message; }
  })(), 'a package page cannot take the place of the page one');
  check('and the page of the app is still there', block.pages().filter((p) => p.id === 'one')[0].title, 'One');
  const first = block.plugin({ id: 'pkgOnly', title: 'First of a package' });
  block.page(first);
  check('a page of a package replaces the package page it is named after',
    block.page(block.plugin({ id: 'pkgOnly', title: 'Second of a package' })).title, 'Second of a package');
  check('and the registry still holds one of it', block.pages().filter((p) => p.id === 'pkgOnly').length, 1);
  check('a page leaves the registry', [block.remove('pkgOnly').title, block.pages().some((p) => p.id === 'pkgOnly')].join('/'),
    'Second of a package/false');
  check('and a page that is not there leaves nothing', block.remove('nothing'), null);
  check('the same package is known as the same', first.source, block.plugin({ id: 'pkgOnly', title: 'First of a package' }).source);

  /* A page whose code does not compile says why, rather than painting nothing. */
  const broken = block.plugin({ id: 'broken', mount: 'function (root) { root.x = ; }', render: '42' });
  check('a page that does not compile carries the reason',
    [broken.error.indexOf('mount: ') === 0, broken.error.indexOf('render: it is not a function') >= 0].join('/'), 'true/true');
  check('and still has a mount that runs', typeof broken.mount, 'function');
  check('a page that compiles carries no reason', plugin.error, '');

  /* A file a page brings: the page says how the file fills its shape, and
     the loader asks the block. */
  const got = [];
  block.data('tables', (value) => got.push(value.rows));
  check('the block holds the shape a page declared', block.shaped(), ['tables']);
  check('and fills it when the file arrives', block.fill('tables', { rows: 3 }), true);
  check('the shape was handed the file', got[0], 3);
  check('a file no page declared is dropped', block.fill('nothing', {}), false);

  /* A theme and an icon join the gallery, and the one that is already there
     is replaced rather than listed twice. */
  check('a theme joins the list', block.theme({ id: 'probe', label: 'Probe' }).label, 'Probe');
  block.theme({ id: 'probe', label: 'Probe again' });
  check('and a second one of the same id replaces it', [block.themes().length, block.themes()[0].label].join('/'), '1/Probe again');
  check('a theme needs an id', (() => { try { block.theme({ label: 'no id' }); return 'no error'; } catch (e) { return e.message; } })(), 'a theme needs an id');
  check('an icon joins the map', block.icon({ id: 'probeIcon', label: 'Probe' }).id, 'probeIcon');
  check('and the map is what the gallery reads', Object.keys(block.icons()), ['probeIcon']);

  /* A page brings the colours and the icons it paints with, and a package
     carries them with the page that brought them. */
  const look = block.plugin({
    id: 'lookPage',
    themes: [{ id: 'pkgTheme', label: 'Package theme', vars: { void: '#010203', '--arcane': '#040506' } }],
    icons: [{ id: 'pkgIcon', label: 'Package icon', svg: '<path d="M4 4h16v16H4Z"/>' }]
  });
  check('a page of a package carries its look', [look.themes.length, look.icons.length].join('/'), '1/1');
  block.page(look);
  check('and joining registers the theme', block.themes().some((t) => t.id === 'pkgTheme'), true);
  check('and the icon', Object.keys(block.icons()).indexOf('pkgIcon') >= 0, true);
  check('a theme that brings its colours is a rule for the body',
    block.themeRule({ id: 'pkgTheme', vars: { void: '#010203', '--arcane': '#040506' } }),
    'body[data-theme="pkgTheme"]{--void:#010203;--arcane:#040506;}');
  check('a theme the app ships has its rule in the page', block.themeRule({ id: 'blueRed' }), '');
  check('and a theme with no colours asks for no rule', block.themeRule({ id: 'plain' }), '');
  check('a lazy spec still paints a cell in the gallery',
    [block.theme({ id: 'lazy' }).label, block.theme({ id: 'lazy' }).swatch.length].join('/'), 'lazy/3');
  check('a lazy icon still has a label and a body',
    [block.icon({ id: 'lazyIcon' }).label, block.icon({ id: 'lazyIcon' }).svg].join('/'), 'lazyIcon/');
  check('a theme id cannot leave the css', (() => {
    try { block.theme({ id: 'x"}body{display:none' }); return 'no error'; } catch (e) { return e.message; }
  })(), 'a theme id is letters, digits, dash and underscore');

  /* The four files of the app are declared by the pages that read them, so
     the loader carries no list of names. */
  const declared = {};
  ['character', 'spells', 'features', 'summons'].forEach((id) => {
    const calls = [];
    const core = harness.coreStub({
      R: R, SR: C,
      chrome: { sectionHead: () => '', restIcon: () => '' },
      library: {
        data: (name, shape) => { calls.push([name, typeof shape]); return null; },
        seeds: {}, featureByKey: {}
      }
    });
    harness.page(id, { core: core });
    declared[id] = calls;
  });
  check('the character page declares the classes, the species and the rules of making one', declared.character.map((c) => c.join(' ')), ['species function', 'rules function', 'classes function']);
  check('the spells page declares the book', declared.spells.map((c) => c.join(' ')), ['spellbook function']);
  check('the features page declares the library and the feats', declared.features.map((c) => c.join(' ')), ['features function', 'feats function']);
  check('the summons page declares the bestiary', declared.summons.map((c) => c.join(' ')), ['bestiary function']);

  /* What the loader reads and what the shell holds are the checks above and
     the record's pagesOn checks. A theme a page brings is the block section's
     business, and the gallery is the walk's. */
  check('the block travels with the page', harness.built().html.indexOf('root.SheetBlock = function') >= 0, true);
}

console.log('the counter of a limited resource');
{
  /* One module over the record: a feature's uses, a spell slot, the pact
     slots, the sorcery points and the uses of a summon are counted the same
     way, and no page reads the fields by hand. */
  const counterSrc = harness.source('counter.js');
  const cctx = vm.createContext({});
  vm.runInContext(counterSrc, cctx);
  const counter = cctx.SheetCounter();

  const fixture = () => ({
    char: {
      features: [
        { key: 'bardic', name: 'Bardic inspiration', max: 5, left: 5, short: null, recovery: 'short', bind: null, cost: '' },
        { key: 'pact', name: 'Warlock spell slots', max: 2, left: 2, short: null, recovery: 'short', bind: 'warlock', cost: '' },
        { key: 'bend', name: 'Bend luck', max: 0, left: 0, recovery: 'sp', bind: null, cost: 'sp' },
        { key: 'trick', name: 'Trickster', max: 3, left: 1, short: 2, recovery: 'short', bind: null, cost: '' },
        { key: 'dawn', name: 'At dawn', max: 3, left: 1, short: null, recovery: 'long', bind: null, cost: '' }
      ]
    },
    spells: { left: { 1: 4, 2: 3 }, max: { 1: 4, 2: 3 }, warlockLeft: 2, warlockMax: 2, warlockLevel: 2, sp: 8, spMax: 8 },
    summons: { list: [{ id: 's1', uses: { 'Healing Touch (2/Day)': { left: 2, max: 2 } } }] }
  });

  /* What is left, read one way. */
  const rec = fixture();
  check('a feature reads its own uses', counter.counterOf(rec, 'feature:bardic'), { left: 5, max: 5 });
  check('a feature bound to the pact reads the pact slots', counter.counterOf(rec, 'feature:pact'), { left: 2, max: 2 });
  check('a spell slot reads its level', counter.counterOf(rec, 'slot:1'), { left: 4, max: 4 });
  check('the sorcery points read as a counter', counter.counterOf(rec, 'sp'), { left: 8, max: 8 });
  check('a use of a summon reads as one too', counter.counterOf(rec, 'summon:s1:Healing Touch (2/Day)'), { left: 2, max: 2 });
  check('and a counter the record does not hold is null', counter.counterOf(rec, 'feature:nope'), null);

  /* Spending one. */
  check('a use is spent', counter.spend(rec, 'feature:bardic').left, 4);
  check('the record holds the spend', rec.char.features[0].left, 4);
  const pact = counter.spend(rec, 'slot:2');
  check('a slot of the pact level pays the pact slot first', [pact.paid, rec.spells.warlockLeft, rec.spells.left[2]].join('/'), 'warlock/1/3');
  check('and an ordinary slot pays itself', counter.spend(rec, 'slot:1').left, 3);
  check('the sorcery point is a counter of its own', counter.spend(rec, 'sp').left, 7);
  check('a feature that costs a sorcery point pays that', (() => {
    const out = counter.spend(rec, 'feature:bend');
    return [out.ok, out.paid, rec.spells.sp].join('/');
  })(), 'true/sp/6');
  check('the feature itself was not spent', rec.char.features[2].left, 0);

  const empty = fixture();
  empty.char.features[0].left = 0;
  check('an empty counter does not spend', counter.spend(empty, 'feature:bardic'), { ok: false, why: 'empty', left: 0, max: 5 });
  const dry = fixture();
  dry.spells.sp = 0;
  check('a cost with no sorcery point left says so', counter.spend(dry, 'feature:bend').why, 'no sorcery point');

  /* What a rest gives back. */
  const short = fixture();
  check('a short rest fills a feature that comes back on one', counter.refill(short, 'feature:bardic', 'short').left, 5);
  check('and gives what the feature says it gives', counter.refill(short, 'feature:trick', 'short').left, 3);
  check('a long rest feature is left alone by a short one', counter.refill(short, 'feature:dawn', 'short').left, 1);
  check('a short rest fills the pact slots', counter.refill(short, 'warlock', 'short').left, 2);
  check('a short rest leaves the spell slots', counter.refill(short, 'slot:1', 'short').left, 4);
  check('and the sorcery points', counter.refill(short, 'sp', 'short').left, 8);

  const long = fixture();
  long.spells.left[1] = 0;
  check('a long rest fills a slot', counter.refill(long, 'slot:1', 'long').left, 4);
  check('and the sorcery points', counter.refill(long, 'sp', 'long').left, 8);
  check('and a feature that comes back at dawn', counter.refill(long, 'feature:dawn', 'long').left, 3);
  check('and the uses of a summon', counter.refill(long, 'summon:s1:Healing Touch (2/Day)', 'long').left, 2);

  /* A counter put at a number stays inside its own bounds. */
  check('a counter cannot go over its max', counter.set(rec, 'slot:1', 99).left, 4);
  check('and never under zero', counter.set(rec, 'slot:1', -3).left, 0);
  check('a summon use is set the same way', counter.set(rec, 'summon:s1:Healing Touch (2/Day)', 1).left, 1);

  /* Every counter the record holds, so a rest can walk them. */
  check('the record names every counter it holds',
    counter.keys(fixture()).join(' | '),
    'feature:bardic | feature:pact | feature:bend | feature:trick | feature:dawn | slot:1 | slot:2 | warlock | sp | summon:s1:Healing Touch (2/Day)');

  /* The counter travels with the page. The pages reach it through the core
     guard above, and the module's checks here drive the real function. */
  check('the counter travels with the page', harness.built().html.indexOf('root.SheetCounter = function') >= 0, true);
}

console.log('the record of a character');
{
  /* One module for the shape of a character: the store and its two old
     shapes, the slices the pages own, the seeds, and the package. */
  const recordSrc = harness.source('record.js');
  const rctx = vm.createContext({});
  vm.runInContext(recordSrc, rctx);

  /* A block of pages, the way the shell hands one over. */
  const pages = [
    { id: 'character', slice: 'char', seed: (s, fresh, rec) => Object.assign({}, s, { name: 'seeded', features: (rec.features || []).length }) },
    { id: 'features', seed: (s, fresh, rec) => [{ key: 'a', saw: rec.char ? rec.char.name : 'nothing' }] },
    { id: 'spells', slice: 'spells', seed: (s) => Object.assign({}, s, { left: { 1: 4 } }) },
    { id: 'summons', slice: 'summons', seed: (s) => Object.assign({}, s, { list: s.list || [] }) }
  ];
  const block = { pages: () => pages, defaults: () => ['spells'] };
  const record = rctx.SheetRecord(block);

  check('a page owns the slice it names, or its own id',
    [record.keyOf(pages[0]), record.keyOf(pages[1]), record.keyOf({})].join('/'), 'char/features/');

  /* The two first versions of the store, moved on. */
  const first = record.migrate({ power: 'eb', advantage: true, hex: true, ac: '15', spell: { left: { 1: 2 } }, char: { name: 'Old' } });
  check('the first store becomes one character', Object.keys(first.characters), ['c1']);
  check('with the fields of the volley', [first.characters.c1.volley.power, first.characters.c1.volley.ac].join('/'), 'eb/15');
  check('and the slice of the spell tab', first.characters.c1.spells.left[1], 2);
  check('and the character itself', first.characters.c1.char.name, 'Old');
  check('the second store keeps its three slices',
    Object.keys(record.migrate({ volley: { hex: true }, spells: { sp: 3 }, char: { name: 'Two' } }).characters.c1).join('/'), 'volley/spells/char');
  check('a store with nothing in it carries no character', Object.keys(record.migrate({}).characters), []);
  check('the first store is read from its old name', (() => {
    const storage = { getItem: (k) => (k === 'volley.state.v2' ? JSON.stringify({ spells: { sp: 5 }, char: { name: 'V2' } }) : null) };
    return record.load(storage).characters.c1.char.name;
  })(), 'V2');
  check('a store of this name is read as it is', (() => {
    const storage = { getItem: (k) => (k === 'customsheet.state.v3' ? JSON.stringify({ characters: { x: { char: { name: 'Now' } } }, current: 'x', ui: { pages: ['spells'] } }) : null) };
    const state = record.load(storage);
    return [state.current, state.ui.pages.join(','), state.characters.x.char.name].join('/');
  })(), 'x/spells/Now');
  check('an empty device opens with nothing and no page', (() => {
    const state = record.load({ getItem: () => null });
    return [state.current, Object.keys(state.characters).length].join('/');
  })(), '/0');
  check('the record of a character, or an empty one', [record.of({ characters: { a: { char: {} } } }, 'a').char !== undefined, record.of({}, 'a')].join('/'), 'true/[object Object]');

  /* The slices, the seeds and the pages that are on. */
  const rec = record.seed({}, true);
  check('every page seeds the slice it owns', Object.keys(rec).sort(), ['char', 'features', 'spells', 'summons']);
  check('and a seed sees the record it is seeding', rec.features[0].saw, 'seeded');
  check('a slice is made ready for a page that writes it', (() => {
    const empty = {};
    const slice = record.slice(empty, 'char');
    slice.name = 'mine';
    return empty.char.name;
  })(), 'mine');
  check('the pages that are on come from the character first', record.pagesOn({ pages: ['summons'] }, { pages: ['spells'] }), ['summons']);
  check('then from the app', record.pagesOn({}, { pages: ['features'] }), ['features']);
  check('then from the pages that say so', record.pagesOn({}, { pages: null }), ['spells']);

  /* The package: every slice a page declares, and the summons that the old
     list of six keys dropped on the floor. */
  const carried = record.seed({}, true);
  carried.summons = { list: [{ id: 's1', name: 'Fey Spirit' }] };
  carried.pages = ['spells', 'summons'];
  carried.theme = 'emerald';
  carried.icon = 'book';
  const pkg = record.packageOf(carried);
  check('a package carries every slice of the record', Object.keys(pkg.record).sort(), ['char', 'features', 'icon', 'pages', 'spells', 'summons', 'theme']);
  check('a character with a summon carries the summon out', pkg.record.summons.list[0].name, 'Fey Spirit');
  const back = record.packageIn(pkg);
  check('and reads it back in', back.summons.list[0].name, 'Fey Spirit');
  check('with the pages it plays', back.pages.join(','), 'spells,summons');
  check('and the look it wore', [back.theme, back.icon].join('/'), 'emerald/book');
  check('a slice no page owns travels as it is', (() => {
    const odd = record.seed({}, true);
    odd.table = { rows: 2 };
    return record.packageOf(odd).record.table.rows;
  })(), 2);
  /* The page that brought a theme or an icon carries it out with the page,
     so the phone that opens the package can wear the same look. */
  check('a page of a package carries its look out', (() => {
    const odd = record.seed({}, true);
    odd.pluginPages = [{ id: 'look', themes: [{ id: 'pkgTheme' }], icons: [{ id: 'pkgIcon' }] }];
    const out = record.packageOf(odd);
    return out.pages[0].themes[0].id + '/' + out.pages[0].icons[0].id;
  })(), 'pkgTheme/pkgIcon');

  /* The shell reads the store, seeds and packages through the record: the
     checks above drive the record itself, and the shell is the walk's. */
  check('the record travels with the page', harness.built().html.indexOf('root.SheetRecord = function') >= 0, true);
}

console.log('the weight of the history');
{
  const restSrc = harness.source('rest.js');
  const counterSrc = harness.source('counter.js');
  const hctx = vm.createContext({});
  vm.runInContext(counterSrc, hctx);
  vm.runInContext(restSrc, hctx);
  const rest = hctx.SheetRest(hctx.SheetCounter ? hctx.SheetCounter() : undefined);
  const rec = { char: {} };
  for (let i = 0; i < 80; i++) rest.push(rec, { step: i, pad: 'x'.repeat(4000) });
  check('a heavy history is held under its weight', JSON.stringify(rec.char.history).length <= 64 * 1024, true);
  check('and keeps the newest step', rec.char.history[rec.char.history.length - 1].step, 79);
  const light = { char: {} };
  for (let i = 0; i < 80; i++) rest.push(light, { step: i });
  check('a light history is held to sixty steps', light.char.history.length, 60);
}

console.log('the edit mode of a page');
{
  /* One flag for the whole app and one wrench: a page asks whether it is in
     the edit mode instead of keeping a flag of its own, and the shell sets
     the pressed state from the flag. */
  const editSrc = harness.source('edit.js');
  const ectx = vm.createContext({});
  vm.runInContext(editSrc, ectx);
  const edit = ectx.SheetEdit();

  check('a page starts out of the edit mode', edit.of('character'), false);
  check('the wrench puts it in', edit.toggle('character'), true);
  check('and the page reads it', edit.editing('character'), true);
  check('another page is not touched by it', edit.of('spells'), false);
  check('the wrench takes it out', edit.toggle('character'), false);
  check('and the page reads that too', edit.editing('character'), false);
  check('each page keeps its own flag', (() => {
    edit.toggle('features');
    return [edit.of('features'), edit.of('character')].join('/');
  })(), 'true/false');

  /* The flag, the button and the pressed state are the shell's, and the walk
     shows the pressed wrench; the checks above drive the module itself. */
  check('the edit mode travels with the page', harness.built().html.indexOf('root.SheetEdit = function') >= 0, true);
}

console.log('the rebuild signature');
{
  /* A page says what its markup was built from, and the shell turns it into
     one cheap key, so a repaint keeps what has not moved and builds again
     when it has. */
  const rebuildSrc = harness.source('rebuild.js');
  const rctx = vm.createContext({});
  vm.runInContext(rebuildSrc, rctx);
  const rebuild = rctx.SheetRebuild();

  check('the parts become one key', rebuild.signature('p1', ['c1', ['a', 'b']]), 'c1|a,b');
  check('a missing part is a gap, not a hole', rebuild.signature('p1', ['c1', null, undefined, 3]), 'c1|||3');
  check('the same parts give the same key', rebuild.signature('p1', ['c1', 'a']), rebuild.signature('p1', ['c1', 'a']));
  check('a part that moved gives another key',
    rebuild.signature('p1', ['c1', 'a', 'b']) !== rebuild.signature('p1', ['c1', 'a']), true);

  const plain = rebuild.signature('p2', ['c1']);
  rebuild.markDirty('p2', 'cards');
  const marked = rebuild.signature('p2', ['c1']);
  check('a mark moves the key of its page', marked !== plain, true);
  check('and the mark is in the key', marked.indexOf('cards:1') >= 0, true);
  check('a second read of the same mark gives the same key', rebuild.signature('p2', ['c1']), marked);
  check('a mark of another page leaves this one alone',
    rebuild.signature('p3', ['c1']), rebuild.signature('p3', ['c1']));
  rebuild.markDirty('p2', 'cards');
  check('a second mark of the same part moves it again',
    rebuild.signature('p2', ['c1']).indexOf('cards:2') >= 0, true);

  /* The paint keeps the markup: the first paint builds it and renders it, a
     paint of the same parts only renders, and a part or a mark that moved
     builds once. */
  let builtCount = 0;
  let paintedCount = 0;
  const brush = {
    build: () => { builtCount += 1; },
    render: () => { paintedCount += 1; }
  };
  rebuild.paint('p4', ['c1'], brush);
  check('the first paint builds and renders', [builtCount, paintedCount], [1, 1]);
  rebuild.paint('p4', ['c1'], brush);
  check('a second paint with the same parts renders without building', [builtCount, paintedCount], [1, 2]);
  rebuild.paint('p4', ['c1', 'c2'], brush);
  check('a changed part builds', [builtCount, paintedCount], [2, 3]);
  rebuild.markDirty('p4', 'cards');
  rebuild.paint('p4', ['c1', 'c2'], brush);
  check('a mark forces the next paint to build', builtCount, 3);
  rebuild.paint('p5', ['c1'], brush);
  check('two page ids keep separate keys', builtCount, 4);

  /* The paint keeps the key, and the summons section drives a mark through
     the real page. The pages reach a.paint and a.markDirty through the api,
     which the core guard above checks. */
  check('the rebuild signature travels with the page', harness.built().html.indexOf('root.SheetRebuild = function') >= 0, true);
}

console.log('the page and the core');
{
  /* A page reaches the core for its helpers, through C.<name> at load and
     through a.core.<name> at mount, and a box is two levels deep. Every name
     a page asks for must be one its door carries: a name the shell keeps on
     the page's own api, or a box member that is not there, is a crash in the
     app and a silence here, because this suite runs no page's handlers. */
  const coreSrc = harness.source('shell.js');
  const coreBlock = coreSrc.match(/var core = \{([\s\S]*?)\n  \};/);
  const carried = [...coreBlock[1].matchAll(/^    ([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1])
    .concat([...coreSrc.matchAll(/\bcore\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)].map((m) => m[1]));
  const pageNames = ['character', 'volley', 'spells', 'features', 'summons', 'equipment', 'image', 'backstory', 'attack', 'settings', 'agent'];
  const pageSources = {};
  pageNames.forEach((f) => { pageSources[f] = harness.source('pages/' + f + '.js'); });

  /* A box is the list of what a page may use: a name no page asks for is a
     name the box does not carry, so a box cannot quietly refill. */
  const boxes = {};
  ['library', 'chrome', 'exchange'].forEach((box) => {
    const block = coreBlock[1].match(new RegExp('    ' + box + ': \\{([\\s\\S]*?)\\n    \\}'));
    boxes[box] = block ? [...block[1].matchAll(/^      ([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]) : [];
  });
  check('the three boxes are read from the core', Object.keys(boxes).map((b) => boxes[b].length > 0), [true, true, true]);

  /* The two doors and the three levels, checked together. */
  const apiKeys = [...coreSrc.match(/var api = \{([\s\S]*?)\n  \};/)[1].matchAll(/^    ([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]);
  const bad = [];
  pageNames.forEach((f) => {
    const src = pageSources[f];
    const door = (kind, one, two) => {
      const where = f + '.' + kind + one + (two ? '.' + two : '');
      if (carried.indexOf(one) < 0) { bad.push(where); return; }
      if (two && boxes[one] && boxes[one].indexOf(two) < 0) bad.push(where);
    };
    [...src.matchAll(/\bC\.([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?/g)].forEach((m) => door('C.', m[1], m[2]));
    [...src.matchAll(/\b(?:a|api)\.core\.([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?/g)].forEach((m) => door('core.', m[1], m[2]));
    [...new Set([...src.matchAll(/\bapi\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))].forEach((n) => {
      if (apiKeys.indexOf(n) < 0) bad.push(f + '.api.' + n);
    });
  });
  check('every name a page reaches is one its door carries', bad, []);
  const unused = [];
  Object.keys(boxes).forEach((box) => {
    boxes[box].forEach((name) => {
      if (!pageNames.some((f) => pageSources[f].indexOf('C.' + box + '.' + name) >= 0 || pageSources[f].indexOf('core.' + box + '.' + name) >= 0)) unused.push(box + '.' + name);
    });
  });
  check('every name a box carries is reached by some page', unused, []);

  /* The core is the modules and the three boxes, and nothing else. */
  check('the core carries the modules and the three boxes, nothing else',
    carried.slice().sort(), ['R', 'SR', 'attackCard', 'card', 'cast', 'chrome', 'classes', 'counter', 'exchange', 'fairy',
      'feedback', 'horizontalAttackBox', 'images', 'library', 'origin', 'own', 'rest', 'rng', 'roll', 'slider', 'toggle', 'verticalAttackBox']);

  /* The shelf is one door on the exchange box, and the sign in behind it is
     the module's: none of the names the page used before is a door of the
     core any more. */
  const signIn = ['shelfRepo', 'shelfCharacters', 'shelfBranches', 'shelfRemove', 'shelfCreateRepo',
    'shelfFork', 'pushToShelf', 'ghToken', 'ghBegin', 'ghWait', 'ghPending', 'ghLogin',
    'ghSetLogin', 'ghBranch', 'ghSetBranch', 'ghSetToken'];
  check('the exchange box carries the shelf and none of the sign in',
    [boxes.exchange.indexOf('shelf') >= 0].concat(signIn.filter((n) => boxes.exchange.indexOf(n) >= 0)), [true]);
  check('the shelf travels with the page', harness.built().html.indexOf('root.SheetShelf = function') >= 0, true);
}

console.log(failures === 0 ? '\nall rules checks pass' : '\n' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
