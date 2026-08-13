import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { skyFor, applyNightSky, pageBase } from '../src/render/nightsky.js';
import { PAPER, mixHex } from '../src/palette.js';

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
};

test('day leaves a page exactly as the case painted it', () => {
  assert.equal(skyFor(PAPER, false), PAPER);
  assert.equal(skyFor('#F0B79C', false), '#F0B79C');
});

test('night takes the page dark without taking it to black', () => {
  const night = skyFor(PAPER, true);
  assert.ok(lum(night) < 0.3, `not dark enough to read as night: ${night}`);
  assert.ok(lum(night) > 0.08, `so dark the ink has nothing to sit on: ${night}`);
});

test('a case that tints its own sky keeps its identity after dark', () => {
  // Case 27's red page and case 28's dusk must not collapse onto one colour —
  // the night is a mix with what the case chose, not a replacement for it.
  const red = skyFor('#F0B79C', true);
  const dusk = skyFor(mixHex(PAPER, '#1E1E24', 0.38), true);
  assert.notEqual(red, dusk);
  assert.notEqual(red, skyFor(PAPER, true));
});

function scene() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(PAPER);
  s.fog = new THREE.FogExp2(PAPER, 0.03);
  return s;
}

test('the fog goes with the sky, or the horizon comes back', () => {
  // Fog is what the land dissolves INTO before it can reach a horizon. A dark
  // sky over paper fog draws the exact line the whole book avoids.
  const s = scene();
  applyNightSky(s, true);
  assert.equal(s.background.getHexString(), s.fog.color.getHexString());
});

test('toggling back and forth is exactly reversible', () => {
  // The case's own colours are captured once. Re-reading the live background
  // instead would walk the page to black one press at a time.
  const s = scene();
  for (let i = 0; i < 8; i++) { applyNightSky(s, true); applyNightSky(s, false); }
  assert.equal('#' + s.background.getHexString(), PAPER.toLowerCase());
  applyNightSky(s, true);
  const once = '#' + s.background.getHexString();
  applyNightSky(s, true);
  assert.equal('#' + s.background.getHexString(), once, 'night is not cumulative');
});

test('pageBase reports what a self-animating case must lerp from', () => {
  const s = scene();
  assert.equal(pageBase(s, PAPER), PAPER, 'before any apply, the fallback');
  applyNightSky(s, true);
  assert.equal(pageBase(s, PAPER), skyFor(PAPER, true));
  assert.equal(s.userData.night, true);
});
