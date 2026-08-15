import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeBell, makeDrum, makeBowl,
  makeMonk, faceMonk, makeLights, tapMeshes,
} from '../kit/index.js';

const ID = 13;

// the bowl is held under Tokusan's own transform, so its world spot is not its
// .position — reused rather than allocated per tap
const scratchPos = new THREE.Vector3();

// Tokusan crossed the yard to dinner with his bowl in his hands, and the drum
// had not been beaten. So the scene is the monastery yard at exactly that
// moment: the hall behind, the bell on one side, the DRUM on the other, and
// Tokusan out in the middle holding a bowl he has no business holding yet.
//
// Both instruments answer a touch. Neither of them is the right one to sound —
// that is the case. Nothing tells you so. The framing. This case used to take
// the book's default shot implicitly, by naming no `camera:` at all. These are
// DEFAULT_HOME's own numbers, written out so the shot is tuned here like every
// other case's rather than by moving the book. composeWorld gets the same
// object as its `view`, so the scatter still refuses spots no reachable heading
// can see (kit/scenery.js).
const CAM = { distance: 11, target: [-1.4, 1.35, -1.2], heading: 31.5, pitch: 16.5 };

export default {
  id: ID,
  slug: 'tokusan-holds-his-bowl',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.14', 'bell', 'drum', 'music'],

  camera: CAM,

  build(ctx) {
    const { audio, input, touched } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights({ sun: { heading: 42, pitch: 42 } }));

    const path = makePath({ from: [-4.2, 8.0], to: [3.0, -18], width: 1.5, seed: ID, groundSeed: 21, wander: 0.9 });
    scene.add(path);

    const path2 = makePath({ from: [13, 2.0], to: [-15.0, -15], width: 1.5, seed: ID, groundSeed: 21, wander: 1.9 });
    scene.add(path2);

    // the dining hall he is walking to, too early
    const hall = makeHut({ width: 3.6, height: 2.5, depth: 2.8 });
    hall.position.set(-4.2, 0, -4.4);
    hall.rotation.y = 1.24;
    scene.add(hall);

    // the bell on one side of the yard — dark bronze, NOT the seal: the bowl
    // Tokusan carries is the one red thing here, and the bell was competing
    // with it. It still swings and rings when struck.
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
    // bowl, and the elder's staff was colliding with it: a man carrying his
    // bowls to dinner is not also carrying a stick.
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
      view: CAM,
      seed: ID+1,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.3),
        ...path2.keepout(24, 1.3),
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
        ...path2.keepout(26, 0.9),
        { x: hall.position.x, z: hall.position.z, r: 2.1 },
        { x: -4.5, z: 0.4, r: 1.1 },
        { x: 1.9, z: -0.4, r: 0.8 },
      ],
    });

    // ---- the moment: two instruments, neither of them the answer ----------
    // AND THE BOWL, which is the third thing and the only red one. It was the
    // seal of the case and the one object here you could not touch. Touched, it
    // answers as the
    // empty piece of fired clay it is, and Tokusan turns back the way he came
    // — which is what he actually did: the bell had not rung, the drum had not
    // sounded, and he went back to his room. He settles again afterwards,
    // because the case is not resolved by his going and he will be back.
    // Radians off Seppo, at the peak. NEGATIVE: turning the other way swung him
    // to show the reader his back, and the whole point of the beat is watching
    // him decide to go, so he turns toward the reader rather than away.
    const BOWL_TURN = -Math.PI / 2;   // a square quarter-turn: he shows the reader his side
    const TURN_OUT = 0.55, TURN_HOLD = 0.9, TURN_BACK = 1.9;
    const TURN_SPAN = TURN_OUT + TURN_HOLD + TURN_BACK;
    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    function turnShape(u) {
      if (!(u >= 0) || u >= TURN_SPAN) return 0;
      if (u < TURN_OUT) return ease(u / TURN_OUT);
      if (u < TURN_OUT + TURN_HOLD) return 1;
      return 1 - ease((u - TURN_OUT - TURN_HOLD) / TURN_BACK);
    }
    const AT_SEPPO = tokusan.rotation.y;
    const bowlMeshes = tapMeshes(bowl);
    let turnAt = -99;
    let turns = 0;

    let camera = null;
    let clock = 0;
    let rings = 0;
    // The bell had no tap cooldown, so a held pointer could stack audio.bell()
    // calls without limit — k49's idiom. The drum has none on purpose and
    // still does not (kit/drum.js): it is the one voice you are meant to be
    // able to beat as fast as you can hit it.
    let lastRing = -99;

    input.onTap(() => {
      if (!camera) return;
      // the bowl first: it is small, it is held out in front of a figure who
      // stands between the two instruments, and it must never lose a tap to
      // one of the big forgiving pick volumes either side of him
      if (input.raycastFirst(camera, bowlMeshes)) {
        if (clock - turnAt < TURN_SPAN) return;      // let him finish going back
        touched && touched();
        turnAt = clock;
        turns++;
        // fired clay, empty — k7's bowl and k40's vase are the precedent
        audio && audio.ceramic({ force: 0.55, at: bowl.getWorldPosition(scratchPos) });
        return;
      }
      // The drum is not handled here any more. It answers wherever it stands,
      // from the kit (kit/drum.js) through main's own tap, the way a hung chime
      // does — so the second drum in the book stopped being scenery. Nothing
      // was lost by it: the bowl and the drum sit a third of the frame apart
      // and neither one's ray reaches the other, so the bowl-first rule above
      // still holds even though main's handler runs before this one.
      if (input.raycastFirst(camera, bell.pickTargets())) {
        if (clock - lastRing < 0.5) return;
        // no touched() — "Tokusan holds his BOWL", and the bowl is above
        lastRing = clock;
        bell.strike();
        rings++;
        // the monastery bell — task-12's migration to the tuned presets
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
        // he turns back the way he came, and comes round again
        tokusan.rotation.y = AT_SEPPO + BOWL_TURN * turnShape(clock - turnAt);
      },
      fragment() {
        return {
          rings,
          beats: drum.beats(),
          turns,
          turned: +turnShape(clock - turnAt).toFixed(4),
          swing: +bell.swinging().toFixed(4),
          skin: +drum.ringing().toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
