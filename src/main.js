import * as THREE from '../lib/three.module.js';
import { buildScene } from './scene_m0.js';
import { makeCameraRig } from './camera.js';
import { makeDissolve } from './render/dissolve.js';
import { installGrain } from './render/grain.js';
import { clothEnergy } from './sim/verlet.js';

const STEP = 1 / 60;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const { scene, flag, update } = buildScene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
const rig = makeCameraRig(camera, renderer.domElement);
const dissolve = makeDissolve();
dissolve.setAspect(innerWidth / innerHeight);
scene.add(dissolve.mesh);
installGrain(document);

let simTime = 0;
function tick() {
  simTime += STEP;
  update(STEP, simTime);
  rig.update(STEP);
  dissolve.update(STEP);
}
function render() {
  renderer.render(scene, camera);
}

// Real-time playback: wall clock paces the fixed-step sim, nothing more.
let acc = 0, last = performance.now(), fps = 60;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (dt > 0) fps = fps * 0.95 + (1 / dt) * 0.05;
  acc += dt;
  while (acc >= STEP) {
    acc -= STEP;
    tick();
  }
  render();
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  dissolve.setAspect(camera.aspect);
});

window.gate = {
  step(n = 1) {
    for (let i = 0; i < n; i++) tick();
    render();
    return window.gate.state();
  },
  state() {
    return {
      simTime: +simTime.toFixed(4),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      fps: Math.round(fps),
      clothEnergy: +clothEnergy(flag.cloth).toFixed(6),
      dissolveT: +dissolve.t.toFixed(4),
      camera: rig.state(),
    };
  },
  dissolve(dir = 'in', dur) {
    return dir === 'in' ? dissolve.dissolveIn(dur) : dissolve.dissolveOut(dur);
  },
};

dissolve.dissolveIn(0.9);
requestAnimationFrame(frame);
