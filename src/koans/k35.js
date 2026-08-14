import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, wash } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeMoon, makeMonk, faceMonk,
  plantTree, groundHeight, makeLights, } from '../kit/index.js';

const ID = 35;

// Seijo had two souls: one sick in bed at home, one away in the city, married,
// with two children. Goso asks which was the true one.
//
// BOTH LIVES ARE STANDING THERE AT ONCE, and both are ordinary. On the road,
// one of her with a child at either hand — the years away, the marriage, the
// family, all of it real. A little off the road, on the home side, the other
// one sits under a tree — the years that never left the house, equally real.
// Neither is a ghost, and neither is transparent. That is the whole staging.
//
// It replaced two translucent walkers who paced apart and back together along
// the road. The ghosting was the old answer to "which is the true one" — make
// them both half-there — and it answered by hedging: two faint figures read as
// two apparitions, i.e. as neither of them being the woman. Two solid people
// living two whole lives in one picture is the harder and truer image, and it
// is the one the case actually describes.
//
// What survives from that version: neither of her is the brighter one, both
// carry the same red, and touching either one is answered by BOTH.
//
// Above it all, the moon from Mumon's verse — "The moon above the clouds is the
// same moon, the mountains and rivers below are all different". It was the seal
// at first; now it hangs plain (see the moon below) and the two souls
// themselves carry the red.

const ROAD_T = 0.29;      // how far along the road the family stands
const KID_SIDE = 0.70;    // a child off either shoulder, across the width-1.4 road
// The other of her, and her tree — on the HOME side of the road, which is the
// +perp side here (the house stands at x 4.6). Not decoration: the one who
// stayed sits at the house end of the road, and the family is further along it
// toward the town, so the picture reads left to right the way the case does.
// The exact numbers are framing. The reading pane is the window minus a panel
// that takes up to 40% of it, so a square-ish stage is the real worst case, not
// the 1.78 the staging net checks with; here the seated figure reaches 0.75 of
// frame width at aspect 1.0, and a step further out costs her an arm to the
// right edge on a small window.
const SIT = { x: 2.25, z: -10.8 };
const TREE = { x: 4.2, z: -3.5 };
// THEY ROCK, they do not tip. A touch used to set an envelope to 1 on that
// frame and decay it linearly, so both of her snapped into a 0.045-radian lean
// in a single frame and then crept back out of it — tipping instantly instead
// of rocking. The same fault as case 36's bow and as the birds' and
// butterflies' alarms, found in the same pass: an envelope a touch sets to 1
// has no attack.
//
// A damped oscillation has no such frame — sin(0) is 0, so it starts from
// exactly where they were standing, swings one way, comes back through, and
// settles. Written as a pure function of seconds since the touch, so nothing
// accumulates and the pose can be applied at build (see breathe() below).
const ROCK = 0.075;       // radians at the widest part of the swing
const ROCK_HZ = 0.8;      // a slow rock, not a shiver
const ROCK_TAU = 1.7;     // and it is down to a tenth of itself in about four
const ROCK_RISE = 0.10;   // the lift's own attack, so THAT does not step either
function rockAt(u) {
  if (!(u >= 0) || u > ROCK_TAU * 6) return 0;
  return Math.exp(-u / ROCK_TAU) * Math.sin(u * Math.PI * 2 * ROCK_HZ);
}
// the swing's envelope without its direction — what the small rise rides on
function rockEnv(u) {
  if (!(u >= 0) || u > ROCK_TAU * 6) return 0;
  return (1 - Math.exp(-u / ROCK_RISE)) * Math.exp(-u / ROCK_TAU);
}

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 7.5, target: [1.45, 1.3, -4.1], heading: -17, pitch: 7.5 };

export default {
  id: ID,
  slug: 'two-souls',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.16', 'music'],
  // Close in, and low. Both of those sit OUTSIDE the rig's stock envelope
  // (minDist 7, minPitch 7), so this frame has to widen the envelope as
  // well as name itself — the way k12 does for its gorge. Without that the
  // authored view holds on arrival and then dies at the reader's first
  // scroll notch or drag, which clamps into the stock range and can never
  // get back out: the composition would be reachable exactly once.
  camera: CAM,

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // The road between the two lives. It runs the full depth it was extended
    // to — but bent, because straight ahead at that reach is a twelve-unit
    // mountain at (-5.5, -29.6) and the road was ending nearly three units
    // inside its rock. The bend lives in the far quarter: at the town's depth
    // the lane is within a third of a unit of where the straight road put it,
    // so nothing near the camera moved.
    const path = makePath({
      from: [6.5, 6.0], to: [3.5, -21], via: [-5.0, -9],
      width: 1.4, seed: ID, groundSeed: 21, wander: 0.6,
    });
    scene.add(path);

    // home, near; the town, far off down the road
    const home = makeHut({ width: 2.8, height: 2.2, depth: 2.3 });
    home.position.set(2.6, 0, -12.6);
    home.rotation.y = -.2;
    scene.add(home);

    const town = makeHut({ width: 3.0, height: 2.4, depth: 2.4 });
    town.position.set(-6.4, 0, -8.0);
    town.rotation.y = 0.5;
    //scene.add(town);

    // THE MOON, standing beyond everything — plain now, not the seal: the two
    // souls carry the red, so the moon is just a pale disc.
    const moon = makeMoon({ radius: 2.9, color: wash(0.30), distance: 62 });
    scene.add(moon);

    // THE TREE, planted rather than scattered: it stands where the composition
    // needs a mass, so it is the one tree in the scene whose position is the
    // picture's business and not the scatter's (kit/scenery.js, plantTree —
    // the hand-placement override, no keepout work of its own).
    //
    // It is NOT a canopy over the seated one any more. The restaging moved her
    // back down the road, some seven units off this trunk, and the picture is
    // better for it — she sits in open ground with the tree standing between
    // her and the house. The old arrangement had her tucked under it, which
    // read as shelter; the case is not about shelter.
    const tree = plantTree(scene, { x: TREE.x, z: TREE.z, height: 4.0, groundSeed: 21 });

    // THE TWO OF HER — the seal, and the only red in the picture. Solid, both
    // of them: see the header. One stands in the lane with her children; the
    // other sits alone, well back down the road at the house end of it.
    const road = path.sample(ROAD_T);
    const souls = [];

    const walker = makeMonk({ height: 1.5, hat: true, color: ACCENT });
    walker.name = 'soul';
    walker.position.set(road.x, groundHeight(road.x, road.z, { seed: 21 }), road.z);
    // turned back up the road toward the house, which is the direction the
    // case moves in: she is the one who comes home after the years away
    faceMonk(walker, home.position);
    scene.add(walker);
    souls.push(walker);

    const sitter = makeMonk({ height: 1.5, hat: false, color: ACCENT, pose: 'sit' });
    sitter.name = 'soul';
    sitter.position.set(SIT.x, groundHeight(SIT.x, SIT.z, { seed: 21 }), SIT.z);
    // She faces the road — and so, from where she sits, the other of her.
    // A meditator normally faces nothing in particular; this one is looking at
    // the life she is also living, which is the picture the case wants.
    faceMonk(sitter, walker.position);
    scene.add(sitter);
    souls.push(sitter);

    // THE TWO CHILDREN, one at either hand. Ink, not red — the red belongs to
    // the two of her, and a family painted in the accent would spread the seal
    // over five figures and seal nothing. Bare-headed and unequal in height,
    // the way k3's boy attendant is: children in this book are small adults in
    // silhouette, so the only things saying "child" are scale and difference.
    const kids = [];
    for (const [i, h] of [1.02, 0.88].entries()) {
      const side = i === 0 ? 1 : -1;
      const kid = makeMonk({ height: h, hat: false });
      kid.name = 'child';
      const kx = road.x + road.perp.x * KID_SIDE * side;
      const kz = road.z + road.perp.z * KID_SIDE * side;
      kid.position.set(kx, groundHeight(kx, kz, { seed: 21 }), kz);
      kid.rotation.y = walker.rotation.y - side * 0.28;   // each turned a little toward her
      scene.add(kid);
      kids.push(kid);
    }

    const world = composeWorld(scene, {
      view: CAM,
      seed: ID,
      // one fewer than before: her tree is planted by hand above, and the
      // scatter's budget should not grow just because the composition did
      trees: 4,
      groundSeed: 21,
      keepout: [
        ...path.keepout(26, 1.4),
        { x: home.position.x, z: home.position.z, r: 2.8 },
        { x: town.position.x, z: town.position.z, r: 3.0 },
        // by live reference, so nudging the staging moves its clearing with it
        { at: tree, r: 3.2 },
        { at: sitter, r: 1.4 },
      ],
      grassKeepout: [
        ...path.keepout(28, 1.0),
        { x: home.position.x, z: home.position.z, r: 1.9 },
        // a seated figure is half a standing one: full meadow would swallow
        // her to the shoulders (k7 learned this on a cat)
        { at: sitter, r: 0.85 },
      ],
    });

    // One hit box per life, sized to what stands inside it: the family's takes
    // the mother and both children, so a reader who taps a child has tapped
    // her — the children belong to that life, not to a third one.
    const hitFor = (name, w, h, d, x, z) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshBasicMaterial({ visible: false }));
      m.name = name;
      m.position.set(x, groundHeight(x, z, { seed: 21 }) + h / 2, z);
      scene.add(m);
      return m;
    };
    const hits = [
      hitFor('family-hit', 2.6, 1.9, 2.2, road.x, road.z),
      hitFor('sitter-hit', 1.5, 1.3, 1.5, SIT.x, SIT.z),
    ];

    // ---- the moment: which one is real -----------------------------------
    // Touch either of her and BOTH of them answer — the same breath, the same
    // small lean, at the same instant. The staging changed underneath this
    // (two walkers used to be pulled together by a tap) but the refusal did
    // not: there is no way to address one of her, so the question never gets
    // the answer it is fishing for.
    let camera = null;
    let clock = 0;
    let touches = 0;
    let touchedAt = -99;        // when the last touch landed; rockAt does the rest
    const AT = new THREE.Vector3();

    // Their rest pose, so the breath below is an offset and not a drift: both
    // of these were set once, above, by faceMonk and the terrain.
    for (const s of souls) s.userData.baseY = s.position.y;

    input.onTap(() => {
      if (!camera) return;
      const hit = input.raycastFirst(camera, hits);
      if (!hit) return;
      touches++;
      touchedAt = clock;
      audio && audio.chimeStrike({ tube: 2, force: 0.4, at: hit.object.getWorldPosition(AT) });
    });

    // Breathing, and the answer. Pulled out of update() for the reason the old
    // placeSouls() was: the frame loop only ticks on a whole banked 1/60s, so
    // anything only update() ever applies is missing from the first rendered
    // frame, which showed as a flicker in the figures' position on arrival.
    function breathe() {
      const u = clock - touchedAt;
      const rock = rockAt(u);
      const env = rockEnv(u);
      const b = Math.sin(clock * 0.7);
      for (const s of souls) {
        // identical on both, by construction: neither of her is livelier
        s.rotation.z = b * 0.010 + rock * ROCK;
        s.position.y = s.userData.baseY + Math.abs(b) * 0.010 + env * 0.014;
      }
      // the children are not her, so they fidget on their own clocks
      for (const [i, k] of kids.entries()) k.rotation.z = Math.sin(clock * 1.3 + i * 2.1) * 0.028;
    }
    breathe();

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        breathe();
      },
      fragment() {
        return {
          touches,
          // signed: it swings one way and back through, so this goes negative
          answer: +rockAt(clock - touchedAt).toFixed(4),
          apart: +souls[0].position.distanceTo(souls[1].position).toFixed(3),
        };
      },
      dispose() {},
    };
  },
};
