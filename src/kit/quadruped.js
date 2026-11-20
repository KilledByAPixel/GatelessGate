import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { INK_LIT } from '../palette.js';
import { makeTail } from './tail.js';

// What a species gets when it states nothing: a plain, lean animal. Every
// number here is in the units its option is documented in beside the builder.
const TORSO_DEFAULTS = {
  chest: 1.1, loin: 0.72, withers: 1.0, back: 0.9, croup: 0.94,
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
// knee      radians the hind leg folds at the hock; 0 stands it plumb
// shoulder  fore-aft radius of the mass on top of a front leg, x legR
//           (and x legTaper, which is the front leg's own top-heaviness)
// thigh     the same for the hind leg
// proud     how far those masses stand out of the flank, x bodyR
const LEG_DEFAULTS = { knee: 0.3, shoulder: 2.0, thigh: 2.3, proud: 0.09 };
// Share of a hind leg's run that lies above the hock.
const HOCK_RUN = 0.66;

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
// Each leg is one closed loft whose first ring is the shoulder or the thigh —
// broad fore-and-aft, and solved across so it stands a little proud of the
// flank it is buried in (`legs.proud`), which is what gives the body a haunch
// and a shoulder without a separate mass. Below that the path is not plumb:
// the front leg sets its elbow back and its knee forward, and the hind leg
// goes stifle-forward, hock-back (`legs.knee`), so each joint is a corner in
// the outline rather than a change of radius. One mesh per leg.
export function makeQuadruped({
  height = 1,
  color = INK_LIT,
  // trunk: bodyR is its half-depth and the unit every torso knob is in;
  // legH + bodyDrop is the height of its axis off the ground
  bodyR = 0.22, bodyLen = 0.72, bodyDrop = 0.16,
  torso = null,          // { chest, loin, withers, back, croup, shoulderW, barrelW, hipW } — see THE TORSO
  // legs
  legH = 0.52, legR = 0.055, legTaper = 0.82, hipX = 0.13, hipZ = 0.32,
  legBury = 0.06,        // how far above the flank's underside the shoulder/thigh ring rides, x height
  legs = null,           // { knee, shoulder, thigh, proud } — see LEG_DEFAULTS
  // head
  head = { shape: 'sphere', r: 0.20, fwd: 0.56, up: 0.22 },   // + scaleX/scaleY/scaleZ (default 1): squish the skull in its own tilted frame
  neck = null,           // { r, w, root, set, taper, arch } — see NECK_DEFAULTS; null ends the chest in a blunt breast
  snout = null,          // { r0, r1, len, fwd, up, tilt } — tilt noses the muzzle DOWN off horizontal
  ears = null,           // { r, h, x, y, z, tilt } — DIRECT base offsets from the head's centre; see EARS ARE PLACED DIRECTLY below
  horns = null,          // { r, len, x, up, fwd, sweep, back?, curve? } — curve bends the spike into an arc
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
    [zHip - 0.84 * over, 0.52 * T.croup, -0.20 * T.loin, 0.42 * T.hipW],
    [zHip - 0.36 * over, 0.94 * T.croup, -0.70 * T.loin, 0.88 * T.hipW],
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

  // A limb from a path. `pts` are [y, z, rz, rx] from the top ring down: y and
  // z relative to the leg's own origin, rz the fore-aft radius, rx the lateral
  // one. Each ring stands square to the path, so a bend carries its ring round
  // with it — except the first and the last, which are held level: the mass on
  // top closes in a cone up into the body, and a foot is flat on the ground.
  const limb = (pts, capH) => {
    const last = pts.length - 1;
    const sts = pts.map(([y, z, rz, rx], i) => {
      let dy = -1, dz = 0;
      if (i > 0 && i < last) {
        dy = pts[i + 1][0] - pts[i - 1][0]; dz = pts[i + 1][1] - pts[i - 1][1];
        const n = Math.hypot(dy, dz) || 1; dy /= n; dz /= n;
      }
      return { c: [y, z], a: [dz * rz, -dy * rz], w: rx };
    });
    return profileLoft(sts, 6, [capH, pts[0][1]], [pts[last][0], pts[last][1]]);
  };

  const legTop = {};
  for (const hind of [false, true]) {
    const z = hind ? zHip : zShoulder;
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
    // ACROSS, the mass is solved rather than stated: wide enough to stand
    // `proud` of the flank at the height it sits, so the haunch shows from the
    // front and from above whatever the body's own width is there.
    const off = (top - bodyY - (s.top + s.bot) / 2) / ((s.top - s.bot) / 2);
    const wHere = s.w * facet(off);
    const rx = Math.min(rz, Math.max(0.9 * lr, wHere + LG.proud * R - hx));
    // Its cap is a TALL cone, kept under the back. A low one leaves a ledge
    // where the ring stands out of the flank, and a ledge catches the key
    // light as a bright dart on the animal's side; a steep one is a slope of
    // muscle running up into the body. And a cap that crests the topline is
    // the bolted-on mass all over again.
    const capH = Math.max(0.1 * rz, Math.min(1.1 * rz, 0.8 * (roof - top)));

    let pts;
    if (hind) {
      // Stifle forward, hock back. The hock sits LOW: a joint at mid-height
      // lands where the thigh's own mass is and the fold vanishes into it.
      const hb = Math.tan(LG.knee) * HOCK_RUN * run;  // how far the hock stands behind the hip
      // The thigh's mass rides AHEAD of the hip point. Centred on it, the
      // disc's rear edge stands out behind the rump's own taper and shows as
      // a block on the buttock.
      const fwd = 0.34 * rz;
      pts = [
        [0, fwd, rz, rx],
        [-0.30 * run, 0.9 * fwd + 0.1 * hb, 0.78 * rz, 0.85 * rx],
        [-0.50 * run, -0.32 * hb, 1.30 * lr, 1.10 * lr],
        [-HOCK_RUN * run, -hb, 0.88 * lr, 0.84 * lr],
        [-0.84 * run, -0.93 * hb, 0.60 * lr, 0.58 * lr],
        [-0.95 * run, -0.90 * hb, 0.60 * lr, 0.58 * lr],
        [-run, -0.89 * hb + 0.2 * lr, 0.84 * lr, 0.76 * lr],
      ];
    } else {
      // The elbow rides at the belly line and a touch back; the knee splits
      // what is left and stands a touch forward.
      const rE = lr * legTaper * 1.15;
      const eY = Math.min(0.42 * run, Math.max(0.26 * run, legBury * h * 1.1));
      const low = run - eY;
      pts = [
        [0, 0, rz, rx],
        [-eY, -0.25 * lr, rE, 0.9 * rE],
        [-eY - 0.48 * low, 0.22 * lr, 0.84 * lr, 0.80 * lr],
        [-eY - 0.80 * low, 0.10 * lr, 0.60 * lr, 0.58 * lr],
        [-eY - 0.93 * low, 0.12 * lr, 0.60 * lr, 0.58 * lr],
        [-run, 0.24 * lr, 0.84 * lr, 0.76 * lr],
      ];
    }
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(limb(pts, capH), mat);
      leg.name = 'leg';
      // the origin is the join itself — the shoulder or hip point, at the
      // height of the mass's ring — so a species that re-seats a leg moves and
      // scales it about that point
      leg.position.set(sx * hx, top, z);
      g.add(leg);
    }
  }

  const headY = bodyY + Hy;
  const headZ = Hz;

  // A circular ring loft for the small pointed parts — ears, horns, a stiff
  // tail. `stations` is [{ p: [x,y,z], r }] from ROOT to TIP: the root ring
  // stays open (it is always buried inside a larger mass), the tip is fanned
  // shut. Each ring sits square to the path's own tangent, so a curved run
  // (the horn arc below) carries its rings around the bend without shearing.
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
  // per-axis scales (defaulting to 1, same idiom as hump.scaleY) let a
  // species flatten, lengthen or narrow it without a new shape. Applied in
  // the mesh's own frame, so a tilted head squishes along its own axes.
  headMesh.scale.set(head.scaleX ?? 1, head.scaleY ?? 1, head.scaleZ ?? 1);
  // A head held level projects like a drawer pulled out of the chest. Nosing it
  // down sinks the back of the skull into the shoulder and leaves the muzzle as
  // the thing that sticks out, which is what the silhouette wants.
  if (head.tilt) headMesh.rotation.x = head.tilt;
  g.add(headMesh);

  if (snout) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(snout.r0 * h, snout.r1 * h, snout.len * h, 7), mat);
    m.name = 'snout';
    // π/2 lies the cylinder along +z; `tilt` noses it DOWN from there, so a
    // nosed-down head (the horse) can carry its muzzle along the skull's own
    // line instead of jutting a horizontal beak off the jaw.
    m.rotation.x = Math.PI / 2 + (snout.tilt || 0);
    m.position.set(0, bodyY + snout.up * h, snout.fwd * h);
    g.add(m);
  }

  // Ears and horns HINGE AT THEIR BASE. A cone is built centred on its own
  // origin, so attaching one at the skull buries half its length inside the head
  // and only the outer half shows — which is why the buffalo's horns read as two
  // small bumps rather than a sweep. Translating the geometry first means the
  // stated length is the length you actually see. `spin` pre-turns the cone
  // about its own axis at the GEOMETRY level, so all three rotation channels
  // stay free for placement and animation.
  const spike = (r, len, seg, spin = 0) => {
    const geo = new THREE.ConeGeometry(r, len, seg);
    if (spin) geo.rotateY(spin);
    geo.translate(0, len / 2, 0);
    return geo;
  };

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
      // -x, so the LEFT ear (sx = -1) takes the POSITIVE angle — same
      // convention as the horns below.
      m.rotation.z = -sx * (ears.tilt || 0);
      g.add(m);
    }
  }

  // A HORN IS AN ARC, NOT A SPIKE — a buffalo's are round and curved, like a
  // devil's horn. `horns.curve` (additive; absent keeps the legacy straight
  // cone) lofts the rings along a quadratic arc instead: the horn leaves its
  // base along local +y, then bends toward local -z — up, then hooking back —
  // with the radius shrinking to a point. `curve` is how far the tip is
  // displaced off the straight line, as a fraction of len; the arc trades some
  // vertical reach for it (0.85·len), the way a bent finger stands shorter than
  // a straight one. Base still hinges at the origin, so placement and the
  // sweep/back channels work unchanged.
  if (horns) for (const sx of [-1, 1]) {
    let geo;
    if (horns.curve) {
      const N = 6, sts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        sts.push({
          p: [0, (2 * (1 - t) * t * 0.55 + t * t * 0.85) * horns.len * h,
            -t * t * horns.curve * horns.len * h],
          r: Math.max(horns.r * h * Math.pow(1 - t, 0.8), horns.r * h * 0.04),
        });
      }
      geo = loft(sts, 6);
    } else {
      geo = spike(horns.r * h, horns.len * h, 6);
    }
    const m = new THREE.Mesh(geo, mat);
    m.name = 'horn';
    m.position.set(sx * horns.x * h, bodyY + horns.up * h, horns.fwd * h);
    if (horns.back) m.rotation.x = -horns.back;  // swept back over the skull
    m.rotation.z = -sx * horns.sweep;            // and out to the side — see the sign note above
    g.add(m);
  }

  // WHERE A TAIL LEAVES THE BODY, when the species does not say: the croup —
  // on the topline behind the hip, sunk just under the surface so the join is
  // buried. Read off the trunk's own sections, so it follows a retuned rump.
  const croupZ = zHip - 0.6 * over;
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
