import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, INK, mixHex, hexToRgb } from '../palette.js';
import { hash1 } from '../util/noise.js';
import {
  composeWorld, makePath, makeVeranda, makeLantern, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
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
// Blow it out again and it relights; nothing here is a one-way door.
//
// (The design doc's microphone is not wired in tonight — the tap is the whole
// interaction, and it was never meant to be the lesser option.)

const NIGHT = mixHex(PAPER, INK, 0.38);     // the page at this hour
const DARK = mixHex(PAPER, INK, 0.93);      // and with the candle out
const FADE = 1.5;                            // seconds to fall dark, and to come back
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default {
  id: ID,
  slug: 'blow-out-the-candle',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.12', 'flame', 'music'],
  camera: { distance: 9.6, target: [0.6, 1.5, -1.2], azimuth: 0.52, polar: 1.26 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    const bg = new THREE.Color(NIGHT);
    scene.background = bg;
    scene.fog = new THREE.FogExp2(NIGHT, 0.042);
    const lights = makeLights();
    scene.add(lights);

    const path = makePath({ from: [4.2, 8.0], to: [-2.0, -17], width: 1.3, seed: ID, groundSeed: 21, wander: 0.9 });
    scene.add(path);

    // Ryutan's veranda, with the screen standing open
    const veranda = makeVeranda({ width: 4.4, depth: 3.6, height: 3.0 });
    veranda.position.set(-0.8, 0, -3.8);
    veranda.rotation.y = 0.22;
    scene.add(veranda);

    // RYUTAN, inside on the boards, who is about to do this
    const ryutan = makeMonk({ height: 1.6, pose: 'sit', elder: true });
    ryutan.position.set(-1.4, 0.34, -3.0);
    scene.add(ryutan);

    // TOKUSAN, on the step, hand out, having just been given the light
    const tokusan = makeMonk({ height: 1.62, pose: 'point' });
    tokusan.position.set(1.5, 0, -0.6);
    aimMonk(tokusan, ryutan.position);
    scene.add(tokusan);
    aimMonk(ryutan, tokusan.position);

    // THE LANTERN, between them, and the flame in it — the only light in the
    // book that anything depends on. The firebox is a real open chamber now
    // (see lantern.js), turned so a face — not a corner pillar — meets the
    // home camera: the rig puts the camera at bearing atan2(4.64, 8.43) ≈ 0.50
    // from the lantern, so this rotation aims the opening straight down that
    // sight-line and the candle inside is plainly visible.
    const lantern = makeLantern({ height: 1.15 });
    lantern.position.set(0.5, 0, -1.7);
    lantern.rotation.y = 0.5;
    scene.add(lantern);
    const candle = lantern.getObjectByName('candle');

    const flameMat = toonMaterial({ color: ACCENT, flat: true });
    flameMat.transparent = true;
    flameMat.fog = false;                    // a flame is not dimmed by distance
    if (flameMat.emissive) { flameMat.emissive = new THREE.Color(ACCENT); flameMat.emissiveIntensity = 1.0; }
    // a soft teardrop, not a cone (Frank, round 2: "the flame is like a weird
    // triangle or cone") — a lathe whose belly swells just above the wick and
    // whose tip is pulled up and rounded off, the shape a still flame holds
    const flameProfile = [
      [0, 0], [0.050, 0.028], [0.072, 0.072], [0.060, 0.122],
      [0.032, 0.164], [0.010, 0.196], [0, 0.21],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const flameGeo = new THREE.LatheGeometry(flameProfile, 8);
    flameGeo.translate(0, -0.10, 0);         // keep the old cone's centre so nothing re-frames
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.name = 'flame';
    flame.userData.noOutline = true;
    flame.position.set(0.5, 0.78, -1.7);     // base at 0.68 — the kit candle's tip
    scene.add(flame);

    // THE GLOW — the bright red light Frank asked to see in the box. A radial
    // falloff built as a DataTexture (canvas-free, so build() still runs under
    // plain Node in the tests), on an additive sprite behind the flame: over
    // the night tone it reads as light spilling from the chamber, and being
    // depth-tested it is clipped by the pillars and roof exactly the way real
    // spill would be. No PointLight — the book washes, it does not cast.
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
    stars.userData.noOutline = true;
    stars.frustumCulled = false;
    scene.add(stars);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.1),
        { x: -0.8, z: -3.8, r: 3.6 },
        { x: 1.5, z: -0.6, r: 1.2 },
        { x: 0.5, z: -1.7, r: 0.9 },
      ],
      grassKeepout: [
        ...path.keepout(24, 0.95),
        { x: -0.8, z: -3.2, r: 2.6 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [tokusan.position, 0.66, 0.5, 0.42],
      [veranda.position, 2.4, 1.9, 0.28],
      [lantern.position, 0.4, 0.32, 0.34],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.6, 7),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'flame-hit';
    hit.userData.noOutline = true;
    hit.position.set(0.5, 0.8, -1.7);
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

    input.onTap(() => {
      if (!camera) return;
      // the generous invisible cylinder is still the real target (a flame is
      // a sliver to hit on a phone), but the flame and the kit's candle are
      // listed too so a dead-on tap works even if the cylinder ever moves
      if (!input.raycastFirst(camera, [hit, flame, candle])) return;
      lit = !lit;
      changedAt = clock;
      blows++;
      // out is a breath; lit again is the smallest bell in the set
      if (lit) audio && audio.chimeStrike({ tube: 4, force: 0.5 });
      else audio && audio.knock({ force: 0.22 });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);

        // 0 = the lamp is burning, 1 = it is out and the sky has arrived
        const k = clamp01((clock - changedAt) / FADE);
        const eased = k * k * (3 - 2 * k);
        const dark = lit ? 1 - eased : eased;
        const d = dark * dark * (3 - 2 * dark);

        bg.copy(nightC).lerp(darkC, d);
        scene.fog.color.copy(bg);
        for (const [l, base] of lightRigs) l.intensity = base * (1 - 0.62 * d);
        starMat.opacity = 0.92 * d;

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
          dark: +(starMat.opacity / 0.92).toFixed(3),
        };
      },
      // the glow sprite sits outside the mesh graph the scene manager's
      // disposeRoot walks (same caveat showcase.js documents), so its texture
      // and material are released here by hand
      dispose() { glowTex.dispose(); glowMat.dispose(); },
    };
  },
};
