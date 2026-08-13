import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k31 from '../src/koans/k31.js';
import { ACCENT } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// THE SEAL IS THE WOMAN. It used to be the two tea cups on the bench, which is
// a poor place to spend a page's one warm note: at the home lens they are two
// red specks in the middle distance, and the person actually giving the answer
// — the whole of what this case argues about — was painted the same ink as
// everybody else on the road (Frank: "let's have the old woman be red instead
// of the little cups there").

const accent = new THREE.Color(ACCENT).getHex();

function staged() {
  const root = k31.build(fakeCtx());
  root.scene.updateMatrixWorld(true);
  return root;
}

test('case 31: the old woman carries the accent', () => {
  const root = staged();
  // she is the monk standing at the stall — the traveller is the other one,
  // out on the road at +x
  const monks = root.scene.children.filter((c) => c.name === 'monk');
  assert.equal(monks.length, 2, 'the woman and the traveller');
  const woman = monks.find((m) => m.position.x < 0);
  assert.ok(woman, 'the woman stands at her stall');

  let red = 0;
  let ink = 0;
  woman.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    if (o.material.color.getHex() === accent) red++; else ink++;
  });
  assert.ok(red > 0, 'she is painted in the case accent');
  assert.equal(ink, 0, `and all of her is (${ink} meshes left in ink)`);
});

test('case 31: the cups are not the seal any more', () => {
  const root = staged();
  let cups = 0;
  root.scene.traverse((o) => {
    if (o.name !== 'cup') return;
    cups++;
    assert.notEqual(o.material.color.getHex(), accent, 'a cup is back to stall timber');
  });
  assert.equal(cups, 2, 'both cups are still on the bench');
});

test('case 31: one accent on the page, and it is a person', () => {
  // the book's rule is one warm note per page; this checks the move did not
  // simply add a second one
  const root = staged();
  const reds = [];
  root.scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === accent) {
      // name the owning prop, not the part
      let top = o;
      while (top.parent && top.parent !== root.scene) top = top.parent;
      reds.push(top.name || '(unnamed)');
    }
  });
  assert.ok(reds.length > 0);
  assert.deepEqual([...new Set(reds)], ['monk'], `only the woman is red, found: ${[...new Set(reds)]}`);
});
