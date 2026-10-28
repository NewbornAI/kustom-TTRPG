/* The GitHub side of the shelf.

   The shelf is a folder in a repository, and the repository is the only
   thing the app and the players share. A token is the one secret of the
   whole route: it is asked for once, kept, and never typed by hand.

   There are two ways to get one. The device flow is the good one: the app
   asks GitHub for a code, the player approves it in the browser, and the
   app polls until the token lands. The phone has a shell that answers for
   the network, so the flow works there. A page of a browser cannot ask
   GitHub for a sign in, because GitHub does not let a page of another
   origin do that, so the web asks for a token to be pasted instead, and a
   paste is accurate where a typing is not.

   The client id is public: it is in the source of every copy of the app,
   and it grants nothing by itself. No secret is needed anywhere. */
(function () {
  'use strict';

  var CLIENT_ID = 'Iv23lim6bRwLkTfAhHB5';
  var OAUTH = 'https://github.com/';
  var API = 'https://api.github.com/';

  /* GitHub answers with JSON when it is asked to, and with a form when it
     is not. Both are read here, so the app does not care which came. */
  function parse(text) {
    var t = String(text || '');
    if (t.charAt(0) === '{' || t.charAt(0) === '[') { try { return JSON.parse(t); } catch (e) {} }
    var out = {};
    t.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i < 0) return;
      out[decodeURIComponent(pair.slice(0, i).replace(/\+/g, ' '))] =
        decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
    });
    return out;
  }

  function finish(answer) {
    if (!answer) return { status: 0, data: {} };
    if (answer.status !== undefined && answer.body !== undefined) {
      return { status: answer.status, data: parse(answer.body) };
    }
    return { status: answer.status || 0, data: answer.data || answer };
  }

  /* The shell of the phone answers for the network, so the app asks it. */
  function bridge(url, method, body, token) {
    var asked = window.SheetBridge ? window.SheetBridge.call('request', [url, method, body, token]) : null;
    if (!asked) return null;
    return asked.then(function (answer) {
      if (typeof answer === 'string' && answer.indexOf('error ') === 0) throw new Error(answer);
      return finish(typeof answer === 'string' ? JSON.parse(answer) : answer);
    });
  }

  /* A page of a browser asks the network itself. GitHub lets a page of
     another origin call the API, so the calls go straight there. */
  function web(url, method, body, token) {
    var headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (body) headers['Content-Type'] = 'application/json';
    return fetch(url, {
      method: method,
      headers: headers,
      body: body || undefined
    }).then(function (r) {
      return r.text().then(function (t) { return { status: r.status, body: t }; });
    }).then(finish).catch(function (e) {
      return { status: 0, data: { message: String((e && e.message) || e) } };
    });
  }

  /* A call to GitHub. The phone asks its shell, the page asks the network. */
  function request(url, method, body, token) {
    var viaBridge = bridge(url, method, body ? JSON.stringify(body) : null, token);
    if (viaBridge) return viaBridge;
    return web(url, method, body ? JSON.stringify(body) : null, token);
  }

  /* ---- the sign in ---- */

  /* The device flow: the app asks for a code, the player approves it in
     the browser, and the app polls until GitHub hands over the token. The
     app is a GitHub App, so no scope is asked for: the permissions are the
     ones of the app, and the token reaches only the repositories it is
     installed on. */
  function deviceStart() {
    return request(OAUTH + 'login/device/code', 'POST',
      { client_id: CLIENT_ID }, null)
      .then(function (r) { return r.data; });
  }

  /* A user token lasts eight hours, and the refresh token it comes with
     lasts six months, so a sign in is renewed rather than repeated. */
  function refreshSession(refresh) {
    return request(OAUTH + 'login/oauth/access_token', 'POST', {
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refresh
    }, null).then(function (r) { return r.data; });
  }

  function devicePoll(code) {
    return request(OAUTH + 'login/oauth/access_token', 'POST', {
      client_id: CLIENT_ID,
      device_code: code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    }, null).then(function (r) { return r.data; });
  }

  /* ---- the calls ---- */

  function api(method, path, body, token) {
    var url = API + path.replace(/^\//, '');
    return request(url, method, body, token).then(function (r) {
      if (r.status < 200 || r.status > 299) {
        var why = (r.data && (r.data.message || r.data.error)) || ('the server said ' + r.status);
        var e = new Error(why);
        e.status = r.status;
        throw e;
      }
      return r.data;
    });
  }

  function whoAmI(token) {
    return api('GET', '/user', null, token).then(function (u) { return u.login || ''; });
  }

  /* The characters of a branch, read with the token when there is one, so
     a shelf of one's own can be private. */
  function listCharacters(repo, ref, token) {
    var path = '/repos/' + repo + '/contents/characters' + (ref ? '?ref=' + encodeURIComponent(ref) : '');
    return api('GET', path, null, token).then(function (rows) {
      if (!Array.isArray(rows)) return [];
      return rows.filter(function (f) {
        return f && f.type === 'file' && /\.json$/.test(f.name);
      }).map(function (f) {
        return { name: f.name, url: f.download_url, page: f.html_url || '', ref: ref || '' };
      });
    }).catch(function (e) {
      if (e && e.status === 404) return [];
      throw e;
    });
  }

  /* A character is written to the shelf as a file, on the branch, and the
     file is created when it is not there yet. */
  function putFile(repo, path, text, message, branch, token) {
    var body = {
      message: message,
      content: b64(text),
      branch: branch
    };
    return api('GET', '/repos/' + repo + '/contents/' + path + '?ref=' + encodeURIComponent(branch), null, token)
      .then(function (found) {
        body.sha = found && found.sha;
        return api('PUT', '/repos/' + repo + '/contents/' + path, body, token);
      }).catch(function (e) {
        if (e && e.status === 404) return api('PUT', '/repos/' + repo + '/contents/' + path, body, token);
        throw e;
      });
  }

  /* A file the shelf no longer needs goes away, so a character can be
     taken off the shelf without a machine at the other end. */
  function deleteFile(repo, path, message, branch, token) {
    return api('GET', '/repos/' + repo + '/contents/' + path + '?ref=' + encodeURIComponent(branch), null, token)
      .then(function (found) {
        return api('DELETE', '/repos/' + repo + '/contents/' + path, {
          message: message,
          sha: found.sha,
          branch: branch
        }, token);
      });
  }

  /* A shelf of one's own: a repository of the player, empty and ready. */
  function createRepo(name, token, isPrivate) {
    return api('POST', '/user/repos', {
      name: name, private: !!isPrivate, auto_init: true,
      description: 'The shelf of the characters of custom-sheet'
    }, token).then(function (r) { return r.full_name || ''; });
  }

  /* A fork of the shelf of the project, for a player who wants the whole
     repository and not only the folder. */
  function forkRepo(repo, token) {
    return api('POST', '/repos/' + repo + '/forks', {}, token)
      .then(function (r) { return r.full_name || ''; });
  }

  /* A branch of the shelf, for a character that is not ready to be
     shared yet. It starts from the main branch. */
  function createBranch(repo, branch, token) {
    return api('GET', '/repos/' + repo + '/git/ref/heads/main', null, token).then(function (ref) {
      return api('POST', '/repos/' + repo + '/git/refs', {
        ref: 'refs/heads/' + branch, sha: ref.object.sha
      }, token).then(function () { return branch; });
    });
  }

  function b64(text) {
    var bytes = new TextEncoder().encode(String(text));
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  window.SheetGit = {
    clientId: CLIENT_ID,
    deviceStart: deviceStart,
    devicePoll: devicePoll,
    refreshSession: refreshSession,
    whoAmI: whoAmI,
    listCharacters: listCharacters,
    putFile: putFile,
    deleteFile: deleteFile,
    createRepo: createRepo,
    forkRepo: forkRepo,
    createBranch: createBranch,
    api: api
  };
})();
