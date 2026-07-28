import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadKoan, isRegistered, isStaged } from '../src/koans/registry.js';
import { CASES } from '../src/koans/index.js';
import { PREFACE_SLUG, AFTERWORD_SLUG } from '../src/spine.js';
import { buildHub } from '../src/intro.js';

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

  test(`${slug} is staged — it has a scene of its own, not the default landscape`, () => {
    assert.ok(isStaged(slug), `${slug} should be staged`);
  });

  test(`${slug} has no number — that is what removes the seal`, async () => {
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
  assert.equal(mod.labels.prose, "Mumon's Preface");
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

test('the hub keeps its gate when nobody asks otherwise', () => {
  const hub = buildHub();
  assert.ok(Array.isArray(hub.gateTarget) && hub.gateTarget.length === 3);
  assert.ok(hub.gateTarget.every(Number.isFinite), 'a non-finite target would aim the camera at nothing');
});

test('a scene can be built without its gate, path, monk or lanterns', () => {
  // The afterword empties the stage. Nothing here asserts what it LOOKS like —
  // that is a look-dev question — only that the options are honoured and the
  // result is still a usable scene with a finite camera target.
  const bare = buildHub({ gate: false, path: false, monk: false, lanterns: false });
  assert.ok(bare.scene);
  assert.ok(bare.gateTarget.every(Number.isFinite));
  assert.equal(typeof bare.update, 'function');
  assert.equal(typeof bare.dispose, 'function');
});

test('the preface scene and the hub frame the same point', async () => {
  // The gate is absent on the preface page and the camera still centres where
  // it stood: the composition is unchanged and the subject is its absence.
  assert.deepEqual(buildHub({ gate: false }).gateTarget, buildHub().gateTarget);
});

// The four tests above hold for a return-value shape that a fully-dressed
// default hub also satisfies — none of them would fail if the `if (withX)`
// guards in buildHub were deleted and every piece went back to being built
// unconditionally. These assert on the actual CONTENTS of the constructed
// scene instead, keyed off the `name` every kit piece already sets on its own
// root object (`gate.js`, `lantern.js`, `monk.js`, `path.js`) and the shared
// `blobshadow` name every blob shadow carries (`render/blobshadow.js`) — no
// change to buildHub's own code was needed to make its children identifiable.
function countNamed(scene, name) {
  return scene.children.filter((c) => c.name === name).length;
}

test('the fully-dressed hub has one each of gate, monk, path and two lanterns', () => {
  const full = buildHub();
  assert.equal(countNamed(full.scene, 'gate'), 1);
  assert.equal(countNamed(full.scene, 'lantern'), 2);
  assert.equal(countNamed(full.scene, 'monk'), 1);
  assert.equal(countNamed(full.scene, 'path'), 1);
  assert.equal(countNamed(full.scene, 'blobshadow'), 4, 'gate + monk + two lanterns');
});

test('gate: false removes only the gate and its own shadow', () => {
  const full = buildHub();
  const noGate = buildHub({ gate: false });
  assert.equal(countNamed(noGate.scene, 'gate'), 0);
  assert.equal(
    countNamed(full.scene, 'blobshadow') - countNamed(noGate.scene, 'blobshadow'), 1,
    'only the gate\'s own shadow should disappear with it',
  );
  // the lanterns keep the shared keepout circle alive, but the objects
  // themselves are unaffected by the gate flag
  assert.equal(countNamed(noGate.scene, 'lantern'), 2);
  assert.equal(countNamed(noGate.scene, 'monk'), 1);
  assert.equal(countNamed(noGate.scene, 'path'), 1);
});

test('lanterns: false removes both lanterns and both their shadows', () => {
  const full = buildHub();
  const noLanterns = buildHub({ lanterns: false });
  assert.equal(countNamed(noLanterns.scene, 'lantern'), 0);
  assert.equal(
    countNamed(full.scene, 'blobshadow') - countNamed(noLanterns.scene, 'blobshadow'), 2,
  );
  assert.equal(countNamed(noLanterns.scene, 'gate'), 1);
  assert.equal(countNamed(noLanterns.scene, 'monk'), 1);
});

test('monk: false removes the monk and its shadow', () => {
  const full = buildHub();
  const noMonk = buildHub({ monk: false });
  assert.equal(countNamed(noMonk.scene, 'monk'), 0);
  assert.equal(
    countNamed(full.scene, 'blobshadow') - countNamed(noMonk.scene, 'blobshadow'), 1,
  );
  assert.equal(countNamed(noMonk.scene, 'gate'), 1);
  assert.equal(countNamed(noMonk.scene, 'lantern'), 2);
});

test('path: false removes the path itself, but not what it positions', () => {
  const noPath = buildHub({ path: false });
  assert.equal(countNamed(noPath.scene, 'path'), 0);
  // the gate, lanterns and monk are placed using the path's maths even when
  // the path mesh is never added to the scene
  assert.equal(countNamed(noPath.scene, 'gate'), 1);
  assert.equal(countNamed(noPath.scene, 'lantern'), 2);
  assert.equal(countNamed(noPath.scene, 'monk'), 1);
});

test('turning every piece off actually removes all of them from the scene', () => {
  const full = buildHub();
  const bare = buildHub({ gate: false, path: false, monk: false, lanterns: false });
  for (const name of ['gate', 'path', 'monk', 'lantern', 'blobshadow']) {
    assert.equal(countNamed(bare.scene, name), 0, `${name} should be gone from the bare scene`);
  }
  assert.ok(bare.scene.children.length < full.scene.children.length,
    'the bare scene should have strictly fewer objects than the fully-dressed one');
});

// Everything above builds buildHub() directly with hand-written options — it never
// proves that preface.js and afterword.js actually PASS those options through. Both
// modules call buildHub() themselves inside their own build(), so a typo'd option name
// (`gates:` instead of `gate:`, say) would silently fall back to buildHub's defaults —
// the gate would reappear on the preface, the whole stage would reappear on the
// afterword — and nothing above this line would ever notice, because it never goes
// through loadKoan or calls the module's own build(). These do.
test('the preface\'s own build() removes the gate but keeps path, monk and lanterns', async () => {
  const mod = await loadKoan(PREFACE_SLUG);
  const built = mod.build();
  assert.equal(countNamed(built.scene, 'gate'), 0, 'no gate — "no gate as the gate of the teaching"');
  assert.equal(countNamed(built.scene, 'path'), 1);
  assert.equal(countNamed(built.scene, 'monk'), 1);
  assert.equal(countNamed(built.scene, 'lantern'), 2);
});

test('the afterword\'s own build() clears the whole stage', async () => {
  const mod = await loadKoan(AFTERWORD_SLUG);
  const built = mod.build();
  for (const name of ['gate', 'path', 'monk', 'lantern']) {
    assert.equal(countNamed(built.scene, name), 0, `${name} should be gone from the afterword`);
  }
});
