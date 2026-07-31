import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { ACCENT } from '../palette.js';

// The raised finger (case 3). Gutei answered every question about Zen by
// holding up one finger, and his boy attendant started answering the same way —
// so this little thing gets built twice, at two sizes, and it is the whole case.
//
// One lathed digit: a slim shaft that swells slightly, then tapers into a
// rounded tip, hinged at the local origin so it can be dropped onto the hem of a
// raised sleeve and left pointing at the sky.
//
// ONE mesh, deliberately, and it matters. The finger is this koan's red seal and
// the scene is asserted to carry exactly one accent mesh — Gutei's (the boy's
// hand is empty, his finger gone). Built from a stack of parts (shaft plus a
// capping sphere, the obvious first draft) the count would quietly drift and the
// assertion that keeps this case honest would stop meaning anything. A single
// lathe is also plenty: this is a few centimetres of geometry read from six
// metres away, where nothing survives but the silhouette.
//
// Authored a good deal larger than an anatomical finger, for the same reason the
// lotus in case 6 is oversized — the thing being gestured with has to carry the
// shot, and at true scale the seal is a speck. Kept around three times as long
// as it is wide, though: fatter than that and it stops reading as a finger and
// starts reading as a bead someone is holding up.
//
// A fingernail was tried here (a flat plane merged onto the tip) and pulled:
// Frank's call was that it's detail no reader is ever close enough to resolve
// — this thing carries a shot from six metres, and a nail is a two-centimetre
// facet on a prop already smaller than that. The knuckle steps below stay,
// because they read in the silhouette at distance; the nail only read at a
// macro camera distance nobody in the actual book uses. Filed as the
// plan-miscalibration it was, not a modelling bug — see task-B4-report.md.
export function makeRaisedFinger({
  length = 0.15, radius = 0.025, color = ACCENT, segments = 9,
} = {}) {
  const L = length, R = radius;
  // (radius, height) up the digit: closed at the base so nothing shows when it
  // is sunk into a cuff, closed again at the tip so it reads round, not cut off.
  // Two step pairs (rise then a shallow step-in) stand in for the proximal and
  // middle knuckles — a joint on a finger is a swell followed by a crease, not
  // a smooth taper, and without them the lathe read as a shaft rather than a
  // digit at workbench range. The widest point (0.30L) and everything from
  // 0.60L to the tip are untouched from the original profile: the finger's
  // overall silhouette — its bounding box, its widest ring — is unchanged, only
  // the run below that ring now steps instead of running straight.
  const profile = [
    [0.00, 0.00],
    [R * 0.94, 0.00],
    [R * 0.99, L * 0.09],   // first knuckle: swells toward the joint
    [R * 0.87, L * 0.15],   // first knuckle: the joint's own step-in
    [R * 1.00, L * 0.30],   // second knuckle: the widest point on the digit
    [R * 0.89, L * 0.38],   // second knuckle: its step-in
    [R * 0.96, L * 0.60],
    [R * 0.84, L * 0.79],
    [R * 0.62, L * 0.91],
    [R * 0.33, L * 0.98],
    [0.00, L],
  ].map(([r, y]) => new THREE.Vector2(r, y));

  const mesh = new THREE.Mesh(
    new THREE.LatheGeometry(profile, segments),
    toonMaterial({ color, flat: true }));
  mesh.name = 'finger';
  return mesh;
}
