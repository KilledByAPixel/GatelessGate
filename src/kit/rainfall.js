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
// tap's answer. It lengthens the streaks and lifts opacity, HOLDS for the same
// 2.5s the audio surge holds (makeRainBed.surge in audio/synths.js — the two
// must move together or the tap reads as nothing, which is exactly what a tap
// read as before they were synced), then decays on the same tau. Speed itself
// never changes, which keeps the closed form closed.

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

  // Fall direction: mostly down, leaning with the slant. Both the streak's
  // direction and the drops' own drift read `lean` rather than the build-time
  // `slant`, so a case can put WIND on its rain (case 34's squall) — a shower
  // that keeps falling plumb while the meadow lies over reads as two different
  // weathers on one page.
  let lean = slant;
  const dir = new THREE.Vector3(lean, -1, lean * 0.4).normalize();

  // HOW HARD IT IS RAINING AT ALL, 0..1, for a case where a shower ARRIVES
  // rather than being the weather the page opens on (case 48: Kembo waves the
  // fan and it starts). It scales the whole field's opacity and hides the mesh
  // outright at zero, which is the cheap way to have no rain: the drops keep
  // their positions and their seeded phases, so a shower that stops and starts
  // again is the same shower rather than a new one seeded from wherever the
  // clock happened to be.
  let level = 1;

  let clock = 0;
  let surge = 0;
  let surgeHold = 0;                     // seconds left before the surge relaxes

  function pose() {
    const L = len * (1 + surge * 1.2);   // PROVISIONAL — how visibly the tap answers
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      let y = height - ((clock * d.fall + d.phase * height) % height);
      if (y < 0) y += height;
      const x = d.x + (height - y) * lean;
      const z = d.z + (height - y) * lean * 0.4;
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
    surge(amount = 1) { surge = Math.min(1.5, surge + amount); surgeHold = 2.5; },
    // How far the shower is leaning, as the same tangent `slant` takes at
    // build. A case drives this off whatever envelope its wind is on; the
    // streaks and the drift both follow, so the rain and the meadow answer one
    // weather. Set it every frame — it is an angle, not an impulse.
    setLean(v) { lean = Number.isFinite(v) ? v : slant; dir.set(lean, -1, lean * 0.4).normalize(); },
    lean: () => lean,
    setLevel(v) { level = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; },
    level: () => level,

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      surgeHold = Math.max(0, surgeHold - (dt || 0));
      if (surgeHold <= 0) surge *= Math.exp(-(dt || 0) / 1.2);
      mat.opacity = opacity * level * (1 + surge * 0.6);
      lines.visible = level > 0.004;
      pose();
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
