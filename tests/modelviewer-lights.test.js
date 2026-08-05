// The model viewer's own rig and shading — the two halves of "it's kinda hard
// to see in 3D". Neither is the book's look, and both are one toggle away from
// it, so what these tests hold is that the deviation stays deliberate and
// bounded: the book's key is still in the rig, the fills stay dim, and the
// shading swap keeps its hands off everything the book marks unlit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeLights, toonMaterial, plainMaterial } from '../src/render/toon.js';
import { makeViewerLights, VIEWER_FILLS } from '../src/modelviewer/lights.js';
import { applyBookShading } from '../src/modelviewer/shading.js';

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

// ---- shading -------------------------------------------------------------
const mesh = (name, material, userData = {}) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  m.name = name;
  Object.assign(m.userData, userData);
  return m;
};

test('applyBookShading swaps lit toon materials for the shipped Lambert', () => {
  const g = new THREE.Group();
  const lit = mesh('robe', toonMaterial({ color: '#494749' }));
  g.add(lit);
  applyBookShading(g);
  assert.equal(lit.material.type, 'MeshLambertMaterial');
  assert.equal(lit.material.color.getHexString(), '494749');
});

test('applyBookShading leaves alone everything the book marks unlit', () => {
  const g = new THREE.Group();
  // the four guards, each with the thing that taught it
  const moon = mesh('moon', new THREE.MeshBasicMaterial({ color: 0x943433 }), { keepMaterial: true });
  const grass = mesh('grassfield', toonMaterial({ color: '#6f6d6b' }));
  const outline = mesh('robe-ink', new THREE.MeshBasicMaterial({ color: 0x14110c }), { isOutline: true });
  g.add(moon, grass, outline);
  const before = [moon.material, grass.material, outline.material];
  applyBookShading(g);
  assert.deepEqual([moon.material, grass.material, outline.material], before);
});

test('applyBookShading handles a multi-material mesh', () => {
  const g = new THREE.Group();
  const m = mesh('two-tone', [toonMaterial({ color: '#494749' }), toonMaterial({ color: '#6f6d6b' })]);
  g.add(m);
  applyBookShading(g);
  assert.equal(m.material.length, 2);
  for (const mat of m.material) assert.equal(mat.type, 'MeshLambertMaterial');
  assert.equal(m.material[1].color.getHexString(), '6f6d6b');
});

// ---- the clone itself ----------------------------------------------------
// Four properties this clone has been caught dropping over the life of the
// workbench (flatShading was designed in; emissive, visible, map and alphaTest
// each shipped broken first). It is now shared with the viewer, so a fifth
// omission would break two tools at once.
test('plainMaterial carries everything that affects rendering', () => {
  const src = toonMaterial({ color: '#C73E3A', flat: true, side: THREE.DoubleSide });
  src.transparent = true;
  src.opacity = 0.4;
  src.fog = false;
  src.visible = false;
  src.map = new THREE.Texture();
  src.alphaTest = 0.5;

  const m = plainMaterial(src);
  assert.equal(m.type, 'MeshLambertMaterial');
  assert.equal(m.color.getHexString().toUpperCase(), 'C73E3A');
  assert.equal(m.flatShading, true);
  assert.equal(m.side, THREE.DoubleSide);
  assert.equal(m.transparent, true);
  assert.equal(m.opacity, 0.4);
  assert.equal(m.fog, false);
  assert.equal(m.visible, false);
  assert.equal(m.map, src.map);
  assert.equal(m.alphaTest, 0.5);
  // the seal's glow: an accent material carries emissive, and a clone that
  // drops it renders the one red thing on the page as dull as the ink
  assert.ok(src.emissiveIntensity > 0);
  assert.equal(m.emissive.getHexString(), src.emissive.getHexString());
  assert.equal(m.emissiveIntensity, src.emissiveIntensity);
});

test('plainMaterial defaults a bare material without inventing values', () => {
  const m = plainMaterial(new THREE.MeshToonMaterial({ color: 0x494749 }));
  assert.equal(m.flatShading, false);
  assert.equal(m.transparent, false);
  assert.equal(m.opacity, 1);
  assert.equal(m.visible, true);
  assert.equal(m.alphaTest, 0);
});
