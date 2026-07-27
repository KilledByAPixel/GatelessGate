// Pure words-per-second pace analysis for a narration bake.
//
// A companion to narration-check.js. That one fits duration against character count;
// this one measures *speaking pace* — words per second after crediting the time that
// isn't speech: a short beat at each paragraph break, and a settling beat before the
// first word. What's left is time actually spent saying words, so the two failure
// modes stand out by direction:
//
//   fast for its section  → spoke fewer words than the text has  → likely a DROPOUT
//   slow for its section  → a repeated line, or dead air         → likely PADDING
//
// The two audits normalise differently (chars vs words, fitted line vs section mean),
// so each catches edge units the other misses — worth running both.

export function countWords(text) {
  const t = (text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

export function countParagraphs(text) {
  return (text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).length;
}

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// rows: [{ key, section, words, paras, seconds }]
// Credits `paraPause` seconds per internal paragraph break and a flat `leadIn` before
// the first word, then measures words / remaining time and compares each unit to its
// section's mean pace. `minWords` marks the tiny units whose fixed per-unit overhead
// this model can't fully remove — still reported, but flagged as noisy. `minSamples`
// keeps a scoped run from judging its own handful of units against themselves.
export function findPaceOutliers(rows, {
  paraPause = 0.5, leadIn = 0.25, high = 1.3, low = 0.7, floor = 0.5, minWords = 12, minSamples = 5,
} = {}) {
  const withPace = rows.map((r) => {
    const breaks = Math.max(0, r.paras - 1);
    const speak = Math.max(floor, r.seconds - breaks * paraPause - leadIn);
    return { ...r, speak, pace: r.words / speak };
  });

  const bySection = new Map();
  for (const r of withPace) {
    if (!bySection.has(r.section)) bySection.set(r.section, []);
    bySection.get(r.section).push(r);
  }

  const means = {};
  const flagged = [];
  for (const [section, group] of bySection) {
    const m = mean(group.map((r) => r.pace));
    means[section] = m;
    if (group.length < minSamples || !m) continue;   // too few to set a baseline
    for (const r of group) {
      const ratio = r.pace / m;
      r.ratio = ratio;
      if (ratio >= high) flagged.push({ ...r, sectionMean: m, ratio, kind: 'fast', short: r.words < minWords });
      else if (ratio <= low) flagged.push({ ...r, sectionMean: m, ratio, kind: 'slow', short: r.words < minWords });
    }
  }
  // Worst deviations first, in either direction.
  flagged.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));
  return { means, rows: withPace, flagged };
}
