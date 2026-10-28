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
  var DEFAULT_REPO = 'NewbornAI/kustom-mandal';

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

    /* ---- the shelf itself ---- */

    function repo() { return String(get('shelf') || DEFAULT_REPO); }

    function setRepo(name) { set('shelf', String(name || '').trim() || DEFAULT_REPO); }

    /* Where a character is written: the main branch holds the shared ones, a
       branch of one's own holds the ones that are not ready yet. */
    function branch() { return get('branch') || 'main'; }

    function setBranch(name) { set('branch', String(name || '').trim() || 'main'); }

    /* ---- the session ---- */

    function session() { return get('gh') || null; }

    function token() {
      var s = session();
      return (s && s.token) || get('token') || '';
    }

    function signedIn() { return !!token(); }

    /* A read may be anonymous. A token that has run out is not sent, so the
       public shelf is still read without one. */
    function readToken() {
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
    }

    /* The token, renewed when it has run out. A GitHub App hands a token for
       eight hours and a refresh token for six months, so the app renews the
       session rather than asking the player to sign in again. */
    function tokenNow() {
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
      return net.listCharacters(repo(), ref, readToken());
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

    function ranOut() { return { ok: false, why: 'the connection has run out, sign in again' }; }

    /* The character being played goes onto the shelf, one file per character,
       named after it, on the branch that is named. The branch may not be
       there yet, so it is made and the character is put again. */
    function put(rec, message) {
      if (!net) return Promise.resolve({ ok: false, why: 'the shelf cannot write yet' });
      if (!rec || !rec.char) return Promise.resolve({ ok: false, why: 'there is no character' });
      var name = fileName(rec);
      var text = JSON.stringify(packageOf(rec), null, 2);
      var commit = message || ((rec.char.name || 'a character') + ' goes to the shelf');
      var where = branch();
      function send(token) {
        return net.putFile(repo(), 'characters/' + name, text, commit, where, token)
          .then(function (answer) {
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
      }).catch(function (e) {
        var why = String((e && e.message) || e);
        if (why.indexOf('connect to GitHub first') >= 0) return { ok: false, why: why };
        throw e;
      });
    }

    /* A character goes off the shelf as well as on it. */
    function remove(name) {
      if (!net) return Promise.resolve({ ok: false, why: 'the shelf cannot write yet' });
      function send(token) {
        return net.deleteFile(repo(), 'characters/' + name, 'a character leaves the shelf', branch(), token)
          .then(function () { return { ok: true }; });
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

    return {
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
      branches: branches,
      put: put,
      remove: remove,
      makeRepo: makeRepo,
      fork: fork
    };
  };
})(typeof window !== 'undefined' ? window : this);
