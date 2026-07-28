import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, hashFor, makeRouter } from '../src/router.js';
import { CASES } from '../src/koans/index.js';
import { PREFACE_SLUG, AFTERWORD_SLUG } from '../src/spine.js';

test('a bare hash is a case number', () => {
  assert.deepEqual(parseRoute('#29'), {
    view: 'case', id: 29, slug: 'not-the-wind-not-the-flag',
  });
  assert.deepEqual(parseRoute('#1'), {
    view: 'case', id: 1, slug: 'joshu-s-dog',
  });
});

test('both ends of the book resolve', () => {
  assert.equal(parseRoute('#1').id, 1);
  assert.equal(parseRoute('#49').id, 49);
});

test('nothing, or a lone #, is Contents', () => {
  for (const h of ['', '#', '  ', ' # ', null, undefined]) {
    assert.deepEqual(parseRoute(h), { view: 'contents' }, `for ${JSON.stringify(h)}`);
  }
});

test('leading zeros and stray whitespace are tolerated', () => {
  assert.equal(parseRoute('#029').id, 29);
  assert.equal(parseRoute('  #29  ').id, 29);
  assert.equal(parseRoute('29').id, 29);      // the # is optional
});

test('anything that is not a real case number is rejected', () => {
  for (const h of ['#0', '#50', '#99', '#2.5', '#-3', '#foo', '#joshu-s-dog', '#29a', '#1e2']) {
    assert.equal(parseRoute(h), null, `expected null for ${h}`);
  }
});

test('hashFor turns a slug back into its number', () => {
  assert.equal(hashFor('not-the-wind-not-the-flag'), '#29');
  assert.equal(hashFor('joshu-s-dog'), '#1');
  assert.equal(hashFor('no-such-case'), null);
});

test('every case round-trips', () => {
  for (const c of CASES) {
    const route = parseRoute(hashFor(c.slug));
    assert.deepEqual(route, { view: 'case', id: c.id, slug: c.slug }, `case ${c.id}`);
  }
});

// A stand-in for `window` with just the surface the router touches. `pushed`
// records every history entry the router creates, however it created it —
// assigning location.hash and calling pushState both land here, which is what
// lets us assert "this wrote no new entry".
function fakeWin(hash = '') {
  let h = hash;
  const listeners = {};
  return {
    pushed: [],
    location: {
      pathname: '/gate/', search: '',
      get hash() { return h; },
      set hash(v) {
        const next = v.startsWith('#') ? v : `#${v}`;
        if (next === h) return;              // browsers ignore a no-change write
        h = next;
        this.__win.pushed.push(next);
      },
    },
    history: {
      pushState(_state, _title, url) {
        const i = url.indexOf('#');
        h = i < 0 ? '' : url.slice(i);
        this.__win.pushed.push(url);
      },
      // Real replaceState rewrites the current entry in place — nothing lands
      // in the history stack, so it must not touch `pushed`.
      replaceState(_state, _title, url) {
        const i = url.indexOf('#');
        h = i < 0 ? '' : url.slice(i);
      },
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    fire(type) { for (const fn of [...(listeners[type] || [])]) fn(); },
  };
}

// wire the back-references the getters above need
function win(hash) {
  const w = fakeWin(hash);
  w.location.__win = w; w.history.__win = w;
  return w;
}

test('initial() reads the route out of the address bar', () => {
  assert.deepEqual(makeRouter({ win: win('#29') }).initial(), {
    view: 'case', id: 29, slug: 'not-the-wind-not-the-flag',
  });
  assert.deepEqual(makeRouter({ win: win('') }).initial(), { view: 'contents' });
  assert.equal(makeRouter({ win: win('#99') }).initial(), null);
});

test('set() writes a case hash and pushes one entry', () => {
  const w = win('');
  makeRouter({ win: w }).set({ view: 'case', slug: 'not-the-wind-not-the-flag' });
  assert.equal(w.location.hash, '#29');
  assert.deepEqual(w.pushed, ['#29']);
});

test('set() is a no-op when the URL already says that — this is what makes Back work', () => {
  const w = win('#29');
  const r = makeRouter({ win: w });
  r.set({ view: 'case', slug: 'not-the-wind-not-the-flag' });
  assert.deepEqual(w.pushed, [], 'must not push a second entry for the URL we are already on');
});

test('set(contents) clears to the bare URL, once', () => {
  const w = win('#29');
  const r = makeRouter({ win: w });
  r.set({ view: 'contents' });
  assert.equal(w.location.hash, '');
  assert.deepEqual(w.pushed, ['/gate/']);
  r.set({ view: 'contents' });
  assert.equal(w.pushed.length, 1, 'already at Contents: nothing more to push');
});

test('set(route, { replace: true }) corrects a junk hash without entering history', () => {
  const w = win('#99');
  const r = makeRouter({ win: w });
  r.set({ view: 'contents' }, { replace: true });
  assert.equal(w.location.hash, '', 'the bar lands on the right URL');
  assert.deepEqual(w.pushed, [], 'a correction must not push — Back must not return to the junk');
});

test('set() without { replace: true } still pushes exactly one entry', () => {
  const w = win('');
  makeRouter({ win: w }).set({ view: 'case', slug: 'not-the-wind-not-the-flag' });
  assert.deepEqual(w.pushed, ['#29'], 'default behaviour for existing callers is unchanged');
});

test('set(route, { replace: true }) is still a no-op when the URL already matches', () => {
  const w = win('#29');
  const r = makeRouter({ win: w });
  r.set({ view: 'case', slug: 'not-the-wind-not-the-flag' }, { replace: true });
  assert.deepEqual(w.pushed, [], 'nothing to correct: the comparison short-circuits before either write path');
  assert.equal(w.location.hash, '#29');
});

test('set(null) and set(undefined) do not throw and behave as a Contents write', () => {
  for (const bad of [null, undefined]) {
    const w = win('#29');
    const r = makeRouter({ win: w });
    assert.doesNotThrow(() => r.set(bad));
    assert.equal(w.location.hash, '', `for ${JSON.stringify(bad)}`);
    assert.deepEqual(w.pushed, ['/gate/'], `for ${JSON.stringify(bad)}`);
  }
});

test('a hashchange reports the new route', () => {
  const w = win('#29');
  const seen = [];
  makeRouter({ win: w, onRoute: (r) => seen.push(r) });
  w.location.hash = '#1';
  w.fire('hashchange');
  assert.deepEqual(seen, [{ view: 'case', id: 1, slug: 'joshu-s-dog' }]);
});

test('an unrecognised hash reports null rather than guessing', () => {
  const w = win('#29');
  const seen = [];
  makeRouter({ win: w, onRoute: (r) => seen.push(r) });
  w.location.hash = '#99';
  w.fire('hashchange');
  assert.deepEqual(seen, [null]);
});

test('dispose() stops listening', () => {
  const w = win('');
  const seen = [];
  const r = makeRouter({ win: w, onRoute: (x) => seen.push(x) });
  r.dispose();
  w.location.hash = '#1';
  w.fire('hashchange');
  assert.deepEqual(seen, []);
});

test('with no window at all the router is inert, not broken', () => {
  const r = makeRouter({ win: null, onRoute: () => { throw new Error('never'); } });
  assert.equal(r.initial(), null);
  r.set({ view: 'case', slug: 'joshu-s-dog' });   // must not throw
  r.dispose();
});

test('the front and back matter have names rather than numbers', () => {
  assert.deepEqual(parseRoute('#preface'), { view: 'case', id: null, slug: PREFACE_SLUG });
  assert.deepEqual(parseRoute('#afterword'), { view: 'case', id: null, slug: AFTERWORD_SLUG });
  assert.equal(hashFor(PREFACE_SLUG), '#preface');
  assert.equal(hashFor(AFTERWORD_SLUG), '#afterword');
});

test('named routes tolerate the same sloppiness numbers do', () => {
  assert.equal(parseRoute('  #Preface ').slug, PREFACE_SLUG);
  assert.equal(parseRoute('AFTERWORD').slug, AFTERWORD_SLUG);
});

test('adding names did not disturb the numbers', () => {
  assert.deepEqual(parseRoute('#29'), {
    view: 'case', id: 29, slug: 'not-the-wind-not-the-flag',
  });
  assert.equal(parseRoute('#1').id, 1);
  assert.equal(parseRoute('#49').id, 49);
  assert.deepEqual(parseRoute(''), { view: 'contents' });
  for (const junk of ['#0', '#50', '#foo', '#prefaces', '#after']) {
    assert.equal(parseRoute(junk), null, `expected null for ${junk}`);
  }
});

test('a named route round-trips through set() without pushing twice', () => {
  const w = win('');
  const r = makeRouter({ win: w });
  r.set({ view: 'case', slug: PREFACE_SLUG });
  assert.equal(w.location.hash, '#preface');
  assert.deepEqual(w.pushed, ['#preface']);
  r.set({ view: 'case', slug: PREFACE_SLUG });
  assert.equal(w.pushed.length, 1, 'already there: nothing more to push');
});
