/* The barbarian, level 1: the rage and the mastery of weapons. */
SheetClasses.define({
  name: 'Barbarian',
  /* The features of the first level it bundles, by the names the library writes. */
  level1: ['Rage', 'Unarmored Defense', 'Weapon Mastery'],
  /* The colour of its tag, and of its subclasses'. */
  colour: '240,90,80',
  /* Rage: the uses of the Rages column, one back on a short rest; its
     damage rides the Strength attacks on the attack sheet while it lasts. */
  counters: [{
    keys: ['barbarian-1-rage'], name: 'Rage', from: 1,
    uses: SheetClasses.step([[1, 2], [3, 3], [6, 4], [12, 5], [17, 6]]),
    recovery: 'long', short: 1,
    use: function (level) { return 'Rage: +' + SheetClasses.step([[1, 2], [9, 3], [16, 4]])(level) + ' damage on Strength attacks, 10 minutes'; }
  }],
  riders: [{
    key: 'rage', label: 'Rage', from: 1, spends: 'barbarian-1-rage', strength: true,
    damage: SheetClasses.step([[1, 2], [9, 3], [16, 4]])
  }],
  attacks: SheetClasses.step([[1, 1], [5, 2]]),
  learning: {
    kind: 'none',
    rule: 'A barbarian carries no spell.'
  }
});
