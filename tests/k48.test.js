import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k48 from '../src/koans/k48.js';
import { fakeCtx } from './helpers/fake-ctx.js';
import { rigCamera } from './helpers/rig-camera.js';
import { setFoliageWeather, foliageWind } from '../src/kit/foliage.js';

const CAM = { distance: 11.2, target: [0.8, 1.45, -0.4], heading: 31.5, pitch: 14.9 };
const FOG = 0.028;      // the case's own FogExp2 density

const built = () => k48.build(fakeCtx());

// Every vertex of the ship, in NDC, from the case's own framing.
function shipBounds(boat, aspect) {
  const cam = rigCamera(CAM, { aspect });
  boat.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, off: 0, n: 0 };
  boat.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      o.localToWorld(v);
      v.project(cam);
      b.x0 = Math.min(b.x0, v.x); b.x1 = Math.max(b.x1, v.x);
      b.y0 = Math.min(b.y0, v.y); b.y1 = Math.max(b.y1, v.y);
      b.n++;
      if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) b.off++;
    }
  });
  return b;
}

test('a ship stands out on the eastern sea', () => {
  const root = built();
  const boat = root.scene.getObjectByName('boat');
  assert.ok(boat, 'the sea is not empty');
  const parts = boat.children.map((c) => c.name);
  for (const want of ['hull', 'mast', 'sail']) assert.ok(parts.includes(want), `it has a ${want}`);
  assert.ok(boat.position.z < -18, 'and it is seaward of the waterline, not beached');
});

// It was placed by measuring the picture, so the picture is what pins it. The
// narrow aspect is the reading pane, where the stage is far narrower than the
// window — a framing that holds at 1.78 can lose its subject at 0.8.
test('the ship is wholly in frame at both aspects, clear of the figures', () => {
  const root = built();
  const boat = root.scene.getObjectByName('boat');
  for (const aspect of [1.78, 0.8]) {
    const b = shipBounds(boat, aspect);
    assert.equal(b.off, 0, `every vertex is inside the frame at aspect ${aspect}`);
    // up-screen: the sea band sits above the two figures, so the ship can never
    // collide with the fan whatever its x
    assert.ok(b.y0 > 0.25, `it rides the sea band, not the foreground (aspect ${aspect})`);
  }
});

test('the fog leaves enough of it to read — case 11\'s ship is the benchmark', () => {
  const root = built();
  const boat = root.scene.getObjectByName('boat');
  const cam = rigCamera(CAM, { aspect: 1.78 });
  const d = boat.getWorldPosition(new THREE.Vector3()).distanceTo(cam.position);
  const visible = Math.exp(-((FOG * d) ** 2));
  assert.ok(visible > 0.15 && visible < 0.35,
    `about a fifth of it survives the fog (${(visible * 100).toFixed(0)}% at ${d.toFixed(0)} units)`);
});

// The lug sail is one flat quad in the hull's x = 0 plane: a bow-on or stern-on
// ship shows an edge and nothing else, losing the junk silhouette the whole
// model exists to make. The yaw was chosen as the broadest this projects.
test('the sail is broadside enough to read as a sail', () => {
  const root = built();
  const boat = root.scene.getObjectByName('boat');
  const sail = boat.getObjectByName('sail');
  const hull = boat.getObjectByName('hull');
  boat.updateMatrixWorld(true);
  const cam = rigCamera(CAM, { aspect: 1.78 });
  const width = (mesh) => {
    const pos = mesh.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); mesh.localToWorld(v); v.project(cam);
      lo = Math.min(lo, v.x); hi = Math.max(hi, v.x);
    }
    return hi - lo;
  };
  assert.ok(width(sail) > 0.06, `the sail is not edge-on (${width(sail).toFixed(3)} of the frame)`);
  assert.ok(width(sail) > width(hull) * 0.5, 'and it is a real part of the silhouette');
});

test('the ship rides the same swell the foam does', () => {
  const root = built();
  const boat = root.scene.getObjectByName('boat');
  const ys = [], rolls = [];
  for (let i = 0; i < 60 * 20; i++) {
    root.update(1 / 60, i / 60);
    if (i % 20 === 0) { ys.push(boat.position.y); rolls.push(boat.rotation.z); }
  }
  for (const y of ys) assert.ok(Number.isFinite(y));
  const span = (a) => Math.max(...a) - Math.min(...a);
  assert.ok(span(ys) > 0.02, `it rises and falls (${span(ys).toFixed(3)})`);
  assert.ok(span(rolls) > 0.02, `and rocks (${span(rolls).toFixed(3)})`);
  // ...but it is moored, not adrift: the case owns x and z
  assert.equal(boat.position.x, -14);
  assert.equal(boat.position.z, -30);
});

// ---- the fan, and the shower it calls -------------------------------------
// THE STROKE IS GONE. Kembo "draws the figure one in the air", so a red bar
// used to hang there and a tap redrew it left to right at the speed of a brush.
// It never read as a mark being made — what came out read as a rectangle
// appearing: a horizontal
// slab in mid-air has no brush behind it and nothing in the picture explains
// where it came from. What replaced it is Ummon's half of the case — his fan
// jumped to the thirty-third heaven and struck the carp of the eastern sea, so
// a wave of it brings weather rather than a diagram.
function shower() {
  setFoliageWeather({ wind: 1 });
  const heard = [];
  const ctx = fakeCtx({
    audio: {
      cloth: () => heard.push('cloth'),
      setWindLevel() {}, setRainLevel() {}, setWaterSwell() {},
    },
  });
  const root = k48.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  root.update(1 / 60, 0);
  const kembo = root.scene.children.find((c) => c.name === 'monk');
  const own = [];
  kembo.traverse((o) => { if (o.isMesh && o.material.visible !== false) own.push(o); });
  ctx.input.raycastFirst = (cam, objs) => {
    for (const o of objs || []) if (own.includes(o)) return { object: o, point: new THREE.Vector3() };
    return null;
  };
  let t = 0;
  const run = (secs) => { for (const end = t + secs; t < end; t += 1 / 60) root.update(1 / 60, t); };
  return { ctx, root, run, heard, kembo, wave: () => ctx._taps.forEach((cb) => cb()) };
}

test('case 48: the floating rectangle is gone', () => {
  const { root } = shower();
  assert.equal(root.scene.getObjectByName('stroke'), undefined);
  assert.equal(root.scene.getObjectByName('stroke-bar'), undefined);
  assert.equal(root.scene.getObjectByName('stroke-hit'), undefined);
});

test('case 48: waving the fan brings a shower, and it passes', () => {
  const { root, run, heard, wave } = shower();
  const dry = root.fragment();
  assert.equal(dry.shower, 0, 'a clear sky to begin with');
  assert.equal(dry.rainLevel, 0, 'and not a drop');
  const restGrass = dry.grassWind;

  wave();
  assert.equal(root.fragment().waves, 1);
  assert.deepEqual(heard, ['cloth'], 'the fan is cloth and air, not a struck thing');

  run(2);
  const wet = root.fragment();
  assert.ok(wet.shower > 0.95, `it is raining (${wet.shower})`);
  assert.ok(wet.rainLevel > 0.95, 'and the drops are actually drawn');
  // "the wind will pick up just a LITTLE bit" — a third again, where case 34's
  // squall is more than four times over
  assert.ok(wet.grassWind > restGrass * 1.2, `the wind picks up (${wet.grassWind})`);
  assert.ok(wet.grassWind < restGrass * 1.8, `but only a little (${wet.grassWind})`);

  run(12);
  const after = root.fragment();
  assert.equal(after.shower, 0, 'showers do not switch off, but they do stop');
  assert.equal(after.rainLevel, 0);
  assert.equal(after.grassWind, restGrass, 'and the meadow gets its own wind back, to the number');
});

test('case 48: the fan comes back to exactly the pose it was built in', () => {
  const { root, run, kembo, wave } = shower();
  const arm = kembo.children
    .filter((c) => c.name === 'arm')
    .sort((a, b) => b.position.x - a.position.x)[0];
  assert.ok(arm, 'he has a raised arm with a fan on it');
  const rest = arm.rotation.x;

  wave();
  let swung = 0;
  let worst = 0;
  let prev = arm.rotation.x;
  for (let i = 0; i < 60 * 3; i++) {
    run(1 / 60);
    swung = Math.max(swung, Math.abs(arm.rotation.x - rest));
    worst = Math.max(worst, Math.abs(arm.rotation.x - prev));
    prev = arm.rotation.x;
  }
  assert.ok(swung > 0.2, `the fan actually crosses the air (${swung.toFixed(3)} rad)`);
  // A FAN IS ALLOWED TO BE BRISK where a bow is not — this one crosses its
  // whole arc in about a quarter of a second, so the per-frame limit here is
  // loose on purpose. What it still catches is a STEP: a switched gesture would
  // move the entire arc in one frame, and the threshold is well under that.
  assert.ok(worst < 0.12, `and no frame of it is a jump (${worst.toFixed(4)} rad)`);
  assert.ok(worst < swung * 0.4, 'no single frame carries most of the swing');
  // waveShape is exactly zero outside its own span, so nothing is left a
  // fraction off where it started
  assert.equal(arm.rotation.x, rest, 'and his arm is back where it was');
});

test('case 48: a second wave is refused until the first shower blows through', () => {
  const { root, run, wave } = shower();
  wave();
  run(3);
  wave();
  wave();
  assert.equal(root.fragment().waves, 1, 'one shower at a time');
  run(12);
  wave();
  assert.equal(root.fragment().waves, 2, 'and he answers again once it has gone');
});

test('case 48: leaving the page mid-shower does not take the weather along', () => {
  // the trees' wind is one module-level uniform shared by every tree in the book
  const { root, run, wave } = shower();
  wave();
  run(2);
  assert.ok(foliageWind() > 1.2, 'the wood is working while the page is open');
  root.dispose();
  assert.ok(Math.abs(foliageWind() - 1) < 1e-9, 'and is handed back on the way out');
});

test('case 48: the ambience carries a silent rain bed, not the dead stroke token', () => {
  // nothing in the audio engine ever answered to 'stroke' — it was only ever
  // counted as an emitter for the drift-density rule — so 'rain:0' takes the
  // same slot and the count is unchanged
  assert.ok(k48.ambience.includes('rain:0'), `a bed built silent: ${k48.ambience}`);
  assert.ok(!k48.ambience.some((tok) => String(tok).startsWith('stroke')), 'and no stroke');
});
