import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeBell, makeDrum, makeBowl,
  makeMonk, faceMonk, makeLights, addOutlines,
} from '../kit/index.js';

const ID = 13;

// Tokusan crossed the yard to dinner with his bowl in his hands, and the drum
// had not been beaten. So the scene is the monastery yard at exactly that
// moment: the hall behind, the bell on one side, the DRUM on the other, and
// Tokusan out in the middle holding a bowl he has no business holding yet.
//
// Both instruments answer a touch. Neither of them is the right one to sound —
// that is the case. Nothing tells you so.
export default {
  id: ID,
  slug: 'tokusan-holds-his-bowl',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.14', 'bell', 'drum', 'music'],

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    const path = makePath({ from: [-4.2, 8.0], to: [3.0, -18], width: 1.5, seed: ID, groundSeed: 21, wander: 0.9 });
    scene.add(path);

    // the dining hall he is walking to, too early
    const hall = makeHut({ width: 3.6, height: 2.5, depth: 2.8 });
    hall.position.set(-4.2, 0, -4.4);
    hall.rotation.y = 1.24;
    scene.add(hall);

    // the bell on one side of the yard — dark bronze, NOT the seal: the bowl
    // Tokusan carries is the one red thing here (Frank's note: the bell was
    // competing with it). It still swings and rings when struck.
    const bell = makeBell({ height: 0.95, seed: ID, color: WASH.mid });
    bell.group.position.set(1.9, 0, -0.4);
    bell.group.rotation.y = 0.7;
    scene.add(bell.group);

    // ...and the drum on the other, its near head turned toward the yard
    const drum = makeDrum({ radius: 0.5, seed: ID });
    drum.group.position.set(-4.5, 0, 0.4);
    drum.group.rotation.y = -1.75;
    scene.add(drum.group);

    // TOKUSAN, mid-yard, holding the bowl. The bowl is the seal: it is the one
    // thing in the scene that is out of time. No staff — both hands are on the
    // bowl, and the elder's staff was colliding with it (Frank): a man carrying
    // his bowls to dinner is not also carrying a stick.
    const tokusan = makeMonk({ height: 1.64, pose: 'fold' });
    tokusan.position.set(-2.8, 0, -0.5);
    const bowl = makeBowl({ radius: 0.16, color: ACCENT });
    bowl.name = 'held-bowl';
    bowl.position.set(0.0, 0.52, .36);           // held out before him at the waist, clear of the robe
    tokusan.add(bowl);
    scene.add(tokusan);

    // Seppo on duty at the hall door, who is about to ask him where he is going
    const seppo = makeMonk({ height: 1.58, stout: 1.04 });
    const front = { x: Math.sin(hall.rotation.y), z: Math.cos(hall.rotation.y) };
    seppo.position.set(hall.position.x + front.x * 2.5, 0, hall.position.z + front.z * 2.5);
    faceMonk(seppo, tokusan.position);
    scene.add(seppo);
    faceMonk(tokusan, seppo.position);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.3),
        { x: hall.position.x, z: hall.position.z, r: 3.5 },
        // { at } rather than copied coordinates: these two circles used to be
        // the bell's and drum's OLD positions, left behind when the pair
        // swapped sides — the keepouts guarded empty grass while the bell
        // stood unprotected. The live reference cannot go stale.
        { at: bell.group, r: 1.9 },
        { at: drum.group, r: 1.7 },
        { at: tokusan, r: 1.2 },
        { x: seppo.position.x, z: seppo.position.z, r: 1.1 },
      ],
      grassKeepout: [
        ...path.keepout(26, 0.9),
        { x: hall.position.x, z: hall.position.z, r: 2.1 },
        { x: -4.5, z: 0.4, r: 1.1 },
        { x: 1.9, z: -0.4, r: 0.8 },
      ],
    });

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: two instruments, neither of them the answer ----------
    let camera = null;
    let clock = 0;
    let rings = 0, beats = 0;
    // CODE REVIEW CAUGHT (Task 5C): the bell had no tap cooldown, so a held
    // pointer could stack audio.bell() calls without limit — k49's idiom
    // (`clock - lastRing > 0.5`). The drum is the membrane voice
    // (audio.drum), still uncooldowned on purpose.
    let lastRing = -99;

    input.onTap(() => {
      if (!camera) return;
      if (input.raycastFirst(camera, drum.pickTargets())) {
        drum.strike();
        beats++;
        audio && audio.drum({ force: 1, at: drum.group.position });     // the dinner drum, beaten at last
        return;
      }
      if (input.raycastFirst(camera, bell.pickTargets())) {
        if (clock - lastRing < 0.5) return;
        lastRing = clock;
        bell.strike();
        rings++;
        // the monastery bell — task-12's migration to Frank's tuned presets
        audio && audio.bell({ preset: 'temple', at: bell.group.position });
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        bell.update(dt, simTime);
        drum.update(dt, simTime);
      },
      fragment() {
        return {
          rings,
          beats,
          swing: +bell.swinging().toFixed(4),
          skin: +drum.ringing().toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
