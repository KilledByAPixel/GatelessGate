import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';
import { hash1 } from '../util/noise.js';
import { clamp01 } from '../util/math.js';

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
// one uniform grid, cut to a circle for a basin or pond and left square for
// open water — and the ripples are a HEIGHT FIELD on its vertices rather than
// separate ring meshes. The rim vertices are anchored, so
// nothing can travel past the wall, and the silhouette is the container's own.
// It also costs ONE draw call instead of seven.
//
// Everything is a closed form over the simTime handed to update() — no
// integration, no stored per-vertex state, no Math.random — so the same taps at
// the same steps give the same water every run.

const SPEED = 2.35;        // how fast a ripple front travels, world units/sec
const WAVELEN = 0.62;      // crest-to-crest, in the same units
const PACKET = 0.42;       // width of the travelling wave packet
const TAU = 3.5;           // seconds for a ripple to fade to nothing
const POOL = 8;            // concurrent ripples before the oldest is reused
const EDGE_BAND = 0.12;    // fraction of the radius over which motion is pinned

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

// A disc cut out of the SAME uniform grid, Frank's way: drop the cells that
// fall outside the circle and pull the vertices that overhang it back onto the
// rim.
//
// This started as a polar grid — rings and spokes — which has an exact rim for
// free but crowds vertices at the hub, thins them toward the edge, and runs
// every spoke into one shared centre vertex. The result reads as a bias at the
// centre of the pond, and Frank spotted it on sight. A cut square grid has
// uniform density everywhere and no singularity; the price is a few irregular
// triangles around the rim, and those are exactly the ones pinned flat, so
// nobody ever sees them move.
//
// `radiusAt` (optional) makes the wall a function of angle instead of a
// constant — that one generalization is the whole of the 'blob' shape. When it
// is absent the math below is bit-for-bit what it always was for 'round'.
function discGrid(radius, n, radiusAt) {
  const step = (radius * 2) / n;
  const gx = [];
  const gz = [];
  const gr = [];                       // the wall radius along this point's angle
  const over = [];                     // did this grid point overhang the outline?
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      let x = -radius + step * j;
      let z = -radius + step * i;
      const r = Math.hypot(x, z);
      const R = radiusAt ? radiusAt(Math.atan2(z, x)) : radius;
      const out = r > R;
      if (out && r > 1e-12) { const k = R / r; x *= k; z *= k; }
      gx.push(x); gz.push(z); gr.push(R); over.push(out);
    }
  }

  // Keep a cell if any of its corners was genuinely inside, and carry over only
  // the vertices those cells actually use.
  const at = (i, j) => i * (n + 1) + j;
  const remap = new Int32Array(gx.length).fill(-1);
  const pos = [];
  const edge = [];
  const idx = [];
  const use = (o) => {
    if (remap[o] < 0) {
      remap[o] = pos.length / 3;
      pos.push(gx[o], 0, gz[o]);
      // pulled-in vertices ARE the wall, so their distance to it is exactly 0
      edge.push(over[o] ? 0 : gr[o] - Math.hypot(gx[o], gz[o]));
    }
    return remap[o];
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const corners = [at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1)];
      if (!corners.some((k) => !over[k])) continue;      // wholly outside
      const [a, b, c, d] = corners.map(use);
      idx.push(a, c, b, b, c, d);
    }
  }
  return { pos, idx, edge };
}

// ---- the blob outline ------------------------------------------------------
// A natural pond edge for open water (Frank, case 39: "make that pond less
// square-shaped — more organically shaped, kinda roundish"). Three low
// harmonics with seeded phases, and the wobble only ever pulls INWARD from the
// stated radius — the sum of the amplitudes is subtracted up front — so `size`
// stays an honest bound: a blob never reaches past where a round surface of
// the same size would. Low orders only: harmonic 2 makes it an oval, 3 leans
// it, 5 breaks the symmetry. Anything higher reads as a scalloped cookie.
const BLOB_HARMONICS = [[2, 0.07], [3, 0.05], [5, 0.03]];

function blobOutline(radius, seed) {
  const slack = BLOB_HARMONICS.reduce((s, [, a]) => s + a, 0) * radius;
  const terms = BLOB_HARMONICS.map(([h, a], i) => [h, a * radius, hash1(20 + i, seed) * Math.PI * 2]);
  return (theta) => {
    let r = radius - slack;
    for (const [h, a, p] of terms) r += a * Math.sin(h * theta + p);
    return r;
  };
}

export function makeWater({
  shape = 'square',        // 'square' | 'round' | 'blob' (a seeded organic outline)
  size = 2.0,              // full width, or the DIAMETER of a round surface
  color = WASH.ground,
  seed = 7,
  segments = 0,            // 0 picks a sensible density for the size
  swell = 1,               // idle motion, 0 for dead-still water
  strike = 0,              // 0 scales the crest to the container; set it to keep
                           // a ripple under a rim it must not slop over
  opacity = 0.72,          // how much the surface hides what is under it — a
                           // pond with koi wants this lower so the fish read
  specular = 0.55,         // the white glint; 0 drops back to the toon ramp
  shininess = 64,
  // The free-ocean term (case 20): slow waves traveling toward (dx, dz) at
  // wavelength/period units/sec. One component object, or an ARRAY of them —
  // a real sea is never one sine: a single component renders as parallel
  // bars (Frank: "the waves are mostly horizontal... they don't look like
  // normal waves"), and it takes two or three crossing swells at slightly
  // different headings to break the crests into water. DELIBERATELY
  // UNMASKED — it ignores the rim pinning, because an ocean has no rim to
  // protect: the near edge is buried under the sand ribbon and the far
  // edges die in the fog. A contained surface (basin, pond) must leave this
  // off, and off is the default, so every existing caller is byte-identical.
  // Each (dx, dz) must be a unit vector — anything else silently scales
  // that component's speed away from the wavelength/period you dialled in.
  drift = null,
  // Per-vertex opacity, (x, z) => 0..1 in the surface's LOCAL plan coords —
  // how an ocean is transparent over the sand and deepens seaward (Frank:
  // "more transparent at the shoreline... more red in the distance"; the fog
  // still owns the far fade to paper, this shapes the band before it).
  // Evaluated ONCE at build; the ramp is geography, not animation. When set,
  // the material's own `opacity` still multiplies on top. Off by default —
  // every existing surface is byte-identical.
  alphaRamp = null,
} = {}) {
  const round = shape === 'round';
  const blob = shape === 'blob';
  const half = size / 2;
  // the wall as a function of angle — constant for 'round', wobbled for 'blob'
  const radiusAt = blob ? blobOutline(half, seed) : null;
  // enough vertices that a ripple reads as a curve, capped so a big lake does
  // not cost more per frame than it is worth
  const n = segments || Math.max(12, Math.min(30, Math.round(size * 3.2)));
  const { pos, idx, edge } = round || blob ? discGrid(half, n, radiusAt) : squareGrid(size, n);

  const group = new THREE.Group();
  group.name = 'water';

  const geo = new THREE.BufferGeometry();
  const position = new Float32Array(pos);
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // WATER IS THE ONE SURFACE THAT GLINTS. Everything else in the book wears
  // the toon ramp, which has no specular at all, so a pond lit from the side
  // was a flat coloured disc — and on a RED pond that reads as paint rather
  // than water (Frank: "we want a high specular on the water... the white
  // specular of the light where the surface of the water is red"). Phong for
  // this one mesh: the diffuse keeps the case's colour, the highlight stays
  // white, and it travels with the camera the way a real sheet does.
  //
  // Never a seal either, whatever colour it is painted: an emissive lift is
  // the same from every angle, so it would flatten the shading and take the
  // ripples down with it.
  const mat = specular > 0
    ? new THREE.MeshPhongMaterial({
      color,
      side: THREE.DoubleSide,
      specular: new THREE.Color(0xffffff).multiplyScalar(specular),
      shininess,
    })
    : toonMaterial({ color, side: THREE.DoubleSide, glow: false });
  mat.transparent = true;
  mat.opacity = opacity;
  // when the water is see-through, stop it writing depth — otherwise the fish
  // behind it get z-culled and the transparency shows nothing anyway
  if (opacity < 0.85) mat.depthWrite = false;
  // the shallow-to-deep ramp: RGBA vertex colors, alpha from the callback,
  // RGB left white so the diffuse stays exactly the stated color
  if (alphaRamp) {
    const vcount = position.length / 3;
    const rgba = new Float32Array(vcount * 4);
    for (let i = 0; i < vcount; i++) {
      const a = alphaRamp(position[i * 3], position[i * 3 + 2]);
      rgba.set([1, 1, 1, clamp01(a)], i * 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
    mat.vertexColors = true;
  }
  const surface = new THREE.Mesh(geo, mat);
  surface.name = 'surface';
  surface.userData.noOutline = true;
  // Water never joins the shadow map, either side of it. An ocean-sized sheet
  // outruns the sun's little shadow camera (far = 42), and where the far
  // plane slices the sheet the lookup paints a phantom wedge — Frank found a
  // triangle of shadow mid-sea, cast by nothing. A glinting transparency has
  // no business catching monk shadows anyway.
  surface.userData.noShadow = true;
  // The debug workbench rebuilds every material as a plain Lambert on the
  // shipped default, which would drop the specular on the floor. This is
  // exactly what keepMaterial is for — the moon learned it the hard way.
  surface.userData.keepMaterial = true;
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

  // Each drift component's phase is the seed's, like everything else here.
  // Hoisted once — the per-call destructure used to run per vertex per frame.
  // A single component keeps the phase index it always had (3), so an object
  // and a one-element array produce the identical surface.
  const driftComps = (Array.isArray(drift) ? drift : drift ? [drift] : []).map((c, i) => {
    const { dx = 0, dz = 1, amp = 0.05, wavelength = 8, period = 6 } = c;
    return { dx, dz, amp, wavelength, period, phase: hash1(3 + i, seed) * Math.PI * 2 };
  });
  const driftAt = driftComps.length
    ? (x, z, t) => {
      let h = 0;
      for (const c of driftComps) {
        h += c.amp * Math.sin(((x * c.dx + z * c.dz) / c.wavelength - t / c.period) * Math.PI * 2 + c.phase);
      }
      return h;
    }
    : () => 0;

  // A ripple can never outlive its crossing of the container, so one started at
  // the far rim still dies at the near one rather than sailing on over the bank.
  const LIFE = Math.min(TAU * 3, (size * 1.1) / SPEED + 0.6);

  // How big a strike reads at this scale. A fixed amplitude was wrong at both
  // ends — the same crest that is a gentle ring on a pond is a tidal wave in
  // case 7's washbasin and nearly invisible on case 39's lake — so it grows
  // with the container and then stops, because open water does not ripple
  // harder just for being wider.
  const STRIKE = strike || Math.min(0.10, 0.045 * half);

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

  // Signed distance to the wall: positive inside, 0 on it, negative out. This
  // is what the edge mask reads through, and it is exposed as `shoreDistance`
  // so a case can ask whether something it wants to stand in the water is
  // actually IN the water — with a blob outline that is no longer obvious.
  // (For the blob it is the radial gap, not the true normal distance, but at
  // these gentle wobbles the two agree to within the edge band.)
  function wallDistance(x, z) {
    if (blob) return radiusAt(Math.atan2(z, x)) - Math.hypot(x, z);
    return round
      ? half - Math.hypot(x, z)
      : Math.min(half - Math.abs(x), half - Math.abs(z));
  }

  // How free a point is to move: 1 well inside, falling to exactly 0 at the
  // wall. The `> 0` guards below are what make the pinning absolute — they also
  // keep a negative wave from writing -0 into the buffer at the rim.
  function maskAt(x, z) {
    return smooth(clamp01(wallDistance(x, z) / band));
  }

  function heightAt(x, z, t = clock) {
    const m = maskAt(x, z);
    return (m > 0 ? waveAt(x, z, t) * m : 0) + driftAt(x, z, t);
  }

  function displace() {
    for (let i = 0; i < count; i++) {
      const m = mask[i];
      position[i * 3 + 1] = (m > 0 ? waveAt(px[i], pz[i], clock) * m : 0)
        + driftAt(px[i], pz[i], clock);
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
      if (round || blob) {
        const R = blob ? radiusAt(Math.atan2(z, x)) : half;
        const d = Math.hypot(x, z);
        if (d > R) { const k = R / d; cx = x * k; cz = z * k; }
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
    // signed distance to the shore in local space (positive = in the water):
    // how a case checks its stepping stones actually stand in a blob pond
    shoreDistance: wallDistance,
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
