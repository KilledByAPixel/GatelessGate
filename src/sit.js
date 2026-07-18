export function sitOutcome(elapsed, duration) {
  return elapsed >= duration ? 'complete' : 'early';
}

// Browser sit mode. `audio` is createAudio(); onComplete()/onExit() are callbacks.
export function makeSit({ audio, onComplete, onExit } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-sit hidden';
  const breath = document.createElement('div');
  breath.className = 'gg-enso-breath';
  el.appendChild(breath);
  const hint = document.createElement('div');
  hint.style.cssText = 'position:absolute;bottom:8vh;color:var(--gray);font-size:14px;';
  hint.textContent = 'tap to end';
  el.appendChild(hint);

  let running = false, elapsed = 0, duration = 0, wake = null;

  el.addEventListener('pointerdown', () => { if (running) finish('early'); });

  async function acquireWake() {
    try { wake = await navigator.wakeLock.request('screen'); } catch { wake = null; }
  }
  function releaseWake() { try { wake && wake.release(); } catch {} wake = null; }

  function finish(kind) {
    if (!running) return;
    running = false;
    audio && audio.bell({ f0: 70 });
    el.classList.add('hidden');
    releaseWake();
    if (kind === 'complete') onComplete && onComplete();
    else onExit && onExit();
  }

  return {
    el,
    active() { return running; },
    start(minutes) {
      duration = minutes * 60;
      elapsed = 0;
      running = true;
      el.classList.remove('hidden');
      audio && audio.bell({ f0: 70 });
      acquireWake();
    },
    update(dt) {
      if (!running) return;
      elapsed += dt;
      if (sitOutcome(elapsed, duration) === 'complete') finish('complete');
    },
    end() { finish('early'); },
  };
}
