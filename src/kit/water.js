import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';
import { hash1 } from '../util/noise.js';

// A stylized water surface that knows the shape of the thing holding it.
//
// It used to be a flat square plane with a pool of expanding RingGeometry
// meshes laid on top, which had three problems, all of them the same problem:
// the water did not know where its own edge was. A square sheet sat in case 7's
// round basin and cases 30/33's round pond with its corners poking out through
// the stone, and in case 39 a ring started near the bank simply kept growing
// out over the grass (Frank).
//
// So the surface is now a real grid whose tessellation follows the container —
// polar for a round basin or pond, cartesian for an open square of water — and
// the ripples are a HEIGHT FIELD evaluated on its vertices rather than separate
// ring meshes. That fixes all three at once: the rim vertices are anchored, so
// nothing can travel past the wall, and the silhouette is the container's own.
// It also costs ONE draw call instead of seven.
//
// Everything is a closed form over the simTime handed to update() — no
// integration, no stored per-vertex state, no Math.random — so the same taps at
// the same steps give the same water every run.

const SPEED = 1.35;        // how fast a ripple front travels, world units/sec
const WAVELEN = 0.62;      // crest-to-crest, in the same units
const PACKET = 0.42;       // width of the travelling wave packet
const TAU = 1.5;           // seconds for a ripple to fade to nothing
const POOL = 8;            // concurrent ripples before the oldest is reused
const EDGE_BAND = 0.12;    // fraction of the radius over which motion is pinned

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);

// ---- tessellation --------------------------------------------------------
// Both builders lay the surface flat in XZ with y as the displaced axis, so
// nothing has to be rotated afterwards and `heightAt` is a plain lookup.

// A square sheet: (n+1)² vertices over [-half, half].
//
// `edge` is each vertex's distance to the nearest wall, computed HERE from the
// exact grid parameters rather than re-derived from the packed float32
// positions afterwards — that rounding was enough to leave a boundary vertex a
// hair off the wall, and a hair is the difference between "pinned" and "very
// nearly pinned".
function squareGrid(size, n) {
  const half = size / 2;
  const pos = [];
  const idx = [];
  const edge = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const x = -half + (size * j) / n;
      const z = -half + (size * i) / n;
      pos.push(x, 0, z);
      edge.push(Math.min(half - Math.abs(x), half - Math.abs(z)));
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j;
      const b = a + 1;
      const c = a + (n + 1);
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return { pos, idx, edge };
}

// A disc: one centre vertex, then `rings` rings of `spokes` vertices. The
// outermost ring lands exactly ON the circle, which is what lets the rim be
// pinned without any clipping or stair-stepping.
function roundGrid(radius, rings, spokes) {
  const pos = [0, 0, 0];
  const idx = [];
  const edge = [radius];               // the centre is as far from the wall as it gets
  for (let i = 1; i <= rings; i++) {
    const r = (radius * i) / rings;
    for (let j = 0; j < spokes; j++) {
      const a = (j / spokes) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      edge.push(radius - r);           // exactly 0 on the outermost ring
    }
  }
  const ringStart = (i) => 1 + (i - 1) * spokes;   // first vertex of ring i
  for (let j = 0; j < spokes; j++) {               // the centre fan
    idx.push(0, ringStart(1) + ((j + 1) % spokes), ringStart(1) + j);
  }
  for (let i = 1; i < rings; i++) {
    const A = ringStart(i);
    const B = ringStart(i + 1);
    for (let j = 0; j < spokes; j++) {
      const k = (j + 1) % spokes;
      idx.push(A + j, B + k, B + j, A + j, A + k, B + k);
    }
  }
  return { pos, idx, edge };
}

export function makeWater({
  shape = 'square',        // 'square' | 'round'
  size = 2.0,              // full width, or the DIAMETER of a round surface
  color = WASH.ground,
  seed = 7,
  segments = 0,            // 0 picks a sensible density for the size
  swell = 1,               // idle motion, 0 for dead-still water
} = {}) {
  const round = shape === 'round';
  const half = size / 2;
  // enough vertices that a ripple reads as a curve, capped so a big lake does
  // not cost more per frame than it is worth
  const n = segments || Math.max(12, Math.min(30, Math.round(size * 3.2)));
  const { pos, idx, edge } = round
    ? roundGrid(half, Math.max(6, Math.round(n / 2)), Math.max(16, n))
    : squareGrid(size, n);

  const group = new THREE.Group();
  group.name = 'water';

  const geo = new THREE.BufferGeometry();
  const position = new Float32Array(pos);
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = toonMaterial({ color, side: THREE.DoubleSide });
  mat.transparent = true;
  mat.opacity = 0.72;
  const surface = new THREE.Mesh(geo, mat);
  surface.name = 'surface';
  surface.userData.noOutline = true;
  group.add(surface);

  const count = position.length / 3;
  // The rest y of every vertex is 0; we keep the flat plan coordinates and the
  // per-vertex edge mask, both fixed for the life of the surface.
  const px = new Float64Array(count);
  const pz = new Float64Array(count);
  const mask = new Float64Array(count);
  const band = EDGE_BAND * half;
  for (let i = 0; i < count; i++) {
    px[i] = pos[i * 3];
    pz[i] = pos[i * 3 + 2];
    mask[i] = smooth(clamp01(edge[i] / band));
  }

  // Idle swell: two slow crossed waves with seeded phases. Water that is
  // perfectly flat between taps reads as a floor, so there is always a little
  // going on — but only a little.
  const IA = 0.012 * swell;
  const p1 = hash1(1, seed) * Math.PI * 2;
  const p2 = hash1(2, seed) * Math.PI * 2;
  const k1 = 1.7 / Math.max(1, half);
  const k2 = 2.3 / Math.max(1, half);

  // A ripple can never outlive its crossing of the container, so one started at
  // the far rim still dies at the near one rather than sailing on over the bank.
  const LIFE = Math.min(TAU * 3, (size * 1.1) / SPEED + 0.6);

  // How big a strike reads at this scale. A fixed amplitude was wrong at both
  // ends — the same crest that is a gentle ring on a pond is a tidal wave in
  // case 7's washbasin and nearly invisible on case 39's lake — so it grows
  // with the container and then stops, because open water does not ripple
  // harder just for being wider.
  const STRIKE = Math.min(0.10, 0.045 * half);

  const ripples = [];
  for (let i = 0; i < POOL; i++) ripples.push({ t0: -1e9, x: 0, z: 0, amp: 0 });
  let next = 0;
  let clock = 0;

  // The one place the wave is defined — the free surface, before the container
  // has any say. Both the mesh and heightAt read through this.
  function waveAt(x, z, t) {
    // no swell means no idle term at all, rather than one multiplied by zero —
    // dead-still water stays exactly flat, and skips two sines per vertex
    let h = IA === 0 ? 0
      : IA * (Math.sin(x * k1 + t * 0.9 + p1) + Math.sin(z * k2 + t * 0.7 + p2));
    for (const r of ripples) {
      const age = t - r.t0;
      if (age < 0 || age > LIFE) continue;
      const d = Math.hypot(x - r.x, z - r.z);
      const front = d - SPEED * age;
      const env = Math.exp(-(front / PACKET) * (front / PACKET));
      if (env < 0.004) continue;
      // a travelling packet: one crest with a trough to each side of it
      h += r.amp * Math.exp(-age / TAU) * env
        * Math.cos((front / WAVELEN) * Math.PI * 2) / (1 + d * 0.55);
    }
    return h;
  }

  // How free a point is to move: 1 well inside, falling to exactly 0 at the
  // wall. The `> 0` guards below are what make the pinning absolute — they also
  // keep a negative wave from writing -0 into the buffer at the rim.
  function maskAt(x, z) {
    const e = round
      ? half - Math.hypot(x, z)
      : Math.min(half - Math.abs(x), half - Math.abs(z));
    return smooth(clamp01(e / band));
  }

  function heightAt(x, z, t = clock) {
    const m = maskAt(x, z);
    return m > 0 ? waveAt(x, z, t) * m : 0;
  }

  function displace() {
    for (let i = 0; i < count; i++) {
      const m = mask[i];
      position[i * 3 + 1] = m > 0 ? waveAt(px[i], pz[i], clock) * m : 0;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }
  displace();

  return {
    group,
    surface,
    // Drop a ripple at a point in the surface's own local space. A tap outside
    // the water is pulled to the nearest point inside it rather than ignored,
    // so a hit on the very rim still reads.
    ripple(x, z, amp = STRIKE) {
      let cx = x;
      let cz = z;
      if (round) {
        const d = Math.hypot(x, z);
        if (d > half) { const k = half / d; cx = x * k; cz = z * k; }
      } else {
        cx = Math.max(-half, Math.min(half, x));
        cz = Math.max(-half, Math.min(half, z));
      }
      const slot = ripples[next];
      next = (next + 1) % POOL;
      slot.t0 = clock; slot.x = cx; slot.z = cz; slot.amp = amp;
      return slot;
    },
    // the water's height in local space — so koi, petals and anything else
    // floating can ride the surface instead of hovering over it
    heightAt,
    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      displace();
    },
    rippleCount() {
      let k = 0;
      for (const r of ripples) if (clock - r.t0 >= 0 && clock - r.t0 <= LIFE) k++;
      return k;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
