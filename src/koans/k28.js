import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, INK, mixHex, hexToRgb } from '../palette.js';
import { hash1 } from '../util/noise.js';
import { clamp01 } from '../util/math.js';
import {
  composeWorld, makePath, makeVeranda, makeLantern, makeMonk, aimMonk, faceMonk,
  makeLights, washMaterial, makeCylinderChime,
} from '../kit/index.js';

const ID = 28;

// Tokusan asks questions late into the night. Ryutan tells him the night is
// getting old. Tokusan bows, opens the screen, says it is very dark outside,
// and is handed a lighted candle — and just as he takes it, Ryutan blows it
// out. At that moment his mind was opened.
//
// This is the only case in the book that goes dark, and everything about it is
// built for that one second: it is staged at night to begin with, so the paper
// is already dim, and the light is a single lantern flame. Blow it out and the
// page goes to ink, and then the stars come up — which were there the whole
// time and could not be seen while the little light was burning.
//
// Blow it out again and it relights; nothing here is a one-way door. AND IT
// RELIGHTS ITSELF after a few seconds — the dark is a held breath, not a state
// the page settles into. It also means a reader who taps once and reads on gets
// the whole event, arrival and departure, without having to know to tap again.
//
// (The design doc's microphone is not wired in tonight — the tap is the whole
// interaction, and it was never meant to be the lesser option.)

const NIGHT = mixHex(PAPER, INK, 0.38);     // the page at this hour
const DARK = mixHex(PAPER, INK, 0.93);      // and with the candle out
const FADE = 1.5;                            // seconds to fall dark, and to come back
// Seconds from the breath to the wick catching again, measured from the tap and
// not from the moment it is fully dark — so of these five the page spends the
// first 1.5 going out, about 3.5 in full dark under the stars, and then FADE
// more coming back with the stars still up for most of it. A tap of any kind
// cancels it: a reader who lights it by hand is not overruled two seconds
// later, and one who blows it out again gets a fresh five.
const RELIGHT = 5.0;
// The recipe's own wind level, hoisted (k47's idiom) because the blow-out now
// drives it live: the candle is blown out BY the wind, so while the page is
// dark the bed swells above its resting level and settles back as the wick
// catches. k19/k20's setWindLevel idiom — an absolute level per frame, which
// the next page's ambience transition ramps away from on its own.
const BASE_WIND = 0.12;
const WIND_SWELL = 0.7;      // fraction above BASE_WIND at full dark

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 9.6, target: [0.3, 1.2, -1.2], heading: 34, pitch: 23 };
  export default {
  id: ID,
  slug: 'blow-out-the-candle',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // 'cylinder' names the single bronze hung under Ryutan's own veranda —
  // late as it is, a hall someone actually lives in still carries this one
  // small everyday sound; a lone deep voice, occasional and quiet, suits the
  // night's hush far better than a chattering cluster would.
  ambience: ['wind:' + BASE_WIND, 'flame', 'cylinder', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  const bg = new THREE.Color(NIGHT);
  scene.background = bg;
  scene.fog = new THREE.FogExp2(NIGHT, 0.042);
  const lights = makeLights();
  scene.add(lights);
  
  const path = makePath({ from: [4.2, 8.0], to: [-2.0, -27], width: 1.3, seed: ID, groundSeed: 21, wander: 2.9 });
  scene.add(path);
  
  // Ryutan's veranda, with the screen standing open
  const veranda = makeVeranda({ width: 4.4, depth: 3.6, height: 3.0 });
  veranda.position.set(-2.1, 0, -3.8);
  veranda.rotation.y = 0.22;
  scene.add(veranda);
  
  // RYUTAN, inside on the boards, who is about to do this
  const ryutan = makeMonk({ height: 1.6, pose: 'sit', elder: true });
  ryutan.position.set(-2.8, 0.34, -2.0);
  scene.add(ryutan);
  
  // TOKUSAN, on the step, hand out, having just been given the light
  const tokusan = makeMonk({ height: 1.62, pose: 'point' });
  tokusan.position.set(1.5, 0, -0.6);
  aimMonk(tokusan, ryutan.position);
  scene.add(tokusan);
  faceMonk(ryutan, tokusan.position);
  
  // THE LANTERN, between them, and the flame in it — the only light in the
  // book that anything depends on. The firebox is a real open chamber now
  // (see lantern.js), turned so a face — not a corner pillar — meets the
  // home camera: the rig puts the camera at bearing atan2(4.64, 8.43) ≈ 0.50
  // from the lantern, so this rotation aims the opening straight down that
  // sight-line and the candle inside is plainly visible.
  const lantern = makeLantern({ height: 1.15 });
  lantern.position.set(-.8, .3, -1.7);
  lantern.rotation.y = 0.5;
  scene.add(lantern);
  const candle = lantern.getObjectByName('candle');
  
  const flameMat = washMaterial({ color: ACCENT, flat: true });
  flameMat.transparent = true;
  flameMat.fog = false;                    // a flame is not dimmed by distance
  if (flameMat.emissive) { flameMat.emissive = new THREE.Color(ACCENT); flameMat.emissiveIntensity = 1.0; }
  // a soft teardrop, not a cone — a lathe whose belly swells just above the
  // wick and whose tip is pulled up and rounded off, the shape a still flame
  // holds
  const flameProfile = [
  [0, 0], [0.050, 0.028], [0.072, 0.072], [0.060, 0.122],
  [0.032, 0.164], [0.010, 0.196], [0, 0.21],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const flameGeo = new THREE.LatheGeometry(flameProfile, 8);
  flameGeo.translate(0, -0.10, 0);         // keep the old cone's centre so nothing re-frames
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.name = 'flame';
  flame.position.set(-.8, 1.0, -1.7);     // base at 0.68 — the kit candle's tip
  scene.add(flame);
  
  // THE GLOW — the bright red light in the box. A radial falloff built as a
  // DataTexture (canvas-free, so build() still runs under plain Node in the
  // tests), on an additive sprite behind the flame: over the night tone it
  // reads as light spilling from the chamber, and being depth-tested it is
  // clipped by the pillars and roof exactly the way real spill would be. No
  // PointLight — the book washes, it does not cast.
  const GLOW_TEX_SIZE = 32;
  const glowPx = new Uint8Array(GLOW_TEX_SIZE * GLOW_TEX_SIZE * 4);
  const [gr, gg, gb] = hexToRgb(mixHex(ACCENT, PAPER, 0.30));
  for (let i = 0; i < GLOW_TEX_SIZE * GLOW_TEX_SIZE; i++) {
  const gx = ((i % GLOW_TEX_SIZE) + 0.5) / GLOW_TEX_SIZE - 0.5;
  const gy = (Math.floor(i / GLOW_TEX_SIZE) + 0.5) / GLOW_TEX_SIZE - 0.5;
  const r = Math.min(1, Math.hypot(gx, gy) * 2);
  const a = (1 - r) * (1 - r);           // soft core, zero at the rim
  glowPx[i * 4] = gr; glowPx[i * 4 + 1] = gg; glowPx[i * 4 + 2] = gb;
  glowPx[i * 4 + 3] = Math.round(255 * a);
  }
  const glowTex = new THREE.DataTexture(glowPx, GLOW_TEX_SIZE, GLOW_TEX_SIZE);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  glowTex.needsUpdate = true;
  const glowMat = new THREE.SpriteMaterial({
  map: glowTex,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.name = 'flame-glow';
  glow.position.copy(flame.position);
  glow.scale.set(0.7, 0.7, 1);
  scene.add(glow);
  
  // ---- THE STARS --------------------------------------------------------
  // Present from the first frame, at zero opacity. They are not created when
  // the candle goes out; they are revealed, which is the entire point of the
  // case and the reason they are built here rather than in the handler.
  const starGeo = new THREE.BufferGeometry();
  const N = 220;
  const sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
  // an even shell overhead, biased above the horizon
  const u = hash1(i * 3 + 1, ID);
  const v = hash1(i * 3 + 2, ID);
  const theta = u * Math.PI * 2;
  const phi = Math.acos(1 - v * 0.72);            // 0 = straight up
  const R = 70;
  sp[i * 3] = R * Math.sin(phi) * Math.cos(theta);
  sp[i * 3 + 1] = R * Math.cos(phi) + 6;
  sp[i * 3 + 2] = R * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({
  color: new THREE.Color(PAPER),
  size: 0.55,
  sizeAttenuation: true,
  fog: false,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.name = 'stars';
  stars.frustumCulled = false;
  scene.add(stars);
  
  // One bronze cylinder hung in the veranda's own corner bay — the far end
  // from Ryutan and Tokusan, so it never competes with the candle for
  // attention, and hugging the end post (x=-1.95, clear of it by 0.25)
  // rather than sitting centred under the beam the way this pass's other
  // eave chimes do. Local to the veranda group (case 29's idiom).
  const nightChime = makeCylinderChime({
  size: 0.85, seed: 28,
  onStrike: (note, force, pos) => audio && audio.cylinderStrike({ note, force, at: pos }),
  });
  nightChime.group.position.set(-1.65, 2.8, -0.15);
  veranda.add(nightChime.group);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 4,
  keepout: [
  ...path.keepout(24, 1.1),
  { at: veranda, r: 3.6 },
  { at: tokusan, r: 1.2 },
  { x: 0.5, z: -1.7, r: 0.9 },
  ],
  grassKeepout: [
  ...path.keepout(24, 0.95),
  { x: -1.8, z: -2.8, r: 2.9 },
  ],
  });

  // THE WHOLE LANTERN IS THE TARGET — anywhere on it should work, with real
  // leeway. The old cylinder was half the size AND stranded at x 0.5 — the
  // lantern moved to -0.8 in a retune and its hit volume stayed behind, so the
  // only working taps were dead-on hits on the flame and candle meshes: exactly
  // the "little spot" he was fighting. Sized to take in the lantern body, its
  // roof and the flame above it, and placed ON the lantern this time.
  const hit = new THREE.Mesh(
  new THREE.CylinderGeometry(0.75, 0.75, 2.0, 7),
  new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'flame-hit';
  hit.position.set(-0.8, 0.9, -1.7);
  scene.add(hit);
  
  // ---- the moment: blow it out ------------------------------------------
  const lightRigs = [];
  lights.traverse((o) => { if (o.isLight) lightRigs.push([o, o.intensity]); });
  
  const nightC = new THREE.Color(NIGHT);
  const darkC = new THREE.Color(DARK);
  
  let camera = null;
  let clock = 0;
  let lit = true;
  let changedAt = -99;
  let blows = 0;
  let relights = 0;        // times it came back on its own, unasked
  let relightAt = null;    // when it will, or null if nothing is pending

  // one place the wick catches, so the hand and the clock light it identically
  const light = () => {
    lit = true;
    changedAt = clock;
    relightAt = null;
    audio && audio.chimeStrike({ tube: 4, force: 0.5, at: flame.position });
  };
  
  input.onTap(() => {
  if (!camera) return;
  // the night chime first: it hangs well clear of the candle's own
  // generous hit cylinder, but probed and returned on regardless, same
  // ordering every case with more than one voice uses
  if (nightChime.pick(camera, input)) { nightChime.ring(0.75); return; }
  // the generous invisible cylinder is still the real target (a flame is
  // a sliver to hit on a phone), but the flame and the kit's candle are
  // listed too so a dead-on tap works even if the cylinder ever moves
  if (!input.raycastFirst(camera, [hit, flame, candle])) return;
  blows++;
  // out is a breath — audibly one, now: the little knock this shipped with read
  // as a latch, not a puff. The swish voice used elsewhere is what a candle
  // going out actually sounds like. Lit again is the smallest bell in the set.
  if (lit) {
  lit = false;
  changedAt = clock;
  relightAt = clock + RELIGHT;    // it will come back on its own
  audio && audio.breath({ force: 0.7, at: flame.position });
  } else {
  light();                        // ...unless the reader beats the clock to it
  }
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  nightChime.setWindLevel(1);    // a still night, but see k47's furin
  nightChime.update(dt, simTime);

  // the wick catches again by itself. Guarded on `!lit` as well as the
  // clock so a pending relight can never fire on an already-burning
  // candle — the tap clears it, but a guard here costs nothing and is
  // what makes that a belt-and-braces rather than a load-bearing one.
  if (relightAt !== null && !lit && clock >= relightAt) { relights++; light(); }
  
  // 0 = the lamp is burning, 1 = it is out and the sky has arrived
  const k = clamp01((clock - changedAt) / FADE);
  const eased = k * k * (3 - 2 * k);
  const dark = lit ? 1 - eased : eased;
  const d = dark * dark * (3 - 2 * dark);
  
  bg.copy(nightC).lerp(darkC, d);
  scene.fog.color.copy(bg);
  for (const [l, base] of lightRigs) l.intensity = base * (1 - 0.62 * d);
  starMat.opacity = 0.92 * d;
  // the wind that blew it out: the bed swells with the dark and settles
  // with the relight, riding the same eased curve as everything else
  audio && audio.setWindLevel(BASE_WIND * (1 + WIND_SWELL * d));
  
  // the flame itself: it flickers while it burns, and is simply not
  // there once it is out
  const alive = 1 - d;
  flameMat.opacity = alive;
  flame.visible = alive > 0.01;
  const flick = 1 + Math.sin(clock * 11.3) * 0.10 + Math.sin(clock * 6.7 + 1.4) * 0.06;
  flame.scale.set(alive * flick, alive * (0.9 + flick * 0.15), alive * flick);
  
  // the glow breathes with the same flicker and dies with the flame
  glow.visible = flame.visible;
  glowMat.opacity = alive * (0.85 + (flick - 1) * 0.5);
  const gs = 0.7 * alive * flick;
  glow.scale.set(gs, gs, 1);
  },
  fragment() {
  return {
  blows,
  lit,
  relights,
  dark: +(starMat.opacity / 0.92).toFixed(3),
  chimeStrikes: nightChime.strikes(),
};
      },
      // the glow sprite sits outside the mesh graph the scene manager's
      // disposeRoot walks (same caveat showcase.js documents), so its texture
      // and material are released here by hand
      dispose() { glowTex.dispose(); glowMat.dispose(); },
    };
  },
};
