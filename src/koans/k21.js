import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, INK_LIT } from '../palette.js';
import { hash1 } from '../util/noise.js';
import {
  composeWorld, makeMonk, faceMonk, makeButterflies, makeWildflowers,
  makeLights, washMaterial,
} from '../kit/index.js';

const ID = 21;

// "What is Buddha?" — "Dried dung."
//
// The answer is deliberately worthless, so the scene refuses to dress it up.
// A yard swept to bare earth, the little pile of dung in the middle of it, two
// figures, and nothing else: no lantern, no path, no hut, the trees kept out at
// the fog line. The emptiness is the staging.
//
// Wildflowers through the meadow, on the same terms as the grass: they
// come up to within a couple of units of the pile and run out to the treeline,
// leaving the dung itself on clean dirt. The swept yard is bare of PROPS — no
// lantern, no rocks, no bushes — and that is what carries the emptiness; a
// meadow with no flowers in it was never what the sweeping meant.
//
// They keep the kit's default whitish bloom: red heads would put a second seal
// on the page and take the joke off the dung, which is the one thing here
// allowed to be vermillion.
//
// The dung itself is the one warm mark on the page: a red pile in the
// dirt, which is the whole joke — the painter has given his one seal of colour
// to a piece of dung, exactly the joke Mumon makes in the commentary.
// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10, target: [0.8, 0.9, 0.2], heading: 4, pitch: 14 };
  export default {
  id: ID,
  slug: 'dried-dung',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 3,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // nothing here makes a sound but the wind, so the drift plays in full
  ambience: ['wind:0.30', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.032);
  scene.add(makeLights());
  
  // THE STICK. Dry, crooked, a hand taller than it needs to be, standing in
  // swept ground. Three tapering segments with a slight kink at each joint,
  // because a perfectly straight stick reads as a post.
  // THE DUNG. Kanshiketsu — a little pile of it, which is the whole answer to
  // "what is Buddha". A few tapered lumps heaped together, lying on the
  // ground and modelled in the round: pointed at both ends, fat in the
  // middle, tilted every which way. Bigger than a person would expect, since
  // it is the centrepiece of the scene — and never a flat cube.
  const stick = new THREE.Group();      // kept the name so the interaction below reads unchanged
  stick.name = 'dung';
  // red — the dung IS the seal of this case now
  const dryMat = washMaterial({ color: ACCENT, flat: true });
  
  // one turd: a spindle lathe laid on its side, hinged so it rests ON the
  // ground rather than through it
  const turdGeo = (L, R) => {
  const prof = [
  [0.00, 0.00], [0.42, 0.10], [0.80, 0.30], [1.00, 0.52],
  [0.86, 0.74], [0.44, 0.92], [0.00, 1.00],
  ].map(([r, y]) => new THREE.Vector2(r * R, y * L));
  const geo = new THREE.LatheGeometry(prof, 7);
  geo.translate(0, -L / 2, 0);        // centre it on its long axis
  geo.rotateZ(Math.PI / 2);           // lie along x
  return geo;
};

    // a heap: a base ring of lumps and a couple riding on top
    const LUMPS = [
      { L: 0.62, R: 0.11, x: 0.00, y: 0.11, z: 0.00, ry: 0.2, rz: 0.05 },
      { L: 0.54, R: 0.10, x: 0.16, y: 0.10, z: 0.14, ry: 1.1, rz: -0.08 },
      { L: 0.50, R: 0.10, x: -0.18, y: 0.10, z: 0.12, ry: 2.3, rz: 0.10 },
      { L: 0.46, R: 0.09, x: 0.02, y: 0.10, z: -0.20, ry: -0.7, rz: 0.02 },
      { L: 0.44, R: 0.09, x: -0.04, y: 0.26, z: 0.02, ry: 0.6, rz: 0.9 },
      { L: 0.36, R: 0.08, x: 0.14, y: 0.28, z: -0.06, ry: 2.0, rz: -0.7 },
    ];
    for (const [i, m] of LUMPS.entries()) {
      const lump = new THREE.Mesh(turdGeo(m.L, m.R), dryMat);
      lump.name = 'turd';
      lump.position.set(m.x, m.y, m.z);
      lump.rotation.set(0, m.ry, m.rz);
      // a touch of per-lump wonk so the pile is not two neat tiers
      lump.rotation.x = (hash1(i * 5 + 1, ID) - 0.5) * 0.5;
      stick.add(lump);
    }
    stick.position.set(0.8, 0, 0.2);
    scene.add(stick);

    // (There used to be a separate vermillion seal disc pressed in the dirt
    // here. With four sides it read as a stray red square on the ground that
    // nobody could place, so it is gone; the red dung is the seal.)

    // THE FLIES — butterflies, but smaller and ink-dark instead of red: the
    // same kit, tiny, in a tight low orbit over
    // the pile. Same closed-form flight; the quick wander rate is what makes
    // the same math read as flies rather than butterflies. They never land
    // and they are HALF the first attempt's size — a settled fly with
    // slowly breathing wings read as a butterfly resting, which is exactly
    // the wrong creature over dung.
    const flies = makeButterflies({
      count: 6, seed: ID, color: INK_LIT, size: 0.065, land: false,
      center: [0.8, 0.2], radius: 0.85, height: [0.25, 0.95],
      rate: 0.6,
    });
    scene.add(flies.group);

    // Ummon, who said it, and the monk who asked. Set well apart: the space
    // between them is doing as much work as they are.
    const ummon = makeMonk({ height: 1.66, elder: true });
    ummon.position.set(-1.9, 0, -0.6);
    faceMonk(ummon, stick.position);
    scene.add(ummon);

    const monk = makeMonk({ height: 1.56 });
    monk.position.set(2.6, 0, 2.4);
    faceMonk(monk, ummon.position);
    scene.add(monk);

    // rMin matches the GRASS keepout (1.2), not the scatter's 6.0: the swept
    // yard is bare of props, but grass has always grown right up to the pile,
    // and blooms are meadow, not scenery. Held out to 2.0 so the dung itself
    // still sits on clean dirt.
    //
    // Measured, not guessed: at rMin 6.5 the nearest bloom was 13.9 units from
    // the camera and 90 of them put 39 in frame at ~3.6px a head — a dusting in
    // the fog that read as nothing at all. These numbers put the field's front
    // edge inside the near half of the shot at k32's density and head size.
    const flowers = makeWildflowers({
      count: 220, rMin: 2.0, radius: 18, scale: 1.5, seed: ID, groundSeed: 21,
      keepout: [
        { at: stick, r: 1.5 },
        { at: ummon, r: 1.2 },
        { at: monk, r: 1.2 },
      ],
    });
    scene.add(flowers.mesh);

    const world = composeWorld(scene, {
      view: CAM,
      seed: ID+3,
      groundSeed: 22,
      trees: 7,                       // and those kept out at the fog line
      rocks: 5,
      bushes: 3,
      keepout: [
      { x: 0, z:40, r: 48 }, // behind camera
        { at: stick, r: 6.0 },   // the swept yard: nothing scatters into it
        { at: ummon, r: 1.2 },
        { at: monk, r: 1.2 },
      ],
      // and the yard is swept to bare earth, which is the one thing this scene
      // has instead of scenery
      grassKeepout: [{ at: stick, r: 1.2 }],
    });

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.6, 0.95),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'stick-hit';
    hit.position.set(0.8, 0.3, 0.2);
    scene.add(hit);

    // ---- the moment: it is a stick ---------------------------------------
    // Touch it and it wobbles, dryly, and stops. There is nothing else in it.
    let camera = null;
    let clock = 0;
    let taps = 0;
    const knocks = [];

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      knocks.push(clock);
      if (knocks.length > 4) knocks.shift();
      taps++;
      flies.flit();       // the wobble puts the flies up; they settle back
      audio && audio.knock({ force: 0.45, at: hit.position });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        flies.update(dt, simTime);
        flowers.update(dt, simTime);
        let a = 0;
        for (const t0 of knocks) {
          const t = clock - t0;
          if (t < 0) continue;
          a += 0.09 * Math.exp(-t / 0.5) * Math.sin(2 * Math.PI * t / 0.30);
        }
        stick.rotation.z = a;
        stick.rotation.x = a * 0.4;
      },
      fragment() {
        return { taps, wobble: +stick.rotation.z.toFixed(4) };
      },
      dispose() {},
    };
  },
};
