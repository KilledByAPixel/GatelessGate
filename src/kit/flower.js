import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
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
    toonMaterial({ color: WASH.dark, flat: true }));
  stem.name = 'stem';
  g.add(stem);

  // the seed pod at the heart of the bloom, riding the stem's real tip
  const pod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26 * B, 0.17 * B, 0.18 * B, 9),
    toonMaterial({ color: WASH.mid, flat: true }));
  pod.name = 'pod';
  pod.position.copy(TIP);
  g.add(pod);

  const petalMat = toonMaterial({ color, flat: true, side: THREE.DoubleSide });
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

  g.dropPetal = () => {
    const petal = g.children.find((c) => c.name === 'petal');
    if (!petal) return null;
    const world = petal.getWorldPosition(new THREE.Vector3()); // resolves the full ancestor chain
    g.remove(petal);
    petal.position.copy(world);   // correct once the caller adds it to the scene root
    return petal;
  };
  return g;
}
