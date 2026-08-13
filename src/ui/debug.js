import * as THREE from '../../lib/three.module.js';
import { setGrassPatchiness, setGrassReach, setGrassTaper } from '../kit/grassfield.js';
import { LAMBERT_LIFT } from '../kit/tuftfield.js';
import { wash } from '../palette.js';
import { setFoliageWeather } from '../kit/foliage.js';
import { plainMaterial } from '../render/material.js';
import { DRAW_BUDGET, DRAW_WARN } from '../budget.js';

// A workbench: a toolbar button top-right of the stage, and a plain panel that
// slides out under it. Deliberately unstyled beyond the minimum — this is for
// pulling the look apart, not part of the book. The button stays put while the
// panel is open so the same click closes it.
//
// Everything here is applied to whatever scene is CURRENTLY active and re-applied
// after every scene swap, so settings survive moving between cases.

// Defaults are the INK & SEAL preset: no toon banding, depth-driven ink, real
// contact shadows, paper pass at full grain, no quantisation. One red seal
// per koan. The version suffix on KEY below is bumped when a default LOOK
// changes, since a stored state would otherwise mask it: v3 turned the ink
// outlines on (the hull, since deleted), v4 dropped ink strength to 0.5,
// v5 turned the hull off by default (ink width 0), v6 is Frank's live tune
// of the weather: more wind in the grass, a broader and slower-drifting
// gust, patchier placement, and a hairline of hull ink back on (all Frank).
// v7 is the weather retuned again once the TREES started answering these same
// three numbers (kit/foliage.js): grass wind 1.5 -> 3.0 and the gust patch
// 0.01 -> 0.08, a much tighter patch so a gust crosses as weather rather than
// lifting the whole meadow and every tree in it at once.
const KEY = 'gateless-gate-debug-v7';
// Persistence is opt-in. By default the workbench opens on the shipped defaults
// every reload, so a quick test can never quietly leave the look changed the next
// time round. The "Keep settings on reload" toggle (below "reset all") turns it
// on; its own flag is the one thing always remembered, otherwise there'd be no
// way to switch persistence on and have it survive a reload.
const PERSIST_KEY = 'gateless-gate-debug-persist';

// Developer mode: whether the contents grows a "Developer" section with the
// tools in it (the showcase, and whatever follows it). Its own key, remembered
// unconditionally — exactly like PERSIST_KEY above and for the same reason: a
// flag that only survives when some OTHER flag is on is a flag nobody can turn
// on. It is NOT one of the CONTROLS, because those are look settings that get
// wiped by "reset all" and re-applied to every scene; this one changes what the
// app offers, not what it renders. Off by default: with it off the app is
// identical to what it was before this existed.
const DEV_KEY = 'gateless-gate-dev';

// Whether the panel itself was left OPEN. Its own key for the same reason
// DEV_KEY has one: this is a switch about what the app is showing you, not a
// look setting, so it is remembered unconditionally and "reset all" (which only
// walks CONTROLS) never touches it.
//
// DEVELOPER MODE GATES THE RESTORE, not the remembering (Frank). The flag is
// written whenever the panel is toggled, but a reload only reopens the panel if
// developer mode is also on — so a reader who once opened the workbench out of
// curiosity gets the book back on the next visit, while the one machine that
// has developer mode ticked keeps its workbench where it left it.
const PANEL_KEY = 'gateless-gate-debug-panel';

// Read outside makeDebug, so main.js can build the menu with the right shape on
// the first frame rather than popping the section in once the workbench mounts.
export function devModeOn() {
  try { return localStorage.getItem(DEV_KEY) === '1'; } catch { return false; }
}

const CONTROLS = [
  { group: 'Scene' },
  { key: 'grass', label: 'Grass field', type: 'bool', def: true },
  { key: 'grassTone', label: 'Grass tone', type: 'range', def: 0.62, min: 0.2, max: 0.9, step: 0.01 },
  { key: 'grassWind', label: 'Grass wind', type: 'range', def: 3.0, min: 0, max: 9, step: 0.05 },
  { key: 'grassPatch', label: 'Grass patch (re-enter)', type: 'range', def: 0.7, min: 0, max: 0.8, step: 0.02 },
  // How far the meadow reaches, and how much of that reach it spends dissolving
  // — a low taper starts thinning early and fades over a long way, a high one
  // holds the field solid and lets it go near the edge. The plant budget scales
  // with the reach (composeWorld), so pulling this out adds grass rather than
  // stretching the same grass thinner.
  { key: 'grassReach', label: 'Grass reach (re-enter)', type: 'range', def: 24, min: 12, max: 34, step: 1 },
  { key: 'grassTaper', label: 'Grass taper (re-enter)', type: 'range', def: 0.45, min: 0.2, max: 0.9, step: 0.05 },
  { key: 'gustScale', label: 'Gust patch', type: 'range', def: 0.08, min: 0.001, max: .25, step: 0.001 },
  { key: 'gustSpeed', label: 'Gust drift', type: 'range', def: 12, min: 0, max: 99, step: 1.0 },
  { key: 'trees', label: 'Trees', type: 'bool', def: true },
  { key: 'forest', label: 'Forest', type: 'bool', def: true },
  { key: 'mountains', label: 'Mountains', type: 'bool', def: true },
  { key: 'scatter', label: 'Rocks & bushes', type: 'bool', def: true },
  { key: 'path', label: 'Path', type: 'bool', def: true },
  // The scene's invisible half: keepouts, footprints, the scatter ring, and a
  // stem on everything placed. src/dev/overlay.js draws it; off by default,
  // because it is a tool for editing a scene rather than for looking at one.
  { key: 'layout', label: 'Layout guides', type: 'bool', def: false },

  { group: 'Camera' },
  { key: 'lens', label: 'Lens (fov°)', type: 'range', def: 38, min: 16, max: 50, step: 1 },
  { key: 'freeCam', label: 'Free cam (WASD·QE·drag)', type: 'bool', def: false },
  { action: 'shot', label: 'Screenshot (P)', text: 'Save' },

  { group: 'Render' },
  { key: 'toon', label: 'Toon shader', type: 'bool', def: false },
  { key: 'grain', label: 'Paper texture', type: 'bool', def: true },   // master: off = no paper at all
  { key: 'shadows', label: 'Real shadows', type: 'bool', def: true },
  { key: 'fogMul', label: 'Fog ×', type: 'range', def: 1, min: 0, max: 3, step: 0.05 },
  { key: 'sunMul', label: 'Sun ×', type: 'range', def: 1, min: 0, max: 3, step: 0.05 },
  { key: 'ambMul', label: 'Ambient ×', type: 'range', def: 1, min: 0, max: 3, step: 0.05 },

  { group: 'Post' },
  { key: 'pQuant', label: 'Quantise', type: 'bool', def: false },
  { key: 'quantSteps', label: '· steps', type: 'range', def: 10, min: 3, max: 24, step: 1 },
  { key: 'quantAmt', label: '· amount', type: 'range', def: 0.7, min: 0, max: 1, step: 0.05 },
  { key: 'pInk', label: 'Ink (depth edges)', type: 'bool', def: true },
  { key: 'inkStrength', label: '· strength', type: 'range', def: 0.5, min: 0, max: 1, step: 0.05 },
  { key: 'inkThresh', label: '· threshold', type: 'range', def: 0.06, min: 0.01, max: 0.4, step: 0.01 },
  { key: 'inkFade', label: '· distance fade', type: 'range', def: 0.45, min: 0.05, max: 1, step: 0.05 },
  { key: 'pPaper', label: 'Paper via shader', type: 'bool', def: true },
  { key: 'paperAmt', label: '· grain', type: 'range', def: 1.0, min: 0, max: 1, step: 0.05 },
  { key: 'paperVig', label: '· vignette', type: 'range', def: 0.7, min: 0, max: 1.5, step: 0.05 },

  { group: 'Audio' },
  { key: 'sound', label: 'Sound on', type: 'bool', def: false },
  { key: 'windScale', label: 'Wind ×', type: 'range', def: 1, min: 0, max: 3, step: 0.05 },
];

function defaults() {
  const s = {};
  for (const c of CONTROLS) if (c.key) s[c.key] = c.def;
  return s;
}

function loadPersist() {
  try { return localStorage.getItem(PERSIST_KEY) === '1'; } catch { return false; }
}

function loadPanelOpen() {
  try { return localStorage.getItem(PANEL_KEY) === '1'; } catch { return false; }
}

function load(persist) {
  if (!persist) return defaults();
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch { return defaults(); }
}

export function makeDebug({ renderer, getScene, audio, grainEls = [], post = null, onSound, onLens, onFreeCam, onDevMode, onShot, onLayout, onPanel, compose = null }) {
  const composeEl = compose && compose.el;
  let persist = loadPersist();
  const state = load(persist);
  const inputs = {};
  // No-op while persistence is off, so every tweak stays in memory only and the
  // next reload starts clean. The keep-saved toggle below flips `persist`.
  const save = () => { if (!persist) return; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } };

  // ---- chrome -------------------------------------------------------------
  const button = document.createElement('button');
  button.className = 'gg-debug-toggle';
  button.textContent = '⚙';
  button.title = 'Debug panel';

  const panel = document.createElement('div');
  panel.className = 'gg-debug';

  const readout = document.createElement('div');
  readout.className = 'gg-debug-readout';
  panel.appendChild(readout);

  for (const c of CONTROLS) {
    if (c.group) {
      const h = document.createElement('div');
      h.className = 'gg-debug-group';
      h.textContent = c.group;
      panel.appendChild(h);
      continue;
    }
    const row = document.createElement('label');
    row.className = 'gg-debug-row';
    const name = document.createElement('span');
    name.textContent = c.label;
    row.appendChild(name);

    // An action, not a setting: it has no key, holds no state, and is never
    // persisted or reset. defaults() walks CONTROLS by `key`, so a keyed
    // button would leave a junk entry in the saved settings blob.
    if (c.action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gg-debug-act';
      b.textContent = c.text;
      b.onclick = () => { if (c.action === 'shot') onShot && onShot(); };
      row.appendChild(b);
      panel.appendChild(row);
      continue;
    }

    if (c.type === 'bool') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!state[c.key];
      input.onchange = () => {
        state[c.key] = input.checked;
        save();
        // sound is owned by the audio engine (the corner control shares it), so
        // push it rather than letting apply() force it back every scene swap
        if (c.key === 'sound') {
          audio && audio.unlock();
          audio && audio.setSound(input.checked);
          onSound && onSound(input.checked);
        }
        apply();
      };
      inputs[c.key] = input;
      row.appendChild(input);
    } else {
      const val = document.createElement('em');
      val.textContent = (+state[c.key]).toFixed(2);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = c.min; input.max = c.max; input.step = c.step;
      input.value = state[c.key];
      input.oninput = () => {
        state[c.key] = parseFloat(input.value);
        val.textContent = (+state[c.key]).toFixed(2);
        save(); apply();
      };
      row.appendChild(val);
      row.appendChild(input);
    }
    panel.appendChild(row);
  }

  // Composing lives above "reset all" because it is a per-page tool, not a
  // whole-panel one, and it is hidden outright unless developer mode is on —
  // the same rule the Developer section of the Contents follows.
  if (composeEl) panel.appendChild(composeEl);
  const syncCompose = () => { if (composeEl) composeEl.style.display = devModeOn() ? '' : 'none'; };
  syncCompose();

  const reset = document.createElement('button');
  reset.className = 'gg-debug-reset';
  reset.textContent = 'reset all';
  // Push state back into a control's widget. Rows are found by their label,
  // which is what "reset all" always did; this is the same walk, callable for
  // one key, because a case pinning its own grass wind has to move that slider.
  function syncRow(key) {
    const c = CONTROLS.find((x) => x.key === key);
    if (!c) return;
    for (const el of panel.querySelectorAll('input')) {
      const row = el.closest('.gg-debug-row');
      const span = row && row.querySelector('span');
      if (!span || span.textContent !== c.label) continue;
      if (el.type === 'checkbox') el.checked = !!state[key];
      else { el.value = state[key]; row.querySelector('em').textContent = (+state[key]).toFixed(2); }
      return;
    }
  }

  reset.onclick = () => {
    Object.assign(state, defaults());
    save();
    for (const c of CONTROLS) if (c.key) syncRow(c.key);
    apply();
  };
  panel.appendChild(reset);

  // Persistence toggle — sits under "reset all" because it is the same kind of
  // whole-panel control. Off by default; checking it snapshots what's on screen
  // now and keeps it across reloads, unchecking it forgets the stored settings
  // again (the flag itself is always remembered).
  const keepRow = document.createElement('label');
  keepRow.className = 'gg-debug-row gg-debug-keep';
  const keepName = document.createElement('span');
  keepName.textContent = 'Keep settings on reload';
  const keepInput = document.createElement('input');
  keepInput.type = 'checkbox';
  keepInput.checked = persist;
  keepInput.onchange = () => {
    persist = keepInput.checked;
    try { localStorage.setItem(PERSIST_KEY, persist ? '1' : '0'); } catch { /* private mode */ }
    if (persist) save();                                                  // snapshot the current look
    else { try { localStorage.removeItem(KEY); } catch { /* ignore */ } } // stop keeping it
  };
  keepRow.appendChild(keepName);
  keepRow.appendChild(keepInput);
  panel.appendChild(keepRow);

  // Developer mode — directly below the persistence toggle, because it is the
  // same kind of thing: a switch about the APP rather than about the look, and
  // so remembered on its own terms and untouched by "reset all".
  const devRow = document.createElement('label');
  devRow.className = 'gg-debug-row gg-debug-keep';
  const devName = document.createElement('span');
  devName.textContent = 'Developer mode';
  const devInput = document.createElement('input');
  devInput.type = 'checkbox';
  devInput.checked = devModeOn();
  devInput.onchange = () => {
    try { localStorage.setItem(DEV_KEY, devInput.checked ? '1' : '0'); } catch { /* private mode */ }
    syncCompose();
    onDevMode && onDevMode(devInput.checked);
  };
  devRow.appendChild(devName);
  devRow.appendChild(devInput);
  panel.appendChild(devRow);

  // The one way the panel opens or closes — the click below and the restore in
  // mount() both come through here, so the class, the button's lit state, the
  // remembered flag and the renderer's idea of the stage size can never drift
  // apart. (Same reasoning as the `toggle(key)` method at the bottom of this
  // file: a second path that sets the same state is a second path to be wrong.)
  function setPanel(open) {
    panel.classList.toggle('open', open);
    button.classList.toggle('active', open);
    try { localStorage.setItem(PANEL_KEY, open ? '1' : '0'); } catch { /* private mode */ }
    // The panel is a column beside the stage, not a sheet over it, so opening
    // it RESIZES the viewport. Nothing in the page fires a resize event for a
    // layout change of its own, so the renderer has to be told (the same reason
    // main.js's applyStageSize exists for the look).
    onPanel && onPanel(open);
  }

  button.onclick = () => setPanel(!panel.classList.contains('open'));

  // ---- application --------------------------------------------------------
  // Authored values are captured the first time a scene is seen, so the sliders
  // act as multipliers over whatever each case intended rather than flat values.
  // The clone itself is plainMaterial() in render/material.js — the model viewer
  // needs the identical one, and the list of properties it has been caught
  // dropping is long enough that a second copy would repeat it. This is only
  // the cache: one plain material per mesh, built the first time it is asked
  // for and reused for every later toggle.
  function plainMaterialFor(mesh) {
    if (!mesh.userData._matPlain) mesh.userData._matPlain = plainMaterial(mesh.userData._matToon);
    return mesh.userData._matPlain;
  }

  // The grass field the wind slider was last synced against. A page turn builds
  // a new one, which is the signal to adopt that case's pinned wind (below).
  let windField = null;

  function apply() {
    const scene = getScene && getScene();
    if (scene) {
      if (scene.fog && scene.userData._fog0 === undefined) scene.userData._fog0 = scene.fog.density;

      scene.traverse((o) => {
        switch (o.name) {
          case 'grassfield': case 'grass': o.visible = state.grass; break;
          case 'tree': o.visible = state.trees; break;
          case 'forest': o.visible = state.forest; break;
          case 'mountains': o.visible = state.mountains; break;
          case 'rocks': case 'bushes': o.visible = state.scatter; break;
          case 'path': o.visible = state.path; break;
          default: break;
        }

        if (o.isDirectionalLight) {
          if (o.userData._i0 === undefined) o.userData._i0 = o.intensity;
          o.intensity = o.userData._i0 * state.sunMul;
          o.castShadow = state.shadows;
        }
        if (o.isAmbientLight || o.isHemisphereLight) {
          if (o.userData._i0 === undefined) o.userData._i0 = o.intensity;
          o.intensity = o.userData._i0 * state.ambMul;
        }

        if (o.isMesh) {
          // `noShadow` opts a mesh out of the shadow map entirely — water and
          // foam set it: an ocean-sized sheet outruns the sun's shadow camera
          // and the far-plane cut painted a phantom triangle of shadow on the
          // open sea (case 20).
          // `noShadow` excuses a mesh from the shadow map entirely — water and
          // foam set it. `noCastShadow` is the weaker half: do not CAST, but do
          // still receive. The meadow needs exactly that, and needed a flag of
          // its own to get it: tuftfield sets mesh.castShadow = false at build,
          // and this line ran afterwards and turned it straight back on, so the
          // grass has been casting shadow on every page against its own
          // builder's stated intent. It is a field of camera-facing cards, and
          // the shadow pass does not run the billboard shader, so what the map
          // received was a grid of identical parallel quads — see grassshade.js
          // for what replaced it.
          o.castShadow = state.shadows && o.name !== 'ground'
            && !o.userData.noShadow && !o.userData.noCastShadow;
          o.receiveShadow = state.shadows && !o.userData.noShadow;
          // Some materials must survive this swap untouched — `keepMaterial`.
          //
          // The toon toggle rebuilds every material as a plain Lambert, which
          // silently destroys anything the original did beyond carrying a
          // colour: the grass's wind bend lives in its shader and would freeze
          // mid-stride, and the moon is deliberately UNLIT — cloning it to
          // Lambert put it under the sun, so it darkened and brightened with the
          // lighting like any other surface. That cost an evening of arguing
          // about the wrong cause, because the source material said Basic while
          // the running scene said Lambert.
          if (o.name !== 'grassfield' && !o.userData.keepMaterial) {
            if (!o.userData._matToon) o.userData._matToon = o.material;
            o.material = state.toon ? o.userData._matToon : plainMaterialFor(o);
          }
        }
      });

      if (scene.fog) scene.fog.density = scene.userData._fog0 * state.fogMul;

      const field = scene.getObjectByName('grassfield');
      // THE TONE, LIVE. Draggable rather than a re-enter knob because the
      // meadow's colour is the material's alone now (tuftfield.js), so there is
      // nothing per-instance to rebuild. Looked up fresh from the scene rather
      // than kept from build time, because a page turn builds a brand new mesh
      // and material — writing to a reference held from an earlier scene would
      // land on an object that is not being drawn, which is exactly how case
      // 4's ink spent its life invisible.
      //
      // The slider's raw wash() value is NOT the material's colour: tuftfield.js
      // lifts every tuft's authored colour by LAMBERT_LIFT before it reaches the
      // material, because Lambert takes the field's single N·L directly (no
      // ramp, no emissive floor) and needs the lift to land the unshadowed field
      // at the same luminance the old ramp gave it. Writing the raw tone here
      // without the same lift would silently erase it on every page build, the
      // moment after tuftfield.js applied it. No emissive write any more either
      // — Lambert grass carries no emissive floor to restore.
      if (field && field.material) {
        const tone = wash(state.grassTone);
        field.material.color.set(tone).multiplyScalar(LAMBERT_LIFT);
      }
      if (field && field.userData.uniforms) {
        const u = field.userData.uniforms;
        // A case that pinned its own weather (composeWorld's grassWind /
        // grassGustScale / grassGustSpeed) MOVES THE SLIDERS on arrival, rather
        // than the sliders overwriting it. apply() runs on every page build in
        // every mode, so the naive assignments below erased a case's weather on
        // the frame its field was born — which is why none of this could be
        // per-case at all. Adopting keeps one rule ("the uniform is what the
        // slider reads") and still lets a pinned case be auditioned by
        // dragging, which is the whole point of the panel. Only on a NEW
        // field, or every apply would drag the sliders back mid-tweak.
        if (field !== windField) {
          windField = field;
          const adopt = (caseKey, stateKey) => {
            const pinned = field.userData[caseKey];
            if (pinned != null && pinned !== state[stateKey]) {
              state[stateKey] = pinned;
              syncRow(stateKey);
            }
          };
          adopt('caseWind', 'grassWind');
          adopt('caseGustScale', 'gustScale');
          adopt('caseGustSpeed', 'gustSpeed');
        }
        u.uWind.value = state.grassWind;
        u.uGustScale.value = state.gustScale;
        u.uGustSpeed.value = state.gustSpeed;
      }

      // The blooms ride the SAME weather as the blades (kit/wildflowers.js):
      // these are the same three numbers, so the sliders — and therefore a
      // case's pinned wind, which the adopt() above has already moved them to
      // — reach the meadow's flowers as well as its grass. Written straight
      // into the live record, the mirror of the grass's uniforms above.
      const bloomField = scene.getObjectByName('wildflowers');
      if (bloomField && bloomField.userData.wind) {
        const w = bloomField.userData.wind;
        w.wind = state.grassWind;
        w.gustScale = state.gustScale;
        w.gustSpeed = state.gustSpeed;
      }
    }

    // ...and the trees and pines, off the same three numbers. Not inside the
    // `grass` branch above and not looked up in the scene: the foliage wind is
    // ONE shared uniform record for the whole book (kit/foliage.js), so this is
    // a single write with no traverse, and turning the grass field off must not
    // also still the wood. setFoliageWeather scales the grass's wind down on
    // its way in — a tree that leaned as far as a blade of grass would be the
    // bowing-tree look this replaced.
    setFoliageWeather({
      wind: state.grassWind,
      gustScale: state.gustScale,
      gustSpeed: state.gustSpeed,
    });

    setGrassPatchiness(state.grassPatch);
    setGrassReach(state.grassReach);
    setGrassTaper(state.grassTaper);
    onLens && onLens(state.lens);
    onFreeCam && onFreeCam(state.freeCam);
    // After the traverse, not inside it: the guides are built FROM the finished
    // scene, and main.js rebuilds them per page because a stale overlay would
    // draw the last case's keepouts over this one.
    onLayout && onLayout(state.layout);
    renderer.shadowMap.enabled = state.shadows;
    // PCFShadowMap, not PCFSoft: three r185 deprecated the soft variant and
    // silently falls back to this one anyway, warning on the console at every
    // boot. Naming it directly changes nothing about what renders — the fallback
    // was already what shipped — and the startup log goes quiet.
    renderer.shadowMap.type = THREE.PCFShadowMap;

    if (post) {
      post.set('quantize', state.pQuant);
      post.set('ink', state.pInk);
      // `grain` is the master switch for paper of any kind; `pPaper` only picks
      // which one draws it. Without this the two silently covered for each
      // other — turning the paper PASS off just handed the same texture to the
      // DOM overlay, so the button looked broken (Frank) and there was no way
      // to get a clean look at the scene without finding and clearing both.
      post.set('paper', state.pPaper && state.grain);
      post.param('quantize', 'uSteps', state.quantSteps);
      post.param('quantize', 'uAmount', state.quantAmt);
      post.param('ink', 'uStrength', state.inkStrength);
      post.param('ink', 'uThreshold', state.inkThresh);
      post.param('ink', 'uFade', state.inkFade);
      post.param('paper', 'uAmount', state.paperAmt);
      post.param('paper', 'uVignette', state.paperVig);
    }

    // the shader pass replaces the DOM overlay; showing both double-grains
    const domGrain = state.grain && !(post && state.pPaper);
    for (const el of grainEls) if (el) el.style.display = domGrain ? '' : 'none';
    if (audio) {
      // read sound rather than write it: the corner ♪ owns the same flag
      state.sound = audio.isSoundOn();
      if (inputs.sound) inputs.sound.checked = state.sound;
      audio.setWindScale && audio.setWindScale(state.windScale);
    }
  }

  function tick(fps) {
    if (!panel.classList.contains('open')) return;
    // only while the panel is actually on screen — the read-back is DOM writes
    if (compose && composeEl.style.display !== 'none') compose.refresh();
    // with post on, renderer.info reports the last fullscreen quad, not the scene
    const r = (post && post.active) ? post.stats : renderer.info.render;
    // Draws against the book's budget (src/budget.js — the same 150 the
    // staging net enforces). The live count is what the renderer actually
    // issued this frame, so culling and post passes make it wobble a little
    // around the net's static count; the colour is the tell — amber within
    // reach of the line, red over it.
    readout.textContent =
      `${Math.round(fps)} fps · ${r.calls}/${DRAW_BUDGET} draws · ${(r.triangles / 1000).toFixed(0)}k tris`;
    readout.classList.toggle('gg-over', r.calls > DRAW_BUDGET);
    readout.classList.toggle('gg-warn', r.calls > DRAW_WARN && r.calls <= DRAW_BUDGET);
  }

  return {
    button, panel, state, apply, tick,
    // Keyboard-driven flips (main.js binds F to the free cam in dev mode): one
    // entry point that changes the state, the checkbox, the saved blob and the
    // applied effect together, so a hotkey can never drift from the panel.
    toggle(key) {
      state[key] = !state[key];
      if (inputs[key]) inputs[key].checked = !!state[key];
      save();
      apply();
      return state[key];
    },
    // The panel belongs to the stage; the button belongs in the shared toolbar
    // beside sound and fullscreen, so the three read as one row rather than the
    // workbench floating on its own.
    mount(host, buttonHost = host) {
      buttonHost.appendChild(button);
      host.appendChild(panel);
      // Reopen where it was left — see PANEL_KEY: remembered always, restored
      // only in developer mode. It has to happen HERE rather than at
      // construction: the panel narrows the stage, and setPanel's onPanel is
      // what tells the renderer, which can only be right once the panel is
      // actually in the DOM.
      if (devModeOn() && loadPanelOpen()) setPanel(true);
      apply();
    },
  };
}
