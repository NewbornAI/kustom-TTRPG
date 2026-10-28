/* The warlock, level 1: the invocations and the pact magic. */
SheetClasses.define({
  name: 'Warlock',
  /* The features of the first level it bundles, by the names the library writes. */
  level1: ['Eldritch Invocation Options', 'Eldritch Invocations', 'Pact Magic'],
  /* The colour of its tag, and of its subclasses'. */
  colour: '110,155,255',
  learning: {
    kind: 'pact',
    rule: 'The warlock learns a fixed list and its slots come back on a short rest.'
  }
});
