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
    size,
    sizeAttenuation: true,
    fog: true,           // distant snow dissolves into the paper like everything else
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  points.name = 'snow';
  points.userData.noOutline = true;
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
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
