/* The address of a file on GitHub, read as well as the raw one. */
import { source } from './harness.mjs';

let passed = 0;
function check(what, got, want) {
  if (got !== want) {
    console.log('  no   ' + what + ': got ' + got + ', wanted ' + want);
    process.exitCode = 1;
    return;
  }
  console.log('  ok   ' + what);
  passed += 1;
}

const code = source('shell.js');
const start = code.indexOf('function rawAddress(url) {');
const end = code.indexOf('\n  }', start) + 4;
if (start < 0) throw new Error('rawAddress not found');
const body = code.slice(start, end);
const rawAddress = new Function('return (' + body.replace('function rawAddress', 'function') + ');')();

console.log('the address of a file on GitHub');
check('the address a browser shows becomes the raw one',
  rawAddress('https://github.com/NewbornAI/custom-sheet/blob/main/characters/a.json'),
  'https://raw.githubusercontent.com/NewbornAI/custom-sheet/main/characters/a.json');
check('the raw address on github becomes the raw one',
  rawAddress('https://github.com/NewbornAI/custom-sheet/raw/main/characters/a.json'),
  'https://raw.githubusercontent.com/NewbornAI/custom-sheet/main/characters/a.json');
check('a branch is kept',
  rawAddress('https://github.com/o/r/blob/agent-test/characters/a.json'),
  'https://raw.githubusercontent.com/o/r/agent-test/characters/a.json');
check('another address is left alone',
  rawAddress('https://example.com/a.json'),
  'https://example.com/a.json');
check('a link with a fragment is left alone',
  rawAddress('https://github.com/NewbornAI/custom-sheet#p=1abc'),
  'https://github.com/NewbornAI/custom-sheet#p=1abc');

console.log('');
if (process.exitCode) {
  console.log('a check failed');
} else {
  console.log('all address checks pass');
}
