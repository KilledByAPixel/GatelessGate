import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, wash } from '../palette.js';
import { makeMonk, faceMonk } from '../kit/monk.js';
import { makePole } from '../kit/pole.js';
import { tapMeshes } from '../kit/pick.js';
import { composeWorld } from '../kit/scenery.js';
import { makeLights } from '../render/toon.js';
import { makeBlobShadow } from '../render/blobshadow.js';
import { addOutlines } from '../render/outlines.js';
import { noise1 } from '../util/noise.js';

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
// man on top is INK, the same figure grammar as every monk in the book
// (Frank: "just the pole red, not the guy at the top"). Two red things were
// one too many: with the sitter red as well, mast and man fused into a single
// red lollipop and the figure stopped reading as a figure. A dark seated mark
// against clear paper at the top of the one red vertical is the stronger
// image — the camera keeps the sky behind him for exactly this.
const POLE = { x: 0.35, z: -0.9, height: 8 };
const W1 = { x: -2.5, z: -2.9 };    // the two below, looking up
const W2 = { x: -0.7, z: -5.2 };

// He faces the horizon the home camera looks toward — his back to the reader,
// gazing into the same distance, nudged a few degrees off pure away-facing so
// a whisper of three-quarter shows.
const SITTER_YAW = Math.PI + 0.4;

// ---- the moment: the lean ------------------------------------------------
// Tap him and he tips forward a few degrees, holds at the very edge of the
// step the koan demands, and settles back. Quick to commit, long to let go.
const LEAN_MAX = 0.12;                       // ~7 degrees — an intention, not a stunt
const RISE = 0.55, HOLD = 0.7, SETTLE = 1.75;
const LEAN_SPAN = RISE + HOLD + SETTLE;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function leanShape(u) {
  if (!(u >= 0) || u >= LEAN_SPAN) return 0;
  if (u < RISE) return smooth(u / RISE);
  if (u < RISE + HOLD) return 1;
  return 1 - smooth((u - RISE - HOLD) / SETTLE);
}

// Tap the pole instead and the whole mast takes a small damped sway — the monk
// rides it, because he is up there and everything up there moves.
const SWAY_AMP = 0.011;
const swayShape = (u) => (u >= 0 ? Math.exp(-u * 1.1) * Math.sin(u * 4.6) : 0);
// the sitter is nested under the swaying mast group, so his local position is
// not his world position — reused rather than allocated per tap
const scratchPos = new THREE.Vector3();

export default {
  id: ID,
  slug: 'proceed-from-the-top-of-the-pole',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.26:pine'],                   // it is windy up a pole

  // THE CAMERA IS HALF THIS CASE, and it is the first one that has to leave
  // the rig's default polar window. The stock framing looks at y=1.35 and
  // would show an empty meadow with a stick. Instead the orbit pivots around
  // a point high on the mast: at the home angle the seated figure rides the
  // upper third against clear paper, the pole runs the full height of the
  // frame, and the base just clears the bottom edge — ground and summit in one
  // shot. Dragging down (maxPolar 1.35) sinks the lens almost level with him,
  // the ground falls out of the frame and he sits against nothing but sky;
  // dragging up (minPolar 0.55, far past the stock 0.9 floor) climbs above the
  // cap and reveals the drop, the watchers turning into specks by the base.
  // maxDist 20 keeps the whole mast reachable on a phone; the sitter stays
  // inside ~18.5 units of the lens even fully wheeled out, so FogExp2 0.030
  // never washes the seal below ~57%.
  camera: {
    distance: 14.5,
    target: [POLE.x, 5.5, POLE.z],
    azimuth: 0.55,
    polar: 1.05,
    minPolar: 0.55,
    maxPolar: 1.35,
    maxDist: 20,
  },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

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
      seed: ID,
      groundSeed: 21,
      trees: 3,
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
      // (radians, from the world origin), and at maxPolar the sitter reads
      // against whatever stands at that bearing near his height. The stock
      // bands put washed peaks straight through that line, so the red sat on a
      // ghost. These arcs clear roughly (-1.05..0.15) — paper sky directly
      // behind the man at the home azimuth, tall country pushed to both frame
      // edges where it frames the drop instead of muddying it. (k19 precedent:
      // shape the ridge around the seal.)
      mountains: [
        { count: 5, distance: 54, arcCenter: 1.05, arcSpan: 1.6, color: wash(0.15) },
        { count: 4, distance: 56, arcCenter: -1.8, arcSpan: 1.5, color: wash(0.13) },
        { count: 3, distance: 36, arcCenter: 1.25, arcSpan: 1.0, color: wash(0.26), hScale: 0.6 },
        { count: 2, distance: 34, arcCenter: -1.65, arcSpan: 0.8, color: wash(0.28), hScale: 0.55 },
      ],
      // and the forests obey the same rule: the stock left-hand wood stands at
      // bearing ~-0.61 — dead on the home sight line through the sitter, its
      // fogged crowns clipping the space just under him. Both woods step aside.
      forests: [
        { center: [-30, 0, -10], spread: 11, count: 50 },
        { center: [15, 0, -32], spread: 13, count: 40, color: wash(0.55) },
      ],
    });

    for (const [x, z, rx, rz, op] of [
      [POLE.x, POLE.z, 0.55, 0.45, 0.4],
      [W1.x, W1.z, 0.62, 0.5, 0.4],
      [W2.x, W2.z, 0.62, 0.5, 0.4],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = x; s.position.z = z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- interaction ------------------------------------------------------
    let camera = null;
    let now = 0;
    let taps = 0, poleTaps = 0;
    let leanAt = -1, swayAt = -1;
    // CODE REVIEW CAUGHT (Task 5C): audio.bell() had no cooldown, so a held
    // pointer stacked strikes without limit. Gated on its own — k49's idiom
    // (`clock - lastRing > 0.5`) — rather than folded into leanAt, because
    // the lean is meant to retrigger on every tap (the case's own design:
    // "he leans toward the ten directions, and stays"); only the BELL needs
    // the ceiling.
    let lastRing = -99;

    const sitterMeshes = tapMeshes(sitter);
    const poleMeshes = tapMeshes(pole);

    input.onTap(() => {
      if (!camera) return;
      if (input.raycastFirst(camera, sitterMeshes)) {
        // the faintest response: he leans toward the ten directions, and stays
        leanAt = now;
        taps++;
        if (now - lastRing >= 0.5) {
          lastRing = now;
          // very quiet, at the pole top — not a hung bell, so the smallest
          // preset — task-12's migration to Frank's tuned presets
          audio && audio.bell({ preset: 'hand', gain: 0.06, at: sitterPivot.getWorldPosition(scratchPos) });
        }
      } else if (input.raycastFirst(camera, poleMeshes)) {
        swayAt = now;
        poleTaps++;
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        now = Number.isFinite(simTime) ? simTime : now + (dt || 0);
        world.update(dt, simTime);

        // the lean: deterministic envelope on sim time, nothing accumulates
        sitterPivot.rotation.x = leanAt < 0 ? 0 : LEAN_MAX * leanShape(now - leanAt);

        // the sway: a tapped impulse rides on top of a standing breath of wind
        // — the mast is never perfectly still, which is most of why it reads
        // as tall
        const imp = swayAt < 0 ? 0 : SWAY_AMP * swayShape(now - swayAt);
        mast.rotation.x = 0.008 * (noise1(now * 0.33, 461) - 0.5) + imp * 0.55;
        mast.rotation.z = 0.008 * (noise1(now * 0.29 + 13.7, 462) - 0.5) + imp * 0.8;
      },
      fragment() {
        return {
          taps,
          poleTaps,
          lean: +sitterPivot.rotation.x.toFixed(4),
          sway: +Math.abs(swayAt < 0 ? 0 : SWAY_AMP * swayShape(now - swayAt)).toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
