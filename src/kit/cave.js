import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { INK, WASH, mixHex } from '../palette.js';
import { hash1 } from '../util/noise.js';

// A cave mouth in a rock face (case 2). Faceted lumps grown around an opening:
// two jambs for its sides, a brow overhanging it, a crown and shoulders behind
// so the whole thing reads as a hillside with a hole in it rather than a
// freestanding arch. Stands from y=0, opening faces +z.
//
// THE DARK. The opening is not a hole — it is an unlit INK PRISM running back
// from the mouth. A prism, deliberately: its cross-section is constant, so it
// covers the opening from every azimuth the camera can reach, and no lump of
// the rock mass behind it can ever surface inside the dark. A dodecahedron
// narrows toward its front face and lets the hillside show through at the
// corners, which is a hole that stops being a hole the moment the camera moves.
//
// NOT A DOORWAY. The prism's cross-section is the mouth's outline wherever the
// rock does not happen to cover its edge, so that section has to be a shape
// rock makes. As a rectangle, with a box for a threshold and the jambs standing
// plumb either side, the cave read as a doorway built into boulders. Three
// things undo it, and each is needed: the section is a lopsided arch (MOUTH);
// the jambs LEAN over it, each by its own amount, so the rock closes toward the
// top the way the dark does; and the threshold is a worn slab that spreads into
// the ground, with no vertical face and no straight front edge.

// The mouth's outline: x in widths, y in heights from the ground, anticlockwise
// from the left foot. Widest at the ground, where it runs out behind the jambs'
// feet; the left side climbs steeply and the right breaks at a shoulder, so the
// peak stands off the centre line and no height has a mirror-image pair. The
// foot is below ground so the dark never shows a bottom edge.
const MOUTH = [
  [-0.52, -0.035], [0.50, -0.035],
  [0.46, 0.20], [0.37, 0.40], [0.21, 0.52], [0.13, 0.66],
  [-0.05, 0.735],
  [-0.23, 0.67], [-0.34, 0.50], [-0.41, 0.27],
];
// how far a seed moves each point of the outline above the ground, in the
// outline's own units — enough that two caves are not the same hole, not
// enough to undo the arch
const MOUTH_JITTER = 0.03;

// The rock mass, in units of the cave's own box:
//   r  × height   sx/sy/sz scale   x × rIn   y × height   z × depth   tone→INK
//   lean (x per unit y)   tip (y per unit x)
// The mouth has to be a standing arch a person could walk into: with the dark
// showing as a letterbox slot at ground level, shorter than the fox in front of
// it, the mass read as a heap of boulders with a shadow under it rather than a
// hillside with a hole in it.
// The mouth is FRAMED by the rock, not cut through it: the jambs stand just
// outside the throat's edges and the brow's underside caps it. Getting this
// wrong is obvious in both directions — too tight and the dark is a slot at
// ankle height, too loose and the throat's whole face is exposed and reads as a
// wall. The loose boulders sit out on the flanks; near the mouth they only
// added to the heap.
// LEAN and TIP are shears about the lump's own centre, applied after the scale
// so the keepout circles still hold: a jamb's head comes in over the opening,
// and the brow's underside runs downhill instead of level, which is the
// difference between a capstone and a lintel.
const MASS = [
  ['jamb', 0.46, 0.80, 1.30, 1.05, -1.55, 0.34, -0.02, 0.10, 0.26, 0],
  ['jamb', 0.44, 0.85, 1.15, 1.00, 1.55, 0.30, 0.02, 0.22, -0.44, 0],
  ['brow', 0.34, 1.85, 0.52, 0.95, -0.05, 0.84, 0.05, 0.16, 0, -0.13],
  ['crown', 0.42, 1.35, 0.75, 1.10, 0.20, 0.96, -0.55, 0.06, 0, 0],
  ['shoulder', 0.50, 1.10, 1.05, 1.60, -1.95, 0.42, -1.15, 0.26, 0, 0],
  ['shoulder', 0.46, 1.05, 0.95, 1.50, 1.90, 0.36, -1.05, 0.13, 0, 0],
  ['bank', 0.58, 1.60, 0.95, 1.45, -0.15, 0.50, -2.10, 0.30, 0, 0],
  ['boulder', 0.20, 1.15, 0.75, 1.15, -2.30, 0.05, 0.70, 0.19, 0, 0],
  ['boulder', 0.15, 1.00, 0.70, 1.00, 2.25, 0.04, 0.62, 0.08, 0, 0],
];

// The threshold slab's plan: its sides, how far in the top face stands from
// the foot, and how unevenly the corners reach. The foot's furthest reach is
// the slab's stated extent, so nothing a case placed against the threshold is
// any nearer to it for the slab being ragged.
const SLAB_SIDES = 7;
const SLAB_TOP = 0.84;
const SLAB_RAGGED = 0.20;

export function makeCave({
  width = 2.4, height = 2.4, depth = 1.9, seed = 2, color = WASH.stone,
} = {}) {
  const g = new THREE.Group();
  g.name = 'cave';
  const rIn = width * 0.5;

  // The dark, first, so every lump of rock is drawn over it.
  //
  // UNLIT, and that is the whole trick. A lit material cannot be darker than
  // the light falling on it, and the hemisphere fill lifts everything off
  // black; mixing the surface colour further toward INK does nothing, because
  // the lighting happens afterwards. A cave mouth is not a dark surface, it is
  // an ABSENCE of light, so the honest material is one the lights never touch.
  // MeshBasicMaterial at flat INK is the darkest thing the book owns, and it
  // stays that way at every hour and every angle.
  // Its face stands at the cave's origin and it runs back from there, so the
  // threshold in front of it is a room a figure can sit in with the black
  // BEHIND them: a seated figure inside the prism is ink on ink and gone.
  const throatY = height * 0.34, throatLen = depth * 1.9;
  const outline = new THREE.Shape();
  MOUTH.forEach(([x, y], i) => {
    const j = y > 0 ? MOUTH_JITTER : 0;
    const px = (x + (hash1(i * 7 + 11, seed) - 0.5) * j) * width;
    const py = (y + (hash1(i * 7 + 12, seed) - 0.5) * j) * height - throatY;
    if (i === 0) outline.moveTo(px, py); else outline.lineTo(px, py);
  });
  const throatGeo = new THREE.ExtrudeGeometry(outline, { depth: throatLen, bevelEnabled: false });
  throatGeo.translate(0, 0, -throatLen / 2);
  const throat = new THREE.Mesh(throatGeo, new THREE.MeshBasicMaterial({ color: INK }));
  throat.name = 'throat';
  throat.position.set(0, throatY, -throatLen / 2);
  g.add(throat);

  // the threshold: stone the daylight still reaches, so the black behind it has
  // something to be darker than. A flat-topped slab bedded in the ground — the
  // top face is level because cases seat a figure on it.
  const turn = hash1(31, seed);
  const apronGeo = new THREE.CylinderGeometry(1, 1, height * 0.13, SLAB_SIDES, 1);
  apronGeo.rotateY(turn * Math.PI * 2);
  const ap = apronGeo.attributes.position;
  for (let i = 0; i < ap.count; i++) {
    const x = ap.getX(i), z = ap.getZ(i);
    if (Math.hypot(x, z) < 1e-6) continue;                    // a cap's centre
    // keyed by the corner's own bearing, so a cap's copy of a corner and the
    // wall's copy of it move together
    const corner = Math.round((Math.atan2(x, z) / (Math.PI * 2) - turn + 2) * SLAB_SIDES) % SLAB_SIDES;
    const k = (1 - SLAB_RAGGED * hash1(corner * 3 + 32, seed)) * (ap.getY(i) > 0 ? SLAB_TOP : 1);
    ap.setX(i, x * k * width * 0.44);
    ap.setZ(i, z * k * depth * 0.35);
  }
  apronGeo.computeVertexNormals();
  const apron = new THREE.Mesh(apronGeo,
    washMaterial({ color: mixHex(color, INK, 0.58), flat: true }));
  apron.name = 'apron';
  apron.position.set(0, height * 0.042, depth * 0.06);
  g.add(apron);

  const lumps = [];
  MASS.forEach(([name, r, sx, sy, sz, x, y, z, tone, lean, tip], i) => {
    const rad = r * height;
    const geo = new THREE.DodecahedronGeometry(rad, 0);
    // turn each lump before scaling it, so the facets never repeat and the
    // stated extents still hold
    geo.rotateY(hash1(i * 5 + 1, seed) * Math.PI * 2);
    geo.rotateZ((hash1(i * 5 + 2, seed) - 0.5) * 0.55);
    geo.scale(sx, sy, sz);
    if (lean || tip) geo.applyMatrix4(new THREE.Matrix4().set(
      1, lean, 0, 0,
      tip, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1));
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
