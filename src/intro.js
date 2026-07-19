import * as THREE from '../lib/three.module.js';
import { PAPER } from './palette.js';
import {
  composeWorld, makePath, makeLantern, makeGate, makeMonk, makeFlag,
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

  const gate = makeGate({ width: 3.0, height: 3.4 });
  gate.position.set(0, 0, -1.2);
  scene.add(gate);

  // the intro dolly rides this line: the path runs straight through the gate
  scene.add(makePath({ from: [0, 14], to: [0.8, -36], width: 1.9, seed: 93, groundSeed: 7, wander: 1.2 }));

  const lanternA = makeLantern({});
  lanternA.position.set(-1.9, 0, -1.6);
  lanternA.rotation.y = 0.3;
  const lanternB = makeLantern({ height: 1.0 });
  lanternB.position.set(1.9, 0, -0.8);
  lanternB.rotation.y = -0.5;
  scene.add(lanternA, lanternB);

  const monk = makeMonk({});
  monk.position.set(-1.5, 0, 1.6);
  monk.rotation.y = 0.7;
  const flag = makeFlag({ seed: 11 });
  flag.group.position.set(3.1, 0, -0.4);
  scene.add(monk, flag.group);

  composeWorld(scene, {
    seed: 7,
    groundSeed: 7,
    keepout: [
      { x: 0, z: -1.2, r: 3.8 },   // gate + lanterns
      { x: -1.5, z: 1.6, r: 1.6 }, // monk
      { x: 3.1, z: -0.4, r: 1.4 }, // flag
      { x: 0.3, z: -14, r: 3.4 },  // path into the fog
      { x: 0, z: 8, r: 3.2 },      // path toward the camera (the dolly's lane)
    ],
    mountains: [
      { count: 9, distance: 55, arcSpan: 3.8, color: '#C9C4B5' },
      { count: 5, distance: 35, arcSpan: 2.6, color: '#B4AF9F', hScale: 0.7 },
    ],
  });

  for (const [p, rx, rz, op] of [
    [gate.position, 2.2, 0.9, 0.3],
    [monk.position, 0.7, 0.55, 0.4],
    [flag.group.position, 0.55, 0.45, 0.34],
    [lanternA.position, 0.35, 0.3, 0.3],
    [lanternB.position, 0.35, 0.3, 0.3],
  ]) {
    const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
    s.position.x = p.x; s.position.z = p.z;
    scene.add(s);
  }

  addOutlines(scene, { width: 0.035, wobble: 0.7 });
  // the flag drifts gently so the idling scene is never quite static
  return { scene, update: (dt, t) => flag.update(dt, t), dispose() {} };
}

const INTRO_SECONDS = 7;

// Returns the title-screen panel view + the dolly driver.
// camera is a THREE.PerspectiveCamera. Options: onDone(), onSound(bool).
export function makeIntro(camera, { onDone, onSound } = {}) {
  let u = 0, done = false;

  const el = document.createElement('div');
  el.className = 'gg-view gg-title-view';
  el.innerHTML = '<h1>The Gateless Gate</h1><p class="sub">An interactive reading of the Mumonkan</p>';
  const q = document.createElement('div');
  q.className = 'sound-q';
  q.innerHTML = '<span>Sound?</span><br><button data-yes>Yes</button><button data-no>Not now</button>';
  el.appendChild(q);
  q.querySelector('[data-yes]').onclick = () => { onSound && onSound(true); q.remove(); };
  q.querySelector('[data-no]').onclick = () => { onSound && onSound(false); q.remove(); };

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
