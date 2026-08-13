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

test('the bow is bent at the waist before the first frame, not after it', () => {
  // Case 35 shipped a visible flicker from exactly this: a figure posed only
  // by the first update() renders its build pose on any first frame too short
  // to bank a whole timestep.
  const built = k36.build(fakeCtx());
  const { traveller } = figures(built);
  const waist = traveller.getObjectByName('waist');
  assert.ok(waist, "the 'bow' pose hinges the figure at the sash");
  assert.ok(waist.rotation.x > 0.3,
    `already bowing at build: ${waist.rotation.x.toFixed(3)} rad`);
  assert.ok(waist.rotation.x < 1.2, 'a bow, not folded double');

  // the staff is planted, not carried down with the torso
  const staff = traveller.getObjectByName('staff');
  assert.ok(staff, 'the traveller has his staff');
  assert.equal(staff.parent, traveller, 'the staff stays planted while he bows over it');
});

test('touching the master deepens the bow, and it settles back on its own', () => {
  const ctx = fakeCtx();
  const hit = [];
  ctx.input.raycastFirst = () => hit[0] || null;
  const built = k36.build(ctx);
  built.setCamera({});          // the tap handler ignores everything until there is one
  const { traveller } = figures(built);
  const waist = traveller.getObjectByName('waist');

  built.update(1 / 60, 0);
  const held = waist.rotation.x;

  hit[0] = { point: { x: 0, y: 1, z: 0 } };
  for (const cb of ctx._taps) cb();
  built.update(1 / 60, 1 / 60);
  assert.ok(waist.rotation.x > held + 0.2, `the bow goes deeper: ${waist.rotation.x.toFixed(3)} vs ${held.toFixed(3)}`);
  assert.equal(built.fragment().reaches, 1);

  // and eases back to the held bow — the meeting settles nothing
  for (let i = 2; i <= 60 * 6; i++) built.update(1 / 60, i / 60);
  assert.equal(built.fragment().deep, 0, 'the deepening is spent');
  assert.ok(Math.abs(waist.rotation.x - held) < 0.1,
    `back to the held bow: ${waist.rotation.x.toFixed(3)} vs ${held.toFixed(3)}`);
});
