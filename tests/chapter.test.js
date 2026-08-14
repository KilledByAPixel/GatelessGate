import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES } from '../src/koans/index.js';
import { isStaged, loadKoan } from '../src/koans/registry.js';

// This file was once a second staging net — seventeen hardcoded cases each
// re-checked against a subset of what tests/staging.test.js already holds
// every staged case to (contract shape, build, 120 frames, finite fragment,
// tap wiring). All of that lives in the net now, over the whole book instead
// of a list that had to be maintained by hand. What stays is the one check
// the net does not make: the net proves a declared mood is 'in' or 'yo';
// this proves the SCALE BEHIND IT exists, because an unknown mood does not
// error — the music silently falls back to the default tuning.
test('a declared mood is always a real scale', async () => {
  const { SCALES } = await import('../src/audio/tuning.js');
  for (const c of CASES) {
    if (!isStaged(c.slug)) continue;
    const mod = await loadKoan(c.slug);
    if (mod.mood !== undefined) {
      assert.ok(SCALES[mod.mood], `${c.slug}: unknown mood "${mod.mood}" would silently fall back`);
    }
  }
  // the first editorial pick: washing the bowl is bright, domestic work
  const k7 = await loadKoan('joshu-washes-the-bowl');
  assert.equal(k7.mood, 'yo');
});
