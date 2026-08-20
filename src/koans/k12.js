import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import { smoothstep as SS } from '../util/math.js';
import {
  composeWorld, groundHeight, makeButterflies, makeCliff,
  makeLights, makeMonk,
} from '../kit/index.js';

const ID = 12;

// Zuigan called out to himself every day. "Master." — "Yes, sir." — "Become
// sober." — "Yes, sir." — "Do not be deceived by others." — "Yes, sir; yes,
// sir." Mumon says he is running a puppet show with one mask calling and
// another answering.
//
// So there is one figure in the scene and nobody else in it at all — a ledge
// above a drop, which is the only staging that makes a voice come back. Call,
// and a moment later the answer arrives from out over the gorge in your own
// voice, a little quieter. Call three times and you get the whole exchange,
// and then it starts over, every day, the way he did it.
//
// The red butterflies over the open ground are the seal: the one thing up here
// that is not him and not the weather. His staff is his own, and ink.

const ECHO = 0.62;
const LINES = 3;

// The cliff, turned to face the camera. A half turn maps its local void side
// (−z) onto world +z, so the drop is between the reader and the figure.
const CLIFF = { x: 0.6, z: 1.4, yaw: Math.PI };
// Where the ground stops being ground. The rock's lip course overhangs this by
// about a unit, which is what a brink looks like: stone at the edge with the
// turf falling away just under it.
const LIP_Z = CLIFF.z + 0.35;
const DROP = 6.5;
// He stands on the lip, a stride back from the brink, looking out over it.
const ZUIGAN = { x: 0.9, z: 0.35 };

// THE GORGE, in five numbers and nothing else.
//
// The carve at the bottom of build() is a product of smoothsteps and reads as
// maths rather than as a shape, so: past the lip the ground falls over `face`
// units to DROP, runs flat, and climbs back out over the last `rim` units
// before `reach` — that far rim being the ground the camera itself stands on.
// Across the frame it is at full depth out to |x| = `half` and closed again by
// `half + taper`, so the meadow wraps round the ends instead of the cut ending
// on a straight wall.
//
// WIDER IS ONE NUMBER: `half`. The rock at the brink follows it — the lip
// sections are laid out to cover whatever span this asks for, so widening the
// hole can never leave an unrocked edge for the turf to tear on.
//
// `reach` is the one with a ceiling, and it is what this staging turns on: a
// gorge between the reader and the subject is only a gorge if the camera stands
// on the FAR rim of it. The lens sits around z = 13 here, so the ground must be
// back up before then. Push reach past it and the camera hangs over the middle
// of the hole with the drop directly beneath the frame — which is the picture
// this whole arrangement exists to avoid: a man on some rocks with nothing
// under them.
const GORGE = {
  reach: 10.0,
  half: 13.0,
  taper: 6.0,
  face: 1.4,
  rim: 2.0,
};
// How far either side of centre the cut reaches at all.
const GORGE_SPAN = GORGE.half + GORGE.taper;

// Nothing is planted on the air. Circles, because that is what composeWorld
// takes — a chain dense enough to blanket the gap with no seam for a blade to
// grow through and stand on nothing. One definition for both keepouts: the
// grass takes it as it is, and the props take it with more padding, because a
// tree leaning over the brink is worse than a blade doing it.
function voidStrip(lipZ, pad = 0) {
  const out = [];
  for (let z = lipZ + 1.6; z < lipZ + GORGE.reach + 1; z += 3.0) {
    for (let x = -GORGE_SPAN - 3; x <= GORGE_SPAN + 3; x += 3.0) {
      out.push({ x: CLIFF.x + x, z, r: 2.3 + pad });
    }
  }
  return out;
}

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = {
distance: 15, target: [0.8, 1.9, 0.35], heading: 23.5, pitch: 18
};
export default {
  id: ID,
  slug: 'zuigan-calls-to-himself',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.32', 'echo', 'music'],
  mood: 'yo',      // it is a daily, cheerful, slightly ridiculous habit
  // STANDING ON THE FAR RIM. With the drop between the reader and the man, the
  // lens has to clear it: the camera's ground track must be past the far edge
  // of the chasm, and high enough that the near rim does not cut off the mist
  // lying in it. At the old 11.5 the camera hung over the middle of the hole
  // and the whole gorge fell below the bottom of the frame — the picture was a
  // man on some rocks with nothing under them, which is exactly what it looked
  // like before the ground was carved at all.
  //
  // Derived, not dialled: put the eye at (6.5, 7.8, 14.0) and aim it at his
  // chest. From there the nearest mist bank sits 39.6 degrees below horizontal
  // and the frame's lower edge reaches 42.8, so the chasm is inside the picture
  // with a little to spare. maxDist goes out with it, or the rig would clamp
  // the shot it was given.
  camera: CAM,

  build(ctx) {
    const { audio, input, touched } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights({ sun: { heading: 60, pitch: 31 } }));

    // the cliff
    const cliff = makeCliff({
    width: 30, drop: 4, depth: 1, seed: ID, fogTop: -5,
    origin: [CLIFF.x, CLIFF.z], yaw: CLIFF.yaw, groundSeed: 21,
    });
    cliff.position.set(CLIFF.x, 0, CLIFF.z);
    cliff.rotation.y = CLIFF.yaw;
    scene.add(cliff);

    // ZUIGAN, alone, near the edge. `elder` gives him the kit's own staff, held
    // the ordinary way and in his own ink — the free-standing vermillion shaft
    // that used to be planted beside him is gone. Nothing about the man is the
    // seal any more. `bow: true` hinges him at the sash without changing his
    // arms — the call below leans him from the waist, not by rolling the whole
    // figure.
    const zuigan = makeMonk({ height: 1.64, elder: true, bow: true });
    const zuiganWaist = zuigan.getObjectByName('waist');
    zuigan.position.set(ZUIGAN.x, 0, ZUIGAN.z);
    zuigan.rotation.y = .2;
    scene.add(zuigan);

    // THE BUTTERFLIES ARE THE SEAL now, and they play over the open ground the
    // lens is actually pointed at rather than tucked in beside him. The camera
    // looks down the diagonal past his shoulder, so the middle of the frame
    // is the plain out past (-2, -4); a ray down the centre column lands
    // there at every height. A handful of them over a wide disc scatters across
    // the whole open half of the picture rather than knotting in one corner of
    // it — the count is set for that spread, not for a number.
    const butterflies = makeButterflies({
      count: 8, seed: ID, color: ACCENT, size: 0.42,
      center: [-2.2, -4.4], radius: 5.0, height: [0.7, 2.6],
      groundFn: (x, z) => groundHeight(x, z, { seed: 21 }),
    });
    scene.add(butterflies.group);

    // The pine that used to stand on the lip at (-2.9, -0.4) is GONE — a
    // different species growing right beside the one figure, and it never read
    // as well as the ordinary trees. The rock outcrop dresses that end of the
    // ledge on its own now, and the world's own trees keep the middle distance
    // from going bare.
    const world = composeWorld(scene, {
      view: CAM,
      seed: ID,
      groundSeed: 115,
      trees: 10,
      rocks:10,
      mountains: [
        { count: 8, distance: 252, arcSpan: 3.6 },
        { count: 5, distance: 35, arcSpan: 2.4},
      ],
      // The same strip the grass gets, with more padding: a tree leaning over
      // the brink is worse than a blade doing it. Not the sections' own
      // footprints any more — with the run laid out from the gorge's width
      // there are five of them, and every lump of every one would be a circle
      // the placement loop retests for every candidate it tries.
      keepout: [
        { x: 0, z: 20, r: 1.4 },
        ...voidStrip(LIP_Z, 0.6),
        { x: ZUIGAN.x, z: ZUIGAN.z, r: 1.4 },
      ],
      // The mask is worth having again now that there is something to mask. It
      // was doing nothing but harm while the drop was invisible — a bald patch
      // standing in for a gorge that was entirely below the ground plane — but
      // the ground is genuinely carved below, so grass out here really would
      // hang in mid-air over the chasm. A straight half-plane past the lip, not
      // the cliff's own circles: those overshoot onto the standing ground by
      // more than a unit and it was them that ate the meadow.
      grassKeepout: voidStrip(LIP_Z),
    });

    // ---- THE CUT: the ledge is REAL --------------------------------------
    // Case 5's trick, mirrored. makeCliff draws a face and hangs mist, but it
    // cannot move the ground the scene stands on, and with drop 6.5 all of that
    // hung BELOW y = 0 — under the plain, invisible. There was no ledge here at
    // all, only rocks on a field — you could not tell which way the man was
    // facing, which is the tell. So the case carves its own ground: every
    // vertex past the lip sinks on a steep smoothstep — the face — runs a floor,
    // and climbs back out over the last two units of GORGE as the near rim the
    // camera stands on, with the mist lying in the gap between. A bay window
    // along x keeps the cut
    // inside the dressed run of lip stones, so past them the meadow wraps around
    // instead of tearing on an unrocked edge.
    const groundMesh = scene.getObjectByName('ground');
    const gpos = groundMesh.geometry.attributes.position;
    for (let i = 0; i < gpos.count; i++) {
      const d = gpos.getZ(i) - LIP_Z;             // how far out over the air
      if (d <= 0) continue;
      const wx = gpos.getX(i);
      const ax = wx - CLIFF.x;                    // the gorge is centred on the lip run
      const bay = SS(-GORGE_SPAN, -GORGE.half, ax) * (1 - SS(GORGE.half, GORGE_SPAN, ax));
      if (bay <= 0) continue;
      const sink = DROP * SS(0, GORGE.face, d)
        * (1 - SS(GORGE.reach - GORGE.rim, GORGE.reach, d)) * bay;
      if (sink > 0) gpos.setY(i, gpos.getY(i) - sink);
    }
    gpos.needsUpdate = true;
    groundMesh.geometry.computeVertexNormals();

    // WHERE HIS VOICE COMES FROM — a position, not a pick volume. He used to
    // be the handle: an invisible cylinder around him, and a tap on the man
    // set the call going. Everywhere else in the book you reach for the red
    // thing, and this was the one page that asked you to reach for something
    // else; the butterflies are the seal here, so they are the handle now and
    // he is not tappable at all. The knock still has to sound from HIM — it is
    // his voice, and it would read as coming out of the flock otherwise.
    const voiceAt = new THREE.Vector3(ZUIGAN.x, 1.0, ZUIGAN.z);

    // ---- the moment: call, and answer yourself ---------------------------
    let camera = null;
    let clock = 0;
    let line = 0;              // which of the three he is on
    let calls = 0;
    let answers = 0;
    let pending = -1;
    let calledAt = -99;        // when the last call left him — drives the lean

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, butterflies.pickTargets())) return;
      if (pending >= 0) return;
      touched && touched();
      line = (line % LINES) + 1;
      calls++;
      pending = clock + ECHO;
      calledAt = clock;
      butterflies.flit();               // a man shouting on a clifftop startles them
      // each line of the daily exercise is pitched a little lower than the last
      audio && audio.knock({ force: 0.9 - (line - 1) * 0.12, at: voiceAt });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        butterflies.update(dt, simTime);

        if (pending >= 0 && clock >= pending) {
          pending = -1;
          answers++;
          // "Yes, sir." — the same voice, from further away. There is no
          // second position in the scene for the echo to come from — it is
          // the same shout heard back — so it reuses his own spot rather than
          // inventing a point out over the gorge.
          audio && audio.knock({ force: 0.30, at: voiceAt });
          if (line >= LINES) line = 0;      // and tomorrow he does it again
        }

        // He leans into the call and settles back — FROM THE WAIST, WITH AN
        // ATTACK. It was rotation.z on the whole figure (a sideways list, the
        // roll fault k15/k17/k32 all had) set to full on the tap frame — "an
        // envelope set to 1 by a touch has no attack", the same family as k36's
        // bow snap, and it read exactly as abrupt as it was. Now: forward at
        // the sash, rising over ~0.18s, easing back as the echo returns.
        const u = clock - calledAt;
        let lean = 0;
        if (u >= 0 && u < 1.0) {
          lean = Math.min(1, u / 0.18, (1.0 - u) / 0.5);
          lean = lean * lean * (3 - 2 * lean);
        }
        zuiganWaist.rotation.x = 0.12 * lean;
      },
      fragment() {
        return {
          calls, answers, line,
          lean: +zuiganWaist.rotation.x.toFixed(4),
          flutter: +butterflies.energy().toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
