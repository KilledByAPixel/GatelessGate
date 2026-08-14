import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const debugSrc = readFileSync(join(ROOT, 'src/ui/debug.js'), 'utf8');
const mainSrc = readFileSync(join(ROOT, 'src/main.js'), 'utf8');

// DEVELOPER MODE IS INVISIBLE WHEN OFF, and Pause is the only door.
//
// Both halves fail SILENTLY in opposite directions, which is why they are
// pinned in source the way main-input.test.js pins its own wiring: a gear that
// creeps back into a reader's toolbar looks like a feature rather than a bug,
// and a second place that writes the flag leaves the button, the panel and the
// stored state disagreeing with no error anywhere. Neither has a seam a Node
// test can reach — this is browser glue with a localStorage flag.

test('the gear is hidden unless developer mode is on', () => {
  // Set at construction rather than in mount(), so it is never in the DOM
  // visible for a frame first.
  assert.match(debugSrc, /button\.style\.display = devModeOn\(\) \? '' : 'none';/,
    'the toolbar gear must start hidden for a reader');
});

test('one function owns the developer-mode flag', () => {
  // The stored flag, the checkbox, the Compose panel, the gear and main's own
  // reaction move together or they drift — the same reasoning as setPanel.
  const writes = debugSrc.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /localStorage\.setItem\(DEV_KEY/.test(line));
  assert.equal(writes.length, 1,
    `DEV_KEY is written in ${writes.length} places (lines ${writes.map(([n]) => n).join(', ')})`);

  const fn = debugSrc.match(/function setDevMode\(on\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(fn, 'setDevMode is the one way in and out');
  for (const [what, re] of [
    ['stores the flag', /localStorage\.setItem\(DEV_KEY/],
    ['moves the checkbox', /devInput\.checked = next/],
    ['shows or hides the gear', /button\.style\.display/],
    ['opens or closes the panel', /setPanel\(next\)/],
    ['tells main', /onDevMode && onDevMode\(next\)/],
  ]) {
    assert.match(fn[0], re, `setDevMode no longer ${what}`);
  }
});

test('Pause is bound to it, and not while someone is typing', () => {
  const branch = mainSrc.match(/if \(!typing && e\.key === 'Pause'\) \{[\s\S]*?\n  \}/);
  assert.ok(branch, 'Pause must toggle developer mode — it is the only way in');
  assert.match(branch[0], /debug\.devMode\(\)/, 'and it must go through the one function');

  // The Contents has a search box, and the guard is kept even though Pause is
  // not a caret key: what is being pinned is that the branch sits AFTER the
  // guard exists, so the next key bound here inherits it rather than having to
  // rediscover why it matters.
  const typingLine = mainSrc.indexOf('const typing = t &&');
  assert.ok(typingLine > 0 && mainSrc.indexOf("e.key === 'Pause'") > typingLine,
    'the Pause branch must come after `typing` is worked out');
});

test('the panel is only restored on reload when developer mode is on', () => {
  assert.match(debugSrc, /if \(devModeOn\(\) && loadPanelOpen\(\)\) setPanel\(true\);/,
    'a reader who once opened the workbench must get the book back next visit');
});
