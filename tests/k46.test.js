import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makePole } from '../src/kit/pole.js';
import { addOutlines } from '../src/render/outlines.js';
import k46 from '../src/koans/k46.js';
import { ACCENT } from '../src/palette.js';

const ACCENT_HEX = new THREE.Color(ACCENT).getHexString();

function fakeCtx() {
  const taps = [], hovers = [];
  return {
    accent: k46.accent,
    quality: 'high',
    audio: null,                        // build() must survive with no audio
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,
      pointer: () => ({ x: 0, y: 0 }),
    },
    _taps: taps, _hovers: hovers,
  };
}

// Box of an object EXCLUDING outline shells — the inverted hull hangs ~0.06
// below every mesh, which would smear the load-bearing seat assertion.
function inkBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const b = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  return box;
}

// A camera standing exactly where the case's rig block puts it (camera.js math,
// main.js lens: fov 38).
function rigCamera({ azimuth = k46.camera.azimuth, polar = k46.camera.polar, aspect = 1.4, distance = k46.camera.distance } = {}) {
  const cam = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
  const [tx, ty, tz] = k46.camera.target;
  const sp = Math.sin(polar), cp = Math.cos(polar);
  cam.position.set(
    tx + distance * sp * Math.sin(azimuth),
    ty + distance * cp,
    tz + distance * sp * Math.cos(azimuth));
  cam.lookAt(tx, ty, tz);
  cam.updateMatrixWorld(true);
  return cam;
}

const monksOf = (scene) => {
  const out = [];
  scene.traverse((o) => { if (o.name === 'monk') out.push(o); });
  return out;
};

// the seated figure is the only monk whose ink starts above the meadow
const sitterOf = (scene) => monksOf(scene).find((m) => inkBox(m).min.y > 6);

// ---- the kit piece --------------------------------------------------------

test('makePole stands from the ground and topY is the cap\'s upper face', () => {
  const pole = makePole({ height: 8, seed: 46 });
  const b = inkBox(pole);
  assert.ok(Math.abs(b.min.y) < 0.03, `grounded at y=0, got ${b.min.y}`);
  assert.ok(pole.topY > 8, `the cap sits ON the mast, so topY clears the nominal height: ${pole.topY}`);
  assert.ok(Math.abs(b.max.y - pole.topY) < 1e-3,
    `topY must be the highest surface of the built thing: box ${b.max.y} vs topY ${pole.topY}`);

  // the seat is wide enough for the case's seated monk (hem ~0.42 at height 1.3)
  const cap = pole.children.find((c) => c.name === 'cap');
  assert.ok(cap && cap.isMesh, 'a cap to sit on');
  assert.ok(cap.geometry.parameters.radiusTop >= 0.44,
    `the sitter's hem must land on wood, not air: cap r=${cap.geometry.parameters.radiusTop}`);

  // rigging: three lines, three stakes, one mast, one cap
  assert.equal(pole.anchors.length, 3);
  assert.equal(pole.children.length, 2 + 3 * 2);
  for (const a of pole.anchors) {
    const r = Math.hypot(a.x, a.z);
    assert.ok(r > 1.8 && r < 3.5, `guy anchors stay near the mast: ${r}`);
  }
});

test('makePole is deterministic by seed, and its hairlines opt out of the outline pass', () => {
  const a = makePole({ height: 8, seed: 46 }).anchors;
  const b = makePole({ height: 8, seed: 46 }).anchors;
  const c = makePole({ height: 8, seed: 7 }).anchors;
  assert.deepEqual(a, b, 'same seed, same rigging');
  assert.notDeepEqual(a, c, 'different seed, different rigging');

  // a 0.012 line under the house 0.033 hull would be swallowed whole (the
  // case-3 finger lesson), so lines and stakes are drawn as ink instead
  const pole = makePole({ height: 8, seed: 46 });
  addOutlines(pole, { width: 0.033, wobble: 0.7 });
  const outlined = (m) => m.children.some((ch) => ch.userData.isOutline);
  for (const child of pole.children) {
    if (child.name === 'guy' || child.name === 'stake') {
      assert.ok(child.userData.noOutline && !outlined(child), `${child.name} must not carry a hull`);
    }
  }
  assert.ok(outlined(pole.children.find((m) => m.name === 'shaft')), 'the mast itself keeps the house stroke');
  assert.ok(outlined(pole.children.find((m) => m.name === 'cap')), 'so does the seat');
});

// ---- the module contract --------------------------------------------------

test('module shape matches the koan contract', () => {
  assert.equal(k46.id, 46);
  assert.equal(k46.slug, 'proceed-from-the-top-of-the-pole');
  assert.equal(k46.accent, ACCENT);
  assert.ok(k46.tier === 1 || k46.tier === 2);
  assert.match(k46.title, /pole/i);
  for (const f of ['case', 'comment', 'verse']) {
    assert.ok(k46.text[f] && k46.text[f].trim().length > 0, `text.${f} empty`);
  }
  assert.match(k46.text.case, /hundred-foot pole/);
  assert.ok(!k46.ambience.includes('music'), 'no drift layer on this case');
  assert.ok(Array.isArray(k46.ambience) && k46.ambience.length > 0);
  assert.equal(typeof k46.build, 'function');

  // the one vertical composition: a high orbit pivot, and a polar window the
  // stock rig (minPolar 0.9) could never reach
  const c = k46.camera;
  assert.ok(c.target[1] > 4 && c.target[1] < 6.5, `orbit pivot high on the mast, got ${c.target[1]}`);
  assert.ok(c.minPolar < 0.9, 'must open the stock polar floor to look down the drop');
  assert.ok(c.maxPolar <= 1.45 && c.maxPolar > c.polar, 'and still clamp above the horizon');
  assert.ok(c.maxDist >= 16, 'the whole mast has to fit in frame when wheeled out');
  assert.ok(c.distance <= c.maxDist && c.distance >= 7);
});

// ---- the staging ----------------------------------------------------------

test('one red sitter seated exactly on the cap, two grey watchers far below', () => {
  const built = k46.build(fakeCtx());
  const scene = built.scene;
  assert.ok(scene.isScene);
  for (const fn of ['update', 'dispose', 'fragment', 'setCamera']) {
    assert.equal(typeof built[fn], 'function', `root.${fn} missing`);
  }

  const pole = scene.getObjectByName('pole');
  assert.ok(pole, 'the pole stands in the scene');
  const monks = monksOf(scene);
  assert.equal(monks.length, 3, 'the sitter and the two below');

  scene.updateMatrixWorld(true);

  // THE LOAD-BEARING ASSERTION: the sitter's hem rests on the cap's surface.
  // A floating or sunken sitter ruins the whole case.
  const sitter = sitterOf(scene);
  assert.ok(sitter, 'one monk sits high on the mast');
  const seatY = inkBox(sitter).min.y;
  assert.ok(Math.abs(seatY - pole.topY) <= 0.02,
    `the sitter sits AT topY: hem ${seatY} vs topY ${pole.topY}`);
  const capTop = inkBox(pole.children.find((c) => c.name === 'cap')).max.y;
  assert.ok(Math.abs(seatY - capTop) <= 0.02,
    `and topY is honest — the cap's real upper face is ${capTop}`);

  // The red seal is the WHOLE VERTICAL — pole and sitter both (Frank's call:
  // "the whole pole should be red"). Every accent mesh must belong to one or
  // the other; the guy lines stay grey so the red reads as one unbroken line.
  const accentMeshes = [];
  scene.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && o.material && o.material.color
      && o.material.color.getHexString() === ACCENT_HEX) accentMeshes.push(o);
  });
  assert.ok(accentMeshes.length > 0, 'the seal exists');
  const owned = (m, root) => { let p = m; while (p) { if (p === root) return true; p = p.parent; } return false; };
  for (const m of accentMeshes) {
    assert.ok(owned(m, sitter) || owned(m, pole),
      `every accent mesh is the sitter or the pole, found stray "${m.name}"`);
  }
  const sitterMeshCount = (() => { let n = 0; sitter.traverse((o) => { if (o.isMesh && !o.userData.isOutline) n++; }); return n; })();
  assert.ok(accentMeshes.filter((m) => owned(m, sitter)).length === sitterMeshCount,
    'the sitter is entirely red');
  const poleAccent = accentMeshes.filter((m) => owned(m, pole));
  assert.ok(poleAccent.some((m) => m.name === 'mast' || /pole|mast|shaft/.test(m.name) || inkBox(m).max.y > 7),
    'the pole itself carries the seal');
  const guys = [];
  pole.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && o.material.color && /guy|stake|line/.test(o.name)) guys.push(o);
  });
  for (const g of guys) {
    assert.notEqual(g.material.color.getHexString(), ACCENT_HEX, 'guy lines stay grey hairlines');
  }
  assert.ok(inkBox(sitter).min.y > 6, 'the red figure is the one 8 units up');

  // the watchers stay grey and stay on the ground
  for (const m of monks) {
    if (m === sitter) continue;
    const mb = inkBox(m);
    assert.ok(mb.min.y > -0.05 && mb.max.y < 3, `a watcher stands on the meadow: ${mb.min.y}..${mb.max.y}`);
    m.traverse((o) => {
      if (o.isMesh && !o.userData.isOutline) {
        assert.notEqual(o.material.color.getHexString(), ACCENT_HEX, 'no second red figure');
      }
    });
  }

  // staging stays inside the book's plot
  for (const a of pole.anchors) {
    const wx = pole.parent.position.x + a.x, wz = pole.parent.position.z + a.z;
    assert.ok(wx > -5 && wx < 5 && wz > -6 && wz < 3, `stake inside the staging bounds: ${wx},${wz}`);
  }
});

// ---- the camera, verified numerically ------------------------------------

test('the framing holds: sitter and watchers land in NDC at the home angles', () => {
  const built = k46.build(fakeCtx());
  const scene = built.scene;
  scene.updateMatrixWorld(true);
  const sitter = sitterOf(scene);
  const sb = inkBox(sitter);
  const head = new THREE.Vector3((sb.min.x + sb.max.x) / 2, sb.max.y - 0.06, (sb.min.z + sb.max.z) / 2);
  const seat = new THREE.Vector3(head.x, sb.min.y + 0.05, head.z);
  const watchers = monksOf(scene).filter((m) => m !== sitter)
    .map((m) => new THREE.Vector3(m.position.x, 1.05, m.position.z));

  for (const aspect of [1.4, 0.7]) {
    const cam = rigCamera({ aspect });
    for (const [name, p] of [['head', head], ['seat', seat]]) {
      const v = p.clone().project(cam);
      assert.ok(Math.abs(v.x) < 0.35, `sitter ${name} rides the centre column at aspect ${aspect}: x=${v.x.toFixed(2)}`);
      assert.ok(Math.abs(v.y) < 0.92, `sitter ${name} in frame at aspect ${aspect}: y=${v.y.toFixed(2)}`);
      assert.ok(v.z > -1 && v.z < 1, 'in front of the lens');
    }
    watchers.forEach((p, i) => {
      const v = p.clone().project(cam);
      assert.ok(Math.abs(v.x) < 0.92, `watcher ${i} in frame at aspect ${aspect}: x=${v.x.toFixed(2)}`);
      assert.ok(Math.abs(v.y) < 0.92, `watcher ${i} in frame at aspect ${aspect}: y=${v.y.toFixed(2)}`);
    });
  }

  // the whole drag range keeps the subject: at the polar floor the lens climbs
  // above the cap, at the ceiling it sinks almost level with him
  for (const polar of [k46.camera.minPolar, k46.camera.polar, k46.camera.maxPolar]) {
    const v = head.clone().project(rigCamera({ polar, aspect: 0.7 }));
    assert.ok(Math.abs(v.y) < 0.95 && Math.abs(v.x) < 0.5,
      `sitter stays framed at polar ${polar}: ${v.x.toFixed(2)},${v.y.toFixed(2)}`);
  }

  // and the vertical actually reads: at home, seat above centre, pole base near
  // the bottom edge — ground and summit in one shot
  const cam = rigCamera({});
  const baseV = new THREE.Vector3(head.x, 0, head.z).project(cam);
  const headV = head.clone().project(cam);
  assert.ok(headV.y > 0.3, `the sitter rides the upper third: ${headV.y.toFixed(2)}`);
  assert.ok(baseV.y < -0.55 && baseV.y > -1.05, `the base hangs near the bottom edge: ${baseV.y.toFixed(2)}`);
});

test('clear paper behind the red at the home azimuth — no ridge, no tree', () => {
  const built = k46.build(fakeCtx());
  const scene = built.scene;
  scene.updateMatrixWorld(true);
  const sitter = sitterOf(scene);
  const sb = inkBox(sitter);
  const cx = (sb.min.x + sb.max.x) / 2, cz = (sb.min.z + sb.max.z) / 2;
  const samples = [
    new THREE.Vector3(cx, sb.min.y + 0.05, cz),
    new THREE.Vector3(cx, (sb.min.y + sb.max.y) / 2, cz),
    new THREE.Vector3(cx, sb.max.y - 0.05, cz),
    new THREE.Vector3(sb.min.x + 0.03, (sb.min.y + sb.max.y) / 2, cz),
    new THREE.Vector3(sb.max.x - 0.03, (sb.min.y + sb.max.y) / 2, cz),
  ];
  const ray = new THREE.Raycaster();
  ray.far = 300;

  for (const polar of [k46.camera.polar, k46.camera.maxPolar]) {
    const cam = rigCamera({ polar });
    for (const p of samples) {
      const dir = p.clone().sub(cam.position);
      const dist = dir.length();
      ray.set(cam.position, dir.normalize());
      const beyond = ray.intersectObjects(scene.children, true)
        .filter((h) => h.distance > dist + 0.6 && !h.object.userData.isOutline);
      for (const h of beyond) {
        assert.ok(!['mountain', 'tree', 'forest'].includes(h.object.name),
          `at polar ${polar} the red sits on "${h.object.name}" instead of paper`);
      }
    }
  }
});

// ---- the moment -----------------------------------------------------------

// the module raycasts the sitter's meshes first, then the pole's — answer by
// what is in the list, the way the real raycaster would
const hitSitter = (cam, objects) => {
  const m = objects.find((o) => o.material && o.material.color && o.material.color.getHexString() === ACCENT_HEX);
  return m ? { object: m } : null;
};
const hitPole = (cam, objects) => {
  const m = objects.find((o) => o.name === 'shaft');
  return m ? { object: m } : null;
};

test('tap the monk: he leans forward, holds a moment, and settles back', () => {
  const ctx = fakeCtx();
  const built = k46.build(ctx);
  built.setCamera(new THREE.PerspectiveCamera());
  const pivot = built.scene.getObjectByName('sitter');
  assert.ok(ctx._taps.length > 0, 'there has to be something to find');

  let t = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { built.update(1 / 60, t); t += 1 / 60; } };

  step(60);
  assert.equal(built.fragment().lean, 0, 'still until touched');
  assert.equal(built.fragment().taps, 0);

  ctx.input.raycastFirst = hitSitter;
  ctx._taps.forEach((cb) => cb(400, 300));
  assert.equal(built.fragment().taps, 1);

  step(45);                                   // 0.75s in: risen and holding
  const held = built.fragment().lean;
  assert.ok(held > 0.1, `he commits to the edge: ${held}`);
  assert.ok(Math.abs(pivot.rotation.x - held) < 1e-6, 'the fragment reports the real pose');

  step(45);                                   // 1.5s: into the settle
  const s1 = built.fragment().lean;
  step(30); const s2 = built.fragment().lean; // 2.0s
  step(30); const s3 = built.fragment().lean; // 2.5s
  assert.ok(s1 > s2 && s2 > s3, `the settle is a decay: ${s1} ${s2} ${s3}`);
  assert.ok(s3 > 0, 'and it takes its time');

  step(60);                                   // past the whole envelope
  assert.equal(built.fragment().lean, 0, 'he does not take the step');
});

test('tap the pole: a small sway runs through the mast — and through the man on it', () => {
  const ctx = fakeCtx();
  const built = k46.build(ctx);
  built.setCamera(new THREE.PerspectiveCamera());
  const mast = built.scene.getObjectByName('mast');
  assert.ok(mast, 'the mast group exists');
  let p = built.scene.getObjectByName('sitter'), inMast = false;
  while (p) { if (p === mast) inMast = true; p = p.parent; }
  assert.ok(inMast, 'the sitter is parented into the mast, so the sway carries him');

  let t = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { built.update(1 / 60, t); t += 1 / 60; } };
  step(30);
  assert.equal(built.fragment().sway, 0, 'no impulse yet');
  assert.equal(built.fragment().poleTaps, 0);

  ctx.input.raycastFirst = hitPole;
  ctx._taps.forEach((cb) => cb(400, 300));
  assert.equal(built.fragment().poleTaps, 1);
  assert.equal(built.fragment().taps, 0, 'the pole is not the monk');

  step(20);                                   // ~a third of a second: peak swing
  const peak = built.fragment().sway;
  assert.ok(peak > 0.002, `the mast answers: ${peak}`);
  step(160);                                  // three seconds on
  assert.ok(built.fragment().sway < peak * 0.15, 'and the swing dies away');
});

test('two identical runs agree exactly — the whole moment is sim-time driven', () => {
  const script = (built, ctx) => {
    const out = [];
    let t = 0;
    for (let i = 0; i < 360; i++) {
      if (i === 45) { ctx.input.raycastFirst = hitSitter; ctx._taps.forEach((cb) => cb(1, 1)); }
      if (i === 130) { ctx.input.raycastFirst = hitPole; ctx._taps.forEach((cb) => cb(1, 1)); }
      built.update(1 / 60, t); t += 1 / 60;
      if (i % 30 === 0 || i === 46 || i === 131) out.push(JSON.stringify(built.fragment()));
    }
    return out;
  };
  const a = fakeCtx(), b = fakeCtx();
  const ba = k46.build(a), bb = k46.build(b);
  ba.setCamera(new THREE.PerspectiveCamera());
  bb.setCamera(new THREE.PerspectiveCamera());
  assert.deepEqual(script(ba, a), script(bb, b));
});

test('runs without audio or renderer and reports a finite fragment', () => {
  const built = k46.build(fakeCtx());
  built.setCamera(null);
  built.onEnter && built.onEnter();           // audio null: must not throw
  for (let i = 0; i < 120; i++) built.update(1 / 60, i / 60);
  const frag = built.fragment();
  assert.ok(Object.keys(frag).length > 0);
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} = ${v}`);
  }
  built.onExit && built.onExit();
  built.dispose();
});
