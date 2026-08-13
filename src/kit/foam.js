import * as THREE from '../../lib/three.module.js';
import { noise1, hash1 } from '../util/noise.js';
import { groundHeight } from './ground.js';
import { SNOW } from '../palette.js';
import { clamp01 } from '../util/math.js';

const smooth = (t) => t * t * (3 - 2 * t);

// The wave-end's whole life as a closed form over simTime — sweep in fast,
// ease out at full reach, then fade while receding a little, the way the last
// of a wave soaks into sand. No state, no integration: the same t is always
// the same foam.
//
// The shape in fractions of one cycle: the sweep runs 0 → 0.6 (easing out),
// then recedes about a third of the way back over the rest. Opacity leads:
// up fast over the first fifth, holding, then a long fade from 0.55 — the
// bright edge is the arriving water, the fade is the sand drinking it.
export function foamCycle(t, { period = 6, phase = 0, run = 1.8 } = {}) {
  const f = (((t / period + phase) % 1) + 1) % 1;
  const sweep = f < 0.6
    ? smooth(f / 0.6)
    : 1 - 0.33 * smooth((f - 0.6) / 0.4);
  const opacity = f < 0.2
    ? smooth(f / 0.2)
    : f < 0.55 ? 1
      : 1 - smooth((f - 0.55) / 0.45);
  return { advance: run * sweep, opacity: clamp01(opacity) };
}

// The foam: Frank's original sketch for the ocean — "the ends of the wave
// where they're kinda white... they kinda overlap and fade out as they land
// on the beach." A handful of strips of shoreline, each running the same
// cycle at its own seeded phase and reach, so arrivals overlap the way real
// wave-ends do. ONE merged mesh, rebuilt per frame — a few hundred vertices,
// cheaper than the water sheet's own displace.
//
// SNOW, unlit: foam is the brightest thing on the page, brighter than the
// paper (the snowfall argument — a flat unlit fill has to carry its
// luminance in the colour). depthWrite off so overlapping strips sum softly
// instead of z-fighting.
export function makeFoam({
  shore,
  seed = 20,
  groundSeed = 21,
  count = 9,
  period = 6,      // one arrival per swell — matches the water's main drift
  length = 56,     // along-shore span the strips are scattered over
  across = 6,      // vertices across a strip's depth (front to tail)
  along = 10,      // vertices along a strip's width
  color = SNOW,    // a case can blush it — k20's red sea takes a pink foam
  // (x, z, t) => WORLD y of the water surface, the makeKoi idiom: with it the
  // tails ride the actual swell instead of a flat sea level, which is what
  // keeps them ON TOP of a depth-writing sheet whose crests rise past them
  surfaceAt = null,
} = {}) {
  const { dx = 0, dz = -1, dist = 8 } = shore || {};
  const px = -dz, pz = dx;                     // unit along-shore vector

  // each strip: where on the shoreline, how wide, when in the cycle, how far
  // up the sand it reaches — all seeded once, alive forever
  const strips = [];
  for (let i = 0; i < count; i++) {
    strips.push({
      u: (hash1(i * 7 + 1, seed) - 0.5) * length,      // along-shore centre
      w: 6 + hash1(i * 7 + 2, seed) * 7,               // strip width
      phase: hash1(i * 7 + 3, seed),                   // 0..1 of the cycle
      run: 1.3 + hash1(i * 7 + 4, seed) * 0.9,         // reach past the waterline
      depth: 1.0 + hash1(i * 7 + 5, seed) * 0.6,       // front-to-tail extent
    });
  }

  const vertsPerStrip = (along + 1) * (across + 1);
  const positions = new Float32Array(count * vertsPerStrip * 3);
  const colors = new Float32Array(count * vertsPerStrip * 4);
  const indices = [];
  for (let sIdx = 0; sIdx < count; sIdx++) {
    const base = sIdx * vertsPerStrip;
    for (let i = 0; i < along; i++) {
      for (let j = 0; j < across; j++) {
        const a = base + i * (across + 1) + j;
        const b = a + 1;
        const c = a + (across + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geo.setIndex(indices);

  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    vertexColors: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'foam';
  mesh.userData.noShadow = true;       // a transparency, like the water it rides — see water.js
  mesh.frustumCulled = false;          // the strips move; a stale box would cull them

  const sea = (shore && shore.sea) ?? -0.35;

  function update(dt, simTime) {
    const t = Number.isFinite(simTime) ? simTime : 0;
    let v = 0;
    for (const strip of strips) {
      const { advance, opacity } = foamCycle(t, { period, phase: strip.phase, run: strip.run });
      for (let i = 0; i <= along; i++) {
        const fu = i / along;
        const u = strip.u + (fu - 0.5) * strip.w;
        // the front edge is never a ruler: a seeded wobble per column, plus a
        // slow drift over time so successive arrivals land differently
        const wob = (noise1(u * 0.35 + t * 0.06, seed + 40) - 0.5) * 0.5;
        // ends of the strip trail behind its middle — a wave-end is a tongue
        const tongue = 1 - 0.5 * Math.abs(fu - 0.5) * 2;
        // THE SIGN IS THE WHOLE GAME: s is positive SEAWARD, and run-up goes
        // the other way. The front runs to NEGATIVE s (up the sand) as the
        // cycle advances; the tail trails seaward behind it. This was flipped
        // once and the foam swept out to sea, sank under the sheet, and Frank
        // saw no foam at all.
        const front = wob - advance * tongue;
        for (let j = 0; j <= across; j++) {
          const fj = j / across;                        // 0 front .. 1 tail
          const s = front + fj * strip.depth;           // tail is seaward of the front
          const x = px * u + dx * (dist + s);
          const z = pz * u + dz * (dist + s);
          // on the sand the foam hugs the sand; past the waterline the tail
          // rides the SEA, not the seabed dropping away beneath it — the TRUE
          // surface when the case hands one over, flat sea level otherwise
          const g = groundHeight(x, z, { seed: groundSeed, shore }) + 0.035;
          const w = surfaceAt ? surfaceAt(x, z, t) + 0.025 : sea + 0.02;
          const y = Math.max(g, w);
          positions.set([x, y, z], v * 3);
          // bright at the front edge, drinking into the sand behind it; the
          // whole strip breathes with its cycle's own opacity
          const alpha = opacity * (1 - smooth(fj)) * (0.55 + 0.45 * tongue);
          colors.set([1, 1, 1, alpha], v * 4);
          v++;
        }
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
  update(0, 0);

  return { mesh, update, dispose() { geo.dispose(); mat.dispose(); } };
}
