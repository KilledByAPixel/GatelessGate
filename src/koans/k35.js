import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, wash } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeMoon, makeMonk,
  walkHeading, makeLights, makeBlobShadow, addOutlines,
} from '../kit/index.js';

const ID = 35;

// Seijo had two souls: one sick in bed at home, one away in the city, married,
// with two children. Goso asks which was the true one.
//
// The scene refuses to answer. There are two of her on the road between the
// house and the town, both faint, walking a slow figure that carries them
// apart and brings them back together; when they meet they overlap into one
// solid figure for a moment and then separate again. Neither is ever the
// brighter one. Neither is ever in front.
//
// Above it all, the moon from Mumon's verse — "The moon above the clouds is
// the same moon, the mountains and rivers below are all different" — which is
// the seal of the case and the only warm thing in the picture.

const CYCLE = 26;         // seconds for one full apart-and-together
const LANE = 0.4;         // each soul keeps to her own side of the width-1.4 road
                          // (k36's travellers do the same at 0.45 on a 1.6 road):
                          // they pass BESIDE each other now, never through

export default {
  id: ID,
  slug: 'two-souls',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.16', 'music'],
  // Close in, and low. Both of those sit OUTSIDE the rig's stock envelope
  // (minDist 7, maxPolar 1.45), so this frame has to widen the envelope as
  // well as name itself — the way k12 does for its gorge. Without that the
  // authored view holds on arrival and then dies at the reader's first
  // scroll notch or drag, which clamps into the stock range and can never
  // get back out: the composition would be reachable exactly once.
  camera: {
    distance: 5.5, target: [0.4, 1.8, -1.0], azimuth: -0.55, polar: 1.50,
    minDist: 4.5, maxDist: 11, maxPolar: 1.56,
  },

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
    home.position.set(4.6, 0, 2.6);
    home.rotation.y = -0.7;
    scene.add(home);

    const town = makeHut({ width: 3.0, height: 2.4, depth: 2.4 });
    town.position.set(-6.4, 0, -8.0);
    town.rotation.y = 0.5;
    scene.add(town);

    // THE MOON, standing beyond everything — plain now, not the seal (Frank):
    // the two souls carry the red, so the moon is just a pale disc.
    const moon = makeMoon({ radius: 2.9, color: wash(0.30), distance: 62 });
    scene.add(moon);

    // THE TWO OF HER — the seal. Both half-there and both red: which is the
    // true one is the case, so neither can be the solid or the coloured one
    // alone. The material is shared by construction.
    const souls = [];
    for (let i = 0; i < 2; i++) {
      const s = makeMonk({ height: 1.5, hat: false, color: ACCENT });
      s.name = 'soul';
      s.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.5;
        o.material.depthWrite = false;      // two ghosts must not punch holes in each other
      });
      scene.add(s);
      souls.push(s);
    }

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 5,
      keepout: [
        ...path.keepout(26, 1.4),
        { x: home.position.x, z: home.position.z, r: 2.8 },
        { x: town.position.x, z: town.position.z, r: 3.0 },
      ],
      grassKeepout: [
        ...path.keepout(28, 1.0),
        { x: home.position.x, z: home.position.z, r: 1.9 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [home.position, 1.9, 1.5, 0.30],
      [town.position, 2.0, 1.6, 0.24],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.030, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(9.0, 2.2, 4.0),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'souls-hit';
    hit.userData.noOutline = true;
    hit.position.set(0.0, 1.0, -1.0);
    scene.add(hit);

    // ---- the moment: which one is real -----------------------------------
    // Touching either of them pulls them together — the cycle jumps toward the
    // instant they overlap. It never resolves which one survives the meeting,
    // because there is only ever one figure standing there and then two again.
    let camera = null;
    let clock = 0;
    let phase = 0;              // drives the walk; advanced by dt, nudged by taps
    let pulls = 0;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      pulls++;
      // ease the phase toward the nearest meeting (phase 0 or 1 of the cycle)
      const target = Math.round(phase);
      phase += (target - phase) * 0.55;
      audio && audio.chimeStrike({ tube: 2, force: 0.4, at: hit.position });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        phase += Math.max(0, dt || 0) / CYCLE;

        // one separation parameter, applied symmetrically: they are always the
        // same distance from the meeting point, in opposite directions
        const sep = (1 - Math.cos(phase * Math.PI * 2)) * 0.5;      // 0 together, 1 apart
        for (const [i, s] of souls.entries()) {
          const lane = i === 0 ? 1 : -1;                             // her fixed side of the road
          const d = lane * sep * 3.4;
          const t = 0.5 + d * 0.055;                                 // along the road
          const p = path.sample(Math.max(0.02, Math.min(0.7, t)));
          // a little walk in them: a gait bob and a slight roll/yaw sway, so
          // they read as two people walking rather than two markers sliding
          // along a rail (Frank's note). Out of phase between the two.
          const gait = clock * 2.3 + i * Math.PI;
          // each keeps to her own side (Frank: once one's on one side, once
          // the other) — the meeting is two of her side by side, not a merge
          s.position.set(p.x + p.perp.x * LANE * lane, Math.abs(Math.sin(gait)) * 0.035, p.z + p.perp.z * LANE * lane);
          // face along the road, the way she goes when they separate — the
          // kit's walkHeading of her outbound travel (perp is (-dz, dx), so
          // the tangent is (perp.z, -perp.x)); this is the same atan2 the
          // case always had, named
          s.rotation.y = walkHeading(lane * p.perp.z, lane * -p.perp.x)
            + Math.sin(clock * 1.1 + i) * 0.06;
          s.rotation.z = Math.sin(gait) * 0.04;
          // where they meet, the pair reads as one whole person
          const solid = 0.5 + (1 - sep) * 0.42;
          s.traverse((o) => { if (o.isMesh && o.material) o.material.opacity = solid; });
        }
      },
      fragment() {
        return {
          pulls,
          apart: +((1 - Math.cos(phase * Math.PI * 2)) * 0.5).toFixed(4),
          gap: +souls[0].position.distanceTo(souls[1].position).toFixed(3),
        };
      },
      dispose() {},
    };
  },
};
