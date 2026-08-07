import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeMonk, faceMonk, makeDog,
  makeLights, makeBlobShadow, addOutlines,
} from '../kit/index.js';

const ID = 1;
const FOG_BASE = 0.030;
const FOG_MU = 0.235;    // thick enough to swallow the world whole
const MU_DUR = 4.4;      // seconds for the full breath

export default {
  id: ID,
  slug: 'joshu-s-dog',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.18', 'music'],

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, FOG_BASE);
    scene.add(makeLights());

    const path = makePath({ from: [1.2, 9], to: [1.2, -34], width: 1.7, seed: 13, groundSeed: 21, wander: 1.1 });
    scene.add(path);

    // Old Joshu sits off the road; the monk stands before him with the question.
    const mp = path.sample(0.19);
    const joshu = makeMonk({ pose: 'sit', elder: true, height: 1.72 });
    joshu.position.set(mp.x - mp.perp.x * 1.45, 0, mp.z - mp.perp.z * 1.45);
    faceMonk(joshu, { x: mp.x + mp.perp.x * 1.3, z: mp.z + mp.perp.z * 1.3 });

    const monk = makeMonk({ height: 1.6 });
    monk.position.set(mp.x + mp.perp.x * 0.85, 0, mp.z + mp.perp.z * 0.85);
    faceMonk(monk, joshu.position);
    scene.add(joshu, monk);

    // The dog: nearer the camera than anything else, and — alone in the scene —
    // unfogged, so when the world is swallowed it is what remains.
    const dog = makeDog({ height: 0.6, color: ACCENT });   // the seal of this koan
    const dp = path.sample(0.145);          // near the pair, inside the shared camera's frame
    dog.position.set(dp.x + dp.perp.x * 1.7, 0, dp.z + dp.perp.z * 1.7);
    dog.rotation.y = dp.heading + 1.4;      // looking back up the road at them
    dog.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.fog = false;
    });
    scene.add(dog);

    const world = composeWorld(scene, {
      seed: 1,
      groundSeed: 21,
      keepout: [
        ...path.keepout(26, 1.1),
        { x: mp.x, z: mp.z, r: 2.6 },
        { x: dog.position.x, z: dog.position.z, r: 1.0 },
      ],
      grassKeepout: path.keepout(26, 1.0),   // Joshu and the dog sit in the grass
    });

    for (const [p, rx, rz, op] of [
      [joshu.position, 0.75, 0.6, 0.42],
      [monk.position, 0.65, 0.5, 0.42],
      [dog.position, 0.5, 0.32, 0.34],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.035, wobble: 0.7 });

    // ---- the moment: Mu -------------------------------------------------
    // Touch the dog and the world empties. The fog swells until every tree,
    // mountain and figure is gone into the paper, holds a beat, then breathes
    // back. Nothing is announced; you either find it or you don't.
    let camera = null;
    let muPhase = -1;      // -1 idle, otherwise seconds elapsed
    let mu = 0;            // 0..1 how far the world has gone

    function dogMeshes() {
      const out = [];
      dog.traverse((o) => { if (o.isMesh && !o.userData.isOutline) out.push(o); });
      return out;
    }
    const hitTargets = dogMeshes();

    input.onTap(() => {
      if (!camera || muPhase >= 0) return;
      const hit = input.raycastFirst(camera, hitTargets);
      if (!hit) return;
      muPhase = 0;
      // Not a strike — nothing here is touched. The world thins away and
      // comes back, and the sound is that shape: one long breath over the
      // whole gesture. There was no voice in the palette that was not an
      // impact, which is why this case was silent for so long.
      audio && audio.breath({ force: 0.8, dur: MU_DUR * 0.8, at: hit.point });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        world.update(dt, simTime);
        if (muPhase >= 0) {
          muPhase += dt;
          const t = muPhase / MU_DUR;
          if (t >= 1) { muPhase = -1; mu = 0; }
          else if (t < 0.36) mu = t / 0.36;             // the world thins away
          else if (t < 0.56) mu = 1;                     // nothing
          else mu = 1 - (t - 0.56) / 0.44;               // and returns
          const e = mu * mu * (3 - 2 * mu);
          scene.fog.density = FOG_BASE + (FOG_MU - FOG_BASE) * e;
        }
      },
      fragment() {
        return { mu: +mu.toFixed(4), fog: +scene.fog.density.toFixed(4) };
      },
      dispose() {},
    };
  },
};
