import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFreeze } from '../src/render/freeze.js';

// A stand-in renderer. makeFreeze only needs setRenderTarget/clear/render and an
// autoClear flag, so the fade logic can be exercised without a GL context.
function stubRenderer() {
  const calls = [];
  return {
    calls,
    autoClear: true,
    setRenderTarget(t) { calls.push(['target', t]); },
    clear() { calls.push(['clear']); },
    render(scene) { calls.push(['render', scene && scene.tag]); },
  };
}

test('a captured frame is held at full opacity until it is released', () => {
  const r = stubRenderer();
  const f = makeFreeze(r, null, 640, 480);
  assert.equal(f.active, false, 'nothing held before a capture');

  assert.equal(f.capture({ tag: 'outgoing' }, {}), true);
  assert.equal(f.active, true);
  assert.equal(f.opacity, 1, 'held opaque — the swap happens invisibly behind it');

  // time passing on its own must NOT start the fade; only release() does
  f.update(1.0);
  assert.equal(f.opacity, 1);
  assert.equal(f.active, true);
});

test('release fades to nothing and resolves once', async () => {
  const r = stubRenderer();
  const f = makeFreeze(r, null, 640, 480);
  f.capture({ tag: 'outgoing' }, {});

  let done = false;
  const p = f.release(0.5).then(() => { done = true; });

  f.update(0.25);
  assert.ok(f.opacity > 0.2 && f.opacity < 0.8, `mid-fade: ${f.opacity}`);
  assert.equal(f.active, true, 'still drawn while fading');
  assert.equal(done, false);

  f.update(0.25);
  await p;
  assert.equal(done, true);
  assert.equal(f.active, false, 'released frames stop drawing');

  f.update(1.0);   // further ticks must not resurrect it or throw
  assert.equal(f.active, false);
});

test('capture with no scene is a no-op, so the caller can fall back to the curtain', () => {
  const f = makeFreeze(stubRenderer(), null, 640, 480);
  assert.equal(f.capture(null, {}), false);
  assert.equal(f.active, false);
});

test('draw is a no-op when nothing is held, and composites without clearing when it is', () => {
  const r = stubRenderer();
  const f = makeFreeze(r, null, 640, 480);
  f.draw();
  assert.equal(r.calls.length, 0, 'no draw calls with nothing held');

  f.capture({ tag: 'outgoing' }, {});
  r.calls.length = 0;
  f.draw();
  assert.ok(r.calls.some((c) => c[0] === 'render'), 'held frame is drawn');
  assert.equal(r.autoClear, true, 'autoClear is restored after compositing');
});

test('clear drops the frame at once and settles a pending release', async () => {
  const f = makeFreeze(stubRenderer(), null, 640, 480);
  f.capture({ tag: 'outgoing' }, {});
  // a release that never gets to finish — a resize mid-transition does this, and
  // if it did not settle, enter() would await it forever and navigation would
  // wedge with the old frame stuck on screen
  const p = f.release(10);
  f.clear();
  await p;
  assert.equal(f.active, false);
});
