import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeMonk, faceMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial, groundHeight,
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
// FACE convention — atan2(dx, dz) turns local +z (the body's front) onto the
// target, the same maths faceMonk uses. It was atan2(-dz, dx) (aimMonk's, for
// the pointing +x sleeve), which left Joshu turned a quarter circle off the
// monk he is deciding about.
const bearing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

export default {
  id: ID,
  slug: 'joshu-examines-a-monk-in-meditation',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.22', 'fist', 'music'],
  camera: { distance: 10.8, target: [-0.2, 1.3, -0.6], azimuth: 0.55, polar: 1.25 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // the path Joshu came up, twice
    const path = makePath({ from: [5.2, 8.0], to: [-3.4, -17], width: 1.2, seed: ID, groundSeed: 21, wander: 1.3 });
    scene.add(path);

    // the hut he retired to, on its rise — set OFF to the side of the road
    // (Frank: the hill was blocking the main path; it used to sit at x -0.4,
    // where the path's closest approach was 2.2 units from its center, well
    // inside the 3.6 base — the road ran straight into the slope and vanished.
    // At -2.8 the centerline clears the base by ~0.9 at its nearest sample).
    const RISE = { x: -2.8, z: -2.6, rTop: 3.0, rBase: 3.6, h: 0.45, sides: 10 };
    const RISE_TOP_Y = 0.22 + RISE.h / 2;          // the plateau's world height
    const rise = new THREE.Mesh(
      new THREE.CylinderGeometry(RISE.rTop, RISE.rBase, RISE.h, RISE.sides),
      toonMaterial({ color: WASH.ground, flat: true }));
    rise.name = 'rise';
    rise.position.set(RISE.x, 0.22, RISE.z);
    scene.add(rise);

    // Height of the rise's SURFACE at (x, z) — the grass plants on this (via
    // composeWorld's groundFn below), so it must match the mesh, not an ideal
    // cone: CylinderGeometry is a ten-sided frustum, and treating it as round
    // floats blades mid-air off the flats and buries them at the corners. A
    // regular polygon's radius toward angle a is apothem / cos(offset from the
    // nearest face's midline); along any ray from the axis the slope face is a
    // straight line from base edge to top edge, so the lerp between the two
    // polygon radii IS the facet, exactly.
    const SLICE = (Math.PI * 2) / RISE.sides;
    const riseHeight = (x, z) => {
      const dx = x - RISE.x, dz = z - RISE.z;
      const d = Math.hypot(dx, dz);
      if (d >= RISE.rBase) return 0;               // cheap out past any corner
      const a = Math.atan2(dx, dz);                // CylinderGeometry runs sin/cos
      const off = ((a % SLICE) + SLICE) % SLICE - SLICE / 2;
      const poly = Math.cos(SLICE / 2) / Math.cos(off);   // polygon radius / circumradius
      const top = RISE.rTop * poly, base = RISE.rBase * poly;
      if (d >= base) return 0;
      if (d <= top) return RISE_TOP_Y;
      return RISE_TOP_Y * ((base - d) / (base - top));
    };

    const hut = makeHut({ width: 2.4, height: 2.0, depth: 2.0 });
    hut.position.set(RISE.x - 0.6, 0.44, RISE.z - 1.0);
    hut.rotation.y = 0.62;
    scene.add(hut);

    // THE MONK, seated before his door with the fist up. pose 'raise' holds the
    // sleeve nearly vertical, offered to the air rather than aimed at anyone.
    const monk = makeMonk({ height: 1.5, pose: 'raise', hat: false });
    monk.position.set(RISE.x + 0.9, 0.44, RISE.z + 0.7);
    scene.add(monk);
    // he is looking at his visitor, both times — a fist raised at nobody in
    // particular would read as a man alone rather than as an answer given

    // THE FIST — the seal. Only the fist is vermillion; the arm stays ink, the
    // way the boy's raised sleeve does in case 3. A whole red arm read as a
    // banner rather than a hand (Frank's note); the red belongs on the fist,
    // which is the thing that is identical on both of Joshu's visits.
    const raised = monk.children
      .filter((c) => c.name === 'arm')
      .find((c) => Math.abs(c.rotation.z) > 1);
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
    faceMonk(monk, JOSHU);
    // `bow: true` hinges him at the sash without changing his arms: makeFigure
    // hands back a group named 'waist' carrying the torso, head and sleeves,
    // and turning THAT forward is the bow. He used to bow by rolling the whole
    // figure on z, which lists a body sideways rather than bending it — the
    // fault Frank caught in cases 32 and 15.
    const joshu = makeMonk({ height: 1.64, elder: true, bow: true });
    const joshuWaist = joshu.getObjectByName('waist');
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
        { x: RISE.x, z: RISE.z, r: 3.8 },
        { x: JOSHU.x, z: JOSHU.z, r: 1.2 },
      ],
      grassKeepout: [
        ...path.keepout(24, 0.95),
        { x: hut.position.x, z: hut.position.z, r: 1.7 },
      ],
      // the grass stands on the rise where the rise is, and on the terrain
      // everywhere else — same seed the terrain itself is built from, so the
      // meadow rides the slope up to the hall instead of knifing through it
      groundFn: (x, z) => Math.max(groundHeight(x, z, { seed: 21 }), riseHeight(x, z)),
    });

    for (const [p, rx, rz, op, y] of [
      [monk.position, 0.6, 0.48, 0.40, RISE_TOP_Y],   // he sits on the plateau,
      [hut.position, 1.7, 1.3, 0.28, RISE_TOP_Y],     // and so does his hut —
      [JOSHU, 0.68, 0.52, 0.42, 0],                   // Joshu is down on the road
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      s.position.y += y;   // atop the rise, not buried inside it at ground level
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.9, 7),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'fist-hit';
    hit.userData.noOutline = true;
    hit.position.set(monk.position.x, 0.44 + 1.05, monk.position.z + 0.15);
    scene.add(hit);

    // ---- the moment: the same fist, twice --------------------------------
    let camera = null;
    let clock = 0;
    let visits = 0;             // odd = dismissed, even = approved
    let bowAt = -99;

    input.onTap(() => {
      if (!camera) return;
      const tap = input.raycastFirst(camera, [hit]);
      if (!tap) return;
      visits++;
      if (visits % 2 === 0) {
        bowAt = clock;
        audio && audio.chimeStrike({ tube: 1, force: 0.55, at: tap.point });   // well given, well taken
      } else {
        audio && audio.knock({ force: 0.4, at: tap.point });                   // and he walks off
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
        // forward, at the waist — bodies front local +z, so a positive turn
        // about x carries the chest that way whatever his yaw is doing
        joshuWaist.rotation.x = BOW * lean;
      },
      fragment() {
        return {
          visits,
          approved: visits > 0 && visits % 2 === 0,
          bow: +Math.abs(joshuWaist.rotation.x).toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
