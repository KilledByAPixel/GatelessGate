import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';

// One bird, in flight. The flock in birds.js drives a school of these across
// the sky; this file is only the body and how it beats its wings.
//
// Kept deliberately simple. An earlier pass gave it a spindle body, a head, a
// beak, a tail and little legs, and it read as fiddly and wrong — the head too
// big, the legs pointless on a bird that only flies, the wings too sharp. The
// flat two-stroke chevron it replaced was almost better. So this is barely more
// than that chevron: one body that runs from beak to tail, and two broad blunt
// wings. No legs.
//
// Three meshes — one body and two wings. Only the wings move.
//
// THE BODY IS ONE FORM. It was four primitives pushed together — an ellipsoid,
// a ball for the head, a cone, a plate — and where the ball met the ellipsoid
// the outline pinched to a neck, so from the side it read as a bead on the end
// of a sausage. A bird in flight has no neck to see: the head is the front of
// the body. So the body is lofted from one profile, and the only step in it is
// the one that sets the beak off from the face.
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

// The body's profile, beak to tail, in units of size:
// [z, halfWidth (x), halfHeight (y), centre height]. Read it as three masses
// with no gap between them — a small head, a breast that is the fullest
// station, and a tail that flattens and FANS, wider at its trailing edge than
// where it leaves the rump. The head stays clearly the smaller mass (the
// too-big head is the mistake the note above records) but the station behind
// it is no thinner than the head itself, which is what keeps a neck from
// appearing.
const PROFILE = [
  [0.520, 0.026, 0.024, 0.016],   // beak base — the tip is the loft's nose point
  [0.495, 0.070, 0.060, 0.030],   // face: the one step, so the beak reads as a beak
  [0.420, 0.095, 0.082, 0.036],   // head
  [0.330, 0.100, 0.082, 0.030],   // nape and throat — carried through, not pinched
  [0.200, 0.140, 0.105, 0.010],   // shoulder, where the wings root
  [0.060, 0.155, 0.112, 0.000],   // breast — the fullest station
  [-0.100, 0.135, 0.095, 0.004],
  [-0.240, 0.095, 0.060, 0.010],
  [-0.340, 0.070, 0.028, 0.016],  // rump
  [-0.400, 0.085, 0.014, 0.018],  // tail root, already flat
  [-0.540, 0.150, 0.009, 0.018],  // tail's trailing edge
];
const BEAK_TIP = [0.62, 0.012];   // [z, y]
const RING = 8;

function bodyGeometry(s) {
  const pos = [0, BEAK_TIP[1] * s, BEAK_TIP[0] * s];
  for (const [z, w, h, cy] of PROFILE) {
    for (let j = 0; j < RING; j++) {
      const a = (j / RING) * Math.PI * 2;
      pos.push(Math.cos(a) * w * s, (cy + Math.sin(a) * h) * s, z * s);
    }
  }
  const end = PROFILE[PROFILE.length - 1];
  pos.push(0, end[3] * s, end[0] * s);
  const tailC = pos.length / 3 - 1;

  const idx = [];
  for (let j = 0; j < RING; j++) idx.push(0, 1 + ((j + 1) % RING), 1 + j);
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const a = 1 + i * RING, b = a + RING;
    for (let j = 0; j < RING; j++) {
      const j2 = (j + 1) % RING;
      idx.push(a + j, a + j2, b + j, a + j2, b + j2, b + j);
    }
  }
  const last = 1 + (PROFILE.length - 1) * RING;
  for (let j = 0; j < RING; j++) idx.push(tailC, last + j, last + ((j + 1) % RING));

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A wing, hinged at the root (x = 0), as [span (x), lift (y), chord (z)] in
// units of size. Two parts in one mesh, creased where they meet:
//
//   the ARM, root to wrist — it carries the chord out from the body and its
//   leading edge runs FORWARD to the wrist, which is the one thing that turns a
//   plank into a wing from above;
//   the HAND, wrist to tip — swept back and tapering to a blunt three-point
//   tip. Blunt on purpose: a single sharp point is the too-pointy wing the note
//   at the top records.
//
// The wrist also stands a little above the root and the tip, so the wing is a
// shallow bent line seen edge-on rather than a plane that vanishes when the
// camera is level with it. That is fixed shape, not motion: the beat is still
// the hinge and nothing else.
const WING = {
  rootFront: [0.00, 0.000, 0.17],
  wristFront: [0.34, 0.045, 0.22],
  tipFront: [0.72, 0.005, 0.07],
  tip: [0.84, -0.025, -0.05],
  tipBack: [0.74, 0.000, -0.15],
  wristBack: [0.36, 0.040, -0.16],
  rootBack: [0.00, 0.000, -0.22],
};
function wingGeometry(s, side) {
  const W = WING;
  const tris = [
    // the arm
    W.rootFront, W.wristFront, W.wristBack,
    W.rootFront, W.wristBack, W.rootBack,
    // the hand, fanned from the wrist's leading corner
    W.wristFront, W.tipFront, W.tip,
    W.wristFront, W.tip, W.tipBack,
    W.wristFront, W.tipBack, W.wristBack,
  ];
  const v = [];
  for (const [x, y, z] of tris) v.push(x * s * side, y * s, z * s);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
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
