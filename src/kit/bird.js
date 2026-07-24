import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';

// One bird, posed. The flock in birds.js builds and drives a school of these;
// this file is only the body and how it holds itself.
//
// The old bird was a flat four-vertex chevron — two strokes, which reads as a
// smear the moment it is anything but tiny and dead-on (Frank: the ones in the
// sky are hard to see, and the shape could be better). This one has a real
// silhouette: a spindle body with a head, a beak and a tail, and two wings that
// fold against it on the ground and sweep out to beat in the air.
//
// Budget is the constraint — a scene like case 34 is already near the 150-draw
// line — so everything that never moves on its own (body, head, beak, tail, the
// stub legs) is baked into ONE merged mesh, and only the two wings are separate.
// Three meshes a bird, no outline (an inverted hull on a shape this small and
// thin reads as a blot).
//
// The bird is authored HORIZONTAL, nose along +z, as if in level flight. To
// stand it the flock pitches the whole group nose-up; to peck it drops that
// pitch so the beak dips to the ground. So one small set of primitives serves
// both the flying and the grounded life without a second model.

function bodyGeometry(s) {
  const parts = [];

  // the body: a tapered spindle along z, fuller at the breast than the tail
  const body = new THREE.CylinderGeometry(0.16 * s, 0.06 * s, 0.9 * s, 7);
  body.rotateX(Math.PI / 2);                 // lay it along +z
  body.scale(1, 0.82, 1);                    // a touch flatter than round
  parts.push(body);

  // the head, set forward and a little high
  const head = new THREE.SphereGeometry(0.17 * s, 8, 6);
  head.translate(0, 0.06 * s, 0.42 * s);
  parts.push(head);

  // a short beak
  const beak = new THREE.ConeGeometry(0.05 * s, 0.18 * s, 5);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.05 * s, 0.60 * s);
  parts.push(beak);

  // the tail: a flat wedge trailing back and slightly up
  const tail = new THREE.ConeGeometry(0.16 * s, 0.34 * s, 3);
  tail.rotateX(-Math.PI / 2);
  tail.scale(1, 0.3, 1);
  tail.translate(0, 0.05 * s, -0.62 * s);
  parts.push(tail);

  // two stub legs — barely there, enough to plant it when it stands
  for (const side of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.22 * s, 4);
    leg.translate(side * 0.06 * s, -0.20 * s, -0.02 * s);
    parts.push(leg);
  }

  return mergeSimple(parts);
}

// a single wing: a swept triangle, hinged at its root (x = 0) so a rotation
// about z lifts and drops it, and the flock can fold it flat to the body
function wingGeometry(s, side) {
  const g = new THREE.BufferGeometry();
  const tip = 0.66 * s * side;
  const v = new Float32Array([
    0, 0, 0.14 * s,                          // root, forward
    0, 0, -0.20 * s,                         // root, back
    tip, 0, -0.06 * s,                       // tip, swept back
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export function makeBird({ size = 0.5, color, seed = 0 } = {}) {
  const g = new THREE.Group();
  g.name = 'bird';
  const mat = toonMaterial({ color, flat: true });
  mat.side = THREE.DoubleSide;

  const body = new THREE.Mesh(bodyGeometry(size), mat);
  body.name = 'bird-body';
  body.userData.noOutline = true;
  g.add(body);

  const wings = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group();                       // hinge at the shoulder
    w.position.set(side * 0.10 * size, 0.04 * size, 0.02 * size);
    const mesh = new THREE.Mesh(wingGeometry(size, side), mat);
    mesh.name = 'bird-wing';
    mesh.userData.noOutline = true;
    w.add(mesh);
    g.add(w);
    wings.push({ hinge: w, side });
  }

  // Pose the bird. All inputs are plain numbers the flock computes:
  //   spread  0 = wings folded flat along the body, 1 = held out to fly
  //   flap    radians of up/down beat added on top of the spread
  //   pitch   nose-up tilt of the whole bird (0 flying level, up to stand/peck)
  //   roll    bank, for turns in the air
  function pose({ spread = 1, flap = 0, pitch = 0, roll = 0 } = {}) {
    g.rotation.x = pitch;
    g.rotation.z = roll;
    for (const { hinge, side } of wings) {
      // folded: swung back and down against the body; spread: out level, beating
      hinge.rotation.y = (1 - spread) * side * 1.15;   // sweep back when folded
      hinge.rotation.z = -side * (spread * 0.15 + (1 - spread) * 0.75 + flap);
    }
  }
  pose();

  return { group: g, pose };
}
