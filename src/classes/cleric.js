/* The cleric, level 1: the divine order and the prepared list. */
SheetClasses.define({
  name: 'Cleric',
  /* The features of the first level it bundles, by the names the library writes. */
  level1: ['Divine Order', 'Protector', 'Spellcasting', 'Thaumaturge'],
  /* The colour of its tag, and of its subclasses'. */
  colour: '255,214,102',
  learning: {
    kind: 'prepared',
    rule: 'The cleric prepares any spell of its list after a long rest.'
  }
});
