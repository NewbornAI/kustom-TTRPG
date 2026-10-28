/* The rogue, level 1: the sneak attack and the cant. */
SheetClasses.define({
  name: 'Rogue',
  /* The features of the first level it bundles, by the names the library writes. */
  level1: ['Sneak Attack', 'Thieves\' Cant', 'Weapon Mastery'],
  /* The colour of its tag, and of its subclasses'. */
  colour: '150,160,190',
  /* Sneak Attack: one d6 at level 1, one more every odd level. */
  sneak: function (level) { return Math.ceil(level / 2) + 'd6'; },
  learning: {
    kind: 'none',
    rule: 'A rogue carries no spell.'
  }
});
