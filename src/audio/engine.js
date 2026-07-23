import { makeWind, strikeBell, strikeChime } from './synths.js';
import { makeMusic } from './music.js';
import { makeVerb } from './verb.js';

export function parseRecipe(str) {
  const [type, arg] = str.split(':');
  return { type, level: arg !== undefined ? parseFloat(arg) : 1 };
}

// Beds are not emitters: wind is atmosphere rather than an event source, and
// music is the thing being thinned. Everything else in a recipe is an object
// that makes noise, and each one buys the drift layer more silence.
const BEDS = new Set(['wind', 'music']);
export function emitterCount(recipe = []) {
  return recipe.filter((s) => !BEDS.has(parseRecipe(s).type)).length;
}

// Browser-only. `save` is a createSave() instance.
export function createAudio(save) {
  let ctx = null, master = null, music = null, musicGain = null;
  let wind = null, verb = null;
  let soundOn = save.state().soundOn;
  let windScale = 1;      // debug-panel multiplier over whatever a koan asks for
  let windLevel = 0;      // last level a koan requested, so a scale change applies now
  let ducked = false;     // ambience pulls back while narration is reading

  // Narration plays through an <audio> element, outside this graph, so ducking the
  // master only affects the ambience bed — which is exactly the intent.
  const MASTER = 0.8, DUCKED = 0.32;
  function masterTarget() { return soundOn ? (ducked ? DUCKED : MASTER) : 0; }
  function applyMaster() {
    if (master) master.gain.setTargetAtTime(masterTarget(), ctx.currentTime, 0.05);
  }

  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = masterTarget();
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.5;
    musicGain.connect(master);
    // the room: one reverb for every pitched voice. Its wet return feeds
    // master, so narration ducking pulls the room back with everything else.
    verb = makeVerb(ctx, master, { seconds: 5 });
  }

  function playMusic(emitters = 0) {
    ensureCtx();
    if (music) { music.setEmitters(emitters); return; }
    music = makeMusic(ctx, musicGain, { emitters, verbIn: verb.in });
  }

  function stopMusic() {
    if (music) { try { music.stop(); } catch { /* already stopped */ } music = null; }
  }

  return {
    get ctx() { return ctx; },
    get master() { return master; },
    unlock() { ensureCtx(); if (ctx.state !== 'running') ctx.resume(); },
    setSound(on) {
      soundOn = !!on;
      save.setSound(soundOn);
      applyMaster();
    },
    isSoundOn() { return soundOn; },
    duck(on) { ducked = !!on; applyMaster(); },
    startAmbience(recipe = []) {
      ensureCtx();
      const emitters = emitterCount(recipe);
      for (const item of recipe) {
        const { type, level } = parseRecipe(item);
        if (type === 'wind' && !wind) { wind = makeWind(ctx, master); wind.setLevel(level); }
        if (type === 'music') playMusic(emitters);
      }
    },
    setWindLevel(v) { windLevel = v; if (wind) wind.setLevel(v * windScale); },
    setGust(v) { if (wind) wind.setGust(v); },
    setWindScale(s) { windScale = s; if (wind) wind.setLevel(windLevel * windScale); },
    windScale() { return windScale; },
    stopAmbience() {
      if (wind) { wind.stop(); wind = null; }
      stopMusic();
    },
    bell(opts = {}) { ensureCtx(); strikeBell(ctx, master, opts); },
    chime(opts = {}) { ensureCtx(); strikeChime(ctx, master, opts); },
    playMusic,
    stopMusic,
    musicVolume(v) { if (musicGain) musicGain.gain.value = v; },
  };
}
