import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k19 from '../src/koans/k19.js';
import { makeMoon } from '../src/kit/moon.js';
import { makeWildflowers } from '../src/kit/wildflowers.js';
import { setBreezePointer, clearBreeze } from '../src/kit/breeze.js';
import { groundHeight } from '../src/kit/ground.js';
import { ACCENT, ACCENT_DEEP, PAPER, wash, WASH } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';
import { rigCamera as sharedRig } from './helpers/rig-camera.js';

// Case 19 has no object at its centre, so its two red seals are weather: the
// harvest moon and the wildflowers along the verge — spring and autumn, the
// verse's first two lines, in the same picture. (Butterflies held the near seal
// for a round; the blooms are back and the butterflies moved to case 12.) Both are easy to get subtly wrong in ways nothing else in the suite
// would catch — a moon that the fog quietly erases, or that a pale invisible
// slope stands in front of; blooms that grow in the middle of the road.

// place a camera exactly where the case's own `camera` block puts it
const rigCamera = (heading = k19.camera.heading, aspect = 1.78) =>
  sharedRig(k19.camera, { heading, aspect });

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
  for (const name of ['path', 'moon', 'wildflowers', 'ground', 'grassfield']) {
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

  const RANGE = 51.5;                         // camera.js headingRange, degrees
  for (const az of [-RANGE, -25.8, 0, 25.8, RANGE].map((d) => k19.camera.heading + d)) {
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
      // Invisible things do not occlude. The snowfall hangs between the camera
      // and the moon and stays hidden until the moon is touched — it is the
      // verse's winter line, see the case — so a raycast finds it and a reader
      // never does. Anything switched off, or inside something switched off, is
      // not a blocker.
      const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
      const blocker = ray.intersectObjects(root.scene.children, true)
        .find((h) => h.distance < len - 0.5 && h.object.name !== 'moon' && shown(h.object));
      assert.ok(!blocker, `at heading ${az.toFixed(1)} the moon is occluded by ${blocker && blocker.object.name}`);
    }
  }
});

test('the moon sits in frame, above the horizon, at the home angle', () => {
  const root = k19.build(fakeCtx());
  root.scene.updateMatrixWorld(true);
  const moon = root.scene.getObjectByName('moon');
  // narrow portrait is the worst case for a moon placed off to one side
  for (const aspect of [1.78, 1.30, 0.80]) {
    const cam = rigCamera(k19.camera.heading, aspect);
    const v = moon.position.clone().project(cam);
    assert.ok(Math.abs(v.x) < 0.85, `moon x in frame at aspect ${aspect}, got ${v.x.toFixed(2)}`);
    assert.ok(v.y > 0 && v.y < 0.85, `moon sits high but not on the rim, got ${v.y.toFixed(2)}`);
  }
  // and it is genuinely above the camera's eyeline — a LOW moon, not a lamp
  const cam = rigCamera();
  assert.ok(moon.position.y > cam.position.y, 'the moon is above the horizon');
  assert.ok(moon.position.y - cam.position.y < 9, 'and low over the hills, not overhead');
});

test('the blooms carry the red, the stalks do not, and none of them grows in the road', () => {
  const root = k19.build(fakeCtx());
  root.scene.updateMatrixWorld(true);
  const heads = root.scene.getObjectByName('wildflowers');
  assert.ok(heads && heads.isInstancedMesh, 'one instanced drift of blooms');
  assert.equal('#' + heads.material.color.getHexString(), ACCENT.toLowerCase(),
    'the near seal is the flowers');
  // ...and ONLY the heads. A red stalk turns a drift into red grass — the whole
  // reason the kit splits the two meshes.
  const stems = heads.children.find((c) => c.name === 'wildflower-stems');
  assert.ok(stems, 'the stems ride along as their own mesh');
  assert.notEqual('#' + stems.material.color.getHexString(), ACCENT.toLowerCase(),
    'stalks stay in the meadow family');

  // the track is walked, not planted: the keepout chain has to actually overlap
  // along the whole run of it, or blooms sprout between the circles
  const path = root.scene.getObjectByName('path');
  assert.ok(path, 'there is a road to keep clear');
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const cam = rigCamera();
  let inFrame = 0;
  for (let i = 0; i < heads.count; i++) {
    heads.getMatrixAt(i, m4);
    p.setFromMatrixPosition(m4);
    const v = p.clone().project(cam);
    if (Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9 && v.z > 0 && v.z < 1) inFrame++;
  }
  assert.ok(inFrame > 20, `the drift has to be IN the picture, got ${inFrame}/${heads.count}`);
});

// THE GUST FRONT IS GONE. Both taps used to call flowers.gustAt(), whose
// envelope added straight onto each bloom's lean and, stacked on the wind
// already in that sum, folded the blooms flat — they read as being pulled
// under, as though sucked into the ground. The breath is carried by the wind
// level alone now, so
// what this pins is the wind swelling and settling exactly, and the field
// never being driven past its own resting sway.
test('touching the meadow lifts the wind; touching the moon shifts the light', () => {
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
  assert.equal(frag.gusts, 0, 'no gust front is fired at the blooms any more');
  assert.ok(frag.breeze > 0.9, 'and it is in the wind sound too');

  // it passes on its own. The breeze decays on a ~1.7 s time constant, and the
  // gust front expires rather than accumulating.
  for (let i = 0; i < 300; i++) root.update(1 / 60, i / 60);
  frag = root.fragment();
  assert.equal(frag.gusts, 0, 'and none ever appears');
  assert.ok(frag.breeze < 0.1, `the wind settles back, got ${frag.breeze}`);
  for (let i = 0; i < 600; i++) root.update(1 / 60, 5 + i / 60);
  assert.equal(root.fragment().breeze, 0, 'and reaches rest exactly, rather than creeping');
  assert.ok(root.fragment().lean > 0 && root.fragment().lean < 0.5,
    'the field goes back to its resting sway');

  // TAP THE MOON AND IT COMES ON. The moon is what lights this page — the key
  // is placed on its own bearing, so every shadow in the meadow points away
  // from it — and a tap swells the disc until it is most of the sky, takes the
  // SKY red with it and leaves the land alone, then settles back.
  //
  // Two earlier versions of this are pinned by their absence. setGlow shifted
  // the disc a few percent toward the paper, which nobody could see; fading the
  // disc out by opacity BROKE it, because makeMoon's shader writes
  // gl_FragColor.a = 0 as an ink-mask marker and turning on `transparent` makes
  // the blender read that as see-through, and the moon stopped being red.
  // Nothing here touches the moon's material at all now.
  ctx.input.raycastFirst = (cam, objs) => (objs.includes(moon) ? { object: moon, point: moon.position.clone() } : null);
  const sun = root.scene.getObjectByProperty('isDirectionalLight', true);
  assert.ok(sun, 'the meadow has a key light');
  const sunHome = sun.position.clone();
  const moonHome = moon.position.clone();
  const matBefore = moon.material;
  assert.equal(moon.material.transparent, false, 'the moon must never go transparent');

  // The key is aimed FROM the moon: the direction from the sun's TARGET to the
  // sun sits on the moon's own horizontal bearing. Measured from the target,
  // not the origin — the light stands SUN_DIST out from what it is lighting,
  // and that offset is what makes the shadow camera cover the staging.
  const bearing = (v) => Math.atan2(v.x, v.z);
  const fromTarget = sunHome.clone().sub(sun.target.position);
  assert.ok(Math.abs(bearing(fromTarget) - bearing(moonHome)) < 0.05,
    `the sun stands on the moon's own bearing (${bearing(fromTarget).toFixed(3)} vs ${bearing(moonHome).toFixed(3)})`);

  ctx._taps.forEach((cb) => cb(10, 10));
  assert.equal(root.fragment().touches, 2);

  // simTime CARRIES ON from where the loops above left it. The swell is timed
  // off the case's own guarded clock, so rewinding here — as this test used to
  // — reads as the tap having happened in the future and nothing moves at all.
  const paper = new THREE.Color(PAPER).getHexString();
  const fogHome = root.scene.fog.color.getHexString();
  assert.equal(root.scene.background.getHexString(), paper, 'the sky starts as paper');

  let t = 15;
  for (let i = 0; i < 60 * 3; i++, t += 1 / 60) root.update(1 / 60, t);
  const up = root.fragment();
  assert.ok(up.rise > 0.9, `the moon has come on (${up.rise})`);
  assert.ok(moon.scale.x > 6, `and it is most of the sky (x${moon.scale.x.toFixed(1)})`);
  assert.ok(moon.position.distanceTo(moonHome) < 1e-9,
    'it SWELLS where it stands — approaching would put it in front of the mountains');
  assert.ok(sun.position.distanceTo(sunHome) < 1e-9, 'the light does not move at all');
  assert.equal(moon.material, matBefore, 'and the material was never swapped or faded');

  // ONLY THE SKY. The background goes all the way to the moon's red; the fog —
  // which is what the LAND dissolves into — comes barely a third as far, so the
  // far meadow and the mountains stay their own colour: the SKY reddens, never
  // the whole page.
  // measured as the SHIFT off paper, not the absolute warmth — paper is already
  // a warm off-white, so its own redness swamps a ratio taken raw
  const base = new THREE.Color(PAPER);
  const shift = (c) => (c.r - c.b) - (base.r - base.b);
  assert.ok(shift(root.scene.background) > 0.1, 'the sky went red');
  assert.ok(shift(root.scene.fog.color) < shift(root.scene.background) * 0.6,
    `and the land followed far less (${shift(root.scene.fog.color).toFixed(3)} vs ${shift(root.scene.background).toFixed(3)})`);

  for (let i = 0; i < 60 * 8; i++, t += 1 / 60) root.update(1 / 60, t);
  const back = root.fragment();
  assert.equal(back.rise, 0, 'it comes back exactly, not asymptotically');
  assert.equal(back.sky, 0);
  assert.ok(Math.abs(moon.scale.x - 1) < 1e-9, 'the moon is its own size again');
  assert.equal(root.scene.background.getHexString(), paper, 'and the sky is paper again');
  assert.equal(root.scene.fog.color.getHexString(), fogHome, 'fog too, exactly');
});

// This case is where the grass shadow was CAUGHT — grass has no business
// casting one — when moving the key onto the moon's low bearing threw 3.5x the
// footprint the stock key does, and made visible something every page had been
// doing. The fix went global, in tuftfield.js and ui/debug.js, so what is left
// here is a witness: this page must not quietly go back to casting.
test('the meadow casts no shadow, and the ground carries the dark instead', () => {
  const root = k19.build(fakeCtx());
  const field = root.scene.getObjectByName('grassfield');
  assert.ok(field, 'there is a meadow');
  assert.equal(field.userData.noCastShadow, true, 'it is excused CASTING');
  assert.equal(field.receiveShadow, true, "but a tree's shadow still falls across it");
  // and the occlusion that replaced it is on the ground under the grass
  const ground = root.scene.getObjectByName('ground');
  assert.ok(ground.material.map, "the meadow's own dark is baked into the ground");
  assert.equal(ground.material.map.name, 'grass-shade');
});

// ---- the moon ---------------------------------------------------------------

test('the moon is fog-exempt and far out past the mountains', () => {
  const m = makeMoon({ radius: 3.0, distance: 60, height: 9.2, azimuth: -0.28 });
  assert.equal(m.name, 'moon');

  // THE important one. Everything else in the book dissolves into the paper with
  // distance; at 60 units FogExp2(0.030) would wash the disc away completely.
  assert.equal(m.material.fog, false, 'the moon must opt out of fog or it vanishes');

  // an inked contour on a moon reads as a coin — the depth-edge pass has to know.
  // typeof-only would pass for ANY material (THREE.Material.prototype already
  // defines a no-op customProgramCacheKey), so this pins the real mechanism:
  // the 'moon-noink' cache key (see moon.js) plus the alpha-zeroing injection
  // that actually marks the fragment out of the ink mask.
  assert.equal(m.material.customProgramCacheKey(), 'moon-noink', 'the moon owns a distinct cache key');
  assert.ok(m.material.onBeforeCompile, 'has an onBeforeCompile hook to inject the alpha marker');
  const shader = { fragmentShader: '#include <dithering_fragment>', vertexShader: '', uniforms: {} };
  m.material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /gl_FragColor\.a = 0\.0;/, 'the fragment is marked out of the ink mask');

  // beyond the mountain bands, which composeWorld puts 33-52 out
  const r = Math.hypot(m.position.x, m.position.z);
  assert.ok(r > 52, `moon should stand beyond the mountains, got ${r.toFixed(1)}`);
  assert.ok(Math.abs(r - 60) < 1e-6, `distance is honoured, got ${r}`);
  assert.ok(Math.abs(m.position.y - 9.2) < 1e-6, 'height is honoured');

  // it is unlit: a lit disc has one normal, so it would take one shade of N·L
  // against the key light and its tone would swing with the staging's
  // lighting rather than with the hour
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
  assert.equal(f.mesh.count, 60, `asked for 60, got ${f.mesh.count}`);
  assert.equal(f.blooms, 60);
  assert.equal(f.points.length, 60);

  // BY DEFAULT NOTHING IS RED: petals whitish, in the ground's own colour
  // family, and stalks in the grass's. Heads sit just off the paper, stems
  // wear the grass tone, and
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

// ---- the blooms answer the meadow's wind and the reader's hand --------------
// Both are the grass's own models (kit/wildflowers.js's header): the drifting
// gust field makeGrassField samples in GLSL, and the shared pointer spring in
// kit/breeze.js. What these pin is that the flowers actually read them — a
// bloom standing still in leaning grass was the complaint.

const DT = 1 / 60;

// drive a field forward, optionally stroking the pointer across it at the same
// time. Returns the per-bloom tilt at the end. Both branches see the identical
// simTime sequence, so anything that differs is the pointer and nothing else.
function run(f, frames, stroke = null) {
  for (let i = 0; i < frames; i++) {
    if (stroke) stroke(i);
    f.update(DT, i * DT);
  }
  return matrices(f).map(tiltOf);
}

// the XZ direction a bloom is leaning, read back off its instance matrix
const bendOf = (m4) => {
  const up = new THREE.Vector3(0, 1, 0).transformDirection(m4);
  return new THREE.Vector2(up.x, up.z);
};

test('the wind leans the blooms, and wind: 0 is the field as it was before it had any', () => {
  const opts = { count: 70, radius: 16, rMin: 2, seed: 12, groundSeed: 21 };
  const still = makeWildflowers({ ...opts, wind: 0 });
  const windy = makeWildflowers({ ...opts, wind: 1.5 });

  const a = run(still, 90);
  const b = run(windy, 90);
  assert.equal(a.length, b.length, 'same field, same blooms');
  assert.ok(a.every(Number.isFinite) && b.every(Number.isFinite), 'no NaN in either');

  // every bloom feels it
  for (let i = 0; i < a.length; i++) {
    assert.ok(Math.abs(b[i] - a[i]) > 1e-4, `bloom ${i} did not answer the wind`);
  }

  // The wind only ever ADDS to the BEND (a stem does not lean into it), which
  // is what lean() reports. Note it is NOT true of the tilt read off the
  // instance matrix: a bloom is planted with a resting tilt of its own in a
  // random direction, and a bend that opposes that tilt stands the stem back
  // UP. Asserting monotonic tilt per bloom looked right and failed on the
  // first bloom whose rest happened to point upwind.
  assert.ok(windy.lean() > still.lean() * 1.15,
    `a windy field bends visibly further: ${still.lean()} -> ${windy.lean()}`);

  // and wind: 0 really is the old behaviour — the nod alone, still alive
  assert.ok(still.lean() > 0, 'the bloom keeps its own nod with the wind off');
});

test('the wind is weather crossing the field, not a constant extra lean', () => {
  // With the nod alone, ~70 blooms on scattered phases largely average out to
  // a near-constant mean. The wind is one noise field sliding downwind over
  // all of them, so the MEAN itself has to rise and fall — that is the
  // difference between a gust passing and a bias added.
  const opts = { count: 70, radius: 16, rMin: 2, seed: 12, groundSeed: 21 };
  const still = makeWildflowers({ ...opts, wind: 0 });
  const windy = makeWildflowers({ ...opts, wind: 1.5 });
  // AT THE WEATHER THE BOOK ACTUALLY SHIPS, not the builder defaults: the
  // workbench's own defaults (debug.js — a broad, fast-drifting gust) put the
  // whole field inside about a third of one noise cell, so the meadow breathes
  // as one. At the builder's tighter default patch the field spans nearly two
  // cells and the mean averages much of its own gust away — still correct, but
  // it is not what a reader sees, and it is the shipped look this pins.
  for (const f of [still, windy]) f.setGust(0.01, 12);

  const swing = (f) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 900; i++) {         // 15s: several gusts at the shipped drift
      f.update(DT, i * DT);
      lo = Math.min(lo, f.lean());
      hi = Math.max(hi, f.lean());
    }
    return hi - lo;
  };
  const stillSwing = swing(still);
  const windySwing = swing(windy);
  assert.ok(windySwing > stillSwing * 2,
    `the windy field's mean lean breathes: ${stillSwing.toFixed(5)} vs ${windySwing.toFixed(5)}`);
});

test('a stroke bends the blooms it passes, and leaves the rest of the meadow alone', () => {
  clearBreeze();
  // two tight drifts: one under the stroke, one right across the field
  const along = [{ x: 0, z: 0 }, { x: 14, z: 0 }];
  const opts = {
    count: 40, radius: 19, seed: 3, groundSeed: 21, along, spread: 0.5,
    wind: 0,     // the pointer alone, so nothing else can explain a difference
  };
  // "under the stroke" means inside breeze.js's own reach of where the pointer
  // ends up, not merely in the near drift — a bloom out at the rim of the
  // falloff circle is legitimately barely touched, and asserting on it pins
  // the edge of a smoothstep rather than the behaviour.
  const near = (f) => f.points.map((p, i) => [p, i])
    .filter(([p]) => Math.hypot(p.x, p.z - 1.2) < 1.0).map(([, i]) => i);
  const far = (f) => f.points.map((p, i) => [p, i]).filter(([p]) => p.x > 12).map(([, i]) => i);

  const quiet = makeWildflowers(opts);
  const brushed = makeWildflowers(opts);
  assert.ok(near(quiet).length > 3 && far(quiet).length > 3, 'both drifts got blooms');

  const a = run(quiet, 36);
  // the same 36 frames, with the pointer sweeping through the near drift at
  // 4 units/s — well over breeze.js's dead zone, so it registers as a stroke
  let z = -1.2;
  const b = run(brushed, 36, () => { z += 4 * DT; setBreezePointer(0, z, DT); });

  for (const i of near(quiet)) {
    assert.ok(Math.abs(b[i] - a[i]) > 1e-3,
      `bloom ${i} is under the stroke and must move (${a[i]} vs ${b[i]})`);
  }
  for (const i of far(quiet)) {
    assert.ok(Math.abs(b[i] - a[i]) < 1e-9,
      `bloom ${i} is ${quiet.points[i].x.toFixed(1)} away and must not feel it`);
  }
  clearBreeze();
});

test('the blooms bend ALONG the stroke, not merely harder downwind', () => {
  clearBreeze();
  // The wind blows along +x (the kit default leans that way); the stroke runs
  // along +z. If the pointer only scaled the existing lean, the bend direction
  // could not move off the wind axis — the old fixed-axis code could only say
  // "more" or "less".
  const opts = {
    count: 30, radius: 8, seed: 5, groundSeed: 21,
    along: [{ x: 0, z: 0 }], spread: 0.5, windDir: [1, 0], wind: 1,
  };
  const quiet = makeWildflowers(opts);
  const brushed = makeWildflowers(opts);

  for (let i = 0; i < 36; i++) quiet.update(DT, i * DT);
  let z = -1.2;
  for (let i = 0; i < 36; i++) {
    z += 4 * DT;
    setBreezePointer(0, z, DT);
    brushed.update(DT, i * DT);
  }

  const mQuiet = matrices(quiet).map(bendOf);
  const mBrushed = matrices(brushed).map(bendOf);
  // averaged over the drift, so one bloom's own resting tilt cannot carry it
  const meanZ = (v) => v.reduce((s, p) => s + p.y, 0) / v.length;
  assert.ok(meanZ(mBrushed) > meanZ(mQuiet) + 0.01,
    `the bend swings toward the stroke: ${meanZ(mQuiet).toFixed(4)} -> ${meanZ(mBrushed).toFixed(4)}`);
  clearBreeze();
});

test('a resting pointer stirs nothing — hovering is not a breeze', () => {
  clearBreeze();
  const opts = {
    count: 30, radius: 8, seed: 6, groundSeed: 21,
    along: [{ x: 0, z: 0 }], spread: 0.5, wind: 0,
  };
  const quiet = makeWildflowers(opts);
  const hovered = makeWildflowers(opts);

  const a = run(quiet, 60);
  // the same point, over and over: breeze.js's dead zone means this is not a
  // stroke, and a bloom must not twitch just because a cursor is parked on it
  const b = run(hovered, 60, () => setBreezePointer(0, 0, DT));
  for (let i = 0; i < a.length; i++) {
    assert.ok(Math.abs(a[i] - b[i]) < 1e-9, `bloom ${i} moved under a still pointer`);
  }
  clearBreeze();
});

test('the workbench can reach a standing field: the wind record is live on the mesh', () => {
  // debug.js writes these three straight into userData.wind, the mirror of the
  // grass field's userData.uniforms — so a case's pinned weather and the
  // sliders both reach the blooms.
  const f = makeWildflowers({ count: 30, radius: 10, seed: 8, groundSeed: 21, wind: 0 });
  const rec = f.mesh.userData.wind;
  assert.ok(rec && typeof rec.wind === 'number', 'the mesh carries its live wind record');
  assert.equal(rec.gustScale, 0.055, 'and the grass builder\'s own defaults');
  assert.equal(rec.gustSpeed, 2.4);

  const before = run(f, 60);
  f.setWind(2.5);
  assert.equal(rec.wind, 2.5, 'the setter and the record are the same state');
  const after = run(f, 60);
  assert.ok(before.some((t, i) => Math.abs(t - after[i]) > 1e-3),
    'turning the wind up on a standing field moves it');

  f.setGust(0.2, 9);
  assert.equal(rec.gustScale, 0.2);
  assert.equal(rec.gustSpeed, 9);
  f.setWindDir(0, 3);
  assert.ok(Math.abs(rec.dirX) < 1e-9 && Math.abs(rec.dirZ - 1) < 1e-9, 'the direction is normalised');
});
