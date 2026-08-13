import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k4 from '../src/koans/k4.js';
import { ACCENT, INK_LIT } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// Case 4's seal is a PAINTING of Bodhidharma on a hanging scroll — flat red on
// silk, and the beard that will not take.
//
// This file used to pin an ink dot on the portrait's head, added because a head
// that is one unbroken red egg was thought to read as a shape rather than a man.
// Judged by eye against the finished scene, the dot lost: the portrait reads
// better as flat unbroken paint, because it is a picture of a man rather than a
// man. So what is pinned now is the OPPOSITE — that the painted figure is one
// colour all the way through, with no second colour anywhere on it.
//
// The mark is still built in k4.js and one commented line from being added back.
// If it returns, the three assertions that were here are worth restoring: that
// it is INK and not the paint it sits on, that it stands proud of the face's
// front but never pierces the back of the silk, and that it is under a quarter
// of the head's height — a dot, not a lamp.

const staged = () => {
  const root = k4.build(fakeCtx({ accent: k4.accent }));
  root.scene.updateMatrixWorld(true);
  return root;
};

test('the painted portrait carries no face mark', () => {
  const scene = staged().scene;
  assert.equal(scene.getObjectByName('mark'), undefined,
    'the dot is out by decision — if it is back, restore the assertions in this file');
});

test('the portrait is the case\'s one red, and nothing else', () => {
  // The whole painted figure is a single flat colour. The beard is excluded
  // because it is ink that fades up from fully transparent as the case is
  // touched — it is the interaction, not part of the painting at rest.
  const scene = staged().scene;
  const painted = scene.getObjectByName('painted');
  const colors = new Set();
  painted.traverse((o) => {
    if (o.isMesh && o.name !== 'beard') colors.add('#' + o.material.color.getHexString());
  });
  assert.deepEqual([...colors], [ACCENT.toLowerCase()],
    `the portrait is flat accent throughout, got ${[...colors].join(', ')}`);
});

test('the beard is RED, and starts invisible', () => {
  // Wakuan's complaint is that the fellow has no beard. The scene agrees with
  // him at rest: the beard exists, at zero opacity.
  //
  // RED, not ink. The portrait drains to ink under it over the same envelope, so
  // while the beard is up it is the only warm mark on the page — a black figure
  // wearing the one thing it is famous for not having (Frank: "the beard will
  // appear and be red, so it will stand out").
  const scene = staged().scene;
  const beard = scene.getObjectByName('beard');
  assert.ok(beard, 'the beard is built even though it cannot be seen');
  assert.equal('#' + beard.material.color.getHexString(), ACCENT.toLowerCase(),
    'the beard carries the red while the portrait gives it up');
  assert.equal(beard.material.opacity, 0, 'and the portrait is beardless until touched');
});
