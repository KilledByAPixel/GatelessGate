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

// How far out the chasm runs before the ground climbs back. NARROW on purpose,
// and it is the number the whole shot turns on: a gorge between the reader and
// the subject is only a gorge if the camera stands on the FAR rim of it. At the
// case's own distance the lens sits around z = 8, so the ground has to be back
// up by then — otherwise the camera hangs over the middle of the hole, the drop
// falls away directly beneath the frame, and the picture is exactly what it was
// before: a man on some rocks with nothing under them.
const GORGE = 8.0;

// Grass keeps off the air over the chasm, and off nothing else. Circles, because
// that is what composeWorld takes — a chain dense enough to blanket the gap with
// no seam for a blade to grow through and stand on nothing.
function voidStrip(lipZ) {
  const out = [];
  for (let z = lipZ + 1.6; z < lipZ + GORGE + 1; z += 3.0) {
    for (let x = -20; x <= 20; x += 3.0) out.push({ x, z, r: 2.3 });
  }
  return out;
}

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = {
distance: 15, target: [0.8, 1.35, 0.35], heading: 23.5, pitch: 18
};
export default {
  id: ID,
  slug: 'zuigan-calls-his-own-master',
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
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights({ sun: { heading: 86, pitch: 58 } }));

    // THE LEDGE, and the air past it — ON THIS SIDE now, the drop facing the
    // camera rather than away from it. Yawed a half turn, so the void that used
    // to face away into the middle distance now falls toward the camera: the
    // reader looks ACROSS the gorge at a man calling into it, with the drop in
    // the near foreground and the meadow running away behind him. `origin` and
    // `yaw` mirror the group's own placement, which is how makeCliff samples
    // the rolling ground under its lumps. The gorge is SEEN here, the way case
    // 5's is. A paper fill used to hang under the crags hiding everything past
    // the fog line, and on a ledge this shallow it read as a slab laid over the
    // drop rather than as depth rather than as depth. Shallower than case 5's
    // is fine — this one is a ledge, not a chasm — the carve below runs the
    // face down and climbs it back out as a rim.
    const cliff = makeCliff({
      width: 13, drop: 6.5, depth: 2.6, seed: ID,
      origin: [CLIFF.x, CLIFF.z], yaw: CLIFF.yaw,
    });
    cliff.position.set(CLIFF.x+5, 0, CLIFF.z);
    cliff.rotation.y = CLIFF.yaw;
    scene.add(cliff);

    const cliff2 = makeCliff({
      width: 13, drop: 6.5, depth: 2.6, seed: ID,
      origin: [CLIFF.x-5, CLIFF.z], yaw: CLIFF.yaw,
    });
    cliff2.position.set(CLIFF.x-5, 0, CLIFF.z);
    cliff2.rotation.y = CLIFF.yaw;
    scene.add(cliff2);

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
    // there at every height. Seven of them over a wide disc
    // is a scattering across the whole open half of the picture rather than a
    // knot in one corner of it.
    const butterflies = makeButterflies({
      count: 7, seed: ID, color: ACCENT, size: 0.42,
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
      trees: 7,
      mountains: [
        { count: 8, distance: 252, arcSpan: 3.6 },
        { count: 5, distance: 35, arcSpan: 2.4},
      ],
      keepout: [
        { x: 0, z: 20, r: 1.4 },
        ...cliff.footprint(1.0),
        ...cliff.voidFootprint(0.5),
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
      const bay = SS(-9.5, -5.0, wx) * (1 - SS(5.0, 9.5, wx));
      if (bay <= 0) continue;
      const sink = DROP * SS(0, 1.4, d) * (1 - SS(GORGE - 2.0, GORGE, d)) * bay;
      if (sink > 0) gpos.setY(i, gpos.getY(i) - sink);
    }
    gpos.needsUpdate = true;
    groundMesh.geometry.computeVertexNormals();

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 2.0, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'zuigan-hit';
    hit.position.set(ZUIGAN.x, 1.0, ZUIGAN.z);
    scene.add(hit);

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
      if (!input.raycastFirst(camera, [hit])) return;
      if (pending >= 0) return;
      line = (line % LINES) + 1;
      calls++;
      pending = clock + ECHO;
      calledAt = clock;
      butterflies.flit();               // a man shouting on a clifftop startles them
      // each line of the daily exercise is pitched a little lower than the last
      audio && audio.knock({ force: 0.9 - (line - 1) * 0.12, at: hit.position });
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
          audio && audio.knock({ force: 0.30, at: hit.position });
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
