import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadKoan, isRegistered } from '../src/koans/registry.js';
import { CASES } from '../src/koans/index.js';
import { PREFACE_SLUG, AFTERWORD_SLUG } from '../src/spine.js';

// THE MATTER NET.
//
// tests/staging.test.js holds every one of the forty-nine cases to the module
// contract at once; the preface and the afterword sit entirely outside that
// net because they are not in CASES. Their data contract — text, labels, and
// sections agreeing with each other — is plain-Node testable, since
// src/koans/matter/preface.js imports nothing but its own text module. This
// is the only place that would catch a typo'd slug, a section present in
// `text` but missing from `labels` (a blank section on the page), or the
// closing line drifting.

const PAGES = [
  { slug: PREFACE_SLUG },
  { slug: AFTERWORD_SLUG },
];

for (const { slug } of PAGES) {
  test(`${slug} is registered and loads`, async () => {
    // isRegistered is what enter()/router use to decide a slug is real before
    // ever trying to load it — if this is false the page is simply unreachable.
    assert.ok(isRegistered(slug), `${slug} should be registered`);
    const mod = await loadKoan(slug);
    assert.ok(mod, `loadKoan(${slug}) should resolve to a module`);
  });

  test(`${slug} has no number — that is what removes the seal and narration`, async () => {
    const mod = await loadKoan(slug);
    assert.equal(mod.id, null);
    assert.equal(mod.slug, slug);
  });

  test(`${slug}: text and labels agree with sections exactly`, async () => {
    const mod = await loadKoan(slug);
    assert.ok(Array.isArray(mod.sections) && mod.sections.length > 0, 'sections must be non-empty');
    // A section listed in `sections` but missing from `text` or `labels` (or
    // the reverse — a stray key nobody asked for) is exactly the mismatch that
    // would render a blank or unlabelled section on the page.
    assert.deepEqual(Object.keys(mod.text).sort(), [...mod.sections].sort());
    assert.deepEqual(Object.keys(mod.labels).sort(), [...mod.sections].sort());
    for (const key of mod.sections) {
      assert.ok(mod.text[key] && mod.text[key].trim().length > 0, `${slug}.${key} text must be non-empty`);
    }
  });

  test(`${slug}: ambience and mood are what main.js expects to pass to the audio engine`, async () => {
    const mod = await loadKoan(slug);
    assert.ok(Array.isArray(mod.ambience));
    for (const a of mod.ambience) assert.equal(typeof a, 'string');
    assert.equal(typeof mod.mood, 'string');
  });

  test(`${slug} does not appear in CASES`, () => {
    // Progress and the reading spine both distinguish "case" from "matter" by
    // whether a slug is in CASES; a matter page leaking in here would start
    // counting fifty-one cases.
    assert.ok(!CASES.some((c) => c.slug === slug), `${slug} must not be in CASES`);
  });
}

test('the preface reads as prose then its verse', async () => {
  const mod = await loadKoan(PREFACE_SLUG);
  assert.deepEqual(mod.sections, ['prose', 'verse']);
  assert.equal(mod.labels.prose, 'The Preface');
  assert.equal(mod.labels.verse, 'The Verse');
});

test('the preface verse is the four lines the book is named after', async () => {
  const mod = await loadKoan(PREFACE_SLUG);
  const lines = mod.text.verse.split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^The great road has no gate\./);
});

test('the lead-in to the verse does not survive into the prose', async () => {
  const mod = await loadKoan(PREFACE_SLUG);
  assert.ok(!mod.text.prose.trimEnd().endsWith('The verse:'),
    'the section label replaces the lead-in line');
});

test('the afterword runs Mumon\'s afterword, the Zen Warnings, then Amban\'s letter, in that order', async () => {
  const mod = await loadKoan(AFTERWORD_SLUG);
  assert.deepEqual(mod.sections, ['prose', 'warnings', 'amban']);
});

test('the afterword keeps its verse inline, with the colophon after it', async () => {
  const mod = await loadKoan(AFTERWORD_SLUG);
  assert.match(mod.text.prose, /The mind of nirvana is easy enough to make out\./);
  assert.ok(mod.text.prose.trimEnd().endsWith('eighth in descent from Yangqi.'),
    'the colophon closes the section, so splitting the verse out would strand it');
});

test('no page carries a rendered indent', async () => {
  for (const slug of [PREFACE_SLUG, AFTERWORD_SLUG]) {
    const mod = await loadKoan(slug);
    for (const key of mod.sections) {
      assert.ok(!mod.text[key].includes('　'), `${slug}.${key} still indented`);
    }
  }
});

test('the book closes on "Say it quick. Say it quick."', async () => {
  const mod = await loadKoan(AFTERWORD_SLUG);
  const last = mod.sections.at(-1);
  assert.ok(
    mod.text[last].trim().endsWith('Say it quick. Say it quick.'),
    'the last section of the last page should end on the book\'s closing line',
  );
});
