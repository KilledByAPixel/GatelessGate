import { fbm2, noise2 } from '../util/noise.js';
import { INK, hexToRgb } from '../palette.js';

// Washi paper grain, baked once at startup. Applied as a DOM multiply overlay
// so it costs zero WebGL time and never shimmers.

export function grainPixels(size = 256, seed = 42) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const speck = fbm2(x * 0.35, y * 0.35, seed, 3);
      const fiber = noise2(x * 0.05, y * 0.9, seed + 31); // long horizontal fibers: slow along x, fast along y
      const n = 0.6 * speck + 0.4 * fiber;
      const v = Math.round(228 + 27 * n);
      const i = (y * size + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return data;
}

export function installGrain(doc, { size = 256, seed = 42, vignette = 0.22, mount = null } = {}) {
  const canvas = doc.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(grainPixels(size, seed), size, size), 0, 0);

  // Confine the grain/vignette to a container (the 3D stage) when given one,
  // so it never multiplies over the text panel.
  const pos = mount ? 'absolute' : 'fixed';
  const host = mount || doc.body;

  const overlay = doc.createElement('div');
  overlay.id = 'grain';
  Object.assign(overlay.style, {
    position: pos, inset: '0', pointerEvents: 'none', zIndex: '3',
    backgroundImage: `url(${canvas.toDataURL()})`,
    backgroundRepeat: 'repeat',
    mixBlendMode: 'multiply',
  });

  const [ir, ig, ib] = hexToRgb(INK);
  const vig = doc.createElement('div');
  vig.id = 'vignette';
  Object.assign(vig.style, {
    position: pos, inset: '0', pointerEvents: 'none', zIndex: '4',
    background: `radial-gradient(ellipse at center, rgba(${ir},${ig},${ib},0) 55%, rgba(${ir},${ig},${ib},${vignette}) 135%)`,
    mixBlendMode: 'multiply',
  });

  host.appendChild(overlay);
  host.appendChild(vig);
  return { overlay, vignette: vig };
}
