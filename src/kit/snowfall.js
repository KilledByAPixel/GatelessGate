import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { SNOW } from '../palette.js';

// Snow, for the night Eka stood outside Bodhidharma's cave (case 41).
//
// These flecks were PAPER coloured on the theory that snow in an ink painting is
// the paper showing through — invisible against the sky, present against ink.
// That works for snow LYING on the ground and not for snow in the air: the same
// case covers its earth in wash(0.06), so falling flake and snowed-under ground
// were the same tone and the weather simply vanished into it (Frank: "the
// falling snow is not white, it's the same colour as the ground"). Falling snow
// is the one thing in the book brighter than the page — see SNOW in palette.js.
//
// One THREE.Points, no meshes and no outlines. Each flake's fall is a closed
// form over simTime — a wrapping descent with its own drift — so the same
// simTime always gives the same weather, and nothing accumulates between
// frames.

// ROUND FLAKES. A PointsMaterial with no map draws every point as a hard
// SQUARE, so the weather was three hundred little tiles tumbling past the cave
// mouth (Frank). The fix is a texture, and this book downloads nothing — so it
// is generated: one 32x32 white disc with a feathered alpha edge, solid to 0.62
// of its radius and gone by the rim.
//
// Built once and shared by every snowfall, which is why dispose() leaves it
// alone: the material and geometry belong to a scene, this belongs to the book.
// At a few pixels a flake all it has to do is knock the corners off, so it is
// deliberately tiny — smaller than the mip a bigger one would end up sampling.
const FLAKE_PX = 32;
let flakeTexture = null;
function flakeDisc() {
  if (flakeTexture) return flakeTexture;
  const n = FLAKE_PX;
  const data = new Uint8Array(n * n * 4);
  const c = (n - 1) / 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - c, y - c) / c;              // 0 centre, 1 rim
      const t = Math.min(1, Math.max(0, (1 - d) / 0.38));
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;           // white; the material tints
      data[i + 3] = Math.round(t * t * (3 - 2 * t) * 255); // smoothstep, so no stair-step rim
    }
  }
  flakeTexture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  flakeTexture.minFilter = THREE.LinearFilter;
  flakeTexture.magFilter = THREE.LinearFilter;
  flakeTexture.generateMipmaps = false;
  flakeTexture.needsUpdate = true;
  return flakeTexture;
}

export function makeSnow({
  count = 260,
  seed = 41,
  width = 26,
  depth = 26,
  height = 14,
  size = 0.085,
  color = SNOW,
} = {}) {
  const pos = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(color),
    map: flakeDisc(),    // else every flake is a square (see flakeDisc above)
    size,
    sizeAttenuation: true,
    fog: true,           // distant snow dissolves into the paper like everything else
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  points.name = 'snow';
  points.frustumCulled = false;

  const flakes = [];
  for (let i = 0; i < count; i++) {
    flakes.push({
      x: (hash1(i * 4 + 1, seed) - 0.5) * width,
      z: (hash1(i * 4 + 2, seed) - 0.5) * depth,
      fall: 0.45 + hash1(i * 4 + 3, seed) * 0.55,
      phase: hash1(i * 4 + 4, seed) * Math.PI * 2,
    });
  }

  let clock = 0;

  function pose() {
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      // wrap the descent: modulo keeps it a pure function of the clock
      let y = height - ((clock * f.fall + f.phase * height * 0.5) % height);
      if (y < 0) y += height;
      pos[i * 3] = f.x + Math.sin(clock * 0.42 + f.phase) * 0.55;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = f.z + Math.cos(clock * 0.31 + f.phase * 1.7) * 0.45;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();
  }
  pose();

  return {
    points,
    group: points,
    count() { return flakes.length; },
    extent() { return { width, depth, height }; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      pose();
    },
    // the flake disc is the book's, not this snowfall's — see flakeDisc
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
