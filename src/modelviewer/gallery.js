// Gallery mode: the whole roster at once, using the standard three.js
// "many elements, one canvas" technique — ONE scene holding every model group
// spaced far apart along X, ONE renderer on ONE full-viewport canvas behind
// the DOM grid, and a scissor/viewport pass per on-screen cell each frame.
//
// pixelRatio is FORCED to 1 (not capped) so getBoundingClientRect()'s CSS
// pixels are usable directly as scissor coordinates with no DPR math.
// WebGL viewport Y is bottom-up: y = innerHeight - rect.bottom.
//
// Lifecycle: mounts lazily on first show() and never unmounts — hide() only
// stops the rAF loop and hides the DOM. Keeping a roster of low-poly geometry
// resident is a bounded one-time cost that makes view switching instant;
// staleness after a hot reload is handled by markDirty(), not disposal.

import * as THREE from '../../lib/three.module.js';
import { PAPER } from '../palette.js';
import { instantiate } from './roster.js';
import * as checklist from './checklist.js';

const SPACING = 120;            // wide vs the narrow FOV: neighbors stay out of frame
const RENDER_MARGIN_PX = 200;   // build cells a little past the viewport edge
const YAW = 40 * Math.PI / 180, PITCH = 18 * Math.PI / 180;   // the judging 3/4 view

export function createGallery({ getKit, getRoster, toast, onChecklistChange }) {
  let mounted = false, visible = false, dirty = true;
  let renderer, scene, camera, lightRig;
  let container, grid, canvas;
  let raf = 0;
  const cells = new Map();      // key -> { entry, group, center, radius, viewEl }

  function mount() {
    canvas = document.createElement('canvas');
    canvas.id = 'gallery-canvas';
    container = document.createElement('div');
    container.id = 'gallery';
    container.innerHTML = `
      <div id="gallery-head">
        <button id="gallery-back">&larr; back</button>
        <span id="gallery-title"></span>
        <button id="gallery-export">copy checklist</button>
        <button id="gallery-clear">clear notes</button>
      </div>
      <div id="gallery-grid"></div>`;
    document.body.append(canvas, container);
    grid = container.querySelector('#gallery-grid');
    container.querySelector('#gallery-back').onclick = () => history.back();
    container.querySelector('#gallery-export').onclick = exportChecklist;
    container.querySelector('#gallery-clear').onclick = clearChecklist;

    renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
    renderer.setPixelRatio(1);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 0.01, 500);
    mounted = true;
  }

  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.isMesh) {
        o.geometry && o.geometry.dispose();
        // materials yes, textures no: toon gradient maps are shared module-wide
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
  }

  function cellDom(entry) {
    const root = document.createElement('div');
    root.className = 'cell';
    const st = checklist.get(entry.key);
    root.innerHTML = `
      <div class="cell-top">
        <span class="cell-key">${entry.key}</span>
        <span class="cell-marks">
          <button class="mark-ok${st.state === 'ok' ? ' on' : ''}" title="ok">&#10003;</button>
          <button class="mark-needs${st.state === 'needs' ? ' on' : ''}" title="needs work">&#10005;</button>
        </span>
      </div>
      <div class="cell-view"></div>
      <input class="cell-note" placeholder="note&hellip;">`;
    const [ok, needs] = [root.querySelector('.mark-ok'), root.querySelector('.mark-needs')];
    const note = root.querySelector('.cell-note');
    note.value = st.note;
    const mark = (state) => () => {
      const cur = checklist.get(entry.key).state;
      const next = cur === state ? null : state;
      checklist.set(entry.key, { state: next });
      ok.classList.toggle('on', next === 'ok');
      needs.classList.toggle('on', next === 'needs');
      onChecklistChange && onChecklistChange(entry.key);
    };
    ok.onclick = mark('ok');
    needs.onclick = mark('needs');
    note.oninput = () => {
      checklist.set(entry.key, { note: note.value });
      onChecklistChange && onChecklistChange(entry.key);
    };
    return { root, view: root.querySelector('.cell-view') };
  }

  function rebuild() {
    for (const c of cells.values()) if (c.group) { scene.remove(c.group); disposeGroup(c.group); }
    cells.clear();
    grid.innerHTML = '';
    if (lightRig) scene.remove(lightRig);
    lightRig = getKit().makeLights();
    scene.add(lightRig);

    const roster = getRoster();
    let section = null;
    roster.forEach((entry, i) => {
      if (entry.section !== section) {
        section = entry.section;
        const h = document.createElement('div');
        h.className = 'cell-section';
        h.textContent = section;
        grid.append(h);
      }
      const dom = cellDom(entry);
      grid.append(dom.root);
      try {
        const { obj } = instantiate(entry, getKit());
        const group = new THREE.Group();
        group.add(obj);
        group.position.x = i * SPACING;
        scene.add(group);
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3()).add(group.position);
        const radius = Math.max(0.001, box.getSize(new THREE.Vector3()).length() / 2);
        cells.set(entry.key, { entry, group, center, radius, viewEl: dom.view });
      } catch (e) {
        dom.view.textContent = 'ERR: ' + (e && e.message || e);
        dom.view.classList.add('cell-err');
        cells.set(entry.key, { entry, viewEl: dom.view });
      }
    });
    container.querySelector('#gallery-title').textContent =
      `gallery — ${roster.length} models`;
    dirty = false;
  }

  function render() {
    if (!mounted) return;
    if (canvas.width !== innerWidth || canvas.height !== innerHeight) {
      renderer.setSize(innerWidth, innerHeight, false);
    }
    renderer.setScissorTest(false);
    renderer.setClearColor(new THREE.Color(PAPER), 1);
    renderer.clear();
    const H = innerHeight;
    for (const c of cells.values()) {
      if (!c.group) continue;
      const r = c.viewEl.getBoundingClientRect();
      if (r.bottom < -RENDER_MARGIN_PX || r.top > H + RENDER_MARGIN_PX
        || r.width < 4 || r.height < 4) continue;
      const y = H - r.bottom;
      renderer.setScissorTest(true);
      renderer.setScissor(r.left, y, r.width, r.height);
      renderer.setViewport(r.left, y, r.width, r.height);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
      const d = c.radius * 3.6;
      camera.position.set(
        c.center.x + Math.sin(YAW) * Math.cos(PITCH) * d,
        c.center.y + Math.sin(PITCH) * d,
        c.center.z + Math.cos(YAW) * Math.cos(PITCH) * d,
      );
      camera.lookAt(c.center);
      renderer.render(scene, camera);
    }
  }

  function loop() {
    if (!visible) return;
    render();
    raf = requestAnimationFrame(loop);
  }

  function exportChecklist() {
    const md = checklist.exportMarkdown(getRoster().map((e) => e.key));
    if (!md) { toast('nothing marked yet'); return; }
    navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(md)
        .then(() => toast('checklist copied'))
        .catch(() => fallbackExport(md))
      : fallbackExport(md);
  }

  function clearChecklist() {
    const n = checklist.count();
    if (!n) { toast('nothing to clear'); return; }
    if (!confirm(`Clear all marks and notes? ${n} model${n === 1 ? '' : 's'} marked — this cannot be undone.`)) return;
    checklist.clear();
    // reset the cell UI in place — the meshes don't need a rebuild for this
    grid.querySelectorAll('.mark-ok.on, .mark-needs.on').forEach((b) => b.classList.remove('on'));
    grid.querySelectorAll('.cell-note').forEach((i) => { i.value = ''; });
    onChecklistChange && onChecklistChange(null);      // null = everything changed
    toast('checklist cleared');
  }

  // headless / insecure contexts have no clipboard API — show a selectable box
  function fallbackExport(md) {
    const wrap = document.createElement('div');
    wrap.id = 'gallery-export-fallback';
    const ta = document.createElement('textarea');
    ta.value = md;
    const close = document.createElement('button');
    close.textContent = 'close';
    close.onclick = () => wrap.remove();
    wrap.append(ta, close);
    container.append(wrap);
    ta.select();
  }

  return {
    show() {
      if (!mounted) mount();
      if (dirty) rebuild();
      container.style.display = 'block';
      canvas.style.display = 'block';
      visible = true;
      render();
      window.__mvGalleryReady = true;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    },
    hide() {
      visible = false;
      cancelAnimationFrame(raf);
      if (mounted) { container.style.display = 'none'; canvas.style.display = 'none'; }
    },
    markDirty() {
      dirty = true;
      if (visible) { rebuild(); render(); }
    },
    render,
    isVisible: () => visible,
    // lets a headless driver prove a hot reload actually REPLACED a mesh
    // object rather than having to compare pixels
    cellUUID(key) {
      const c = cells.get(key);
      return c && c.group && c.group.children[0] ? c.group.children[0].uuid : null;
    },
  };
}
