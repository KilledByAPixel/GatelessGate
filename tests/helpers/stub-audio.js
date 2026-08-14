// The one audio stub. Fifteen test files used to hand-roll their own object
// literal ({ chimeStrike() {}, knock() {}, ... }) — k29 alone carried eight —
// and every interaction-audit round that gave a case a new voice broke
// whichever private stubs lacked the method: the `breath() {}` patch alone
// spread across four separate commits, each finding another file's copy by
// hand. One stub, superset of the engine's one-shot surface, ends the class:
// a new voice is added HERE once and every consumer already has it.
//
// Records one-shots into `calls` as [kind, arg] — staging.test.js's own
// recording shape, kept because half the assertions in the suite filter on
// the kind tag. Read a specific voice with `calls.filter(([k]) => k === 'chime')`.
//
// THE BED LEVELS ARE NOT RECORDED BY DEFAULT (setWindLevel/setRainLevel/
// setWaterSwell/setGust): a case that drives its weather every frame has not
// ANSWERED anything, and chime-staging's "exactly one call" test counts raw
// calls. Pass { recordLevels: true } to record setWindLevel as ['wind', v] —
// the staging net does, because case 19's touches genuinely answer with the
// wind bed and nothing else, an editorial choice the net must not fail.
export function stubAudio({ recordLevels = false } = {}) {
  const calls = [];
  const rec = (kind) => (arg) => calls.push([kind, arg]);
  const level = (kind) => (recordLevels ? rec(kind) : () => {});
  return {
    calls,
    // the one-shots — every voice the engine exposes to a case
    bell: rec('bell'), chimeStrike: rec('chime'), cylinderStrike: rec('cylinder'),
    knock: rec('knock'), drum: rec('drum'), drip: rec('drip'), pour: rec('pour'),
    rainSurge: rec('rainSurge'), ceramic: rec('ceramic'), wood: rec('wood'),
    cloth: rec('cloth'), breath: rec('breath'), sitBell: rec('sitBell'),
    // lifecycle and ducking — recorded, cheap to ignore
    startAmbience: rec('start'), stopAmbience: rec('stop'), duck: rec('duck'),
    // the per-frame bed levels — see the header
    setWindLevel: level('wind'),
    setRainLevel() {}, setWaterSwell() {}, setGust() {},
    // mood/scale surface some cases touch
    setMood() {}, hushVoices() {},
  };
}
