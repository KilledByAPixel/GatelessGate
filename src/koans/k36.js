import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeMonk, faceMonk, makePine,
  makeHorse, makeBundle,
  makeLights, } from '../kit/index.js';

const ID = 36;

// "When you meet a Zen master on the road you cannot talk to him, you cannot
// face him with silence. What are you going to do?"
//
// THE MEETING ITSELF, held still. The two of them stand on the road facing
// each other, and when you reach for the master the traveller bows.
//
// An earlier pass had them walking past one another — the meeting missed, both
// of them carrying on into the fog. It was pulled because case 35, one page
// back, is already two figures walking a road: two walking scenes in a row read
// as the same scene twice, whatever they mean. Standing is also the better
// answer to the question. The bow is the one response the koan does not take
// away from you: it is not talk and it is not silence, and it settles nothing —
// which is why he can offer it, and the master can stand there unmoved, and the
// case is still open.
//
// Both are solid ink. An earlier pass ghosted the master to half-opacity and
// that was pulled too: he is not a spirit (case 35 is the one about souls), he
// is a man standing in the road in front of you.

const MASTER_T = 0.42;    // where each of them stands along the road
const TRAV_T = 0.345;     // the traveller nearer the lens, the master up the road
                          // — about two metres apart, a bowing distance
const LANE = 0.30;        // a little to his own side, so the pair is not a mirror
const GEAR_T = 0.50;      // the roadside gear, just past the meeting and beyond it

// THE BOW IS THE READER'S, AND NOTHING ELSE ON THIS PAGE MOVES. He stands, and
// bows only when you reach for the master.
//
// Two earlier versions, both worth the record. It was a HELD bow first — the
// page opened on a man already bent, with breath in it and a deepening a tap
// added on top — on the argument that a diorama should show the composition
// rather than play a gesture, and that a man who bows and straightens on a loop
// reads as a machine. True, but it meant the reader never saw the one thing
// this scene is: he was already partly bent when the page opened, so the bow
// itself never happened in front of anyone. The second version had him arrive
// standing and bow once, on his own, a second after the page opened, and hold
// it — which fixed the seeing and left the whole gesture happening whether or
// not anybody was there for it.
//
// So it is a touch response now, and the machine objection is answered by the
// cooldown rather than by holding the pose: one bow per reach, refused until it
// finishes. Nothing loops, because nothing is on a clock but the reader.
//
// The shape is case 32's, which is the shape every bow in this book uses: down
// slowly, held a real moment, slower still coming up. Before that it was `deep
// = 1` on the tap frame and a linear decay — he snapped to the bottom in a
// single frame and then took two seconds to come up, so the going-down half,
// the half that IS the bow, never existed. Same fault the birds and the
// butterflies shipped and the same family as case 35's lean, all found in one
// pass: an envelope set to 1 by a touch has no attack. HOW DEEP, and it is
// tuned by eye rather than derived — these two numbers have moved three times
// and will move again, so nothing here or in the tests quotes a figure in
// degrees. What is worth keeping is why the FIRST value was wrong: 0.62 was the
// held pose's angle, and a held pose can get away with a shallow bend because
// the eye reads it as a posture. A movement you watch happen gets read by its
// depth instead, and the same angle looked like the start of something — a half
// bow rather than a bow.
const BOW = .5;         // radians at the waist at the bottom
// The breath RIDES the bow — scaled by how far down he is, so a man standing
// straight does not sway. At a fifth of a radian it is no longer a breath but a
// real settle, and it is UNSYNCHRONISED with the gesture: the bottom of the bow
// lands anywhere in BOW +- BOW_BREATH depending on where the sine happens to be
// when the reader taps. Two bows are therefore not quite the same size, which
// is deliberate — he is a man, not a mechanism — and is the reason a test can
// only ever check a range here.
const BOW_BREATH = 0.2;
const BOW_IN = 2.0;       // down, slowly
const BOW_HOLD = 1.6;     // and held down there
const BOW_OUT = 2.6;      // slower still coming up
const BOW_SPAN = BOW_IN + BOW_HOLD + BOW_OUT;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// How far into the bow he is, `u` seconds after the reach: 0 standing, 1 at the
// bottom. A pure function of the clock, so nothing accumulates and the pose can
// be applied at build.
function bowShape(u) {
  if (!(u >= 0) || u >= BOW_SPAN) return 0;
  if (u < BOW_IN) return smooth(u / BOW_IN);
  if (u < BOW_IN + BOW_HOLD) return 1;
  return 1 - smooth((u - BOW_IN - BOW_HOLD) / BOW_OUT);
}

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 8.6, target: [1.38, 1.35, -2.18], heading: -19.5, pitch: 20.5 };
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
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.032);
  scene.add(makeLights({ sun: { heading: 70, pitch: 45 } }));
  
  // one road, running away into the fog in both directions
  const road = makePath({ from: [6.0, 7.0], to: [-5.5, -17], width: 1.6, seed: ID, groundSeed: 21, wander: 0.5 });
  scene.add(road);
  
  // YOU — or the traveller standing in for you — stopped in the road with
  // his staff planted. `pose: 'bow'` builds him UPRIGHT and hinged at the
  // sash: makeFigure puts a group named 'waist' in the figure and turning its
  // rotation.x IS the bow, so the case plays the angle. He stands at that
  // hinge's zero and stays standing until the reader reaches for the master,
  // which is the whole of the interaction. The staff is parented to the
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
  // the traveller's staff stays plain ink: the master is the seal, not the staff
  
  // THE MASTER, standing in the road in front of him, solid and RED — he is the
  // seal: the one you cannot face or not-face, the thing the whole case is
  // about. He held perfectly still for a long time ("the bow does not reach
  // him") until a touched thing had to answer — so the REACH reaches him now: a
  // small tremor, gone in under a second, and then he is the unmoved man in the
  // road again. The bow still gets no answer; being touched is not being bowed
  // to.
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
  view: CAM,
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

  const hit = new THREE.Mesh(
  new THREE.CylinderGeometry(1.0, 1.0, 2.0, 8),
  new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'master-hit';
  hit.position.set(master.position.x, 1.0, master.position.z);
  scene.add(hit);
  
  // ---- the moment: the bow ------------------------------------------------
  // Nothing here travels. The only thing that moves in this scene is the angle
  // at one man's waist, and the whole case is in it: he bows, and the bow is
  // neither of the two things the koan forbids, and it changes nothing. Reach
  // for the master and the traveller bows — the one thing you can do with an
  // unanswerable meeting is offer it — and he comes back up having settled
  // nothing. The master never responds; that is not an omission.
  let camera = null;
  let clock = 0;
  let reaches = 0;
  let reachedAt = -99;     // when the last reach landed; bowShape does the rest
  let shookAt = -99;       // the master's own tremor — see his header
  // quick, small, and done: a decaying wobble about his roll axis, k9's
  // rock idiom at a hand's scale. Ungated by the bow's span (k17's nod
  // rule): even a reach the bow refuses still visibly lands on him.
  const SHAKE = { amp: 0.035, hz: 7.5, tau: 0.16, span: 0.8 };

  // The angle, as a function of the clock and nothing else — so it can also be
  // applied ONCE at build. A figure whose pose is only set by the first
  // update() renders its build pose on any first frame too short to bank a
  // full timestep, which on case 35 showed as a visible flicker. Here that
  // build pose is a man standing, which is exactly the frame the page opens on.
  function applyBow() {
  if (!waist) return;
  const k = bowShape(clock - reachedAt);
  // the breath rides the bow, so a man standing straight does not sway
  waist.rotation.x = k * (BOW + Math.sin(clock * 0.55) * BOW_BREATH);
  }
  applyBow();

  input.onTap(() => {
  if (!camera) return;
  if (!input.raycastFirst(camera, [hit])) return;
  // the tremor is ungated — every reach lands on him, even one the bow
  // logic below refuses (its own span keeps a held pointer from buzzing)
  if (clock - shookAt >= SHAKE.span) shookAt = clock;
  // let the bow he already gave you finish — case 32's own rule, and the
  // reason a shaped gesture needs one where a decaying number did not: a
  // second tap partway down would otherwise restart the descent from
  // wherever he had got to, which is a stumble rather than a bow
  if (clock - reachedAt < BOW_SPAN) return;
  reachedAt = clock;
  reaches++;
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
  applyBow();
  // the master's tremor: elapsed-since-reach only, settling to exactly 0
  const su = clock - shookAt;
  master.rotation.z = (su >= 0 && su < SHAKE.span)
  ? SHAKE.amp * Math.sin(su * SHAKE.hz * Math.PI * 2) * Math.exp(-su / SHAKE.tau)
  : 0;
  },
  fragment() {
  return {
  reaches,
  bow: +(waist ? waist.rotation.x : 0).toFixed(4),
  // 0 standing, 1 at the bottom of the bow
  bowing: +bowShape(clock - reachedAt).toFixed(3),
  shake: +master.rotation.z.toFixed(5),
  };
  },
  dispose() {},
};
  },
};
