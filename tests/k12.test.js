import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k12 from '../src/koans/k12.js';
import { ACCENT } from '../src/palette.js';
import { groundHeight } from '../src/kit/ground.js';
import { fakeCtx } from './helpers/fake-ctx.js';
import { rigCamera as sharedRig } from './helpers/rig-camera.js';

// Zuigan on his ledge, calling himself. Two things this file guards:
//
//   * THE EMPTY MIDDLE. The cliff's void keepout was stripping grass off more
//     than half the near field to keep it from growing "over the drop" — but
//     this case never carves its ground, so the drop is entirely below y = 0
//     and invisible. There was no gorge on screen, only a bald patch standing
//     in for one, right where the lens points.
//   * THE BUTTERFLIES, moved here out of case 19. They are this case's seal
//     now, so they have to be red, they have to be where the camera is looking,
//     and — the part that was wrong — a landed one must actually STOP.

// a camera exactly where the case's own `camera` block puts it
const rigCamera = (aspect = 0.87) => sharedRig(k12.camera, { aspect });

const staged = () => {
  const root = k12.build(fakeCtx());
  root.update(1 / 60, 0);
  root.scene.updateMatrixWorld(true);
  return root;
};

test('module shape matches the koan contract', () => {
  assert.equal(k12.id, 12);
  assert.equal(k12.slug, 'zuigan-calls-his-own-master');
  assert.equal(k12.accent, ACCENT);
  assert.equal(k12.mood, 'yo');
  assert.equal(typeof k12.build, 'function');
});

// The ledge is the case: "a voice comes back" needs somewhere for it to come
// back FROM. It is carved into the ground mesh, not drawn by the cliff prop, and
// the two failure modes are silent — a drop that is all below the ground plane
// (which is what this case shipped with for months), and a camera that hangs
// over the middle of the hole so the whole gorge falls out of the bottom of the
// frame.
test('there is a real drop, on the camera\'s side, and the lens stands clear of it', () => {
  const root = staged();
  const ground = root.scene.getObjectByName('ground');
  const gp = ground.geometry.attributes.position;

  let voidMin = Infinity, meadowMin = Infinity, rimMin = Infinity;
  const cam = rigCamera().position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i), y = gp.getY(i);
    if (Math.abs(x) > 3) continue;                     // down the middle of the bay
    if (z > 3 && z < 7) voidMin = Math.min(voidMin, y);        // out over the air
    if (z < -2 && z > -12) meadowMin = Math.min(meadowMin, y); // behind him
    if (Math.abs(z - cam.z) < 1.5) rimMin = Math.min(rimMin, y); // under the camera
  }
  assert.ok(voidMin < -4, `the gorge is genuinely down: ${voidMin.toFixed(2)}`);
  assert.ok(meadowMin > -0.6, `the meadow behind him keeps its ground: ${meadowMin.toFixed(2)}`);
  // THE ONE THE SHOT DEPENDS ON. The camera's own ground track has to be back on
  // solid rim, past the far side of the chasm — from over the hole there is
  // nothing to see, because the drop is then straight down out of frame.
  assert.ok(rimMin > -0.6,
    `the camera hangs over the chasm (ground at ${rimMin.toFixed(2)} under z=${cam.z.toFixed(1)})`);

  // he stands on the solid side, near the brink but not past it
  const zuigan = root.scene.getObjectByName('monk');
  const feet = new THREE.Box3().setFromObject(zuigan).min.y;
  assert.ok(Math.abs(feet) < 0.15, `his feet are on the ground, got ${feet.toFixed(2)}`);

  // and nothing grows out over the air
  const grass = root.scene.getObjectByName('grassfield');
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3();
  let floating = 0;
  grass.traverse((o) => {
    if (!o.isInstancedMesh) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m4);
      p.setFromMatrixPosition(m4);
      o.localToWorld(p);
      if (p.z > 3 && p.z < 7 && Math.abs(p.x) < 6) floating++;
    }
  });
  assert.equal(floating, 0, `${floating} blades are growing on air over the gorge`);
});

test('the man carries no red: his staff is his own, and ink', () => {
  const root = staged();
  const zuigan = root.scene.getObjectByName('monk');
  assert.ok(zuigan, 'there is one figure up here');
  const staff = zuigan.getObjectByName('staff');
  assert.ok(staff, 'he holds a staff — the kit\'s, not a shaft planted beside him');
  assert.notEqual('#' + staff.material.color.getHexString(), ACCENT.toLowerCase(),
    'the staff gave up the red — the butterflies carry it now');
  // and nothing else on him took it either
  zuigan.traverse((o) => {
    if (!o.isMesh) return;
    assert.notEqual('#' + o.material.color.getHexString(), ACCENT.toLowerCase(),
      `${o.name} is wearing the accent`);
  });
  // the free-standing shaft is gone from the scene root as well
  assert.ok(!root.scene.children.some((o) => o.name === 'staff'),
    'the planted red staff is gone');
});

test('the grass reaches him: no bald ring around the one figure in the scene', () => {
  const root = staged();
  const grass = root.scene.getObjectByName('grassfield');
  assert.ok(grass, 'there is a meadow at all');

  // gather every blade's plan position, whatever mesh form the field takes
  const pts = [];
  grass.traverse((o) => {
    if (o.isInstancedMesh) {
      const m4 = new THREE.Matrix4(), p = new THREE.Vector3();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4);
        p.setFromMatrixPosition(m4);
        o.localToWorld(p);
        pts.push({ x: p.x, z: p.z });
      }
    }
  });
  assert.ok(pts.length > 100, `the field has to have blades in it, got ${pts.length}`);

  const zuigan = root.scene.getObjectByName('monk');
  const near = pts.filter((p) => Math.hypot(p.x - zuigan.position.x, p.z - zuigan.position.z) < 3);
  assert.ok(near.length > 100,
    `only ${near.length} blades within three units of him — the clearing is back`);

  // AND THE MIDDLE OF THE PICTURE. A ray down the centre column of the shipped
  // lens lands on plain ground from (-3, -5) out to (-12, -16); that whole
  // strip used to be masked bare, and it is the part the reader is looking at.
  const mid = pts.filter((p) => p.x > -13 && p.x < -2 && p.z > -17 && p.z < -4);
  assert.ok(mid.length > 500,
    `only ${mid.length} blades where the camera is actually pointed`);
});

test('the butterflies are the seal, and they play where the lens is pointed', () => {
  const root = staged();
  const group = root.scene.getObjectByName('butterflies');
  assert.ok(group, 'the butterflies moved here from case 19');

  const each = [];
  group.traverse((o) => { if (o.name === 'butterfly') each.push(o); });
  assert.ok(each.length >= 5 && each.length <= 9, `a handful, got ${each.length}`);
  for (const b of each) {
    b.traverse((o) => {
      if (!o.isMesh) return;
      assert.equal('#' + o.material.color.getHexString(), ACCENT.toLowerCase(),
        'they carry this case\'s one red');
    });
  }

  // in frame, and out over the open ground rather than knotted beside him
  const cam = rigCamera();
  let inFrame = 0;
  let sumZ = 0;
  for (let i = 0; i < 60 * 30; i++) {
    root.update(1 / 60, i / 60);
    if (i % 300) continue;
    root.scene.updateMatrixWorld(true);
    for (const b of each) {
      const p = b.getWorldPosition(new THREE.Vector3());
      sumZ += p.z;
      const v = p.clone().project(cam);
      if (Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9 && v.z > 0 && v.z < 1) inFrame++;
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
      // whenever one is down, it is down on the ground the meadow actually has
      if (p.y < 0.4) {
        const gh = groundHeight(p.x, p.z, { seed: 21 });
        assert.ok(p.y > gh - 0.05, `perched below the turf: ${p.y.toFixed(2)} vs ${gh.toFixed(2)}`);
      }
    }
  }
  assert.ok(inFrame > each.length * 4, `mostly in the picture, got ${inFrame}`);
  assert.ok(sumZ / (each.length * 6) < -1.5, 'the flight is out over the open ground, not at his feet');
});

// A landed butterfly should STOP IN PLACE, on top of the grass it came down on,
// rather than sliding along the ground. The wander is a function of time, so a
// perched butterfly kept drifting with its wings shut. Stopping the PATH's
// clock for the perch is what fixes it, and this is the pin: while a butterfly
// is down, it does not move at all.
test('a landed butterfly is landed — it holds its spot, then leaves it', () => {
  const root = staged();
  const each = [];
  root.scene.getObjectByName('butterflies').traverse((o) => {
    if (o.name === 'butterfly') each.push(o);
  });

  const track = each.map(() => []);
  for (let i = 0; i < 60 * 45; i++) {
    root.update(1 / 60, i / 60);
    root.scene.updateMatrixWorld(true);
    each.forEach((b, k) => track[k].push(b.getWorldPosition(new THREE.Vector3())));
  }

  // Asked the other way round on purpose: rather than deciding which frames
  // "count as landed" from a height threshold — the last frame of a descent
  // sits a fraction of a micron above perch height, and any tolerance either
  // swallows it or trips on it — find the stretches where the butterfly does
  // not move AT ALL, and check those are real. That is the property itself,
  // stated directly.
  let landed = 0;
  for (const path of track) {
    let run = 0, best = 0, bestEnd = -1;
    for (let i = 1; i < path.length; i++) {
      const still = Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z) < 1e-12;
      run = still ? run + 1 : 0;
      if (run > best) { best = run; bestEnd = i; }
    }
    if (best < 60) continue;                       // never settled in this window
    landed++;
    assert.ok(best < path.length - 60, 'it landed and never took off again');
    // and it was ON the grass while it sat there, not stalled in mid-air. Grass
    // TIP height, not the dirt: grassfield's blade is 0.34, and a butterfly at
    // 0.16 settled halfway down inside the field, in the dirt between blades
    // rather than on top of a grass puff.
    const p = path[bestEnd];
    const gh = groundHeight(p.x, p.z, { seed: 21 });
    const sit = p.y - gh;
    assert.ok(sit > 0.2 && sit < 0.45, `it stopped ${sit.toFixed(2)} off the turf`);
    // it moves again afterwards
    const after = path[Math.min(path.length - 1, bestEnd + 120)];
    assert.ok(after.distanceTo(p) > 0.05, 'it never left the spot it landed on');
  }
  assert.ok(landed >= 3, `most of them should get a full sit inside 45s, got ${landed}`);

  // and no jump at the moment of take-off: the path resumes where it stopped
  for (const path of track) {
    for (let i = 1; i < path.length; i++) {
      assert.ok(path[i].distanceTo(path[i - 1]) < 0.25,
        'the flight teleports somewhere — the path clock is discontinuous');
    }
  }
});

test('calling startles them, and the fragment stays finite', () => {
  const ctx = fakeCtx();
  const root = k12.build(ctx);
  const hit = root.scene.getObjectByName('zuigan-hit');
  root.setCamera(new THREE.PerspectiveCamera());
  for (let i = 0; i < 240; i++) root.update(1 / 60, i / 60);
  const calm = root.fragment().flutter;

  ctx.input.raycastFirst = (cam, objs) => (objs.includes(hit) ? { object: hit, point: new THREE.Vector3() } : null);
  ctx._taps.forEach((cb) => cb(10, 10));
  assert.equal(root.fragment().calls, 1, 'the call landed');
  // half a second in, not on the tap's own frame: the alarm envelope has an
  // attack now, so nothing in the flock snaps to its excited state (see
  // butterflies.test.js for what that cost the birds)
  for (let i = 0; i < 30; i++) root.update(1 / 60, 4 + i / 60);
  assert.ok(root.fragment().flutter > calm + 0.5, 'and it put them up');

  // 20 seconds, not 10: the flit's e-folding was lengthened from 2.2s to 3.4s
  // so the excitement lasts as long as the flight it drives (a scare used to be
  // three-quarters spent before a butterfly had finished climbing out of the
  // grass). Six e-folds still puts it comfortably under the floor.
  for (let i = 0; i < 1200; i++) root.update(1 / 60, 4 + i / 60);
  const frag = root.fragment();
  assert.ok(frag.flutter < 0.05, `they settle back to playing, got ${frag.flutter}`);
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} = ${v}`);
  }
});

test('the ledge is seen, not papered over', () => {
  // Same call as case 5's, made for the same reason and reported separately:
  // the kit used to fill the drop with unlit near-paper so nothing past the fog
  // line was landscape, and on a ledge this shallow it read as a slab laid over
  // the gorge rather than as depth. The carve below IS the picture here.
  const root = staged();
  assert.equal(root.scene.getObjectByName('fogfill'), undefined,
    'nothing lays paper over the drop this case carved');

  // and the drop it carved is still there to be looked at
  const gp = root.scene.getObjectByName('ground').geometry.attributes.position;
  let deepest = Infinity;
  for (let i = 0; i < gp.count; i++) deepest = Math.min(deepest, gp.getY(i));
  assert.ok(deepest < -4, `a real ledge to see over: floor at ${deepest.toFixed(1)}`);

  // the mist still lies in it — without the fill it is the only softening left
  let banks = 0;
  root.scene.traverse((o) => { if (o.name === 'mist') banks++; });
  assert.ok(banks >= 3, `the mist banks stay, got ${banks}`);
});
