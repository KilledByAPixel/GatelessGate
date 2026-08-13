import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makePole } from '../src/kit/pole.js';
import k46 from '../src/koans/k46.js';
import { ACCENT } from '../src/palette.js';
import { fakeCtx as sharedCtx } from './helpers/fake-ctx.js';
import { rigCamera as sharedRig } from './helpers/rig-camera.js';

const ACCENT_HEX = new THREE.Color(ACCENT).getHexString();

const fakeCtx = () => sharedCtx({ accent: k46.accent });

// Box of an object's own meshes.
function inkBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const b = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  return box;
}

// A camera standing exactly where the case's rig block puts it (camera.js math,
// main.js lens: fov 38).
const rigCamera = ({ aspect = 1.4, ...shot } = {}) => sharedRig(k46.camera, { aspect, ...shot });

const monksOf = (scene) => {
  const out = [];
  scene.traverse((o) => { if (o.name === 'monk') out.push(o); });
  return out;
};

// the seated figure is the only monk whose ink starts above the meadow
const sitterOf = (scene) => monksOf(scene).find((m) => inkBox(m).min.y > 6);

// ---- the kit piece --------------------------------------------------------

test('makePole stands from the ground and topY is the cap\'s upper face', () => {
  const pole = makePole({ height: 8, seed: 46 });
  const b = inkBox(pole);
  assert.ok(Math.abs(b.min.y) < 0.03, `grounded at y=0, got ${b.min.y}`);
  assert.ok(pole.topY > 8, `the cap sits ON the mast, so topY clears the nominal height: ${pole.topY}`);
  assert.ok(Math.abs(b.max.y - pole.topY) < 1e-3,
    `topY must be the highest surface of the built thing: box ${b.max.y} vs topY ${pole.topY}`);

  // the seat is wide enough for the case's seated monk (hem ~0.42 at height 1.3)
  const cap = pole.children.find((c) => c.name === 'cap');
  assert.ok(cap && cap.isMesh, 'a cap to sit on');
  assert.ok(cap.geometry.parameters.radiusTop >= 0.44,
    `the sitter's hem must land on wood, not air: cap r=${cap.geometry.parameters.radiusTop}`);

  // rigging: three lines, three stakes, one mast, one cap
  assert.equal(pole.anchors.length, 3);
  assert.equal(pole.children.length, 2 + 3 * 2);
  for (const a of pole.anchors) {
    const r = Math.hypot(a.x, a.z);
    assert.ok(r > 1.8 && r < 3.5, `guy anchors stay near the mast: ${r}`);
  }
});

test('makePole is deterministic by seed', () => {
  const a = makePole({ height: 8, seed: 46 }).anchors;
  const b = makePole({ height: 8, seed: 46 }).anchors;
  const c = makePole({ height: 8, seed: 7 }).anchors;
  assert.deepEqual(a, b, 'same seed, same rigging');
  assert.notDeepEqual(a, c, 'different seed, different rigging');
});

// ---- the module contract --------------------------------------------------

test('module shape matches the koan contract', () => {
  assert.equal(k46.id, 46);
  assert.equal(k46.slug, 'proceed-from-the-top-of-the-pole');
  assert.equal(k46.accent, ACCENT);
  assert.ok(k46.tier === 1 || k46.tier === 2);
  assert.match(k46.title, /pole/i);
  for (const f of ['case', 'comment', 'verse']) {
    assert.ok(k46.text[f] && k46.text[f].trim().length > 0, `text.${f} empty`);
  }
  assert.match(k46.text.case, /hundred-foot pole/);
  assert.ok(!k46.ambience.includes('music'), 'no drift layer on this case');
  assert.ok(Array.isArray(k46.ambience) && k46.ambience.length > 0);
  assert.equal(typeof k46.build, 'function');

  // the one vertical composition: a high orbit pivot, and a pitch window the
  // stock rig (maxPitch 38.5) could never reach
  const c = k46.camera;
  assert.ok(c.target[1] > 4 && c.target[1] < 6.5, `orbit pivot high on the mast, got ${c.target[1]}`);
  assert.ok(c.maxPitch > 38.5, 'must open the stock pitch ceiling to look down the drop');
  assert.ok(c.minPitch >= 7 && c.minPitch < c.pitch, 'and still clamp above the horizon');
  assert.ok(c.maxDist >= 16, 'the whole mast has to fit in frame when wheeled out');
  assert.ok(c.distance <= c.maxDist && c.distance >= 7);
});

// ---- the staging ----------------------------------------------------------

test('one ink sitter seated exactly on the red pole\'s cap, two grey watchers far below', () => {
  const built = k46.build(fakeCtx());
  const scene = built.scene;
  assert.ok(scene.isScene);
  for (const fn of ['update', 'dispose', 'fragment', 'setCamera']) {
    assert.equal(typeof built[fn], 'function', `root.${fn} missing`);
  }

  const pole = scene.getObjectByName('pole');
  assert.ok(pole, 'the pole stands in the scene');
  const monks = monksOf(scene);
  assert.equal(monks.length, 3, 'the sitter and the two below');

  scene.updateMatrixWorld(true);

  // THE LOAD-BEARING ASSERTION: the sitter's hem rests on the cap's surface.
  // A floating or sunken sitter ruins the whole case.
  const sitter = sitterOf(scene);
  assert.ok(sitter, 'one monk sits high on the mast');
  const seatY = inkBox(sitter).min.y;
  assert.ok(Math.abs(seatY - pole.topY) <= 0.02,
    `the sitter sits AT topY: hem ${seatY} vs topY ${pole.topY}`);
  const capTop = inkBox(pole.children.find((c) => c.name === 'cap')).max.y;
  assert.ok(Math.abs(seatY - capTop) <= 0.02,
    `and topY is honest — the cap's real upper face is ${capTop}`);

  // The red seal is the POLE ALONE — the sitter went back to ink. Every accent
  // mesh must belong to the pole; the guy lines stay grey so the red reads as
  // one unbroken line, and the man on the cap is a dark mark on top of it.
  const accentMeshes = [];
  scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.color
      && o.material.color.getHexString() === ACCENT_HEX) accentMeshes.push(o);
  });
  assert.ok(accentMeshes.length > 0, 'the seal exists');
  const owned = (m, root) => { let p = m; while (p) { if (p === root) return true; p = p.parent; } return false; };
  for (const m of accentMeshes) {
    assert.ok(owned(m, pole),
      `every accent mesh belongs to the pole, found stray "${m.name}"`);
  }
  sitter.traverse((o) => {
    if (o.isMesh && o.material && o.material.color) {
      assert.notEqual(o.material.color.getHexString(), ACCENT_HEX,
        'the sitter is ink, not accent — one red voice, and it is the pole');
    }
  });
  assert.ok(accentMeshes.some((m) => m.name === 'mast' || /pole|mast|shaft/.test(m.name) || inkBox(m).max.y > 7),
    'the pole itself carries the seal');
  const guys = [];
  pole.traverse((o) => {
    if (o.isMesh && o.material.color && /guy|stake|line/.test(o.name)) guys.push(o);
  });
  for (const g of guys) {
    assert.notEqual(g.material.color.getHexString(), ACCENT_HEX, 'guy lines stay grey hairlines');
  }
  assert.ok(inkBox(sitter).min.y > 6, 'the ink figure is the one 8 units up');

  // the watchers stay grey and stay on the ground
  for (const m of monks) {
    if (m === sitter) continue;
    const mb = inkBox(m);
    assert.ok(mb.min.y > -0.05 && mb.max.y < 3, `a watcher stands on the meadow: ${mb.min.y}..${mb.max.y}`);
    m.traverse((o) => {
      if (o.isMesh) {
        assert.notEqual(o.material.color.getHexString(), ACCENT_HEX, 'no second red figure');
      }
    });
  }

  // staging stays inside the book's plot
  for (const a of pole.anchors) {
    const wx = pole.parent.position.x + a.x, wz = pole.parent.position.z + a.z;
    assert.ok(wx > -5 && wx < 5 && wz > -6 && wz < 3, `stake inside the staging bounds: ${wx},${wz}`);
  }
});

// ---- the camera, verified numerically ------------------------------------

test('the framing holds: sitter and watchers land in NDC at the home angles', () => {
  const built = k46.build(fakeCtx());
  const scene = built.scene;
  scene.updateMatrixWorld(true);
  const sitter = sitterOf(scene);
  const sb = inkBox(sitter);
  const head = new THREE.Vector3((sb.min.x + sb.max.x) / 2, sb.max.y - 0.06, (sb.min.z + sb.max.z) / 2);
  const seat = new THREE.Vector3(head.x, sb.min.y + 0.05, head.z);
  const watchers = monksOf(scene).filter((m) => m !== sitter)
    .map((m) => new THREE.Vector3(m.position.x, 1.05, m.position.z));

  for (const aspect of [1.4, 0.7]) {
    const cam = rigCamera({ aspect });
    for (const [name, p] of [['head', head], ['seat', seat]]) {
      const v = p.clone().project(cam);
      assert.ok(Math.abs(v.x) < 0.35, `sitter ${name} rides the centre column at aspect ${aspect}: x=${v.x.toFixed(2)}`);
      assert.ok(Math.abs(v.y) < 0.92, `sitter ${name} in frame at aspect ${aspect}: y=${v.y.toFixed(2)}`);
      assert.ok(v.z > -1 && v.z < 1, 'in front of the lens');
    }
    watchers.forEach((p, i) => {
      const v = p.clone().project(cam);
      assert.ok(Math.abs(v.x) < 0.92, `watcher ${i} in frame at aspect ${aspect}: x=${v.x.toFixed(2)}`);
      assert.ok(Math.abs(v.y) < 0.92, `watcher ${i} in frame at aspect ${aspect}: y=${v.y.toFixed(2)}`);
    });
  }

  // the whole drag range keeps the subject: at the pitch ceiling the lens climbs
  // above the cap, at the ceiling it sinks almost level with him
  for (const pitch of [k46.camera.minPitch, k46.camera.pitch, k46.camera.maxPitch]) {
    const v = head.clone().project(rigCamera({ pitch, aspect: 0.7 }));
    assert.ok(Math.abs(v.y) < 0.95 && Math.abs(v.x) < 0.5,
      `sitter stays framed at pitch ${pitch}: ${v.x.toFixed(2)},${v.y.toFixed(2)}`);
  }

  // and the vertical actually reads: at home, seat above centre, pole base near
  // the bottom edge — ground and summit in one shot
  const cam = rigCamera({});
  const baseV = new THREE.Vector3(head.x, 0, head.z).project(cam);
  const headV = head.clone().project(cam);
  assert.ok(headV.y > 0.3, `the sitter rides the upper third: ${headV.y.toFixed(2)}`);
  assert.ok(baseV.y < -0.55 && baseV.y > -1.05, `the base hangs near the bottom edge: ${baseV.y.toFixed(2)}`);
});

test('clear paper behind the sitter at the home heading — no ridge, no tree', () => {
  const built = k46.build(fakeCtx());
  const scene = built.scene;
  scene.updateMatrixWorld(true);
  const sitter = sitterOf(scene);
  const sb = inkBox(sitter);
  const cx = (sb.min.x + sb.max.x) / 2, cz = (sb.min.z + sb.max.z) / 2;
  const samples = [
    new THREE.Vector3(cx, sb.min.y + 0.05, cz),
    new THREE.Vector3(cx, (sb.min.y + sb.max.y) / 2, cz),
    new THREE.Vector3(cx, sb.max.y - 0.05, cz),
    new THREE.Vector3(sb.min.x + 0.03, (sb.min.y + sb.max.y) / 2, cz),
    new THREE.Vector3(sb.max.x - 0.03, (sb.min.y + sb.max.y) / 2, cz),
  ];
  const ray = new THREE.Raycaster();
  ray.far = 300;

  for (const pitch of [k46.camera.pitch, k46.camera.minPitch]) {
    const cam = rigCamera({ pitch });
    for (const p of samples) {
      const dir = p.clone().sub(cam.position);
      const dist = dir.length();
      ray.set(cam.position, dir.normalize());
      const beyond = ray.intersectObjects(scene.children, true)
        .filter((h) => h.distance > dist + 0.6);
      for (const h of beyond) {
        assert.ok(!['mountain', 'tree', 'forest'].includes(h.object.name),
          `at pitch ${pitch} the red sits on "${h.object.name}" instead of paper`);
      }
    }
  }
});

// ---- the moment -----------------------------------------------------------

// the module raycasts the sitter's meshes first, then the pole's — answer by
// what is in the list, the way the real raycaster would. The sitter is ink
// now, so tell the lists apart by the pole's own shaft: the sitter's list is
// the one WITHOUT it.
const hitSitter = (cam, objects) => {
  if (!objects.length || objects.some((o) => o.name === 'shaft')) return null;
  return { object: objects[0] };
};
const hitPole = (cam, objects) => {
  const m = objects.find((o) => o.name === 'shaft');
  return m ? { object: m } : null;
};

test('two identical runs agree exactly — the whole moment is sim-time driven', () => {
  const script = (built, ctx) => {
    const out = [];
    let t = 0;
    for (let i = 0; i < 360; i++) {
      if (i === 45) { ctx.input.raycastFirst = hitSitter; ctx._taps.forEach((cb) => cb(1, 1)); }
      if (i === 130) { ctx.input.raycastFirst = hitPole; ctx._taps.forEach((cb) => cb(1, 1)); }
      built.update(1 / 60, t); t += 1 / 60;
      if (i % 30 === 0 || i === 46 || i === 131) out.push(JSON.stringify(built.fragment()));
    }
    return out;
  };
  const a = fakeCtx(), b = fakeCtx();
  const ba = k46.build(a), bb = k46.build(b);
  ba.setCamera(new THREE.PerspectiveCamera());
  bb.setCamera(new THREE.PerspectiveCamera());
  assert.deepEqual(script(ba, a), script(bb, b));
});

test('runs without audio or renderer and reports a finite fragment', () => {
  const built = k46.build(fakeCtx());
  built.setCamera(null);
  built.onEnter && built.onEnter();           // audio null: must not throw
  for (let i = 0; i < 120; i++) built.update(1 / 60, i / 60);
  const frag = built.fragment();
  assert.ok(Object.keys(frag).length > 0);
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} = ${v}`);
  }
  built.onExit && built.onExit();
  built.dispose();
});

// ---- the pole owns the page -----------------------------------------------
// THE SITTER USED TO BE A TARGET. Tap him and he tipped forward seven degrees,
// held at the edge of the step the koan demands, and settled back — the more
// literal reading of "proceed from the top of a hundred-foot pole", and it was
// cut on sight. Two targets on a page whose whole subject
// is ONE vertical object was one too many, and at this distance a seven-degree
// tip on a 1.3-unit figure eight units up is a couple of pixels: a thing the
// code knew about and the reader did not.
test('the sitter is no longer a target of his own — the pole is the page', () => {
  const ctx = fakeCtx();
  const built = k46.build(ctx);
  built.setCamera(new THREE.PerspectiveCamera());
  const pivot = built.scene.getObjectByName('sitter');
  const before = pivot.rotation.x;

  // A tap that lands on the MAN. The old fixtures split the probe by whether
  // the shaft was in the offered list, which worked when the case probed the
  // sitter and the pole as two separate lists; there is one list now, so this
  // aims at a mesh that genuinely belongs to his subtree.
  const sitterMeshes = [];
  pivot.traverse((o) => { if (o.isMesh) sitterMeshes.push(o); });
  assert.ok(sitterMeshes.length, 'the man is made of something');
  ctx.input.raycastFirst = (cam, objs) => {
    for (const o of objs || []) if (sitterMeshes.includes(o)) return { object: o };
    return null;
  };
  ctx._taps.forEach((cb) => cb(400, 300));
  let t = 0;
  for (let i = 0; i < 90; i++) { built.update(1 / 60, t); t += 1 / 60; }

  // he no longer has a lean of his own — but the tap is not swallowed either:
  // he is nested under the mast, so shoving the man shoves the thing he sits on
  assert.equal(pivot.rotation.x, before, 'no separate lean at the seat');
  assert.equal(built.fragment().poleTaps, 1, 'the touch reached the mast instead');
  assert.equal(built.fragment().lean, undefined, 'and the lean is gone from the record');
});

test('tap the pole: it wobbles on BOTH axes, out of step with each other', () => {
  // A separate sine per axis, at values of their own, for a wobble that is not
  // one lean scaled onto two axes. One damped sine per axis at frequencies that
  // do not divide into each other, with a quarter turn of phase between them —
  // so the tip of the mast traces an opening spiral rather than swinging in a
  // plane and back. A pole struck by a hand does not pick an axis.
  const ctx = fakeCtx();
  const built = k46.build(ctx);
  built.setCamera(new THREE.PerspectiveCamera());
  const mast = built.scene.getObjectByName('mast');
  assert.ok(mast, 'the mast group exists');
  let p = built.scene.getObjectByName('sitter');
  let inMast = false;
  while (p) { if (p === mast) inMast = true; p = p.parent; }
  assert.ok(inMast, 'the sitter is parented into the mast, so the wobble carries him');

  let t = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { built.update(1 / 60, t); t += 1 / 60; } };
  step(30);
  assert.equal(built.fragment().swayX, 0, 'no impulse yet');
  assert.equal(built.fragment().swayZ, 0);

  ctx.input.raycastFirst = hitPole;
  ctx._taps.forEach((cb) => cb(400, 300));
  assert.equal(built.fragment().poleTaps, 1);

  // walk the whole wobble and watch the two axes
  let peakX = 0;
  let peakZ = 0;
  let sameSign = 0;
  let frames = 0;
  const ratios = new Set();
  for (let i = 0; i < 60 * 3; i++) {
    step(1);
    const { swayX, swayZ } = built.fragment();
    peakX = Math.max(peakX, Math.abs(swayX));
    peakZ = Math.max(peakZ, Math.abs(swayZ));
    if (Math.abs(swayX) > 1e-4 && Math.abs(swayZ) > 1e-4) {
      frames++;
      if (Math.sign(swayX) === Math.sign(swayZ)) sameSign++;
      ratios.add((swayZ / swayX).toFixed(1));
    }
  }
  assert.ok(peakX > 0.002 && peakZ > 0.002, `both axes answer (${peakX}, ${peakZ})`);
  // THE TEST THAT MATTERS: if one envelope were merely scaled onto two axes,
  // the ratio between them would be a single constant for the whole wobble.
  assert.ok(ratios.size > 8, `the two are genuinely independent (${ratios.size} distinct ratios)`);
  assert.ok(sameSign > frames * 0.15 && sameSign < frames * 0.85,
    `and they cross zero at different times (${sameSign}/${frames} frames in step)`);

  step(180);
  assert.ok(Math.abs(built.fragment().swayX) < peakX * 0.15, 'and it dies away');
  assert.ok(Math.abs(built.fragment().swayZ) < peakZ * 0.15);
});

test('a held pointer on the pole cannot ring the bell without limit', () => {
  // CODE REVIEW CAUGHT (Task 5C): audio.bell() had no cooldown, so a held
  // pointer stacked strikes without limit. The wobble still retriggers on every
  // tap; only the BELL is capped.
  const rings = [];
  const ctx = fakeCtx();
  ctx.audio = { bell: (o) => rings.push(o) };
  const built = k46.build(ctx);
  built.setCamera(new THREE.PerspectiveCamera());
  ctx.input.raycastFirst = hitPole;

  let t = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { built.update(1 / 60, t); t += 1 / 60; } };

  ctx._taps.forEach((cb) => cb(400, 300));
  ctx._taps.forEach((cb) => cb(400, 300));
  ctx._taps.forEach((cb) => cb(400, 300));
  assert.equal(built.fragment().poleTaps, 3, 'the wobble still retriggers on every tap');
  assert.equal(rings.length, 1, 'but only one bell actually rang');

  step(40);                                  // past the 0.5s cooldown
  ctx._taps.forEach((cb) => cb(400, 300));
  assert.equal(rings.length, 2, 'a tap after the cooldown rings again');
});

test('every tap shoves it a different way, and the same page shoves it the same way twice', () => {
  // Every tap should shove it a different way rather than always at the same
  // exact angle. The whole traced figure is turned by a bearing drawn per tap,
  // rather than the two sines being re-tuned: a rotation keeps the character of
  // the wobble exactly — same frequencies, same uneven decay, same opening
  // spiral — and changes only which way the pole was pushed. Re-picking the
  // sines would make some taps a good wobble and others a flat one.
  const bearings = (built, ctx) => {
    // the tap handler ignores everything until there is a camera — without
    // this every tap is swallowed and every bearing comes back zero
    built.setCamera(new THREE.PerspectiveCamera());
    ctx.input.raycastFirst = hitPole;
    let t = 0;
    const out = [];
    for (let n = 0; n < 6; n++) {
      ctx._taps.forEach((cb) => cb(400, 300));
      let best = 0;
      let angle = 0;
      for (let i = 0; i < 60 * 4; i++) {
        built.update(1 / 60, t); t += 1 / 60;
        const { swayX, swayZ } = built.fragment();
        const r = Math.hypot(swayX, swayZ);
        if (r > best) { best = r; angle = Math.atan2(swayZ, swayX); }
      }
      out.push(+angle.toFixed(3));
    }
    return out;
  };

  const ctxA = fakeCtx();
  const a = bearings(k46.build(ctxA), ctxA);
  assert.ok(new Set(a).size >= 5, `six taps, six directions: ${a.join(' ')}`);

  // ...and SEEDED, not random: there is no Math.random outside src/audio in
  // this book, so the same page tapped the same number of times has to wobble
  // exactly the same way. It is what makes the whole thing replayable.
  const ctxB = fakeCtx();
  const b = bearings(k46.build(ctxB), ctxB);
  assert.deepEqual(a, b, 'the same page, tapped the same way, does the same thing');
});

test('a tap never starts the wobble already moving', () => {
  // The z axis had a quarter turn of phase on it — a decent way to make two
  // sines trace a circle, and it meant sin() was at its PEAK on the frame of
  // the tap: the mast jumped to eight hundredths of a radian in one frame — it
  // SNAPPED to a new position on the tap instead of starting to move. Both
  // start at zero now, and the spiral comes from the two frequencies not
  // dividing into each other.
  const ctx = fakeCtx();
  const built = k46.build(ctx);
  built.setCamera(new THREE.PerspectiveCamera());
  const mast = built.scene.getObjectByName('mast');
  let t = 0;
  const step = () => { built.update(1 / 60, t); t += 1 / 60; };
  for (let i = 0; i < 120; i++) step();

  ctx.input.raycastFirst = hitPole;
  const before = [mast.rotation.x, mast.rotation.z];
  ctx._taps.forEach((cb) => cb(400, 300));
  step();
  const jump = Math.hypot(mast.rotation.x - before[0], mast.rotation.z - before[1]);
  // a struck pole starts moving at a VELOCITY, so one frame of it is not zero —
  // but it is the frame's worth, not the whole swing
  assert.ok(jump < 0.02, `nothing snaps on the frame of the tap (${jump.toFixed(4)} rad)`);
  let peak = 0;
  for (let i = 0; i < 60 * 3; i++) { step(); peak = Math.max(peak, Math.hypot(mast.rotation.x, mast.rotation.z)); }
  assert.ok(jump < peak * 0.25, `and the first frame is a fraction of the swing (${jump.toFixed(4)} vs ${peak.toFixed(4)})`);
});

test('taps ACCUMULATE — hammering it while it moves never pops', () => {
  // THE THIRD GO AT THIS GESTURE, and the reason it is a pendulum. The first
  // was one envelope scaled onto two axes; the second was two damped sines
  // restarted from zero on every tap. Both were SHAPES, and a shape has to
  // start somewhere — so a second tap while the mast was still moving threw
  // away whatever it was doing and began again from nothing, so tapping
  // repeatedly made it pop. What it wants is an ACCELERATION applied to
  // something already in motion.
  //
  // kickPendulum touches only omega, so the rendered ANGLE is untouched at the
  // instant a tap lands and a second shove adds to the first — the way a second
  // push on a swinging thing does. Nothing here can snap because nothing here
  // is ever assigned.
  const ctx = fakeCtx();
  const built = k46.build(ctx);
  built.setCamera(new THREE.PerspectiveCamera());
  const mast = built.scene.getObjectByName('mast');
  ctx.input.raycastFirst = hitPole;

  let t = 0;
  const step = () => { built.update(1 / 60, t); t += 1 / 60; };
  for (let i = 0; i < 60; i++) step();

  let prev = [mast.rotation.x, mast.rotation.z];
  let worst = 0;
  let peak = 0;
  for (let i = 0; i < 60 * 10; i++) {
    // a tap roughly every third of a second for four seconds, straight through
    // the wobble — exactly what a reader does
    if (i < 60 * 4 && i % 21 === 0) ctx._taps.forEach((cb) => cb(400, 300));
    step();
    worst = Math.max(worst, Math.hypot(mast.rotation.x - prev[0], mast.rotation.z - prev[1]));
    peak = Math.max(peak, Math.hypot(mast.rotation.x, mast.rotation.z));
    prev = [mast.rotation.x, mast.rotation.z];
  }
  assert.ok(built.fragment().poleTaps >= 10, 'it really was hammered');
  // a single tap's worst frame is about 0.008 rad; twelve of them stacked must
  // not be worse, which is the whole claim
  assert.ok(worst < 0.02, `no frame of twelve stacked taps is a jump (${worst.toFixed(5)} rad)`);
  assert.ok(peak > 0.02, 'and it did actually move');
  // ...and it still comes to rest on its own
  for (let i = 0; i < 60 * 12; i++) step();
  assert.ok(built.fragment().sway < 1e-4, `the swing dies away (${built.fragment().sway})`);
});
