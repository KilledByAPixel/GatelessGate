import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';
import { INK, WASH, mixHex } from '../palette.js';
import { hangChimes, attachChimes } from './chimes.js';

// THE HALL.
//
// Fourteen cases put a building behind the staging and call it the hall, the
// dining hall, the monastery, the tea stall. For a long time it was four posts
// and a pyramid hat — a picnic shelter, and no reader ever looked at it and
// thought "monastery". What tells you a roof is Japanese is not the pitch, it
// is the SWEEP: steepest at the ridge, flattening as it runs out, then flicking
// up at the very edge, and carrying a long way past the wall it covers. So the
// roof is the model. Everything else is here to give it something to sit on.
//
// The build, outside in:
//   - a hipped roof: a ridge along the width, two long slopes, two steeper hip
//     ends, each slope broken into four segments whose pitch eases outward
//     (that is the concave sweep) plus a fifth that turns the eave tip back up
//   - a deep overhang with a fascia band, a closed soffit, and rafter ends
//     poking through the fascia on a regular beat
//   - a ridge beam along the top with a cap standing at each end
//   - three walls and a front opened by one wide framed door
//   - corner posts left proud of the wall plane and a head beam running the
//     whole way round under the eave: the post-and-beam hint
//   - a low plinth, a threshold to step over and a stone to step from
//
// THE DOORWAY IS A SOLID, not a hole. The sun is one hard directional at 6.7,
// so an open door looked STRAIGHT THROUGH the hall at bright lit ground and
// blew out to paper-white — a rectangle punched in the wall, the exact opposite
// of a way in. It is closed by a panel set back in the reveal, mixed 3/4 of the
// way to ink from whatever colour the hall was built in, which is dark at any
// hut rotation any case happens to use.
//
// Mesh budget: five, DOWN from the old six. Everything that shares a material
// is baked into one geometry, because an inverted-hull outline is added per
// MESH and a hall made of a hundred children would cost a hundred outline draws
// on its own. The four corner posts are one merged mesh for the same reason;
// they are still the only round, smooth-shaded part, which is why they do not
// simply join the walls.
//
// Nothing here is random. Every number falls out of width/height/depth, so two
// huts of the same size are the same hut — same as it always was.

const box = (w, h, d, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

function pushQuad(v, a, b, c, d) {
  v.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  v.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
}

// A closed hipped shell from a stack of rectangular rings, lowest first. Each
// ring is a pair of half-extents and a height; consecutive rings are skinned
// with four quads and the stack is capped top (ridge) and bottom (soffit), so
// the whole thing is a solid. An open shell would give the inverted-hull
// outline pass nothing to invert, and the eave would read as a hole from below.
function hipShell(rings) {
  const v = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    pushQuad(v, [-a.hx, a.y, a.hz], [a.hx, a.y, a.hz], [b.hx, b.y, b.hz], [-b.hx, b.y, b.hz]);
    pushQuad(v, [a.hx, a.y, -a.hz], [-a.hx, a.y, -a.hz], [-b.hx, b.y, -b.hz], [b.hx, b.y, -b.hz]);
    pushQuad(v, [a.hx, a.y, a.hz], [a.hx, a.y, -a.hz], [b.hx, b.y, -b.hz], [b.hx, b.y, b.hz]);
    pushQuad(v, [-a.hx, a.y, -a.hz], [-a.hx, a.y, a.hz], [-b.hx, b.y, b.hz], [-b.hx, b.y, -b.hz]);
  }
  const t = rings[rings.length - 1], f = rings[0];
  pushQuad(v, [-t.hx, t.y, t.hz], [t.hx, t.y, t.hz], [t.hx, t.y, -t.hz], [-t.hx, t.y, -t.hz]);
  pushQuad(v, [-f.hx, f.y, -f.hz], [f.hx, f.y, -f.hz], [f.hx, f.y, f.hz], [-f.hx, f.y, f.hz]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

// Rafter ends along one eave run: small blocks on a regular beat, each showing
// PROUD of the fascia by `OUT` and no more. They earn their keep in ink — the
// outline pass draws each one, so the eave picks up a dashed underline — but
// push them out any further and the roof's silhouette turns into battlements.
const RAFTER_OUT = 0.045, RAFTER_DEEP = 0.15, RAFTER_W = 0.07, RAFTER_H = 0.058;
function rafterTips(geos, { along, run, edge, sign, y }) {
  const usable = run - 0.34;
  const n = Math.max(3, Math.round(usable / 0.32));
  const at = edge + sign * (RAFTER_OUT - RAFTER_DEEP / 2);
  for (let i = 0; i <= n; i++) {
    const p = -usable / 2 + (usable * i) / n;
    if (along === 'x') geos.push(box(RAFTER_W, RAFTER_H, RAFTER_DEEP, p, y, at));
    else geos.push(box(RAFTER_DEEP, RAFTER_H, RAFTER_W, at, y, p));
  }
}

export function makeHut({
  width = 2.4, height = 2.2, depth = 2.0, color = WASH.dark,
  // Chimes under the front eave — the side the door is on, which is the side
  // anybody is looking at. A seed, not a count: 0 hangs nothing (so every hut
  // already in the book is untouched), any other number hangs one or two of a
  // seeded kind and size, and they SOUND — the kit holds the app's engine, so
  // `chimes: 7` is the whole instruction. `audio` overrides it, which is how
  // tests capture strikes. See src/kit/chimes.js.
  chimes = 0, audio = null,
} = {}) {
  const g = new THREE.Group();
  g.name = 'hut';
  g.userData.hut = { width, height, depth };
  const mat = toonMaterial({ color });
  const flat = toonMaterial({ color, flat: true });

  const TW = 0.10;                                   // wall thickness
  const doorW = Math.min(Math.max(width * 0.46, 0.90), 1.70);
  const doorH = Math.min(height * 0.70, height - 0.34);
  const panelW = (width - doorW) / 2;

  // ---- corner posts ------------------------------------------------------
  // One merged mesh, still named 'post', still four of them in space. The wall
  // panels are TW thick and centred on the post line, so each post stands 0.075
  // out of the plaster on both faces: the post-and-beam hint, from the corners
  // in.
  const postGeos = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.CylinderGeometry(0.100, 0.125, height, 8);
    p.translate(sx * width / 2, height / 2, sz * depth / 2);
    postGeos.push(p);
  }
  const post = new THREE.Mesh(mergeSimple(postGeos), mat);
  post.name = 'post';
  g.add(post);

  // ---- walls, door frame, head beam --------------------------------------
  // Three sides shut, the front opened by one wide bay. The door is the only
  // void in the building so it wants to be generous: a slot would read as a
  // shed.
  const wall = new THREE.Mesh(mergeSimple([
    box(width, height, TW, 0, height / 2, -depth / 2),                  // back
    box(TW, height, depth, -width / 2, height / 2, 0),                  // left
    box(TW, height, depth, width / 2, height / 2, 0),                   // right
    box(panelW, height, TW, -(doorW + panelW) / 2, height / 2, depth / 2),
    box(panelW, height, TW, (doorW + panelW) / 2, height / 2, depth / 2),
    box(doorW, height - doorH, TW, 0, (height + doorH) / 2, depth / 2),  // over the door
    box(0.13, doorH + 0.07, 0.24, -doorW / 2, (doorH + 0.07) / 2, depth / 2),
    box(0.13, doorH + 0.07, 0.24, doorW / 2, (doorH + 0.07) / 2, depth / 2),
    // the door's lintel, carried all the way round the building as a rail —
    // one strong horizontal, which is what keeps the wall from reading as a
    // blank slab with a hole in it. Everything laid on the wall stands ~0.08
    // off it, not a token 0.02: flat shading gives a face-on plane and the
    // plane behind it the SAME tone, so the only thing that separates timber
    // from plaster is the little top and bottom faces catching the sun.
    box(width + 0.14, 0.15, 0.26, 0, doorH + 0.07, depth / 2),
    box(width + 0.14, 0.15, 0.26, 0, doorH + 0.07, -depth / 2),
    box(0.26, 0.15, depth + 0.14, -width / 2, doorH + 0.07, 0),
    box(0.26, 0.15, depth + 0.14, width / 2, doorH + 0.07, 0),
    box(width + 0.26, 0.17, 0.26, 0, height - 0.10, depth / 2),          // head beam,
    box(width + 0.26, 0.17, 0.26, 0, height - 0.10, -depth / 2),         // all the way
    box(0.26, 0.17, depth + 0.26, -width / 2, height - 0.10, 0),         // round, past
    box(0.26, 0.17, depth + 0.26, width / 2, height - 0.10, 0),          // the corners
  ]), flat);
  wall.name = 'wall';
  g.add(wall);

  // ---- the doorway itself ------------------------------------------------
  const doorway = new THREE.Mesh(
    box(doorW + 0.03, doorH + 0.03, 0.08, 0, (doorH + 0.03) / 2, depth / 2 - 0.17),
    toonMaterial({ color: mixHex(color, INK, 0.75), flat: true }));
  doorway.name = 'doorway';
  g.add(doorway);

  // ---- the roof ----------------------------------------------------------
  // over  — how far the eave reaches past the wall. Deep; the deeper it is, the
  //         more the building reads as sheltered rather than boxed.
  // rise  — eave to ridge. Weighted mostly on depth (that is what the slopes
  //         have to cross) with a share of the wall height, because what makes
  //         a hall read as a HALL is the roof taking about half the building.
  //         The old pyramid hat was a flat 0.7 whatever the plan.
  // The x inset runs slower than the z inset (kx < 1), which lengthens the
  // ridge and steepens the hip ends. Equal pitch on a near-square plan collapses
  // the ridge to a point — a pyramid, which is the thing this rebuild escapes.
  const over = 0.28 + 0.05 * Math.min(width, depth);
  const rise = 0.16 * height + 0.24 * depth + 0.14;
  const hx0 = width / 2 + over;
  const hz0 = depth / 2 + over;
  const span = hz0 - 0.06;
  const ridgeHalf = Math.max(hx0 - span, hx0 * 0.32);
  const kx = (hx0 - ridgeHalf) / span;
  const FASCIA = 0.14;                               // depth of the eave board
  const LIP = 0.045;                                 // how far the tip turns up
  const ring = (r, y) => ({ hx: hx0 - r * kx, hz: hz0 - r, y });
  const ridgeY = FASCIA - LIP + rise;
  const rings = [
    ring(0, 0),                                      // soffit line
    ring(0, FASCIA),                                 // eave tip, turned up
    ring(0.09 * span, FASCIA - LIP),                 // the low point behind it
    ring(0.42 * span, FASCIA - LIP + 0.20 * rise),
    ring(0.73 * span, FASCIA - LIP + 0.55 * rise),
    ring(span, ridgeY),                              // the ridge
  ];
  const roofParts = [
    hipShell(rings),
    box(2 * ridgeHalf + 0.18, 0.15, 0.22, 0, ridgeY + 0.070, 0),         // ridge beam
    box(0.17, 0.17, 0.28, -(ridgeHalf + 0.06), ridgeY + 0.095, 0),       // thickened
    box(0.17, 0.17, 0.28, ridgeHalf + 0.06, ridgeY + 0.095, 0),          // at each end
  ];
  for (const s of [-1, 1]) {
    rafterTips(roofParts, { along: 'x', run: 2 * hx0, edge: s * hz0, sign: s, y: FASCIA * 0.42 });
    rafterTips(roofParts, { along: 'z', run: 2 * hz0, edge: s * hx0, sign: s, y: FASCIA * 0.42 });
  }
  const roof = new THREE.Mesh(mergeSimple(roofParts), flat);
  roof.name = 'roof';
  roof.position.y = height;                          // the soffit rests on the posts
  g.add(roof);

  // ---- chimes under the eave ----------------------------------------------
  // The hang point is the SOFFIT LINE, which is exactly y = height: the roof
  // group sits at that height and its first ring is at local 0, so the
  // underside of the eave and the top of the walls are the same plane. Pulled
  // a hand's width inside the eave tip so the cord is under the boards rather
  // than off the edge of them, and kept inside two thirds of the half-span so
  // nothing hangs out past where the hip slopes come down.
  attachChimes(g, hangChimes(g, {
    seed: chimes, audio, y: height, z: hz0 - 0.12, span: hx0 * 0.62,
    // Nothing structural hangs under this eave, so the limit is compositional:
    // much past half a metre and the chime reads as hanging IN the doorway
    // rather than off the building.
    maxDrop: 0.52,
  }));

  // ---- plinth and threshold ----------------------------------------------
  // A low stone base under the whole footprint, a sill to step over and a stone
  // to step from. Small, but it is the difference between a building that was
  // built where it stands and one that was set down on the grass. (Safe on the
  // ground it gets: every hut in the book sits inside the world's flat radius —
  // the worst case is 0.02 of roll under case 35's far hut.)
  const sill = new THREE.Mesh(mergeSimple([
    box(width + 0.18, 0.16, depth + 0.18, 0, 0.08, 0),
    box(doorW + 0.24, 0.12, 0.20, 0, 0.22, depth / 2),
    box(doorW + 0.50, 0.10, 0.34, 0, 0.05, depth / 2 + 0.34),
  ]), flat);
  sill.name = 'sill';
  g.add(sill);

  return g;
}
