/* The druid, level 1: the druidic tongue and the prepared list. */
SheetClasses.define({
  name: 'Druid',
  /* The features of the first level it bundles, by the names the library writes. */
  level1: ['Druidic', 'Magician', 'Primal Order', 'Spellcasting', 'Warden'],
  /* The colour of its tag, and of its subclasses'. */
  colour: '122,216,111',
  learning: {
    kind: 'prepared',
    rule: 'The druid prepares any spell of its list after a long rest.'
  }
});
