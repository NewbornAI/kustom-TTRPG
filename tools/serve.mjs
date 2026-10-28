/**
 * The machine that serves the app.
 *
 *   node tools/serve.mjs [port]
 *
 * It answers two routes. The build route serves the page, the data beside it
 * and the package of the update, the way the update route expects. The
 * bestiary route serves every creature the cache holds, so a player who
 * needs a creature the app does not carry can fetch it from here. The agent
 * route hands a conversation to the model and its answer back, so the key
 * of the model stays on this machine and never reaches the phone:
 *
 *   SENSENOVA_API_KEY=... node tools/serve.mjs
 *
 * SENSENOVA_BASE_URL and SENSENOVA_MODEL move the endpoint and the model.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBestiary, creatureRecord } from './bestiary.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const cache = resolve(root, 'tools', '.5e-cache');
const port = Number(process.argv[2] || process.env.PORT || 8123);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.apk': 'application/vnd.android.package-archive'
};

/* Every monster of the cache, by its name, and the list of them the app
   asks for. The cache is read per request, so a fetch that runs while the
   server is up is served without a restart, and a cache that is not there
   answers with the sentence that says how to make one. */
function bestiaryNow() {
  const bestiary = loadBestiary(cache);
  const creatures = [];
  Object.keys(bestiary).forEach((key) => {
    const item = bestiary[key][0];
    if (!item) return;
    creatures.push({ key: key, name: item.name, source: item.source, cr: item.cr });
  });
  creatures.sort((a, b) => a.name.localeCompare(b.name));
  return { bestiary: bestiary, creatures: creatures };
}

const NO_CACHE = 'the cache is empty: run node tools/fetch-5e-data.mjs first, then ask again';

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  res.end(body);
}

const AGENT_BASE = process.env.SENSENOVA_BASE_URL || 'https://token.sensenova.ai/v1';
const AGENT_MODEL = process.env.SENSENOVA_MODEL || 'sensenova-6.8-flash-lite';
/* The pictures of the fairy. The size is the phone's, not the model's: 768
   square holds a character at 720 px with room to spare, and a picture that
   fits a package is worth more than one nobody can carry. */
const IMAGE_MODEL = process.env.SENSENOVA_IMAGE_MODEL || 'sensenova-u1.5-lite';
const IMAGE_SIZE = process.env.SENSENOVA_IMAGE_SIZE || '768x768';

function bodyOf(req) {
  return new Promise((done, fail) => {
    let text = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { text += c; if (text.length > 4e6) { fail(new Error('too large')); req.destroy(); } });
    req.on('end', () => done(text));
    req.on('error', fail);
  });
}

/* One turn of the agent: the messages and the tools the page sends, the
   model's answer back as it came. The page runs the tools; this machine only
   holds the key. */
async function agentTurn(req, res) {
  const key = process.env.SENSENOVA_API_KEY;
  if (req.method === 'GET') return send(res, 200, JSON.stringify({ ready: !!key, model: AGENT_MODEL }), TYPES['.json']);
  if (req.method !== 'POST') return send(res, 405, 'POST a conversation');
  if (!key) return send(res, 503, 'the agent has no key: start the server with SENSENOVA_API_KEY set');
  let asked;
  try {
    asked = JSON.parse(await bodyOf(req));
  } catch (e) {
    return send(res, 400, 'the body is not JSON');
  }
  try {
    const r = await fetch(AGENT_BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: AGENT_MODEL, messages: asked.messages || [], tools: asked.tools || undefined, temperature: 0.2 })
    });
    const text = await r.text();
    return send(res, r.ok ? 200 : 502, r.ok ? text : 'the model answered ' + r.status + ': ' + text.slice(0, 300), TYPES['.json']);
  } catch (e) {
    return send(res, 502, 'the model did not answer: ' + String(e.message || e));
  }
}

/* One picture, drawn by SenseNova's image model and kept here, as a data URL
   the page can carry. The key stays on this machine like the agent's, and the
   address the model answers with is read at once because it expires and the
   phone may be off the network when it does. */
async function paintTurn(req, res) {
  const key = process.env.SENSENOVA_API_KEY;
  if (req.method === 'GET') return send(res, 200, JSON.stringify({ ready: !!key, model: IMAGE_MODEL, size: IMAGE_SIZE }), TYPES['.json']);
  if (req.method !== 'POST') return send(res, 405, 'POST a prompt');
  if (!key) return send(res, 503, 'the pictures have no key: start the server with SENSENOVA_API_KEY set');
  let asked;
  try {
    asked = JSON.parse(await bodyOf(req));
  } catch (e) {
    return send(res, 400, 'the body is not JSON');
  }
  const prompt = String(asked.prompt || '').trim().slice(0, 6000);
  if (!prompt) return send(res, 400, 'a picture needs a prompt');
  /* A picture that is already there comes back with the request, and the
     model changes it rather than drawing a new one: the face of a character
     survives a repaint because the pixels are handed back to the model. */
  const image = typeof asked.image === 'string' && asked.image.indexOf('data:image/') === 0 ? asked.image : '';
  try {
    const r = await fetch(AGENT_BASE + (image ? '/images/edits' : '/images/generations'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(image
        ? { model: IMAGE_MODEL, prompt, images: [{ image_url: image }], size: asked.size || IMAGE_SIZE, watermark: false, response_format: 'url' }
        : { model: IMAGE_MODEL, prompt, size: asked.size || IMAGE_SIZE, watermark: false, response_format: 'url' })
    });
    const text = await r.text();
    if (!r.ok) return send(res, 502, 'the picture model answered ' + r.status + ': ' + text.slice(0, 300));
    let json;
    try { json = JSON.parse(text); } catch (e) { return send(res, 502, 'the picture model answered no JSON'); }
    const url = ((json.data && json.data[0]) || {}).url;
    if (!url) return send(res, 502, 'the picture model named no image');
    const img = await fetch(url);
    if (!img.ok) return send(res, 502, 'the picture could not be read back: ' + img.status);
    const bytes = Buffer.from(await img.arrayBuffer());
    if (!bytes.length) return send(res, 502, 'the picture came back empty');
    const mime = String(img.headers.get('content-type') || 'image/png').split(';')[0];
    return send(res, 200, JSON.stringify({
      data: 'data:' + mime + ';base64,' + bytes.toString('base64'),
      size: json.size || IMAGE_SIZE, model: IMAGE_MODEL, bytes: bytes.length
    }), TYPES['.json']);
  } catch (e) {
    return send(res, 502, 'the picture did not come: ' + String(e.message || e));
  }
}

const server = createServer(async (req, res) => {
  let path = '/';
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return send(res, 400, 'bad address');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  if (path === '/agent') return agentTurn(req, res);
  if (path === '/paint') return paintTurn(req, res);

  if (path === '/bestiary/index.json' || (path.indexOf('/bestiary/') === 0 && path.slice(-5) === '.json')) {
    const shelf = bestiaryNow();
    if (!shelf.creatures.length) return send(res, 503, NO_CACHE);
    if (path === '/bestiary/index.json') {
      return send(res, 200, JSON.stringify({ creatures: shelf.creatures }), TYPES['.json']);
    }
    const key = path.slice('/bestiary/'.length, -5).toLowerCase();
    const list = shelf.bestiary[key];
    if (!list || !list.length) return send(res, 404, 'no such creature');
    return send(res, 200, JSON.stringify(creatureRecord(list[0])), TYPES['.json']);
  }

  /* The build, the data beside it and the package of the update. */
  const wanted = path === '/' ? '/index.html' : path;
  const full = resolve(dist, '.' + normalize(wanted));
  if (full.indexOf(dist) !== 0) return send(res, 403, 'no');
  try {
    const body = await readFile(full);
    return send(res, 200, body, TYPES[extname(full).toLowerCase()] || 'application/octet-stream');
  } catch (e) {
    return send(res, 404, 'not found');
  }
});

server.listen(port, () => {
  const shelf = bestiaryNow();
  console.log('serving ' + dist + ' and ' + (shelf.creatures.length
    ? shelf.creatures.length + ' creatures'
    : 'no creature cache: run node tools/fetch-5e-data.mjs') + ' on port ' + port);
});
