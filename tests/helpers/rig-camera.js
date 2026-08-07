import * as THREE from '../../lib/three.module.js';
import { eyePosition, DEFAULT_HOME_DISTANCE } from '../../src/camera.js';

// A camera standing exactly where the app would put it for a given `camera:`
// block — the probe the framing tests aim through ("is the moon occluded from
// here", "does the seal stay in frame"). Six test files each had their own copy
// of the same six lines of trig, and when the rig's vocabulary changed from
// azimuth/polar radians to heading/pitch degrees, all six had to be found and
// converted by hand. Now the trig lives once in camera.js's eyePosition and the
// lens lives once here.
//
// fov 38 is main.js's lens. Aspect is per-test on purpose: the reading pane's
// canvas is much narrower than a full window, and a framing that holds at 1.78
// can lose its subject at 0.8 — several of these tests exist to check exactly
// that, so the caller names the aspect it means.

// What main.js frames a case with when the module names no `camera` of its own.
export const DEFAULT_HOME = {
  distance: DEFAULT_HOME_DISTANCE, target: [1.2, 1.35, 0.3], heading: 31.5, pitch: 17.2,
};

export function rigCamera(home = {}, { heading, pitch, distance, aspect = 1.78, far = 100 } = {}) {
  const h = { ...DEFAULT_HOME, ...home };
  const cam = new THREE.PerspectiveCamera(38, aspect, 0.1, far);
  const [x, y, z] = eyePosition({
    heading: heading ?? h.heading,
    pitch: pitch ?? h.pitch,
    distance: distance ?? h.distance,
  }, h.target);
  cam.position.set(x, y, z);
  cam.lookAt(h.target[0], h.target[1], h.target[2]);
  cam.updateMatrixWorld(true);
  return cam;
}
