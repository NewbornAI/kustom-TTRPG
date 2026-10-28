/**
 * The art of the app icon, drawn once for the three places that need it.
 *
 *   node tools/make-icon-art.mjs && node tools/make-icons.mjs
 *
 * A crossed sword and a wrench, white on red. The paths live in the 108 box
 * of an Android adaptive foreground, where the system keeps the middle 66
 * units, so the whole drawing fits a circle of radius 32 around the centre.
 *
 * Three files come out of it:
 *
 *   tools/icon.svg                              the plain tile of the icon
 *   app/res/drawable/ic_launcher_foreground.xml the adaptive foreground
 *   src/index.html                              the favicon of the page
 *
 * The icon of the app is the tile, and the adaptive foreground is the same
 * drawing with the red of the ground painted in the gap where the sword
 * crosses the wrench. That red is @color/ic_launcher_background, and the
 * gradient of the tile carries the same tone in the middle.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const K = 0.7071067811865476;
const C = [54, 54];
const U = [K, -K];    /* the sword points up right */
const V = [K, K];     /* square across the sword */
const X = [-K, -K];   /* the wrench points up left */
const Y = [K, -K];    /* square across the wrench */

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const at = (d, s) => add(C, mul(d, s));
const side = (d, s, n, o) => add(add(C, mul(d, s)), mul(n, o));
const r2 = (p) => Math.round(p * 100) / 100;
const poly = (pts) => 'M' + pts.map((p) => r2(p[0]) + ',' + r2(p[1])).join(' L') + ' Z';
const disc = (c, r) => 'M' + r2(c[0] - r) + ',' + r2(c[1]) +
  ' a' + r + ',' + r + ' 0 1 0 ' + r * 2 + ',0 a' + r + ',' + r + ' 0 1 0 ' + -r * 2 + ',0 Z';
const box = (d, n, s0, s1, half) => poly([
  side(d, s0, n, half), side(d, s1, n, half), side(d, s1, n, -half), side(d, s0, n, -half)
]);

/* the sword: a blade, a bar square across it, a grip, a round pommel */
const blade = poly([at(U, 32), side(U, -8, V, 5.0), side(U, -8, V, -5.0)]);
const bar = box(U, V, -10.6, -5.4, 9.0);
const grip = box(U, V, -23, -6.5, 2.8);
const pommel = disc(at(U, -27), 4);
const sword = [blade, bar, grip, pommel].join(' ');

/* the wrench: a shaft, a round head, a cap on the tail, and the open jaw */
const shaft = box(X, Y, -29, 21, 5.0);
const head = disc(at(X, 21), 10.5);
const cap = disc(at(X, -27), 5.0);
const jaw = box(X, Y, 19, 36, 3.6) + ' ' + disc(at(X, 19), 3.6);
const wrench = [shaft, head, cap].join(' ');

const RED = '#a8172c';          /* the tone of the ground, the gap included */
const DARK = '#4a0a14';
const T = 192 / 108;            /* the tile draws the same art, larger */

const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="100%" height="100%">',
  '  <defs>',
  '    <radialGradient id="bg" gradientUnits="userSpaceOnUse" cx="54" cy="34" r="84">',
  '      <stop offset="0" stop-color="#e04a5e"/>',
  '      <stop offset="0.55" stop-color="' + RED + '"/>',
  '      <stop offset="1" stop-color="' + DARK + '"/>',
  '    </radialGradient>',
  '  </defs>',
  '  <g transform="scale(' + T + ')">',
  '    <rect width="108" height="108" rx="24.75" fill="url(#bg)"/>',
  '  </g>',
  '  <g transform="scale(' + T + ') translate(54 54) scale(1.2) translate(-54 -54)">',
  '    <path d="' + wrench + '" fill="#ffffff"/>',
  '    <path d="' + sword + '" fill="url(#bg)" stroke="url(#bg)" stroke-width="5" stroke-linejoin="round"/>',
  '    <path d="' + sword + '" fill="#ffffff"/>',
  '    <path d="' + jaw + '" fill="url(#bg)"/>',
  '  </g>',
  '</svg>',
  ''
].join('\n');

const bg = '@color/ic_launcher_background';
const vec = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
  '    android:width="108dp" android:height="108dp"',
  '    android:viewportWidth="108" android:viewportHeight="108">',
  '    <path android:pathData="' + wrench + '" android:fillColor="#FFFFFF"/>',
  '    <path android:pathData="' + sword + '" android:fillColor="' + bg + '" android:strokeColor="' + bg + '" android:strokeWidth="5" android:strokeLineJoin="round"/>',
  '    <path android:pathData="' + sword + '" android:fillColor="#FFFFFF"/>',
  '    <path android:pathData="' + jaw + '" android:fillColor="' + bg + '"/>',
  '</vector>',
  ''
].join('\n');

/* the favicon: the same art flat, in a box of 32 */
const enc = (s) => s.split('<').join('%3C').split('>').join('%3E').split('#').join('%23');
const fav = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>" +
  "<rect width='32' height='32' rx='7' fill='" + RED + "'/>" +
  "<g transform='scale(" + (32 / 108) + ") translate(54 54) scale(1.2) translate(-54 -54)'>" +
  "<path d='" + wrench + "' fill='#ffffff'/>" +
  "<path d='" + sword + "' fill='" + RED + "' stroke='" + RED + "' stroke-width='5' stroke-linejoin='round'/>" +
  "<path d='" + sword + "' fill='#ffffff'/>" +
  "<path d='" + jaw + "' fill='" + RED + "'/>" +
  '</g></svg>';

writeFileSync(resolve(root, 'tools', 'icon.svg'), svg);
writeFileSync(resolve(root, 'app', 'res', 'drawable', 'ic_launcher_foreground.xml'), vec);

/* the page carries the favicon inline, so it is the one file that is patched */
const page = resolve(root, 'src', 'index.html');
const html = readFileSync(page, 'utf8');
const next = html.replace(/(<link rel="icon" href=")[^"]*(")/, '$1' + 'data:image/svg+xml,' + enc(fav) + '$2');
if (next === html && html.indexOf(enc(fav)) < 0) throw new Error('the favicon of src/index.html was not found');
writeFileSync(page, next);

console.log('tools/icon.svg, app/res/drawable/ic_launcher_foreground.xml and the favicon are written');
console.log('now run: node tools/make-icons.mjs');
