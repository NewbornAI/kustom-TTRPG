/* The fighter, level 1: the style, the second wind and the mastery of weapons. */
SheetClasses.define({
  name: 'Fighter',
  /* The features of the first level it bundles, by the names the library writes. */
  level1: ['Fighting Style', 'Second Wind', 'Weapon Mastery'],
  /* The colour of its tag, and of its subclasses'. */
  colour: '214,180,140',
  /* Second Wind: two uses, three at 4, four at 10, one back on a short rest;
     a use heals 1d10 plus the fighter's level. */
  counters: [{
    keys: ['fighter-1-second-wind'], name: 'Second Wind', from: 1, heals: true,
    uses: SheetClasses.step([[1, 2], [4, 3], [10, 4]]),
    recovery: 'long', short: 1,
    use: function (level, ctx) {
      var r = ctx.roll('1d10');
      var got = ctx.heal(r.total + level);
      return 'Second Wind: ' + r.total + ' + ' + level + ', ' + got + ' hit point' + (got === 1 ? '' : 's') + ' back';
    }
  }],
  attacks: SheetClasses.step([[1, 1], [5, 2], [11, 3], [20, 4]]),
  learning: {
    kind: 'none',
    rule: 'A fighter carries no spell.'
  }
});
