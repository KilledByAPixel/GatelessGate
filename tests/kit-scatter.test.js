import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeRocks, makeBushes, makeGrass, scatterPoints } from '../src/kit/scatter.js';
import { makeLantern } from '../src/kit/lantern.js';
import { makePath } from '../src/kit/path.js';
import { composeWorld } from '../src/kit/scenery.js';
import { makeGrassField } from '../src/kit/grassfield.js';
import { groundHeight } from '../src/kit/ground.js';
import k28 from '../src/koans/k28.js';

test('scatterPoints respects keepouts and stays in the annulus', () => {
  const keepout = [{ x: 0, z: 0, r: 6 }, { x: 10, z: 0, r: 3 }];
  const pts = scatterPoints({ count: 40, rMin: 4, rMax: 20, seed: 5, keepout });
  assert.ok(pts.length > 20, `should place most points, got ${pts.length}`);
  for (const p of pts) {
    const r = Math.hypot(p.x, p.z);
    assert.ok(r >= 4 - 1e-9 && r <= 20 + 1e-9, `outside annulus: ${r}`);
    for (const k of keepout) {
      assert.ok(Math.hypot(p.x - k.x, p.z - k.z) >= k.r, 'inside keepout');
    }
  }
  // deterministic
  const pts2 = scatterPoints({ count: 40, rMin: 4, rMax: 20, seed: 5, keepout });
  assert.deepEqual(pts, pts2);
});

test('rocks/bushes/grass are single instanced meshes sitting on the ground', () => {
  for (const [make, name] of [[makeRocks, 'rocks'], [makeBushes, 'bushes'], [makeGrass, 'grass']]) {
    const m = make({ seed: 7, groundSeed: 21 });
    assert.ok(m.isInstancedMesh, `${name} instanced`);
    assert.equal(m.name, name);
    assert.equal(m.userData.noOutline, true);
    assert.ok(m.count > 0);
    const m4 = new THREE.Matrix4();
    m.getMatrixAt(0, m4);
    const p = new THREE.Vector3().setFromMatrixPosition(m4);
    const gh = groundHeight(p.x, p.z, { seed: 21 });
    assert.ok(Math.abs(p.y - gh) < 0.6, `${name} should sit near ground: y=${p.y} gh=${gh}`);
  }
});

test('lantern stacks its stones above y=0', () => {
  const l = makeLantern({});
  assert.equal(l.name, 'lantern');
  assert.ok(l.children.length >= 5, 'base/post/firebox/window/roof/jewel at least');
  const box = new THREE.Box3().setFromObject(l);
  assert.ok(box.min.y > -0.02, `sits on ground, got ${box.min.y}`);
  assert.ok(box.max.y > 0.7, `tall enough, got ${box.max.y}`);
});

test('lantern firebox windows are a genuinely darker void than the stone', () => {
  const l = makeLantern({});
  const firebox = l.children.find((c) => c.name === 'firebox');
  const win = l.children.find((c) => c.name === 'window');
  assert.ok(firebox && win, 'both firebox and window meshes present');
  // luminance proxy: sum of RGB channels — the window mix must sit closer to
  // ink than the firebox stone does, not just a different hue.
  const lum = (mat) => mat.color.r + mat.color.g + mat.color.b;
  assert.ok(lum(win.material) < lum(firebox.material) - 0.15,
    `window (${lum(win.material).toFixed(3)}) should read darker than the firebox stone (${lum(firebox.material).toFixed(3)})`);
  // the window sits inside the firebox's own vertical span, not off in the roof
  const fBox = new THREE.Box3().setFromObject(firebox);
  const wBox = new THREE.Box3().setFromObject(win);
  assert.ok(wBox.min.y >= fBox.min.y - 1e-6 && wBox.max.y <= fBox.max.y + 1e-6,
    'window stays within the firebox height');
  // and it stands proud of the firebox face, not buried inside the solid box
  // (a panel with its outer face behind the wall would never be seen)
  assert.ok(wBox.max.x > fBox.max.x, 'window panel is proud of the firebox face, not sealed inside it');
});

test('lantern firebox window overlaps case 28\'s own flame band', () => {
  // Fix round 1: the reviewer measured the FIRST shipped rebuild's window at
  // 0.508–0.647 against k28's own flame at 0.68–0.88 (both at k28's explicit
  // height:1.15) — zero overlap, the flame sat entirely in the roof, same
  // burial the pre-existing lantern had. Derived from k28's own build()
  // rather than hardcoded so either file drifting out from under the other
  // is caught here, not just by eye.
  const built = k28.build({ audio: null, input: { onTap: () => {} } });
  const flame = built.scene.getObjectByName('flame');
  assert.ok(flame, 'k28 builds a flame mesh');
  const flameBox = new THREE.Box3().setFromObject(flame);

  const l = makeLantern({ height: 1.15 });   // k28's own explicit override
  const win = l.children.find((c) => c.name === 'window');
  const winBox = new THREE.Box3().setFromObject(win);

  const overlap = Math.min(flameBox.max.y, winBox.max.y) - Math.max(flameBox.min.y, winBox.min.y);
  const flameSpan = flameBox.max.y - flameBox.min.y;
  assert.ok(overlap > flameSpan * 0.5,
    `window (${winBox.min.y.toFixed(3)}-${winBox.max.y.toFixed(3)}) should cover most of the flame's own span `
    + `(${flameBox.min.y.toFixed(3)}-${flameBox.max.y.toFixed(3)}), got overlap=${overlap.toFixed(3)} of ${flameSpan.toFixed(3)}`);
});

test('lantern roof rim kicks up above the low point just behind it', () => {
  // Reproduces the builder's own profile formula (same disclosed
  // reproduce-the-tuned-constant tradeoff other D-tasks' eave/post tests
  // use) rather than a magic epsilon, and is mutation-provable: flip the
  // sign of LIP and this assertion goes false.
  const H = 1.15;
  const l = makeLantern({ height: H });
  const roof = l.children.find((c) => c.name === 'roof');
  assert.ok(roof, 'roof mesh present');
  const pos = roof.geometry.attributes.position;
  const ROOF_R = 0.21 * H;
  // bucket vertices near the rim tip (r close to ROOF_R) vs. the dip point
  // just inboard of it (r close to 0.85*ROOF_R) and compare their max y —
  // "max" because both the upper (visible) and lower (underside) surfaces
  // pass near each radius and we only care that the visible rim tip is the
  // higher of the two.
  let tipY = -Infinity, dipY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const r = Math.hypot(x, z);
    if (Math.abs(r - ROOF_R) < 0.01) tipY = Math.max(tipY, y);
    else if (Math.abs(r - 0.85 * ROOF_R) < 0.01) dipY = Math.max(dipY, y);
  }
  assert.ok(tipY > -Infinity && dipY > -Infinity, 'found both the rim tip and the dip point');
  assert.ok(tipY > dipY, `rim tip (${tipY.toFixed(4)}) should sit above the dip just behind it (${dipY.toFixed(4)}) — the upturn`);
});

test('path is a draped ribbon from A to B', () => {
  const p = makePath({ from: [0, 8], to: [0, -30], seed: 91, groundSeed: 21 });
  assert.equal(p.name, 'path');
  assert.equal(p.userData.noOutline, true);
  const pos = p.geometry.attributes.position;
  assert.ok(pos.count >= 40, 'enough samples');
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minZ = Math.min(minZ, pos.getZ(i));
    maxZ = Math.max(maxZ, pos.getZ(i));
    const gh = groundHeight(pos.getX(i), pos.getZ(i), { seed: 21 });
    assert.ok(Math.abs(pos.getY(i) - gh) < 0.2, `ribbon drapes the ground at i=${i}`);
  }
  assert.ok(minZ < -28 && maxZ > 6, `spans A to B: ${minZ}..${maxZ}`);
  // faces UP (a down-winding gets backface-culled and the path turns invisible)
  const nor = p.geometry.attributes.normal;
  let up = 0;
  for (let i = 0; i < nor.count; i++) if (nor.getY(i) > 0) up++;
  assert.ok(up > nor.count * 0.9, `normals should face up: ${up}/${nor.count}`);
});

test('path.sample gives centerline point, heading, and across-path vector', () => {
  const p = makePath({ from: [0, 8], to: [0, -30], width: 1.6, seed: 91, groundSeed: 21, wander: 0 });
  const s = p.sample(0.5);
  // straight path with no wander runs along -z at x≈0
  assert.ok(Math.abs(s.x) < 0.01, `centerline x≈0, got ${s.x}`);
  assert.ok(s.z < 8 && s.z > -30, `z within span, got ${s.z}`);
  // heading points down the road (-z): rotation.y = atan2(0,-1) = ±π
  assert.ok(Math.abs(Math.abs(s.heading) - Math.PI) < 0.05, `heading down -z, got ${s.heading}`);
  // perp is unit and across the path (has x component for a -z road)
  assert.ok(Math.abs(Math.hypot(s.perp.x, s.perp.z) - 1) < 1e-6, 'perp is unit');
  assert.ok(Math.abs(s.perp.x) > 0.9, `perp runs across (x), got ${s.perp.x}`);
  // sits on the ground
  assert.ok(Math.abs(s.y - groundHeight(s.x, s.z, { seed: 21 })) < 1e-6, 'y on ground');
});

test('makeGrassField: one instanced meadow, masked and ground-conforming', () => {
  const keepout = [{ x: 0, z: 0, r: 4 }];
  const f = makeGrassField({ count: 3000, radius: 14, seed: 5, groundSeed: 21, keepout });
  assert.equal(f.mesh.name, 'grassfield');
  assert.ok(f.mesh.isInstancedMesh, 'one instanced mesh = one draw call');
  assert.equal(f.mesh.userData.noOutline, true);
  assert.ok(f.blades > 500, `placed blades, got ${f.blades}`);

  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  for (let i = 0; i < f.blades; i++) {
    f.mesh.getMatrixAt(i, m4);
    p.setFromMatrixPosition(m4);
    assert.ok(Math.hypot(p.x, p.z) >= 4, 'no blade grows inside the keepout');
    assert.ok(Math.abs(p.y - groundHeight(p.x, p.z, { seed: 21 })) < 1e-6, 'blades sit on the ground');
  }
  // deterministic, and the wind is a uniform write (no per-frame CPU work)
  assert.equal(makeGrassField({ count: 3000, radius: 14, seed: 5, groundSeed: 21, keepout }).blades, f.blades);
  assert.doesNotThrow(() => f.update(1 / 60, 1.5));
});

test('composeWorld fills a scene deterministically and honors keepouts', () => {
  const a = new THREE.Scene();
  const b = new THREE.Scene();
  const opts = { seed: 3, groundSeed: 21, grass: 2000, keepout: [{ x: 0, z: 0, r: 5 }] };
  const worldA = composeWorld(a, opts);
  composeWorld(b, opts);
  const names = (s) => { const n = {}; s.traverse((o) => { if (o.name) n[o.name] = (n[o.name] || 0) + 1; }); return n; };
  const na = names(a);
  assert.ok(na.ground === 1 && na.mountains === 2 && na.forest === 2, JSON.stringify(na));
  assert.ok(na.rocks === 1 && na.bushes === 1 && na.grassfield === 1, 'scatter + meadow present');
  // the meadow is animated, so the world hands back a per-frame driver
  assert.equal(typeof worldA.update, 'function', 'composeWorld returns an update hook');
  assert.ok(worldA.grass.blades > 0, 'field actually placed blades');
  assert.ok((na.tree || 0) >= 3, `midground trees placed, got ${na.tree}`);
  assert.deepEqual(na, names(b), 'deterministic composition');
  // trees respect the keepout
  a.traverse((o) => {
    if (o.name === 'tree') {
      assert.ok(Math.hypot(o.position.x, o.position.z) >= 5, 'tree inside keepout');
    }
  });
});
