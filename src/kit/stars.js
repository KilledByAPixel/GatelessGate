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
//
// A POINT IS A SQUARE unless something says otherwise, and at three pixels a
// square is unmistakably a square. The disc is an alpha map, ONE texture shared
// by the whole field, built as a DataTexture rather than off a canvas so the
// kit still builds under plain Node in the tests (the idiom case 28's lantern
// glow established). The falloff is soft rather than a hard cut: at this size a
// hard-edged circle is a jagged one, and the ramp is what antialiases it.

// A small solid core with a soft rim — a star is a point of light, not a dot of
// paint, and the ramp is doing the antialiasing at three pixels across.
const DISC_SIZE = 32;
const DISC_CORE = 0.5;   // fraction of the radius that stays fully opaque
function starDisc() {
  const px = new Uint8Array(DISC_SIZE * DISC_SIZE * 4);
  for (let i = 0; i < DISC_SIZE * DISC_SIZE; i++) {
    const x = ((i % DISC_SIZE) + 0.5) / DISC_SIZE - 0.5;
    const y = (Math.floor(i / DISC_SIZE) + 0.5) / DISC_SIZE - 0.5;
    const r = Math.hypot(x, y) * 2;                   // 0 centre, 1 at the rim
    const a = r >= 1 ? 0
      : r <= DISC_CORE ? 1
        : Math.pow(1 - (r - DISC_CORE) / (1 - DISC_CORE), 1.8);
    px[i * 4] = 255; px[i * 4 + 1] = 255; px[i * 4 + 2] = 255;
    px[i * 4 + 3] = Math.round(255 * a);
  }
  const tex = new THREE.DataTexture(px, DISC_SIZE, DISC_SIZE);
  // White through and through — the colour comes from the vertex attribute, so
  // this carries shape and nothing else.
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
export function makeStars({
  count = 700,
  radius = 80,
  seed = 1,
  size = .8,
  color = PAPER,
  // HOW FAR DOWN THE SHELL REACHES, in cos(phi): 1 stops level with the
  // centre, 2 is a whole sphere. Past 1 by a little on purpose — a field that
  // stops exactly at the horizon leaves the lowest stars visibly hanging in a
  // band, and what makes a sky read as a sky is that it runs down until the
  // LAND cuts it off. The ones below are occluded by the ground and cost only
  // their share of the buffer.
  spread = 1.15,
  // The shell's centre above the ground. Zero for a field that follows the
  // lens, where the centre IS the eye and phi maps straight to elevation; a
  // static shell (case 28's) lifts its centre instead so the horizon sits
  // below the veranda the reader is standing on.
  lift = 0,
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

  const disc = starDisc();
  const material = new THREE.PointsMaterial({
    size,
    sizeAttenuation: true,
    vertexColors: true,
    map: disc,
    alphaMap: disc,
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
    dispose() { geo.dispose(); material.dispose(); disc.dispose(); },
  };
}
