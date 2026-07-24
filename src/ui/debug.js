import * as THREE from '../../lib/three.module.js';
import { setGrassPatchiness } from '../kit/grassfield.js';
import { setGrassStyle } from '../kit/scenery.js';

// A workbench: a toolbar button top-right of the stage, and a plain panel that
// slides out under it. Deliberately unstyled beyond the minimum — this is for
// pulling the look apart, not part of the book. The button stays put while the
// panel is open so the same click closes it.
//
// Everything here is applied to whatever scene is CURRENTLY active and re-applied
// after every scene swap, so settings survive moving between cases.

// Defaults are the INK & SEAL preset: no toon banding, depth-driven ink, real
// contact shadows, paper pass at full grain, no quantisation, and the
// inverted-hull ink outlines ON (Frank). One red seal per koan.
// bumped when a default LOOK changes, since a stored state would otherwise
// mask it: v3 turned the ink outlines on, v4 dropped ink strength to 0.5 (Frank)
const KEY = 'gateless-gate-debug-v4';

const CONTROLS = [
  { group: 'Scene' },
  { key: 'grass', label: 'Grass field', type: 'bool', def: true },
  { key: 'grassTufts', label: 'Grass tufts (re-enter)', type: 'bool', def: true },
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
  { key: 'freeCam', label: 'Free cam (WASD·QE·drag)', type: 'bool', def: false },

  { group: 'Render' },
  { key: 'toon', label: 'Toon shader', type: 'bool', def: false },
  { key: 'outlines', label: 'Ink outlines (hull)', type: 'bool', def: true },
  { key: 'grain', label: 'Paper texture', type: 'bool', def: true },   // master: off = no paper at all
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

function load() {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch { return defaults(); }
}

export function makeDebug({ renderer, getScene, audio, grainEls = [], post = null, onSound, onLens, onFreeCam }) {
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
      // Carry the seal's glow across — this clone runs on the SHIPPED default
      // ("toon off"), so any property it drops never renders at all. That is
      // exactly how the moon spent a week secretly lit; see keepMaterial below.
      if (src.emissive) {
        m.emissive.copy(src.emissive);
        m.emissiveIntensity = src.emissiveIntensity ?? 1;
      }
      // ...and visibility. Invisible tap proxies (bell-hit, screen-hit) hide at
      // the MATERIAL level so the raycaster still sees their meshes; dropping
      // this flag resurrected them as big white shells around the things they
      // wrap. Third property this clone has been caught losing (flatShading was
      // designed in, emissive and visible were not): the clone must copy
      // EVERYTHING that affects rendering, not the properties someone thought of.
      m.visible = src.visible;
      // ...and the texture. A material with a map cloned WITHOUT it renders as
      // a bare tinted quad — the cliff's mist sprites shipped that way and
      // nobody could tell what the pale rectangles were. (Fourth property this
      // clone has been caught dropping.)
      if (src.map !== undefined) m.map = src.map;
      if (src.alphaTest) m.alphaTest = src.alphaTest;
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
      if (field && field.userData.uniforms) {
        const u = field.userData.uniforms;
        u.uWind.value = state.grassWind;
        u.uGustScale.value = state.gustScale;
        u.uGustSpeed.value = state.gustSpeed;
      }
    }

    setGrassPatchiness(state.grassPatch);
    setGrassStyle(state.grassTufts ? 'tufts' : 'blades');
    onLens && onLens(state.lens);
    onFreeCam && onFreeCam(state.freeCam);
    renderer.shadowMap.enabled = state.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
