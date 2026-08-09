import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_LIGHT, mixHex } from '../palette.js';
import { clamp01 } from '../util/math.js';
import {
  composeWorld, makePath, makeHut, makeOak, makeMoon, makeMonk, faceMonk,
  makeLights, addOutlines,
} from '../kit/index.js';

const ID = 27;

// "Is there a teaching no master ever preached before?" — "Yes." — "What is
// it?" — "It is not mind, it is not Buddha, it is not things."
//
// Nansen answers by naming three things and taking all three away, and Mumon
// says he gave away his treasure-words and must have been greatly upset. So
// the scene is built to be taken away: a hall, a tree, a moon — the three
// things any ink painting of this kind would have — and touching one removes
// it. Remove all three and you are looking at paper, fog, and the ground,
// which is the answer stated as a picture.
//
// Touch the empty ground and they come back, because the case is a sentence
// somebody said once, not a state you are meant to reach and hold.

const GONE = 1.6;         // seconds to leave
const ease = (k) => k * k * (3 - 2 * k);
// each thing's hit box is nested under its own group (hallGroup/treeGroup/
// moonGroup), so its local position is not its world position — one scratch
// vector, reused across all three
const scratchPos = new THREE.Vector3();

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 13.0, target: [0.4, 2.2, -1.4], heading: 31.5, pitch: 22.4 };
  export default {
  id: ID,
  slug: 'it-is-not-mind-it-is-not-buddha-it-is-not-things',
  title: TEXT[ID].title,
  accent: ACCENT_LIGHT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.18', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  // EXPERIMENT (Frank): a red sky for the erasing case. The one scene where
  // you take the world apart until only the page is left gets a page that is
  // already tinted — so the paper you are left with is a warm red rather than
  // white. The paper post pass multiplies, so this composites fine.
  const SKY = mixHex(PAPER, ACCENT, 0.42);
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.FogExp2(SKY, 0.028);
  scene.add(makeLights());
  
  const path = makePath({ from: [4.6, 8.2], to: [2.1, -18.9], width: 1.4, seed: ID, groundSeed: 21, wander: 0.9 });
  scene.add(path);
  
  // ---- the three things -------------------------------------------------
  // Each sits in its own group so it can be lifted out whole, and each has a
  // way of going that suits what it is: the built things sink into the
  // ground they were standing on, and the moon — which was never standing on
  // anything — simply stops being there.
  
  const hallGroup = new THREE.Group();
  hallGroup.name = 'the-hall';
  const hall = makeHut({ width: 3.4, height: 2.6, depth: 2.8 });
  hall.position.set(-2.2, 0, -4.4);
  hall.rotation.y = 0.44;
  hallGroup.add(hall);
  scene.add(hallGroup);
  
  const treeGroup = new THREE.Group();
  treeGroup.name = 'the-tree';
  const oak = makeOak({ height: 5.2, seed: ID });
  const oakRoot = oak.group || oak;
  const TREE = { x: 2.0, z: -4.6 };      // moved clear of the path (Frank: it stood in the road)
  oakRoot.position.set(TREE.x, 0, TREE.z);
  // Turn the hero limb AWAY from the home lens (Frank: "what's going on with
  // the weird tree branch?"). Seed 27 grows its long low bough at local
  // bearing 2.50 rad, which the home camera (heading 31.5) saw end-on: a bare
  // foreshortened limb with a knuckle, jutting at the hall like an arm. At
  // this yaw the bough reaches directly behind the crown, so from the whole
  // reachable arc the tree reads as one heavy mass over its trunk.
  oakRoot.rotation.y = 4.62;
  treeGroup.add(oakRoot);
  scene.add(treeGroup);
  
  const moonGroup = new THREE.Group();
  moonGroup.name = 'the-moon';
  const moon = makeMoon({ radius: 3.0, color: ACCENT_LIGHT, distance: 60 });
  moonGroup.add(moon);
  scene.add(moonGroup);
  
  // the monk who asked, left standing in whatever is left
  const monk = makeMonk({ height: 1.58 });
  monk.position.set(1.0, 0, 2.6);
  faceMonk(monk, { x: -2.2, z: -4.4 });
  scene.add(monk);
  
  // Nansen, who is about to do this to him
  const nansen = makeMonk({ height: 1.66, elder: true });
  nansen.position.set(-1.0, 0, 1.2);
  faceMonk(nansen, monk.position);
  scene.add(nansen);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 3,
  keepout: [
  ...path.keepout(24, 1.2),
  { at: hall, r: 3.2 },
  { x: TREE.x, z: TREE.z, r: 3.0 },
  { at: monk, r: 1.2 },
  { at: nansen, r: 1.2 },
  ],
  grassKeepout: [
  ...path.keepout(24, 0.95),
  { at: hall, r: 2.1 },
  ],
  });
  
  addOutlines(scene, { width: 0.033, wobble: 0.7 });
  
  // ---- targets ----------------------------------------------------------
  const mkHit = (name, x, y, z, w, h, d, parent) => {
  const m = new THREE.Mesh(
  new THREE.BoxGeometry(w, h, d),
  new THREE.MeshBasicMaterial({ visible: false }));
  m.name = name;
  m.userData.noOutline = true;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};
    const hallHit = mkHit('hall-hit', -2.2, 1.3, -4.4, 4.0, 2.8, 3.4, hallGroup);
    const treeHit = mkHit('tree-hit', TREE.x, 2.6, TREE.z, 3.6, 5.2, 3.6, treeGroup);
    // the moon is 60 units out; its target is a panel hung in front of it on
    // the same bearing, sized so it covers the disc from the reachable arc
    const moonWorld = new THREE.Vector3();
    moon.getWorldPosition(moonWorld);
    const moonHit = mkHit('moon-hit', moonWorld.x, moonWorld.y, moonWorld.z, 9, 9, 9, moonGroup);
    moonHit.lookAt(0, 2, 0);

    // and the ground itself, which is what is left
    const groundHit = mkHit('ground-hit', 0.4, 0.02, 0.4, 26, 0.2, 26, scene);

    // ---- the moment: take them away --------------------------------------
    const THINGS = [
      { group: hallGroup, hit: hallHit, sink: 4.2, at: -99, gone: false },
      { group: treeGroup, hit: treeHit, sink: 6.4, at: -99, gone: false },
      { group: moonGroup, hit: moonHit, sink: 0, at: -99, gone: false, fade: moon },
    ];
    if (moon.material) { moon.material.transparent = true; }

    let camera = null;
    let clock = 0;
    let removed = 0;
    let restoredAt = -99;

    input.onTap(() => {
      if (!camera) return;
      for (const t of THINGS) {
        if (t.gone) continue;
        if (!input.raycastFirst(camera, [t.hit])) continue;
        t.at = clock;
        t.gone = true;
        removed++;
        // each thing goes with a lower, softer sound than the last, until
        // there is nothing left to make one
        audio && audio.chimeStrike({
          tube: Math.min(4, removed), force: 0.6 - removed * 0.12,
          at: t.hit.getWorldPosition(scratchPos),
        });
        return;
      }
      // touching what is left brings them back
      if (removed > 0 && input.raycastFirst(camera, [groundHit])) {
        restoredAt = clock;
        for (const t of THINGS) { t.gone = false; t.at = -99; }
        removed = 0;
        audio && audio.chimeStrike({ tube: 0, force: 0.5, at: groundHit.position });
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);

        for (const t of THINGS) {
          // leaving, or coming back from wherever it went
          const leaving = t.gone ? clamp01((clock - t.at) / GONE) : 0;
          const returning = (!t.gone && restoredAt > -99) ? clamp01((clock - restoredAt) / GONE) : 1;
          const away = t.gone ? ease(leaving) : 1 - ease(returning);
          if (t.fade) {
            t.fade.material.opacity = 1 - away;
            t.group.visible = away < 0.999;
          } else {
            t.group.position.y = -t.sink * away;
            t.group.visible = away < 0.999;
          }
        }
      },
      fragment() {
        return {
          removed,
          standing: THINGS.length - removed,
          empty: removed === THINGS.length,
        };
      },
      dispose() {},
    };
  },
};
