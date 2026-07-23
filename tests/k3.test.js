import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k3 from '../src/koans/k3.js';
import { makeRaisedFinger } from '../src/kit/finger.js';
import { ACCENT } from '../src/palette.js';
import { slugify } from '../src/koans/index.js';
import TEXT from '../src/koans/text/mumonkan.js';

const ACCENT_HEX = new THREE.Color(ACCENT).getHexString();

function fakeCtx() {
  const taps = [], hovers = [];
  return {
    audio: null,
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,
      pointer: () => ({ x: 0, y: 0 }),
    },
    _taps: taps, _hovers: hovers,
  };
}

// every mesh actually painted in the accent — outline shells carry a
// ShaderMaterial with no .color, so they never count
function accentMeshes(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    const c = o.material && o.material.color;
    if (c && c.getHexString() === ACCENT_HEX) out.push(o);
  });
  return out;
}

function monks(scene) {
  const out = [];
  scene.traverse((o) => { if (o.name === 'monk') out.push(o); });
  return out;
}

const shoulderY = (monk) => monk.children.find((c) => c.name === 'arm').position.y;

// Gutei is the figure holding the finger; the boy is the bare-headed one whose
// raised hand is empty (a novice travels without a hat, and it is the only
// hatless figure in the yard, so it identifies him without coupling to a prop).
const guteiOf = (scene) => monks(scene).find((m) => m.children.some((c) => c.name === 'finger'));
const boyOf = (scene) => monks(scene).find((m) => !m.children.some((c) => c.name === 'hat'));

// world-space top of a monk's raised sleeve, for asserting the empty hand reads
// as held UP even though nothing is on it
function raisedHemY(monk) {
  monk.updateMatrixWorld(true);
  let top = -Infinity;
  for (const c of monk.children) {
    if (c.name !== 'arm') continue;
    const geo = c.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const tip = new THREE.Vector3(0, geo.boundingBox.min.y, 0).applyMatrix4(c.matrixWorld);
    top = Math.max(top, tip.y);
  }
  return top;
}

test('makeRaisedFinger is one mesh, the size it says it is, standing on its base', () => {
  const f = makeRaisedFinger({ length: 0.16, radius: 0.026 });
  assert.equal(f.name, 'finger');
  assert.ok(f.isMesh, 'a single mesh');
  // ONE mesh matters: the two-seal count in the scene below is only meaningful
  // while a finger cannot quietly become a shaft plus a capping sphere
  assert.equal(f.children.length, 0, 'a finger is not assembled from parts');

  const box = new THREE.Box3().setFromObject(f);
  assert.ok(Math.abs(box.min.y) < 1e-6, `hinged at its base: ${box.min.y}`);
  assert.ok(Math.abs(box.max.y - 0.16) < 1e-4, `full length: ${box.max.y}`);
  const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  assert.ok(width > 0.026 * 1.6 && width <= 0.026 * 2 + 1e-6, `about two radii across: ${width}`);
  // a finger, not a bead: much fatter than this and the seal stops reading
  assert.ok(box.max.y > width * 2.8, `slim: ${(box.max.y / width).toFixed(2)}:1`);

  for (const attr of ['position', 'normal']) {
    const a = f.geometry.attributes[attr].array;
    for (let i = 0; i < a.length; i++) assert.ok(Number.isFinite(a[i]), `finite ${attr}`);
  }
});

test('module shape matches the koan contract', () => {
  assert.equal(k3.id, 3);
  assert.equal(k3.slug, 'gutei-s-finger');
  assert.equal(k3.slug, slugify(TEXT[3].title), 'slug must match the one the index derives');
  assert.equal(k3.accent, ACCENT);
  assert.ok(k3.tier === 1 || k3.tier === 2);
  for (const f of ['case', 'comment', 'verse']) {
    assert.equal(k3.text[f], TEXT[3][f], `text.${f} comes from the book, not the case file`);
  }
  assert.equal(typeof k3.build, 'function');
  assert.equal(k3.camera.target.length, 3);
  assert.ok(k3.camera.distance < 11.5, 'closer than the default — the subject is two small marks');
});

// THE ASSERTION THIS CASE LIVES OR DIES BY.
//
// Exactly one red finger — Gutei's — and the boy raises an EMPTY hand beside
// it: the same gesture, one with the finger and one without, which is the whole
// arc of the case (imitation, then the finger gone, then the opening). If a
// second finger ever reappears on the boy, or the one seal slides down to a
// hand at a hip, the diorama has started telling a different story.
test('the yard carries one red finger, and the boy raises an empty hand', () => {
  const root = k3.build(fakeCtx());
  const seals = accentMeshes(root.scene);
  assert.equal(seals.length, 1, `exactly one red seal, got ${seals.length}`);

  const seal = seals[0];
  assert.equal(seal.name, 'finger');
  const gutei = seal.parent;
  assert.equal(gutei.name, 'monk', 'a finger belongs to a figure');
  assert.ok(seal.position.y > shoulderY(gutei), 'raised, not hanging');
  const gHead = gutei.children.find((c) => c.name === 'head');
  assert.ok(new THREE.Box3().setFromObject(seal).max.y > gHead.position.y, 'tops the head');

  // the boy: bare-headed, no finger, but his hand is plainly held UP
  const boy = boyOf(root.scene);
  assert.ok(boy, 'the boy is in the yard');
  assert.ok(!boy.children.some((c) => c.name === 'finger'), 'the boy has no finger — it is gone');
  boy.updateMatrixWorld(true);
  const boyHeadY = boy.children.find((c) => c.name === 'head').getWorldPosition(new THREE.Vector3()).y;
  assert.ok(raisedHemY(boy) > boyHeadY, 'the empty hand still reads as raised above his head');

  // a boy beside a master, not two adults
  const bodyTop = (m) => new THREE.Box3().setFromObject(m.children.find((c) => c.name === 'body')).max.y;
  assert.ok(bodyTop(boy) < bodyTop(gutei) * 0.75, 'the boy is markedly the smaller figure');
});

test('the staging keeps the two figures apart and inside the meadow', () => {
  const root = k3.build(fakeCtx());
  const a = guteiOf(root.scene), b = boyOf(root.scene);
  assert.ok(a && b, 'master and boy both present');
  const gap = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
  assert.ok(gap > 2.0 && gap < 4.0, `a few steps apart, not a huddle or a shout: ${gap.toFixed(2)}`);

  for (const m of monks(root.scene)) {
    assert.ok(Math.abs(m.position.x) <= 5 && m.position.z >= -6 && m.position.z <= 3,
      `figure inside the staging box: ${m.position.x}, ${m.position.z}`);
  }
  // both sleeves are presented the same way — the boy is copying, not arguing
  assert.ok(Math.abs(a.rotation.y - b.rotation.y) < 1e-9, 'master and boy face the same way');
});

test('touching one of them makes the other answer, a beat later', () => {
  const ctx = fakeCtx();
  const root = k3.build(ctx);
  const gutei = guteiOf(root.scene);
  const boy = boyOf(root.scene);
  const guteiBody = gutei.children.find((c) => c.name === 'body');
  // the boy answers by lifting his empty hand — read it off the arm, since
  // there is no finger to watch
  const boyArm = boy.children.find((c) => c.name === 'arm' && c.rotation.z > 1);
  const restZ = boyArm.rotation.z;

  root.setCamera(new THREE.PerspectiveCamera());
  let t = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { t += 1 / 60; root.update(1 / 60, t); } };
  step(30);
  assert.equal(root.fragment().taps, 0);
  assert.equal(root.fragment().mirrored, false);

  ctx.input.raycastFirst = (cam, list) => (list.includes(guteiBody) ? { object: guteiBody, point: new THREE.Vector3() } : null);
  ctx._taps.forEach((cb) => cb());
  assert.equal(root.fragment().taps, 1);

  step(6);                                        // 0.1s — inside the beat
  assert.ok(root.fragment().masterLift > 0, 'the master is already moving');
  assert.equal(root.fragment().boyLift, 0, 'the boy has not answered yet');
  assert.equal(root.fragment().mirrored, false);

  step(40);                                       // past the beat
  assert.ok(root.fragment().boyLift > 0, 'the boy answers');
  assert.ok(boyArm.rotation.z > restZ, 'the empty hand actually lifts');
  assert.equal(root.fragment().answers, 1);
  assert.equal(root.fragment().mirrored, true);

  step(240);                                      // let both gestures finish
  assert.equal(root.fragment().masterLift, 0, 'the master settles');
  assert.equal(root.fragment().boyLift, 0, 'the boy settles');
  assert.ok(Math.abs(boyArm.rotation.z - restZ) < 1e-9, 'and the hand comes back to rest');

  for (const v of Object.values(root.fragment())) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', 'fragment stays finite');
  }
});

test('the finger never dips below the shoulder while the gesture plays', () => {
  const ctx = fakeCtx();
  const root = k3.build(ctx);
  const seals = accentMeshes(root.scene);       // just Gutei's finger now
  const gutei = guteiOf(root.scene);
  const guteiBody = gutei.children.find((c) => c.name === 'body');
  root.setCamera(new THREE.PerspectiveCamera());
  ctx.input.raycastFirst = (cam, list) => (list.includes(guteiBody) ? { object: guteiBody, point: new THREE.Vector3() } : null);
  ctx._taps.forEach((cb) => cb());

  let lifted = 0;
  for (let i = 1; i <= 300; i++) {
    root.update(1 / 60, i / 60);
    for (const s of seals) {
      assert.ok(s.position.y > shoulderY(s.parent), `still raised at step ${i}`);
      assert.ok(Number.isFinite(s.position.x + s.position.y + s.position.z), 'finger stays finite');
    }
    if (root.fragment().boyLift > 0) lifted++;
  }
  assert.ok(lifted > 30, 'the answering gesture actually plays for a while');
});
