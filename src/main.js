import * as THREE from '../lib/three.module.js';
import { makeCameraRig } from './camera.js';
import { makeDissolve } from './render/dissolve.js';
import { installGrain } from './render/grain.js';
import { makePost } from './render/post.js';
import { makeFreeze } from './render/freeze.js';
import { makeSceneManager, disposeRoot } from './scene/manager.js';
import { makeDebug } from './ui/debug.js';
import { makeInput } from './input.js';
import { createSave } from './save.js';
import { createAudio } from './audio/engine.js';
import { createNarration } from './audio/narration.js';
import { CASES } from './koans/index.js';
import { isStaged, isRegistered, loadKoan } from './koans/registry.js';
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
const post = (() => { const { w, h } = stageSize(); return makePost(renderer, w, h); })();
const freeze = (() => { const { w, h } = stageSize(); return makeFreeze(renderer, post, w, h); })();
freeze.setAspect(camera.aspect);
const scenes = makeSceneManager(renderer, dissolve, post, freeze);
const input = makeInput(renderer.domElement);
const save = createSave(window.localStorage);
const audio = createAudio(save);
const narration = createNarration();

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
let readingAll = false;   // whether the current read is "read all" or a single section
let readTimer = null;     // the pause between sections of a read-all

// ---- panel views ----
function showView(el) {
  for (const v of panel.querySelectorAll('.gg-view')) v.classList.toggle('hidden', v !== el);
  if (el) el.classList.remove('hidden');
}

const menu = makeMenu({
  cases: CASES, progress: save.state(), isStaged,
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

// ---- stage toolbar (top-right, over the 3D and never over the text) ----
// One row of square buttons: sound, fullscreen, and the debug workbench. They
// share a shape so the corner reads as a toolbar rather than three unrelated
// controls scattered over the picture.
const toolbar = document.createElement('div');
toolbar.className = 'gg-toolbar';
stage.appendChild(toolbar);

const tool = (label, title, onClick) => {
  const b = document.createElement('button');
  b.className = 'gg-tool';
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.onclick = onClick;
  toolbar.appendChild(b);
  return b;
};

const soundBtn = tool('♪', 'Sound', () => {
  audio.unlock();
  audio.setSound(!audio.isSoundOn());
  setSoundLabel();
  debug.apply();                 // the workbench shows the same flag
});
const setSoundLabel = () => {
  const on = audio.isSoundOn();
  soundBtn.textContent = on ? '♪' : '⊘';
  soundBtn.classList.toggle('active', on);
  soundBtn.title = on ? 'Sound on' : 'Sound off';
};
setSoundLabel();

// Fullscreen. Requested on the whole document rather than the stage, so the text
// panel comes along — this is a book, and a diorama without its koan beside it
// is half the page. Safari still needs the webkit spelling.
const fsEl = document.documentElement;
const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const fsBtn = tool('⛶', 'Fullscreen', async () => {
  try {
    if (fsOn()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else await (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl);
  } catch { /* a browser may refuse; the button simply does nothing */ }
});
// Driven by the EVENT, not by the click: Escape and the browser's own chrome can
// leave fullscreen without going through the button.
const setFsLabel = () => {
  const on = fsOn();
  fsBtn.classList.toggle('active', on);
  fsBtn.title = on ? 'Leave fullscreen' : 'Fullscreen';
};
for (const e of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(e, setFsLabel);
}
setFsLabel();
// Don't offer a control that cannot work. Some embedded and managed browser
// views expose the API, resolve the promise, and simply never go fullscreen;
// where the browser is honest enough to say so up front, take it at its word.
if (document.fullscreenEnabled === false) fsBtn.remove();

// ---- debug workbench (top-right of the stage) ----
const debug = makeDebug({
  renderer,
  getScene: () => { const a = scenes.active(); return a && a.scene; },
  audio,
  grainEls: [grain.overlay, grain.vignette],
  post,
  onSound: () => setSoundLabel(),
  onLens: (fov) => applyLens(fov),
});
debug.mount(stage, toolbar);   // panel over the stage, button into the toolbar
// every scene swap builds fresh objects, so the workbench must re-apply to them
const debugApply = () => debug.apply();

// ---- transitions: ink COVERS the stage before anything changes, then reveals ----
// Cut from one diorama to the next without ever showing blank paper: hold a
// still of the outgoing frame, rebuild the world behind it, fade the still off.
// The ink dissolve is kept for the intro, where there is no previous frame to
// hold and the curtain is the point.
async function transition(apply) {
  panel.classList.add('fading');          // panel fades out (cosmetic, not awaited)
  const active = scenes.active();
  const frozen = active ? freeze.capture(active.scene, camera) : false;
  if (!frozen) await dissolve.dissolveOut(0.5);   // nothing to hold — fall back to the curtain
  apply();                                 // swap scene + panel content under the still
  panel.classList.remove('fading');
  if (frozen) {
    dissolve.set(1);                       // the curtain plays no part in this one
    await freeze.release(0.9);             // the ink needs a beat longer than a plain fade did
  } else {
    await dissolve.dissolveIn(0.5);
  }
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
    makeRig({ distance: 14, target: hub.gateTarget, azimuth: 0.5, polar: 1.3 });
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
      // A case may frame itself. Most want the standard diorama shot, but a wide
      // establishing scene and a close one on a single figure are not the same
      // photograph, and an unstaged landscape wants to sit back further still.
      makeRig({ distance: 11.5, target: [1.2, 1.35, 0.3], azimuth: 0.55, polar: 1.27, ...(mod.camera || {}) });
      menu.close();
      scroll = makeScroll({
        id: mod.id, title: mod.title, text: mod.text, accent: mod.accent,
        // Clicking the section that is currently reading stops it. Clicking a
        // different one switches straight to it — that click means "read this
        // instead", not "be quiet", and making it take two clicks reads as a bug.
        onSpeak: (key) => {
          const cur = narration.current();
          if (cur && cur.section === key) { stopReading(); return; }
          startReading(false);
          scroll.highlight(key); scroll.setReading(true);
          narration.speak(mod.id, key, { onEnd: stopReading });
        },
        onSpeakAll: () => {
          if (readingAll) { stopReading(); return; }
          startReading(true);
          scroll.setReading(true);
          speakAll(mod.id);
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
  stopReading();
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
    makeRig({ distance: 14, target: hub.gateTarget, azimuth: 0.5, polar: 1.3 });
    menu.refresh(save.state());
    menu.open();
    showView(menu.el);
  });
}

// A beat between sections of a read-aloud. Running the case straight into Mumon's
// comment reads as one continuous text; the pause is what says a different voice in
// the book has taken over. Long enough to land, short enough not to feel broken.
const SECTION_GAP_MS = 1500;

function startReading(all) {
  readingAll = all;
  if (readTimer) { clearTimeout(readTimer); readTimer = null; }
  audio.duck(true);
}

function stopReading() {
  readingAll = false;
  if (readTimer) { clearTimeout(readTimer); readTimer = null; }
  narration.stop();
  audio.duck(false);
  if (scroll) { scroll.highlight(null); scroll.setReading(false); }
}

function speakAll(id) {
  const order = scroll.queue();
  let i = 0;
  const step = () => {
    const key = order[i++];
    scroll.highlight(key);
    narration.speak(id, key, {
      onEnd: () => {
        if (!readingAll) return;                  // stopped, or switched to one section
        if (i >= order.length) { stopReading(); return; }
        // The highlight stays on the section just read through the gap — clearing it
        // would flash the panel between every part.
        readTimer = setTimeout(() => { readTimer = null; if (readingAll) step(); }, SECTION_GAP_MS);
      },
    });
  };
  if (order.length) step(); else stopReading();
}

function startSit(minutes = 10) {
  if (mode !== 'koan') return;
  mode = 'sit';
  stopReading();
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
  freeze.update(STEP);
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
  post.setSize(w, h);
  freeze.setSize(w, h);
  freeze.setAspect(camera.aspect);
  freeze.clear();     // a held frame at the old aspect would stretch
});

// ---- headless hooks ----
window.gate = {
  step(n = 1) { for (let i = 0; i < n; i++) tick(); scenes.render(camera); return window.gate.state(); },
  state() {
    const s = {
      mode, simTime: +simTime.toFixed(4),
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      fps: Math.round(fps), dissolveT: +dissolve.t.toFixed(4),
      freeze: { active: freeze.active, progress: +freeze.progress.toFixed(4) },
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
  scene() { const a = scenes.active(); return a && a.scene; },   // for headless inspection
  dissolve(dir = 'in', dur) { return dir === 'in' ? dissolve.dissolveIn(dur) : dissolve.dissolveOut(dur); },
  // held-frame transition, exposed so it can be driven and inspected headlessly
  freeze: {
    hold() { const a = scenes.active(); return a ? freeze.capture(a.scene, camera) : false; },
    release(dur) { return freeze.release(dur); },
    clear() { freeze.clear(); },
  },
  sit(minutes) { startSit(minutes); },
  endSit() { sit.end(); },
  markRead(slug) { save.markRead(slug); menu.refresh(save.state()); },
  markSat(slug) { save.markSat(slug); menu.refresh(save.state()); },
  setSound(on) { audio.setSound(on); setSoundLabel(); },
  // Voice and delivery are baked, not chosen at runtime. This reports what shipped.
  voice() { const m = narration.manifest(); return m ? `${m.voice} / ${m.preset}` : null; },
  narrationCount() { const m = narration.manifest(); return m ? Object.keys(m.files).length : 0; },
};

dissolve.set(1);
startIntro();
requestAnimationFrame(frame);
