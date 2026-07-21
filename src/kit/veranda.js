import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';

// An open hall veranda: a raised timber floor with a post-and-beam opening
// across its front and a shallow eave over it. The OPENING is the point — case
// 26 hangs a screen in it, and the country shows through when the screen goes
// up — so there are no walls and nothing closes the bay but the screen itself.
//
// Local frame: the post line (the opening) stands at z = 0 and the floor runs
// back to +z. Place the group at the front edge and everything behind it is
// interior.
export function makeVeranda({
  width = 4.8, depth = 4.4, height = 3.3, deck = 0.34,
  color = WASH.dark, floorColor = WASH.stone,
} = {}) {
  const g = new THREE.Group();
  g.name = 'veranda';
  const mat = toonMaterial({ color });
  const flat = toonMaterial({ color, flat: true });

  const boardT = Math.min(0.24, deck * 0.7);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width, boardT, depth),
    toonMaterial({ color: floorColor, flat: true }));
  floor.name = 'floor';
  floor.position.set(0, deck - boardT / 2, depth / 2);
  g.add(floor);

  // stub piers, so the floor reads as raised boards rather than a poured slab
  const pierH = Math.max(0.06, deck - boardT);
  for (const sx of [-1, 1]) for (const sz of [0.7, depth - 0.7]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.34, pierH, 0.34), flat);
    pier.name = 'pier';
    pier.position.set(sx * (width / 2 - 0.55), pierH / 2, sz);
    g.add(pier);
  }

  // the two posts carry the beam; they run past the floor to the ground
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, height, 10), mat);
    post.name = 'post';
    post.position.set(sx * width / 2, height / 2, 0);
    g.add(post);
  }

  const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.55, 0.20, 0.30), flat);
  beam.name = 'beam';
  beam.position.set(0, height - 0.10, 0);
  g.add(beam);

  // one board of roof, tipped so the lip drops toward the garden. Enough eave to
  // frame the shot from underneath without putting a slab over the scene.
  const eave = new THREE.Mesh(new THREE.BoxGeometry(width + 0.95, 0.09, 0.95), flat);
  eave.name = 'eave';
  eave.position.set(0, height + 0.08, -0.14);
  eave.rotation.x = -0.14;
  g.add(eave);

  g.userData.deck = deck;

  // The floor's footprint as circles — a GRASS mask, since nothing grows up
  // through boards. The props keepout wants something more generous than this.
  g.footprint = (r = 0.95, cols = 5, rows = 4) => {
    const out = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        out.push({
          x: g.position.x - width / 2 + (width * (i + 0.5)) / cols,
          z: g.position.z + (depth * (j + 0.5)) / rows,
          r,
        });
      }
    }
    return out;
  };
  return g;
}
