import * as THREE from '../lib/three.module.js';
import { PAPER } from './palette.js';
import { makeIsland, makeGate, makeMonk, makeFlag, makeTree, makeLights, addOutlines, makeBlobShadow } from './kit/index.js';
import { introPath } from './intro_rails.js';

// The idling stage scene behind the title and the table of contents — a small
// garden that gathers elements from the koans (gate, a monk, a flag, a tree).
export function buildHub() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.05);
  scene.add(makeLights());
  scene.add(makeIsland({ radius: 8, seed: 7 }));

  const gate = makeGate({ width: 3.0, height: 3.4 });
  gate.position.set(0, 0, -1.2);
  const tree = makeTree({ seed: 5 });
  tree.position.set(-3.4, 0, -1.6);
  const monk = makeMonk({});
  monk.position.set(-1.2, 0, 1.0);
  monk.rotation.y = 0.7;
  const flag = makeFlag({ seed: 11 });
  flag.group.position.set(2.9, 0, -0.2);
  scene.add(gate, tree, monk, flag.group);

  for (const [p, rx, rz, op] of [
    [gate.position, 2.2, 0.9, 0.3],
    [tree.position, 1.7, 1.4, 0.34],
    [monk.position, 0.7, 0.55, 0.4],
    [flag.group.position, 0.55, 0.45, 0.34],
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
