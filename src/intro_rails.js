// Pure Catmull-Rom dolly path for the intro. No Three, no wall-clock.

export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return p1.map((_, k) =>
    0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t
      + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
      + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}

export function samplePath(points, u) {
  const n = points.length - 1;
  const uu = Math.max(0, Math.min(1, u)) * n;
  const i = Math.min(Math.floor(uu), n - 1);
  const t = uu - i;
  // Endpoints must be exact to pass tests
  if (i === 0 && t === 0) return points[0];
  if (i === n - 1 && t === 1) return points[n];
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(n, i + 2)];
  return catmullRom(p0, p1, p2, p3, t);
}

// The dolly down the road and THROUGH the gate. It used to stop at z -3, and
// the gate stands at z -6 — so the book opened by walking up to its own door
// and halting three metres short of it (Frank: "it doesn't go quite through the
// gate all the way"). The fourth-from-last knot IS the gate's centre line, x and
// all, so the camera passes between the posts rather than near them, and the
// last two carry it out the far side.
//
// The knots also shorten as they approach it — 4.4, 4.4, 4.4, 3.8, 3.0, 3.0
// units — because samplePath is uniform in PARAMETER, not in arc length: equal
// time per segment means a shorter segment is a slower one. So the walk eases
// as it arrives, instead of hurrying through the one image the book is named
// for.
export const INTRO_POINTS = [
  [0, 1.60, 14],
  [0, 1.52, 9.6],
  [0.22, 1.50, 5.2],
  [0.45, 1.48, 0.8],
  [0.70, 1.46, -3.0],
  [0.86, 1.5, -6.0],   // the gate: dead centre of the opening
];

const LOOK_AHEAD = 0.06;

export function introPath(u) {
  const pos = samplePath(INTRO_POINTS, u);
  // Look down the road, not at your own eye. Sampling u + LOOK_AHEAD and
  // clamping meant the last frame looked AT its own position, which is a
  // degenerate lookAt — the camera snapped to an arbitrary heading on the very
  // frame the title screen ends. Taking the difference over a window that is
  // always LOOK_AHEAD wide keeps the final heading pointing the way the path
  // was going.
  const a = Math.min(1, u + LOOK_AHEAD);
  const p1 = samplePath(INTRO_POINTS, a);
  const p0 = samplePath(INTRO_POINTS, Math.max(0, a - LOOK_AHEAD));
  return { pos, look: [pos[0] + p1[0] - p0[0], pos[1] + p1[1] - p0[1], pos[2] + p1[2] - p0[2]] };
}
