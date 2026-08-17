import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeButterflies } from '../src/kit/butterflies.js';
import { ACCENT } from '../src/palette.js';

// Two quads flapping and flying, playing around — and everything about that
// which can drift: the wing count, the flap, the wander staying inside its
// box, the flit, and the determinism the whole book runs on.

function butterflies(flock) {
  const out = [];
  flock.group.traverse((o) => { if (o.name === 'butterfly') out.push(o); });
  return out;
}

test('a butterfly is two shaped wings and nothing else, red, double-sided', () => {
  const flock = makeButterflies({ count: 6, seed: 19 });
  assert.equal(flock.group.name, 'butterflies');
  const each = butterflies(flock);
  assert.equal(each.length, 6);
  assert.equal(flock.count(), 6);

  for (const b of each) {
    const wings = b.children.filter((c) => c.name === 'butterfly-wing');
    assert.equal(wings.length, 2, 'two wings basically stuck together');
    // NOTHING ELSE IS DRAWN — no body, no antennae. The third child is the
    // invisible pick sphere, which is not paint; it is checked on its own
    // below, and it is why this counts by name rather than by isMesh.
    assert.equal(b.children.length, 3, 'two wings and the hit proxy, nothing more');
    assert.equal(b.children.filter((c) => c.isMesh && c.material.visible !== false).length, 2,
      'and only the two wings ever render');
    for (const w of wings) {
      assert.equal(w.name, 'butterfly-wing');
      assert.equal(w.material.side, THREE.DoubleSide, 'wings read from both faces');
      assert.equal('#' + w.material.color.getHexString(), ACCENT.toLowerCase(), 'red by default');
      // A SHAPED wing, not a quad: eight outline points fanned into six
      // triangles — a wing shape rather than a bow-tie — still hinged on the
      // body line so every root vertex sits at x = 0.
      const pos = w.geometry.getAttribute('position');
      assert.equal(pos.count, 18, 'eight outline points, fanned');
      let onHinge = 0, offHinge = 0;
      for (let i = 0; i < pos.count; i++) (Math.abs(pos.getX(i)) < 1e-9 ? onHinge++ : offHinge++);
      assert.ok(onHinge > 0, 'the wing is rooted on the body line');
      assert.ok(offHinge > onHinge, 'and most of it reaches out from there');
    }
    // the two wings share ONE material — six butterflies is twelve draws, one program
    assert.equal(wings[0].material, wings[1].material);
  }
});

test('every butterfly carries a pick sphere, and it rides the flight', () => {
  // land: false so every one of them is airborne for the whole run. With
  // landing on, a perched butterfly legitimately sits still, and "the handle
  // moved with it" would then fail on a butterfly that did nothing wrong.
  const flock = makeButterflies({ count: 5, seed: 11, hitRadius: 0.8, land: false });
  const targets = flock.pickTargets();
  assert.equal(targets.length, 5, 'one handle per butterfly');
  assert.notEqual(targets, flock.pickTargets(), 'handed out as a copy, not the live array');

  for (const t of targets) {
    assert.equal(t.name, 'butterfly-hit');
    // Hidden through the MATERIAL. `visible: false` on the object would make
    // the raycaster skip it and the proxy could never be picked at all, which
    // is the failure this pins: it would look identical and answer nothing.
    assert.equal(t.material.visible, false, 'never painted');
    assert.equal(t.visible, true, 'but still reachable by a ray');
    assert.equal(t.castShadow, false);
    const r = new THREE.Box3().setFromObject(t).getSize(new THREE.Vector3()).x / 2;
    assert.ok(Math.abs(r - 0.8) < 0.05, `honours hitRadius, got ${r.toFixed(3)}`);
  }

  // It is parented to the butterfly, so it must move WITH it rather than being
  // tracked separately — a second copy of the flight path is the thing this
  // arrangement exists to avoid.
  const before = targets.map((t) => t.getWorldPosition(new THREE.Vector3()).clone());
  for (let i = 0; i < 120; i++) flock.update(1 / 60, i / 60);
  const each = butterflies(flock);
  targets.forEach((t, i) => {
    const now = t.getWorldPosition(new THREE.Vector3());
    assert.ok(now.distanceTo(before[i]) > 1e-4, 'the handle went where the butterfly went');
    assert.ok(now.distanceTo(each[i].getWorldPosition(new THREE.Vector3())) < 1e-9,
      'and is still centred on it');
  });
});

test('a second scare extends the flight and never drops one out of the air', () => {
  // The startle envelope is measured from the moment of the scare, so
  // re-stamping it mid-flight restarted it at zero: one already up went from
  // wherever its envelope had got to straight back to the ground value in a
  // single frame, then climbed out again. A second tap has to CONTINUE the
  // flight, not begin a new one. Swept across the whole envelope — the drop
  // only shows on a butterfly whose scheduled round has it perched, so a
  // single sample time proves nothing.
  for (const delay of [0.5, 1.2, 2.0, 3.0, 3.9, 4.6, 5.4, 6.2]) {
    const flock = makeButterflies({ count: 8, seed: 5 });
    let t = 0;
    const run = (secs) => {
      for (let i = 0; i < Math.round(secs * 60); i++) { t += 1 / 60; flock.update(1 / 60, t); }
    };
    run(0.05);
    flock.flit();
    run(delay);

    const before = flock.lift();
    flock.flit();
    const after = flock.lift();
    after.forEach((a, i) => {
      assert.ok(a >= before[i] - 1e-9,
        `at +${delay}s butterfly ${i} fell from ${before[i].toFixed(3)} to ${a.toFixed(3)} on the second scare`);
    });

    // and the scare still DOES something: everyone is at full height shortly
    // after, however late in the envelope the second tap landed
    run(1.4);
    for (const l of flock.lift()) assert.ok(l > 0.99, `re-scared and still only ${l.toFixed(3)} up`);
  }
});

test('the wings flap — a seeded beat, wings mirrored about the body line', () => {
  const flock = makeButterflies({ count: 3, seed: 7 });
  const [b] = butterflies(flock);
  const angles = new Set();
  for (let i = 0; i < 60; i++) {
    flock.update(1 / 60, i / 60);
    const [l, r] = b.children;
    assert.ok(Math.abs(l.rotation.z + r.rotation.z) < 1e-9, 'the stroke is a mirror pair');
    angles.add(+r.rotation.z.toFixed(3));
  }
  assert.ok(angles.size > 20, `the beat sweeps through real angles, got ${angles.size}`);
  assert.ok(Math.max(...angles) > 0.8, 'the wings close toward a high V');
  assert.ok(Math.min(...angles) < 0.2, 'and spread nearly flat again');
});

// A perched butterfly still moves its wings a little — very slowly, never fully
// still. So the pause is a change of PACE, not a freeze: the wings must keep
// opening and closing, far slower and far shallower than a beat, and never sit
// still.
test('a perched butterfly keeps breathing with its wings, very slowly', () => {
  const flock = makeButterflies({ count: 1, seed: 4 });
  const [b] = butterflies(flock);
  const perched = [];
  for (let i = 0; i < 60 * 40; i++) {
    flock.update(1 / 60, i / 60);
    if (flock.lift()[0] === 0) perched.push({ i, z: b.children[1].rotation.z });
  }
  assert.ok(perched.length > 120, `it has to actually sit down, got ${perched.length} frames`);

  const zs = perched.map((s) => s.z);
  const lo = Math.min(...zs), hi = Math.max(...zs);
  assert.ok(hi - lo > 0.08, `the perched wings are frozen solid (swing ${(hi - lo).toFixed(3)})`);
  assert.ok(hi - lo < 0.6, `that is a beat, not a breath (swing ${(hi - lo).toFixed(3)})`);
  // and they are HELD UP, folded together — not spread flat like a flying one
  assert.ok(lo > 0.6, `perched wings stand folded, got a low of ${lo.toFixed(2)}`);

  // slow: no single frame may move them anywhere near a wingbeat's worth.
  // Compared only across ADJACENT frames — the samples span several separate
  // sits, and the step from the end of one to the start of the next is not a
  // frame of movement at all.
  let worst = 0;
  for (let k = 1; k < perched.length; k++) {
    if (perched[k].i !== perched[k - 1].i + 1) continue;
    worst = Math.max(worst, Math.abs(perched[k].z - perched[k - 1].z));
  }
  assert.ok(worst < 0.004, `the breath is not slow, ${worst.toFixed(4)} rad in a frame`);
});

test('they fly, they stay in their box, and they COME DOWN to the grass', () => {
  // A ROUND rather than a hover: they change height, land on the grass a while,
  // and fly away again. So the old "never lands" claim is exactly inverted —
  // what has to hold now is that they use the whole band, touch down, and never
  // sink through it.
  const flock = makeButterflies({ count: 5, seed: 19, center: [2, -1], radius: 3, height: [0.6, 2.2] });
  const each = butterflies(flock);
  let minY = Infinity, maxY = -Infinity, worstR = 0;
  const roam = each.map(() => ({ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }));
  // A minute, not thirty seconds: a perched butterfly's path clock STOPS (that
  // is the point of it), so a third of any window is time it spends covering no
  // ground at all, and the roam figures below need real flying time behind them.
  for (let i = 0; i < 60 * 60; i++) {
    flock.update(1 / 60, i / 60);
    each.forEach((b, k) => {
      minY = Math.min(minY, b.position.y);
      maxY = Math.max(maxY, b.position.y);
      worstR = Math.max(worstR, Math.hypot(b.position.x - 2, b.position.z + 1));
      const r = roam[k];
      r.minX = Math.min(r.minX, b.position.x); r.maxX = Math.max(r.maxX, b.position.x);
      r.minZ = Math.min(r.minZ, b.position.z); r.maxZ = Math.max(r.maxZ, b.position.z);
    });
  }
  assert.ok(minY > 0.05, `settles ON the grass, never through it (min y ${minY.toFixed(2)})`);
  assert.ok(minY < 0.35, `and genuinely comes down (min y ${minY.toFixed(2)})`);
  assert.ok(maxY < 2.8, `never up with the birds (max y ${maxY.toFixed(2)})`);
  // somebody is perched, and somebody is flying, at some point in the round
  const lifts = [];
  for (let i = 0; i < 60 * 30; i += 17) { flock.update(1 / 60, i / 60); lifts.push(...flock.lift()); }
  assert.ok(Math.min(...lifts) === 0, 'at least one is fully perched at some point');
  assert.ok(Math.max(...lifts) === 1, 'and at least one fully airborne');
  assert.ok(worstR <= 3 * Math.SQRT2 + 1e-6, `the wander stays near home, worst ${worstR.toFixed(2)}`);
  // and each one genuinely plays around rather than hovering at one bloom
  roam.forEach((r, k) => {
    assert.ok(r.maxX - r.minX > 1.2, `butterfly ${k} roams across x (${(r.maxX - r.minX).toFixed(2)})`);
    assert.ok(r.maxZ - r.minZ > 1.2, `and across z (${(r.maxZ - r.minZ).toFixed(2)})`);
  });
});

test('a butterfly faces the way it is drifting', () => {
  const flock = makeButterflies({ count: 1, seed: 19 });
  const [b] = butterflies(flock);
  const headings = new Set();
  for (let i = 0; i < 60 * 20; i++) {
    flock.update(1 / 60, i / 60);
    headings.add(+b.rotation.y.toFixed(1));
  }
  assert.ok(headings.size > 5, 'the heading turns as the path wanders');
});

// A STIR IS SPEED, NOT LIFT. Two earlier versions of this got it wrong in
// opposite directions: the first added `E * 0.5 * lift` to y, which cannot move
// a perched butterfly at all because lift is zero on the ground; the second
// forced lift to 1 and shot the flock up its whole flying band in a fraction of
// a second, so the flock read as being launched rather than as resuming flight.
// What a scare does now is run the path clock ahead — they cover more of the
// wander they were already on, in the direction they were already going — and
// beat about twice as fast. This is the assertion that it stays that way.
test('flit stirs them — they cover more ground and beat quicker, then settle', () => {
  const path = (stir) => {
    const flock = makeButterflies({ count: 4, seed: 19 });
    const each = butterflies(flock);
    for (let t = 0; t <= 10; t += 1 / 60) flock.update(1 / 60, t);
    const from = each.map((b) => b.position.clone());
    if (stir) flock.flit();
    let travelled = 0;
    let prev = each.map((b) => b.position.clone());
    for (let t = 10; t < 12; t += 1 / 60) {
      flock.update(1 / 60, t);
      each.forEach((b, i) => { travelled += prev[i].distanceTo(b.position); prev[i].copy(b.position); });
    }
    return { travelled, rose: each.reduce((s, b, i) => s + (b.position.y - from[i].y), 0) / each.length };
  };

  const calm = path(false);
  const stirred = path(true);
  assert.ok(stirred.travelled > calm.travelled * 1.3,
    `a stirred flock covers more ground (${calm.travelled.toFixed(2)} -> ${stirred.travelled.toFixed(2)})`);

  // and it is not a launch: the average height barely changes over the same
  // two seconds. This is the number that was 2.16 IN ONE FRAME at the worst.
  assert.ok(Math.abs(stirred.rose) < 0.9,
    `nobody is thrown into the air (mean rise ${stirred.rose.toFixed(2)})`);

  const flock = makeButterflies({ count: 4, seed: 19 });
  butterflies(flock);
  flock.update(1 / 60, 10);
  flock.flit();
  // THE ALARM HAS AN ATTACK NOW. It used to be a bare decaying exponential, and
  // exp(-0) is 1, so energy stepped 0 -> 1 on the frame the burst landed and
  // every term reading it stepped with it — birds.js had the same envelope and
  // the same `E * 2.2` climb, which teleported the flock 2.2 units into the air
  // between two frames. It comes UP over ~0.3s now.
  assert.ok(flock.energy() < 0.2, 'nothing snaps on the frame of the tap');
  for (let t = 10; t < 10.5; t += 1 / 60) flock.update(1 / 60, t);
  assert.ok(flock.energy() > 0.5, 'but it is plainly up within half a second');
  for (let t = 10.5; t < 32; t += 1 / 30) flock.update(1 / 30, t);
  assert.ok(flock.energy() < 0.05, 'and it dies away on its own');
});

// The other half of the ask: a butterfly sitting in the grass has to get UP,
// which the original flit could not do at all. On the round's own take-off
// pacing, though — the same climb it makes when it leaves a perch unprompted.
test('a scare gets a perched butterfly airborne, at take-off speed', () => {
  const flock = makeButterflies({ count: 6, seed: 19, land: true });
  const each = butterflies(flock);
  let t = 0, perched = null;
  for (; t < 40; t += 1 / 60) {
    flock.update(1 / 60, t);
    const low = each.find((n) => n.position.y < 0.4);
    if (low) { perched = low; break; }
  }
  assert.ok(perched, 'somebody is in the grass to be scared');
  const before = perched.position.y;

  flock.flit();
  let peak = before, climb = 0;
  let airborneFrames = 0;
  let prevY = perched.position.y;
  for (let i = 0; i < 60 * 5; i++, t += 1 / 60) {
    flock.update(1 / 60, t);
    peak = Math.max(peak, perched.position.y);
    // the CLIMB rate is what "fired up" would show in — the lateral speed is
    // supposed to be high, that is the whole point of the boost
    climb = Math.max(climb, Math.abs(perched.position.y - prevY));
    prevY = perched.position.y;
    if (perched.position.y > before + 0.4) airborneFrames++;
  }
  assert.ok(peak > before + 0.6, `it got right up (${before.toFixed(2)} -> ${peak.toFixed(2)})`);
  assert.ok(climb < 0.09,
    `and flew up rather than being fired up (fastest climb ${(climb * 60).toFixed(1)} u/s)`);
  // AND IT STAYS UP. It used to pop up and drop straight back, because the
  // startle envelope was timed on the boosted path clock — the faster the scare
  // made them fly, the sooner the scare wore off — up and straight back down.
  // Two seconds of flying, minimum.
  assert.ok(airborneFrames > 60 * 2,
    `and stays up a while (${(airborneFrames / 60).toFixed(1)}s airborne)`);
});

test('deterministic — same seed same flight, different seed different flight, no wall clock', () => {
  const run = (seed) => {
    const f = makeButterflies({ count: 4, seed });
    const nodes = butterflies(f);
    const out = [];
    for (let i = 0; i < 240; i++) {
      f.update(1 / 60, i / 60);
      for (const n of nodes) {
        assert.ok([n.position.x, n.position.y, n.position.z, n.rotation.y].every(Number.isFinite));
        out.push(+n.position.x.toFixed(5), +n.position.y.toFixed(5), +n.position.z.toFixed(5));
      }
    }
    return out;
  };
  assert.deepEqual(run(19), run(19));
  assert.notDeepEqual(run(19), run(20));
});

test('land: false keeps every one airborne for good — the k21 flies', () => {
  // The k21 flies never land — a settled fly with slowly breathing wings read
  // as a resting butterfly, the wrong creature over dung. With landing off,
  // lift is 1 at every instant: no perch, and no ease-dip where the round's
  // descent used to begin.
  const flock = makeButterflies({ count: 4, seed: 21, land: false });
  for (let t = 0; t <= 120; t += 0.25) {
    flock.update(0.25, t);
    for (const l of flock.lift()) assert.equal(l, 1, `airborne at t=${t}`);
  }
});
