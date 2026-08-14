import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, wash } from '../palette.js';
import {
  composeWorld, faceMonk, makeMonk, makePole, tapMeshes,
  createPendulum, integratePendulum, kickPendulum, pendulumEnergy,
} from '../kit/index.js';
import { makeLights } from '../render/lights.js';
import { hash1, noise1 } from '../util/noise.js';

const ID = 46;

// THE BOOK'S ONE VERTICAL COMPOSITION.
//
// Every other diorama spreads its staging across the meadow; this one stacks
// it. A hundred-foot pole is eight units here — real thirty metres would put
// the sitter subpixel — and the entire picture is the distance between the
// ground and the man seated on the cap. Nothing else is allowed to be tall:
// three scatter trees, two small watchers, an empty field.
//
// The POLE is the red seal — one red line rising out of the meadow — and the
// man on top is INK, the same figure grammar as every monk in the book — the
// pole is red, the man is not. Two red things were one too many: with the
// sitter red as well, mast and man fused into a single red lollipop and the
// figure stopped reading as a figure. A dark seated mark against clear paper at
// the top of the one red vertical is the stronger image — the camera keeps the
// sky behind him for exactly this.
const POLE = { x: 0.35, z: -0.9, height: 8 };
const W1 = { x: -2.5, z: -2.9 };    // the two below, looking up
const W2 = { x: -0.7, z: -5.2 };

// He faces the horizon the home camera looks toward — his back to the reader,
// gazing into the same distance, nudged a few degrees off pure away-facing so
// a whisper of three-quarter shows.
const SITTER_YAW = Math.PI + 0.4;

// ---- the moment: the pole ------------------------------------------------
// TAP THE POLE and the whole mast wobbles. That is the only thing on this page
// that answers, and the man on top rides it because he is up there.
//
// The SITTER used to be a target too: tap him and he tipped forward at the very
// edge of the step the koan demands, and settled back. It was the more literal
// reading of the case — "proceed from the top of a hundred-foot pole" — and it
// was cut on sight. Two targets on a page whose whole subject is one vertical
// object was one too many, and the small nod he also had is gone with it: at
// this distance a few degrees of tip on a small figure eight units up is a
// couple of pixels, which is a thing the code knows about and the reader does
// not.
//
// THE WOBBLE IS TWO INDEPENDENT SWAYS, not one lean scaled onto two axes: one
// per axis, at frequencies that do not divide into each other and a quarter
// turn of phase apart, so the tip of the mast traces an opening spiral rather
// than swinging in a plane and back. A pole struck by a hand does not pick an
// axis; it goes round.
//
// IT IS A PHYSICAL THING, not a played curve, and this was the third go at it.
// The first was one envelope scaled onto two axes; the second was two damped
// sines restarted from u = 0 on every tap. Both were SHAPES, and a shape has to
// start somewhere — so a second tap while the mast was still moving threw away
// whatever it was doing and began again from nothing, which made repeated taps
// pop. What it wants instead is an ACCELERATION applied to something already in
// motion.
//
// Which is a pendulum, and the book already has one — the same integrator the
// fūrin and the bronze cylinders swing on. TWO of them, one per axis, at
// lengths chosen so their periods do not divide into each other; a touch is a
// KICK, which by construction changes only the angular VELOCITY and leaves the
// angle exactly where it was (see kickPendulum's own note). So:
//
//   * nothing can snap, at any time, because the rendered angle is never
//     assigned — it is integrated, and a kick does not touch it;
//   * a tap mid-wobble ADDS to what is already happening, the way a second
//     shove on a swinging thing does, instead of replacing it;
//   * the spiral, the uneven decay and the dying-out all come out of the
//     physics rather than being described.
//
// The lengths were solved to land on the two frequencies the hand-tuned sines
// had; the damping terms are twice their old decay rates, since a `-c*omega`
// drag decays an envelope at c/2.
const SWAY_G = 9.8;
const SWAY_X = { length: 0.46, damping: 2.2 };   // slower, longer-lived
const SWAY_Z = { length: 0.26, damping: 2.9 };   // quicker, shorter
// rad/s added to a pendulum by one touch. Peak angle is about KICK / omega0,
// so this lands near 0.09 rad on the slow axis — the same size the sines were.
const KICK = 0.42;
// AND EVERY TAP SHOVES IT A DIFFERENT WAY, rather than always at the same
// angle. The bearing now picks how the kick is SPLIT between the two axes,
// which is what a shove from a direction physically is — rather than rotating a
// figure after the fact.
//
// Seeded from the tap count, because there is no Math.random outside src/audio
// in this book: the same page, tapped the same number of times, wobbles the
// same way, which is what makes the whole thing replayable.
const SWAY_TURN = (n) => hash1(n * 3 + 1, 46) * Math.PI * 2;
// the sitter is nested under the swaying mast group, so his local position is
// not his world position — reused rather than allocated per tap
const scratchPos = new THREE.Vector3();

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
// minPitch/maxPitch/maxDist are LOAD-BEARING here — the one case that opens
// the rig's stock pitch window (see the camera note below: sink to eye level,
// climb above the cap). A scenery retune once rewrote this object and dropped
// the three of them, which clamps the page back to the stock envelope with
// nothing visibly failing; the contract test pins them now.
const CAM = {
  distance: 14.5, target: [0.35, 5.5, -0.9], heading: 31.5, pitch: 24,
  minPitch: 12.7, maxPitch: 58.5, maxDist: 20,
};
export default {
  id: ID,
  slug: 'proceed-from-the-top-of-the-pole',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.26:pine'],                   // it is windy up a pole

  // THE CAMERA IS HALF THIS CASE, and it is the first one that has to leave
  // the rig's default pitch window. The stock framing looks at y=1.35 and
  // would show an empty meadow with a stick. Instead the orbit pivots around
  // a point high on the mast: at the home angle the seated figure rides the
  // upper third against clear paper, the pole runs the full height of the
  // frame, and the base just clears the bottom edge — ground and summit in one
  // shot. Dragging down (minPitch 12.7) sinks the lens almost level with him,
  // the ground falls out of the frame and he sits against nothing but sky;
  // dragging up (maxPitch 58.5, far past the stock 38.5 ceiling) climbs above the
  // cap and reveals the drop, the watchers turning into specks by the base.
  // maxDist 20 keeps the whole mast reachable on a phone; the sitter stays
  // inside ~18.5 units of the lens even fully wheeled out, so FogExp2 0.030
  // never washes the seal below ~57%.
  camera: CAM,

  build(ctx) {
    const { audio, input, touched } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    // Low enough that the pole lays most of its length across the ground —
    // the vertical composition's shadow is the horizontal one. There is room
    // to go lower, but not much: the shadow of a pole this tall reaches the
    // edge of the shadow camera somewhere around half this pitch, and past
    // that it is cut off mid-meadow.
    scene.add(makeLights({ sun: { heading: -1, pitch: 43 } }));

    // The mast group pivots at the ground, so a sway is a rotation of the whole
    // standing thing — pole, cap and sitter together, the way a real pole moves.
    const mast = new THREE.Group();
    mast.name = 'mast';
    mast.position.set(POLE.x, 0, POLE.z);
    scene.add(mast);

    // The pole carries the case's whole red; the guy lines stay grey
    // hairlines so it reads as one unbroken vertical.
    const pole = makePole({ height: POLE.height, radius: 0.16, seed: ID, guys: 3, color: ACCENT });
    mast.add(pole);

    // The sitter. Seated exactly on the cap's upper surface — pole.topY is the
    // contract that keeps him from hovering or sinking — pivoting at his own
    // hem so the lean is a fold at the seat, not a slide off it. Euler 'YXZ'
    // puts the pitch INSIDE the yaw: he leans along the line he faces.
    const sitterPivot = new THREE.Group();
    sitterPivot.name = 'sitter';
    sitterPivot.position.y = pole.topY;
    sitterPivot.rotation.order = 'YXZ';
    sitterPivot.rotation.y = SITTER_YAW;
    const sitter = makeMonk({ pose: 'sit', height: 1.3 });   // ink, like every monk
    sitterPivot.add(sitter);
    mast.add(sitterPivot);

    // Two small monks far below, faces turned to the pole, tipped back a few
    // degrees the way anyone stands under a high thing. Scale 1.5 — ordinary
    // figures read small here purely by the drop, which is the point.
    const watchers = [];
    for (const [pos, tip] of [[W1, 0.11], [W2, 0.09]]) {
      const w = makeMonk({ height: 1.5 });
      w.position.set(pos.x, 0, pos.z);
      faceMonk(w, { x: POLE.x, z: POLE.z });
      w.rotateZ(tip);                        // craning back to look up
      scene.add(w);
      watchers.push(w);
    }

    const world = composeWorld(scene, {
      view: CAM,
      seed: ID+1,
      groundSeed: 21,
      trees: 13,
      grassRadius: 32,
      grassTaper: .4,
      keepout: [
        { x: POLE.x, z: POLE.z, r: 1.4 },
        ...pole.anchors.map((a) => ({ x: POLE.x + a.x, z: POLE.z + a.z, r: 0.5 })),
        { x: W1.x, z: W1.z, r: 1.1 },
        { x: W2.x, z: W2.z, r: 1.1 },
        // the lens corridor: the camera orbits out here at a high target, and a
        // midground tree drifting into the near foreground reads as a smudge
        { x: 5.0, z: 6.5, r: 5.0 },
      ],
      // grass grows up to everything; only the mast's own footprint clears
      grassKeepout: [{ x: POLE.x, z: POLE.z, r: 0.3 }],

      // THE RIDGELINE STANDS ASIDE. The home view looks along bearing ~-0.55
      // (radians, from the world origin), and at minPitch the sitter reads
      // against whatever stands at that bearing near his height. The stock
      // bands put washed peaks straight through that line, so the red sat on a
      // ghost. These arcs clear roughly (-1.05..0.15) — paper sky directly
      // behind the man at the home heading, tall country pushed to both frame
      // edges where it frames the drop instead of muddying it. (k19 precedent:
      // shape the ridge around the seal.)
      mountains: [
        { count: 5, distance: 34, arcCenter: .05, arcSpan: 1.6, color: wash(0.15), hScale: 0.35 },
        { count: 4, distance: 86, arcCenter: -.8, arcSpan: 1.5, color: wash(0.13), hScale: 0.5  },
        { count: 3, distance: 76, arcCenter: .25, arcSpan: 1.0, color: wash(0.26), hScale: 0.6 },
      ],
      // and the forests obey the same rule: the stock left-hand wood stands at
      // bearing ~-0.61 — dead on the home sight line through the sitter, its
      // fogged crowns clipping the space just under him. Both woods step aside.
      forests: [
        { center: [-35, 0, -30], spread: 20, count: 50 },
        { center: [-15, 0, -32], spread: 20, count: 40, color: wash(0.55) },
      ],
    });

    // ---- interaction ------------------------------------------------------
    let camera = null;
    let now = 0;
    let poleTaps = 0;
    // the mast's two axes, swinging freely — a touch kicks them, nothing ever
    // assigns their angles
    const swayX = createPendulum({ ...SWAY_X, g: SWAY_G });
    const swayZ = createPendulum({ ...SWAY_Z, g: SWAY_G });
    const noTorque = () => 0;
    // CODE REVIEW CAUGHT (Task 5C): audio.bell() had no cooldown, so a held
    // pointer stacked strikes without limit. Gated on its own — k49's idiom
    // (`clock - lastRing > 0.5`) — kept separate from the kick, because the
    // wobble is meant to answer every tap; only the BELL needs a ceiling.
    let lastRing = -99;

    // THE POLE, and the sitter with it. He is nested under the same mast group,
    // so a tap that lands on the man still shoves the thing he is sitting on —
    // which is the honest physics and saves the reader from having to notice
    // that only part of a single vertical object answers.
    const poleMeshes = [...tapMeshes(pole), ...tapMeshes(sitter)];

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, poleMeshes)) return;
      touched && touched();
      poleTaps++;
      // A SHOVE FROM A BEARING, split between the two axes. kickPendulum only
      // ever touches omega, so the mast is exactly where it was on the frame
      // this lands — which is the whole of why repeat taps cannot pop.
      const turn = SWAY_TURN(poleTaps);
      kickPendulum(swayX, KICK * Math.cos(turn));
      kickPendulum(swayZ, KICK * Math.sin(turn));
      if (now - lastRing >= 0.5) {
        lastRing = now;
        // quiet, at the pole top — not a hung bell, so the smallest preset
        // (task-12's migration to the tuned presets). Raised on the audit,
        // where it was audible but only just — still the faintest bell in the
        // book, now no longer under the ambience.
        audio && audio.bell({ preset: 'hand', gain: 0.14, at: sitterPivot.getWorldPosition(scratchPos) });
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        now = Number.isFinite(simTime) ? simTime : now + (dt || 0);
        world.update(dt, simTime);

        // THE WOBBLE, one damped sine per axis at its own frequency, decay and
        // phase — so the tip traces a spiral rather than swinging in a plane —
        // riding on top of a standing breath of wind. The mast is never
        // perfectly still, which is most of why it reads as tall.
        // the two pendulums run whether or not anybody has touched anything;
        // at rest they simply sit at zero and cost two integrations of nothing
        integratePendulum(swayX, Math.max(0, dt || 0), noTorque);
        integratePendulum(swayZ, Math.max(0, dt || 0), noTorque);
        // the standing breath of wind is added ON TOP of the swing rather than
        // driven into it — the mast is never perfectly still, which is most of
        // why it reads as tall, and it is weather rather than something the
        // reader did
        mast.rotation.x = 0.008 * (noise1(now * 0.33, 461) - 0.5) + swayX.theta;
        mast.rotation.z = 0.008 * (noise1(now * 0.29 + 13.7, 462) - 0.5) + swayZ.theta;
      },
      fragment() {
        return {
          poleTaps,
          swayX: +swayX.theta.toFixed(4),
          swayZ: +swayZ.theta.toFixed(4),
          // how much swing is in it, kicks and all — 0 only when it is still
          sway: +(pendulumEnergy(swayX) + pendulumEnergy(swayZ)).toFixed(5),
        };
      },
      dispose() {},
    };
  },
};
