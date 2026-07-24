import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { WASH } from '../palette.js';

// Koi, for the ponds — the thing that turns a flat pale disc into water. A
// still surface reads as a platform however you tint it; a shape moving under
// it reads as a pool at once, so the fish are doing the water's work.
//
// Reusable: any scene with a surface can drop a school in. The default tone is
// ink wash (a sumi-e koi is a brush shape, not a spot of orange), but a scene
// whose seal IS the fish can pass an accent colour.
//
// Each koi swims a closed form over the simTime handed to update() — a seeded
// ellipse at a shallow depth, the body yawed along its own tangent, the tail
// beating. Nothing is stored between frames and no Math.random is used, so the
// same pond holds the same fish every run. The group sits at the water's
// SURFACE; the fish hang just beneath it.

export function makeKoi({
  count = 3,
  seed = 30,
  length = 0.95,
  color = WASH.mid,
  radius = 2.0,
  depth = 0.13,
  // Optional: the water's own heightAt(x, z). Given one, the fish ride the
  // surface — a ripple crossing the pond lifts whatever is under it, which is
  // what ties the school to the water instead of leaving it swimming in a
  // separate layer. Any surface with a height field can pass this.
  surfaceAt = null,
} = {}) {
  const g = new THREE.Group();
  g.name = 'koi';
  const L = length;
  const mat = toonMaterial({ color, flat: true });

  const fish = [];
  for (let i = 0; i < count; i++) {
    const f = new THREE.Group();
    f.name = 'fish';

    // the body: a tapered ellipsoid, nose along +x. Scaled from a sphere so it
    // stays one cheap mesh; the taper comes from the tail fin behind it.
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat);
    body.name = 'koi-body';
    body.scale.set(L * 0.5, L * 0.15, L * 0.24);
    f.add(body);

    // the caudal fin: a flat triangle fan hinged at the tail root, so it can
    // beat side to side. Pointed toward the body, flaring out behind.
    const tail = new THREE.Group();
    tail.name = 'koi-tail';
    tail.position.x = -L * 0.24;
    const finGeo = new THREE.ConeGeometry(L * 0.18, L * 0.34, 3);
    finGeo.rotateZ(Math.PI / 2);          // apex toward +x (the body), base trailing -x
    finGeo.scale(1, 1, 0.28);             // flatten to a fin, upright in the water
    const fin = new THREE.Mesh(finGeo, mat);
    fin.name = 'koi-fin';
    fin.position.x = -L * 0.15;
    tail.add(fin);
    f.add(tail);

    g.add(f);
    fish.push({
      group: f, tail,
      phase: hash1(i * 4 + 1, seed) * Math.PI * 2,
      rx: radius * (0.55 + hash1(i * 4 + 2, seed) * 0.4),
      rz: radius * (0.45 + hash1(i * 4 + 3, seed) * 0.4),
      rate: 0.16 + hash1(i * 4 + 4, seed) * 0.14,
      dir: hash1(i * 4 + 5, seed) < 0.4 ? -1 : 1,
      beat: 4.5 + hash1(i * 4 + 6, seed) * 3,
      cx: (hash1(i * 4 + 7, seed) - 0.5) * radius * 0.4,
      cz: (hash1(i * 4 + 8, seed) - 0.5) * radius * 0.4,
    });
  }

  let clock = 0;

  function pose() {
    for (const k of fish) {
      const a = k.phase + clock * k.rate * k.dir;
      const x = k.cx + Math.cos(a) * k.rx;
      const z = k.cz + Math.sin(a) * k.rz;
      let y = -depth + Math.sin(clock * 0.6 + k.phase) * 0.02;
      // ride the water overhead, damped — a fish a hand's depth down feels a
      // ripple, it does not match it
      if (surfaceAt) y += surfaceAt(x, z) * 0.55;
      k.group.position.set(x, y, z);
      // face along the tangent of the ellipse it is swimming
      const vx = -k.rx * Math.sin(a) * k.dir;
      const vz = k.rz * Math.cos(a) * k.dir;
      k.group.rotation.y = Math.atan2(-vz, vx);
      // the tail beats, and the body banks a little into its turns
      k.tail.rotation.y = Math.sin(clock * k.beat + k.phase) * 0.5;
      k.group.rotation.z = Math.sin(clock * k.beat * 0.5 + k.phase) * 0.08;
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
