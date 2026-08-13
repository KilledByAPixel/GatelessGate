import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeCliff } from '../src/kit/cliff.js';
import { makeHangingMonk } from '../src/kit/hangingmonk.js';
import k5 from '../src/koans/k5.js';
import { ACCENT, ACCENT_DEEP, INK, WASH } from '../src/palette.js';
import { fakeCtx as sharedCtx } from './helpers/fake-ctx.js';

const box = (o) => new THREE.Box3().setFromObject(o);

const fakeCtx = () => sharedCtx({ accent: k5.accent });

// ---- the cliff -----------------------------------------------------------

test('makeCliff is a wide broken lip that falls away into mist', () => {
  const cliff = makeCliff({ width: 10, drop: 5, depth: 2.2, seed: 5 });
  assert.equal(cliff.name, 'cliff');

  const names = cliff.children.map((c) => c.name);
  assert.ok(names.includes('lip'), 'a lip course');
  assert.ok(names.includes('face'), 'a face below it');
  const mists = cliff.children.filter((c) => c.name === 'mist');
  assert.ok(mists.length >= 3, 'banks of mist lie in the void');
  for (const m of mists) {
    assert.ok(m.material.transparent, 'mist is a soft unlit wash');
  }

  const b = box(cliff);
  assert.ok(b.max.y > 0.1 && b.max.y < 1.4, `lip pokes modestly above the turf, got ${b.max.y}`);
  assert.ok(b.min.y < -5 * 0.6, `the face falls away most of the drop, got ${b.min.y}`);
  assert.ok(b.min.z < -2.2, 'the mist reaches out past the rock, into the open air');
  assert.ok(b.max.x - b.min.x > 10 * 0.9, 'as wide as asked');
});

test('makeCliff blends into the ground at its lip and is deterministic by seed', () => {
  // default placement samples flat staging ground: every lip vertex stays low
  const cliff = makeCliff({ width: 10, drop: 5, seed: 7 });
  const lip = cliff.children.find((c) => c.name === 'lip');
  const pos = lip.geometry.attributes.position;
  let top = -Infinity;
  for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
  assert.ok(top > 0.15 && top < 1.2, `lip crowns just above the meadow, got ${top}`);

  const print = (seed) => JSON.stringify(makeCliff({ width: 10, drop: 5, seed }).footprint(0.5));
  assert.equal(print(7), print(7), 'same seed, same rock');
  assert.notEqual(print(7), print(8), 'different seed, different rock');
});

test('makeCliff owns its ground in circles: rock for the lip, void for the air', () => {
  const cliff = makeCliff({ width: 11, drop: 5, depth: 2.2, seed: 5 });
  const rock = cliff.footprint(0.5);
  const air = cliff.voidFootprint(0.5);
  assert.ok(rock.length > 8, 'a circle per lump along the lip and face');
  assert.ok(air.length >= 9, 'the mist field is covered without seams');
  for (const c of [...rock, ...air]) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z) && c.r > 0.5, JSON.stringify(c));
  }
  // built at identity: everything the mist owns lies on the drop side
  for (const c of air) assert.ok(c.z < 0, `void circles on the void side, got z=${c.z}`);
  // and the rock spans the stated width
  const xs = rock.map((c) => c.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 11 * 0.75, 'rock runs the length of the lip');

  // footprint follows the group's placement, cave.js style
  cliff.position.set(-3.4, 0, -2.0);
  cliff.rotation.y = Math.PI / 2;
  for (const c of cliff.voidFootprint(0.5)) {
    assert.ok(c.x < -3.4, `rotated to face -x, the mist keeps to the west, got x=${c.x}`);
  }
});

// ---- the hanging man -----------------------------------------------------

test('makeHangingMonk hangs from its pivot — the mass is all below the teeth', () => {
  const m = makeHangingMonk({ height: 1.6, seed: 5 });
  assert.equal(m.group.name, 'hangingmonk');
  const b = box(m.group);
  // The crown MAY rise a little past the grip now: the mouth sits on the
  // head's upper-front surface (the bite), so the back of the skull tips up
  // behind the branch line. Everything else stays below.
  assert.ok(b.max.y <= 0.12, `only the tipped-back crown rises past the bite, got ${b.max.y}`);
  assert.ok(b.min.y < -1.6 * 0.85, `a whole man hangs below it, got ${b.min.y}`);
  assert.ok(Math.max(b.max.x - b.min.x, b.max.z - b.min.z) < 0.8,
    'a hanging figure, not a spread one');

  const names = [];
  m.group.traverse((o) => { if (o.isMesh) names.push(o.name); });
  assert.ok(names.includes('head') && names.includes('body'), 'head and robe');
  assert.equal(names.filter((n) => n === 'arm').length, 2, 'both sleeves hang');
  assert.equal(names.filter((n) => n === 'foot').length, 2, 'feet together, resting on nothing');
  assert.ok(!names.includes('hat'), 'the hat did not stay on');
});

test('the hanging man is nearly still until nudged, then swings and steadies', () => {
  const m = makeHangingMonk({ height: 1.6, seed: 5 });
  let t = 0;
  const step = (n, out) => {
    for (let i = 0; i < n; i++) {
      t += 1 / 60;
      m.update(1 / 60, t);
      if (out) out.push(Math.abs(m.group.rotation.z));
    }
  };

  const rest = [];
  step(240, rest);
  assert.ok(Math.max(...rest) < 0.03, `at rest he barely breathes, got ${Math.max(...rest)}`);
  assert.equal(m.swinging(), false, 'stillness does not count as swinging');

  m.sway(1);
  const swung = [];
  step(120, swung);
  assert.ok(Math.max(...swung) > 0.06, `a nudge actually moves him, got ${Math.max(...swung)}`);
  assert.equal(m.swinging(), true);

  const early = Math.max(...swung.slice(0, 60));
  step(60 * 14);
  const late = [];
  step(120, late);
  assert.ok(Math.max(...late) < early * 0.5, 'the swing dies away');
  assert.ok(Math.max(...late) < 0.035, 'and he is a still man in a tree again');
  assert.equal(m.swinging(), false);
  assert.ok(Number.isFinite(m.energy()), 'energy stays finite');
});

test('the pendulum is deterministic: same seed and taps, same swing', () => {
  const drive = (seed) => {
    const m = makeHangingMonk({ height: 1.6, seed });
    const out = [];
    for (let i = 0; i < 300; i++) {
      if (i === 90) m.sway(1);
      m.update(1 / 60, i / 60);
      out.push(m.group.rotation.z);
    }
    return out;
  };
  assert.deepEqual(drive(5), drive(5));
  const a = drive(5), b = drive(9);
  assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 1e-6), 'a different seed breathes differently');
});

// ---- the case ------------------------------------------------------------

test('module shape matches the koan contract', () => {
  assert.equal(k5.id, 5);
  assert.equal(k5.slug, 'kyogen-mounts-the-tree');
  assert.equal(k5.accent, ACCENT);
  assert.equal(k5.tier, 2);
  assert.ok(/tree/i.test(k5.title), `title comes from the text artifact: ${k5.title}`);
  for (const f of ['case', 'comment', 'verse']) {
    assert.ok(k5.text[f] && k5.text[f].trim().length > 0, `text.${f} empty`);
  }
  assert.deepEqual(k5.ambience, ['wind:0.24:broadleaf']);   // the case IS a tree — the wind moves its leaves
  assert.ok(!k5.ambience.includes('music'), 'silence is right here');
  assert.ok(k5.camera && Number.isFinite(k5.camera.distance), 'a camera of its own');
  assert.ok(k5.camera.target[1] >= 2.0, 'the subject is UP — the frame pivots near branch height');
  assert.equal(typeof k5.build, 'function');
});

test('build stages the predicament: cliff, grey oak, one man alone over a real drop', () => {
  const built = k5.build(fakeCtx());
  assert.ok(built.scene instanceof THREE.Scene);
  for (const fn of ['update', 'dispose', 'fragment', 'setCamera']) {
    assert.equal(typeof built[fn], 'function', `root.${fn} missing`);
  }
  built.scene.updateMatrixWorld(true);

  const found = { cliff: [], oak: [], hangingmonk: [], monk: [], fallenhat: [], branch: [] };
  built.scene.traverse((o) => { if (found[o.name]) found[o.name].push(o); });
  // ONE precipice, built as two makeCliff segments since a retune ran the lip
  // on past both edges of the frame (the wall used to end
  // in shot). Segments of the same wall share the origin line: same yaw,
  // same x — a segment breaking rank would be a genuine second cliff.
  assert.equal(found.cliff.length, 2, 'one precipice, two segments of wall');
  const [c1, c2] = found.cliff;
  assert.equal(c1.rotation.y, c2.rotation.y, 'the wall does not bend between segments');
  assert.equal(c1.position.x, c2.position.x, 'the segments hold one line');
  assert.equal(found.oak.length, 1, 'one tree at its lip');
  assert.equal(found.branch.length, 1, 'one stout limb over the drop');
  assert.equal(found.hangingmonk.length, 1, 'one man hanging by his teeth');
  // The questioner is back — and where he stands is the whole
  // point of him: on GROUND, east of the lip, under the crown, turned to face
  // the man over the drop. A questioner hovering above the gorge, or aimed at
  // the horizon by the wrong one of monk.js's two verbs, is not a questioner.
  assert.equal(found.monk.length, 1, 'one man came to ask');
  const asker = found.monk[0];
  assert.ok(asker.position.x > -3.75, `he stands on the meadow side of the lip, got ${asker.position.x}`);
  // "under the tree" is measured off the CANOPY, not off a copied radius: the
  // oak grows where its seed tells it to, and a hardcoded number here would go
  // stale the next time that seed or height is touched.
  const crown = box(found.oak[0].children.find((c) => c.name === 'canopy'));
  assert.ok(asker.position.x > crown.min.x && asker.position.x < crown.max.x
    && asker.position.z > crown.min.z && asker.position.z < crown.max.z,
  `he stands under the crown (${JSON.stringify(crown.min.toArray().map((n) => +n.toFixed(1)))}`
  + `..${JSON.stringify(crown.max.toArray().map((n) => +n.toFixed(1)))}), got `
  + `${asker.position.x.toFixed(2)}, ${asker.position.z.toFixed(2)}`);
  const ab = box(asker);
  assert.ok(Math.abs(ab.min.y) < 0.06, `his feet are on the ground, got ${ab.min.y}`);
  // faceMonk fronts local +z, so his facing is (sin y, cos y): it has to point
  // at the hanging man, not merely be some rotation or other
  const dang = found.hangingmonk[0];
  const fx = Math.sin(asker.rotation.y), fz = Math.cos(asker.rotation.y);
  const tx = dang.position.x - asker.position.x, tz = dang.position.z - asker.position.z;
  const len = Math.hypot(tx, tz);
  assert.ok((fx * tx + fz * tz) / len > 0.985,
    'he is turned toward the man in the tree, not past him');
  assert.equal(found.fallenhat.length, 1, 'and the hat that did not stay on');

  // the seal: HIS robe, deepened for a person-sized mass — and nothing else red
  const dangler = found.hangingmonk[0];
  const body = dangler.getObjectByName('body');
  const deep = new THREE.Color(ACCENT_DEEP).getHexString();
  assert.equal(body.material.color.getHexString(), deep, 'the hanging robe carries the seal');
  const canopy = found.oak[0].children.find((c) => c.name === 'canopy');
  assert.equal(canopy.material.color.getHexString(), new THREE.Color(WASH.deep).getHexString(),
    'the oak stays grey — k38 owns the red tree');
  // the precipice is REAL: the ground mesh is carved below the lip. Sample
  // the actual geometry west of the cliff line and it must fall away, while
  // the meadow east of it stays put.
  const ground = built.scene.getObjectByName('ground');
  const gp = ground.geometry.attributes.position;
  let gorgeMin = Infinity, safeMin = Infinity;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i), y = gp.getY(i);
    if (z > -9 && z < 2) {
      if (x < -7 && x > -13) gorgeMin = Math.min(gorgeMin, y);
      if (x > -2 && x < 6) safeMin = Math.min(safeMin, y);
    }
  }
  assert.ok(gorgeMin < -4, `the gorge floor is genuinely down: ${gorgeMin.toFixed(2)}`);
  assert.ok(safeMin > -1, `the meadow side keeps its ground: ${safeMin.toFixed(2)}`);

  // he hangs UP at branch height, out past the lip, clear of the ground
  assert.ok(dangler.position.y > 2.8 && dangler.position.y < 3.4,
    `the grip is at branch height, got ${dangler.position.y}`);
  assert.ok(dangler.position.x < -4.5, 'and out over the void, west of the lip at -3.4');
  const db = box(dangler);
  assert.ok(db.min.y > 1.2, `his feet dangle well clear of anything, got ${db.min.y}`);

  // the crown never swallows him: no canopy vertex near his swing column
  const pos = canopy.geometry.attributes.position;
  const v = new THREE.Vector3();
  let nearest = Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    canopy.localToWorld(v);
    if (v.y > db.min.y - 0.1 && v.y < dangler.position.y + 0.1) {
      nearest = Math.min(nearest, Math.hypot(v.x - dangler.position.x, v.z - dangler.position.z));
    }
  }
  assert.ok(nearest > 0.75, `foliage keeps clear of the swing, got ${nearest}`);

  // the hat sits upright ON the safe ground, at y = 0, far below its owner
  const hat = found.fallenhat[0];
  hat.geometry.computeBoundingBox();
  const hb = hat.geometry.boundingBox.clone().applyMatrix4(hat.matrixWorld);
  assert.ok(Math.abs(hb.min.y) < 0.02, `the hat rests on the ground, got ${hb.min.y}`);
  assert.ok(hb.max.y < 0.25, 'a hat, not a hillock');
  assert.ok(hat.position.x > -3.4, 'on the safe side of the lip');
});

test('the scene runs without a renderer or audio, and reports a finite fragment', () => {
  const built = k5.build(fakeCtx());
  built.setCamera(null);
  built.onEnter && built.onEnter();      // audio is null: must not throw
  for (let i = 0; i < 120; i++) built.update(1 / 60, i / 60);
  const frag = built.fragment();
  assert.ok(Object.keys(frag).length > 0);
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} = ${v}`);
  }
  built.onExit && built.onExit();
  built.dispose();
});

test('tapping the hanging man sways him; he steadies; he never answers, never falls', () => {
  const ctx = fakeCtx();
  const built = k5.build(ctx);
  assert.ok(ctx._taps.length > 0, 'there has to be something to find');
  built.setCamera(new THREE.PerspectiveCamera());

  let t = 0;
  const run = (n) => { for (let i = 0; i < n; i++) { t += 1 / 60; built.update(1 / 60, t); } };

  run(60);
  assert.equal(built.fragment().sways, 0);
  assert.equal(built.fragment().swinging, false, 'still until touched');

  const dangler = built.scene.getObjectByName('hangingmonk');
  const before = dangler.position.y;
  ctx.input.raycastFirst = () => ({ object: dangler.children[0], point: new THREE.Vector3() });
  ctx._taps.forEach((cb) => cb(400, 300));
  assert.equal(built.fragment().sways, 1, 'the tap landed');
  run(30);
  assert.equal(built.fragment().swinging, true, 'and he swings a little');

  run(60 * 18);
  const after = built.fragment();
  assert.equal(after.swinging, false, 'then he steadies');
  assert.equal(after.sways, 1);
  assert.equal(dangler.position.y, before, 'he has not fallen — that is the whole koan');
});

test('no cliff lays paper over its own drop', () => {
  // A fog fill used to hang under the crags: an unlit near-paper solid that
  // made everything past the fog line paper instead of landscape. It read as a
  // slab laid across the chasm — a stray piece of geometry sitting on the cliff
  // bottom, which is how it got noticed at all — and both cases that carve a
  // real gorge look better with the drop
  // visible. Nothing builds it now — this is what would notice it coming back.
  const cliff = makeCliff({ width: 11, drop: 7, depth: 2.2, seed: 5, fogTop: -2.8, groundSeed: 21 });
  assert.equal(cliff.getObjectByName('fogfill'), undefined,
    'the drop is terrain, not a paper void');

  // the mist banks are what soften it, and they stay
  let banks = 0;
  cliff.traverse((o) => { if (o.name === 'mist') banks++; });
  assert.ok(banks >= 3, `the mist does the softening now, got ${banks} banks`);
});

test('case 5 shows its gorge: no paper lid over the drop it carved', () => {
  // The kit fills a gorge with unlit near-paper by default, so everything past
  // the fog line is paper rather than landscape. This case carves a real gorge
  // with banked sides and a far wall and wants it SEEN, reading as an ordinary
  // terrain deformation. If a
  // future edit switches the fill back on, the carve stops being visible and
  // nothing else in this file would notice.
  const root = k5.build(fakeCtx());
  assert.equal(root.scene.getObjectByName('fogfill'), undefined,
    'the drop is terrain here, not a paper void');

  // the mist banks are still doing the softening
  let banks = 0;
  root.scene.traverse((o) => { if (o.name === 'mist') banks++; });
  assert.ok(banks > 0, 'the mist stays — it is what keeps the floor from reading as a lawn');

  // and the thing the fill was hiding is genuinely down there to look at
  const ground = root.scene.getObjectByName('ground');
  const gp = ground.geometry.attributes.position;
  let deepest = Infinity;
  for (let i = 0; i < gp.count; i++) deepest = Math.min(deepest, gp.getY(i));
  assert.ok(deepest < -5, `there is a real gorge to see: floor at ${deepest.toFixed(1)}`);
});
