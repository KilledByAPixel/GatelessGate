// The noise field behind the ink dissolve, shared so the two places that spread
// ink across the screen cannot drift apart: the intro curtain (dissolve.js) and
// the diorama-to-diorama cut (freeze.js). Same fbm, same domain scale, so the
// book has ONE way of dissolving rather than two that nearly match.
export const INK_NOISE_GLSL = /* glsl */`
float ggHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float ggVnoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = ggHash(i), b = ggHash(i + vec2(1, 0)), c = ggHash(i + vec2(0, 1)), d = ggHash(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float inkFbm(vec2 p) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * ggVnoise(p);
    n += a;
    a *= 0.5;
    p *= 2.07;
  }
  return s / n;
}
// The wet edge, in domain units: how far past the threshold the ink still stains.
const float INK_EDGE = 0.16;
`;

// vUv -> noise domain. Aspect-corrected so the blotches stay round on any shape
// of window instead of stretching with it.
export const INK_DOMAIN_GLSL = /* glsl */`
vec2 inkDomain(vec2 uv, float aspect) { return uv * vec2(aspect, 1.0) * 4.0; }
`;
