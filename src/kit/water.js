import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
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
// nothing can travel past the wall, the silhouette is the container's own,
// and a ring that reaches the wall folds back off it and returns (see the
// fold in waveAt) instead of sailing on over the bank.
// It also costs ONE draw call instead of seven.
//
// Everything is a closed form over the simTime handed to update() — no
// integration, no stored per-vertex state, no Math.random — so the same taps at
// the same steps give the same water every run.

const SPEED = 2.35;        // how fast a ripple front travels, world units/sec
const WAVELEN = 0.62;      // crest-to-crest, in the same units
const PACKET = 0.42;       // width of the travelling wave packet
const TAU = 3.5;           // seconds for a ripple to fade to nothing
const BOUNCE = 0.6;        // amplitude kept per round trip of the fold — one
                           // wall bounce and one refocus. Applied smoothly as
                           // BOUNCE^(travelled / 2·wallDist), not per discrete
                           // contact: a stepped multiplier popped the whole
                           // packet's height the instant the count ticked.
const POOL = 8;            // concurrent tap ripples before the oldest is reused
const EDGE_BAND = 0.12;    // fraction of the radius over which motion is pinned

// The stir (hover): moving the pointer across the surface drops mini-ripples
// along the stroke, sized by pointer speed — the water's cousin of the grass
// breeze (src/kit/breeze.js), and it makes the same promises: a dead zone so
// a resting hand's jitter does nothing, the first fed point only anchors, and
// everything derives from the fed points and the sim clock, so the same
// stroke over the same steps stirs the same water.
const STIR_POOL = 4;       // stir slots, SEPARATE from the taps' POOL: a
                           // stroke drops mini-ripples far faster than anyone
                           // taps, and sharing one rotation let a few seconds
                           // of idle brushing evict a tap's ring mid-life — a
                           // visible one-frame pop. Stirs only ever recycle
                           // stirs.
const STIR_MIN_SPEED = 0.35;   // breeze's dead zone, world units/sec
const STIR_MAX_SPEED = 8;      // full-strength stroke speed
const STIR_SPACING = 0.5;      // stroke distance between mini-ripples
const STIR_TELEPORT = 1.5;     // a jump this big is a re-entry, not a stroke
const STIR_GAP = 0.5;          // seconds of silence that also mean re-entry
const STIR_AMP = 0.2;         // fraction of STRIKE at full stroke speed. Set
                               // where a fast stroke's OVERLAPPING drops (one
                               // every STIR_SPACING, packets 0.42 wide) still
                               // sum to about half a tap — at 0.33 the combined
                               // crest reached 3/4 of a tap, which is no longer
                               // "a little motion, less than clicking" (Frank)

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
  specular = 0.55,         // the white glint; 0 drops back to plain Lambert
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
  // enough vertices that a ripple — and the standing pattern a bounce builds
  // near the wall — reads as a curve, capped so a big lake does not cost more
  // per frame than it is worth. The cap keeps every default cell under half a
  // WAVELEN up to a ~15-unit lake — anything bigger should pass `segments`
  // explicitly, the way the oceans do: they pass segments: 64 and skip all this.
  const n = segments || Math.max(24, Math.min(48, Math.round(size * 6)));
  const { pos, idx, edge } = round || blob ? discGrid(half, n, radiusAt) : squareGrid(size, n);

  const group = new THREE.Group();
  group.name = 'water';

  const geo = new THREE.BufferGeometry();
  const position = new Float32Array(pos);
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // WATER IS THE ONE SURFACE THAT GLINTS. Everything else in the book wears
  // plain Lambert, which has no specular at all, so a pond lit from the side
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
    : washMaterial({ color, side: THREE.DoubleSide, glow: false });
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
  // Water never joins the shadow map, either side of it. An ocean-sized sheet
  // outruns the sun's little shadow camera (far = 42), and where the far
  // plane slices the sheet the lookup paints a phantom wedge — Frank found a
  // triangle of shadow mid-sea, cast by nothing. A glinting transparency has
  // no business catching monk shadows anyway.
  surface.userData.noShadow = true;
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

  // Idle swell: two crossed wavelets with seeded phases — the wind's
  // breathing. A flat 0.012 was invisible on the ponds (Frank: "it's not
  // perfectly still... a little motion of the water"), so like STRIKE it now
  // grows with the container and stops: readable on a pond, proportionate in
  // case 7's basin, capped on open water. Kept well under a tap's crest so a
  // strike still owns the surface ("pretty subtle, so you can still see when
  // you click"). The oceans pass swell: 0.5 to hold the amplitude their
  // shorelines were tuned around.
  const IA = Math.min(0.025, 0.0175 * half) * swell;
  const p1 = hash1(1, seed) * Math.PI * 2;
  const p2 = hash1(2, seed) * Math.PI * 2;
  // k of 5/11 over a pond half-width: wavelengths ~1.3 and ~0.6 units, so a
  // pond carries a few visible crests. The first pass used 1.7/2.3 — a wave
  // LONGER than the pond, which could only tilt the whole sheet: invisible
  // small, a seesaw big (Frank tuned these by eye).
  const k1 = 5 / Math.max(1, half);
  const k2 = 11 / Math.max(1, half);

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

  // The old cap here — "a ripple can never outlive its crossing" — was the
  // no-bounce assumption in constant form, and with Frank's SPEED it was
  // killing a pond ripple at ~1.5s while TAU promised 3.5. Reflections repeal
  // it: a ring re-crosses as often as its amplitude lasts, so the only stop
  // is the decay itself. Past three TAU the crest is under 5% of its strike
  // and the env cutoff has long since dropped it from the sum.
  const LIFE = TAU * 3;

  // How big a strike reads at this scale. A fixed amplitude was wrong at both
  // ends — the same crest that is a gentle ring on a pond is a tidal wave in
  // case 7's washbasin and nearly invisible on case 39's lake — so it grows
  // with the container and then stops, because open water does not ripple
  // harder just for being wider.
  const STRIKE = strike || Math.min(0.10, 0.045 * half);

  // One flat array the wave loop reads straight through, two rotations into
  // it: taps own [0, POOL), stirs own [POOL, POOL + STIR_POOL) — see drop().
  const ripples = [];
  for (let i = 0; i < POOL + STIR_POOL; i++) ripples.push({ t0: -1e9, x: 0, z: 0, amp: 0 });
  let next = 0;
  let stirNext = 0;
  let clock = 0;
  // WIND ON THE WATER. A case can ask the swell to run faster for a while
  // (case 20's squall), and the extra has to be an INTEGRATED offset rather
  // than a multiplier on the clock: multiplying absolute time by a changing
  // number skips the wave's phase, which is a whole ocean jumping sideways.
  // The birds and the butterflies both shipped that bug; the sea does not get
  // to make it a third time.
  //
  // Ripple bookkeeping stays on the REAL clock — a ripple is a one-shot
  // stamped when the reader touched the water, and it should live out its own
  // second and a half whatever the wind is doing.
  let rush = 0;         // extra wave-seconds per second, right now
  let hurried = 0;      // ...accumulated
  const waveClock = () => clock + hurried;

  // The idle-swell term alone — shared by waveAt (which adds the ripples on
  // top) and swellAt (which deliberately does not).
  function idleAt(x, z, t) {
    // no swell means no idle term at all, rather than one multiplied by zero —
    // dead-still water stays exactly flat, and skips two sines per vertex
    // 3/5 rad/s — ~2s periods, a brisk shimmer. Frank tuned these by eye
    // alongside k1/k2: the first pass went slow (0.55/0.42, ~11-15s periods)
    // chasing "low frequency", and at pond-sized wavelengths that read as
    // nothing at all until the amplitude made it a seesaw. Short wavelets
    // moving briskly at small amplitude is what actually reads as wind.
    return IA === 0 ? 0
      : IA * (Math.sin(x * k1 + t * 3 + p1) + Math.sin(z * k2 + t * 5 + p2));
  }

  // The one place the wave is defined — the free surface, before the container
  // has any say. Both the mesh and heightAt read through this.
  function waveAt(x, z, t) {
    let h = idleAt(x, z, t);
    for (const r of ripples) {
      const age = t - r.t0;
      if (age < 0 || age > LIFE) continue;
      // Once decay has ground the crest below visibility there is no point
      // folding rays for it — without this, a folded packet never leaves the
      // pond, so the env cutoff below almost never skips the loop any more
      // and every live slot pays wallAlong for its whole 10.5s LIFE.
      if (r.amp * Math.exp(-age / TAU) < 0.004) continue;
      const dx = x - r.x;
      const dz = z - r.z;
      const d = Math.hypot(dx, dz);
      // THE FOLD: the wall reflects. D is the tap-to-wall distance along this
      // point's own direction; the travelled distance T bounces back and forth
      // inside [0, D] as a triangle wave, so the ring runs out, comes back,
      // refocuses at the tap, and runs out again. A centred tap collapses to a
      // ring converging on its own origin — which is why this is a fold and
      // not mirror image-sources: no finite set of mirrors can converge.
      const D = Math.max(wallAlong(r.x, r.z, dx, dz, d), 1e-6);
      const T = SPEED * age;
      const m2 = T % (2 * D);
      const folded = m2 <= D ? m2 : 2 * D - m2;
      const front = d - folded;
      const env = Math.exp(-(front / PACKET) * (front / PACKET));
      if (env < 0.004) continue;
      // a travelling packet: one crest with a trough to each side of it
      h += r.amp * Math.exp(-age / TAU) * Math.pow(BOUNCE, T / (2 * D)) * env
        * Math.cos((front / WAVELEN) * Math.PI * 2) / (1 + d * 0.55);
    }
    return h;
  }

  // Distance from a tap at (sx, sz) to the wall, measured along the ray toward
  // (sx+dx, sz+dz) — the per-direction wall the fold reflects off. For the
  // blob it borrows wallDistance's own approximation: the rim radius at the
  // TARGET point's bearing from centre, exact enough at the blob's gentle
  // wobbles. `d` is |(dx, dz)|, already computed by the caller; a degenerate
  // ray (the point IS the tap) falls back to the tap's own wall distance —
  // the value is cosmetic there, it just must be finite.
  function wallAlong(sx, sz, dx, dz, d) {
    if (d < 1e-9) return Math.max(wallDistance(sx, sz), 0);
    const ux = dx / d;
    const uz = dz / d;
    if (round || blob) {
      const R = blob ? radiusAt(Math.atan2(sz + dz, sx + dx)) : half;
      const b = sx * ux + sz * uz;
      // ray-circle: t^2 + 2bt + (|s|^2 - R^2) = 0, taking the forward root.
      // The blob's varying R can nudge the discriminant a hair negative for a
      // tap pulled onto the rim — clamp, the edge mask owns that region anyway.
      return -b + Math.sqrt(Math.max(b * b + R * R - sx * sx - sz * sz, 0));
    }
    const tx = ux > 0 ? (half - sx) / ux : ux < 0 ? (-half - sx) / ux : Infinity;
    const tz = uz > 0 ? (half - sz) / uz : uz < 0 ? (-half - sz) / uz : Infinity;
    return Math.min(tx, tz);
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

  function heightAt(x, z, t = waveClock()) {
    const m = maskAt(x, z);
    return (m > 0 ? waveAt(x, z, t) * m : 0) + driftAt(x, z, t);
  }

  // The surface WITHOUT the taps: idle swell + drift, edge-masked, no ripple
  // term. This is what the koi ride (Frank: a tap above the school must not
  // toss the fish) — anything that should feel the water breathe but ignore
  // the reader's finger samples this instead of heightAt.
  function swellAt(x, z, t = waveClock()) {
    const m = maskAt(x, z);
    return (m > 0 ? idleAt(x, z, t) * m : 0) + driftAt(x, z, t);
  }

  function displace() {
    for (let i = 0; i < count; i++) {
      const m = mask[i];
      const wt = waveClock();
      position[i * 3 + 1] = (m > 0 ? waveAt(px[i], pz[i], wt) * m : 0)
        + driftAt(px[i], pz[i], wt);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }
  displace();

  // The stir's memory: where the pointer last was on this surface, when, and
  // how much stroke has run since the last mini-ripple. Pointer state, not
  // sim state — same standing as breeze.js's module state.
  let stX = 0;
  let stZ = 0;
  let stT = -1e9;
  let stAccum = 0;

  // The one place a ripple enters the pool. A point outside the water is
  // pulled to the nearest point inside it rather than ignored, so a hit on
  // the very rim still reads. Taps and stirs rotate their own slot ranges
  // (see STIR_POOL) so a stroke can never retire a tap's ring early.
  function drop(x, z, amp, stirred) {
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
    let slot;
    if (stirred) {
      slot = ripples[POOL + stirNext];
      stirNext = (stirNext + 1) % STIR_POOL;
    } else {
      slot = ripples[next];
      next = (next + 1) % POOL;
    }
    slot.t0 = clock; slot.x = cx; slot.z = cz; slot.amp = amp;
    return slot;
  }

  return {
    group,
    surface,
    // Drop a ripple at a point in the surface's own local space (a tap).
    ripple(x, z, amp = STRIKE) {
      return drop(x, z, amp, false);
    },
    // the water's height in local space — so koi, petals and anything else
    // floating can ride the surface instead of hovering over it
    heightAt,
    // the same surface with the ripple term removed — what the koi ride
    swellAt,
    // Feed the pointer's on-surface point (local space) while it moves over
    // the water — from a case's onHover raycast, the same wiring as a tap.
    // Speed between fed points decides everything: below the dead zone
    // nothing happens, above it a mini-ripple drops every STIR_SPACING of
    // stroke, growing with speed but always well under a tap. Silent by
    // design — the drip belongs to the tap.
    stir(x, z) {
      const dt = clock - stT;
      if (dt <= 0) {
        // same tick: extend the stroke; speed is judged when time moves
        stAccum += Math.hypot(x - stX, z - stZ);
        stX = x; stZ = z;
        return;
      }
      const dist = Math.hypot(x - stX, z - stZ);
      stT = clock;
      if (dt > STIR_GAP || dist > STIR_TELEPORT) {
        // first point, a long silence, or a jump: the pointer arrived, it
        // did not travel — anchor only. Same intent as breeze.js's re-entry
        // rule, different mechanism: breeze is cleared from outside
        // (clearBreeze), the water infers re-entry from the gap itself.
        stX = x; stZ = z; stAccum = 0;
        return;
      }
      const speed = dist / dt;
      const strength = clamp01((speed - STIR_MIN_SPEED) / (STIR_MAX_SPEED - STIR_MIN_SPEED));
      // only real stroke banks toward the next drop — a sub-dead-zone crawl
      // counts for nothing, however far it wanders, so a later blip can never
      // cash in distance a resting hand accumulated
      if (strength > 0) stAccum += dist;
      stX = x; stZ = z;
      if (strength > 0 && stAccum >= STIR_SPACING) {
        stAccum = 0;
        drop(x, z, STRIKE * STIR_AMP * strength, true);
      }
    },
    // signed distance to the shore in local space (positive = in the water):
    // how a case checks its stepping stones actually stand in a blob pond
    shoreDistance: wallDistance,
    // How much faster than its own pace the sea is running: 0 is calm weather,
    // 1 doubles the swell's travel. Set it every frame from an envelope; it is a
    // rate, not a switch.
    setRush(v) { rush = Number.isFinite(v) && v > 0 ? v : 0; },
    rush: () => rush,
    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      hurried += rush * Math.max(0, dt || 0);
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
