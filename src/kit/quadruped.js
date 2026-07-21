import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';
import { makeTail } from './tail.js';

// The shared body plan for every four-legged animal in the book: a barrel slung
// between four legs, a head out front, and optional hump / horns / ears / snout.
// The dog (case 1) and the water buffalo (case 37) are the same construction at
// different proportions.
//
// THE LEG RULE, which both animals got wrong independently and which is the
// reason this file exists: a leg must run PAST the belly, not up to it. The
// barrel is a capsule, so it narrows toward its sides — a leg standing at hip
// offset x meets the barrel's surface at
//
//     y = bodyY - sqrt(bodyR^2 - x^2)
//
// which is HIGHER than the barrel's lowest point. Sizing a leg to reach the
// bottom of the body therefore leaves it hanging in the air at the hip, which is
// exactly what "its legs don't connect" looked like. That height is computed
// here rather than hand-tuned, so no future animal can reintroduce it.
//
// Everything scales off `height` (withers height) and faces +z.
export function makeQuadruped({
  height = 1,
  color = INK,
  // barrel
  bodyR = 0.22, bodyLen = 0.72, bodyDrop = 0.16,
  // legs
  legH = 0.52, legR = 0.055, legTaper = 0.82, hipX = 0.13, hipZ = 0.32,
  // head
  head = { shape: 'sphere', r: 0.20, fwd: 0.56, up: 0.22 },
  neck = null,           // { r, len, tilt } — a short column from chest to head
  snout = null,          // { r0, r1, len, fwd, up }
  ears = null,           // { r, h, x, up, fwd, tilt }
  horns = null,          // { r, len, x, up, fwd, sweep }
  hump = null,           // { r, scaleY, scaleZ, up, fwd }
  tail = null,           // { kind: 'stiff'|'strand', ... }
  seed = 1,
} = {}) {
  const g = new THREE.Group();
  const mat = toonMaterial({ color, flat: true });
  const h = height;
  const R = bodyR * h;
  const legLen = legH * h;
  const bodyY = legLen + bodyDrop * h;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(R, bodyLen * h, 4, 8), mat);
  body.name = 'body';
  body.rotation.x = Math.PI / 2;                  // lie along z
  body.position.set(0, bodyY, 0);
  g.add(body);

  // see THE LEG RULE above
  const hx = hipX * h;
  const belly = bodyY - Math.sqrt(Math.max(0, R * R - hx * hx));
  const legTop = belly + 0.06 * h;                 // bury the top slightly in the barrel
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(legR * h * legTaper, legR * h, legTop, 6), mat);
    leg.name = 'leg';
    leg.position.set(sx * hx, legTop / 2, sz * hipZ * h);
    g.add(leg);
  }

  if (hump) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(hump.r * h, 7, 5), mat);
    m.name = 'hump';
    m.scale.set(1, hump.scaleY ?? 0.7, hump.scaleZ ?? 1.25);
    m.position.set(0, bodyY + hump.up * h, hump.fwd * h);
    g.add(m);
  }

  const headY = bodyY + head.up * h;
  const headZ = head.fwd * h;
  if (neck) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(neck.r * h * 0.85, neck.r * h, neck.len * h, 7), mat);
    m.name = 'neck';
    // stand it between the chest and the head rather than at a guessed angle
    const cz = bodyLen * h * 0.4;
    const cy = bodyY + 0.04 * h;
    m.position.set(0, (cy + headY) / 2, (cz + headZ) / 2);
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, headY - cy, headZ - cz).normalize());
    g.add(m);
  }

  const headMesh = head.shape === 'box'
    ? new THREE.Mesh(new THREE.BoxGeometry(head.w * h, head.hh * h, head.d * h), mat)
    : new THREE.Mesh(new THREE.SphereGeometry(head.r * h, 12, 10), mat);
  headMesh.name = 'head';
  headMesh.position.set(0, headY, headZ);
  // A head held level projects like a drawer pulled out of the chest. Nosing it
  // down sinks the back of the skull into the shoulder and leaves the muzzle as
  // the thing that sticks out, which is what the silhouette wants.
  if (head.tilt) headMesh.rotation.x = head.tilt;
  g.add(headMesh);

  if (snout) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(snout.r0 * h, snout.r1 * h, snout.len * h, 7), mat);
    m.name = 'snout';
    m.rotation.x = Math.PI / 2;
    m.position.set(0, bodyY + snout.up * h, snout.fwd * h);
    g.add(m);
  }

  // Ears and horns HINGE AT THEIR BASE. A cone is built centred on its own
  // origin, so attaching one at the skull buries half its length inside the head
  // and only the outer half shows — which is why the buffalo's horns read as two
  // small bumps rather than a sweep. Translating the geometry first means the
  // stated length is the length you actually see.
  const spike = (r, len, seg) => {
    const geo = new THREE.ConeGeometry(r, len, seg);
    geo.translate(0, len / 2, 0);
    return geo;
  };

  if (ears) for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(spike(ears.r * h, ears.h * h, 5), mat);
    m.name = 'ear';
    m.position.set(sx * ears.x * h, bodyY + ears.up * h, ears.fwd * h);
    // NOTE THE SIGN. Rotating +y about +z by θ sends it toward -x, so the LEFT
    // side (sx = -1) needs a POSITIVE angle to lean outward. Getting this
    // backwards points the pair inward across the skull, which is exactly how
    // the buffalo's horns managed to be invisible in every shot.
    if (ears.tilt) m.rotation.z = -sx * ears.tilt;
    g.add(m);
  }

  if (horns) for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(spike(horns.r * h, horns.len * h, 6), mat);
    m.name = 'horn';
    m.position.set(sx * horns.x * h, bodyY + horns.up * h, horns.fwd * h);
    if (horns.back) m.rotation.x = -horns.back;  // swept back over the skull
    m.rotation.z = -sx * horns.sweep;            // and out to the side — see the sign note above
    g.add(m);
  }

  let strand = null;
  if (tail && tail.kind === 'strand') {
    strand = makeTail({
      segments: tail.segments ?? 7,
      length: tail.length * h,
      thickness: tail.thickness * h,
      color: tail.color ?? color,
      seed,
    });
    strand.group.position.set(0, bodyY + tail.up * h, -tail.back * h);
    g.add(strand.group);
  } else if (tail && tail.kind === 'stiff') {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(tail.r0 * h, tail.r1 * h, tail.length * h, 6), mat);
    m.name = 'tail';
    m.position.set(0, bodyY + tail.up * h, -tail.back * h);
    m.rotation.x = tail.tilt ?? -1.0;
    g.add(m);
  }

  return { group: g, tail: strand, material: mat };
}
