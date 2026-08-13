// The model viewer's own light rig — half of "it's kinda hard to see in 3D".
// It is not the book's look, and it's one toggle away from it, so what these
// tests hold is that the deviation stays deliberate and bounded: the book's
// key is still in the rig, and the fills stay dim relative to it. The other
// half — shading — needs no test of its own any more: the kit's materials
// are what render, with nothing between builder and screen left to verify.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLights } from '../src/render/lights.js';
import { makeViewerLights, VIEWER_FILLS } from '../src/modelviewer/lights.js';

const KIT = { makeLights };
const dirLights = (g) => g.children.filter((c) => c.isDirectionalLight);

test('makeViewerLights: the book rig plus exactly the declared fills', () => {
  const book = makeLights();
  const rig = makeViewerLights(KIT, { extra: true });
  assert.equal(dirLights(rig).length, dirLights(book).length + VIEWER_FILLS.length);
  assert.equal(rig.children.filter((c) => c.isHemisphereLight).length, 1);
  // the key survives untouched: same intensity, same aim
  const key = dirLights(rig).find((l) => !l.name.startsWith('viewer-'));
  const bookKey = dirLights(book)[0];
  assert.equal(key.intensity, bookKey.intensity);
  assert.deepEqual(key.position.toArray(), bookKey.position.toArray());
});

test('makeViewerLights: extra:false is the book rig and nothing else', () => {
  const rig = makeViewerLights(KIT, { extra: false });
  assert.equal(rig.children.filter((c) => c.name.startsWith('viewer-')).length, 0);
  assert.deepEqual(
    rig.children.map((c) => c.type).sort(),
    makeLights().children.map((c) => c.type).sort(),
  );
});

test('the fills stay fills: dimmer than the key, and two different colours', () => {
  const rig = makeViewerLights(KIT, { extra: true });
  const key = dirLights(rig).find((l) => !l.name.startsWith('viewer-'));
  const fills = dirLights(rig).filter((l) => l.name.startsWith('viewer-'));
  assert.equal(fills.length, 2);
  // measured: past about a third of the key they stop raking and start washing
  for (const f of fills) assert.ok(f.intensity > 0 && f.intensity < key.intensity / 3,
    `${f.name} at ${f.intensity} is not a fill against a key of ${key.intensity}`);
  // "two slightly different colored lights" is the whole point of the pair —
  // one cool, one warm, so adjacent facets separate by hue and not just level
  const [a, b] = fills.map((f) => f.color);
  assert.notEqual(a.getHexString(), b.getHexString());
  assert.ok(a.b - a.r > 0.05, 'the cool fill must actually be cool');
  assert.ok(b.r - b.b > 0.05, 'the warm fill must actually be warm');
});

test('the fills come from different directions, and from neither the key nor each other', () => {
  const rig = makeViewerLights(KIT, { extra: true });
  const dirOf = (l) => l.position.clone().normalize();
  const [key, ...fills] = [
    dirLights(rig).find((l) => !l.name.startsWith('viewer-')),
    ...dirLights(rig).filter((l) => l.name.startsWith('viewer-')),
  ];
  // > 60 deg apart in every pair: two lights close together are one light
  const pairs = [[key, fills[0]], [key, fills[1]], [fills[0], fills[1]]];
  for (const [p, q] of pairs) {
    assert.ok(dirOf(p).dot(dirOf(q)) < 0.5,
      `${p.name || 'key'} and ${q.name} are less than 60 deg apart`);
  }
});
