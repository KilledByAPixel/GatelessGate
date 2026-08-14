import * as THREE from '../../lib/three.module.js';
import { PAPER } from '../palette.js';
import { hash1 } from '../util/noise.js';

// A SKY FULL OF STARS, IN ONE DRAW.
//
// Points, not sprites and not meshes: a thousand of them is a single draw call
// and a single buffer, which is the only reason a field this size is affordable
// at all. Everything else here follows from wanting them to behave like sky
// rather than like objects in the scene:
//
//   * fog: false — they sit further out than any fog would leave visible, and
//     a star washed to paper is not a star.
//   * depthWrite: false — the ink pass is a Sobel over the depth buffer, so
//     anything that writes depth grows an outline. A star with an ink edge
//     round it is a hole punched in the sky. They still depth TEST, so the
//     land and the mountains occlude the ones below the horizon, and anything
//     nearer than the shell — a moon at sixty units — passes in front of them.
//   * frustumCulled: false — the bounding sphere is centred on the shell, and
//     a camera inside it culls the whole field the moment the centre leaves
//     frame.
//
// THE SHELL FOLLOWS THE LENS (`follow` below) rather than standing still in
// the world. Two things fall out of that, both wanted: stars never clip on the
// far side when a case is wheeled out (the app's far plane is 100 and a fixed
// shell would put its far half beyond that), and they have no parallax, which
// is what being infinitely far away looks like. Position only — carrying the
// camera's ROTATION would pin them to the screen like a decal.
//
// Brightness varies per star through a colour attribute rather than several
// materials, so a sky with depth in it is still one draw.
export function makeStars({
  count = 700,
  radius = 80,
  seed = 1,
  size = 0.6,
  color = PAPER,
  // How far down the shell reaches, as a fraction of the full sphere: 1 is
  // stars all the way under your feet, and the ground would hide the lower
  // half anyway. Less than that keeps the buffer spent on sky that is
  // actually in frame.
  spread = 0.72,
  lift = 6,          // the shell's centre above the ground, so the horizon sits low
} = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const base = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    const theta = hash1(i * 3 + 1, seed) * Math.PI * 2;
    // acos of an even spread in cos(phi) is what makes the shell even rather
    // than crowded at the pole — a uniform phi bunches everything overhead.
    const phi = Math.acos(1 - hash1(i * 3 + 2, seed) * spread);
    const s = Math.sin(phi);
    pos[i * 3] = radius * s * Math.cos(theta);
    pos[i * 3 + 1] = radius * Math.cos(phi) + lift;
    pos[i * 3 + 2] = radius * s * Math.sin(theta);
    // a few bright ones, most of them faint
    const b = 0.35 + 0.65 * Math.pow(hash1(i * 3 + 3, seed), 1.8);
    col[i * 3] = base.r * b;
    col[i * 3 + 1] = base.g * b;
    col[i * 3 + 2] = base.b * b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const material = new THREE.PointsMaterial({
    size,
    sizeAttenuation: true,
    vertexColors: true,
    fog: false,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, material);
  points.name = 'stars';
  points.frustumCulled = false;

  return {
    points,
    material,
    setOpacity(a) { material.opacity = a; points.visible = a > 0.001; },
    // Call with the live camera each frame. See the note above on why position
    // and not the whole transform.
    follow(camera) { if (camera) points.position.copy(camera.position); },
    dispose() { geo.dispose(); material.dispose(); },
  };
}
