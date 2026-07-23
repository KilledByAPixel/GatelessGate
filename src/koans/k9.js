import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT_DEEP, wash } from '../palette.js';
import {
  composeWorld, makeBuddha, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 9;

// A Buddha who sat before recorded history, for ten cycles of existence, and
// did not become a Buddha. The scene has to hold that span, so it is built out
// of TIME rather than architecture: a colossal seated figure worn into the
// hillside, and the ground around it laid down in strata, each band an age.
//
// One thin band near the top is vermillion — the age we are standing in. It is
// the thinnest layer in the picture. That is the whole comment.
//
// Touch the figure and the deepest bell in the book sounds, once. Nothing else
// happens; nothing else has happened for ten cycles.
export default {
  id: ID,
  slug: 'a-buddha-before-history',
  title: TEXT[ID].title,
  accent: ACCENT_DEEP,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.16', 'bell', 'music'],
  // sat back and tilted up: the subject is six units tall and the point is
  // that you are small in front of it
  camera: { distance: 17.5, target: [0.4, 3.2, -3.0], azimuth: 0.55, polar: 1.16 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.024);       // thinner: the scale needs depth
    scene.add(makeLights());

    // ---- the strata -------------------------------------------------------
    // Terraces stepping up to the plinth, each one paler than the last as it
    // recedes into the past. Wide and shallow, so they read as geology rather
    // than as steps someone built.
    const BANDS = [
      { r: 8.6, h: 0.34, t: 0.30 },
      { r: 7.4, h: 0.30, t: 0.27 },
      { r: 6.3, h: 0.28, t: 0.24 },
      { r: 5.4, h: 0.26, t: 0.21 },
      { r: 4.6, h: 0.24, t: 0.18 },
    ];
    const strata = new THREE.Group();
    strata.name = 'strata';
    let y = 0;
    for (const [i, b] of BANDS.entries()) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(b.r * 0.93, b.r, b.h, 11),
        toonMaterial({ color: wash(b.t), flat: true }));
      band.name = 'stratum';
      band.position.y = y + b.h / 2;
      band.rotation.y = i * 0.19;
      strata.add(band);
      y += b.h;

      // THE PRESENT: a seam between the last two ages, thinner than any of
      // them — a slightly darker band, not the seal. The accent belongs to the
      // Buddha here (Frank's call: the figure is what the case is about, not
      // the ground).
      if (i === BANDS.length - 2) {
        const seam = new THREE.Mesh(
          new THREE.CylinderGeometry(b.r * 0.90, b.r * 0.93, 0.045, 11),
          toonMaterial({ color: wash(0.44), flat: true }));
        seam.name = 'seam';
        seam.position.y = y + 0.0225;
        strata.add(seam);
        y += 0.045;
      }
    }
    strata.position.set(0.4, 0, -3.0);
    scene.add(strata);

    // ---- the figure -------------------------------------------------------
    // Sunk to the hips in the top terrace: he was there before the ground was.
    // He is the seal: the one who sat ten cycles and did not become a Buddha is
    // the whole subject, so the accent is on him.
    const SEAT_Y = y - 0.55;
    const buddha = makeBuddha({ height: 6.2, color: ACCENT_DEEP });
    buddha.position.set(0.4, SEAT_Y, -3.0);
    scene.add(buddha);

    // the monk who came to ask why, at the foot of the lowest terrace
    const monk = makeMonk({ height: 1.58 });
    monk.position.set(4.2, 0, 5.4);
    aimMonk(monk, buddha.position);
    scene.add(monk);

    // and Seijo, who answered that the question answers itself
    const seijo = makeMonk({ height: 1.64, elder: true });
    seijo.position.set(6.0, 0, 4.0);
    aimMonk(seijo, monk.position);
    scene.add(seijo);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 3,
      treeRing: [13, 22],
      keepout: [
        { x: 0.4, z: -3.0, r: 9.4 },       // the whole monument
        { x: 4.2, z: 5.4, r: 1.2 },
        { x: 6.0, z: 4.0, r: 1.2 },
      ],
      grassKeepout: [{ x: 0.4, z: -3.0, r: 8.8 }],
    });

    for (const [p, rx, rz, op] of [
      [monk.position, 0.62, 0.5, 0.40],
      [seijo.position, 0.68, 0.52, 0.42],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.038, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.8, 5.0, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'buddha-hit';
    hit.userData.noOutline = true;
    hit.position.set(0.4, SEAT_Y + 2.2, -3.0);
    scene.add(hit);

    // ---- the moment: the oldest sound in the book -------------------------
    let camera = null;
    let clock = 0;
    let tolls = 0;
    let lastToll = -99;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      if (clock - lastToll < 2.0) return;      // it does not hurry for anyone
      lastToll = clock;
      tolls++;
      audio && audio.bell({ f0: 49 });         // an octave under the bonshō
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
      },
      fragment() {
        return { tolls, since: +Math.min(999, clock - lastToll).toFixed(1) };
      },
      dispose() {},
    };
  },
};
