import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';
import { hash1 } from '../util/noise.js';
import { makeBowl } from './bowl.js';

// The transmission bundle (case 23): the patriarch's robe folded into a low
// stack on a stone, with the bowl of succession seated on top. At this style
// level folded cloth is a short pile of flattened rounded slabs, each turned a
// little off the one beneath it — the turning is what says "folded by hands"
// rather than "extruded".
//
// The group stands from y = 0 (set it on whatever surface holds it) and owns
// one verb: budge(). Tapped, it answers with the smallest motion an object can
// make — a degree and a half of lean that gives up almost at once — because in
// this case the treasure is as heavy as mountains and the refusal IS the event.
// Nothing escalates: a budge in flight absorbs further attempts, and every
// budge is the same size as the last.

const DUR = 0.8;          // seconds, strain to stillness
const MAX_TILT = 0.028;   // radians (~1.6 degrees) — the whole concession

export function makeBundle({
  width = 0.46, color = WASH.dark, bowlColor = WASH.mid, ropeColor = WASH.deep, seed = 23,
} = {}) {
  const g = new THREE.Group();
  g.name = 'bundle';
  const mat = toonMaterial({ color, flat: true });

  // ---- the folded robe --------------------------------------------------
  // Three flattened slabs, widest at the bottom. Radii and heights are
  // fractions of `width` so the whole stack rescales as one cloth. The
  // heights were authored against the default width (0.46) and are scaled
  // through it — they used to be applied raw, so a non-default width
  // widened the stack without raising it (latent: both callers use the
  // default, but the comment above promised otherwise).
  const FOLDS = [
    { r: 0.500, h: 0.070 },
    { r: 0.435, h: 0.063 },
    { r: 0.370, h: 0.057 },
  ];
  const hScale = width / 0.46;
  const SEG = 11;
  let stackH = 0;
  FOLDS.forEach((fRaw, i) => {
    const f = { r: fRaw.r, h: fRaw.h * hScale };
    const R = width * f.r;
    const geo = new THREE.CylinderGeometry(R * 0.93, R, f.h, SEG);
    // Push each facet column in or out a touch (the ranges' trick at cloth
    // scale) so the folds read softly irregular instead of machined. y is
    // never touched: the slabs stay flat and stack flush.
    const pos = geo.attributes.position;
    for (let vi = 0; vi < pos.count; vi++) {
      const x = pos.getX(vi), z = pos.getZ(vi);
      if (Math.hypot(x, z) < 1e-4) continue;                    // cap centers stay put
      const ang = Math.atan2(z, x);
      const col = Math.round(((ang + Math.PI) / (2 * Math.PI)) * SEG) % SEG;
      const k = 1 + (hash1(col * 13 + i * 41, seed) - 0.5) * 0.16;
      pos.setX(vi, x * k);
      pos.setZ(vi, z * k);
    }
    geo.computeVertexNormals();
    const fold = new THREE.Mesh(geo, mat);
    fold.name = 'fold';
    fold.position.set(
      (hash1(i * 9 + 1, seed) - 0.5) * width * 0.10,
      stackH + f.h / 2,
      (hash1(i * 9 + 2, seed) - 0.5) * width * 0.10,
    );
    fold.rotation.y = (hash1(i * 9 + 3, seed) - 0.5) * 1.1;     // the folder's hands
    fold.scale.z = 0.88 + hash1(i * 9 + 4, seed) * 0.12;        // cloth, not a lathe
    g.add(fold);
    stackH += f.h;
  });

  // ---- the rope ties ------------------------------------------------------
  // Silhouette truth: nothing in the old stack said "tied bundle" rather than
  // "stack of coins" — no cord, nothing cinching the folds together. Two thin
  // tori, sunk into the seams between folds so they read as binding the
  // stack rather than floating around it, each tilted a few degrees off
  // level (a real cord never lies perfectly flat) and given its own tiny
  // twist so the two ties don't read as one ring duplicated. A distinct
  // `ropeColor` (defaults to WASH.deep, near-ink) instead of reusing `color`:
  // in case 23 the folds turn ACCENT red, and a red cord on a red robe would
  // vanish — the tie has to contrast with whatever the robe is wearing.
  const ropeMat = toonMaterial({ color: ropeColor, flat: true });
  const TIES = [
    { seam: 0, r: 0.465, tube: 0.019 },   // between fold 0 and fold 1
    { seam: 1, r: 0.400, tube: 0.016 },   // between fold 1 and fold 2
  ];
  let seamY = 0;
  const seamHeights = FOLDS.map((f) => (seamY += f.h * hScale));   // the same scale the folds got
  TIES.forEach((t, i) => {
    const rope = new THREE.Mesh(
      new THREE.TorusGeometry(width * t.r, width * t.tube, 6, 16), ropeMat);
    rope.name = 'rope';
    rope.position.set(
      (hash1(i * 5 + 1, seed + 100) - 0.5) * width * 0.03,
      seamHeights[t.seam],
      (hash1(i * 5 + 2, seed + 100) - 0.5) * width * 0.03,
    );
    rope.rotation.x = Math.PI / 2 + (hash1(i * 5 + 3, seed + 100) - 0.5) * 0.12;
    rope.rotation.z = (hash1(i * 5 + 4, seed + 100) - 0.5) * 0.12;
    g.add(rope);
  });

  // ---- the bowl, seated on the top fold ---------------------------------
  // makeBowl's profile is a fixed 0.3 tall whatever its radius, which is a
  // rice bowl's scale, not a relic's — so it rides on the stack scaled down
  // to sit quietly on top rather than crown it.
  const bowl = makeBowl({ radius: width * 0.52, color: bowlColor });
  bowl.scale.setScalar(0.66);
  bowl.position.y = stackH;
  bowl.rotation.y = hash1(7, seed) * Math.PI * 2;
  g.add(bowl);

  // ---- the refusal ------------------------------------------------------
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

  return {
    group: g,
    maxTilt: MAX_TILT,
    // Try to take it. `toward` is a world heading (the hand that pulls); the
    // stack leans that way by MAX_TILT and settles back where it was. While a
    // budge is in flight further attempts are absorbed — tap it all day and it
    // never does more than this.
    budge(toward = 0) {
      if (started >= 0 && now - started < DUR) return false;
      started = now;
      dir = toward;
      budges++;
      return true;
    },
    update(dt, simTime) {
      now = simTime;
      const a = amount(simTime);
      // compensate for the group's own yaw so `dir` stays a world heading
      const d = dir - g.rotation.y;
      g.rotation.x = a * Math.cos(d);
      g.rotation.z = -a * Math.sin(d);
    },
    tilt: () => amount(now),
    budges: () => budges,
  };
}
