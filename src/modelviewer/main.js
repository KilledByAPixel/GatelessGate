// The model viewer (dev/model-viewer.html) — a standalone art-iteration tool.
//
// It is NOT the game: no main.js boot, no sim, no save, no audio, no router.
// It is a plain three.js page that imports exactly one thing from the app —
// the kit builders — and shows what they produce, one model at a time or the
// whole roster at once (gallery.js), with hot reload: edit any file in the
// kit's import graph and the view rebuilds within about a second.
//
// Hot reload mechanism (the interesting part): every second, poll every
// source file in the kit's import graph with fetch(no-store) and compare
// text. On a change, re-import the WHOLE graph fresh: fetch each module's
// source, rewrite its relative import specifiers to the blob: URLs of its
// freshly loaded dependencies (recursively — this graph is ~55 files deep,
// not the two-level chain a plain ?v= query bust can handle), and import the
// rewritten root via a Blob URL. Every build path reads the kit through the
// mutable `liveKit` binding rather than the static import, so swapping that
// one reference retargets every builder at once. Three itself is left as an
// absolute URL so all copies share one THREE instance.

import * as THREE from '../../lib/three.module.js';
import { PAPER, wash } from '../palette.js';
import { ROSTER as STATIC_ROSTER, instantiate } from './roster.js';
import * as STATIC_KIT from '../kit/index.js';
import { makeViewerLights } from './lights.js';
import { applyBookShading } from './shading.js';
import { createGallery } from './gallery.js';
import * as checklist from './checklist.js';

const SIDE_W = 240;

// ---- live bindings: everything downstream reads these, never the imports --
let liveKit = STATIC_KIT;
let liveRoster = STATIC_ROSTER;

let mode = 'single';            // 'single' | 'gallery'
let currentKey = null;
let currentIndex = 0;
let currentBuilt = null;        // the builder's handle, for live update(dt)
let updateBroken = false;       // stop retrying a throwing update()
let silhouette = false;
let turntable = false;
// The viewer's two extra fill lights (lights.js). On by default because a
// model you are orbiting needs them; L drops them, which is the honest look at
// a model under the book's own rig alone before calling it finished.
let fills = true;
let simTime = 0;

// ---- single-view scene ----------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.domElement.id = 'view';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAPER);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 400);

let lightRig = makeViewerLights(liveKit, { extra: fills });
scene.add(lightRig);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(1, 48),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(wash(0.07)) }));
ground.rotation.x = -Math.PI / 2;      // front-face-only: look up from below and it vanishes
ground.position.y = -0.01;
scene.add(ground);

const modelGroup = new THREE.Group();
scene.add(modelGroup);

const INK_MAT = new THREE.MeshBasicMaterial({ color: 0x14110c });

// ---- orbit: pivot + spherical offset, no pan ------------------------------
const pivot = new THREE.Vector3();
let az = 0.7, el = 0.32, dist = 6, minD = 1, maxD = 60;
let modelRadius = 1;

// Camera memory: a reload — hot or full-page — must not move the eye. Orbit
// state is saved per MODEL (each has its own scale), restored in showModel().
// R resets the view and forgets the stored spot. The pivot itself always
// re-derives from the fresh bbox, so an edited model stays centered.
const CAM_LS = 'gg-model-viewer-camera-v1';
let cams = (() => { try { return JSON.parse(localStorage.getItem(CAM_LS)) || {}; } catch { return {}; } })();
let camSaveT = 0;
function queueSaveCam() {
  clearTimeout(camSaveT);
  camSaveT = setTimeout(() => {
    if (!currentKey) return;
    cams[currentKey] = { az, el, dist };
    localStorage.setItem(CAM_LS, JSON.stringify(cams));
  }, 250);
}

function updateCamera() {
  camera.position.set(
    pivot.x + Math.sin(az) * Math.cos(el) * dist,
    pivot.y + Math.sin(el) * dist,
    pivot.z + Math.cos(az) * Math.cos(el) * dist,
  );
  camera.lookAt(pivot);
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  renderer.domElement.setPointerCapture(e.pointerId);
  let px = e.clientX, py = e.clientY;
  const move = (ev) => {
    az -= (ev.clientX - px) * 0.005;
    el += (ev.clientY - py) * 0.005;     // inverted from the usual orbit convention (owner preference)
    el = Math.max(-1.55, Math.min(1.55, el));
    px = ev.clientX; py = ev.clientY;
    queueSaveCam();
  };
  const up = () => {
    renderer.domElement.removeEventListener('pointermove', move);
    renderer.domElement.removeEventListener('pointerup', up);
  };
  renderer.domElement.addEventListener('pointermove', move);
  renderer.domElement.addEventListener('pointerup', up);
});
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  dist = Math.max(minD, Math.min(maxD, dist * Math.exp(e.deltaY * 0.0012)));
  queueSaveCam();
}, { passive: false });

// ---- DOM --------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const sidebar = $('sidebar'), sideList = $('side-list');
const errBanner = $('err');

function toast(msg, bad = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = bad ? 'bad show' : 'show';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.className = ''; }, 2200);
}

function dotClass(key) {
  const s = checklist.get(key);
  return s.state === 'ok' ? 'dot ok' : s.state === 'needs' ? 'dot needs' : s.note ? 'dot needs' : 'dot';
}

function buildSidebar() {
  sideList.innerHTML = '';
  let section = null;
  liveRoster.forEach((entry, i) => {
    if (entry.section !== section) {
      section = entry.section;
      const h = document.createElement('div');
      h.className = 'side-section';
      h.textContent = section;
      sideList.append(h);
    }
    const row = document.createElement('div');
    row.className = 'row' + (entry.key === currentKey ? ' sel' : '');
    row.dataset.key = entry.key;
    row.innerHTML = `<span class="${dotClass(entry.key)}"></span><span>${entry.key}</span>`;
    row.onclick = () => showModel(i);
    sideList.append(row);
  });
  window.__mvRoster = liveRoster.map((e) => e.key);
}

function refreshMarks(key) {
  if (key == null) {           // everything changed (checklist cleared)
    sideList.querySelectorAll('.row').forEach((r) => {
      r.querySelector('.dot').className = dotClass(r.dataset.key);
    });
    bindFeedback();
    return;
  }
  const row = sideList.querySelector(`.row[data-key="${key}"] .dot`);
  if (row) row.className = dotClass(key);
  if (key === currentKey) bindFeedback();
}

// the single-view feedback strip mirrors the gallery checklist for the
// CURRENT model, so a verdict can be dropped without leaving the close-up
function bindFeedback() {
  const s = checklist.get(currentKey);
  $('fb-ok').classList.toggle('on', s.state === 'ok');
  $('fb-needs').classList.toggle('on', s.state === 'needs');
  if ($('fb-note').value !== s.note) $('fb-note').value = s.note;
}
$('fb-ok').onclick = () => {
  const cur = checklist.get(currentKey).state;
  checklist.set(currentKey, { state: cur === 'ok' ? null : 'ok' });
  refreshMarks(currentKey);
};
$('fb-needs').onclick = () => {
  const cur = checklist.get(currentKey).state;
  checklist.set(currentKey, { state: cur === 'needs' ? null : 'needs' });
  refreshMarks(currentKey);
};
$('fb-file').onclick = () => openSource(currentKey);
$('fb-note').oninput = () => {
  checklist.set(currentKey, { note: $('fb-note').value });
  const row = sideList.querySelector(`.row[data-key="${currentKey}"] .dot`);
  if (row) row.className = dotClass(currentKey);
};

// ---- single view ------------------------------------------------------
function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isMesh) {
      o.geometry && o.geometry.dispose();
      // materials yes, textures no: toon gradient maps are shared module-wide
      if (o.material && o.material !== INK_MAT) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    }
  });
}

function showModel(index) {
  currentIndex = Math.max(0, Math.min(liveRoster.length - 1, index));
  const entry = liveRoster[currentIndex];
  currentKey = entry.key;

  while (modelGroup.children.length) {
    const c = modelGroup.children[0];
    modelGroup.remove(c);
    disposeGroup(c);
  }
  modelGroup.rotation.y = 0;
  currentBuilt = null;
  updateBroken = false;
  errBanner.style.display = 'none';

  try {
    const { obj, built } = instantiate(entry, liveKit);
    // Before the silhouette check: silhouette flattens everything to ink
    // anyway, and the shading swap would only be thrown away.
    if (!silhouette) applyBookShading(obj);
    if (silhouette) {
      obj.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.isOutline) { o.visible = false; return; }
        o.material = INK_MAT;
      });
    }
    modelGroup.add(obj);
    currentBuilt = built;

    const box = new THREE.Box3().setFromObject(obj);
    box.getCenter(pivot);
    modelRadius = Math.max(0.001, box.getSize(new THREE.Vector3()).length() / 2);
    // a model that lives below y=0 (the koi swim under their pond's surface)
    // would hide behind an opaque ground disc — go glassy so it shows through
    const dips = box.min.y < -0.02 * modelRadius;
    ground.material.transparent = dips;
    ground.material.opacity = dips ? 0.3 : 1;
    ground.material.needsUpdate = true;
    dist = modelRadius * 3.4;
    minD = modelRadius * 1.2;
    maxD = modelRadius * 20;
    ground.scale.setScalar(Math.max(3, modelRadius * 1.8));
    const saved = cams[currentKey];
    if (saved) {
      az = saved.az;
      el = Math.max(-1.55, Math.min(1.55, saved.el));
      dist = Math.max(minD, Math.min(maxD, saved.dist));
    }
  } catch (e) {
    console.error('[mv]', entry.key, e);
    errBanner.textContent = `${entry.key}: ${e && e.message || e}`;
    errBanner.style.display = 'block';
  }

  ground.visible = !silhouette;
  lightRig.visible = !silhouette;
  document.title = `${currentKey} · model viewer`;

  $('fb-file').textContent = sourceFileFor(currentKey) || '';

  const sel = sideList.querySelector('.row.sel');
  if (sel) sel.classList.remove('sel');
  const row = sideList.querySelector(`.row[data-key="${currentKey}"]`);
  if (row) { row.classList.add('sel'); row.scrollIntoView({ block: 'nearest' }); }
  bindFeedback();

  if (location.hash.slice(1) !== currentKey) location.hash = currentKey;
}

// ---- frame ------------------------------------------------------------
function frame(dtMs = 16.7) {
  const dt = Math.min(0.1, dtMs / 1000);
  simTime += dt;
  if (mode === 'gallery') { gallery.render(); return; }
  if (turntable) modelGroup.rotation.y += dt * 0.35;
  if (currentBuilt && typeof currentBuilt.update === 'function' && !updateBroken) {
    try { currentBuilt.update(dt, simTime); }
    catch (e) { updateBroken = true; console.error('[mv] update() threw:', e); }
  }
  updateCamera();
  renderer.render(scene, camera);
}

let lastT = 0;
function tick(t) {
  const dtMs = lastT ? t - lastT : 16.7;
  lastT = t;
  if (mode === 'single') frame(dtMs);
  requestAnimationFrame(tick);
}

function onResize() {
  const w = Math.max(64, innerWidth - (mode === 'single' ? SIDE_W : 0));
  renderer.setSize(w, innerHeight);
  camera.aspect = w / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', () => { onResize(); if (mode === 'gallery') gallery.render(); });

// ---- gallery + routing --------------------------------------------------
const gallery = createGallery({
  getKit: () => liveKit,
  getRoster: () => liveRoster,
  getFills: () => fills,
  toast,
  onChecklistChange: refreshMarks,
  openSource,
});

function enterGallery() {
  mode = 'gallery';
  sidebar.style.display = 'none';
  renderer.domElement.style.display = 'none';
  document.title = 'gallery · model viewer';
  gallery.show();
}

function enterSingle(index) {
  mode = 'single';
  gallery.hide();
  sidebar.style.display = 'flex';
  renderer.domElement.style.display = 'block';
  onResize();
  showModel(index);
}

function onHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'gallery') { enterGallery(); return; }
  // De-dupe against currentKey ONLY in single view: in gallery mode
  // currentKey is stale (whatever was showing when the gallery opened), and a
  // hash matching it must still re-enter single view — the gallery back
  // button is history.back(), which restores exactly that hash.
  if (mode === 'single' && h === currentKey && currentBuilt !== null) return;
  const i = liveRoster.findIndex((e) => e.key === h);
  enterSingle(i >= 0 ? i : 0);
}
addEventListener('hashchange', onHash);

// ---- keys ---------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    if (mode === 'single') { e.preventDefault(); showModel(currentIndex - 1); }
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    if (mode === 'single') { e.preventDefault(); showModel(currentIndex + 1); }
  } else if (e.key === 't' || e.key === 'T') {
    turntable = !turntable;
    $('btn-turn').classList.toggle('on', turntable);
  } else if (e.key === 'r' || e.key === 'R') {
    az = 0.7; el = 0.32; dist = modelRadius * 3.4; modelGroup.rotation.y = 0;
    clearTimeout(camSaveT);                     // a queued drag-save must not resurrect it
    delete cams[currentKey];                    // reset also FORGETS the stored spot
    localStorage.setItem(CAM_LS, JSON.stringify(cams));
  } else if (e.key === 's' || e.key === 'S') {
    setSilhouette(!silhouette);
  } else if (e.key === 'l' || e.key === 'L') {
    setFills(!fills);
  } else if (e.key === 'g' || e.key === 'G') {
    location.hash = mode === 'gallery' ? (currentKey || liveRoster[0].key) : 'gallery';
  }
});

function setSilhouette(on) {
  silhouette = on;
  $('btn-sil').classList.toggle('on', on);
  if (mode === 'single') showModel(currentIndex);
}
// The rig is rebuilt rather than dimmed: makeViewerLights is the one place
// that knows what the fills are, and a second copy of those numbers here is
// how the button and the rig would eventually disagree.
function setFills(on) {
  fills = on;
  $('btn-lights').classList.toggle('on', on);
  scene.remove(lightRig);
  lightRig = makeViewerLights(liveKit, { extra: fills });
  lightRig.visible = !silhouette;
  scene.add(lightRig);
  gallery.markDirty();               // its rig is built at rebuild() time
}
$('btn-sil').onclick = () => setSilhouette(!silhouette);
$('btn-lights').onclick = () => setFills(!fills);
$('btn-lights').classList.toggle('on', fills);
$('btn-turn').onclick = () => { turntable = !turntable; $('btn-turn').classList.toggle('on', turntable); };
$('btn-gallery').onclick = () => { location.hash = 'gallery'; };

// ---- hot reload ---------------------------------------------------------
const SRC_PREFIX = new URL('..', import.meta.url).href;                 // .../src/
const KIT_URL = new URL('../kit/index.js', import.meta.url).href;
const ROSTER_URL = new URL('./roster.js', import.meta.url).href;
const FROM_RE = /(from\s*)(['"])([^'"\n]+)\2/g;

let watched = new Map();        // absolute URL -> last seen source text
let pollBusy = false;

// Re-import the whole kit graph fresh. Each module's source is fetched,
// its relative specifiers rewritten — src/-internal ones to the blob: URLs
// of the freshly loaded dependency, everything else (three) to a plain
// absolute URL so module identity is shared with this page — and the result
// loaded via a Blob URL. Recursive, so it handles the real graph depth.
async function loadFresh() {
  const texts = new Map();
  const blobs = new Map();
  const made = [];
  async function load(url, stack) {
    if (stack.includes(url)) {            // an import cycle would deadlock the
      console.warn('[mv] import cycle at', url);   // await chain — degrade to a
      return url;                                  // stale cached copy and warn
    }
    if (blobs.has(url)) return blobs.get(url);
    const p = (async () => {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
      const src = await res.text();
      texts.set(url, src);
      let out = src;
      const seen = new Set();
      for (const m of src.matchAll(FROM_RE)) {
        const spec = m[3];
        if (!spec.startsWith('.') || seen.has(spec)) continue;
        seen.add(spec);
        const abs = new URL(spec, url).href;
        let target;
        try {
          target = abs.startsWith(SRC_PREFIX) ? await load(abs, [...stack, url]) : abs;
        } catch (e) {
          // FROM_RE can match a path inside a COMMENT; a fetch failure there
          // must not abort the reload. (A real dep that 404s will still fail
          // loudly when the rewritten module is imported.)
          console.warn('[mv] skipping unresolvable specifier', spec, 'in', url, e);
          continue;
        }
        out = out.split(`'${spec}'`).join(`'${target}'`).split(`"${spec}"`).join(`"${target}"`);
      }
      const blobUrl = URL.createObjectURL(new Blob([out], { type: 'text/javascript' }));
      made.push(blobUrl);
      return blobUrl;
    })();
    blobs.set(url, p);
    return p;
  }
  try {
    const [kitUrl, rosterUrl] = await Promise.all([load(KIT_URL, []), load(ROSTER_URL, [])]);
    const [kit, roster] = await Promise.all([import(kitUrl), import(rosterUrl)]);
    return { kit, roster, texts };
  } finally {
    // the modules are resident once imported; the URLs are only needed briefly
    setTimeout(() => made.forEach((u) => URL.revokeObjectURL(u)), 2000);
  }
}

async function doReload() {
  try {
    const { kit, roster, texts } = await loadFresh();
    liveKit = kit;
    liveRoster = roster.ROSTER;
    watched = texts;
    rebuildSourceMap(texts.get(KIT_URL));
    scene.remove(lightRig);
    lightRig = makeViewerLights(liveKit, { extra: fills });
    lightRig.visible = !silhouette;
    scene.add(lightRig);
    buildSidebar();
    gallery.markDirty();               // rebuilds immediately if visible
    if (mode === 'single') {
      const i = liveRoster.findIndex((e) => e.key === currentKey);
      showModel(i >= 0 ? i : 0);
    }
    toast('reloaded');
    return true;
  } catch (e) {
    console.error('[mv] reload failed:', e);
    toast('reload failed — see console', true);
    return false;
  }
}

// ---- click-to-edit: which file is this model's builder in? ----------------
// Derived from the kit facade itself (`export { makeDog } from './dog.js'`),
// so it stays correct as the kit grows — no per-model annotation to maintain.
// Clicking opens the file in VS Code via vscode://file/ when the mv-root meta
// tag names this machine's repo path; otherwise it copies the relative path.
const MV_ROOT = (document.querySelector('meta[name="mv-root"]') || {}).content || '';
let sourceMap = null;          // kit export name -> repo-relative path

function rebuildSourceMap(indexText) {
  if (!indexText) return;
  sourceMap = {};
  for (const m of indexText.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const rel = new URL(m[2], KIT_URL).pathname.replace(/^\//, '');
    for (const piece of m[1].split(',')) {
      const name = piece.trim().split(/\s+as\s+/).pop().trim();
      if (name) sourceMap[name] = rel;
    }
  }
}

function sourceFileFor(key) {
  if (!sourceMap) return null;
  const entry = liveRoster.find((e) => e.key === key);
  const name = entry && (String(entry.build).match(/kit\s*\.\s*(\w+)/) || [])[1];
  return (name && sourceMap[name]) || null;
}

function openSource(key) {
  const file = sourceFileFor(key);
  if (!file) { toast('source file unknown'); return; }
  if (MV_ROOT) {
    location.href = `vscode://file/${MV_ROOT.replace(/\/+$/, '')}/${file}`;
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(file).then(() => toast('path copied: ' + file), () => toast(file));
  } else {
    toast(file);
  }
}

// discover the watch list without building any modules: just crawl the texts
async function crawlTexts() {
  const texts = new Map();
  async function walk(url) {
    if (texts.has(url)) return;
    texts.set(url, null);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { texts.delete(url); return; }   // comment-matched fake path
      const src = await res.text();
      texts.set(url, src);
      const jobs = [];
      for (const m of src.matchAll(FROM_RE)) {
        const spec = m[3];
        if (!spec.startsWith('.')) continue;
        const abs = new URL(spec, url).href;
        if (abs.startsWith(SRC_PREFIX)) jobs.push(walk(abs));
      }
      await Promise.all(jobs);
    } catch { texts.delete(url); }
  }
  await Promise.all([walk(KIT_URL), walk(ROSTER_URL)]);
  return texts;
}

async function poll() {
  if (pollBusy || !watched.size) return;
  pollBusy = true;
  try {
    let changed = false;
    await Promise.all([...watched.keys()].map(async (url) => {
      try {
        const t = await (await fetch(url, { cache: 'no-store' })).text();
        // update BEFORE reloading so a broken save doesn't retrigger every
        // second — the next actual edit retries
        if (t !== watched.get(url)) { watched.set(url, t); changed = true; }
      } catch { /* transient (mid-save) — next poll sees it */ }
    }));
    if (changed) await doReload();
  } finally { pollBusy = false; }
}

// ---- sweep (?sweep): does everything still build? ------------------------
async function sweep() {
  const failures = [];
  for (const entry of liveRoster) {
    try {
      const { obj } = instantiate(entry, liveKit);
      disposeGroup(obj);
    } catch (e) {
      failures.push({ key: entry.key, error: String(e && e.message || e) });
      console.error('[mv sweep]', entry.key, e);
    }
  }
  window.__mvSweepResult = { total: liveRoster.length, failures };
  if (failures.length) toast(`sweep: ${failures.length}/${liveRoster.length} FAILED — see console`, true);
  else console.log(`[mv sweep] all ${liveRoster.length} models build`);
}

// ---- boot -----------------------------------------------------------------
buildSidebar();
onResize();
onHash();                        // picks single or gallery from the URL, cold
frame(16.7);                     // a real first frame lands synchronously for either path
window.__mvReady = true;
requestAnimationFrame(tick);

if (new URLSearchParams(location.search).has('sweep')) sweep();
crawlTexts().then((t) => {
  watched = t;
  rebuildSourceMap(t.get(KIT_URL));
  if (mode === 'single' && currentKey) $('fb-file').textContent = sourceFileFor(currentKey) || '';
}).catch((e) => console.warn('[mv] watch crawl failed:', e));
setInterval(poll, 1000);

// verification hooks for the one-shot headless driver (shot.js): rAF is
// paused in headless Chrome, so a driver steps frames by hand — same house
// pattern as gate.step() and kp.step()
window.__mvStep = (n = 1) => { for (let i = 0; i < n; i++) frame(16.7); };
window.__mvCam = () => ({ az, el, dist, key: currentKey });
window.__mvReload = doReload;
window.__mvGalleryCellUUID = (key) => gallery.cellUUID(key);
