import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { INK, WASH, mixHex } from '../palette.js';
import { hash1 } from '../util/noise.js';

// A cave mouth in a rock face (case 2). Faceted lumps grown around an opening:
// two jambs for its sides, a brow overhanging it, a crown and shoulders behind
// so the whole thing reads as a hillside with a hole in it rather than a
// freestanding arch. Stands from y=0, opening faces +z.
//
// THE DARK. The opening is not a hole — it is a near-INK BOX set back behind
// the mouth. A box, deliberately: its cross-section is constant, so it covers
// the opening from every azimuth the camera can reach, and no lump of the rock
// mass behind it can ever surface inside the dark. A dodecahedron narrows
// toward its front face and lets the hillside show through at the corners,
// which is a hole that stops being a hole the moment the camera moves. In front
// of it, one lighter slab at the threshold: the step from lit stone to black is
// what actually reads as depth.

// The rock mass, in units of the cave's own box:
//   r  × height   sx/sy/sz scale   x × rIn   y × height   z × depth   tone→INK
// Once the throat actually went black it was obvious the MOUTH was too small:
// the dark showed as a letterbox slot at ground level, shorter than the fox
// standing in front of it. The jambs have moved apart and the brow has lifted,
// so the opening is now a standing arch a person could walk into — which is what
// makes the rest of the mass read as a hillside with a hole in it rather than a
// heap of boulders with a shadow under it. The loose boulders also moved out to
// the flanks; sitting near the mouth they just added to the heap.
// The mouth is FRAMED by the rock, not cut through it: the jambs stand just
// outside the throat's edges and the brow's underside caps it, so what shows is
// an arch rather than the front face of a black box. Getting this wrong is
// obvious in both directions — too tight and the dark is a letterbox slot at
// ankle height, too loose and the throat's whole face is exposed and reads as a
// wall. The loose boulders sit out on the flanks; near the mouth they only added
// to the heap.
const MASS = [
  ['jamb', 0.46, 0.80, 1.30, 1.05, -1.55, 0.34, -0.02, 0.10],
  ['jamb', 0.44, 0.85, 1.15, 1.00, 1.55, 0.30, 0.02, 0.22],
  ['brow', 0.34, 1.85, 0.52, 0.95, -0.05, 0.84, 0.05, 0.16],
  ['crown', 0.42, 1.35, 0.75, 1.10, 0.20, 0.96, -0.55, 0.06],
  ['shoulder', 0.50, 1.10, 1.05, 1.60, -1.95, 0.42, -1.15, 0.26],
  ['shoulder', 0.46, 1.05, 0.95, 1.50, 1.90, 0.36, -1.05, 0.13],
  ['bank', 0.58, 1.60, 0.95, 1.45, -0.15, 0.50, -2.10, 0.30],
  ['boulder', 0.20, 1.15, 0.75, 1.15, -2.30, 0.05, 0.70, 0.19],
  ['boulder', 0.15, 1.00, 0.70, 1.00, 2.25, 0.04, 0.62, 0.08],
];

export function makeCave({
  width = 2.4, height = 2.4, depth = 1.9, seed = 2, color = WASH.stone,
} = {}) {
  const g = new THREE.Group();
  g.name = 'cave';
  const rIn = width * 0.5;

  // The dark, first, so every lump of rock is drawn over it.
  //
  // UNLIT, and that is the whole trick. This was a washMaterial mixed 93% toward
  // INK and it still came out a mid grey: a lit material cannot be darker than
  // the light falling on it, and the hemisphere fill lifts everything off black.
  // Mixing further toward INK does nothing, because the mix is the surface
  // colour and the lighting happens afterwards. A cave mouth is not a dark
  // surface, it is an ABSENCE of light, so the honest material is one the lights
  // never touch. MeshBasicMaterial at flat INK is the darkest thing the book
  // owns, and it stays that way at every hour and every angle.
  // DEEPER, and set FURTHER BACK. The box used to reach depth*1.35 with its
  // front face only depth*0.25 behind the mouth, which put the dark almost in
  // the opening: there was nowhere inside to BE, so a figure meant to be
  // sitting in the cave either vanished into the box or perched on its lip
  // — the mouth read as a wall with no depth behind it. Longer, and its face
  // pushed
  // back to depth*0.62 behind the origin, so the mouth opens onto a room.
  const throat = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.85, height * 0.75, depth * 1.9),
    new THREE.MeshBasicMaterial({ color: INK }));
  throat.name = 'throat';
  throat.position.set(0, height * 0.34, -depth * 0.95);
  g.add(throat);

  // the threshold: stone the daylight still reaches, so the black behind it has
  // something to be darker than
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.88, height * 0.13, depth * 0.70),
    washMaterial({ color: mixHex(color, INK, 0.58), flat: true }));
  apron.name = 'apron';
  apron.position.set(0, height * 0.042, depth * 0.06);
  g.add(apron);

  const lumps = [];
  MASS.forEach(([name, r, sx, sy, sz, x, y, z, tone], i) => {
    const rad = r * height;
    const geo = new THREE.DodecahedronGeometry(rad, 0);
    // turn each lump before scaling it, so the facets never repeat and the
    // stated extents still hold
    geo.rotateY(hash1(i * 5 + 1, seed) * Math.PI * 2);
    geo.rotateZ((hash1(i * 5 + 2, seed) - 0.5) * 0.55);
    geo.scale(sx, sy, sz);
    const m = new THREE.Mesh(geo, washMaterial({
      color: mixHex(color, INK, tone + (hash1(i * 5 + 3, seed) - 0.5) * 0.10),
      flat: true,
    }));
    m.name = name;
    m.position.set(x * rIn, y * height, z * depth);
    g.add(m);
    lumps.push({ x: m.position.x, z: m.position.z, r: Math.max(rad * sx, rad * sz) });
  });

  // world-space circles over the rock, for the prop keepout. Rotation matters
  // here — the mass is much deeper than it is wide.
  const toWorld = (x, z, r, pad) => {
    const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
    return { x: g.position.x + x * c + z * s, z: g.position.z - x * s + z * c, r: r + pad };
  };
  g.footprint = (pad = 0.5) => lumps.map(({ x, z, r }) => toWorld(x, z, r, pad));

  // and the rock floor, for the grass mask — the only ground here that is
  // genuinely covered. Everything else grows right up to the stone.
  g.floor = (pad = 0.1) => [
    toWorld(0, depth * 0.30, rIn * 0.85, pad),
    toWorld(0, -depth * 0.55, rIn * 0.85, pad),
  ];

  return g;
}
