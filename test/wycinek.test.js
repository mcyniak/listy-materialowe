import test from 'node:test';
import assert from 'node:assert/strict';
import { przytnij, pasy } from '../public/src/strony.js';

test('wycinek przycięty do strony, odwrócone rogi poprawione', () => {
  const o = przytnij({ x0: 2000, y0: 3000, x1: -50, y1: 2400 }, 1820, 2576);
  assert.deepEqual([o.x0, o.y0, o.x1, o.y1], [0, 2400, 1820, 2576]);
});

test('mały wycinek powiększony, ale najwyżej 4×', () => {
  assert.equal(przytnij({ x0: 0, y0: 0, x1: 900, y1: 300 }, 1820, 2576).zoom, 2);
  assert.equal(przytnij({ x0: 0, y0: 0, x1: 100, y1: 50 }, 1820, 2576).zoom, 4);
  assert.equal(przytnij({ x0: 0, y0: 0, x1: 1820, y1: 2576 }, 1820, 2576).zoom, 1);
});

test('pasy: prawa część strony, cała wysokość, z zakładką', () => {
  const p = pasy(1820, 2576);
  assert.equal(p.length, 3);
  assert.equal(p[0].y0, 0);
  assert.equal(p[2].y1, 2576);
  assert.ok(p.every(x => x.x0 === 728 && x.x1 === 1820));
  assert.ok(p[1].y0 < p[0].y1 && p[2].y0 < p[1].y1);
});
