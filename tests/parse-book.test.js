import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBook } from '../scripts/lib/parse-book.js';

// The validator insists on all forty-nine cases in order, so fixtures are built
// rather than typed. Each helper produces the real dialect: `##` a page, `###` a
// section, a blank line between every block.
const caseBlock = (id, { comment = "Mumon's Comment" } = {}) => `## ${id}. Case ${id}

### The Case

A monk asked something.

### ${id === 49 ? "Amban's Comment" : comment}

Mumon says something
wrapped across two lines.

### The Verse

First line
Second line
`;

const PREFACE = `## Preface

### Mumon's Preface

The teaching takes mind as its source.

A second paragraph.

### The Verse

The Great Way is gateless,
approached by a thousand roads.
`;

const AFTERWORD = `## Afterword

### Mumon's Afterword

The buddhas handed these down.

### The Verse

The mind of nirvana is easy.
The wisdom is hard.

### Zen Warnings

Follow the rules:
you tie yourself up.

Range where you like:
the devil's army.

### Amban's Letter

Amban wrote to Mumon.
`;

const HEADER = `# The Gateless Gate

<!-- SOURCE OF TRUTH. -->

Some provenance prose that is not part of the book.
`;

const ids = Array.from({ length: 49 }, (_, i) => i + 1);
const book = (overrides = {}) => [
  overrides.header ?? HEADER,
  overrides.preface ?? PREFACE,
  ...ids.map((id) => (overrides.cases?.[id] ?? caseBlock(id))),
  overrides.afterword ?? AFTERWORD,
].join('\n');

test('reads the forty-nine cases and both matter pages', () => {
  const { cases, matter } = parseBook(book());
  assert.equal(Object.keys(cases).length, 49);
  assert.equal(cases[1].title, 'Case 1');
  assert.equal(cases[1].case, 'A monk asked something.');
  assert.deepEqual(Object.keys(matter), ['preface', 'afterword']);
});

test('prose rejoins its wrapped lines, verse keeps them', () => {
  const { cases } = parseBook(book());
  // Wrapping is an editing convenience and means nothing in the output...
  assert.equal(cases[1].comment, 'Mumon says something wrapped across two lines.');
  // ...but a verse line break IS the verse.
  assert.equal(cases[1].verse, 'First line\nSecond line');
});

test('a blank line is a paragraph break in prose and a stanza break in verse', () => {
  const { matter } = parseBook(book());
  assert.equal(matter.preface.text.prose, 'The teaching takes mind as its source.\n\nA second paragraph.');
  assert.equal(
    matter.afterword.text.warnings,
    'Follow the rules:\nyou tie yourself up.\n\nRange where you like:\nthe devil\'s army.',
  );
});

test('a stanza break survives inside verse, so the Warnings stay whole', () => {
  const { matter } = parseBook(book());
  // The shipped Zen Warnings are thirteen stanzas; the fixture is two, and the
  // rule is the same one — a blank line inside verse is a stanza break, not the
  // end of the section. Flattening these would run them into one wall of lines.
  assert.equal(matter.afterword.text.warnings.split('\n\n').length, 2);
});

test("case 49 alone is marked extra, and its comment is Amban's", () => {
  const { cases } = parseBook(book());
  assert.equal(cases[49].extra, true);
  assert.equal(cases[48].extra, undefined);
  assert.ok(cases[49].comment.length > 0);
  // The label DOES reach the module when it is not the default for its key.
  // It used to be matched, validated and then dropped, so every reader saw
  // "Mumon's Comment" over the one comment in the book Mumon did not write.
  assert.deepEqual(cases[49].labels, { comment: "Amban's Comment" });
  assert.equal(cases[1].labels, undefined, 'a case using the default heading carries no override');
});

test('the case entry key order is the one the committed module carries', () => {
  const { cases } = parseBook(book());
  assert.deepEqual(Object.keys(cases[1]), ['title', 'case', 'comment', 'verse']);
  assert.deepEqual(Object.keys(cases[49]), ['title', 'case', 'comment', 'verse', 'labels', 'extra']);
});

test('the matter page shape is the one the reader consumes', () => {
  const { matter } = parseBook(book());
  assert.deepEqual(Object.keys(matter.afterword), ['slug', 'title', 'sections', 'labels', 'text']);
  assert.deepEqual(matter.afterword.sections, ['prose', 'verse', 'warnings', 'amban']);
  assert.equal(matter.afterword.labels.warnings, 'Zen Warnings');
});

test("everything before the first ## is the file's own header, not the book", () => {
  const { cases } = parseBook(book());
  for (const id of ids) assert.ok(!cases[id].case.includes('provenance'));
});

test('a mistyped section heading fails loudly and says where', () => {
  const bad = book({ cases: { 7: caseBlock(7, { comment: 'Mumons Comment' }) } });
  assert.throws(() => parseBook(bad), /case 7[\s\S]*Mumons Comment/);
});

test('a missing section fails rather than shifting the others up', () => {
  const bad = book({ cases: { 3: '## 3. Case 3\n\n### The Case\n\nOnly this.\n' } });
  assert.throws(() => parseBook(bad), /case 3[\s\S]*expected 3 sections/);
});

test('an out-of-order or missing case fails', () => {
  const short = [HEADER, PREFACE, ...ids.slice(0, 48).map((id) => caseBlock(id)), AFTERWORD].join('\n');
  assert.throws(() => parseBook(short), /must be preface, 1, 2/);
});

test('an empty section fails rather than shipping a blank page', () => {
  const bad = book({ cases: { 5: "## 5. Case 5\n\n### The Case\n\n### Mumon's Comment\n\nc\n\n### The Verse\n\nv\n" } });
  assert.throws(() => parseBook(bad), /The Case.*empty/s);
});

test('a mistyped page heading fails and names what it could have been', () => {
  const bad = book({ afterword: AFTERWORD.replace('## Afterword', '## Afterwords') });
  assert.throws(() => parseBook(bad), /Afterwords[\s\S]*Preface, Afterword/);
});

test('a missing matter page fails rather than shipping a book without one', () => {
  const bad = [HEADER, ...ids.map((id) => caseBlock(id)), AFTERWORD].join('\n');
  assert.throws(() => parseBook(bad), /must be preface, 1, 2/);
});

test('the same case twice fails rather than one quietly winning', () => {
  const bad = [HEADER, PREFACE, ...ids.map((id) => caseBlock(id === 12 ? 11 : id)), AFTERWORD].join('\n');
  assert.throws(() => parseBook(bad), /case 11 appears twice/);
});

test('prose stranded outside a section fails', () => {
  const bad = book({ cases: { 9: "## 9. Case 9\n\nStranded.\n\n### The Case\n\nc\n\n### Mumon's Comment\n\nc\n\n### The Verse\n\nv\n" } });
  assert.throws(() => parseBook(bad), /Stranded/);
});
