import * as THREE from '../lib/three.module.js';
import { PAPER, ACCENT_DEEP, wash } from './palette.js';
import {
  composeWorld, makePath, makeLantern, makeGate, makeMonk,
  makeLights, addOutlines, makeBlobShadow,
} from './kit/index.js';
import { introPath } from './intro_rails.js';

// The idling stage scene behind the title and the table of contents — a small
// world gathering elements from the koans: a path through the freestanding
// gate, lanterns, a monk on the way, mountains and forest in the fog beyond.
export function buildHub() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.03);
  scene.add(makeLights());

  // the intro dolly rides straight down the road (kept near x=0); the gate
  // straddles it and the lanterns flank it, all placed via path.sample
  const path = makePath({ from: [0, 14], to: [0, -36], width: 2.0, seed: 93, groundSeed: 7, wander: 1.0 });
  scene.add(path);

  const gp = path.sample(0.4);
  // THE gate. Every case marks its one red thing — the dog, the flower, the
  // bowl, the flag, the buffalo — and the title screen had no seal at all, which
  // left the one image the whole book is named for as the only grey subject in
  // it. A torii is a big timber frame rather than a held object, so it takes the
  // deep mix; full accent across those posts would glare.
  const gate = makeGate({ width: 3.0, height: 3.4, color: ACCENT_DEEP });
  gate.position.set(gp.x, 0, gp.z);
  gate.rotation.y = gp.heading;
  scene.add(gate);

  const lw = 2.0;
  const lanternA = makeLantern({});
  lanternA.position.set(gp.x + gp.perp.x * lw, 0, gp.z + gp.perp.z * lw);
  lanternA.rotation.y = gp.heading;
  const lanternB = makeLantern({ height: 1.0 });
  lanternB.position.set(gp.x - gp.perp.x * lw, 0, gp.z - gp.perp.z * lw);
  lanternB.rotation.y = gp.heading;
  scene.add(lanternA, lanternB);

  // One monk, nearly at the gate, walking toward it. The flag that used to
  // stand across the road is gone: once the gate went red it became the seal of
  // this scene, and a second red thing beside it split the focus — the title
  // screen is ABOUT the gate, so the gate stands alone.
  const mp = path.sample(0.32);
  const monk = makeMonk({});
  monk.position.set(mp.x + mp.perp.x * 1.1, 0, mp.z + mp.perp.z * 1.1);
  monk.rotation.y = mp.heading;                  // facing through, like the dolly
  scene.add(monk);

  const world = composeWorld(scene, {
    seed: 7,
    groundSeed: 7,
    keepout: [
      ...path.keepout(26, 1.3),      // the dolly's lane, masked along its whole run
      { x: gp.x, z: gp.z, r: 4.2 },  // gate + lanterns
      { x: monk.position.x, z: monk.position.z, r: 1.6 },
    ],
    grassKeepout: path.keepout(26, 1.15),   // only the lane clears grass
    mountains: [
      { count: 9, distance: 55, arcSpan: 3.8, color: wash(0.16) },
      { count: 5, distance: 35, arcSpan: 2.6, color: wash(0.28), hScale: 0.7 },
    ],
  });

  for (const [p, rx, rz, op] of [
    [gate.position, 2.2, 0.9, 0.3],
    [monk.position, 0.7, 0.55, 0.4],
    [lanternA.position, 0.35, 0.3, 0.3],
    [lanternB.position, 0.35, 0.3, 0.3],
  ]) {
    const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
    s.position.x = p.x; s.position.z = p.z;
    scene.add(s);
  }

  addOutlines(scene, { width: 0.035, wobble: 0.7 });
  // the meadow breathes, so the idling scene is never static
  return {
    scene,
    // where the menu camera should centre: the gate is the subject of this
    // scene, and the old hardcoded target sat four units in front of it, so the
    // orbit swung around empty road while the gate drifted off-axis
    gateTarget: [gp.x, 1.9, gp.z],
    update: (dt, t) => { world.update(dt, t); },
    dispose() {},
  };
}

const INTRO_SECONDS = 7;

// Returns the title-screen panel view + the dolly driver.
// camera is a THREE.PerspectiveCamera. Options: onDone(), onSound(bool).
export function makeIntro(camera, { onDone, onSound } = {}) {
  let u = 0, done = false;

  // No "Sound?" prompt any more (Frank): the title just names the book. Sound
  // is on by default and the mute button in the toolbar is always there, so
  // there is nothing to ask. The credit/link line can grow here later.
  const el = document.createElement('div');
  el.className = 'gg-view gg-title-view';
  el.innerHTML = '<h1>The Gateless Gate</h1>'
    + '<p class="sub">An interactive reading of the Mumonkan</p>';

  function apply() {
    const { pos, look } = introPath(u);
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
  }
  apply();

  function finish() {
    if (done) return;
    done = true;
    onDone && onDone();
  }

  return {
    el,
    get done() { return done; },
    update(dt) {
      if (done) return;
      u = Math.min(1, u + dt / INTRO_SECONDS);
      apply();
      if (u >= 1) finish();
    },
    skip() { finish(); },
    dispose() { el.remove(); },
  };
}
