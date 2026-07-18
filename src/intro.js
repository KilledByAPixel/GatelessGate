import * as THREE from '../lib/three.module.js';
import { PAPER } from './palette.js';
import { makeIsland, makeGate, makeLights, addOutlines, makeBlobShadow } from './kit/index.js';
import { introPath } from './intro_rails.js';

// The book's cover backdrop: also the menu's idling scene.
export function buildHub() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.05);
  scene.add(makeLights());
  scene.add(makeIsland({ radius: 8, seed: 7 }));

  const gate = makeGate({ width: 3.0, height: 3.4 });
  gate.position.set(0, 0, -1);
  scene.add(gate);
  const sh = makeBlobShadow({ radiusX: 2.2, radiusZ: 0.9, opacity: 0.3 });
  sh.position.set(0, 0, -1);
  scene.add(sh);

  addOutlines(scene, { width: 0.035, wobble: 0.7 });
  return { scene, update() {}, dispose() {} };
}

const INTRO_SECONDS = 7;

// camera is a THREE.PerspectiveCamera. Options: onDone(), onSound(bool).
export function makeIntro(camera, { onDone, onSound } = {}) {
  let u = 0, done = false;

  const title = document.createElement('div');
  title.className = 'gg-title';
  title.textContent = 'The Gateless Gate';
  document.body.appendChild(title);

  const card = document.createElement('div');
  card.className = 'gg-sound-card';
  card.innerHTML = '<p>Sound on?</p><button data-yes>Yes</button><button data-no>Not now</button>';
  document.body.appendChild(card);
  card.querySelector('[data-yes]').onclick = () => { onSound && onSound(true); card.remove(); };
  card.querySelector('[data-no]').onclick = () => { onSound && onSound(false); card.remove(); };

  function apply() {
    const { pos, look } = introPath(u);
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
    title.style.opacity = String(Math.max(0, 1 - Math.abs(u - 0.4) * 2.2)); // peak near the gate
  }
  apply();

  function finish() {
    if (done) return;
    done = true;
    title.remove();
    card.remove();
    onDone && onDone();
  }

  return {
    get done() { return done; },
    update(dt) {
      if (done) return;
      u = Math.min(1, u + dt / INTRO_SECONDS);
      apply();
      if (u >= 1) finish();
    },
    skip() { finish(); },
  };
}
