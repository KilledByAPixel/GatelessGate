import { makeWind, strikeBell, strikeBar, CHIME, strikeDrip, makeWaterBed, WATER } from './synths.js';
import { makeMusic } from './music.js';
import { makeVerb } from './verb.js';
import { hz, SCALES } from './tuning.js';

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
  let wind = null, verb = null, water = null, dripTimer = null;
  let soundOn = save.state().soundOn;
  let windScale = 1;      // debug-panel multiplier over whatever a koan asks for
  let windLevel = 0;      // last level a koan requested, so a scale change applies now
  let ducked = false;     // ambience pulls back while narration is reading
  let mood = 'in';        // the case's editorial pick; every pitched voice reads it

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

  function playMusic(emitters = 0, opts = {}) {
    ensureCtx();
    if (music) { music.setEmitters(emitters); return; }
    // pitch is a closure over `mood`, not a snapshot — a mood change mid-play
    // retunes from the very next note
    music = makeMusic(ctx, musicGain, {
      emitters, verbIn: verb.in, pitch: (d) => hz(d, mood), ...opts,
    });
  }

  function stopMusic() {
    if (music) { try { music.stop(); } catch { /* already stopped */ } music = null; }
  }

  // one drip: pitched to the scale's high register through the case's mood.
  // Ambient drips wander a few degrees; a tap ("loud") is a touch firmer.
  function dripNow(loud) {
    const deg = WATER.degree + [0, 1, 2, 4][Math.floor(Math.random() * 4)];
    strikeDrip(ctx, master, verb.in, {
      f0: hz(deg, mood),
      gain: WATER.level * (loud ? 1.5 : 0.7 + Math.random() * 0.5),
    });
  }

  function scheduleDrip() {
    dripTimer = setTimeout(() => {
      if (!water) return;
      if (ctx.state === 'running') dripNow(false);   // suspended: skip, keep ticking
      scheduleDrip();
    }, WATER.gap * (0.6 + Math.random() * 0.8) * 1000);
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
    // an unknown or absent mood falls back to the default rather than detuning
    setMood(m) { mood = SCALES[m] ? m : 'in'; },
    mood() { return mood; },
    startAmbience(recipe = []) {
      ensureCtx();
      const emitters = emitterCount(recipe);
      for (const item of recipe) {
        const { type, level } = parseRecipe(item);
        if (type === 'wind' && !wind) { wind = makeWind(ctx, master); wind.setLevel(level); }
        if (type === 'music') playMusic(emitters);
        if (type === 'water' && !water) {
          water = makeWaterBed(ctx, master);
          water.setLevel(WATER.bedLevel * level);
          scheduleDrip();
        }
      }
    },
    setWindLevel(v) { windLevel = v; if (wind) wind.setLevel(v * windScale); },
    setGust(v) { if (wind) wind.setGust(v); },
    setWindScale(s) { windScale = s; if (wind) wind.setLevel(windLevel * windScale); },
    windScale() { return windScale; },
    stopAmbience() {
      if (wind) { wind.stop(); wind = null; }
      if (water) { water.stop(); water = null; }
      if (dripTimer) { clearTimeout(dripTimer); dripTimer = null; }
      stopMusic();
    },
    // Strikes into a suspended context are DROPPED, not queued — same reason
    // as the scheduler's guard in music.js: a frozen currentTime stacks every
    // one-shot onto the same instant, and unlocking sound later fires them all
    // as one cluster. A missed strike in a scene that was silent anyway costs
    // nothing.
    bell(opts = {}) {
      ensureCtx();
      if (ctx.state !== 'running') return;
      strikeBell(ctx, master, opts);
    },
    // tube index -> scale degree -> Hz. The engine owns the mapping so the kit
    // never needs to know what a hertz is.
    //
    // `punctuate` marks a strike as belonging to the READING, not the
    // ambience: while narration ducks the bed, punctuation compensates so it
    // lands at intended loudness — Frank could not hear the section chimes at
    // all under the duck. Ambient strikes stay ducked with everything else.
    chimeStrike({ tube = 0, force = 1, punctuate = false } = {}) {
      ensureCtx();
      if (ctx.state !== 'running') return;
      const comp = punctuate && ducked ? MASTER / DUCKED : 1;
      strikeBar(ctx, master, verb.in, { f0: hz(CHIME.degree + tube, mood), gain: CHIME.level * force * comp });
    },
    // a tap on the water (or the bowl set down in it) answers with a drip,
    // whatever the ambient schedule is doing
    drip({ loud = false } = {}) {
      ensureCtx();
      if (ctx.state !== 'running') return;
      dripNow(loud);
    },
    playMusic,
    stopMusic,
    musicVolume(v) { if (musicGain) musicGain.gain.value = v; },
  };
}
