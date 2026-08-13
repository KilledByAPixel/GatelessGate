import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { hash1 } from '../util/noise.js';
import { WASH } from '../palette.js';
import { mergeSimple } from './scatter.js';

// Koi, for the ponds — the thing that turns a flat pale disc into water. A
// still surface reads as a platform however you tint it; a shape moving under
// it reads as a pool at once, so the fish are doing the water's work.
//
// Reusable: any scene with a surface can drop a school in. The default tone is
// ink wash (a sumi-e koi is a brush shape, not a spot of orange), but a scene
// whose seal IS the fish can pass an accent colour.
//
// THE SHAPE. One continuous body per fish, not butted primitives — the old
// two-ellipsoid + cone build read as three disconnected lumps ("weird tadpole
// type things"). The body is lofted from elliptical cross-sections along a
// single profile: full head and shoulder a quarter of the way back, a long
// taper to a narrow caudal peduncle, then a wide flat caudal fan whose cap
// centre is pulled FORWARD so the trailing edge cuts a fork — the notch is
// what says "tail fin" from the top-down pond cameras. Three flat fin hints
// are merged into the same geometry (one draw call per fish): a dorsal
// triangle on the spine and a pair of swept-back pectorals at the shoulder,
// the pair being the mark that reads strongest from directly above.
//
// THE SWIM. A fish is a travelling wave, not a rigid pellet wagging: each
// update, every vertex is displaced sideways by amp(s) * sin(phase - s*WAVE),
// where s runs 0 at the nose to 1 at the tail tip. Amplitude grows ~quadratic
// in s — near zero at the head (a real fish keeps its head steady), maximal
// at the fan — and the -s*WAVE term makes the crest travel visibly backward
// along the body. Base positions are kept once and re-displaced from scratch
// each frame off the simTime clock, so nothing integrates and the same pond
// holds the same fish every run (phase comes from hash1, never Math.random).
//
// Each koi swims a closed seeded ellipse at a shallow depth, the body yawed
// along its own tangent — the steering is unchanged from the old build; only
// the flesh on it is new. The group sits at the water's SURFACE; the fish
// hang just beneath it.

// nose is at +NOSE_X * L in fish-local space, tail tip at NOSE_X - 1 (so the
// whole fish, fan included, spans exactly `length`)
const NOSE_X = 0.45;
// how many radians of wave the body holds nose-to-tail — enough that the
// crest is seen to travel, not so many the fish looks like an eel
const WAVE = 2.6;

// body profile: [x, halfWidth (z), halfHeight (y)] in units of L. Fullest at
// the shoulder a quarter back from the nose, pinched at the peduncle, then
// the fan: wide and flat, the widest z-extent on the whole fish, which is
// what separates "fish" from "tadpole" in a straight-down view.
const PROFILE = [
  [0.42, 0.044, 0.042],   // blunt snout — a koi's head is round, never sharp
  [0.36, 0.074, 0.066],
  [0.26, 0.092, 0.082],   // shoulder — the fullest station
  [0.12, 0.088, 0.078],
  [-0.03, 0.070, 0.064],
  [-0.16, 0.046, 0.046],
  [-0.26, 0.028, 0.026],  // caudal peduncle — the pinch before the fan
  [-0.32, 0.055, 0.024],  // fan root
  [-0.45, 0.110, 0.018],
  [-0.55, 0.155, 0.013],  // fan tips
];
const RING = 8;

function fishGeometry(L) {
  // ---- the lofted body ----------------------------------------------------
  const pos = [];
  pos.push(NOSE_X * L, 0, 0);                    // 0: nose point
  for (const [x, w, h] of PROFILE) {
    for (let j = 0; j < RING; j++) {
      const a = (j / RING) * Math.PI * 2;
      pos.push(x * L, Math.cos(a) * h * L, Math.sin(a) * w * L);
    }
  }
  // tail cap centre pulled forward of the fan tips: the trailing edge then
  // slopes from each tip in toward this point — a V notch, the fork
  pos.push(-0.44 * L, 0, 0);
  const tailC = pos.length / 3 - 1;

  const idx = [];
  for (let j = 0; j < RING; j++) idx.push(0, 1 + j, 1 + ((j + 1) % RING));
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const a = 1 + i * RING, b = a + RING;
    for (let j = 0; j < RING; j++) {
      const j2 = (j + 1) % RING;
      idx.push(a + j, b + j, a + j2, a + j2, b + j, b + j2);
    }
  }
  const last = 1 + (PROFILE.length - 1) * RING;
  for (let j = 0; j < RING; j++) idx.push(tailC, last + ((j + 1) % RING), last + j);

  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  body.setIndex(idx);
  body.computeVertexNormals();

  // ---- fin hints, all flat triangles merged into the same draw -----------
  const tri = (a, b, c) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c]), 3));
    g.computeVertexNormals();
    return g;
  };
  // dorsal: on the plane of symmetry, so it reads from either side unmirrored
  const dorsal = tri(
    [0.04 * L, 0.072 * L, 0], [-0.14 * L, 0.038 * L, 0], [-0.05 * L, 0.115 * L, 0],
  );
  // pectorals: a swept-back pair at the shoulder, tipped down and out — from
  // straight above they are the two little wings that instantly say koi
  const pect = (side) => tri(
    [0.20 * L, -0.018 * L, side * 0.050 * L],
    [0.11 * L, -0.024 * L, side * 0.042 * L],
    [0.02 * L, -0.048 * L, side * 0.130 * L],
  );
  return mergeSimple([body, dorsal, pect(1), pect(-1)]);
}

export function makeKoi({
  count = 3,
  seed = 30,
  length = 0.95,
  color = WASH.mid,
  radius = 2.0,
  depth = 0.13,
  // Where the school swims, in the group's local frame. The group itself
  // stays at the water's origin (surfaceAt samples in water coordinates, and
  // moving the group would shear the two apart) — the ORBITS move instead.
  // k39 uses this to keep the fish on the deep side of its gradient pond.
  center = [0, 0],
  // Optional: a height sampler in the water's own frame, (x, z, t?) => y.
  // Given one, the fish ride it — which ties the school to the water instead
  // of leaving it swimming in a separate layer. The pond cases pass the
  // water's swellAt (idle swell + drift, NO ripple term): a tap above the
  // school must not toss the fish, so the reader's ripples pass
  // over them and only the water's own breathing moves them. heightAt still
  // works here for a surface that SHOULD carry everything — the ocean boats
  // ride the full field for exactly that reason.
  surfaceAt = null,
  // How much of the surface's motion the fish take. 1 is right for a shallow
  // pond, where the water moves nearly as one column and a fish a hand's depth
  // down rises with the wave above it. Anything less makes the fish lag the
  // surface, which in a pond this shallow lets a dorsal fin cross it in a
  // trough — the fish must never surface unasked.
  ride = 1,
  // UNLIT, for a fish under a sheet you can only partly see through.
  //
  // A submerged koi is composited at (1 - opacity) of itself, so whatever
  // contrast it has left is already cut to a fraction before any shading gets
  // layered on top of it. A lit fish spends that thin fraction on shading
  // variation across its body rather than on being visible at all, and reads
  // as little more than the post pass's depth-ink outline — a fish-shaped
  // scratch with pond showing through it. (The old toon ramp made this worse
  // in a way this comment used to quantify — its fixed 0.31/0.63/1.0 bands
  // meant a fish landing on the wrong one nearly vanished outright. Lambert
  // shades continuously instead, so that exact arithmetic no longer applies;
  // re-deriving an equivalent number would need the fish's actual normal
  // distribution under the key light, which nothing here computes.) Unlit,
  // the same fish keeps its full value through the water and reads as what
  // it is: a paleness moving down there. It costs the shading, which nobody
  // can see under water anyway.
  unlit = false,
} = {}) {
  const g = new THREE.Group();
  g.name = 'koi';
  const L = length;
  // DoubleSide: the fin triangles are zero-thickness planes and washMaterial
  // defaults to FrontSide — a single-sided fin vanishes for half of every lap,
  // whenever the yaw swings its back face toward the camera. Shared by the
  // whole fish so body and fins keep one material identity.
  const mat = unlit
    ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    : washMaterial({ color, flat: true, side: THREE.DoubleSide });

  // One template geometry; each fish clones it (its vertices flex on its own
  // phase) but they all displace from this single shared base, with the wave
  // coordinate s and per-vertex amplitude precomputed once here.
  const template = fishGeometry(L);
  const base = template.attributes.position.array;
  const nV = template.attributes.position.count;
  const sArr = new Float32Array(nV);
  const ampArr = new Float32Array(nV);
  for (let v = 0; v < nV; v++) {
    const s = Math.min(1, Math.max(0, (NOSE_X * L - base[v * 3]) / L));
    sArr[v] = s;
    // near zero at the head, maximal at the fan — quadratic growth is what
    // sells a fish; uniform amplitude is what sells a tadpole
    ampArr[v] = L * (0.012 + 0.118 * s * s);
  }

  const fish = [];
  for (let i = 0; i < count; i++) {
    const f = new THREE.Group();
    f.name = 'fish';
    const mesh = new THREE.Mesh(template.clone(), mat);
    mesh.name = 'koi-body';
    // the wave displaces vertices past the rest pose; pad the culling sphere
    // so a fish at the frame's edge doesn't pop out mid-tailbeat
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.boundingSphere.radius += L * 0.15;
    f.add(mesh);
    g.add(f);
    fish.push({
      group: f,
      posAttr: mesh.geometry.attributes.position,
      phase: hash1(i * 4 + 1, seed) * Math.PI * 2,
      rx: radius * (0.55 + hash1(i * 4 + 2, seed) * 0.4),
      rz: radius * (0.45 + hash1(i * 4 + 3, seed) * 0.4),
      rate: 0.16 + hash1(i * 4 + 4, seed) * 0.14,
      dir: hash1(i * 4 + 5, seed) < 0.4 ? -1 : 1,
      beat: 4.5 + hash1(i * 4 + 6, seed) * 3,
      cx: center[0] + (hash1(i * 4 + 7, seed) - 0.5) * radius * 0.4,
      cz: center[1] + (hash1(i * 4 + 8, seed) - 0.5) * radius * 0.4,
    });
  }

  let clock = 0;

  function pose() {
    for (const k of fish) {
      const a = k.phase + clock * k.rate * k.dir;
      const x = k.cx + Math.cos(a) * k.rx;
      const z = k.cz + Math.sin(a) * k.rz;
      let y = -depth + Math.sin(clock * 0.6 + k.phase) * 0.02;
      // rise and fall with the water directly overhead
      // disabled ride for now, fish shouldnt move with water
      //if (surfaceAt) y += surfaceAt(x, z) * ride;
      k.group.position.set(x, y, z);
      // face along the tangent of the ellipse it is swimming
      const vx = -k.rx * Math.sin(a) * k.dir;
      const vz = k.rz * Math.cos(a) * k.dir;
      k.group.rotation.y = Math.atan2(-vz, vx);
      // the body banks a little into its turns
      k.group.rotation.z = Math.sin(clock * k.beat * 0.5 + k.phase) * 0.08;
      // the travelling wave: every vertex re-displaced from the shared base,
      // sideways only, on this fish's own beat. Flat shading derives normals
      // in the shader, so the position attribute is the only thing touched.
      const beatPhase = clock * k.beat + k.phase;
      const arr = k.posAttr.array;
      for (let v = 0; v < nV; v++) {
        arr[v * 3 + 2] = base[v * 3 + 2] + ampArr[v] * Math.sin(beatPhase - sArr[v] * WAVE);
      }
      k.posAttr.needsUpdate = true;
    }
  }
  pose();

  return {
    group: g,
    fishCount() { return fish.length; },
    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      pose();
    },
  };
}
