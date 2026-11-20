import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { WASH } from '../palette.js';
import { hash1 } from '../util/noise.js';
import { makeBowl } from './bowl.js';

// The transmission bundle (case 23): the patriarch's robe folded flat on a
// stone, with the bowl of succession resting on it. Case 36 sets the same
// thing down by the road as a traveller's gear — a monk's whole kit is a robe
// and a bowl — so the reading has to hold in plain grey as well as in the seal.
//
// THE CLOTH IS A RECTANGLE, NOT A LATHE. It was a stack of round discs
// shrinking upward with a full-height bowl on its foot above them, and that
// outline is an hourglass: a goblet, a chess piece, anything but cloth. Folded
// cloth is oblong (a robe folds into a long rectangle), low, and the widest
// thing in the pile; a bowl set on it sinks in a little. So: two soft oblong
// layers, the upper one smaller and laid off-centre so one long side reads as
// the fold and the other as stepped edges, and a shallow bowl nested into the
// top with its foot out of sight.
//
// The group stands from y = 0 (set it on whatever surface holds it) and owns
// one verb: budge(). Tapped, it answers with the smallest motion an object can
// make — a degree and a half of lean that gives up almost at once — because in
// this case the treasure is as heavy as mountains and the refusal IS the event.
// Nothing escalates: a budge in flight absorbs further attempts, and every
// budge is the same size as the last.

const DUR = 0.8;          // seconds, strain to stillness
const MAX_TILT = 0.028;   // radians (~1.6 degrees) — the whole concession

// AND THEN IT HOPS. The lean alone was the whole answer for a long while and it
// was too small to find: a degree and a half on a stack a third of a unit tall,
// at case-23 staging distance, is motion you have to be told about. So it
// bounces up off the platform and lands again — the same refusal, said louder.
// Reach for it and it is not there; it comes back down exactly where it was, so
// the tenth attempt still gets what the first did.
//
// A real arc, not a sine: up fast, slow at the top, down fast, because that is
// what the eye knows a thrown thing does. HOP_DUR is short — this is a hop, not
// a levitation.
const HOP_H = 0.34;       // world units at the top of the arc
const HOP_DUR = 0.62;     // seconds, leaving to landing
const HOP_SPIN = 0.5;     // radians of lazy turn while it is up

export function makeBundle({
  width = 0.46, color = WASH.dark, bowlColor = WASH.mid, ropeColor = WASH.deep, seed = 23,
} = {}) {
  const g = new THREE.Group();
  g.name = 'bundle';
  const mat = washMaterial({ color, flat: true });

  // One layer of folded cloth: an oblong with cut corners, drawn in under
  // itself at the bottom, fullest a little below the middle and eased in again
  // at the top — a pillow section rather than a plank. Corners droop, because
  // that is where folded cloth has nothing under it. Each facet column is
  // nudged in or out as one (every ring gets the same push) so the outline is
  // softly irregular without the facets tearing. hx/hz are half-extents.
  const slab = (hx, hz, h, key, { soft = true } = {}) => {
    const c = Math.min(hx, hz) * 0.42;                       // the corner cut
    const ring = [
      [hx, hz - c], [hx - c, hz], [-hx + c, hz], [-hx, hz - c],
      [-hx, -hz + c], [-hx + c, -hz], [hx - c, -hz], [hx, -hz + c],
    ].map(([x, z], i) => {
      const k = soft ? 1 + (hash1(key * 41 + i * 13, seed) - 0.5) * 0.10 : 1;
      return [x * k, z * k];
    });
    // [fraction of h, inset]; the plain band used for the tie skips the pillow
    const levels = soft ? [[0, 0.90], [0.42, 1], [1, 0.88]] : [[0, 1], [1, 1]];
    const N = ring.length;
    const v = [];
    for (const [fy, inset] of levels) {
      ring.forEach(([x, z], i) => {
        const corner = soft && fy === 1 ? (i % 2 === 0 ? 0.90 : 0.94) : 1;
        v.push(x * inset, h * fy * corner, z * inset);
      });
    }
    const topC = v.length / 3; v.push(0, h, 0);
    const botC = topC + 1; v.push(0, 0, 0);
    const idx = [];
    for (let l = 0; l < levels.length - 1; l++) {
      for (let i = 0; i < N; i++) {
        const p = l * N + i, q = l * N + (i + 1) % N;
        idx.push(p, p + N, q, q, p + N, q + N);
      }
    }
    const top = (levels.length - 1) * N;
    for (let i = 0; i < N; i++) {
      idx.push(top + i, topC, top + (i + 1) % N);
      idx.push(i, (i + 1) % N, botC);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setIndex(idx);
    // unshared corners, so each facet carries its own normal
    const flat = geo.toNonIndexed();
    flat.computeVertexNormals();
    return flat;
  };

  // ---- the folded robe --------------------------------------------------
  // Two layers; a third crowded the read and built the stack back up into a
  // column. Every measure is a fraction of `width`, heights included, so the
  // whole thing rescales as one cloth.
  const FOLDS = [
    { hx: 0.70, hz: 0.50, h: 0.185 },
    { hx: 0.62, hz: 0.42, h: 0.150 },
  ];
  let stackH = 0;
  const placed = [];
  FOLDS.forEach((f, i) => {
    const fold = new THREE.Mesh(slab(width * f.hx, width * f.hz, width * f.h, i), mat);
    fold.name = 'fold';
    // the upper layer is pushed toward one long side and one end, so the
    // other two show the step of the layer beneath
    const lay = i === 0 ? 0 : 1;
    fold.position.set(
      lay * width * (0.045 + (hash1(i * 9 + 1, seed) - 0.5) * 0.03),
      stackH,
      lay * width * (-0.050 + (hash1(i * 9 + 2, seed) - 0.5) * 0.03),
    );
    // the folder's hands: a few degrees, enough that the layers are not
    // registered like sawn boards, not so much that the pile looks kicked
    fold.rotation.y = lay * (hash1(i * 9 + 3, seed) - 0.5) * 0.30;
    g.add(fold);
    placed.push(fold);
    stackH += width * f.h;
  });

  // ---- the tie ------------------------------------------------------------
  // A cord has to contrast with whatever the robe is wearing (in case 23 the
  // cloth turns the seal's red, and a red cord on a red robe is no cord), which
  // is why it keeps its own `ropeColor`. But it must not stand OFF the cloth:
  // rings that cleared the stack read as hoops floating round it. So the tie
  // is a flat band laid in the seam under the upper layer and kept inside
  // that layer's outline — what shows is the dark of the fold line.
  const upper = FOLDS[1];
  const rope = new THREE.Mesh(
    slab(width * upper.hx * 0.955, width * upper.hz * 0.955, width * 0.05, 7, { soft: false }),
    washMaterial({ color: ropeColor, flat: true }));
  rope.name = 'rope';
  rope.position.copy(placed[1].position);
  rope.position.y -= width * 0.022;
  rope.rotation.y = placed[1].rotation.y;
  g.add(rope);

  // ---- the bowl, nested into the top fold --------------------------------
  // makeBowl's profile is a fixed height whatever its radius — a rice bowl's
  // depth, which on this pile stood as tall as the cloth under it. Squashed
  // well below its width it is a begging bowl, wide and shallow; and it is
  // let down into the cloth by more than its foot, so the body meets the robe
  // directly and there is no stem between them.
  const bowl = makeBowl({ radius: width * 0.52, color: bowlColor });
  const BOWL_XZ = 0.62, BOWL_Y = 0.44;
  bowl.scale.set(BOWL_XZ, BOWL_Y, BOWL_XZ);
  bowl.position.set(placed[1].position.x, stackH - 0.045 * BOWL_Y, placed[1].position.z);
  bowl.rotation.y = hash1(7, seed) * Math.PI * 2;
  g.add(bowl);

  // ---- the refusal ------------------------------------------------------
  // THE REST POSE IS READ ON THE FIRST UPDATE, NOT AT BUILD. A case makes the
  // bundle and THEN sets where it stands (k23 puts it on top of a stone), so
  // anything captured in this function body is the pose before placement —
  // taking it here would have driven the hop's landing to y = 0 and dropped the
  // treasure through the rock it sits on.
  let restY = null;
  let yaw0 = 0;
  let started = -1;     // sim time the one permitted motion began
  let dir = 0;          // world heading the stack leans toward
  let budges = 0;
  let now = 0;

  // Quick strain up (~0.1s), full lean held only an instant, then a long
  // settle: the shape of a mass that considered moving and declined.
  const amount = (t) => {
    if (started < 0) return 0;
    const u = (t - started) / DUR;
    if (u <= 0 || u >= 1) return 0;
    const e = Math.min(1, u / 0.12, (1 - u) / 0.7);
    return MAX_TILT * e * e * (3 - 2 * e);
  };

  // The arc. 4h(1-h) is a parabola through 0 at both ends and 1 at the top —
  // fast off the stone, slow at the apex, fast back down, which is the shape a
  // thrown thing actually has. Exactly 0 at both ends, so the stack lands back
  // on its rest height rather than a hair above or below it.
  const hopAt = (t) => {
    if (started < 0) return 0;
    const u = (t - started) / HOP_DUR;
    if (u <= 0 || u >= 1) return 0;
    return HOP_H * 4 * u * (1 - u);
  };

  return {
    group: g,
    maxTilt: MAX_TILT,
    // Try to take it. `toward` is a world heading (the hand that pulls); the
    // stack hops clear, turning as it goes, leans that way as it lands, and
    // settles back exactly where it was. While one is in flight further
    // attempts are absorbed — tap it all day and it never does more than this.
    budge(toward = 0) {
      if (started >= 0 && now - started < DUR) return false;
      started = now;
      dir = toward;
      budges++;
      return true;
    },
    // how high it is off its rest, right now — 0 at rest and at the landing
    hop: () => hopAt(now),
    update(dt, simTime) {
      now = simTime;
      if (restY === null) { restY = g.position.y; yaw0 = g.rotation.y; }
      const a = amount(simTime);
      const h = hopAt(simTime);
      g.position.y = restY + h;
      // compensate for the RESTING yaw so `dir` stays a world heading. Reading
      // g.rotation.y here instead would feed the spin below back into the lean
      // and walk its direction round the compass over successive hops.
      const d = dir - yaw0;
      g.rotation.x = a * Math.cos(d);
      g.rotation.z = -a * Math.sin(d);
      // a lazy turn while it is off the stone, unwinding exactly as it lands
      g.rotation.y = yaw0 + HOP_SPIN * (h / HOP_H);
    },
    tilt: () => amount(now),
    budges: () => budges,
  };
}
