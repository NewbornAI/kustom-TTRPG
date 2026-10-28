/* The sorcerer, level 1: the innate sorcery and the spells it learns. */
SheetClasses.define({
  name: 'Sorcerer',
  /* The features of the first level it bundles, by the names the library writes. */
  level1: ['Innate sorcery', 'Spellcasting'],
  /* The colour of its tag, and of its subclasses'. */
  colour: '255,111,168',
  /* Innate Sorcery: twice, back on a long rest; the data has no row for it,
     so the class brings one. Font of Magic and Metamagic come at level 2. */
  counters: [{
    keys: ['innateSorcery', 'sorcerer-1-innate-sorcery'], name: 'Innate Sorcery', from: 1, add: true,
    uses: function () { return 2; },
    recovery: 'long',
    use: function () { return 'Innate Sorcery for 1 minute: spell DC +1, Advantage on Sorcerer spell attacks'; }
  }],
  flags: function (level) { return { fontOfMagic: level >= 2, metamagic: level >= 2 }; },
  learning: {
    kind: 'known',
    rule: 'The sorcerer learns a fixed list of spells and can swap one when it gains a level.'
  }
});
