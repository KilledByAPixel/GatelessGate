import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK_LIT, wash } from '../palette.js';
import { hash1 } from '../util/noise.js';

// A small junk, built to be seen from the shore. Case 11's Joshu says "ships
// cannot remain where the water is too shallow", so the book finally has one:
// standing off in the fog, riding the swell, unable to come in.
//
// THE DETAIL FLOOR applies harder here than anywhere: this model's home is
// twenty-odd units out with a third of its contrast already fogged away, where
// the entire read is one silhouette — a raked hull, a mast, one battened-sail
// trapezoid. Rigging, tiller, gunwale trim all live below what that distance
// resolves. Three meshes, and the hull is a single closed low-poly shell.
//
// Facing: bow points local +z, the kit's body convention (monk.js), so
// faceMonk-style aiming math works on a boat too if anyone ever needs it.
//
// FLOATING is the kit's job, not the case's (the reuse rule): pass `surfaceAt`
// — (x, z, t) => WORLD y of the water surface, the makeKoi/makeFoam idiom —
// and update() seats the hull on the swell each frame: y from the surface,
// pitch and roll from sampling it at bow/stern and beam ends. The case owns
// x and z; update() owns y and the rock. Without surfaceAt the boat only
// breathes a slow seeded tilt around whatever pose it was given, so it stays
// alive on a gallery floor (the model viewer) without inventing a sea.
const scratch = new THREE.Vector3();

export function makeBoat({
  length = 3.2,
  beam = 1.1,
  freeboard = 0.34,    // deck height above the waterline the group origin sits at
  draft = 0.16,
  mast = 2.3,          // mast height above deck; 0 = a bare hull
  color = INK_LIT,     // hull and mast — dark ink, but lit (never raw INK)
  sailColor = wash(0.50),  // a step lighter than the hull so the sail reads as cloth
  seed = 11,
  rockGain = 2.2,      // the swell's slopes are gentle; the eye wants the rock
  surfaceAt = null,
} = {}) {
  const L = length, B = beam, F = freeboard, D = draft;
  const group = new THREE.Group();
  group.name = 'boat';

  // ---- hull: eight points, one shell ------------------------------------
  // A keel line fore and aft, a gunwale that rises at both ends — stern
  // higher than the waist, bow tip highest, the junk's own profile.
  const bowTip = [0, F * 1.45, L * 0.5];
  const midP = [-B / 2, F, L * 0.05];
  const midS = [B / 2, F, L * 0.05];
  const sternP = [-B * 0.36, F * 1.25, -L * 0.5];
  const sternS = [B * 0.36, F * 1.25, -L * 0.5];
  const keelF = [0, -D, L * 0.22];
  const keelA = [0, -D, -L * 0.34];
  const tri = [];
  // WOUND OUTWARD, and it was not: every one of these ten triangles used to be
  // listed the other way round, so computeVertexNormals gave the whole shell
  // inward normals. Front-face culling then threw away the near side and drew
  // the far side's interior, lit from inside — which is why the hull's
  // underside read as a solid patch in the wrong value (Frank: "the bottom of
  // it seems like it might be flipped, inverted, rendered the inverse
  // colouring"), and why the inverted-hull outline pass had nothing sensible to
  // grow. The vertex lists below stay in the order they were composed in — bow
  // to keel to gunwale, which is how the shape reads on paper — and the helper
  // emits them reversed, so the geometry is right without the prose going
  // backwards. tests/boat.test.js holds every face to it.
  const face = (a, b, c) => tri.push(...a, ...c, ...b);
  // port side, then starboard mirrored
  face(bowTip, keelF, midP);
  face(midP, keelF, keelA);
  face(midP, keelA, sternP);
  face(bowTip, midS, keelF);
  face(midS, keelA, keelF);
  face(midS, sternS, keelA);
  // transom and deck
  face(sternP, keelA, sternS);
  face(bowTip, midP, midS);
  face(midP, sternP, sternS);
  face(midP, sternS, midS);
  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, toonMaterial({ color, flat: true }));
  hull.name = 'hull';
  group.add(hull);

  if (mast > 0) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.034, mast, 5),
      toonMaterial({ color, flat: true }));
    pole.name = 'mast';
    pole.position.set(0, F + mast / 2, -L * 0.02);
    group.add(pole);

    // the lug sail: one trapezoid, head raked aft — the junk silhouette.
    // Slung fore of the mast and heeled a hair off the centreline so the two
    // read as separate strokes instead of one line.
    const mz = -L * 0.02;
    const sailH = mast * 0.72;
    const foot = F + mast * 0.16;
    const quad = [
      [0, foot, mz + L * 0.30],              // tack, low forward
      [0, foot + 0.06, mz - L * 0.26],       // clew, low aft
      [0, foot + sailH, mz - L * 0.38],      // peak, high aft — the rake
      [0, foot + sailH * 0.86, mz + L * 0.16],  // throat, high forward
    ];
    const sailTri = [];
    sailTri.push(...quad[0], ...quad[1], ...quad[2]);
    sailTri.push(...quad[0], ...quad[2], ...quad[3]);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.Float32BufferAttribute(sailTri, 3));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo,
      toonMaterial({ color: sailColor, flat: true, side: THREE.DoubleSide }));
    sail.name = 'sail';
    sail.rotation.y = 0.10;
    group.add(sail);
  }

  const phase = hash1(seed, 3) * Math.PI * 2;
  let clock = 0;

  function update(dt, simTime) {
    clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
    if (!surfaceAt) {
      // gallery idle: a breath of tilt, no sea implied and no y taken over
      group.rotation.x = 0.015 * Math.sin(clock * 0.7 + phase);
      group.rotation.z = 0.022 * Math.sin(clock * 0.53 + phase * 1.7);
      return;
    }
    // Seat the hull on the actual surface. WORLD position, deliberately —
    // `.position` on a nested group is local, finite, plausible and wrong
    // (the spatial-audio trap, same lesson).
    group.getWorldPosition(scratch);
    const { x, z } = scratch;
    const yaw = group.rotation.y;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);       // bow direction
    const half = L * 0.4;
    const hb = surfaceAt(x + fx * half, z + fz * half, clock);
    const hs = surfaceAt(x - fx * half, z - fz * half, clock);
    const hp = surfaceAt(x - fz * (B / 2), z + fx * (B / 2), clock);
    const hq = surfaceAt(x + fz * (B / 2), z - fx * (B / 2), clock);
    group.position.y = (hb + hs + hp + hq) / 4;
    // +rotation.x sends the bow DOWN (right-hand rule about +x), so a higher
    // bow sample must pitch negative; +rotation.z lifts the +x side.
    group.rotation.x = Math.atan2(hs - hb, L) * rockGain;
    group.rotation.z = Math.atan2(hq - hp, B) * rockGain;
  }

  return { group, update };
}
