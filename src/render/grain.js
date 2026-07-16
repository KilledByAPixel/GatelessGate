import { fbm2, noise2 } from '../util/noise.js';

// Washi paper grain, baked once at startup. Applied as a DOM multiply overlay
// so it costs zero WebGL time and never shimmers.

export function grainPixels(size = 256, seed = 42) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const speck = fbm2(x * 0.35, y * 0.35, seed, 3);
      const fiber = noise2(x * 0.9, y * 0.045, seed + 31); // long horizontal fibers
      const n = 0.6 * speck + 0.4 * fiber;
      const v = Math.round(228 + 27 * n);
      const i = (y * size + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return data;
}

export function installGrain(doc, { size = 256, seed = 42, vignette = 0.22 } = {}) {
  const canvas = doc.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(grainPixels(size, seed), size, size), 0, 0);

  const overlay = doc.createElement('div');
  overlay.id = 'grain';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '10',
    backgroundImage: `url(${canvas.toDataURL()})`,
    backgroundRepeat: 'repeat',
    mixBlendMode: 'multiply',
  });

  const vig = doc.createElement('div');
  vig.id = 'vignette';
  Object.assign(vig.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '11',
    background: `radial-gradient(ellipse at center, rgba(30,30,36,0) 55%, rgba(30,30,36,${vignette}) 135%)`,
    mixBlendMode: 'multiply',
  });

  doc.body.appendChild(overlay);
  doc.body.appendChild(vig);
  return { overlay, vignette: vig };
}
