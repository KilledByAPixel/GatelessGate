import * as THREE from '../../lib/three.module.js';
import { setGrassPatchiness } from '../kit/grassfield.js';

// A workbench: a toolbar button top-right of the stage, and a plain panel that
// slides out under it. Deliberately unstyled beyond the minimum — this is for
// pulling the look apart, not part of the book. The button stays put while the
// panel is open so the same click closes it.
//
// Everything here is applied to whatever scene is CURRENTLY active and re-applied
// after every scene swap, so settings survive moving between cases.

// Defaults are the INK & SEAL preset: no toon banding, no inverted-hull
// outlines, depth-driven ink, real contact shadows, paper pass at full grain,
// no quantisation. One red seal per koan.
const KEY = 'gateless-gate-debug-v2';

const CONTROLS = [
  { group: 'Scene' },
  { key: 'grass', label: 'Grass field', type: 'bool', def: true },
  { key: 'grassWind', label: 'Grass wind', type: 'range', def: 1, min: 0, max: 3, step: 0.05 },
  { key: 'grassPatch', label: 'Grass patch (re-enter)', type: 'range', def: 0.42, min: 0, max: 0.8, step: 0.02 },
  { key: 'gustScale', label: 'Gust patch', type: 'range', def: 0.055, min: 0.01, max: 0.25, step: 0.005 },
  { key: 'gustSpeed', label: 'Gust drift', type: 'range', def: 2.4, min: 0, max: 12, step: 0.1 },
  { key: 'trees', label: 'Trees', type: 'bool', def: true },
  { key: 'forest', label: 'Forest', type: 'bool', def: true },
  { key: 'mountains', label: 'Mountains', type: 'bool', def: true },
  { key: 'scatter', label: 'Rocks & bushes', type: 'bool', def: true },
  { key: 'path', label: 'Path', type: 'bool', def: true },

  { group: 'Camera' },
  { key: 'lens', label: 'Lens (fov°)', type: 'range', def: 38, min: 16, max: 50, step: 1 },

  { group: 'Render' },
  { key: 'toon', label: 'Toon shader', type: 'bool', def: false },
  { key: 'outlines', label: 'Ink outlines (hull)', type: 'bool', def: false },
  { key: 'grain', label: 'Paper grain', type: 'bool', def: true },
  { key: 'blobs', label: 'Blob shadows', type: 'bool', def: false },
  { key: 'shadows', label: 'Real shadows', type: 'bool', def: true },
  { key: 'fogMul', label: 'Fog ×', type: 'range', def: 1, min: 0, max: 3, step: 0.05 },
  { key: 'sunMul', label: 'Sun ×', type: 'range', def: 1, min: 0, max: 3, step: 0.05 },
  { key: 'ambMul', label: 'Ambient ×', type: 'range', def: 1, min: 0, max: 3, step: 0.05 },

  { group: 'Post' },
  { key: 'pQuant', label: 'Quantise', type: 'bool', def: false },
  { key: 'quantSteps', label: '· steps', type: 'range', def: 10, min: 3, max: 24, step: 1 },
  { key: 'quantAmt', label: '· amount', type: 'range', def: 0.7, min: 0, max: 1, step: 0.05 },
  { key: 'pInk', label: 'Ink (depth edges)', type: 'bool', def: true },
  { key: 'inkStrength', label: '· strength', type: 'range', def: 0.85, min: 0, max: 1, step: 0.05 },
  { key: 'inkThresh', label: '· threshold', type: 'range', def: 0.06, min: 0.01, max: 0.4, step: 0.01 },
  { key: 'inkFade', label: '· distance fade', type: 'range', def: 0.45, min: 0.05, max: 1, step: 0.05 },
  { key: 'pPaper', label: 'Paper pass', type: 'bool', def: true },
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

function load() {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch { return defaults(); }
}

export function makeDebug({ renderer, getScene, audio, grainEls = [], post = null, onSound, onLens }) {
  const state = load();
  const inputs = {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } };

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

  const reset = document.createElement('button');
  reset.className = 'gg-debug-reset';
  reset.textContent = 'reset all';
  reset.onclick = () => {
    Object.assign(state, defaults());
    save();
    for (const el of panel.querySelectorAll('input')) {
      const row = el.closest('.gg-debug-row');
      const label = row.querySelector('span').textContent;
      const c = CONTROLS.find((x) => x.label === label);
      if (!c) continue;
      if (el.type === 'checkbox') el.checked = !!state[c.key];
      else { el.value = state[c.key]; row.querySelector('em').textContent = (+state[c.key]).toFixed(2); }
    }
    apply();
  };
  panel.appendChild(reset);

  button.onclick = () => {
    panel.classList.toggle('open');
    button.classList.toggle('active');
  };

  // ---- application --------------------------------------------------------
  // Authored values are captured the first time a scene is seen, so the sliders
  // act as multipliers over whatever each case intended rather than flat values.
  function plainMaterialFor(mesh) {
    if (!mesh.userData._matPlain) {
      const src = mesh.userData._matToon;
      const m = new THREE.MeshLambertMaterial({
        color: src.color,
        side: src.side,
        flatShading: !!src.flatShading,
        transparent: !!src.transparent,
        opacity: src.opacity ?? 1,
      });
      m.fog = src.fog;
      mesh.userData._matPlain = m;
    }
    return mesh.userData._matPlain;
  }

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
          case 'blobshadow': o.visible = state.blobs; break;
          default: break;
        }
        if (o.userData.isOutline) o.visible = state.outlines;

        if (o.isDirectionalLight) {
          if (o.userData._i0 === undefined) o.userData._i0 = o.intensity;
          o.intensity = o.userData._i0 * state.sunMul;
          o.castShadow = state.shadows;
        }
        if (o.isAmbientLight || o.isHemisphereLight) {
          if (o.userData._i0 === undefined) o.userData._i0 = o.intensity;
          o.intensity = o.userData._i0 * state.ambMul;
        }

        if (o.isMesh && !o.userData.isOutline) {
          o.castShadow = state.shadows && o.name !== 'ground';
          o.receiveShadow = state.shadows;
          // the grass keeps its own material: the wind bend lives in that
          // shader, and swapping it would freeze the field mid-stride
          if (o.name !== 'grassfield') {
            if (!o.userData._matToon) o.userData._matToon = o.material;
            o.material = state.toon ? o.userData._matToon : plainMaterialFor(o);
          }
        }
      });

      if (scene.fog) scene.fog.density = scene.userData._fog0 * state.fogMul;

      const field = scene.getObjectByName('grassfield');
      if (field && field.userData.uniforms) {
        const u = field.userData.uniforms;
        u.uWind.value = state.grassWind;
        u.uGustScale.value = state.gustScale;
        u.uGustSpeed.value = state.gustSpeed;
      }
    }

    setGrassPatchiness(state.grassPatch);
    onLens && onLens(state.lens);
    renderer.shadowMap.enabled = state.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (post) {
      post.set('quantize', state.pQuant);
      post.set('ink', state.pInk);
      post.set('paper', state.pPaper);
      post.param('quantize', 'uSteps', state.quantSteps);
      post.param('quantize', 'uAmount', state.quantAmt);
      post.param('ink', 'uStrength', state.inkStrength);
      post.param('ink', 'uThreshold', state.inkThresh);
      post.param('ink', 'uFade', state.inkFade);
      post.param('paper', 'uAmount', state.paperAmt);
      post.param('paper', 'uVignette', state.paperVig);
    }

    // the paper PASS replaces the DOM overlay; showing both double-grains
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
    // with post on, renderer.info reports the last fullscreen quad, not the scene
    const r = (post && post.active) ? post.stats : renderer.info.render;
    readout.textContent =
      `${Math.round(fps)} fps · ${r.calls} draws · ${(r.triangles / 1000).toFixed(0)}k tris`;
  }

  return {
    button, panel, state, apply, tick,
    // The panel belongs to the stage; the button belongs in the shared toolbar
    // beside sound and fullscreen, so the three read as one row rather than the
    // workbench floating on its own.
    mount(host, buttonHost = host) {
      buttonHost.appendChild(button);
      host.appendChild(panel);
      apply();
    },
  };
}
