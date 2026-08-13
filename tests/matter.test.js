import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadKoan, isRegistered, isStaged } from '../src/koans/registry.js';
import { CASES } from '../src/koans/index.js';
import { PREFACE_SLUG, AFTERWORD_SLUG } from '../src/spine.js';
import { buildHub } from '../src/intro.js';
import { eyePosition } from '../src/camera.js';

// THE MATTER NET.
//
// tests/staging.test.js holds every one of the forty-nine cases to the module
// contract at once; the preface and the afterword sit entirely outside that
// net because they are not in CASES. Their data contract — text, labels, and
// sections agreeing with each other — is plain-Node testable. This is the
// only place that would catch a typo'd slug, a section present in `text` but
// missing from `labels` (a blank section on the page), or the closing line
// drifting — and, below, the two scenes' own staging invariants.

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
  // What's guarded is that the verse section holds the verse — four lines, the
  // first of them the gateless one — not one particular English rendering of it.
  // This pinned the first line word for word and duly failed the day the line was
  // retranslated, which told us nothing about the build.
  assert.match(lines[0], /gateless/i);
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
  assert.equal(mod.labels.verse, 'The Verse');
  // What makes this section right is that it is FOUR LINES of verse and holds
  // neither of its neighbours. Its opening words were pinned here once; the
  // edition rewrote them, and the test failed for a change that was correct.
  // The shape is the claim, not the sentence.
  assert.ok(!mod.text.verse.includes(mod.text.colophon), 'the colophon must not ride along in the verse');
  assert.ok(!mod.text.verse.includes('Respectfully set down'));
});

test('the lead-in sentence does not survive into the afterword\'s prose', async () => {
  // "As the lines have it:" is the closing SENTENCE of a running paragraph here,
  // not a line of its own as in the preface. The section label says it now.
  const mod = await loadKoan(AFTERWORD_SLUG);
  assert.ok(!mod.text.prose.trimEnd().endsWith('As the lines have it:'));
  // Any lead-in would end on a colon, pointing at a verse the section heading
  // already announces. Testing for the colon catches a reworded lead-in too,
  // where pinning the closing sentence only caught the one we happened to know.
  assert.ok(!/:$/.test(mod.text.prose.trimEnd()),
    'the prose must not close on a lead-in pointing at the verse');
  assert.ok(/[.!?]["')\]]?$/.test(mod.text.prose.trimEnd()),
    'the prose should close on its last real sentence');
});

test('the colophon stands on its own, and it is not the verse', async () => {
  const mod = await loadKoan(AFTERWORD_SLUG);
  assert.equal(mod.labels.colophon, 'Colophon');
  // A colophon is the signature at the end of the writing: it says who set the
  // book down, and it says so nowhere else on the page. Both halves are checked
  // against the colophon's own text rather than a remembered sentence, so
  // rewording it stays free while losing it or duplicating it still fails. This
  // pinned "eighth in descent from Yangqi", then "...from Yogi", and failed both
  // times for edits that were correct.
  assert.match(mod.text.colophon, /Ekai|Mumon/, 'the colophon should name who set it down');
  const tail = mod.text.colophon.trimEnd().split(/\s+/).slice(-4).join(' ');
  assert.ok(!mod.text.verse.includes(tail), 'the colophon must not ride along inside the verse');
  assert.ok(!mod.text.prose.includes(tail), 'nor stay behind in the prose');
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

// THE PREFACE'S OWN SCENE (Frank: "let's create a separate preface scene").
// It used to be the hub with the gate removed; it is a bespoke diorama now —
// the road the reader arrives on FORKS ("thousands of roads enter it"), a
// bonshō and a flag stand either side of the split, and no gate exists
// anywhere in it. These are the invariants that staging hangs on.
test('the preface is the fork: three road ribbons, and no gate anywhere', async () => {
  const mod = await loadKoan(PREFACE_SLUG);
  const built = mod.build();
  assert.ok(built.scene);
  const paths = [];
  built.scene.traverse((o) => { if (o.name === 'path') paths.push(o); });
  assert.equal(paths.length, 3, `an approach and two arms, got ${paths.length} ribbons`);
  // "no gate as the gate of the teaching" — provable at last: nothing in the
  // scene is a gate, and there is no gateTarget for the camera to mourn
  let gate = null;
  built.scene.traverse((o) => { if (/gate|torii/i.test(o.name || '')) gate = o.name; });
  assert.equal(gate, null, `the preface staged a ${gate}`);
  assert.equal(built.gateTarget, undefined, 'the camera aims at the fork via the module camera, not a gate spot');
  assert.ok(Array.isArray(mod.camera.target) && mod.camera.target.every(Number.isFinite),
    'the module frames its own subject');
});

test('the preface carries the bell and the flag, and both answer a touch', async () => {
  const taps = [], hovers = [];
  const calls = [];
  const ctx = {
    audio: { bell: (o) => calls.push(['bell', o]), cloth: (o) => calls.push(['cloth', o]) },
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,
      pointer: () => ({ x: 0, y: 0 }),
    },
  };
  const mod = await loadKoan(PREFACE_SLUG);
  const built = mod.build(ctx);
  assert.ok(built.scene.getObjectByName('bell'), 'the bonshō stands at the fork');
  assert.ok(built.scene.getObjectByName('flag'), 'the flag stands across from it');
  assert.ok(taps.length > 0 && hovers.length > 0, 'the first page is touchable');

  // a hit-everything tap rings the bonshō — the first sound a reader can make
  built.setCamera({});
  built.update(1 / 60, 0);
  ctx.input.raycastFirst = (cam, objs) => (objs && objs.length
    ? { object: objs[0], point: { clone: () => ({ x: 0, y: 0, z: 0 }) }, distance: 1 } : null);
  taps.forEach((cb) => cb());
  assert.equal(calls.length, 1, 'one answer per tap');
  assert.equal(calls[0][0], 'bell');
  assert.equal(built.fragment().strikes, 1);

  // and the scene runs clean with no audio and no camera, the house rule
  const bare = mod.build();
  for (let i = 0; i < 120; i++) bare.update(1 / 60, i / 60);
  for (const [k, v] of Object.entries(bare.fragment())) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} = ${v}`);
  }
});

// Frank: "how do we have this set up differently at all? because right now it
// looks exactly the same." The preface answered that by leaving the hub
// machinery entirely — it is a different KIND of scene now, which this file
// pins above. The Contents and the afterword still both render buildHub, so
// the old convergence risk — one shared seed constant quietly making them the
// same picture — remains real between THOSE two.
test('the two hub scenes are two different pictures, not one with pieces removed', async () => {
  const xz = (built) => built.trees.map((t) => `${t.position.x.toFixed(3)},${t.position.z.toFixed(3)}`);
  const contents = buildHub();
  const afterword = (await loadKoan(AFTERWORD_SLUG)).build();
  const shared = xz(contents).filter((p) => xz(afterword).includes(p));
  assert.equal(shared.length, 0, `contents vs afterword: ${shared.length} trees stand in the same place`);
  // and the road itself bends differently, which moves the gate spot with it
  assert.notDeepEqual(contents.gateTarget, afterword.gateTarget, 'the same road');
});

test('the afterword seats its meditator UNDER a tree, whatever the seed does', async () => {
  // The one invariant that broke silently: the mat's coordinate was copied out
  // of one particular seed's scatter, and when the seed changed the tree moved
  // and the meditator did not — he sat in open grass under nothing, and no test
  // and no screenshot said a word. He now sits under a tree the page PLANTS
  // (named 'bodhi'), so the pairing is one number rather than two that have to
  // agree — but the claim being made is the same one, and it is still the claim
  // worth making.
  const built = (await loadKoan(AFTERWORD_SLUG)).build();
  const mat = built.scene.children.find((c) => c.name === 'mat');
  const buddha = built.scene.children.find((c) => c.name === 'buddha');
  assert.ok(mat && buddha, 'the afterword still has its meditator');
  assert.ok(Math.hypot(mat.position.x - buddha.position.x, mat.position.z - buddha.position.z) < 1e-9,
    'and he is on the mat');

  const bodhi = built.scene.getObjectByName('bodhi');
  assert.ok(bodhi, 'the afterword plants him a tree of his own');
  const near = Math.hypot(bodhi.position.x - mat.position.x, bodhi.position.z - mat.position.z);
  assert.ok(near < 1.6, `under the canopy, not in open grass — his trunk is ${near.toFixed(2)} away`);
  assert.ok(near > 0.6, `beside the trunk, not inside it — his trunk is ${near.toFixed(2)} away`);

  // ...and nothing from the hub's own scatter is growing through it. buildHub
  // scatters before this page has any say, so the page clears his spot; without
  // that, a seed is free to have already put a trunk exactly where his goes.
  const crowd = built.trees
    .map((t) => Math.hypot(t.position.x - bodhi.position.x, t.position.z - bodhi.position.z))
    .filter((d) => d < 2.5);
  assert.equal(crowd.length, 0, `his spot is his: ${crowd.length} hub trees inside it`);

  // He is OFF TO THE SIDE of the shot, not in the middle of it: "he is found,
  // not shown". Measured against the rig's own eye for this page's camera.
  const [gx, , gz] = built.gateTarget;
  const cam = (await loadKoan(AFTERWORD_SLUG)).camera;
  const [ex, , ez] = eyePosition(cam, built.gateTarget);
  const ax = gx - ex, az = gz - ez, len = Math.hypot(ax, az);
  const dx = mat.position.x - ex, dz = mat.position.z - ez;
  const lateral = Math.abs(dx * az - dz * ax) / len;
  const along = (dx * ax + dz * az) / len;
  assert.ok(along > len, `past the gate spot, deeper in the shot (${along.toFixed(1)} vs ${len.toFixed(1)})`);
  assert.ok(lateral > 1.5, `off the centre line — the camera is not on him (${lateral.toFixed(2)})`);
  assert.ok(lateral < 8, `and still inside the frame (${lateral.toFixed(2)})`);
});

test('the cat stayed behind too, sitting beside him and looking the same way', async () => {
  // Frank: "for the afterword lets add the cat to the scene sitting nearby."
  // Derived off the meditator the same way he is derived off his tree, so it
  // follows him if the seed moves him — the failure this page has already had
  // once, when a written-down coordinate outlived the scatter that produced it.
  const built = (await loadKoan(AFTERWORD_SLUG)).build();
  const buddha = built.scene.getObjectByName('buddha');
  const cat = built.scene.getObjectByName('cat');
  assert.ok(cat, 'the cat is in the closing scene');

  const gap = Math.hypot(cat.position.x - buddha.position.x, cat.position.z - buddha.position.z);
  assert.ok(gap > 0.5 && gap < 1.4, `a stride off the mat, not on it and not across the field: ${gap.toFixed(2)}`);
  assert.ok(Math.abs(cat.rotation.y - buddha.rotation.y) < 1e-9,
    'the two of them are looking at the same empty road, not at each other');

  // and it is alive: the barrel breathes, which is the only thing moving on
  // this page besides the meadow
  const body = cat.getObjectByName('body');
  built.update(1 / 60, 0);
  const at0 = body.scale.x;
  for (let i = 1; i <= 90; i++) built.update(1 / 60, i / 60);
  assert.notEqual(body.scale.x, at0, 'the cat breathes');

  // the page still runs with a junk clock — the guard every update() carries
  built.update(1 / 60, NaN);
  assert.ok(Number.isFinite(body.scale.x), 'a NaN simTime must not stop its breathing');
});

// The four tests above hold for a return-value shape that a fully-dressed
// default hub also satisfies — none of them would fail if the `if (withX)`
// guards in buildHub were deleted and every piece went back to being built
// unconditionally. These assert on the actual CONTENTS of the constructed
// scene instead, keyed off the `name` every kit piece already sets on its own
// root object (`gate.js`, `lantern.js`, `monk.js`, `path.js`) — no change to
// buildHub's own code was needed to make its children identifiable.
function countNamed(scene, name) {
  return scene.children.filter((c) => c.name === name).length;
}

test('the fully-dressed hub has one each of gate, monk, path and two lanterns', () => {
  const full = buildHub();
  assert.equal(countNamed(full.scene, 'gate'), 1);
  assert.equal(countNamed(full.scene, 'lantern'), 2);
  assert.equal(countNamed(full.scene, 'monk'), 1);
  assert.equal(countNamed(full.scene, 'path'), 1);
});

test('gate: false removes only the gate', () => {
  const noGate = buildHub({ gate: false });
  assert.equal(countNamed(noGate.scene, 'gate'), 0);
  // the lanterns keep the shared keepout circle alive, but the objects
  // themselves are unaffected by the gate flag
  assert.equal(countNamed(noGate.scene, 'lantern'), 2);
  assert.equal(countNamed(noGate.scene, 'monk'), 1);
  assert.equal(countNamed(noGate.scene, 'path'), 1);
});

test('lanterns: false removes both lanterns and nothing else', () => {
  const noLanterns = buildHub({ lanterns: false });
  assert.equal(countNamed(noLanterns.scene, 'lantern'), 0);
  assert.equal(countNamed(noLanterns.scene, 'gate'), 1);
  assert.equal(countNamed(noLanterns.scene, 'monk'), 1);
});

test('monk: false removes the monk and nothing else', () => {
  const noMonk = buildHub({ monk: false });
  assert.equal(countNamed(noMonk.scene, 'monk'), 0);
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
  for (const name of ['gate', 'path', 'monk', 'lantern']) {
    assert.equal(countNamed(bare.scene, name), 0, `${name} should be gone from the bare scene`);
  }
  assert.ok(bare.scene.children.length < full.scene.children.length,
    'the bare scene should have strictly fewer objects than the fully-dressed one');
});

// Everything above builds buildHub() directly with hand-written options — it never
// proves that afterword.js actually PASSES those options through. It calls buildHub()
// itself inside its own build(), so a typo'd option name (`gates:` instead of `gate:`,
// say) would silently fall back to buildHub's defaults — the whole stage would
// reappear — and nothing above this line would ever notice, because it never goes
// through loadKoan or calls the module's own build(). This does. (The preface used
// to have a twin of this test; it stopped rendering the hub at all — see the fork
// tests above, which are its staging net now.)
test('the preface\'s own build() stages the fork: one monk, three ribbons, no gate', async () => {
  const mod = await loadKoan(PREFACE_SLUG);
  const built = mod.build();
  assert.equal(countNamed(built.scene, 'gate'), 0, 'no gate — "no gate as the gate of the teaching"');
  assert.equal(countNamed(built.scene, 'path'), 3, 'the approach and the two arms of the fork');
  assert.equal(countNamed(built.scene, 'monk'), 1, 'the one who has arrived at the choosing');
});

test('the afterword\'s own build() clears the whole stage', async () => {
  const mod = await loadKoan(AFTERWORD_SLUG);
  const built = mod.build();
  for (const name of ['gate', 'path', 'monk', 'lantern']) {
    assert.equal(countNamed(built.scene, name), 0, `${name} should be gone from the afterword`);
  }
});

test('the preface monk rings the bell — the red figure acts through the bonshō', async () => {
  // Frank's audit: "when you click on the red guy, it rings the bell." Same
  // strike and the same 0.5s floor as tapping the bonshō itself, spatialised
  // at the bell — the bell is what sounds, whoever asked it to.
  const taps = [];
  const bells = [];
  const ctx = {
    audio: { bell: (o) => bells.push(o), cloth: () => {} },
    input: {
      onTap: (cb) => taps.push(cb), onHover: () => {},
      raycastFirst: () => null, pointer: () => ({ x: 0, y: 0 }),
    },
  };
  const mod = await loadKoan(PREFACE_SLUG);
  const built = mod.build(ctx);
  built.setCamera({});
  built.update(1 / 60, 1);

  const monk = built.scene.children.find((c) => c.name === 'monk');
  assert.ok(monk, 'the one red figure');
  const monkMeshes = [];
  monk.traverse((o) => { if (o.isMesh) monkMeshes.push(o); });
  ctx.input.raycastFirst = (cam, objs) => {
    const m = objs.find && objs.find((o) => monkMeshes.includes(o));
    return m ? { object: m, point: { clone: () => ({ x: 0, y: 0, z: 0 }) }, distance: 1 } : null;
  };

  taps.forEach((cb) => cb());
  assert.equal(bells.length, 1, 'touching the monk rings the bonshō');
  assert.equal(bells[0].preset, 'temple', 'the same temple voice the bell answers with');
  assert.equal(built.fragment().strikes, 1, 'counted as a strike like any other');

  taps.forEach((cb) => cb());
  assert.equal(bells.length, 1, 'the held-pointer floor holds for him too');

  built.update(1 / 60, 2);
  taps.forEach((cb) => cb());
  assert.equal(bells.length, 2, 'and past the floor he rings it again');
});
