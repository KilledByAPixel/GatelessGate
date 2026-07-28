import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMatter, MATTER_REQUIRED } from '../scripts/lib/parse-matter.js';

// A fixture with the same shape as local/mumonkan-front-and-back-matter.md:
// Chinese heading, a Chinese block, the English, then notes that must NOT
// survive into the output.
const FIXTURE = `# The Gateless Gate — front and back matter

Prepared 27 July 2026.

---

## 無門關自序 — Mumon's Preface

**T48n2005 p.292b12–b25.** The one that matters.

### Chinese

> 佛語心為宗。無門為法門。

### English

The Buddha's teaching takes mind as its source.

The verse:

　　The great road has no gate.

### Notes

- **Date.** 紹定戊子 = **1228**.

### ⚑ Unresolved

- **佛語心為宗** could also read something else.

---

## 後序 — Mumon's Afterword

### Chinese

> 從上佛祖垂示機緣。

### English

The buddhas and the patriarchs, handing these encounters down, closed the case.

### Notes

- **Date.** 解制 is the lifting of the summer retreat.

---

## 禪箴 — Zen Warnings

### Chinese

> 　　循規守矩。無繩自縛。

### English

　　Follow the rules and hold the line:
　　you tie yourself up without a rope.

### Notes

- The couplet pairing is editorial.

---

## 安晚居士書 — Amban's Letter

### Chinese

> 無門老禪。作四十八則語。

### English

Old Zen master Mumon made his remarks on forty-eight koans.

Say it quick. Say it quick.

### Notes

- **Amban is 鄭清之.**

---
`;

// Join every block's text back together, in order — used where a test only
// cares whether some text made it in or out, not which block it landed in.
const flatten = (blocks) => blocks.map((b) => b.text).join('\n');

test('every required piece is found, keyed by its Chinese title', () => {
  const out = parseMatter(FIXTURE);
  assert.deepEqual(Object.keys(out).sort(), [...MATTER_REQUIRED].sort());
  assert.match(flatten(out['無門關自序']), /The Buddha's teaching/);
  assert.match(flatten(out['後序']), /buddhas and the patriarchs/);
  assert.match(flatten(out['禪箴']), /Follow the rules/);
  assert.match(flatten(out['安晚居士書']), /Say it quick/);
});

test('the scholarly apparatus is left behind', () => {
  const all = Object.values(parseMatter(FIXTURE)).map(flatten).join('\n');
  assert.ok(!all.includes('T48n2005'), 'Taishō citations leaked in');
  assert.ok(!all.includes('紹定戊子'), 'notes leaked in');
  assert.ok(!all.includes('⚑'), 'uncertainty flags leaked in');
  assert.ok(!all.includes('### '), 'sub-headings leaked in');
  assert.ok(!all.includes('佛語心為宗。'), 'the Chinese block leaked in');
});

test('wrapped prose becomes one paragraph', () => {
  // Prose wrapped at 90 characters should unwrap into a single paragraph.
  const fixture = `## 無門關自序 — Mumon's Preface
### English
This is a sentence
that spans two lines and should rejoin.
### Notes
-
---
## 後序 — Mumon's Afterword
### English
Placeholder.
### Notes
-
---
## 禪箴 — Zen Warnings
### English
Placeholder.
### Notes
-
---
## 安晚居士書 — Amban's Letter
### English
Placeholder.
### Notes
-
---
`;
  const out = parseMatter(fixture);
  const blocks = out['無門關自序'];
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'prose');
  assert.ok(blocks[0].text.includes('This is a sentence that spans two lines and should rejoin.'));
  assert.ok(!blocks[0].text.match(/sentence\n.*should/), 'wrapped prose should not have interior newline');
});

test('blank lines survive as paragraph breaks', () => {
  // Blank lines in the source should remain as \n\n in output.
  const fixture = `## 無門關自序 — Mumon's Preface
### English
Placeholder.
### Notes
-
---
## 後序 — Mumon's Afterword
### English
First paragraph.

Second paragraph.
### Notes
-
---
## 禪箴 — Zen Warnings
### English
Placeholder.
### Notes
-
---
## 安晚居士書 — Amban's Letter
### English
Placeholder.
### Notes
-
---
`;
  const out = parseMatter(fixture);
  const blocks = out['後序'];
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'prose');
  assert.match(blocks[0].text, /First paragraph\.\n\nSecond paragraph\./);
});

test('verse keeps every line break and ships without its indent', () => {
  // The verses are laid out with ideographic-space indents in the source, and
  // reflowing them into a paragraph would still destroy the form — so they
  // land in their own 'verse' block with couplet line breaks intact. Under
  // the old string contract this test also asserted the indent itself
  // *survived* in the output; under the block contract the indent is the
  // marker that produces the block, and is deliberately stripped once it has
  // done that job (see blocksFrom's VERSE_MARK comment) — no U+3000 ships.
  const blocks = parseMatter(FIXTURE)['禪箴'];
  const verse = blocks.find((b) => b.kind === 'verse');
  assert.ok(verse, 'a verse block should be present');
  assert.ok(!verse.text.includes('　'), 'the indent must not survive into the block text');
  assert.ok(verse.text.includes('\n'), 'verse lines should be separated by newline');
  assert.match(verse.text, /Follow the rules and hold the line:\n.*without a rope/s);
});

test('verse following prose does not get swallowed', () => {
  // A verse line after prose should not join into the prose paragraph.
  const fixture = `## 無門關自序 — Mumon's Preface
### English
Placeholder.
### Notes
-
---
## 後序 — Mumon's Afterword
### English
This is prose.

　　This is verse.
### Notes
-
---
## 禪箴 — Zen Warnings
### English
Placeholder.
### Notes
-
---
## 安晚居士書 — Amban's Letter
### English
Placeholder.
### Notes
-
---
`;
  const out = parseMatter(fixture);
  const blocks = out['後序'];
  // Verify: prose closes out into its own block, then verse opens a new one —
  // under the block contract "not swallowed" means "not the same block",
  // rather than "not joined onto the same line with a space".
  assert.deepEqual(blocks, [
    { kind: 'prose', text: 'This is prose.' },
    { kind: 'verse', text: 'This is verse.' },
  ]);
});

test('a horizontal rule ends the English block even with no trailing Notes section', () => {
  // Today every `### English` block is followed by `### Notes`, which already
  // ends the block — this simulates the day someone deletes that Notes
  // section by hand, leaving the closing `---` as the only thing between the
  // English text and the next heading.
  const fixture = `## 無門關自序 — Mumon's Preface
### English
Just the preface text.
---
## 後序 — Mumon's Afterword
### English
Placeholder.
### Notes
-
---
## 禪箴 — Zen Warnings
### English
Placeholder.
### Notes
-
---
## 安晚居士書 — Amban's Letter
### English
Placeholder.
### Notes
-
---
`;
  const out = parseMatter(fixture);
  const blocks = out['無門關自序'];
  assert.deepEqual(blocks, [{ kind: 'prose', text: 'Just the preface text.' }]);
  assert.ok(!blocks[0].text.includes('---'), 'the rule itself must not leak into the text');
});

test('a missing piece fails loudly rather than emitting a blank page', () => {
  // Replace the whole heading, Chinese title included — changing only the
  // English half would leave the piece perfectly findable, which is what makes
  // this test worth having.
  const without = FIXTURE.replace('## 禪箴 — Zen Warnings', '## 拾遺 — Something Else');
  assert.throws(() => parseMatter(without), /禪箴/);
});

test('an empty English block fails loudly too', () => {
  const emptied = FIXTURE.replace(
    'Old Zen master Mumon made his remarks on forty-eight koans.\n\nSay it quick. Say it quick.\n',
    '\n',
  );
  assert.throws(() => parseMatter(emptied), /安晚居士書/);
});

test('a piece splits into prose and verse blocks', () => {
  const md = [
    '## 無門關自序 — Mumon\'s Preface',
    '### English',
    'A line of prose that the source',
    'wrapped across two lines.',
    '',
    'The verse:',
    '',
    '　　The great road has no gate.',
    '　　There are a thousand roads.',
    '### Notes',
    'ignored',
    '## 後序 — Afterword',
    '### English',
    'x',
    '## 禪箴 — Zen Warnings',
    '### English',
    '　　y',
    '## 安晚居士書 — Amban',
    '### English',
    'z',
  ].join('\n');
  const blocks = parseMatter(md)['無門關自序'];
  assert.deepEqual(blocks, [
    { kind: 'prose', text: 'A line of prose that the source wrapped across two lines.\n\nThe verse:' },
    { kind: 'verse', text: 'The great road has no gate.\nThere are a thousand roads.' },
  ]);
});

test('a piece that is verse throughout is one verse block', () => {
  const md = [
    '## 無門關自序 — Preface', '### English', 'a',
    '## 後序 — Afterword', '### English', 'b',
    '## 禪箴 — Zen Warnings',
    '### English',
    '　　Follow the rules and hold the line:',
    '　　you tie yourself up without a rope.',
    '',
    '　　Range where you like with nothing in the way:',
    '　　the outsiders\' road, the devil\'s army.',
    '## 安晚居士書 — Amban', '### English', 'c',
  ].join('\n');
  const blocks = parseMatter(md)['禪箴'];
  assert.equal(blocks.length, 1, 'verse throughout is one block, not one per stanza');
  assert.equal(blocks[0].kind, 'verse');
  assert.ok(!blocks[0].text.includes('　'), 'the indent never ships');
  assert.equal(blocks[0].text, [
    'Follow the rules and hold the line:',
    'you tie yourself up without a rope.',
    '',
    'Range where you like with nothing in the way:',
    'the outsiders\' road, the devil\'s army.',
  ].join('\n'));
});

test('a blank line inside verse is a stanza break, not the end of the block', () => {
  // The Zen Warnings are fourteen stanzas separated by blank lines. If a blank
  // line closed the verse block, they would arrive as fourteen sections; if it
  // were dropped, they would arrive as one wall of lines. It is neither.
  const md = [
    '## 無門關自序 — Preface', '### English', 'a',
    '## 後序 — Afterword', '### English', 'b',
    '## 禪箴 — Warnings', '### English', '　　one', '', '　　two',
    '## 安晚居士書 — Amban', '### English', 'c',
  ].join('\n');
  assert.deepEqual(parseMatter(md)['禪箴'], [{ kind: 'verse', text: 'one\n\ntwo' }]);
});
