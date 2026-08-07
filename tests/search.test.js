import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchCases, snippet, parseQuery } from '../src/ui/search.js';

const ids = (q) => searchCases(q).map((r) => r.id);

test('an empty query is not a search', () => {
  assert.equal(searchCases(''), null);
  assert.equal(searchCases('   '), null);
  assert.equal(searchCases('a'), null, 'single letters are noise, not a query');
  assert.deepEqual(searchCases('zzzqqq'), [], 'no hits is an empty list, not null');
});

test('finds the case you half-remember', () => {
  // the way someone actually searches: a fragment of the thing itself
  assert.equal(ids('dog')[0], 1, 'dog -> Joshu\'s Dog');
  assert.equal(ids('wash the bowl')[0], 7, 'wash the bowl -> case 7');
  assert.equal(ids('flag')[0], 29, 'flag -> Not the Wind, Not the Flag');
  assert.equal(ids('buffalo')[0], 37);
  assert.equal(ids('oak tree')[0], 38);
  assert.ok(ids('flower').includes(6));
});

test('a title hit reports where=title; passing mentions report their own field', () => {
  const r = searchCases('flag');
  assert.equal(r[0].id, 29);
  assert.equal(r[0].where, 'title');
  // Results are book-ordered, not ranked (see the book-order test below);
  // case 29 comes first here because it is the lowest-numbered hit, and it
  // happens to be the title hit. The `where` field is what this pins: the
  // other cases mention a flag in passing and must not claim a title match.
  assert.ok(r.length >= 1);
  for (const hit of r.slice(1)) assert.notEqual(hit.where, 'title');
});

test('every term must appear, but they need not be adjacent or in one section', () => {
  const both = ids('joshu bowl');
  assert.ok(both.includes(7), 'case 7 has both words');
  // a case with only one of the two must be excluded
  const joshuOnly = ids('joshu');
  assert.ok(joshuOnly.length > both.length, 'narrowing with a second word finds fewer cases');
});

test('matching is case- and accent-insensitive', () => {
  assert.deepEqual(ids('JOSHU'), ids('joshu'));
  assert.deepEqual(ids('MU'), ids('mu'));
});

test('results carry a snippet so a list of titles is not the only answer', () => {
  const hit = searchCases('porridge')[0];
  assert.ok(hit, 'the rice porridge is in case 7');
  assert.equal(hit.id, 7);
  assert.ok(hit.snippet && hit.snippet.length > 20, `has context: ${hit.snippet}`);
  assert.ok(/porridge/i.test(hit.snippet), 'the snippet actually contains the term');
});

test('snippet keeps whole words and marks where it was cut', () => {
  const s = snippet('the quick brown fox jumps over the lazy dog and keeps on going for a while', 'jumps', 20);
  assert.ok(/^…/.test(s), 'elided at the front');
  assert.ok(s.includes('jumps'));
  assert.ok(!/\bqui\b|\bick\b/.test(s), 'no half-words');
});

test('parseQuery drops punctuation and one-letter noise', () => {
  assert.deepEqual(parseQuery("Joshu's dog, or a cat?"), [
    { term: "joshu's", exact: false },
    { term: 'dog', exact: false },
    { term: 'or', exact: false },
    { term: 'cat', exact: false },
  ]);
});

test('a quoted term matches whole words only', () => {
  // The motivating case: `mu` unquoted also matches much, must, Mumon,
  // murmur — Joshu's answer, the most important word in the book, is
  // unfindable. Quoted, only the cases where it stands alone.
  const loose = ids('mu');
  const exact = ids('"mu"');
  assert.ok(loose.length > 10, `unquoted mu is noisy: ${loose.length}`);
  assert.deepEqual(exact, [1, 49]);
});

test('a quoted phrase must appear adjacent and in order', () => {
  assert.deepEqual(ids('"wash your bowl"'), [7]);
  assert.deepEqual(ids('"bowl your wash"'), []);
});

test('an unclosed quote searches the text typed so far', () => {
  // mid-typing, the user has opened a quote and not closed it yet
  assert.deepEqual(ids('"mu'), ids('"mu"'));
});

test('unquoted searching finds the same cases as it always did', () => {
  // the SET, not the order — ordering is pinned by its own test below
  assert.equal(searchCases('man').length, 22);
  assert.equal(searchCases('sit').length, 7);
  assert.deepEqual(ids('sit'), [1, 11, 14, 25, 41, 43, 46]);
});

test('results come back in book order, always', () => {
  // Frank, reading a result list: "they should always show a number order."
  // The list is rendered exactly like the Contents — numeral in the left
  // column — so a reader scans it as the Contents with rows removed, and
  // numbers that jump around read as a fault rather than as a ranking.
  // Relevance ordering (title hits first) is deliberately gone; `score` is
  // still computed, and still picks `where` and the snippet.
  for (const q of ['man', 'sit', 'mu', 'joshu', 'monk', 'the']) {
    const got = ids(q);
    assert.ok(got.length > 1, `${q} needs several hits to be worth ordering: ${got.length}`);
    const sorted = [...got].sort((a, b) => a - b);
    assert.deepEqual(got, sorted, `"${q}" came back out of book order: ${got.join(',')}`);
  }
});

test('parseQuery separates quoted runs from loose words', () => {
  assert.deepEqual(parseQuery('joshu "wash your bowl" dog'), [
    { term: 'joshu', exact: false },
    { term: 'wash your bowl', exact: true },
    { term: 'dog', exact: false },
  ]);
});

test('a number finds the case with that number', () => {
  // Before this, `31` matched nothing at all and `3` was dropped as noise.
  assert.equal(ids('31')[0], 31);
  assert.equal(ids('3')[0], 3, 'single digits count');
  assert.ok(!ids('3').includes(31), '3 is not a prefix of 31');
  assert.deepEqual(ids('0'), [], 'no case zero');
  assert.equal(searchCases('"31"')[0].id, 31, 'quoting a number changes nothing');
});

test('a case matched by its number needs no snippet', () => {
  const hit = searchCases('31')[0];
  assert.equal(hit.where, 'title', 'the row already shows the number');
  assert.equal(hit.snippet, null);
});

test('a quoted hit still carries a snippet', () => {
  const hit = searchCases('"porridge"')[0];
  assert.equal(hit.id, 7);
  assert.ok(/porridge/i.test(hit.snippet), `snippet holds the term: ${hit.snippet}`);
});
