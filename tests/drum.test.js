import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeDrum, collectDrums, beatDrumAt, setDrumAudio } from '../src/kit/drum.js';
import { CASES } from '../src/koans/index.js';
import { loadKoan, isStaged } from '../src/koans/registry.js';
import { fakeCtx } from './helpers/fake-ctx.js';
import { rigCamera } from './helpers/rig-camera.js';

// A DRUM ANSWERS WHEREVER IT STANDS. The behaviour is the kit piece's, not the
// page's — it was per-case, and the result was one of the two drums in the book
// answering while the other was a barrel of scenery that swallowed every touch
// aimed at it. These hold the rule rather than the two cases, so a drum set
// down in a fiftieth case is covered without anyone remembering to wire it.

// A raycast that behaves like the real one, aimed at a given screen point.
function aimedInput(ndc) {
  const ray = new THREE.Raycaster();
  return {
    raycastFirst(camera, objects) {
      ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
      const hits = ray.intersectObjects(objects, false);
      return hits.length ? hits[0] : null;
    },
  };
}

test('a drum marks itself so a scene sweep finds it', () => {
  const scene = new THREE.Scene();
  const d = makeDrum({ radius: 0.5, seed: 13 });
  scene.add(d.group);
  const found = collectDrums(scene);
  assert.equal(found.length, 1);
  assert.equal(found[0], d, 'the sweep hands back the drum object, not the group');
  assert.deepEqual(collectDrums(new THREE.Scene()), [], 'a scene with none is empty, not undefined');
});

test('the central tap strikes it and reaches the audio engine', () => {
  const calls = [];
  setDrumAudio({ drum: (o) => calls.push(o) });
  const scene = new THREE.Scene();
  const d = makeDrum({ radius: 0.5, seed: 13 });
  scene.add(d.group);
  scene.updateMatrixWorld(true);

  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const centre = new THREE.Box3().setFromObject(d.group).getCenter(new THREE.Vector3());
  cam.position.set(centre.x, centre.y, centre.z + 6);
  cam.lookAt(centre);
  cam.updateMatrixWorld(true);

  assert.equal(d.beats(), 0);
  assert.equal(beatDrumAt([d], cam, aimedInput(centre.clone().project(cam))), true);
  assert.equal(d.beats(), 1, 'the count lives on the drum, not on the case');
  assert.equal(calls.length, 1);
  // .position on a nested group is a LOCAL position — finite, plausible, wrong.
  assert.ok(calls[0].at instanceof THREE.Vector3 && calls[0].at.toArray().every(Number.isFinite));

  // a miss is a miss, and spends nothing
  assert.equal(beatDrumAt([d], cam, { raycastFirst: () => null }), false);
  assert.equal(d.beats(), 1);
  setDrumAudio(null);
});

test('no engine is silence, not a throw', () => {
  // build() and a tap both have to survive a scene with no audio engine at all.
  setDrumAudio(null);
  const d = makeDrum({ seed: 1 });
  const cam = new THREE.PerspectiveCamera();
  assert.equal(beatDrumAt([d], cam, { raycastFirst: () => ({}) }), true);
  assert.equal(d.beats(), 1);
});

test('a struck drum rocks, and settles', () => {
  // The other half of "it just works", and the half that was missed first: the
  // rock and the skin bulge only advance inside update(), so a drum nobody
  // drives is struck in silence and never moves. main.js drives every drum it
  // sweeps, the same way it drives every hung chime.
  setDrumAudio({ drum() {} });
  const d = makeDrum({ seed: 13 });
  let t = 0;
  const drive = (n) => { for (let i = 0; i < n; i++) { t += 1 / 60; d.update(1 / 60, t); } };
  drive(6);
  assert.equal(d.angle(), 0, 'at rest before anything touches it');

  beatDrumAt([d], new THREE.PerspectiveCamera(), { raycastFirst: () => ({}) });
  let peak = 0;
  for (let i = 0; i < 40; i++) { drive(1); peak = Math.max(peak, Math.abs(d.angle())); }
  assert.ok(peak > 0.01, `struck and never moved: peak ${peak}`);

  drive(300);
  assert.ok(Math.abs(d.angle()) < 1e-3, `never settles: ${d.angle()}`);
  setDrumAudio(null);
});

test('driving a drum twice at one simTime is not double motion', () => {
  // main drives every drum, and a case may still drive its own — case 13 does.
  // Both at once has to be the same as either alone, or the two would compound.
  const a = makeDrum({ seed: 5 });
  const b = makeDrum({ seed: 5 });
  a.strike(); b.strike();
  for (let i = 1; i <= 30; i++) {
    const t = i / 60;
    a.update(1 / 60, t);
    b.update(1 / 60, t); b.update(1 / 60, t);   // the case's call AND main's
  }
  assert.equal(a.angle(), b.angle(), 'a second call at the same simTime moved it');
});

test('every drum in the book answers a touch aimed at it', async () => {
  // The rule, held across the whole book: find each staged case's drums, aim a
  // real ray at the barrel from the case's own home framing, and require the
  // touch to land. This is what case 16 failed for months.
  const calls = [];
  setDrumAudio({ drum: (o) => calls.push(o) });
  const seen = [];
  for (const entry of CASES) {
    if (!isStaged(entry.slug)) continue;
    const mod = await loadKoan(entry.slug);
    const root = mod.build(fakeCtx());
    root.update(1 / 60, 0);
    root.scene.updateMatrixWorld(true);
    const drums = collectDrums(root.scene);
    if (!drums.length) continue;
    const cam = rigCamera(mod.camera || {}, { far: 200 });
    for (const d of drums) {
      const centre = new THREE.Box3().setFromObject(d.group).getCenter(new THREE.Vector3());
      const before = calls.length;
      beatDrumAt([d], cam, aimedInput(centre.clone().project(cam)));
      seen.push([entry.id, calls.length > before]);
    }
  }
  assert.ok(seen.length >= 2, `only ${seen.length} drums found — the sweep is not finding them`);
  assert.deepEqual(seen.filter(([, ok]) => !ok), [], `a drum that swallows a touch: ${JSON.stringify(seen)}`);
  setDrumAudio(null);
});
