import test from 'node:test';
import assert from 'node:assert/strict';
import { makeNavQueue } from '../src/nav_queue.js';

// A controllable async harness: load and show each resolve when we say, so a
// test can hold a hop "in flight" and fire more clicks into the gap.
function harness({ known = null } = {}) {
  let shown = null;
  const shownOrder = [];
  const loadGates = [];
  const showGates = [];

  const q = makeNavQueue({
    load: (slug) => {
      if (known && !known.includes(slug)) return Promise.resolve(null);
      return new Promise((res) => loadGates.push(() => res({ slug })));
    },
    show: (mod) => new Promise((res) => showGates.push(() => {
      shown = mod.slug; shownOrder.push(mod.slug); res();
    })),
    current: () => shown,
  });

  const flushMicro = () => new Promise((r) => setTimeout(r, 0));
  return {
    q, shownOrder,
    current: () => shown,
    async settleLoad() { while (loadGates.length) loadGates.shift()(); await flushMicro(); },
    async settleShow() { while (showGates.length) showGates.shift()(); await flushMicro(); },
    pendingLoads: () => loadGates.length,
    pendingShows: () => showGates.length,
  };
}

test('a single request loads, shows, and settles', async () => {
  const h = harness();
  h.q.go('a');
  await h.settleLoad();
  await h.settleShow();
  assert.equal(h.current(), 'a');
  assert.equal(h.q.running, false);
  assert.deepEqual(h.shownOrder, ['a']);
});

test('clicking a new target mid-load overtakes the one still loading', async () => {
  const h = harness();
  h.q.go('a');                     // starts loading a
  assert.equal(h.q.running, true);
  h.q.go('b');                     // before a resolves, ask for b instead
  await h.settleLoad();            // a resolves — but target is b, so a is dropped
  await h.settleLoad();            // b's load resolves
  await h.settleShow();
  assert.equal(h.current(), 'b');
  assert.deepEqual(h.shownOrder, ['b'], 'a was never shown');
});

test('a request during the reveal is honoured after it, not dropped', async () => {
  const h = harness();
  h.q.go('a');
  await h.settleLoad();
  // a's reveal is now in flight (show pending). Fire the next page.
  assert.equal(h.pendingShows(), 1);
  h.q.go('b');
  await h.settleShow();            // a finishes revealing
  await h.settleLoad();            // loop picks up b
  await h.settleShow();
  assert.equal(h.current(), 'b');
  assert.deepEqual(h.shownOrder, ['a', 'b']);
});

test('paging one at a time with gaps shows every case in order', async () => {
  const h = harness();
  for (const slug of ['a', 'b', 'c']) {
    h.q.go(slug);
    await h.settleLoad();
    await h.settleShow();
  }
  assert.deepEqual(h.shownOrder, ['a', 'b', 'c']);
});

test('a fast burst skips the ones it overtakes and lands on the last', async () => {
  const h = harness();
  h.q.go('a');
  h.q.go('b');
  h.q.go('c');                     // three clicks before anything resolves
  // drain until quiescent
  for (let i = 0; i < 8 && (h.q.running || h.pendingLoads() || h.pendingShows()); i++) {
    await h.settleLoad();
    await h.settleShow();
  }
  assert.equal(h.current(), 'c');
  assert.ok(!h.shownOrder.includes('b'), 'the overtaken middle case was skipped');
  assert.equal(h.shownOrder.at(-1), 'c');
});

test('asking for the case already shown does nothing', async () => {
  const h = harness();
  h.q.go('a');
  await h.settleLoad();
  await h.settleShow();
  h.shownOrder.length = 0;
  await h.q.go('a');               // already there
  assert.equal(h.pendingLoads(), 0);
  assert.deepEqual(h.shownOrder, []);
});

test('cancel abandons a pending destination', async () => {
  const h = harness();
  h.q.go('a');
  await h.settleLoad();
  await h.settleShow();            // showing a
  h.q.go('b');                     // want b next
  h.q.cancel();                    // ...but cancel before it loads
  await h.settleLoad();
  assert.equal(h.current(), 'a', 'stayed on a');
  assert.equal(h.q.target, null);
});

test('an unknown slug stops the loop instead of spinning', async () => {
  const h = harness({ known: ['a'] });
  h.q.go('nope');
  await h.settleLoad();
  assert.equal(h.current(), null);
  assert.equal(h.q.running, false);
  assert.equal(h.q.target, null);
});
