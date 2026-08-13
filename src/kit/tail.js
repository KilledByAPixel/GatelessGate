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
  // animal's own flank, and a swish then swings it THROUGH the body — Frank, on
  // the buffalo: "it kinda flips around, like, rotates around inside its body...
  // at least for the first segment of the tail, try to aim it up, tilt it out
  // so that it's not away from the body, so it's gonna kind of whip outwards."
  //
  // Pinning the SECOND node as well, at a chosen offset from the first, is the
  // whole of the fix: the root segment becomes a rigid stub held wherever the
  // caller aims it, the rest of the strand hangs and whips from the end of that
  // stub, and there is no force fighting gravity to keep it there. Null (the
  // default) pins only the top node and is byte-identical to the tail every
  // existing caller already has.
  root = null,
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
  const segs = [];
  // Segments are cut LONGER than their node spacing (still centred between
  // their nodes), so neighbours overlap into each other at every joint and
  // a bend never opens daylight. This replaced a merged joint ball — even
  // trimmed flush it beaded the tail ("weird balls appearing in the
  // joints" — Frank); plain overlap covers the same gap while adding
  // nothing to the silhouette.
  const OVERLAP = 1.35;
  for (let i = 0; i < segments - 1; i++) {
    const r0 = thickness * (1 - i / segments);
    const r1 = thickness * (1 - (i + 1) / segments);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, spacing * OVERLAP, 6), mat);
    m.name = 'seg';
    segs.push(m);
    group.add(m);
  }

  const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion();
  function layout() {
    const p = cloth.positions;
    for (let i = 0; i < segs.length; i++) {
      a.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      b.set(p[(i + 1) * 3], p[(i + 1) * 3 + 1], p[(i + 1) * 3 + 2]);
      mid.addVectors(a, b).multiplyScalar(0.5);
      segs[i].position.copy(mid);
      dir.subVectors(b, a);
      const len = dir.length() || 1e-6;
      dir.multiplyScalar(1 / len);
      q.setFromUnitVectors(up, dir);          // cylinder Y-axis -> segment direction
      segs[i].quaternion.copy(q);
      segs[i].scale.y = len / spacing;        // geometry is spacing*OVERLAP long, so the overlap rides the stretch
    }
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
