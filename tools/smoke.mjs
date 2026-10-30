/* The smoke test of the shell: the one suite that runs src/shell.js in a real
   browser, which the other suites cannot reach (test/harness.mjs grows no
   fake document, on purpose).

   It builds the page into a throwaway folder, serves it, opens it at 360 by
   720 in Chromium and drives what only the shell does: the boot, the import
   of a package that brings pages and the question it asks, a package page
   that tries to take the place of a page of the app, a page that does not
   compile, a page written again while it is on screen, the pages of one
   character leaving with it, a picture kept beside the store, and a store
   that is full.

     node tools/smoke.mjs                 build, then smoke the build
     node tools/smoke.mjs --page dist     smoke a build already written

   It needs the playwright package and its Chromium (npm i -g playwright, then
   npx playwright install chromium); the repository itself takes no
   dependency. */
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/* The browser, from the first route that answers: the playwright package,
   then the same package in the global root, then the playwright-core that
   playwright-cli carries, which needs the Chrome this machine already has. */
let chromium;
let launchOpts = {};
try {
  ({ chromium } = await import('playwright'));
} catch (e) {
  try {
    const globalRoot = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
    ({ chromium } = createRequire(join(globalRoot, 'noop.js'))('playwright'));
  } catch (e2) {
    const cli = join(globalRootSafe(), '@playwright', 'cli', 'node_modules', 'playwright-core', 'index.mjs');
    const chrome = process.env.CUSTOM_SHEET_CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '');
    if (existsSync(cli) && chrome && existsSync(chrome)) {
      ({ chromium } = await import('file:///' + cli.replace(/\\/g, '/')));
      launchOpts = { executablePath: chrome };
    } else {
      console.log('the smoke test needs playwright: npm i -g playwright, then npx playwright install chromium');
      process.exit(2);
    }
  }
}

function globalRootSafe() {
  try {
    return execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
  } catch (e) {
    return '';
  }
}

let failed = 0;
function check(what, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log('  no   ' + what + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
    failed += 1;
    return;
  }
  console.log('  ok   ' + what);
}

/* --page <folder> smokes a build that is already written, as the walk does
   with a served one; otherwise the build lands in a throwaway folder. */
const pageAt = process.argv.indexOf('--page');
let out;
if (pageAt > -1 && process.argv[pageAt + 1]) {
  out = resolve(process.argv[pageAt + 1]);
} else {
  out = mkdtempSync(join(tmpdir(), 'custom-sheet-smoke-'));
  execFileSync(process.execPath, [resolve(root, 'build.mjs'), '--out', out], { cwd: root, stdio: 'pipe' });
}
const types = { '.html': 'text/html', '.json': 'application/json' };
const server = createServer((req, res) => {
  const path = join(out, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!path.startsWith(out) || !existsSync(path) || path === out) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + server.address().port + '/';

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 360, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('customsheet.state.v3')));
const views = () => page.evaluate(() => [...document.querySelectorAll('section.view')].map((s) => s.id));

try {
  await page.goto(origin + 'index.html');
  const picture = 'data:image/png;base64,' + 'A'.repeat(300000);
  await page.evaluate((pic) => {
    localStorage.clear();
    localStorage.setItem('customsheet.state.v3', JSON.stringify({
      characters: { c1: { char: { name: 'Yngwie', classes: [{ name: 'Sorcerer', level: 8 }], abilities: { cha: 20 } }, pages: ['image', 'spells'], image: { data: pic } } },
      current: 'c1', ui: { pages: null }
    }));
  }, picture);
  await page.reload();
  await wait(1200);

  console.log('the boot');
  check('the app boots on the sheet', (await views()).indexOf('view-character') >= 0, true);

  console.log('a picture beside the store');
  await page.evaluate(() => Sheet.show('spells'));
  await wait(400);
  const kept = (await store()).characters.c1.image;
  check('the store keeps a mark where the picture was', [kept.stored, kept.data], ['apart', '']);
  await page.reload();
  await wait(1200);
  await page.evaluate(() => Sheet.show('image'));
  await wait(300);
  check('and the picture comes back from beside it', ((await page.getAttribute('#imgPic', 'src')) || '').length, picture.length);

  console.log('a package that brings pages');
  const pkg = {
    kind: 'custom-sheet-character', version: 1, name: 'Plugy',
    record: { char: { name: 'Plugy', classes: [{ name: 'Wizard', level: 1 }], abilities: {} } },
    pages: [
      { id: 'notes', title: 'Notes', order: 8, html: '<div id="nb"></div>', mount: 'function (root) { root.querySelector("#nb").textContent = "notes mounted"; }', render: 'function () {}' },
      { id: 'broken', title: 'Broken', order: 9, html: '<div></div>', mount: 'function (root) { root.x = ; }' },
      { id: 'settings', title: 'Not the settings', html: '<div id="notsettings"></div>' }
    ]
  };
  async function importWith(choice) {
    const link = await page.evaluate((p) => Sheet.core.exchange.linkOf(p), pkg);
    await page.evaluate(() => Sheet.core.exchange.openPasteLink());
    await page.fill('#pasteLink', link);
    await page.click('text=Fetch');
    await wait(400);
    const asked = await page.textContent('#sheetTitle');
    await page.click('button:has-text("' + choice + '")');
    await wait(600);
    return asked;
  }
  check('the import asks before the pages come in', await importWith('With its pages'), 'Plugy brings pages');
  check('and says the page it refused', await page.textContent('#spentToast'), 'Plugy is here, without Not the settings.');
  await page.evaluate(() => Sheet.show('notes'));
  await wait(300);
  check('a package page mounts', await page.textContent('#nb'), 'notes mounted');
  await page.evaluate(() => Sheet.show('broken'));
  await wait(300);
  check('a page that does not compile says why', ((await page.textContent('#view-broken .page-error')) || '').indexOf('mount:') > 0, true);
  await page.evaluate(() => Sheet.show('settings'));
  await wait(300);
  check('a package never takes the place of a page of the app', await page.$('#notsettings'), null);

  console.log('a page written again');
  await page.evaluate(() => Sheet.show('notes'));
  await page.evaluate(() => Sheet.page({ id: 'notes', title: 'Notes', plugin: true, html: '<div id="nb2">again</div>', mount: function () {}, render: function () {} }));
  await wait(300);
  check('it is mounted again, once', [await page.textContent('#view-notes'), (await views()).filter((v) => v === 'view-notes').length], ['again', 1]);

  console.log('the pages of a character');
  await importWith('Without');
  const s = await store();
  check('without its pages a package carries none', (s.characters[s.current].pluginPages || []).length, 0);
  check('and the pages of the character before are gone', await page.evaluate(() => !!document.getElementById('view-notes')), false);

  console.log('the feel of a page');
  /* The move decides, not what it started on: a swipe that begins on a
     button turns the page, and the button does not fire under it. */
  const onView = () => page.evaluate(() => (document.querySelector('section.view.on') || {}).id || '');
  async function swipeFrom(selector, dx, top) {
    const box = await page.locator(selector).first().boundingBox();
    const x = box.x + box.width / 2, y = top ? box.y + top : box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let k = 1; k <= 6; k++) await page.mouse.move(x + dx * k / 6, y + 2 * k / 6);
    await page.mouse.up();
    await wait(250);
  }
  await page.evaluate(() => Sheet.show('character'));
  await wait(300);
  const stepsBefore = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('customsheet.state.v3')); return (s.characters[s.current].char.history || []).length; });
  await swipeFrom('#restLong', -170);
  check('a swipe that starts on a button turns the page', (await onView()) !== 'view-character', true);
  check('and the button under it did not fire',
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('customsheet.state.v3')); return (s.characters[s.current].char.history || []).length; }), stepsBefore);
  await swipeFrom('.view.on', 170, 16);
  check('the swipe the other way comes back', await onView(), 'view-character');
  console.log('the bar');
  /* One row: four pages and More, More opening every page as a tile; two
     rows: every page and no More. */
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('customsheet.state.v3')); s.characters[s.current].pages = ['volley', 'spells', 'features', 'summons', 'equipment', 'image']; delete s.ui.bar; localStorage.setItem('customsheet.state.v3', JSON.stringify(s)); });
  await page.reload();
  await wait(1200);
  check('one row holds four pages and More',
    await page.evaluate(() => [...document.querySelectorAll('#bar .baritem')].map((b) => b.dataset.page || 'more')),
    ['character', 'volley', 'spells', 'features', 'more']);
  await page.click('#bar .barmore');
  await wait(300);
  check('More opens every page as a tile, docked at the bottom',
    await page.evaluate(() => [document.getElementById('sheet').classList.contains('dock'), document.querySelectorAll('#moreTiles .mtile').length]),
    [true, 7]);
  await page.click('#moreTiles .mtile[data-page="image"]');
  await wait(300);
  check('a tile opens its page, and More says it is under it',
    [await onView(), await page.evaluate(() => document.querySelector('#bar .barmore').getAttribute('aria-current'))],
    ['view-image', 'page']);
  await page.click('#gear');
  await wait(300);
  await page.click('.srow .seg button[data-rows="2"]');
  await wait(300);
  check('two rows hold every page and no More',
    await page.evaluate(() => [document.querySelectorAll('#bar .baritem').length, !!document.querySelector('#bar .barmore')]), [7, false]);
  await page.click('.srow .seg button[data-rows="1"]');
  await wait(200);
  await page.evaluate(() => Sheet.show('character'));
  await wait(200);
  console.log('the hit points');
  /* The number opens a keypad docked at the bottom: the amount, then what it
     is. Damage takes the temporary hit points first, and back takes the move
     back, temporary ones included. */
  const hpOf = () => page.evaluate(() => { const s = JSON.parse(localStorage.getItem('customsheet.state.v3')); return s.characters[s.current].char.hp; });
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('customsheet.state.v3')); s.characters[s.current].char.hp = { current: 45, max: 60, temp: 5 }; s.characters[s.current].char.hpManual = true; localStorage.setItem('customsheet.state.v3', JSON.stringify(s)); });
  await page.reload();
  await wait(1200);
  await page.click('#charHpNow');
  await wait(300);
  check('a tap on the hit points opens the keypad at the bottom',
    await page.evaluate(() => [document.getElementById('sheet').classList.contains('dock'), document.querySelectorAll('.hpk').length]), [true, 12]);
  await page.click('.hpk[data-key="1"]');
  await page.click('.hpk[data-key="1"]');
  await page.click('.hpka[data-do="damage"]');
  await wait(300);
  check('damage takes the temporary hit points first', await hpOf(), { current: 39, max: 60, temp: 0 });
  check('and the keypad closes', await page.evaluate(() => document.getElementById('sheet').hidden), true);
  await page.evaluate(() => window.__sheetBack());
  await wait(200);
  check('back takes the whole move back, temporary ones included', await hpOf(), { current: 45, max: 60, temp: 5 });

  console.log('the volley toggles');
  /* Three by two, and nothing moves under the thumb: Elem carries its dice
     in its own cell, and Quicken greys in place off Eldritch Blast. */
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('customsheet.state.v3')); s.characters[s.current].pages = ['volley', 'spells', 'features', 'summons', 'equipment', 'image']; localStorage.setItem('customsheet.state.v3', JSON.stringify(s)); });
  await page.reload();
  await wait(1000);
  await page.evaluate(() => Sheet.show('volley'));
  await wait(300);
  const chipBoxes = () => page.evaluate(() => [...document.querySelectorAll('#chips > *')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; }));
  const before = await chipBoxes();
  await page.click('.vchip[data-key="elem"]');
  await page.click('.vstop >> nth=2');
  await wait(300);
  check('the six toggles hold their places whatever is on', [before.length, JSON.stringify(await chipBoxes()) === JSON.stringify(before)], [6, true]);
  check('Elem shows its dice and Quicken greys in place',
    await page.evaluate(() => [!document.querySelector('.vchip[data-key="elemPlus"]').hidden, document.querySelector('.vchip[data-key="quicken"]').disabled]), [true, true]);
  check('and the head carries no armour class', await page.$('#ac'), null);
  await page.click('.vchip[data-key="elem"]');
  await page.click('.vstop >> nth=0');
  await page.evaluate(() => Sheet.show('character'));
  await wait(200);

  console.log('the spells');
  /* One scroller: a swipe across the list turns the page, the bar of levels
     picks the level, Eat turns a slot of that level into sorcery points, and
     a book that could not be read says so with a retry. */
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('customsheet.state.v3'));
    const sp = s.characters[s.current].spells;
    sp.sp = 2; sp.spMax = 8; sp.slotsTouched = true; sp.max = { 1: 4, 2: 3 }; sp.left = { 1: 4, 2: 3 }; sp.selected = 1;
    localStorage.setItem('customsheet.state.v3', JSON.stringify(s));
  });
  await page.route('**/data/spellbook.json', (route) => route.abort());
  await page.reload();
  await wait(1200);
  await page.evaluate(() => Sheet.show('spells'));
  await wait(400);
  check('a book that could not be read says so, with a retry',
    await page.evaluate(() => !!document.querySelector('#spellList [data-retry="spellbook"]')), true);
  await page.unroute('**/data/spellbook.json');
  await page.click('#spellList [data-retry="spellbook"]');
  await wait(800);
  check('and the retry reads it', await page.evaluate(() => !document.querySelector('#spellList [data-retry]')), true);
  await page.click('.lvb[data-lv="2"]');
  await wait(200);
  await page.click('#eatSlot');
  await wait(200);
  check('Eat turns a slot of the level on screen into sorcery points',
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('customsheet.state.v3')).characters; const sp = s[Object.keys(s).find((k) => s[k].spells && s[k].spells.selected === 2)].spells; return [sp.left[2], sp.sp]; }), [2, 4]);
  await swipeFrom('#spellList', -170);
  check('a swipe across the list turns the page', (await onView()) !== 'view-spells', true);
  await page.evaluate(() => Sheet.show('character'));
  await wait(200);

  console.log('the attack sheet');
  /* A rapier and True Strike: one press throws a roll, Adv after it re-reads
     it, a smite rides the melee hit with a slot, and back takes the smite
     back with its slot and the bonus action. */
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('customsheet.state.v3'));
    const rec = s.characters[s.current];
    rec.pages = ['attack', 'spells'];
    rec.char.abilities = { str: 13, dex: 14, con: 12, int: 10, wis: 8, cha: 20 };
    rec.equipment = { items: [{ id: 'rapier', name: 'Rapier', category: 'weapon', equipped: true, mastery: 'Vex' }] };
    rec.spells.lists = { 0: ['True Strike'], 1: ['Divine Smite'] };
    rec.spells.max = { 1: 4, 2: 3 }; rec.spells.left = { 1: 4, 2: 3 }; rec.spells.slotsTouched = true;
    delete rec.attack;
    localStorage.setItem('customsheet.state.v3', JSON.stringify(s));
  });
  await page.reload();
  await wait(1200);
  await page.evaluate(() => Sheet.show('attack'));
  await wait(600);
  const atk = () => page.evaluate(() => { const s = JSON.parse(localStorage.getItem('customsheet.state.v3')); const r = s.characters[s.current]; return { a: r.attack, left: r.spells.left }; });
  await page.click('[data-way="attack"]');
  await page.click('#atkCast');
  await wait(300);
  check('a press throws one roll and draws its card',
    [(await atk()).a.rolls.length, await page.evaluate(() => document.querySelectorAll('#atkBody .acard').length)], [1, 1]);
  await page.click('.atktogs .vchip[data-key="adv"]');
  await wait(200);
  check('Adv after the roll re-reads it', (await atk()).a.rolls[0].mode, 'adv');
  const hitNow = await page.evaluate(() => !document.querySelector('#atkBody .acard').classList.contains('miss'));
  if (!hitNow) { await page.click('#atkBody .acflip'); await wait(200); }
  await page.click('[data-smite="2"]');
  await wait(300);
  const smote = await atk();
  check('a smite rides the hit, spends a slot and the bonus action', [smote.a.bonus, smote.left[2]], ['smite', 2]);
  await page.evaluate(() => window.__sheetBack());
  await wait(300);
  const undone = await atk();
  check('and back takes it back, the slot and the bonus action with it', [undone.a.bonus, undone.left[2], undone.a.rolls.length], ['', 3, 1]);
  await page.evaluate(() => Sheet.show('character'));
  await wait(200);

  const gearBox = await page.locator('#gear').boundingBox();
  check('the buttons of the head are a thumb wide', [Math.round(gearBox.width), Math.round(gearBox.height)], [40, 40]);
  await page.evaluate(() => Sheet.core.exchange.openPasteLink());
  await wait(50);
  check('a sheet rises into place', await page.evaluate(() => getComputedStyle(document.getElementById('sheet')).transitionProperty.indexOf('transform') >= 0), true);
  await page.evaluate(() => window.__sheetBack());
  await wait(200);


  console.log('the fight');
  /* The board of a large battle: the plus opens the bestiary, ten rows fit a
     phone, the two arrows move the turn, a swing rolls in its open row, and
     the hit points of a creature open the keypad of the sheet. */
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('customsheet.state.v3'));
    const rec = s.characters[s.current];
    rec.pages = ['fight', 'spells', 'features'];
    const rows = [
      ['goblin|mm', 'Goblin', 22, 7, 15], ['goblin boss|xmm', 'Goblin Boss', 18, 21, 17],
      ['wolf|xmm', 'Wolf', 18, 11, 12], ['skeleton|xmm', 'Skeleton', 15, 13, 14],
      ['vrock|xmm', 'Vrock', 15, 152, 17], ['ogre|xmm', 'Ogre', 9, 68, 11],
      ['giant rat|xmm', 'Giant Rat', 9, 7, 13], ['cultist|xmm', 'Cultist', 6, 9, 12],
      ['stirge|xmm', 'Stirge', 4, 5, 13], ['lich|xmm', 'Lich', 25, 315, 20],
      ['hobgoblin|mm', 'Hobgoblin', 100, 11, 18], ['bugbear|mm', 'Bugbear', 100, 27, 16]
    ];
    rec.fight = {
      list: rows.map((r, i) => ({ id: 'f' + i, key: r[0], name: r[1], init: r[2], rolled: r[2] !== 100,
        hp: r[3], hpMax: r[3], ac: r[4], open: false, rolls: {}, saves: {}, edit: {} })),
      counter: 100
    };
    localStorage.setItem('customsheet.state.v3', JSON.stringify(s));
  });
  await page.reload();
  await wait(1200);
  await page.evaluate(() => Sheet.show('fight'));
  await wait(500);
  const fight = () => page.evaluate(() => {
    const body = document.querySelector('#view-fight .charbody').getBoundingClientRect();
    const rows = [...document.querySelectorAll('.inirow')];
    return {
      rows: rows.length,
      visible: rows.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= body.top - 1 && b.bottom <= body.bottom + 1; }).length,
      lit: rows.filter((r) => r.classList.contains('lit')).length,
      head: !!document.querySelector('.inibar #fightAdd'),
      bar: !!document.querySelector('.castbar #fightNext')
    };
  });
  const f0 = await fight();
  check('ten rows of a large fight fit the phone, the head and the turn with them',
    [f0.rows, f0.visible >= 10, f0.head, f0.bar], [12, true, true, true]);
  await page.click('#fightNext');
  await wait(250);
  check('the next turn lights one more creature', (await fight()).lit, f0.lit + 1);
  await page.click('.inirow:nth-child(1) .iniexp');
  await wait(300);
  check('the chevron opens the attacks of the creature',
    await page.evaluate(() => document.querySelectorAll('.iniatk .sdie').length > 0), true);
  await page.locator('.iniatk .sdie').first().click();
  await wait(400);
  /* The row is the order, not the order of the slice: the card is found by
     the id the row carries. */
  const rowId = () => page.evaluate(() => document.querySelector('.inirow').dataset.id);
  const cardNow = (id) => page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem('customsheet.state.v3'));
    const c = s.characters[s.current].fight.list.filter((x) => x.id === key)[0];
    return { hp: c.hp, rolls: Object.keys(c.rolls || {}).length };
  }, id);
  const top = await rowId();
  check('a tap on the die rolls the swing and keeps it on the creature', (await cardNow(top)).rolls, 1);
  const hpBox = await page.evaluate(() => {
    const row = document.querySelector('.inirow');
    const hp = row.querySelector('.inihp').getBoundingClientRect();
    const chev = row.querySelector('.iniexp').getBoundingClientRect();
    return { height: Math.round(hp.height), before: hp.right <= chev.left + 1, tone: row.querySelector('.inihp').className };
  });
  check('the hit points fill the height of the row, before the chevron, green while full',
    [hpBox.height >= 40, hpBox.before, hpBox.tone], [true, true, 'inihp inihpfull']);
  const full = (await cardNow(top)).hp;
  await page.click('.inirow:nth-child(1) .inihp');
  await wait(300);
  await page.click('.hpk[data-key="5"]');
  await page.click('.hpka[data-do="damage"]');
  await wait(400);
  check('the keypad of the sheet takes the hit points of the creature', (await cardNow(top)).hp, full - 5);
  check('and the row turns yellow over half',
    await page.evaluate(() => document.querySelector('.inirow .inihp').className), 'inihp inihphigh');
  await page.evaluate(() => window.__sheetBack());
  await wait(300);
  check('and back brings them back', (await cardNow(top)).hp, full);

  /* The spellcasting of a caster is an action of the block: the save DC of its
     spells and the spells it lists, each a link that opens its card. The
     lich sits third in the order, under the two creatures that have not
     rolled. */
  await page.locator('.inirow').nth(2).locator('.iniexp').click();
  await wait(400);
  const casting = await page.evaluate(() => {
    const box = document.querySelector('.iniatk');
    return {
      rows: document.querySelectorAll('.iniatk .scast').length,
      dc: (document.querySelector('.iniatk .scastdc') || {}).textContent || '',
      links: document.querySelectorAll('.iniatk .splink').length
    };
  });
  check('the spellcasting of a caster is an action, with the DC of its spells',
    [casting.rows >= 1, casting.dc.indexOf('20') >= 0, casting.links > 0], [true, true, true]);
  await page.locator('.iniatk .splink').first().click();
  await wait(900);
  check('a spell named in the block opens its card',
    await page.evaluate(() => [document.getElementById('sheet').hidden, document.getElementById('sheetTitle').textContent]),
    [false, 'Detect Magic']);
  await page.evaluate(() => window.__sheetBack());
  await wait(300);

  /* One template for every attack: the attack row, then one row for each
     kind of damage, so the numbers of one kind never land in another. */
  await page.locator('.inirow').filter({ hasText: 'Vrock' }).locator('.iniexp').click();
  await wait(400);
  const multi = await page.evaluate(() => {
    const block = [...document.querySelectorAll('.sblock')].filter((b) => b.dataset.name === 'Shred')[0];
    const grid = block.querySelector('.satkgrid');
    return {
      formulas: [...grid.querySelectorAll('.scell-formula')].map((s) => s.textContent),
      rolls: grid.querySelectorAll('.scell-dmgres').length,
      dice: grid.querySelectorAll('.sgres').length,
      total: !!grid.querySelector('.scell-dmgtot')
    };
  });
  check('a blow of two kinds gives each kind a row, the attack in the first',
    [multi.formulas.join(' / '), multi.rolls, multi.dice, multi.total], ['2d6+3 / 3d6', 2, 0, true]);

  /* One row is open at a time. */
  await page.locator('.inirow').nth(1).locator('.iniexp').click();
  await wait(300);
  check('a second row opened closes the first',
    await page.evaluate(() => document.querySelectorAll('.iniatk').length), 1);
  /* The bestiary reads a creature before it joins: a row opens its stat
     block, the + adds it and the layer stays, and the + beside the search
     writes a creature of the player's own, named after what was typed. */
  await page.click('#fightAdd');
  await wait(400);
  await page.fill('#sheetSearch', 'bugbear');
  await wait(500);
  await page.locator('#sheetList .row').first().click();
  await wait(500);
  check('a tap on a creature of the bestiary reads its stat block',
    await page.evaluate(() => document.getElementById('sheetTitle').textContent), 'Bugbear');
  await page.evaluate(() => window.__sheetBack());
  await wait(300);
  const fightList = () => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('customsheet.state.v3'));
    return s.characters[s.current].fight.list;
  });
  const beforeRows = (await fightList()).length;
  await page.locator('#sheetList .row .gadd').first().click();
  await wait(500);
  check('the + adds the creature and the bestiary stays open',
    [(await fightList()).length - beforeRows, await page.evaluate(() => document.getElementById('sheetTitle').textContent)],
    [1, 'The bestiary']);
  await page.click('#sheetSearchAdd');
  await wait(500);
  check('the + beside the search writes a creature of the player, named after the field',
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('customsheet.state.v3'));
      const list = s.characters[s.current].fight.list;
      const c = list[list.length - 1];
      return [c.name, c.ac, c.hpMax, !!c.block].join('/');
    }), 'bugbear/0/0/true');
  await page.evaluate(() => window.__sheetBack());
  await wait(300);
  await page.evaluate(() => Sheet.show('character'));
  await wait(200);

  console.log('the picture and the characters');
  /* The name in the banner opens the picture over the whole screen, and back
     closes it; the characters are cards with their pictures. */
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('customsheet.state.v3')); s.characters[s.current].image = { data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }; localStorage.setItem('customsheet.state.v3', JSON.stringify(s)); });
  await page.reload();
  await wait(1200);
  await page.click('#pageTitle');
  await wait(200);
  check('a tap on the name opens the picture over the whole screen', await page.evaluate(() => !document.getElementById('viewer').hidden), true);
  check('and back closes it', [await page.evaluate(() => window.__sheetBack()), await page.evaluate(() => document.getElementById('viewer').hidden)], ['closed', true]);
  await page.click('#charBtn');
  await wait(300);
  check('the characters are cards, one with its picture, and a card to add one',
    await page.evaluate(() => [document.querySelectorAll('.ccard:not(.ccadd)').length >= 1, !!document.querySelector('.ccard.here .ccpic img'), !!document.querySelector('.ccadd')]),
    [true, true, true]);
  await page.evaluate(() => window.__sheetBack());
  await wait(200);

  console.log('the back of the phone');
  /* The app asks window.__sheetBack before it does anything with the back
     key; the answer is what the page did, and 'none' lets the app step aside. */
  const back = () => page.evaluate(() => window.__sheetBack());
  await page.evaluate(() => Sheet.show('character'));
  await wait(300);
  check('the banner names the character on a page with a tab',
    await page.textContent('#pageTitle'), await page.evaluate(() => JSON.parse(localStorage.getItem('customsheet.state.v3')).characters[JSON.parse(localStorage.getItem('customsheet.state.v3')).current].char.name));
  await page.evaluate(() => Sheet.core.exchange.openPasteLink());
  await wait(200);
  check('back closes what is open over the page', [await back(), await page.evaluate(() => document.getElementById('sheet').hidden)], ['closed', true]);
  await page.click('#gear');
  await wait(300);
  check('the settings keep their own name', await page.textContent('#pageTitle'), 'Settings');
  check('back leaves the settings for the page they were opened from',
    [await back(), await page.evaluate(() => document.querySelector('#view-character').classList.contains('on'))], ['closed', true]);
  await page.click('#restLong');
  await wait(200);
  check('back takes back the last change', await back(), 'rewound');
  let answer = '';
  for (let k = 0; k < 80 && answer !== 'none'; k++) answer = await back();
  check('and with nothing left to take back, the app may step aside', answer, 'none');

  console.log('a store that is full');
  await page.evaluate(() => {
    let n = 0;
    for (let size = 1 << 20; size >= 1; size >>= 1) {
      const s = 'x'.repeat(size);
      for (;;) { try { localStorage.setItem('fill' + (n++), s); } catch (e) { break; } }
    }
  });
  await page.evaluate(() => Sheet.core.exchange.shelf.setRepo('someone/somewhere'));
  await wait(200);
  check('a write the store refuses is said', await page.textContent('#spentToast'), 'That change was not saved: the storage of the app is full.');
  await page.evaluate(() => { Object.keys(localStorage).filter((k) => k.indexOf('fill') === 0).forEach((k) => localStorage.removeItem(k)); });

  check('no error was thrown in the page', errors, []);
} finally {
  await browser.close();
  server.close();
}

console.log('');
if (failed) {
  console.log(failed + ' smoke checks failed');
  process.exitCode = 1;
} else {
  console.log('all smoke checks pass');
}
