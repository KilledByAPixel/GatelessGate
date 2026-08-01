import test from 'node:test';
import assert from 'node:assert';
import * as THREE from '../lib/three.module.js';
import { makeQuadruped } from '../src/kit/quadruped.js';
import { makeDog } from '../src/kit/dog.js';
import { makeFox } from '../src/kit/fox.js';

const names = (g) => g.children.map((c) => c.name).sort();

test('legacy child names survive (species re-parent by name)', () => {
  const { group } = makeQuadruped({
    neck: { r: 0.07, len: 0.3 }, snout: { r0: 0.03, r1: 0.07, len: 0.2, fwd: 0.7, up: 0.2 },
    ears: { r: 0.09, h: 0.2, x: 0.07, up: 0.3, fwd: 0.5 },
    horns: { r: 0.05, len: 0.3, x: 0.1, up: 0.3, fwd: 0.4, sweep: 0.8 },
    hump: { r: 0.15, up: 0.15, fwd: 0.15 },
    tail: { kind: 'stiff', r0: 0.05, r1: 0.07, length: 0.5, up: 0.1, back: 0.35 },
  });
  for (const n of ['body', 'head', 'neck', 'snout', 'hump', 'tail'])
    assert.ok(names(group).includes(n), `missing child '${n}'`);
  assert.strictEqual(group.children.filter((c) => c.name === 'leg').length, 4);
  assert.strictEqual(group.children.filter((c) => c.name === 'ear').length, 2);
  assert.strictEqual(group.children.filter((c) => c.name === 'horn').length, 2);
});

test('THE LEG RULE holds with knees: every leg part reaches the ground', () => {
  const { group } = makeQuadruped({ legs: { knee: 0.35 } });
  const legParts = group.children.filter((c) => c.name === 'leg' || c.name === 'shin');
  assert.ok(legParts.length >= 4);
  const box = new THREE.Box3();
  for (const p of legParts) {
    box.setFromObject(p);
    assert.ok(box.min.y < 0.02, `leg part floats: min.y=${box.min.y}`);
  }
});

test('haunch and shoulder seat ON the barrel, not inside or above it', () => {
  const { group } = makeQuadruped({
    haunch: { r: 0.16, back: 0.28 }, shoulder: { r: 0.14, fwd: 0.28 },
  });
  const body = group.children.find((c) => c.name === 'body');
  for (const n of ['haunch', 'shoulder']) {
    const m = group.children.find((c) => c.name === n);
    assert.ok(m, `missing '${n}'`);
    assert.ok(Math.abs(m.position.y - body.position.y) < 0.25, `${n} detached from barrel line`);
  }
});

test('a knee splits the hind legs into leg + shin, and only the hind legs', () => {
  const plain = makeQuadruped({});
  assert.strictEqual(plain.group.getObjectByName('shin'), undefined,
    'no knee asked for, so no shin');

  const { group } = makeQuadruped({ legs: { knee: 0.35 } });
  const legs = group.children.filter((c) => c.name === 'leg');
  assert.strictEqual(legs.length, 4, 'still four legs at the top level');
  const shins = [];
  group.traverse((o) => { if (o.name === 'shin') shins.push(o); });
  assert.strictEqual(shins.length, 2, 'a knee is a HIND-leg joint: two shins, not four');
  // the two jointed legs are the rear pair (the animal faces +z)
  const jointed = legs.filter((l) => l.children.some((c) => c.name === 'shin'));
  assert.strictEqual(jointed.length, 2);
  for (const l of jointed) assert.ok(l.position.z < 0, 'the knee went on a FRONT leg');
  // and the joint is a real bend, not a straight leg cut in two
  for (const l of jointed) assert.ok(Math.abs(l.rotation.x) > 0.01, 'thigh is not tilted');
});

// EARS ROOT ON THE SKULL — the fix for "the ears are hanging off the side of
// its head" (Frank, on the fox and the dog both). { x, up, fwd } aim a ray
// from the head's centre; the base snaps onto the sphere's surface, sunk
// (EAR_SINK = 0.92 of the radius — deepened from 0.96 after round three:
// "still don't quite connect properly") so the whole base rim is buried,
// never gapped. Checked on the real species builds, not a synthetic option
// set, because the dog attaches ears straight to the group while the fox
// re-parents them onto a headPivot — the invariant must survive both.
test('ear bases sit on the head sphere, well sunk, for dog and fox', () => {
  const builds = [
    ['dog', makeDog({ height: 0.5 })],
    ['fox', makeFox({ height: 0.45 }).group],
  ];
  for (const [label, root] of builds) {
    root.updateMatrixWorld(true);
    const head = root.getObjectByName('head');
    const r = head.geometry.parameters.radius;
    const centre = head.getWorldPosition(new THREE.Vector3());
    const ears = [];
    root.traverse((o) => { if (o.name === 'ear' && !o.userData.isOutline) ears.push(o); });
    assert.strictEqual(ears.length, 2, `${label} has two ears`);
    for (const ear of ears) {
      // the geometry is base-hinged (root ring at the origin), so the mesh
      // origin IS the base
      const d = ear.getWorldPosition(new THREE.Vector3()).distanceTo(centre);
      assert.ok(Math.abs(d - r * 0.92) < r * 0.03,
        `${label} ear base rides the skull surface: d/r = ${(d / r).toFixed(3)}`);
    }
  }
});

// THE EAR GROWS OUT OF THE SKULL: the base ring flares wider than the ear's
// stated radius, then waists back in above it — a bare cone resting its rim
// on the surface was the "glued on" read.
test('the ear base flares wider than the ear itself', () => {
  const r = 0.09, hh = 0.2;
  const { group } = makeQuadruped({ ears: { r, h: hh, x: 0.07, up: 0.3, fwd: 0.5 } });
  const ear = group.children.find((c) => c.name === 'ear');
  const p = ear.geometry.getAttribute('position');
  // ring radii measured from the geometry itself: verts are ordered
  // base-ring first (y = 0), so bucket by height fraction
  let baseR = 0, waistR = 0;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), rr = Math.hypot(p.getX(i), p.getZ(i));
    if (y < hh * 0.05) baseR = Math.max(baseR, rr);
    else if (y < hh * 0.6) waistR = Math.max(waistR, rr);
  }
  assert.ok(baseR > r * 1.1, `base flares past r: ${baseR.toFixed(3)} vs ${r}`);
  assert.ok(waistR < baseR * 0.85, `waist pulls back in: ${waistR.toFixed(3)} vs base ${baseR.toFixed(3)}`);
});

// A LIMB, NOT A DOWEL: the plain leg spends its radii like a leg — broad
// thigh at the body, slim cannon low down, and a small flare back out at the
// foot. Measured off the geometry so a regression to a straight cylinder
// (identical ring radii) trips it.
test('legs carry the limb profile: thigh > cannon < foot', () => {
  const legR = 0.06;
  const { group } = makeQuadruped({ legR, legTaper: 1.0 });
  const leg = group.children.find((c) => c.name === 'leg');
  const p = leg.geometry.getAttribute('position');
  // hung from the top: y runs 0 (hip) down to -legTop (foot)
  let top = 0; for (let i = 0; i < p.count; i++) top = Math.min(top, p.getY(i));
  const radiusNear = (yFrac) => {
    let best = Infinity, r = 0;
    for (let i = 0; i < p.count; i++) {
      const d = Math.abs(p.getY(i) - top * yFrac);
      const rr = Math.hypot(p.getX(i), p.getZ(i));
      if (d < best - 1e-9 || (d < best + 1e-9 && rr > r)) { best = d; r = rr; }
    }
    return r;
  };
  const hip = radiusNear(0), cannon = radiusNear(0.82), foot = radiusNear(1);
  assert.ok(hip > legR * 1.15, `thigh broader than legR: ${hip.toFixed(3)}`);
  assert.ok(cannon < legR * 0.75, `cannon slims: ${cannon.toFixed(3)}`);
  assert.ok(foot > cannon * 1.1, `the foot flares back out: ${foot.toFixed(3)} vs ${cannon.toFixed(3)}`);
  // and the hind shin repeats it below the hock
  const kneed = makeQuadruped({ legR, legs: { knee: 0.35 } });
  const shin = kneed.group.getObjectByName('shin');
  const sp = shin.geometry.getAttribute('position');
  let sTop = 0; for (let i = 0; i < sp.count; i++) sTop = Math.min(sTop, sp.getY(i));
  let mid = 0, end = 0;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i), rr = Math.hypot(sp.getX(i), sp.getZ(i));
    if (Math.abs(y - sTop * 0.5) < -sTop * 0.1) mid = Math.max(mid, rr);
    if (Math.abs(y - sTop) < -sTop * 0.05) end = Math.max(end, rr);
  }
  assert.ok(mid < legR * 0.75, `shin cannon slims: ${mid.toFixed(3)}`);
  assert.ok(end > mid, 'shin foot flares back out');
});

// A HORN IS AN ARC: with `curve` set, the tip ends displaced BACK (-z) and
// UP (+y) off the base plane — a crescent, not a spike — while the legacy
// straight cone stays available (and straight) when curve is absent.
test('horns.curve bends the horn back and up; no curve stays a cone', () => {
  const opts = { r: 0.06, len: 0.5, x: 0.1, up: 0.3, fwd: 0.4, sweep: 0 };
  const straight = makeQuadruped({ horns: opts });
  const bent = makeQuadruped({ horns: { ...opts, curve: 0.5 } });
  for (const g of [straight, bent]) g.group.updateMatrixWorld(true);
  const tipOf = (group) => {
    const horn = group.children.find((c) => c.name === 'horn');
    const p = horn.geometry.getAttribute('position');
    // the tip is the vertex farthest from the base (geometry origin)
    let tip = new THREE.Vector3(), best = -1;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      if (v.length() > best) { best = v.length(); tip = v; }
    }
    return tip;
  };
  const st = tipOf(straight.group), bt = tipOf(bent.group);
  assert.ok(Math.abs(st.z) < 1e-6, 'straight cone tip stays on its own axis');
  assert.ok(bt.z < -0.15, `curved tip hooks back: z = ${bt.z.toFixed(3)}`);
  assert.ok(bt.y > 0.3, `and still stands up: y = ${bt.y.toFixed(3)}`);
  assert.ok(bt.y < st.y, 'the arc trades some reach for the hook');
});

test('the ear hinge channel (rotation.x) is left free for the species to animate', () => {
  // The base orientation must live entirely in rotation.z + rotation.y: the
  // fox's flick and the cat's swivel OVERWRITE rotation.x every frame, so any
  // placement stored there would be silently destroyed on the first update.
  const { group } = makeQuadruped({
    ears: { r: 0.09, h: 0.2, x: 0.07, up: 0.3, fwd: 0.5, tilt: 0.3 },
  });
  for (const ear of group.children.filter((c) => c.name === 'ear')) {
    assert.strictEqual(ear.rotation.x, 0, 'no placement in the hinge channel');
    assert.ok(Math.abs(ear.rotation.z) > 0.01, 'the cant lives in z');
  }
});

test('the dog dropped the chest ball; the haunch stays', () => {
  // Frank: "he has something weird hanging below his chest now, like a round
  // ball type thing" — the brisket never merged with the body line, so the
  // dog stopped asking for it. The option itself stays on the shared plan.
  const dog = makeDog({});
  assert.strictEqual(dog.getObjectByName('chest'), undefined, 'no brisket');
  assert.ok(dog.getObjectByName('haunch'), 'the rump mass is still there');
});

// NOTE — this is the brief's determinism test with ONE change, and the change is
// in the harness, not in what it asserts. Pairing a's parts to b's by
// `getObjectByName` cannot work here: several children legitimately SHARE a name
// ('leg' x4, 'seg' x6 in a strand tail, 'ear'/'horn' x2), and getObjectByName
// returns the FIRST match, so it compares hind-left's matrix against front-left's
// and fails on a perfectly deterministic build. Verified against the untouched
// file before any kit edit. Pairing by traversal position instead tests the same
// property — same options in, same transforms out — and is strictly stronger,
// since it also pins the child ORDER and the total part count.
test('deterministic: same options, identical transforms', () => {
  const a = makeQuadruped({ seed: 7, tail: { kind: 'strand', length: 0.5, thickness: 0.05, up: 0.1, back: 0.3 } });
  const b = makeQuadruped({ seed: 7, tail: { kind: 'strand', length: 0.5, thickness: 0.05, up: 0.1, back: 0.3 } });
  a.group.updateMatrixWorld(true); b.group.updateMatrixWorld(true);
  const flatten = (g) => { const out = []; g.traverse((o) => out.push(o)); return out; };
  const A = flatten(a.group), B = flatten(b.group);
  assert.strictEqual(A.length, B.length);
  for (let i = 0; i < A.length; i++) {
    assert.strictEqual(A[i].name, B[i].name);
    assert.deepStrictEqual(A[i].matrix.toArray(), B[i].matrix.toArray());
  }
});
