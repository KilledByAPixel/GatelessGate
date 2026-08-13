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

// progress: 0 = the held frame covers the screen whole, 1 = fully torn away.
test('a captured frame is held whole until it is released', () => {
  const r = stubRenderer();
  const f = makeFreeze(r, null, 640, 480);
  assert.equal(f.active, false, 'nothing held before a capture');

  assert.equal(f.capture({ tag: 'outgoing' }, {}), true);
  assert.equal(f.active, true);
  assert.equal(f.progress, 0, 'held whole — the swap happens invisibly behind it');

  // time passing on its own must NOT start the dissolve; only release() does
  f.update(1.0);
  assert.equal(f.progress, 0);
  assert.equal(f.active, true);
});

test('release dissolves the held frame away and resolves once', async () => {
  const r = stubRenderer();
  const f = makeFreeze(r, null, 640, 480);
  f.capture({ tag: 'outgoing' }, {});

  let done = false;
  const p = f.release(0.5).then(() => { done = true; });

  f.update(0.25);
  assert.ok(f.progress > 0.2 && f.progress < 0.8, `mid-dissolve: ${f.progress}`);
  assert.equal(f.active, true, 'still drawn while dissolving');
  assert.equal(done, false);

  f.update(0.25);
  await p;
  assert.equal(done, true);
  assert.equal(f.active, false, 'released frames stop drawing');

  f.update(1.0);   // further ticks must not resurrect it or throw
  assert.equal(f.active, false);
});

test('capturing during a running dissolve settles the old one first', async () => {
  // Enter a case, then enter another before the first transition has finished.
  // Without this, the in-flight tween keeps driving the NEW held frame and drops
  // it the instant it completes — the second transition would flash.
  const f = makeFreeze(stubRenderer(), null, 640, 480);
  f.capture({ tag: 'first' }, {});
  let firstSettled = false;
  const p = f.release(1.0).then(() => { firstSettled = true; });
  f.update(0.3);
  assert.ok(f.progress > 0, 'first dissolve under way');

  f.capture({ tag: 'second' }, {});
  await p;
  assert.equal(firstSettled, true, 'the superseded dissolve resolves rather than hanging');
  assert.equal(f.progress, 0, 'the new frame is held whole, not part-dissolved');
  assert.equal(f.active, true);

  // and the stale tween must not still be running
  f.update(0.8);
  assert.equal(f.progress, 0, 'no leftover tween driving the new frame');
  assert.equal(f.active, true);
});

test('an interrupting capture bakes the composite: fresh scene, then the old still over it', () => {
  // A plain capture renders the outgoing scene once. A capture taken WHILE a
  // tear is running has to preserve what is on screen — the old still torn
  // partway into the scene behind it — so it renders the new scene AND then
  // composites the old still (the dissolve quad) over it, rather than snapping
  // to a clean frame. That is the difference between paging that flows and
  // paging that jumps. Two renders on the interrupt, one on the plain.
  const r = stubRenderer();
  const f = makeFreeze(r, null, 640, 480);

  // a plain capture from a released (unheld) state renders the scene once
  f.capture({ tag: 'a' }, {});
  const done = f.release(0.5);
  f.update(0.6);                          // tear completes → nothing held
  assert.equal(f.active, false);
  r.calls.length = 0;
  f.capture({ tag: 'b' }, {});
  let renders = r.calls.filter((c) => c[0] === 'render').length;
  assert.equal(renders, 1, 'a capture from the unheld state renders the scene once');

  // an interrupt — held, mid-tear — renders the new scene AND the old still
  f.release(1.0);
  f.update(0.4);
  r.calls.length = 0;
  f.capture({ tag: 'c' }, {});
  renders = r.calls.filter((c) => c[0] === 'render').length;
  assert.equal(renders, 2, 'the interrupt renders the new scene, then the held still over it');
  assert.equal(r.autoClear, true, 'autoClear restored after the composite pass');
  return done;
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
