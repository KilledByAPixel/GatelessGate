import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { WASH } from '../palette.js';

// An open hall veranda: a raised timber floor with a post-and-beam opening
// across its front and a small ridged roof over it. The OPENING is the point — case
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
// way the hut's roof does (see hut.js's hipShell) — one straight run, not a hip.
//
// THE ROOF HAS A RIDGE BECAUSE OF WHERE THE READER STANDS. Every case looks at
// its veranda from the deck side, down onto the figures on the boards — which
// is also why nothing roofs the deck itself: a real hall's roof would bury
// them. A lean-to that only falls AWAY from that lens shows it nothing but its
// own level top edge, and a level slab on posts is a pergola. So a second,
// shallower slope falls toward the deck: the one roof plane a reader can see.

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
  const BEAM_H = 0.20, BEAM_D = 0.30;
  const beam = new THREE.Mesh(boxGeo(width + 0.55, BEAM_H, BEAM_D, 0, height - BEAM_H / 2, 0), flat);
  beam.name = 'beam';
  g.add(beam);

  // ---- the roof: the hut's sweep, both ways off one ridge -----------------
  // Each slope is steepest where it leaves the ridge, flattens as it runs out,
  // then a LIP turns the very tip back up — the concave sweep the hut's
  // hipShell builds from a stack of rings, drawn here as one cross-section
  // pulled straight along the beam.
  //
  // The OUTER slope is the weather side: it overhangs the post line and comes
  // down past the top of the beam, so a level lens never finds daylight
  // between beam and roof. The INNER slope is the one the reader sees, and it
  // is bounded from below rather than tuned: chimes and screens hang from the
  // beam's underside, and an edge that reaches toward a lens looking down
  // slides over them on screen. So its low point is SOLVED — the underside of
  // the inner eave sits on the sight-line through the beam's far bottom
  // corner at SIGHT, a pitch steeper than any case camera uses, plus a
  // margin. A longer inner reach therefore earns a shallower slope by
  // itself; it can never lower the opening.
  //
  // One closed prism with real thickness (top, underside, both fascias, both
  // gable ends), so the underside never culls black from below — the place
  // these bays are seen from in the low-camera cases — and the eave shows an
  // edge instead of a sheet.
  const EAVE_T = 0.12;
  const RIDGE_Z = 0.10;                    // over the beam, a little to the deck side
  const RIDGE_Y = height + 0.56;
  const OUT = 0.43 + 0.075 * width;        // outer reach past the ridge
  const FALL_OUT = RIDGE_Y - height + 0.04 * depth - 0.06;
  const IN = 0.75 * OUT;                   // inner reach, over the deck
  const SIGHT = (20 * Math.PI) / 180;
  const innerLow = (height - BEAM_H) + Math.tan(SIGHT) * (RIDGE_Z + IN + BEAM_D / 2)
    + EAVE_T + 0.02;
  const FALL_IN = RIDGE_Y - innerLow;
  const LIP = 0.05;
  // top line of the cross-section, outer tip -> ridge -> inner tip
  const top = [
    { z: RIDGE_Z - 1.00 * OUT, y: RIDGE_Y - FALL_OUT + LIP },
    { z: RIDGE_Z - 0.91 * OUT, y: RIDGE_Y - FALL_OUT },
    { z: RIDGE_Z - 0.58 * OUT, y: RIDGE_Y - 0.78 * FALL_OUT },
    { z: RIDGE_Z - 0.27 * OUT, y: RIDGE_Y - 0.42 * FALL_OUT },
    { z: RIDGE_Z, y: RIDGE_Y },
    { z: RIDGE_Z + 0.45 * IN, y: RIDGE_Y - 0.60 * FALL_IN },
    { z: RIDGE_Z + 0.90 * IN, y: RIDGE_Y - FALL_IN },
    { z: RIDGE_Z + 1.00 * IN, y: RIDGE_Y - FALL_IN + 0.6 * LIP },
  ];
  const eaveHalfW = width / 2 + 0.42;
  const tri = [];
  // one quad, wound so its face normal agrees with (nx, ny, nz)
  const quad = (p, q, r, s, nx, ny, nz) => {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const dot = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
    const [a, b, c, d] = dot >= 0 ? [p, q, r, s] : [p, s, r, q];
    tri.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  const L = -eaveHalfW, R = eaveHalfW;
  for (let i = 0; i < top.length - 1; i++) {
    const a = top[i], b = top[i + 1];
    const ay = a.y - EAVE_T, by = b.y - EAVE_T;
    quad([L, a.y, a.z], [R, a.y, a.z], [R, b.y, b.z], [L, b.y, b.z], 0, 1, 0);
    quad([L, ay, a.z], [R, ay, a.z], [R, by, b.z], [L, by, b.z], 0, -1, 0);
    for (const x of [L, R]) {
      quad([x, a.y, a.z], [x, b.y, b.z], [x, by, b.z], [x, ay, a.z], Math.sign(x), 0, 0);
    }
  }
  for (const [t, nz] of [[top[0], -1], [top[top.length - 1], 1]]) {
    quad([L, t.y, t.z], [R, t.y, t.z], [R, t.y - EAVE_T, t.z], [L, t.y - EAVE_T, t.z], 0, 0, nz);
  }
  const eaveGeo = new THREE.BufferGeometry();
  eaveGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tri), 3));
  eaveGeo.computeVertexNormals();
  const eave = new THREE.Mesh(eaveGeo, flat);
  eave.name = 'eave';
  g.add(eave);

  g.userData.deck = deck;

  // THE OPENING, reported rather than left to be re-derived. The posts note
  // above already says z = 0 is "what a case builds against (a hung screen, a
  // scroll)" — but a case still had to work out the other three numbers by
  // reading this file, and case 25 got all of them wrong: its screen stood 1.3
  // units BEHIND the post line, out past the back of the deck over open ground,
  // at 3.0 wide in a 5.4 bay and 2.3 tall in a 2.86 one — visibly mismatched
  // with the back wall, and set too far behind it.
  //
  //   width   post to post, corner to corner
  //   height  deck boards up to the underside of the beam
  //   y, z    where that rectangle's bottom-centre sits in veranda-local space
  //
  // Fill it and the thing you built is set into the frame, at any veranda size.
  g.opening = { width, height: height - BEAM_H - deck, y: deck, z: 0 };

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
