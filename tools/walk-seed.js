(function () {
  /* The fixture the walk plants: one character with a name, two classes, the
     six scores, a look and the pages it plays, so every page has something to
     show. It is the store of the app under its own key, and the page reloads
     on it. Kept as one expression, because the walk evaluates it in the page. */
  var store = '{"characters":{"c1":{"char":{"name":"Yngwie","ac":15,"level":11,"classes":[{"name":"Sorcerer","level":8,"subclass":"Wild Magic Sorcery"},{"name":"Warlock","level":3,"subclass":"The Hexblade"}],"abilities":{"str":8,"dex":14,"con":14,"int":10,"wis":12,"cha":20},"hp":{"current":43,"max":43}},"pages":["volley","spells","features","summons","image"],"theme":"blueRed","icon":"guitar"}},"current":"c1","ui":{"pages":null}}';
  localStorage.setItem('customsheet.state.v3', store);
  location.replace('/?v=walk3');
  return 'ok';
})()