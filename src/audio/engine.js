import { makeWind, strikeBell } from './synths.js';

export function parseRecipe(str) {
  const [type, arg] = str.split(':');
  return { type, level: arg !== undefined ? parseFloat(arg) : 1 };
}

// Browser-only. `save` is a createSave() instance.
export function createAudio(save) {
  let ctx = null, master = null, music = null, musicGain = null;
  let wind = null;
  let soundOn = save.state().soundOn;
  let windScale = 1;      // debug-panel multiplier over whatever a koan asks for
  let windLevel = 0;      // last level a koan requested, so a scale change applies now

  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = soundOn ? 0.8 : 0;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.5;
    musicGain.connect(master);
  }

  return {
    get ctx() { return ctx; },
    get master() { return master; },
    unlock() { ensureCtx(); if (ctx.state !== 'running') ctx.resume(); },
    setSound(on) {
      soundOn = !!on;
      save.setSound(soundOn);
      if (master) master.gain.setTargetAtTime(soundOn ? 0.8 : 0, ctx.currentTime, 0.05);
    },
    isSoundOn() { return soundOn; },
    startAmbience(recipe = []) {
      ensureCtx();
      for (const item of recipe) {
        const { type, level } = parseRecipe(item);
        if (type === 'wind' && !wind) { wind = makeWind(ctx, master); wind.setLevel(level); }
      }
    },
    setWindLevel(v) { windLevel = v; if (wind) wind.setLevel(v * windScale); },
    setWindScale(s) { windScale = s; if (wind) wind.setLevel(windLevel * windScale); },
    windScale() { return windScale; },
    stopAmbience() { if (wind) { wind.stop(); wind = null; } },
    bell(opts = {}) { ensureCtx(); strikeBell(ctx, master, opts); },
    playMusic() { /* stub: ambient generated tracks are a future experiment */ },
    stopMusic() { if (music) { try { music.stop(); } catch {} music = null; } },
    musicVolume(v) { if (musicGain) musicGain.gain.value = v; },
  };
}
