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

test('the fog is left alone by default — the sky is the whole change', () => {
  // Fog does not light anything, but it reaches everything far away, so
  // darkening it takes the receding ground and the hills with it and the
  // picture reads as re-lit when nothing was. The two are separate knobs and
  // the fog's starts at nothing; the cost is a pale band along the horizon,
  // which is what raising it buys back.
  const s = scene();
  applyNightSky(s, true);
  assert.equal('#' + s.fog.color.getHexString(), PAPER.toLowerCase(), 'the land keeps its own colour');
  assert.notEqual('#' + s.background.getHexString(), PAPER.toLowerCase(), 'and the sky does not');
});

test('the fog knob moves the fog and nothing else', () => {
  const s = scene();
  setNightDepth(DEF.sky, 0.4);
  applyNightSky(s, true);
  const fogAt4 = '#' + s.fog.color.getHexString();
  const sky = '#' + s.background.getHexString();
  assert.notEqual(fogAt4, PAPER.toLowerCase());
  assert.notEqual(fogAt4, sky, 'a partial fog does not land on the sky');
  setNightDepth(DEF.sky, DEF.fog);
  applyNightSky(s, true);
  assert.equal('#' + s.fog.color.getHexString(), PAPER.toLowerCase(), 'and back to nothing');
  assert.equal('#' + s.background.getHexString(), sky, 'the sky never moved');
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
