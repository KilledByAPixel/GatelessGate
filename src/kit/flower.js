import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { hash1 } from '../util/noise.js';
import { ACCENT, WASH } from '../palette.js';

// The lotus the Buddha holds up on Vulture Peak (case 6) and the single bloom
// set down before the seat in case 32. It is deliberately large — the whole
// case is one silent gesture, and the object being gestured with has to carry
// the shot, the same way case 3's raised finger has to read at a glance.
//
// Petals are flat PLANES (a petal-shaped outline, not a rectangle — see
// petalShape below), not the flattened cones the first pass used: a cone's
// round cross-section reads as a spike from any angle, and twelve of them
// close up read as a red starburst rather than a flower. A plane is a single
// flat leaf, DoubleSide (the koi lesson — a one-sided flat surface disappears
// the moment the camera crosses to its back), and its outline is a real
// petal silhouette: narrow at the pod, widest a third of the way out,
// tapered to a point at the tip.
//
// Two LAYERS of them around the seed pod — the outer ring splayed nearly
// flat, the inner ring still cupping — is what separates a lotus from a
// daisy at this level of abstraction; a single ring of petals reads as
// neither. Outer/inner counts (7 and petals-2 = 5) satisfy the case's own
// "innumerable" language without spending more draw budget than one mesh.
//
// The stem is a real CURVE (TubeGeometry along a shallow bow), not a straight
// cylinder standing to attention — a held flower's stem always has some bend
// to it, and the bloom sits wherever that curve's own tip lands, not at a
// fixed (0, H, 0) forced back onto the stem's base axis.
//
// `height` is the stem, `bloom` the petal length — decoupled so the flower can
// be held at waist height without shrinking the blossom to match.
// dropPetal() detaches one petal for the scene to drift downward.

// (t, half-width) control points, base -> tip, both as fractions of the
// petal's own length/width — a low-poly teardrop, not a smooth curve: narrow
// at the hinge, bulges a third of the way out, tapers to a point.
const PETAL_PROFILE = [
  [0.00, 0.00],
  [0.12, 0.34],
  [0.34, 0.62],
  [0.60, 0.56],
  [0.84, 0.28],
  [1.00, 0.00],
];

function petalShape(len, width) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (const [t, w] of PETAL_PROFILE) shape.lineTo(-w * width * 0.5, t * len);
  for (let i = PETAL_PROFILE.length - 2; i >= 1; i--) {
    const [t, w] = PETAL_PROFILE[i];
    shape.lineTo(w * width * 0.5, t * len);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export function makeFlower({
  height = 0.5, bloom = null, petals = 7, color = ACCENT, seed = 6,
} = {}) {
  const g = new THREE.Group();
  g.name = 'flower';
  const H = height;
  const B = bloom ?? H * 0.66;

  // A shallow bow, not a ramrod-straight stalk — leans toward local +x by the
  // tip, seeded so different flowers (k6's and k32's, different seeds) bow a
  // different amount rather than sharing one identical curve.
  const lean = (0.10 + 0.10 * hash1(0, seed)) * H;
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.55, H * 0.52, 0),
    new THREE.Vector3(lean, H, 0),
  ]);
  const TIP = stemCurve.getPoint(1);   // where the bloom actually sits — the
                                        // curve's own tip, not a fixed (0,H,0)
  const stem = new THREE.Mesh(
    new THREE.TubeGeometry(stemCurve, 10, 0.06 * B, 6, false),
    washMaterial({ color: WASH.dark, flat: true }));
  stem.name = 'stem';
  g.add(stem);

  // the seed pod at the heart of the bloom, riding the stem's real tip
  const pod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1 * B, 0.02 * B, 0.18 * B, 9),
    washMaterial({ color: WASH.deep, flat: true }));
  pod.name = 'pod';
  pod.position.copy(TIP);
  g.add(pod);

  const petalMat = washMaterial({ color, flat: true, side: THREE.DoubleSide });
  const RINGS = [
    { n: petals, tilt: 1.16, len: 1.00, r: 0.26, phase: 0 },        // outer, opened out
    { n: petals - 2, tilt: 0.60, len: 0.82, r: 0.23, phase: 0.5 },  // inner, still cupped
  ];
  let idx = 0;
  for (const ring of RINGS) {
    for (let i = 0; i < ring.n; i++) {
      const len = B * ring.len;
      const width = B * ring.r * 2.3;
      const geo = petalShape(len, width);
      const petal = new THREE.Mesh(geo, petalMat);
      petal.name = 'petal';
      petal.position.copy(TIP);
      // yaw around the pod first, THEN tip outward about the yawed local X, so
      // every petal leans radially rather than all of them leaning one way
      petal.rotateY(((i + ring.phase) / ring.n) * Math.PI * 2);
      petal.rotateX(ring.tilt + (hash1(idx, seed) - 0.5) * 0.16);
      idx++;
      g.add(petal);
    }
  }

  // Detach one petal, KEEPING THE POSE IT WAS WEARING. Position alone was not
  // enough: a petal is yawed around the pod and tipped outward, and the flower
  // above it is itself turning (case 6 spins the bloom), so handing back only
  // the world POSITION left the petal's local rotation to be reinterpreted
  // against the scene root — it snapped to a different attitude on the frame it
  // came off and read as being spat out of the middle of the bloom, born
  // inside the flower rather than falling off it. World quaternion and scale
  // come with it now, so the
  // first frame after release is pixel-identical to the last frame before it
  // and the fall starts from where the petal actually was.
  //
  // The caller must add it to the SCENE ROOT; that is the frame these are in.
  g.dropPetal = () => {
    const petal = g.children.find((c) => c.name === 'petal');
    if (!petal) return null;
    petal.updateWorldMatrix(true, false);          // the full ancestor chain, this frame's
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    petal.matrixWorld.decompose(pos, quat, scale);
    g.remove(petal);
    petal.position.copy(pos);
    petal.quaternion.copy(quat);
    petal.scale.copy(scale);
    return petal;
  };
  return g;
}
