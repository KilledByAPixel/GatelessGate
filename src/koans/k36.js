import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeMonk, faceMonk, makePine,
  makeHorse, makeBundle,
  makeLights, addOutlines,
} from '../kit/index.js';

const ID = 36;

// "When you meet a Zen master on the road you cannot talk to him, you cannot
// face him with silence. What are you going to do?"
//
// THE MEETING ITSELF, held still. The two of them stand on the road facing
// each other, and the traveller is bowing.
//
// An earlier pass had them walking past one another — the meeting missed,
// both of them carrying on into the fog. Frank pulled it because case 35, one
// page back, is already two figures walking a road: two walking scenes in a
// row read as the same scene twice, whatever they mean. Standing is also the
// better answer to the question. The bow is the one response the koan does
// not take away from you: it is not talk and it is not silence, and it
// settles nothing — which is why he can hold it and the master can stand
// there unmoved and the case is still open.
//
// Both are solid ink. An earlier pass ghosted the master to half-opacity and
// Frank pulled that too: he is not a spirit (case 35 is the one about souls),
// he is a man standing in the road in front of you.

const MASTER_T = 0.42;    // where each of them stands along the road
const TRAV_T = 0.345;     // the traveller nearer the lens, the master up the road
                          // — about two metres apart, a bowing distance
const LANE = 0.30;        // a little to his own side, so the pair is not a mirror
const GEAR_T = 0.50;      // the roadside gear, just past the meeting and beyond it

// The bow. A held one, with breath in it, rather than a gesture that plays
// and finishes: this is a diorama, and a man who bows and straightens on a
// loop reads as a machine. `BOW_DEEP` is what a tap adds on top, easing away
// over a few seconds.
const BOW_REST = 0.62;    // radians at the waist — a formal standing bow, not a nod
const BOW_BREATH = 0.035;
const BOW_DEEP = 0.36;
const DEEP_TAU = 1.9;     // seconds for a deepened bow to ease back to the held one

export default {
  id: ID,
  slug: 'meeting-a-zen-master-on-the-road',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.24', 'music'],
  // ACROSS the meeting, not along it. Two people meeting on a road stand
  // along the road facing each other, so the book's usual bearing — looking
  // down the road — put the camera within a few degrees of their shared axis
  // and they simply overlapped, one hat behind another. Swung round and
  // lowered until the line between them runs across the frame and the bow
  // reads as a bend at the waist rather than a hat seen from above.
  camera: { distance: 8.6, target: [1.38, 1.72, -2.18], azimuth: -0.38, polar: 1.30 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.032);
    scene.add(makeLights());

    // one road, running away into the fog in both directions
    const road = makePath({ from: [6.0, 7.0], to: [-5.5, -17], width: 1.6, seed: ID, groundSeed: 21, wander: 0.5 });
    scene.add(road);

    // YOU — or the traveller standing in for you — stopped in the road with
    // his staff planted, bowing. `pose: 'bow'` builds him upright and hinged
    // at the sash: makeFigure puts a group named 'waist' in the figure and
    // turning its rotation.x IS the bow, so the case plays the angle rather
    // than staging a man already bent double. The staff is parented to the
    // figure, not to the waist, so it stays planted while he bows over it.
    // Bare-headed, and the master keeps his hat. Two hatted monks at this
    // bearing were one silhouette twice, and a wide sedge brim seen from
    // slightly above hides the very thing this scene is: you could not tell
    // he was bowing. A man who takes his hat off to bow is also just what
    // happens on a road.
    const traveller = makeMonk({ height: 1.62, elder: true, hat: false, pose: 'bow' });
    const HERE = road.sample(TRAV_T);
    traveller.position.set(HERE.x + HERE.perp.x * LANE, 0, HERE.z + HERE.perp.z * LANE);
    scene.add(traveller);
    const waist = traveller.getObjectByName('waist');
    // the traveller's staff stays plain ink (Frank: the master is the seal,
    // not the staff)

    // THE MASTER, standing in the road in front of him, solid and RED — he is
    // the seal: the one you cannot face or not-face, the thing the whole case
    // is about. Nothing of him moves. Every other figure in this book that
    // stands still is still because the scene is quiet; he is still because
    // the bow does not reach him.
    const master = makeMonk({ height: 1.68, color: ACCENT });
    master.name = 'master';
    const THERE = road.sample(MASTER_T);
    master.position.set(THERE.x - THERE.perp.x * LANE, 0, THERE.z - THERE.perp.z * LANE);
    scene.add(master);

    // and they face each other — the whole staging, in two lines
    faceMonk(traveller, master.position);
    faceMonk(master, traveller.position);

    // a pine at the roadside, so the meeting has something to be measured
    // against. Moved well past the master and further out: at its old spot it
    // stood exactly between the two of them from the new bearing, and a tree
    // growing up the middle of a meeting is not a measure of anything.
    const pine = makePine({ height: 4.0, seed: ID });
    const PT = road.sample(0.66);
    pine.position.set(PT.x + PT.perp.x * 3.6, 0, PT.z + PT.perp.z * 3.6);
    scene.add(pine);

    // A third traveler stopped here — horse (k45's) standing loose across
    // the road from the pine, bundle (k23's) set down at the verge. The rest
    // gear says the road is LONG, that people break their journey on it, that
    // the meeting the koan asks about happens on an ordinary working road.
    //
    // Moved twice for the new bearing. It used to sit at the pine's own t,
    // which is now where the master stands — the bundle would have been a
    // metre from his feet. Pushed far down the road it went out of frame
    // entirely, which is worse than crowding: the props were paying draw calls
    // to be invisible. Here it stands just beyond the meeting on the far side,
    // filling the middle distance between the two men rather than standing
    // between them.
    const PP = road.sample(GEAR_T);
    const horse = makeHorse({ height: 1.5, seed: 36 });
    horse.group.position.set(PP.x + PP.perp.x * 2.4, 0, PP.z + PP.perp.z * 2.4);
    horse.group.rotation.y = PP.heading + 2.6;   // hip to the road, head away
    scene.add(horse.group);

    const bundle = makeBundle({ seed: 36 });
    bundle.group.position.set(PP.x + PP.perp.x * 1.35, 0, PP.z + PP.perp.z * 1.35);
    bundle.group.rotation.y = 0.9;
    scene.add(bundle.group);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...road.keepout(26, 1.5),
        // both of them, by where they actually STAND. This used to guard the
        // traveller's road sample alone, which was right when the two were
        // walking the whole road and neither had a spot of their own; now
        // they do, and the master had no keepout at all.
        { x: traveller.position.x, z: traveller.position.z, r: 1.3 },
        { x: master.position.x, z: master.position.z, r: 1.3 },
        { x: pine.position.x, z: pine.position.z, r: 1.5 },
        { at: horse.group, r: 1.7 },
        { at: bundle.group, r: 0.55 },
      ],
      grassKeepout: road.keepout(28, 1.0),
    });

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 2.0, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'master-hit';
    hit.userData.noOutline = true;
    hit.position.set(master.position.x, 1.0, master.position.z);
    scene.add(hit);

    // ---- the moment: the bow ------------------------------------------------
    // Nothing here travels. The only thing that moves in this scene is the
    // angle at one man's waist, and the whole case is in it: he bows, and the
    // bow is neither of the two things the koan forbids, and it changes
    // nothing. Touch the master and the traveller bows DEEPER — the one thing
    // you can do with an unanswerable meeting is offer more of the same — and
    // it eases back to the held bow within a few seconds, having settled
    // nothing. The master never responds; that is not an omission.
    let camera = null;
    let clock = 0;
    let reaches = 0;
    let deep = 0;            // 0..1, how much of BOW_DEEP is currently added

    // The angle, as a function of the clock and `deep` and nothing else — so
    // it can also be applied ONCE at build. A figure whose pose is only set by
    // the first update() renders its build pose on any first frame too short
    // to bank a full timestep, which on case 35 showed as a visible flicker.
    function applyBow() {
      if (!waist) return;
      waist.rotation.x = BOW_REST + Math.sin(clock * 0.55) * BOW_BREATH + deep * BOW_DEEP;
    }
    applyBow();

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      reaches++;
      deep = 1;
      audio && audio.chimeStrike({ tube: 3, force: 0.35, at: hit.position });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        horse.update(dt, simTime);   // the tail swishes; the rest of it waits
        bundle.update(dt, simTime);
        if (deep > 0) deep = Math.max(0, deep - Math.max(0, dt || 0) / DEEP_TAU);
        applyBow();
      },
      fragment() {
        return { reaches, bow: +(waist ? waist.rotation.x : 0).toFixed(4), deep: +deep.toFixed(3) };
      },
      dispose() {},
    };
  },
};
