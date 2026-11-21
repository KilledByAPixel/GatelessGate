import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { INK_LIT } from '../palette.js';
import { makeTail } from './tail.js';

// What a species gets when it states nothing: a plain, lean animal. Every
// number here is in the units its option is documented in beside the builder.
const TORSO_DEFAULTS = {
  chest: 1.1, loin: 0.72, withers: 1.0, back: 0.9, croup: 0.94, rump: 1, round: 0, sag: null,
  shoulderW: 0.8, barrelW: 0.95, hipW: 0.85, slab: 0,
};
// THE SLAB-SIDED CHEST (`torso.slab`). SLAB_Y is how far down a fully slabbed
// section's two lower corners stand, x its half-depth (round, they stand on
// the ellipse); how far out they stand is solved from the front legs, between
// the ellipse and SLAB_MAX of the half-width. SLAB_BACK is how much of the
// slab is left one section behind the shoulder, where the chest is giving
// way to the barrel.
const SLAB_Y = 0.84, SLAB_MAX = 0.97, SLAB_BACK = 0.3;
// THE ROUND OF A RUMP (`torso.round`), as the three sections it is drawn
// with behind the hip: [how far along the overhang, how deep the underside
// still is (x loin), half-width (x hipW)], from the end forward. The topline
// over them is not listed — it is an arc (ROUND_ARC: 2 is a quarter ellipse,
// higher is squarer) from the croup down to the rump's hindmost point, which
// sits ROUND_LOW (x loin) BELOW the axis. See THE RUMP beside the rows.
const ROUND_ROWS = [[0.93, 0.66, 0.6], [0.7, 0.84, 0.86], [0.4, 0.92, 0.95]];
const ROUND_ARC = 2;
const ROUND_LOW = 0.38;
// Where on that arc a tail roots when the species does not say, as a fraction
// of the overhang: on the turn, not at the end of it, where the arc has
// already fallen to the buttock.
const ROUND_ROOT = 0.76;
// r      half-depth of the neck where it enters the skull, x height
// w      how wide that end is across, as a fraction of its depth
// root   how far down the chest the throat line starts, as a fraction of
//        `torso.chest` — lower is a deeper neck root and a fuller breast
// set    where the nape leaves the topline, as a fraction of the breast's
//        overhang ahead of the shoulder
// taper  1 is a straight wedge root to head; higher slims the neck sooner
// arch   bow of the whole neck toward its crest, x its own length
// ease   how far up the nape the top of the root section is carried, as a
//        fraction of the run from the withers to the nape's first section:
//        0 leaves it just under the withers (see THE BASE OF THE NECK)
// easeUp ...and how much of that run's climb it has made by there: 1 is on
//        the straight line, so the whole turn is at the withers; lower moves
//        the turn forward, onto the root itself
const NECK_DEFAULTS = { r: 0.08, w: 0.8, root: 0.55, set: 0.25, taper: 1.5, arch: 0.03, ease: 0, easeUp: 0.75 };
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
// gaskin    how far the hind leg has slimmed from the thigh's breadth to the
//           plain leg's by the section midway between stifle and hock: 0 is
//           still the whole thigh there, 1 the leg's own radius. High is a
//           lean second thigh under a full haunch; low carries the haunch
//           most of the way to the hock
// point     null leaves the front leg a limb from the belly down. A number
//           builds THE UPPER ARM (see it beside the front leg's rows): how
//           far AHEAD of the leg its buried ring reaches, as a fraction of
//           the breast's overhang in front of the leg — and never further
//           than there is chest to hold it
// arm       ...and how far BEHIND the forearm's own rear edge it reaches, x legR
// drop      ...and how far below the belly line the forearm proper starts,
//           as a fraction of the leg's length under the belly: the run over
//           which the leg widens into the chest
// spread    ...and how far out toward the hide that ring is carried across:
//           0 keeps the leg's own width, for a chest whose corner already
//           stands over the leg; 1 is for a stance well inside a wide chest
// elbow     fore-aft radius of the forearm at its top, x legR (and x legTaper)
const LEG_DEFAULTS = {
  knee: 0.3, shoulder: 2.0, thigh: 2.8, proud: 0.09, cannon: 0.8, foot: 1.3, frontSet: 0, hindSet: 0, gaskin: 0.66,
  point: null, arm: 1.5, drop: 0.12, spread: 0, elbow: 1.45,
};
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
//   round      how that full rump ends: 0 is a blunt cap, its top carried
//              nearly level to a corner; 1 turns the croup over and down in
//              one arc to the buttock, with the thigh carrying the line on
//              (see THE RUMP beside the trunk's rows)
//   sag        null states the back by `back`. A number states it instead as
//              ONE line from croup to withers that sags this far at its
//              middle — for a back that falls a long way, which the fixed
//              middle sections otherwise spend as a rise, a table and a step
//   shoulderW / barrelW / hipW   half-widths at shoulder, mid-barrel and hip
//   slab       how slab-sided the chest is over the front legs: 0 is the
//              round section everywhere, 1 carries the chest's sides straight
//              down to a corner over each leg, with the brisket a keel
//              between (see THE CHEST IS SLAB-SIDED beside the rows)
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
//
// THE FRONT SHOULDER IS THE TRUNK'S, where a species asks for one. A swell on
// the leg can only give a haunch, which hangs below the body: a shoulder lies
// ON the ribs above the belly line, and anything of the leg's own up there is
// a second surface crossing the flank. So it is two things, each opted into:
// the chest's sides brought straight down over the legs (`torso.slab`, see THE
// CHEST IS SLAB-SIDED), and the leg widened into that chest above its forearm
// (`legs.point`, see THE UPPER ARM). Stated neither, the front leg is the limb
// described above.
export function makeQuadruped({
  height = 1,
  color = INK_LIT,
  // trunk: bodyR is its half-depth and the unit every torso knob is in;
  // legH + bodyDrop is the height of its axis off the ground
  bodyR = 0.22, bodyLen = 0.72, bodyDrop = 0.16,
  torso = null,          // { chest, loin, withers, back, croup, rump, round, sag, slab, shoulderW, barrelW, hipW } — see THE TORSO
  // legs
  legH = 0.52, legR = 0.055, legTaper = 0.82, hipX = 0.13, hipZ = 0.32,
  legBury = 0.06,        // how far above the flank's underside the shoulder/thigh ring rides, x height
  legs = null,           // { knee, shoulder, thigh, proud, cannon, foot, frontSet, hindSet, gaskin, point, arm, drop, spread, elbow } — see LEG_DEFAULTS
  // head
  head = { shape: 'sphere', r: 0.20, fwd: 0.56, up: 0.22 },   // + scaleX/scaleY/scaleZ (default 1): squish the skull in its own tilted frame
  neck = null,           // { r, w, root, set, taper, arch, ease, easeUp } — see NECK_DEFAULTS; null ends the chest in a blunt breast
  ears = null,           // { r, h, x, y, z, tilt } — DIRECT base offsets from the head's centre; see EARS ARE PLACED DIRECTLY below
  tail = null,           // { kind: 'stiff'|'strand', ... } — up/back default to the croup; a strand takes makeTail's root/swell/swellAt/swellSpan, and its rootSink x height
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
        const cs = Math.cos(t);
        // a lower corner of a slab-sided section stands where the section says
        if (s.k && sn < -0.5 && Math.abs(cs) > 0.5) {
          pos.push(Math.sign(cs) * s.k[0] * s.w, s.c[0] - s.k[1] * s.a[0], s.c[1] - s.k[1] * s.a[1]);
        } else pos.push(cs * s.w, s.c[0] + sn * s.a[0], s.c[1] + sn * s.a[1]);
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
  // The back, at a fraction of the way from hip to shoulder: by `back` at
  // the plan's own middle sections, or as one sagging line (`sag`).
  const backAt = (f, stated) => (T.sag == null ? stated
    : lerp(T.croup, T.withers, f) - T.sag * Math.sin(Math.PI * f));
  // Behind the hip, as [fraction of the overhang, top, bottom, half-width],
  // nearest the end first.
  const blunt = [
    [lerp(0.84, 0.90, T.rump), lerp(0.52, 0.66, T.rump) * T.croup, -lerp(0.20, 0.42, T.rump) * T.loin, lerp(0.42, 0.58, T.rump) * T.hipW],
    [lerp(0.36, 0.45, T.rump), lerp(0.94, 0.95, T.rump) * T.croup, -lerp(0.70, 0.80, T.rump) * T.loin, lerp(0.88, 0.90, T.rump) * T.hipW],
  ];
  // THE RUMP. Blunt, the trunk carries its top nearly level to the end and
  // closes on a point at mid-height: a box corner under the tail, and an end
  // that is cut away BELOW, exactly where the thigh's buried top needs trunk
  // around it. Rounding that shape — drawing its top down — uncovers the
  // thigh and shows it as a shelf either side of the tail. So a round rump
  // is a different section, not a softened one: the UNDERSIDE keeps its depth
  // to the end, the hindmost point drops below the axis to the buttock, and
  // the whole turn is spent on the topline, as one arc from the croup down to
  // that point. The thigh's rear edge starts just under it, so the outline
  // runs croup, buttock, thigh, hock without a notch, and the leg's top is
  // solved against a rump that is fullest where it is buried. One more
  // section than the blunt cap has, because an arc drawn through two is a
  // chamfer.
  const yEnd = lerp(0.16 * T.croup, -ROUND_LOW * T.loin, T.round);
  let rear = blunt;
  if (T.round > 0) {
    const mid = blunt[0].map((v, k) => lerp(v, blunt[1][k], 0.5));
    rear = [blunt[0], mid, blunt[1]].map((b, i) => {
      const [u, deep, w] = ROUND_ROWS[i];
      const arc = Math.pow(1 - Math.pow(u, ROUND_ARC), 1 / ROUND_ARC);
      const full = [u, lerp(-ROUND_LOW * T.loin, T.croup, arc), -deep * T.loin, w * T.hipW];
      return b.map((v, k) => lerp(v, full[k], T.round));
    });
  }
  const rows = [
    ...rear.map(([u, top, bot, w]) => [zHip - u * over, top, bot, w]),
    [zHip + 0.08 * span, backAt(0.08, T.croup), -0.96 * T.loin, T.hipW],
    [zHip + 0.36 * span, backAt(0.36, lerp(T.croup, T.back, 0.8)), -T.loin, lerp(T.hipW, T.barrelW, 0.7)],
    [zHip + 0.68 * span, backAt(0.68, T.back), -lerp(T.loin, T.chest, 0.8), T.barrelW, SLAB_BACK * T.slab],
    [zShoulder, T.withers, -T.chest, T.shoulderW, T.slab],
  ];
  // THE CHEST IS SLAB-SIDED WHERE THE FRONT LEGS HANG. A round section's lower
  // sides fall away under its widest line at half a right angle, so a front
  // leg comes out from under an overhang: a post entering the underside of the
  // chest, with the facet above it in shadow like a socket. A chest's sides
  // come straight down to the elbows and the brisket is a keel between the
  // legs. So the shoulder section, and the breast ahead of it, carry their
  // two lower corners out and down (`torso.slab`): the flank over the leg is
  // one upright face, lit like the leg's own side, and it turns under again
  // only behind the elbow, on the way to the barrel. That face IS the
  // shoulder — it belongs to the trunk, so there is no second surface lying
  // on the ribs to cut in and out of them, and a leg that swings on its
  // buried top has nothing fused to it to tear.
  //
  // THE CORNER STANDS OVER THE LEG'S OWN OUTER SIDE. Further out, the chest
  // hangs past the leg as an eave and the leg comes out from under it again;
  // further in, the leg stands beside the chest. So how far out it stands is
  // read off the stance and the forearm, not stated.
  const LGs = { ...LEG_DEFAULTS, ...legs };
  const slabX = Math.min(SLAB_MAX, Math.max(Math.SQRT1_2,
    (Math.min(hipX * h, 0.86 * T.shoulderW * R) + 0.78 * LGs.elbow * legTaper * legR * h) / (T.shoulderW * R)));
  const corner = (slab) => (slab ? [lerp(Math.SQRT1_2, slabX, slab), lerp(Math.SQRT1_2, SLAB_Y, slab)] : null);
  const station = ([z, top, bot, w, slab]) => ({
    c: [(top + bot) / 2 * R, z], a: [(top - bot) / 2 * R, 0], w: w * R, k: corner(slab),
  });
  const stations = rows.map(station);
  const rearApex = [yEnd * R, zHip - over];
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
    const rootAt = stations.length;
    stations.push({ c: c0, a: a0, w: w0, k: corner(T.slab) });
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
    // THE BASE OF THE NECK. The root's top stands just under the withers and
    // barely ahead of them, so the topline arrives level, steps down a hair,
    // and then turns the whole angle of the nape at that one low point: a
    // notch where the neck is plugged into the back. `ease` carries that
    // point forward along the run from the withers to the nape's first
    // section, and up by only `easeUp` of what that run climbs — under the
    // straight line, so the back turns up into the nape in three shallow
    // corners (withers, root, first section) instead of one deep one. Only
    // the root's own ring moves: the neck above it was laid from the
    // unmoved root and stays where it was.
    if (N.ease) {
      const n1 = stations[rootAt + 1];
      const wy = T.withers * R, ny = n1.c[0] + n1.a[0], nz = n1.c[1] + n1.a[1];
      const ty = wy + N.easeUp * N.ease * (ny - wy), tz = zShoulder + N.ease * (nz - zShoulder);
      stations[rootAt] = {
        c: [(ty + bot[0]) / 2, (tz + bot[1]) / 2], a: [(ty - bot[0]) / 2, (tz - bot[1]) / 2], w: w0, k: corner(T.slab),
      };
    }
    // the last ring is centred on the head itself, so it ends inside the skull
    // whichever way a species turns that skull afterwards
    frontApex = [Hy + d[0] * rEnd * 0.3, Hz + d[1] * rEnd * 0.3];
    neckPlan = { root: [bodyY + c0[0], c0[1]], end: [bodyY + Hy, Hz], rootDepth: 2 * m0, endDepth: 2 * rEnd };
  } else {
    // no neck: the chest closes in a blunt breast, and the species seats its
    // skull on that
    stations.push(station([zShoulder + 0.55 * over, 0.74 * T.withers, -0.70 * T.chest, 0.72 * T.shoulderW, T.slab]));
    stations.push(station([zShoulder + 0.90 * over, 0.36 * T.withers, -0.34 * T.chest, 0.36 * T.shoulderW, T.slab]));
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
    return {
      top: lerp(a[1], b[1], t) * R, bot: lerp(a[2], b[2], t) * R, w: lerp(a[3], b[3], t) * R,
      slab: lerp(a[4] || 0, b[4] || 0, t),
    };
  };
  // The trunk's ring is an OCTAGON inscribed in each section's ellipse, and a
  // join solved against the ellipse lands outside the facet that is actually
  // there. This is the octagon's own half-profile: for a fraction t of one
  // half-axis, the fraction of the other the surface stands at. The corner it
  // turns at is the ellipse's own unless the section is slabbed below: `cx`
  // along the axis `t` is measured on, `cy` along the other.
  const facet = (t, cx = Math.SQRT1_2, cy = Math.SQRT1_2) => {
    const a = Math.min(1, Math.abs(t));
    return a <= cx ? 1 - a * (1 - cy) / cx : cy * (1 - a) / (1 - cx);
  };
  const cornerAt = (s) => corner(s.slab) || [Math.SQRT1_2, Math.SQRT1_2];
  // see THE LEG RULE: the surface's own height at lateral offset x, upper
  // (side = 1) or under (side = -1), in world y
  const flank = (z, x, side) => {
    const s = sectionAt(z);
    const [cx, cy] = side < 0 ? cornerAt(s) : [Math.SQRT1_2, Math.SQRT1_2];
    return bodyY + (s.top + s.bot) / 2 + side * (s.top - s.bot) / 2 * facet(x / s.w, cx, cy);
  };

  // ---- the legs --------------------------------------------------------------
  const LG = LGs;
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
    const widthAt = (y) => {
      const t = (y - bodyY - (s.top + s.bot) / 2) / ((s.top - s.bot) / 2);
      const [cx, cy] = t < 0 ? cornerAt(s) : [Math.SQRT1_2, Math.SQRT1_2];
      return s.w * facet(t, cy, cx);
    };
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
        [-0.46 * run, lerp(zStifle, zHock, 0.55), lerp(rT, lr, LG.gaskin), 1.15 * lr],
        [-HOCK_RUN * run, zHock, 1.0 * lr, 0.9 * lr],
        [-0.80 * run, zHock + 0.09 * hb, 1.08 * C, C],
        [-(run - 1.25 * fH), zPastern, 1.05 * C, 0.95 * C],
        [-(run - 0.7 * fH), zFoot, fR, fX, true],
        [-run, zFoot, 1.05 * fR, 1.05 * fX, true],
      ];
    } else if (LG.point != null) {
      // THE UPPER ARM. A front leg that keeps one width up to the belly line
      // meets it square: a post entering the underside of the chest, with a
      // notch in front of it under the breast and another behind it. A leg
      // WIDENS INTO THE BODY. So between the buried top and the forearm there
      // is one more ring, inside the chest just above the belly line and
      // stated like the thigh by its two edges: the front one reaches for the
      // breast (`point`), the rear one lies behind the elbow (`arm`). The
      // forearm proper starts a little below the belly (`drop`), and over
      // that run the leg's front line leans forward into the breast and its
      // rear line back into the belly. Across, the ring stays under the hide
      // (`spread`): the shoulder's breadth is the chest's own slab side
      // (`torso.slab`), and a mass of the leg's own standing on the ribs cuts
      // in and out of them along a ragged line however it is shaped. Each edge
      // is drawn in until its outer corner is inside the chest, or it stands
      // out of the narrowing breast as a prong. The lean of the front line is
      // paid for from in front: that face looks down, and a long one is a dark
      // band across the top of the leg.
      const rE = lr * legTaper * LG.elbow;
      const rK = Math.max(1.15 * C, 0.95 * lr);
      const eY = top - floor + Math.max(0.1 * legBury * h, LG.drop * floor);
      const low = run - eY;
      const zFoot = 0.1 * lr + 0.9 * HEX * (fR - C);
      const yP = lerp(floor, top, 0.5);
      // the hide's own half-width at a height and a station, off the trunk
      // that renders
      const hide = (y, zz) => {
        let lo = 0, hi = 2 * s.w;
        for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (inTrunk(m, y, zz)) lo = m; else hi = m; }
        return lo;
      };
      let fwd = Math.max(0, LG.point * (zBreast - z)), aft = 0.25 * lr + HEX * rE + LG.arm * lr;
      let rxP = 0, zP = 0;
      for (let k = 0; k < 60; k++) {
        zP = (fwd - aft) / 2;
        rxP = Math.max(0.78 * rE, LG.spread * (0.92 * hide(yP, z + zP) - hx));
        const under = (e) => inTrunk(hx + 0.5 * rxP, yP, z + e);
        const okF = fwd <= rE || under(fwd), okA = aft <= rE || under(-aft);
        if (okF && okA) break;
        if (!okF) fwd *= 0.95;
        if (!okA) aft *= 0.95;
      }
      pts = [
        [0, ringZ, rz0, rx0],
        [yP - top, zP, (fwd + aft) / 2 / HEX, rxP, true],
        [-eY, -0.25 * lr, rE, 0.78 * rE, true],
        [-eY - 0.27 * low, -0.05 * lr, lerp(rE, rK, 0.45), 0.8 * lerp(rE, rK, 0.45)],
        [-eY - 0.52 * low, 0.2 * lr, rK, 0.9 * rK],
        [-eY - 0.76 * low, 0.1 * lr, C, 0.92 * C],
        [-(run - 1.25 * fH), 0.1 * lr, C, 0.92 * C],
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
      const rE = lr * legTaper * LG.elbow;
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
  const croupZ = zHip - lerp(lerp(0.6, 0.88, T.rump), ROUND_ROOT, T.round) * over;
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
      swellAt: tail.swellAt ?? null,
      swellSpan: tail.swellSpan,
      rootSink: tail.rootSink ? tail.rootSink.map((v) => v * h) : null,
    });
    strand.group.position.set(0, tailY, tailZ);
    g.add(strand.group);
  } else if (tail && tail.kind === 'stiff') {
    // Centred on its own origin and laid along local +y, root end down — so
    // it turns about its MIDDLE, and a species that wags it has to re-seat it
    // on a pivot at the root. It closes to a point rather than a sawn-off
    // disc, and `swell` lets it fatten past both ends on the way — a brush,
    // where a plain taper is a stick.
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
