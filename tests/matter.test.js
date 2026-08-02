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
  assert.deepEqual(mod.sections, ['prose', 'verse', 'colophon', 'warnings', 'amban']);
});

test('the afterword\'s verse is a section of its own, like every other verse in the book', async () => {
  // It sits MID-piece in the source, with the colophon after it, which is why it
  // is addressed by block index rather than as a tail. Getting that wrong would
  // put the colophon under a heading that calls it verse.
  const mod = await loadKoan(AFTERWORD_SLUG);
  const lines = mod.text.verse.split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^The mind of nirvana is easy enough to make out\./);
  assert.equal(mod.labels.verse, 'The Verse');
});

test('the lead-in sentence does not survive into the afterword\'s prose', async () => {
  // "As the lines have it:" is the closing SENTENCE of a running paragraph here,
  // not a line of its own as in the preface. The section label says it now.
  const mod = await loadKoan(AFTERWORD_SLUG);
  assert.ok(!mod.text.prose.trimEnd().endsWith('As the lines have it:'));
  assert.ok(mod.text.prose.trimEnd().endsWith('you have let yourself down.'),
    'the prose should close on its last real sentence');
});

test('the colophon stands on its own, and it is not the verse', async () => {
  const mod = await loadKoan(AFTERWORD_SLUG);
  assert.equal(mod.labels.colophon, 'Colophon');
  assert.ok(mod.text.colophon.trimEnd().endsWith('eighth in descent from Yangqi.'));
  assert.ok(!mod.text.verse.includes('Yangqi'), 'the colophon must not ride along inside the verse');
  assert.ok(!mod.text.prose.includes('Yangqi'), 'nor stay behind in the prose');
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

test('the preface still centres on the spot where its gate would have stood', async () => {
  // The gate is absent and the camera centres where it stood — the subject is
  // its absence. That USED to be checkable by comparing gateTarget with the
  // hub's, back when every hub scene shared one road. The preface bends its own
  // road now, so the invariant has to be stated about the scene itself: the two
  // lanterns flank gateTarget, which is what makes the empty middle read as a
  // missing gate rather than as nothing in particular.
  const mod = await loadKoan(PREFACE_SLUG);
  const built = mod.build();
  const [gx, , gz] = built.gateTarget;
  assert.ok(built.gateTarget.every(Number.isFinite));
  const lanterns = built.scene.children.filter((c) => c.name === 'lantern');
  assert.equal(lanterns.length, 2);
  const d = lanterns.map((l) => Math.hypot(l.position.x - gx, l.position.z - gz));
  assert.ok(Math.abs(d[0] - d[1]) < 1e-6, `the lanterns straddle the spot evenly, got ${d}`);
  assert.ok(Math.abs(d[0] - 2.0) < 1e-6, `and at the width the gate had, got ${d[0].toFixed(3)}`);
});

// Frank: "how do we have this set up differently at all? because right now it
// looks exactly the same." Removing the gate was the ONLY difference between
// the Contents and the preface — same hills, same trees, same bend in the road
// — so the preface read as the Contents with a prop missing. Each scene rolls
// its own land now. This is what stops the three quietly converging again if
// someone tidies the seeds into one shared constant.
test('the three hub scenes are three different pictures, not one with pieces removed', async () => {
  const xz = (built) => built.trees.map((t) => `${t.position.x.toFixed(3)},${t.position.z.toFixed(3)}`);
  const contents = buildHub();
  const preface = (await loadKoan(PREFACE_SLUG)).build();
  const afterword = (await loadKoan(AFTERWORD_SLUG)).build();

  for (const [a, b, names] of [
    [contents, preface, 'contents vs preface'],
    [contents, afterword, 'contents vs afterword'],
    [preface, afterword, 'preface vs afterword'],
  ]) {
    const shared = xz(a).filter((p) => xz(b).includes(p));
    assert.equal(shared.length, 0, `${names}: ${shared.length} trees stand in the same place`);
    // and the road itself bends differently, which moves the gate spot with it
    assert.notDeepEqual(a.gateTarget, b.gateTarget, `${names}: the same road`);
  }
});

test('the afterword seats its meditator UNDER a tree, whatever the seed does', async () => {
  // The one invariant that broke silently: the mat's coordinate was copied out
  // of one particular seed's scatter, and when the seed changed the tree moved
  // and the meditator did not — he sat in open grass under nothing, and no test
  // and no screenshot said a word. Stated against the trees the scene actually
  // built, so it cannot come apart again.
  const built = (await loadKoan(AFTERWORD_SLUG)).build();
  const mat = built.scene.children.find((c) => c.name === 'mat');
  const buddha = built.scene.children.find((c) => c.name === 'buddha');
  assert.ok(mat && buddha, 'the afterword has exactly one figure in it');
  assert.ok(Math.hypot(mat.position.x - buddha.position.x, mat.position.z - buddha.position.z) < 1e-9,
    'and he is on the mat');

  const near = Math.min(...built.trees.map((t) =>
    Math.hypot(t.position.x - mat.position.x, t.position.z - mat.position.z)));
  assert.ok(near < 1.6, `under the canopy, not in open grass — nearest trunk ${near.toFixed(2)}`);
  assert.ok(near > 0.6, `beside the trunk, not inside it — nearest trunk ${near.toFixed(2)}`);

  // He is OFF TO THE SIDE of the shot, not in the middle of it: "he is found,
  // not shown". Measured against the rig's own eye for this page's camera.
  const [gx, , gz] = built.gateTarget;
  const cam = (await loadKoan(AFTERWORD_SLUG)).camera;
  const ex = gx + cam.distance * Math.sin(cam.polar) * Math.sin(cam.azimuth);
  const ez = gz + cam.distance * Math.sin(cam.polar) * Math.cos(cam.azimuth);
  const ax = gx - ex, az = gz - ez, len = Math.hypot(ax, az);
  const dx = mat.position.x - ex, dz = mat.position.z - ez;
  const lateral = Math.abs(dx * az - dz * ax) / len;
  const along = (dx * ax + dz * az) / len;
  assert.ok(along > len, `past the gate spot, deeper in the shot (${along.toFixed(1)} vs ${len.toFixed(1)})`);
  assert.ok(lateral > 1.5, `off the centre line — the camera is not on him (${lateral.toFixed(2)})`);
  assert.ok(lateral < 8, `and still inside the frame (${lateral.toFixed(2)})`);
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
