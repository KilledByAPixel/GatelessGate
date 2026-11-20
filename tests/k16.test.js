import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k16 from '../src/koans/k16.js';
import { makeBell } from '../src/kit/bell.js';
import { ACCENT } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';
import { tapFit } from './helpers/tap-fit.js';
import { stubAudio } from './helpers/stub-audio.js';
import { rigCamera as sharedRig, DEFAULT_HOME } from './helpers/rig-camera.js';

// Case 16 is the daily summons: the bell sounds and the monastery turns toward
// it. The things worth pinning here are the bonshō itself (a NEW kit prop with
// motion state), the determinism of its swing, and the audible moment — the
// first case whose interaction makes a sound, which means the audio guard has
// to survive a null audio and the strike has to reach audio.bell exactly once
// per accepted tap.

// ---- the bell ---------------------------------------------------------------

test('makeBell is a grounded bonshō hung from a roofed two-post frame', () => {
  const b = makeBell({ height: 1.1 });
  assert.equal(b.group.name, 'bell');
  for (const name of ['pad', 'beam', 'roof', 'swing']) {
    assert.ok(b.group.children.some((c) => c.name === name), `${name} missing`);
  }
  assert.equal(b.group.children.filter((c) => c.name === 'post').length, 2, 'two posts');

  const swing = b.group.children.find((c) => c.name === 'swing');
  assert.ok(swing.children.some((c) => c.name === 'link'), 'hung by a link');
  const body = swing.children.find((c) => c.name === 'body');
  assert.ok(body && body.isMesh, 'the bronze itself');

  // stands on the ground, and about twice the bell tall with its frame
  const box = new THREE.Box3().setFromObject(b.group);
  assert.ok(box.min.y > -0.01, `on the ground: ${box.min.y}`);
  assert.ok(box.max.y > 1.9 && box.max.y < 2.4, `frame height: ${box.max.y}`);

  // the bell HANGS: clear of the pad below, clear of the beam above
  b.group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(body);
  assert.ok(bb.min.y > 0.2, `mouth swings free of the pad: ${bb.min.y}`);
  assert.ok(bb.max.y < 1.7, `crown below the beam: ${bb.max.y}`);

  // widest at the mouth: the lip is the lowest ring and nothing above overhangs it
  const pos = body.geometry.attributes.position;
  let maxR = 0, yAtMaxR = 0;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    if (r > maxR) { maxR = r; yAtMaxR = pos.getY(i); }
  }
  assert.ok(yAtMaxR < 0.1, `the widest ring is the mouth's, got y=${yAtMaxR}`);

  // a tap has something forgiving to land on
  assert.ok(b.pickTargets().length >= 2, 'pick targets include a hit proxy');
  assert.ok(b.pickTargets().some((m) => m.name === 'bell-hit'));
});

// The lathe's rings, mouth to crown, as [height, radius] in units of the bell's
// own height — read off the built geometry, so these tests hold the shape that
// ships rather than a copy of the builder's table.
function bellRings(H) {
  const b = makeBell({ height: H });
  const body = b.group.children.find((c) => c.name === 'swing')
    .children.find((c) => c.name === 'body');
  const pos = body.geometry.attributes.position;
  const byY = new Map();
  for (let i = 0; i < pos.count; i++) {
    const y = Math.round(pos.getY(i) / H * 1000) / 1000;
    const r = Math.hypot(pos.getX(i), pos.getZ(i)) / H;
    byY.set(y, Math.max(byY.get(y) ?? 0, r));
  }
  // the axis points (recessed underside, crown tip) are not part of the outline
  return [...byY.entries()].filter(([, r]) => r > 0.01).sort((p, q) => p[0] - q[0]);
}
function radiusAtHeight(rings, y) {
  for (let i = 1; i < rings.length; i++) {
    const [y0, r0] = rings[i - 1], [y1, r1] = rings[i];
    if (y >= y0 && y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0 || 1));
  }
  return 0;
}

test('the bonshō is a straight-sided barrel: no waist, no flare, a dome and not a cone', () => {
  // The profile this replaces pinched to a waist under a banded shoulder,
  // kicked out at the mouth like a handbell and ran to a point, and at case
  // distance that outline is a fire hydrant. Each assertion below names one of
  // those and fails on it.
  const rings = bellRings(1.1);
  const mouth = rings[0][1];
  const top = rings[rings.length - 1][0];
  assert.ok(rings[0][0] < 0.01, `the outline starts at the mouth: y=${rings[0][0]}`);

  // NO WAIST: climbing from the mouth, no ring is ever wider than the one
  // under it — the sides only ever close, and they close toward the crown
  for (let i = 1; i < rings.length; i++) {
    assert.ok(rings[i][1] <= rings[i - 1][1] + 1e-6,
      `the wall widens again at ${rings[i][0]} of the height: ${rings[i - 1][1].toFixed(3)} -> ${rings[i][1].toFixed(3)}`);
  }

  // NEAR-STRAIGHT: over the barrel's long middle the wall barely leans
  const low = radiusAtHeight(rings, 0.15), high = radiusAtHeight(rings, 0.65);
  assert.ok(high > low * 0.88, `the barrel tapers too fast to read as straight: ${low.toFixed(3)} -> ${high.toFixed(3)}`);

  // A LIP, NOT A FLARE: the mouth ring stands proud of the wall above it by a
  // thickness, not by a skirt
  assert.ok(mouth > low, `the mouth carries a lip: mouth=${mouth.toFixed(3)} wall=${low.toFixed(3)}`);
  assert.ok(mouth < low * 1.12, `the mouth flares: mouth=${mouth.toFixed(3)} wall=${low.toFixed(3)}`);

  // A DOME: most of the way up, the crown is still most of the barrel wide
  const nearTop = radiusAtHeight(rings, top * 0.9);
  assert.ok(nearTop > low * 0.6, `the crown runs to a point: ${nearTop.toFixed(3)} at nine tenths, wall ${low.toFixed(3)}`);

  // A HANGING MASS, NOT A POST: about one and a half barrels tall
  const squat = 1 / (2 * radiusAtHeight(rings, 0.4));
  assert.ok(squat > 1.3 && squat < 1.75, `height over barrel width: ${squat.toFixed(2)}`);
});

test('the ryuzu is a loop, not a bare rod: it reaches well off the hanging axis', () => {
  const H = 1.1;
  const b = makeBell({ height: H });
  const swing = b.group.children.find((c) => c.name === 'swing');
  const link = swing.children.find((c) => c.name === 'link');
  assert.ok(link && link.isMesh, 'the link mesh exists');
  const box = new THREE.Box3().setFromObject(link);
  // a bare rod (the old design) sat within ~0.032*H of the axis; a loop
  // arches its two feet out to roughly the stub-to-loop radius on each side
  const halfSpan = (box.max.x - box.min.x) / 2;
  assert.ok(halfSpan > 0.07 * H, `link reaches well past a thin rod's radius: half-span=${halfSpan.toFixed(4)}`);
  // and it still stands over the crown, roughly centred on the hanging axis
  assert.ok(Math.abs((box.max.x + box.min.x) / 2) < 0.01 * H, 'the loop is centred over the axis it hangs from');
});

test('strike() sets a subtle swing that decays back near zero', () => {
  const b = makeBell({ seed: 3 });
  const swing = b.group.children.find((c) => c.name === 'swing');
  b.update(1 / 60, 0);
  assert.equal(b.swinging(), 0, 'still until struck');
  assert.equal(swing.rotation.x, 0);

  b.strike();
  // measured against the strike's OWN energy rather than absolutes derived from
  // A0. The bell's throw was doubled once already — it simply was not enough —
  // and every hardcoded number here moved with it; stated as fractions, these
  // say what they mean and survive the next retune. What is actually being
  // claimed: a strike lands real energy, the bell visibly swings, it never
  // exceeds its own clamp, and it dies away.
  const struck = b.swinging();
  assert.ok(struck > 0.03, `energy lands with the strike: ${struck}`);

  let peak = 0;
  for (let i = 1; i <= 60; i++) {
    b.update(1 / 60, i / 60);
    peak = Math.max(peak, Math.abs(swing.rotation.x));
  }
  assert.ok(peak > struck * 0.25, `it visibly swings: ${peak} against a strike of ${struck}`);
  assert.ok(peak <= struck, `a bonshō is massive — the pose never exceeds the strike's own envelope: ${peak}`);

  // ~4s later it is nearly still; by 9s the strike has aged out entirely
  for (let i = 61; i <= 240; i++) b.update(1 / 60, i / 60);
  assert.ok(b.swinging() < struck * 0.07,
    `dies back near zero: ${b.swinging()}, ${(b.swinging() / struck * 100).toFixed(1)}% of the strike`);
  for (let i = 241; i <= 540; i++) b.update(1 / 60, i / 60);
  assert.equal(b.swinging(), 0, 'old strikes are pruned, not kept forever');
  assert.equal(swing.rotation.x, 0);
});

test('a second strike stacks energy without a snap in the pose', () => {
  const b = makeBell({ seed: 4 });
  const swing = b.group.children.find((c) => c.name === 'swing');
  b.update(1 / 60, 0);
  b.strike();
  for (let i = 1; i <= 90; i++) b.update(1 / 60, i / 60);   // 1.5s in, still moving

  const before = b.swinging();
  const poseBefore = swing.rotation.x;
  b.strike();
  assert.ok(b.swinging() > before + 0.04, 're-trigger adds energy');
  // the new impulse contributes nothing at the instant it lands, so the pose
  // cannot pop — it pushes from here
  assert.ok(Math.abs(swing.rotation.x - poseBefore) < 1e-12, 'no snap at the strike');
  b.update(1 / 60, 91 / 60);
  assert.ok(Math.abs(swing.rotation.x - poseBefore) < 0.02, 'and it moves smoothly after');
});

test('two bells with the same seed and history land in the same pose', () => {
  const drive = (bell) => {
    const swing = bell.group.children.find((c) => c.name === 'swing');
    for (let i = 0; i <= 300; i++) {
      if (i === 30 || i === 140) bell.strike();
      bell.update(1 / 60, i / 60);
    }
    return [swing.rotation.x, swing.rotation.z, bell.swinging()];
  };
  const a = drive(makeBell({ seed: 11 }));
  const b = drive(makeBell({ seed: 11 }));
  assert.deepEqual(a, b, 'no hidden randomness in the swing');
  assert.ok(a.some((v) => Math.abs(v) > 1e-4), 'and the sampled pose is mid-swing, not rest');
});

// ---- the case ---------------------------------------------------------------

// k16 ships without a `camera` block, so the app frames it with the default
// diorama rig — DEFAULT_HOME is that framing, kept beside the rig itself rather
// than copied here — and the reader can drag ±51.5° of heading around home.
const HOME = DEFAULT_HOME;
const rigCamera = (heading = HOME.heading, aspect = 1.78) => sharedRig({}, { heading, aspect });

test('module shape matches the koan contract', () => {
  assert.equal(k16.id, 16);
  assert.equal(k16.slug, 'bells-and-robes');
  assert.equal(k16.title, 'Bells and Robes');
  assert.equal(k16.accent, ACCENT);
  assert.equal(k16.tier, 1);
  // the roster: the bonsho and the eave chime are both real emitters here,
  // so the swells thin around them
  assert.deepEqual(k16.ambience, ['wind:0.14', 'bell', 'cylinder', 'music']);
  for (const f of ['case', 'comment', 'verse']) {
    assert.ok(k16.text[f] && k16.text[f].trim().length > 0, `text.${f} empty`);
  }
  // the case file must never author prose — it all comes from TEXT[16]
  assert.match(k16.text.case, /ceremonial robes/);
  assert.equal(typeof k16.build, 'function');
});

test('the diorama is a hall, a hanging bell, and three monks turned toward it', () => {
  const root = k16.build(fakeCtx());
  assert.ok(root.scene instanceof THREE.Scene);
  for (const fn of ['update', 'dispose', 'fragment', 'setCamera']) {
    assert.equal(typeof root[fn], 'function', `root.${fn} missing`);
  }
  for (const name of ['path', 'hut', 'bell', 'lantern', 'ground', 'grassfield']) {
    assert.ok(root.scene.getObjectByName(name), `${name} missing from the scene`);
  }
  const monks = [];
  root.scene.traverse((o) => { if (o.name === 'monk') monks.push(o); });
  assert.equal(monks.length, 3, 'one at the frame, one on the walk, one at the door');
  assert.ok(monks.some((m) => m.children.some((c) => c.name === 'staff')),
    'the elder carries a staff — the one figure whose turn can actually be seen');

  // the seal: the bronze is ACCENT and carries the seal glow washMaterial adds;
  // the case must not have fought it or doubled it
  const bellGroup = root.scene.getObjectByName('bell');
  const body = bellGroup.getObjectByName('body');
  assert.equal('#' + body.material.color.getHexString(), ACCENT.toLowerCase());
  assert.ok(body.material.emissiveIntensity > 0, 'the seal glows on its own');

  root.onEnter && root.onEnter();
  for (let i = 0; i < 120; i++) root.update(1 / 60, i / 60);
  const frag = root.fragment();
  assert.ok(Object.keys(frag).length > 0);
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} is ${v}`);
  }
  assert.equal(frag.strikes, 0, 'nothing has been struck yet');
  // He is staged with his BACK to it. This pinned 0.42 — caught half round —
  // until he was turned the whole way away (k16.js: "hacked to face away at
  // first"), which makes the summons a bigger movement and the strike worth
  // watching. The staging is the authority; the number followed it. What the
  // assertion is actually for is unchanged and is the pair with the strike test
  // below: he must NOT already be facing the bell at build, or the one piece of
  // motion this case has is over before the reader touches anything.
  assert.ok(frag.turn < 0.1, `the elder starts unturned, back to the bell: ${frag.turn}`);
  root.onExit && root.onExit();
  root.dispose();
});

test('a held pointer cannot ring the bell without limit, though a genuine re-strike while it swings still works', () => {
  // CODE REVIEW CAUGHT (Task 5C): no cooldown at all, so a held pointer or a
  // fast tapper stacked audio.bell() calls without limit. The design comment
  // ("tap again while it is still moving and the strike stacks") survives
  // the fix intact — a real re-strike sits seconds after the first, far
  // outside the 0.5s cooldown, as the second half of this test shows.
  const rings = [];
  const audio = { ...stubAudio(), bell: (o) => rings.push(o.f0) };
  const ctx = fakeCtx();
  ctx.audio = audio;
  const root = k16.build(ctx);
  root.setCamera(rigCamera());
  ctx.input.raycastFirst = (cam, objs) => (objs.some((o) => o.name === 'bell-hit')
    ? { object: objs[0], point: new THREE.Vector3() }
    : null);

  root.update(1 / 60, 0);
  ctx._taps.forEach((cb) => cb());   // first strike
  ctx._taps.forEach((cb) => cb());   // immediate repeat, inside the 0.5s cooldown
  ctx._taps.forEach((cb) => cb());   // and again
  assert.equal(root.fragment().strikes, 1, 'repeats inside the cooldown must not stack');
  assert.equal(rings.length, 1, 'only one bell actually rang');

  for (let i = 1; i <= 120; i++) root.update(1 / 60, i / 60);   // 2s on: still swinging
  ctx._taps.forEach((cb) => cb());   // a genuine re-strike, well past the cooldown
  assert.equal(root.fragment().strikes, 2, 'tapping it again while it still moves works as designed');
  assert.equal(rings.length, 2);
});

test('the hall never stands between the camera and the bell across the orbit arc', () => {
  // The brief's staging trap: a tall prop behind the seal can eat it for half
  // the orbit. The reachable arc is home ±51.5° (camera.js headingRange); across
  // all of it the hall must not occlude the bronze.
  const root = k16.build(fakeCtx());
  root.scene.updateMatrixWorld(true);
  const hall = root.scene.getObjectByName('hut');
  const body = root.scene.getObjectByName('bell').getObjectByName('body');
  const target = body.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster();
  ray.far = 100;

  for (const d of [-51.5, -25.8, 0, 25.8, 51.5]) {
    const cam = rigCamera(HOME.heading + d);
    const dir = target.clone().sub(cam.position);
    const len = dir.length();
    ray.set(cam.position, dir.normalize());
    const blocker = ray.intersectObject(hall, true)
      .find((h) => h.distance < len - 0.3);
    assert.ok(!blocker,
      `at heading ${(HOME.heading + d).toFixed(1)} the hall hides the bell (${blocker && blocker.object.name})`);
  }
});

test('the bell sits in frame at the home angle', () => {
  const root = k16.build(fakeCtx());
  root.scene.updateMatrixWorld(true);
  const body = root.scene.getObjectByName('bell').getObjectByName('body');
  const p = body.getWorldPosition(new THREE.Vector3());
  // narrow portrait is the worst case for a seal placed right of centre
  for (const aspect of [1.78, 1.30, 0.80]) {
    const v = p.clone().project(rigCamera(HOME.heading, aspect));
    assert.ok(Math.abs(v.x) < 0.7, `bell x in frame at aspect ${aspect}: ${v.x.toFixed(2)}`);
    assert.ok(Math.abs(v.y) < 0.7, `bell y in frame at aspect ${aspect}: ${v.y.toFixed(2)}`);
  }
});

test('tapping the bell swings it, rings the temple preset, and the elder finishes his turn', () => {
  const rings = [];
  const audio = { ...stubAudio(), bell: (o) => rings.push(o) };
  const ctx = fakeCtx();
  ctx.audio = audio;
  const root = k16.build(ctx);
  root.setCamera(rigCamera());
  root.onEnter && root.onEnter();
  root.update(1 / 60, 0);
  assert.ok(ctx._taps.length > 0, 'the case has to offer something to find');

  // a tap that hits nothing changes nothing, and stays silent
  ctx._taps.forEach((cb) => cb());
  assert.equal(root.fragment().strikes, 0);
  assert.equal(rings.length, 0);

  // tap the bell
  ctx.input.raycastFirst = (cam, objs) => (objs.some((o) => o.name === 'bell-hit')
    ? { object: objs[0], point: new THREE.Vector3() }
    : null);
  ctx._taps.forEach((cb) => cb());
  let frag = root.fragment();
  assert.equal(frag.strikes, 1, 'the strike lands');
  assert.equal(rings.length, 1, 'and it is AUDIBLE — one ring per strike');
  assert.equal(rings[0].preset, 'temple', 'the bonshō rings the temple preset — see task-12');

  for (let i = 1; i <= 120; i++) root.update(1 / 60, i / 60);
  frag = root.fragment();
  assert.ok(frag.swing > 0.01, `the bronze is still moving: ${frag.swing}`);
  assert.ok(frag.turn > 0.9, `the elder has come round to face it: ${frag.turn}`);

  // a second tap while swinging simply strikes again
  ctx._taps.forEach((cb) => cb());
  assert.equal(root.fragment().strikes, 2);
  assert.equal(rings.length, 2);
  root.onExit && root.onExit();

  // and the whole moment survives having no audio engine at all. Targeted at
  // the bell's own pick targets specifically now that the case also probes
  // the eave chime first on every tap — an untargeted "hit anything" stub
  // would ring the chime instead and never reach the bell at all.
  const mute = fakeCtx();
  const quiet = k16.build(mute);
  quiet.setCamera(rigCamera());
  quiet.update(1 / 60, 0);
  mute.input.raycastFirst = (cam, objs) => (objs.some((o) => o.name === 'bell-hit')
    ? { object: objs[0], point: new THREE.Vector3() }
    : null);
  assert.doesNotThrow(() => mute._taps.forEach((cb) => cb()));
  assert.equal(quiet.fragment().strikes, 1, 'the bell still swings, silently');
});

// The bell's tap drum is sized by hand in fractions of the bell's height
// (kit/bell.js), not cut from the bronze it surrounds: re-shape the bell and
// a tap aimed at its crown or lip lands outside the drum. The bronze is still
// in pickTargets() itself, but the drum is the forgiving part on a phone.
// Held to the bronze's drawn extent, padded around it, not beside it.
test('tap targets still sit on their models', () => {
  const root = k16.build(fakeCtx());
  root.update(1 / 60, 0);
  const bell = root.scene.getObjectByName('bell');
  const hit = bell.getObjectByName('bell-hit');
  assert.ok(hit && hit.material.visible === false, 'the bell has an invisible tap drum');
  const fit = tapFit(hit, bell.getObjectByName('body'));
  assert.ok(fit.uncovered <= 0.15, `the bronze pokes out of its tap drum: ${(fit.uncovered * 100).toFixed(0)}% uncovered`);
  assert.ok(fit.offCentre < 0.35, `the tap drum hangs beside the bronze: ${(fit.offCentre * 100).toFixed(0)}% off centre`);
});
