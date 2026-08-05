import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, INK, WASH, mixHex } from '../palette.js';
import {
  composeWorld, makePath, makeMonk, faceMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';
import { mergeSimple } from '../kit/scatter.js';

const ID = 20;

// "Why does the enlightened man not stand on his feet and explain himself?"
// And: "If the feet of enlightenment moved, the great ocean would overflow."
//
// So he does not move. He stands mid-stride on the road, and when you push him
// THE WORLD MOVES INSTEAD — the ground, the road, the mountains, the grass,
// everything except him lurches and settles back. He stays exactly where he is,
// because there is nowhere for him to go.
//
// HE IS AN ORDINARY MAN. He was a colossus for a while — nearly three times a
// man — taken straight from the verse ("if that head bowed, it would look down
// upon the heavens"). It did not survive being looked at: at that size he
// filled the frame from the waist up, the one figure put there to give him
// scale was cropped off the bottom edge, and the scene read as a monk standing
// in grass rather than as anything about size at all (Frank: "is the guy really
// big there? I can't really tell what's going on... why did we decide to make
// that person a giant? I think that might be weird").
//
// Ordinary is also the better reading. A giant who cannot be shoved is physics;
// an ordinary man who cannot be shoved, while the mountains swing, is the case.
// The verse's cosmic body is Mumon's poetry about enlightenment, and the style
// guide's answer to that has always been ink metaphor rather than literal size.
//
// Mechanically that is one group: everything the world grammar builds goes
// into `moving`, and the figure is parented to the scene root beside it.

const SHOVE = 0.34;      // metres the world gives
const PERIOD = 1.35;
const OMEGA = (2 * Math.PI) / PERIOD;
const TAU = 0.9;

export default {
  id: ID,
  slug: 'the-enlightened-man',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.26', 'music'],
  // Re-framed with him: at three times a man the lens sat back 15 units and
  // aimed at his chest 2.4 up, which put his shoulders across the whole frame
  // and cropped the other figure off the bottom. House distance now, aimed
  // between the two of them so both stand in the picture — the shove is only
  // legible if there is something in shot that DOESN'T stay put.
  camera: { distance: 11.8, target: [1.4, 1.25, 0.6], azimuth: 0.55, polar: 1.22 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.028);
    scene.add(makeLights());

    // EVERYTHING THAT CAN BE MOVED
    const moving = new THREE.Group();
    moving.name = 'moving-world';
    scene.add(moving);

    const path = makePath({ from: [-5.0, 9.0], to: [4.0, -20], width: 1.8, seed: ID, groundSeed: 21, wander: 0.7 });
    moving.add(path);

    // THE IMMOVABLE MAN — mid-stride, one sleeve forward, and not going
    // anywhere. A tall, heavy-set elder and nothing more; the book's own figure
    // ink, like everyone else.
    const H = 1.78;
    const colossus = makeMonk({ height: H, stout: 1.12, elder: true });
    colossus.position.set(0.4, 0, -0.8);
    faceMonk(colossus, { x: 5.0, z: 5.0 });
    // the staff is the seal: thin enough to take full accent at this size
    const staff = colossus.getObjectByName('staff');
    if (staff) staff.material = toonMaterial({ color: ACCENT, flat: true });
    // caught mid-stride: leaned into the step, one sleeve swung forward
    colossus.rotation.z = -0.05;
    const arms = [];
    colossus.traverse((o) => { if (o.name === 'arm') arms.push(o); });
    if (arms[0]) arms[0].rotation.x = -0.55;
    if (arms[1]) arms[1].rotation.x = 0.42;
    scene.add(colossus);

    // a traveller who stopped in front of him — the one who asked
    const monk = makeMonk({ height: 1.58 });
    monk.position.set(3.6, 0, 3.4);
    faceMonk(monk, colossus.position);
    moving.add(monk);

    // A stone waymarker beside the road, worn down by everyone who has tried.
    // It used to be a plain box ON the path — Frank: "why is there a weird
    // cube in the road?" — so now it is shaped like the thing it is: a square
    // pillar that tapers as it rises, a pyramid cap, a half-buried plinth
    // underneath, in a tone a step darker than the road so it stands against
    // the ribbon instead of dissolving into it. And it stands at the verge,
    // not in anyone's way.
    const MARKER = { x: -0.95, z: 1.55 };
    const markerParts = [];
    const shaft = new THREE.CylinderGeometry(0.145, 0.185, 0.82, 4);
    shaft.translate(0, 0.41, 0);
    markerParts.push(shaft);
    const cap = new THREE.ConeGeometry(0.205, 0.17, 4);
    cap.translate(0, 0.82 + 0.075, 0);
    markerParts.push(cap);
    const plinth = new THREE.DodecahedronGeometry(0.26, 0);
    plinth.scale(1.25, 0.42, 1.05);
    plinth.translate(0.02, 0.05, 0.01);
    markerParts.push(plinth);
    const marker = new THREE.Mesh(
      mergeSimple(markerParts),
      toonMaterial({ color: mixHex(WASH.stone, INK, 0.22), flat: true }));
    marker.name = 'marker';
    marker.position.set(MARKER.x, 0, MARKER.z);
    marker.rotation.y = 0.55;
    marker.rotation.z = 0.05;   // an old stone leans a little
    moving.add(marker);

    const world = composeWorld(moving, {
      seed: ID,
      groundSeed: 21,
      trees: 5,
      keepout: [
        ...path.keepout(24, 1.4),
        { at: colossus, r: 1.4 },
        { at: monk, r: 1.2 },
        { x: MARKER.x, z: MARKER.z, r: 0.9 },
      ],
      grassKeepout: [
        ...path.keepout(26, 1.0),
        { x: MARKER.x, z: MARKER.z, r: 0.45 },
      ],
    });

    for (const [p, rx, rz, op, parent] of [
      [colossus.position, 0.72, 0.56, 0.42, scene],
      [monk.position, 0.62, 0.5, 0.40, moving],
      [marker.position, 0.34, 0.26, 0.32, moving],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      parent.add(s);
    }

    addOutlines(scene, { width: 0.036, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.7, H, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'colossus-hit';
    hit.userData.noOutline = true;
    hit.position.set(0.4, H / 2, -0.8);
    scene.add(hit);

    // ---- the moment: push him --------------------------------------------
    let camera = null;
    let clock = 0;
    let shoves = 0;
    const pushes = [];         // { t, dx, dz }

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      // the world gives along the line you pushed from, which is to say: away
      // from the camera
      const dir = new THREE.Vector3(0.4 - camera.position.x, 0, -0.8 - camera.position.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      pushes.push({ t: clock, dx: dir.x, dz: dir.z });
      if (pushes.length > 5) pushes.shift();
      shoves++;
      audio && audio.knock({ force: 0.9, at: colossus.position });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        while (pushes.length && clock - pushes[0].t > 8 * TAU) pushes.shift();

        let ox = 0, oz = 0;
        for (const p of pushes) {
          const t = clock - p.t;
          if (t < 0) continue;
          const e = SHOVE * Math.exp(-t / TAU) * Math.sin(OMEGA * t);
          ox += p.dx * e;
          oz += p.dz * e;
        }
        moving.position.set(ox, 0, oz);
      },
      fragment() {
        return {
          shoves,
          worldX: +moving.position.x.toFixed(4),
          worldZ: +moving.position.z.toFixed(4),
          // he has not moved, and never will
          manX: +colossus.position.x.toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
