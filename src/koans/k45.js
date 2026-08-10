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
// Mumon says that if you realize who he is, it is like meeting your own father
// on a busy street: you would not need to ask anyone whether you were right.
//
// So the scene IS a busy street: a lane of market stalls, keepers behind their
// counters, a customer waiting to be served, and a couple of people strolling
// through. The crowd is the point — it is what he is lost in.
//
// And he is in it — at the EDGE of the picture, always, with his back turned.
// Never the figure you were looking at; always one you notice afterwards.
//
// HE USED TO STAND BEHIND THE CAMERA and lag, the idea being that a fast swing
// would catch him at the frame's edge before he got out of the way. It could
// not work, and measuring it said so: a point 4.2 units BEHIND the camera lags
// SIDEWAYS, and sideways from behind you is still behind you — it never crosses
// into the frustum. Orbiting the real module at every rate from 2°/s to 120°/s
// put him on screen for exactly zero frames; past ~150°/s he stopped being
// dodged at all and simply stood there in the street, permanently visible.
// There was no rate in between. (And a reading page cannot drag the camera at
// all, so even that degenerate case needed the look.) Frank, who reads pages:
// "I don't notice a man keeping station."
//
// So he is staged in the frame instead of behind it. His mark is a point on the
// ground UNPROJECTED from a fixed spot near the edge of the picture (the same
// ground-plane cast main.js's feedBreeze uses), so it is exact for any pitch and
// distance the rig can reach: he is always at the margin, at a walkable depth,
// however the camera is aimed. He walks to it at a walking pace and no faster —
// which is the lag, kept, and doing visible work now: swing the camera and his
// mark leaps to the new margin while he is still crossing the old one, so he
// drops out of the picture, and by the time you have arrived he has stepped in
// at some other edge. Reach for him and he walks out of shot.
//
// You never get in front of him.

const LAG = 1.15;          // e-folding rate of his keeping-up, per second
const WALK = 1.5;          // ...and a hard ceiling on it. He walks; he never darts.
// Where the margin is, in the picture. X near the edge but comfortably inside;
// Y low, so the ground point it casts to lands out in the street rather than
// under the camera's feet. OUT is off-frame — where he enters from and leaves to.
const EDGE_X = 0.86, EDGE_Y = -0.35, EDGE_X_OUT = 1.12;
const CENTRE_X = 0.45;     // inside this much of the frame's middle he is exposed, and leaves
const REACH = 3.5;         // a mark further off than this is one he has lost; he stops chasing
const NEAR = 4, FAR = 15;  // and his mark is no use closer or further than this
const WORLD_R = 15;        // never out in the mountains
const REPLACE_WAIT = 0.6;  // off-frame this long and he is free to be somewhere else
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 11.0, target: [0.4, 1.5, -0.6], heading: 31.5, pitch: 19 };
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
  { t: 0.30, sidesign: 1, off: 2.7, w: 1.9 },
  { t: 0.46, sidesign: -1, off: 2.7, w: 1.7 },
  { t: 0.62, sidesign: 1, off: 2.9, w: 1.8 },
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
  stallKeepout.push({ x: sx, z: sz, r: Math.max(s.w, 1.4) });
  
  // a keeper a step behind the counter, facing the lane — but the last
  // stall is left unattended, which reads as a real market (and keeps the
  // draw budget honest with a crowd still to place)
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
  const mid = road.sample(stalls[1].t);
  const cust = makeMonk({ height: 1.58, elder: true });
  const cx = mid.x + mid.perp.x * (stalls[1].off - 1.5) * stalls[1].sidesign;
  const cz = mid.z + mid.perp.z * (stalls[1].off - 1.5) * stalls[1].sidesign;
  cust.position.set(cx, 0, cz);
  const stallX = mid.x + mid.perp.x * stalls[1].off * stalls[1].sidesign;
  const stallZ = mid.z + mid.perp.z * stalls[1].off * stalls[1].sidesign;
  cust.rotation.y = Math.atan2(stallX - cx, stallZ - cz);
  scene.add(cust);
  stallKeepout.push({ x: cx, z: cz, r: 0.7 });
  
  // two people strolling the lane, driven along the road in update(). Their
  // motion is a closed form over simTime, so the street is alive but replays.
  const walkers = [
  { monk: makeMonk({ height: 1.6 }), t0: 0.18, t1: 0.74, rate: 0.045, phase: 0.0, dir: 1, lane: 0.55 },
  { monk: makeMonk({ height: 1.54, elder: true }), t0: 0.20, t1: 0.70, rate: 0.037, phase: 0.5, dir: -1, lane: -0.5 },
  ];
  for (const w of walkers) scene.add(w.monk);
  
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
      bystander(road.sample(0.38).x - 1.4, road.sample(0.38).z + 0.3, 1.2, 1.6),
      bystander(road.sample(0.52).x + 1.5, road.sample(0.52).z - 0.2, -1.9, 1.5),
      bystander(road.sample(0.7).x - 1.2, road.sample(0.7).z + 0.1, 0.6, 1.62),
    ];
    for (const c of crowd) scene.add(c);

    // THE HORSE — the case's one red thing, standing tethered by the first
    // stall. The verse says "Do not ride another's horse," so here is the horse
    // you are not to ride, and it is the only warm mark in the whole street.
    // A larger red than a held seal, so it takes the deep mix rather than
    // glaring full accent across a whole animal.
    const horse = makeHorse({ height: 1.5, color: ACCENT_DEEP, seed: ID });
    // beside the first stall, not in front of it — pulled back along the lane so
    // it does not block the counter, and standing a clear step off the road
    // rather than at its very edge (Frank: it was a little too close, so it
    // moved back — tethered on the grass, not loitering in the traffic)
    const hp = road.sample(0.262);
    const side = stalls[0].sidesign;
    const horseX = hp.x + hp.perp.x * 1.95 * side;
    const horseZ = hp.z + hp.perp.z * 1.95 * side;
    horse.group.position.set(horseX, 0, horseZ);
    // the horse faces +z; turn its head toward the road (i.e. toward -perp on
    // the side it stands), a little angled so it reads three-quarter, not flat
    horse.group.rotation.y = Math.atan2(-hp.perp.x * side, -hp.perp.z * side) - 0.35;
    scene.add(horse.group);

    // HIM. Placed in the first frame at a plausible spot, then handed over to
    // the camera for the rest of his existence.
    const him = makeMonk({ height: 1.66 });
    him.name = 'him';
    him.position.set(2.0, 0, 6.0);
    scene.add(him);

    const world = composeWorld(scene, {
      view: CAM,
      seed: ID,
      groundSeed: 21,
      trees: 1,           // the stalls are the scene now — one tree, no more
      keepout: [
        ...road.keepout(26, 1.4),
        { x: horseX, z: horseZ, r: 1.4 },
        ...stallKeepout,
      ],
      grassKeepout: [...road.keepout(28, 1.0), ...stallKeepout],
    });

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 1.9, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'him-hit';
    hit.userData.noOutline = true;
    hit.position.y = 0.95;
    him.add(hit);

    // ---- the moment: at the edge of the picture ---------------------------
    let camera = null;
    let clock = 0;
    let glimpses = 0;
    let seen = false;
    let caught = 0;
    let lastChime = -99;
    let margin = 1;              // which margin he is holding: +1 or -1
    let leaving = false;       // reached for — walking out of shot
    let goneSince = 0;         // seconds off-frame, for the re-place
    let places = 0;            // how many times he has stepped in somewhere new

    const fwd = new THREE.Vector3();
    const want = new THREE.Vector3();
    const ray = new THREE.Vector3();
    const ndc = new THREE.Vector3();

    // The ground point under a spot in the PICTURE. Same cast as main.js's
    // feedBreeze: drop the NDC ray onto y = 0 and read where it lands. Doing it
    // this way rather than with an angle off the camera's forward is what makes
    // the margin exact at every pitch the rig allows — an angular offset that
    // frames him nicely at pitch 19 puts him under the bottom edge at pitch 30.
    function groundAt(nx, ny, out) {
      ray.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
      const t = ray.y < -1e-4 ? camera.position.y / -ray.y : -1;
      if (!(t > NEAR) || t > FAR) return false;      // above the horizon, or out in the fog
      out.set(camera.position.x + ray.x * t, 0, camera.position.z + ray.z * t);
      const r = Math.hypot(out.x, out.z);
      if (r > WORLD_R) { out.x *= WORLD_R / r; out.z *= WORLD_R / r; }
      return true;
    }

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      caught++;
      // and he goes. Not a teleport — he walks out of the picture on the margin
      // he was already holding, which is the whole answer this case gives.
      leaving = true;
      if (clock - lastChime > 0.6) {
        lastChime = clock;
        // you did not catch him. Something sounds a long way off — left
        // unplaced on purpose: the whole point of this case is that he has no
        // fixed spot to answer from, and giving the sound one would be lying
        // about the koan.
        audio && audio.chimeStrike({ tube: 0, force: 0.3 });
      }
    });

    return {
      scene,
      // He is stood on his mark the INSTANT there is a camera to measure it
      // from, not on the first update(): a figure whose position only update()
      // ever sets renders its build pose on any first frame too short to bank a
      // whole timestep, which on case 35 showed as a visible flicker. Here it
      // would be worse — he would be caught mid-street for a frame.
      setCamera(c) {
        camera = c;
        if (camera && groundAt(margin * EDGE_X, EDGE_Y, want)) {
          him.position.set(want.x, 0, want.z);
          camera.getWorldDirection(fwd);
          fwd.y = 0;
          if (fwd.lengthSq() > 1e-8) him.rotation.y = Math.atan2(fwd.x, fwd.z);
        }
      },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);

        // the strollers walk the lane back and forth — a triangle wave over t so
        // each turns at the end and comes back rather than teleporting to start
        for (const w of walkers) {
          const cyc = (((clock * w.rate + w.phase) % 1) + 1) % 1;
          const tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;      // 0→1→0 along the lane
          const p = road.sample(w.t0 + (w.t1 - w.t0) * tri);
          w.monk.position.set(
            p.x + p.perp.x * w.lane,
            Math.abs(Math.sin(clock * 3.2 + w.phase * 6)) * 0.03,   // a small walking bob
            p.z + p.perp.z * w.lane);
          // face the way they are walking: heading points along increasing t, so
          // flip it on the return leg
          const travel = (cyc < 0.5 ? 1 : -1) * w.dir;
          w.monk.rotation.y = p.heading + (travel < 0 ? Math.PI : 0);
        }

        if (!camera) return;
        const step = Math.max(0, dt || 0);

        camera.getWorldDirection(fwd);
        fwd.y = 0;
        if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
        fwd.normalize();

        // his mark: the margin of the picture on the side he is holding — or
        // off the edge entirely if he has been reached for, or caught out in the
        // middle of the shot. groundAt can refuse (a lens tipped at the horizon
        // casts no ground point), and then he simply keeps the mark he had
        // rather than snapping anywhere.
        groundAt(margin * (leaving ? EDGE_X_OUT : EDGE_X), EDGE_Y, want);

        // He walks there, and the walk is capped. The ease alone would have him
        // sprinting across the street whenever the camera swung — which is the
        // shape of the bug this staging replaced, and the cap is what turns the
        // lag from an invisible property into the mechanic: outrun his mark and
        // he is simply left out of frame until he can step in somewhere else.
        //
        // AND WHEN THE MARK IS PLAINLY OUT OF REACH HE STOPS WALKING. Whipping
        // the camera round sweeps the mark through the street faster than any
        // man crosses it, and chasing it anyway had him running along under the
        // centre of the frame for as long as the swing lasted — the reader's
        // eye reads that as a figure FOLLOWING the camera, which is the exact
        // opposite of the case. Out of reach, he stands in the street like
        // everybody else and lets the picture sweep off him.
        // ...unless he is on his way out, which he always completes on foot. The
        // ground stretches fast toward the edge of a frame, so the step from the
        // margin to just past it can be several units — long enough for the
        // reach test to refuse it, and then a man reached for simply stood there.
        const reach = Math.hypot(want.x - him.position.x, want.z - him.position.z);
        if (leaving || reach <= REACH) {
          const k = 1 - Math.exp(-LAG * step);
          let dx = (want.x - him.position.x) * k;
          let dz = (want.z - him.position.z) * k;
          const d = Math.hypot(dx, dz);
          const cap = WALK * step;
          if (d > cap && d > 1e-9) { dx *= cap / d; dz *= cap / d; }
          him.position.x += dx;
          him.position.z += dz;
        }
        him.position.y = Math.abs(Math.sin(clock * 3.2)) * 0.03;   // the strollers' walking bob
        // Facing the way you are facing: what there is to see is his back.
        // The kit convention (faceMonk) is front = (sin ry, cos ry), so
        // facing along fwd is atan2(fwd.x, fwd.z) exactly — the previous
        // atan2(-fwd.z, fwd.x) + PI was that plus a quarter turn, and the
        // reader saw his profile, not his back.
        him.rotation.y = Math.atan2(fwd.x, fwd.z);

        // is he in the picture?
        ndc.copy(him.position);
        ndc.y = 1.0;
        ndc.project(camera);
        const inFrame = ndc.z > 0 && ndc.z < 1 && Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1;
        if (inFrame && !seen) glimpses++;
        seen = inFrame;

        // Caught out in the middle of the shot, he heads for the nearer edge —
        // the same thing he does when reached for, and for the same reason. He
        // holds the side he is already nearer to, so this never walks him ACROSS
        // the frame to reach the other margin.
        if (inFrame && Math.abs(ndc.x) < CENTRE_X) {
          margin = ndc.x >= 0 ? 1 : -1;
          leaving = true;
        }

        // OFF-FRAME IS THE ONLY PLACE HE IS ALLOWED TO MOVE UNNATURALLY, and
        // the wait is what guarantees it: he must be gone for REPLACE_WAIT
        // before he is put anywhere, so nothing ever jumps in view. He comes
        // back on the other margin — seeded off the placement count, never
        // Math.random, because the determinism rule covers him too.
        if (inFrame) { goneSince = 0; return; }
        goneSince += step;
        if (goneSince < REPLACE_WAIT) return;
        const flip = hash1(places, ID) < 0.72;      // usually the other edge, not always
        margin = flip ? -margin : margin;
        leaving = false;
        places++;
        goneSince = 0;
        // set down JUST off the frame, so what the reader sees is a man
        // stepping in at the margin rather than one appearing at it
        if (groundAt(margin * EDGE_X_OUT, EDGE_Y, want)) him.position.set(want.x, 0, want.z);
      },
      fragment() {
        return {
          glimpses,
          seen,
          caught,
          places,
          margin,
          lag: +clamp(him.position.distanceTo(want), 0, 99).toFixed(3),
        };
      },
      dispose() {},
    };
  },
};
