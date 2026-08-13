import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { WASH } from '../palette.js';

// An open hall veranda: a raised timber floor with a post-and-beam opening
// across its front and a shallow eave over it. The OPENING is the point — case
// 26 hangs a screen in it, and the country shows through when the screen goes
// up — so there are no walls and nothing closes the bay but the screen itself.
//
// Local frame: the post line (the opening) stands at z = 0 and the floor runs
// back to +z. Place the group at the front edge and everything behind it is
// interior.
//
// This is the hut's small sibling, not a separate building language: floor
// boards instead of a wall's plaster, a beam on posts instead of a corner post
// proud of a wall, and an eave that sweeps and flicks up at the tip exactly the
// way the hut's roof does (see hut.js's hipShell) — just a single straight run,
// not a hip, because a veranda eave does not need a ridge to hold one up.

const boxGeo = (w, h, d, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

export function makeVeranda({
  width = 4.8, depth = 4.4, height = 3.3, deck = 0.34,
  legs = 0,
  color = WASH.dark, floorColor = WASH.stone,
} = {}) {
  const g = new THREE.Group();
  g.name = 'veranda';
  const mat = washMaterial({ color });
  const flat = washMaterial({ color, flat: true });

  // ---- the deck: thin merged planks, not one slab ------------------------
  // Real board width, laid crosswise (each plank runs the full opening, the
  // planks stack back into the room) with a hairline gap between them — the
  // gap is the groove: two flat tops at the same height read as one slab, but
  // the little vertical riser between boards catches the sun differently and
  // the seam shows.
  const boardT = Math.min(0.20, deck * 0.65);
  const PLANK_RUN = Math.max(0.30, Math.min(0.42, depth / 9));
  const plankCount = Math.max(5, Math.round(depth / PLANK_RUN));
  const GROOVE = 0.016;
  const step = depth / plankCount;
  const floorGeos = [];
  for (let i = 0; i < plankCount; i++) {
    floorGeos.push(boxGeo(width, boardT, Math.max(0.05, step - GROOVE),
      0, deck - boardT / 2, step * (i + 0.5)));
  }
  const floor = new THREE.Mesh(mergeSimple(floorGeos), washMaterial({ color: floorColor, flat: true }));
  floor.name = 'floor';
  g.add(floor);

  // stub piers, so the floor reads as raised boards rather than a poured slab
  const pierH = Math.max(0.06, deck - boardT);
  const pierGeos = [];
  for (const sx of [-1, 1]) for (const sz of [0.7, depth - 0.7]) {
    pierGeos.push(boxGeo(0.34, pierH, 0.34, sx * (width / 2 - 0.55), pierH / 2, sz));
  }
  const pier = new THREE.Mesh(mergeSimple(pierGeos), flat);
  pier.name = 'pier';
  g.add(pier);

  // ---- the under-frame, for a veranda LIFTED off the ground ---------------
  // At y = 0 the stub piers above are the whole story. But a case that raises
  // the group (case 25 floats its dream hall `legs` above the terrain) leaves
  // daylight under the boards, and a floor standing on air reads as a bug, not
  // a dream. A platform may float, so long as a frame is visibly holding it
  // up. `legs` is how
  // far below the group's origin the ground lies: four square corner legs run
  // from under the boards down past it (with a generous buried margin, since
  // composeWorld terrain rolls), and a skirting rail ties them just above the
  // ground line so the frame reads as carpentry, not four loose sticks.
  // One merged mesh: one draw, same economy as the posts.
  if (legs > 0) {
    const SINK = 0.30;                       // buried margin for terrain relief
    const LEG_T = 0.24;
    const legTop = deck - boardT;            // tucked up under the boards
    const lx = width / 2 - 0.5;
    const lz0 = 0.5, lz1 = depth - 0.5;
    const legGeos = [];
    for (const sx of [-1, 1]) for (const zz of [lz0, lz1]) {
      const h = legTop + legs + SINK;
      legGeos.push(boxGeo(LEG_T, h, LEG_T, sx * lx, legTop - h / 2, zz));
    }
    // the skirt: one slim rail around all four sides, just above the ground
    const SK_H = 0.14, SK_T = 0.10;
    const skY = -legs + SK_H / 2 + 0.06;
    legGeos.push(boxGeo(lx * 2 + LEG_T, SK_H, SK_T, 0, skY, lz0));
    legGeos.push(boxGeo(lx * 2 + LEG_T, SK_H, SK_T, 0, skY, lz1));
    legGeos.push(boxGeo(SK_T, SK_H, lz1 - lz0, -lx, skY, (lz0 + lz1) / 2));
    legGeos.push(boxGeo(SK_T, SK_H, lz1 - lz0, lx, skY, (lz0 + lz1) / 2));
    const leg = new THREE.Mesh(mergeSimple(legGeos), flat);
    leg.name = 'leg';
    g.add(leg);
  }

  // ---- posts, on a regular beat, all carrying one beam -------------------
  // Two posts (the corners of the opening) read as a doorframe, not a hall;
  // real post-and-beam construction repeats a post every span or so along the
  // beam it carries. One merged mesh, still named 'post', spaced evenly across
  // the whole width so the count itself scales with it (a wider bay earns
  // another post rather than a longer gap).
  // The two outer posts stay exactly on the opening line (z = 0) — that line
  // is what a case builds against (a hung screen, a scroll) and moving it
  // would be an API change in spirit even though the option list does not
  // say so. Interior posts step back a little toward the exterior, the same
  // way a real intermediate mullion sits behind the sliding track rather than
  // in it: case 26 hangs a screen exactly on z = 0 across the WHOLE opening,
  // and a post standing there would run straight through it.
  const POST_SPACING = 1.7;
  const POST_RECESS = 0.12;
  const postCount = Math.max(2, Math.round(width / POST_SPACING) + 1);
  const postGeos = [];
  for (let i = 0; i < postCount; i++) {
    const px = postCount > 1 ? -width / 2 + (width * i) / (postCount - 1) : 0;
    const pz = (i === 0 || i === postCount - 1) ? 0 : -POST_RECESS;
    const p = new THREE.CylinderGeometry(0.10, 0.13, height, 10);
    p.translate(px, height / 2, pz);
    postGeos.push(p);
  }
  const post = new THREE.Mesh(mergeSimple(postGeos), mat);
  post.name = 'post';
  g.add(post);

  // the edge beam the posts carry, running the whole width past the corners
  const beam = new THREE.Mesh(boxGeo(width + 0.55, 0.20, 0.30, 0, height - 0.10, 0), flat);
  beam.name = 'beam';
  g.add(beam);

  // ---- the eave: the hut's roof language, in one straight run -------------
  // Steepest where it leaves the beam, flattening as it runs out, then a LIP
  // that turns the very tip back up — the same concave sweep the hut's hipShell
  // builds from a stack of rings, drawn here from a short curve of tilted
  // boards instead, because a lean-to run needs no hip taper to get there.
  // Every board is real box geometry (six faces, no manifold-stitching), so
  // there is no chance of the underside culling black the way an open sheet
  // would from below the eave — the one place these bays are always seen from.
  const EAVE_T = 0.08;
  const OVER = 0.55 + 0.075 * width;      // how far the eave reaches past the beam
  const DROP = 0.20 + 0.05 * depth;       // how far it dips before the lip
  const LIP = 0.05;                       // how far the very tip turns back up
  const ROOT_Z = 0.12;                    // tucked a little behind the beam
  const ROOT_Y = height + 0.14;
  const profile = [
    { r: 0, d: 0 },
    { r: 0.27 * OVER, d: 0.45 * DROP },
    { r: 0.58 * OVER, d: 0.80 * DROP },
    { r: 0.91 * OVER, d: 1.00 * DROP },
    { r: 1.00 * OVER, d: 1.00 * DROP - LIP },
  ].map((p) => ({ z: ROOT_Z - p.r, y: ROOT_Y - p.d }));
  const eaveHalfW = width / 2 + 0.42;
  const eaveGeos = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1];
    const dz = b.z - a.z, dy = b.y - a.y;
    const len = Math.hypot(dz, dy);
    const seg = new THREE.BoxGeometry(eaveHalfW * 2, EAVE_T, len);
    seg.rotateX(Math.atan2(-dy, dz));
    seg.translate(0, (a.y + b.y) / 2, (a.z + b.z) / 2);
    eaveGeos.push(seg);
  }
  const eave = new THREE.Mesh(mergeSimple(eaveGeos), flat);
  eave.name = 'eave';
  g.add(eave);

  g.userData.deck = deck;

  // THE OPENING, reported rather than left to be re-derived. The posts note
  // above already says z = 0 is "what a case builds against (a hung screen, a
  // scroll)" — but a case still had to work out the other three numbers by
  // reading this file, and case 25 got all of them wrong: its screen stood 1.3
  // units BEHIND the post line, out past the back of the deck over open
  // ground, at 3.0 wide in a 5.4 bay and 2.3 tall in a 2.86 one — visibly
  // mismatched with the back wall, and set too far behind it.
  //
  //   width   post to post, corner to corner
  //   height  deck boards up to the underside of the beam
  //   y, z    where that rectangle's bottom-centre sits in veranda-local space
  //
  // Fill it and the thing you built is set into the frame, at any veranda size.
  g.opening = { width, height: height - 0.20 - deck, y: deck, z: 0 };

  // The floor's footprint as circles — a GRASS mask, since nothing grows up
  // through boards. The props keepout wants something more generous than this.
  // World space, cave.js style: reads position AND yaw at call time, so a
  // case that rotates the veranda cannot silently mask the wrong ground
  // (this used to skip the rotation — latent only because no case rotated one).
  g.footprint = (r = 0.95, cols = 5, rows = 4) => {
    const cos = Math.cos(g.rotation.y), sin = Math.sin(g.rotation.y);
    const out = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lx = -width / 2 + (width * (i + 0.5)) / cols;
        const lz = (depth * (j + 0.5)) / rows;
        out.push({
          x: g.position.x + lx * cos + lz * sin,
          z: g.position.z - lx * sin + lz * cos,
          r,
        });
      }
    }
    return out;
  };
  return g;
}
