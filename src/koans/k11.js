import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 11;

// Joshu comes to a monk who has retired to meditate and asks "What is, is
// what?" The monk raises his fist. Joshu says the water is too shallow for
// ships, and leaves. Days later he comes back, asks the same question, gets
// the same fist, and says "Well given, well taken, well killed, well saved" —
// and bows.
//
// The fist is identical both times. So the fist is the one accented thing in
// the scene, and the interaction is Joshu's verdict: touch it and he turns
// away; touch it again and he bows to it. Nothing about the fist changes. The
// case is entirely in the man who is looking at it, which is Mumon's question:
// where is the fault?

const TURN_RATE = 2.4;
const BOW = 0.20;
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const bearing = (from, to) => Math.atan2(-(to.z - from.z), to.x - from.x);

export default {
  id: ID,
  slug: 'joshu-examines-a-monk-in-meditation',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.22', 'fist', 'music'],
  camera: { distance: 10.0, target: [0.6, 1.35, -0.6], azimuth: 0.55, polar: 1.25 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // the path Joshu came up, twice
    const path = makePath({ from: [5.2, 8.0], to: [-3.4, -17], width: 1.2, seed: ID, groundSeed: 21, wander: 1.3 });
    scene.add(path);

    // the hut he retired to, on its rise
    const rise = new THREE.Mesh(
      new THREE.CylinderGeometry(3.0, 3.6, 0.45, 10),
      toonMaterial({ color: WASH.ground, flat: true }));
    rise.name = 'rise';
    rise.position.set(-0.4, 0.22, -2.6);
    scene.add(rise);

    const hut = makeHut({ width: 2.4, height: 2.0, depth: 2.0 });
    hut.position.set(-1.0, 0.44, -3.6);
    hut.rotation.y = 0.62;
    scene.add(hut);

    // THE MONK, seated before his door with the fist up. pose 'raise' holds the
    // sleeve nearly vertical, offered to the air rather than aimed at anyone.
    const monk = makeMonk({ height: 1.5, pose: 'raise', hat: false });
    monk.position.set(0.5, 0.44, -1.9);
    scene.add(monk);
    // he is looking at his visitor, both times — a fist raised at nobody in
    // particular would read as a man alone rather than as an answer given

    // THE FIST — the seal. The raised sleeve, and nothing else in the scene,
    // is vermillion: it is what both visits are about and the only thing that
    // does not change between them.
    const raised = monk.children
      .filter((c) => c.name === 'arm')
      .find((c) => Math.abs(c.rotation.z) > 1);
    if (raised) raised.material = toonMaterial({ color: ACCENT, flat: true });
    // Parented to the sleeve at its far end rather than positioned by eye in
    // the monk's frame: the sleeve geometry runs from 0 to -sleeveL in its own
    // local y, so this lands on the hand wherever the pose puts it.
    const fist = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 9, 7),
      toonMaterial({ color: ACCENT, flat: true }));
    fist.name = 'fist';
    fist.position.y = -0.34 * 1.5;
    (raised || monk).add(fist);

    // JOSHU, down on the path, who will make up his mind about it
    const JOSHU = new THREE.Vector3(3.0, 0, 1.6);
    aimMonk(monk, JOSHU);
    const joshu = makeMonk({ height: 1.64, elder: true });
    joshu.position.copy(JOSHU);
    const AT_MONK = bearing(JOSHU, monk.position);
    const AWAY = bearing(JOSHU, { x: 7.0, z: 4.5 });      // back down the road
    joshu.rotation.y = AT_MONK;
    scene.add(joshu);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.1),
        { x: -0.4, z: -2.6, r: 3.8 },
        { x: JOSHU.x, z: JOSHU.z, r: 1.2 },
      ],
      grassKeepout: [
        ...path.keepout(24, 0.95),
        { x: -1.0, z: -3.6, r: 1.7 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [monk.position, 0.6, 0.48, 0.40],
      [JOSHU, 0.68, 0.52, 0.42],
      [hut.position, 1.7, 1.3, 0.28],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.9, 7),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'fist-hit';
    hit.userData.noOutline = true;
    hit.position.set(0.5, 0.44 + 1.05, -1.75);
    scene.add(hit);

    // ---- the moment: the same fist, twice --------------------------------
    let camera = null;
    let clock = 0;
    let visits = 0;             // odd = dismissed, even = approved
    let bowAt = -99;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      visits++;
      if (visits % 2 === 0) {
        bowAt = clock;
        audio && audio.chimeStrike({ tube: 1, force: 0.55 });   // well given, well taken
      } else {
        audio && audio.knock({ force: 0.4 });                   // and he walks off
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        const step = Math.max(0, dt || 0);

        // he turns away on the odd verdicts and back on the even ones
        const want = (visits > 0 && visits % 2 === 1) ? AWAY : AT_MONK;
        joshu.rotation.y += wrapPi(want - joshu.rotation.y) * (1 - Math.exp(-TURN_RATE * step));

        // and on the even ones he bows to it
        const u = bowAt > -99 ? (clock - bowAt) : -1;
        let lean = 0;
        if (u >= 0 && u < 2.6) {
          lean = Math.min(1, u / 0.7, (2.6 - u) / 0.9);
          lean = lean * lean * (3 - 2 * lean);
        }
        joshu.rotation.z = -BOW * lean;
      },
      fragment() {
        return {
          visits,
          approved: visits > 0 && visits % 2 === 0,
          bow: +Math.abs(joshu.rotation.z).toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
