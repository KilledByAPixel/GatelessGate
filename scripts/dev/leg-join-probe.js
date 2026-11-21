#!/usr/bin/env node
// Where a quadruped's legs leave its trunk (tests/helpers/leg-join.js, held
// by tests/leg-join.test.js), every leg, both sides:
//
// THE CLIMB: how far the join line rises up the back of each leg over where
// it lies on the outer side, x 1e3 height (the thigh standing bare up the
// back of the haunch).
//
// THE TAB: how much of each leg's surface stands OUTSIDE the trunk while
// facing up (a lit plate or tab under the flank: the thigh's top showing
// below the haunch, the forearm's top showing as a notch at the elbow), and
// how much faces down there (a dark shelf), in a band just under the trunk's
// own underside, x 1e4 / height^2.
//
// THE LIP: how far the trunk stands proud of the leg's own surface just
// above the line where the leg goes into it — the dark band of a trunk's
// underside overhanging the top of the leg — x 1e3 height, with its slope
// (proud / DELTA), by the face of the leg it is over.
//
//   node scripts/dev/leg-join-probe.js [dog fox horse buffalo]
import { restAnimals } from '../../tests/helpers/mirror.js';
import { legJoins, legExposure, legClimb, DELTA } from '../../tests/helpers/leg-join.js';

const only = process.argv.slice(2);
const name = (j) => `${j.front ? 'front' : 'hind '} ${j.side}`;
for (const a of await restAnimals()) {
  if (!['dog', 'fox', 'horse', 'buffalo'].includes(a.key)) continue;
  if (only.length && !only.includes(a.key)) continue;
  const root = a.build();
  console.log(`
== ${a.key}`);
  for (const e of legExposure(root)) {
    console.log(`  ${name(e)}  tab: exposed up-facing ${e.up.toFixed(2).padStart(6)}  (steepest ny ${e.upWorst.toFixed(2)})   down-facing ${e.down.toFixed(2).padStart(6)}`);
  }
  for (const e of legClimb(root)) {
    const w = e.at ? `  at (${e.at.x.toFixed(3)}, ${e.at.y.toFixed(3)}, ${e.at.z.toFixed(3)})` : '';
    console.log(`  ${name(e)}  climb: the join rises up the leg's back ${(e.climb * 1e3).toFixed(1).padStart(6)}e-3 h over its outer face${w}`);
  }
  console.log(`  lip, ${DELTA} h above the crossing (proud x 1e3 h, slope = proud / delta):`);
  for (const j of legJoins(root)) {
    const f = (r) => `${(r.worst * 1e3).toFixed(1).padStart(5)} (${r.slope.toFixed(2)}, ${String(r.count).padStart(2)} pts)`;
    const w = j.outer.at ? `  outer worst at (${j.outer.at.x.toFixed(3)}, ${j.outer.at.y.toFixed(3)}, ${j.outer.at.z.toFixed(3)})` : '';
    console.log(`  ${name(j)}  outer ${f(j.outer)}  ahead ${f(j.ahead)}  behind ${f(j.behind)}${w}`);
  }
}
