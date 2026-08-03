import {
  makeWind, strikeBell, strikeBar, CHIME, strikeDrip, makeWaterBed, WATER,
  strike, bambooPartials, ODOSHI, pourBurst, strikeSitBell, SIT_BELL, STRIKE_SCALE,
} from './synths.js';
import { makeMusic } from './music.js';
import { makeVerb } from './verb.js';
import { hz, SCALES } from './tuning.js';

import { parseRecipe, emitterCount, diffAmbience } from './ambience_diff.js';

// The recipe grammar and the page-turn diff live in ambience_diff.js (pure,
// Node-tested); re-exported here so the engine stays the module everyone
// imports the recipe vocabulary from.
export { parseRecipe, emitterCount } from './ambience_diff.js';

// Browser-only. `save` is a createSave() instance.
export function createAudio(save) {
  let ctx = null, master = null, music = null, musicGain = null;
  let wind = null, verb = null, water = null, dripTimer = null;
  let playing = [];       // the recipe currently sounding — what transition() diffs against
  let musicChimed = false; // the live music is the menu's chiming variant, not a case bed
  // Creation counters for the headless probe: a layer that survived a page
  // turn keeps its epoch, one that restarted took a new one. Clock-free, so
  // it works even when a suspended headless context freezes every gain ramp.
  let windEpoch = 0, waterEpoch = 0, musicEpoch = 0;
  const tlog = [];        // last few transitions, for the same probe
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
    musicChimed = !!opts.chimes;
    musicEpoch++;
  }

  // The music a case bed may KEEP across a page turn is the plain drift; the
  // menu's chiming variant (playMusic(0, { chimes: true })) must never ride
  // into a case, because playMusic reuses a live scheduler and silently drops
  // its options — the exact trap exit()'s stop/menuMusic() pairing guards.
  function ensureCaseMusic(emitters) {
    if (music && musicChimed) stopMusic();
    playMusic(emitters);
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

  // One sustained layer coming to life. Every bed is born at gain 0 and
  // setLevel rides setTargetAtTime, so a started layer always FADES in from
  // silence — there is no click to guard against here.
  function startLayer(type, level, emitters) {
    if (type === 'wind' && !wind) {
      wind = makeWind(ctx, master);
      windEpoch++;
      windLevel = level;
      wind.setLevel(level * windScale);
    }
    if (type === 'music') ensureCaseMusic(emitters);
    if (type === 'water' && !water) {
      water = makeWaterBed(ctx, master);
      waterEpoch++;
      water.setLevel(WATER.bedLevel * level);
      scheduleDrip();
    }
  }

  // A sustained layer leaving: fade to true silence on the bed's own
  // setTargetAtTime curve, and only then release the nodes. The engine's
  // reference to the layer is dropped at once, so a quick page turn can start
  // a fresh bed while the old one is still dying underneath it.
  const STOP_FADE_S = 3;   // > 7 time-constants of the beds' tau — gone before release
  function stopLayer(layer) {
    if (layer === 'wind' && wind) {
      const w = wind; wind = null; windLevel = 0;
      w.setLevel(0);                    // windParams(0) reaches true zero, not just quiet
      setTimeout(() => w.stop(), STOP_FADE_S * 1000);
    }
    if (layer === 'water' && water) {
      const w = water; water = null;
      if (dripTimer) { clearTimeout(dripTimer); dripTimer = null; }
      w.setLevel(0);
      setTimeout(() => w.stop(), STOP_FADE_S * 1000);
    }
    // Music needs no fade: stop() only cancels the scheduler, and every note
    // already sounding decays on its own strike envelope.
    if (layer === 'music') stopMusic();
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
        startLayer(type, level, emitters);
      }
      playing = recipe.slice();
    },
    // The page turn: the outgoing case's bed flows into the incoming one's
    // instead of stopping and starting. KEPT layers never restart — the wind
    // that carried you through case 12 is the same buffer source in case 13,
    // ramped to the new level on the beds' own setTargetAtTime smoothing
    // (tau 0.3–0.4 s → settled in about a second and a half, silent-click by
    // construction). STOPPED layers fade out on the same curve before their
    // nodes are released; STARTED layers are born at gain 0 and fade in.
    // From silence (empty `playing`) this is exactly startAmbience; to
    // silence it is a soft stopAmbience. Mood needs nothing here — it is
    // pitch-only and the music reads it through a live closure.
    transition(next = []) {
      ensureCtx();
      const { keep, start, stop } = diffAmbience(playing, next);
      const emitters = emitterCount(next);
      for (const layer of stop) stopLayer(layer);
      for (const k of keep) {
        // `playing` and the live nodes can only disagree if something outside
        // this file reached in, but a keep on a missing node must build, not
        // crash — startLayer is the same fade-in the start list gets.
        if (k.layer === 'wind') {
          if (wind) { windLevel = k.to; wind.setLevel(k.to * windScale); } else startLayer('wind', k.to, emitters);
        }
        if (k.layer === 'water') {
          if (water) water.setLevel(WATER.bedLevel * k.to); else startLayer('water', k.to, emitters);
        }
        if (k.layer === 'music') ensureCaseMusic(emitters);   // keeps the plain drift; swaps out the menu's chimes
      }
      for (const s of start) startLayer(s.layer, s.level, emitters);
      playing = next.slice();
      tlog.push({
        keep: keep.map((k) => `${k.layer}:${k.from}>${k.to}`),
        start: start.map((s) => `${s.layer}:${s.level}`),
        stop,
      });
      if (tlog.length > 8) tlog.shift();
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
      playing = [];
    },
    // Headless probe read — never drives anything. Epochs are the reliable
    // witness that a layer was KEPT across a transition (same number) rather
    // than restarted (bumped): a suspended headless context freezes
    // currentTime, so the gain values may read as their pre-ramp numbers.
    debugState() {
      return {
        recipe: playing.slice(),
        mood,
        ctxState: ctx ? ctx.state : null,   // suspended = every gain reads pre-ramp
        log: tlog.slice(),
        layers: {
          wind: wind ? { epoch: windEpoch, level: windLevel, gain: wind.gain() } : null,
          water: water ? { epoch: waterEpoch, gain: water.gain() } : null,
          music: music ? { epoch: musicEpoch, emitters: music.emitters(), chimes: musicChimed } : null,
        },
      };
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
    // The timer's bell, opening and closing a sitting. Its own voice rather than
    // an option on bell(): every other bell in the book belongs to a case and is
    // struck by something you can see, and this one belongs to the reader.
    // Pitched to the mood like everything else — degree 15 is the root four
    // octaves up, so it is the same note in both scales.
    sitBell() {
      ensureCtx();
      if (ctx.state !== 'running') return;
      strikeSitBell(ctx, master, verb.in, { f0: hz(SIT_BELL.degree, mood) });
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
    // the shishi-odoshi: the kit object fires onKnock/onPour, the case wires
    // them here — the same indirection as the furin
    knock({ force = 1 } = {}) {
      ensureCtx();
      if (ctx.state !== 'running') return;
      const bus = ctx.createGain();
      const dryG = ctx.createGain(); dryG.gain.value = 1 - ODOSHI.verbMix * 0.8;
      bus.connect(dryG); dryG.connect(master);
      const sendG = ctx.createGain(); sendG.gain.value = ODOSHI.verbMix * 1.1;
      bus.connect(sendG); sendG.connect(verb.in);
      // a knock is a THUMP, not a bell: it wants its own level scale rather
      // than the bell-sized default undone by a factor at the call site
      strike(ctx, bus, {
        partials: bambooPartials(),
        gain: ODOSHI.level * force,
        scale: STRIKE_SCALE * 9,
        transient: { dur: 0.018, freq: 1100, q: 1.4, amp: 0.5 },
      });
    },
    pour() {
      ensureCtx();
      if (ctx.state !== 'running') return;
      pourBurst(ctx, master, {});
    },
    playMusic,
    stopMusic,
    musicVolume(v) { if (musicGain) musicGain.gain.value = v; },
  };
}
