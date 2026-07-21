import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchCases, terms, snippet } from '../src/ui/search.js';

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

test('a title hit outranks a passing mention in a commentary', () => {
  const r = searchCases('flag');
  assert.equal(r[0].id, 29);
  assert.equal(r[0].where, 'title');
  // other cases may mention a flag in passing; they must not come first
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

test('terms drops punctuation and one-letter noise', () => {
  assert.deepEqual(terms("Joshu's dog, or a cat?"), ["joshu's", 'dog', 'or', 'cat']);
});
