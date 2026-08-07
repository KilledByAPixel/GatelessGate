import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k4 from '../src/koans/k4.js';
import { ACCENT, INK } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// Case 4's seal is a PAINTING of Bodhidharma on a hanging scroll — flat red on
// silk, and the beard that will not take. The portrait is one colour by design,
// but a head that is a single unbroken red egg has no face and no front, and
// reads as a shape rather than a man (Frank: "we still need to add the black
// dot to the head of the red figures in #4 and #9"). Case 9's is the kit's own
// urna, made to contrast in kit/buddha.js; this one is hand-painted, so it is
// pinned here.

const staged = () => {
  const root = k4.build(fakeCtx({ accent: k4.accent }));
  root.scene.updateMatrixWorld(true);
  return root;
};
const boxOf = (o) => new THREE.Box3().setFromObject(o);

test('the painted head carries one mark, and it is ink', () => {
  const scene = staged().scene;
  const mark = scene.getObjectByName('mark');
  assert.ok(mark, 'the portrait has a face mark');
  assert.equal('#' + mark.material.color.getHexString(), INK.toLowerCase(),
    'ink, not the paint it sits on — a red dot on a red head is a bump');
  assert.equal(mark.userData.noOutline, true, 'a hull round a mark this small is a blot');
});

test('the mark sits ON the paint: proud of the front, never out the back', () => {
  // The portrait is pressed to a third of its depth because it is paint, not a
  // man. A dot sunk into it the way the kit sinks an urna would come straight
  // out the back of the silk.
  const scene = staged().scene;
  const face = boxOf(scene.getObjectByName('face'));
  const mark = boxOf(scene.getObjectByName('mark'));
  assert.ok(mark.max.z > face.max.z, 'it must stand proud of the paint to read at all');
  assert.ok(mark.min.z > face.min.z, 'and never pierce the back of the scroll');
  assert.ok(mark.min.y > face.min.y && mark.max.y < face.max.y, 'on the head, not floating off it');

  // small: a mark, not a third eye
  const size = mark.getSize(new THREE.Vector3());
  const head = face.getSize(new THREE.Vector3());
  assert.ok(size.y / head.y < 0.25,
    `the mark is ${(100 * size.y / head.y).toFixed(0)}% of the head — a lamp, not a dot`);
});

test('the portrait is still the case\'s one red', () => {
  // The mark must not turn into a second colour story: everything else on him
  // stays the accent, which is what makes the portrait the seal.
  const scene = staged().scene;
  const painted = scene.getObjectByName('painted');
  const colors = new Set();
  painted.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && o.name !== 'beard') colors.add('#' + o.material.color.getHexString());
  });
  assert.ok(colors.has(ACCENT.toLowerCase()), 'the paint is the accent');
  assert.deepEqual([...colors].sort(), [ACCENT.toLowerCase(), INK.toLowerCase()].sort(),
    `the portrait is red plus one ink mark, got ${[...colors].join(', ')}`);
});
