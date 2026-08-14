import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeStars } from '../src/kit/stars.js';
import { CAMERA_FAR } from '../src/camera.js';

test('a whole sky is one draw call', () => {
  // The entire reason the field can be this size. One Points, one geometry,
  // one material — brightness varies through a colour attribute rather than
  // through several materials, which would cost a draw each.
  const s = makeStars({ count: 900, seed: 7 });
  let draws = 0;
  s.points.traverse((o) => { if (o.isMesh || o.isPoints) draws++; });
  assert.equal(draws, 1);
  assert.equal(s.points.geometry.getAttribute('position').count, 900);
  assert.equal(s.material.vertexColors, true);
});

test('stars are sky, not scenery', () => {
  const { material, points } = makeStars({ seed: 3 });
  // Fogged stars wash to paper and stop being stars.
  assert.equal(material.fog, false);
  // The ink pass is a Sobel over depth, so anything that WRITES depth grows an
  // outline — an outlined star is a hole punched in the sky. Depth TESTING
  // stays on, which is what makes the land occlude the stars below the horizon
  // and the moon pass in front — and is also why the shell's radius has to
  // clear everything the book draws (see below).
  assert.equal(material.depthWrite, false);
  assert.equal(material.depthTest, true);
  // The bounding sphere is centred on the shell, so a camera inside it culls
  // the whole field the moment that centre leaves frame.
  assert.equal(points.frustumCulled, false);
});

test('a star is round — a bare point is a square', () => {
  // PointsMaterial draws a quad, and at three pixels across a quad is
  // unmistakably a square. The disc is an alpha map shared by the whole field,
  // so roundness costs one small texture and no extra draws.
  const s = makeStars({ seed: 4 });
  const tex = s.material.alphaMap;
  assert.ok(tex, 'no alpha map — the points render as squares');
  const { data, width, height } = tex.image;
  const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];
  assert.equal(alphaAt(width >> 1, height >> 1), 255, 'the centre is solid');
  assert.equal(alphaAt(0, 0), 0, 'the corner is empty — this is what makes it a disc');
  assert.equal(alphaAt(width - 1, height - 1), 0);
  // And the rim RAMPS rather than cutting, which is what antialiases it at the
  // size these are actually drawn. Read as "somewhere along the radius there
  // are partial values", not at a fixed radius — how much of the disc is solid
  // core is a taste knob, and a test that samples a chosen radius is really
  // testing where that knob happens to be sitting.
  const radial = [];
  for (let y = height >> 1; y < height; y++) radial.push(alphaAt(width >> 1, y));
  const partial = radial.filter((a) => a > 0 && a < 255);
  assert.ok(partial.length >= 3, `the falloff is a hard cut: ${radial.join(',')}`);
  // ...and it only ever falls, from solid at the centre to nothing at the rim
  for (let i = 1; i < radial.length; i++) {
    assert.ok(radial[i] <= radial[i - 1], `alpha rises toward the rim at ${i}: ${radial.join(',')}`);
  }
});

test('the shell stands further off than anything the book draws', () => {
  // The shell rides the eye, so its radius IS its distance from the eye, and
  // anything drawn beyond it sits BEHIND the sky — which is how mountains came
  // out in front of the night at radius 80. The book's far ridges run to about
  // 82 from the lens and case 19's moon to 60; past CAMERA_FAR the stars are
  // clipped themselves. The window is narrow and this is what holds it.
  const s = makeStars({ seed: 5 });
  const pos = s.points.geometry.getAttribute('position');
  const v = new THREE.Vector3();
  let min = Infinity, max = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = v.length();
    min = Math.min(min, d); max = Math.max(max, d);
  }
  assert.ok(min > 85, `terrain can stand in front of the sky: ${min.toFixed(1)}`);
  assert.ok(max < CAMERA_FAR, `a star stands past the far plane: ${max.toFixed(1)}`);
});

test('the sky runs down past the horizon, not to a band above it', () => {
  // The shell follows the lens, so with the centre on the eye a star's phi IS
  // its elevation. A field that stops short leaves the lowest stars hanging in
  // a band with empty sky beneath them; what reads as a sky is one the LAND
  // cuts off. Below-horizon stars are occluded by the ground and cost only
  // their share of the buffer.
  const s = makeStars({ count: 600, seed: 9 });
  const pos = s.points.geometry.getAttribute('position');
  const v = new THREE.Vector3();
  let lowest = 90;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    lowest = Math.min(lowest, Math.atan2(v.y, Math.hypot(v.x, v.z)) * 180 / Math.PI);
  }
  assert.ok(lowest < 0, `the field stops ${lowest.toFixed(1)}° above the lens horizon`);
});

test('the field is seeded — same seed, same sky', () => {
  // The determinism rule: no Math.random outside src/audio, so two builds of
  // the same seed are identical and two seeds are not.
  const a = makeStars({ count: 40, seed: 11 }).points.geometry.getAttribute('position').array;
  const b = makeStars({ count: 40, seed: 11 }).points.geometry.getAttribute('position').array;
  const c = makeStars({ count: 40, seed: 12 }).points.geometry.getAttribute('position').array;
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.notDeepEqual(Array.from(a), Array.from(c));
  assert.ok(Array.from(a).every(Number.isFinite));
});

test('the shell follows the lens by position alone', () => {
  // Carrying the camera's ROTATION would pin the stars to the screen like a
  // decal; carrying its position is what makes them read as infinitely far.
  const s = makeStars({ seed: 2 });
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(3, 12, -40);
  cam.rotation.set(0.4, 1.1, 0.2);
  s.follow(cam);
  assert.deepEqual(s.points.position.toArray(), [3, 12, -40]);
  assert.deepEqual(s.points.rotation.toArray().slice(0, 3), [0, 0, 0]);
});

test('setOpacity hides the field outright at zero', () => {
  // Case 28 holds them at zero for most of the page; an invisible Points still
  // costs its draw call if it is only transparent.
  const s = makeStars({ seed: 1 });
  s.setOpacity(0);
  assert.equal(s.points.visible, false);
  s.setOpacity(0.92);
  assert.equal(s.points.visible, true);
  assert.equal(s.material.opacity, 0.92);
});
