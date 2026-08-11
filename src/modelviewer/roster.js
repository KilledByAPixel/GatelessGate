// The one registry of viewable kit models, shared by the model viewer
// (dev/model-viewer.html) and the screenshot harness (dev/model-shot.html) so the
// two can never drift apart. Every entry's build() receives the KIT NAMESPACE
// as an argument rather than importing it — that indirection is what lets the
// viewer hot-swap a freshly re-imported kit under every builder (see main.js).
//
// Keys are the names the polish workflow already uses (`shot.js --model dog`);
// don't rename them casually — checklist notes are stored under them.
// Variants that matter to the polish work (poses, stances) get their own keys.
//
// Not everything in the kit earns a cell. A model belongs here when it has FORM
// to judge on a turntable; the moon does not — it is one unlit disc whose entire
// design is four render rules (fog off, no outline, no ink pass, keep the
// material), and a gallery cell shows none of them. It is reviewed in case 19,
// standing where it stands.
//
// This module must stay dependency-free and DOM-free: it is imported by plain
// Node tests as well as both browser harnesses.

export const ROSTER = [
  // creatures
  { key: 'dog', section: 'creatures', build: (kit) => kit.makeDog({}) },
  { key: 'fox', section: 'creatures', build: (kit) => kit.makeFox({}) },
  { key: 'cat', section: 'creatures', build: (kit) => kit.makeCat({}) },
  { key: 'horse', section: 'creatures', build: (kit) => kit.makeHorse({}) },
  { key: 'buffalo', section: 'creatures', build: (kit) => kit.makeBuffalo({}) },
  { key: 'koi', section: 'creatures', build: (kit) => kit.makeKoi({}) },
  { key: 'bird', section: 'creatures', build: (kit) => kit.makeBird({}) },
  { key: 'birds', section: 'creatures', build: (kit) => kit.makeBirds({}) },
  { key: 'butterflies', section: 'creatures', build: (kit) => kit.makeButterflies({}) },
  // figures
  { key: 'monk', section: 'figures', build: (kit) => kit.makeMonk({}) },
  { key: 'monk-sit', section: 'figures', build: (kit) => kit.makeMonk({ pose: 'sit' }) },
  { key: 'monk-point', section: 'figures', build: (kit) => kit.makeMonk({ pose: 'point' }) },
  { key: 'monk-raise', section: 'figures', build: (kit) => kit.makeMonk({ pose: 'raise' }) },
  { key: 'monk-fold', section: 'figures', build: (kit) => kit.makeMonk({ pose: 'fold' }) },
  { key: 'monk-bow', section: 'figures', build: (kit) => {
    const m = kit.makeMonk({ pose: 'bow', hat: false });
    m.getObjectByName('waist').rotation.x = 0.62;   // mid-bow, so the pose reads
    return m;
  } },
  { key: 'buddha', section: 'figures', build: (kit) => kit.makeBuddha({}) },
  { key: 'hangingmonk', section: 'figures', build: (kit) => kit.makeHangingMonk({}) },
  { key: 'assembly', section: 'figures', build: (kit) => kit.makeAssembly({ count: 6, radius: 1.6 }) },
  // flora
  { key: 'tree', section: 'flora', build: (kit) => kit.makeTree({}) },
  { key: 'pine', section: 'flora', build: (kit) => kit.makePine({}) },
  { key: 'oak', section: 'flora', build: (kit) => kit.makeOak({}) },
  { key: 'flower', section: 'flora', build: (kit) => kit.makeFlower({}) },
  { key: 'wildflowers', section: 'flora', build: (kit) => kit.makeWildflowers({}) },
  // structures
  { key: 'gate', section: 'structures', build: (kit) => kit.makeGate({}) },
  { key: 'hut', section: 'structures', build: (kit) => kit.makeHut({}) },
  { key: 'veranda', section: 'structures', build: (kit) => kit.makeVeranda({}) },
  { key: 'lantern', section: 'structures', build: (kit) => kit.makeLantern({}) },
  { key: 'bell', section: 'structures', build: (kit) => kit.makeBell({}) },
  { key: 'flag', section: 'structures', build: (kit) => kit.makeFlag({}) },
  { key: 'sign', section: 'structures', build: (kit) => kit.makeSign({}) },
  { key: 'screen', section: 'structures', build: (kit) => kit.makeScreen({}) },
  { key: 'cave', section: 'structures', build: (kit) => kit.makeCave({}) },
  // props
  { key: 'bowl', section: 'props', build: (kit) => kit.makeBowl({}) },
  { key: 'vase', section: 'props', build: (kit) => kit.makeVase({}) },
  { key: 'basin', section: 'props', build: (kit) => kit.makeBasin({}) },
  { key: 'bundle', section: 'props', build: (kit) => kit.makeBundle({}) },
  { key: 'drum', section: 'props', build: (kit) => kit.makeDrum({}) },
  { key: 'rack', section: 'props', build: (kit) => kit.makeRack({}) },
  { key: 'stall', section: 'props', build: (kit) => kit.makeStall({}) },
  { key: 'wheel', section: 'props', build: (kit) => kit.makeWheel({}) },
  { key: 'boat', section: 'props', build: (kit) => kit.makeBoat({}) },
  { key: 'furin', section: 'props', build: (kit) => kit.makeFurin({}) },
  { key: 'pole', section: 'props', build: (kit) => kit.makePole({}) },
  { key: 'fan', section: 'props', build: (kit) => kit.makeFan({}) },
  { key: 'scale', section: 'props', build: (kit) => kit.makeScale({}) },
];

// Kit builders return either a bare Object3D or a handle ({ group | mesh,
// update, ... }). Normalize to both, and settle handle-style models into their
// rest pose so a static view never shows frame-zero garbage.
export function instantiate(entry, kit) {
  const built = entry.build(kit);
  const obj = built && built.isObject3D ? built : (built && (built.group || built.mesh));
  if (!obj || !obj.isObject3D) throw new Error(`${entry.key}: builder returned no Object3D`);
  if (typeof built.update === 'function') built.update(0, 0);
  return { obj, built };
}
