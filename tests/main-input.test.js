import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(join(ROOT, 'src/main.js'), 'utf8');

// main.js is browser glue with no seam a Node test can reach, and this is the
// one invariant in it that fails INVISIBLY: everything keeps working, one
// feature just stops responding, with no error anywhere.
//
// input.clear() empties the whole tap-callback list. That is right for the page
// being left and wrong for main.js's own handlers, which are registered once at
// startup — so the first page turn dropped them for the rest of the session and
// the kit's hung chimes became unclickable with nothing to read. clearInput() is the
// one way to do it, and it puts main's handlers back.
test('main.js never wipes its own tap handlers', () => {
  const wrapper = main.match(/function clearInput\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(wrapper, 'clearInput() is the one place allowed to clear the taps');
  assert.match(wrapper[0], /input\.clear\(\)/, 'and it does clear them');
  assert.match(wrapper[0], /input\.onTap\(/, 'and immediately puts main’s own back');

  // every OTHER mention has to go through it
  const direct = main.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /(?<!\/\/.*)\binput\.clear\(\)/.test(line));
  const outside = direct.filter(([n]) => {
    const at = main.split('\n').slice(0, n).join('\n').length;
    return at < main.indexOf('function clearInput()') || at > main.indexOf('function clearInput()') + wrapper[0].length;
  });
  assert.deepEqual(outside.map(([n]) => n), [],
    `call clearInput() instead of input.clear() at line(s) ${outside.map(([n]) => n).join(', ')}`);
});

test('the tap handler main.js keeps is the one that rings a hung chime', () => {
  // Pins the wiring the bug above severed, so a rename on either side is caught
  // rather than quietly leaving the handler registered and inert.
  assert.match(main, /import \{[^}]*ringChimeAt[^}]*\} from '\.\/kit\/chimes\.js'/);
  assert.match(main, /const chimeTap = \(\) =>[\s\S]{0,120}ringChimeAt\(/);
});

test('the Contents gate recursion handler survives page turns the same way', () => {
  // hubGateTap is registered once and put back by clearInput() beside
  // chimeTap — the identical invisible-failure class: drop it and the menu's
  // gate simply stops answering, with nothing to read anywhere.
  assert.match(main, /const hubGateTap = /);
  const wrapper = main.match(/function clearInput\(\)\s*\{[\s\S]*?\n\}/);
  assert.match(wrapper[0], /input\.onTap\(hubGateTap\)/, 'clearInput() must put it back');
  assert.match(main, /hub\.tapGate\(camera, input\)/, 'and it drives the hub\'s own probe');
});
