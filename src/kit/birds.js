import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { WASH } from '../palette.js';

// Birds — the ones singing among Fuketsu's fragrant flowers (case 24), and the
// ones Nansen's scattered words turn into (case 34).
//
// In ink painting a distant bird is two strokes, so that is exactly what one
// is here: a four-vertex chevron, no outline (an inverted hull on a two-
// triangle shell reads as a smear), drawn dark and small against the paper.
//
// Every bird flies a closed form over the simTime handed to update() — a
// seeded ellipse with its own centre, rate and height, so nothing is stored
// between frames and the flock is identical run to run. scatter() adds a
// decaying burst of energy: while it lasts they climb, widen, and beat faster.

const TAU_E = 2.6;       // e-folding of a scatter, in seconds
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function chevronGeometry(size) {
  const S = size;
  const g = new THREE.BufferGeometry();
  // nose forward (+z), wingtips swept back and slightly up, a short tail
  const v = new Float32Array([
    0, 0, 0.30 * S, -0.52 * S, 0.07 * S, -0.22 * S, 0, 0, -0.08 * S,
    0, 0, 0.30 * S, 0, 0, -0.08 * S, 0.52 * S, 0.07 * S, -0.22 * S,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export function makeBirds({
  count = 7,
  seed = 24,
  size = 0.42,
  color = WASH.deep,
  center = [0, 0],
  height = 6.2,
  spread = 5.0,
  rate = 0.20,
} = {}) {
  const g = new THREE.Group();
  g.name = 'birds';

  const geo = chevronGeometry(size);
  const mat = toonMaterial({ color, flat: true });
  mat.side = THREE.DoubleSide;

  const flock = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.name = 'bird';
    m.userData.noOutline = true;
    g.add(m);
    flock.push({
      mesh: m,
      phase: hash1(i * 5 + 1, seed) * Math.PI * 2,
      radius: spread * (0.55 + hash1(i * 5 + 2, seed) * 0.75),
      rate: rate * (0.7 + hash1(i * 5 + 3, seed) * 0.7),
      y: height + (hash1(i * 5 + 4, seed) - 0.5) * 2.6,
      cx: center[0] + (hash1(i * 5 + 5, seed) - 0.5) * spread * 0.5,
      cz: center[1] + (hash1(i * 5 + 6, seed) - 0.5) * spread * 0.5,
      dir: hash1(i * 5 + 7, seed) < 0.3 ? -1 : 1,
      beat: 5.5 + hash1(i * 5 + 8, seed) * 2.5,
    });
  }

  let clock = 0;
  const bursts = [];

  function energy() {
    let e = 0;
    for (const t0 of bursts) if (clock >= t0) e += Math.exp(-(clock - t0) / TAU_E);
    return clamp(e, 0, 3);
  }

  function pose() {
    const E = energy();
    for (const b of flock) {
      const a = b.phase + clock * b.rate * b.dir * (1 + E * 1.15);
      const r = b.radius * (1 + E * 0.45);
      const x = b.cx + Math.cos(a) * r;
      const z = b.cz + Math.sin(a) * r * 0.78;
      b.mesh.position.set(x, b.y + E * 1.7 + Math.sin(clock * 0.7 + b.phase) * 0.3, z);
      // face along the tangent of the ellipse it is flying
      b.mesh.rotation.y = -a * b.dir + (b.dir > 0 ? 0 : Math.PI);
      // wingbeats read, at this size, as a bank oscillation: the silhouette
      // narrows and widens. Faster while scattered.
      b.mesh.rotation.z = 0.30 * b.dir + Math.sin(clock * b.beat * (1 + E * 0.8) + b.phase) * (0.22 + E * 0.2);
    }
  }
  pose();

  return {
    group: g,
    // something startled them: they climb, widen and quicken, then resettle
    scatter() {
      bursts.push(clock);
      if (bursts.length > 6) bursts.shift();
      pose();
    },
    energy() { return energy(); },
    count() { return flock.length; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      while (bursts.length && clock - bursts[0] > 8 * TAU_E) bursts.shift();
      pose();
    },
  };
}
