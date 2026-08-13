import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeScreen, CLATTER } from '../src/kit/screen.js';
import { makeVeranda } from '../src/kit/veranda.js';
import TEXT from '../src/koans/text/mumonkan.js';
import k26 from '../src/koans/k26.js';

// N matches k26.js's own slats: 11 — the book's one screen, and the real
// count that ships — not makeScreen's generic default (12), which nothing in
// this file was actually pinning against before.
const H = 2.4, W = 3.0, N = 11;
const screen = (opts = {}) => makeScreen({ width: W, height: H, slats: N, seed: 26, ...opts });

// the material only — the rail and the invisible tap pane do not move, so they
// would mask the thing under test (where the bottom edge of the screen is)
const slatBox = (s) => {
  const box = new THREE.Box3();
  for (const rod of s.slats) box.expandByObject(rod);
  return box;
};

test('makeScreen hangs a run of slats from a top rail, filling the drop', () => {
  const s = screen();
  assert.equal(s.group.name, 'screen');
  assert.ok(s.group.children.some((c) => c.name === 'rail'), 'a roller at the top');
  assert.equal(s.slats.length, N);
  assert.equal(s.slats[N - 1].name, 'hem', 'the bottom bar reads as an edge');
  assert.equal(s.cords.length, 2, 'a pull cord on each side');

  const box = new THREE.Box3().setFromObject(s.group);
  assert.ok(box.min.y > -0.02, `stands on the sill: ${box.min.y}`);
  assert.ok(Math.abs(box.max.y - H) < 0.02, `the rail tops out at the drop: ${box.max.y}`);
  assert.ok(box.max.x < W * 0.6 && box.min.x > -W * 0.6, 'stays inside its bay');
});

test('setRoll(0) covers the opening, setRoll(1) leaves it open', () => {
  const s = screen();

  s.setRoll(0);
  assert.ok(s.coverHeight() > H * 0.9, `covered when down: ${s.coverHeight()}`);
  const down = slatBox(s);
  assert.ok(down.min.y < 0.05, `material reaches the sill: ${down.min.y}`);
  assert.ok(down.max.y > H * 0.85, 'and runs the whole drop');

  s.setRoll(1);
  assert.ok(s.coverHeight() < H * 0.02, `nothing left across the bay: ${s.coverHeight()}`);
  const up = slatBox(s);
  assert.ok(up.min.y > H * 0.8, `the whole screen is gathered at the rail: ${up.min.y}`);

  // and the bundle is a bundle: it thickens instead of vanishing
  const thickness = up.max.z - up.min.z;
  assert.ok(thickness > (down.max.z - down.min.z) + 0.1, `rolled into a cylinder: ${thickness}`);
});

test('the covered height shrinks from the bottom up as the screen rises', () => {
  const s = screen();
  let cover = Infinity;
  let bottom = -Infinity;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    s.setRoll(t);
    const c = s.coverHeight();
    const b = slatBox(s).min.y;
    assert.ok(c < cover, `cover shrinks at t=${t}: ${c} vs ${cover}`);
    assert.ok(b > bottom, `the bottom edge rises at t=${t}: ${b} vs ${bottom}`);
    assert.ok(Number.isFinite(c) && Number.isFinite(b));
    cover = c;
    bottom = b;
  }
});

test('update eases the roll toward its target instead of snapping', () => {
  const s = screen();
  assert.equal(s.rolled(), 0);
  assert.equal(s.isUp(), false);

  assert.equal(s.toggle(), true, 'a pull asks it up');
  assert.ok(s.isUp());
  assert.equal(s.rolled(), 0, 'but asking does not move it');

  s.update(1 / 60, 0);
  const first = s.rolled();
  assert.ok(first > 0 && first < 0.2, `one frame moves it a little: ${first}`);

  let prev = first;
  for (let i = 1; i < 60; i++) {
    s.update(1 / 60, i / 60);
    assert.ok(s.rolled() >= prev, 'and never runs backwards');
    prev = s.rolled();
  }
  assert.ok(prev > 0.6 && prev <= 1, `a second of pulling gets most of the way: ${prev}`);
  assert.ok(!s.settled(), 'still on its way after a second');

  for (let i = 60; i < 400; i++) s.update(1 / 60, i / 60);
  assert.equal(s.rolled(), 1);
  assert.ok(s.settled());
  assert.ok(s.coverHeight() < 1e-6);

  s.toggle();
  assert.equal(s.isUp(), false);
  s.update(1 / 60, 7);
  assert.ok(s.rolled() < 1 && s.rolled() > 0.8, 'it comes down the same way it went up');
  for (let i = 0; i < 400; i++) s.update(1 / 60, 7 + i / 60);
  assert.equal(s.rolled(), 0);
  assert.ok(s.coverHeight() > H * 0.9, 'and covers the bay again');
});

// ---- the clatter -----------------------------------------------------------

test('rolling clacks once per slat, quietly, placed in world space', () => {
  const clacks = [];
  const s = screen({
    onClack: (force, at) => clacks.push({ force, x: at.x, y: at.y, z: at.z }),
  });
  // off-origin, so a local-position bug (reading .position on a nested mesh
  // instead of getWorldPosition — the exact trap this branch has hit five
  // times, per CLAUDE.md) would show up as a report near (0, railY, 0)
  // instead of carrying this offset.
  s.group.position.set(2, 0.34, -1.4);

  s.toggle();
  for (let i = 0; i < 400 && !s.settled(); i++) s.update(1 / 60, i / 60);
  assert.ok(s.settled(), 'reaches the top inside 400 frames');
  assert.equal(clacks.length, N, `one clack per slat over the whole roll: ${clacks.length}`);

  for (const c of clacks) {
    assert.ok(Number.isFinite(c.force) && c.force > 0, 'a real, positive force');
    // task-swing-tune-brief.md, PROBLEM 3: CLACK_FORCE=0.12 was the QUIETEST of
    // all 21 audio.knock() call sites in the book — UNDER k28's 0.22 (the next
    // quietest), not just close to it — and it was simply inaudible: the
    // clatter fired correctly and nobody could hear it. THIS ASSERTION USED TO
    // PIN THE BUG: `c.force < 0.22` — the exact inversion of what the brief now
    // asks for, written when the instruction was "err quiet" and never
    // revisited once that erred past audible. Flipped: still a quiet texture
    // (eleven of these should read as "the screen is moving," not a drum roll —
    // see the upper bound), but no longer able to pass at a level nobody can
    // hear.
    assert.ok(c.force > 0.22, `at or under the book's next-quietest knock (k28's 0.22) — inaudible: ${c.force}`);
    // still a texture, not an event: comfortably under a typical knock's 0.9
    assert.ok(c.force < 0.6, `too loud for a texture, not a drum roll: ${c.force}`);
    assert.equal(c.force, CLATTER.force, 'onClack should report the live CLATTER.force, not a stale captured copy');
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z));
    assert.ok(Math.abs(c.x - 2) < 0.5, `x carries the group's own world offset: ${c.x}`);
    assert.ok(Math.abs(c.z - -1.4) < 0.5, `z carries the group's own world offset: ${c.z}`);
  }

  // rolling back down clatters the same run again — not stacked on top of
  // the roll that already finished, and not silent the second time either
  clacks.length = 0;
  s.toggle();
  for (let i = 0; i < 400 && !s.settled(); i++) s.update(1 / 60, 10 + i / 60);
  assert.ok(s.settled());
  assert.equal(clacks.length, N, `the same run of clicks, coming back down: ${clacks.length}`);
});

test('CLATTER.force is a live, mutable export — a harness slider reaches a roll already in progress', () => {
  // Reachable from the harness, so it can be set by ear: that means
  // dev/hanging-audition.html has to be able to write CLATTER.force = x and
  // hear the very next clack change — same pattern SPATIAL
  // (src/audio/spatial.js) already proves out for
  // bell-audition/spatial-audition. Pinned directly: change it mid-roll, on an
  // ALREADY-BUILT screen, and confirm the next clack reports the new value, not
  // whatever was captured when makeScreen() ran.
  const original = CLATTER.force;
  try {
    const clacks = [];
    const s = screen({ onClack: (force) => clacks.push(force) });
    s.toggle();
    // advance partway — a few clacks at the ORIGINAL force
    for (let i = 0; i < 40; i++) s.update(1 / 60, i / 60);
    assert.ok(clacks.length > 0, 'no clacks landed before the mutation — test cannot prove liveness');
    assert.ok(clacks.every((f) => f === original), 'clacks before the mutation should read the original value');

    CLATTER.force = 0.9;
    for (let i = 40; i < 400 && !s.settled(); i++) s.update(1 / 60, i / 60);
    const afterCount = clacks.length;
    assert.ok(afterCount > 0, 'no more clacks landed after the mutation to observe');
    assert.ok(clacks.slice(-1)[0] === 0.9, `a clack after the mutation still reported the old value: ${clacks.slice(-1)[0]}`);
  } finally {
    CLATTER.force = original;   // never leak a mutated live export into another test file
  }
});

test('the clatter follows the roll\'s own speed: dense through the early roll, thinning sharply at the settle', () => {
  // Clacks are evenly spaced in ROLL FRACTION — one per 1/N of the way onto
  // the roller — but the roll itself eases toward its target exponentially
  // (update()'s own `cur += (goal - cur) * (1 - exp(-speed*dt))`), so the
  // same 1/N step takes far more real TIME once cur is close to goal than it
  // does the instant a pull starts. That is what "the rate follows the roll's
  // speed" means operationally: measure clacks in FRAMES, not in roll
  // fraction (a value-gap measure would read as roughly constant, since the
  // boundaries themselves are evenly spaced in value — that is not the claim
  // being made).
  const frames = [];
  let i = 0;
  const s = screen({ onClack: () => frames.push(i) });
  s.toggle();
  for (i = 0; i < 400 && !s.settled(); i++) s.update(1 / 60, i / 60);
  assert.equal(frames.length, N);

  const firstGap = frames[1] - frames[0];
  const lastGap = frames[frames.length - 1] - frames[frames.length - 2];
  assert.ok(firstGap < lastGap,
    `expected the early frame gap (${firstGap}) to be tighter than the late one (${lastGap})`);
  // not just marginally — the settle should thin out sharply (a bare "less
  // than" would also pass a nearly-flat, effectively fixed-rate clatter,
  // which is not what was asked for).
  assert.ok(lastGap > firstGap * 5,
    `expected a sharp thinning toward the settle, not a gentle taper: ${firstGap} frames -> ${lastGap} frames`);
});

test('setRoll poses the screen silently; a huge dt cannot machine-gun the clatter', () => {
  const clacks = [];
  const s = screen({ onClack: (force) => clacks.push(force) });

  // a staging jump is a pose, not a roll — nothing should have "moved" to sound
  s.setRoll(1);
  assert.equal(clacks.length, 0, 'setRoll is silent going up');
  s.setRoll(0);
  assert.equal(clacks.length, 0, 'setRoll is silent going down');

  // an absurd single dt (nothing in the app ever drives update() with
  // anything but the fixed 1/60 step, but a stalled frame or a misuse
  // elsewhere should not be free to fire a whole roll's worth of knocks
  // at once)
  s.toggle();
  s.update(100, 0);
  assert.ok(s.settled(), 'the ease still reaches the goal in one giant step');
  assert.ok(clacks.length > 0, 'the giant step still clatters...');
  assert.ok(clacks.length < N, `...but is capped well under a full roll's ${N}: ${clacks.length}`);
});

test('the screen is deterministic and renderer-free', () => {
  const a = screen();
  const b = screen();
  a.roll(); b.roll();
  for (let i = 0; i < 90; i++) { a.update(1 / 60, i / 60); b.update(1 / 60, i / 60); }
  assert.ok(a.rolled() > 0 && a.rolled() < 1);
  for (let i = 0; i < a.slats.length; i++) {
    assert.ok(a.slats[i].position.distanceTo(b.slats[i].position) < 1e-12, `slat ${i} matches`);
    assert.ok(Number.isFinite(a.slats[i].position.y), 'no NaN anywhere in the run');
  }
});

test('makeVeranda is an open bay on a raised floor', () => {
  const v = makeVeranda({ width: 4.8, depth: 4.4, height: 3.3, deck: 0.34 });
  assert.equal(v.name, 'veranda');
  assert.ok(v.children.some((c) => c.name === 'beam'));
  assert.ok(v.children.some((c) => c.name === 'eave'));
  const floor = v.children.find((c) => c.name === 'floor');
  assert.ok(floor, 'a floor to sit on');
  assert.ok(v.children.some((c) => c.name === 'pier'), 'stub piers under the boards');

  const box = new THREE.Box3().setFromObject(v);
  assert.ok(box.min.y > -0.02, 'on the ground');
  assert.ok(box.max.y > 3.3, 'the eave clears the beam');
  assert.ok(box.min.z < 0.01 && box.max.z > 4.0, 'the floor runs back from the post line');

  // the grass mask has to actually cover the boards
  const marks = v.footprint();
  assert.ok(marks.length >= 16);
  for (const [x, z] of [[0, 2.2], [-2.2, 0.3], [2.2, 4.1]]) {
    assert.ok(marks.some((m) => Math.hypot(x - m.x, z - m.z) < m.r), `covers (${x}, ${z})`);
  }
});

test('makeVeranda floor is grooved planks, merged into one mesh', () => {
  const depth = 4.4;
  const v = makeVeranda({ width: 4.8, depth, height: 3.3, deck: 0.34 });
  const floors = v.children.filter((c) => c.name === 'floor');
  assert.equal(floors.length, 1, 'the whole deck is one merged mesh');

  // Y alone does not discriminate: a single flat slab is ALSO a box with
  // exactly two y-levels (its top and its bottom), so that check passes on a
  // regression that collapses every plank back into one slab just as
  // happily as it passes on real grooves — a reviewer caught this empirically
  // against a plain BoxGeometry. The real signal is Z: each plank is its own
  // box with two distinct z-edges (front and back face), and planks do not
  // touch (there's a gap), so N planks leave exactly 2N distinct z-values.
  // One slab leaves 2. Reproduce the builder's own plank-count formula (same
  // disclosed tradeoff as the post-spacing test below: this constant can
  // drift, but then so does the test that watches it) rather than hardcoding
  // an expected count.
  const PLANK_RUN = Math.max(0.30, Math.min(0.42, depth / 9));
  const plankCount = Math.max(5, Math.round(depth / PLANK_RUN));
  assert.ok(plankCount > 1, 'sanity: the formula itself should call for more than one board');

  const pos = floors[0].geometry.attributes.position;
  const zs = new Set();
  for (let i = 0; i < pos.count; i++) zs.add(Math.round(pos.getZ(i) * 1000) / 1000);
  assert.equal(zs.size, plankCount * 2, `${plankCount} planks leave ${plankCount * 2} distinct z-edges, not one slab's 2`);

  // the old (correct, but non-discriminating) y-level check still holds, kept
  // as a real property of the geometry rather than dropped
  const ys = new Set();
  for (let i = 0; i < pos.count; i++) ys.add(Math.round(pos.getY(i) * 1000) / 1000);
  assert.equal(ys.size, 2, 'every plank shares the same top and bottom height');
});

test('makeVeranda posts are regular, merged, and still carry the beam', () => {
  const width = 4.8, height = 3.3;
  const v = makeVeranda({ width, depth: 4.4, height, deck: 0.34 });
  const posts = v.children.filter((c) => c.name === 'post');
  assert.equal(posts.length, 1, 'every post merges into one mesh, same as the hut');

  // the builder's own regular-beat formula, reproduced so a tuned spacing
  // constant does not silently desync this test from the geometry
  const postCount = Math.max(2, Math.round(width / 1.7) + 1);
  assert.ok(postCount >= 3, 'this width earns more than the two corner posts');
  const xs = [];
  for (let i = 0; i < postCount; i++) xs.push(-width / 2 + (width * i) / (postCount - 1));

  const pos = posts[0].geometry.attributes.position;
  const buckets = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let nearest = xs[0], best = Infinity;
    for (const cx of xs) { const d = Math.abs(x - cx); if (d < best) { best = d; nearest = cx; } }
    assert.ok(best < 0.15, `vertex at x=${x.toFixed(3)} lands near a post centre`);
    buckets.set(nearest, (buckets.get(nearest) || 0) + 1);
  }
  assert.equal(buckets.size, postCount, `all ${postCount} posts are present, none dropped`);
  const counts = [...buckets.values()];
  assert.ok(counts.every((c) => c === counts[0]), 'every post carries the same vertex count');

  // the outer two still sit exactly at the corners of the opening — a wider
  // hall gets an extra post in the middle, not a wider gap at the ends
  assert.ok(Math.abs(xs[0] + width / 2) < 1e-6 && Math.abs(xs[xs.length - 1] - width / 2) < 1e-6);

  const box = new THREE.Box3().setFromObject(posts[0]);
  assert.ok(box.max.y > height - 0.05, 'every post reaches the beam');
});

test('makeVeranda eave sweeps and turns up at the tip, the hut\'s language', () => {
  const width = 4.8, depth = 4.4, height = 3.3;
  const v = makeVeranda({ width, depth, height, deck: 0.34 });
  const eave = v.children.find((c) => c.name === 'eave');
  assert.ok(eave, 'a merged eave mesh');

  // The tip (the LAST control point) should stand HIGHER than the low point
  // just behind it (the SECOND-LAST control point) — that is the lip. Every
  // board spans the full width (each is one un-subdivided box), so x carries
  // no information here, unlike a tapered hip roof — only z (reach) and y
  // matter. Reproduce the builder's own reach formula (same tradeoff as the
  // post-spacing test above: this constant can drift, but then so does the
  // test that watches it) to find where those two control points actually
  // land, then sample real geometry near each rather than trusting the
  // formula alone. A tight window fails here: each board's own thickness
  // smears its corners a few centimetres in z once tilted, on the same order
  // as the ~0.08 reach gap between these two points, so anything narrower
  // than ~0.05 can miss the real corners entirely (proven empirically —
  // 0.03 misses, 0.05 does not, on this width/depth).
  const OVER = 0.55 + 0.075 * width;
  const ROOT_Z = 0.12;
  const dipZ = ROOT_Z - 0.91 * OVER;      // the low point, just behind the lip
  const tipZ = ROOT_Z - 1.00 * OVER;      // the very tip
  const pos = eave.geometry.attributes.position;
  const maxYNear = (z0, r) => {
    let y = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getZ(i) - z0) < r) y = Math.max(y, pos.getY(i));
    }
    return y;
  };
  const tipY = maxYNear(tipZ, 0.05);
  const dipY = maxYNear(dipZ, 0.05);
  assert.ok(Number.isFinite(tipY) && Number.isFinite(dipY), 'both control points land on real geometry');
  assert.ok(tipY > dipY, 'the very tip turns back up above the dip just behind it');

  const box = new THREE.Box3().setFromObject(eave);
  assert.ok(box.max.y > height, 'the eave clears the posts');
  assert.ok(box.max.z - box.min.z > 0.6, 'the eave reaches well past the beam');
});

test('makeVeranda legs carry a lifted deck to the ground, at all four corners', () => {
  // `legs` is additive: without it the veranda is byte-for-byte the old one,
  // so the consumers that stand at y = 0 (cases 4, 17, 26, 28) never grow a
  // frame they don't need.
  const plain = makeVeranda({});
  assert.ok(!plain.children.some((c) => c.name === 'leg'), 'no legs unless asked');

  const width = 4.8, depth = 4.4, deck = 0.34, LEGS = 0.6;
  const v = makeVeranda({ width, depth, height: 3.3, deck, legs: LEGS });
  const legMeshes = v.children.filter((c) => c.name === 'leg');
  assert.equal(legMeshes.length, 1, 'the whole frame merges into one mesh, hut-style');
  assert.equal(legMeshes[0].children.length, 0, 'no child meshes to draw separately');

  const box = new THREE.Box3().setFromObject(legMeshes[0]);
  assert.ok(box.min.y < -(LEGS + 0.25), `the frame sinks past the ground line: ${box.min.y}`);
  assert.ok(box.max.y < deck, 'and stays tucked under the boards');

  // Four legs, one per corner — the kit-props hut-post pattern: bucket the
  // merged mesh's DEEP vertices (below the ground line, where only the legs
  // reach; the skirt rail stops above it) by plan quadrant. All four buckets
  // must exist, carry an equal share, and reach the bottom — a merge that
  // silently dropped a corner fails every way at once.
  const pos = legMeshes[0].geometry.attributes.position;
  const quads = new Map();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > -(LEGS + 0.02)) continue;
    const key = `${Math.sign(pos.getX(i))},${Math.sign(pos.getZ(i) - depth / 2)}`;
    const q = quads.get(key) || { n: 0, minY: Infinity };
    q.n++;
    q.minY = Math.min(q.minY, y);
    quads.set(key, q);
  }
  assert.deepEqual([...quads.keys()].sort(), ['-1,-1', '-1,1', '1,-1', '1,1'],
    `a leg in each corner, got ${[...quads.keys()].sort()}`);
  const counts = [...quads.values()].map((q) => q.n);
  assert.ok(counts.every((c) => c === counts[0]), 'every corner carries its share of the merge');
  for (const [key, q] of quads) {
    assert.ok(q.minY < -(LEGS + 0.25), `corner ${key} reaches past the ground: ${q.minY}`);
  }

  // ...and a skirting rail ties them just above the ground line, running the
  // full plan in both axes — legs alone read as four loose sticks.
  let skMaxX = -Infinity, skMinZ = Infinity, skMaxZ = -Infinity, skirtVerts = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -(LEGS + 0.02) || y > -LEGS + 0.25) continue;
    skirtVerts++;
    skMaxX = Math.max(skMaxX, Math.abs(pos.getX(i)));
    skMinZ = Math.min(skMinZ, pos.getZ(i));
    skMaxZ = Math.max(skMaxZ, pos.getZ(i));
  }
  assert.ok(skirtVerts > 0, 'a skirt exists');
  assert.ok(skMaxX > width / 2 - 0.6, `the skirt spans the width: ${skMaxX}`);
  assert.ok(skMinZ < 0.6 && skMaxZ > depth - 0.6, `and the depth: ${skMinZ}..${skMaxZ}`);
});

// ---- the case itself ------------------------------------------------------

function stubCtx({ hit = false } = {}) {
  const taps = [];
  return {
    audio: null,
    input: {
      onTap: (fn) => taps.push(fn),
      onHover: () => {},
      raycastFirst: () => (hit ? { point: new THREE.Vector3() } : null),
      clear: () => { taps.length = 0; },
    },
    taps,
  };
}

test('case 26 builds, runs, and leaves the screen down until it is pulled', () => {
  assert.equal(k26.id, 26);
  assert.equal(k26.slug, 'two-monks-roll-up-the-screen');
  assert.equal(k26.text.case, TEXT[26].case, 'prose comes from the book, not the case file');

  const ctx = stubCtx();
  const built = k26.build(ctx);
  assert.ok(built.scene && built.scene.isScene);
  assert.ok(ctx.taps.length > 0, 'there is something to find');

  built.setCamera(null);
  built.onEnter && built.onEnter();
  for (let i = 0; i < 120; i++) built.update(1 / 60, i / 60);
  const frag = built.fragment();
  for (const v of Object.values(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment stays finite: ${JSON.stringify(frag)}`);
  }
  assert.equal(frag.up, false);
  assert.equal(frag.pulls, 0);
  assert.ok(frag.cover > 2.0, 'the bay is still shut');
  built.onExit && built.onExit();
  built.dispose();
});

test('tapping the screen rolls it up and opens the bay', () => {
  const ctx = stubCtx({ hit: true });
  const built = k26.build(ctx);
  built.setCamera({});                 // any camera will do; the raycast is stubbed
  ctx.taps[0]();
  for (let i = 0; i < 300; i++) built.update(1 / 60, i / 60);

  let frag = built.fragment();
  assert.equal(frag.up, true);
  assert.equal(frag.pulls, 1);
  assert.ok(frag.cover < 0.01, `nothing left across the opening: ${frag.cover}`);
  assert.equal(frag.roll, 1);

  ctx.taps[0]();                       // and down again
  for (let i = 0; i < 300; i++) built.update(1 / 60, 5 + i / 60);
  frag = built.fragment();
  assert.equal(frag.up, false);
  assert.equal(frag.pulls, 2);
  assert.ok(frag.cover > 2.0, 'the screen comes back down');
});

test('a fixed screen is held by something, and stays put', () => {
  // Case 25's dream hall is an open deck with no wall behind it, so a sudare's
  // roller and pull cords hung in daylight holding nothing up. Fixed keeps the
  // slats and gives them a frame.
  const w = makeScreen({ width: 3.0, height: 2.3, slats: 11, seed: 25, fixed: true });
  const named = (n) => { const out = []; w.group.traverse((o) => { if (o.name === n) out.push(o); }); return out; };

  assert.equal(named('cord').length, 0, 'no pull cords — there is nothing to pull');
  assert.equal(w.cords.length, 0);
  assert.equal(named('stile').length, 2, 'a stile down each end');
  // ...unless the bay already has posts of its own doing that job
  const framed = makeScreen({ width: 3.0, height: 2.3, slats: 11, fixed: true, stiles: false });
  const stilesOf = (w) => { let n = 0; w.group.traverse((o) => { if (o.name === 'stile') n++; }); return n; };
  const sillsOf = (w) => { let n = 0; w.group.traverse((o) => { if (o.name === 'sill') n++; }); return n; };
  assert.equal(stilesOf(framed), 0, "no stiles inside somebody else's posts");
  assert.equal(sillsOf(framed), 1, 'the sill stays either way — it lands the bottom slat');
  assert.equal(named('sill').length, 1, 'and a sill under it, so the bottom is landed');
  assert.ok(named('slat').length + named('hem').length >= 11, 'the slats are still the screen');

  // the frame spans the whole opening, or it is decoration rather than structure
  for (const st of named('stile')) {
    const b = new THREE.Box3().setFromObject(st);
    assert.ok(b.min.y < 0.1 && b.max.y > 2.2, `a stile runs the height: ${b.min.y}..${b.max.y}`);
  }

  // and it does not roll, whatever it is asked
  assert.equal(w.fixed, true);
  assert.equal(w.roll(), 0);
  assert.equal(w.toggle(), false);
  assert.equal(w.setRoll(1), 0);
  w.update(1 / 60, 1);
  assert.equal(w.rolled(), 0, 'a fixed screen is down and staying down');

  // the hanging kind is untouched
  const hanging = makeScreen({ width: 3.0, height: 2.3, slats: 11, seed: 25 });
  assert.equal(hanging.cords.length, 2);
  assert.equal(hanging.fixed, false);
  assert.equal(hanging.roll(), 1);
});
