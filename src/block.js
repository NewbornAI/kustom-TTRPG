/* The block: what a page may contribute to the app.

   A page paints, and it also brings things: a data file the loader reads and
   fills, a theme, an icon, and the page itself with the place it sits in. All
   of it goes through one door, so a page that comes in a package is not a
   cousin of the pages the app ships.

   The registries are here and nothing else is: the shell paints, reads the
   files and keeps the store, and it asks this module what a name means. */
(function (root) {
  'use strict';

  root.SheetBlock = function (coreOf) {
    /* The core of the app, asked when a page runs, and the wiring of the
       attributes a written page may use instead of listeners. */
    var WIRE = root.SheetWire ? root.SheetWire(coreOf) : null;
    var shapes = {};   /* the name of a data file, and how it fills its shape */
    var themes = [];   /* the colours a character can wear */
    var icons = {};    /* the icons of the head, by id */
    var pages = [];    /* the pages, in the order they joined */

    /* A page says which file it reads and how the file fills the shape the
       page already holds, so the loader carries no list of names. */
    function data(name, shape) {
      if (!name) throw new Error('a data file needs a name');
      if (typeof shape === 'function') {
        shapes[name] = shape;
        return shape;
      }
      return shapes[name] || null;
    }

    /* The value of a file, put into the shape the page declared. A file no
       page declared is read and dropped, which is what a page that forgot to
       declare it deserves. */
    function fill(name, value) {
      var shape = shapes[name];
      if (!shape) return false;
      shape(value);
      return true;
    }

    function shaped() { return Object.keys(shapes); }

    /* A theme or an icon joins the gallery, and the one the app came with is
       a registration like any other. A spec may be lazy: the gallery needs a
       label and a swatch to paint a cell, so they are filled here, and a
       theme that brings its own colours carries them in vars, which is the
       rule the body wears. */
    function theme(spec) {
      if (!spec || spec.id === undefined || spec.id === null) throw new Error('a theme needs an id');
      if (String(spec.id) !== String(spec.id).replace(/[^A-Za-z0-9_-]/g, '')) {
        throw new Error('a theme id is letters, digits, dash and underscore');
      }
      spec.label = spec.label || spec.id || 'Theme';
      spec.blurb = spec.blurb || '';
      spec.swatch = (spec.swatch && spec.swatch.length >= 3) ? spec.swatch : ['#08070f', '#9b7bff', '#ffc44d'];
      var at = -1;
      themes.forEach(function (t, i) { if (t.id === spec.id) at = i; });
      if (at >= 0) themes[at] = spec; else themes.push(spec);
      return spec;
    }

    /* The rule a theme wears when it brings its own colours, or nothing when
       its rule is in the page, the way the themes the app ships are. */
    function themeRule(spec) {
      if (!spec || !spec.id || !spec.vars) return '';
      var css = 'body[data-theme="' + spec.id + '"]{';
      Object.keys(spec.vars).forEach(function (key) {
        var name = key.indexOf('--') === 0 ? key : '--' + key;
        css += name + ':' + spec.vars[key] + ';';
      });
      return css + '}';
    }

    function icon(spec) {
      if (!spec || !spec.id) throw new Error('an icon needs an id');
      spec.label = spec.label || spec.id;
      spec.blurb = spec.blurb || '';
      spec.svg = spec.svg || '';
      icons[spec.id] = spec;
      return spec;
    }

    /* A page joins the app by describing itself. A page of a package
       replaces the package page it is named after, never a page of the app;
       a built-in page that wants a name already taken is a mistake. */
    function page(spec) {
      if (!spec || !spec.id) throw new Error('a page needs an id');
      spec.order = spec.order === undefined ? pages.length : Number(spec.order);
      /* A page may bring the colours and the icons it paints with, so a
         package carries its look with the page that brought it. A spec that
         does not hold is dropped: a package must not break the app it arrives
         in, and a page that brings one by hand still hears about it. */
      (spec.themes || []).forEach(function (one) {
        if (!one || one.id === undefined) return;
        try { theme(one); } catch (e) {}
      });
      (spec.icons || []).forEach(function (one) {
        if (!one || !one.id) return;
        try { icon(one); } catch (e) {}
      });
      var at = -1;
      pages.forEach(function (p, i) { if (p.id === spec.id) at = i; });
      if (at >= 0) {
        if (!spec.plugin) throw new Error('two pages want the id ' + spec.id);
        /* A package replaces a page of a package, never a page of the app:
           a link must not be able to swap the settings or the sheet. */
        if (!pages[at].plugin) throw new Error('a package page cannot take the place of the page ' + spec.id);
        pages[at] = spec;
      } else {
        pages.push(spec);
      }
      return spec;
    }

    /* A page leaves the registry, so a package page that belongs to another
       character, or a page about to be written again, is gone. */
    function remove(id) {
      var at = -1;
      pages.forEach(function (p, i) { if (p.id === id) at = i; });
      if (at < 0) return null;
      return pages.splice(at, 1)[0];
    }

    /* The rules of a page are the source of a function. They run with the
       rights of the app itself, so a package is only as safe as the person
       who sent it. */
    function compile(src) {
      return compiled(src).fn;
    }

    /* The same, with the reason a source did not compile, so a page that is
       broken says so on screen instead of showing nothing. */
    function compiled(src) {
      if (!src) return { fn: null, error: '' };
      try {
        /* C is the core, so a written page reads the helpers by the same
           name the pages of the app do. */
        var fn = new Function('C', 'return (' + src + ');')(coreOf ? coreOf() : undefined);
        if (typeof fn !== 'function') return { fn: null, error: 'it is not a function' };
        return { fn: fn, error: '' };
      } catch (e) {
        return { fn: null, error: String((e && e.message) || e) };
      }
    }

    /* A page of a package, as a page of the app: every key a built-in page
       may carry, with the rules compiled. */
    function plugin(p) {
      if (!p || !p.id) return null;
      var errors = [];
      function rule(key) {
        var c = compiled(p[key]);
        if (c.error) errors.push(key + ': ' + c.error);
        return c.fn;
      }
      var mount = rule('mount');
      var render = rule('render');
      var seed = rule('seed');
      var head = rule('head');
      var here = null;
      return {
        id: p.id,
        title: p.title || p.id,
        order: p.order === undefined ? pages.length : Number(p.order),
        blurb: p.blurb || '',
        html: typeof p.html === 'string' ? p.html : '',
        css: (p.css || '') + (WIRE ? '\n' + WIRE.CSS : ''),
        tab: p.tab || '',
        glyph: typeof p.glyph === 'string' ? p.glyph : '',
        slice: p.slice || p.id,
        hidden: !!p.hidden || !!p.into,
        /* A panel: a part that lives inside a page of the app instead of a
           tab of its own, at its top or its bottom. */
        into: typeof p.into === 'string' ? p.into : '',
        at: p.at === 'top' || p.at === 'bar' ? p.at : 'bottom',
        home: !!p.home,
        plugin: true,
        themes: Array.isArray(p.themes) ? p.themes : [],
        icons: Array.isArray(p.icons) ? p.icons : [],
        /* The wiring runs around the page's own rules: it listens once at
           the mount, and paints after the page's render on every repaint. */
        mount: function (box, a) {
          here = box;
          if (WIRE) WIRE.mount(box, a, p.slice || p.id);
          if (mount) mount(box, a);
          if (WIRE) WIRE.paint(box, a);
        },
        render: function (a) {
          if (render) render(a);
          if (WIRE) WIRE.paint(here, a);
        },
        seed: seed,
        head: head,
        /* What did not compile, for the shell to show in the page. */
        error: errors.join('; '),
        /* The package as it came, so the same page registered twice is
           known to be the same and is not mounted again. */
        source: JSON.stringify(p)
      };
    }

    /* The pages a character starts with: a page says it is one of them. */
    function defaults() {
      return pages.filter(function (p) { return p.on; }).map(function (p) { return p.id; });
    }

    return {
      data: data,
      fill: fill,
      shaped: shaped,
      theme: theme,
      themeRule: themeRule,
      icon: icon,
      themes: function () { return themes; },
      icons: function () { return icons; },
      page: page,
      remove: remove,
      plugin: plugin,
      pages: function () { return pages; },
      defaults: defaults,
      compile: compile,
      compiled: compiled
    };
  };
})(typeof window !== 'undefined' ? window : this);
