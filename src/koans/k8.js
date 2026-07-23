import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeWheel, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 8;

// Getsuan asks what becomes of a wheel when you take out the nave — the hub
// that unites fifty spokes. So the scene is a wheelwright's yard with one
// finished wheel standing on its stand, and the koan is a thing you can
// actually do to it: reach in, take the nave, and watch what is left.
//
// What is left keeps turning. It was never the hub that turned it.
export default {
  id: ID,
  slug: 'keichu-s-wheel',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // the wheel is a real emitter: it knocks when it comes apart and when it
  // gathers itself back
  ambience: ['wind:0.20', 'wheel', 'music'],
  mood: 'yo',        // a workshop in daylight, not a night of doubt
  // closer than the default diorama rig: the subject is a wheel, not a hillside
  camera: { distance: 9.0, target: [1.3, 1.25, 0.4], azimuth: 0.55, polar: 1.24 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    const path = makePath({ from: [-3.0, 8.5], to: [3.6, -18], width: 1.3, seed: ID, groundSeed: 21, wander: 1.0 });
    scene.add(path);

    // THE WHEEL, on its stand, turning. Its face is squared to the home camera
    // so the spokes read as spokes rather than as an edge-on line.
    const wheel = makeWheel({ radius: 1.05, spokes: 12, wheelColor: ACCENT });
    wheel.group.position.set(1.3, 0, 0.4);
    wheel.group.rotation.y = 0.55;
    scene.add(wheel.group);

    // the yard it stands in: a trestle with an unfinished rim leaning on it —
    // one wheel finished, one not, which is what a wheelwright's yard is
    const timber = toonMaterial({ color: WASH.dark, flat: true });
    const trestle = new THREE.Group();
    trestle.name = 'trestle';
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.72, 0.11), timber);
      leg.name = 'leg';
      leg.position.set(sx * 0.5, 0.36, 0);
      trestle.add(leg);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.09, 0.34), timber);
    top.name = 'bench';
    top.position.y = 0.76;
    trestle.add(top);
    trestle.position.set(-1.9, 0, -1.5);
    trestle.rotation.y = -0.4;
    scene.add(trestle);

    const blank = new THREE.Mesh(
      new THREE.TorusGeometry(0.78, 0.05, 5, 22),
      toonMaterial({ color: WASH.mid, flat: true }));
    blank.name = 'blank';                       // a rim with no spokes in it yet
    blank.position.set(-1.55, 0.80, -0.95);
    blank.rotation.set(-0.34, 0.5, 0.22);       // leaning against the bench
    scene.add(blank);

    // Getsuan, who asked, and the student he asked
    const master = makeMonk({ height: 1.66, elder: true });
    master.position.set(-0.5, 0, 2.1);
    aimMonk(master, wheel.group.position);
    scene.add(master);

    const student = makeMonk({ height: 1.56, pose: 'sit' });
    student.position.set(3.5, 0, 1.5);
    aimMonk(student, wheel.group.position);
    scene.add(student);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.1),
        { x: 1.3, z: 0.4, r: 2.0 },
        { x: -1.9, z: -1.5, r: 1.6 },
        { x: -0.5, z: 2.1, r: 1.1 },
        { x: 3.5, z: 1.5, r: 1.1 },
      ],
      // the working yard is trodden bare around the stand and the bench
      grassKeepout: [
        ...path.keepout(24, 0.95),
        { x: 1.3, z: 0.4, r: 1.5 },
        { x: -1.9, z: -1.5, r: 1.1 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [wheel.group.position, 0.8, 0.6, 0.38],
      [trestle.position, 0.8, 0.45, 0.32],
      [master.position, 0.68, 0.52, 0.42],
      [student.position, 0.62, 0.5, 0.40],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: take out the nave -----------------------------------
    let camera = null;
    let pulls = 0;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, wheel.pickTargets())) return;
      const whole = wheel.toggle();
      pulls++;
      // wood coming apart, and wood gathering itself back
      audio && audio.knock({ force: whole ? 0.55 : 0.85 });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        world.update(dt, simTime);
        wheel.update(dt, simTime);
      },
      fragment() {
        return {
          pulls,
          hubbed: wheel.hubbed(),
          assembled: +wheel.assembled().toFixed(3),
          turn: +wheel.turn().toFixed(3),
        };
      },
      dispose() {},
    };
  },
};
