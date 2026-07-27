import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, hashFor } from '../src/router.js';
import { CASES } from '../src/koans/index.js';

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
