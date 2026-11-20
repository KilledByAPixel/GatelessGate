import * as THREE from '../../lib/three.module.js';
import { createCloth, stepCloth, clothEnergy } from '../sim/verlet.js';
import { noise3 } from '../util/noise.js';
import { washMaterial } from '../render/material.js';
import { INK_LIT } from '../palette.js';

// A hanging tail: the verlet cloth as a 1-column strand, pinned at the root.
// Reused by the buffalo (case 37). A tap swishes it; it never breaks free.
export function makeTail({
  segments = 7, length = 1.0, thickness = 0.06, color = INK_LIT, seed = 3, warmup = 90,
  // WHERE THE TAIL LEAVES THE BODY, as a direction for its first segment.
  //
  // A strand pinned at one node and left to gravity hangs straight down the
  // animal's own flank, and a swish then swings it THROUGH the body — the
  // buffalo's rotated around inside its own barrel. Aim the first segment up
  // and out instead, so the tail whips clear of the flank.
  //
  // Pinning the SECOND node as well, at a chosen offset from the first, is the
  // whole of the fix: the root segment becomes a rigid stub held wherever the
  // caller aims it, the rest of the strand hangs and whips from the end of that
  // stub, and there is no force fighting gravity to keep it there. Null (the
  // default) pins only the top node and is byte-identical to the tail every
  // existing caller already has.
  root = null,
  // HOW FULL THE STRAND IS, past its plain taper: 0 (the default) is the thin
  // whip every existing caller has; above it the strand fattens toward its
  // middle and still closes to the same tip, which is a tail of hair rather
  // than a tail of rope.
  swell = 0,
} = {}) {
  const spacing = length / (segments - 1);
  // pin the top node — and the second one too when the caller aims the root
  const cloth = createCloth(1, segments, spacing, (c, r) => r === 0 || (root && r === 1));
  if (root) {
    // the stub's far end, one spacing along the aim, and its `prev` with it so
    // verlet reads the node as having always been there rather than as having
    // just been thrown
    const d = new THREE.Vector3(root[0], root[1], root[2]);
    if (d.lengthSq() < 1e-12) d.set(0, -1, 0);
    d.normalize().multiplyScalar(spacing);
    cloth.positions[3] = cloth.positions[0] + d.x;
    cloth.positions[4] = cloth.positions[1] + d.y;
    cloth.positions[5] = cloth.positions[2] + d.z;
    cloth.prev.set(cloth.positions);
  }
  // HOW MUCH OF THE WHIP IS ALONG Z, and the answer for an aimed root is none.
  // Swept against how far forward of its own root the strand travels — forward
  // being into the animal, which is what "swinging through the body" looks
  // like — over two swishes, at 0.5 length:
  //
  //   no aim, whip forward (the original)   reach z = 0.227,  sideways 0.439
  //   aimed root, whip forward              reach z = 0.125,  sideways 0.366
  //   aimed root, whip BACK                 reach z = 0.157,  sideways 0.375
  //   aimed root, whip FLAT                 reach z = 0.000,  sideways 0.423
  //
  // Flat wins twice over: the tail never crosses forward of its root at all,
  // and it sweeps WIDER doing it, because none of the shove is being spent
  // fighting the strand's own hang. Whipping backward is worse than forward —
  // it swings out and rebounds further in, which is a pendulum doing what
  // pendulums do. An unaimed tail keeps the old push exactly.
  const whipZ = root ? 0 : 1;
  const group = new THREE.Group();
  group.name = 'tail';
  group.userData.cloth = cloth;

  const mat = washMaterial({ color, flat: true });
  // THE STRAND IS ONE SKIN over the nodes, not a cylinder per segment. Separate
  // cylinders were each turned to their own segment by the shortest rotation
  // from straight up, and a tail hangs straight DOWN — the one direction that
  // rotation is undefined for — so every small sway spun each piece about its
  // own length, independently of its neighbours, and the facets crawled round
  // the tail. Overlapping the pieces to hide the joints also left each one's
  // end standing out of the next at a bend, which beaded a full tail. A ring
  // at every node, each carried from the one above it, has neither problem:
  // the facets run unbroken root to tip and a bend is just a bend.
  const SIDES = 6;
  const radiusAt = (k) => thickness * (1 - k / segments)
    * (1 + swell * Math.sin(Math.PI * 0.9 * k / (segments - 1)));
  const radii = [];
  for (let i = 0; i < segments; i++) radii.push(radiusAt(i));
  const pos = new Float32Array((segments * SIDES + 2) * 3);
  const idx = [];
  for (let i = 0; i < segments - 1; i++) {
    const r0 = i * SIDES, r1 = r0 + SIDES;
    for (let j = 0; j < SIDES; j++) {
      const j2 = (j + 1) % SIDES;
      idx.push(r0 + j, r0 + j2, r1 + j, r0 + j2, r1 + j2, r1 + j);
    }
  }
  // both ends fanned shut: the root is buried in the animal, but a species may
  // re-aim the group and a closed mesh has nothing to hide either way
  const rootApex = segments * SIDES, tipApex = rootApex + 1;
  const lastRing = (segments - 1) * SIDES;
  for (let j = 0; j < SIDES; j++) {
    const j2 = (j + 1) % SIDES;
    idx.push(rootApex, j2, j);
    idx.push(tipApex, lastRing + j, lastRing + j2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const skin = new THREE.Mesh(geo, mat);
  skin.name = 'strand';
  group.add(skin);

  const tan = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3();
  function layout() {
    const p = cloth.positions;
    // The first ring's side axis is the animal's own left-right, and each ring
    // after it takes the one before's, squared up to its own direction — so the
    // skin's twist is settled once at the root and never by a node's own sway.
    nrm.set(1, 0, 0);
    for (let i = 0; i < segments; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(segments - 1, i + 1) * 3;
      tan.set(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
      if (tan.lengthSq() < 1e-12) tan.set(0, -1, 0);
      tan.normalize();
      nrm.addScaledVector(tan, -nrm.dot(tan));
      if (nrm.lengthSq() < 1e-8) nrm.set(0, 0, 1).addScaledVector(tan, -tan.z);
      nrm.normalize();
      bin.crossVectors(tan, nrm);
      const r = radii[i];
      for (let j = 0; j < SIDES; j++) {
        const t = (j / SIDES) * Math.PI * 2;
        const c = Math.cos(t) * r, sn = Math.sin(t) * r;
        const o = (i * SIDES + j) * 3;
        pos[o] = p[i * 3] + nrm.x * c + bin.x * sn;
        pos[o + 1] = p[i * 3 + 1] + nrm.y * c + bin.y * sn;
        pos[o + 2] = p[i * 3 + 2] + nrm.z * c + bin.z * sn;
      }
    }
    const tip = (segments - 1) * 3;
    pos.set([p[0], p[1], p[2], p[tip], p[tip + 1], p[tip + 2]], rootApex * 3);
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
  }
  layout();

  function update(dt, simTime) {
    const t = simTime * 0.8;
    stepCloth(cloth, dt, {
      gravity: [0, -6.0, 0],
      iterations: 5,
      damping: 0.98,
      force: (x, y, z, i) => {
        // a barely-there idle sway so the tail is never dead
        const s = (noise3(y * 0.6 + t, i * 0.3, t * 0.7, seed) - 0.5) * 1.2;
        return [s, 0, s * 0.6];
      },
    });
    layout();
  }

  // Settle before the tail is ever seen. A freshly built strand is motionless
  // and perfectly straight, so its first visible frames would be a drop into
  // place. Deterministic: fixed dt over a fixed simTime ramp.
  for (let i = 0; i < warmup; i++) update(1 / 60, i / 60);

  return {
    group,
    update,
    // the strand's nodes, root to tip, in the group's own frame: [x, y, z] each
    nodes() {
      const p = cloth.positions, out = [];
      for (let i = 0; i < segments; i++) out.push([p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]);
      return out;
    },
    impulse(strength = 1) {
      const p = cloth.positions;
      const tip = segments - 1;
      // Shove sideways; verlet reads a moved position as velocity. The second
      // component used to be a flat +0.2 in z, which on an animal whose front
      // is +z pushes the tip INTO the body — half of why the buffalo's tail
      // read as swinging through itself. Where the caller has aimed the root,
      // the whip follows that aim OUTWARD instead, so a swish leaves the animal
      // rather than crossing it. With no aim it is the old push exactly.
      p[tip * 3] += 0.35 * strength;
      p[tip * 3 + 2] += 0.2 * strength * whipZ;
    },
    energy() { return clothEnergy(cloth); },
  };
}
