import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeTail } from '../src/kit/tail.js';
import { splitOnP1P3, mirrorGeometry } from '../src/kit/loft.js';
import { restAnimals, symmetryReport, meshesOf, shellsOf } from './helpers/mirror.js';

// EVERY KIT ANIMAL AT REST IS ITS OWN MIRROR IMAGE about x = 0, in its
// vertices and in how they are joined into triangles (see tests/helpers/
// mirror.js for the measure, and for what is frozen or left out as motion).
// Every loft in the kit once split all its quads along the same diagonal,
// which is a ridge on one side of an animal where the other side has a
// crease, and four passes judged from one side never saw it (src/kit/loft.js).

const ANIMALS = await restAnimals();
const heightOf = (root) => new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
// a mirror gap below this is rounding, x the animal's height; the faults this
// holds out were tens of thousandths
const EPS = 1e-5;

for (const a of ANIMALS) {
  test(`${a.key}: every part is the mirror image of itself or of its partner`, () => {
    const root = a.build();
    const h = heightOf(root);
    const rows = symmetryReport(root, { skip: a.skip });
    assert.ok(rows.length >= 7, `${a.key}: only ${rows.length} meshes measured`);
    for (const r of rows) {
      assert.ok(r.gap < EPS * h, `${a.key} ${r.name} #${r.i}: its reflection stands ${(r.gap / h).toExponential(2)} x height off its partner's surface, at (${r.at && r.at.toArray().map((v) => v.toFixed(3))})`);
      assert.equal(r.flipped, 0, `${a.key} ${r.name} #${r.i}: ${r.flipped} faces are wound the other way from their mirror`);
    }
  });

  test(`${a.key}: every mesh is closed and faces out`, () => {
    for (const m of meshesOf(a.build())) {
      for (const s of shellsOf(m.tris)) {
        assert.equal(s.open, 0, `${a.key} ${m.name}: a piece of ${s.faces} faces has ${s.open} open edges`);
        assert.equal(s.twisted, 0, `${a.key} ${m.name}: a piece of ${s.faces} faces is wound both ways`);
        assert.ok(s.volume > 0, `${a.key} ${m.name}: a piece of ${s.faces} faces is inside out (volume ${s.volume.toExponential(2)})`);
      }
    }
  });
}

test('a strand built straight down the midline is its own mirror image', () => {
  // the horse's and the buffalo's tails are left out of the animals above
  // because the warm-up has swung them; built straight, with each of their
  // root options, the loft itself must be symmetric
  for (const opts of [
    {},
    { root: [0, -1, -1.04], rootBend: [0, -1, -0.34], rootSink: [0, -0.05, 0.1], rootWide: 1.5, spin: Math.PI / 6, swell: 1.5, swellAt: 0.66 },
    { root: [0, -0.71, -0.71], rootSink: [0, 0.02, 0.12], swell: 0.8, swellAt: 0.86, swellSpan: 0.2 },
  ]) {
    const t = makeTail({ length: 0.6, thickness: 0.05, warmup: 0, ...opts });
    for (const r of symmetryReport(t.group)) assert.ok(r.gap < 1e-6, `strand ${JSON.stringify(opts)}: gap ${r.gap}`);
  }
});

test('a quad folds outward, and its mirror image folds the mirrored way', () => {
  // a quad on a ball: corners on a circle, its middle bulging out toward +z
  // (it faces +z, wound p0 -> p1 -> p2 counter-clockwise seen from there)
  const quad = (lift02, lift13) => [-1, -1, lift02, 1, -1, lift13, 1, 1, lift02, -1, 1, lift13];
  // p0 and p2 stand out: the ridge is along p0-p2
  assert.equal(splitOnP1P3(quad(0.2, 0), 0, 1, 2, 3), false);
  // p1 and p3 stand out: the ridge is along p1-p3
  assert.equal(splitOnP1P3(quad(0, 0.2), 0, 1, 2, 3), true);
  // the same quad, off to the +x side, reflected through x = 0 and stated
  // the mirrored way round, [m(p1), m(p0), m(p3), m(p2)], splits along the
  // reflection of its diagonal — whose name in that order is the other one.
  // The flat quad is the tie, broken by side.
  for (const q0 of [quad(0.2, 0), quad(0, 0.2), quad(0, 0)]) {
    const q = q0.map((v, i) => (i % 3 === 0 ? v + 3 : v));
    const m = q.map((v, i) => (i % 3 === 0 ? -v : v));
    assert.equal(splitOnP1P3(m, 1, 0, 3, 2), !splitOnP1P3(q, 0, 1, 2, 3));
  }
});

test('the measure is not vacuous: it finds a one-handed split and a copied pair', () => {
  // the dog's trunk re-split all one way round, as every loft once was
  const dogEntry = ANIMALS.find((a) => a.key === 'dog');
  const root = dogEntry.build();
  const h = heightOf(root);
  const body = root.getObjectByName('body');
  const { seg, rings } = body.userData.ring;
  const idx = Array.from(body.geometry.index.array);
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg, b = a + seg, j2 = (j + 1) % seg, k = (i * seg + j) * 6;
      idx.splice(k, 6, a + j, a + j2, b + j, a + j2, b + j2, b + j);
    }
  }
  body.geometry.setIndex(idx);
  const one = symmetryReport(root, { skip: dogEntry.skip }).find((r) => r.name === 'body');
  assert.ok(one.gap > 100 * EPS * h, `a one-handed trunk measured only ${one.gap}`);

  // a left leg rebuilt from the right one's recipe, as the legs once were:
  // the reflected points, but each ring laid the same way round from +x, so
  // the same index list joins them into other triangles
  const root2 = dogEntry.build();
  const legs = root2.children.filter((c) => c.name === 'leg');
  const right = legs.find((l) => l.position.x > 0 && l.position.z > 0);
  const left = legs.find((l) => l.position.x < 0 && l.position.z > 0);
  const src = right.geometry.getAttribute('position');
  const p = src.clone();
  const ringed = src.count - 2;                  // six to a ring, two apexes after
  for (let i = 0; i < src.count; i++) {
    const from = i < ringed ? i - (i % 6) + ((9 - (i % 6)) % 6) : i;
    p.setXYZ(i, -src.getX(from), src.getY(from), src.getZ(from));
  }
  const copy = new THREE.BufferGeometry();
  copy.setAttribute('position', p);
  // ...and split all one way round, as they also were: since every quad
  // folds outward (loft.js), a near-round column's copy makes nearly the
  // same choices as its reflection, and the copy alone no longer shows
  const cidx = Array.from(right.geometry.index.array);
  for (let i = 0; i < ringed / 6 - 1; i++) {
    for (let j = 0; j < 6; j++) {
      const a = i * 6, b = a + 6, j2 = (j + 1) % 6;
      cidx.splice((i * 6 + j) * 6, 6, a + j, a + j2, b + j, a + j2, b + j2, b + j);
    }
  }
  copy.setIndex(cidx);
  left.geometry = copy;
  const copied = symmetryReport(root2).filter((r) => r.name === 'leg');
  assert.ok(Math.max(...copied.map((r) => r.gap)) > 100 * EPS * h, 'a leg rebuilt from the same recipe went unnoticed');
  // and the reflection the kit uses instead passes
  left.geometry = mirrorGeometry(right.geometry);
  for (const r of symmetryReport(root2).filter((x) => x.name === 'leg')) assert.ok(r.gap < EPS * h);
});
