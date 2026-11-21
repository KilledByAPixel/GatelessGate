import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restAnimals } from './helpers/mirror.js';
import { legJoins, legExposure, legClimb } from './helpers/leg-join.js';

// WHERE A LEG GOES INTO THE TRUNK, the two surfaces meet: neither stands out
// over the other (tests/helpers/leg-join.js for both measures, and
// src/kit/quadruped.js, THE LEG'S OUTER SIDE RUNS INTO THE CHEST'S SIDE
// CORNER, for the fix).
//
// THE LIP: the trunk's lower side corner hung out past the top of every
// keeled animal's legs, and the turned-under faces between it and the leg
// read as a thin dark line from the front of the foreleg down and back to
// the belly, with the leg's face stepping in under it — on both sides of
// the dog, the horse, the fox and the buffalo, and over the front of the
// thigh behind. It stood a fiftieth of the animal's height proud of the
// leg's outer face, at better than one in one; laid on the corner, the leg
// leaves it under a two-hundredth. The buffalo's broad, barrelled chest
// still turns a little over his foreleg, and his haunch over his thigh,
// at about the slope of a soft crease, which these bounds allow.
//
// THE TAB is what a trunk drawn back off the leg gave instead (the leg's
// top a lit plate standing out of the chest): it must not come back.
//
// THE CLIMB is a third: the hind thigh's back corner left high under the
// buttock, where the rump is already closing, stood the leg's back-outer
// face bare up the back of the haunch, a lit blade from the gaskin to the
// buttock with paper between it and the tail — from low behind and beside,
// a wedge jutting out of the belly into the thigh. It rose 0.14–0.2 of the
// animal's height up the leg's back over the outer side; the back of the
// thigh now leaves the haunch at its hem, and what is left is mostly the
// hem's own rise toward the buttock. The fox's rump end is narrower than
// its gaskin and its leg hangs right under it, so its back corner cannot
// reach the hem there (src/kit/quadruped.js, THE BACK OF THE THIGH LEAVES
// THE HAUNCH AT ITS HEM) and its bound is its own.
const LIP = { front: 0.01, hind: 0.016 };
const TAB = { front: 0.5, hind: 3 };
const CLIMB = { dog: 0.07, horse: 0.02, buffalo: 0.07, fox: 0.14 };
const KEYED = ['dog', 'fox', 'horse', 'buffalo'];
const ANIMALS = (await restAnimals()).filter((a) => KEYED.includes(a.key));

for (const a of ANIMALS) {
  test(`${a.key}: no leg goes in under a lip of the trunk, either side`, () => {
    const joins = legJoins(a.build());
    assert.equal(joins.length, 4);
    for (const j of joins) {
      const where = `${a.key} ${j.front ? 'front' : 'hind'} leg ${j.side}`;
      assert.ok(j.outer.count >= 10, `${where}: only ${j.outer.count} points on the join measured`);
      const max = LIP[j.front ? 'front' : 'hind'];
      assert.ok(j.outer.worst < max, `${where}: the trunk stands ${(j.outer.worst * 1e3).toFixed(1)}e-3 x height proud of the leg's outer face just above the join (bound ${max * 1e3}e-3), at (${j.outer.at && j.outer.at.toArray().map((v) => v.toFixed(3))})`);
    }
  });

  test(`${a.key}: the hind leg leaves the haunch at its hem, not bare up its back, either side`, () => {
    const hind = legClimb(a.build()).filter((e) => !e.front);
    assert.equal(hind.length, 2);
    for (const e of hind) {
      assert.ok(Number.isFinite(e.climb), `${a.key} hind leg ${e.side}: no join found on its outer face or its back`);
      assert.ok(e.climb < CLIMB[a.key], `${a.key} hind leg ${e.side}: the join rises ${(e.climb * 1e3).toFixed(1)}e-3 x height up the leg's back over its outer face (bound ${CLIMB[a.key] * 1e3}e-3), at (${e.at && e.at.toArray().map((v) => v.toFixed(3))})`);
    }
  });

  test(`${a.key}: no leg's top stands out of the trunk as a tab, either side`, () => {
    for (const e of legExposure(a.build())) {
      const max = TAB[e.front ? 'front' : 'hind'];
      assert.ok(e.up < max, `${a.key} ${e.front ? 'front' : 'hind'} leg ${e.side}: ${e.up.toFixed(2)} of the leg's up-facing surface stands outside the trunk at the join (bound ${max})`);
    }
  });
}
