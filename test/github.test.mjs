/* The GitHub module: the sign in, the calls, the answers. */
import { source } from './harness.mjs';

let passed = 0;
function check(what, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log('  no   ' + what + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
    process.exitCode = 1;
    return;
  }
  console.log('  ok   ' + what);
  passed += 1;
}

/* The module answers to a window, and asks the network through it. */
const calls = [];
const answers = {};
const window = {
  SheetNet: null,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  TextEncoder: TextEncoder
};
global.window = window;
global.btoa = window.btoa;
global.TextEncoder = TextEncoder;
global.fetch = function (url, opts) {
  calls.push({ url: url, method: opts.method, body: opts.body, headers: opts.headers });
  const key = url + ' ' + (opts.method || 'GET');
  const answer = answers[key] || { status: 200, body: '{}' };
  return Promise.resolve({
    status: answer.status,
    text: function () { return Promise.resolve(answer.body); }
  });
};

const code = source('github.js');
new Function('window', 'fetch', 'btoa', 'TextEncoder', code)(window, global.fetch, global.btoa, TextEncoder);
const G = window.SheetGit;

console.log('the module answers');
check('it is there', typeof G, 'object');
check('the client id is public and in the source', G.clientId.length > 10, true);

console.log('the sign in');
await G.deviceStart();
const start = calls[calls.length - 1];
check('it asks for a device code', start.url, 'https://github.com/login/device/code');
check('it says what it wants', start.method, 'POST');
check('it names the app', JSON.parse(start.body).client_id, G.clientId);
check('it asks for no scope at all', JSON.parse(start.body).scope, undefined);
check('the app decides the permissions, not the token', G.clientId.charAt(0), 'I');

/* A token of a GitHub App lasts eight hours, and the refresh token renews
   it, so the app asks for a new one rather than a new sign in. */
const before = calls.length;
answers['https://github.com/login/oauth/access_token POST'] = {
  status: 200,
  body: JSON.stringify({ access_token: 'ghu_new', expires_in: 28800, refresh_token: 'ghr_one' })
};
const renewed = await G.refreshSession('ghr_old');
const ask = calls[before];
check('the renewal goes to the same door', ask.url, 'https://github.com/login/oauth/access_token');
check('and names the refresh grant', JSON.parse(ask.body).grant_type, 'refresh_token');
check('with the token it was given', JSON.parse(ask.body).refresh_token, 'ghr_old');
check('and no secret', JSON.parse(ask.body).client_secret, undefined);
check('it comes back with a token that lasts', renewed.expires_in, 28800);

console.log('the calls');
await G.whoAmI('tok');
const who = calls[calls.length - 1];
check('it asks who the player is', who.url, 'https://api.github.com/user');
check('it carries the token', who.headers.Authorization, 'Bearer tok');

await G.listCharacters('NewbornAI/custom-sheet', 'main', '');
const list = calls[calls.length - 1];
check('it asks for the folder of the shelf', list.url, 'https://api.github.com/repos/NewbornAI/custom-sheet/contents/characters?ref=main');

answers['https://api.github.com/repos/NewbornAI/custom-sheet/contents/characters GET'] = {
  status: 200,
  body: JSON.stringify([{ name: 'a.json', type: 'file' }, { name: 'README.md', type: 'file' }])
};
const rows = await G.listCharacters('NewbornAI/custom-sheet', '', '');
check('it keeps the packages and drops the rest', rows.map(function (r) { return r.name; }), ['a.json']);

answers['https://api.github.com/repos/NewbornAI/custom-sheet/contents/characters/x.json?ref=main GET'] = { status: 200, body: JSON.stringify({ sha: 'abc' }) };
answers['https://api.github.com/repos/NewbornAI/custom-sheet/contents/characters/x.json PUT'] = { status: 201, body: '{}' };
await G.putFile('NewbornAI/custom-sheet', 'characters/x.json', 'hello', 'a character', 'main', 'tok');
const put = calls[calls.length - 1];
check('it writes the file', put.method, 'PUT');
const body = JSON.parse(put.body);
check('it carries the text', Buffer.from(body.content, 'base64').toString('utf8'), 'hello');
check('it names the branch', body.branch, 'main');
check('it carries the old hash', body.sha, 'abc');

console.log('the shape of a shelf');
await G.createRepo('custom-sheet-NewbornAI', 'tok', false);
const repo = calls[calls.length - 1];
check('it makes a repository', repo.url, 'https://api.github.com/user/repos');
check('it makes it public and ready', JSON.stringify([JSON.parse(repo.body).auto_init, JSON.parse(repo.body).private]), '[true,false]');

/* The shelf is a module of its own, and it is driven against a fake client:
   the steps are the module's, the client is the seam. */
console.log('the shelf of a character');
const shelfCode = source('shelf.js');
new Function('window', shelfCode)(window);
const S = window.SheetShelf;

const held = { ui: {} };
const store = {
  get: (key) => held.ui[key],
  set: (key, value) => { held.ui[key] = value; }
};
const shelfCalls = [];
const opened = [];
let pollAnswer = {};
const net = {
  deviceStart: () => { shelfCalls.push(['deviceStart']); return Promise.resolve({ user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', device_code: 'dc1', interval: 5 }); },
  devicePoll: (code) => { shelfCalls.push(['devicePoll', code]); return Promise.resolve(pollAnswer); },
  whoAmI: (token) => { shelfCalls.push(['whoAmI', token]); return Promise.resolve('yngwie'); },
  listCharacters: (repoName, ref, token) => { shelfCalls.push(['listCharacters', repoName, ref, token]); return Promise.resolve([{ name: 'a.json', url: 'https://raw/a.json', page: '', ref: ref || '' }]); },
  api: (method, path) => { shelfCalls.push(['api', method, path]); return Promise.resolve([{ name: 'main' }, { name: 'yngwie' }]); },
  putFile: (repoName, path, text, message, branch, token) => { shelfCalls.push(['putFile', repoName, path, text, message, branch, token]); return Promise.resolve({ content: { html_url: 'https://github.com/NewbornAI/custom-sheet/blob/main/characters/yngwie.json' } }); },
  deleteFile: (repoName, path, message, branch, token) => { shelfCalls.push(['deleteFile', repoName, path, message, branch, token]); return Promise.resolve({}); },
  createBranch: (repoName, name) => { shelfCalls.push(['createBranch', repoName, name]); return Promise.resolve(name); },
  createRepo: (name, token, isPrivate) => { shelfCalls.push(['createRepo', name, isPrivate]); return Promise.resolve('yngwie/' + name); },
  forkRepo: (repoName) => { shelfCalls.push(['forkRepo', repoName]); return Promise.resolve('yngwie/custom-sheet'); },
  refreshSession: (refresh) => { shelfCalls.push(['refreshSession', refresh]); return Promise.resolve({ access_token: 'ghu_renewed', expires_in: 28800, refresh_token: 'ghr_two' }); }
};
const shelf = S({ net: net, store: store, openUrl: (url) => { opened.push(url); return 'ok'; }, packageOf: (rec) => ({ kind: 'custom-sheet-character', name: rec.char.name, record: rec }) });

check('the shelf names the private repository of the project', shelf.repo(), 'NewbornAI/kustom-mandal');
const begin = await shelf.begin();
check('the sign in asks GitHub for a code', begin.user_code, 'ABCD-1234');
check('and the address is opened on the phone', opened, ['https://github.com/login/device']);
check('the app is waiting for the approval', [shelf.waiting(), shelf.signedIn()], [true, false]);

pollAnswer = { access_token: 'ghu_tok', expires_in: 28800, refresh_token: 'ghr_one' };
held.ui.ghPending.wait = 0;
const waited = await new Promise((resolve) => shelf.wait((ok) => resolve(ok)));
check('a poll that answers a token signs the player in', [waited, shelf.signedIn(), shelf.waiting()], [true, true, false]);
check('and the last sentence says who it is', shelf.last(), 'signed in as yngwie');

const wrote = await shelf.put({ char: { name: 'Yngwie' } }, 'a message');
const putCall = shelfCalls.filter((c) => c[0] === 'putFile')[0];
check('a character goes to characters/<name>.json', putCall[2], 'characters/yngwie.json');
check('on the branch it is on', putCall[5], 'main');
check('with the message it was given', putCall[4], 'a message');
check('carrying the token', putCall[6], 'ghu_tok');
check('and the answer is the address of the file', wrote.url, 'https://github.com/NewbornAI/custom-sheet/blob/main/characters/yngwie.json');

/* A 401 with a refresh token renews the session and writes once more. */
shelf.setBranch('yngwie');
let firstTry = true;
net.putFile = (repoName, path, text, message, branch, token) => {
  shelfCalls.push(['putFile', repoName, path, text, message, branch, token]);
  if (firstTry) { firstTry = false; return Promise.reject(new Error('HTTP 401')); }
  return Promise.resolve({ content: { html_url: 'https://github.com/x/y/blob/yngwie/characters/yngwie.json' } });
};
const retried = await shelf.put({ char: { name: 'Yngwie' } }, 'a message');
check('a 401 renews the session and writes again', retried.ok, true);
check('and the renewal is asked for', shelfCalls.filter((c) => c[0] === 'refreshSession').length, 1);
check('the retry writes on the branch it is on', shelfCalls.filter((c) => c[0] === 'putFile').pop()[5], 'yngwie');

/* A 401 with no renewal left answers with a sentence instead of a throw. */
held.ui.gh = { token: 'ghu_tok', refresh: '', expires: 0 };
net.putFile = () => Promise.reject(new Error('HTTP 401'));
const denied = await shelf.put({ char: { name: 'Yngwie' } }, 'a message');
check('a 401 that cannot be renewed answers with a sentence and does not throw',
  denied, { ok: false, why: 'the connection has run out, sign in again' });

/* The browser route: a pasted token, and the name it belongs to. */
held.ui.gh = null;
held.ui.token = '';
const login = await shelf.setToken('ghp_pasted');
check('a pasted token signs the player in', [shelf.signedIn(), login, shelf.token()], [true, 'yngwie', 'ghp_pasted']);

const shelfRows = await shelf.characters('');
check('the shelf is read as the list the net answered', shelfRows.map((r) => r.name), ['a.json']);
check('and it reads the branch it was asked for', shelfCalls.filter((c) => c[0] === 'listCharacters').pop()[2], '');
const shelfBranches = await shelf.branches();
check('the branches are the shelves of the players', shelfBranches, ['main', 'yngwie']);

shelf.setRepo('yngwie/custom-sheet');
check('a repository of the player replaces the one of the project', shelf.repo(), 'yngwie/custom-sheet');

/* The phone: a call goes through the bridge, the async way when the shell
   offers it, so the page is not held while the network answers. */
console.log('the bridge of the phone');
{
  const bridgeCode = source('bridge.js');
  const phone = {};
  new Function('window', bridgeCode.replace("typeof window !== 'undefined' ? window : this", 'window'))(phone);
  const asked = [];
  phone.SheetNet = {
    requestAsync: function (id, url, method, body, token) {
      asked.push([url, method, token]);
      setTimeout(() => phone.__sheetNetDone(id, JSON.stringify({ status: 200, body: '{"login":"yngwie"}' })), 5);
      return 'pending';
    }
  };
  const viaPhone = { SheetNet: phone.SheetNet, SheetBridge: phone.SheetBridge, btoa: window.btoa, TextEncoder: TextEncoder };
  new Function('window', 'fetch', 'btoa', 'TextEncoder', code)(viaPhone, () => { throw new Error('the web was asked'); }, window.btoa, TextEncoder);
  const who = await viaPhone.SheetGit.whoAmI('ghp_x');
  check('a GitHub call asks the shell the async way', asked[0], ['https://api.github.com/user', 'GET', 'ghp_x']);
  check('and the answer comes back through the bridge', who, 'yngwie');
  check('the bridge knows a call the shell offers', [phone.SheetBridge.has('request'), phone.SheetBridge.has('download')], [true, false]);
  phone.SheetNet = { fetchUrl: (url) => 'text of ' + url };
  check('a shell with only the plain call is still asked', await phone.SheetBridge.call('fetchUrl', ['x']), 'text of x');
  phone.SheetNet = null;
  check('no shell, no bridge', phone.SheetBridge.call('fetchUrl', ['x']), null);
}

console.log('');
if (process.exitCode) {
  console.log('a check failed');
} else {
  console.log('all github checks pass');
}
