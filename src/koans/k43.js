import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeMonk, aimMonk, faceMonk, makeAssembly,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 43;
// the staff's hit box is nested under the raised arm, itself under Shuzan —
// its local position is not its world position — one scratch vector, reused
// per tap rather than allocated
const scratchPos = new THREE.Vector3();

// Shuzan holds the short staff out and shuts both doors at once: name it and
// you deny what it is, refuse to name it and you deny what it is. So the staff
// is the whole diorama's subject — held out on the centre line, in accent,
// aimed straight down the throat of the room.
//
// Touching it does the only thing left: it moves. Not an answer, not a
// refusal — the object simply behaves like an object.
export default {
  id: ID,
  slug: 'shuzan-s-short-staff',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.18', 'staff', 'music'],
  camera: { distance: 9.6, target: [0.6, 1.35, 0.0], azimuth: 0.55, polar: 1.26 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    const path = makePath({ from: [-4.0, 8.0], to: [1.6, -18], width: 1.4, seed: ID, groundSeed: 21, wander: 0.8 });
    scene.add(path);

    // SHUZAN, holding it out. aimMonk turns local +x toward a target, so a
    // staff laid along +x is a staff offered to whoever he is facing.
    const SH = 1.68;
    const shuzan = makeMonk({ height: SH });
    shuzan.position.set(-1.5, 0, -1.2);

    // He raises his right arm straight out along his FACING and holds the staff
    // continuing that line, so the long part points AWAY from him, out in front
    // (Frank: it read as held off to the side). The arm swings about z until it
    // is level and pointing along +x — which aimMonk then turns toward the
    // monks — and the staff is parented to the arm so it extends past the hand.
    const SLEEVE_L = 0.34 * SH;
    const rightArm = shuzan.children
      .filter((c) => c.name === 'arm')
      .sort((a, b) => b.position.x - a.position.x)[0];
    if (rightArm) rightArm.rotation.set(0, 0, 1.5);   // level, pointing forward
    scene.add(shuzan);

    // the hand is at the sleeve's hem; the staff hangs off it and keeps going
    const STAFF_L = 0.78;
    const hold = new THREE.Group();
    hold.name = 'hold';
    hold.position.y = -SLEEVE_L;                       // the hem of the raised sleeve
    (rightArm || shuzan).add(hold);

    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.033, STAFF_L, 8),
      toonMaterial({ color: ACCENT, flat: true }));
    staff.name = 'staff';
    staff.position.y = -STAFF_L / 2;                   // continue the arm's line, out front
    hold.add(staff);
    // a bound grip where his sleeve closes on it
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, 0.09, 8),
      toonMaterial({ color: ACCENT, flat: true }));
    grip.name = 'grip';
    grip.position.y = -0.05;
    hold.add(grip);

    // the monks it is being held out to
    const near = makeMonk({ height: 1.56, pose: 'sit' });
    near.position.set(2.3, 0, 1.2);
    faceMonk(near, shuzan.position);
    scene.add(near);

    const second = makeMonk({ height: 1.60, pose: 'sit', stout: 1.05 });
    second.position.set(1.6, 0, 2.6);
    faceMonk(second, shuzan.position);
    scene.add(second);

    aimMonk(shuzan, near.position);

    // and the rest of the hall behind them, sitting well back
    const assembly = makeAssembly({
      count: 7, radius: 2.4, center: [2.6, 3.6], facing: [-1.5, -1.2], spread: 1.3, seed: ID,
    });
    scene.add(assembly);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.2),
        { at: shuzan, r: 1.4 },
        { at: near, r: 1.2 },
        { at: second, r: 1.2 },
        { x: 2.6, z: 3.6, r: 3.4 },
      ],
      grassKeepout: path.keepout(24, 0.95),
    });

    for (const [p, rx, rz, op] of [
      [shuzan.position, 0.7, 0.55, 0.42],
      [near.position, 0.62, 0.5, 0.40],
      [second.position, 0.62, 0.5, 0.40],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, STAFF_L * 1.2, 0.26),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'staff-hit';
    hit.userData.noOutline = true;
    hit.position.y = -STAFF_L / 2;
    hold.add(hit);

    // ---- the moment: it is what it is ------------------------------------
    let camera = null;
    let clock = 0;
    let taps = 0;
    const shakes = [];

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit, staff, grip])) return;
      shakes.push(clock);
      if (shakes.length > 4) shakes.shift();
      taps++;
      audio && audio.knock({ force: 0.5, at: hold.getWorldPosition(scratchPos) });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        let a = 0;
        for (const t0 of shakes) {
          const t = clock - t0;
          if (t < 0) continue;
          a += 0.13 * Math.exp(-t / 0.34) * Math.sin(2 * Math.PI * t / 0.19);
        }
        hold.rotation.z = a;
        hold.rotation.y = a * 0.5;
      },
      fragment() {
        return { taps, shake: +hold.rotation.z.toFixed(4) };
      },
      dispose() {},
    };
  },
};
