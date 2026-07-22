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

test('strike() sets a subtle swing that decays back near zero', () => {
  const b = makeBell({ seed: 3 });
  const swing = b.group.children.find((c) => c.name === 'swing');
  b.update(1 / 60, 0);
  assert.equal(b.swinging(), 0, 'still until struck');
  assert.equal(swing.rotation.x, 0);

  b.strike();
  assert.ok(b.swinging() > 0.03, `energy lands with the strike: ${b.swinging()}`);

  let peak = 0;
  for (let i = 1; i <= 60; i++) {
    b.update(1 / 60, i / 60);
    peak = Math.max(peak, Math.abs(swing.rotation.x));
  }
  assert.ok(peak > 0.015, `it visibly swings: ${peak}`);
  assert.ok(peak <= 0.111, `but a bonshō is massive — stays subtle: ${peak}`);

  // ~4s later it is nearly still; by 9s the strike has aged out entirely
  for (let i = 61; i <= 240; i++) b.update(1 / 60, i / 60);
  assert.ok(b.swinging() < 0.004, `dies back near zero: ${b.swinging()}`);
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
  assert.deepEqual(k16.ambience, ['wind:0.14']);
  assert.equal(k16.music, undefined, 'no music field');
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
  for (const fn of ['update', 'onEnter', 'onExit', 'dispose', 'fragment', 'setCamera']) {
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

  root.onEnter();
  for (let i = 0; i < 120; i++) root.update(1 / 60, i / 60);
  const frag = root.fragment();
  assert.ok(Object.keys(frag).length > 0);
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} is ${v}`);
  }
  assert.equal(frag.strikes, 0, 'nothing has been struck yet');
  assert.ok(Math.abs(frag.turn - 0.42) < 0.03, `the elder is staged mid-turn: ${frag.turn}`);
  root.onExit();
  root.dispose();
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

test('tapping the bell swings it, rings it at f0 98, and the elder finishes his turn', () => {
  const rings = [];
  const audio = {
    startAmbience() {}, stopAmbience() {}, setWindLevel() {},
    bell: (o) => rings.push(o),
  };
  const ctx = fakeCtx();
  ctx.audio = audio;
  const root = k16.build(ctx);
  root.setCamera(rigCamera());
  root.onEnter();
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
  assert.equal(rings[0].f0, 98, 'the bonshō speaks lower than the sit chime');

  for (let i = 1; i <= 120; i++) root.update(1 / 60, i / 60);
  frag = root.fragment();
  assert.ok(frag.swing > 0.01, `the bronze is still moving: ${frag.swing}`);
  assert.ok(frag.turn > 0.9, `the elder has come round to face it: ${frag.turn}`);

  // a second tap while swinging simply strikes again
  ctx._taps.forEach((cb) => cb());
  assert.equal(root.fragment().strikes, 2);
  assert.equal(rings.length, 2);
  root.onExit();

  // and the whole moment survives having no audio engine at all
  const mute = fakeCtx();
  const quiet = k16.build(mute);
  quiet.setCamera(rigCamera());
  quiet.update(1 / 60, 0);
  mute.input.raycastFirst = () => ({ point: new THREE.Vector3() });
  assert.doesNotThrow(() => mute._taps.forEach((cb) => cb()));
  assert.equal(quiet.fragment().strikes, 1, 'the bell still swings, silently');
});
