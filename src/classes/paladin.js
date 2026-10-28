/* The paladin, level 1: the lay on hands and a small prepared list. */
SheetClasses.define({
  name: 'Paladin',
  /* The features of the first level it bundles, by the names the library writes. */
  level1: ['Lay on Hands', 'Spellcasting', 'Weapon Mastery'],
  /* The colour of its tag, and of its subclasses'. */
  colour: '255,160,90',
  /* Lay on Hands: a pool of five hit points a paladin level, back on a long
     rest; a use spends an amount, and may heal the paladin. */
  counters: [{
    keys: ['paladin-1-lay-on-hands'], name: 'Lay on Hands', from: 1, pool: true, heals: true,
    uses: function (level) { return 5 * level; },
    recovery: 'long'
  }],
  attacks: SheetClasses.step([[1, 1], [5, 2]]),
  learning: {
    kind: 'prepared',
    rule: 'The paladin prepares a small list of its own spells.'
  }
});
