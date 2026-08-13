import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { hash1 } from '../util/noise.js';
import { WASH } from '../palette.js';

// A TEMPLE ON THE FAR SIDE OF THE VALLEY. A big hall with two smaller ones
// beside it, seen at a distance through fog — the thing that tells you the
// road in this scene goes somewhere, and that the men standing on it belong to
// an institution rather than to nowhere.
//
// NOTHING USES THIS YET, on purpose. It was built for cases 15 (which names a
// temple) and 17 (whose Chu is the emperor's teacher, a rank with an
// establishment behind it), placed in both, and then pulled: seen in the scenes
// it did not earn its place. The piece itself is kept in case a later case
// wants one. It is complete and was working; what was wrong was the picture,
// not the component.
//
// If you place one, read the SCALE note at the bottom of this file first. The
// mistake is easy to repeat and hard to see coming.
//
// IT REUSES THE HUT'S LANGUAGE, NOT THE HUT — the same shapes at a larger
// scale, set well back where distance excuses the lack of detail. Under the
// inverted-hull outline (the hull, since deleted) three real huts would not
// have fitted in the draw budget at all. That arithmetic is history, but the
// reason survives it: every part of a real hut that cost anything back then —
// the framed door, the rafter ends through the fascia, the threshold stone — is
// invisible past about fifteen units anyway. So the same silhouette, long low
// body and wide hipped roof carried well past the wall, built as two merged
// geometries: two draws for the whole compound.
//
// What survives at fog distance is the ROOFLINE, so that is what the detail
// goes into: each roof is a squat four-sided pyramid, deliberately oversailing
// its own walls (EAVE), because a Japanese roof reads by how far it reaches
// past what it covers. Everything else is a box.
//
// Deterministic: the only variation is seeded jitter on the outbuildings, so
// the same seed is the same compound.

// The compound, in units of `scale`. The hall is the subject; the two
// outbuildings exist to stop it reading as one lonely shed, and they are
// deliberately unequal — a matched pair either side would read as a gate.
const HALL = { w: 5.0, h: 2.5, d: 3.4 };
const WINGS = [
  { w: 3.0, h: 1.7, d: 2.4, x: -4.6, z: 1.5 },
  { w: 2.2, h: 1.4, d: 2.0, x: 4.1, z: 2.6 },
];
const EAVE = 0.62;        // how far the roof oversails the wall, x wall height
const ROOF_H = 0.52;      // roof height, x wall height
const PLINTH = 0.10;      // x wall height — the stone base, a dark line under it

function building({ w, h, d, x, z, yaw }) {
  const walls = [], roofs = [];
  const plinthH = h * PLINTH;

  const base = new THREE.BoxGeometry(w * 1.06, plinthH, d * 1.06);
  base.translate(0, plinthH / 2, 0);
  walls.push(base);

  const body = new THREE.BoxGeometry(w, h, d);
  body.translate(0, plinthH + h / 2, 0);
  walls.push(body);

  // The roof: a four-sided pyramid turned 45 degrees so its faces square up to
  // the walls, then scaled to the building's own footprint plus the eave. A
  // cone with four segments is the cheapest thing that still reads as hipped,
  // and it is the same trick kit/bell.js uses for the cap over its beam.
  const reach = h * EAVE;
  const roof = new THREE.ConeGeometry(1, h * ROOF_H, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale((w / 2 + reach) * Math.SQRT2 / 2, 1, (d / 2 + reach) * Math.SQRT2 / 2);
  roof.translate(0, plinthH + h + (h * ROOF_H) / 2, 0);
  roofs.push(roof);

  // the ridge: a short bar along the roof's own long axis, which is what stops
  // the pyramid reading as a tent from side on
  const ridge = new THREE.BoxGeometry(w * 0.34, h * 0.07, d * 0.10);
  ridge.translate(0, plinthH + h + h * ROOF_H * 0.94, 0);
  roofs.push(ridge);

  const place = (geos) => geos.map((gg) => {
    if (yaw) gg.rotateY(yaw);
    gg.translate(x, 0, z);
    return gg;
  });
  return { walls: place(walls), roofs: place(roofs) };
}

export function makeTemple({
  scale = 1, seed = 15,
  roofColor = WASH.dark,      // the roofs carry the silhouette, so they are the darker mass
  wallColor = WASH.stone,     // paler, so the compound does not read as one solid block
} = {}) {
  const g = new THREE.Group();
  g.name = 'temple';

  const s = scale;
  const parts = [];
  parts.push(building({ w: HALL.w * s, h: HALL.h * s, d: HALL.d * s, x: 0, z: 0, yaw: 0 }));
  WINGS.forEach((wg, i) => {
    // a few degrees of seeded yaw and a little drift, so a compound never
    // reads as three boxes set out on a grid
    const j = (n) => (hash1(i * 7 + n, seed) - 0.5);
    parts.push(building({
      w: wg.w * s, h: wg.h * s, d: wg.d * s,
      x: (wg.x + j(1) * 0.7) * s,
      z: (wg.z + j(2) * 0.7) * s,
      yaw: j(3) * 0.34,
    }));
  });

  const walls = new THREE.Mesh(
    mergeSimple(parts.flatMap((p) => p.walls)),
    washMaterial({ color: wallColor, flat: true }));
  walls.name = 'temple-walls';
  g.add(walls);

  const roofs = new THREE.Mesh(
    mergeSimple(parts.flatMap((p) => p.roofs)),
    washMaterial({ color: roofColor, flat: true }));
  roofs.name = 'temple-roofs';
  g.add(roofs);

  // The footprint a scene needs to keep trees and scatter out of the compound,
  // in WORLD space — it reads the group's own position and yaw at call time.
  // Returned rather than assumed because `scale` decides the radii, and world
  // rather than local because the wings sit several units off centre: a case
  // that spread the local circles onto a rotated temple would mask two patches
  // of empty meadow and leave pines growing through the outbuildings. Call it
  // AFTER positioning the group.
  g.footprint = (pad = 1.0) => {
    const a = g.rotation.y;
    const cos = Math.cos(a), sin = Math.sin(a);
    const local = [
      { x: 0, z: 0, r: (Math.max(HALL.w, HALL.d) / 2 + 1.2) * s * pad },
      ...WINGS.map((wg) => ({
        x: wg.x * s, z: wg.z * s, r: (Math.max(wg.w, wg.d) / 2 + 0.9) * s * pad,
      })),
    ];
    return local.map((f) => ({
      x: g.position.x + f.x * cos + f.z * sin,
      z: g.position.z - f.x * sin + f.z * cos,
      r: f.r,
    }));
  };

  return g;
}

// SCALE, AND THE MISTAKE THAT IS EASY TO REPEAT. Read this before placing one.
//
// A compound at scale 1.0 is five units across the hall alone and about eleven
// across the whole group. Dropped at the twenty-odd units where "the distance"
// intuitively feels like it starts, that fills a quarter of the frame and
// reads as buildings LOOMING — the exact opposite of the thing being asked
// for. Measured against a real shot: 1.0 at range 24 was far too big, and the
// correction that followed pushed it clean out of frame instead. What read
// correctly was 0.7 at around range 24, sitting at the frame's edge.
//
// Two other things worth knowing, both learned the hard way:
//
//   Place it by MEASUREMENT. A grid over the valley floor, scoring candidate
//   positions against mountainFootprints() (kit/mountains.js), the lens half
//   angle, and the range, finds spots an eye does not — and finds the cases
//   where none exists. Case 17's near band is dominated by peaks of radius 17
//   and 16, and no placement past thirty units clears them and still lands in
//   frame; that is worth knowing before spending an evening nudging numbers.
//
//   Call footprint() AFTER positioning and rotating the group. It reads both,
//   and returns world circles, so `...temple.footprint()` drops straight into
//   composeWorld's keepout list.
