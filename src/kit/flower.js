import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { ACCENT, WASH } from '../palette.js';

// The lotus the Buddha holds up on Vulture Peak (case 6). Two rings of pointed
// petals around a seed pod: the outer ring splayed nearly flat, the inner ring
// still cupping. That layering is what separates a lotus from a daisy at this
// level of abstraction — a single ring of blobs reads as neither.
//
// It is deliberately large. The whole case is one silent gesture, and the object
// being gestured with has to carry the shot; the first pass was small enough to
// vanish against the robe.
//
// `height` is the stem, `bloom` the petal length — decoupled so the flower can
// be held at waist height without shrinking the blossom to match.
// dropPetal() detaches one petal for the scene to drift downward.
export function makeFlower({
  height = 0.5, bloom = null, petals = 7, color = ACCENT, seed = 6,
} = {}) {
  const g = new THREE.Group();
  g.name = 'flower';
  const H = height;
  const B = bloom ?? H * 0.66;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05 * B, 0.075 * B, H, 6),
    toonMaterial({ color: WASH.dark, flat: true }));
  stem.name = 'stem';
  stem.position.y = H / 2;
  g.add(stem);

  // the seed pod at the heart of the bloom
  const pod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26 * B, 0.17 * B, 0.18 * B, 9),
    toonMaterial({ color: WASH.mid, flat: true }));
  pod.name = 'pod';
  pod.position.y = H;
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
      const geo = new THREE.ConeGeometry(ring.r * B, len, 5);
      geo.translate(0, len / 2, 0);          // hinge at the base so it tips from the pod
      geo.scale(1, 1, 0.40);                 // flatten a cone into a petal
      const petal = new THREE.Mesh(geo, petalMat);
      petal.name = 'petal';
      petal.position.set(0, H, 0);
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
