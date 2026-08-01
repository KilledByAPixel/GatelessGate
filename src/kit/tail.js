import * as THREE from '../../lib/three.module.js';
import { createCloth, stepCloth, clothEnergy } from '../sim/verlet.js';
import { noise3 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';
import { INK } from '../palette.js';

// A hanging tail: the verlet cloth as a 1-column strand, pinned at the root.
// Reused by the buffalo (case 37). A tap swishes it; it never breaks free.
export function makeTail({ segments = 7, length = 1.0, thickness = 0.06, color = INK, seed = 3, warmup = 90 } = {}) {
  const spacing = length / (segments - 1);
  const cloth = createCloth(1, segments, spacing, (c, r) => r === 0); // pin the top node
  const group = new THREE.Group();
  group.name = 'tail';
  group.userData.cloth = cloth;

  const mat = toonMaterial({ color, flat: true });
  const segs = [];
  for (let i = 0; i < segments - 1; i++) {
    const r0 = thickness * (1 - i / segments);
    const r1 = thickness * (1 - (i + 1) / segments);
    // a joint ball merged at the segment's thick (upper) end: two cylinders
    // meeting at a bend open a wedge of daylight at every joint of the
    // strand (Frank, on tails generally) — the ball keeps each node covered
    // however the verlet folds it, for zero extra meshes
    const ball = new THREE.SphereGeometry(r0, 6, 5);   // was r0*1.05 — proud of the cylinder wall, it beaded the tail (Frank)
    ball.translate(0, spacing / 2, 0);
    const m = new THREE.Mesh(
      mergeSimple([new THREE.CylinderGeometry(r1, r0, spacing, 6), ball]), mat);
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
      segs[i].scale.y = len / spacing;
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
      p[tip * 3] += 0.35 * strength;            // shove sideways; verlet reads it as velocity
      p[tip * 3 + 2] += 0.2 * strength;
    },
    energy() { return clothEnergy(cloth); },
  };
}
