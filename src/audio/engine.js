import {
  makeWind, strikeBell, strikeBar, CHIME, BRONZE, strikeDrip, makeWaterBed, WATER,
  strike, bambooPartials, ODOSHI, pourBurst, strikeSitBell, SIT_BELL, STRIKE_SCALE, BELL,
  bellVoice, bellPartials, bellTail, applyBellPreset, BELL_PRESETS,
  CERAMIC, WOOD, CLOTH, BREATH, ceramicPartials, woodPartials, noiseSwell,
  DRUM, drumPartials, RAIN, makeRainBed, jitterHz,
} from './synths.js';
import { makeMusic } from './music.js';
import { makeVerb } from './verb.js';
import { hz, SCALES } from './tuning.js';
import { spatialFor, makeSpatialBus, calibrateMix } from './spatial.js';

// Pre-spatial mix coefficients per voice family — dry = 1 - verbMix*kd,
// send = verbMix*ks — read straight off each strike*() function in
// synths.js (see calibrateMix()'s own comment in spatial.js for why these
// are not interchangeable). Every placed() call below picks the family that
// matches the voice it is about to strike.
const MIX_BELL = { kd: 0.7, ks: 1.2 };      // strikeBell / strikeSitBell
const MIX_WATER = { kd: 0.85, ks: 1.4 };    // strikeDrip
const MIX_CHIME = { kd: 0.85, ks: 1.4 };    // strikeBar
// Same numbers as MIX_CHIME on purpose, not a coincidence needing its own
// pair: cylinderStrike() calls the SAME strikeBar() function chimeStrike()
// does (see BRONZE's own comment in synths.js for why it is a separate
// voice with its own degree/decay/level and not an overload of CHIME), and
// strikeBar's dry/send split (`1 - verbMix*0.85`, `verbMix*1.4`) is fixed
// inside that one function regardless of which caller's constants drove it.
// Named separately anyway, matching MIX_WATER/MIX_CHIME already sharing
// these exact numbers for the same reason (strikeDrip uses the identical
// formula) — one constant per voice family reads better at the call site
// than remembering which families happen to coincide.
const MIX_BRONZE = { kd: 0.85, ks: 1.4 };   // strikeBar, via cylinderStrike
const MIX_ODOSHI = { kd: 0.8, ks: 1.1 };    // knock's inline mix, below
// pour() never had a wet leg pre-branch — pourBurst wrote straight into
// `master` with nothing splitting it, so its old dry was undiscounted (kd 0)
// and its old send was zero (ks 0). calibrateMix(_, 0, 0) reproduces exactly
// that: dryLevel undoes the shared curve's (1-wet) at ref, sendLevel is 0.
// CODE REVIEW CAUGHT: kd 0 also means pour is the one voice whose dryLevel
// (1/(1-wetAt(ref)), 1.67 today) can push its dry leg ABOVE its pre-branch
// absolute value at distances nearer than ref, where gain is still clamped
// to 1 — up to 1.67x (+4.5dB) at point-blank. Every other calibrated voice's
// kd is positive, so their dryLevel is <1 and dry can only ever fall short
// of the old value, never exceed it. This is a real, understood consequence
// of kd 0 being correct (pour never discounted its dry signal at all, so
// there is nothing for dryLevel to claw back from except the shared curve's
// own (1-wet) dip), not an oversight — and it is bounded (1.67x is the
// ceiling, not a runaway) and quiet (ODOSHI.pourLevel is small to begin
// with), so it is left as-is rather than papered over with a special case.
const MIX_NONE = { kd: 0, ks: 0 };

// The four touch voices (ceramic/wood/cloth/breath) were born on this
// branch, so unlike the five families above there is no pre-branch absolute
// dry/send to round-trip to — CERAMIC/WOOD/CLOTH/BREATH.verbMix never drove
// anything but this same spatial bus, at every point in this branch's
// history. kd 0 IS derived, not chosen: strike()/noiseSwell() write into a
// single `dest` with no wet split of their own (see ceramic/wood/cloth/
// breath's own comments below), so their unplaced fallback — voicesDry
// alone — was always undiscounted, exactly pour's situation. ks 1.2 is the
// judgment call: not fitted to anything, just picked (from the bell
// family's own ks, the middle of the 1.1-1.4 spread the five real families
// span) so these four land in the same ballpark
// dry:send ratio as the calibrated voices at ref instead of the ~3x-too-dry
// send raw verbMix produced (see spatial.js's makeSpatialBus comment for
// that bug). See task-12-report.md's dry/wet-at-ref table for the numbers
// this produces per voice — CERAMIC.level etc. were tuned by ear against
// the OLD (uncalibrated, raw-verbMix) send, so if these four now read as
// too wet at Frank's next audition pass, ks is the number to move, not the
// levels themselves. Sharing kd 0 with MIX_NONE also means these four share
// pour's dry-can-exceed-unity-at-point-blank property (see MIX_NONE's own
// comment) — same bound (1.67x), same reasoning, not a separate concern.
const MIX_TOUCH = { kd: 0, ks: 1.2 };

import { parseRecipe, emitterCount, diffAmbience, windFlavorOf, roomFor } from './ambience_diff.js';

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
  let rain = null, rainDropTimer = null;
  let voicesDry = null, voicesWet = null;   // the pair hushVoices() gates — see its own comment
  let hushGen = 0;
  let hideGen = 0;   // mirrors hushGen: invalidates a stale deferred suspend, see pauseForHide()
  let playing = [];       // the recipe currently sounding — what transition() diffs against
  let musicChimed = false; // the live music is the menu's chiming variant, not a case bed
  // Creation counters for the headless probe: a layer that survived a page
  // turn keeps its epoch, one that restarted took a new one. Clock-free, so
  // it works even when a suspended headless context freezes every gain ramp.
  let windEpoch = 0, waterEpoch = 0, musicEpoch = 0, rainEpoch = 0;
  const tlog = [];        // last few transitions, for the same probe
  let soundOn = save.state().soundOn;
  let windScale = 1;      // debug-panel multiplier over whatever a koan asks for
  let waterRecipeLevel = 0;  // the recipe's own water level — what setWaterSwell breathes around
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
    const { dryLevel, sendLevel } = calibrateMix(WATER.verbMix, MIX_WATER.kd, MIX_WATER.ks);
    const bus = placed(at, sendLevel, 1, dryLevel);
    strikeDrip(ctx, bus ? bus.in : voicesDry, bus ? null : voicesWet, { f0, gain, verbMix: bus ? 0 : WATER.verbMix });
  }

  const finiteAt = (a) => !!a && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);

  // A placed one-shot: build a bus, aim it, and hand back its input for the
  // voice to play into. Returns null when there is nothing to place against —
  // no listener yet, no position given, or a position that would put a NaN
  // into an AudioParam and kill the graph. Every caller falls back to the
  // unplaced path on null, which is exactly today's behaviour, which is how
  // sixty call sites migrate one at a time instead of all at once.
  function placed(at, sendLevel, tail, dryLevel = 1) {
    if (!listener || !finiteAt(at) || !ctx) return null;
    const bus = makeSpatialBus(ctx, voicesDry, voicesWet, { sendLevel, dryLevel });
    bus.place(spatialFor(at, listener));
    bus.release(tail);
    return bus;
  }

  // UNCALLED since the ocean took the water bed (Frank, case 20: "those drip
  // effects don't really go with the ocean — they're more of a still water
  // pool"). The ambient drip loop was written for still-water beds, and every
  // still-water case has since dropped the water token, so the only ears this
  // ever reached were the surf's. Kept, like makeWaterBed was through its own
  // quiet years, for the day a pool or a cave recipe names 'water' again —
  // rewire it per-recipe then, not globally. Tap drips (audio.drip →
  // strikeDrip) are a separate path and still ring everywhere they did.
  // eslint-disable-next-line no-unused-vars
  function scheduleDrip() {
    dripTimer = setTimeout(() => {
      if (!water) return;
      if (ctx.state === 'running') dripNow(false);   // suspended: skip, keep ticking
      scheduleDrip();
    }, WATER.gap * (0.6 + Math.random() * 0.8) * 1000);
  }

  // The audible rain: sparse pitched plinks over the baked patter — rain
  // finding surfaces. Same high register as the basin drips, quieter.
  function rainDropNow() {
    // Unpitched on purpose (Frank: the melodic plinks "don't sound like a
    // rain drop"): log-uniform frequency off the scale entirely, and a
    // near-flat sweep — the pool "bloip" glide is WATER's voice, not rain's.
    const f0 = 650 * Math.pow(2.3, Math.random());
    strikeDrip(ctx, voicesDry, voicesWet, {
      f0, gain: RAIN.dropLevel * (0.6 + Math.random() * 0.8), sweep: 1.12, verbMix: WATER.verbMix,
    });
  }
  function scheduleRainDrop() {
    rainDropTimer = setTimeout(() => {
      if (!rain) return;
      if (ctx.state === 'running') rainDropNow();   // suspended: skip, keep ticking
      scheduleRainDrop();
    }, RAIN.dropGap * (0.5 + Math.random()) * 1000);
  }

  // One sustained layer coming to life. Every bed is born at gain 0 and
  // setLevel rides setTargetAtTime, so a started layer always FADES in from
  // silence — there is no click to guard against here.
  function startLayer(type, level, emitters, flavor = 'open') {
    if (type === 'wind' && !wind) {
      wind = makeWind(ctx, master);
      windEpoch++;
      windLevel = level;
      wind.setFlavor(flavor);
      wind.setLevel(level * windScale);
    }
    if (type === 'music') ensureCaseMusic(emitters);
    // Case 20's ocean is the live caller now — see makeWaterBed's own
    // comment in synths.js for the scene that finally justified it. The
    // other five koans that once carried 'water' (7, 30, 33, 39, 49) are
    // still water, a basin or a pond, and dropped the token because a
    // continuous staticky wash read as surf under a picture with none.
    if (type === 'water' && !water) {
      water = makeWaterBed(ctx, master);
      waterEpoch++;
      waterRecipeLevel = level;
      water.setLevel(WATER.bedLevel * level);
      // no scheduleDrip(): the bed's one caller is an OCEAN — see the note
      // on scheduleDrip itself
    }
    if (type === 'rain' && !rain) {
      rain = makeRainBed(ctx, master);
      rainEpoch++;
      rain.setLevel(RAIN.bedLevel * level);
      scheduleRainDrop();
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
    if (layer === 'rain' && rain) {
      const r = rain; rain = null;
      if (rainDropTimer) { clearTimeout(rainDropTimer); rainDropTimer = null; }
      r.setLevel(0);
      setTimeout(() => r.stop(), STOP_FADE_S * 1000);
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
      const flavor = windFlavorOf(recipe);
      for (const item of recipe) {
        const { type, level } = parseRecipe(item);
        startLayer(type, level, emitters, flavor);
      }
      playing = recipe.slice();
      verb.setRoom(roomFor(recipe));
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
          if (wind) { windLevel = k.to; wind.setFlavor(windFlavorOf(next)); wind.setLevel(k.to * windScale); }
          else startLayer('wind', k.to, emitters, windFlavorOf(next));
        }
        if (k.layer === 'water') {
          if (water) { waterRecipeLevel = k.to; water.setLevel(WATER.bedLevel * k.to); } else startLayer('water', k.to, emitters);
        }
        if (k.layer === 'music') ensureCaseMusic(emitters);   // keeps the plain drift; swaps out the menu's chimes
        if (k.layer === 'rain') {
          if (rain) rain.setLevel(RAIN.bedLevel * k.to); else startLayer('rain', k.to, emitters);
        }
      }
      for (const s of start) startLayer(s.layer, s.level, emitters, windFlavorOf(next));
      playing = next.slice();
      verb.setRoom(roomFor(next));
      tlog.push({
        keep: keep.map((k) => `${k.layer}:${k.from}>${k.to}`),
        start: start.map((s) => `${s.layer}:${s.level}`),
        stop,
      });
      if (tlog.length > 8) tlog.shift();
    },
    setWindLevel(v) { windLevel = v; if (wind) wind.setLevel(v * windScale); },
    setGust(v, slope = 0) { if (wind) wind.setGust(v, slope); },
    // The surf's breath (case 20): the case reads its own sea's height at the
    // waterline and hands it here as 0..1 — the setGust idiom, one line wide.
    // Modulates the running bed around its recipe level (×0.7 quiet trough to
    // ×1.3 arriving crest); no water bed running means silence stays silence.
    // setLevel's own setTargetAtTime smoothing turns per-frame calls into a
    // glide rather than a zipper.
    setWaterSwell(v) {
      if (water) water.setLevel(WATER.bedLevel * waterRecipeLevel * (0.7 + 0.6 * v));
    },
    setWindScale(s) { windScale = s; if (wind) wind.setLevel(windLevel * windScale); },
    windScale() { return windScale; },
    stopAmbience() {
      if (wind) { wind.stop(); wind = null; }
      if (water) { water.stop(); water = null; }
      if (dripTimer) { clearTimeout(dripTimer); dripTimer = null; }
      if (rain) { rain.stop(); rain = null; }
      if (rainDropTimer) { clearTimeout(rainDropTimer); rainDropTimer = null; }
      stopMusic();
      playing = [];
      if (verb) verb.setRoom('open');   // leaving for the menu resets the air
    },
    // Headless probe read — never drives anything. Epochs are the reliable
    // witness that a layer was KEPT across a transition (same number) rather
    // than restarted (bumped): a suspended headless context freezes
    // currentTime, so the gain values may read as their pre-ramp numbers.
    debugState() {
      return {
        recipe: playing.slice(),
        mood,
        room: verb ? verb.room() : null,
        ctxState: ctx ? ctx.state : null,   // suspended = every gain reads pre-ramp
        log: tlog.slice(),
        layers: {
          wind: wind ? { epoch: windEpoch, level: windLevel, gain: wind.gain(), flavor: wind.flavor() } : null,
          water: water ? { epoch: waterEpoch, gain: water.gain() } : null,
          music: music ? { epoch: musicEpoch, emitters: music.emitters(), chimes: musicChimed } : null,
          rain: rain ? { epoch: rainEpoch, gain: rain.gain() } : null,
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
      const { dryLevel, sendLevel } = calibrateMix(verbMix, MIX_BELL.kd, MIX_BELL.ks);
      const bus = placed(at, sendLevel, bellTail(v), dryLevel);
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
      let bus = null;
      if (!punctuate) {
        const { dryLevel, sendLevel } = calibrateMix(CHIME.verbMix, MIX_CHIME.kd, MIX_CHIME.ks);
        bus = placed(at, sendLevel, CHIME.decay + 1, dryLevel);
      }
      const dry = punctuate ? master : (bus ? bus.in : voicesDry);
      const wet = punctuate ? verb.in : (bus ? null : voicesWet);
      strikeBar(ctx, dry, wet, { f0, gain, verbMix: bus ? 0 : CHIME.verbMix });
    },
    // The large hanging cylinder (task-cylinder-brief.md) — its own voice,
    // not chimeStrike with different numbers: see BRONZE's comment in
    // synths.js for why sharing chimeStrike's register/decay would be
    // wrong. `note` is the scale-degree offset src/kit/cylinder.js derives
    // from the instance's own size (bigger cylinder, lower note) and
    // reports back on every onStrike — this method never sees a size, only
    // the note already decided, the same "engine owns Hz, kit owns degrees"
    // split chimeStrike documents above. No `punctuate` path: unlike the
    // furin's tube chimes, nothing in the reading narrates through this
    // voice today, so there is nothing yet to compensate for the duck.
    cylinderStrike({ note = 0, force = 1, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const f0 = hz(BRONZE.degree + note, mood);
      const { dryLevel, sendLevel } = calibrateMix(BRONZE.verbMix, MIX_BRONZE.kd, MIX_BRONZE.ks);
      const bus = placed(at, sendLevel, BRONZE.decay + 1, dryLevel);
      const dry = bus ? bus.in : voicesDry;
      const wet = bus ? null : voicesWet;
      strikeBar(ctx, dry, wet, {
        f0, gain: BRONZE.level * force, decay: BRONZE.decay, bright: BRONZE.bright,
        verbMix: bus ? 0 : BRONZE.verbMix,
      });
    },
    // a tap on the water (or the bowl set down in it) answers with a drip,
    // whatever the ambient schedule is doing
    drip({ loud = false, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      dripNow(loud, at);
    },
    // Case 34's tap: the shower leans in for a moment — bed swell plus a
    // couple of immediate plinks. A no-op when no rain layer is live.
    rainSurge() {
      if (!rain || !ctx || ctx.state !== 'running') return;
      rain.surge();
      rainDropNow();
      setTimeout(() => { if (rain && ctx.state === 'running') rainDropNow(); }, 350);
    },
    // the shishi-odoshi: the kit object fires onKnock/onPour, the case wires
    // them here — the same indirection as the furin
    knock({ force = 1, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const { dryLevel, sendLevel } = calibrateMix(ODOSHI.verbMix, MIX_ODOSHI.kd, MIX_ODOSHI.ks);
      const bus = placed(at, sendLevel, ODOSHI.decay + 1, dryLevel);
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
    // The dinner drum (case 13). Born on this branch like the touch voices,
    // so it takes MIX_TOUCH's judgment-call coefficients — see that
    // constant's own comment.
    drum({ force = 1, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const { dryLevel, sendLevel } = calibrateMix(DRUM.verbMix, MIX_TOUCH.kd, MIX_TOUCH.ks);
      const bus = placed(at, sendLevel, DRUM.tail, dryLevel);
      strike(ctx, bus ? bus.in : voicesDry, {
        // ±6 cents like every struck bar (jitterHz in strikeBar) — the bars
        // get theirs at the strikeBar choke point; the drum routes through
        // strike() directly, so its jitter rides in here at the same spot.
        partials: drumPartials(jitterHz(DRUM.f0)),
        gain: DRUM.level * force,
        // a drum is a THUMP like the knock, not a bell — same scale reasoning.
        // PROVISIONAL pending Frank's ear on dev/drum-audition.html, same as
        // every number below it (see CERAMIC's own comment for the precedent).
        scale: STRIKE_SCALE * 7,
        transient: [
          { dur: 0.035, freq: 120, q: 0.7, amp: 0.6 },   // the body's thump — PROVISIONAL
          { dur: 0.010, freq: 950, q: 0.8, amp: 0.3 },   // the skin's slap — PROVISIONAL
        ],
      });
    },
    pour({ at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      // pourBurst has no wet leg pre-branch — see MIX_NONE's own comment.
      const { dryLevel, sendLevel } = calibrateMix(0, MIX_NONE.kd, MIX_NONE.ks);
      const bus = placed(at, sendLevel, 2, dryLevel);
      pourBurst(ctx, bus ? bus.in : voicesDry, {});
    },
    // ---- the touch voices ----
    // Each is the same shape: place it if it said where it is, otherwise the
    // plain path. Every one of these is quiet on purpose — the book is an
    // ambient thing and a touch response that demands attention is a game.
    // CODE REVIEW CAUGHT: ceramic shipped with no scale override at all, so
    // its effective peak (CERAMIC.level * STRIKE_SCALE = 0.0083) landed about
    // 5x under wood's (0.09 * STRIKE_SCALE * 4 = 0.0396) and 13x under the
    // odoshi's knock (0.109) — a tipped pot would have been all but inaudible,
    // plausibly under the wind bed. `scale: STRIKE_SCALE * 5` brings its
    // effective peak (0.04125) into the same ballpark as wood's; PROVISIONAL
    // pending Frank's ear at the audition the next task's wiring gives it.
    //
    // CODE REVIEW CAUGHT (task-12): these four used to pass their own
    // verbMix straight through as `character` (this bus's sendLevel), the
    // exact bug this task exists to kill, just surviving inside its own fix
    // because these voices have no pre-branch history for calibrateMix() to
    // round-trip to. They go through it now anyway, with MIX_TOUCH's
    // judgment-call coefficients (see its own comment above) rather than a
    // derived pair — the four sat roughly 3x too dry at ref before this.
    ceramic({ force = 1, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const { dryLevel, sendLevel } = calibrateMix(CERAMIC.verbMix, MIX_TOUCH.kd, MIX_TOUCH.ks);
      const bus = placed(at, sendLevel, CERAMIC.tail, dryLevel);
      strike(ctx, bus ? bus.in : voicesDry, {
        partials: ceramicPartials(),
        gain: CERAMIC.level * force,
        scale: STRIKE_SCALE * 5,
        transient: { dur: 0.012, freq: 2500, q: 1.6, amp: 0.5 },
      });
    },
    wood({ force = 1, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const { dryLevel, sendLevel } = calibrateMix(WOOD.verbMix, MIX_TOUCH.kd, MIX_TOUCH.ks);
      const bus = placed(at, sendLevel, WOOD.tail, dryLevel);
      strike(ctx, bus ? bus.in : voicesDry, {
        partials: woodPartials(),
        gain: WOOD.level * force,
        scale: STRIKE_SCALE * 4,
        transient: { dur: 0.02, freq: 800, q: 1.1, amp: 0.55 },
      });
    },
    // noiseSwell has no separate wet leg the way strike()'s callers do — it
    // takes one `dest` and plays its whole envelope into it. So CLOTH.verbMix
    // and BREATH.verbMix only ever do anything on the PLACED path, as the
    // spatial bus's sendLevel (via MIX_TOUCH — see its own comment); the
    // unplaced fallback below is bone dry, same as pour()'s. Spreading
    // `...CLOTH`/`...BREATH` into noiseSwell reads as though verbMix were
    // honoured either way — it is not.
    cloth({ force = 1, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const { dryLevel, sendLevel } = calibrateMix(CLOTH.verbMix, MIX_TOUCH.kd, MIX_TOUCH.ks);
      const bus = placed(at, sendLevel, CLOTH.dur + 0.5, dryLevel);
      noiseSwell(ctx, bus ? bus.in : voicesDry, { ...CLOTH, level: CLOTH.level * force });
    },
    // `dur` is why this one takes an argument the others don't: case 1's Mu is
    // not a strike at all, it is the world thinning away over several seconds,
    // and it wants one long breath shaped to that gesture rather than a hit.
    breath({ force = 1, dur = BREATH.dur, at = null } = {}) {
      if (!ensureCtx() || ctx.state !== 'running') return;
      const { dryLevel, sendLevel } = calibrateMix(BREATH.verbMix, MIX_TOUCH.kd, MIX_TOUCH.ks);
      const bus = placed(at, sendLevel, dur + 0.5, dryLevel);
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
