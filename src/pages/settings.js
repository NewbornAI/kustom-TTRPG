/* The settings page: the pages of the app, and the ones that are on. */
(function () {
  'use strict';

  var C = Sheet.core;
  var shelf = C.exchange.shelf;   /* the sign in and the shelf, one door */

  var api = null;   /* the shell gives it at mount */
  var E = {};

  /* The two actions of the update block: a circular arrow for a newer build,
     an arrow up for the shelf. */
  var ICON_UPDATE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3"/><path d="M3.5 4.4v5.2h5.2"/></svg>';
  var ICON_PUSH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';

  /* The exchange: the file and the link, each with its own icon and the two
     directions, in and out. */
  var ICON_UP = ICON_PUSH;
  /* The app to download: a tray with an arrow into it. */
  var ICON_APP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M12 4v10M8 10.5l4 4 4-4M5 19h14"/></svg>';
  var APK_URL = 'https://github.com/NewbornAI/kustom-TTRPG/releases/latest/download/custom-sheet.apk';
  var ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M12 5v14"/><path d="m5 12 7 7 7-7"/></svg>';
  var ICON_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M14 3.2H7a1.7 1.7 0 0 0-1.7 1.7v14.2A1.7 1.7 0 0 0 7 20.8h10a1.7 1.7 0 0 0 1.7-1.7V7.9z"/>' +
    '<path d="M14 3.2v4.7h4.7"/></svg>';
  var ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M10.2 13.8a4.4 4.4 0 0 0 6.2 0l2.4-2.4a4.4 4.4 0 0 0-6.2-6.2l-1.3 1.3"/>' +
    '<path d="M13.8 10.2a4.4 4.4 0 0 0-6.2 0l-2.4 2.4a4.4 4.4 0 0 0 6.2 6.2l1.3-1.3"/></svg>';

  /* The pages belong to the character: a bard can live without the volley
     page the warlock plays. A character that never chose keeps the pages
     of the app. */
  /* The shell answers which pages are on, so this page cannot say something
     the tabs do not. */
  function pages() { return api.pagesOn(); }

  function toggle(id) {
    var list = pages().slice();
    var ix = list.indexOf(id);
    if (ix >= 0) list.splice(ix, 1);
    else list.push(id);
    api.character().pages = list;
    api.save();
    api.refresh();
  }

  /* The look of the character: its colour and its icon are its own, and they
     are chosen here rather than in the sheet's edit mode, so the sheet keeps
     the table and the wrench keeps the classes. Every one of them is on show
     at once. */
  function look() {
    if (!E.themes) return;
    var rec = api.character();
    E.themes.innerHTML = '';
    E.icons.innerHTML = '';

    C.chrome.themes.forEach(function (t) {
      var on = (rec.theme || '') === t.id;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gcell' + (on ? ' on' : '');
      b.dataset.theme = t.id;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', t.label + ', ' + t.blurb + (on ? ', on' : ''));
      b.innerHTML = '<span class="gprev" style="background:' + t.swatch[0] + ';border-color:' + t.swatch[1] + '">' +
        '<i style="background:' + t.swatch[1] + '"></i><i style="background:' + t.swatch[2] + '"></i></span>' +
        '<span class="gname">' + C.chrome.esc(t.label) + '</span>';
      b.addEventListener('click', function () {
        if ((rec.theme || '') === t.id) return;
        rec.theme = t.id;
        api.save();
        api.refresh();
      });
      E.themes.appendChild(b);
    });

    Object.keys(C.chrome.icons).forEach(function (key) {
      var on = C.chrome.iconOf(rec) === key;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gcell' + (on ? ' on' : '');
      b.dataset.icon = key;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', C.chrome.icons[key].label + ', ' + C.chrome.icons[key].blurb + (on ? ', on' : ''));
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + C.chrome.icons[key].svg + '</svg>';
      b.addEventListener('click', function () {
        if (C.chrome.iconOf(rec) === key) return;
        rec.icon = key;
        api.save();
        api.refresh();
      });
      E.icons.appendChild(b);
    });
  }

  /* The bar: one row, four pages and More for the rest, or two rows that
     hold every page. A two-segment control, the choice the player sees. */
  function tabsSection() {
    if (!E.tabs) return;
    var rows = api.barRows();
    E.tabs.innerHTML = '';
    var row = document.createElement('div');
    row.className = 'srow';
    row.innerHTML = '<span class="t">Bar</span><span class="d"></span>' +
      C.toggle.segment({ key: 'rows', aria: 'Rows of the bar', on: String(rows),
        options: [{ id: '1', label: '1 row' }, { id: '2', label: '2 rows' }] });
    row.querySelector('.seg').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      api.setBarRows(Number(b.dataset.rows));
      api.refresh();
    });
    E.tabs.appendChild(row);

    /* The maximum of hit points of the character played: worked out from
       its classes and Constitution, or set by hand on its page. */
    var ch = api.character().char;
    if (!ch) return;
    var hp = document.createElement('div');
    hp.className = 'srow';
    hp.innerHTML = '<span class="t">Max hit points</span><span class="d">' + C.chrome.esc(ch.hpManual
        ? 'Set by hand on the character page'
        : 'Worked out for ' + (ch.name || 'this character') + ': the whole die at level 1, the average rounded up after, plus Constitution') + '</span>' +
      C.toggle.segment({ key: 'hp', aria: 'How the maximum of hit points is set', on: ch.hpManual ? 'hand' : 'auto',
        options: [{ id: 'auto', label: 'Auto' }, { id: 'hand', label: 'By hand' }] });
    hp.querySelector('.seg').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      ch.hpManual = b.dataset.hp === 'hand';
      api.save();
      api.refresh();
    });
    E.tabs.appendChild(hp);
  }

  /* What has arrived, so a phone that cannot read a file can say so. */
  function files() {
    var rows = [
      { name: 'The book', got: (C.library.book.spells || []).length, what: 'spells' },
      { name: 'The library of features', got: Object.keys(C.library.featureByKey).length, what: 'features' },
      { name: 'The classes', got: (C.library.classData || []).length, what: 'classes' }
    ];
    E.files.innerHTML = '';
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'srow';
      var on = r.got > 0;
      var why = C.library.dataError[r.what === 'spells' ? 'spellbook' : r.what];
      row.innerHTML = '<span class="t">' + C.chrome.esc(r.name) + '</span>' +
        '<span class="d">' + C.chrome.esc(on ? r.got + ' ' + r.what + ' ready' : (why ? why : 'not here yet')) + '</span>';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'stog' + (on ? ' on' : '');
      b.textContent = on ? 'Here' : 'Read';
      b.setAttribute('aria-label', (on ? r.name + ' is ready' : 'Read ' + r.name));
      b.addEventListener('click', function () { C.library.data(r.what === 'spells' ? 'spellbook' : r.what); });
      row.appendChild(b);
      E.files.appendChild(row);
    });
  }

  /* The update route: one button asks the machine that serves the app
     whether a newer build is there, and puts it in place when there is. The
     address belongs to the shell, so the summons tab asks the same machine
     and no page prints it. */
  function server() { return C.exchange.server(); }

  function update() {
    E.update.innerHTML = '';

    /* The two actions of the app sit centred over the build they act on: the
       update looks for a newer one, and the push sends the character to the
       shelf. The machine that serves the build is not on the screen: an
       address is plumbing, and the shell holds it. */
    var block = document.createElement('div');
    block.className = 'updblock';

    var acts = document.createElement('div');
    acts.className = 'updacts';
    block.appendChild(acts);

    /* In a browser there is no build to replace: the same place offers the
       app itself, the latest package of the public repository. */
    var inApp = !!(window.SheetShell || window.SheetNet);
    var go = document.createElement(inApp ? 'button' : 'a');
    go.className = 'updact';
    if (inApp) {
      go.type = 'button';
      go.innerHTML = ICON_UPDATE;
      go.setAttribute('aria-label', 'Look for a newer build and put it in place');
    } else {
      go.href = APK_URL;
      go.setAttribute('download', 'custom-sheet.apk');
      go.innerHTML = ICON_APP;
      go.setAttribute('aria-label', 'Download the app for Android');
      go.title = 'Download the app';
    }
    acts.appendChild(go);
    var head = E.update.previousElementSibling;
    if (head && head.firstElementChild) head.firstElementChild.textContent = inApp ? 'Update' : 'App';

    var push = document.createElement('button');
    push.type = 'button';
    push.className = 'updact';
    push.innerHTML = ICON_PUSH;
    push.setAttribute('aria-label', 'Push the character being played to the shelf');
    push.addEventListener('click', function () {
      if (push.disabled) return;
      push.disabled = true;
      putOnShelf().then(function () { push.disabled = false; });
    });
    acts.appendChild(push);

    var ver = document.createElement('span');
    ver.className = 'updver';
    ver.textContent = (C.exchange.version || '').replace('T', ' ').slice(0, 16);
    block.appendChild(ver);
    E.update.appendChild(block);

    /* One button for the whole route: it asks the machine, and when a newer
       build is there it fetches it and hands it to the installer of the
       phone. Nothing else ever appears beside it, and no second window opens
       on the file. */
    if (inApp) go.addEventListener('click', function () {
      if (go.disabled) return;
      go.disabled = true;
      api.toast('checking the machine');
      var address = server().replace(/\/$/, '');
      C.exchange.readUrl(address + '/version.json')
        .then(function (text) { return JSON.parse(text); })
        .then(function (v) {
          if (!v || !v.version) { api.toast('the machine did not answer'); go.disabled = false; return null; }
          if (v.version === C.exchange.version) { api.toast('this is the newest build'); go.disabled = false; return null; }
          api.toast('a newer build is there, fetching it');
          var apk = address + '/' + (v.apk || 'custom-sheet.apk');
          /* The fetch of the shell does not answer until the file is here,
             so the words above are given their paint before it starts. */
          return new Promise(function (done) {
            requestAnimationFrame(function () {
              setTimeout(function () { done(C.exchange.installUpdate(apk)); }, 0);
            });
          }).then(function (answer) {
            api.toast(answer === 'ok' ? 'the installer is open' : String(answer));
            go.disabled = false;
          });
        })
        .catch(function (e) {
          api.toast(String((e && e.message) || e));
          go.disabled = false;
        });
    });
  }

  /* The exchange: two cards, the file and the link. Each carries its own icon
     and the two directions, in and out, so a route reads as one thing. */
  function routeCard(spec) {
    var card = document.createElement('div');
    card.className = 'xcard';
    card.innerHTML = '<span class="xico">' + spec.icon + '</span>' +
      '<span class="xtext"><span class="xt">' + C.chrome.esc(spec.name) + '</span>' +
      '<span class="xd">' + C.chrome.esc(spec.note) + '</span></span>';
    var into = document.createElement('button');
    into.type = 'button';
    into.className = 'xbtn';
    into.innerHTML = ICON_DOWN;
    into.setAttribute('aria-label', spec.into);
    into.addEventListener('click', spec.onIn);
    card.appendChild(into);
    var out = document.createElement('button');
    out.type = 'button';
    out.className = 'xbtn';
    out.innerHTML = ICON_UP;
    out.setAttribute('aria-label', spec.out);
    out.addEventListener('click', spec.onOut);
    card.appendChild(out);
    return card;
  }

  /* The link of the character: copied or sent, and when the clipboard refuses
     it the link lands in the field under the cards. */
  var linkOut = '';

  function sendLink() {
    C.exchange.linkOf(C.exchange.packageOf(api.character())).then(function (where) {
      return C.exchange.shareLink(where).then(function (answer) {
        if (answer === 'copied') { api.toast('the link is in the clipboard'); return; }
        if (answer === 'ok') { api.toast('the link is ready to send'); return; }
        linkOut = where;
        api.refresh();
        api.toast('the link is in the field below');
      });
    }).catch(function (e) { api.toast(String((e && e.message) || e)); });
  }

  function linkField() {
    if (!E.link) return;
    E.link.innerHTML = '';
    if (!linkOut) return;
    var row = document.createElement('div');
    row.className = 'srow';
    row.innerHTML = '<span class="t">The link</span>';
    var field = document.createElement('input');
    field.className = 'cinput slim';
    field.type = 'text';
    field.readOnly = true;
    field.value = linkOut;
    field.setAttribute('aria-label', 'The link that carries the character');
    row.appendChild(field);
    E.link.appendChild(row);
  }

  function exchange() {
    E.exchange.innerHTML = '';
    var phone = C.chrome.isPhone();
    E.exchange.appendChild(routeCard({
      icon: ICON_FILE,
      name: 'File',
      note: 'a package of the character',
      into: 'Bring a character in from a file',
      out: phone ? 'Send the character being played as a file' : 'Save the character being played as a file',
      onIn: function () { C.exchange.pickFile(); },
      onOut: function () {
        var answer = C.exchange.exportCharacter();
        if (!answer.ok) { api.toast(answer.why); return; }
        api.toast(answer.name + (phone ? ' is ready to send' : ' was saved'));
      }
    }));
    E.exchange.appendChild(routeCard({
      icon: ICON_LINK,
      name: 'Link',
      note: 'a link that carries it',
      into: 'Bring in the character a link carries',
      out: 'Make a link of the character being played',
      onIn: function () { C.exchange.openPasteLink(); },
      onOut: sendLink
    }));
  }


  /* The push is the one door to signing in: a character cannot go to the
     shelf without a connection, so the code of GitHub is asked for here, the
     wait keeps the button busy, and the push follows the approval. */
  function connect() {
    api.toast('asking GitHub for a code');
    return shelf.begin().then(function (answer) {
      var where = answer.verification_uri || 'https://github.com/login/device';
      api.sheet.open({
        id: 'ghconnect',
        title: 'Connect to GitHub',
        metaClass: 'sheet-meta one',
        meta: '<span>Open GitHub, read the code, approve it. The app waits.</span>' +
          '<div class="crow"><span class="cn">' + C.chrome.esc(answer.user_code) + '</span>' +
          '<a class="mini" href="' + C.chrome.esc(where) + '" target="_blank" rel="noreferrer" aria-label="Open GitHub">&#8599;</a></div>',
        actions: [{
          label: 'Open GitHub',
          onClick: function () { C.exchange.openUrl(where); }
        }]
      });
      /* The sheet says the app is waiting, so it is painted once the wait
         starts. */
      api.refresh();
      return new Promise(function (done) {
        shelf.wait(function (ok, why) {
          if (ok) {
            api.sheet.close();
            api.toast(shelf.last() || 'signed in');
            api.refresh();
            done(true);
            return;
          }
          if (why) api.toast(String(why));
          api.refresh();
          done(false);
        });
      });
    }).catch(function (e) {
      api.toast(String((e && e.message) || e));
      return false;
    });
  }

  /* The character being played goes on the shelf, as a package, one file per
     character, on the branch that is named. A push with no connection asks
     for one first. */
  function putOnShelf() {
    var ready = shelf.signedIn() ? Promise.resolve(true) : connect();
    return ready.then(function (ok) {
      if (!ok) return;
      api.toast('putting it on the shelf');
      return shelf.put(api.character()).then(function (answer) {
        api.save();
        api.refresh();
        if (!answer.ok) { api.toast(answer.why); return; }
        api.toast('it is on the shelf');
        showAddress(answer.url);
      });
    }).catch(function (e) { api.toast(String((e && e.message) || e)); });
  }

  /* The address of the file on GitHub, which is a link anyone can open and
     which holds the character itself. It is the way to a character that does
     not travel in a message. */
  function showAddress(url) {
    if (!url || !E.address) return;
    E.address.innerHTML = '';
    var row = document.createElement('div');
    row.className = 'srow';
    var title = document.createElement('span');
    title.className = 't';
    title.textContent = 'The file on GitHub';
    row.appendChild(title);
    var field = document.createElement('input');
    field.className = 'cinput slim';
    field.type = 'text';
    field.readOnly = true;
    field.value = url;
    field.setAttribute('aria-label', 'The address of the file on GitHub');
    row.appendChild(field);
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'stog';
    copy.textContent = 'Copy';
    copy.setAttribute('aria-label', 'Copy the address of the file');
    copy.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { api.toast('the address is in the clipboard'); })
          .catch(function () { api.toast('the address is in the field above'); });
        return;
      }
      api.toast('the address is in the field above');
    });
    row.appendChild(copy);
    E.address.appendChild(row);
  }

  /* ---- the campaign ----

     One repository per campaign, run by the game master, and every player
     of the table syncs with it. The game master starts one from two pages of
     GitHub the app fills in, then shows the invite: a link to send and a QR
     code to scan. A player joins by pasting the link or scanning the code,
     and switches between the campaigns they joined here. */
  function campaign() {
    if (!E.campaign) return;
    E.campaign.innerHTML = '';
    var now = shelf.current();
    var list = shelf.campaigns();
    /* The shelf of a sign in is a shelf only once there is a sign in: with
       none, the repository the build names is not the player's to write. From
       a campaign it stays a place to go, and its first push asks for the sign
       in. */
    var own = shelf.ownRepo();
    var signed = own && (now || shelf.hasSession()) ? own : '';

    /* Every shelf is one row and one tap away, and a switch keeps every key:
       forgetting one sits behind the row's menu. */
    function pickButton(on, name, id) {
      var pick = button(on ? 'Here' : 'Play', on ? name + ' is the shelf' : 'Play in ' + name, function () {
        if (on) return;
        shelf.useCampaign(id);
        api.save();
        api.toast('the shelf is ' + name);
        api.refresh();
      });
      if (on) pick.classList.add('on');
      return pick;
    }

    list.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'srow camprow';
      row.innerHTML = '<span class="t">' + C.chrome.esc(c.name) + '</span><span class="d">' + C.chrome.esc(c.repo) + '</span>';
      row.appendChild(pickButton(!!(now && now.id === c.id), c.name, c.id));
      row.appendChild(button('⋯', 'More of ' + c.name, function () { campaignMenu(c); }));
      E.campaign.appendChild(row);
    });

    if (signed) {
      var mine = document.createElement('div');
      mine.className = 'srow camprow';
      var barred = shelf.refused();
      mine.innerHTML = '<span class="t">Your GitHub shelf</span><span class="d">' + C.chrome.esc(signed) + (barred ? ': this sign in cannot write it' : '') + '</span>';
      if (now || !barred) mine.appendChild(pickButton(!now, 'your GitHub shelf', ''));
      E.campaign.appendChild(mine);
    }

    if (!list.length && !signed) {
      var none = document.createElement('div');
      none.className = 'srow';
      none.innerHTML = '<span class="d">No campaign yet. The game master starts one, and the players join it with the invite.</span>';
      E.campaign.appendChild(none);
    }

    var acts = document.createElement('div');
    acts.className = 'campacts';
    acts.appendChild(button('Join a campaign', 'Join a campaign with its invite', openJoin));
    acts.appendChild(button('Start a campaign', 'Start a campaign as the game master', function () { openStart(); }));
    E.campaign.appendChild(acts);
  }

  function button(label, aria, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'stog';
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    b.addEventListener('click', onClick);
    return b;
  }

  function campaignMenu(c) {
    var actions = [];
    if (c.key) actions.push({ label: 'Invite', onClick: function () { openInvite(c); } });
    actions.push({ label: 'Forget', kind: 'quiet', onClick: function () { forget(c); } });
    api.sheet.open({ id: 'camp:' + c.id, title: c.name, actions: actions });
  }

  function forget(c) {
    api.sheet.open({
      id: 'campforget',
      title: 'Forget ' + c.name + '?',
      text: '<p>' + C.chrome.esc('To play elsewhere, tap Play on another shelf instead: the key stays. Forgetting removes the key from this phone. The characters stay in the repository, and only the invite brings the campaign back, or a new key from the owner of the repository.') + '</p>',
      actions: [
        { label: 'Forget', onClick: function () { shelf.removeCampaign(c.id); api.save(); api.sheet.closeAll(); api.toast('forgot ' + c.name); api.refresh(); } },
        { label: 'Keep the invite', kind: 'quiet', onClick: function () { openInvite(c); } },
        { label: 'Cancel', kind: 'quiet', onClick: function () { api.sheet.close(); } }
      ]
    });
  }

  /* The invite: the QR code to scan across the table, and the link to send
     to whoever is not there. The words under it say what the link is: the
     key of the campaign, for the players of this table only. */
  function openInvite(c) {
    var link = C.exchange.inviteLink(c);
    api.sheet.open({
      id: 'campinvite',
      title: 'Invite to ' + c.name,
      metaClass: 'sheet-meta one',
      meta: '<div class="campqr">' + C.exchange.qrSvg(link, 'The QR code of the invite to ' + c.name) + '</div>' +
        '<p class="campwarn">Players scan this from Settings, Join a campaign, or paste the link. Anyone with it can read and change the characters of ' +
        C.chrome.esc(c.name) + ': send it to the players of this table only.</p>',
      actions: [
        { label: 'Send the link', onClick: function () {
          C.exchange.shareLink(link).then(function (answer) {
            if (answer === 'copied') api.toast('the invite is in the clipboard');
            else if (answer === 'ok') api.toast('the invite is ready to send');
            else api.toast('the invite could not be sent');
          });
        } },
        { label: 'Copy', kind: 'quiet', onClick: function () {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(function () { api.toast('the invite is in the clipboard'); })
              .catch(function () { api.toast('the clipboard said no: use Send the link'); });
          } else api.toast('the clipboard said no: use Send the link');
        } }
      ]
    });
  }

  /* A player joins: the invite on the clipboard, or the QR code on the game
     master's screen. Neither asks for a word to be typed. */
  function openJoin() {
    function joined(answer) {
      if (!answer) return;
      if (!answer.ok) { if (answer.why) api.toast(answer.why); return; }
      api.sheet.closeAll();
      api.toast('you joined ' + answer.campaign.name + ': its characters are under the add of the characters');
      api.refresh();
    }
    api.sheet.open({
      id: 'campjoin',
      title: 'Join a campaign',
      metaClass: 'sheet-meta one',
      meta: '<p class="campwarn">Copy the invite link the game master sent, then Paste. Or scan the code on their screen.</p>',
      actions: [
        { label: 'Paste the invite', onClick: function () {
          C.exchange.clipText().then(function (text) {
            if (!C.exchange.readInvite(text)) {
              api.toast('the clipboard holds no invite: copy the link first');
              C.exchange.openPasteLink();
              return null;
            }
            api.toast('joining');
            return C.exchange.joinInvite(text);
          }).then(joined);
        } },
        { label: 'Scan the QR', kind: 'quiet', onClick: function () {
          C.exchange.scanQr().then(function (got) {
            if (!got.ok) { if (got.why) api.toast(got.why); return null; }
            if (!C.exchange.readInvite(got.text)) { api.toast('that code is not the invite of a campaign'); return null; }
            api.toast('joining');
            return C.exchange.joinInvite(got.text);
          }).then(joined);
        } },
        { label: 'No invite: I own its repository', kind: 'quiet', onClick: function () { openStart(); } }
      ]
    });
  }

  /* The game master starts a campaign in three taps on GitHub and one paste
     here. The name is the only word typed, and it names the repository and
     the key. */
  function openStart(had) {
    var st = had || { name: '', key: '', note: '', needRepo: false };
    function nameNow(root) {
      var f = root && root.querySelector('#campName');
      if (f) st.name = f.value.trim();
      return st.name;
    }
    function step(n, title, note, label, id) {
      return '<div class="campstep"><span class="campn">' + n + '</span><span class="camptx"><span class="t">' + title + '</span>' +
        (note ? '<span class="d">' + note + '</span>' : '') + '</span><button type="button" class="stog" id="' + id + '">' + label + '</button></div>';
    }
    api.sheet.open({
      id: 'campstart',
      title: 'Start a campaign',
      dock: true,
      metaClass: 'sheet-meta one',
      meta: '<input class="sheet-search" id="campName" type="text" placeholder="Name of the campaign" aria-label="Name of the campaign" value="' + C.chrome.esc(st.name) + '">' +
        step(1, 'Make its repository', 'GitHub opens with it filled in, private. Tap Create. A campaign that has one already skips this: its characters stay, and the keys of its players still work.', 'Open', 'campRepo') +
        step(2, 'Make its key', 'GitHub opens with the key filled in, but it starts on All repositories: under Repository access choose Only select repositories and pick the repository of the campaign, then Generate and copy the key. The app refuses a key that reaches more.', 'Open', 'campKeyGo') +
        step(3, st.needRepo ? 'Paste the address of the repository' : 'Paste the key', st.needRepo ? 'The key reaches no repository the app can find: copy the address of the repository from GitHub and paste it.' : 'The app finds the repository with it and writes the first file.', 'Paste', 'campPaste') +
        '<input class="sheet-search" id="campKey" type="text" autocomplete="off" placeholder="or paste it here" aria-label="The key, pasted" value="">' +
        (st.note ? '<p class="campwarn">' + C.chrome.esc(st.note) + '</p>' : ''),
      onPaint: function (root) {
        var go = function (id, fn) { var b = root.querySelector('#' + id); if (b) b.addEventListener('click', fn); };
        go('campRepo', function () {
          if (!nameNow(root)) { api.toast('name the campaign first'); return; }
          C.exchange.openUrl(shelf.newRepoUrl(st.name));
        });
        go('campKeyGo', function () {
          if (!nameNow(root)) { api.toast('name the campaign first'); return; }
          C.exchange.openUrl(shelf.keyUrl(st.name));
        });
        go('campPaste', function () {
          if (!nameNow(root)) { api.toast('name the campaign first'); return; }
          var typed = root.querySelector('#campKey');
          var field = typed && typed.value.trim();
          (field ? Promise.resolve(field) : C.exchange.clipText()).then(function (text) {
            text = String(text || '').trim();
            if (!text) { api.toast('the clipboard is empty: copy the key on GitHub first'); return; }
            var isKey = /^(github_pat_|ghp_)/.test(text);
            if (!isKey && !(st.needRepo && /github\.com\/[^/]+\/[^/]+/.test(text))) {
              api.toast(st.needRepo ? 'that is not the address of a repository' : 'that is not a GitHub key: it starts with github_pat_');
              return;
            }
            if (isKey) st.key = text;
            api.toast('finding the repository');
            shelf.claimCampaign(st.name, st.key, isKey ? '' : text).then(function (answer) {
              if (answer.ok) {
                api.save();
                api.refresh();
                openInvite(answer.campaign);
                return;
              }
              st.note = answer.why;
              st.needRepo = !!answer.needRepo;
              openStart(st);
            });
          });
        });
      }
    });
  }

  /* The credits. The text of the rules comes from the System Reference
     Document, which is under Creative Commons Attribution 4.0, and the
     licence asks for this notice wherever the text is published. */
  function credits() {
    E.credits.innerHTML = '';
    var rows = [
      { t: 'The rules', d: 'The spells, the classes, the archetypes and the surge table come from the System Reference Document 5.2 by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd, under the Creative Commons Attribution 4.0 International Licence, https://creativecommons.org/licenses/by/4.0/legalcode. The text was taken from 5e.tools and laid out by this app; the app itself is not part of the SRD and is not under that licence.' },
      { t: 'The name', d: 'Dungeons & Dragons, D&D and the D20 logo are trademarks of Wizards of the Coast LLC. This app is not affiliated with, endorsed by or sponsored by Wizards of the Coast.' },
      { t: 'The font', d: 'Cinzel is under the SIL Open Font Licence 1.1.' },
      { t: 'The licence', d: 'The app is under the MIT licence. The text of the rules in the data files is under the Creative Commons Attribution 4.0 International Licence, and the NOTICE file of the repository says where it comes from.' }
    ];
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'srow';
      row.innerHTML = '<span class="t">' + C.chrome.esc(r.t) + '</span><span class="d">' + C.chrome.esc(r.d) + '</span>';
      E.credits.appendChild(row);
    });
  }

  Sheet.page({
    id: 'settings',
    title: 'Settings',
    order: 4,
    hidden: true,   /* the gear opens it, so it has no tab of its own */
    blurb: 'The pages of the app.',
    css: [
      '.updblock{display:flex;flex-direction:column;align-items:center;gap:8px;padding:11px 9px 9px;border:1px solid var(--edge);border-radius:8px;background:rgba(255,255,255,.03);}',
      '.updacts{display:flex;align-items:center;justify-content:center;gap:26px}',
      '.updact{width:40px;height:40px;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid var(--edge);border-radius:10px;background:none;color:var(--muted);cursor:pointer;}',
      '.updact svg{width:19px;height:19px;display:block}',
      '.updact:active{border-color:rgba(var(--arcane-rgb),.6);color:var(--arcane)}',
      '.updact:disabled{opacity:.45;cursor:default}',
      '.updver{font-size:10.5px;letter-spacing:.04em;color:var(--muted);font-variant-numeric:tabular-nums}',
      '.cinput.slim{font-family:var(--sans);font-size:12.5px;font-weight:400;letter-spacing:.01em}',
      /* The exchange: a card per route, its own icon and the two directions. */
      '.xcard{display:flex;align-items:center;gap:9px;padding:9px 10px;border:1px solid var(--edge);border-radius:8px;background:rgba(255,255,255,.03)}',
      '.xcard .xico{flex:0 0 auto;color:var(--arcane)}',
      '.xcard .xico svg{width:21px;height:21px;display:block}',
      '.xcard .xtext{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.xcard .xt{font-size:12.5px;color:var(--ink)}',
      '.xcard .xd{font-size:10.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.xcard .xbtn{flex:0 0 auto;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid var(--edge);border-radius:8px;background:none;color:var(--muted);cursor:pointer}',
      '.xcard .xbtn svg{width:16px;height:16px;display:block}',
      '.xcard .xbtn:active{border-color:rgba(var(--arcane-rgb),.6);color:var(--arcane)}',
      /* The look of the character: the colours and the icon, chosen here
         rather than in the sheet's edit mode. The gallery shows every one of
         them at once, and the icon grid is the wider one. */
      '.gal{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}',
      /* The fourteen icons raster as one layer of their own, so the first
         paint of this page does not stall a frame on them: unmoved, the
         cold raster measured 173 to 233 ms, and on their own layer 39 to
         40 ms. It is the same fix the character page carried while the
         gallery lived there. */
      '.gal.icons{grid-template-columns:repeat(7,1fr);gap:4px;will-change:transform}',
      '.gcell{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;background:none;border:1px solid var(--edge);border-radius:6px;color:var(--muted);cursor:pointer;font:inherit;min-width:0}',
      '.gcell.on{border-color:rgba(var(--arcane-rgb),.6);color:var(--ink);background:rgba(var(--arcane-rgb),.10)}',
      '.gcell:focus-visible{outline:2px solid var(--arcane);outline-offset:1px}',
      '.gprev{width:26px;height:17px;border-radius:4px;border:1px solid;display:flex;align-items:center;justify-content:center;gap:3px}',
      '.gprev i{width:5px;height:5px;border-radius:50%;display:block}',
      '.gname{font-size:9px;line-height:1.1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}',
      '.gal.icons .gcell{padding:7px 2px}',
      '.gal.icons svg{width:21px;height:21px;display:block}',
      '.gal.icons .gname{display:none}',
      '.srow .seg{flex:0 0 auto}',
      /* The campaign: a row per campaign joined, the two ways in below them,
         the steps of a new one, and the QR code of the invite. */
      '.camprow{gap:6px}',
      '.camprow .stog{flex:0 0 auto}',
      '.camprow .d{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.campacts{display:flex;gap:8px}',
      '.campacts .stog{flex:1 1 0;min-height:40px}',
      '.campstep{display:flex;align-items:center;gap:9px;padding:7px 0;border-top:1px solid var(--edge)}',
      '.sheet-meta .campn{font-style:normal;flex:0 0 22px;height:22px;border-radius:50%;border:1px solid rgba(var(--arcane-rgb),.6);color:var(--arcane);font-size:12px;display:flex;align-items:center;justify-content:center}',
      '.sheet-meta .camptx{font-style:normal;white-space:normal;overflow:visible;flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.sheet-meta .camptx .t{font-style:normal;white-space:normal;font-size:13px;color:var(--ink)}',
      '.sheet-meta .camptx .d{font-style:normal;font-size:11px;color:var(--muted);line-height:1.35;white-space:normal}',
      '.campstep .stog{flex:0 0 auto;min-width:64px;min-height:36px}',
      '.campqr{width:min(78vw,300px);margin:4px auto;border-radius:10px;overflow:hidden;background:#fff}',
      '.campqr svg{display:block;width:100%;height:auto}',
      '.campwarn{margin:4px 0 0;font-size:11.5px;line-height:1.4;color:var(--muted);white-space:normal}',
    ].join('\n'),
    html: [
      '<div class="charbody" id="settingsBody">',
      /* The update is the first thing on the page: a build that is behind is
         the one thing here that has to be seen before anything is read. */
      '  <div class="cshead"><span>Update</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsUpdate"></div>',
      /* The campaign comes second: the shelf of the table is where every
         character of it is kept, and a player joins once. */
      '  <div class="cshead"><span>Campaign</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsCampaign"></div>',
      '  <div class="cshead"><span>Pages</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsList"></div>',
      /* The bar that carries those pages: one row or two. */
      '  <div class="cshead"><span>Bar</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsTabs"></div>',
      '  <div class="cshead"><span>Colours</span><span class="rule"></span></div>',
      '  <div class="gal" id="settingsThemes"></div>',
      '  <div class="cshead"><span>Icon</span><span class="rule"></span></div>',
      '  <div class="gal icons" id="settingsIcons"></div>',
      '  <div class="cshead"><span>The files</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsFiles"></div>',
      '  <div class="cshead"><span>Exchange</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsExchange"></div>',
      '  <div class="fcards" id="settingsLink"></div>',
      '  <div class="fcards" id="settingsAddress"></div>',
      '  <div class="cshead"><span>Credits</span><span class="rule"></span></div>',
      '  <div class="fcards" id="settingsCredits"></div>',
      '</div>'
    ].join('\n'),

    mount: function (root, a) {
      api = a;
      E = {
        body: root.querySelector('#settingsBody'),
        list: root.querySelector('#settingsList'),
        tabs: root.querySelector('#settingsTabs'),
        files: root.querySelector('#settingsFiles'),
        exchange: root.querySelector('#settingsExchange'),
        link: root.querySelector('#settingsLink'),
        address: root.querySelector('#settingsAddress'),
        credits: root.querySelector('#settingsCredits'),
        update: root.querySelector('#settingsUpdate'),
        campaign: root.querySelector('#settingsCampaign'),
        themes: root.querySelector('#settingsThemes'),
        icons: root.querySelector('#settingsIcons')
      };
    },

    render: function (a) {
      api = a;
      E.list.innerHTML = '';
      files();
      update();
      campaign();
      exchange();
      linkField();
      if (E.address) E.address.innerHTML = '';
      look();
      tabsSection();
      credits();
      /* The pages in the order of their tabs, whatever order their files
         were read in. */
      api.pages.slice().sort(function (x, y) { return x.order - y.order; }).forEach(function (p) {
        if (p.hidden) return;
        var on = p.home || pages().indexOf(p.id) >= 0;
        var row = document.createElement('div');
        row.className = 'srow';
        row.innerHTML = '<span class="t">' + C.chrome.esc(typeof p.title === 'function' ? p.title(api) : p.title) + '</span>' +
          '<span class="d">' + C.chrome.esc(p.blurb || '') + '</span>';
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'stog' + (on ? ' on' : '');
        b.textContent = p.home ? 'Always' : (on ? 'On' : 'Off');
        b.disabled = !!p.home;
        b.setAttribute('aria-label', (typeof p.title === 'function' ? p.title(api) : p.title) + ', ' + (on ? 'on' : 'off'));
        if (!p.home) {
          b.addEventListener('click', function () { toggle(p.id); });
        }
        row.appendChild(b);
        E.list.appendChild(row);
      });
    }
  });
})();
