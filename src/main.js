import * as THREE from '../lib/three.module.js';
import { makeCameraRig } from './camera.js';
import { makeDissolve } from './render/dissolve.js';
import { installGrain } from './render/grain.js';
import { makeSceneManager, disposeRoot } from './scene/manager.js';
import { makeDebug } from './ui/debug.js';
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
import { makeSit } from './sit.js';

const STEP = 1 / 60;

const panel = document.getElementById('gg-panel');
const stage = document.getElementById('gg-stage');
// Never report zero: if a resize fires while the stage is hidden or collapsed,
// setSize(0,0) leaves the drawing buffer at 0x0 and the canvas renders nothing
// until some later resize happens to rescue it.
const stageSize = () => ({
  w: Math.max(1, stage.clientWidth || innerWidth || 1),
  h: Math.max(1, stage.clientHeight || innerHeight || 1),
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
{ const { w, h } = stageSize(); renderer.setSize(w, h); }
stage.appendChild(renderer.domElement);
const grain = installGrain(document, { mount: stage });

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
{ const { w, h } = stageSize(); camera.aspect = w / h; camera.updateProjectionMatrix(); }
const dissolve = makeDissolve();
dissolve.setAspect(camera.aspect);
const scenes = makeSceneManager(renderer, dissolve);
const input = makeInput(renderer.domElement);
const save = createSave(window.localStorage);
const audio = createAudio(save);
const VOICE_KEY = 'gateless-gate-voice';
const pinnedVoice = (() => { try { return window.localStorage.getItem(VOICE_KEY); } catch { return null; } })();
const narration = createNarration({ preferredName: pinnedVoice });

const hub = buildHub();
scenes.setActive(hub);

let mode = 'intro';
let simTime = 0;
let rig = null;
let koan = null;
let koanSlug = null;
let scroll = null;
let intro = null;
let entering = false;

// ---- panel views ----
function showView(el) {
  for (const v of panel.querySelectorAll('.gg-view')) v.classList.toggle('hidden', v !== el);
  if (el) el.classList.remove('hidden');
}

const menu = makeMenu({
  cases: CASES, progress: save.state(), isRegistered,
  onSelect: (slug) => enter(slug),
  onHelp: () => onboarding.show(),
});
panel.appendChild(menu.el);

const onboarding = makeOnboarding({ onDismiss: () => {} });
document.body.appendChild(onboarding.el);

const sit = makeSit({
  audio,
  onComplete: () => { if (koanSlug) { save.markSat(koanSlug); menu.refresh(save.state()); } resumeKoan(); },
  onExit: () => resumeKoan(),
});
document.body.appendChild(sit.el);

// ---- stage-corner controls (over the 3D, never over the text) ----
const controls = document.createElement('div');
controls.className = 'gg-stage-controls';
const soundBtn = document.createElement('button');
const setSoundLabel = () => { soundBtn.textContent = audio.isSoundOn() ? '♪ sound' : '⊘ sound'; };
setSoundLabel();
soundBtn.onclick = () => { audio.unlock(); audio.setSound(!audio.isSoundOn()); setSoundLabel(); };
controls.appendChild(soundBtn);
stage.appendChild(controls);

// ---- debug workbench (top-right of the stage) ----
const debug = makeDebug({
  renderer,
  getScene: () => { const a = scenes.active(); return a && a.scene; },
  audio,
  grainEls: [grain.overlay, grain.vignette],
  onSound: () => setSoundLabel(),
  onLens: (fov) => applyLens(fov),
});
debug.mount(stage);
// every scene swap builds fresh objects, so the workbench must re-apply to them
const debugApply = () => debug.apply();

// ---- transitions: ink COVERS the stage before anything changes, then reveals ----
async function transition(apply) {
  panel.classList.add('fading');          // panel fades out (cosmetic, not awaited)
  await dissolve.dissolveOut(0.7);        // stage covered with ink before the change
  apply();                                 // swap scene + panel content under cover
  panel.classList.remove('fading');
  await dissolve.dissolveIn(0.7);         // reveal
}

// A longer lens compresses depth and reads as a miniature. Pulling the camera
// back by the tangent ratio keeps the subject the same size on screen, so the
// slider changes compression WITHOUT re-framing every diorama.
const LENS_BASE = 38;
let rigBaseDistance = 11.5;
function applyLens(fov = (debug && debug.state.lens) || LENS_BASE) {
  camera.fov = fov;
  camera.updateProjectionMatrix();
  if (rig && rig.goal) {
    const t = (d) => Math.tan((d * Math.PI) / 360);
    rig.goal.distance = rigBaseDistance * (t(LENS_BASE) / t(fov));
  }
}

function makeRig(opts) {
  if (rig && rig.dispose) rig.dispose();
  rigBaseDistance = opts.distance;
  const r = makeCameraRig(camera, renderer.domElement, opts);
  rig = r;
  applyLens();
  return r;
}

// ---- modes ----
function startIntro() {
  mode = 'intro';
  intro = makeIntro(camera, {
    onSound: (on) => { audio.unlock(); audio.setSound(on); setSoundLabel(); },
    onDone: () => openMenu(),
  });
  panel.appendChild(intro.el);
  showView(intro.el);
}

async function openMenu() {
  const first = mode === 'intro';
  await transition(() => {
    if (intro) { intro.dispose(); intro = null; }
    mode = 'menu';
    makeRig({ distance: 14, target: [0, 1.7, -2], azimuth: 0.5, polar: 1.3 });
    menu.refresh(save.state());
    menu.open();
    showView(menu.el);
  });
  if (first && !save.state().onboarded) { onboarding.show(); save.setOnboarded(); }
}

async function enter(slug) {
  if (!isRegistered(slug) || entering) return;
  entering = true;
  try {
    const mod = await loadKoan(slug);
    if (!mod) return;
    await transition(() => {
      // tear down any outgoing koan (e.g. re-entering without an exit())
      if (koan && koan.onExit) koan.onExit();
      input.clear();
      if (scroll) { scroll.dispose(); scroll = null; }
      const built = mod.build({ scene: null, kit: null, audio, input, accent: mod.accent, quality: 'high' });
      built.setCamera && built.setCamera(camera);
      const prev = scenes.active();
      scenes.setActive(built);
      debugApply();
      if (prev && prev !== hub) { disposeRoot(prev); prev.dispose && prev.dispose(); }
      koan = built; koanSlug = slug;
      built.onEnter && built.onEnter();
      save.markRead(slug);
      makeRig({ distance: 11.5, target: [1.2, 1.35, 0.3], azimuth: 0.55, polar: 1.27 });
      menu.close();
      scroll = makeScroll({
        id: mod.id, title: mod.title, text: mod.text, accent: mod.accent,
        onSpeak: (key) => {
          if (narration.isSpeaking()) { narration.stop(); scroll.highlight(null); scroll.setReading(false); return; }
          scroll.highlight(key); scroll.setReading(true);
          narration.speak(mod.text[key], { onEnd: () => { scroll.highlight(null); scroll.setReading(false); } });
        },
        onSpeakAll: () => {
          if (narration.isSpeaking()) { narration.stop(); scroll.highlight(null); scroll.setReading(false); return; }
          scroll.setReading(true);
          speakAll(mod.text);
        },
        onBack: () => exit(),
        onSit: (m) => startSit(m),
      });
      panel.appendChild(scroll.el);
      showView(scroll.el);
      mode = 'koan';
    });
  } finally {
    entering = false;
  }
}

async function exit() {
  if (mode === 'intro') { skipIntro(); return; }
  if (mode === 'sit') { sit.end(); return; }
  if (mode !== 'koan') { menu.open(); showView(menu.el); return; }
  narration.stop();
  input.clear();
  koan && koan.onExit && koan.onExit();
  await transition(() => {
    const prev = scenes.active();
    scenes.setActive(hub);
    debugApply();
    if (prev && prev !== hub) { disposeRoot(prev); prev.dispose && prev.dispose(); }
    koan = null; koanSlug = null;
    if (scroll) { scroll.dispose(); scroll = null; }
    mode = 'menu';
    makeRig({ distance: 14, target: [0, 1.7, -2], azimuth: 0.5, polar: 1.3 });
    menu.refresh(save.state());
    menu.open();
    showView(menu.el);
  });
}

function speakAll(text) {
  const order = scroll.queue();
  let i = 0;
  const step = () => {
    if (i >= order.length) { scroll.highlight(null); scroll.setReading(false); return; }
    const key = order[i++];
    scroll.highlight(key);
    narration.speak(text[key], { onEnd: step });
  };
  step();
}

function startSit(minutes = 10) {
  if (mode !== 'koan') return;
  mode = 'sit';
  narration.stop();
  if (scroll) scroll.setReading(false);
  panel.classList.add('fading');   // the text recedes while sitting
  sit.start(minutes);
}
function resumeKoan() {
  panel.classList.remove('fading');
  mode = 'koan';
}

// ---- input / keys ----
function skipIntro() { if (mode === 'intro' && intro) intro.skip(); }
addEventListener('keydown', (e) => {
  if (mode === 'intro') { skipIntro(); return; }
  if (e.key === 'Escape') { if (mode === 'sit') sit.end(); else if (mode === 'koan') exit(); }
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
  debug.tick(fps);
  acc += dt;
  while (acc >= STEP) { acc -= STEP; tick(); }
  scenes.render(camera);
}

addEventListener('resize', () => {
  const { w, h } = stageSize();
  renderer.setSize(w, h);
  camera.aspect = w / h;
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
  menu(open) { if (open === false) { if (mode !== 'menu') menu.close(); } else { menu.open(); showView(menu.el); } },
  skipIntro,
  dissolve(dir = 'in', dur) { return dir === 'in' ? dissolve.dissolveIn(dur) : dissolve.dissolveOut(dur); },
  sit(minutes) { startSit(minutes); },
  endSit() { sit.end(); },
  markRead(slug) { save.markRead(slug); menu.refresh(save.state()); },
  markSat(slug) { save.markSat(slug); menu.refresh(save.state()); },
  setSound(on) { audio.setSound(on); setSoundLabel(); },
  voice() { return narration.voiceName(); },
  // numbered list of English voices (☁ = cloud/online, usually the nicer ones)
  voices() { return narration.listVoices().map((v, i) => i + ': ' + v.name + ' [' + v.lang + ']' + (v.cloud ? ' ☁' : '')); },
  // audition a voice by index or name without changing the pinned choice
  sampleVoice(sel, text) { return narration.sample(voiceNameFor(sel), text); },
  // pin a voice as the default (persists); pass null/'' to fall back to the heuristic
  setVoice(sel) {
    const name = sel == null || sel === '' ? null : voiceNameFor(sel);
    const applied = narration.setPreferred(name);
    try { name ? window.localStorage.setItem(VOICE_KEY, name) : window.localStorage.removeItem(VOICE_KEY); } catch {}
    return applied;
  },
};

// resolve a voice selector (index into voices(), or an exact/fuzzy name) to a name
function voiceNameFor(sel) {
  if (typeof sel === 'number' || (typeof sel === 'string' && /^\d+$/.test(sel))) {
    const list = narration.listVoices();
    const v = list[+sel];
    return v ? v.name : null;
  }
  return sel;
}

dissolve.set(1);
startIntro();
requestAnimationFrame(frame);
