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

test('every required piece is found, keyed by its Chinese title', () => {
  const out = parseMatter(FIXTURE);
  assert.deepEqual(Object.keys(out).sort(), [...MATTER_REQUIRED].sort());
  assert.match(out['無門關自序'], /The Buddha's teaching|The Buddha's teaching/);
  assert.match(out['後序'], /buddhas and the patriarchs/);
  assert.match(out['禪箴'], /Follow the rules/);
  assert.match(out['安晚居士書'], /Say it quick/);
});

test('the scholarly apparatus is left behind', () => {
  const all = Object.values(parseMatter(FIXTURE)).join('\n');
  assert.ok(!all.includes('T48n2005'), 'Taishō citations leaked in');
  assert.ok(!all.includes('紹定戊子'), 'notes leaked in');
  assert.ok(!all.includes('⚑'), 'uncertainty flags leaked in');
  assert.ok(!all.includes('### '), 'sub-headings leaked in');
  assert.ok(!all.includes('佛語心為宗。'), 'the Chinese block leaked in');
});

test('the English keeps its own line breaks', () => {
  // The verses are laid out with ideographic-space indents and they must survive:
  // reflowing them into a paragraph destroys the form.
  const warnings = parseMatter(FIXTURE)['禪箴'];
  assert.ok(warnings.includes('\n'), 'the couplet was flattened');
  assert.match(warnings, /Follow the rules and hold the line:\n.*without a rope/s);
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
