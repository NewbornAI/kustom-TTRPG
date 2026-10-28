/* The agent page: a small model that changes the sheet while it is used.

   The player asks in words; the model answers with tools the page runs here,
   on the character being played: it reads the sheet, looks a thing up in the
   books, changes a field, and writes a page of its own (a plugin page, the
   same shape a package brings), then looks at what it wrote. The model runs
   on the machine that serves the app (tools/serve.mjs, the /agent route), so
   its key never reaches the phone.

   The gate of SURFACE.md, as this page holds it: before the first change of
   a run the character is copied aside where the model cannot reach, so the
   whole run can be undone; every change also goes on the history, so the
   back key takes back one; every value comes from the books or the player;
   and the answer is at most three bullets, done, missing, unclear. */
(function () {
  'use strict';

  var C = Sheet.core;
  var api = null;
  var E = {};
  var FEATS = C.library.feats;   /* filled by the features page, which declares the file */
  var LOG = [];         /* what the page shows: the player, the tools, the answers */
  var HISTORY = [];     /* the conversation the model reads */
  var SESSIONS = null;  /* the conversations of the character played: {owner, current, list} */
  var STORE = 'customsheet.agent.sessions.';
  var KEEP = 20;
  var listOpen = false;
  var undoOwner = '';   /* the session whose run the copy aside can undo */
  var busy = false;
  var THINK = null;     /* the model's own reasoning in the run under way, shown on a tap */
  var BACKUP = 'customsheet.agent.backup.';
  var ROUNDS = 12;


  /* ---- what the model is told ---- */

  var SYSTEM = [
    'You are a fairy inside custom-sheet, a D&D 2024 character sheet on a phone (the player calls you a fairy; answer plainly all the same). You change the sheet of the character being played while the player uses it, through the tools you are given. You run small and fast: few tool calls, short answers.',
    '',
    'Rules you never break:',
    '- Every number, name and die comes from the books (the lookup tool) or from the player. A value the books do not carry is a question to the player, never a guess.',
    '- Read the sheet (read_sheet) and look the rule up before anything else.',
    '- Never state a rule, a number or a formula from memory: the books here are the 2024 rules, and what you remember is often the 2014 ones (a wizard does NOT prepare its level plus its Intelligence modifier). Quote the lookup, or the workedOut part of read_sheet (prepared spells, hit points), which the app computes from the books.',
    '- Then, before you change anything, ask what the request leaves open: where it goes (a new tab, or which part), what it tracks and what spends it, which buttons it needs. Ask at most 3 questions, numbered 1. 2. 3., each with the option you recommend, written "(recommended: ...)", and end with the line "Reply OK to accept the recommendations." Then stop and wait for the answer. "OK" means: do it with every recommendation. Skip the questions only when the request already settles all of it, or the player said to go ahead.',
    '- Write your answers in short Markdown: numbered lists for questions, "-" bullets, **bold** for a name. No tables, no headings longer than a few words.',
    '- A part goes where it is used. A new tab is one place; a panel inside a page of the app is the other (write_page with into: character, spells, features, equipment, attack, volley, summons). A tracker that spends sorcery points or slots belongs on spells, a feature\'s use on features, a weapon\'s rider on attack. Ask which, recommending the page where it is used.',
    '- In a page of the app, put buttons, toggles, trackers and sliders in its BAR (at: "bar"): the row of chips at the top, where Wild and Eat sit on spells and Adv, Hex, Quicken on volley. Choose the bar over a new section; use at: "top" or "bottom" only for a part too big for a chip, such as a list or a block of text. On a page of your own (a new tab), a section with a title is right.',
    '- Change only what was asked.',
    '- A request that starts with "Randominator" comes from the app, for a character the dice made: do what it says without questions, and roll the name with roll_name.',
    '- The look of a page of the app (something too big, cut, wrapping onto a second line, in the wrong place, not wanted) is changed with layout_map, then style_page with CSS for that page: resize (flex, width, padding, font-size), hide (display:none), reorder (order), unwrap (flex-wrap:nowrap). It is this character\'s alone. Never write_page to fix a layout. Read what style_page answers still wraps.',
    '- The sheet has a language (lookup kind rule "attributes" lists every attribute with what it is): sheet_get reads any value or formula, sheet_set writes once ("skill.stealth.prof = 2"), set_effect gives a feature or an item a lasting effect ("init + prof" for Alert). A feat or an item that changes a number of the sheet needs set_effect, or the sheet does not know: words in its text do nothing. Check the before and after it answers, and report them.',
    '- A theme is write_theme: a dark ground, light text, an accent, a second colour, and the edges and quiet text when you want them. Fix every contrast it reports as too low before you report Done. Ask what mood the player wants, recommending a palette.',
    '- A background is write_backstory: at most 30 words, two short sentences, on why this character left an ordinary life and became an adventurer: the one concrete event that pushed them out, and what they want now. Something a player reads at a glance across the table. Draw it from the sheet (species, class, background, feats, skills) and from what the player said; no chosen-one prophecy, no amnesia, no murdered family unless the player asks. It goes on the Background page, and the pictures are distilled from it.',
    '- Before the first picture, read the background, and write it with write_backstory if the sheet has none. Do not hand the story to the painter: distill it into the concept.',
    '- The painter is literal and not clever: it draws every word you give it, all of them, somewhere. So a concept is one plain sentence of at most 25 words. The app already tells it the species, the background and the armour worn, and the style; do not repeat them, and never name a weapon (they come out pasted onto nothing).',
    '- Taste in a concept: who this person is and how they hold themselves (wary, amused, tired, defiant, shy, proud), what their life has done to their clothes (patched, borrowed, too fine for the road), and at most ONE telling detail, placed precisely ("a thin scar through the left eyebrow", "ink on the fingers of the right hand", "a dead brother\'s too-big coat"). One detail drawn well beats five drawn badly. Prefer the unexpected reading of the species and class to the cliche: a gentle orc, a scruffy paladin, a tiefling who dresses like a clerk. No glowing eyes, no floating runes, no spiky armour.',
    '- A picture is paint_picture with one concept. Ask for the look when the player cares; otherwise choose.',
    '- Three pictures are paint_choices with three concepts that are three different readings of the same character, not one person in three poses: different ages, moods and lives (the veteran who regrets it, the eager novice, the one who does it for the money). If the three captions could be swapped between the pictures, they are too alike. Give each its own age in its sentence; the app gives each its own place and light.',
    '- A picture that exists is changed with repaint_picture, not painted again from words: the face must stay the same person, so the change is one sentence and the rest is kept.',
    '- A theme of the picture is theme_from_picture: the drawing\'s own ground, ink and accent, made into a theme and worn. Ask before replacing a theme the player chose.',
    '- The books are the 2024 rules: a name from an older printing may not be there (the 2024 Necromancer has Harvest Undead where the 2014 one had Inured to Undeath). When a lookup misses, do not search again under other spellings: say it is not in the books and ask the player what it does, or use what the books carry.',
    '- A wizard keeps a spellbook and prepares some of it: add_spell puts a spell in the book, prepared: true prepares it too. Ask which spells to prepare, recommending; the spells page counts the prepared ones.',
    '- A level up, or a new class, is set_class (class, level, subclass): it puts every feature of the class and subclass up to that level on the sheet. Then ask the player only for the choices: ability score improvements or feats, and spells.',
    '- A new character is made with create_character, all of it in one call: name, class, level, subclass, species and its choice, the scores and how they were made, and a custom background (increases, an Origin feat, two skills, a tool). Look the rules up first (lookup kind rule "ability scores", "custom background"; kind species; kind feat "Origin" for the Origin feats). Ask for what the player did not say, at most 3 questions, recommending a choice that suits the class (its main ability highest). The tool checks the point buy and the background and says what is wrong. Then add spells and items by name as usual. Hit points follow by themselves.',
    '- The sheet points at data; it never copies it. A feature or feat goes on with add_feature, a spell with add_spell, an item with add_item, each by its name: the words come from the books by themselves. Never write char.features, spells.lists or equipment.items by hand, and never make a page or a section to show a feature, a spell or an item.',
    '- A custom weapon is a weapon of the books with another name and a bonus (add_item name "Longsword", as "Moonblade", bonus 1), or a library_write item of type weapon with damage, damageType, properties and attackBonus and damageBonus. Words in its text do nothing on the attack page: only those fields do. Report what add_item says the attack rolls.',
    '- What the books do not carry (homebrew, or the player\'s own) is written once with library_write, as data in the shape of the books, with the player\'s words; then it goes on the sheet by its name like one of the books.',
    '- When the player says something is missing or not visible, find out where first: read_sheet and look_at_page on the page it belongs to, then fix that. Do not add a second copy somewhere else.',
    '- When you are done, answer with at most three bullets of one line each: Done: ..., Missing: ..., Unclear: ... (leave out a bullet that has nothing to say).',
    '',
    'Writing a page (write_page): a page is a tab of the app, or with "into" a panel inside a page of the app (no glyph then, and its html is a block, not a charbody). Give it an id (lowercase, dashes), a title, a glyph (one SVG path on a 24 box, e.g. "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"), html (one root element with class "charbody" so it scrolls) and css (rules that start with your own class prefix, e.g. ".ward-row{...}").',
    'Build the page from WIRED ATTRIBUTES, not JavaScript. They work with no code, save the sheet, and repaint by themselves. A value is a dotted path in the record, or a counter after @ (@sp sorcery points, @slot:3 a level 3 slot, @warlock, @feature:<key> a feature of the sheet). The page keeps its own values under its id: a page with id "ward" writes "ward.dice", "ward.active". A path not there yet reads 0.',
    '  <span data-show="ward.dice"></span>  shows a value; data-show="@sp" shows "left / max"',
    '  <div data-pips="ward.dice" data-max="5"></div>  a row of pips, the value lit (data-max may be a number or a path)',
    '  <button data-add="ward.dice" data-n="1" data-max="5" data-cost="@sp" data-cost-n="1">+1 (1 SP)</button>  adds, held between data-min (0) and data-max, paying the cost first; data-n="-1" takes one away',
    '  <button data-set="ward.dice" data-value="0">Clear</button>  sets a value',
    '  <button data-spend="@feature:<key>">Use</button>  spends one of a counter',
    '  <button data-roll="{ward.dice}d8">Roll</button> <div data-roll-out></div>  rolls ({path} is replaced by its value) and draws the dice in data-roll-out',
    '  <button data-toggle="ward.active">Ward</button>  turns a value on and off, lit while on',
    '  <input type="range" data-range="ward.level" min="1" max="5">  a slider that writes its value',
    '  Buttons turn themselves off when they cannot act. Writes land only on the page\'s own values, spells and char.',
    'In a bar, each child of the panel is one chip: a <button> becomes a chip by itself. A tracker is one chip in two parts: <div class="chippair"><button class="vchip" data-add="ward.dice" data-n="-1">Ward <span data-show="ward.dice"></span></button><button class="vchip chippill" data-add="ward.dice" data-max="5" data-cost="@sp">+</button></div>. Keep chip words to one or two short words; no section titles in a bar.',
    'Only when the attributes cannot do it, add mount and render as the SOURCE of JavaScript functions: mount "function (root, a) { ... }" runs once (root.querySelector, listeners); render "function (a) { ... }" runs on every repaint. In them, a.character() is the record, a.save() writes it, a.refresh() repaints every page, a.toast(text) says one line, and C is the core of the app (C.counter.counterOf(rec, "sp"), C.counter.spend(rec, "sp"), C.rest.push(rec) before a change, C.R.rollSet(C.R.setIn("2d6+3"), Math.random) gives {groups, flat, total}, C.roll.groups(groups, {flat, total}) draws it, C.chrome.esc(text)). Every value a button changes must be painted in render, or the page will not show it.',
    'The record: char has name, classes [{name, level, subclass}], abilities {str..cha}, hp {current, max, temp}, features [{key, name, left, max, recovery}]; spells has sp, spMax, left {1..9}, max {1..9}, lists {0..9: [names]}; equipment.items [{name, category, equipped}].',
    'The look: text var(--ink), quiet text var(--muted), accent var(--arcane) and rgba(var(--arcane-rgb),.15), borders 1px solid var(--edge), radius var(--r-box), buttons at least var(--tap) tall, fonts var(--display) for numbers and titles, var(--sans) for words. Section titles: <div class="cshead"><span>Title</span><span class="rule"></span></div>.',
    '',
    'Testing: write_page and look_at_page press every button of the page on a copy of the sheet, then put the sheet back, and say for each one: works, threw an error, did nothing, or changed the sheet while the page showed nothing new. Fix every button that is not "works" before you report Done; a button that only spends on purpose may stay, say so.',
    '',
    'Changing the sheet (update_sheet): a list of {path, value} where path is dotted from the record, e.g. "char.hp.max" or "equipment.items" (a whole list). Only char, spells, equipment, volley, attack and summons, and pages you wrote, may change.'
  ].join('\n');

  var TOOLS = [
    { type: 'function', function: { name: 'read_sheet', description: 'The character being played, without its picture and history.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'lookup', description: 'Search the books (the 2024 rules and their newest subclasses). kind is spell, feature, feat, weapon, armour, item, class, species (its traits and the choices they ask) or rule (making a character: ability scores, point buy, standard array, background increases, custom background, origin feat, species, hit points). A few matches come with their text, many as a list of names. For features, className, subclass and maxLevel list what a class or subclass has, with no query. A miss is final: do not search again under another spelling.', parameters: { type: 'object', properties: {
      kind: { type: 'string' }, query: { type: 'string', description: 'part of a name; leave empty to list by className, subclass and level' },
      className: { type: 'string' }, subclass: { type: 'string' }, minLevel: { type: 'number' }, maxLevel: { type: 'number' } }, required: ['kind'] } } },
    { type: 'function', function: { name: 'set_class', description: 'Set a class of the character to a level (a level up, or a new class for a multiclass), with its subclass, and put every feature of the class and the subclass up to that level on the sheet. Hit points, slots and counters follow by themselves.', parameters: { type: 'object', properties: {
      className: { type: 'string' }, level: { type: 'number' }, subclass: { type: 'string', description: 'its name in the books (lookup kind class lists them)' } }, required: ['className', 'level'] } } },
    { type: 'function', function: { name: 'update_sheet', description: 'Set values on the record of the character, each by a dotted path.', parameters: { type: 'object', properties: { changes: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, value: {} }, required: ['path', 'value'] } } }, required: ['changes'] } } },
    { type: 'function', function: { name: 'add_feature', description: 'Put a feature or a feat on the Features page of the sheet, as one record. Its text comes from the books by its name; give text only for one the books do not carry, in the player\'s words. Answers the record, or why not.', parameters: { type: 'object', properties: {
      name: { type: 'string', description: 'its name in the books, e.g. "Spell Subterfuge" or "Bastion of Law"' },
      uses: { type: 'number', description: 'how many uses, when the books give a number or the player does (e.g. an ability modifier); 0 for one with no uses' },
      recovery: { type: 'string', description: 'short, long, special or sp (a sorcery point per use); passive for one that is always on' },
      text: { type: 'string', description: 'only for a feature the books do not carry: its words, paragraphs split by a blank line' } }, required: ['name'] } } },
    { type: 'function', function: { name: 'library_write', description: 'Write a feature, spell or item the books do not carry into the character\'s own library, as data in the shape of the books. It is then found by its name like one of the books: put it on the sheet with add_feature, add_spell or add_item. Writing the same name again replaces it.', parameters: { type: 'object', properties: {
      kind: { type: 'string', description: 'feature, spell or item' },
      entry: { type: 'object', description: 'feature: {name, uses, recovery (short, long, special, sp, passive), action, duration, text}. spell: {name, level 0-9, school, time, range, duration, components, concentration, ritual, classes, text}. item: {name, type (weapon, armour, shield, item), for a weapon damage "1d8", damageType, properties [..], mastery, category simple|martial, attackBonus and damageBonus (its magic bonus); for armour category light|medium|heavy and ac; for a shield ac; for an item acBonus, attackBonus, damageBonus; text}' } }, required: ['kind', 'entry'] } } },
    { type: 'function', function: { name: 'add_spell', description: 'Put a spell of the books or of the character\'s library on the spells page, in the list of its level, by its name. Its source is the character\'s class whose list holds it, unless source names another of the character\'s classes or features. A Wizard spell can be prepared at once.', parameters: { type: 'object', properties: {
      name: { type: 'string' }, source: { type: 'string', description: 'one of the character\'s classes, or a feature that grants the spell; leave it out to take the class whose list holds it' },
      prepared: { type: 'boolean', description: 'for a Wizard spell: prepared, not only in the spellbook' } }, required: ['name'] } } },
    { type: 'function', function: { name: 'add_item', description: 'Put an item of the books or of the character\'s library on the equipment page, equipped, by its name. A weapon can carry another name on the sheet and a magic bonus. Answers what the attack page will roll with it: check it.', parameters: { type: 'object', properties: {
      name: { type: 'string', description: 'its name in the books or the library, e.g. Longsword' },
      as: { type: 'string', description: 'the name it carries on the sheet, e.g. Moonblade (a weapon keeps the stats of name)' },
      bonus: { type: 'number', description: 'a magic bonus to hit and damage, e.g. 1' } }, required: ['name'] } } },
    { type: 'function', function: { name: 'create_character', description: 'Make a new character and play it: the class, the level and the subclass bring their features and saves, and the hit points follow. The conversation moves with it, and every tool after acts on the new character.', parameters: { type: 'object', properties: {
      name: { type: 'string' }, className: { type: 'string', description: 'a class of the books, e.g. Sorcerer' }, level: { type: 'number' },
      subclass: { type: 'string', description: 'its name in the books, when the level has one' },
      species: { type: 'string', description: 'a species of the books (lookup kind species)' },
      speciesChoice: { type: 'string', description: 'the option its trait asks for: the lineage, ancestry or legacy, e.g. High Elf, Red, Infernal' },
      method: { type: 'string', description: 'how the scores were made: pointbuy (27 points, 8 to 15), array (15 14 13 12 10 8) or manual (rolled, or given)' },
      abilities: { type: 'object', description: '{str, dex, con, int, wis, cha}: the scores BEFORE the background raises them' },
      background: { type: 'object', description: 'a custom background: {increase: {ability: 2, other: 1} or three abilities at 1, feat: an Origin feat, skills: [two skills], tool: a tool}' } }, required: ['name', 'className'] } } },
    { type: 'function', function: { name: 'write_theme', description: 'Make a theme of colours for this character and wear it: the ground (the background), the edges, the text, the quiet text, the accent and a second colour. It joins the themes of the settings while this character is played. Answers the contrast of the text and the accent against the ground; fix any that is too low.', parameters: { type: 'object', properties: {
      name: { type: 'string' }, blurb: { type: 'string', description: 'a few words, e.g. "Bone and grave moss"' },
      ground: { type: 'string', description: 'the background, a dark #rrggbb' }, edge: { type: 'string', description: 'borders, a little lighter than the ground' },
      ink: { type: 'string', description: 'the text, light' }, muted: { type: 'string', description: 'quiet text, between ink and ground' },
      accent: { type: 'string', description: 'the main colour of buttons and lit things' }, second: { type: 'string', description: 'the second colour (the app\'s gold: highlights, concentration)' },
      wear: { type: 'boolean', description: 'wear it now (default true)' } }, required: ['name', 'ground', 'ink', 'accent'] } } },
    { type: 'function', function: { name: 'sheet_get', description: 'Read the sheet in its language: one formula or several, split by ; , each answered with its value. E.g. "init; AC; save.dex; skill.stealth.prof; prof + dex.mod". The attributes are listed by lookup kind rule "attributes".', parameters: { type: 'object', properties: { formulas: { type: 'string' } }, required: ['formulas'] } } },
    { type: 'function', function: { name: 'sheet_set', description: 'Write attributes once, in the sheet language: "dex = 16; skill.stealth.prof = 2; hp = hpMax". Each answers its value before and after. For something a feature or an item keeps doing, use set_effect instead.', parameters: { type: 'object', properties: { sets: { type: 'string' } }, required: ['sets'] } } },
    { type: 'function', function: { name: 'set_effect', description: 'Give a feature or a worn item a lasting effect on the sheet, in the sheet language: "init + prof" (Alert), "hpMax + 2 * level" (Tough), "speed + 10", "AC + 1; save.all + 1". It is checked before it is written, and answers the values it moves, before and after. An empty effect takes it away.', parameters: { type: 'object', properties: {
      on: { type: 'string', description: 'feature or item' }, name: { type: 'string', description: 'the feature or the item as the sheet names it, or its key' }, effect: { type: 'string' } }, required: ['on', 'name', 'effect'] } } },
    { type: 'function', function: { name: 'layout_map', description: 'What a page of the app is made of, at the width of the phone: each element with its tag, id, classes, a few words, its box (x,y,width,height from the page\'s corner), and "wraps" when its children fall on several lines, "overflows" when its content is cut. Read it before style_page.', parameters: { type: 'object', properties: { page: { type: 'string', description: 'character, spells, features, equipment, attack, volley, summons, or a page of this character' } }, required: ['page'] } } },
    { type: 'function', function: { name: 'style_page', description: 'Give a page CSS rules of this character\'s own, to resize, hide (display:none), reorder (order), wrap or unwrap, or restyle what it shows. Write plain rules ("#diceBox .dcount{padding:2px}"); each selector is held inside the page by itself, @media is allowed, url() and @import are not. The rules replace the page\'s earlier ones; an empty css takes them all away. Answers what wraps or overflows afterwards.', parameters: { type: 'object', properties: { page: { type: 'string' }, css: { type: 'string' } }, required: ['page', 'css'] } } },
    { type: 'function', function: { name: 'roll_name', description: 'Give the character a name rolled by the app among the names you propose (the Randominator asks ten). Answers the name rolled.', parameters: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } }, required: ['names'] } } },
    { type: 'function', function: { name: 'write_page', description: 'Write or rewrite a page of this character, from wired attributes; mount and render (the source of JavaScript functions) only when the attributes cannot do it. Answers what the page shows and how each button did.', parameters: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, into: { type: 'string', description: 'a page of the app to put this in as a panel instead of a tab: character, spells, features, equipment, attack, volley or summons' }, at: { type: 'string', description: 'bar (the row of chips at the top of that page, the default choice for buttons, toggles and trackers), top or bottom' }, glyph: { type: 'string' }, html: { type: 'string' }, css: { type: 'string' }, mount: { type: 'string' }, render: { type: 'string' }, slice: { type: 'string' }, seed: { type: 'string' } }, required: ['id', 'title', 'html'] } } },
    { type: 'function', function: { name: 'look_at_page', description: 'Open a page and answer what it shows: its error if it broke, its text, and how each button did when pressed on a copy of the sheet.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
    { type: 'function', function: { name: 'remove_page', description: 'Take away a page this character was given.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
    { type: 'function', function: { name: 'write_backstory', description: 'Write the background of the character on its Background page, replacing what is there: at most 30 words, two short sentences, on why the character became an adventurer. The pictures are distilled from it. Longer only when the player asks for longer (long: true). Read the page first with read_sheet if the player may have written one, and keep what they wrote.', parameters: { type: 'object', properties: { text: { type: 'string', description: 'the story, at most 30 words' }, long: { type: 'boolean', description: 'true only when the player asked for a longer story' } }, required: ['text'] } } },
    { type: 'function', function: { name: 'paint_picture', description: 'Draw the character and put the picture on the Image page. The app already tells the painter the species, the background and the armour worn; you give the concept, one sentence of at most 25 words: who this person is, their attitude, and at most one telling detail placed precisely. Never weapons, never the style. A picture takes about half a minute.', parameters: { type: 'object', properties: { concept: { type: 'string', description: 'one sentence, at most 25 words' } }, required: ['concept'] } } },
    { type: 'function', function: { name: 'paint_choices', description: 'Draw three pictures and show them full screen to swipe and pick from; the one picked lands on the Image page. Give three concepts, one sentence each of at most 25 words, that are three different readings of the same character (a different age, mood and life), not one person in three poses. Put the age in each sentence. The app adds the species, background and armour, and gives each picture its own place and light.', parameters: { type: 'object', properties: { concepts: { type: 'array', items: { type: 'string' }, description: 'three sentences, three different takes' }, count: { type: 'number', description: 'how many, 2 or 3 (default 3)' } }, required: ['concepts'] } } },
    { type: 'function', function: { name: 'repaint_picture', description: 'Change one thing in the picture the character already has and keep the rest: the same face, the same pose, the same framing, the same style. change is what changes, one sentence, in the player\'s words. Use it rather than paint_picture when a picture exists and the player wants it different.', parameters: { type: 'object', properties: { change: { type: 'string', description: 'what changes, one sentence' } }, required: ['change'] } } },
    { type: 'function', function: { name: 'theme_from_picture', description: 'Read the colours of the character\'s picture and make it a theme, worn at once: the dark ground, the light ink and the accent colour of the drawing. Ask before replacing a theme the player chose.', parameters: { type: 'object', properties: { name: { type: 'string', description: 'the name of the theme, the character\'s name if left out' }, wear: { type: 'boolean', description: 'wear it now (default true)' } } } } },
  ];

  /* ---- the tools, run here ---- */

  function rec() { return api.character(); }

  function readSheet() {
    var r = rec();
    var out = {};
    ['char', 'spells', 'equipment', 'volley', 'attack', 'summons', 'backstory', 'pages'].forEach(function (k) {
      if (r[k] !== undefined) out[k] = JSON.parse(JSON.stringify(r[k]));
    });
    if (out.char) { delete out.char.history; delete out.char.dice; }
    out.pluginPages = (r.pluginPages || []).map(function (p) { return { id: p.id, title: p.title }; });
    /* What the app works out from the books, so the agent quotes the sheet
       and never a formula it remembers. */
    out.workedOut = {
      preparedSpells: ((r.char && r.char.classes) || []).map(function (k) {
        var info = (C.library.classData || []).filter(function (c) { return c.name === k.name; })[0] || {};
        return { className: k.name, level: k.level, prepares: (info.prepared || [])[(Number(k.level) || 1) - 1] || 0 };
      }).filter(function (x) { return x.prepares; }),
      hitPoints: r.char && r.char.hp,
      proficiencies: proficienciesOf(r)
    };
    (r.pluginPages || []).forEach(function (p) { if (p.slice && r[p.slice] !== undefined) out[p.slice] = r[p.slice]; });
    return out;
  }

  /* The words of an entry. A search that found a few gives each its whole
     text (a rule cut short is a rule the model fills from memory); one that
     found many gives a line of each. */
  var TEXT_ROOM = 600;
  /* What the character is trained in from its classes: all of its first
     class's, and what each class after it gives as a second class. */
  function proficienciesOf(r) {
    var out = { armour: [], weapons: [], tools: [] };
    ((r.char && r.char.classes) || []).forEach(function (k, i) {
      var info = (C.library.classData || []).filter(function (c) { return c.name === k.name; })[0] || {};
      var p = (i === 0 ? info.proficiencies : info.multiclass) || {};
      ['armour', 'weapons', 'tools'].forEach(function (key) {
        (p[key] || []).forEach(function (w) { if (out[key].indexOf(w) < 0) out[key].push(w); });
      });
    });
    if (r.char && r.char.background && r.char.background.tool) out.tools.push(r.char.background.tool);
    return out;
  }

  function textOf(blocks) {
    return (blocks || []).map(function (b) {
      if (b.t === 'table') return (b.caption ? b.caption + ': ' : '') + (b.head || []).join(' | ') + ' / ' + (b.rows || []).map(function (r) { return r.join(' | '); }).join(' / ');
      return (b.lead ? b.lead + ' ' : '') + (b.text || (b.items || []).join('; ') || '');
    }).join(' ')
      .replace(/\[\[(\w+):([^\]]*)\]\]/g, '$2').slice(0, TEXT_ROOM);
  }

  /* The file each kind of the books lives in, read before a search so an
     answer is never "not loaded yet". */
  var FILES = { spell: ['spellbook'], feature: ['features', 'classes'], feat: ['feats'], weapon: ['weapons'],
    armour: ['gear'], armor: ['gear'], item: ['gear'], 'class': ['classes'], species: ['species'], rule: ['rules'] };

  /* A search of the books. A name the books do not carry answers so, once,
     with what the books do carry nearby; the second miss of a run says to
     stop and ask the player. */
  function lookup(args) {
    var k = String(args.kind || '').toLowerCase();
    if (!FILES[k]) return Promise.resolve({ error: 'kind must be spell, feature, feat, weapon, armour, item, class, species or rule' });
    return Promise.all(FILES[k].map(function (f) { return C.library.data(f); })).then(function () {
      TEXT_ROOM = 600;
      var out = search(k, args);
      /* Two answers or fewer come with their whole text. */
      if (out.length && out.length <= 2) { TEXT_ROOM = 8000; out = search(k, args); TEXT_ROOM = 600; }
      if (out.error || (out.length !== undefined && out.length)) return out;
      RUN_MISSES += 1;
      var near = k === 'feature' && (args.className || args.subclass) ? search(k, { className: args.className, subclass: args.subclass, maxLevel: args.maxLevel }) : [];
      return {
        none: '"' + (args.query || '') + '" is not in the books' + (args.className ? ' for ' + args.className : '') + '.',
        then: RUN_MISSES >= 2
          ? 'STOP searching. Tell the player it is not in the books, and ask them what it does; or use what the books carry instead.'
          : 'Do not search again under other spellings. It may be an older printing: the books carry the 2024 names. Use what is listed in "carried", or ask the player what it does.',
        carried: near.slice ? near.slice(0, 40).map(function (f) { return f.name + ' (level ' + f.level + (f.subclass ? ', ' + f.subclass : '') + ')'; }) : []
      };
    });
  }

  function search(k, args) {
    var q = String(args.query || '').toLowerCase().trim();
    var hit = function (name) { return !q || String(name || '').toLowerCase().indexOf(q) >= 0; };
    var out = [];
    if (k === 'spell') {
      (C.library.book.spells || []).filter(function (s) { return hit(s.name); }).slice(0, 8).forEach(function (s) {
        out.push({ name: s.name, level: s.level, school: s.school, time: s.time, range: s.range, duration: s.duration, classes: s.classes, text: textOf(s.blocks) });
      });
    } else if (k === 'feature') {
      var cls = String(args.className || '').toLowerCase();
      var sub = String(args.subclass || '').toLowerCase();
      var lo = Number(args.minLevel) || 0;
      var hi = Number(args.maxLevel) || 20;
      var all = (C.library.features.features || []).filter(function (f) {
        if (!hit(f.name)) return false;
        if (cls && String(f.class || '').toLowerCase() !== cls) return false;
        if (sub && String(f.subclass || '').toLowerCase().indexOf(sub) < 0 && sub.indexOf(String(f.subclass || '~').toLowerCase()) < 0) return false;
        if (!sub && cls && f.subclass && !q) return false;   /* a class asked alone is its own features */
        var lv = Number(f.level) || 0;
        return lv >= lo && lv <= hi;
      }).sort(function (a, b) { return (a.level || 0) - (b.level || 0); });
      /* Many answers come as a list of names; a few come with their text. */
      all.slice(0, all.length > 8 ? 60 : 8).forEach(function (f) {
        var row = { key: f.key, name: f.name, class: f.class, subclass: f.subclass, level: f.level };
        if (all.length <= 8) row.text = textOf(f.blocks);
        out.push(row);
      });
    } else if (k === 'feat') {
      var found = FEATS.filter(function (f) { return hit(f.name) || hit(f.category); });
      /* Many come as names (all the Origin feats, say); a few with their text. */
      found.slice(0, found.length > 8 ? 60 : 8).forEach(function (f) {
        var row = { name: f.name, category: f.category, prerequisite: f.prerequisite };
        if (found.length <= 8) row.text = textOf(f.blocks);
        out.push(row);
      });
    } else if (k === 'weapon') {
      (C.library.weapons || []).filter(function (w) { return hit(w.name); }).slice(0, 8).forEach(function (w) {
        out.push({ name: w.name, kind: w.kind, damage: w.damage, damageType: w.damageType, properties: w.properties, mastery: w.mastery });
      });
    } else if (k === 'armour' || k === 'armor' || k === 'item') {
      var g = C.library.gear || { armour: [], magic: [] };
      (k === 'item' ? g.magic : g.armour).filter(function (a) { return hit(a.name); }).slice(0, 8).forEach(function (a) {
        out.push({ name: a.name, source: a.source, category: a.category || a.kind, ac: a.ac, dex: a.dex, acBonus: a.acBonus,
          attackBonus: a.attackBonus, damageBonus: a.damageBonus, text: textOf(a.blocks) });
      });
    } else if (k === 'species') {
      C.library.species.filter(function (x) { return hit(x.name); }).slice(0, 4).forEach(function (x) {
        out.push({ name: x.name, size: x.size, speed: x.speed, darkvision: x.darkvision, type: x.type,
          traits: x.traits.map(function (t) {
            var row = { name: t.name, text: textOf(t.blocks) };
            if (t.choice) row.choose = { label: t.choice.label, options: t.choice.options.map(function (o) { return o.name + ': ' + o.gives; }) };
            return row;
          }) });
      });
    } else if (k === 'rule') {
      var R = C.library.rules;
      (R.rules || []).filter(function (x) { return hit(x.name) || hit(textOf(x.blocks)); }).slice(0, 4).forEach(function (x) {
        out.push({ name: x.name, text: textOf(x.blocks) });
      });
      if (out.length && R.pointBuy && /point|array|abilit|background|origin|creat/i.test(args.query || '')) out.push({ numbers: { pointBuy: R.pointBuy, standardArray: R.standardArray, backgroundIncrease: R.backgroundIncrease, customBackground: R.customBackground } });
      /* The language of the sheet answers with every attribute it knows. */
      if (/attribut|effect|formula|language|sheet|set|key/i.test(args.query || '')) out.push({ attributes: C.SR.attributeList() });
    } else if (k === 'class') {
      (C.library.classData || []).filter(function (c) { return hit(c.name); }).slice(0, 4).forEach(function (c) {
        out.push({ name: c.name, hd: c.hd, saves: c.saves, ability: c.ability, caster: c.caster,
          /* the Prepared Spells column of the class table, levels 1 to 20 */
          preparedByLevel: c.prepared || [],
          /* armour, weapons, tools and the skills to choose at level 1, and
             what the class gives as a second class */
          proficiencies: c.proficiencies || null,
          asSecondClass: c.multiclass || null,
          subclasses: (c.subclasses || []).map(function (s) { return s.name + (s.short && s.short !== s.name ? ' (' + s.short + ')' : ''); }) });
      });
    }
    return out;
  }

  /* A class at a level: its entry on the sheet set, and every feature of
     the class and its subclass up to that level put on the sheet, the way
     the creator gives them. What the sheet already holds stays as it is. */
  function setClass(args) {
    return Promise.all([C.library.data('classes'), C.library.data('features')]).then(function () {
      var want = String(args.className || '').toLowerCase();
      var info = (C.library.classData || []).filter(function (c) { return c.name.toLowerCase() === want; })[0];
      if (!info) return { error: 'no class "' + args.className + '": one of ' + (C.library.classData || []).map(function (c) { return c.name; }).join(', ') };
      var level = Math.max(1, Math.min(20, Math.floor(Number(args.level) || 1)));
      var sub = null;
      if (args.subclass) {
        var w = String(args.subclass).toLowerCase();
        sub = (info.subclasses || []).filter(function (x) { return x.name.toLowerCase() === w || String(x.short || '').toLowerCase() === w; })[0];
        if (!sub) return { error: 'no subclass "' + args.subclass + '" for ' + info.name + ': one of ' + (info.subclasses || []).map(function (x) { return x.name; }).join(', ') };
      }
      var ch = rec().char;
      ch.classes = Array.isArray(ch.classes) ? ch.classes : [];
      var row = ch.classes.filter(function (c) { return c.name === info.name; })[0];
      if (!row) { row = { name: info.name, level: level, subclass: '' }; ch.classes.push(row); }
      row.level = level;
      if (sub) row.subclass = sub.name;
      var subName = row.subclass;
      var subShort = subName ? ((info.subclasses || []).filter(function (x) { return x.name === subName; })[0] || {}).short : '';
      ch.level = ch.classes.reduce(function (n, c) { return n + (Number(c.level) || 0); }, 0);
      ch.features = Array.isArray(ch.features) ? ch.features : [];
      var have = {};
      ch.features.forEach(function (f) { have[f.key] = true; have['name:' + norm(f.name)] = true; });
      var added = [];
      (C.library.features.features || []).forEach(function (f) {
        if (f.class !== info.name || Number(f.level) > level) return;
        if (/subclass$/i.test(f.name)) return;
        if (f.subclass) {
          if (!subShort || f.subclass !== subShort) return;
          if (f.name === subName || f.name === subShort) return;
        }
        if (have[f.key] || have['name:' + norm(f.name)]) return;
        ch.features.push({ key: f.key, name: f.name, source: f.subclass || f.class, active: !!f.active, max: f.uses || 0, left: f.uses || 0,
          recovery: f.recovery || 'passive', cost: f.cost || '', short: null, hidden: !!f.hidden });
        have[f.key] = true;
        added.push(f.name + ' (' + f.level + ')');
      });
      api.save();
      api.refresh();
      return { classes: ch.classes, level: ch.level, added: added,
        note: 'Hit points, slots and class counters follow by themselves. Ability score improvements and spells are choices: ask the player.' };
    });
  }

  function norm(name) {
    return String(name || '').toLowerCase().replace(/^feat:\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /* A feature as one record: the book's entry when there is one (a class
     feature keeps its key, so the class plugins and the counters know it),
     the player's words when there is not. The Features page reads its text
     from the books by its name, so nothing of it is written by hand. */
  function addFeature(args) {
    /* The books are read on first need: the tool waits for both. */
    return Promise.all([C.library.data('feats'), C.library.data('features')]).then(function () { return addFromBooks(args); });
  }

  function addFromBooks(args) {
    var n = norm(args.name);
    if (!n) return { error: 'a feature needs a name' };
    var feat = C.library.feats.filter(function (x) { return norm(x.name) === n; })[0];
    var book = feat ? null : (C.library.features.features || []).filter(function (x) { return norm(x.name) === n; })[0];
    if (!feat && !book) {
      if (!(args.text && String(args.text).trim())) return { error: 'no feature or feat named "' + args.name + '" in the books or the library: check the name with lookup, or ask the player for its words and write it with library_write' };
      /* Its words go to the library, and the sheet points at them. */
      var w = C.own.write(rec(), 'feature', { name: args.name, uses: args.uses, recovery: args.recovery || 'long', text: args.text });
      if (w.error) return w;
      api.refresh();
      book = w.entry;
    }
    var list = rec().char.features = rec().char.features || [];
    var slug = n.replace(/ /g, '-');
    var key = book ? book.key : (feat ? 'feat-' : 'own-') + slug;
    if (list.some(function (f) { return f.key === key; })) return { error: 'the sheet already has ' + args.name + ' (key ' + key + '): change its uses with update_sheet' };
    var recovery = String(args.recovery || (book && book.recovery) || '').toLowerCase();
    var uses = args.uses !== undefined ? Number(args.uses) || 0 : (book && book.uses) || 0;
    if (recovery === 'passive' || (!uses && recovery !== 'sp')) { recovery = recovery === 'sp' ? 'sp' : 'passive'; }
    var row = {
      key: key,
      name: feat ? feat.name : book ? book.name : String(args.name).trim(),
      source: feat ? 'Feat' : book ? book.source : 'Feat',
      active: recovery !== 'passive',
      max: uses,
      left: uses,
      recovery: recovery || 'long',
      cost: recovery === 'sp' ? 'sp' : '',
      short: null,
      hidden: false
    };
    list.push(row);
    api.save();
    api.refresh();
    return { added: row, text: feat || book ? 'from the books, shown when the card is opened on the Features page' : 'the player\'s words' };
  }

  /* A new character, played at once; the conversation goes with it, so the
     player keeps reading it on the new character's agent page. */
  function createCharacter(args) {
    var moving = session();
    return api.createCharacter(args).then(function (made) {
      if (made.error) return made;
      SESSIONS.list = SESSIONS.list.filter(function (x) { return x.id !== moving.id; });
      if (!SESSIONS.list.length) SESSIONS.list.push(newSession());
      SESSIONS.current = SESSIONS.list[0].id;
      keep();
      SESSIONS = null;
      loadSessions();
      if (SESSIONS.list.length === 1 && !SESSIONS.list[0].log.length) SESSIONS.list = [];
      SESSIONS.list.unshift(moving);
      open(moving.id);
      keep();
      backedUp = false;
      api.show('agent');
      return { created: made, next: 'every tool now acts on ' + made.name + '; read_sheet to see it' };
    });
  }

  /* ---- a theme of the character's own ----

     A theme is colours only: the variables the app paints with. It travels
     in a hidden page of the character, the way a package brings a theme, so
     it is in the settings while the character is played and goes with it. */
  function hex(c) {
    var m = String(c || '').trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!m) return '';
    var h = m[1].length === 3 ? m[1].split('').map(function (x) { return x + x; }).join('') : m[1];
    return '#' + h.toLowerCase();
  }

  function rgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }

  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return '#' + x.map(function (v, i) { return ('0' + Math.round(v + (y[i] - v) * t).toString(16)).slice(-2); }).join('');
  }

  /* The contrast of two colours, as WCAG counts it. */
  function contrast(a, b) {
    function lum(h) {
      return rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
        .reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
    }
    var l1 = lum(a), l2 = lum(b);
    return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 10) / 10;
  }

  /* The look of a picture the fairy draws: one style for the whole table, so
     two characters of a campaign sit together. The model says what to draw
     and never how. */
  var PICTURE_STYLE = 'hand-drawn ink and watercolour illustration, as if sketched by hand in a fantasy artist\'s sketchbook: visible pen strokes and pencil hatching, loose and slightly uneven hand-inked linework, construction lines left in places, watercolour washes that bleed past the lines, textured cold-press paper grain, high fantasy, muted parchment and oxblood palette with a single accent colour, dark neutral ground';

  /* What the hand-drawn look must not become: the gloss of a digital
     painting is what the models fall back to. */
  var PICTURE_NOT = ['not a digital painting', 'no airbrushed smoothness', 'no 3D render', 'no photorealism', 'no glossy highlights'];

  /* The picture model is not clever: every word of a brief is drawn, all of
     it, somewhere. So a brief is short. The app says who sits for the
     picture from the sheet (the species and its lineage, the background,
     the armour worn: never the weapons, which come out pasted onto nothing),
     the fairy gives one sentence of concept, and the app deals the rest
     from lists so three pictures are three takes and not one in three
     poses. The story stays with the fairy, who reads it and distills it. */
  function sitter() {
    var r = rec();
    var ch = r.char || {};
    var bits = [];
    var sp = String(ch.species || '').trim();
    var lin = String(ch.speciesChoice || '').trim();
    if (sp) bits.push(lin && lin.toLowerCase().indexOf(sp.toLowerCase()) < 0 ? lin + ' ' + sp : (lin || sp));
    var bg = ch.background && ch.background.name;
    if (bg && !/^custom$/i.test(bg)) bits.push('once a ' + String(bg).toLowerCase());
    var worn = (((r.equipment || {}).items) || []).filter(function (it) {
      return it && it.equipped && it.category === 'armour' && String(it.name || '').trim();
    }).map(function (it) { return String(it.name).toLowerCase(); });
    if (worn.length) bits.push('wearing ' + worn.slice(0, 2).join(' and '));
    return bits.join(', ');
  }

  /* What one picture is free to be, dealt so no two of a set share it. */
  var TAKES = {
    age: ['young, barely grown into the role', 'in the prime of life', 'weathered, past the middle of life', 'old, and still on the road'],
    /* A place carries its own light, so the two never argue. */
    setting: ['a rain-dark city street at dusk, lamplight', 'beside a campfire at night', 'a dusty archive, candlelight from one side', 'a windswept moor under a grey sky',
      'a smoky tavern corner, firelight', 'a forest edge at dawn, low gold light', 'a busy harbour on an overcast morning', 'a ruined chapel, light through a broken window',
      'a snowy mountain pass, cold bright light', 'a crowded market at noon']
  };

  function dealt(list, n) {
    var pool = list.slice();
    var out = [];
    while (out.length < n && pool.length) {
      var k = C.rng ? C.rng(pool.length) : Math.floor(Math.random() * pool.length);
      out.push(pool.splice(k, 1)[0]);
    }
    return out;
  }

  function portrait(concept, take) {
    var brief = {
      asset: 'character portrait',
      who: sitter() || 'an adventurer',
      concept: concept,
      view: 'bust, three-quarter view, centered',
      style: PICTURE_STYLE,
      exclusions: ['no text', 'no watermark', 'no frame', 'one person only', 'no weapons'].concat(PICTURE_NOT)
    };
    if (take && take.age) brief.age = take.age;
    if (take && take.setting) brief.setting = take.setting;
    return brief;
  }

  function conceptOf(args) {
    return String((args && (args.concept || args.subject)) || '').trim().slice(0, 300);
  }

  function writeBackstory(args) {
    var text = String((args && args.text) || '').trim();
    if (!text) return { error: 'write_backstory needs the text' };
    var words = text.split(/\s+/).length;
    /* Thirty words read at a glance across the table, and a story that
       short is one the fairy can still distill into a picture. */
    if (words > 40 && !(args && args.long)) return { error: 'the background is ' + words + ' words: write it again in at most 30, two short sentences' };
    if (text.length > 4000) return { error: 'the background is ' + text.length + ' characters: that is too long for the page' };
    backup();
    var r = rec();
    C.rest.push(r);
    r.backstory = { text: text };
    /* The page shows itself on the character that has a story. */
    if (Array.isArray(r.pages) && r.pages.indexOf('backstory') < 0) {
      var at = r.pages.indexOf('agent');
      if (at < 0) r.pages.push('backstory'); else r.pages.splice(at, 0, 'backstory');
    }
    api.save();
    api.refresh();
    return { written: true, page: 'backstory', words: words, note: 'distill it into the concept of a picture; do not paste it' };
  }

  /* The picture of the character as the sheet holds it: the fitted webp, or
     nothing yet. */
  function pictureNow() {
    var img = rec().image;
    return (img && typeof img.data === 'string' && img.data) || '';
  }

  /* One picture, drawn or changed by the machine that serves the app, kept
     the way a chosen one is: fitted to 720 px, moved beside the store, and
     one step of the history, so the back key takes it back. A change carries
     the picture the sheet already has, and the brief says what must not
     move: the face is what makes a repaint a repaint. */
  function drawPicture(brief, image) {
    var base = (RUN && RUN.url) || (C.exchange.server() + '/agent');
    var url = String(base).replace(/\/agent$/, '/paint');
    return lasting(C.exchange.postJson(url, { prompt: JSON.stringify(brief), image: image || '' }), 240000).then(function (json) {
      if (!json || !json.data) throw new Error('the picture did not come back');
      return C.images.fit(json.data);
    }).then(function (small) {
      if (!small) throw new Error('the picture could not be fitted for the store');
      backup();
      var r = rec();
      C.rest.push(r);
      if (!r.image || typeof r.image !== 'object') r.image = { data: '' };
      /* The picture store writes a picture beside the store by itself and
         marks it apart once it is there; marking it here meant the store
         skipped the write and the picture lived in memory only, so the next
         launch of the app found the mark and an empty slot. */
      r.image.data = small;
      api.save();
      api.refresh();
      return { painted: true, page: 'image', style: 'hand-drawn ink and watercolour, high fantasy',
        note: 'a tap on the name in the banner shows it full screen, and the back key takes it back. theme_from_picture makes a theme of its colours' };
    });
  }

  function paintPicture(args) {
    var concept = conceptOf(args);
    if (!concept) return { error: 'paint_picture needs a concept' };
    return drawPicture(portrait(concept, null), '');
  }

  /* Two or three pictures to pick from: one take of the fairy's each, with
     an age, a place and a light the app deals apart. They are shown full
     screen to be swiped and picked from, and only the picked one is kept. */
  function paintChoices(args) {
    var concepts = (Array.isArray(args && args.concepts) ? args.concepts : [])
      .map(function (x) { return String(x || '').trim().slice(0, 300); }).filter(Boolean);
    var one = conceptOf(args);
    if (!concepts.length && one) concepts = [one];
    if (!concepts.length) return { error: 'paint_choices needs concepts: three sentences, three different takes on the character' };
    var count = Math.max(2, Math.min(3, Math.floor(Number(args.count) || 3)));
    var ages = dealt(TAKES.age, count), settings = dealt(TAKES.setting, count);
    /* Three takes of the fairy's carry their own ages; one take repeated
       needs the app's. */
    var ownAges = concepts.length >= count;
    var base = (RUN && RUN.url) || (C.exchange.server() + '/agent');
    var url = String(base).replace(/\/agent$/, '/paint');
    var made = [];
    var chain = Promise.resolve();
    for (var i = 0; i < count; i++) {
      chain = chain.then(function (ix) {
        /* The fairy's take for this picture, or its one take again with a
           different age, place and light: the app's dealing is what keeps
           the set apart when the fairy did not. */
        var brief = portrait(concepts[ix % concepts.length], { age: ownAges ? '' : ages[ix], setting: settings[ix] });
        return lasting(C.exchange.postJson(url, { prompt: JSON.stringify(brief) }), 240000).then(function (json) {
          return json && json.data ? C.images.fit(json.data) : '';
        }).then(function (small) { if (small) made.push(small); });
      }.bind(null, i));
    }
    return chain.then(function () {
      if (!made.length) return { error: 'no picture came back' };
      api.gallery(made, function (chosen) {
        backup();
        var r = rec();
        C.rest.push(r);
        if (!r.image || typeof r.image !== 'object') r.image = { data: '' };
        r.image.data = chosen;
        api.save();
        api.refresh();
        api.toast('The picture is on the Image page');
      });
      return { shown: made.length,
        note: 'the pictures are on the screen: swipe between them and tap Pick for the one that suits, and it becomes the picture on the Image page' };
    });
  }

  function repaintPicture(args) {
    var change = String((args && args.change) || '').trim().slice(0, 1200);
    if (!change) return { error: 'repaint_picture needs a change' };
    var now = pictureNow();
    if (!now) return { error: 'the character has no picture yet: paint one with paint_picture first' };
    return drawPicture({
      asset: 'the same character portrait, changed as asked',
      subject: change,
      keep: 'the same face, the same pose, the same framing and the same hand-drawn ink and watercolour style; only the change asked for is new',
      style: PICTURE_STYLE,
      priority_emphasis: ['one character only', 'the face stays the same person'],
      exclusions: ['no text', 'no watermark', 'no frame', 'no second character', 'no change to the face'].concat(PICTURE_NOT)
    }, now);
  }

  /* Two numbers the theme writer has no use for and a palette does: how light
     a colour reads on the WCAG curve, and how far it sits from grey. */
  function lightOf(h) {
    return rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }

  function satOf(h) {
    var v = rgb(h).map(function (x) { return x / 255; });
    var hi = Math.max.apply(null, v), lo = Math.min.apply(null, v);
    return hi <= 0 ? 0 : (hi - lo) / hi;
  }

  function hexOf(r, g, b) {
    return '#' + [r, g, b].map(function (v) { return ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2); }).join('');
  }

  /* How far apart two colours are, summed over the three channels: enough to
     tell a second colour of the picture from an echo of the first. */
  function spaced(a, b) {
    var x = rgb(a), y = rgb(b);
    return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
  }

  /* The colours of a picture, read on a 32 px copy so a paint never waits on
     a big canvas: the darkest buckets are the ground, the lightest the ink,
     the busiest saturated one the accent, and the next one far enough away
     the second colour. It answers what the theme writer wants, or null when
     the pixels cannot be read. */
  function paletteOf(dataUrl) {
    return new Promise(function (done) {
      var text = String(dataUrl || '');
      if (text.indexOf('data:image/') !== 0) { done(null); return; }
      var img = new Image();
      img.onload = function () {
        try {
          var n = 32;
          var canvas = document.createElement('canvas');
          canvas.width = n;
          canvas.height = n;
          var ctx = canvas.getContext('2d');
          if (!ctx) { done(null); return; }
          ctx.drawImage(img, 0, 0, n, n);
          var px = ctx.getImageData(0, 0, n, n).data;
          var buckets = {}, i;
          for (i = 0; i < px.length; i += 4) {
            if (px[i + 3] < 200) continue;
            var key = (px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4);
            var one = buckets[key] || (buckets[key] = { r: 0, g: 0, b: 0, n: 0 });
            one.r += px[i]; one.g += px[i + 1]; one.b += px[i + 2]; one.n += 1;
          }
          var list = Object.keys(buckets).map(function (k) {
            var one = buckets[k];
            var c = hexOf(Math.round(one.r / one.n), Math.round(one.g / one.n), Math.round(one.b / one.n));
            return { hex: c, n: one.n, l: lightOf(c), s: satOf(c) };
          });
          if (list.length < 3) { done(null); return; }
          list.sort(function (a, b) { return a.l - b.l; });
          function mean(of) {
            var sum = [0, 0, 0];
            of.forEach(function (c) { var v = rgb(c.hex); sum[0] += v[0]; sum[1] += v[1]; sum[2] += v[2]; });
            return hexOf(Math.round(sum[0] / of.length), Math.round(sum[1] / of.length), Math.round(sum[2] / of.length));
          }
          var dark = list.slice(0, Math.max(1, Math.round(list.length * 0.15)));
          var light = list.slice(-Math.max(1, Math.round(list.length * 0.12)));
          var ground = mix(mean(dark), '#050308', 0.55);
          var ink = mix(mean(light), '#ffffff', 0.62);
          var busy = list.slice().sort(function (a, b) { return (b.s * Math.sqrt(b.n)) - (a.s * Math.sqrt(a.n)); });
          var accent = (busy.filter(function (c) { return c.l > 0.08 && c.l < 0.8; })[0] || busy[0] || { hex: '#9b7bff' }).hex;
          var far = busy.filter(function (c) { return c.hex !== accent && spaced(c.hex, accent) > 110; })[0];
          var second = far ? far.hex : mix(accent, '#ffffff', 0.45);
          /* The second colour lights highlights, so it may not come back as
             another dark: take the accent's own hue, lightened, which is what
             the theme writer does when a colour is left out. */
          if (lightOf(second) < 0.3) second = mix(accent, '#ffffff', 0.45);
          var lift = 0;
          while (lightOf(second) < 0.3 && lift < 3) { second = mix(second, '#ffffff', 0.35); lift += 1; }
          var tries = 0;
          while (contrast(accent, ground) < 3 && tries < 4) { accent = mix(accent, '#ffffff', 0.28); tries += 1; }
          done({ ground: ground, ink: ink, accent: accent, second: second });
        } catch (e) {
          done(null);
        }
      };
      img.onerror = function () { done(null); };
      img.src = text;
    });
  }

  /* A theme of the picture the character wears: its ground, its ink and its
     accent, with the writer's own edges and quiet text and its contrast
     report, so a low one is fixed rather than kept. */
  function themeFromPicture(args) {
    var data = pictureNow();
    if (!data) return { error: 'the character has no picture yet: paint one with paint_picture first' };
    return paletteOf(data).then(function (colours) {
      if (!colours) return { error: 'the picture could not be read for its colours' };
      var name = String((args && args.name) || (rec().char && rec().char.name) || 'Picture').trim().slice(0, 20) + ' ink';
      var out = writeTheme({ name: name, ground: colours.ground, ink: colours.ink, accent: colours.accent, second: colours.second, wear: !(args && args.wear === false) });
      if (out && out.made) out.from = 'the picture';
      return out;
    });
  }

  function writeTheme(args) {
    var ground = hex(args.ground), ink = hex(args.ink), accent = hex(args.accent);
    if (!ground || !ink || !accent) return { error: 'ground, ink and accent are colours like #1a0f12' };
    var second = hex(args.second) || mix(accent, '#ffffff', 0.45);
    var edge = hex(args.edge) || mix(ground, ink, 0.18);
    var muted = hex(args.muted) || mix(ink, ground, 0.42);
    var name = String(args.name || 'Theme').trim().slice(0, 30);
    var id = 'own' + name.replace(/[^A-Za-z0-9]+/g, '').slice(0, 24);
    if (id === 'own') return { error: 'a theme needs a name of letters or digits' };
    var theme = {
      id: id, label: name, blurb: String(args.blurb || 'Made by a fairy').slice(0, 60), swatch: [ground, accent, second],
      vars: { '--void': ground, '--edge': edge, '--ink': ink, '--muted': muted,
        '--arcane': accent, '--arcane-rgb': rgb(accent).join(','), '--gold': second, '--gold-rgb': rgb(second).join(',') }
    };
    var out = api.installPage({ id: 'theme-' + id.toLowerCase().slice(3, 27) || 'theme-own', title: name, hidden: true, html: '', themes: [theme] });
    if (!out.ok) return { error: out.why || 'the theme did not register' };
    if (args.wear !== false) rec().theme = id;
    api.save();
    api.refresh();
    var checks = { text: contrast(ink, ground), quietText: contrast(muted, ground), accent: contrast(accent, ground) };
    var low = [];
    if (checks.text < 7) low.push('the text is ' + checks.text + ':1 on the ground, under 7: lighten ink or darken the ground');
    if (checks.quietText < 4.5) low.push('the quiet text is ' + checks.quietText + ':1, under 4.5: lighten muted');
    if (checks.accent < 3) low.push('the accent is ' + checks.accent + ':1, under 3: it will not read as a button');
    return { made: name, id: id, worn: args.wear !== false, colours: theme.vars, contrast: checks, fix: low };
  }

  /* ---- the sheet language ---- */

  function split(text) {
    return String(text || '').split(/[;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function sheetGet(formulas) {
    var out = {};
    split(formulas).forEach(function (f) {
      try { out[f] = C.SR.sheetGet(rec(), f); } catch (e) { out[f] = 'error: ' + e.message; }
    });
    return out;
  }

  function sheetSetAll(sets) {
    var done = [], errors = [];
    split(sets).forEach(function (st) {
      try { done.push(C.SR.sheetSet(rec(), st)); } catch (e) { errors.push(st + ': ' + e.message); }
    });
    api.save(); api.refresh();
    return { done: done, errors: errors };
  }

  /* The values an effect moves, read now. */
  function targetsOf(text) {
    var out = {};
    C.SR.effectLines(text).forEach(function (l) {
      if (!l.target) return;
      var names = l.target === 'save.all' ? ['save.str', 'save.dex', 'save.con', 'save.int', 'save.wis', 'save.cha'] : [l.target];
      names.forEach(function (n) { try { out[n] = C.SR.sheetGet(rec(), n); } catch (e) { out[n] = '?'; } });
    });
    return out;
  }

  function setEffect(args) {
    var r = rec();
    var text = String(args.effect || '').trim();
    var problems = C.SR.effectCheck(text, r.char, r);
    if (problems.length) return { error: problems.join('; ') };
    var n = norm(args.name);
    var on = String(args.on || '').toLowerCase();
    var list = on === 'item' ? ((r.equipment || {}).items || []) : (r.char.features || []);
    var row = list.filter(function (x) { return x.key === args.name || x.id === args.name || norm(x.name) === n; })[0];
    if (!row) return { error: 'no ' + (on === 'item' ? 'item' : 'feature') + ' "' + args.name + '" on the sheet: one of ' + list.map(function (x) { return x.name; }).join(', ') };
    var old = row.effect || '';
    var before = targetsOf(text || old);
    if (text) row.effect = text; else delete row.effect;
    api.save(); api.refresh();
    var after = targetsOf(text || old);
    return { on: row.name, effect: text || '(none)', was: old || '(none)', before: before, after: after,
      note: on === 'item' && !row.equipped ? 'the item is stowed: its effect counts once it is worn' : '' };
  }

  /* The map of a page, read with the page on screen and the fairy shown
     again after. */
  function mapOf(page) {
    var id = String(page || '');
    if (!api.pages.some(function (p) { return p.id === id; })) return Promise.resolve({ error: 'no page ' + id });
    api.show(id);
    return wait(250).then(function () {
      var m = api.layoutMap(id);
      api.show('agent');
      return m;
    });
  }

  function addSpell(args) {
    var name = args.name;
    return C.library.data('spellbook').then(function () {
      api.refresh();
      var n = norm(name);
      var s = (C.library.book.spells || []).filter(function (x) { return norm(x.name) === n; })[0];
      if (!s) return { error: 'no spell named "' + name + '" in the books or the library: check it with lookup, or write it with library_write' };
      var sp = rec().spells;
      sp.lists = sp.lists || {};
      var list = sp.lists[s.level] = sp.lists[s.level] || [];
      if (list.indexOf(s.name) >= 0) return { error: s.name + ' is already in the level ' + s.level + ' list' };
      list.push(s.name);
      /* The source is the character's own: the class asked for, else its
         class whose list holds the spell, else its first class. Never the
         book's, which is the source of the character the book was built for. */
      var mine = (rec().char.classes || []).map(function (c) { return c.name; });
      var sources = mine.concat((rec().char.features || []).map(function (f) { return f.source; }));
      var asked = args.source ? sources.filter(function (x) { return norm(x) === norm(args.source); })[0] : '';
      if (args.source && !asked) return { error: 'the source "' + args.source + '" is not a class or a feature of this character: one of ' + sources.filter(Boolean).filter(function (x, i, l) { return l.indexOf(x) === i; }).join(', ') };
      var src = asked || mine.filter(function (c) { return (s.classes || []).indexOf(c) >= 0; })[0] || mine[0] || '';
      sp.sources = sp.sources || {};
      if (src) sp.sources[s.name] = src;
      if (args.prepared && src === 'Wizard' && s.level > 0) { sp.prepared = sp.prepared || {}; sp.prepared[s.name] = true; }
      api.save(); api.refresh();
      return { added: s.name, level: s.level, source: src, prepared: !!(sp.prepared && sp.prepared[s.name]) };
    });
  }

  function addItem(args) {
    var name = args.name;
    return Promise.all([C.library.data('weapons'), C.library.data('gear')]).then(function () {
      api.refresh();
      var row = C.library.gearRow ? C.library.gearRow(name) : null;
      if (!row) return { error: 'no item named "' + name + '" in the books or the library: check it with lookup, or write it with library_write' };
      if (args.as && String(args.as).trim()) {
        if (row.category === 'weapon') row.base = row.name;
        row.name = String(args.as).trim();
      }
      if (args.bonus !== undefined && row.category === 'weapon') { row.attackBonus = Number(args.bonus) || 0; row.damageBonus = Number(args.bonus) || 0; }
      rec().equipment = rec().equipment || {};
      rec().equipment.items = rec().equipment.items || [];
      rec().equipment.items.push(row);
      api.save(); api.refresh();
      /* What the attack page will roll, so the fairy reports what is so. */
      var w = C.library.weaponOf ? C.library.weaponOf(row) : null;
      return { added: row, attackRolls: row.category !== 'weapon' ? 'not a weapon'
        : w ? w.damage + (w.damageBonus ? '+' + w.damageBonus : '') + ' ' + w.damageType + ', +' + w.attackBonus + ' to hit on top of the ability and proficiency'
        : 'NOTHING: the attack page cannot read its damage. Give it a weapon of the books (name) or write it in the library with its damage.' };
    });
  }

  var WRITABLE = ['char', 'spells', 'equipment', 'volley', 'attack', 'summons'];

  /* A run copies the character aside before its first change, where the
     model cannot reach, so the whole run can be undone. */
  var backedUp = false;
  function backup() {
    if (backedUp) return;
    backedUp = true;
    /* The copy names the session that made it: only that session offers
       to undo, so an older one cannot take back a newer run. */
    undoOwner = SESSIONS ? SESSIONS.current : '';
    try { localStorage.setItem(BACKUP + api.state.current, JSON.stringify({ session: undoOwner, rec: rec() })); } catch (e) { /* the store is full: the history still holds the steps */ }
  }

  function updateSheet(changes) {
    var r = rec();
    var own = (r.pluginPages || []).map(function (p) { return p.slice || p.id; });
    var done = [], refused = [];
    (changes || []).forEach(function (c) {
      var parts = String(c.path || '').split('.').filter(Boolean);
      if (!parts.length || (WRITABLE.indexOf(parts[0]) < 0 && own.indexOf(parts[0]) < 0) || /^(__proto__|prototype|constructor)$/.test(parts.join('|'))) {
        refused.push(c.path);
        return;
      }
      var at = r;
      for (var i = 0; i < parts.length - 1; i++) {
        if (at[parts[i]] === undefined || at[parts[i]] === null || typeof at[parts[i]] !== 'object') at[parts[i]] = {};
        at = at[parts[i]];
      }
      at[parts[parts.length - 1]] = c.value;
      done.push(c.path);
    });
    api.save();
    api.refresh();
    return { set: done, refused: refused };
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function textOfView(id) {
    var section = document.getElementById('view-' + id);
    return section ? section.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  /* Every button of the page pressed once, each on the sheet as it was: what
     it threw, whether it changed the sheet, and whether the page showed it.
     The sheet is put back after each press. */
  function pressAll(id) {
    var section = document.getElementById('view-' + id);
    var list = section ? Array.prototype.slice.call(section.querySelectorAll('button')).slice(0, 16) : [];
    var out = [];
    var chain = Promise.resolve();
    list.forEach(function (b, i) {
      chain = chain.then(function () {
        var label = (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim() || 'button ' + (i + 1);
        if (b.disabled) { out.push(label + ': off (cannot act now)'); return; }
        var before = JSON.stringify(rec());
        var shown = textOfView(id);
        var thrown = '';
        function caught(ev) { thrown = thrown || String((ev.error && ev.error.message) || ev.message || 'an error'); }
        window.addEventListener('error', caught);
        try { b.click(); } catch (e) { thrown = String((e && e.message) || e); }
        return wait(80).then(function () {
          window.removeEventListener('error', caught);
          api.show(id);
          var changed = JSON.stringify(rec()) !== before;
          var repainted = textOfView(id) !== shown;
          var verdict = thrown ? 'threw: ' + thrown
            : changed && repainted ? 'works'
            : changed ? 'changed the sheet, but nothing on the page changed: paint that value'
            : repainted ? 'works (the page changed)'
            : 'did nothing';
          out.push(label + ': ' + verdict);
          if (changed) {
            var r = rec();
            var was = JSON.parse(before);
            Object.keys(r).forEach(function (k) { if (!(k in was)) delete r[k]; });
            Object.keys(was).forEach(function (k) { r[k] = was[k]; });
            api.save();
            api.refresh();
          }
        });
      });
    });
    return chain.then(function () { return out; });
  }

  function lookAt(id) {
    var here = api.pages.some(function (p) { return p.id === id; });
    if (!here) return Promise.resolve({ error: 'no page ' + id });
    api.show(id);
    return wait(250).then(function () {
      var section = document.getElementById('view-' + id);
      var error = api.pageError(id);
      var text = section ? section.textContent.replace(/\s+/g, ' ').trim().slice(0, 800) : '';
      return (error ? Promise.resolve([]) : pressAll(id)).then(function (buttons) {
        api.show('agent');
        return { error: error || '', text: text, buttons: buttons };
      });
    });
  }

  function run_(name, args) {
    if (name === 'read_sheet') return readSheet();
    if (name === 'lookup') return lookup(args);
    if (name === 'set_class') { backup(); C.rest.push(rec()); return setClass(args); }
    if (name === 'create_character') return createCharacter(args);
    if (name === 'write_theme') { backup(); C.rest.push(rec()); return writeTheme(args); }
    if (name === 'roll_name') {
      var names = (args.names || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean)
        .filter(function (x, i, l) { return l.indexOf(x) === i; });
      if (names.length < 2) return { error: 'propose several names, ten for the Randominator' };
      backup(); C.rest.push(rec());
      var rolled = names[C.rng ? C.rng(names.length) : Math.floor(Math.random() * names.length)];
      rec().char.name = rolled;
      api.save(); api.refresh();
      return { rolled: rolled, of: names.length };
    }
    if (name === 'layout_map') return mapOf(args.page);
    if (name === 'style_page') {
      backup(); C.rest.push(rec());
      var put = api.setLayout(String(args.page || ''), String(args.css || ''));
      if (!put.ok) return { error: put.why };
      return mapOf(args.page).then(function (m) {
        var issues = [];
        (function walk(n, path) {
          if (!n) return;
          var here = path + ' > ' + (n.id ? '#' + n.id : n.tag + (n['class'] ? '.' + n['class'].split(' ')[0] : ''));
          if (n.wraps) issues.push(here + ' wraps on ' + n.wraps);
          if (n.overflows) issues.push(here + ' overflows');
          (n.children || []).forEach(function (k) { walk(k, here); });
        })(m.tree, args.page);
        return { worn: put.worn, stillWrapping: issues.slice(0, 20), note: 'look at the map again when unsure' };
      });
    }
    if (name === 'sheet_get') return sheetGet(args.formulas);
    if (name === 'sheet_set') { backup(); C.rest.push(rec()); return sheetSetAll(args.sets); }
    if (name === 'set_effect') { backup(); C.rest.push(rec()); return setEffect(args); }
    if (name === 'library_write') {
      backup(); C.rest.push(rec());
      var w = C.own.write(rec(), String(args.kind || '').toLowerCase(), args.entry);
      if (w.error) return w;
      api.save(); api.refresh();
      return { written: w.entry.key, name: w.entry.name, replaced: w.replaced, next: 'put it on the sheet by its name' };
    }
    if (name === 'add_spell') { backup(); C.rest.push(rec()); return addSpell(args); }
    if (name === 'add_item') { backup(); C.rest.push(rec()); return addItem(args); }
    if (name === 'add_feature') { backup(); C.rest.push(rec()); return addFeature(args); }
    if (name === 'update_sheet') { backup(); C.rest.push(rec()); return updateSheet(args.changes); }
    if (name === 'write_page') {
      backup();
      var p = { id: args.id, title: args.title, tab: args.title, glyph: args.glyph || '', html: args.html || '', css: args.css || '',
        mount: args.mount || '', render: args.render || '' };
      if (args.into) { p.into = String(args.into); p.at = args.at === 'top' || args.at === 'bottom' ? args.at : 'bar'; }
      if (args.slice) p.slice = args.slice;
      if (args.seed) p.seed = args.seed;
      var out = api.installPage(p);
      if (!out.ok) return out;
      return lookAt(p.id).then(function (seen) {
        var bad = seen.buttons.filter(function (x) { return !/: works|: off/.test(x); });
        return { ok: !seen.error && !bad.length, written: p.id, seen: seen, fix: bad };
      });
    }
    if (name === 'look_at_page') return lookAt(args.id);
    if (name === 'remove_page') { backup(); return { removed: api.removePage(args.id) }; }
    if (name === 'write_backstory') return writeBackstory(args);
    if (name === 'paint_picture') return paintPicture(args);
    if (name === 'repaint_picture') return repaintPicture(args);
    if (name === 'theme_from_picture') return themeFromPicture(args);
    if (name === 'paint_choices') return paintChoices(args);
    return { error: 'no tool ' + name };
  }

  /* ---- the sessions ----

     A session is one conversation: what the page shows and what the model
     reads. Each character keeps its own, the last twenty, in the store of
     this phone; a new one starts empty, and the list goes back to any. */

  function newSession() {
    return { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: '', at: Date.now(), log: [], history: [] };
  }

  function loadSessions() {
    var owner = api.state.current;
    if (SESSIONS && SESSIONS.owner === owner) return;
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE + owner) || 'null'); } catch (e) { saved = null; }
    SESSIONS = saved && Array.isArray(saved.list) ? saved : { current: '', list: [] };
    SESSIONS.owner = owner;
    try { var b = JSON.parse(localStorage.getItem(BACKUP + owner) || 'null'); undoOwner = (b && b.session) || ''; } catch (e) { undoOwner = ''; }
    if (!SESSIONS.list.length) SESSIONS.list.push(newSession());
    open(SESSIONS.current);
  }

  function open(id) {
    var s = SESSIONS.list.filter(function (x) { return x.id === id; })[0] || SESSIONS.list[0];
    SESSIONS.current = s.id;
    LOG = s.log;
    HISTORY = s.history;
  }

  function session() {
    return SESSIONS.list.filter(function (x) { return x.id === SESSIONS.current; })[0];
  }

  /* Written down after every step; a store too full drops the oldest
     session until it fits. */
  function keep() {
    if (!SESSIONS) return;
    var s = session();
    if (s) {
      s.at = Date.now();
      if (!s.title) { var first = s.log.filter(function (x) { return x.kind === 'you'; })[0]; if (first) s.title = first.text.slice(0, 60); }
    }
    SESSIONS.list.sort(function (x, y) { return y.at - x.at; });
    SESSIONS.list = SESSIONS.list.slice(0, KEEP);
    for (var tries = 0; tries < KEEP; tries++) {
      try {
        localStorage.setItem(STORE + SESSIONS.owner, JSON.stringify({ current: SESSIONS.current, list: SESSIONS.list }));
        return;
      } catch (e) {
        if (SESSIONS.list.length <= 1) return;
        SESSIONS.list.pop();
      }
    }
  }

  function startSession() {
    if (busy) return;
    var s = session();
    if (s && !s.log.length) { listOpen = false; paint(); return; }
    var fresh = newSession();
    SESSIONS.list.unshift(fresh);
    open(fresh.id);
    listOpen = false;
    keep();
    paint();
    if (E.text) E.text.focus();
  }

  function switchTo(id) {
    if (busy) return;
    open(id);
    listOpen = false;
    keep();
    paint();
  }

  function dropSession(id) {
    if (busy) return;
    SESSIONS.list = SESSIONS.list.filter(function (x) { return x.id !== id; });
    if (!SESSIONS.list.length) SESSIONS.list.push(newSession());
    if (SESSIONS.current === id) open(SESSIONS.list[0].id);
    keep();
    paint();
  }

  function when(t) {
    var d = new Date(t);
    var now = new Date();
    var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    if (d.toDateString() === now.toDateString()) return hm;
    return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + hm;
  }

  function paintSessions() {
    if (!E.title) return;
    var s = session();
    E.title.textContent = (s && s.title) || 'A new fairy';
    E.title.setAttribute('aria-expanded', listOpen ? 'true' : 'false');
    E.title.disabled = busy;
    E.fresh.disabled = busy;
    E.list.hidden = !listOpen;
    if (!listOpen) return;
    E.list.innerHTML = SESSIONS.list.map(function (x) {
      var asks = x.log.filter(function (m) { return m.kind === 'you'; }).length;
      return '<div class="agsrow' + (x.id === SESSIONS.current ? ' on' : '') + '">' +
        '<button type="button" class="agsopen" data-open="' + x.id + '"><span class="t">' + C.chrome.esc(x.title || 'A new fairy') + '</span>' +
        '<span class="d">' + when(x.at) + ' · ' + asks + (asks === 1 ? ' request' : ' requests') + '</span></button>' +
        '<button type="button" class="agsdrop" data-drop="' + x.id + '" aria-label="Send this fairy away">&times;</button></div>';
    }).join('');
  }

  /* ---- the conversation ---- */

  function say(kind, text) {
    LOG.push({ kind: kind, text: String(text || '') });
    keep();
    paint();
  }

  var VERB = {
    read_sheet: function () { return 'read the sheet'; },
    lookup: function (a) { return 'looked up ' + (a.kind || '') + (a.query ? ' "' + a.query + '"' : '') + (a.className ? ' of ' + a.className : '') + (a.subclass ? ' (' + a.subclass + ')' : '') + (a.maxLevel ? ' to level ' + a.maxLevel : ''); },
    set_class: function (a) { return 'set ' + (a.className || '') + ' to level ' + (a.level || '') + (a.subclass ? ', ' + a.subclass : ''); },
    add_feature: function (a) { return 'added the feature ' + (a.name || ''); },
    sheet_get: function (a) { return 'read ' + (a.formulas || ''); },
    roll_name: function (a) { return 'rolled a name among ' + ((a.names || []).length) + ': ' + (a.names || []).join(', '); },
    layout_map: function (a) { return 'looked at the layout of ' + (a.page || ''); },
    style_page: function (a) { return (a.css && String(a.css).trim() ? 'restyled ' : 'took the styles off ') + (a.page || ''); },
    sheet_set: function (a) { return 'set ' + (a.sets || ''); },
    set_effect: function (a) { return 'gave ' + (a.name || '') + ' the effect ' + (a.effect || '(none)'); },
    write_theme: function (a) { return 'made the theme ' + (a.name || ''); },
    write_backstory: function () { return 'wrote the background'; },
    paint_picture: function () { return 'painted a picture'; },
    paint_choices: function (a) { return 'painted ' + (a.count || 3) + ' pictures to pick from'; },
    repaint_picture: function (a) { return 'repainted: ' + (a.change || ''); },
    theme_from_picture: function () { return 'made a theme of the picture'; },
    create_character: function (a) { return 'created ' + (a.name || 'a character') + ', ' + (a.className || '') + ' ' + (a.level || 1); },
    library_write: function (a) { return 'wrote ' + ((a.entry && a.entry.name) || '') + ' in the library'; },
    add_spell: function (a) { return 'added the spell ' + (a.name || '') + (a.prepared ? ', prepared' : ''); },
    add_item: function (a) { return 'added the item ' + (a.name || ''); },
    update_sheet: function (a) { return 'set ' + (a.changes || []).map(function (c) { return c.path; }).join(', '); },
    write_page: function (a) { return a.into ? 'wrote ' + (a.title || a.id) + (a.at === 'top' || a.at === 'bottom' ? ' at the ' + a.at + ' of ' : ' in the bar of ') + a.into : 'wrote the page ' + (a.title || a.id); },
    look_at_page: function (a) { return 'looked at ' + a.id; },
    remove_page: function (a) { return 'removed the page ' + a.id; }
  };

  /* A run that loses the model does not end there: a call that timed out,
     lost its socket or met a server error is tried again after 5, 15, 30
     and 60 seconds, with "continue" said to the model when the
     conversation does not already end on the player's words. A refusal of
     the request itself (a 4xx other than 408 and 429, or a server with no
     key) is not tried again. After the last try, a button tries again by
     hand; while the run goes, the send button stops it. */
  var WAITS = [5, 15, 30, 60];
  var TIMEOUT = 150000;
  var RUN = null;
  var RUN_MISSES = 0;   /* the lookups of this run that found nothing */

  /* The shell hands a fairy a request of its own (the Randominator), in a
     new conversation of the character played. */
  C.fairy = {
    ask: function (text, opts) {
      if (!api || busy) return false;
      loadSessions();
      if (opts && opts.fresh) startSession();
      ask(text);
      return true;
    }
  };

  function ask(text) {
    if (busy || !text.trim()) return;
    busy = true;
    backedUp = false;
    THINK = { parts: [], open: false };
    HISTORY.push({ role: 'user', content: text });
    say('you', text);
    RUN = { url: C.exchange.server() + '/agent', rounds: 0, tries: 0, token: 0, timer: null };
    RUN_MISSES = 0;
    turn();
  }

  function lasting(promise, ms) {
    return new Promise(function (done, fail) {
      var t = setTimeout(function () { fail(new Error('timed out after ' + Math.round(ms / 1000) + ' s')); }, ms);
      promise.then(function (v) { clearTimeout(t); done(v); }, function (e) { clearTimeout(t); fail(e); });
    });
  }

  function retryable(why) {
    var code = Number((String(why).match(/^(\d{3}) /) || [])[1] || 0);
    if (/no key/.test(why)) return false;
    if (code >= 400 && code < 500 && code !== 408 && code !== 429) return false;
    return true;
  }

  function turn() {
    var run = RUN;
    if (!run) return;
    run.rounds += 1;
    if (run.rounds > ROUNDS) { finish('The fairy stopped after ' + ROUNDS + ' steps without an answer.', false, false, true); return; }
    paint();
    var token = ++run.token;
    lasting(C.exchange.postJson(run.url, { messages: [{ role: 'system', content: SYSTEM }].concat(HISTORY), tools: TOOLS }), TIMEOUT)
      .then(function (answer) {
        if (RUN !== run || token !== run.token) return;
        var msg = answer && answer.choices && answer.choices[0] && answer.choices[0].message;
        if (!msg) { failed(run, 'the model sent no message' + (answer && answer.error ? ': ' + JSON.stringify(answer.error).slice(0, 160) : '')); return; }
        run.tries = 0;
        HISTORY.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls || undefined });
        var calls = msg.tool_calls || [];
        /* What the model thought, in whichever field its server sends it,
           and the words it said beside a tool call. Never sent back. */
        var thought = msg.reasoning_content || msg.reasoning || msg.thinking || '';
        if (typeof thought !== 'string') thought = JSON.stringify(thought);
        if (thought.trim()) THINK.parts.push(thought.trim());
        if (calls.length && msg.content && String(msg.content).trim()) THINK.parts.push(String(msg.content).trim());
        if (!calls.length) { finish(msg.content || '', true); return; }
        var chain = Promise.resolve();
        calls.forEach(function (call) {
          chain = chain.then(function () {
            var args = {};
            try { args = JSON.parse(call.function.arguments || '{}'); } catch (e) { args = {}; }
            var name = call.function.name;
            say('tool', (VERB[name] ? VERB[name](args) : name));
            return Promise.resolve().then(function () { return run_(name, args); }).catch(function (e) {
              return { error: String((e && e.message) || e) };
            }).then(function (result) {
              HISTORY.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) });
              keep();
            });
          });
        });
        chain.then(function () { if (RUN === run) turn(); });
      })
      .catch(function (e) {
        if (RUN !== run || token !== run.token) return;
        failed(run, String((e && e.message) || e));
      });
  }

  function failed(run, why) {
    run.rounds -= 1;
    if (!retryable(why)) { finish('The model refused the request: ' + why); return; }
    if (run.tries >= WAITS.length) {
      finish('The model did not answer after ' + (WAITS.length + 1) + ' tries: ' + why, false, true);
      return;
    }
    var wait = WAITS[run.tries];
    run.tries += 1;
    say('error', 'The model did not answer (' + why + '). Trying again in ' + wait + ' s, ' + run.tries + ' of ' + WAITS.length + '.');
    run.timer = setTimeout(function () {
      run.timer = null;
      if (RUN !== run) return;
      nudge();
      turn();
    }, wait * 1000);
  }

  /* "continue", unless the player's words are already the last thing said. */
  function nudge() {
    var last = HISTORY[HISTORY.length - 1];
    if (!last || last.role !== 'user') HISTORY.push({ role: 'user', content: 'continue' });
  }

  function stopRun() {
    if (!RUN) return;
    if (RUN.timer) clearTimeout(RUN.timer);
    RUN.token += 1;
    finish('Stopped.');
  }

  /* The button after the last try: the same run, from where it stopped. */
  function retryRun() {
    if (busy) return;
    busy = true;
    THINK = { parts: [], open: false };
    LOG = LOG.filter(function (x) { return x.kind !== 'retry'; });
    session().log = LOG;
    RUN = { url: C.exchange.server() + '/agent', rounds: 0, tries: 0, token: 0, timer: null };
    nudge();
    keep();
    turn();
  }

  function finish(text, fromModel, canRetry, canGoOn) {
    busy = false;
    RUN = null;
    if (THINK && THINK.parts.length) LOG.push({ kind: 'think', parts: THINK.parts, open: THINK.open });
    THINK = null;
    say(fromModel ? 'agent' : 'error', text);
    if (canRetry) say('retry', '');
    /* A fairy stopped at its step limit goes on with one tap. */
    if (canGoOn) say('goon', '');
    if (backedUp) say('undo', '');
  }

  /* The whole run taken back: the character as it was before its first
     change, its pages with it. */
  function undoRun() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(BACKUP + api.state.current) || 'null'); } catch (e) { saved = null; }
    if (saved && saved.rec) saved = saved.rec;
    if (!saved) { api.toast('Nothing to undo'); return; }
    var r = rec();
    (r.pluginPages || []).forEach(function (p) {
      if (!(saved.pluginPages || []).some(function (x) { return x.id === p.id; })) api.removePage(p.id);
    });
    Object.keys(r).forEach(function (k) { delete r[k]; });
    Object.keys(saved).forEach(function (k) { r[k] = saved[k]; });
    (r.pluginPages || []).forEach(function (p) { api.installPage(p); });
    try { localStorage.removeItem(BACKUP + api.state.current); } catch (e) { /* nothing */ }
    undoOwner = '';
    LOG = LOG.filter(function (x) { return x.kind !== 'undo'; });
    session().log = LOG;
    say('error', 'The last run is undone.');
    api.save();
    api.refresh();
  }

  /* ---- the drawing ---- */

  /* ---- the answer, as Markdown ----

     The model writes Markdown; it is drawn here from escaped text, so no
     markup of its own ever reaches the page: headings, lists, numbered
     lists, code, bold and italic, and paragraphs. */
  function inline(t) {
    return t
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/__([^_]+)__/g, '<b>$1</b>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
      .replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  }

  function markdown(text) {
    var lines = C.chrome.esc(String(text || '')).split(/\r?\n/);
    var out = [];
    var list = '';
    var para = [];
    var code = null;
    function flush() {
      if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
    }
    function close() {
      if (list) { out.push('</' + list + '>'); list = ''; }
    }
    lines.forEach(function (raw) {
      if (code !== null) {
        if (/^\s*```/.test(raw)) { out.push('<pre><code>' + code.join('\n') + '</code></pre>'); code = null; }
        else code.push(raw);
        return;
      }
      if (/^\s*```/.test(raw)) { flush(); close(); code = []; return; }
      var line = raw.trim();
      var m;
      if (!line) { flush(); close(); return; }
      if ((m = line.match(/^#{1,6}\s+(.*)$/))) { flush(); close(); out.push('<div class="agmdh">' + inline(m[1]) + '</div>'); return; }
      if ((m = line.match(/^[-*+]\s+(.*)$/))) {
        flush();
        if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; }
        out.push('<li>' + inline(m[1]) + '</li>');
        return;
      }
      if ((m = line.match(/^(\d+)[.)]\s+(.*)$/))) {
        flush();
        if (list !== 'ol') { close(); out.push('<ol start="' + m[1] + '">'); list = 'ol'; }
        out.push('<li>' + inline(m[2]) + '</li>');
        return;
      }
      if (list && /^\s{2,}/.test(raw) && out.length) {
        out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ' ' + inline(line) + '</li>');
        return;
      }
      close();
      para.push(line);
    });
    if (code !== null) out.push('<pre><code>' + code.join('\n') + '</code></pre>');
    flush();
    close();
    return out.join('');
  }

  /* An answer that asks the player to choose: numbered questions with the
     agent's picks. One tap on OK takes them all. */
  function asks(text) {
    return /\(recommended/i.test(text) || /reply ok/i.test(text);
  }

  /* The reasoning of the model, folded under one line: "thinking" while
     the run goes, its three dots going out one after the other, and
     "reasoning" once it is done. A tap opens it and closes it. */
  function thinkRow(t, at, live) {
    var head = live
      ? 'thinking<span class="agdots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>'
      : 'reasoning';
    var body = t.open
      ? '<div class="agreason">' + (t.parts.length ? t.parts.map(function (x) { return C.chrome.esc(x).replace(/\n/g, '<br>'); }).join('<hr>')
        : 'Nothing yet: the model sends its reasoning with each answer.') + '</div>'
      : '';
    return '<button type="button" class="agthink' + (t.open ? ' open' : '') + '" data-think="' + at + '" aria-expanded="' + (t.open ? 'true' : 'false') + '">' + head + '</button>' + body;
  }

  function paint() {
    if (!E.log) return;
    var lastYou = -1;
    var lastAgent = -1;
    LOG.forEach(function (x, i) { if (x.kind === 'you') lastYou = i; if (x.kind === 'agent') lastAgent = i; });
    var rows = LOG.map(function (x, i) {
      if (x.kind === 'retry') return i > lastYou && !busy ? '<button type="button" class="agundo" data-retry="1">Try again</button>' : '';
      if (x.kind === 'goon') return i > lastYou && !busy ? '<button type="button" class="agok" data-goon="1">Continue</button>' : '';
      if (x.kind === 'undo') return i > lastYou && undoOwner === SESSIONS.current ? '<button type="button" class="agundo" data-undo="1">Undo this run</button>' : '';
      if (x.kind === 'think') return thinkRow(x, i, false);
      if (x.kind === 'agent') {
        var ok = i === lastAgent && i > lastYou && !busy && asks(x.text)
          ? '<button type="button" class="agok" data-ok="1">OK</button>' : '';
        return '<div class="agmsg agagent agmd">' + markdown(x.text) + '</div>' + ok;
      }
      return '<div class="agmsg ag' + x.kind + '">' + C.chrome.esc(x.text).replace(/\n/g, '<br>') + '</div>';
    });
    if (busy && THINK) rows.push(thinkRow(THINK, 'live', true));
    E.log.innerHTML = rows.length ? rows.join('') : '<div class="agempty"><p>Ask for a change: a tab for a spell, an item with its own buttons, a level up, a theme. The fairy reads the books, asks what is open, and says what it did.</p>' +
      '<p>The fairies are fickle: check the result and tell them what\'s wrong. They also get bored quickly: if you have several unrelated requests, ask different fairies.</p></div>';
    E.log.scrollTop = E.log.scrollHeight;
    /* While a run goes, the send button stops it. */
    E.send.innerHTML = busy ? '&#x25A0;' : '&#x2191;';
    E.send.setAttribute('aria-label', busy ? 'Stop the fairy' : 'Send');
    paintSessions();
  }

  function toggleThink(at) {
    var t = at === 'live' ? THINK : LOG[Number(at)];
    if (!t) return;
    t.open = !t.open;
    paint();
  }

  Sheet.page({
    id: 'agent',
    glyph: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
    title: 'Fairy',
    order: 9,
    on: false,
    blurb: 'A small model that changes the sheet when asked: a tab, an item, a level, a theme.',
    css: [
      '.agbody{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:8px}',
      '.aglog{flex:1 1 auto;min-height:0;overflow-y:auto;scrollbar-width:none;display:flex;flex-direction:column;gap:6px;padding-bottom:6px}',
      '.agmsg{max-width:88%;padding:8px 11px;border-radius:var(--r-box);font-size:13px;line-height:1.45;white-space:normal}',
      '.agyou{align-self:flex-end;background:rgba(var(--arcane-rgb),.18);color:var(--ink)}',
      '.agagent{align-self:flex-start;border:1px solid var(--edge);background:rgba(255,255,255,.03);color:var(--ink)}',
      '.agtool{align-self:flex-start;padding:2px 4px;font-size:11px;color:var(--muted)}',
      '.agtool::before{content:"\\2192  "}',
      '.agerror{align-self:flex-start;border:1px solid rgba(var(--miss-rgb),.5);color:rgb(var(--miss-rgb))}',
      '.agempty{margin:auto 0;padding:12px;font-size:12.5px;color:var(--muted);text-align:center}',
      '.agempty p{margin:0 0 10px}',
      '.agempty p:last-child{margin:0}',
      '.agundo{align-self:flex-start;min-height:var(--tap-small);padding:0 12px;border:1px dashed var(--edge);border-radius:var(--r-control);background:none;color:var(--muted);font-family:var(--sans);font-size:12px;cursor:pointer}',
      '.agstate{min-height:14px;font-size:11px;color:var(--muted)}',
      '.agmd p{margin:0 0 6px}',
      '.agmd p:last-child,.agmd ul:last-child,.agmd ol:last-child{margin-bottom:0}',
      '.agmd ul,.agmd ol{margin:0 0 6px;padding-left:20px}',
      '.agmd li{margin:2px 0}',
      '.agmd .agmdh{margin:2px 0 4px;font-family:var(--display);font-size:13px;letter-spacing:.04em;color:var(--ink)}',
      '.agmd code{padding:0 4px;border-radius:4px;background:rgba(255,255,255,.07);font-size:12px}',
      '.agmd pre{margin:0 0 6px;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,.3);overflow-x:auto;font-size:11.5px}',
      '.agmd b{color:var(--ink);font-weight:600}',
      '.agok{align-self:flex-start;min-height:var(--tap-small);min-width:72px;padding:0 16px;border:1px solid rgba(var(--arcane-rgb),.6);border-radius:var(--r-control);background:rgba(var(--arcane-rgb),.2);color:var(--ink);font-family:var(--sans);font-size:13px;cursor:pointer}',
      '.aghead{flex:0 0 auto;display:flex;gap:6px;align-items:center}',
      '.agtitle{flex:1 1 auto;min-width:0;min-height:var(--tap-small);padding:0 10px;border:1px solid var(--edge);border-radius:var(--r-control);background:rgba(255,255,255,.03);color:var(--ink);font-family:var(--sans);font-size:13px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}',
      '.agtitle::after{content:"  \\25BE";color:var(--muted)}',
      '.agtitle[aria-expanded="true"]::after{content:"  \\25B4"}',
      '.agnew{flex:0 0 auto;min-height:var(--tap-small);padding:0 12px;border:1px solid rgba(var(--arcane-rgb),.5);border-radius:var(--r-control);background:rgba(var(--arcane-rgb),.15);color:var(--ink);font-family:var(--sans);font-size:13px;cursor:pointer}',
      '.agtitle:disabled,.agnew:disabled{opacity:.45}',
      '.aglist{flex:0 1 auto;max-height:50%;overflow-y:auto;scrollbar-width:none;display:flex;flex-direction:column;gap:4px;padding:4px;border:1px solid var(--edge);border-radius:var(--r-box);background:rgba(0,0,0,.25)}',
      '.aglist[hidden]{display:none}',
      '.agsrow{display:flex;align-items:stretch;border-radius:var(--r-control)}',
      '.agsrow.on{background:rgba(var(--arcane-rgb),.15)}',
      '.agsopen{flex:1 1 auto;min-width:0;min-height:var(--tap);display:flex;flex-direction:column;justify-content:center;gap:2px;padding:4px 10px;border:0;background:none;color:var(--ink);text-align:left;cursor:pointer}',
      '.agsopen .t{font-family:var(--sans);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.agsopen .d{font-family:var(--sans);font-size:11px;color:var(--muted)}',
      '.agsdrop{flex:0 0 auto;width:var(--tap);border:0;background:none;color:var(--muted);font-size:18px;cursor:pointer}',
      '.agthink{align-self:flex-start;padding:2px 4px;border:0;background:none;color:var(--muted);font-family:var(--sans);font-size:11px;font-style:italic;cursor:pointer;text-align:left}',
      '.agthink::before{content:"\\25B8  ";font-style:normal}',
      '.agthink.open::before{content:"\\25BE  "}',
      '.agdots i{font-style:normal;animation:agdot 1.2s linear infinite}',
      '.agdots i:nth-child(2){animation-delay:-.8s}',
      '.agdots i:nth-child(3){animation-delay:-.4s}',
      '@keyframes agdot{0%,33.32%{opacity:.12}33.34%,100%{opacity:1}}',
      '.agreason{align-self:stretch;margin:0 0 2px 10px;padding:6px 10px;border-left:2px solid var(--edge);font-size:11.5px;line-height:1.45;color:var(--muted);white-space:normal}',
      '.agreason hr{border:0;border-top:1px dashed var(--edge);margin:6px 0}',
      '.agin{display:flex;gap:6px;align-items:flex-end}',
      '.agin textarea{flex:1 1 auto;min-height:var(--tap);max-height:120px;resize:none;padding:9px 11px;border:1px solid var(--edge);border-radius:var(--r-control);background:rgba(255,255,255,.03);color:var(--ink);font-family:var(--sans);font-size:15px;outline:none}',
      '.agin textarea:focus{border-color:rgba(var(--arcane-rgb),.6)}',
      '.agin button{flex:0 0 auto;width:var(--tap);height:var(--tap);border:1px solid rgba(var(--arcane-rgb),.6);border-radius:var(--r-control);background:rgba(var(--arcane-rgb),.2);color:var(--ink);font-size:18px;cursor:pointer}',
      '.agin button:disabled{opacity:.45}'
    ].join('\n'),
    html: [
      '<div class="agbody">',
      '  <div class="aghead"><button type="button" class="agtitle" id="agTitle" aria-haspopup="true" aria-expanded="false">A new fairy</button>',
      '  <button type="button" class="agnew" id="agNew" aria-label="Call a new fairy">+ Fairy</button></div>',
      '  <div class="aglist" id="agList" hidden></div>',
      '  <div class="aglog" id="agLog"></div>',
      '  <div class="agstate" id="agState" role="status" aria-live="polite"></div>',
      '  <div class="agin"><textarea id="agText" rows="1" placeholder="Ask the fairy" aria-label="Ask the fairy"></textarea>',
      '  <button type="button" id="agSend" aria-label="Send">&#x2191;</button></div>',
      '</div>'
    ].join('\n'),

    mount: function (root, a) {
      api = a;
      E = { log: root.querySelector('#agLog'), state: root.querySelector('#agState'), text: root.querySelector('#agText'), send: root.querySelector('#agSend'),
        title: root.querySelector('#agTitle'), fresh: root.querySelector('#agNew'), list: root.querySelector('#agList') };
      loadSessions();
      E.title.addEventListener('click', function () { if (busy) return; listOpen = !listOpen; paint(); });
      E.fresh.addEventListener('click', startSession);
      E.list.addEventListener('click', function (ev) {
        var o = ev.target.closest('[data-open]');
        if (o) { switchTo(o.getAttribute('data-open')); return; }
        var d = ev.target.closest('[data-drop]');
        if (d) dropSession(d.getAttribute('data-drop'));
      });
      function send() {
        if (busy) { stopRun(); return; }
        var t = E.text.value;
        E.text.value = '';
        ask(t);
      }
      E.send.addEventListener('click', send);
      E.text.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(); }
      });
      E.log.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-undo]')) { undoRun(); return; }
        if (ev.target.closest('[data-retry]')) { retryRun(); return; }
        if (ev.target.closest('[data-goon]')) { ask('continue'); return; }
        if (ev.target.closest('[data-ok]')) { ask('OK, go with your recommendations.'); return; }
        var t = ev.target.closest('[data-think]');
        if (t) toggleThink(t.getAttribute('data-think'));
      });
      /* The machine says whether the agent has its key. */
      C.exchange.readUrl(C.exchange.server() + '/agent').then(function (t) {
        var s = JSON.parse(t);
        if (!s.ready) E.state.textContent = 'The machine that serves the app has no key for the model: start it with SENSENOVA_API_KEY set.';
      }).catch(function () {
        E.state.textContent = 'The machine that serves the app does not answer at ' + C.exchange.server() + '.';
      });
      paint();
    },

    render: function (a) {
      api = a;
      /* Another character is played: its own sessions. A run under way
         stays with the one that asked. */
      if (!busy) loadSessions();
      paint();
    }
  });
})();
