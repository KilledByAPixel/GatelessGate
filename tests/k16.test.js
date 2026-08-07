import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k16 from '../src/koans/k16.js';
import { makeBell } from '../src/kit/bell.js';
import { ACCENT } from '../src/palette.js';

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

  // dome-topped, slightly flared: the widest ring of the profile is the lowest
  const pos = body.geometry.attributes.position;
  let maxR = 0, yAtMaxR = 0;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    if (r > maxR) { maxR = r; yAtMaxR = pos.getY(i); }
  }
  assert.ok(yAtMaxR < 0.1, `the flare is at the mouth, got widest ring at y=${yAtMaxR}`);

  // a tap has something forgiving to land on
  assert.ok(b.pickTargets().length >= 2, 'pick targets include a hit proxy');
  assert.ok(b.pickTargets().some((m) => m.name === 'bell-hit'));
});

test('the bonshō profile carries a flared mouth, a waist, and shoulder bands', () => {
  // Reproduces the builder's own profile formula (same disclosed
  // reproduce-the-tuned-constant tradeoff other D-tasks' eave/post/roof
  // tests use) rather than a magic epsilon, and every comparison here is
  // mutation-provable — flattening any one of these features makes the
  // matching assertion false.
  const H = 1.1;
  const b = makeBell({ height: H });
  const body = b.group.children.find((c) => c.name === 'swing')
    .children.find((c) => c.name === 'body');
  const pos = body.geometry.attributes.position;
  const radiusAt = (yFrac, tol = 0.008) => {
    let r = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i) - yFrac * H) < tol * H) {
        r = Math.max(r, Math.hypot(pos.getX(i), pos.getZ(i)));
      }
    }
    return r;
  };
  const mouth = radiusAt(0.000);
  const lip = radiusAt(0.065);
  const waist = radiusAt(0.300);
  const band1 = radiusAt(0.600);
  const valley = radiusAt(0.625);
  const band2 = radiusAt(0.655);
  for (const [name, v] of [['mouth', mouth], ['lip', lip], ['waist', waist], ['band1', band1], ['valley', valley], ['band2', band2]]) {
    assert.ok(v > -Infinity, `found a vertex ring near ${name}`);
  }
  assert.ok(mouth > lip + 0.03 * H, `the mouth flares out past the ring just above it: mouth=${mouth.toFixed(4)} lip=${lip.toFixed(4)}`);
  assert.ok(waist < lip - 0.005 * H, `the waist pulls in below the flare: waist=${waist.toFixed(4)} lip=${lip.toFixed(4)}`);
  assert.ok(waist < band1 - 0.01 * H, `the waist is narrower than the shoulder above it: waist=${waist.toFixed(4)} band1=${band1.toFixed(4)}`);
  assert.ok(band1 > valley + 0.005 * H, `shoulder band 1 stands proud of the valley behind it: band1=${band1.toFixed(4)} valley=${valley.toFixed(4)}`);
  assert.ok(band2 > valley + 0.005 * H, `shoulder band 2 stands proud of the same valley: band2=${band2.toFixed(4)} valley=${valley.toFixed(4)}`);
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
  // measured against the strike's OWN energy rather than absolutes derived
  // from A0. The bell's throw was doubled once already (Frank: "it's just not
  // enough — about twice as much") and every hardcoded number here moved with
  // it; stated as fractions, these say what they mean and survive the next
  // retune. What is actually being claimed: a strike lands real energy, the
  // bell visibly swings, it never exceeds its own clamp, and it dies away.
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

function fakeCtx() {
  const taps = [], hovers = [];
  return {
    audio: null,                        // build() must work with no audio at all
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,
    },
    _taps: taps, _hovers: hovers,
  };
}

// k16 ships without a `camera` block, so the app frames it with the default
// diorama rig (src/main.js): distance 11.5, target [1.2, 1.35, 0.3],
// azimuth 0.55, polar 1.27, and the user can drag ±0.9 of azimuth around home.
const HOME = { distance: 11.5, target: [1.2, 1.35, 0.3], azimuth: 0.55, polar: 1.27 };
function rigCamera(azimuth = HOME.azimuth, aspect = 1.78) {
  const cam = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
  const [tx, ty, tz] = HOME.target;
  const sp = Math.sin(HOME.polar), cp = Math.cos(HOME.polar);
  cam.position.set(
    tx + HOME.distance * sp * Math.sin(azimuth),
    ty + HOME.distance * cp,
    tz + HOME.distance * sp * Math.cos(azimuth),
  );
  cam.lookAt(tx, ty, tz);
  cam.updateMatrixWorld(true);
  return cam;
}

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
  assert.match(k16.text.case, /wide world/);
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

  // the seal: the bronze is ACCENT and carries the seal glow toonMaterial adds;
  // the case must not have fought it or doubled it
  const bellGroup = root.scene.getObjectByName('bell');
  const body = bellGroup.getObjectByName('body');
  assert.equal('#' + body.material.color.getHexString(), ACCENT.toLowerCase());
  assert.ok(body.material.emissiveIntensity > 0, 'the seal glows on its own');

  // painted shadows under everything that stands in the yard
  let blobs = 0;
  root.scene.traverse((o) => { if (o.name === 'blobshadow') blobs++; });
  assert.ok(blobs >= 6, `figures, bell, hall and lantern all cast: ${blobs}`);

  root.onEnter && root.onEnter();
  for (let i = 0; i < 120; i++) root.update(1 / 60, i / 60);
  const frag = root.fragment();
  assert.ok(Object.keys(frag).length > 0);
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} is ${v}`);
  }
  assert.equal(frag.strikes, 0, 'nothing has been struck yet');
  assert.ok(Math.abs(frag.turn - 0.42) < 0.03, `the elder is staged mid-turn: ${frag.turn}`);
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
  const audio = {
    startAmbience() {}, stopAmbience() {}, setWindLevel() {}, cylinderStrike() {},
    bell: (o) => rings.push(o.f0),
  };
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
  // the orbit. The reachable arc is home ±0.9 (camera.js azimuthRange); across
  // all of it the hall must not occlude the bronze.
  const root = k16.build(fakeCtx());
  root.scene.updateMatrixWorld(true);
  const hall = root.scene.getObjectByName('hut');
  const body = root.scene.getObjectByName('bell').getObjectByName('body');
  const target = body.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster();
  ray.far = 100;

  for (const d of [-0.9, -0.45, 0, 0.45, 0.9]) {
    const cam = rigCamera(HOME.azimuth + d);
    const dir = target.clone().sub(cam.position);
    const len = dir.length();
    ray.set(cam.position, dir.normalize());
    const blocker = ray.intersectObject(hall, true)
      .find((h) => h.distance < len - 0.3 && !h.object.userData.isOutline);
    assert.ok(!blocker,
      `at azimuth ${(HOME.azimuth + d).toFixed(2)} the hall hides the bell (${blocker && blocker.object.name})`);
  }
});

test('the bell sits in frame at the home angle', () => {
  const root = k16.build(fakeCtx());
  root.scene.updateMatrixWorld(true);
  const body = root.scene.getObjectByName('bell').getObjectByName('body');
  const p = body.getWorldPosition(new THREE.Vector3());
  // narrow portrait is the worst case for a seal placed right of centre
  for (const aspect of [1.78, 1.30, 0.80]) {
    const v = p.clone().project(rigCamera(HOME.azimuth, aspect));
    assert.ok(Math.abs(v.x) < 0.7, `bell x in frame at aspect ${aspect}: ${v.x.toFixed(2)}`);
    assert.ok(Math.abs(v.y) < 0.7, `bell y in frame at aspect ${aspect}: ${v.y.toFixed(2)}`);
  }
});

test('tapping the bell swings it, rings the temple preset, and the elder finishes his turn', () => {
  const rings = [];
  const audio = {
    startAmbience() {}, stopAmbience() {}, setWindLevel() {}, cylinderStrike() {},
    bell: (o) => rings.push(o),
  };
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
  assert.equal(rings[0].preset, 'temple', 'the bonshō rings Frank\'s temple preset — see task-12');

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
