// Seeded integer-lattice value noise. Pure functions, no state, no Three.js.

export function hash1(i, seed = 0) {
  let h = (i | 0) + Math.imul(seed | 0, 0x9E3779B9);
  h = Math.imul(h ^ (h >>> 16), 0x21F0AAAD);
  h = Math.imul(h ^ (h >>> 15), 0x735A2D97);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);
const hash2i = (x, y, seed) => hash1(x + Math.imul(y, 374761393), seed);
const hash3i = (x, y, z, seed) => hash1(x + Math.imul(y, 374761393) + Math.imul(z, 668265263), seed);

export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = fade(x - i);
  const a = hash1(i, seed), b = hash1(i + 1, seed);
  return a + (b - a) * f;
}

export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = fade(x - xi), v = fade(y - yi);
  const a = hash2i(xi, yi, seed), b = hash2i(xi + 1, yi, seed);
  const c = hash2i(xi, yi + 1, seed), d = hash2i(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const lerp = (a, b, t) => a + (b - a) * t;
  const n0 = lerp(
    lerp(hash3i(xi, yi, zi, seed), hash3i(xi + 1, yi, zi, seed), u),
    lerp(hash3i(xi, yi + 1, zi, seed), hash3i(xi + 1, yi + 1, zi, seed), u), v);
  const n1 = lerp(
    lerp(hash3i(xi, yi, zi + 1, seed), hash3i(xi + 1, yi, zi + 1, seed), u),
    lerp(hash3i(xi, yi + 1, zi + 1, seed), hash3i(xi + 1, yi + 1, zi + 1, seed), u), v);
  return lerp(n0, n1, w);
}

export function fbm2(x, y, seed = 0, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * freq, y * freq, seed + o);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
