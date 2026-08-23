import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(join(ROOT, 'src/main.js'), 'utf8');

// THE STAGE IS OBSERVED, NOT JUST THE WINDOW. Browser glue with no seam a Node
// test can reach, pinned in source the way main-input.test.js pins its wiring,
// because the failure is invisible: on mobile Chrome the rotation `resize`
// arrives before the viewport has settled — the toolbar re-lays out afterwards
// and the dvh shell changes height again with no second event — so a canvas
// sized only from that handler kept the old size, or came up short by the
// toolbar and left a strip of paper under the diorama. Safari fires after it
// settles and never showed it. A ResizeObserver on the stage fires after layout
// whenever the stage's box actually changes, whatever moved it.
test('the stage itself is observed for size changes', () => {
  const observer = main.match(/new ResizeObserver\(([\s\S]*?)\)\.observe\(stage\)/);
  assert.ok(observer, 'a ResizeObserver must watch #gg-stage');
  assert.match(observer[1], /applyStageSize/, 'and it must go through the one sizer');
});

// The observer runs AFTER the frame's render, so a same-size re-apply there
// would wipe the drawing buffer (assigning canvas.width clears it, new value or
// not) and paint a frame of bare paper after every desktop resize. Unchanged is
// a no-op, and a late change draws the frame again before it is painted.
test('applyStageSize is idempotent and repaints after a late change', () => {
  const fn = main.match(/function applyStageSize\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fn, 'applyStageSize is the one sizer');
  assert.match(fn[0], /renderer\.getSize\(/, 'it must compare against the size the renderer already has');
  assert.match(fn[0], /scenes\.render\(camera\)/, 'and draw the frame again after resizing');
});
