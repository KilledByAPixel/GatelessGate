import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeWheel } from '../src/kit/wheel.js';
import { makeScale } from '../src/kit/scale.js';
import { makeDrum } from '../src/kit/drum.js';
import { makeRack } from '../src/kit/rack.js';
import { makeBirds } from '../src/kit/birds.js';
import { makeSnow } from '../src/kit/snowfall.js';

const run = (o, secs, t0 = 0, step = 1 / 60) => {
  for (let i = 0; i * step < secs; i++) o.update(step, t0 + i * step);
};

// ---- the wheel ---------------------------------------------------------

test('the wheel keeps turning whether or not it has a nave', () => {
  const w = makeWheel({ spokes: 8 });
  run(w, 1);
  const a1 = w.turn();
  run(w, 1, 1);
  const a2 = w.turn();
  assert.ok(Math.abs(a2 - a1) > 0.1, 'the wheel is not turning');

  w.toggle();                       // the nave comes out
  run(w, 3, 2);
  assert.equal(w.hubbed(), false);
  assert.ok(w.assembled() < 0.01, `something is still hanging on: ${w.assembled()}`);

  const b1 = w.turn();
  run(w, 1, 5);
  // hubless, and it turns exactly as it did — that is the whole case
  assert.ok(Math.abs(w.turn() - b1) > 0.1, 'the bare rim stopped turning');
  assert.ok(w.group.getObjectByName('rim').visible, 'the rim went with the spokes');
});

test('the nave and the spokes come back, and the ripple is ordered', () => {
  const w = makeWheel({ spokes: 6 });
  run(w, 0.5);
  w.toggle();
  run(w, 0.5, 0.5);        // partway through the dissolve
  const mid = w.assembled();
  assert.ok(mid > 0.01 && mid < 0.99, `the dissolve is instant, not a ripple: ${mid}`);

  run(w, 3, 1);
  w.toggle();
  run(w, 3, 4);
  assert.equal(w.hubbed(), true);
  assert.ok(w.assembled() > 0.99, `it did not fully reassemble: ${w.assembled()}`);
  assert.ok(w.pickTargets().length >= 1);
});

test('the wheel stands on the ground, not in it', () => {
  const w = makeWheel({ radius: 1.1 });
  w.update(1 / 60, 0);
  w.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(w.group);
  assert.ok(box.min.y > -0.05, `it digs in: ${box.min.y}`);
  for (const n of ['rim', 'nave', 'spoke', 'axle', 'post']) {
    assert.ok(w.group.getObjectByName(n), `${n} missing`);
  }
});

// ---- the scale ---------------------------------------------------------

test('the scale always settles back to the same reading', () => {
  const s = makeScale();
  run(s, 0.5);
  const rest = s.angle();
  s.disturb(1);
  run(s, 0.3, 0.5);
  assert.ok(Math.abs(s.angle() - rest) > 0.02, 'the nudge did nothing');
  run(s, 12, 0.8);
  assert.ok(Math.abs(s.angle() - rest) < 1e-3, `it settled somewhere else: ${s.angle()} vs ${rest}`);
  assert.ok(s.settling() < 1e-3, 'still swinging after twelve seconds');
  assert.equal(s.reading(), 3);
});

test('a second nudge mid-swing adds energy without a snap', () => {
  const s = makeScale();
  run(s, 1);
  s.disturb(1);
  run(s, 0.4, 1);
  const before = s.angle();
  s.disturb(1);                    // lands mid-swing
  const after = s.angle();
  assert.ok(Math.abs(after - before) < 1e-9, 'the new term jumped the pose');
  assert.ok(s.settling() > 0, 'no energy in the beam');
});

test('the pan hangs level however the beam tips', () => {
  const s = makeScale();
  s.disturb(2);
  run(s, 0.35);
  s.group.updateMatrixWorld(true);
  const beam = s.group.getObjectByName('beam');
  const hang = s.group.getObjectByName('hang');
  assert.ok(Math.abs(beam.rotation.z) > 0.02, 'the beam never tipped');
  assert.ok(Math.abs(beam.rotation.z + hang.rotation.z) < 1e-9, 'the pan tipped with the beam');
});

// ---- the drum ----------------------------------------------------------

test('a struck drum pulses and goes quiet', () => {
  const d = makeDrum();
  run(d, 0.5);
  assert.ok(d.ringing() < 1e-6, 'ringing before it was struck');
  d.strike();
  run(d, 0.05, 0.5);
  assert.ok(d.ringing() > 0.05, 'the strike did nothing');
  run(d, 4, 0.55);
  assert.ok(d.ringing() < 1e-3, 'a drum should not ring for four seconds');
  assert.ok(Math.abs(d.angle()) < 1e-3, 'the barrel never stopped rocking');
});

test('the drum is grounded, named, and takes a tap', () => {
  const d = makeDrum();
  d.update(1 / 60, 0);
  d.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(d.group);
  assert.ok(box.min.y > -0.05, `it digs in: ${box.min.y}`);
  for (const n of ['body', 'head', 'post', 'beam', 'sling', 'drum-hit']) {
    assert.ok(d.group.getObjectByName(n), `${n} missing`);
  }
  assert.ok(d.pickTargets().length > 0);
});

// ---- the rack ----------------------------------------------------------

test('the rack never settles: given, taken, given', () => {
  const r = makeRack({ holding: true });
  run(r, 1);
  assert.equal(r.holding(), true);
  assert.ok(r.presence() > 0.99);

  assert.equal(r.toggle(), false);        // you had one, so it is taken
  run(r, 1, 1);
  assert.equal(r.presence(), 0);
  assert.equal(r.group.getObjectByName('staff').visible, false);

  assert.equal(r.toggle(), true);         // you had none, so you are given one
  run(r, 1, 2);
  assert.ok(r.presence() > 0.99);
  assert.ok(r.pickTargets().length > 0);
});

test('a staff arrives from its foot, never floating', () => {
  const r = makeRack({ holding: false });
  run(r, 0.5);
  r.toggle();
  run(r, 0.2, 0.5);
  r.group.updateMatrixWorld(true);
  const staff = r.group.getObjectByName('staff');
  assert.ok(staff.scale.y > 0.01 && staff.scale.y < 0.99, 'the staff appeared all at once');
  const box = new THREE.Box3().setFromObject(staff);
  assert.ok(box.min.y > -0.02, `the staff grows out of the ground: ${box.min.y}`);
});

// ---- the birds ---------------------------------------------------------

test('the flock flies the same way every run', () => {
  const at = (t) => {
    const b = makeBirds({ count: 5, seed: 24 });
    run(b, t);
    return b.group.children.map((m) => [+m.position.x.toFixed(6), +m.position.y.toFixed(6), +m.position.z.toFixed(6)]);
  };
  assert.deepEqual(at(4), at(4));
  assert.notDeepEqual(at(4), at(6), 'the flock is frozen');
});

test('scattering lifts them, and they resettle', () => {
  const b = makeBirds({ count: 6, seed: 34, height: 6 });
  run(b, 2);
  const calm = b.group.children.map((m) => m.position.y);
  assert.ok(b.energy() < 1e-6);

  b.scatter();
  run(b, 0.4, 2);
  const up = b.group.children.map((m) => m.position.y);
  assert.ok(b.energy() > 0.5, 'no energy after a scatter');
  assert.ok(up.some((y, i) => y > calm[i] + 0.3), 'nothing climbed');

  run(b, 30, 2.4);
  assert.ok(b.energy() < 1e-3, `still scattered after half a minute: ${b.energy()}`);
});

test('two flocks with different seeds do not fly in formation', () => {
  const pos = (seed) => {
    const b = makeBirds({ count: 5, seed });
    run(b, 3);
    return b.group.children.map((m) => +m.position.x.toFixed(5));
  };
  assert.notDeepEqual(pos(24), pos(34));
});

// ---- the snow ----------------------------------------------------------

test('snow falls, wraps, and stays inside its own weather', () => {
  const s = makeSnow({ count: 80, seed: 41, height: 12, width: 20, depth: 20 });
  const ys = () => Array.from(s.points.geometry.attributes.position.array).filter((_, i) => i % 3 === 1);

  s.update(1 / 60, 0);
  const a = ys();
  s.update(1 / 60, 1.5);
  const b = ys();
  assert.ok(b.some((y, i) => y < a[i]), 'nothing is falling');

  // across a long stretch every flake stays in the box — the wrap must not
  // let one sink through the ground or climb out the top
  for (let t = 0; t < 400; t += 7) {
    s.update(1 / 60, t);
    const arr = s.points.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      assert.ok(arr[i + 1] >= -1e-9 && arr[i + 1] <= 12 + 1e-9, `flake outside the box: ${arr[i + 1]}`);
      assert.ok(Math.abs(arr[i]) < 20, 'drifted out of the scene');
    }
  }
  assert.equal(s.count(), 80);
});

test('the same simTime is the same weather', () => {
  const snap = () => {
    const s = makeSnow({ count: 40, seed: 41 });
    s.update(1 / 60, 9.25);
    return Array.from(s.points.geometry.attributes.position.array);
  };
  assert.deepEqual(snap(), snap());
});
