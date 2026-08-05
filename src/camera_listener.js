// The camera's world frame, as the three plain vectors the audio engine wants.
// Kept out of engine.js so that module never imports THREE, and out of main.js
// so the matrix-column convention is written down once, where it can be read.
//
// Three.js columns: 0 is the camera's right, 2 is its BACKWARD (a camera looks
// down its own -Z), so forward is column 2 negated. Getting this backwards
// swaps the front/back cue and nothing else, which is exactly the kind of bug
// that survives a listening test.
const pos = { x: 0, y: 0, z: 0 };
const right = { x: 1, y: 0, z: 0 };
const forward = { x: 0, y: 0, z: -1 };
const frame = { pos, right, forward };

export function listenerFrom(cam) {
  cam.updateMatrixWorld();
  const e = cam.matrixWorld.elements;
  right.x = e[0]; right.y = e[1]; right.z = e[2];
  forward.x = -e[8]; forward.y = -e[9]; forward.z = -e[10];
  pos.x = e[12]; pos.y = e[13]; pos.z = e[14];
  return frame;   // REUSED — read it, don't keep it
}
