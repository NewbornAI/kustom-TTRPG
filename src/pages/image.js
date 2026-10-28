/* The image page: the picture of the character, one per character. The file
   the player picks is downscaled here, on a canvas, before it is written to
   the record, so the one key the whole store lives in keeps a small copy
   rather than a camera photo. The picture belongs to the character, so it
   travels in the package, in the link and to the shelf like every slice.
   A character without one shows the icon it already chose, so the empty
   frame is a state of the page and not a hole in it. */
(function () {
  'use strict';

  var C = Sheet.core;

  var api = null;
  var E = {};

  /* What the store keeps: the long side and the quality of the small copy.
     720 px is twice the width of the screen, and a drawing keeps its
     transparency in webp. */
  var LONG = 720;
  var QUALITY = 0.82;

  function commit() { api.save(); api.refresh(); }

  function slice() {
    var rec = api.character();
    if (!rec.image || typeof rec.image !== 'object') rec.image = { data: '' };
    if (typeof rec.image.data !== 'string') rec.image.data = '';
    return rec.image;
  }

  function picture() { return slice().data; }

  /* A new character has no picture, and one already saved keeps the one it
     carries. */
  function seed(saved) {
    var s = (saved && typeof saved === 'object') ? saved : {};
    if (typeof s.data !== 'string') s.data = '';
    return s;
  }

  /* The file is drawn on a canvas and kept as a data URL: the whole store
     shares one localStorage key, so the small copy goes in and not the
     file. */
  function shrink(file, done) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth || 1;
      var h = img.naturalHeight || 1;
      var k = Math.min(1, LONG / Math.max(w, h));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * k));
      canvas.height = Math.max(1, Math.round(h * k));
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      done(canvas.toDataURL('image/webp', QUALITY));
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      done('');
    };
    img.src = url;
  }

  /* The icon the character already chose, for the frame that has no
     picture. */
  function icon() {
    var keys = Object.keys(C.chrome.icons || {});
    var set = C.chrome.icons[C.chrome.iconOf(api.character())] || C.chrome.icons[keys[0]];
    return set ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + set.svg + '</svg>' : '';
  }

  function paint() {
    var editing = api.editing('image');
    var data = picture();
    var name = (api.character().char || {}).name || 'The character';
    if (data) E.pic.src = data;
    else E.pic.removeAttribute('src');
    E.pic.alt = 'The picture of ' + name;
    E.pic.hidden = !data;
    E.none.hidden = !!data;
    E.none.innerHTML = icon();
    E.frame.classList.toggle('empty', !data);
    E.acts.hidden = !editing;
    E.take.disabled = !data;
    E.pick.textContent = data ? 'Choose another picture' : 'Choose a picture';
  }

  Sheet.page({
    id: 'image',
    glyph: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5h.01',
    title: 'Image',
    tab: 'Image',
    order: 6,
    on: true,
    blurb: 'The picture of the character.',
    slice: 'image',
    seed: seed,
    css: [
      /* The picture is the page: the frame takes what is left of the body,
         and an empty one is a dashed frame around the character's icon. */
      '.imgframe{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;border:1px solid var(--edge);border-radius:10px;background:rgba(255,255,255,.025);overflow:hidden}',
      '.imgframe.empty{border-style:dashed}',
      '.imgpic{max-width:100%;max-height:100%;display:block}',
      '.imgnone{width:64px;height:64px;display:flex;align-items:center;justify-content:center;color:var(--arcane);opacity:.35}',
      '.imgnone svg{width:100%;height:100%;display:block}',
      '.imgacts{flex:0 0 auto;display:flex;gap:8px}',
      '.imgbtn{flex:1 1 0;min-height:40px;padding:8px;border:1px solid var(--edge);border-radius:8px;background:rgba(255,255,255,.03);color:var(--ink);font-family:var(--sans);font-size:12px;cursor:pointer}',
      '.imgbtn:active{border-color:rgba(var(--arcane-rgb),.6);color:var(--arcane)}',
      '.imgbtn.take{color:#d08a9c}',
      '.imgbtn:disabled{opacity:.4;cursor:default}'
    ].join('\n'),
    html: [
      '<div class="charbody" id="imgBody">',
      '  <div class="imgframe empty" id="imgFrame">',
      '    <img class="imgpic" id="imgPic" alt="" hidden>',
      '    <span class="imgnone" id="imgNone" aria-hidden="true"></span>',
      '  </div>',
      '  <div class="imgacts" id="imgActs" hidden>',
      '    <button class="imgbtn" id="imgPick" type="button">Choose a picture</button>',
      '    <button class="imgbtn take" id="imgTake" type="button">Take it away</button>',
      '  </div>',
      '  <input class="imgfile" id="imgFile" type="file" accept="image/*" hidden>',
      '</div>'
    ].join('\n'),

    mount: function (root, a) {
      api = a;
      E = {
        body: root.querySelector('#imgBody'),
        frame: root.querySelector('#imgFrame'),
        pic: root.querySelector('#imgPic'),
        none: root.querySelector('#imgNone'),
        acts: root.querySelector('#imgActs'),
        pick: root.querySelector('#imgPick'),
        take: root.querySelector('#imgTake'),
        file: root.querySelector('#imgFile')
      };

      /* One path for the web and the phone: the same file control, and the
         Android shell answers it with the chooser of the phone. */
      E.pick.addEventListener('click', function () { E.file.click(); });

      E.file.addEventListener('change', function () {
        var file = E.file.files && E.file.files[0];
        E.file.value = '';
        if (!file) return;
        if (file.type && file.type.indexOf('image/') !== 0) { api.toast('that file is not a picture'); return; }
        shrink(file, function (data) {
          if (!data) { api.toast('the picture could not be read'); return; }
          slice().data = data;
          commit();
          api.toast('the picture is on the sheet');
        });
      });

      E.take.addEventListener('click', function () {
        if (!picture()) return;
        slice().data = '';
        commit();
        api.toast('the picture is away');
      });
    },

    head: function (root, a) {
      api = a;
      root.appendChild(a.wrench({ label: 'Edit the image' }));
    },

    render: function (a) {
      api = a;
      paint();
    }
  });
})();
