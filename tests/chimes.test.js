import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeHut } from '../src/kit/hut.js';
import { makeGate } from '../src/kit/gate.js';
import { hangChimes, setChimeAudio, collectChimes, ringChimeAt } from '../src/kit/chimes.js';
import { rigCamera } from './helpers/rig-camera.js';
import { makeFurin, FURIN_REACH } from '../src/kit/furin.js';

// Every chime group in a subtree, whichever family it came from — a fūrin is
// named 'furin' and a bronze cylinder 'cylinder-chime', and counting only the
// first silently reported zero for a hut that had hung two cylinders.
const HUNG = new Set(['furin', 'cylinder-chime']);
const chimesOf = (g) => { const out = []; g.traverse((o) => { if (HUNG.has(o.name)) out.push(o); }); return out; };

// The lowest ink anything on the chime reaches, measured off the built
// geometry rather than trusted from the formula — the clearance rules are only
// worth having if what gets built actually obeys them.
function lowest(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3(), b = new THREE.Box3();
  obj.traverse((o) => {
    if (!o.isMesh) return;
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

// Which of the four it is: a fūrin by its tube count, or the bronze cylinder.
function kindOf(group) {
  if (group.name === 'cylinder-chime') return 'cylinder';
  let tubes = 0;
  group.traverse((o) => { if (o.name === 'tube') tubes++; });
  return `furin-${tubes}t`;
}
const heightOf = (g) => { g.updateMatrixWorld(true); return new THREE.Box3().setFromObject(g).max.y - new THREE.Box3().setFromObject(g).min.y; };

test('all four chimes come up, at a spread of sizes', () => {
  // "just randomly pick between chimes" — a generator that always returns the
  // same ring at the same size would pass every other test in this file.
  const kinds = new Set(), sizes = new Set();
  for (let s = 1; s <= 60; s++) {
    for (const c of chimesOf(makeHut({ chimes: s }))) {
      kinds.add(kindOf(c));
      sizes.add(Math.round(lowest(c) * 100));
    }
  }
  for (const want of ['furin-1t', 'furin-3t', 'furin-5t', 'cylinder']) {
    assert.ok(kinds.has(want), `${want} never came up: got ${[...kinds].join(', ')}`);
  }
  assert.ok(sizes.size > 10, `only ${sizes.size} distinct hangs across sixty seeds`);
});

test('the four hang at the SAME apparent size, whatever family they come from', () => {
  // THE BUG THIS FILE EXISTS TO STOP COMING BACK. A fūrin is 2.1x its `size`
  // tall and a bronze cylinder 0.98x, so one shared band of `size` numbers hung
  // the cylinders at half the scale of everything beside them. Both are sized
  // from a world height now, so a reader cannot tell which builder made which
  // by how big it is.
  const byKind = {};
  for (let s = 1; s <= 60; s++) {
    for (const c of chimesOf(makeHut({ chimes: s }))) (byKind[kindOf(c)] ||= []).push(heightOf(c));
  }
  const means = Object.entries(byKind).map(([k, hs]) => [k, hs.reduce((a, b) => a + b, 0) / hs.length]);
  const lo = Math.min(...means.map(([, m]) => m)), hi = Math.max(...means.map(([, m]) => m));
  assert.ok(hi / lo < 1.25,
    `families disagree on scale: ${means.map(([k, m]) => `${k} ${m.toFixed(2)}`).join(', ')}`);

  // and they are big enough to read from a case camera eleven units out —
  // the old band topped out at 0.39 and mostly sat near 0.20
  for (const [k, hs] of Object.entries(byKind)) {
    const mean = hs.reduce((a, b) => a + b, 0) / hs.length;
    assert.ok(mean > 0.33, `${k} averages ${mean.toFixed(2)} tall — too small to see`);
  }
});

test('one or two, on an even coin', () => {
  // Half the time it should be a single chime.
  let ones = 0, n = 400;
  for (let s = 1; s <= n; s++) if (chimesOf(makeHut({ chimes: s })).length === 1) ones++;
  const pct = (100 * ones) / n;
  assert.ok(pct > 43 && pct < 57, `${pct.toFixed(0)}% single over ${n} seeds — not an even coin`);
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
  // `chimes: 7` is the whole instruction — a hung chime sounds by default.
  // main.js hands the kit the app's one engine at startup and the chime finds
  // it at strike time — no second word at the call site, and no silent chime
  // because somebody forgot one.
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

// ---- the two things that make it a chime rather than an ornament -----------
// Both of these were missing from the first cut: the thing hung correctly, in
// the right place, at the right size, and then sat there: not moving, not
// sounding, not clickable.

test('a hung chime is found by a sweep of the scene it ends up in', () => {
  // How main.js reaches them at all. It has a scene and nothing else — the
  // update/pick/ring surface lives on the fūrin object, not on its Object3D,
  // so the object has to ride along on the group for any of this to be possible.
  const scene = new THREE.Scene();
  const hut = makeHut({ chimes: 11 });
  hut.position.set(3, 0, -2);
  scene.add(hut);
  const found = collectChimes(scene);
  assert.equal(found.length, chimesOf(hut).length, 'the sweep found every chime hung in the scene');
  assert.ok(found.length > 0);
  for (const f of found) {
    for (const fn of ['update', 'pick', 'ring']) {
      assert.equal(typeof f[fn], 'function', `a swept chime can be ${fn}ed`);
    }
  }
  assert.equal(collectChimes(new THREE.Scene()).length, 0, 'a scene with none sweeps up nothing');
});

test('it actually sways: driven, the chime moves and eventually rings', () => {
  const struck = [];
  setChimeAudio({ chimeStrike: (o) => struck.push(o) });
  try {
    const scene = new THREE.Scene();
    scene.add(makeHut({ chimes: 11 }));
    const chimes = collectChimes(scene);
    const swingOf = () => chimes.map((c) => c.group.getObjectByName('swing').rotation.z);
    const start = swingOf();
    const seen = new Set();
    for (let i = 0; i < 60 * 30; i++) {
      for (const c of chimes) c.update(1 / 60, i / 60);
      if (i % 60 === 0) swingOf().forEach((v) => seen.add(v.toFixed(4)));
    }
    const end = swingOf();
    assert.ok(end.some((v, i) => Math.abs(v - start[i]) > 1e-4), 'it hangs dead still — nothing is driving it');
    assert.ok(seen.size > 10, `it barely moves: ${seen.size} distinct poses in thirty seconds`);
    assert.ok(struck.length > 0, 'thirty seconds of swaying and the clapper never reached a tube');
  } finally { setChimeAudio(null); }
});

test('you can click it: a ray that touches a chime rings it', () => {
  const struck = [];
  setChimeAudio({ chimeStrike: (o) => struck.push(o) });
  try {
    const scene = new THREE.Scene();
    scene.add(makeHut({ chimes: 11 }));
    scene.updateMatrixWorld(true);
    const chimes = collectChimes(scene);

    // main.js's own handler, with an input that hits whatever it is offered —
    // the tubes are what a real pointer would find first
    const input = { raycastFirst: (cam, objs) => (objs && objs.length
      ? { object: objs[0], point: new THREE.Vector3(), distance: 1 } : null) };
    assert.equal(ringChimeAt(chimes, {}, input), true, 'a touch on a chime is spent on it');
    for (let i = 0; i < 60 * 3; i++) for (const c of chimes) c.update(1 / 60, i / 60);
    assert.ok(struck.length > 0, 'rung by hand and still silent');

    // and a touch that finds nothing leaves them alone
    assert.equal(ringChimeAt(chimes, {}, { raycastFirst: () => null }), false);
  } finally { setChimeAudio(null); }
});

test('the object form dials the strike rate and pins the count', () => {
  // `chimes: 29` stays a bare seed; `{ seed, wind, count }` is for a corner
  // that should be quieter or busier than the default. The book's rule is that
  // audio is minimal and chill, and how chatty a corner is belongs to the
  // corner rather than to a constant in the kit.
  assert.equal(chimesOf(makeHut({ chimes: { seed: 5, count: 1 } })).length, 1);
  assert.equal(chimesOf(makeHut({ chimes: { seed: 5, count: 2 } })).length, 2);
  assert.equal(chimesOf(makeHut({ chimes: { seed: 0 } })).length, 0, 'seed 0 still hangs nothing');

  const rate = (wind) => {
    let n = 0;
    setChimeAudio({ chimeStrike: () => n++ });
    try {
      const scene = new THREE.Scene();
      scene.add(makeHut({ chimes: { seed: 29, wind, count: 2 } }));
      const cs = collectChimes(scene);
      for (let i = 0; i < 60 * 60; i++) for (const c of cs) c.update(1 / 60, i / 60);
      return n;
    } finally { setChimeAudio(null); }
  };
  const loud = rate(1), quiet = rate(0.2);
  assert.ok(loud > quiet, `less wind must ring less: ${loud}/min at 1 vs ${quiet}/min at 0.2`);
  assert.ok(quiet > 0, 'a quiet chime is still a chime');
});

test('a REAL raycast at a hung chime picks it', () => {
  // The earlier click test handed pick() a stub input that returned a hit for
  // whatever it was offered, which proved the plumbing and nothing about the
  // geometry. This aims the actual THREE.Raycaster the app uses, from the
  // actual case framing, at the chime's own screen position — and uses
  // input.js's NON-recursive intersectObjects, because that is what the app
  // does and a pick target hidden one level down would silently never hit.
  const scene = new THREE.Scene();
  const hut = makeHut({ chimes: 11 });
  hut.position.set(1.2, 0, -1.4);
  scene.add(hut);
  scene.updateMatrixWorld(true);

  const cam = rigCamera({}, { aspect: 1.78 });
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const input = {
    raycastFirst(camera, objects) {
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(objects, false);
      return hits.length ? hits[0] : null;
    },
  };

  const chimes = collectChimes(scene);
  assert.ok(chimes.length > 0);
  for (const c of chimes) {
    const p = new THREE.Vector3();
    c.group.getWorldPosition(p);
    p.y -= 0.2;                                   // the body, a little below the knot
    const v = p.clone().project(cam);
    ndc.set(v.x, v.y);
    assert.ok(Math.abs(v.x) < 1 && Math.abs(v.y) < 1, `the chime is off screen at ${v.x},${v.y}`);
    assert.ok(c.pick(cam, input), 'a ray straight at the chime does not pick it');
  }

  // and a ray at the far corner of the frame picks nothing
  ndc.set(0.98, -0.98);
  assert.equal(ringChimeAt(chimes, cam, input), false, 'it rings on a miss');
});
