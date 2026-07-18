import * as THREE from '../lib/three.module.js';
import { makeCameraRig } from './camera.js';
import { makeDissolve } from './render/dissolve.js';
import { installGrain } from './render/grain.js';
import { makeSceneManager } from './scene/manager.js';
import { makeInput } from './input.js';
import { createSave } from './save.js';
import { createAudio } from './audio/engine.js';
import { createNarration } from './audio/narration.js';
import { CASES } from './koans/index.js';
import { isRegistered, loadKoan } from './koans/registry.js';
import { buildHub, makeIntro } from './intro.js';
import { makeMenu } from './ui/menu.js';
import { makeOnboarding } from './ui/onboarding.js';
import { makeScroll } from './ui/scroll.js';
import { makeHud } from './ui/hud.js';
import { makeSit } from './sit.js';

const STEP = 1 / 60;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
installGrain(document);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
const dissolve = makeDissolve();
dissolve.setAspect(innerWidth / innerHeight);
const scenes = makeSceneManager(renderer, dissolve);
const input = makeInput(renderer.domElement);
const save = createSave(window.localStorage);
const audio = createAudio(save);
const narration = createNarration();

const hub = buildHub();
scenes.setActive(hub);

let mode = 'intro';
let simTime = 0;
let rig = null;           // camera rig for menu/koan
let koan = null;         // current koan root
let scroll = null;       // current scroll UI
let intro = null;
let entering = false;

// ---- UI singletons ----
const menu = makeMenu({
  cases: CASES, progress: save.state(), isRegistered,
  onSelect: (slug) => enter(slug),
  onHelp: () => onboarding.show(),
});
document.body.appendChild(menu.el);

const onboarding = makeOnboarding({ onDismiss: () => {} });
document.body.appendChild(onboarding.el);

const sit = makeSit({
  audio,
  onComplete: () => { if (koanSlug) { save.markSat(koanSlug); menu.refresh(save.state()); } resumeKoanChrome(); },
  onExit: () => resumeKoanChrome(),
});
document.body.appendChild(sit.el);

const hud = makeHud({
  soundOn: save.state().soundOn,
  onSound: () => { audio.setSound(!audio.isSoundOn()); hud.setSound(audio.isSoundOn()); },
  onSit: (m) => startSit(m),
  onMenu: () => exit(),
});
document.body.appendChild(hud.el);
document.body.appendChild(hud.ensoEl);
hud.setVisible(false);

let koanSlug = null;

// ---- mode transitions ----
function setMode(m) { mode = m; }

function makeRig(opts) {
  if (rig && rig.dispose) rig.dispose();
  return makeCameraRig(camera, renderer.domElement, opts);
}

function startIntro() {
  setMode('intro');
  hud.setVisible(false);
  menu.close();
  intro = makeIntro(camera, {
    onSound: (on) => { audio.unlock(); audio.setSound(on); hud.setSound(on); },
    onDone: () => openMenu(),
  });
}

function openMenu() {
  setMode('menu');
  intro = null;
  hud.setVisible(false);
  rig = makeRig({ distance: 12, target: [0, 1.2, -1], polar: 1.15 });
  menu.refresh(save.state());
  menu.open();
  if (!save.state().onboarded) { onboarding.show(); save.setOnboarded(); }
}

async function enter(slug) {
  if (!isRegistered(slug)) return;
  if (entering) return;
  entering = true;
  try {
    const mod = await loadKoan(slug);
    if (!mod) return;
    menu.close();
    audio.unlock();
    koanSlug = slug;
    const built = mod.build({ scene: null, kit: null, audio, input, accent: mod.accent, quality: 'high' });
    built.setCamera && built.setCamera(camera);
    await scenes.swapTo(built, { disposePrev: hub !== scenes.active() });
    // keep hub cached: only dispose a previous koan, never the hub
    koan = built;
    built.onEnter && built.onEnter();
    save.markRead(slug);
    rig = makeRig({ distance: 11, target: [1.2, 1.05, 0.3], azimuth: 0.55, polar: 1.16 });
    // scroll UI
    scroll = makeScroll({
      id: mod.id, title: mod.title, text: mod.text, accent: mod.accent,
      onSpeak: (key) => narration.speak(mod.text[key], { onEnd: () => scroll.highlight(null) }),
      onSpeakAll: () => speakAll(mod.text),
    });
    document.body.appendChild(scroll.el);
    menu.close();
    hud.setVisible(true);
    setMode('koan');
  } finally {
    entering = false;
  }
}

function speakAll(text) {
  const order = scroll.queue();
  let i = 0;
  const step = () => {
    if (i >= order.length) { scroll.highlight(null); return; }
    const key = order[i++];
    scroll.highlight(key);
    narration.speak(text[key], { onEnd: step });
  };
  step();
}

function resumeKoanChrome() {
  if (scroll) scroll.untuck();
  hud.setVisible(true);
  setMode('koan');
}

async function exit() {
  if (mode === 'sit') { sit.end(); return; }
  if (mode === 'koan') {
    narration.stop();
    if (scroll) { scroll.dispose(); scroll = null; }
    hud.setVisible(false);
    koan && koan.onExit && koan.onExit();
    input.clear();
    await scenes.swapTo(hub, { disposePrev: true });
    koan = null;
    koanSlug = null;
    openMenu();
  } else {
    menu.open();
  }
}

function startSit(minutes) {
  setMode('sit');
  if (scroll) scroll.tuck();
  hud.setVisible(false);
  sit.start(minutes);
}

// ---- skip intro on any input ----
function skipIntro() { if (mode === 'intro' && intro) intro.skip(); }
addEventListener('keydown', (e) => {
  if (mode === 'intro') { skipIntro(); return; }
  if (e.key === 'Escape') { if (mode === 'sit') sit.end(); else exit(); }
});
renderer.domElement.addEventListener('pointerdown', () => { if (mode === 'intro') skipIntro(); });

// ---- loop ----
function tick() {
  simTime += STEP;
  if (mode === 'intro' && intro) intro.update(STEP);
  else if (rig) rig.update(STEP);
  const active = scenes.active();
  if (active && active.update) active.update(STEP, simTime);
  if (mode === 'sit') sit.update(STEP);
  dissolve.update(STEP);
}

let acc = 0, last = performance.now(), fps = 60;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (dt > 0) fps = fps * 0.95 + (1 / dt) * 0.05;
  acc += dt;
  while (acc >= STEP) { acc -= STEP; tick(); }
  scenes.render(camera);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  dissolve.setAspect(camera.aspect);
});

// ---- headless hooks ----
window.gate = {
  step(n = 1) { for (let i = 0; i < n; i++) tick(); scenes.render(camera); return window.gate.state(); },
  state() {
    const s = {
      mode, simTime: +simTime.toFixed(4),
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      fps: Math.round(fps), dissolveT: +dissolve.t.toFixed(4),
      camera: rig ? rig.state() : null,
      progress: { read: { ...save.state().read }, sat: { ...save.state().sat } },
    };
    if (koan && koan.fragment) s.koan = koan.fragment();
    return s;
  },
  enter(slug) { return enter(slug); },
  exit() { return exit(); },
  menu(open) { if (open === false) menu.close(); else menu.open(); },
  skipIntro,
  dissolve(dir = 'in', dur) { return dir === 'in' ? dissolve.dissolveIn(dur) : dissolve.dissolveOut(dur); },
  sit(minutes) { startSit(minutes); },
  endSit() { sit.end(); },
  markRead(slug) { save.markRead(slug); menu.refresh(save.state()); },
  markSat(slug) { save.markSat(slug); menu.refresh(save.state()); },
  setSound(on) { audio.setSound(on); hud.setSound(audio.isSoundOn()); },
};

dissolve.set(1);      // start revealed; intro dolly runs over the hub
startIntro();
requestAnimationFrame(frame);
