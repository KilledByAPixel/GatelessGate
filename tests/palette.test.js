import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAPER, INK, ACCENT, WASH, wash, mixHex } from '../src/palette.js';

const SRC = join(fileURLToPath(new URL('../', import.meta.url)), 'src');

// Files allowed to name a colour literally: the palette itself defines them,
// toon.js only has a white default, and the text artifact is prose.
const ALLOWED = ['palette.js', join('render', 'toon.js'), join('koans', 'text', 'mumonkan.js')];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('the wash ramp runs from paper to ink and stays ordered', () => {
  assert.equal(wash(0).toLowerCase(), PAPER.toLowerCase());
  assert.equal(wash(1).toLowerCase(), INK.toLowerCase());
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  // clamps rather than extrapolating off the ends of the ramp
  assert.equal(wash(-1), wash(0));
  assert.equal(wash(2), wash(1));

  // each named step is strictly darker than the last, so the ramp reads as depth
  const steps = ['mist', 'ground', 'stone', 'dry', 'mid', 'dark', 'deep'];
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };
  for (let i = 1; i < steps.length; i++) {
    assert.ok(lum(WASH[steps[i]]) < lum(WASH[steps[i - 1]]),
      `${steps[i]} must be darker than ${steps[i - 1]}`);
  }
});

test('the wash is neutral — no step carries a hue of its own', () => {
  // Every step is a mix of PAPER and INK, so its channels must sit between
  // theirs. A green, teal or gold sneaking in would break this.
  const bounds = (i) => {
    const a = parseInt(PAPER.slice(1 + i * 2, 3 + i * 2), 16);
    const b = parseInt(INK.slice(1 + i * 2, 3 + i * 2), 16);
    return [Math.min(a, b), Math.max(a, b)];
  };
  for (const [name, hex] of Object.entries(WASH)) {
    for (let i = 0; i < 3; i++) {
      const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
      const [lo, hi] = bounds(i);
      assert.ok(v >= lo && v <= hi, `WASH.${name} channel ${i} (${v}) is outside the paper->ink range`);
    }
  }
});

test('no raw hex colours are authored outside the palette module', () => {
  // An invented hex is how a scene drifts off-palette one prop at a time. Reach
  // for WASH / wash(t) / ACCENT instead.
  const offenders = [];
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file);
    if (ALLOWED.some((a) => rel.endsWith(a))) continue;
    const src = readFileSync(file, 'utf8');
    for (const [i, line] of src.split('\n').entries()) {
      const m = line.match(/'#[0-9A-Fa-f]{3,8}'/g);
      if (m) offenders.push(`${rel}:${i + 1}  ${m.join(' ')}`);
    }
  }
  assert.deepEqual(offenders, [], `author colours from the palette:\n${offenders.join('\n')}`);
});

test('ACCENT is the only chromatic note in the palette', () => {
  const chroma = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(r, g, b) - Math.min(r, g, b);
  };
  assert.ok(chroma(ACCENT) > 60, 'the accent should actually be a colour');
  for (const [name, hex] of Object.entries(WASH)) {
    assert.ok(chroma(hex) < 25, `WASH.${name} is too chromatic (${chroma(hex)}) — the wash must stay neutral`);
  }
});
