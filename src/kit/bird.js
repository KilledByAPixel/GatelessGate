import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';

// One bird, in flight. The flock in birds.js drives a school of these across
// the sky; this file is only the body and how it beats its wings.
//
// Kept deliberately simple. An earlier pass gave it a spindle body, a head, a
// beak, a tail and little legs, and it read as fiddly and wrong — the head too
// big, the legs pointless on a bird that only flies, the wings too sharp
// (Frank). The flat two-stroke chevron it replaced was almost better. So this
// is barely more than that chevron: a small flattened body, a hint of a head,
// a short tail, and two broad blunt wings. No legs, no beak.
//
// Three meshes — one merged body and two wings — no outline (an inverted hull
// on a shape this thin reads as a blot). The body is baked into one mesh; only
// the wings move.

function bodyGeometry(s) {
  const parts = [];

  // the body: a short, flattened teardrop along z — full at the breast,
  // tapering to the tail. No neck, no separate head sticking up.
  const body = new THREE.SphereGeometry(0.16 * s, 8, 6);
  body.scale(1, 0.7, 2.5);                   // long and flat, not a ball
  parts.push(body);

  // just a suggestion of a head: a small low bump at the front, not a sphere
  // on a neck
  const head = new THREE.SphereGeometry(0.09 * s, 6, 5);
  head.scale(1, 0.85, 1.1);
  head.translate(0, 0.02 * s, 0.42 * s);
  parts.push(head);

  // a short tail fanned flat behind
  const tail = new THREE.ConeGeometry(0.14 * s, 0.30 * s, 3);
  tail.rotateX(-Math.PI / 2);
  tail.scale(1, 0.22, 1);
  tail.translate(0, 0.02 * s, -0.5 * s);
  parts.push(tail);

  return mergeSimple(parts);
}

// a wing: a broad blunt paddle, hinged at the root (x = 0). Two triangles make
// a quad with a rounded-off outer edge rather than one sharp point (Frank: the
// wings were too pointy).
function wingGeometry(s, side) {
  const g = new THREE.BufferGeometry();
  const t = side;
  const v = new Float32Array([
    // inner edge, at the body
    0, 0, 0.16 * s,          // root front
    0, 0, -0.20 * s,         // root back
    0.60 * s * t, 0, -0.12 * s,   // outer back
    // and the front half of the paddle
    0, 0, 0.16 * s,          // root front
    0.60 * s * t, 0, -0.12 * s,   // outer back
    0.52 * s * t, 0, 0.08 * s,    // outer front — blunts the tip
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
    w.position.set(side * 0.08 * size, 0.02 * size, 0.02 * size);
    const mesh = new THREE.Mesh(wingGeometry(size, side), mat);
    mesh.name = 'bird-wing';
    mesh.userData.noOutline = true;
    w.add(mesh);
    g.add(w);
    wings.push({ hinge: w, side });
  }

  // Pose the bird in flight. `flap` is the up/down beat in radians; `pitch` and
  // `roll` tilt and bank the whole body. Wings are always out — this bird only
  // flies — so there is no fold any more.
  function pose({ flap = 0, pitch = 0, roll = 0 } = {}) {
    g.rotation.x = pitch;
    g.rotation.z = roll;
    for (const { hinge, side } of wings) {
      hinge.rotation.z = -side * (0.12 + flap);        // a slight dihedral, plus the beat
    }
  }
  pose();

  return { group: g, pose };
}
