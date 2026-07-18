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

export const INTRO_POINTS = [
  [0, 1.6, 14],
  [0, 1.5, 7],
  [0.3, 1.5, 1.5],
  [0.6, 1.4, -3],
];

export function introPath(u) {
  return { pos: samplePath(INTRO_POINTS, u), look: samplePath(INTRO_POINTS, Math.min(1, u + 0.06)) };
}
