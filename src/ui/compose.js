import { toHeadingPitch, fromHeadingPitch, cameraBlock } from '../camera.js';

// COMPOSING A SHOT. A dev-mode block in the workbench that aims the current
// page's camera live and then hands you the `camera:` line to paste into the
// koan module.
//
// It speaks heading and pitch in DEGREES, not azimuth and polar in radians
// (Frank: "it's in azimuth and polar instead of heading and pitch, and I would
// expect that pitch zero would be horizontal"). The conversion is a pure pair
// in camera.js; this file is the panel around it.
//
// Two things make it a composing tool rather than six number boxes:
//
//  * It READS BACK. Drag the scene with the mouse and the numbers follow, so
//    you can find a framing by hand and then read off what you found. Every
//    field is live except the one being typed into.
//  * It OPENS THE ENVELOPE. Pushing distance or pitch past the rig's stock
//    limits widens them instead of clamping, and the copied block then carries
//    the widened limits with it — the trap k35 sat in, where a framing outside
//    the envelope held on arrival and died at the reader's first scroll.
//
// Testable-state pattern: the arithmetic and the emitted source text live in
// camera.js and are unit-tested; this file is DOM only.

const FIELDS = [
  { key: 'heading', label: 'Heading°', min: -180, max: 180, step: 0.5 },
  { key: 'pitch', label: 'Pitch° (0 = level)', min: -85, max: 85, step: 0.5 },
  { key: 'distance', label: 'Distance', min: 2, max: 30, step: 0.1 },
  { key: 'tx', label: 'Target x', min: -14, max: 14, step: 0.05 },
  { key: 'ty', label: 'Target y', min: -2, max: 10, step: 0.05 },
  { key: 'tz', label: 'Target z', min: -20, max: 10, step: 0.05 },
];

// getRig is a function, not a rig: every page swap builds a fresh one, so
// holding a reference here would aim the camera of the page before last.
export function makeCompose({ getRig }) {
  const el = document.createElement('div');
  el.className = 'gg-compose';

  const head = document.createElement('div');
  head.className = 'gg-debug-group';
  head.textContent = 'Compose';
  el.appendChild(head);

  const rows = {};
  for (const f of FIELDS) {
    const row = document.createElement('label');
    row.className = 'gg-debug-row';
    const name = document.createElement('span');
    name.textContent = f.label;
    const val = document.createElement('em');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = f.min; slider.max = f.max; slider.step = f.step;
    slider.oninput = () => push(f.key, parseFloat(slider.value));
    row.append(name, val, slider);
    el.appendChild(row);
    rows[f.key] = { slider, val };
  }

  const actions = document.createElement('div');
  actions.className = 'gg-debug-row';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'gg-debug-act';
  copy.textContent = 'Copy camera';
  const note = document.createElement('em');
  note.className = 'gg-compose-note';
  actions.append(note, copy);
  el.appendChild(actions);

  // The whole point of the tool: the line that goes in the file. Written to
  // the clipboard AND left on screen, because a clipboard write can be refused
  // (an unfocused page, a locked-down browser) and a composer who has just
  // found the shot should never be told "copied" and handed nothing.
  copy.onclick = () => {
    const line = currentBlock();
    if (!line) return;
    note.textContent = line;
    note.title = line;
    try {
      navigator.clipboard.writeText(line).then(
        () => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy camera'; }, 1200); },
        () => { copy.textContent = 'Select it →'; setTimeout(() => { copy.textContent = 'Copy camera'; }, 1600); },
      );
    } catch {
      copy.textContent = 'Select it →';
      setTimeout(() => { copy.textContent = 'Copy camera'; }, 1600);
    }
  };

  function currentBlock() {
    const rig = getRig();
    if (!rig) return null;
    return cameraBlock(rig.home, rig.target());
  }

  function push(key, v) {
    const rig = getRig();
    if (!rig) return;
    if (key === 'heading' || key === 'pitch') {
      const hp = toHeadingPitch(rig.home);
      hp[key] = v;
      rig.setHome(fromHeadingPitch(hp));
    } else if (key === 'distance') {
      rig.setHome({ distance: v });
    } else {
      const t = rig.target();
      t[{ tx: 0, ty: 1, tz: 2 }[key]] = v;
      rig.setTarget(t[0], t[1], t[2]);
    }
    refresh();
  }

  // Read-back. Skips whichever slider has the pointer on it, so dragging one
  // is not fighting a value being written back underneath it every frame.
  function refresh() {
    const rig = getRig();
    el.style.opacity = rig ? '' : '0.4';
    if (!rig) return;
    const hp = toHeadingPitch(rig.home);
    const t = rig.target();
    const now = {
      heading: hp.heading, pitch: hp.pitch, distance: rig.home.distance,
      tx: t[0], ty: t[1], tz: t[2],
    };
    for (const f of FIELDS) {
      const { slider, val } = rows[f.key];
      const v = now[f.key];
      val.textContent = v.toFixed(f.step < 0.1 ? 2 : 1);
      if (document.activeElement === slider) continue;
      // widen a slider that cannot reach where the camera actually is, rather
      // than parking the handle at the end and lying about the value
      if (v < +slider.min) slider.min = Math.floor(v);
      if (v > +slider.max) slider.max = Math.ceil(v);
      slider.value = v;
    }
  }

  return { el, refresh, block: currentBlock };
}
