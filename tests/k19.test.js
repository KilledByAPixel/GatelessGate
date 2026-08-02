import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k19 from '../src/koans/k19.js';
import { makeMoon } from '../src/kit/moon.js';
import { makeWildflowers } from '../src/kit/wildflowers.js';
import { groundHeight } from '../src/kit/ground.js';
import { ACCENT, ACCENT_DEEP, wash, WASH } from '../src/palette.js';

// Case 19 has no object at its centre, so its two red seals are weather: the
// harvest moon and the butterflies playing over the meadow (they replaced the
// red wildflowers — Frank wanted spring alive in the air, not pigment on the
// ground). Both are easy to get subtly wrong in ways nothing else in the suite
// would catch — a moon that the fog quietly erases, or that a pale invisible
// slope stands in front of; butterflies that drift out of the frame or down
// into the grass.
//
// The kit-level wildflower tests at the bottom stay here even though the case
// no longer places a field: they pin makeWildflowers itself (placement, ground
// conformance, keepouts, the gust front), which case 24's meadow rides on.

function fakeCtx() {
  const taps = [], hovers = [];
  return {
    audio: null,                       // build() must work with no audio at all
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,        // nothing under the cursor by default
      pointer: () => ({ x: 0, y: 0 }),
    },
    _taps: taps, _hovers: hovers,
  };
}

// place a camera exactly where the case's own `camera` block puts it
function rigCamera(azimuth = k19.camera.azimuth, aspect = 1.78) {
  const c = k19.camera;
  const cam = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
  const [tx, ty, tz] = c.target;
  const sp = Math.sin(c.polar), cp = Math.cos(c.polar);
  cam.position.set(
    tx + c.distance * sp * Math.sin(azimuth),
    ty + c.distance * cp,
    tz + c.distance * sp * Math.cos(azimuth),
  );
  cam.lookAt(tx, ty, tz);
  cam.updateMatrixWorld(true);
  return cam;
}

// ---- the case ---------------------------------------------------------------

test('module shape matches the koan contract', () => {
  assert.equal(k19.id, 19);
  assert.equal(k19.slug, 'everyday-life-is-the-path');
  assert.equal(k19.accent, ACCENT);
  assert.ok(k19.tier === 1 || k19.tier === 2);
  assert.equal(k19.title, 'Everyday Life Is the Path');
  for (const f of ['case', 'comment', 'verse']) {
    assert.ok(k19.text[f] && k19.text[f].trim().length > 0, `text.${f} empty`);
  }
  // the case file must never author prose — it all comes from TEXT[19]
  assert.match(k19.text.verse, /harvest moon/);
  assert.equal(typeof k19.build, 'function');
});

test('the diorama is a road, two walkers, a moon and a meadow', () => {
  const root = k19.build(fakeCtx());
  assert.ok(root.scene instanceof THREE.Scene);
  for (const fn of ['update', 'dispose', 'fragment', 'setCamera']) {
    assert.equal(typeof root[fn], 'function', `root.${fn} missing`);
  }
  const monks = [];
  root.scene.traverse((o) => { if (o.name === 'monk') monks.push(o); });
  assert.equal(monks.length, 2, 'Joshu and Nansen, walking');
  for (const name of ['path', 'moon', 'butterflies', 'ground', 'grassfield']) {
    assert.ok(root.scene.getObjectByName(name), `${name} missing from the scene`);
  }

  // the seal has to survive being staged: the fog exemption is set on the
  // material, and anything that cloned or replaced it would silently erase it
  assert.equal(root.scene.getObjectByName('moon').material.fog, false);

  root.onEnter && root.onEnter();
  for (let i = 0; i < 120; i++) root.update(1 / 60, i / 60);
  const frag = root.fragment();
  assert.ok(Object.keys(frag).length > 0);
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} is ${v}`);
  }
  root.onExit && root.onExit();
  root.dispose();
});

test('NOTHING STANDS IN FRONT OF THE MOON, at any camera angle', () => {
  // The failure this guards is invisible and total. Fog washes the mountains
  // almost to paper, but a ghost still writes depth — with composeWorld's stock
  // bands the disc was fully hidden behind a slope you cannot even see, at five
  // of five sampled angles. Hence the shaped ridgeline in the case file. If
  // anyone retunes those bands, this is what tells them.
  const root = k19.build(fakeCtx());
  root.scene.updateMatrixWorld(true);        // nothing has rendered yet
  const moon = root.scene.getObjectByName('moon');
  const ray = new THREE.Raycaster();
  ray.far = 300;

  const RANGE = 0.9;                          // camera.js azimuthRange
  for (const az of [-RANGE, -0.45, 0, 0.45, RANGE].map((d) => k19.camera.azimuth + d)) {
    const cam = rigCamera(az);
    for (let k = 0; k < 9; k++) {
      const p = moon.position.clone();
      if (k > 0) {
        const a = (k - 1) / 8 * Math.PI * 2;   // eight points around the rim
        p.add(new THREE.Vector3(Math.cos(a) * 2.8, Math.sin(a) * 2.8, 0).applyQuaternion(moon.quaternion));
      }
      const dir = p.clone().sub(cam.position);
      const len = dir.length();
      assert.ok(len < 100, `the moon must stay inside the far plane, got ${len.toFixed(1)}`);
      ray.set(cam.position, dir.normalize());
      const blocker = ray.intersectObjects(root.scene.children, true)
        .find((h) => h.distance < len - 0.5 && h.object.name !== 'moon' && !h.object.userData.isOutline);
      assert.ok(!blocker, `at azimuth ${az.toFixed(2)} the moon is occluded by ${blocker && blocker.object.name}`);
    }
  }
});

test('the moon sits in frame, above the horizon, at the home angle', () => {
  const root = k19.build(fakeCtx());
  root.scene.updateMatrixWorld(true);
  const moon = root.scene.getObjectByName('moon');
  // narrow portrait is the worst case for a moon placed off to one side
  for (const aspect of [1.78, 1.30, 0.80]) {
    const cam = rigCamera(k19.camera.azimuth, aspect);
    const v = moon.position.clone().project(cam);
    assert.ok(Math.abs(v.x) < 0.85, `moon x in frame at aspect ${aspect}, got ${v.x.toFixed(2)}`);
    assert.ok(v.y > 0 && v.y < 0.85, `moon sits high but not on the rim, got ${v.y.toFixed(2)}`);
  }
  // and it is genuinely above the camera's eyeline — a LOW moon, not a lamp
  const cam = rigCamera();
  assert.ok(moon.position.y > cam.position.y, 'the moon is above the horizon');
  assert.ok(moon.position.y - cam.position.y < 9, 'and low over the hills, not overhead');
});

test('the butterflies wear the case red and play low over the meadow, in frame', () => {
  const root = k19.build(fakeCtx());
  for (let i = 0; i < 90; i++) root.update(1 / 60, i / 60);
  root.scene.updateMatrixWorld(true);
  const group = root.scene.getObjectByName('butterflies');
  const each = [];
  group.traverse((o) => { if (o.name === 'butterfly') each.push(o); });
  assert.ok(each.length >= 5 && each.length <= 7, `a handful, got ${each.length}`);

  const cam = rigCamera();
  let inFrame = 0;
  for (const b of each) {
    // red — the seal has to be ON them, and wings never take an inverted hull
    b.traverse((o) => {
      if (!o.isMesh) return;
      assert.equal('#' + o.material.color.getHexString(), ACCENT.toLowerCase(), 'butterflies wear the accent');
      assert.equal(o.userData.noOutline, true, 'a hull on a paper-thin wing is a blot');
    });
    // at flower height, not up with the moon and not in the grass
    assert.ok(b.position.y > 0.3 && b.position.y < 3.5, `plays low, got y=${b.position.y.toFixed(2)}`);
    const v = b.getWorldPosition(new THREE.Vector3()).project(cam);
    if (Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9 && v.z > 0 && v.z < 1) inFrame++;
  }
  assert.ok(inFrame >= 3, `most of the flight is in the picture, got ${inFrame}/${each.length}`);
});

test('touching the meadow stirs the butterflies; touching the moon shifts the light', () => {
  const ctx = fakeCtx();
  const root = k19.build(ctx);
  root.setCamera(rigCamera());
  const moon = root.scene.getObjectByName('moon');
  const ground = root.scene.getObjectByName('ground');
  assert.ok(ctx._taps.length > 0, 'the case has to offer something to find');

  // a tap that hits nothing changes nothing
  ctx._taps.forEach((cb) => cb(10, 10));
  assert.equal(root.fragment().touches, 0);

  // tap the meadow
  ctx.input.raycastFirst = (cam, objs) => (objs.includes(ground)
    ? { object: ground, point: new THREE.Vector3(2, 0, 1) }
    : null);
  ctx._taps.forEach((cb) => cb(10, 10));
  let frag = root.fragment();
  assert.equal(frag.touches, 1);
  assert.ok(frag.flutter > 0.9, 'the butterflies startle at once');
  assert.ok(frag.breeze > 0.9, 'and it is in the wind sound too');

  // it passes on its own. The breeze decays on a ~1.7 s time constant and the
  // flutter on ~2.2 s, so five seconds is most of the way down for both.
  for (let i = 0; i < 300; i++) root.update(1 / 60, i / 60);
  frag = root.fragment();
  assert.ok(frag.flutter < 0.15, `the flight settles, got ${frag.flutter}`);
  assert.ok(frag.breeze < 0.1, `the wind settles back, got ${frag.breeze}`);
  for (let i = 0; i < 600; i++) root.update(1 / 60, 5 + i / 60);
  assert.equal(root.fragment().breeze, 0, 'and reaches rest exactly, rather than creeping');
  assert.ok(root.fragment().flutter < 0.02, 'the butterflies go back to playing');

  // tap the moon
  ctx.input.raycastFirst = (cam, objs) => (objs.includes(moon) ? { object: moon, point: moon.position.clone() } : null);
  ctx._taps.forEach((cb) => cb(10, 10));
  assert.equal(root.fragment().touches, 2);
  for (let i = 0; i < 40; i++) root.update(1 / 60, 5 + i / 60);
  assert.ok(root.fragment().glow > 0.2, 'the light comes up');
  for (let i = 0; i < 400; i++) root.update(1 / 60, 6 + i / 60);
  assert.equal(root.fragment().glow, 0, 'and goes back down again');
});

// ---- the moon ---------------------------------------------------------------

test('the moon is fog-exempt, far out past the mountains, and takes no outline', () => {
  const m = makeMoon({ radius: 3.0, distance: 60, height: 9.2, azimuth: -0.28 });
  assert.equal(m.name, 'moon');

  // THE important one. Everything else in the book dissolves into the paper with
  // distance; at 60 units FogExp2(0.030) would wash the disc away completely.
  assert.equal(m.material.fog, false, 'the moon must opt out of fog or it vanishes');

  // an inked contour on a moon reads as a coin — both mechanisms have to know
  assert.equal(m.userData.noOutline, true, 'no inverted hull');
  assert.equal(typeof m.material.customProgramCacheKey, 'function', 'opts out of the depth-edge ink pass');

  // beyond the mountain bands, which composeWorld puts 33-52 out
  const r = Math.hypot(m.position.x, m.position.z);
  assert.ok(r > 52, `moon should stand beyond the mountains, got ${r.toFixed(1)}`);
  assert.ok(Math.abs(r - 60) < 1e-6, `distance is honoured, got ${r}`);
  assert.ok(Math.abs(m.position.y - 9.2) < 1e-6, 'height is honoured');

  // it is unlit: a toon-shaded disc has one normal, so it lands wholly in
  // whichever ramp band the key light happens to hit and its tone swings with
  // the staging's lighting rather than with the hour
  assert.ok(m.material.isMeshBasicMaterial, 'the moon emits, it is not lit');
});

test('the moon takes its bearing like the mountains do, and faces the staging', () => {
  // azimuth 0 is straight down -z, matching makeMountains' convention
  const straight = makeMoon({ distance: 50, height: 8, azimuth: 0 });
  assert.ok(Math.abs(straight.position.x) < 1e-9, `azimuth 0 sits on the -z axis, got x=${straight.position.x}`);
  assert.ok(straight.position.z < -49, `and out in front, got z=${straight.position.z}`);

  const swung = makeMoon({ distance: 50, height: 8, azimuth: 0.5 });
  assert.ok(swung.position.x > 0, 'positive azimuth swings toward +x');

  // the disc's own normal (+z for a CircleGeometry) points back at the staging,
  // or the camera would be looking at it edge-on
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(swung.quaternion);
  const toOrigin = new THREE.Vector3(-swung.position.x, 0, -swung.position.z).normalize();
  assert.ok(normal.dot(toOrigin) > 0.99, `disc faces the scene, got ${normal.dot(toOrigin).toFixed(3)}`);

  // and it stands plumb rather than tipping down at the ground plane
  assert.ok(Math.abs(normal.y) < 1e-6, `disc stands vertical, got normal.y=${normal.y}`);
});

test('the moon reads as a flat disc of the right size', () => {
  const m = makeMoon({ radius: 3.0, distance: 60, height: 9.2, azimuth: 0 });
  m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m);
  assert.ok(Math.abs((box.max.y - box.min.y) - 6.0) < 0.02, 'six units across');
  assert.ok((box.max.z - box.min.z) < 0.01, 'flat: no depth at all');
});

test('the moon shift is a colour lerp that clamps at both ends', () => {
  const m = makeMoon({ color: ACCENT_DEEP });
  assert.equal(m.glow(), 0);
  const rest = m.material.color.clone();

  m.setGlow(1);
  assert.equal(m.glow(), 1);
  assert.ok(m.material.color.getHex() !== rest.getHex(), 'the light actually shifts');
  assert.ok(m.material.color.r >= rest.r && m.material.color.g >= rest.g, 'it brightens toward the paper');
  assert.ok(m.scale.x > 1 && m.scale.x < 1.1, 'and swells only a couple of percent');

  m.setGlow(4);
  assert.equal(m.glow(), 1, 'clamps high');
  m.setGlow(-2);
  assert.equal(m.glow(), 0, 'clamps low');
  assert.equal(m.material.color.getHex(), rest.getHex(), 'and comes all the way back');
});

// ---- the wildflowers --------------------------------------------------------

const matrices = (f) => {
  const m4 = new THREE.Matrix4();
  const out = [];
  for (let i = 0; i < f.mesh.count; i++) {
    f.mesh.getMatrixAt(i, m4);
    out.push(m4.clone());
  }
  return out;
};
const posOf = (m4) => new THREE.Vector3().setFromMatrixPosition(m4);
// the up-axis of an instance, i.e. how far the stem is leaning
const tiltOf = (m4) => {
  const up = new THREE.Vector3(0, 1, 0).transformDirection(m4);
  return Math.acos(Math.max(-1, Math.min(1, up.y)));
};

test('wildflowers place exactly the count asked for, in two instanced draws (pale heads, grass stems)', () => {
  const f = makeWildflowers({ count: 60, radius: 18, rMin: 3, seed: 19, groundSeed: 21 });
  assert.equal(f.mesh.name, 'wildflowers');
  assert.ok(f.mesh.isInstancedMesh, 'the heads are one instanced mesh');
  assert.equal(f.mesh.userData.noOutline, true, 'an inverted hull on a five-pixel bloom is a smudge');
  assert.equal(f.mesh.count, 60, `asked for 60, got ${f.mesh.count}`);
  assert.equal(f.blooms, 60);
  assert.equal(f.points.length, 60);

  // BY DEFAULT NOTHING IS RED (Frank: "the petals should be whitish, the same
  // colour family as the ground, and the stalk the same kind of colour as the
  // grass"). Heads sit just off the paper, stems wear the grass tone, and
  // neither may trip the seal-glow emissive that accent-family colours get.
  assert.equal(f.mesh.material.color.getHexString(), new THREE.Color(wash(0.10)).getHexString(),
    'default petals are whitish, in the ground family');
  assert.equal(f.mesh.material.emissive.getHexString(), '000000', 'pale petals must not glow');
  const stems = f.mesh.children.find((c) => c.name === 'wildflower-stems');
  assert.ok(stems && stems.isInstancedMesh, 'the stems are their own instanced mesh');
  assert.equal(stems.count, f.mesh.count, 'one stem per head');
  assert.equal(stems.material.color.getHexString(), new THREE.Color(WASH.dry).getHexString(),
    'stalks wear the grass tone');
  assert.equal(stems.material.emissive.getHexString(), '000000', 'and the seal glow stays off the stalks');

  // `color` stays an override for a case that puts its seal on the meadow —
  // and an accent head DOES glow, exactly as any accent material would
  const red = makeWildflowers({ count: 8, radius: 10, seed: 19, groundSeed: 21, color: ACCENT });
  assert.equal('#' + red.mesh.material.color.getHexString(), ACCENT.toLowerCase());
  assert.ok(red.mesh.material.emissiveIntensity > 0, 'an accented meadow keeps the seal glow');
  const ma = new THREE.Matrix4(), mb = new THREE.Matrix4();
  f.update(0.5, 1.7);                    // mid-sway, not just the planted frame
  f.mesh.getMatrixAt(31, ma);
  stems.getMatrixAt(31, mb);
  assert.deepEqual(ma.elements, mb.elements, 'head and stem move as one bloom');

  // deterministic — no Math.random anywhere in the placement
  const g = makeWildflowers({ count: 60, radius: 18, rMin: 3, seed: 19, groundSeed: 21 });
  assert.deepEqual(g.points, f.points);
});

test('wildflowers grow ON the terrain, not flat at y=0', () => {
  // rMin 14 puts every bloom well outside the flat staging radius (9), so the
  // ground under them genuinely rolls and a y=0 bug cannot hide
  const f = makeWildflowers({ count: 70, radius: 19, rMin: 14, seed: 5, groundSeed: 21 });
  let offFlat = 0;
  for (const m4 of matrices(f)) {
    const p = posOf(m4);
    const gh = groundHeight(p.x, p.z, { seed: 21 });
    assert.ok(Math.abs(p.y - gh) < 1e-6, `bloom sits on the surface: y=${p.y} ground=${gh}`);
    if (Math.abs(p.y) > 0.05) offFlat++;
  }
  assert.ok(offFlat > 20, `the terrain should lift most of them off zero, got ${offFlat}/70`);

  // a different ground seed must move them vertically, or they are not really
  // sampling the terrain at all
  const other = makeWildflowers({ count: 70, radius: 19, rMin: 14, seed: 5, groundSeed: 33 });
  const ys = matrices(f).map((m) => posOf(m).y);
  const zs = matrices(other).map((m) => posOf(m).y);
  assert.ok(ys.some((y, i) => Math.abs(y - zs[i]) > 1e-6), 'groundSeed changes the heights');
});

test('wildflowers respect keepout circles', () => {
  const keepout = [{ x: 0, z: 0, r: 7 }, { x: 12, z: -4, r: 3.5 }, { x: -9, z: 8, r: 2 }];
  const f = makeWildflowers({ count: 80, radius: 19, rMin: 2, seed: 11, groundSeed: 21, keepout });
  assert.ok(f.mesh.count > 0, 'still places blooms');
  for (const m4 of matrices(f)) {
    const p = posOf(m4);
    for (const k of keepout) {
      assert.ok(Math.hypot(p.x - k.x, p.z - k.z) >= k.r,
        `bloom at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) is inside keepout ${JSON.stringify(k)}`);
    }
  }

  // and keepouts apply in drift mode too, where a centre may sit inside one —
  // this is exactly how case 19 keeps blooms off the worn track
  const along = [{ x: 0, z: 0 }, { x: 6, z: -6 }];
  const drift = makeWildflowers({
    count: 50, radius: 19, seed: 3, groundSeed: 21, along, spread: 4,
    keepout: [{ x: 0, z: 0, r: 2.5 }],
  });
  for (const m4 of matrices(drift)) {
    const p = posOf(m4);
    assert.ok(Math.hypot(p.x, p.z) >= 2.5, 'a drift centred in a keepout still leaves it clear');
  }
});

test('`along` clusters the blooms into drifts instead of an even sprinkle', () => {
  const along = [{ x: 10, z: 0 }, { x: -6, z: -9 }, { x: 0, z: 11 }];
  const spread = 1.6;
  const f = makeWildflowers({ count: 60, radius: 19, seed: 7, groundSeed: 21, along, spread });
  assert.equal(f.mesh.count, 60);
  for (const m4 of matrices(f)) {
    const p = posOf(m4);
    const near = Math.min(...along.map((c) => Math.hypot(p.x - c.x, p.z - c.z)));
    assert.ok(near <= spread + 1e-6, `bloom strayed ${near.toFixed(2)} from every centre (spread ${spread})`);
  }
  // every drift actually got used
  for (const c of along) {
    assert.ok(f.points.some((p) => Math.hypot(p.x - c.x, p.z - c.z) <= spread), `nothing grew at ${JSON.stringify(c)}`);
  }
});

test('`scale` grows every bloom in place — same roots, doubled size', () => {
  // case 24 runs the meadow at scale 2; the option must never MOVE a bloom,
  // only grow it where it stands
  const a = makeWildflowers({ count: 40, radius: 15, rMin: 2, seed: 9, groundSeed: 21 });
  const b = makeWildflowers({ count: 40, radius: 15, rMin: 2, seed: 9, groundSeed: 21, scale: 2 });
  assert.deepEqual(b.points, a.points, 'size never moves a bloom');
  const pa = new THREE.Vector3(), qa = new THREE.Quaternion(), sa = new THREE.Vector3();
  const pb = new THREE.Vector3(), qb = new THREE.Quaternion(), sb = new THREE.Vector3();
  const ma = new THREE.Matrix4(), mb = new THREE.Matrix4();
  for (let i = 0; i < a.mesh.count; i++) {
    a.mesh.getMatrixAt(i, ma); ma.decompose(pa, qa, sa);
    b.mesh.getMatrixAt(i, mb); mb.decompose(pb, qb, sb);
    assert.ok(pa.distanceTo(pb) < 1e-6, 'planted in the same spot');
    for (const k of ['x', 'y', 'z']) {
      assert.ok(Math.abs(sb[k] - 2 * sa[k]) < 1e-6, `scale doubles ${k}: ${sa[k]} -> ${sb[k]}`);
    }
  }
});

test('wildflowers nod, and a gust crosses the field as a travelling front', () => {
  // one long line of drift centres, so "near the gust" and "far from it" are
  // unambiguous
  const along = [];
  for (let i = 0; i < 10; i++) along.push({ x: -9 + i * 2, z: 0 });
  const f = makeWildflowers({ count: 80, radius: 19, seed: 2, groundSeed: 21, along, spread: 0.8 });

  // the resting sway alone already moves them
  const before = matrices(f).map(tiltOf);
  for (let i = 0; i < 40; i++) f.update(1 / 60, i / 60);
  const after = matrices(f).map(tiltOf);
  assert.ok(before.some((t, i) => Math.abs(t - after[i]) > 1e-3), 'a still field is not still');
  for (const t of after) assert.ok(Number.isFinite(t), 'no NaN leaks into the transforms');

  // a bloom never plants itself somewhere else while it nods — it pivots at the foot
  const planted = matrices(f).map(posOf);
  for (const p of planted) {
    assert.ok(Math.abs(p.y - groundHeight(p.x, p.z, { seed: 21 })) < 1e-6, 'leaning does not lift the stem');
  }

  // now the gust. Fire it from the far -x end and watch when each end peaks.
  const idxNear = f.points.reduce((best, p, i) => (p.x < f.points[best].x ? i : best), 0);
  const idxFar = f.points.reduce((best, p, i) => (p.x > f.points[best].x ? i : best), 0);
  const gap = f.points[idxFar].x - f.points[idxNear].x;
  assert.ok(gap > 12, `need a real span between the two samples, got ${gap.toFixed(1)}`);

  assert.equal(f.gustCount(), 0);
  f.gustAt(f.points[idxNear].x, f.points[idxNear].z, 0.5);
  assert.equal(f.gustCount(), 1, 'a breath is crossing');

  let t = 0;
  let peakNear = { lean: -1, t: 0 };
  let peakFar = { lean: -1, t: 0 };
  for (let i = 0; i < 180; i++) {
    t += 1 / 60;
    f.update(1 / 60, 10 + t);
    const ms = matrices(f);
    const n = tiltOf(ms[idxNear]);
    const g = tiltOf(ms[idxFar]);
    if (n > peakNear.lean) peakNear = { lean: n, t };
    if (g > peakFar.lean) peakFar = { lean: g, t };
  }
  assert.ok(peakNear.t < peakFar.t,
    `the front should reach the near bloom first: near peaked at ${peakNear.t.toFixed(2)}s, far at ${peakFar.t.toFixed(2)}s`);
  assert.ok(peakFar.t - peakNear.t > 0.3, 'and the delay should be visible, not a rounding artefact');

  // and it passes: three seconds later the field is back to its resting sway
  assert.equal(f.gustCount(), 0, 'the gust expires instead of accumulating');
  assert.ok(f.lean() > 0 && f.lean() < 0.5, `resting sway is small and positive, got ${f.lean()}`);
});

test('a wildflower field is safe to build and drive with nothing placed', () => {
  // everything masked out: this must not throw, produce NaN, or allocate a
  // zero-length instance buffer
  const f = makeWildflowers({ count: 20, radius: 8, rMin: 2, seed: 4, keepout: [{ x: 0, z: 0, r: 40 }] });
  assert.equal(f.mesh.count, 0);
  assert.doesNotThrow(() => { f.gustAt(0, 0); f.update(1 / 60, 1); });
  assert.ok(Number.isFinite(f.lean()));
});
