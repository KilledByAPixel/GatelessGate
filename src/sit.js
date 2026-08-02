export function sitOutcome(elapsed, duration) {
  return elapsed >= duration ? 'complete' : 'early';
}

// The timer's face: minutes and seconds, counting down. Ceiling, not floor, so a
// ten-minute sit reads 10:00 for its first second and reaches 0:00 exactly as the
// bell rings — a clock that started at 9:59 would look broken. Never negative.
export function clockText(secondsLeft) {
  const s = Math.max(0, Math.ceil(secondsLeft - 1e-6));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Browser sit mode. `audio` is createAudio(); onComplete()/onExit() are callbacks.
//
// Three phases, and the third one is the point (Frank): 'off', 'sitting' while
// the clock runs, and 'done' once it has. Sitting used to throw you back into
// the text the instant the timer expired, which is the one moment a sitting
// should NOT be interrupted. Now the bell rings and nothing else happens: the
// scene is still there, the clock reads 0:00, and the reader leaves when they
// are ready. So onComplete only records the sit; onExit is what ends it, and it
// fires on the tap whether that tap came early or an hour after the bell.
export function makeSit({ audio, onComplete, onExit } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-sit hidden';
  // The whole overlay is a tap target and nothing else — no wash over the
  // picture, no breathing circle to obey. The reader came here to look at the
  // scene and count their own breaths.
  const clock = document.createElement('div');
  clock.className = 'gg-sit-clock';
  el.appendChild(clock);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'tap to end';
  el.appendChild(hint);

  let phase = 'off', elapsed = 0, duration = 0, wake = null, wakeGen = 0;

  el.addEventListener('pointerdown', () => leave());

  async function acquireWake() {
    const myGen = ++wakeGen;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (myGen !== wakeGen || phase !== 'sitting') { try { lock.release(); } catch {} return; }
      wake = lock;
    } catch { wake = null; }
  }
  function releaseWake() { wakeGen++; try { wake && wake.release(); } catch {} wake = null; }

  function paint() { clock.textContent = clockText(duration - elapsed); }

  // The timer ran out. The same bell that opened it, and then stillness — the
  // clock stops at 0:00 and the overlay stays up over the scene.
  function complete() {
    phase = 'done';
    elapsed = duration;
    paint();
    releaseWake();
    audio && audio.sitBell();
    onComplete && onComplete();
  }

  // The reader tapped out. No bell: the bell marks a sitting completed, and one
  // rung for cutting it short would be a consolation prize.
  function leave() {
    if (phase === 'off') return;
    phase = 'off';
    el.classList.add('hidden');
    releaseWake();
    onExit && onExit();
  }

  return {
    el,
    // The overlay is up — sitting OR sat-and-still-here. Both keep the mode.
    active() { return phase !== 'off'; },
    phase() { return phase; },
    status() { return { phase, left: Math.max(0, duration - elapsed), text: clock.textContent }; },
    start(minutes) {
      duration = minutes * 60;
      elapsed = 0;
      phase = 'sitting';
      paint();
      el.classList.remove('hidden');
      audio && audio.sitBell();
      acquireWake();
    },
    update(dt) {
      if (phase !== 'sitting') return;
      elapsed += dt;
      if (sitOutcome(elapsed, duration) === 'complete') { complete(); return; }
      paint();
    },
    end() { leave(); },
  };
}
