import { test } from 'node:test';
import assert from 'node:assert/strict';
import k36 from '../src/koans/k36.js';
import { fakeCtx as sharedCtx } from './helpers/fake-ctx.js';

// Case 36, meeting a Zen master on the road.
//
// The two of them used to WALK past each other, and the tests here pinned that:
// each figure's rotation.y against the direction he was measured to be moving,
// which was the fix for a real bug (the walk helper, since retired, assumed the
// figure fronts local +x when the body fronts +z, so both travellers went
// shoulder-first). That
// staging is gone — case 35, one page back, is already two figures walking a
// road, and two walking scenes in a row read as the same scene twice. The
// heading convention it proved still lives, tested at its source in the kit.
//
// What replaces it is a meeting held still: they stand facing each other and
// the traveller bows. So these pin the new thing — that they really do face
// each other (the old bug's whole subject, in its new form), and that the bow
// is a live angle at the waist rather than a pose baked into the geometry.

const fakeCtx = () => sharedCtx({ accent: k36.accent });

const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

function figures(built) {
  const master = built.scene.getObjectByName('master');
  const monks = [];
  built.scene.traverse((o) => { if (o.name === 'monk' || o.name === 'master') monks.push(o); });
  return { master, traveller: monks.find((m) => m !== master) };
}

test('the two of them stand still, facing each other', () => {
  const built = k36.build(fakeCtx());
  const { master, traveller } = figures(built);
  assert.ok(master && traveller, 'the master and the traveller are both on the road');

  // A figure's body fronts local +z, so rotation.y = atan2(dx, dz) of the
  // vector to the other man is exactly "looking at him". This is the same
  // convention the walking version got wrong twice; here it is the staging.
  for (const [who, a, b] of [['traveller', traveller, master], ['master', master, traveller]]) {
    const want = Math.atan2(b.position.x - a.position.x, b.position.z - a.position.z);
    assert.ok(Math.abs(wrap(a.rotation.y - want)) < 1e-6,
      `${who} faces the other man: off by ${wrap(a.rotation.y - want).toFixed(4)} rad`);
  }

  const gap = Math.hypot(
    master.position.x - traveller.position.x,
    master.position.z - traveller.position.z);
  assert.ok(gap > 1.2 && gap < 3.2, `a bowing distance apart, not a crowd or a shout: ${gap.toFixed(2)}`);

  // and nobody travels any more — this is the change, stated as a fact
  const m0 = master.position.clone(), t0 = traveller.position.clone();
  for (let i = 1; i <= 240; i++) built.update(1 / 60, i / 60);
  assert.equal(master.position.distanceTo(m0), 0, 'the master does not move at all');
  assert.equal(traveller.position.distanceTo(t0), 0, 'nor does the traveller');
});

// THE BOW IS THE READER'S, and nothing else on this page moves. He stands, and
// bows only when you reach for the master.
//
// Two earlier versions, both worth the record. It was a HELD bow first — the
// page opened on a man already bent — on the argument that a diorama should
// show the composition rather than play a gesture, and that a man who bows and
// straightens on a loop reads as a machine. True, and it meant the reader never
// saw the one thing this scene is. The second had him arrive standing and bow
// on his own a second in, which fixed the seeing and left the whole gesture
// happening whether or not anybody was there for it.
test('he is STANDING when the page opens, and the pose is set before the first frame', () => {
  // The pose is still applied at BUILD rather than by the first update(): case
  // 35 shipped a visible flicker from exactly that, a figure posed only by
  // update() showing its build pose on any first frame too short to bank a
  // whole timestep. Only which pose build applies has changed.
  const built = k36.build(fakeCtx());
  const { traveller } = figures(built);
  const waist = traveller.getObjectByName('waist');
  assert.ok(waist, "the 'bow' pose hinges the figure at the sash");
  assert.equal(waist.rotation.x, 0, `standing when the page opens: ${waist.rotation.x}`);

  // the staff is planted, not carried down with the torso
  const staff = traveller.getObjectByName('staff');
  assert.ok(staff, 'the traveller has his staff');
  assert.equal(staff.parent, traveller, 'the staff stays planted while he bows over it');
});

test('he goes on standing for as long as nobody reaches for the master', () => {
  // nothing here is on a clock but the reader
  const built = k36.build(fakeCtx());
  const { traveller } = figures(built);
  const waist = traveller.getObjectByName('waist');
  for (let i = 0; i < 60 * 30; i++) built.update(1 / 60, i / 60);
  assert.equal(waist.rotation.x, 0, 'half a minute later he has not moved');
  assert.equal(built.fragment().bowing, 0);
  assert.equal(built.fragment().reaches, 0);
});

test('reaching for the master bows him — a whole bow, and back up', () => {
  const ctx = fakeCtx();
  const hit = [];
  ctx.input.raycastFirst = () => hit[0] || null;
  const built = k36.build(ctx);
  built.setCamera({});          // the tap handler ignores everything until there is one
  const { traveller } = figures(built);
  const waist = traveller.getObjectByName('waist');

  let t = 0;
  const step = () => { built.update(1 / 60, t); t += 1 / 60; };
  for (let i = 0; i < 60; i++) step();
  assert.equal(waist.rotation.x, 0, 'standing, until asked');

  hit[0] = { point: { x: 0, y: 1, z: 0 } };
  for (const cb of ctx._taps) cb();
  assert.equal(built.fragment().reaches, 1);

  // DOWN SLOWLY, HELD, AND SLOWER STILL COMING UP — case 32's shape, which is
  // the shape every bow in this book uses. Before that it was `deep = 1` on the
  // tap frame and a linear decay: he snapped to the bottom in a single frame
  // and then took two seconds to come up, so the going-down half — the half
  // that IS the bow — never existed.
  let worstStep = 0;
  let prev = waist.rotation.x;
  let peak = 0;
  for (let i = 1; i <= 60 * 8; i++) {
    step();
    worstStep = Math.max(worstStep, Math.abs(waist.rotation.x - prev));
    peak = Math.max(peak, waist.rotation.x);
    prev = waist.rotation.x;
    if (i === 5) assert.ok(waist.rotation.x < 0.06, `nothing snaps in the first few frames (${waist.rotation.x})`);
  }
  // A RANGE, and a wide one, on purpose. BOW and BOW_BREATH are tuned by eye
  // and have moved three times; the breath is also unsynchronised with the
  // gesture, so the bottom lands anywhere in BOW +- BOW_BREATH depending on
  // where the sine is when the reader taps. Pinning a depth here would pin the
  // phase of a sine and fail on the next pass over the numbers for no reason.
  // What this checks is that he BOWS: plainly more than a nod, plainly not
  // folded double.
  assert.ok(peak > 0.25, `he goes right down (${peak.toFixed(3)} rad = ${(peak * 180 / Math.PI).toFixed(0)} deg)`);
  assert.ok(peak < 1.3, 'a bow, not folded double');
  // 0.74 degrees a frame at the steepest
  assert.ok(worstStep < 0.02, `and no frame of the way down or up is a step (${worstStep.toFixed(4)} rad)`);

  // and he comes back up, having settled nothing. The master never responds.
  assert.equal(built.fragment().bowing, 0, 'the bow is spent');
  assert.equal(waist.rotation.x, 0, 'and he is standing in the road again');
});

test('a second reach never restarts the bow he is already giving you', () => {
  // case 32's rule, and a shaped gesture needs it where a decaying number did
  // not: a tap partway down would restart the descent from wherever he had got
  // to, which is a stumble rather than a bow
  const ctx = fakeCtx();
  const hit = [{ point: { x: 0, y: 1, z: 0 } }];
  ctx.input.raycastFirst = () => hit[0];
  const built = k36.build(ctx);
  built.setCamera({});
  let t = 0;
  const step = () => { built.update(1 / 60, t); t += 1 / 60; };
  step();

  for (const cb of ctx._taps) cb();
  for (let i = 0; i < 60 * 2; i++) step();
  const midway = built.fragment().bowing;
  assert.ok(midway > 0.3 && midway < 1.001, `partway through (${midway.toFixed(2)})`);
  for (const cb of ctx._taps) cb();
  assert.equal(built.fragment().reaches, 1, 'the second reach is refused while he is still bowing');
  step();
  assert.ok(built.fragment().bowing >= midway - 0.05, 'and nothing jumped backwards');

  // once it is over he answers again
  for (let i = 0; i < 60 * 8; i++) step();
  assert.equal(built.fragment().bowing, 0);
  for (const cb of ctx._taps) cb();
  assert.equal(built.fragment().reaches, 2);
});
