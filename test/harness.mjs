/* The test harness: the build the suites read, the files they load, and the
   way a page is run outside the app.

   built() runs node build.mjs once per process into a throwaway directory, so a suite
    never reads a dist
   the sources no longer say, and answers { html, data }: the text of the built
   page, and a reader of the data files beside it.

   source(name) reads a file of src/, one spelling of the path for every suite.

   page(id, opts) runs src/pages/<id>.js in a vm with the globals the app gives
   it, hands it opts.core, and returns the spec it registered. coreStub(parts)
   builds that core from the real module objects a page needs, in the shape of
   the real core, and refuses a member the real core does not carry, so a stub
   can no longer answer a name the app would not.

   What this harness does NOT do: mount a page in a DOM. Node has no DOM and
   this repo takes no dependency, so a fake DOM would be a test double that
   drifts, and the one thing a harness must not do is invent an answer. The
   shell's behaviour is checked by the walk (tools/walk.mjs), not from here.
   Do not grow a fake document in this file. */
import { mkdtempSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOXES = ['library', 'chrome', 'exchange'];

let builtPage = null;

/* The build, once per process, and what it wrote. */
export function built() {
  if (builtPage) return builtPage;
  /* The build lands in a throwaway directory. A test run must not restamp the
     dist the phone is served, or the served page moves ahead of the package an
     update installs and the offer of one never ends. */
  const out = mkdtempSync(join(tmpdir(), 'custom-sheet-build-'));
  execFileSync(process.execPath, [resolve(root, 'build.mjs'), '--out', out], { cwd: root, stdio: 'pipe' });
  builtPage = {
    html: readFileSync(resolve(out, 'index.html'), 'utf8'),
    data: function (name) {
      return JSON.parse(readFileSync(resolve(out, 'data', name + '.json'), 'utf8'));
    }
  };
  return builtPage;
}

const sources = {};

/* The text of a file of src/, read once per process and given one line ending,
   the way the build makes every text it reads: a checkout with CRLF must not
   answer a check differently from one with LF. */
export function source(name) {
  if (sources[name] === undefined) sources[name] = readFileSync(resolve(root, 'src', name), 'utf8').replace(/\r\n/g, '\n');
  return sources[name];
}

/* The shape of the real core, read from the shell: its top level names, and
   the members of the three boxes. */
let shapeOf = null;

function shape() {
  if (shapeOf) return shapeOf;
  const text = source('shell.js');
  const literal = text.match(/var core = \{([\s\S]*?)\n  \};/);
  if (!literal) throw new Error('the core of the shell is not where the harness looks for it');
  const top = [...literal[1].matchAll(/^    ([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1])
    .concat([...text.matchAll(/\bcore\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)].map((m) => m[1]));
  const boxes = {};
  BOXES.forEach((box) => {
    const block = literal[1].match(new RegExp('    ' + box + ': \\{([\\s\\S]*?)\\n    \\}'));
    boxes[box] = block ? [...block[1].matchAll(/^      ([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]) : [];
  });
  shapeOf = { top: top, boxes: boxes };
  return shapeOf;
}

/* A page's core, from the real objects it needs, and only names the core
   carries: a stub that answers everything is how a page came to call a name
   the app never had. */
export function coreStub(parts) {
  const given = parts || {};
  const real = shape();
  const out = {};
  Object.keys(given).forEach((key) => {
    if (BOXES.indexOf(key) >= 0) {
      out[key] = {};
      Object.keys(given[key]).forEach((name) => {
        if (real.boxes[key].indexOf(name) < 0) throw new Error('the core carries no ' + key + '.' + name);
        out[key][name] = given[key][name];
      });
      return;
    }
    if (real.top.indexOf(key) < 0) throw new Error('the core carries no ' + key);
    out[key] = given[key];
  });
  return out;
}

/* The gesture of a list, when a page only wants to load: a page hands it a
   container at mount, and this harness never mounts. */
function noDrag() {
  return { list: function () { return { wasDragged: function () { return false; } }; } };
}

/* A page, run the way the app loads it: the modules first, then the page. The
   spec it registers is what comes back. */
export function page(id, opts) {
  const options = opts || {};
  if (!options.core) throw new Error('page(' + id + ') needs the core it will read');
  const taken = { spec: null };
  const ctx = vm.createContext({
    Sheet: {
      core: options.core,
      page: function (spec) { taken.spec = spec; }
    },
    SheetDrag: options.drag || noDrag,
    navigator: options.navigator || {},
    window: options.window || {}
  });
  vm.runInContext(source('pages/' + id + '.js'), ctx);
  return taken.spec;
}
