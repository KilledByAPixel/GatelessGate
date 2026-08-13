import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';

// One bird, in flight. The flock in birds.js drives a school of these across
// the sky; this file is only the body and how it beats its wings.
//
// Kept deliberately simple. An earlier pass gave it a spindle body, a head, a
// beak, a tail and little legs, and it read as fiddly and wrong — the head too
// big, the legs pointless on a bird that only flies, the wings too sharp.
// The flat two-stroke chevron it replaced was almost better. So this
// is barely more than that chevron: a small flattened body, a head with a
// beak, a short tail, and two broad blunt wings. No legs.
//
// Three meshes — one merged body and two wings. The body is baked into one
// mesh; only the wings move.
//
// The wings FOLD. A flat paddle that only hinges up and down at the shoulder
// reads fine at flock distance but static up close — the close-up single
// earns a real wingbeat: as the stroke nears its peak, the same hinge sweeps
// the wing back and its own mesh foreshortens along its span, the way a real
// wing draws in near the top of the beat before spreading flat again on the
// downstroke. Both are driven off the SAME `flap` value birds.js already
// passes to pose() — no new parameter crosses the update path, and no new
// mesh is added (a wrist joint would cost a second mesh per wing, doubling
// per-bird draws across an 8-9 bird flock for no gain at flock distance).

function bodyGeometry(s) {
  const parts = [];

  // the body: a short, flattened teardrop along z — full at the breast,
  // tapering to the tail. No neck, no separate head sticking up.
  const body = new THREE.SphereGeometry(0.16 * s, 8, 6);
  body.scale(1, 0.7, 2.5);                   // long and flat, not a ball
  parts.push(body);

  // a suggestion of a head: a small bump at the front, not a sphere on a
  // neck — sized up a touch from the first pass (0.09s -> 0.105s) so the
  // close-up single reads as having a head at all, short of the "too big"
  // mistake the header above still warns against.
  const head = new THREE.SphereGeometry(0.105 * s, 7, 5);
  head.scale(1, 0.82, 1.05);
  head.translate(0, 0.025 * s, 0.43 * s);
  parts.push(head);

  // a small beak — just a nub at the front of the head, restored after it went
  // missing. Kept tiny so it reads as a point, not the fiddly cone the earlier
  // detailed bird had.
  const beak = new THREE.ConeGeometry(0.035 * s, 0.14 * s, 4);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.015 * s, 0.555 * s);
  parts.push(beak);

  // a short tail fanned flat behind
  const tail = new THREE.ConeGeometry(0.14 * s, 0.30 * s, 3);
  tail.scale(1, 0.22, 1);
  tail.translate(0, 0.02 * s, -0.4 * s);
  parts.push(tail);

  return mergeSimple(parts);
}

// a wing: a broad blunt paddle, hinged at the root (x = 0). Two triangles make
// a quad with a rounded-off outer edge rather than one sharp point: the wings
// read as too pointy otherwise.
function wingGeometry(s, side) {
  const g = new THREE.BufferGeometry();
  const t = side;
  const v = new Float32Array([
    // inner edge, at the body
    // the span reaches further from the body without getting wider
    0, 0, 0.16 * s,          // root front
    0, 0, -0.20 * s,         // root back
    0.80 * s * t, 0, -0.12 * s,   // outer back
    // and the front half of the paddle
    0, 0, 0.16 * s,          // root front
    0.80 * s * t, 0, -0.12 * s,   // outer back
    0.70 * s * t, 0, 0.08 * s,    // outer front — blunts the tip
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export function makeBird({ size = 0.5, color, seed = 0 } = {}) {
  const g = new THREE.Group();
  g.name = 'bird';
  const mat = washMaterial({ color, flat: true });
  mat.side = THREE.DoubleSide;

  const body = new THREE.Mesh(bodyGeometry(size), mat);
  body.name = 'bird-body';
  g.add(body);

  const wings = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group();                       // hinge at the shoulder
    w.position.set(side * 0.08 * size, 0.02 * size, 0.02 * size);
    const mesh = new THREE.Mesh(wingGeometry(size, side), mat);
    mesh.name = 'bird-wing';
    w.add(mesh);
    g.add(w);
    wings.push({ hinge: w, mesh, side });
  }

  // the flap amplitude birds.js drives in the ordinary (unstartled) case —
  // the reference the fold ramps against. A scatter can push flap past this;
  // fold simply clamps at fully-tucked rather than over-rotating.
  const FLAP_REF = 0.75;

  // Pose the bird in flight. `flap` is the up/down beat in radians; `pitch`
  // and `roll` tilt and bank the whole body. The wings fold as the stroke
  // rises: 0 at the bottom of the beat (fully spread), 1 near the top (swept
  // back toward the tail and foreshortened along its own span) — the same
  // recovery-stroke tuck a real wingbeat makes, entirely a function of flap.
  function pose({ flap = 0, pitch = 0, roll = 0 } = {}) {
    g.rotation.x = pitch;
    g.rotation.z = roll;
    const fold = Math.min(1, Math.max(0, flap / FLAP_REF));
    for (const { hinge, mesh, side } of wings) {
      hinge.rotation.z = -side * (0.12 + flap);        // a slight dihedral, plus the beat
      hinge.rotation.y = side * fold * 0.85;            // sweep back and inward as it tucks
      mesh.scale.x = 1 - fold * 0.4;                    // and foreshorten along the span
    }
  }
  pose();

  return { group: g, pose };
}
