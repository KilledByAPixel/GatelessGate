import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH, INK, wash, INK_LIT } from '../palette.js';
import { SEAL_GLOW } from '../render/material.js';
import {
  composeWorld, makeVeranda, makeMonk, aimMonk, makeLantern,
  makeLights, washMaterial, makeFurin, makeVase, plantTree
} from '../kit/index.js';

const ID = 4;
const VERANDA_H = 3.2;   // shared with the chime hang point below

// Wakuan looks at a painting of Bodhidharma — who every painter in China gave
// an enormous beard — and complains that the fellow hasn't got one.
//
// So the scene is the painting, hung in a veranda bay where a scroll would
// actually hang, and the man standing in front of it being annoyed. The
// portrait is genuinely beardless. Try to put one on it and the ink will not
// take: the stroke gathers, hangs there a moment, and drains back off the
// silk. You cannot add what the picture is refusing to be.
// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 9, target: [0.5, 1.7, -1.4], heading: 29, pitch: 12.5 };
  export default {
  id: ID,
  slug: 'a-beardless-foreigner',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // 'furin' names the single chime hung under the veranda's own eave: this is
  // exactly the bay a real fūrin would hang in (a teaching hall's open porch,
  // not a hillside), and one quiet voice suits a case about a picture that
  // refuses to be added to — a chattering cluster would be too many opinions.
  ambience: ['wind:0.14', 'scroll', 'furin', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  scene.add(makeLights({ sun: { heading: -48, pitch: 38 } }));
  
  // the bay the scroll hangs in
  const veranda = makeVeranda({ width: 4.6, depth: 3.6, height: VERANDA_H });
  veranda.position.set(0.2, 0, -3.4);
  scene.add(veranda);

  const vase = makeVase({ height: 0.55, seed: 10 });
  vase.group.position.set(-1.1, .3, .5);
  veranda.add(vase.group);
    
  
  // ---- THE SCROLL -------------------------------------------------------
  // A kakemono: two rollers and a hanging field of silk, with the portrait
  // painted on it. Everything is flattened in z, because it IS a picture.
  const scroll = new THREE.Group();
  scroll.name = 'scroll';
  
  const SW = 1.15, SH = 2.0;
  const silk = new THREE.Mesh(
  new THREE.PlaneGeometry(SW, SH),
  washMaterial({ color: WASH.mist, flat: true }));
  silk.name = 'silk';
  scroll.add(silk);
  
  for (const sy of [-1, 1]) {
  const rod = new THREE.Mesh(
  new THREE.CylinderGeometry(0.045, 0.045, SW * 1.12, 7),
  washMaterial({ color: WASH.dark, flat: true }));
  rod.name = 'rod';
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, sy * SH / 2, -0.01);
  scroll.add(rod);
  }
  
  // The painted Bodhidharma: a robe and a cowled head, standing a hair proud of
  // the silk. Famously bearded everywhere else; not here. Painted in the case's
  // red, not ink — the whole painted image, not a detail of it: the portrait IS
  // this koan's seal, so the little collector's-seal square it used to carry is
  // gone with the same stroke — one red thing, and it is him.
  const paintMat = washMaterial({ color: ACCENT, flat: true });
  const painted = new THREE.Group();
  painted.name = 'painted';
  painted.position.set(0, 0.1, 0.03);
  
  const robeProfile = [
  [0.02, 0.00], [0.34, 0.00], [0.30, 0.24], [0.24, 0.52],
  [0.20, 0.70], [0.22, 0.80], [0.10, 0.86],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const robe = new THREE.Mesh(new THREE.LatheGeometry(robeProfile, 9), paintMat);
  robe.name = 'robe';
  robe.position.y = -0.62;
  robe.scale.z = 0.30;                 // pressed flat: it is paint, not a man
  painted.add(robe);
  
  // The head: ONE mass, not two. It used to be a face sphere with a separate
  // open hood shell over it, and since every part of the portrait is the same
  // red paint the only thing the second piece contributed was its artifacts —
  // the shell's rim cutting a hard seam across the crown, and its open
  // underside showing backfaces from below. A hooded head in flat red IS a
  // single silhouette, so it is modelled as one: an egg standing slightly tall,
  // pressed flat like the rest of the paint.
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), paintMat);
  face.name = 'face';
  face.position.y = 0.315;
  face.scale.set(1, 1.14, 0.32);
  painted.add(face);

  // THE ONE DARK MARK ON HIM — BUILT, AND CURRENTLY NOT ADDED.
  //
  // The argument for it was that a head which is one unbroken red egg has no
  // face and no front, and reads as a shape rather than a man looking at you
  // ("we still need to add the black dot to the head of the red figures") —
  // the same move the kit makes on a red buddha, where markFor() in
  // kit/buddha.js gives an accent-coloured head an ink urna for that reason.
  //
  // Judged by eye against the finished scene, the dot lost. The portrait reads
  // better as flat unbroken paint: it is a PICTURE of a man on silk, not a man,
  // and a face detail argues with that. Left standing rather than deleted
  // because it is one line to restore and the call was close; tests/k4.test.js
  // pins the current, markless portrait and says what to put back if it flips.
  //
  // If it does come back: sat ON the paint, not sunk into it — the paint is
  // pressed flat to 0.32 of its depth and a buried dot comes out the back of
  // the silk.
  const mark = new THREE.Mesh(new THREE.SphereGeometry(0.030, 8, 6),
    washMaterial({ color: INK, flat: true }));
  mark.name = 'mark';
  mark.scale.set(1, 1, 0.5);
  mark.position.set(0, 0.41, 0.040);
  // painted.add(mark);
  scroll.add(painted);
  
  // THE BEARD THAT WILL NOT TAKE. Present from the start and invisible; a tap
  // gathers it and it drains away again. THE BEARD IS RED, and it is the only
  // red left while it is up: the portrait drains to ink underneath it over the
  // same envelope, so what you get is a black figure wearing the one bright
  // mark on the page. Which is also the case, drawn: the thing that is not
  // there is the only thing you can see.
  const beardMat = washMaterial({ color: ACCENT, flat: true });
  beardMat.transparent = true;
  beardMat.opacity = 0;
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.34, 7), beardMat);
  beard.name = 'beard';
  beard.rotation.x = Math.PI;          // point down, off the chin
  beard.position.set(0, 0.06, 0.04);
  beard.scale.z = 0.4;
  painted.add(beard);
  
  scroll.position.set(0.2, 1.95, -3.34);
  scene.add(scroll);
  
  // Wakuan, in front of it, complaining
  const wakuan = makeMonk({ height: 1.66, pose: 'point' });
  wakuan.position.set(-.9, .35, -1);
  aimMonk(wakuan, scroll.position);
  scene.add(wakuan);
  
  const lantern = makeLantern({ height: 1.1 });
  lantern.position.set(-2.9, 0, -0.4);
  scene.add(lantern);
  
  // A single small tube on a cord, hung under the veranda's own beam — the
  // one voice a bay like this would actually carry. Local to the veranda
  // group (like a torii's chimes in case 29) so it stays square to the
  // porch however the scene is placed. x=1.5 sits between the two posts
  // nearest that side (px ~ 0.77 and 2.3 at this width), clear of both;
  // y is the beam's own underside (height-0.20); z sits a hand's width
  // proud of the post line, under the eave's own shadow rather than flush
  // with the beam face.
  const furin = makeFurin({
  size: .3,
  tubes: 1, seed: 4,
  onStrike: (_, force, pos) => audio && audio.chimeStrike({ tube: 1, force, at: pos }),
  });
  furin.group.position.set(1.5, VERANDA_H - 0.20, -0.15);
  veranda.add(furin.group);

  plantTree(scene, { x: -5.2, z: -4.7, height: 4.2 });

  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 9,
  keepout: [
  { at: veranda, r: 4.2 },
  { at: wakuan, r: 1.2 },
  { at: lantern, r: 0.9 },
  ],
  grassKeepout: [{ x: 0.2, z: -2.6, r: 3.2 }],
  
  
  forests: [
    { center: [-19, 0, -27], spread: 13, count: 55 },
    { center: [16, 0, -31], spread: 14, count: 40, color: wash(0.55) },
  ],
  mountains: [
    { count: 8, distance: 62, arcSpan: 3.6, color: wash(0.16), hScale: 0.65 },   // farthest band
    { count: 5, distance: 43, arcSpan: 2.4, color: wash(0.28), hScale: 0.65 },
  ]
  });

  const hit = new THREE.Mesh(
  new THREE.BoxGeometry(SW * 1.2, SH * 1.1, 0.3),
  new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'scroll-hit';
  scroll.add(hit);
  
  // ---- the moment: the ink will not take -------------------------------
  // THE WHOLE PORTRAIT DRAINS, not just a beard. The refusal used to be a
  // 0.34-unit cone of INK_LIT fading to 0.85 opacity under the painted chin,
  // on a scroll a few units across — invisible in practice, even looking
  // straight at it. It was a real
  // effect that nothing at reading distance could resolve.
  //
  // So the event became the one thing on the scroll that IS big enough to read:
  // its colour. The portrait is the case's accent, the only red on the page.
  // Touch it and the red runs out of it — the whole figure goes to ink, holds
  // there, and washes back to red. The beard still tries to come in while the
  // colour is out, which is what the draining was FOR, and it is gone by the
  // time the red returns. Nothing is achieved. He is still beardless.
  //
  // WRITE THE MATERIAL THAT IS ON THE MESH, NOT A REFERENCE CAPTURED AT BUILD
  // TIME. This is why the beard never appeared and why the first cut of the
  // drain did not either: touching the portrait visibly did nothing, twice
  // over.
  //
  // The bug, now historical: the debug workbench used to rebuild every lit
  // mesh's material as a plain Lambert on the shipped default, stashing the
  // authored one in a cache slot on the mesh and hanging a CLONE in its
  // place. So `beardMat.opacity = ...` and `paintMat.color = ...` —
  // references captured once at build time — were both writing to an object
  // that had been swapped off the mesh before a single frame was drawn.
  // Nothing failed; the effect simply rendered to nowhere, and it had been
  // doing that since the case was staged. Nothing rebuilds a material now
  // (see src/render/material.js), so this exact trap is gone — the loop
  // below still reads `m.material` fresh off each mesh rather than a
  // captured reference, which costs nothing and needs no caveat to justify
  // it.
  const paintedMeshes = [];
  painted.traverse((o) => { if (o.isMesh && o.name !== 'beard') paintedMeshes.push(o); });
  // INK_LIT, not INK: this is a lit surface, and raw INK reads as void once
  // lit rather than as the black it looks like unlit (see palette.js's own
  // comment on INK_LIT for the fuller argument, including what changed when
  // the toon ramp it was tuned under retired).
  const DRAIN = 0.85;          // the red runs out
  const OUT = 1.9;             // and stays out this long
  const BACK = 1.7;            // then washes back
  const STROKE = DRAIN + OUT + BACK;
  const RED = new THREE.Color(ACCENT);
  const BLACK = new THREE.Color(INK);
  // THE GLOW HAS TO DRAIN TOO. washMaterial gives any accent-family colour an
  // emissive of its own colour at SEAL_GLOW — that is what makes the reds in
  // this book carry — and emissive light does not care what the diffuse colour
  // says. So draining the diffuse alone left the portrait lit red from inside:
  // it went dark-ish and stayed warm, never fully black and never reading as
  // ink. Both halves move together now, and the target is raw INK rather than
  // INK_LIT because this is the one moment the case wants an actual hole in the
  // page.
  const GLOW = SEAL_GLOW;
  // 0 at rest and at the end, 1 while the portrait is drained
  function drainShape(u) {
  if (!(u >= 0) || u >= STROKE) return 0;
  if (u < DRAIN) { const t = u / DRAIN; return t * t * (3 - 2 * t); }
  if (u < DRAIN + OUT) return 1;
  const t = (u - DRAIN - OUT) / BACK;
  return 1 - t * t * (3 - 2 * t);
  }
  let camera = null;
  let clock = 0;
  let attempts = 0;
  let strokeAt = -99;
  
  input.onTap(() => {
  if (!camera) return;
  // the chime first, so a tap aimed at it never falls through to the
  // scroll's own refusal — same probe-then-return order as case 29
  const chimeHit = furin.pick(camera, input);
  if (chimeHit) { furin.ring(0.75, chimeHit.tube); return; }
  if (!input.raycastFirst(camera, [hit])) return;
  if (clock - strokeAt < STROKE) return;      // one refusal at a time
  strokeAt = clock;
  attempts++;
  audio && audio.chimeStrike({ tube: 2, force: 0.5, at: scroll.position });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  // a steady porch breeze — see k47's furin for the same untouched
  // default (this case has no flag or screen to derive a live level
  // from, so the chime reads the wind at its own full range, same as
  // every other static-wind case that carries one)
  furin.setWindLevel(1);
  furin.update(dt, simTime);
  // the red running out of him, and coming back
  const drained = drainShape(clock - strokeAt);
  for (const m of paintedMeshes) {
  m.material.color.copy(RED).lerp(BLACK, drained);
  if (m.material.emissive) {
  m.material.emissive.copy(RED).multiplyScalar(1 - drained);
  m.material.emissiveIntensity = GLOW;
  }
  }
  // and the beard, which only exists while the ink is out of the picture
  // — up fast, and gone before the colour returns
  const u = (clock - strokeAt) / STROKE;
  const a = (u <= 0 || u >= 1) ? 0 : Math.min(1, u / 0.18, (1 - u) / 0.45);
  beard.material.transparent = true;
  beard.material.opacity = 0.85 * a * a * (3 - 2 * a);
  beard.scale.y = 0.6 + 0.4 * a;
  },
  fragment() {
  return {
  attempts,
  drained: +drainShape(clock - strokeAt).toFixed(3),
  ink: +beard.material.opacity.toFixed(3),
  chimeStrikes: furin.strikes(),
};
  },
  dispose() {},
};
  },
};
