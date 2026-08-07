// Where the hub's scatter trees actually stand, per scene. The afterword seats
// its Buddha under one of them and derives which at build time; this is how you
// check that derivation by hand after touching a seed.
//
// (The preface used to be the third scene here. It stopped rendering the hub —
// it stages its own forked-road diorama now — so only the two true hub scenes
// remain.)
//
//   node scripts/dev/hub-trees.js
import { buildHub } from '../../src/intro.js';
import AFTERWORD from '../../src/koans/matter/afterword.js';

const show = (name, built) => {
  const trees = built.trees.map((t) => `(${t.position.x.toFixed(2)}, ${t.position.z.toFixed(2)})`);
  console.log(`\n${name}`);
  console.log('  gate spot', built.gateTarget.map((v) => +v.toFixed(2)).join(', '));
  console.log('  trees    ', trees.join('  '));
};

show('title screen / contents', buildHub());

const after = AFTERWORD.build();
show('afterword', after);
const seat = after.scene.children.find((c) => c.name === 'mat');
const near = after.trees
  .map((t) => Math.hypot(t.position.x - seat.position.x, t.position.z - seat.position.z))
  .sort((a, b) => a - b)[0];
console.log('  mat      ', `(${seat.position.x.toFixed(2)}, ${seat.position.z.toFixed(2)})`,
  `— ${near.toFixed(2)} from the nearest trunk`);
