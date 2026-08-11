import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeBoat } from '../src/kit/boat.js';

// The hull is a hand-listed triangle soup — ten faces typed out by hand — and
// every one of them shipped wound the wrong way round. computeVertexNormals
// then handed the whole shell inward normals, front-face culling threw away the
// near side and drew the far side's interior lit from inside, and the underside
// read as a solid patch in the wrong value. Nothing failed; the boat simply
// looked wrong at twenty units in fog, which is the only place it is ever seen.
//
// A winding check is cheap and this is exactly the geometry that needs one:
// a closed shell's faces must all point away from its own centre.
function windings(mesh) {
  const pos = mesh.geometry.getAttribute('position');
  const centre = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) centre.add(new THREE.Vector3().fromBufferAttribute(pos, i));
  centre.divideScalar(pos.count);

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3(), out = new THREE.Vector3();
  const dots = [];
  for (let t = 0; t < pos.count / 3; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
    out.copy(a).add(b).add(c).divideScalar(3).sub(centre).normalize();
    dots.push(n.dot(out));
  }
  return dots;
}

test('every hull face is wound outward', () => {
  const { group } = makeBoat({});
  const hull = group.getObjectByName('hull');
  assert.ok(hull, 'the boat has a hull');
  const dots = windings(hull);
  assert.equal(dots.length, 10, 'ten faces, one closed shell');
  const inward = dots.filter((d) => d <= 0).length;
  assert.equal(inward, 0, `${inward} of ${dots.length} hull faces point inward`);
});

test('the deck faces up and the sides face out', () => {
  const { group } = makeBoat({});
  const pos = group.getObjectByName('hull').geometry.getAttribute('position');
  const normals = group.getObjectByName('hull').geometry.getAttribute('normal');
  assert.ok(normals, 'computeVertexNormals ran');

  // whatever the face list order, SOME face must look straight up (deck) and
  // faces must exist on both beam ends — the checks a flipped shell fails
  let up = 0, port = 0, stbd = 0;
  for (let i = 0; i < normals.count; i++) {
    const n = new THREE.Vector3().fromBufferAttribute(normals, i);
    if (n.y > 0.9) up++;
    if (n.x < -0.5) port++;
    if (n.x > 0.5) stbd++;
  }
  assert.ok(up > 0, 'the deck faces the sky');
  assert.ok(port > 0 && stbd > 0, 'both flanks face away from the centreline');
  assert.equal(pos.count % 3, 0);
});

test('a hull with no mast is still a closed, outward shell', () => {
  const { group } = makeBoat({ mast: 0 });
  assert.equal(group.getObjectByName('mast'), undefined, 'no mast');
  assert.equal(group.getObjectByName('sail'), undefined, 'and no sail');
  assert.equal(windings(group.getObjectByName('hull')).filter((d) => d <= 0).length, 0);
});

test('surfaceAt seats the hull on the swell; without it the boat only breathes', () => {
  // a sloping, moving surface: bow-high, and rising with time
  const surfaceAt = (x, z, t) => 0.2 + z * 0.05 + Math.sin(t) * 0.01;
  const afloat = makeBoat({ seed: 4, surfaceAt });
  afloat.group.position.set(3, 0, -2);
  afloat.update(1 / 60, 1.0);
  assert.ok(Number.isFinite(afloat.group.position.y));
  // the four samples straddle the hull symmetrically, so their mean is the
  // surface at the boat's own x/z
  assert.ok(Math.abs(afloat.group.position.y - (0.2 - 2 * 0.05 + Math.sin(1) * 0.01)) < 1e-6,
    'y comes from the surface under it');
  // bow (+z, at yaw 0) sits higher here, so the hull pitches bow-up: negative x
  assert.ok(afloat.group.rotation.x < 0, 'a bow-high swell pitches the bow up');

  const dry = makeBoat({ seed: 4 });
  dry.group.position.set(3, 0, -2);
  dry.update(1 / 60, 1.0);
  assert.equal(dry.group.position.y, 0, 'no sea, no y taken over');
  assert.ok(Math.abs(dry.group.rotation.x) < 0.05, 'just a breath of tilt');
});
