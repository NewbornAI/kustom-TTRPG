/* The wizard, level 1: the book, the rituals and the recovery. */
SheetClasses.define({
  name: 'Wizard',
  /* The features of the first level it bundles, by the names the library writes. */
  level1: ['Arcane Recovery', 'Ritual Adept', 'Spellcasting'],
  /* The colour of its tag, and of its subclasses'. */
  colour: '120,200,255',
  /* Arcane Recovery: once a day, back on a long rest; it recovers slots of
     up to half the wizard's level in all, none of level 6 or more. */
  counters: [{
    keys: ['wizard-1-arcane-recovery'], name: 'Arcane Recovery', from: 1,
    uses: function () { return 1; },
    recovery: 'long',
    use: function (level) { return 'Arcane Recovery: slots of up to ' + Math.ceil(level / 2) + ' levels in all, none above 5'; }
  }],
  learning: {
    kind: 'spellbook',
    rule: 'The wizard writes spells into its book and prepares from it.'
  }
});
