import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, WASH, wash } from '../palette.js';
import { hash1 } from '../util/noise.js';
import {
  composeWorld, makePath, makeMonk, aimMonk, makeStall, makeHorse,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
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
// And he is in it, standing behind you. Not hidden somewhere clever — behind
// the camera, continuously, wherever the camera goes. He is facing the same way
// you are, so what there is to see is his back.
//
// He LAGS, and that is the whole mechanic. Orbit slowly and he keeps station
// out of frame. Swing the camera round quickly and he cannot get out of the
// way in time, and for a second or so he is there at the edge of the picture,
// walking away, before he slides out again. You can do it as often as you
// like. You never get in front of him.

const LAG = 1.15;          // e-folding rate of his keeping-up, per second
const BEHIND = 4.2;        // how far back he stands
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export default {
  id: ID,
  slug: 'who-is-he',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.22', 'music'],
  camera: { distance: 11.0, target: [0.4, 1.5, -0.6], azimuth: 0.55, polar: 1.24 },

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
    const shadows = [];       // {x, z, rx, rz, op} gathered, added after composeWorld
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
      shadows.push({ x: sx, z: sz, rx: s.w * 0.6, rz: 0.9, op: 0.26 });

      // a keeper a step behind the counter, facing the lane — but the last
      // stall is left unattended, which reads as a real market (and keeps the
      // draw budget honest with a crowd still to place)
      if (i < 2) {
        const back = 0.5;
        const kx = sx - faceX / Math.hypot(faceX, faceZ) * back;
        const kz = sz - faceZ / Math.hypot(faceX, faceZ) * back;
        const keeper = makeMonk({ height: 1.5 + hash1(i, ID) * 0.1, hat: hash1(i + 3, ID) > 0.5, stout: 1.05 });
        keeper.position.set(kx, 0, kz);
        aimMonk(keeper, { x: p.x, z: p.z });
        scene.add(keeper);
        keepers.push(keeper);
        stallKeepout.push({ x: kx, z: kz, r: 0.7 });
        shadows.push({ x: kx, z: kz, rx: 0.5, rz: 0.42, op: 0.34 });
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
    shadows.push({ x: cx, z: cz, rx: 0.5, rz: 0.42, op: 0.34 });

    // two people strolling the lane, driven along the road in update(). Their
    // motion is a closed form over simTime, so the street is alive but replays.
    const walkers = [
      { monk: makeMonk({ height: 1.6 }), t0: 0.18, t1: 0.74, rate: 0.045, phase: 0.0, dir: 1, lane: 0.55 },
      { monk: makeMonk({ height: 1.54, elder: true }), t0: 0.20, t1: 0.70, rate: 0.037, phase: 0.5, dir: -1, lane: -0.5 },
    ];
    for (const w of walkers) {
      const sh = makeBlobShadow({ radiusX: 0.5, radiusZ: 0.42, opacity: 0.34 });
      sh.position.y = 0.01;
      w.monk.add(sh);                 // travels with the walker
      scene.add(w.monk);
    }

    // A few more people standing about the street between the stalls (Frank: it
    // is a busy street). These are the cheap kind — a robe and a head, no arms —
    // because a full monk is ten draws and the crowd would blow the budget; at
    // this distance, among the stalls, two strokes read as a person.
    const bystander = (x, z, facing, h = 1.56, tone = 0.14) => {
      const f = new THREE.Group();
      f.name = 'bystander';
      const robe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10 * h, 0.20 * h, 0.7 * h, 7),
        toonMaterial({ color: wash(tone), flat: true }));
      robe.position.y = 0.35 * h;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.095 * h, 8, 6),
        toonMaterial({ color: WASH.deep, flat: true }));
      head.position.y = 0.78 * h;
      f.add(robe, head);
      f.position.set(x, 0, z);
      f.rotation.y = facing;
      return f;
    };
    // dotted along both sides of the lane, in the gaps between the stalls
    const crowd = [
      bystander(road.sample(0.38).x - 1.4, road.sample(0.38).z + 0.3, 1.2, 1.6, 0.12),
      bystander(road.sample(0.52).x + 1.5, road.sample(0.52).z - 0.2, -1.9, 1.5, 0.18),
      bystander(road.sample(0.7).x - 1.2, road.sample(0.7).z + 0.1, 0.6, 1.62, 0.1),
    ];
    for (const c of crowd) scene.add(c);

    // THE HORSE — the case's one red thing, standing tethered by the first
    // stall. The verse says "Do not ride another's horse," so here is the horse
    // you are not to ride, and it is the only warm mark in the whole street.
    // A larger red than a held seal, so it takes the deep mix rather than
    // glaring full accent across a whole animal.
    const horse = makeHorse({ height: 1.5, color: ACCENT_DEEP, seed: ID });
    const hp = road.sample(0.30);
    const horseX = hp.x + hp.perp.x * 1.6;      // just off the road by the first stall
    const horseZ = hp.z + hp.perp.z * 1.6;
    horse.group.position.set(horseX, 0, horseZ);
    horse.group.rotation.y = Math.atan2(hp.perp.x, hp.perp.z) + 0.4;   // side-on to the lane
    scene.add(horse.group);
    shadows.push({ x: horseX, z: horseZ, rx: 1.0, rz: 0.5, op: 0.3 });

    // HIM. Placed in the first frame at a plausible spot, then handed over to
    // the camera for the rest of his existence.
    const him = makeMonk({ height: 1.66 });
    him.name = 'him';
    him.position.set(2.0, 0, 6.0);
    scene.add(him);

    const world = composeWorld(scene, {
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

    // the stall and standing-figure shadows gathered above, laid now
    for (const s of shadows) {
      const sh = makeBlobShadow({ radiusX: s.rx, radiusZ: s.rz, opacity: s.op });
      sh.position.set(s.x, 0.01, s.z);
      scene.add(sh);
    }

    // his shadow travels with him, so it is parented to him rather than laid
    // on the ground where he happened to start
    const shadow = makeBlobShadow({ radiusX: 0.66, radiusZ: 0.5, opacity: 0.36 });
    shadow.position.y = 0.01;
    him.add(shadow);

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 1.9, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'him-hit';
    hit.userData.noOutline = true;
    hit.position.y = 0.95;
    him.add(hit);

    // ---- the moment: turn round ------------------------------------------
    let camera = null;
    let clock = 0;
    let glimpses = 0;
    let seen = false;
    let caught = 0;
    let lastChime = -99;

    const fwd = new THREE.Vector3();
    const want = new THREE.Vector3();
    const ndc = new THREE.Vector3();

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      caught++;
      if (clock - lastChime > 0.6) {
        lastChime = clock;
        // you did not catch him. Something sounds a long way off.
        audio && audio.chimeStrike({ tube: 0, force: 0.3 });
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
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

        // where "behind you" is, right now
        camera.getWorldDirection(fwd);
        fwd.y = 0;
        if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
        fwd.normalize();
        want.copy(camera.position).addScaledVector(fwd, -BEHIND);
        want.y = 0;
        // ...but never out in the mountains
        const r = Math.hypot(want.x, want.z);
        if (r > 16) { want.x *= 16 / r; want.z *= 16 / r; }

        // he keeps up, but not quite
        const k = 1 - Math.exp(-LAG * step);
        him.position.x += (want.x - him.position.x) * k;
        him.position.z += (want.z - him.position.z) * k;
        // facing the way you are facing: what there is to see is his back
        him.rotation.y = Math.atan2(-fwd.z, fwd.x) + Math.PI;

        // did that put him in the picture?
        ndc.copy(him.position);
        ndc.y = 1.0;
        ndc.project(camera);
        const inFrame = ndc.z > 0 && ndc.z < 1 && Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1;
        if (inFrame && !seen) glimpses++;
        seen = inFrame;
      },
      fragment() {
        return {
          glimpses,
          seen,
          caught,
          lag: +clamp(him.position.distanceTo(want), 0, 99).toFixed(3),
        };
      },
      dispose() {},
    };
  },
};
