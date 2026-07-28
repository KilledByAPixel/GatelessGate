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

test('the afterword runs Mumon\'s afterword, the Zen Warnings, then Amban\'s letter, in that order', async () => {
  const mod = await loadKoan(AFTERWORD_SLUG);
  assert.deepEqual(mod.sections, ['afterword', 'warnings', 'amban']);
});

test('the book closes on "Say it quick. Say it quick."', async () => {
  const mod = await loadKoan(AFTERWORD_SLUG);
  const last = mod.sections.at(-1);
  assert.ok(
    mod.text[last].trim().endsWith('Say it quick. Say it quick.'),
    'the last section of the last page should end on the book\'s closing line',
  );
});
