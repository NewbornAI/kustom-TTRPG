/* The shelf: the sign in, the token, and the folder of characters on GitHub.

   A player signs in one of two ways, and both are here. On the phone the app
   asks GitHub for a code the player approves in a browser, and the app waits;
   in a browser the flow cannot run, so a token is pasted instead. The token
   is the one secret of the app: it is kept in the store, never typed by hand,
   and never leaves the machine except to GitHub.

   The module owns the steps a page must not know: the polling of the device
   flow, the renewal of a token that ran out, the retry of a write that met a
   401, the file of a character, its commit message and the branch it goes
   to. The page asks for jobs, and the shell hands in the client, the store
   and the opener of a URL. Nothing here knows a page. */
(function (root) {
  'use strict';

  /* The characters of the table live in the private repository. The public
     one carries no character and never will: a push there would put one in a
     repository anyone can read. */
  var DEFAULT_REPO = '';

  /* deps: net is the GitHub client, store reads and writes the shelf part of
     the store by name, openUrl sends an address to the browser of the phone,
     and packageOf writes the package a character travels as. */
  root.SheetShelf = function (deps) {
    var net = deps.net || null;
    var store = deps.store;
    var openUrl = deps.openUrl || function () {};
    var packageOf = deps.packageOf;

    /* The wait of the device flow, and how many checks in a row did not get
       through. The state itself lives in the store, so the app can be closed
       on a pending sign in and pick it up again. */
    var timer = null;
    var fails = 0;

    function get(key) { return store.get(key); }
    function set(key, value) { store.set(key, value); }
    function say(text) { set('ghLast', text || ''); }

    /* ---- the campaigns ----

       A campaign is a repository the game master runs, one per table, and the
       key of it: a fine-grained token that reaches that one repository and
       its contents, and nothing else. The key travels in the invite, so a
       player needs no account of their own. The app remembers every campaign
       it joined, and one of them is the shelf; none chosen is the shelf of a
       sign in, the way it was before campaigns. */
    function campaigns() {
      var list = get('campaigns');
      return Array.isArray(list) ? list.filter(function (c) { return c && c.repo; }) : [];
    }

    function current() {
      var id = get('campaign');
      if (!id) return null;
      return campaigns().filter(function (c) { return c.id === id; })[0] || null;
    }

    function idOf(repoName) { return String(repoName || '').toLowerCase(); }

    /* A campaign joined twice is the same campaign: the second one replaces
       the first, and the newest key wins. */
    function addCampaign(c) {
      var repoName = String((c && c.repo) || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '');
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoName)) return null;
      var entry = {
        id: idOf(repoName),
        name: String((c && c.name) || '').trim() || repoName.split('/')[1],
        repo: repoName,
        key: String((c && c.key) || '').trim()
      };
      var list = campaigns().filter(function (x) { return x.id !== entry.id; });
      list.push(entry);
      set('campaigns', list);
      set('campaign', entry.id);
      return entry;
    }

    /* The campaign the shelf reads and writes; '' is the shelf of the sign
       in. */
    function useCampaign(id) {
      var found = campaigns().filter(function (c) { return c.id === id; })[0];
      set('campaign', found ? found.id : '');
      return found || null;
    }

    function removeCampaign(id) {
      set('campaigns', campaigns().filter(function (c) { return c.id !== id; }));
      if (get('campaign') === id) set('campaign', '');
    }

    /* ---- the shelf itself ---- */

    function repo() {
      var c = current();
      if (c) return c.repo;
      return String(get('shelf') || DEFAULT_REPO);
    }

    /* A shelf may be no repository at all: the public build names none, and a
       player has one once they start or join a campaign. */
    function hasShelf() { return !!repo(); }

    function setRepo(name) { set('shelf', String(name || '').trim() || DEFAULT_REPO); }

    /* Where a character is written: the main branch holds the shared ones, a
       branch of one's own holds the ones that are not ready yet. A campaign
       is one table, so it writes to its main branch. */
    function branch() { return current() ? 'main' : (get('branch') || 'main'); }

    function setBranch(name) { set('branch', String(name || '').trim() || 'main'); }

    /* ---- the session ---- */

    function session() { return get('gh') || null; }

    function token() {
      var c = current();
      if (c && c.key) return c.key;
      var s = session();
      return (s && s.token) || get('token') || '';
    }

    function signedIn() { return !!token(); }

    /* A read may be anonymous. A token that has run out is not sent, so the
       public shelf is still read without one. */
    function readToken() {
      var c = current();
      if (c && c.key) return c.key;
      var s = session();
      if (!s || !s.token) return '';
      if (s.expires && s.expires <= Date.now()) return '';
      return s.token;
    }

    function setLogin(login) {
      set('login', login || '');
      var s = session();
      if (s) { s.login = login || ''; set('gh', s); }
    }

    function setSession(answer) {
      var s = session() || {};
      if (answer && answer.access_token) s.token = answer.access_token;
      if (answer && answer.refresh_token) s.refresh = answer.refresh_token;
      s.expires = (answer && answer.expires_in) ? Date.now() + Number(answer.expires_in) * 1000 : 0;
      set('gh', s);
      set('token', s.token || '');
      set('shelfRefused', '');
    }

    /* The token, renewed when it has run out. A GitHub App hands a token for
       eight hours and a refresh token for six months, so the app renews the
       session rather than asking the player to sign in again. */
    function tokenNow() {
      var c = current();
      if (c && c.key) return Promise.resolve(c.key);
      var s = session();
      var held = token();
      if (!held) return Promise.reject(new Error('connect to GitHub first'));
      if (!s || !s.expires || s.expires - 60000 > Date.now()) return Promise.resolve(held);
      if (!s.refresh || !net || !net.refreshSession) {
        return Promise.reject(new Error('the connection has run out, sign in again'));
      }
      return net.refreshSession(s.refresh).then(function (answer) {
        if (!answer || !answer.access_token) throw new Error('GitHub did not renew the connection');
        setSession(answer);
        return answer.access_token;
      });
    }

    /* The last sentence the page has to show: what GitHub answered, or who
       the player is signed in as. */
    function last() {
      var said = String(get('ghLast') || '');
      if (said) return said;
      var login = get('login');
      return login ? 'signed in as ' + login : '';
    }

    /* ---- the two routes of a sign in ---- */

    /* The phone: a code from GitHub, approved in a browser. The browser is
       opened on the address so the player lands on the approval page, and the
       page shows the code to read when they come back. */
    function begin() {
      if (!net) return Promise.reject(new Error('the sign in cannot start'));
      return net.deviceStart().then(function (answer) {
        if (!answer || !answer.user_code) throw new Error('GitHub did not answer');
        set('ghPending', {
          code: answer.device_code || '',
          wait: Number(answer.interval) || 5,
          at: Date.now()
        });
        say('');
        openUrl(answer.verification_uri || 'https://github.com/login/device');
        return answer;
      });
    }

    /* A sign in that is pending, and the app may have been closed on it. */
    function pending() {
      var p = get('ghPending');
      if (!p || !p.code) return null;
      if (Date.now() - (Number(p.at) || 0) > 14 * 60 * 1000) {
        set('ghPending', null);
        return null;
      }
      return p;
    }

    function waiting() { return !!pending(); }

    /* Asks GitHub again, and again, until the code is approved or the code
       runs out. A slow down is answered by waiting longer, never by giving
       up. */
    function wait(onDone) {
      var p = pending();
      if (!p || !net) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        if (!pending()) { if (onDone) onDone(false, 'the code ran out, ask for another'); return; }
        net.devicePoll(p.code).then(function (answer) {
          if (answer && answer.access_token) {
            set('ghPending', null);
            say('');
            fails = 0;
            setSession(answer);
            if (net.whoAmI) {
              net.whoAmI(answer.access_token).then(function (login) {
                setLogin(login);
                if (onDone) onDone(true);
              }).catch(function () {
                if (onDone) onDone(true);
              });
              return;
            }
            if (onDone) onDone(true);
            return;
          }
          var why = (answer && (answer.error || answer.error_description)) || 'not yet';
          say(String(why));
          fails = 0;
          if (why === 'authorization_pending') { wait(onDone); return; }
          if (why === 'slow_down') {
            p.wait = (Number(p.wait) || 5) + 5;
            set('ghPending', p);
            wait(onDone);
            return;
          }
          set('ghPending', null);
          if (onDone) onDone(false, String(why));
        }).catch(function (e) {
          /* A bridge that cannot answer is not a reason to wait forever. */
          fails += 1;
          if (fails >= 5) {
            set('ghPending', null);
            say('the check did not get through');
            if (onDone) onDone(false, 'GitHub did not answer the check');
            return;
          }
          wait(onDone);
        });
      }, (Number(p.wait) || 5) * 1000);
    }

    /* The browser: a token is pasted, and GitHub is asked who it belongs to,
       so the page can say the name. */
    function setToken(text) {
      var t = String(text || '').trim();
      set('gh', t ? { token: t, expires: 0 } : null);
      set('token', t);
      say('');
      if (!t) { setLogin(''); return Promise.resolve(''); }
      if (!net || !net.whoAmI) return Promise.resolve('');
      return net.whoAmI(t).then(function (login) {
        setLogin(login);
        return login;
      }).catch(function () { return ''; });
    }

    /* ---- the shelf as a list ---- */

    /* The characters of a branch: the files of the folder, one package each.
       The token of the player is used when there is one, so a shelf of one's
       own can be private. */
    function characters(ref) {
      if (!net) return Promise.reject(new Error('the shelf cannot be read'));
      if (!hasShelf()) return Promise.reject(new Error('start or join a campaign first'));
      return net.listCharacters(repo(), ref, readToken());
    }

    /* One character of the shelf, read through the API with the key or the
       sign in, so a private campaign is read the way a public shelf is. */
    function read(name, ref, bare) {
      if (!net) return Promise.reject(new Error('the shelf cannot be read'));
      var path = '/repos/' + repo() + '/contents/characters/' + encodeURIComponent(name) + '?ref=' + encodeURIComponent(ref || branch());
      return net.api('GET', path, null, readToken()).then(function (f) {
        if (!f || typeof f.content !== 'string') throw new Error('that file holds no character');
        var raw = atob(f.content.replace(/\s+/g, ''));
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        var text = new TextDecoder().decode(bytes);
        /* The picture of the character is its own file: it is read back and
           put into the package, so the character arrives whole. A picture
           that cannot be read leaves the character without one, not
           without the character. */
        var pkg = null;
        try { pkg = JSON.parse(text); } catch (e) { return text; }
        var img = pkg && pkg.record && pkg.record.image;
        if (bare || !img || img.data || !/^[A-Za-z0-9._-]+\.(webp|png|jpg)$/.test(String(img.file || ''))) return text;
        var pic = '/repos/' + repo() + '/contents/characters/' + encodeURIComponent(img.file) + '?ref=' + encodeURIComponent(ref || branch());
        return net.api('GET', pic, null, readToken()).then(function (p) {
          var mime = MIME[String(img.file).split('.').pop()];
          if (p && typeof p.content === 'string' && p.content.length) {
            img.data = 'data:' + mime + ';base64,' + p.content.replace(/\s+/g, '');
          }
          delete img.file;
          return JSON.stringify(pkg);
        }).catch(function () { delete img.file; return JSON.stringify(pkg); });
      });
    }

    /* The branches are the shelves of the players: anybody may open one. */
    function branches() {
      if (!net) return Promise.reject(new Error('the shelf cannot be read'));
      return net.api('GET', '/repos/' + repo() + '/branches', null, readToken()).then(function (rows) {
        if (!Array.isArray(rows)) return [];
        return rows.map(function (b) { return b.name; });
      });
    }

    /* ---- the writes ---- */

    /* One character, one name, wherever it sits: the file is named after the
       character, so the export and the shelf agree. */
    function fileName(rec) {
      var name = ((rec && rec.char && rec.char.name) || 'character').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'character';
      return name + '.json';
    }

    /* A write that met a 401 is retried once with a renewed token, and a
       connection that cannot be renewed answers with a sentence instead of a
       throw: the page has nothing to repair, only something to say. */
    function renew() {
      if (current() && current().key) {
        return Promise.reject(new Error('the key of the campaign was refused: ask the game master for a new invite'));
      }
      var s = session();
      if (!s || !s.refresh || !net || !net.refreshSession) {
        return Promise.reject(new Error('the connection has run out, sign in again'));
      }
      return net.refreshSession(s.refresh).then(function (answer) {
        if (!answer || !answer.access_token) throw new Error('GitHub did not renew the connection');
        setSession(answer);
        return answer.access_token;
      });
    }

    function ranOut() {
      if (current() && current().key) return { ok: false, why: 'the key of the campaign was refused: ask the game master for a new invite' };
      return { ok: false, why: 'the connection has run out, sign in again' };
    }

    /* The character being played goes onto the shelf, one file per character,
       named after it, on the branch that is named. The branch may not be
       there yet, so it is made and the character is put again. */
    function put(rec, message) {
      if (!net) return Promise.resolve({ ok: false, why: 'the shelf cannot write yet' });
      if (!rec || !rec.char) return Promise.resolve({ ok: false, why: 'there is no character' });
      if (!hasShelf()) return Promise.resolve({ ok: false, why: 'start or join a campaign first, in the settings' });
      var name = fileName(rec);
      var pkg = packageOf(rec);
      /* The picture is a file of its own beside the character, so it can be
         seen on GitHub and shared with the character, and the character's
         file stays small: the package keeps the name of the file in its
         place. */
      var picture = pictureOf(rec, name);
      if (picture) pkg = withoutPicture(pkg, picture.file);
      var text = JSON.stringify(pkg, null, 2);
      var commit = message || ((rec.char.name || 'a character') + ' goes to the shelf');
      var where = branch();
      function send(token) {
        var first = picture
          ? net.putFile(repo(), 'characters/' + picture.file, { base64: picture.base64 }, (rec.char.name || 'a character') + ' has a picture', where, token)
          : Promise.resolve(null);
        return first.then(function () {
          return net.putFile(repo(), 'characters/' + name, text, commit, where, token);
        }).then(function (answer) {
          return { ok: true, url: (answer && answer.content && answer.content.html_url) || '' };
        });
      }
      return tokenNow().then(function (token) {
        return send(token).catch(function (e) {
          var why = String((e && e.message) || e);
          if (where !== 'main' && why.indexOf('not found') >= 0) {
            return net.createBranch(repo(), where, token).then(function () { return send(token); });
          }
          if (why.indexOf('401') < 0) throw e;
          return renew().then(function (fresh) { return send(fresh); }).catch(function () { return ranOut(); });
        });
      }).then(function (answer) {
        if (answer && answer.ok) set('shelfRefused', '');
        return answer;
      }).catch(function (e) {
        var why = String((e && e.message) || e);
        if (why.indexOf('connect to GitHub first') >= 0) return { ok: false, why: why };
        /* GitHub answers 404 for a repository a token may not see, so the
           number says nothing to a player: the sentence says what to do. */
        if (e && (e.status === 403 || e.status === 404)) {
          if (current()) return { ok: false, why: 'the key of the campaign cannot write ' + repo() + ': ask the game master for a new invite' };
          set('shelfRefused', repo());
          return { ok: false, why: 'this sign in cannot write ' + repo() + ': start or join a campaign, in the settings' };
        }
        throw e;
      });
    }

    /* The last push of a sign in was refused by this very shelf, so the page
       does not call it the shelf. A new sign in may reach it. */
    function refused() { return !!ownRepo() && get('shelfRefused') === ownRepo(); }

    /* The shelf of a sign in, whichever shelf is in use, and whether there is
       a sign in behind it: the key of a campaign does not count as one. */
    function ownRepo() { return String(get('shelf') || DEFAULT_REPO); }

    function hasSession() {
      var s = session();
      return !!((s && s.token) || get('token'));
    }

    /* The picture of a character as a file: the data URL is cut into its
       type and its bytes, and named after the character. Only the types the
       app writes are kept; anything else stays inside the package. */
    var EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
    var MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' };

    function pictureOf(rec, jsonName) {
      var data = rec && rec.image && rec.image.data;
      var m = typeof data === 'string' && data.match(/^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return null;
      return { file: jsonName.replace(/\.json$/, '') + '.' + EXT[m[1]], base64: m[2] };
    }

    function withoutPicture(pkg, file) {
      var copy = JSON.parse(JSON.stringify(pkg));
      if (copy.record && copy.record.image) copy.record.image = { data: '', file: file };
      return copy;
    }

    /* A character goes off the shelf as well as on it, and its picture with
       it. */
    function remove(name) {
      if (!net) return Promise.resolve({ ok: false, why: 'the shelf cannot write yet' });
      function send(token) {
        var base = String(name).replace(/\.json$/, '');
        var pictures = Object.keys(MIME).map(function (ext) {
          return net.deleteFile(repo(), 'characters/' + base + '.' + ext, 'a character leaves the shelf', branch(), token).catch(function () {});
        });
        return Promise.all(pictures).then(function () {
          return net.deleteFile(repo(), 'characters/' + name, 'a character leaves the shelf', branch(), token);
        }).then(function () { return { ok: true }; });
      }
      return tokenNow().then(function (token) {
        return send(token).catch(function (e) {
          var why = String((e && e.message) || e);
          if (why.indexOf('401') < 0) throw e;
          return renew().then(function (fresh) { return send(fresh); }).catch(function () { return ranOut(); });
        });
      });
    }

    /* A shelf of one's own: a new repository, or a fork of the one of the
       project. The shelf then points at it. */
    function makeRepo(name, isPrivate) {
      if (!net) return Promise.reject(new Error('the shelf cannot write yet'));
      return tokenNow().then(function (token) {
        return net.whoAmI(token).then(function (login) {
          var wanted = String(name || '').trim() || ('custom-sheet-' + login);
          return net.createRepo(wanted, token, isPrivate);
        }).then(function (full) {
          if (full) setRepo(full);
          return full;
        });
      });
    }

    function fork() {
      if (!net) return Promise.reject(new Error('the shelf cannot write yet'));
      return tokenNow().then(function (token) {
        return net.forkRepo(repo(), token);
      }).then(function (full) {
        if (full) setRepo(full);
        return full;
      });
    }

    /* ---- a campaign of one's own ----

       The game master makes two things on GitHub, each from a page the app
       fills in: the repository, private, and the key of it. Only the choice
       of the repository for the key is left to a tap, because GitHub takes no
       address for it. The key is then pasted here, the repository is found
       with it, and a file says what the campaign is called. */
    function slug(name) {
      return String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'campaign';
    }

    function newRepoUrl(name) {
      return 'https://github.com/new?name=' + encodeURIComponent(slug(name)) +
        '&description=' + encodeURIComponent('The characters of the campaign ' + String(name || '').trim() + ', kept by custom-sheet') +
        '&visibility=private';
    }

    function keyUrl(name) {
      var label = ('Table key ' + String(name || '').trim()).slice(0, 40);
      return 'https://github.com/settings/personal-access-tokens/new?name=' + encodeURIComponent(label) +
        '&description=' + encodeURIComponent('Lets the players of ' + String(name || '').trim() + ' read and write the characters of the campaign. Give it only the repository ' + slug(name) + '.') +
        '&expires_in=366&contents=write';
    }

    /* The repository a key reaches: the one the app named first, then the
       ones the key can write, then the address the game master pasted. */
    function findRepo(key, name, address) {
      var pasted = String(address || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '').split('/').slice(0, 2).join('/');
      function check(full) {
        return net.api('GET', '/repos/' + full, null, key).then(function (r) { return (r && r.full_name) || ''; })
          .catch(function () { return ''; });
      }
      if (/^[^/]+\/[^/]+$/.test(pasted)) return check(pasted);
      return net.whoAmI(key).then(function (login) {
        return check(login + '/' + slug(name)).then(function (found) {
          if (found) return found;
          return net.api('GET', '/user/repos?per_page=100&sort=created', null, key).then(function (rows) {
            /* Every key lists every public repository, so only a private one
               says what this key was given. */
            var mine = (Array.isArray(rows) ? rows : []).filter(function (r) { return r && r.private && (!r.permissions || r.permissions.push); });
            var named = mine.filter(function (r) { return r.name === slug(name); })[0];
            if (named) return named.full_name;
            return mine.length === 1 ? mine[0].full_name : '';
          }).catch(function () { return ''; });
        });
      }).catch(function () { return ''; });
    }

    /* A branch asked of a commit that does not exist: GitHub answers 422 to a
       key that may write there and 403 or 404 to one that may not, and nothing
       is written either way. Another answer counts as a write, to stay safe. */
    function writes(key, full) {
      var body = { ref: 'refs/heads/custom-sheet-probe', sha: '0000000000000000000000000000000000000000' };
      return net.api('POST', '/repos/' + full + '/git/refs', body, key).then(function () { return true; })
        .catch(function (e) { return !(e && (e.status === 403 || e.status === 404)); });
    }

    /* What a key can write besides the campaign: the invite hands the key to
       every player, so it must open this table and nothing else. GitHub takes
       no address for the choice of repositories, so it is checked here once
       the key is in. The list answers with the rights of the owner and not of
       the key, and with every public repository whatever the key was given, so
       a private one in it is one the key holds, and a public one is asked. A
       key on all repositories answers at the first, so five are enough. */
    function reach(key, full) {
      return net.api('GET', '/user/repos?per_page=100&affiliation=owner,collaborator,organization_member', null, key).then(function (rows) {
        var others = (Array.isArray(rows) ? rows : []).filter(function (r) { return r && r.full_name && r.full_name !== full && (!r.permissions || r.permissions.push); });
        var held = others.filter(function (r) { return r.private; }).map(function (r) { return r.full_name; });
        if (held.length) return held;
        return others.slice(0, 5).reduce(function (found, r) {
          return found.then(function (list) {
            if (list.length) return list;
            return writes(key, r.full_name).then(function (yes) { return yes ? [r.full_name] : []; });
          });
        }, Promise.resolve([]));
      }).catch(function () { return []; });
    }

    /* The key pasted, the repository found, the key checked to open that
       one repository only, the file of the campaign written: the write is
       the proof that the key can write. A repository that is still empty
       takes the file as its first commit. */
    function claimCampaign(name, key, address) {
      if (!net) return Promise.reject(new Error('the shelf cannot write yet'));
      var k = String(key || '').trim();
      if (/^ghp_/.test(k)) {
        return Promise.resolve({ ok: false, why: 'that is a classic key, which reaches every repository you have: make a fine-grained one, from Start a campaign, step 2' });
      }
      if (!/^github_pat_[A-Za-z0-9_]{20,}$/.test(k)) {
        return Promise.resolve({ ok: false, why: 'that is not a GitHub key: it starts with github_pat_' });
      }
      return findRepo(k, name, address).then(function (full) {
        if (!full) return { ok: false, why: 'the key reaches no repository yet: on GitHub, give it the repository of the campaign', needRepo: true };
        /* The repository of the app holds its code and every character: a key
           of it in an invite would hand all of that to the table. */
        if (full === DEFAULT_REPO) {
          return { ok: false, why: 'that key opens ' + full + ', the repository of the app, which an invite must not hand out: on GitHub, choose the repository of the campaign instead' };
        }
        return reach(k, full).then(function (others) {
          if (others.length) {
            return { ok: false, tooWide: true, why: 'that key also opens ' + others[0] + (others.length > 1 ? ' and ' + (others.length - 1) + ' more' : '') + ', not only ' + full + ': on GitHub, under Repository access choose Only select repositories, then pick just ' + full };
          }
          return null;
        }).then(function (tooWide) {
          return tooWide || save(full);
        });
      });

      function save(full) {
        var body = {
          message: 'The campaign ' + String(name || '').trim() + ' begins',
          content: b64(JSON.stringify({ name: String(name || '').trim(), app: 'custom-sheet' }, null, 2) + '\n')
        };
        return net.api('GET', '/repos/' + full + '/contents/campaign.json', null, k).then(function (found) {
          body.sha = found && found.sha;
        }).catch(function () {}).then(function () {
          return net.api('PUT', '/repos/' + full + '/contents/campaign.json', body, k);
        }).then(function () {
          var entry = addCampaign({ name: name, repo: full, key: k });
          return { ok: true, campaign: entry };
        }).catch(function (e) {
          var status = e && e.status;
          return { ok: false, why: status === 403 || status === 404
            ? 'the key cannot write ' + full + ': on GitHub, give it Contents read and write'
            : String((e && e.message) || e) };
        });
      }
    }

    /* An invite comes in: the key is asked whether it opens the repository,
       and the campaign is remembered and becomes the shelf. */
    function joinCampaign(invite) {
      if (!net) return Promise.reject(new Error('the shelf cannot be read'));
      var i = invite || {};
      if (!i.repo) return Promise.resolve({ ok: false, why: 'that invite names no campaign' });
      return net.api('GET', '/repos/' + i.repo, null, i.key || '').then(function (r) {
        var entry = addCampaign({ name: i.name, repo: (r && r.full_name) || i.repo, key: i.key });
        return { ok: true, campaign: entry };
      }).catch(function (e) {
        var status = e && e.status;
        return { ok: false, why: status === 401 || status === 404
          ? 'the key of that invite no longer opens the campaign: ask the game master for a new one'
          : 'GitHub did not answer: ' + String((e && e.message) || e) };
      });
    }

    function b64(text) {
      var bytes = new TextEncoder().encode(String(text));
      var out = '';
      for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
      return btoa(out);
    }

    return {
      campaigns: campaigns,
      current: current,
      addCampaign: addCampaign,
      useCampaign: useCampaign,
      removeCampaign: removeCampaign,
      hasShelf: hasShelf,
      slug: slug,
      newRepoUrl: newRepoUrl,
      keyUrl: keyUrl,
      claimCampaign: claimCampaign,
      joinCampaign: joinCampaign,
      repo: repo,
      setRepo: setRepo,
      branch: branch,
      setBranch: setBranch,
      signedIn: signedIn,
      waiting: waiting,
      begin: begin,
      wait: wait,
      last: last,
      token: token,
      setToken: setToken,
      characters: characters,
      read: read,
      branches: branches,
      put: put,
      refused: refused,
      ownRepo: ownRepo,
      hasSession: hasSession,
      remove: remove,
      makeRepo: makeRepo,
      fork: fork
    };
  };
})(typeof window !== 'undefined' ? window : this);
