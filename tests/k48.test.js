import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k48 from '../src/koans/k48.js';
import { fakeCtx } from './helpers/fake-ctx.js';
import { rigCamera } from './helpers/rig-camera.js';

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
    if (!o.isMesh || o.userData.isOutline) return;
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
  const parts = boat.children.filter((c) => !c.userData.isOutline).map((c) => c.name);
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
