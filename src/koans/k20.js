import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, INK, INK_LIT, WASH, mixHex, wash } from '../palette.js';
import {
  composeWorld, makePath, makeMonk, faceMonk, makeWater, makeSand,
  makeLights, makeBlobShadow, addOutlines, toonMaterial, groundHeight,
} from '../kit/index.js';
import { mergeSimple } from '../kit/scatter.js';

const ID = 20;

// "Why does the enlightened man not stand on his feet and explain himself?"
// And: "If the feet of enlightenment moved, the great ocean would overflow."
//
// So he does not move — and now the great ocean is IN the picture to be
// moved. He stands on a coast road; behind him the grass runs out into sand,
// the sand into slow shoreward swells, the swells into paper. Push him and
// THE WORLD MOVES INSTEAD — road, mountains, beach, and the whole sea lurch
// and settle while he stays exactly where he is. The verse, staged literally.
//
// HE IS AN ORDINARY MAN. He was a colossus for a while — nearly three times a
// man — taken straight from the verse. It did not survive being looked at
// (Frank: "is the guy really big there? I can't really tell what's going
// on"); ordinary is also the better reading — a giant who cannot be shoved is
// physics; an ordinary man who cannot be shoved, while the ocean swings, is
// the case.
//
// Mechanically that is one group: everything the world grammar builds goes
// into `moving`, and the figure is parented to the scene root beside it.

const SHOVE = 0.34;      // metres the world gives
const PERIOD = 1.35;
const OMEGA = (2 * Math.PI) / PERIOD;
const TAU = 0.9;

// The coast: sea to the -z, waterline 8 out, a 4-metre beach, the bed
// settling 1.4 under the surface. ONE object, shared by the ground, the sand
// ribbon and the water's resting height — the beach lives here and nowhere
// else.
const SHORE = { dx: 0, dz: -1, dist: 8, width: 4, sea: -0.35, depth: 1.4 };
// keep scatter, grass and trees out of the sea and off the beach — three rows
// of circles laid along the coast, feathered by the fields themselves. Rows
// two and three sit well out in the water and leave gaps between circles at
// their spacing (14/16 m radius, 12 m spacing dips to z ≈ -7.35 at the worst
// seam) — nowhere near enough to cover the beach taper itself (z = -4..-8,
// see SHORE above). Row one hugs that taper directly (z = -10, r = 6, 8 m
// spacing) so nothing plants on the shored, lowered sand.
const SEA_KEEP = [
  ...[-24, -16, -8, 0, 8, 16, 24].map((x) => ({ x, z: -10, r: 6 })),
  ...[-24, -12, 0, 12, 24].map((x) => ({ x, z: -20, r: 14 })),
  ...[-18, -6, 6, 18].map((x) => ({ x, z: -34, r: 16 })),
];

export default {
  id: ID,
  slug: 'the-enlightened-man',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // the surf bed, at last: makeWaterBed was kept for "a scene with genuinely
  // MOVING water — an ocean". This is that scene.
  ambience: ['wind:0.22', 'water:0.55', 'music'],
  // A low lens: the camera sits near the grass and looks out past the two of
  // them to open water, so the upper frame is ocean dissolving into paper.
  camera: { distance: 12.0, target: [0.9, 1.15, 0.2], azimuth: 0.35, polar: 1.38 },

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

    // a coast road, running parallel with the shoreline — the reader looks
    // across it to the sea, and it dead-ends into nothing (Frank: a road
    // aimed at the water "is going to be a dead end into the ocean")
    const path = makePath({ from: [-25, -.9], to: [15, 3.8], width: 1.8, seed: ID, groundSeed: 21, wander: 2.7 });
    moving.add(path);

    // THE IMMOVABLE MAN — mid-stride, one sleeve forward, and not going
    // anywhere. A tall, heavy-set elder and nothing more; the book's own
    // figure ink, like everyone else.
    const H = 1.78;
    const colossus = makeMonk({ height: H, stout: 1.12, elder: true });
    colossus.name = 'immovable-man';
    colossus.position.set(0.4, 0, -0.8);
    faceMonk(colossus, { x: 5.0, z: 5.0 });
    // The staff stays ink: the seal moved to the sea (see the water below).
    // One warm note per page, and this page's is the great ocean itself.
    // Restore `staff.material = toonMaterial({ color: ACCENT, flat: true })`
    // if the seal ever comes back to his hand.
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

    // A stone waymarker beside the road, worn down by everyone who has tried:
    // a square pillar that tapers as it rises, a pyramid cap, a half-buried
    // plinth, a step darker than the road so it stands against the ribbon.
    const MARKER = { x: -0.95, z: 1.0 };
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

    // ---- the coast itself ------------------------------------------------
    // The great ocean: a big sheet whose near edge hides under the sand and
    // whose far edges die in the fog, with one slow swell rolling shoreward.
    // It sits in `moving` with everything else: push the man, and the sea
    // itself gives.
    // THE RED SEA IS THE SEAL. The verse turns on the great ocean — "if the
    // feet of enlightenment moved, the great ocean would overflow" — so the
    // ocean takes the case's accent, not the staff (Frank: "it might even be
    // cool for the ocean to be red instead of his stick... let's make the
    // ocean red in that one"). Full ACCENT, which is what Frank approved on
    // sight; if it ever reads as pigment rather than water at this size, the
    // case-30 lesson says ACCENT_PALE is the step to take. The white Phong
    // glints stay — they are what says water. (For the record: this sheet was
    // WASH.stone once and the fog ate it whole at grazing distance, then
    // monk-dark INK_LIT for a day; the red began as a where-is-it marker and
    // got promoted.)
    //
    // Segments 64: the default cap (30) gave 3-unit cells across 90 units,
    // and a single shoreward sine on that grid rendered as parallel bars
    // (Frank: "the waves are mostly horizontal... there's no tessellation").
    // A finer grid plus three crossing swells — one main set rolling in, two
    // gentler obliques at ±~20° with their own wavelengths and periods — is
    // what breaks the crests into a sea.
    const water = makeWater({
      shape: 'square', size: 90, color: ACCENT, seed: ID,
      opacity: 0.85, segments: 64,
      drift: [
        { dx: 0, dz: 1, amp: 0.045, wavelength: 8, period: 6 },
        { dx: 0.2764, dz: 0.9611, amp: 0.022, wavelength: 5.2, period: 4.6 },
        { dx: -0.3429, dz: 0.9394, amp: 0.017, wavelength: 3.4, period: 3.5 },
      ],
    });
    water.group.position.set(0, SHORE.sea, -(SHORE.dist + 43));
    moving.add(water.group);

    const sand = makeSand({ shore: SHORE, seed: ID, groundSeed: 21 });
    moving.add(sand);

    const world = composeWorld(moving, {
      seed: ID,
      groundSeed: 21,
      shore: SHORE,
      // grass plants at plain groundHeight(groundSeed) by default; without
      // this the shore's own dip never reaches it, so any tuft that survives
      // near the keepout's feathered edge would still stand on the unshored
      // surface. Pass the TRUE shored surface so it plants where the sand
      // actually is.
      groundFn: (x, z) => groundHeight(x, z, { seed: 21, shore: SHORE }),
      trees: 4,
      // the coast at the reader's back: both mountain bands re-aimed behind
      // and beside the staging — nothing stands in the sea
      mountains: [
        { count: 7, distance: 52, arcCenter: Math.PI, arcSpan: 3.6, color: wash(0.16) },
        { count: 4, distance: 33, arcCenter: -2.2, arcSpan: 1.3, color: wash(0.28), hScale: 0.65 },
      ],
      forests: [
        { center: [-22, 0, 8], spread: 12, count: 45 },
        { center: [19, 0, 12], spread: 12, count: 35, color: wash(0.55) },
      ],
      keepout: [
        ...path.keepout(24, 1.4),
        { at: colossus, r: 1.4 },
        { at: monk, r: 1.2 },
        { x: MARKER.x, z: MARKER.z, r: 0.9 },
        ...SEA_KEEP,
      ],
      grassKeepout: [
        ...path.keepout(26, 1.0),
        { x: MARKER.x, z: MARKER.z, r: 0.45 },
        ...SEA_KEEP,
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
        water.update(dt, simTime);
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
      dispose() { water.dispose(); },
    };
  },
};
