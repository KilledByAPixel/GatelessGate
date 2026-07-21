import * as THREE from '../../lib/three.module.js';
import { ACCENT_DEEP, PAPER } from '../palette.js';

// A low harvest moon — "in autumn, a harvest moon" — standing far out beyond
// the mountains. A disc on the horizon, not a lamp hung in the diorama.
//
// Four things keep it a moon rather than a prop, and all four are easy to lose:
//
// 1. `material.fog = false`. Everything else in this book dissolves into the
//    paper with distance (flag.js carries the same note for the same reason),
//    and at sixty-odd units an exponential fog erases the disc completely. The
//    weather is the one thing that does not touch the moon.
// 2. It is UNLIT. A toon-shaded disc has a single normal, so it lands wholly in
//    whichever of the three ramp bands the key light happens to hit — meaning
//    its tone would swing with the staging's lighting rather than with the hour.
//    A moon emits; MeshBasicMaterial is the honest material for it.
// 3. `userData.noOutline`, so no inverted hull. An inked contour on a moon reads
//    as a coin.
// 4. ...and the same is true of the depth-edge ink PASS, which is a separate
//    mechanism and on by default. The disc sits against nothing but sky, so the
//    Sobel sees the largest depth discontinuity in the frame there. It opts out
//    the way the grass does: by marking its fragments in alpha.
//
// The disc is fixed, not billboarded. The camera orbits, but it does so within
// ~14 units of the origin while the moon stands 60+ out, so across the whole
// swing the disc turns at most ~12 degrees off face-on — a 2% squash, invisible.
export function makeMoon({
  radius = 3.4,
  color = ACCENT_DEEP,       // a big flat disc: full ACCENT here would glare
  distance = 62,             // beyond the mountains, which sit 33-52 out
  height = 11.5,
  azimuth = 0,               // bearing, 0 = straight down -z (mountains' convention)
  segments = 48,
  glowColor = null,          // where setGlow(1) lands; defaults toward the paper
} = {}) {
  const geo = new THREE.CircleGeometry(radius, segments);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  mat.fog = false;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\n  gl_FragColor.a = 0.0;   // ink-mask marker',
    );
  };
  mat.customProgramCacheKey = () => 'moon-noink';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'moon';
  mesh.userData.noOutline = true;
  mesh.position.set(Math.sin(azimuth) * distance, height, -Math.cos(azimuth) * distance);
  // face the staging, standing plumb — lookAt at its own height keeps the disc
  // vertical instead of tipping it down toward the ground plane
  mesh.lookAt(0, height, 0);

  const base = new THREE.Color(color);
  const lit = glowColor ? new THREE.Color(glowColor) : base.clone().lerp(new THREE.Color(PAPER), 0.34);
  let glow = 0;

  // The light shifts. Deliberately small: brightening toward the paper and a
  // couple of percent of swell. Anything more and the moon starts blinking.
  mesh.setGlow = (t) => {
    glow = t < 0 ? 0 : t > 1 ? 1 : t;
    mat.color.copy(base).lerp(lit, glow);
    const s = 1 + glow * 0.045;
    mesh.scale.set(s, s, 1);
    return glow;
  };
  mesh.glow = () => glow;

  return mesh;
}
