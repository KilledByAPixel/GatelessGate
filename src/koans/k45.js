import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, wash } from '../palette.js';
import { hash1 } from '../util/noise.js';
import {
  composeWorld, makePath, makeMonk, faceMonk, makeStall, makeHorse,
  makeLights, addOutlines,
} from '../kit/index.js';

const ID = 45;

// "The past and future Buddhas, both are his servants. Who is he?" — and
// Mumon says that if you realize who he is, it is as if you met your own father
// on a busy street: you would not need to ask anyone whether you were right.
//
// So the scene IS that street, and it is Mumon's whole image and nothing else:
// a lane of market stalls, keepers behind their counters, a customer at a
// counter, bystanders in the gaps — and in the middle of all of it two men
// stopped face to face, an elder and a younger, who have recognised each other
// and do not need to ask. The crowd is what makes the recognition worth
// anything. Nobody has to point them out to you either.
//
// NOTHING IN THIS STREET MOVES, and that took two goes to arrive at.
//
// First, two figures strolled the lane on a triangle wave over simTime. No
// other case in the book walks a figure along a path, and legs that do not
// stride read as a glide, so Frank cut them (2026-08-10): "no people walking,
// they are just standing."
//
// Second — and this is the one worth recording — the case used to stage HIM:
// the man of the koan, placed at the very margin of the picture with his back
// turned, walking to a mark unprojected from a fixed spot near the frame's
// edge so that he was always just-noticed, never the figure you were looking
// at, and walked out of shot the moment you reached for him. It read as
// intended on a still page and nowhere else. In the look, whose drift never
// stops, the frame slid off him constantly and he re-placed to the opposite
// margin about once a second — one man teleporting between both edges, which
// the reader sees as several monks glitching in and out (Frank: "2 monks
// moving around in a glitchy way on the left and right side"). Damping the
// chase and gating the re-place fixed the strobe and left a man who slides
// around the edge of every shot for no reason a reader can name.
//
// The verdict was the simpler one: he is gone, and the answer to "who is he?"
// is left to the reader and the two men in the lane. The staging keeps what
// the comment actually describes — a busy street, and a meeting in it.
//
// (What the tap does now: the horse. "Do not ride another's horse.")

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 9.5, target: [1.85, 1.05, -0.4], heading: 42, pitch: 16 };
  export default {
  id: ID,
  slug: 'who-is-he',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.22', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.034);      // dusk: he is easy to lose
  scene.add(makeLights());
  
  const road = makePath({ from: [5.6, 7.4], to: [-4.8, -17], width: 1.6, seed: ID, groundSeed: 21, wander: 0.6 });
  scene.add(road);
  
  // ---- THE MARKET -------------------------------------------------------
  // A short row of stalls down the lane, each turned to face the road, with
  // someone behind the counter. All ink and wash — the one warm mark in the
  // whole picture is the red horse, so the crowd stays monochrome.
  const stallKeepout = [];
  const stalls = [
  { t: 0.25, sidesign: -1, off: 1.8, w: 2.1 },
  { t: 0.30, sidesign: 1, off: 2.7, w: 1.9 },
  { t: 0.59, sidesign: -1, off: 2.7, w: 3.7 },
  { t: 0.62, sidesign: 1, off: 2.5, w: 1.8 },
  { t: 0.78, sidesign: -1, off: 2.1, w: 1.6 },
  ];
  const keepers = [];
  for (let i = 0; i < stalls.length; i++) {
  const s = stalls[i];
  const p = road.sample(s.t);
  const sx = p.x + p.perp.x * s.off * s.sidesign;
  const sz = p.z + p.perp.z * s.off * s.sidesign;
  // face the stall's front (+z) back toward the road centre
  const faceX = p.x - sx;
  const faceZ = p.z - sz;
  const heading = Math.atan2(faceX, faceZ);
  
  const stall = makeStall({
  width: s.w, depth: 1.2, height: 2.0, seed: ID + i * 7,
  wood: wash(0.30 + (i % 2) * 0.06), cloth: wash(0.40),
  });
  stall.position.set(sx, 0, sz);
  stall.rotation.y = heading;
  scene.add(stall);
  stallKeepout.push({ x: sx, z: sz, r: Math.max(s.w*.7, 1.4) });
  
  // a keeper a step behind the counter, facing the lane — but the last
  // three stalls stand unattended, which reads as a real market (and the
  // draw budget is why the far end minds itself)
  if (i < 2) {
  const back = 0.5;
  const kx = sx - faceX / Math.hypot(faceX, faceZ) * back;
  const kz = sz - faceZ / Math.hypot(faceX, faceZ) * back;
  const keeper = makeMonk({ height: 1.5 + hash1(i, ID) * 0.1, hat: hash1(i + 3, ID) > 0.5, stout: 1.05 });
  keeper.position.set(kx, 0, kz);
  faceMonk(keeper, { x: p.x, z: p.z });
  scene.add(keeper);
  keepers.push(keeper);
  stallKeepout.push({ x: kx, z: kz, r: 0.7 });
  }
  }
  
  // a customer waiting at the middle stall's counter, on the lane side and
  // turned to face the stall
  const mid = road.sample(stalls[2].t);
  const cust = makeMonk({ height: 1.58, elder: true, hat: false, stout: 1.2 });
  const cx = mid.x + mid.perp.x * (stalls[2].off - 1.5) * stalls[2].sidesign;
  const cz = mid.z + mid.perp.z * (stalls[2].off - 1.5) * stalls[2].sidesign;
  cust.position.set(cx, 0, cz);
  const stallX = mid.x + mid.perp.x * stalls[2].off * stalls[2].sidesign;
  const stallZ = mid.z + mid.perp.z * stalls[2].off * stalls[2].sidesign;
  cust.rotation.y = Math.atan2(stallX - cx, stallZ - cz);
  scene.add(cust);
  stallKeepout.push({ x: cx, z: cz, r: 0.7 });

  // THE MEETING — Mumon's own image, standing in the middle of the street:
  // "it is as if you met your own father on a busy street. There is no need to
  // ask anyone whether or not your recognition is true." An elder and a
  // younger man, stopped face to face in the lane while the market goes on
  // around them. They are the recognition itself — the whole of Mumon's image.
  //
  // THEY STAND. Two figures used to stroll the lane on a triangle wave, and
  // Frank cut them (2026-08-10): "none of the other ones have that" — no other
  // case walks a figure along a path, and legs that do not stride read as a
  // glide. Every person in this street is still now; the life comes from how
  // many of them there are and how they are turned, which is how the rest of
  // the book does it.
  // WHICH WAY THE PAIR FACES IS MEASURED, not eyeballed. World distance and
  // SCREEN separation are different currencies (the case-7 lesson): squared up
  // along the road they stand 1.7 units apart and read as ONE man with a
  // shadow — 0.09 of half-frame from this camera. Swung 62° off the road they
  // read at 0.23, more than double, and 62° is also how two people who stop to
  // talk actually stand: turned out of the flow, not blocking it.
  const MEET_T = 0.36;
  const MEET_ANG = (62 * Math.PI) / 180;
  const GAP = 0.45;                     // a pace apart — close enough to be a meeting
  const meetAt = road.sample(MEET_T);
  const along = { x: Math.sin(meetAt.heading), z: Math.cos(meetAt.heading) };
  const axis = {
    x: along.x * Math.cos(MEET_ANG) + meetAt.perp.x * Math.sin(MEET_ANG),
    z: along.z * Math.cos(MEET_ANG) + meetAt.perp.z * Math.sin(MEET_ANG),
  };
  const elder = makeMonk({ height: 1.6, elder: true });
  const younger = makeMonk({ height: 1.5, pose: 'fold', hat: false });
  elder.position.set(meetAt.x + axis.x * GAP, 0, meetAt.z + axis.z * GAP);
  younger.position.set(meetAt.x - axis.x * GAP, 0, meetAt.z - axis.z * GAP);
  faceMonk(elder, younger.position);
  faceMonk(younger, elder.position);
  // tagged rather than renamed: every figure in the book is a 'monk' and the
  // street's census counts them by that name, but the two who are MEETING have
  // to be findable on purpose — the closest pair in a crowded lane is not
  // reliably them (a keeper and his customer stand nearer than these two do)
  elder.userData.meeting = 'elder';
  younger.userData.meeting = 'younger';
  scene.add(elder);
  scene.add(younger);
  // they stand in grass like everyone else, but nothing grows THROUGH them —
  // by live reference, so a nudge to MEET_T can never leave the keepout
  // guarding bare lane (the moved-prop lesson)
  const meetKeepout = [{ at: elder, r: 0.7 }, { at: younger, r: 0.7 }];
  
  // A few more people standing about the street between the stalls (Frank: it
  // is a busy street). They come from the same builder as every other figure,
  // just with the cheap options — no hat, no sleeves — so they are dark robed
  // shapes like the monks rather than a separate kind of thing, and a crowd of
  // them still fits the draw budget.
  const bystander = (x, z, facing, h = 1.56) => {
  const f = makeMonk({ height: h, hat: false, arms: false });
  f.position.set(x, 0, z);
  f.rotation.y = facing;
  return f;
};
    // dotted along both sides of the lane, in the gaps between the stalls
    const crowd = [
      bystander(road.sample(0.44).x - 2.4, road.sample(0.44).z + 0.3, 1.2, 1.6),
      bystander(road.sample(0.52).x + 1.5, road.sample(0.52).z - 0.2, -1.9, 1.5),
      bystander(road.sample(0.7).x - 1.2, road.sample(0.7).z + 0.1, 0.6, 1.62),
      bystander(road.sample(0.24).x + 1.3, road.sample(0.24).z + 0.2, -0.8, 1.35),
      bystander(road.sample(0.68).x + 1.4, road.sample(0.68).z - 0.3, 2.4, 1.52),
    ];
    for (const c of crowd) scene.add(c);

    // THE HORSE — the case's one red thing, standing tethered by the t-0.30
    // stall (the second of five). The verse says "Do not ride another's
    // horse," so here is the horse you are not to ride, and it is the only
    // warm mark in the whole street. A larger red than a held seal, so it
    // takes the deep mix rather than glaring full accent across a whole
    // animal.
    const horse = makeHorse({ height: 1.5, color: ACCENT_DEEP, seed: ID });
    // beside the t-0.30 stall, not in front of it — pulled back along the lane
    // so it does not block the counter, and standing a clear step off the road
    // rather than at its very edge (Frank: it was a little too close, so it
    // moved back — tethered on the grass, not loitering in the traffic)
    const hp = road.sample(0.35);
    const side = stalls[1].sidesign;
    const horseX = hp.x + hp.perp.x * 1.95 * side;
    const horseZ = hp.z + hp.perp.z * 1.95 * side;
    horse.group.position.set(horseX, 0, horseZ);
    // the horse faces +z; turn its head toward the road (i.e. toward -perp on
    // the side it stands), a little angled so it reads three-quarter, not flat
    horse.group.rotation.y = Math.atan2(-hp.perp.x * side, -hp.perp.z * side) + 0.3;
    scene.add(horse.group);

    const world = composeWorld(scene, {
      view: CAM,
      seed: ID,
      groundSeed: 21,
      trees: 1,           // the stalls are the scene now — one tree, no more
      keepout: [
        ...road.keepout(26, 1.4),
        { x: horseX, z: horseZ, r: 1.4 },
        ...stallKeepout,
        ...meetKeepout,
      ],
      grassKeepout: [...road.keepout(28, 1.0), ...stallKeepout, ...meetKeepout],
    });

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: the horse you are not to ride -----------------------
    // "Do not ride another's horse." Reach for the one red thing in the street
    // and it shifts its weight away from your hand — a hoof-fall on the packed
    // lane, and then it is standing again exactly as it was.
    //
    // The whole of it is a TOUCH RESPONSE. The street has no idle motion of any
    // kind (see the header), so this is the only thing in the frame that ever
    // moves, and only because you moved it.
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 1.9, 1.3),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'horse-hit';
    hit.userData.noOutline = true;
    hit.position.set(horseX, 0.95, horseZ);
    hit.rotation.y = horse.group.rotation.y;
    scene.add(hit);

    let camera = null;
    let clock = 0;
    let touched = 0;
    let shyAt = -99;
    const restY = horse.group.rotation.y;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      touched++;
      shyAt = clock;
      audio && audio.knock({ force: 0.5, at: horse.group.position });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);

        // NOBODY IN THIS STREET MOVES. Two figures used to stroll the lane on a
        // triangle wave, and a man of the koan used to pace the margin of every
        // shot; both are gone (see the header). The market is staged, not
        // animated — its life comes from how many people are in it and how they
        // are turned, which is how the rest of the book does it.
        //
        // The horse is the one exception, and only for the two seconds after it
        // is touched. A closed form over the guarded clock, like every other
        // animation in the book: same taps at the same steps, same horse.
        const u = shyAt > -99 ? clock - shyAt : -1;
        let shy = 0;
        if (u >= 0 && u < 1.9) {
          shy = Math.min(1, u / 0.18, (1.9 - u) / 1.0);
          shy = shy * shy * (3 - 2 * shy);
        }
        horse.group.rotation.y = restY - 0.16 * shy;
        horse.group.position.y = 0.045 * shy * Math.abs(Math.sin(u * 7.5));
      },
      fragment() {
        return {
          touched,
          shy: +Math.abs(horse.group.rotation.y - restY).toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
