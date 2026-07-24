import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, fitLine, findOutliers } from '../scripts/lib/narration-check.js';

test('median handles odd, even and empty', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

test('fitLine recovers overhead and rate', () => {
  const pts = [50, 100, 200, 400].map((x) => ({ x, y: 3 + 0.1 * x }));
  const { a, b } = fitLine(pts);
  assert.ok(Math.abs(a - 3) < 1e-9);
  assert.ok(Math.abs(b - 0.1) < 1e-12);
});

test('fitLine survives identical x values without dividing by zero', () => {
  const { a, b } = fitLine([{ x: 5, y: 2 }, { x: 5, y: 4 }]);
  assert.equal(b, 0);
  assert.equal(a, 3);
});

// Healthy prose: 3s of fixed overhead plus 0.1s per character.
const prose = (lengths, section = 'case') => lengths.map((chars, i) => ({
  key: `${i + 1}:${section}`, section, chars, metric: 3 + 0.1 * chars,
}));
const LENGTHS = [80, 150, 220, 300, 450, 600];

test('a short unit with normal overhead is not flagged', () => {
  // The case that motivated fitting a line: 72 characters, entirely healthy, but way
  // above the per-character median because fixed overhead dominates.
  const rows = [...prose(LENGTHS), { key: '9:case', section: 'case', chars: 72, metric: 3 + 0.1 * 72 }];
  assert.deepEqual(findOutliers(rows).flagged, []);
});

test('flags a short unit padded with spoken prompt text', () => {
  // Same 72-character unit, plus ~5s of title read aloud before the transcript.
  const rows = [...prose(LENGTHS), { key: '9:case', section: 'case', chars: 72, metric: 3 + 0.1 * 72 + 5 }];
  const { flagged } = findOutliers(rows);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].key, '9:case');
  assert.equal(flagged[0].kind, 'long');
});

test('flags a truncated unit', () => {
  const rows = [...prose(LENGTHS), { key: '9:case', section: 'case', chars: 600, metric: 12 }];
  const { flagged } = findOutliers(rows);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].kind, 'short');
});

test('verses are judged against verses, not against prose', () => {
  // Verses run far slower than prose; judging them against a shared baseline would
  // flag every one of them on every bake.
  const verses = LENGTHS.map((chars, i) => ({
    key: `${i + 1}:verse`, section: 'verse', chars, metric: 4 + 0.25 * chars,
  }));
  const { flagged, fits } = findOutliers([...prose(LENGTHS), ...verses]);
  assert.deepEqual(flagged, []);
  assert.ok(fits.verse.b > fits.case.b * 2);
});

test('a sample too small to have a baseline is not judged', () => {
  const rows = [
    { key: '1:case', section: 'case', chars: 200, metric: 20 },
    { key: '2:case', section: 'case', chars: 100, metric: 90 },
  ];
  assert.deepEqual(findOutliers(rows).flagged, []);
});

test('units with no text are ignored rather than dividing by zero', () => {
  const rows = [...prose(LENGTHS), { key: '9:case', section: 'case', chars: 0, metric: 5 }];
  assert.ok(findOutliers(rows).flagged.every((f) => f.key !== '9:case'));
});
