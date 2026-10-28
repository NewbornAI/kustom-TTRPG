/* The bard, level 1: the inspiration and the first spells. */
SheetClasses.define({
  name: 'Bard',
  /* The features of the first level it bundles, by the names the library writes. */
  level1: ['Bardic inspiration', 'Spellcasting'],
  /* The colour of its tag, and of its subclasses'. */
  colour: '178,132,255',
  /* Bardic Inspiration: as many uses as the Charisma modifier, at least one,
     back on a long rest, and on a short one too from Font of Inspiration at
     level 5. The die grows with the level. The data has no row for it, so
     the class brings one. */
  counters: [{
    keys: ['bard-1-bardic-inspiration', 'bardicInspiration'], name: 'Bardic Inspiration', from: 1, add: true,
    uses: function (level, rec) {
      var cha = Number(((rec.char || {}).abilities || {}).cha) || 10;
      return Math.max(1, Math.floor((cha - 10) / 2));
    },
    recovery: function (level) { return level >= 5 ? 'short' : 'long'; },
    use: function (level) { return 'Bardic Inspiration: a d' + SheetClasses.step([[1, 6], [5, 8], [10, 10], [15, 12]])(level) + ' to give'; }
  }],
  learning: {
    kind: 'known',
    rule: 'The bard learns a fixed list of spells and can swap one when it gains a level.'
  }
});
