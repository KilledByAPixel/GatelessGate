import {
  makeWind, strikeBell, strikeBar, CHIME, strikeDrip, makeWaterBed, WATER,
  strike, bambooPartials, ODOSHI, pourBurst, strikeSitBell, SIT_BELL, STRIKE_SCALE, BELL,
  bellVoice, bellPartials, bellTail, applyBellPreset, BELL_PRESETS,
  CERAMIC, WOOD, CLOTH, BREATH, ceramicPartials, woodPartials, noiseSwell,
} from './synths.js';
import { makeMusic } from './music.js';
import { makeVerb } from './verb.js';
import { hz, SCALES } from './tuning.js';
import { spatialFor, makeSpatialBus } from './spatial.js';

import { parseRecipe, emitterCount, diffAmbience } from './ambience_diff.js';

// The recipe grammar and the page-turn diff live in ambience_diff.js (pure,
// Node-tested); re-exported here so the engine stays the module everyone
// imports the recipe vocabulary from.
export { parseRecipe, emitterCount } from './ambience_diff.js';

// Pure timing for hushVoices, Node-testable without an AudioContext: ramp to
// zero over `fade`, sit silent for `hold`, then the restore ramp begins.
// Kept separate from the gain nodes themselves so the arithmetic can be
// pinned down without faking a Web Audio graph to do it — same split as
// parseRecipe/emitterCount above.
export function hushSchedule(fade, hold) {
  return { fadeEndsAt: fade, restoreAt: fade + hold };
}

// Narration plays through an <audio> element, outside this graph, so ducking the
// master only affects the ambience bed — which is exactly the intent.
export const MASTER = 0.8;
export const DUCKED = 0.32;

// The three independent reasons the bed can be quiet, resolved to one number.
// Pure so the interaction between them is testable: the one that matters is
// that hidden and muted are SEPARATE reasons, so returning to a page you had
// muted does not un-mute it.
export function masterLevel({ soundOn, ducked, hidden }) {
  if (!soundOn || hidden) return 0;
  return ducked ? DUCKED : MASTER;
}

// Hidden means silent — except during a sitting. 'done' is the timer run out
// with the reader still in the scene: the bell has already rung, so there is
// nothing left to protect.
export function shouldPauseForHide(hidden, sitPhase) {
  return !!hidden && sitPhase !== 'sitting';
}

// Browser-only. `save` is a createSave() instance.
export function createAudio(save) {
  let ctx = null, master = null, music = null, musicGain = null;
  let wind = null, verb = null, water = null, dripTimer = null;
  let voicesDry = null, voicesWet = null;   // the pair hushVoices() gates — see its own comment
  let hushGen = 0;
  let hideGen = 0;   // mirrors hushGen: invalidates a stale deferred suspend, see pauseForHide()
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
  let listener = null;    // { pos, right, forward } — main.js feeds it from the camera each tick
  let hidden = false;     // the page is not being looked at (visibilitychange)

  function masterTarget() { return masterLevel({ soundOn, ducked, hidden }); }
  function applyMaster() {
    if (master) master.gain.setTargetAtTime(masterTarget(), ctx.currentTime, 0.05);
  }

  // Returns whether ctx now exists, so every caller reads as "no audio here,
  // do nothing" instead of assuming the postcondition and blowing up on it.
  // There is no `window` under `node --test` — createAudio(save) is
  // contractually Node-safe until a context exists — so this can genuinely
  // fail, and a null ctx reaching an AudioParam call must be a clean no-op,
  // not a ReferenceError that takes a whole test down with it.
  function ensureCtx() {
    if (ctx) return true;
    if (typeof window === 'undefined') return false;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = masterTarget();
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.5;
    musicGain.connect(master);
    // the room: one reverb for every pitched voice. Its wet return feeds
    // master, so narration ducking pulls the room back with everything else.
    verb = makeVerb(ctx, master);
    // The pair every one-shot funnels through before master/verb.in, and the
    // taps hushVoices() closes. `great` rings 57s; nothing before this could
    // cut a ringing one-shot short, so a bell struck on the last tap of a
    // page would follow the reader most of a minute into the next one.
    // Gating only the dry leg would not be enough: makeSpatialBus's reverb
    // send taps AFTER the panner, so a hushed-dry bell would keep feeding
    // the room for its whole decay and ring on in the reverb regardless —
    // both legs have to close. The sit bell, punctuated narration chimes,
    // and the drift layer's far bell (music.js, routed straight to musicGain
    // and verb.in, never through here) route around this pair on purpose:
    // none of the three belong to the diorama, so none may go quiet just
    // because the page turned.
    voicesDry = ctx.createGain();
    voicesDry.connect(master);
    voicesWet = ctx.createGain();
    voicesWet.connect(verb.in);
    return true;
  }

  function playMusic(emitters = 0, opts = {}) {
    if (!ensureCtx()) return;
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
  function dripNow(loud, at = null) {
    const deg = WATER.degree + [0, 1, 2, 4][Math.floor(Math.random() * 4)];
    const f0 = hz(deg, mood);
    const gain = WATER.level * (loud ? 1.5 : 0.7 + Math.random() * 0.5);
    const bus = placed(at, WATER.verbMix, 1);
    strikeDrip(ctx, bus ? bus.in : voicesDry, bus ? null : voicesWet, { f0, gain, verbMix: bus ? 0 : WATER.verbMix });
  }

  const finiteAt = (a) => !!a && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);

  // A placed one-shot: build a bus, aim it, and hand back its input for the
  // voice to play into. Returns null when there is nothing to place against —
  // no listener yet, no position given, or a position that would put a NaN
  // into an AudioParam and kill the graph. Every caller falls back to the
  // unplaced path on null, which is exactly today's behaviour, which is how
  // sixty call sites migrate one at a time instead of all at once.
  function placed(at, character, tail) {
    if (!listener || !finiteAt(at) || !ctx) return null;
    const bus = makeSpatialBus(ctx, voicesDry, voicesWet, { character });
    bus.place(spatialFor(at, listener));
    bus.release(tail);
    return bus;
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
    unlock() { if (ensureCtx() && ctx.state !== 'running') ctx.resume(); },
    setSound(on) {
      soundOn = !!on;
      save.setSound(soundOn);
      applyMaster();
    },
    isSoundOn() { return soundOn; },
    duck(on) { ducked = !!on; applyMaster(); },
    // ---- the page went away ----
    // Fade THEN suspend: ctx.suspend() on its own is a hard cut and can click.
    // The fade rides masterTarget(), so mute and ducking are respected in both
    // directions. `hidden` is set before the context guard so the state is
    // readable in Node, where no context is ever created.
    //
    // This deliberately does NOT touch hushVoices()/hushGen. hushVoices is a
    // fade-hold-RESTORE cycle sized for a page turn (~1.15s); a hidden tab can
    // sit hidden for an hour, so reusing it would mean either duplicating its
    // ramp under a different name or teaching its restore timer that some
    // holds are indefinite — both fight the generation counter that makes
    // overlapping page-turn hushes safe. Going through `master` instead sits
    // one level higher than voicesDry/voicesWet: suspending ctx freezes EVERY
    // node at once, including a hush that is mid-ramp, without either
    // mechanism knowing the other exists. A hush's restore is a real
    // setTimeout (wall-clock, not audio-clock), so it still fires while
    // suspended: at that point it calls voicesDry/voicesWet's own
    // cancelScheduledValues(), which drops the in-flight ramp entirely rather
    // than holding it, so the gain SNAPS back to 1 (its pre-ramp
    // setValueAtTime value) instead of continuing to ramp there. That snap is
    // inaudible only because `master` is already at (or heading to) zero and
    // ramps up from zero on its own schedule when resumeFromHide() runs.
    // Neither order (hush-then-hide or hide-then-hush) can leave
    // voicesDry/voicesWet stuck at zero: their own restore always eventually
    // runs, whatever state the suspend/resume boundary catches it in.
    pauseForHide() {
      if (hidden) return;
      hidden = true;
      if (!ctx) return;
      applyMaster();
      // > 5 time constants of applyMaster's 0.05 tau — silent before the cut.
      // `gen` mirrors hushGen: a hide reversed and re-armed inside this same
      // 300ms window (an ordinary quick alt-tab burst) must not let THIS
      // stale timer suspend mid-way through the SECOND fade — a quieter
      // version of the click the defer exists to prevent. Whichever
      // pauseForHide() call ran last owns the only timer that can still
      // match `hideGen` when it fires.
      const gen = ++hideGen;
      setTimeout(() => {
        if (gen !== hideGen) return;   // overtaken by a later hide; not this timer's suspend to make
        if (hidden && ctx.state === 'running') ctx.suspend();
      }, 300);
    },
    resumeFromHide() {
      if (!hidden) return;
      hidden = false;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      applyMaster();
    },
    isHidden() { return hidden; },
    // an unknown or absent mood falls back to the default rather than detuning
    setMood(m) { mood = SCALES[m] ? m : 'in'; },
    mood() { return mood; },
    // The camera IS the listener. main.js feeds this every tick from the
    // camera's world matrix; the engine never sees a THREE object.
    setListener(l) { listener = l || null; },
    listener() { return listener; },
    startAmbience(recipe = []) {
      if (!ensureCtx()) return;
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
      if (!ensureCtx()) return;
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
    // `size` is the new way to ask for a bell; `f0` survives as an override so
    // the eight existing case call sites keep the exact pitches they shipped
    // with — Frank decides at audition whether they migrate to size instead.
    // `preset` is the third form: one of BELL_PRESETS's tuned bells (hand /
    // temple / great), voice AND macro dressing AND mallet balance together.
    // The spatial bus's release is `bellTail(v)`, not a constant — a flat
    // number cannot cover every size at once, since decay itself scales with
    // size (see bellTail's comment in synths.js).
    // `gain` here is a plain velocity now — strikeBell applies BELL.level to
    // the partials and TRANSIENT_SCALE to the mallet itself, so this call
    // site never has to know either constant exists.
    bell({ size = BELL.size, f0 = null, preset = null, gain = 1, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      let v, verbMix = BELL.verbMix, beam, ping, pingFreq;
      if (preset !== null) {
        const p = BELL_PRESETS[preset];
        const voice = bellVoice(p.size);
        v = { f0: voice.f0, partials: applyBellPreset(voice, p) };
        ({ verbMix, beam, ping, pingFreq } = p);
      } else {
        v = f0 === null ? bellVoice(size) : { f0, partials: bellPartials(f0) };
      }
      const bus = placed(at, verbMix, bellTail(v));
      strikeBell(ctx, bus ? bus.in : voicesDry, bus ? null : voicesWet,
        { partials: v.partials, gain, verbMix: bus ? 0 : verbMix, beam, ping, pingFreq });
    },
    // The timer's bell, opening and closing a sitting. Its own voice rather than
    // an option on bell(): every other bell in the book belongs to a case and is
    // struck by something you can see, and this one belongs to the reader.
    // Pitched to the mood like everything else — degree 15 is the root four
    // octaves up, so it is the same note in both scales.
    sitBell() {
      if (!ensureCtx() || ctx.state !== 'running') return;
      strikeSitBell(ctx, master, verb.in, { f0: hz(SIT_BELL.degree, mood) });
    },
    // tube index -> scale degree -> Hz. The engine owns the mapping so the kit
    // never needs to know what a hertz is.
    //
    // `punctuate` marks a strike as belonging to the READING, not the
    // ambience: while narration ducks the bed, punctuation compensates so it
    // lands at intended loudness — Frank could not hear the section chimes at
    // all under the duck. Ambient strikes stay ducked with everything else.
    chimeStrike({ tube = 0, force = 1, punctuate = false, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const comp = punctuate && ducked ? MASTER / DUCKED : 1;
      const gain = CHIME.level * force * comp;
      const f0 = hz(CHIME.degree + tube, mood);
      // Punctuation belongs to the READING, not the scene — it has no place
      // in the diorama and is never spatialized, however it was called, and
      // it goes straight to master/verb.in so hushVoices() cannot cut it off
      // mid-sentence. An ambient (unpunctuated) strike takes the hush pair
      // either through placed() or, with no listener/position, its fallback.
      const bus = punctuate ? null : placed(at, CHIME.verbMix, CHIME.decay + 1);
      const dry = punctuate ? master : (bus ? bus.in : voicesDry);
      const wet = punctuate ? verb.in : (bus ? null : voicesWet);
      strikeBar(ctx, dry, wet, { f0, gain, verbMix: bus ? 0 : CHIME.verbMix });
    },
    // a tap on the water (or the bowl set down in it) answers with a drip,
    // whatever the ambient schedule is doing
    drip({ loud = false, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      dripNow(loud, at);
    },
    // the shishi-odoshi: the kit object fires onKnock/onPour, the case wires
    // them here — the same indirection as the furin
    knock({ force = 1, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const bus = placed(at, ODOSHI.verbMix, ODOSHI.decay + 1);
      let dest;
      if (bus) dest = bus.in;
      else {
        dest = ctx.createGain();
        const dryG = ctx.createGain(); dryG.gain.value = 1 - ODOSHI.verbMix * 0.8;
        dest.connect(dryG); dryG.connect(voicesDry);
        const sendG = ctx.createGain(); sendG.gain.value = ODOSHI.verbMix * 1.1;
        dest.connect(sendG); sendG.connect(voicesWet);
      }
      // a knock is a THUMP, not a bell: it wants its own level scale rather
      // than the bell-sized default undone by a factor at the call site
      strike(ctx, dest, {
        partials: bambooPartials(),
        gain: ODOSHI.level * force,
        scale: STRIKE_SCALE * 9,
        transient: { dur: 0.018, freq: 1100, q: 1.4, amp: 0.5 },
      });
    },
    pour({ at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const bus = placed(at, ODOSHI.verbMix * 0.6, 2);
      pourBurst(ctx, bus ? bus.in : voicesDry, {});
    },
    // ---- the touch voices ----
    // Each is the same shape: place it if it said where it is, otherwise the
    // plain path. Every one of these is quiet on purpose — the book is an
    // ambient thing and a touch response that demands attention is a game.
    ceramic({ force = 1, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const bus = placed(at, CERAMIC.verbMix, CERAMIC.tail);
      strike(ctx, bus ? bus.in : voicesDry, {
        partials: ceramicPartials(),
        gain: CERAMIC.level * force,
        transient: { dur: 0.012, freq: 2500, q: 1.6, amp: 0.5 },
      });
    },
    wood({ force = 1, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const bus = placed(at, WOOD.verbMix, WOOD.tail);
      strike(ctx, bus ? bus.in : voicesDry, {
        partials: woodPartials(),
        gain: WOOD.level * force,
        scale: STRIKE_SCALE * 4,
        transient: { dur: 0.02, freq: 800, q: 1.1, amp: 0.55 },
      });
    },
    cloth({ force = 1, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const bus = placed(at, CLOTH.verbMix, CLOTH.dur + 0.5);
      noiseSwell(ctx, bus ? bus.in : voicesDry, { ...CLOTH, level: CLOTH.level * force });
    },
    // `dur` is why this one takes an argument the others don't: case 1's Mu is
    // not a strike at all, it is the world thinning away over several seconds,
    // and it wants one long breath shaped to that gesture rather than a hit.
    breath({ force = 1, dur = BREATH.dur, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const bus = placed(at, BREATH.verbMix, dur + 0.5);
      noiseSwell(ctx, bus ? bus.in : voicesDry, {
        ...BREATH, dur, attack: dur * 0.35, level: BREATH.level * force,
      });
    },
    playMusic,
    stopMusic,
    musicVolume(v) { if (musicGain) musicGain.gain.value = v; },
    // Cuts every one-shot bell/chime/drip/knock/pour short at a page turn —
    // see the hush pair's own comment in ensureCtx() for why gating only the
    // dry leg is not enough. `hushGen` marks each call so a fast page-turner
    // can hush again before the first restore fires without the two racing:
    // a restore callback checks it is still the newest call before touching
    // the gains, so an overtaken hush's restore is a silent no-op rather than
    // stomping the newer hush's own fade.
    hushVoices({ fade = 0.5, hold = 0.15 } = {}) {
      if (!ensureCtx()) return;
      const gen = ++hushGen;
      const t = ctx.currentTime;
      for (const g of [voicesDry, voicesWet]) {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fade);
      }
      setTimeout(() => {
        if (gen !== hushGen) return;   // overtaken by a later hush; its own restore will run
        const t2 = ctx.currentTime;
        for (const g of [voicesDry, voicesWet]) {
          g.gain.cancelScheduledValues(t2);
          g.gain.setValueAtTime(g.gain.value, t2);
          g.gain.linearRampToValueAtTime(1, t2 + fade);
        }
      }, hushSchedule(fade, hold).restoreAt * 1000);
    },
  };
}
