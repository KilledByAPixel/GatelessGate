import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, wash } from '../palette.js';
import {
  composeWorld, makeBuddha, makeMonk, faceMonk, makeFlower, makeAssembly,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 32;

// "Without words, without the wordless, will you tell me truth?" — and the
// Buddha kept silence, and the philosopher thanked him for it.
//
// This is the book's second temporal case, and the strictest one: touching
// anything actively PREVENTS the event. Sit still and do nothing and, after a
// while, the philosopher bows and the case completes itself. Reach for it and
// the count starts over. A good horse runs even at the shadow of the whip.
//
// Nothing hints at this. Nothing should.

const QUIET = 20;         // seconds of not touching anything
const BOW_IN = 3.2;       // and then, slowly
const BOW = 0.62;         // radians at the waist — a real bow, not a nod

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default {
  id: ID,
  slug: 'a-philosopher-asks-buddha',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 3,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.10', 'music'],
  camera: { distance: 10.5, target: [0.9, 1.5, -1.6], azimuth: 0.55, polar: 1.27 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.028);
    scene.add(makeLights());

    // a low stone seat, and the Buddha on it, saying nothing. Both came down
    // to human scale in overnight pass 2 — he is the same figure kit as the
    // philosopher facing him, and the silence reads better between equals.
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 1.0, 0.30, 9),
      toonMaterial({ color: wash(0.32), flat: true }));
    seat.name = 'seat';
    seat.position.set(0.6, 0.15, -3.6);
    scene.add(seat);

    const buddha = makeBuddha({ height: 1.6 });
    buddha.position.set(0.6, 0.30, -3.6);
    scene.add(buddha);

    // THE PHILOSOPHER, standing at a respectful distance, waiting for an answer
    // pose 'bow' hinges him at the sash: makeFigure hands back a group named
    // 'waist' carrying the torso, head and arms, and turning it forward IS the
    // bow. He is built upright; the movement below is the whole case.
    const philosopher = makeMonk({ height: 1.66, hat: false, stout: 1.05, pose: 'bow' });
    const philWaist = philosopher.getObjectByName('waist');
    philosopher.position.set(2.0, 0, 0.5);
    faceMonk(philosopher, buddha.position);
    scene.add(philosopher);

    // Ananda, off to the side, who will ask afterwards what just happened
    const ananda = makeMonk({ height: 1.58 });
    ananda.position.set(-2.3, 0, -0.9);
    faceMonk(ananda, buddha.position);
    scene.add(ananda);

    // one flower set down before the seat — the seal, and the only thing in
    // the scene that was brought here by anybody
    const flower = makeFlower({ height: 0.34, bloom: 0.4, petals: 6 });
    flower.position.set(1.15, 0, -2.45);
    scene.add(flower);

    const assembly = makeAssembly({
      count: 6, radius: 2.2, center: [-0.6, 2.6], facing: [0.6, -3.6], spread: 1.2, seed: ID,
    });
    scene.add(assembly);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        { x: 0.6, z: -3.6, r: 2.4 },
        { at: philosopher, r: 1.2 },
        { at: ananda, r: 1.2 },
        { x: -0.6, z: 2.6, r: 3.0 },
        // clear the sightline: the home camera sits out around (6, 7), and a
        // scatter tree landed square between it and the Buddha (Frank couldn't
        // see anything). Keep the foreground between lens and seat open.
        { x: 3.6, z: 3.0, r: 4.6 },
      ],
      grassKeepout: [{ x: 0.6, z: -3.6, r: 1.5 }],
    });

    for (const [p, rx, rz, op] of [
      [seat.position, 1.0, 0.75, 0.34],
      [philosopher.position, 0.68, 0.52, 0.42],
      [ananda.position, 0.62, 0.5, 0.40],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: nothing, for long enough ----------------------------
    let camera = null;
    let clock = 0;
    let lastTouch = 0;
    let bowed = false;
    let reaches = 0;

    // ANY tap resets the wait — there is nothing here to hit, which is the point
    input.onTap(() => {
      if (bowed) return;
      lastTouch = clock;
      reaches++;
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);

        const still = clock - lastTouch;
        const u = clamp01((still - QUIET) / BOW_IN);
        const lean = u * u * (3 - 2 * u);
        // FORWARD, at the waist. This was rotation.z on the whole figure, so
        // he listed sideways like a felled post (Frank: "he's bowing along the
        // wrong axis... he should be bowing forward, and ideally bent at the
        // waist"). Bodies front local +z and a positive turn about x carries
        // the chest that way, so this is a bow from the sash up.
        philWaist.rotation.x = BOW * lean;
        if (!bowed && u >= 1) {
          bowed = true;
          // the one sound in the case, and it arrives only if you let it
          audio && audio.chimeStrike({ tube: 0, force: 0.5 });
        }
      },
      fragment() {
        return {
          reaches,
          bowed,
          still: +Math.min(999, clock - lastTouch).toFixed(1),
          lean: +Math.abs(philWaist.rotation.x).toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
