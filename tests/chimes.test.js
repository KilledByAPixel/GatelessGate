import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeHut } from '../src/kit/hut.js';
import { makeGate } from '../src/kit/gate.js';
import { hangChimes, setChimeAudio } from '../src/kit/chimes.js';
import { makeFurin, FURIN_REACH } from '../src/kit/furin.js';

const chimesOf = (g) => { const out = []; g.traverse((o) => { if (o.name === 'furin') out.push(o); }); return out; };

// The lowest ink anything on the chime reaches, measured off the built
// geometry rather than trusted from the formula — the clearance rules are only
// worth having if what gets built actually obeys them.
function lowest(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3(), b = new THREE.Box3();
  obj.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  return box.min.y;
}

test('no chimes unless asked: every hut and gate in the book is untouched', () => {
  // The default has to be nothing, or this feature silently redresses forty
  // scenes and forty draw budgets.
  assert.equal(chimesOf(makeHut()).length, 0);
  assert.equal(chimesOf(makeGate()).length, 0);
  assert.equal(makeHut().chimes.length, 0);
  assert.deepEqual(hangChimes(new THREE.Group(), { seed: 0 }), []);
  // and the no-op update is still safe to call, so a case never has to ask
  makeHut().updateChimes(1 / 60, 3);
});

test('a seed hangs one or two, and the same seed hangs the same ones', () => {
  for (const seed of [1, 7, 42, 1234]) {
    const n = chimesOf(makeHut({ chimes: seed })).length;
    assert.ok(n === 1 || n === 2, `seed ${seed} hung ${n}`);
  }
  const a = makeHut({ chimes: 9 }), b = makeHut({ chimes: 9 });
  const pos = (g) => chimesOf(g).map((c) => [c.position.x, c.position.y, c.position.z]);
  assert.deepEqual(pos(a), pos(b), 'same seed, same chimes, every build');
  assert.notDeepEqual(pos(a), pos(makeHut({ chimes: 10 })), 'a different seed is a different arrangement');
});

test('over enough seeds both kinds and a spread of sizes come up', () => {
  // "random types and sizes" — a generator that always returns the same ring
  // at the same size would pass every other test in this file.
  const kinds = new Set(), sizes = new Set();
  for (let s = 1; s <= 40; s++) {
    for (const c of chimesOf(makeHut({ chimes: s }))) {
      let tubes = 0;
      c.traverse((o) => { if (o.name === 'tube') tubes++; });
      kinds.add(tubes);
      sizes.add(Math.round(lowest(c) * 100));
    }
  }
  assert.ok(kinds.has(1), 'the single body comes up');
  assert.ok(kinds.size >= 3, `only ${[...kinds].join(',')} — the ring sizes never vary`);
  assert.ok(sizes.size > 10, `only ${sizes.size} distinct hangs across forty seeds`);
});

test('they hang under the eave on the door side, inside the roof', () => {
  const width = 2.4, height = 2.2, depth = 2.0;
  const hut = makeHut({ width, height, depth, chimes: 3 });
  const over = 0.28 + 0.05 * Math.min(width, depth);
  const hx0 = width / 2 + over, hz0 = depth / 2 + over;
  for (const c of chimesOf(hut)) {
    assert.ok(c.position.z > depth / 2, `the door side (+z), got z=${c.position.z}`);
    assert.ok(c.position.z < hz0, `under the eave, not past its tip: z=${c.position.z} vs ${hz0}`);
    assert.ok(Math.abs(c.position.x) < hx0 - 0.2, `inside the roof: x=${c.position.x}`);
    assert.ok(Math.abs(c.position.x) > 0.05, 'off dead centre — hung, not fitted');
    assert.equal(c.position.y, height, 'the soffit line');
  }
});

test('a gate chime clears the tie beam it would otherwise swing through', () => {
  // Case 29's trap, now solved by the builder for any height: the nuki crosses
  // at 0.78 of the way up and a chime longer than the gap beats against it.
  for (const height of [2.0, 2.6, 3.4]) {
    const gate = makeGate({ width: 2.4, height, chimes: 5 });
    const nukiTop = height * 0.78 + 0.07;
    const chimes = chimesOf(gate);
    assert.ok(chimes.length > 0, 'it hung something');
    for (const c of chimes) {
      assert.ok(lowest(c) > nukiTop, `at height ${height} a chime reaches ${lowest(c).toFixed(3)}, tie beam tops at ${nukiTop.toFixed(3)}`);
      // and stays on the flat centre span of the kasagi, whose wings tilt away
      assert.ok(Math.abs(c.position.x) < 2.4 * 0.364, `off the flat span: x=${c.position.x}`);
    }
  }
});

test('a clearance too tight to hang a normal chime shrinks it instead of fouling', () => {
  // The solve has to hold at the ends, not just in the middle: cord and size
  // share one budget, and a size picked first can leave no room for a cord.
  const parent = new THREE.Group();
  const tight = hangChimes(parent, { seed: 4, y: 0, maxDrop: 0.14 });
  for (const f of tight) {
    assert.ok(lowest(f.group) > -0.14 - 1e-6, `reaches ${lowest(f.group)} past a 0.14 clearance`);
    // still a chime, not a speck: FURIN_REACH x size plus a real cord fits
    assert.ok(lowest(f.group) < -0.05, 'and it is still hanging, not tied flush to the beam');
  }
});

test('two chimes never swing in lockstep, and go one either side', () => {
  // Two identical pendulums released together are the one thing that says
  // "these came out of the same function" (case 29 hit it first).
  let pairs = 0;
  for (let s = 1; s <= 30 && pairs < 3; s++) {
    const hut = makeHut({ chimes: s });
    const cs = chimesOf(hut);
    if (cs.length !== 2) continue;
    pairs++;
    assert.ok(cs[0].position.x * cs[1].position.x < 0, 'one either side of centre');
    hut.updateChimes(1 / 60, 4.0);
    hut.updateChimes(1 / 60, 4.5);
    const swing = cs.map((c) => c.getObjectByName('swing').rotation.z);
    assert.notEqual(swing[0], swing[1], 'they are swinging on the same clock');
  }
  assert.ok(pairs > 0, 'no seed in thirty hung a pair — the count is stuck at one');
});

const swing = (g, secs = 20) => { for (let i = 0; i < 60 * secs; i++) g.updateChimes(1 / 60, i / 60); };

test('a hung chime makes sound without being asked to', () => {
  // `chimes: 7` is the whole instruction (Frank: "chimes should make sound by
  // default"). main.js hands the kit the app's one engine at startup and the
  // chime finds it at strike time — no second word at the call site, and no
  // silent chime because somebody forgot one.
  const struck = [];
  setChimeAudio({ chimeStrike: (o) => struck.push(o) });
  try {
    swing(makeHut({ chimes: 11 }));
    assert.ok(struck.length > 0, 'twenty seconds in the wind and nothing rang');
    for (const s of struck) {
      assert.ok(Number.isFinite(s.force) && s.force > 0, `bad force ${s.force}`);
      assert.ok(Number.isInteger(s.tube), `bad tube ${s.tube}`);
    }
  } finally { setChimeAudio(null); }
});

test('an engine passed in wins over the shared one', () => {
  // How a test captures its own strikes, and the escape hatch for a case that
  // wants a chime routed somewhere of its own.
  const shared = [], mine = [];
  setChimeAudio({ chimeStrike: (o) => shared.push(o) });
  try {
    swing(makeHut({ chimes: 11, audio: { chimeStrike: (o) => mine.push(o) } }));
    assert.ok(mine.length > 0, 'the engine it was handed never heard anything');
    assert.equal(shared.length, 0, 'and the shared one was not rung behind its back');
  } finally { setChimeAudio(null); }
});

test('with no engine anywhere it swings in silence rather than throwing', () => {
  // build() must survive a scene with no audio at all — the staging net builds
  // every case that way, and a page can be entered before the engine exists.
  setChimeAudio(null);
  swing(makeHut({ chimes: 11 }));            // no throw is the assertion
});

test('the engine is found at STRIKE time, not at build', () => {
  // A scene built before startup finished would otherwise capture a null and
  // stay mute for the rest of its life.
  setChimeAudio(null);
  const hut = makeHut({ chimes: 11 });       // built into a silent world...
  const struck = [];
  setChimeAudio({ chimeStrike: (o) => struck.push(o) });   // ...engine arrives after
  try {
    swing(hut);
    assert.ok(struck.length > 0, 'the chime kept the null it was built with');
  } finally { setChimeAudio(null); }
});

test('FURIN_REACH bounds BOTH forms, not just the single it was derived from', () => {
  // Every clearance in this file is solved against this constant, so if it
  // understates a real chime the beams stop being cleared and nothing says so.
  //
  // The two forms are exactly flat in size and exactly different: 1.980x for a
  // single body, 2.100x for a ring. Case 29 measured the single and wrote 1.98,
  // correctly for what it was hanging; promoting that to a general bound put
  // every ring 6% deeper than the beam it was checked against.
  for (const tubes of [1, 3, 5]) {
    for (const size of [0.03, 0.09, 0.185, 0.25]) {
      const f = makeFurin({ tubes, size, cordLength: 0, seed: 5 });
      const ratio = -lowest(f.group) / size;
      assert.ok(ratio <= FURIN_REACH + 1e-6,
        `a ${tubes}-tube chime reaches ${ratio.toFixed(3)}x its size, past FURIN_REACH ${FURIN_REACH}`);
      // and the bound is tight enough to be worth having
      assert.ok(ratio > FURIN_REACH - 0.2, `${tubes} tubes at ${ratio.toFixed(3)}x — the bound has gone slack`);
    }
  }
  const single = -lowest(makeFurin({ tubes: 1, size: 0.1, cordLength: 0, seed: 5 }).group) / 0.1;
  assert.ok(Math.abs(single - 1.98) < 1e-6, `the single's own figure, case 29's: ${single}`);
});
