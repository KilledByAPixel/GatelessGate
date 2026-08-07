// The book's shared scalar math. These three were re-declared in ~25 files
// before being gathered here — the cleanup review counted 16 clamp01 locals,
// 7 clamps, and three byte-identical SS(a, b, v) smoothstep helpers. Pure
// functions, no state, no Three.js.

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export function smoothstep(a, b, v) { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }
