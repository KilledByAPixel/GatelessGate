import * as THREE from '../../lib/three.module.js';
import { RIM_SHRINK } from './grassfield.js';

// THE DARK UNDER THE GRASS — ambient occlusion for the meadow, baked once at
// build time into a small texture that multiplies the ground's own colour.
//
// WHY NOT A SHADOW. The meadow is tuftfield.js: camera-facing cards. A card's
// silhouette is defined relative to the VIEWER, so its cast shadow would change
// shape as the reader orbits — and worse, three.js renders shadow casters with
// MeshDepthMaterial, which does not run the billboard code (that lives in an
// onBeforeCompile on the colour material), so the shadow map never saw the
// grass at all. It saw a grid of identical unrotated quads. How much shadow
// that grid threw depended on nothing but how square the sun happened to be to
// it: measured, case 19's moonlit key threw 3.5x the footprint of the stock key
// every other page uses — 2.0x from the angle, 1.8x from the lower elevation.
// That is not a lighting effect, it is an accident, and it is why the meadow
// now sets noCastShadow.
//
// What is left is the thing that actually reads: the ground is simply darker
// where the grass is thick. That is what occlusion IS, it does not care where
// the light is, it cannot swim as the camera moves, and it costs nothing per
// frame. It is built from the REAL placements — the same array the instances
// are written from — so it can never drift out of step with where the grass
// actually stands, which a re-derived noise field eventually would.
//
// Split the house way: grassShadeData is pure arithmetic and Node-testable;
// makeGrassShade is the THREE half that wraps it in a texture.

// Defaults, in world units and 0..1 fractions.
export const SHADE_RES = 256;        // texels across the whole field, both axes
export const SHADE_SOFT = 0.55;      // world radius of one plant's smudge
export const SHADE_STRENGTH = 0.34;  // how dark the thickest grass gets, 0..1
// Coverage at which the darkening is already at full strength. Well under the
// count a texel actually accumulates, so the middle of the meadow sits ON the
// floor rather than rippling with the placement noise — the patchiness should
// read at the scale of bare ground opening up, not per plant.
export const SHADE_FULL = 3.0;

// Accumulate the plants into a res x res coverage grid over [-radius, radius]
// in x and z, and return it as an 8-bit multiplier per texel: 255 = untouched
// ground, lower = shaded.
//
// The grid's ROW ORDER matches the ground's own v axis, which runs backwards
// against z: makeGround is a PlaneGeometry laid flat, so u = x/size + 0.5 and
// v = 0.5 - z/size (measured, not assumed). Row 0 is therefore z = +radius.
// Baking the flip in here means makeGrassShade can hand the texture a plain
// symmetric repeat/offset instead of a mirrored one.
export function grassShadeData({
  spots = [], radius = 20, res = SHADE_RES,
  soft = SHADE_SOFT, strength = SHADE_STRENGTH, full = SHADE_FULL,
} = {}) {
  const cover = new Float32Array(res * res);
  const span = radius * 2;
  const perTexel = span / res;
  const rTexel = soft / perTexel;              // splat radius, in texels
  const reach = Math.max(1, Math.ceil(rTexel));

  for (const p of spots) {
    // world -> grid. x rightward, z NEGATED so row 0 is z = +radius.
    const cx = (p.x + radius) / perTexel - 0.5;
    const cz = (radius - p.z) / perTexel - 0.5;
    const i0 = Math.max(0, Math.floor(cx - reach));
    const i1 = Math.min(res - 1, Math.ceil(cx + reach));
    const j0 = Math.max(0, Math.floor(cz - reach));
    const j1 = Math.min(res - 1, Math.ceil(cz + reach));
    // A plant standing in the rim taper is smaller, so it occludes less. `rim`
    // is 0 in the core and 1 at the very edge — the renderer scales the card by
    // `1 - RIM_SHRINK * rim`, and the smudge takes exactly the same factor, so
    // the shade fades out on the same curve the grass does.
    const w = p.rim === undefined ? 1 : 1 - RIM_SHRINK * p.rim;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = (i - cx) / rTexel;
        const dz = (j - cz) / rTexel;
        const d2 = dx * dx + dz * dz;
        if (d2 >= 1) continue;
        // smoothstep falloff, 1 at the stem and 0 at the rim of the smudge
        const t = 1 - Math.sqrt(d2);
        cover[j * res + i] += t * t * (3 - 2 * t) * w;
      }
    }
  }

  const out = new Uint8Array(res * res * 4);
  for (let k = 0; k < cover.length; k++) {
    const c = Math.min(1, cover[k] / full);
    const shade = Math.round(255 * (1 - strength * c));
    out[k * 4] = shade;
    out[k * 4 + 1] = shade;
    out[k * 4 + 2] = shade;
    out[k * 4 + 3] = 255;
  }
  return { data: out, res };
}

// The texture, aimed at a ground of the given size. The ground's UVs run across
// the WHOLE plane (150 units by default) while the field is a fraction of it,
// so repeat/offset scale the map onto the field's own extent and CLAMP outside
// it — where the rim taper has already faded the map to white, so the boundary
// is invisible rather than a seam.
export function grassShadeUV(radius, groundSize) {
  const k = groundSize / (2 * radius);
  return { repeat: k, offset: 0.5 * (1 - k) };
}

export function makeGrassShade({ spots, radius = 20, groundSize = 150, ...opts } = {}) {
  const { data, res } = grassShadeData({ spots, radius, ...opts });
  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  tex.name = 'grass-shade';
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  const { repeat, offset } = grassShadeUV(radius, groundSize);
  tex.repeat.set(repeat, repeat);
  tex.offset.set(offset, offset);
  tex.needsUpdate = true;
  return tex;
}
