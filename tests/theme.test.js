import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, isTheme, readTheme, nextTheme, themeGlyph, themeTitle } from '../src/ui/theme_state.js';

test('two skins, and anything else is the light one', () => {
  assert.deepEqual(THEMES, ['light', 'dark']);
  assert.ok(isTheme('light') && isTheme('dark'));
  for (const junk of ['sepia', '', null, undefined, 0, 'DARK']) {
    assert.equal(isTheme(junk), false, `${junk} is not a theme`);
    assert.equal(readTheme(junk), 'light', `${junk} should read as light`);
  }
});

test('the toggle is a round trip', () => {
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme(nextTheme('light')), 'light');
  assert.equal(nextTheme('junk'), 'dark', 'a broken setting still turns the light off');
});

// The button says what a press would DO, not what is on — a moon means "turn it
// off", the way it does in every reading app.
test('the glyph names the press, not the state', () => {
  assert.equal(themeGlyph('light'), '☾');
  assert.equal(themeTitle('light'), 'Dark page');
  assert.equal(themeGlyph('dark'), '☼');
  assert.equal(themeTitle('dark'), 'Light page');
});

// U+2600 (☀) has an emoji presentation on many platforms and would render in
// colour beside a monochrome book; U+263C never does. This pin is the reason
// the sun here is the one it is.
test('both glyphs are text-presentation characters', () => {
  for (const t of THEMES) {
    const g = themeGlyph(t);
    assert.equal(g.length, 1, 'one character, no variation selector needed');
    const cp = g.codePointAt(0);
    assert.ok(cp === 0x263e || cp === 0x263c, `${g} (U+${cp.toString(16)}) is not the vetted pair`);
  }
});
