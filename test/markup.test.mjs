/* The grammar of the upstream text: the 5e.tools tags, the damage and the
   terms of a formula. Fixtures only: no network, no cache, no data file. */
import { clean, creatureText, actionOf, attackOf, parseDamage, termOf } from '../tools/markup.mjs';

let passed = 0;
function check(what, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log('  no   ' + what + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
    process.exitCode = 1;
    return;
  }
  console.log('  ok   ' + what);
  passed += 1;
}

console.log('the tags of the book');
check('a creature tag keeps its name', clean('a {@creature Battle Familiar|AU}'), 'a Battle Familiar');
check('a condition keeps its name for the page', clean('the target is {@condition prone}'), 'the target is [[c:prone]]');
check('a saving throw names its ability', clean('{@actSave dex}'), '[[s:Dexterity saving throw]]');
check('a saving throw of two abilities reads both', clean('{@actSave str,dex}'), 'Strength or [[s:Dexterity saving throw]]');
check('a hit in a spell is the text after it', clean('{@hit 5}'), 'on a hit, 5');
check('a recharge says when', clean('{@recharge 5}'), 'recharges on a 5');
check('a dc is a dc', clean('{@dc 15}'), 'DC 15');
check('a note keeps its note', clean('{@note the target must see you}'), 'Note: the target must see you');
check('emphasis is the words', clean('{@i very} {@b sharp}'), 'very sharp');
check('a filter keeps the words it shows', clean('a different {@filter cantrip from the Wizard spell list|spells|level=0|class=Wizard}.'), 'a different cantrip from the Wizard spell list.');
check('a tag with no body is dropped', clean('a {@h}b'), 'a b');

console.log('the damage');
check('a damage with a type keeps the type', clean('{@damage 8d6} Fire damage'), '[[d:8d6 Fire damage]]');
check('a damage without a type keeps the dice', clean('{@damage 2d4 + 2}'), '[[d:2d4 + 2]]');
check('a scaled damage is the dice added per level', clean('{@scaledamage 2d8 + 1d6|1-9|1d6}'), '[[d:1d6]]');

console.log('the tags of a creature');
check('a melee weapon attack is named', creatureText('{@atk mw}'), 'Melee weapon attack:');
check('a ranged spell attack too', creatureText('{@atkr rs}'), 'Ranged spell attack:');
check('a hit is a bonus', creatureText('{@hit 7}'), '+7 to hit');
check('a negative hit keeps its sign', creatureText('{@hit -2}'), '+-2 to hit');
check('a saving throw of the creature', creatureText('{@actSave con}'), '[[s:Constitution saving throw]]');
check('the dice of a creature', creatureText('{@dice 1d6}'), '1d6');
check('a spell attack modifier is named', creatureText('{@hitYourSpellAttack}'), 'your spell attack modifier');
check('a condition of the creature', creatureText('{@condition grappled}'), '[[c:grappled]]');
check('an attack that is either kind reads as one', creatureText('{@atk m,r}'), 'Melee or Ranged attack:');
check('and both of its weapons', creatureText('{@atk mw,rw}'), 'Melee weapon or Ranged weapon attack:');
check('a bare recharge is the 5-6 the book prints', creatureText('Cold Breath {@recharge}'), 'Cold Breath (Recharge 5-6)');
check('a spoken recharge keeps its number', creatureText('{@recharge 5}'), 'recharges on a 5');
/* The 2014 blocks print the hit tag and then the words "to hit" again. */
check('to hit is not said twice', creatureText('{@atk mw} {@hit 4} to hit, reach 5 ft.'), 'Melee weapon attack: +4 to hit, reach 5 ft.');

console.log('the action is read in one order');
const RAW = '{@atk mw} {@hit 5}, reach 5 ft., one target. {@damage 2d6 + 3} Fire damage.';
const action = actionOf(RAW);
check('the bonus comes from the tag', action.bonus, '5');
check('the damage comes from the tag', action.damage, '2d6 + 3');
check('the type is the word that follows', action.type, 'fire');
check('the dice are parsed', action.damageParts, { dice: { size: 6, count: 2 }, flat: [{ const: 3 }] });
check('and the text is cleaned after the tags are read',
  action.text, 'Melee weapon attack: +5 to hit, reach 5 ft., one target. [[d:2d6 + 3 Fire damage]].');
/* The rule the interface hides: the text first eats the tags. */
const eaten = creatureText(RAW);
check('the text read first eats the tags', attackOf(eaten).bonus, '');
check('which is why the action is one call', actionOf(RAW).bonus, '5');

console.log('the dice and the terms');
check('a plain dice', parseDamage('2d6 + 3'), { dice: { size: 6, count: 2 }, flat: [{ const: 3 }] });
check('a dice that grows with the slot', parseDamage('(summonSpellLevel - 2)d8 + 5'),
  { dice: { size: 8, levelCount: -2 }, flat: [{ const: 5 }] });
check('a damage that is not dice', parseDamage('two'), null);
check('the level of the calling spell', termOf("the spell's level"), { level: 1 });
check('the proficiency', termOf('PB'), { prof: 1 });
check('a modifier', termOf('your Charisma modifier'), { ability: 'cha' });
check('a number per level', termOf('5 per spell level'), { perLevel: 5 });

console.log('');
if (process.exitCode) {
  console.log('a check failed');
} else {
  console.log('all markup checks pass (' + passed + ')');
}
