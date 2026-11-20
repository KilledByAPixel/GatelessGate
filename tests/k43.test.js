import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k43 from '../src/koans/k43.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// Shuzan holds the staff out at arm's length, and the arm is the part a
// rebuilt figure can quietly break: the case levels one of his arms by hand
// and hangs the staff off its far end.
function staffArm(scene) {
  scene.updateMatrixWorld(true);
  const hold = scene.getObjectByName('hold');
  assert.ok(hold, 'the staff has a hand to be held in');
  const arm = hold.parent;
  assert.equal(arm.name, 'arm', 'and the hand is on an arm');
  return { arm, hold, staff: hold.getObjectByName('staff') };
}

test('the arm that holds the staff out is a lifted arm, not a hanging one turned level', () => {
  const { scene } = k43.build(fakeCtx({ accent: k43.accent }));
  const { arm } = staffArm(scene);
  const shoulder = arm.getWorldPosition(new THREE.Vector3());
  const hand = arm.localToWorld(arm.userData.hand.clone());
  const elbow = arm.localToWorld(arm.userData.elbow.clone());

  // level: the hand is out in front of the shoulder, not above or below it
  const reach = hand.clone().sub(shoulder);
  assert.ok(Math.abs(reach.y) < 0.15 * reach.length(), `held level: ${reach.y} over ${reach.length()}`);

  // THE ELBOW HANGS. Where the elbow stands off the shoulder-to-hand line is
  // the whole difference between the two kinds of arm: lifted, it drops below
  // the line; a resting arm swung up carries its bend out sideways.
  const along = reach.clone().normalize();
  const off = elbow.clone().sub(shoulder);
  off.addScaledVector(along, -off.dot(along));
  assert.ok(off.length() > 0.02, 'the arm bends at all');
  assert.ok(-off.y > 0.8 * off.length(),
    `the elbow drops below the line rather than out to the side: ${off.toArray().map((v) => v.toFixed(3))}`);
});

test('the staff is in his hand and leaves it level', () => {
  const { scene } = k43.build(fakeCtx({ accent: k43.accent }));
  const { arm, hold, staff } = staffArm(scene);
  const hand = arm.localToWorld(arm.userData.hand.clone());
  const grip = hold.getWorldPosition(new THREE.Vector3());
  assert.ok(grip.distanceTo(hand) < 0.03, `the grip sits in the cuff: ${grip.distanceTo(hand)}`);

  // out in front along the same line the arm reaches on, and level with it
  const shoulder = arm.getWorldPosition(new THREE.Vector3());
  const reach = hand.clone().sub(shoulder).normalize();
  const out = staff.getWorldPosition(new THREE.Vector3()).sub(grip).normalize();
  assert.ok(out.dot(reach) > 0.99, `the staff continues the reach: ${out.dot(reach)}`);
  assert.ok(Math.abs(out.y) < 0.15, `and is held level: ${out.y}`);
});
