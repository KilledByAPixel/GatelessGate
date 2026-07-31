import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { INK, WASH } from '../palette.js';

// The folding fan (ōgi) — Ummon's answer in case 48, and a prop any figure can
// hold. An open paper sector on a short grip: the whole read is the wedge
// silhouette, so that is where all the geometry goes and nothing else gets any
// (THE DETAIL FLOOR, finger.js — ribs, guards and a rivet all live below what
// the case camera resolves).
//
// Two meshes, deliberately:
//   'fan-leaf'   — a CircleGeometry sector, one radial band per pleat. The rim
//                  vertices zigzag in z (the folds, which converge flat at the
//                  pivot exactly as real pleats do) and the fold valleys pull
//                  in a touch, so the outer edge is scalloped — that scallop is
//                  the one pleat cue that survives at six metres. A seeded
//                  per-rib wobble keeps the edge hand-cut rather than die-cut.
//                  DoubleSide and no outline: it is an open sheet, and the
//                  inverted hull doesn't suit one (same call as the flag's
//                  cloth and the bird's wing).
//   'fan-handle' — the closed grip below the pivot, outlined like any solid.
//
// The group origin is the BOTTOM OF THE GRIP — where the hand is — with the
// leaf opening along local +Y and its face toward local +Z, so posing it is:
// drop it in a cuff, aim +Y out along the sleeve, spin local Y to show the
// face. Fold state is not modelled: a closed fan is a stick, and the kit
// already has sticks.
export function makeFan({
  radius = 0.5,              // pivot to rim
  angle = Math.PI * 0.72,    // the open wedge, ~130 degrees, centred on +Y
  color = WASH.dry,          // the paper; the accent when the fan is the case's seal
  handleColor = INK,
  handleLen = 0.16,
  pleats = 12,               // radial bands; even, so both guard edges fold outward
  seed = 0,
} = {}) {
  const group = new THREE.Group();
  group.name = 'fan';
  group.userData.fan = { radius, angle, pleats };

  // the leaf: sector symmetric about +Y, pivot at the local origin
  const geo = new THREE.CircleGeometry(radius, pleats, Math.PI / 2 - angle / 2, angle);
  const pos = geo.attributes.position;
  const fold = radius * 0.045;
  for (let i = 1; i < pos.count; i++) {          // vertex 0 is the pivot: folds die there
    const ridge = (i - 1) % 2 === 0;             // ridge toward the face, valley away
    const wobble = 1 + (hash1(i, seed) - 0.5) * 0.05;
    const tuck = ridge ? 1 : 0.96;               // valleys pull in: the scalloped rim
    pos.setX(i, pos.getX(i) * wobble * tuck);
    pos.setY(i, pos.getY(i) * wobble * tuck);
    pos.setZ(i, ridge ? fold : -fold);
  }
  geo.computeVertexNormals();
  const leaf = new THREE.Mesh(geo,
    toonMaterial({ color, flat: true, side: THREE.DoubleSide }));
  leaf.name = 'fan-leaf';
  leaf.userData.noOutline = true;
  leaf.position.y = handleLen;
  group.add(leaf);

  // the grip: hand end at the group origin, pivot end under the leaf
  const handleGeo = new THREE.CylinderGeometry(0.028 * radius * 2, 0.034 * radius * 2, handleLen * 1.15, 6);
  handleGeo.translate(0, handleLen * 1.15 / 2, 0);   // base at the origin, sinks past the pivot
  const handle = new THREE.Mesh(handleGeo, toonMaterial({ color: handleColor, flat: true }));
  handle.name = 'fan-handle';
  group.add(handle);

  return group;
}
