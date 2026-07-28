import * as THREE from '../lib/three.module.js';
import { makeCameraRig, makeFreeCam } from './camera.js';
import { makeDissolve } from './render/dissolve.js';
import { installGrain } from './render/grain.js';
import { makePost } from './render/post.js';
import { makeFreeze } from './render/freeze.js';
import { makeSceneManager, disposeRoot } from './scene/manager.js';
import { makeDebug } from './ui/debug.js';
import { makeInput } from './input.js';
import { createSave } from './save.js';
import { createAudio } from './audio/engine.js';
import { gustPhase } from './audio/synths.js';
import { createNarration } from './audio/narration.js';
import { CASES } from './koans/index.js';
import { makeNavQueue } from './nav_queue.js';
import { isStaged, isRegistered, loadKoan } from './koans/registry.js';
import { buildHub, makeIntro } from './intro.js';
import { makeMenu } from './ui/menu.js';
import { makeAbout } from './ui/about.js';
import { makeScroll } from './ui/scroll.js';
import { makeSit } from './sit.js';
import { makeRouter } from './router.js';
import { readingOrder, neighborSlug, isMatterSlug } from './spine.js';

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

// The hub is built now but NOT made active here: a deep link needs the scene
// manager empty so the first reveal is the ink curtain rather than a torn-off
// still of a gate that was never drawn. The boot block at the bottom of this
// file activates it on the ordinary path.
const hub = buildHub();

let mode = 'intro';
let simTime = 0;
let rig = null;
let koan = null;
let koanSlug = null;
let scroll = null;
let intro = null;

// The book's reading order: the preface, the forty-nine, the afterword. Paging
// and the arrow keys walk this, not CASES — the matter pages are pages of the
// book but not cases, and nothing that counts cases should see them.
const SPINE = readingOrder(CASES);
const neighbor = (slug, dir) => neighborSlug(SPINE, slug, dir);
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
  onAbout: () => showView(about.el),
});
panel.appendChild(menu.el);

// The back matter lives in the panel beside the contents and never touches the
// stage: the hub scene keeps idling behind it, so reading the credits is the
// same act as reading a case. Mode stays 'menu', which is what makes the back
// button (and exit()) fall through to the contents with no extra state.
const about = makeAbout({ onBack: () => { menu.refresh(save.state()); showView(menu.el); } });
panel.appendChild(about.el);

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

// ---- ambient view: just the picture ----
// The text steps aside, the diorama takes the whole window, and the camera
// drifts on its own. Deliberately NOT a `mode`: the reader is still in whatever
// case they were reading, still being read to, still sitting if they were
// sitting — only the way they are looking at it changes. A fourth mode would
// have to be answered for in every `mode ===` check in this file and would buy
// nothing. Composes with the fullscreen button rather than requesting it: if
// they are already fullscreen, the whole window IS the whole screen.
const app = document.getElementById('gg-app');
let ambient = false;
const ambientBtn = tool('◉', 'Ambient view', () => setAmbient(!ambient));
function setAmbient(on) {
  ambient = !!on;
  app.classList.toggle('ambient', ambient);
  ambientBtn.classList.toggle('active', ambient);
  ambientBtn.title = ambient ? 'Leave ambient view' : 'Ambient view';
  applyStageSize();          // the panel just left or returned; see the comment there
  if (rig) rig.setWander(ambient);
}

// ---- debug workbench (top-right of the stage) ----
const freeCam = makeFreeCam(camera, renderer.domElement);
const debug = makeDebug({
  renderer,
  getScene: () => { const a = scenes.active(); return a && a.scene; },
  audio,
  grainEls: [grain.overlay, grain.vignette],
  post,
  onSound: () => setSoundLabel(),
  onLens: (fov) => applyLens(fov),
  onFreeCam: (on) => freeCam.set(on),
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
    const d = rigBaseDistance * (t(LENS_BASE) / t(fov));
    rig.goal.distance = d;
    // home too, or the ambient drift would keep breathing around the old
    // framing and drag the lens correction straight back out again
    rig.home.distance = d;
  }
}

function makeRig(opts) {
  if (rig && rig.dispose) rig.dispose();
  rigBaseDistance = opts.distance;
  const r = makeCameraRig(camera, renderer.domElement, opts);
  rig = r;
  applyLens();
  // every scene builds a fresh rig, so an ambient view already running has to be
  // re-applied to it — otherwise paging while ambient silently stops the drift
  r.setWander(ambient);
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

// The menu's quiet life: the swells at full drift plus an occasional soft
// chime — the barest "scene" in the app is the one with nothing else to sound.
// Mood resets to the book's default; a case's pick belongs to the case.
function menuMusic() {
  audio.setMood('in');
  audio.playMusic(0, { chimes: true });
}

async function openMenu() {
  await transition(() => {
    if (intro) { intro.dispose(); intro = null; }
    mode = 'menu';
    makeRig({ distance: 14, target: hub.gateTarget, azimuth: 0.5, polar: 1.3 });
    menu.refresh(save.state());
    menu.open();
    showView(menu.el);
    menuMusic();
  });
}

// Build the koan and swap it onto the stage. Synchronous and self-contained —
// everything from tearing down the outgoing case to framing the new one — so a
// paging hop can call it under a held still with no async gap in the middle.
function buildKoan(mod, slug) {
  // tear down any outgoing koan (e.g. re-entering without an exit())
  if (koan && koan.onExit) koan.onExit();
  stopReading();
  input.clear();
  // Ambience is main's job now, not the koans': the module's `ambience`
  // field is the single source of truth, started below and stopped here —
  // so a recipe can never drift from what actually plays, and the menu's
  // music never follows you in. A lingering wind would also block the new
  // case's level (startAmbience only creates wind when none exists).
  audio.stopAmbience();
  audio.setMood(mod.mood);
  if (scroll) { scroll.dispose(); scroll = null; }
  const built = mod.build({
    scene: null, kit: null, audio, input, accent: mod.accent, quality: 'high', hub,
  });
  built.setCamera && built.setCamera(camera);
  const prev = scenes.active();
  scenes.setActive(built);
  debugApply();
  if (prev && prev !== hub && prev !== built) { disposeRoot(prev); prev.dispose && prev.dispose(); }
  koan = built; koanSlug = slug;
  built.onEnter && built.onEnter();
  audio.startAmbience(mod.ambience || []);
  // Progress in this book means the forty-nine cases; front matter is not an
  // achievement, and marking it would also make it the "continue" target.
  if (!isMatterSlug(slug)) save.markRead(slug);
  // Safe to write here and only here: showKoan's freeze.capture is synchronous,
  // so nothing awaits between the nav queue's load resolving and this running —
  // no hashchange task can interleave and overtake it with a stale URL. That
  // invariant lives in showKoan, not here, so an `await` added there ahead of
  // buildKoan would silently break this.
  router.set({ view: 'case', slug });
  // A case may frame itself. Most want the standard diorama shot, but a wide
  // establishing scene and a close one on a single figure are not the same
  // photograph, and an unstaged landscape wants to sit back further still.
  // A scene may name its own subject. The hub does (its gate), and the front and
  // back matter render the hub — without this they inherit the generic diorama
  // target, which sits four units in front of the gate and swings the orbit
  // around empty road. A case's own `camera` still overrides, so this changes
  // nothing for the forty-nine.
  makeRig({
    distance: 11.5, target: [1.2, 1.35, 0.3], azimuth: 0.55, polar: 1.27,
    ...(built.gateTarget ? { target: built.gateTarget } : {}),
    ...(mod.camera || {}),
  });
  menu.close();
  scroll = makeScroll({
    id: mod.id, title: mod.title, text: mod.text, accent: mod.accent,
    sections: mod.sections, labels: mod.labels,
    // Clicking the section that is currently reading stops it. Clicking a
    // different one switches straight to it — that click means "read this
    // instead", not "be quiet", and making it take two clicks reads as a bug.
    onSpeak: (key) => {
      const cur = narration.current();
      if (cur && cur.section === key) { stopReading(); return; }
      startReading(false);
      scroll.highlight(key); scroll.setReading(true);
      // a single section that finishes on its own gets its chime too;
      // a manual stop never does (stop bumps the narration generation,
      // so this onEnd is never called for a cancelled read)
      narration.speak(mod.id, key, { onEnd: () => { sectionChime(key); stopReading(); } });
    },
    onSpeakAll: () => {
      if (readingAll) { stopReading(); return; }
      startReading(true);
      scroll.setReading(true);
      speakAll(mod.id);
    },
    onBack: () => exit(),
    onSit: (m) => startSit(m),
    // page through the book one case at a time (Contents stays the way out)
    hasPrev: !!neighbor(slug, -1),
    hasNext: !!neighbor(slug, +1),
    onPrev: () => { const p = neighbor(slug, -1); if (p) enter(p); },
    onNext: () => { const n = neighbor(slug, +1); if (n) enter(n); },
  });
  panel.appendChild(scroll.el);
  showView(scroll.el);
  mode = 'koan';
}

// One paging hop, driven by the nav queue. Unlike the generic transition(), the
// reveal is NOT awaited when there is a still to tear from — it is fired and the
// hop resolves at once, so the queue can start the next hop immediately and let
// freeze.capture() bake the in-flight tear into the following one. That is what
// makes a burst of clicks read as one continuous, quickening dissolve rather
// than a series of full ones played back to back.
const PAGE_REVEAL = 0.55;   // quicker than the 0.9 s book-open; paging is brisk
async function showKoan(mod, slug) {
  panel.classList.add('fading');
  const active = scenes.active();
  const frozen = active ? freeze.capture(active.scene, camera) : false;
  buildKoan(mod, slug);
  panel.classList.remove('fading');
  // No still to tear from means a COLD ARRIVAL — capture only fails when there is
  // no active scene, and the only moment there isn't one is a deep link opening
  // the book straight into a case. Cut, don't dissolve. A transition needs
  // something to transition FROM, and there is nothing here but paper; playing
  // one anyway also put the reveal directly behind buildKoan's one big
  // synchronous allocation, so the frame after the build arrived with dt clamped
  // to 0.1 s and the tween lurched a quarter of its length in a single frame.
  // The front page doesn't fade in either — it is simply there.
  if (frozen) { dissolve.set(1); freeze.release(PAGE_REVEAL); }   // fire, don't await
  else dissolve.set(1);
}

const nav = makeNavQueue({
  load: (slug) => loadKoan(slug),
  show: showKoan,
  current: () => (mode === 'koan' ? koanSlug : null),
});

function enter(slug) {
  if (!isRegistered(slug)) return Promise.resolve();
  return nav.go(slug);
}

async function exit() {
  if (mode === 'intro') { skipIntro(); return; }
  if (mode === 'sit') { sit.end(); return; }
  nav.cancel();      // a queued page must not fire after we've asked for Contents
  router.set({ view: 'contents' });   // both paths below land on Contents
  if (mode !== 'koan') { menu.open(); showView(menu.el); return; }
  stopReading();
  input.clear();
  koan && koan.onExit && koan.onExit();
  // ambience is main's job (see enter()): the case's whole bed dies here, and
  // menuMusic() below starts the menu's own with a fresh scheduler — playMusic
  // REUSES a live one and silently drops its options, so this must be a stop,
  // never a hand-off
  audio.stopAmbience();
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
    menuMusic();
  });
}

// ---- routing: the URL always names what's on screen ----
// A case is its number (`#29`); Contents is the bare URL. Written on arrival at
// a scene, read back when the reader uses Back, Forward, or edits the address
// bar by hand. Covers 'sit' as well as 'koan': sitting keeps the case's hash —
// the reader is still on that case, just not reading it.
const currentRoute = () =>
  ((mode === 'koan' || mode === 'sit') && koanSlug
    ? { view: 'case', slug: koanSlug } : { view: 'contents' });

const router = makeRouter({
  onRoute: (route) => {
    // A hash naming nothing never yanks the reader anywhere. Correct the URL
    // back to where they actually are and carry on — honour the contract
    // rather than obey the junk. { replace: true } because a correction is
    // not a navigation: pushing it would make Back land back on the junk hash.
    if (!route) { router.set(currentRoute(), { replace: true }); return; }
    // A history hop out of a case must not leave the timer running over the next one.
    if (mode === 'sit') sit.end();
    if (route.view === 'case') {
      if (mode === 'koan' && koanSlug === route.slug) return;   // already there
      enter(route.slug);
    } else {
      if (mode === 'menu') return;                              // already there
      exit();
    }
  },
});

// A beat between sections of a read-aloud. Running the case straight into Mumon's
// comment reads as one continuous text; the pause is what says a different voice in
// the book has taken over. Long enough to land, short enough not to feel broken.
const SECTION_GAP_MS = 1500;

// Punctuation for the reading: one tube note when a section ends, descending
// as the reading deepens — the case highest, the verse lowest. Rides the
// case's mood; duck-compensated so it is actually audible under narration.
const SECTION_TUBE = { case: 2, comment: 1, verse: 0 };
const sectionChime = (key) =>
  audio.chimeStrike({ tube: SECTION_TUBE[key] ?? 0, force: 0.8, punctuate: true });

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
        sectionChime(key);
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
  // any key is a user gesture — resume audio (sound is on by default, and there
  // is no prompt any more to do this for us)
  audio.unlock();
  if (mode === 'intro') { skipIntro(); return; }
  // Ambient first: Escape should give the reader their text back, not take the
  // case away from them. Leaving the view is the smaller undo, so it goes first.
  if (e.key === 'Escape') {
    if (ambient) { setAmbient(false); return; }
    if (mode === 'sit') sit.end(); else if (mode === 'koan') exit();
    return;
  }
  // page the book with the arrow keys while reading a case
  const t = e.target;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  if (mode === 'koan' && koanSlug && !typing) {
    if (e.key === 'ArrowRight') { const n = neighbor(koanSlug, +1); if (n) enter(n); }
    else if (e.key === 'ArrowLeft') { const p = neighbor(koanSlug, -1); if (p) enter(p); }
  }
});
// On the WINDOW, not the canvas: during the intro the title text sits in a DOM
// panel over the canvas, so a click on that side never reached a canvas-only
// listener and the intro wouldn't skip (Frank). At window level a click
// anywhere skips — and unlocks the sound — wherever it lands.
addEventListener('pointerdown', () => {
  audio.unlock();                 // first tap starts the sound; the mute button turns it off
  if (mode === 'intro') skipIntro();
});

// ---- loop ----
function tick() {
  simTime += STEP;
  audio.setGust(gustPhase(simTime));
  if (mode === 'intro' && intro) intro.update(STEP);
  else if (freeCam.enabled()) freeCam.update(STEP);
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

// Named rather than inline because the window is not the only thing that
// resizes the stage: ambient mode hides the text panel, and since the shell is
// a flex row that hands the stage the freed width — a layout change INSIDE the
// page, which fires no resize event at all. Anything that changes the stage's
// size has to call this by hand.
function applyStageSize() {
  const { w, h } = stageSize();
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dissolve.setAspect(camera.aspect);
  post.setSize(w, h);
  freeze.setSize(w, h);
  freeze.setAspect(camera.aspect);
  freeze.clear();     // a held frame at the old aspect would stretch
}
addEventListener('resize', applyStageSize);

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
  ambient(on) { setAmbient(on === undefined ? !ambient : on); return ambient; },
  // Voice and delivery are baked, not chosen at runtime. This reports what shipped.
  voice() { const m = narration.manifest(); return m ? `${m.voice} / ${m.preset}` : null; },
  narrationCount() { const m = narration.manifest(); return m ? Object.keys(m.files).length : 0; },
};

// A deep link opens the case it names — no title dolly, no Contents. A link is
// a promise that this is the page you were sent, and seven seconds of gate
// breaks it. The screen starts covered so the wait on the case module is paper
// rather than an uncleared canvas, and the scene manager stays empty, which is
// what tells showKoan this is a cold arrival: it cuts to the finished diorama
// instead of dissolving. There is nothing on screen to dissolve away from.
const booted = router.initial();
if (booted && booted.view === 'case') {
  router.set(booted, { replace: true });   // canonicalise `#029` -> `#29` without a history entry
  dissolve.set(0);
  // If the case fails to load (flaky connection, bad deploy, a chunk that
  // fell out of the cache) there is no fallback below this line — a rejected
  // promise here would strand the reader on inked-over paper with nothing
  // wired to rescue them, which is the worst possible first impression of a
  // shared link. Land exactly where the ordinary boot (the `else` branch)
  // would have put them.
  enter(booted.slug).catch(() => {
    router.set({ view: 'contents' }, { replace: true });
    scenes.setActive(hub);
    dissolve.set(1);
    startIntro();
  });
} else {
  // A bad hash (`#99`, junk) parses to null here too — router.initial() can't
  // tell "no hash" from "a hash naming nothing". Either way Contents is where
  // we land, so correct the bar in place: replace, not push, or Back would
  // return the reader to the URL that never resolved to anything.
  router.set({ view: 'contents' }, { replace: true });
  scenes.setActive(hub);
  // The workbench has to meet the hub before the first frame, the way it meets
  // every case in buildKoan and the hub again in exit(). Without this the title
  // screen and the contents were the only two scenes in the book it never
  // reached, so a reader's persisted settings did not take hold until they had
  // opened a case and come back.
  debugApply();
  dissolve.set(1);
  startIntro();
}
requestAnimationFrame(frame);
