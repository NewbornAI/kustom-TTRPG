/* The monk, level 1: the unarmed art. */
SheetClasses.define({
  name: 'Monk',
  /* The features of the first level it bundles, by the names the library writes. */
  level1: ['Bonus Unarmed Strike', 'Dexterous Attacks', 'Martial Arts', 'Martial Arts Die', 'Unarmored Defense'],
  /* The colour of its tag, and of its subclasses'. */
  colour: '80,215,200',
  attacks: SheetClasses.step([[1, 1], [5, 2]]),
  learning: {
    kind: 'none',
    rule: 'A monk carries no spell.'
  }
});
