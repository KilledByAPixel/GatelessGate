import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { INK_LIT } from '../palette.js';
import { makeTail } from './tail.js';

// What a species gets when it states nothing: a plain, lean animal. Every
// number here is in the units its option is documented in beside the builder.
const TORSO_DEFAULTS = {
  chest: 1.1, loin: 0.72, withers: 1.0, back: 0.9, croup: 0.94, rump: 1,
  shoulderW: 0.8, barrelW: 0.95, hipW: 0.85,
};
// r      half-depth of the neck where it enters the skull, x height
// w      how wide that end is across, as a fraction of its depth
// root   how far down the chest the throat line starts, as a fraction of
//        `torso.chest` — lower is a deeper neck root and a fuller breast
// set    where the nape leaves the topline, as a fraction of the breast's
//        overhang ahead of the shoulder
// taper  1 is a straight wedge root to head; higher slims the neck sooner
// arch   bow of the whole neck toward its crest, x its own length
const NECK_DEFAULTS = { r: 0.08, w: 0.8, root: 0.55, set: 0.25, taper: 1.5, arch: 0.03 };
// knee      radians the hind leg folds at the hock — how far apart, fore and
//           aft, the stifle and the hock stand; 0 stands it plumb
// shoulder  fore-aft radius of the mass on top of a front leg, x legR
//           (and x legTaper, which is the front leg's own top-heaviness)
// thigh     how far the thigh reaches AHEAD of the hip, to the stifle, x legR
//           (its rear edge is not stated: it follows the rump, see hindSet)
// proud     how far those masses stand out of the flank, x bodyR
// cannon    radius of the slim lower leg, x legR — a hoofed animal's is wire
//           under a heavy forearm, a pawed one's keeps more of the leg
// foot      fore-aft radius of the foot block, x legR: long for a paw, short
//           for a hoof; never less than the cannon
// frontSet  how far AHEAD of the shoulder section the front leg hangs, x height
// hindSet   how far BEHIND the hip section the hind leg hangs, x height.
//           The sections stay where `hipZ` puts them; these move only the
//           limb, for an animal whose legs read as gathered under its middle
//           with the breast or the rump overhanging them. `hindSet` is also
//           what lets the thigh fill the rear: the thigh's back edge reaches
//           for the rump's end, and can only get there if the hip hangs
//           close enough to it.
const LEG_DEFAULTS = { knee: 0.3, shoulder: 2.0, thigh: 2.8, proud: 0.09, cannon: 0.8, foot: 1.3, frontSet: 0, hindSet: 0 };
// Share of a hind leg's run that lies above the hock.
const HOCK_RUN = 0.66;
// A limb's ring is a hexagon with a corner to each side, so fore and aft it
// reaches only this fraction of its stated radius.
const HEX = Math.sin(Math.PI / 3);

// The shared body plan for every four-legged animal in the book. Everything
// scales off `height` and faces +z; a species is this plan at its own
// proportions plus whatever it hangs on the skull.
//
// THE BODY IS ONE LOFT, rump to throat. A capsule barrel with a neck stuck on
// its front and masses bolted to its back cannot be tuned into an animal: the
// barrel has no chest, the masses read as growths, and the neck leaves the
// rounded front of a sausage. So the trunk is a row of sections instead, each
// stated as a top point, a bottom point and a half-width, and the side profile
// IS those two rows of points: croup, back and withers along the top; flank,
// belly and brisket along the bottom. With a neck asked for, the same two lines
// simply carry on — the topline up the nape, the underline off the breast and
// up the throat — so the neck is the body's own outline continuing, not a part.
//
// THE TORSO, in units of `bodyR` measured from the body's axis (`torso`, every
// key optional):
//
//   chest      depth of the brisket below the axis, at the shoulder
//   loin       depth of the flank below the axis, ahead of the hind legs —
//              less than `chest` is the belly line rising aft
//   withers    height of the topline over the front legs
//   back       ...at the middle of the back (below both ends is a sway)
//   croup      ...over the hind legs
//   rump       how full the trunk stays behind the hips: 1 carries most of
//              its depth to the buttock and turns down there, 0 tapers it
//              away to a point — and moves the default tail root with it
//   shoulderW / barrelW / hipW   half-widths at shoulder, mid-barrel and hip
//
// The shoulder section stands over the front legs and the hip section over the
// hind ones (`hipZ`), so `bodyLen` now only decides how far the breast and the
// rump overhang them.
//
// THE LEG RULE, which the first animals got wrong independently: a leg must run
// PAST the belly, not up to it. A body narrows toward its sides, so a leg
// standing at hip offset x meets the surface HIGHER than the body's lowest
// point, and a leg sized to the lowest point hangs in the air at the hip. The
// join height is read off the section the leg actually stands under
// (`flank` below), never hand-tuned, and `legBury` sinks it further in.
//
// A LEG IS A LIMB WITH A MASS ON TOP OF IT. Four identical posts make a table.
// Each leg is one closed loft whose first ring is the shoulder or the thigh,
// broad fore-and-aft and SUNK whole inside the trunk: a ring left standing out
// of the body shows its upper side as a shelf. The leg breaks the surface
// below that ring, where the next one swells a little proud of the flank
// (`legs.proud`) — which is what gives the body a haunch and a shoulder
// without a separate mass. Below that the path is not plumb: the front leg
// sets its elbow back and its knee forward, and the hind leg carries its
// stifle forward and its hock back (`legs.knee`) with the foot coming down
// under the hip, so each joint is a corner in the outline rather than a change
// of radius, and the animal stands on its hind legs rather than behind them.
// What shows below the belly has to carry mass of its own — a forearm, a
// thigh as wide as the rump behind the hip, a cannon with substance, a foot —
// because everything above the belly line is inside the trunk and a leg that
// is only thick up there is a stick. One mesh per leg.
export function makeQuadruped({
  height = 1,
  color = INK_LIT,
  // trunk: bodyR is its half-depth and the unit every torso knob is in;
  // legH + bodyDrop is the height of its axis off the ground
  bodyR = 0.22, bodyLen = 0.72, bodyDrop = 0.16,
  torso = null,          // { chest, loin, withers, back, croup, rump, shoulderW, barrelW, hipW } — see THE TORSO
  // legs
  legH = 0.52, legR = 0.055, legTaper = 0.82, hipX = 0.13, hipZ = 0.32,
  legBury = 0.06,        // how far above the flank's underside the shoulder/thigh ring rides, x height
  legs = null,           // { knee, shoulder, thigh, proud, cannon, foot, frontSet, hindSet } — see LEG_DEFAULTS
  // head
  head = { shape: 'sphere', r: 0.20, fwd: 0.56, up: 0.22 },   // + scaleX/scaleY/scaleZ (default 1): squish the skull in its own tilted frame
  neck = null,           // { r, w, root, set, taper, arch } — see NECK_DEFAULTS; null ends the chest in a blunt breast
  ears = null,           // { r, h, x, y, z, tilt } — DIRECT base offsets from the head's centre; see EARS ARE PLACED DIRECTLY below
  tail = null,           // { kind: 'stiff'|'strand', ... } — up/back default to the croup
  seed = 1,
  ...retired
} = {}) {
  // The masses the capsule plan bolted on are gone, and a stale call site would
  // otherwise build a plain animal and say nothing.
  for (const k of ['hump', 'haunch', 'shoulder', 'chest']) {
    if (retired[k] != null) {
      throw new Error(`makeQuadruped: '${k}' is retired — the body is one lofted profile now; `
        + 'shape it with torso { chest, loin, withers, back, croup, ... } and legs { shoulder, thigh }');
    }
  }
  // Same for the head parts: every species lofts its muzzle into the skull, and
  // a species with horns builds its own (buffalo.js).
  for (const k of ['snout', 'horns']) {
    if (retired[k] != null) {
      throw new Error(`makeQuadruped: '${k}' is retired — the muzzle is the front of the head `
        + 'loft, and horns belong to the species that wears them');
    }
  }
  if (neck && (neck.len !== undefined || neck.tilt !== undefined)) {
    throw new Error('makeQuadruped: neck takes { r, w, root, set, taper, arch } now — '
      + 'it runs from the shoulders to the head on its own, so len/tilt have nothing to set');
  }

  const g = new THREE.Group();
  const mat = washMaterial({ color, flat: true });
  const h = height;
  const R = bodyR * h;
  const legLen = legH * h;
  const bodyY = legLen + bodyDrop * h;
  const lerp = (a, b, t) => a + (b - a) * t;

  // A PROFILE LOFT — the one cut behind the trunk and every leg. Each station
  // is an ellipse standing across the animal: centre `c` and half-axis `a` are
  // [y, z] pairs in the side view, `w` is the half-width in x. Vertex 0 of a
  // ring sits at +x and the ring runs toward +a, so the rings' top and bottom
  // vertices trace exactly the two outlines the stations were written from.
  // Winding wants x cross a to point along the direction of travel: +y for a
  // trunk running forward, +z for a limb running down. Both ends are fanned
  // shut on an apex, so the mesh is closed and nothing has to be hidden.
  const profileLoft = (stations, seg, apex0, apex1) => {
    const pos = [], idx = [];
    for (const s of stations) {
      for (let j = 0; j < seg; j++) {
        const t = (j / seg) * Math.PI * 2;
        const sn = Math.sin(t);
        pos.push(Math.cos(t) * s.w, s.c[0] + sn * s.a[0], s.c[1] + sn * s.a[1]);
      }
    }
    const last = stations.length - 1;
    for (let i = 0; i < last; i++) {
      const a = i * seg, b = a + seg;
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        idx.push(a + j, a + j2, b + j, a + j2, b + j2, b + j);
      }
    }
    const p0 = pos.length / 3;
    pos.push(0, apex0[0], apex0[1]);
    for (let j = 0; j < seg; j++) idx.push(p0, (j + 1) % seg, j);
    const p1 = pos.length / 3;
    pos.push(0, apex1[0], apex1[1]);
    for (let j = 0; j < seg; j++) idx.push(p1, last * seg + j, last * seg + (j + 1) % seg);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };

  // ---- the trunk -----------------------------------------------------------
  const T = { ...TORSO_DEFAULTS, ...torso };
  const zHip = -hipZ * h, zShoulder = hipZ * h;
  const span = zShoulder - zHip;
  // how far the rump and the breast overhang the legs; never less than a stub,
  // so a short `bodyLen` cannot turn the end caps inside out
  const over = Math.max(0.3 * R, bodyLen * h / 2 + R - hipZ * h);
  // [z, top, bottom, half-width], heights and widths in R off the axis.
  // The flank row is where the belly stands highest: just ahead of the thigh,
  // not at the hip itself, where the thigh covers it anyway.
  const rows = [
    [zHip - lerp(0.84, 0.90, T.rump) * over, lerp(0.52, 0.66, T.rump) * T.croup, -lerp(0.20, 0.42, T.rump) * T.loin, lerp(0.42, 0.58, T.rump) * T.hipW],
    [zHip - lerp(0.36, 0.45, T.rump) * over, lerp(0.94, 0.95, T.rump) * T.croup, -lerp(0.70, 0.80, T.rump) * T.loin, lerp(0.88, 0.90, T.rump) * T.hipW],
    [zHip + 0.08 * span, T.croup, -0.96 * T.loin, T.hipW],
    [zHip + 0.36 * span, lerp(T.croup, T.back, 0.8), -T.loin, lerp(T.hipW, T.barrelW, 0.7)],
    [zHip + 0.68 * span, T.back, -lerp(T.loin, T.chest, 0.8), T.barrelW],
    [zShoulder, T.withers, -T.chest, T.shoulderW],
  ];
  const station = ([z, top, bot, w]) => ({
    c: [(top + bot) / 2 * R, z], a: [(top - bot) / 2 * R, 0], w: w * R,
  });
  const stations = rows.map(station);
  const rearApex = [0.16 * T.croup * R, zHip - over];
  const zBreast = zShoulder + over;

  // head centre, in the body's own frame (y off the axis)
  const Hy = head.up * h, Hz = head.fwd * h;
  let frontApex;
  let neckPlan = null;
  if (neck) {
    const N = { ...NECK_DEFAULTS, ...neck };
    // The root section is not upright: its top is the withers' own forward
    // edge and its bottom is the point of the breast, so the nape leaves the
    // topline and the throat leaves the chest — one section doing both.
    const top = [0.97 * T.withers * R, zShoulder + N.set * over];
    const bot = [-N.root * T.chest * R, zBreast];
    const c0 = [(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2];
    const a0 = [(top[0] - bot[0]) / 2, (top[1] - bot[1]) / 2];
    const len = Math.hypot(Hy - c0[0], Hz - c0[1]) || 1e-6;
    const d = [(Hy - c0[0]) / len, (Hz - c0[1]) / len];
    const nape = [d[1], -d[0]];               // x cross nape = d: the crest side
    const m0 = Math.hypot(a0[0], a0[1]);
    const rEnd = N.r * h;
    const w0 = 0.78 * T.shoulderW * R, wEnd = rEnd * N.w;
    stations.push({ c: c0, a: a0, w: w0 });
    // Between root and head the section turns from the root's slant to square
    // across the neck, and narrows on a curve rather than a straight wedge —
    // `taper` above 1 spends the depth early, which is a neck that leaves a
    // deep chest and is already slim by its middle.
    for (const t of [1 / 3, 2 / 3, 1]) {
      const k = Math.pow(1 - t, N.taper);
      const ay = lerp(a0[0] / m0, nape[0], t), az = lerp(a0[1] / m0, nape[1], t);
      const an = Math.hypot(ay, az) || 1;
      const m = lerp(rEnd, m0, k);
      const bow = Math.sin(Math.PI * t) * N.arch * len;
      stations.push({
        c: [lerp(c0[0], Hy, t) + nape[0] * bow, lerp(c0[1], Hz, t) + nape[1] * bow],
        a: [ay / an * m, az / an * m],
        w: lerp(wEnd, w0, k),
      });
    }
    // the last ring is centred on the head itself, so it ends inside the skull
    // whichever way a species turns that skull afterwards
    frontApex = [Hy + d[0] * rEnd * 0.3, Hz + d[1] * rEnd * 0.3];
    neckPlan = { root: [bodyY + c0[0], c0[1]], end: [bodyY + Hy, Hz], rootDepth: 2 * m0, endDepth: 2 * rEnd };
  } else {
    // no neck: the chest closes in a blunt breast, and the species seats its
    // skull on that
    stations.push(station([zShoulder + 0.55 * over, 0.74 * T.withers, -0.70 * T.chest, 0.72 * T.shoulderW]));
    stations.push(station([zShoulder + 0.90 * over, 0.36 * T.withers, -0.34 * T.chest, 0.36 * T.shoulderW]));
    frontApex = [0, zBreast];
  }

  const body = new THREE.Mesh(profileLoft(stations, 8, rearApex, frontApex), mat);
  body.name = 'body';
  // the mesh stands on the body's axis with no rotation of its own: local y is
  // up and local z is forward, so a species may scale x and y to breathe
  body.position.set(0, bodyY, 0);
  g.add(body);

  // the trunk's section at any z between rump and shoulder, off the axis
  const sectionAt = (z) => {
    let i = 0;
    while (i < rows.length - 2 && z > rows[i + 1][0]) i++;
    const a = rows[i], b = rows[i + 1];
    const t = Math.min(1, Math.max(0, (z - a[0]) / (b[0] - a[0])));
    return { top: lerp(a[1], b[1], t) * R, bot: lerp(a[2], b[2], t) * R, w: lerp(a[3], b[3], t) * R };
  };
  // The trunk's ring is an OCTAGON inscribed in each section's ellipse, and a
  // join solved against the ellipse lands outside the facet that is actually
  // there. This is the octagon's own half-profile: for a fraction t of one
  // half-axis, the fraction of the other the surface stands at.
  const facet = (t) => {
    const a = Math.min(1, Math.abs(t)), c = Math.SQRT1_2;
    return a <= c ? 1 - a * (1 - c) / c : c * (1 - a) / (1 - c);
  };
  // see THE LEG RULE: the surface's own height at lateral offset x, upper
  // (side = 1) or under (side = -1), in world y
  const flank = (z, x, side) => {
    const s = sectionAt(z);
    return bodyY + (s.top + s.bot) / 2 + side * (s.top - s.bot) / 2 * facet(x / s.w);
  };

  // ---- the legs --------------------------------------------------------------
  const LG = { ...LEG_DEFAULTS, ...legs };
  const lr = legR * h;
  // The cannon, and the foot it stands on. A FOOT IS A BLOCK: two level rings
  // a little apart, so it keeps its length for a height of its own — a leg
  // that only flares where it meets the ground stands on a point. It is longer
  // than it is wide, never slimmer than the cannon, and its heel is nearly
  // the cannon's own back, so its length reaches forward.
  const C = LG.cannon * lr;
  const fR = Math.max(C, LG.foot * lr), fX = Math.max(0.95 * C, 0.74 * fR), fH = 0.7 * lr;

  // A limb from a path. `pts` are [y, z, rz, rx] from the top ring down: y and
  // z relative to the leg's own origin, rz the fore-aft radius, rx the lateral
  // one. Each ring stands square to the path, so a bend carries its ring round
  // with it — except the first and the last, which are held level: the mass on
  // top closes in a cone up into the body, and a foot is flat on the ground.
  const limb = (pts, capH) => {
    const last = pts.length - 1;
    const sts = pts.map(([y, z, rz, rx, level], i) => {
      let dy = -1, dz = 0;
      if (i > 0 && i < last && !level) {
        dy = pts[i + 1][0] - pts[i - 1][0]; dz = pts[i + 1][1] - pts[i - 1][1];
        const n = Math.hypot(dy, dz) || 1; dy /= n; dz /= n;
      }
      return { c: [y, z], a: [dz * rz, -dy * rz], w: rx };
    });
    return profileLoft(sts, 6, [capH, pts[0][1]], [pts[last][0], pts[last][1]]);
  };

  // Is a point (in the animal's frame) inside the trunk that was just built?
  // Parity of crossings along one skew ray, asked of the body's own triangles,
  // so it is true of the faceted, slanted thing that renders and not of an
  // idealised section. This is what lets a leg's top be SUNK rather than
  // guessed at.
  const inTrunk = (() => {
    const p = body.geometry.getAttribute('position').array;
    const ix = body.geometry.index.array;
    const dx = 0.5377, dy = 0.8011, dz = 0.2618;
    return (x, y, z) => {
      const py = y - bodyY;
      let hits = 0;
      for (let i = 0; i < ix.length; i += 3) {
        const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
        const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
        const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
        const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (Math.abs(det) < 1e-14) continue;
        const sx = x - p[a], sy = py - p[a + 1], sz = z - p[a + 2];
        const u = (sx * hx + sy * hy + sz * hz) / det;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy + dz * qz) / det;
        if (v < 0 || u + v > 1) continue;
        if ((e2x * qx + e2y * qy + e2z * qz) / det > 1e-9) hits++;
      }
      return hits % 2 === 1;
    };
  })();

  const legTop = {};
  for (const hind of [false, true]) {
    const z = hind ? zHip - LG.hindSet * h : zShoulder + LG.frontSet * h;
    const s = sectionAt(z);
    // A leg cannot stand wider than the body it hangs from: past the section's
    // own half-width there is no flank to join, and the leg would hang in the
    // air beside the animal. So the stance is held inside it.
    const hx = Math.min(hipX * h, 0.86 * s.w);
    // see THE LEG RULE above — and the join stays under the back as well,
    // however far `legBury` is cranked
    const floor = flank(z, hx, -1), roof = flank(z, hx, 1);
    const top = Math.min(floor + legBury * h, roof - 0.15 * (roof - floor));
    legTop[hind ? 'hind' : 'front'] = top;
    const run = top;                                  // the ring's height off the ground
    const rz = lr * (hind ? LG.thigh : LG.shoulder * legTaper);
    // How wide the body is at a height, at this leg's own section.
    const widthAt = (y) => s.w * facet((y - bodyY - (s.top + s.bot) / 2) / ((s.top - s.bot) / 2));
    // ACROSS, the mass is solved rather than stated: wide enough to stand
    // `proud` of the flank, so the haunch shows from the front and from above
    // whatever the body's own width is there.
    const proudAt = (y) => Math.min(rz, Math.max(0.9 * lr, widthAt(y) + LG.proud * R - hx));

    // THE TOP RING IS SUNK. A ring standing out of the trunk shows its upper
    // side as a level shelf — a box corner on the shoulder, an epaulette
    // either side of the chest from the front. So the ring the limb hangs
    // from is shrunk until every corner of it is inside the body, with a
    // margin, and the leg first breaks the surface BELOW it, along the run
    // down to the next ring: a slope of muscle, which is all a shoulder is.
    // The front mass rides behind the shoulder point and the hind one ahead
    // of the hip, because that is where there is trunk to bury them in — the
    // chest closes into the neck just ahead of the front legs, and the rump
    // tapers away just behind the hind ones.
    const SINK = 1.12;                                // how far inside: the ring must fit at this much its own size
    // Across first, then fore-and-aft, each on its own: a body too narrow for
    // the ring must not cost the mass its length, nor the other way about.
    // And before it is cut down fore-and-aft it is offered a little more
    // room, further toward the middle of the animal; the fullest fit wins.
    let ringZ = 0, rz0 = 0, rx0 = 0;
    for (const slide of [0.3, 0.45, 0.6]) {
      const zr = (hind ? slide : -slide) * rz;
      let fz = rz, fx = Math.min(rz, Math.max(0.9 * lr, widthAt(top) - hx));
      const fits = (j) => {
        const t = (j / 6) * Math.PI * 2;
        return inTrunk(hx + Math.cos(t) * fx * SINK, top, z + zr + Math.sin(t) * fz * SINK);
      };
      for (let k = 0; k < 30 && !(fits(0) && fits(3)); k++) fx *= 0.94;
      for (let k = 0; k < 30 && !(fits(1) && fits(2) && fits(4) && fits(5)); k++) fz *= 0.94;
      if (fz * fx > rz0 * rx0 * 1.02) { ringZ = zr; rz0 = fz; rx0 = fx; }
    }
    // Its cap is a cone up into the body, kept under the back.
    const capH = Math.max(0.1 * rz0, Math.min(1.1 * rz0, 0.8 * (roof - top)));

    let pts;
    if (hind) {
      // STIFLE FORWARD, HOCK BACK, FOOT UNDER THE HIP. `knee` sets how far
      // apart the stifle and the hock stand fore-and-aft, laid half ahead of
      // the hip and half behind it: the hock is the corner that shows behind
      // the animal, and the cannon leans forward off it to bring the foot
      // back under the hip — a leg that only rakes back to its hock is an
      // animal standing behind itself. The hock sits LOW: a joint at
      // mid-height lands where the thigh's own mass is and the fold vanishes
      // into it.
      const hb = Math.tan(LG.knee) * HOCK_RUN * run;
      const zHock = -0.5 * hb;
      const zPastern = zHock + 0.2 * hb;
      const zFoot = zPastern + 0.9 * HEX * (fR - C);
      // THE THIGH IS STATED BY ITS TWO EDGES, not a centre and a radius. Its
      // rear edge is the rump's own end carried on down (so `hindSet` decides
      // how much rump is left overhanging it), but never further back than
      // the point of the hock, which has to stay the rearmost thing on the
      // leg. Its front edge is the stifle, under the flank. A thigh hung as a
      // bar from the middle of the belly leaves the rump as a stub behind it.
      const thighBack = Math.min(0.6 * lr - zHock, Math.max(0.4 * rz, 0.88 * over - LG.hindSet * h));
      const thighFront = 0.5 * hb + 0.62 * rz;
      const zStifle = (thighFront - thighBack) / 2, rT = (thighFront + thighBack) / 2 / HEX;
      pts = [
        [0, ringZ, rz0, rx0],
        [-0.26 * run, zStifle, rT, Math.max(proudAt(top), 1.1 * lr)],
        [-0.46 * run, lerp(zStifle, zHock, 0.55), lerp(rT, lr, 0.66), 1.15 * lr],
        [-HOCK_RUN * run, zHock, 1.0 * lr, 0.9 * lr],
        [-0.80 * run, zHock + 0.09 * hb, 1.08 * C, C],
        [-(run - 1.25 * fH), zPastern, 1.05 * C, 0.95 * C],
        [-(run - 0.7 * fH), zFoot, fR, fX, true],
        [-run, zFoot, 1.05 * fR, 1.05 * fX, true],
      ];
    } else {
      // The elbow rides at the belly line and a touch back; the knee splits
      // what is left and stands a touch forward. Between the sunk ring and
      // the elbow sits the shoulder's own swell, where the mass is allowed to
      // stand proud — never fuller fore-and-aft than the ring above it, so
      // the surface between them leans out and down rather than up. Across,
      // the swell is held to the plain leg's width: wider, its upper side
      // shows on a narrow chest as a ledge. THE FOREARM IS THE VISIBLE MASS:
      // everything above the elbow is inside the chest, so a leg that is only
      // thick up there is a post from the belly down. It is broadest at the
      // elbow and spends that on the way to the knee.
      const rE = lr * legTaper * 1.45;
      const rK = Math.max(1.15 * C, 0.95 * lr);
      const eY = Math.min(0.42 * run, Math.max(0.26 * run, legBury * h * 1.1));
      const low = run - eY;
      const yS = -0.5 * eY;
      const zFoot = 0.1 * lr + 0.9 * HEX * (fR - C);
      pts = [
        [0, ringZ, rz0, rx0],
        [yS, 0.4 * ringZ, Math.min(rz0, lerp(rz, 1.15 * lr * legTaper, 0.5)), Math.max(proudAt(top), lr * legTaper)],
        [-eY, -0.25 * lr, rE, 0.78 * rE],
        [-eY - 0.27 * low, -0.05 * lr, lerp(rE, rK, 0.45), 0.8 * lerp(rE, rK, 0.45)],
        [-eY - 0.52 * low, 0.2 * lr, rK, 0.9 * rK],
        [-eY - 0.76 * low, 0.1 * lr, C, 0.92 * C],
        [-(run - 1.25 * fH), 0.1 * lr, C, 0.92 * C],
        [-(run - 0.7 * fH), zFoot, fR, fX, true],
        [-run, zFoot, 1.05 * fR, 1.05 * fX, true],
      ];
    }
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(limb(pts, capH), mat);
      leg.name = 'leg';
      // the origin is the join itself — the shoulder or hip point, at the
      // height of the mass's ring — so a species that re-seats a leg moves and
      // scales it about that point
      leg.position.set(sx * hx, top, z);
      // how far the limb hangs from the trunk section it belongs to (see
      // frontSet / hindSet), for anything that has to find that section again
      leg.userData.setZ = z - (hind ? zHip : zShoulder);
      g.add(leg);
    }
  }

  const headY = bodyY + Hy;
  const headZ = Hz;

  // A circular ring loft for the small pointed parts — ears, a stiff tail.
  // `stations` is [{ p: [x,y,z], r }] from ROOT to TIP: the root ring stays
  // open (it is always buried inside a larger mass), the tip is fanned shut.
  // Each ring sits square to the path's own tangent, so a curved run carries
  // its rings around the bend without shearing.
  const loft = (stations, seg, spin = 0) => {
    const P = stations.map((s) => new THREE.Vector3(...s.p));
    const last = P.length - 1;
    const pos = [];
    for (let i = 0; i < P.length; i++) {
      const t = P[Math.min(i + 1, last)].clone().sub(P[Math.max(i - 1, 0)]).normalize();
      const seed = Math.abs(t.x) > 0.9
        ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const b1 = seed.cross(t).normalize();
      const b2 = t.clone().cross(b1);
      for (let j = 0; j < seg; j++) {
        const a = spin + (j / seg) * Math.PI * 2;
        const c = Math.cos(a) * stations[i].r, s = Math.sin(a) * stations[i].r;
        pos.push(P[i].x + b2.x * c + b1.x * s,
          P[i].y + b2.y * c + b1.y * s,
          P[i].z + b2.z * c + b1.z * s);
      }
    }
    const idx = [];
    for (let i = 0; i < last; i++) {
      const a = i * seg, b = a + seg;
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        idx.push(a + j, b + j, a + j2, a + j2, b + j, b + j2);
      }
    }
    const tip = pos.length / 3;
    pos.push(P[last].x, P[last].y, P[last].z);
    for (let j = 0; j < seg; j++)
      idx.push(tip, last * seg + (j + 1) % seg, last * seg + j);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };

  const headMesh = head.shape === 'box'
    ? new THREE.Mesh(new THREE.BoxGeometry(head.w * h, head.hh * h, head.d * h), mat)
    : new THREE.Mesh(new THREE.SphereGeometry(head.r * h, 12, 10), mat);
  headMesh.name = 'head';
  headMesh.position.set(0, headY, headZ);
  // the skull SQUISH: a sphere r is one number, and no real head is a ball —
  // per-axis scales (defaulting to 1) let a
  // species flatten, lengthen or narrow it without a new shape. Applied in
  // the mesh's own frame, so a tilted head squishes along its own axes.
  headMesh.scale.set(head.scaleX ?? 1, head.scaleY ?? 1, head.scaleZ ?? 1);
  // A head held level projects like a drawer pulled out of the chest. Nosing it
  // down sinks the back of the skull into the shoulder and leaves the muzzle as
  // the thing that sticks out, which is what the silhouette wants.
  if (head.tilt) headMesh.rotation.x = head.tilt;
  g.add(headMesh);

  // EARS ARE PLACED DIRECTLY — width, height, position, angle. Nothing hidden.
  //
  //   r      base radius (the ear's width)      — in units of height
  //   h      the ear's length
  //   x      lateral offset of the BASE from the head's centre (mirrored ±)
  //   y, z   base offset up / forward from the head's centre
  //   tilt   lean off vertical, OUTWARD (the pair spreads)
  //
  // The base ring is a flared loft, so push {x,y,z} INSIDE the skull to bury
  // the join — how close the ear sits to the head is a DIAL here, not a hidden
  // constant. This replaces the aim-ray scheme, which normalized {x, up, fwd}
  // into a direction and snapped the base onto the surface at a fixed sink: the
  // magnitudes did nothing (the dog's x: 0.005 still landed 45° out on the
  // crown, because only the RATIO survived), and the ear-to-head distance was
  // untunable: no amount of work in the model viewer could move it, because the
  // knob did not exist.
  if (ears) {
    if (ears.up !== undefined || ears.fwd !== undefined) {
      throw new Error('ears take direct head-relative offsets { r, h, x, y, z, tilt } now — '
        + 'up/fwd belonged to the old aim-ray scheme; see EARS ARE PLACED DIRECTLY in quadruped.js');
    }
    for (const sx of [-1, 1]) {
      // Not a bare cone: the base ring FLARES a quarter wider than the stated
      // radius and waists back in just above it, so the ear grows OUT of the
      // skull the way a real ear roots in a muscle bulge, instead of a
      // triangle resting on the surface. 5-gon, and the half-facet of
      // pre-spin (π/5) centres a flat face on +z so the book's 3/4 cameras
      // never catch an edge-on sliver.
      const m = new THREE.Mesh(loft([
        { p: [0, 0, 0], r: ears.r * h * 1.25 },
        { p: [0, ears.h * h * 0.30, 0], r: ears.r * h * 0.92 },
        { p: [0, ears.h * h, 0], r: ears.r * h * 0.02 },
      ], 5, Math.PI / 5), mat);
      m.name = 'ear';
      m.position.set(
        sx * (ears.x || 0) * h,
        headY + (ears.y || 0) * h,
        headZ + (ears.z || 0) * h);
      // The cant lives in rotation.z and NEVER rotation.x — that channel is
      // the hinge the species animate (the fox's flick and the cat's swivel
      // overwrite it every frame, so anything stored there would be lost on
      // the first update). Sign note: rotating +y about +z sends it toward
      // -x, so the LEFT ear (sx = -1) takes the POSITIVE angle.
      m.rotation.z = -sx * (ears.tilt || 0);
      g.add(m);
    }
  }

  // WHERE A TAIL LEAVES THE BODY, when the species does not say: the croup —
  // on the topline behind the hip, sunk just under the surface so the join is
  // buried. Read off the trunk's own sections, so it follows a retuned rump —
  // and set further back on a full one, where a root nearer the hip hangs
  // its tail down inside the buttock and the thighs.
  const croupZ = zHip - lerp(0.6, 0.88, T.rump) * over;
  const croupY = bodyY + sectionAt(croupZ).top - 0.12 * R;
  const tailY = tail && tail.up !== undefined ? bodyY + tail.up * h : croupY;
  const tailZ = tail && tail.back !== undefined ? -tail.back * h : croupZ;

  let strand = null;
  if (tail && tail.kind === 'strand') {
    strand = makeTail({
      segments: tail.segments ?? 7,
      length: tail.length * h,
      thickness: tail.thickness * h,
      color: tail.color ?? color,
      seed,
      // How the tail leaves the rump. Down and BACK by default rather than
      // straight down: a strand pinned at one node hangs flat against the
      // flank, and a swish then swings it through the animal — the buffalo's
      // rotated around inside its own barrel. Held a little clear of the body,
      // the same swish whips outward, which is what a tail does. `tail.root`
      // overrides it for a beast that carries its own differently.
      root: tail.root ?? [0, -0.72, -0.69],
      swell: tail.swell ?? 0,
    });
    strand.group.position.set(0, tailY, tailZ);
    g.add(strand.group);
  } else if (tail && tail.kind === 'stiff') {
    // Centred on its own origin and laid along local +y, root end down, so the
    // species' root-pinning arithmetic (half a length back along the tilt) is
    // unchanged. It closes to a point rather than a sawn-off disc, and
    // `swell` lets it fatten past both ends on the way — a brush, where a
    // plain taper is a stick.
    const len = tail.length * h, r0 = tail.r0 * h, r1 = tail.r1 * h;
    const sts = [{ p: [0, -len / 2, 0], r: r1 }];
    if (tail.swell) sts.push({ p: [0, -len * 0.08, 0], r: Math.max(r0, r1) * tail.swell });
    sts.push({ p: [0, len * 0.36, 0], r: tail.swell ? lerp(Math.max(r0, r1) * tail.swell, r0, 0.6) : lerp(r1, r0, 0.86) });
    sts.push({ p: [0, len / 2, 0], r: r0 * 0.3 });
    const m = new THREE.Mesh(loft(sts, 6), mat);
    m.name = 'tail';
    m.position.set(0, tailY, tailZ);
    m.rotation.x = tail.tilt ?? -1.0;
    g.add(m);
  }

  return {
    group: g, tail: strand, material: mat,
    // What the plan solved, for a species that has to seat something against
    // it. World units in the animal's own frame.
    plan: {
      bodyY, R, zHip, zShoulder,
      legTop,                                   // { front, hind }: height of each leg's top ring
      topAt: (z) => bodyY + sectionAt(z).top,   // the back line, rump to shoulder
      bellyAt: (z) => bodyY + sectionAt(z).bot, // and the underline
      neck: neckPlan,                           // { root, end: [y, z], rootDepth, endDepth } or null
    },
  };
}
