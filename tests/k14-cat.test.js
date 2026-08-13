import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeCat } from '../src/kit/cat.js';
import { makeDog } from '../src/kit/dog.js';
import k14 from '../src/koans/k14.js';

// PRECISE boxes throughout. Box3.setFromObject() normally transforms the
// GEOMETRY's box, which for the seated cat's tilted capsule reports a rump
// 0.017 units underground that is not actually there. The seated pose cannot be
// checked at all without walking the vertices.
const box = (o) => {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o, true);
};

// The barrel as a capsule in WORLD space: centre, axis, radius, half-length.
// Reconstructed from the mesh rather than the preset's numbers so it stays
// honest if the proportions are retuned, and from the AXIS rather than a
// bounding box so it survives the seated pose's tilt.
function barrel(root) {
  root.updateMatrixWorld(true);
  const body = root.getObjectByName('body');
  body.geometry.computeBoundingBox();
  const lb = body.geometry.boundingBox;
  const r = (lb.max.x - lb.min.x) / 2;
  const scale = body.getWorldScale(new THREE.Vector3()).x;
  return {
    centre: body.getWorldPosition(new THREE.Vector3()),
    // the capsule is authored along its own +y, whichever way it has been turned
    dir: new THREE.Vector3(0, 1, 0)
      .applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion())).normalize(),
    r: r * scale,
    halfL: ((lb.max.y - lb.min.y) / 2 - r) * scale,
  };
}

// The bug that hit BOTH existing animals: the barrel is a capsule, so it
// narrows toward its sides and a leg sized to the body's lowest point hangs in
// mid-air at the hip. Tilting the barrel for the seated pose makes the same
// mistake available again at a different depth, so this measures every leg top
// against the real axis in both poses.
function assertLegsConnect(root, label, height) {
  const { centre, dir, r, halfL } = barrel(root);
  const legs = [];
  root.traverse((o) => { if (o.name === 'leg') legs.push(o); });
  assert.equal(legs.length, 4, `${label} has four legs`);
  for (const leg of legs) {
    const lb = box(leg);
    const top = new THREE.Vector3((lb.min.x + lb.max.x) / 2, lb.max.y, (lb.min.z + lb.max.z) / 2);
    const rel = top.clone().sub(centre);
    const t = Math.max(-halfL, Math.min(halfL, rel.dot(dir)));
    const d = top.distanceTo(centre.clone().addScaledVector(dir, t));
    assert.ok(d < r, `${label} leg top is inside the barrel: ${d.toFixed(4)} vs radius ${r.toFixed(4)}`);
    assert.ok(lb.min.y < 0.02 * height, `${label} leg reaches the ground: ${lb.min.y.toFixed(4)}`);
  }
}

test('makeCat is a grounded quadruped with named parts, in either pose', () => {
  for (const pose of ['sit', 'stand']) {
    const cat = makeCat({ height: 0.32, pose });
    assert.equal(cat.group.name, 'cat');

    const names = [];
    cat.group.traverse((o) => names.push(o.name));
    assert.equal(names.filter((n) => n === 'leg').length, 4, `${pose}: four legs`);
    assert.equal(names.filter((n) => n === 'ear').length, 2, `${pose}: two ears`);
    for (const part of ['body', 'head', 'snout', 'tail']) {
      assert.ok(names.includes(part), `${pose}: has a ${part}`);
    }

    const b = box(cat.group);
    assert.ok(Math.abs(b.min.y) < 0.01, `${pose}: stands on the ground, not in it: ${b.min.y}`);
    assertLegsConnect(cat.group, `cat ${pose}`, 0.32);
  }
});

test('the seated cat sits up, tucks its rear, and keeps all four paws down', () => {
  const sit = makeCat({ height: 0.32, pose: 'sit' });
  const stand = makeCat({ height: 0.32, pose: 'stand' });

  // the spine is pitched nose-up rather than lying along the ground
  assert.ok(barrel(sit.group).dir.y > 0.5, 'the barrel is tilted up');
  assert.ok(Math.abs(barrel(stand.group).dir.y) < 1e-6, 'and level when standing');

  // which carries the head up and back over the shoulders
  const head = (c) => box(c.group.getObjectByName('head'));
  assert.ok(head(sit).min.y > head(stand).min.y, 'the head rides higher seated');
  assert.ok(head(sit).max.z < head(stand).max.z, 'and is drawn back over the body');
  assert.ok(box(sit.group).max.y > box(stand.group).max.y, 'a sitting cat is the taller animal');

  // the rump comes down to rest but must not sink through the ground
  const rump = box(sit.group.getObjectByName('body'));
  assert.ok(rump.min.y > 0, `the haunch clears the ground: ${rump.min.y}`);
  assert.ok(rump.min.y < 0.06, `but only just: ${rump.min.y}`);

  // all four paws still reach it, and the rear pair have tucked forward
  const legs = [];
  sit.group.traverse((o) => { if (o.name === 'leg') legs.push(o); });
  const feet = legs.map((l) => box(l));
  for (const f of feet) assert.ok(f.min.y < 0.005, `paw on the ground: ${f.min.y}`);
  const standFeet = [];
  stand.group.traverse((o) => { if (o.name === 'leg') standFeet.push(box(o)); });
  const rearZ = (bs) => Math.min(...bs.map((b) => (b.min.z + b.max.z) / 2));
  assert.ok(rearZ(feet) > rearZ(standFeet), 'the rear paws tuck forward under the body');
});

test('makeCat is cat-sized, not a small dog', () => {
  const legTop = (root) => {
    root.updateMatrixWorld(true);
    let y = 0;
    root.traverse((o) => { if (o.name === 'leg') y = Math.max(y, box(o).max.y); });
    return y;
  };

  // at the same withers height a cat is still the shorter-legged animal. (This
  // used to demand a 10% margin AND a rounder barrel — a dog retune (bodyR 0.20
  // -> 0.25, hipX 0.13 -> 0.10) fattened the dog to the cat's own roundness and
  // sank its leg line, both on purpose, so those cross-species ratios stopped
  // being the intent. The direction still holds and stays pinned; the margins
  // belong to him.)
  const cat = makeCat({ height: 0.5, pose: 'stand' });
  const dog = makeDog({ height: 0.5 });
  assert.ok(legTop(cat.group) < legTop(dog),
    `shorter legs than a dog: ${legTop(cat.group)} vs ${legTop(dog)}`);

  // and at the size case 14 uses it, it is a small animal in absolute terms
  const small = box(makeCat({ height: 0.32 }).group);
  assert.ok(small.max.y > 0.32 && small.max.y < 0.52, `cat-sized overall: ${small.max.y}`);
  assert.ok(small.max.y < box(dog).max.y * 0.75, 'well under the dog it shares a body plan with');
});

test('the cat ears lean away from the skull, not across it', () => {
  // Rotating +y about +z sends it toward -x, so the left ear needs a POSITIVE
  // angle to lean outward. With the sign inverted the pair crosses over inside
  // the head — which is exactly how the buffalo shipped looking hornless.
  const cat = makeCat({ height: 1.0, pose: 'stand' });
  cat.group.updateMatrixWorld(true);
  const ears = [];
  cat.group.traverse((o) => { if (o.name === 'ear') ears.push(o); });
  assert.equal(ears.length, 2);

  for (const ear of ears) {
    const base = ear.getWorldPosition(new THREE.Vector3());
    const eb = box(ear);
    const far = base.x < 0 ? eb.min.x : eb.max.x;
    assert.ok(Math.abs(far) > Math.abs(base.x),
      `ear extends outward from x=${base.x.toFixed(2)} to ${far.toFixed(2)}`);
    assert.ok(Math.sign(far) === Math.sign(base.x), 'ear stays on its own side of the head');
  }
  const spread = box(ears[0]).union(box(ears[1]));
  const skull = box(cat.group.getObjectByName('head'));
  // Was * 1.2 — a retune shrank the cat's ears (r/h/x all down) on purpose,
  // spending that margin. The claim that survives is the DIRECTION: the pair
  // still spans the skull rather than stacking on top.
  assert.ok(spread.max.x - spread.min.x > (skull.max.x - skull.min.x) * 0.9,
    'the pair spans the skull');
  assert.ok(spread.max.y > skull.max.y, 'and stands clear above it');
});

test('the tail is a jointed chain, long, and never scrapes the ground', () => {
  const cat = makeCat({ height: 0.32, pose: 'sit' });
  assert.ok(cat.group.getObjectByName('tail'), 'a named tail');
  assert.ok(cat.joints.length >= 6, `enough joints to curl rather than swing: ${cat.joints.length}`);

  const tail = box(cat.group.getObjectByName('tail'));
  assert.ok(tail.max.z - tail.min.z > 0.20, `a long tail, not a stub: ${tail.max.z - tail.min.z}`);
  assert.ok(tail.min.y > 0, `held off the ground: ${tail.min.y}`);

  // a full stir, and the tail has to stay off the ground through all of it
  cat.stir();
  let lowest = Infinity;
  for (let i = 0; i < 600; i++) {
    cat.update(1 / 60, i / 60);
    if (i % 5 === 0) lowest = Math.min(lowest, box(cat.group.getObjectByName('tail')).min.y);
  }
  assert.ok(lowest > 0, `the tail never dips through the ground: ${lowest}`);
});

test('a tap makes the cat stir once, calmly, and settle back', () => {
  const cat = makeCat({ height: 0.32, pose: 'sit' });
  const tip = () => {
    cat.group.updateMatrixWorld(true);
    return cat.joints[cat.joints.length - 1].getWorldPosition(new THREE.Vector3());
  };

  cat.update(1 / 60, 0);
  const rest = tip();
  assert.equal(cat.stirLevel(), 0);
  assert.equal(cat.stirring(), false);

  assert.equal(cat.stir(), true, 'the first touch lands');
  assert.equal(cat.stir(), false, 'a second touch mid-stir does not stack');
  assert.equal(cat.stirCount(), 1);

  for (let i = 0; i < 90; i++) cat.update(1 / 60, i / 60);   // 1.5s in
  assert.ok(cat.stirLevel() > 0.2, `the stir is under way: ${cat.stirLevel()}`);
  assert.ok(tip().distanceTo(rest) > 0.02, 'the tail has actually moved');
  assert.ok(Math.abs(cat.ears[0].rotation.x) > 0.05, 'and an ear has swivelled');

  for (let i = 0; i < 400; i++) cat.update(1 / 60, (90 + i) / 60);
  assert.equal(cat.stirring(), false, 'it settles on its own');
  assert.equal(cat.stirLevel(), 0);
  assert.ok(tip().distanceTo(rest) < 0.05, 'and comes back to roughly where it was');
});

test('the cat is deterministic, and the seed varies its tail', () => {
  const pose = (c) => c.joints.map((j) => [+j.rotation.x.toFixed(9), +j.rotation.z.toFixed(9)]);
  const a = makeCat({ height: 0.32, seed: 14 });
  const b = makeCat({ height: 0.32, seed: 14 });
  a.stir(); b.stir();
  for (let i = 0; i < 100; i++) { a.update(1 / 60, i / 60); b.update(1 / 60, i / 60); }
  assert.deepEqual(pose(a), pose(b), 'same seed, same cat, frame for frame');

  const c = makeCat({ height: 0.32, seed: 99 });
  assert.notDeepEqual(
    c.joints.map((j) => +j.userData.baseZ.toFixed(6)),
    a.joints.map((j) => +j.userData.baseZ.toFixed(6)),
    'a different seed kinks the tail differently');
});

// ---- case 14 ---------------------------------------------------------------

function stubCtx() {
  const taps = [], hovers = [];
  return {
    audio: null,
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,
      pointer: () => ({ x: 0, y: 0 }),
    },
    taps, hovers,
  };
}

test('case 14 matches the koan module contract', () => {
  assert.equal(k14.id, 14);
  assert.equal(k14.slug, 'nansen-cuts-the-cat-in-two');
  assert.ok(k14.title && k14.accent);
  for (const key of ['case', 'comment', 'verse']) {
    assert.ok(typeof k14.text[key] === 'string' && k14.text[key].length > 0, `text.${key}`);
  }
  assert.equal(typeof k14.build, 'function');
});

test('case 14 builds the courtyard, runs, and reports a finite fragment', () => {
  const ctx = stubCtx();
  const built = k14.build(ctx);
  assert.ok(built.scene && built.scene.isScene);
  assert.ok(ctx.taps.length > 0, 'the cat is tappable');

  // the staging: Nansen and the two who were arguing, two crowds, two halls,
  // one cat on one stone
  const found = {};
  built.scene.traverse((o) => { found[o.name] = (found[o.name] || 0) + 1; });
  assert.equal(found.monk, 3, 'Nansen plus the two who had been arguing');
  assert.equal(found.assembly, 2, 'the eastern and western halls, one crowd each');
  assert.equal(found.hut, 2, 'and the two halls themselves');
  assert.equal(found.cat, 1);
  assert.equal(found.courtyard, 1);

  built.setCamera(null);
  built.onEnter && built.onEnter();
  for (let i = 0; i < 120; i++) built.update(1 / 60, i / 60);
  const frag = built.fragment();
  assert.ok(Object.keys(frag).length > 0);
  for (const v of Object.values(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean',
      `fragment values stay finite: ${JSON.stringify(frag)}`);
  }
  built.onExit && built.onExit();
  built.dispose();
});

test('case 14 stages the cat ALIVE and whole — nothing in the scene cuts it', () => {
  // The one thing this case must never do. The text describes the killing; the
  // diorama holds the moment before it, when the question is still open. If a
  // later pass ever adds a blade, a severed anything, or two halves of a cat,
  // this is where it gets caught.
  const built = k14.build(stubCtx());
  const cat = built.scene.getObjectByName('cat');
  assert.ok(cat, 'there is a cat');

  const names = [];
  built.scene.traverse((o) => { if (o.name) names.push(o.name.toLowerCase()); });
  for (const grim of ['blade', 'sword', 'knife', 'blood', 'half', 'corpse']) {
    assert.ok(!names.some((n) => n.includes(grim)), `nothing named "${grim}" belongs in this scene`);
  }

  // whole: one body, one head, four legs, two ears, one tail — all still attached
  const parts = {};
  cat.traverse((o) => { parts[o.name] = (parts[o.name] || 0) + 1; });
  assert.equal(parts.body, 1);
  assert.equal(parts.head, 1);
  assert.equal(parts.leg, 4);
  assert.equal(parts.ear, 2);
  assert.equal(parts.tail, 1);

  // and it is the red seal: full accent, the only warm note in the case
  const mats = new Set();
  cat.traverse((o) => { if (o.isMesh) mats.add(o.material); });
  for (const m of mats) {
    assert.equal('#' + m.color.getHexString(), k14.accent.toLowerCase(), 'the cat carries the accent');
  }
});

test('tapping the cat stirs it — and that is the whole of it', () => {
  const ctx = stubCtx();
  const built = k14.build(ctx);
  built.setCamera(new THREE.PerspectiveCamera());
  assert.equal(built.fragment().stirs, 0);

  ctx.input.raycastFirst = () => ({ object: null, point: new THREE.Vector3() });
  ctx.taps.forEach((cb) => cb(400, 300));
  for (let i = 0; i < 60; i++) built.update(1 / 60, i / 60);

  const frag = built.fragment();
  assert.equal(frag.stirs, 1);
  assert.equal(frag.stirring, true);
  assert.ok(frag.stir > 0, 'something small is happening');

  for (let i = 0; i < 400; i++) built.update(1 / 60, (60 + i) / 60);
  assert.equal(built.fragment().stirring, false, 'and then it is over');
});

test('touching the cat answers with fur now, and with nothing sharper', () => {
  // The interaction audit reversed the case's pinned silence for the CAT ONLY:
  // a touched thing has to answer (see SILENT_BY_HISTORY in
  // tests/staging.test.js, where case 14 came off the list). The voice is cloth
  // — a brush of fur — and held soft: anything that reads as an impact is the
  // exact wrong note anywhere near this cat.
  let onTap = null;
  const cloths = [];
  const ctx = {
    audio: { cloth: (o) => cloths.push(o) },
    input: { onTap: (fn) => { onTap = fn; }, onHover() {}, raycastFirst: () => null },
  };
  const root = k14.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  root.update(1 / 60, 0);
  ctx.input.raycastFirst = (cam, objs) => (objs && objs.length
    ? { object: objs[0], point: new THREE.Vector3(1.6, 0.4, 0), distance: 1 } : null);
  onTap();
  assert.equal(cloths.length, 1, 'the touch must make a sound now');
  assert.ok(cloths[0].force <= 0.6, `a brush, not an impact — force ${cloths[0].force}`);
  assert.ok(cloths[0].at, 'placed at the touch, so the spatial bus carries it');
  assert.equal(root.fragment().stirs, 1, 'and the cat still stirs');
});
