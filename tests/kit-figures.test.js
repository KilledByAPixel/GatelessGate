import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeBuddha } from '../src/kit/buddha.js';
import { makeFigure } from '../src/kit/figure.js';
import { makeAssembly } from '../src/kit/assembly.js';
import { ACCENT } from '../src/palette.js';

// The widest radius the mesh's own geometry reaches inside a y band —
// how the tests read a silhouette back off a lathe.
function maxRadiusInBand(mesh, y0, y1) {
  const pos = mesh.geometry.attributes.position;
  let r = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < y0 || y > y1) continue;
    r = Math.max(r, Math.hypot(pos.getX(i), pos.getZ(i)));
  }
  return r;
}

// The Buddha is NOT special (Frank, overnight pass 2): the same seated figure
// kit as every monk, ordinary human size, bare-headed, with ONE mark — the
// urna, a small accent dot sunk into the forehead. These tests pin exactly
// that: same robe as everyone (byte-for-byte), no hat, no bespoke anatomy,
// and a dot that is a buried join on the skull, not a floating bead.
test('makeBuddha is the same seated figure as every monk — no hat, ordinary size', () => {
  const H = 1.6;
  const b = makeBuddha({ height: H });
  assert.equal(b.name, 'buddha');
  const names = b.children.map((c) => c.name);
  assert.ok(names.includes('body') && names.includes('head'));
  assert.equal(names.filter((n) => n === 'arm').length, 2, 'the folded sleeves');
  assert.ok(!names.includes('hat'), 'a buddha is bare-headed');
  // the old bespoke statue's parts are gone with it
  for (const dead of ['hands', 'ushnisha', 'ear']) {
    assert.ok(!names.includes(dead), `no bespoke '${dead}' — the special model is deleted`);
  }

  // the robe IS the figure kit's seated robe — identical geometry, not a copy
  // that could drift: any retune of SIT_PROFILE must flow through here
  const ref = makeFigure({ height: H, stance: 'sit', arms: 'fold', hat: false });
  const bodyPos = b.children.find((c) => c.name === 'body').geometry.attributes.position.array;
  const refPos = ref.children.find((c) => c.name === 'body').geometry.attributes.position.array;
  assert.deepEqual([...bodyPos], [...refPos], 'the same robe as everyone');

  // ordinary size: a seated 1.6 man, on the ground, not a colossus
  const box = new THREE.Box3().setFromObject(b);
  assert.ok(box.min.y > -0.02, `on the ground: ${box.min.y}`);
  assert.ok(box.max.y > 0.85 && box.max.y < 1.1, `seated monk scale: ${box.max.y}`);
});

test('the urna: one small accent dot, sunk into the forehead, no outline', () => {
  const H = 1.6;
  const b = makeBuddha({ height: H });
  const head = b.children.find((c) => c.name === 'head');
  const urna = head.children.find((c) => c.name === 'urna');
  assert.ok(urna, 'the urna is a child of the head — it travels with the skull');
  assert.equal(urna.userData.noOutline, true);
  assert.equal(urna.material.color.getHexString(),
    new THREE.Color(ACCENT).getHexString(), 'the dot is the accent');

  const rHead = head.geometry.parameters.radius;
  const rUrna = urna.geometry.parameters.radius;
  assert.ok(rUrna < 0.3 * rHead, `a dot, not a lamp: ${rUrna} vs head ${rHead}`);

  // buried join: the centre stays inside the skull, the crest shows proud
  const d = urna.position.length();
  assert.ok(d < rHead, `centre inside the head: ${d} vs ${rHead}`);
  assert.ok(d + rUrna > rHead, `the crest shows: ${d + rUrna} vs ${rHead}`);
  // and it is on the FOREHEAD: forward (+z, the way a seated figure faces)
  // and above the head's equator, on the centre line
  assert.equal(urna.position.x, 0, 'centred');
  assert.ok(urna.position.z > 0, 'on the face side');
  assert.ok(urna.position.y > 0 && urna.position.y < rHead * 0.7,
    `mid-forehead, not the scalp: ${urna.position.y}`);
});

test('makeBuddha keeps its signature: height scales it, color robes it, urna stays red', () => {
  const tall = makeBuddha({ height: 3.2, color: '#402020' });
  const small = makeBuddha({ height: 1.6, color: '#402020' });
  const boxT = new THREE.Box3().setFromObject(tall);
  const boxS = new THREE.Box3().setFromObject(small);
  assert.ok(Math.abs(boxT.max.y - 2 * boxS.max.y) < 1e-6, 'height is a scale');
  const body = tall.children.find((c) => c.name === 'body');
  assert.equal(body.material.color.getHexString(), '402020', 'the robe takes the colour');
  const urna = tall.children.find((c) => c.name === 'head').children[0];
  assert.equal(urna.material.color.getHexString(),
    new THREE.Color(ACCENT).getHexString(), 'the mark is not recoloured with the robe');
});

test('makeAssembly is one instanced, grounded, deterministic crowd', () => {
  const a = makeAssembly({ count: 8, seed: 6 });
  assert.equal(a.name, 'assembly');
  assert.ok(a.isInstancedMesh, 'a single instanced mesh');
  assert.equal(a.count, 8);
  assert.equal(a.userData.noOutline, true);

  // each instance is a seated MONK, not a pawn: the silhouette carries the
  // lap shelf (the knee block the widest thing it owns, the torso inset
  // above it — the same event that fixed "a fat dress standing up" on the
  // hero monks) and the obi pinch (a belt — narrower than the blouse pushed
  // up over it), read straight off the merged geometry via the same band
  // scan the buddha test uses. Bands in world units at FIG_H = 1.5.
  const fake = { geometry: a.geometry };
  const knees = maxRadiusInBand(fake, 0, 0.16);       // the knee crest, at 0.060·FIG_H
  const torso = maxRadiusInBand(fake, 0.45, 0.62);    // obi → chest, above the lap turn
  const obi = maxRadiusInBand(fake, 0.32, 0.34);      // the tie, at 0.220·FIG_H
  const blouse = maxRadiusInBand(fake, 0.39, 0.41);   // the swell above the knot, at 0.265·FIG_H
  assert.ok(torso < knees * 0.55, `the torso rises inset above the lap: ${torso} vs ${knees}`);
  assert.ok(obi < blouse, `the obi pinch reads as a belt: ${obi} vs ${blouse}`);
  assert.ok(obi < knees * 0.7, `a seated figure, not a cone: ${obi} vs ${knees}`);
  const geoBox = a.geometry.boundingBox || (a.geometry.computeBoundingBox(), a.geometry.boundingBox);
  assert.ok(geoBox.max.y > 0.8 && geoBox.max.y < 1.1, `crowd figure stays crowd-sized: ${geoBox.max.y}`);
  const m = new THREE.Matrix4();
  a.getMatrixAt(0, m);
  const p = new THREE.Vector3().setFromMatrixPosition(m);
  assert.ok(Math.abs(p.y) < 0.05, `seated on the ground: ${p.y}`);
  // deterministic
  const b = makeAssembly({ count: 8, seed: 6 });
  const m2 = new THREE.Matrix4(); b.getMatrixAt(0, m2);
  assert.deepEqual([...m.elements], [...m2.elements]);
});

test('makeAssembly accepts a THREE.Color for color (contract parity with siblings)', () => {
  assert.doesNotThrow(() => makeAssembly({ count: 4, color: new THREE.Color(0x336699) }));
});
