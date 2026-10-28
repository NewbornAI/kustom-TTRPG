/* The ranger, level 1: the favoured enemy and a small prepared list. */
SheetClasses.define({
  name: 'Ranger',
  /* The features of the first level it bundles, by the names the library writes. */
  level1: ['Favored Enemy', 'Spellcasting', 'Weapon Mastery'],
  /* The colour of its tag, and of its subclasses'. */
  colour: '190,200,110',
  /* Favored Enemy: Hunter's Mark without a slot, twice, more with the level,
     back on a long rest. */
  counters: [{
    keys: ['ranger-1-favored-enemy'], name: 'Favored Enemy', from: 1,
    uses: SheetClasses.step([[1, 2], [5, 3], [9, 4], [13, 5], [17, 6]]),
    recovery: 'long',
    use: function () { return "Hunter's Mark, cast without a slot"; }
  }],
  attacks: SheetClasses.step([[1, 1], [5, 2]]),
  learning: {
    kind: 'prepared',
    rule: 'The ranger prepares a small list of its own spells.'
  }
});
