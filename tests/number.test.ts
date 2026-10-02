import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMinorUnits } from '../src/number.js';
import type { Locale } from '../src/types.js';

for (const [locale, text, expected] of [
  ['en-US', '1,234.50', 123450], ['de-DE', '1.234,50', 123450],
  ['fr-FR', '1\u202f234,50', 123450], ['en-US', '0', 0],
  ['en-US', '12.3', 1230], ['en-US', ' 12.30\n', 1230],
] as const) {
  test(`${locale} converts ${JSON.stringify(text)} to exact minor units`, () => {
    assert.deepEqual(parseMinorUnits(text, { locale, scale: 2 }), { minorUnits: expected, scale: 2 });
  });
}

test('integer scale and six fractional digits remain exact', () => {
  assert.deepEqual(parseMinorUnits('1,234', { locale: 'en-US', scale: 0 }), { minorUnits: 1234, scale: 0 });
  assert.deepEqual(parseMinorUnits('0.000001', { locale: 'en-US', scale: 6 }), { minorUnits: 1, scale: 6 });
});

for (const text of ['-1.00', '+1.00', '(1.00)', '1e3', '12 USD', '1,23.45', '1.234,50',
  '1.234', '12.', '.50', '01.00', '0,000.10', '1 234.50', '', 'NaN', 'Infinity', '1.2.3']) {
  test(`rejects malformed or incompatible en-US value ${JSON.stringify(text)}`, () => {
    assert.throws(() => parseMinorUnits(text, { locale: 'en-US', scale: 2 }));
  });
}

test('locale separators are explicit rather than guessed', () => {
  assert.equal(parseMinorUnits('1,234', { locale: 'en-US', scale: 2 }).minorUnits, 123400);
  assert.throws(() => parseMinorUnits('1,234', { locale: 'de-DE', scale: 2 }));
  assert.throws(() => parseMinorUnits('1 234,50', { locale: 'fr-FR', scale: 2 }));
  assert.throws(() => parseMinorUnits('1\u00a0234,50', { locale: 'fr-FR', scale: 2 }));
});

test('rejects extra precision rather than rounding', () => {
  assert.throws(() => parseMinorUnits('1.001', { locale: 'en-US', scale: 2 }));
  assert.throws(() => parseMinorUnits('1.0', { locale: 'en-US', scale: 0 }));
});

test('never silently coerces JSON numbers, null or objects', () => {
  for (const value of [12.5, null, true, {}, ['12.50']]) {
    assert.throws(() => parseMinorUnits(value, { locale: 'en-US', scale: 2 }));
  }
});

test('allows the safe integer boundary, rejects overflow and excessive text', () => {
  assert.equal(parseMinorUnits('90071992547409.91', { locale: 'en-US', scale: 2 }).minorUnits, Number.MAX_SAFE_INTEGER);
  assert.throws(() => parseMinorUnits('90071992547409.92', { locale: 'en-US', scale: 2 }));
  assert.throws(() => parseMinorUnits('1'.repeat(129), { locale: 'en-US', scale: 2 }));
});

test('rejects invalid format even when called without the config boundary', () => {
  for (const scale of [-1, 1.5, 7, NaN]) assert.throws(() => parseMinorUnits('1', { locale: 'en-US', scale }));
  assert.throws(() => parseMinorUnits('1', { locale: 'xx' as Locale, scale: 2 }));
});
