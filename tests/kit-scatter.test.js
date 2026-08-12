import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeRocks, makeBushes, scatterPoints } from '../src/kit/scatter.js';
import { makeLantern } from '../src/kit/lantern.js';
import { makePath } from '../src/kit/path.js';
import { composeWorld } from '../src/kit/scenery.js';
import { makeTuftField } from '../src/kit/tuftfield.js';
import { groundHeight } from '../src/kit/ground.js';
import k28 from '../src/koans/k28.js';
import { eyePosition } from '../src/camera.js';

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

test('rocks/bushes are single instanced meshes sitting on the ground', () => {
  for (const [make, name] of [[makeRocks, 'rocks'], [makeBushes, 'bushes']]) {
    const m = make({ seed: 7, groundSeed: 21 });
    assert.ok(m.isInstancedMesh, `${name} instanced`);
    assert.equal(m.name, name);
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
  assert.ok(l.children.length >= 5, 'base/post/firebox/candle/roof/jewel at least');
  const box = new THREE.Box3().setFromObject(l);
  assert.ok(box.min.y > -0.02, `sits on ground, got ${box.min.y}`);
  assert.ok(box.max.y > 0.7, `tall enough, got ${box.max.y}`);
});

test('lantern firebox is a truly open chamber — no interior box, candle inside', () => {
  // Fix round 3 (Frank: "there's something like a glass effect on the lantern
  // walls — make it just an open lantern so we can see the flame better"):
  // round 2's dark BackSide interior box read as smoked-glass panes, so it is
  // deleted outright. Open now means OPEN — a level ray through a face sails
  // clean out the far side and lands on nothing at all.
  const l = makeLantern({});
  const firebox = l.children.find((c) => c.name === 'firebox');
  const candle = l.children.find((c) => c.name === 'candle');
  assert.ok(firebox && candle, 'firebox and candle meshes present');
  assert.ok(!l.getObjectByName('window'), 'the interior box (the "glass") is gone');
  // luminance proxy: sum of RGB channels — the wax must read well paler than
  // the stone, the one colour step the open chamber keeps.
  const lum = (mat) => mat.color.r + mat.color.g + mat.color.b;
  assert.ok(lum(candle.material) > lum(firebox.material) + 0.3,
    `candle (${lum(candle.material).toFixed(3)}) should read paler than the stone (${lum(firebox.material).toFixed(3)})`);
  // Reproduce the builder's own proportions (H = 1.15 default; same disclosed
  // reproduce-the-formula tradeoff the roof-rim test uses) to aim two rays at
  // chamber mid-height — the midpoint of the open span between sill top and
  // header bottom, above the candle's tip:
  const H = 1.15;
  const FBOX_BOT = (0.09 + 0.27 + 0.045) * H;              // base + post + platform
  const midY = FBOX_BOT + ((0.055 + (0.40 - 0.05)) / 2) * H; // (sill top + header bottom) / 2
  l.updateMatrixWorld(true);
  // ray A, through the face opening (z offset clear of the pillars and the
  // candle's axis): with the chamber truly open it exits the far side and
  // hits NOTHING. Against round 2's interior box it stopped inside.
  const open = new THREE.Raycaster(new THREE.Vector3(2, midY, 0.045), new THREE.Vector3(-1, 0, 0));
  assert.equal(open.intersectObject(l, true).length, 0,
    'a level ray through the opening must pass clean through and out the far side');
  // ray B, aimed down a corner pillar's line at the same height, DOES meet
  // stone — so ray A passing through proves openness, not a missing lantern.
  const PILLAR_Z = (0.125 - 0.042 / 2) * H;                // pillar centreline
  const blocked = new THREE.Raycaster(new THREE.Vector3(2, midY, PILLAR_Z), new THREE.Vector3(-1, 0, 0));
  const hits = blocked.intersectObject(l, true);
  assert.ok(hits.length, 'the pillar ray meets the lantern');
  assert.equal(hits[0].object.name, 'firebox', `pillar ray should hit stone first, got '${hits[0].object.name}'`);
  assert.ok(hits[0].point.x > 0, `and the NEAR pillar (x>0), got x=${hits[0].point.x.toFixed(3)}`);
});

test('case 28\'s flame is visible from the case\'s own home camera', () => {
  // Fix round 1 measured band overlap; round 2 asserts the thing Frank
  // actually asked for — an unobstructed SIGHT-LINE. The home camera pose comes
  // from the rig's own eyePosition rather than a reproduced copy of its trig
  // (the disclosed reproduce-the-formula tradeoff the roof-rim test below still
  // carries), and a ray from there to the flame must reach it before any
  // lantern stone, roof or veranda timber. Derived from k28's own build() and
  // camera block, so
  // either file drifting out from under the other is caught here, not by eye.
  const built = k28.build({ audio: null, input: { onTap: () => {} } });
  const flame = built.scene.getObjectByName('flame');
  assert.ok(flame, 'k28 builds a flame mesh');
  built.scene.updateMatrixWorld(true);

  const cam = new THREE.Vector3(...eyePosition(k28.camera, k28.camera.target));

  const fpos = flame.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster(cam, fpos.clone().sub(cam).normalize());
  // solid meshes only: the invisible tap cylinder is deliberately in the way
  // (it IS the tap target), and instanced scatter/grass is waist-high set
  // dressing whose blades are not walls — this assertion is about the lantern
  // and the architecture around it.
  const solids = [];
  built.scene.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && o.name !== 'flame-hit') solids.push(o);
  });
  const hits = ray.intersectObjects(solids, false);
  assert.ok(hits.length, 'the sight-line lands on something');
  const first = hits[0].object.name;
  assert.ok(first === 'flame' || first === 'candle',
    `first thing on the camera's sight-line must be the flame/candle, got '${first}' `
    + `at ${hits[0].distance.toFixed(2)} (flame at ${cam.distanceTo(fpos).toFixed(2)})`);
});

test('lantern roof rim kicks up above the low point just behind it', () => {
  // Mutation-provable: flip the sign of LIP in the builder and this goes
  // false. The rim radius is READ BACK off the geometry rather than restated
  // here — it used to be a copy of the builder's 0.21·H constant, and the
  // moment Frank retuned the roof (0.25·H, and the dip flattened to zero) the
  // buckets stopped matching any vertex and the test failed for the wrong
  // reason. What is being pinned is the SHAPE, not the numbers.
  const H = 1.15;
  const l = makeLantern({ height: H });
  const roof = l.children.find((c) => c.name === 'roof');
  assert.ok(roof, 'roof mesh present');
  const pos = roof.geometry.attributes.position;
  let ROOF_R = 0;
  for (let i = 0; i < pos.count; i++) {
    ROOF_R = Math.max(ROOF_R, Math.hypot(pos.getX(i), pos.getZ(i)));
  }
  assert.ok(ROOF_R > 0.1 * H, `the roof has a real span: ${ROOF_R}`);
  // bucket vertices near the rim tip (r close to ROOF_R) vs. the dip point
  // just inboard of it (r close to 0.85*ROOF_R) and compare their max y —
  // "max" because both the upper (visible) and lower (underside) surfaces
  // pass near each radius and we only care that the visible rim tip is the
  // higher of the two.
  let tipY = -Infinity, dipY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const r = Math.hypot(x, z);
    if (Math.abs(r - ROOF_R) < 0.012) tipY = Math.max(tipY, y);
    else if (Math.abs(r - 0.85 * ROOF_R) < 0.012) dipY = Math.max(dipY, y);
  }
  assert.ok(tipY > -Infinity && dipY > -Infinity, 'found both the rim tip and the dip point');
  assert.ok(tipY > dipY, `rim tip (${tipY.toFixed(4)}) should sit above the dip just behind it (${dipY.toFixed(4)}) — the upturn`);
});

test('path is a draped ribbon from A to B', () => {
  const p = makePath({ from: [0, 8], to: [0, -30], seed: 91, groundSeed: 21 });
  assert.equal(p.name, 'path');
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

test('makeTuftField: one instanced meadow, masked and ground-conforming', () => {
  const keepout = [{ x: 0, z: 0, r: 4 }];
  const f = makeTuftField({ count: 3000, radius: 14, seed: 5, groundSeed: 21, keepout });
  assert.equal(f.mesh.name, 'grassfield');
  assert.ok(f.mesh.isInstancedMesh, 'one instanced mesh = one draw call');
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
  assert.equal(makeTuftField({ count: 3000, radius: 14, seed: 5, groundSeed: 21, keepout }).blades, f.blades);
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

test('path via bends the centerline; default stays the straight lerp', () => {
  const straight = makePath({ from: [0, 8], to: [0, -30], seed: 91, groundSeed: 21, wander: 0 });
  const bent = makePath({ from: [0, 8], to: [0, -30], via: [7, -11], seed: 91, groundSeed: 21, wander: 0 });
  // the bent road's mid-samples swing well toward the control point; ends pinned
  assert.ok(Math.abs(straight.sample(0.5).x) < 0.01, 'straight stays straight');
  assert.ok(bent.sample(0.5).x > 3, `mid-sample should swing toward via, got ${bent.sample(0.5).x}`);
  assert.ok(Math.abs(bent.sample(0).x - 0) < 0.01 && Math.abs(bent.sample(1).x - 0) < 0.15,
    'both ends stay where the case put them');
});

test('path tapers to a brush-lift at its far end, never to a degenerate tip', () => {
  const p = makePath({ from: [0, 8], to: [0, -30], seed: 91, groundSeed: 21, wander: 0 });
  const pos = p.geometry.attributes.position;
  const widthAt = (i) => {
    const l = new THREE.Vector3(pos.getX(i * 2), 0, pos.getZ(i * 2));
    const r = new THREE.Vector3(pos.getX(i * 2 + 1), 0, pos.getZ(i * 2 + 1));
    return l.distanceTo(r);
  };
  const nSamp = pos.count / 2 - 1;
  assert.ok(widthAt(nSamp) < widthAt(Math.floor(nSamp / 2)) * 0.15,
    `the far tip must be a near-point: tip ${widthAt(nSamp).toFixed(3)} vs mid ${widthAt(Math.floor(nSamp / 2)).toFixed(3)}`);
  assert.ok(widthAt(nSamp) > 0.01, 'but never fully degenerate (NaN normals)');
  assert.ok(widthAt(0) > widthAt(nSamp) * 5, 'the near end keeps its full width');
  // and the normals stay finite through the taper
  const nor = p.geometry.attributes.normal;
  for (let i = 0; i < nor.count; i++) {
    assert.ok(Number.isFinite(nor.getX(i)) && Number.isFinite(nor.getY(i)) && Number.isFinite(nor.getZ(i)),
      `non-finite normal at ${i}`);
  }
  // taper: 0 opts out — the old square end
  const blunt = makePath({ from: [0, 8], to: [0, -30], seed: 91, groundSeed: 21, wander: 0, taper: 0 });
  const bpos = blunt.geometry.attributes.position;
  const bl = new THREE.Vector3(bpos.getX((nSamp) * 2), 0, bpos.getZ((nSamp) * 2));
  const br = new THREE.Vector3(bpos.getX((nSamp) * 2 + 1), 0, bpos.getZ((nSamp) * 2 + 1));
  assert.ok(bl.distanceTo(br) > 0.8, 'taper: 0 keeps the square end');
});
