// Pure outlier detection for a narration bake.
//
// Each of the 147 units is generated independently, so two failure modes can slip
// through silently: a take that is truncated, and a take where the model reads part of
// the prompt aloud before the transcript. Both show up as a unit whose duration is far
// from what its length predicts.
//
// Two things make a naive "duration per character" comparison useless here:
//
//   1. Every take carries fixed overhead — a breath before the first word, a beat after
//      the last. On a 72-character case that overhead dominates, so short units look
//      anomalous while being perfectly fine. Fitting a line (overhead + per-character
//      rate) models that instead of mistaking it for a defect, and it also makes real
//      bleed easier to see on exactly those short units, where a spoken title is a
//      large fraction of the total.
//   2. Verses are read slowly with a pause at every line break, so their rate is
//      legitimately far above prose. Each section type gets its own fit.

export function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Theil–Sen fit of y = a + b·x: the median of all pairwise slopes. Deliberately not
// least squares — the points we most want to catch are outliers at the extremes of the
// length range, and those have enough leverage to drag a least-squares line onto
// themselves, hiding the very defect we are looking for and smearing blame across
// healthy units. A median of slopes is unmoved until a quarter of the data is bad.
// Quadratic in the group size, which at ~49 units a section is nothing.
export function fitLine(points) {
  const n = points.length;
  if (!n) return { a: 0, b: 0 };
  const slopes = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = points[j].x - points[i].x;
      if (dx !== 0) slopes.push((points[j].y - points[i].y) / dx);
    }
  }
  if (!slopes.length) return { a: median(points.map((p) => p.y)), b: 0 };  // every x identical
  const b = median(slopes);
  return { a: median(points.map((p) => p.y - b * p.x)), b };
}

// rows: [{ key, section, chars, metric }] where metric is seconds (preferred) or bytes.
// Returns the per-section fit plus anything far from what that fit predicts.
export function findOutliers(rows, { high = 1.35, low = 0.6, minSamples = 5 } = {}) {
  const bySection = new Map();
  for (const r of rows) {
    if (!r.chars) continue;                       // nothing to predict from
    if (!bySection.has(r.section)) bySection.set(r.section, []);
    bySection.get(r.section).push(r);
  }

  const fits = {};
  const flagged = [];
  for (const [section, group] of bySection) {
    const fit = fitLine(group.map((r) => ({ x: r.chars, y: r.metric })));
    fits[section] = fit;
    // A handful of samples can't establish a baseline, and neither can a group whose
    // units are all the same length — a scoped run would otherwise judge its own
    // tiny sample as anomalous.
    const spread = new Set(group.map((r) => r.chars)).size;
    if (group.length < minSamples || spread < 2) continue;

    for (const r of group) {
      const predicted = fit.a + fit.b * r.chars;
      if (predicted <= 0) continue;
      const ratio = r.metric / predicted;
      if (ratio > high) flagged.push({ ...r, predicted, ratio, kind: 'long' });
      else if (ratio < low) flagged.push({ ...r, predicted, ratio, kind: 'short' });
    }
  }
  flagged.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));
  return { fits, flagged };
}
