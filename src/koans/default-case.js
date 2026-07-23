import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import { slugify } from './index.js';
import {
  composeWorld, makePath, makeLights, addOutlines,
} from '../kit/index.js';

// Every case in the book is readable, whether or not it has been staged yet.
//
// The text for all forty-nine is already generated and sitting in
// text/mumonkan.js — the only thing that ever gated them was the LOADERS table.
// So a case with no diorama of its own gets this: the shared world grammar and
// nothing else. No figures, no props, no staging. A place the koan has not been
// set in yet.
//
// It is seeded from the case's own id, so all forty-nine unstaged cases are
// DIFFERENT places rather than the same placeholder shown over and over —
// different mountains, a different forest, a path that wanders its own way.
// composeWorld already takes a seed, so this costs nothing and is the whole
// difference between "not built yet" and "a landscape waiting for its koan".
export function makeDefaultCase(id) {
  const entry = TEXT[id];
  if (!entry) return null;

  return {
    id,
    slug: slugify(entry.title),
    title: entry.title,
    accent: ACCENT,
    tier: 0,
    staged: false,          // the menu marks which cases have art of their own
    text: { case: entry.case, comment: entry.comment, verse: entry.verse },
    // unstaged cases are the bare hillsides the swells were designed for:
    // zero emitters, full drift
    ambience: ['wind:0.16', 'music'],
    // Sat back and lifted, unlike a staged case. There is no subject here to
    // close in on, and the standard diorama framing put the lens at knee height
    // in the grass with whatever tree happened to be nearest filling the frame.
    camera: { distance: 17, target: [0.6, 2.4, -2.0], azimuth: 0.62, polar: 1.16 },

    build(ctx) {
      const { audio } = ctx;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(PAPER);
      scene.fog = new THREE.FogExp2(PAPER, 0.030);
      scene.add(makeLights());

      // A trail through it, because an empty meadow reads as unfinished whereas
      // a meadow with a path through it reads as somewhere. Wander and endpoints
      // vary per case so no two look alike.
      const t = (id % 17) / 17;
      const path = makePath({
        from: [1.2 + t * 2.2 - 1.1, 9],
        to: [1.2 - t * 3.0, -32],
        width: 1.6,
        seed: id * 7 + 3,
        groundSeed: 21,
        wander: 0.8 + t * 1.6,
      });
      scene.add(path);

      const world = composeWorld(scene, {
        seed: id,
        groundSeed: 21,
        trees: 3 + (id % 4),
        keepout: [
          ...path.keepout(24, 1.1),
          // the lens sits over here and there is no staging to hide behind, so
          // keep the near ground clear rather than growing a tree into the shot
          { x: 3.0, z: 5.0, r: 6.0 },
        ],
        grassKeepout: path.keepout(24, 1.0),
      });

      addOutlines(scene, { width: 0.033, wobble: 0.7 });

      return {
        scene,
        setCamera() {},
        update(dt, simTime) { world.update(dt, simTime); },
        fragment() { return { staged: false, id }; },
        dispose() {},
      };
    },
  };
}
