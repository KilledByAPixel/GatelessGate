import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { skyFor, fogFor, applyNightSky, pageBase, fogBase, setNightDepth, nightDepth } from '../src/render/nightsky.js';
import { PAPER, mixHex } from '../src/palette.js';

// The shipped depths, so the knob test can put them back without naming them
// twice — a restore to a literal would silently go stale the moment either
// default is retuned, and leak that into every test after it.
const DEF = nightDepth();

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
};

test('day leaves a page exactly as the case painted it', () => {
  assert.equal(skyFor(PAPER, false), PAPER);
  assert.equal(skyFor('#F0B79C', false), '#F0B79C');
});

test('night takes the page down without taking it to black', () => {
  // HOW FAR is a judgement and belongs to the sliders, so this holds the two
  // ends rather than a band around whatever the depths happen to be: the sky
  // must actually move, and it must not arrive at black — the ink pass draws
  // in INK and needs something to sit on.
  const day = skyFor(PAPER, false);
  const night = skyFor(PAPER, true);
  assert.ok(lum(night) < lum(day) - 0.1, `the sky barely moved: ${day} -> ${night}`);
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

test('the fog goes much the shorter way — the sky is the change', () => {
  // The one relationship that is a design decision rather than a taste: fog
  // reaches everything far away, so a fog that travelled with the sky would
  // take the receding ground and the hills down too and read as a re-lighting.
  // Its share exists to kill the pale band along the horizon, nothing more.
  assert.ok(DEF.fog < DEF.sky / 2, `the fog is doing too much of the work: ${JSON.stringify(DEF)}`);
  const s = scene();
  applyNightSky(s, true);
  const sky = '#' + s.background.getHexString();
  const fog = '#' + s.fog.color.getHexString();
  assert.notEqual(sky, PAPER.toLowerCase(), 'the sky moved');
  assert.notEqual(fog, sky, 'and the fog did not follow it all the way');
  assert.ok(lum(fog) > lum(sky), 'the land stays lighter than the sky above it');
});

test('the fog knob moves the fog and leaves the sky where it was', () => {
  const s = scene();
  applyNightSky(s, true);
  const sky = '#' + s.background.getHexString();
  const fogAtDefault = '#' + s.fog.color.getHexString();
  setNightDepth(DEF.sky, Math.min(1, DEF.fog + 0.3));
  applyNightSky(s, true);
  assert.notEqual('#' + s.fog.color.getHexString(), fogAtDefault, 'the knob does something');
  assert.equal('#' + s.background.getHexString(), sky, 'and it is not the sky');
  setNightDepth(DEF.sky, DEF.fog);
  applyNightSky(s, true);
  assert.equal('#' + s.fog.color.getHexString(), fogAtDefault, 'and it comes back');
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
  assert.equal(fogBase(s, PAPER), fogFor(PAPER, true), 'the fog base is its own, not the sky’s');
  assert.equal(s.userData.night, true);
});
