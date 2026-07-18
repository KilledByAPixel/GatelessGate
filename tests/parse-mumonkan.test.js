import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMumonkan } from '../scripts/lib/parse-mumonkan.js';

const FIXTURE = `THE GATELESS GATE

Translated by A and B (1934). Public domain.

1. Joshu's Dog

A monk asked Joshu: "Has a dog Buddha-nature?"

Joshu answered: "Mu."

Mumon's comment: To realize Zen one has to pass the barrier.

More comment here.

Has a dog Buddha-nature? If you say yes or no, you lose it.

2. Hyakujo's Fox

Once Hyakujo lectured and an old man attended.

Mumon's comment: How can this answer make a fox?

The same dice shows two faces.

49. Amban's Addition

Amban, a layman, said something pointed.

Amban's comment: Where did that teaching come from?

When two thieves meet they need no introduction.
`;

test('parses front matter, cases, comment/verse split', () => {
  const { about, cases } = parseMumonkan(FIXTURE);
  assert.match(about, /THE GATELESS GATE/);
  assert.match(about, /Public domain/);
  assert.deepEqual(Object.keys(cases).map(Number).sort((a, b) => a - b), [1, 2, 49]);

  const c1 = cases[1];
  assert.equal(c1.title, "Joshu's Dog");
  assert.match(c1.case, /A monk asked Joshu/);
  assert.match(c1.case, /Joshu answered: "Mu\."/);
  assert.doesNotMatch(c1.case, /Mumon's comment/);
  assert.match(c1.comment, /^To realize Zen/);          // label stripped
  assert.match(c1.comment, /More comment here\./);        // spans paragraphs
  assert.equal(c1.verse, 'Has a dog Buddha-nature? If you say yes or no, you lose it.');
  assert.ok(!c1.extra);
});

test('marks the 49th (Amban) as extra and strips its label', () => {
  const { cases } = parseMumonkan(FIXTURE);
  assert.equal(cases[49].extra, true);
  assert.match(cases[49].comment, /^Where did that teaching/);
  assert.equal(cases[49].verse, 'When two thieves meet they need no introduction.');
});

test('every parsed field is non-empty', () => {
  const { cases } = parseMumonkan(FIXTURE);
  for (const id of Object.keys(cases)) {
    for (const f of ['title', 'case', 'comment', 'verse']) {
      assert.ok(cases[id][f].trim().length > 0, `case ${id} ${f} empty`);
    }
  }
});
