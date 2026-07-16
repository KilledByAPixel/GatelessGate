import * as THREE from '../lib/three.module.js';
import { PAPER } from './palette.js';
import { makeLights } from './render/toon.js';
import { makeIsland } from './kit/island.js';
import { makeMonk } from './kit/monk.js';
import { makeTree } from './kit/tree.js';
import { makeGate } from './kit/gate.js';
import { makeFlag } from './kit/flag.js';
import { addOutlines } from './render/outlines.js';
import { makeBlobShadow } from './render/blobshadow.js';

// The M0 look-dev island. Disposable composition; the modules it exercises are not.
export function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.058);
  scene.add(makeLights());

  scene.add(makeIsland({ radius: 6, seed: 3 }));

  const monk = makeMonk({});
  monk.position.set(-0.3, 0, 0.9);
  monk.rotation.y = -0.5;

  const tree = makeTree({ seed: 5 });
  tree.position.set(-2.6, 0, -1.2);

  const gate = makeGate({});
  gate.position.set(2.6, 0, -2.2);
  gate.rotation.y = 0.35;

  const flag = makeFlag({ seed: 11 });
  flag.group.position.set(3.6, 0, -1.4);

  scene.add(monk, tree, gate, flag.group);

  const shadowSpecs = [
    [monk.position, 0.7, 0.55, 0.42],
    [tree.position, 1.7, 1.4, 0.36],
    [gate.position, 1.8, 0.75, 0.32],
    [flag.group.position, 0.55, 0.45, 0.36],
  ];
  for (const [p, rx, rz, op] of shadowSpecs) {
    const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
    s.position.x = p.x;
    s.position.z = p.z;
    scene.add(s);
  }

  addOutlines(scene, { width: 0.035, wobble: 0.7 });

  const update = (dt, simTime) => {
    flag.update(dt, simTime);
  };

  return { scene, flag, update };
}
