import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH, INK_LIT } from '../palette.js';
import {
  composeWorld, makeVeranda, makeMonk, aimMonk, makeLantern,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 4;

// Wakuan looks at a painting of Bodhidharma — who every painter in China gave
// an enormous beard — and complains that the fellow hasn't got one.
//
// So the scene is the painting, hung in a veranda bay where a scroll would
// actually hang, and the man standing in front of it being annoyed. The
// portrait is genuinely beardless. Try to put one on it and the ink will not
// take: the stroke gathers, hangs there a moment, and drains back off the
// silk. You cannot add what the picture is refusing to be.
export default {
  id: ID,
  slug: 'a-beardless-foreigner',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.14', 'scroll', 'music'],
  camera: { distance: 9.0, target: [0.4, 1.7, -1.4], azimuth: 0.42, polar: 1.30 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // the bay the scroll hangs in
    const veranda = makeVeranda({ width: 4.6, depth: 3.6, height: 3.2 });
    veranda.position.set(0.2, 0, -3.4);
    scene.add(veranda);

    // ---- THE SCROLL -------------------------------------------------------
    // A kakemono: two rollers and a hanging field of silk, with the portrait
    // painted on it. Everything is flattened in z, because it IS a picture.
    const scroll = new THREE.Group();
    scroll.name = 'scroll';

    const SW = 1.15, SH = 2.0;
    const silk = new THREE.Mesh(
      new THREE.PlaneGeometry(SW, SH),
      toonMaterial({ color: WASH.mist, flat: true }));
    silk.name = 'silk';
    silk.userData.noOutline = true;      // a hung sheet has no hull to outline
    scroll.add(silk);

    for (const sy of [-1, 1]) {
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, SW * 1.12, 7),
        toonMaterial({ color: WASH.dark, flat: true }));
      rod.name = 'rod';
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, sy * SH / 2, -0.01);
      scroll.add(rod);
    }

    // The painted Bodhidharma: a hooded mass and a bare face, standing a hair
    // proud of the silk. Famously bearded everywhere else; not here. Painted
    // in the case's red, not ink (Frank: "make the whole image — the painting
    // of Bodhidharma on the thing — red instead of black"): the portrait IS
    // this koan's seal, so the little collector's-seal square it used to
    // carry is gone with the same stroke — one red thing, and it is him.
    const paintMat = toonMaterial({ color: ACCENT, flat: true });
    const painted = new THREE.Group();
    painted.name = 'painted';
    painted.position.set(0, -0.12, 0.03);

    const robeProfile = [
      [0.02, 0.00], [0.34, 0.00], [0.30, 0.24], [0.24, 0.52],
      [0.20, 0.70], [0.22, 0.80], [0.10, 0.86],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const robe = new THREE.Mesh(new THREE.LatheGeometry(robeProfile, 9), paintMat);
    robe.name = 'robe';
    robe.position.y = -0.62;
    robe.scale.z = 0.30;                 // pressed flat: it is paint, not a man
    painted.add(robe);

    const face = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 9), paintMat);
    face.name = 'face';
    face.position.y = 0.30;
    face.scale.z = 0.32;
    painted.add(face);

    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), paintMat);
    hood.name = 'hood';
    hood.position.y = 0.315;
    hood.scale.z = 0.34;
    painted.add(hood);
    scroll.add(painted);

    // THE BEARD THAT WILL NOT TAKE. Present from the start and invisible; a
    // tap gathers it and it drains away again. Never outlined — an outline
    // would draw a hard edge round something that is meant to be wet ink.
    const beardMat = toonMaterial({ color: INK_LIT, flat: true });
    beardMat.transparent = true;
    beardMat.opacity = 0;
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.34, 7), beardMat);
    beard.name = 'beard';
    beard.userData.noOutline = true;
    beard.rotation.x = Math.PI;          // point down, off the chin
    beard.position.set(0, 0.06, 0.04);
    beard.scale.z = 0.4;
    painted.add(beard);

    scroll.position.set(0.2, 1.95, -3.34);
    scene.add(scroll);

    // Wakuan, in front of it, complaining
    const wakuan = makeMonk({ height: 1.66, pose: 'point' });
    wakuan.position.set(1.5, 0, 0.3);
    aimMonk(wakuan, scroll.position);
    scene.add(wakuan);

    const lantern = makeLantern({ height: 1.1 });
    lantern.position.set(-2.9, 0, -0.4);
    scene.add(lantern);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        { at: veranda, r: 4.2 },
        { at: wakuan, r: 1.2 },
        { at: lantern, r: 0.9 },
      ],
      grassKeepout: [{ x: 0.2, z: -2.6, r: 3.2 }],
    });

    for (const [p, rx, rz, op] of [
      [wakuan.position, 0.68, 0.52, 0.42],
      [veranda.position, 2.6, 2.0, 0.28],
      [lantern.position, 0.38, 0.3, 0.34],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.030, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(SW * 1.2, SH * 1.1, 0.3),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'scroll-hit';
    hit.userData.noOutline = true;
    scroll.add(hit);

    // ---- the moment: the ink will not take -------------------------------
    const STROKE = 2.2;          // gather, hang, drain
    let camera = null;
    let clock = 0;
    let attempts = 0;
    let strokeAt = -99;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      if (clock - strokeAt < STROKE) return;      // one refusal at a time
      strokeAt = clock;
      attempts++;
      audio && audio.chimeStrike({ tube: 2, force: 0.4, at: scroll.position });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        const u = (clock - strokeAt) / STROKE;
        // up fast, held a moment, then drained away
        const a = (u <= 0 || u >= 1) ? 0 : Math.min(1, u / 0.18, (1 - u) / 0.45);
        beardMat.opacity = 0.85 * a * a * (3 - 2 * a);
        beard.scale.y = 0.6 + 0.4 * a;
      },
      fragment() {
        return { attempts, ink: +beardMat.opacity.toFixed(3) };
      },
      dispose() {},
    };
  },
};
