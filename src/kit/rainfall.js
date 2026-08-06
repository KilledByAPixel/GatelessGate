import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { wash } from '../palette.js';

// Rain, for the parched earth of case 34. The sibling of snowfall.js and
// under the same discipline: every drop's fall is a closed form over simTime,
// so the same simTime is always the same weather. Where snow is points, rain
// is STREAKS — one LineSegments, two vertices per drop, tilted along the
// fall. Rain in this book is pale ink, not white: it reads against the paper
// the way a light wash does, and it dissolves into fog like everything else.
//
// surge(amount) is the one piece of state (birds.scatter's precedent): the
// tap's answer. It lengthens the streaks and lifts opacity, then decays —
// speed itself never changes, which is what keeps the closed form closed.

export function makeRain({
  count = 340,
  seed = 34,
  width = 26,
  depth = 26,
  height = 13,
  slant = 0.16,
  len = 0.55,
  color = wash(0.55),
  opacity = 0.30,
} = {}) {
  const pos = new Float32Array(count * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    fog: true,
    depthWrite: false,
  });

  const lines = new THREE.LineSegments(geo, mat);
  lines.name = 'rain';
  lines.userData.noOutline = true;
  lines.frustumCulled = false;

  const drops = [];
  for (let i = 0; i < count; i++) {
    drops.push({
      x: (hash1(i * 4 + 1, seed) - 0.5) * width,
      z: (hash1(i * 4 + 2, seed) - 0.5) * depth,
      fall: 7 + hash1(i * 4 + 3, seed) * 4,
      phase: hash1(i * 4 + 4, seed),
    });
  }

  // fall direction: mostly down, leaning with the slant
  const dir = new THREE.Vector3(slant, -1, slant * 0.4).normalize();

  let clock = 0;
  let surge = 0;

  function pose() {
    const L = len * (1 + surge * 0.8);
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      let y = height - ((clock * d.fall + d.phase * height) % height);
      if (y < 0) y += height;
      const x = d.x + (height - y) * slant;
      const z = d.z + (height - y) * slant * 0.4;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x + dir.x * L;
      pos[i * 6 + 4] = y + dir.y * L;
      pos[i * 6 + 5] = z + dir.z * L;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();
  }
  pose();

  return {
    points: lines,
    group: lines,
    count() { return drops.length; },
    extent() { return { width, depth, height }; },
    surgeLevel() { return surge; },
    surge(amount = 1) { surge = Math.min(1.5, surge + amount); },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      surge *= Math.exp(-(dt || 0) / 1.2);
      mat.opacity = opacity * (1 + surge * 0.5);
      pose();
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
