import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { extract } from '../src/extract.js';
import type { Config, Field, FieldResult, Report } from '../src/types.js';

const html = readFileSync(new URL('../fixtures/catalog.html', import.meta.url), 'utf8');
const json = readFileSync(new URL('../fixtures/catalog.json', import.meta.url), 'utf8');
const htmlField: Field = {
  name: 'pagePrice',
  source: { kind: 'html', selector: '[data-item="notebook"] .price' },
  number: { locale: 'en-US', scale: 2 },
};
const jsonField: Field = {
  name: 'feedPrice',
  source: {
    kind: 'json',
    path: [
      { key: 'items' },
      { where: { key: 'code', equals: 'notebook' } },
      { key: 'price' },
    ],
  },
  number: { locale: 'de-DE', scale: 2 },
};
const config: Config = { fields: [htmlField, jsonField] };
function fields(report: Report): FieldResult[] {
  assert.equal(report.ok, true);
  if (!report.ok) throw new Error('Expected a valid config');
  return report.fields;
}
function errorCode(report: Report): string {
  const result = fields(report)[0];
  assert.ok(result && !result.ok);
  return result.error.code;
}
function htmlSelector(selector: string): Config {
  return { fields: [{ ...htmlField, source: { kind: 'html', selector } }] };
}

test('HTML and JSON adapters produce the same exact value through one contract', () => {
  assert.deepEqual(fields(extract(config, { html, json })), [
    {
      name: 'pagePrice',
      source: 'html',
      ok: true,
      value: { minorUnits: 123450, scale: 2 },
    },
    {
      name: 'feedPrice',
      source: 'json',
      ok: true,
      value: { minorUnits: 123450, scale: 2 },
    },
  ]);
});

test('missing HTML selector preserves successful JSON sibling in field order', () => {
  const report = fields(
    extract({ fields: [...htmlSelector('#missing').fields, jsonField] }, { html, json }),
  );
  assert.equal(report[0]?.ok, false);
  assert.deepEqual(report[1], {
    name: 'feedPrice',
    source: 'json',
    ok: true,
    value: { minorUnits: 123450, scale: 2 },
  });
  assert.equal(errorCode(extract(htmlSelector('#missing'), { html })), 'NO_MATCH');
});

test('malformed JSON produces a source failure while HTML still succeeds', () => {
  const report = fields(extract(config, { html, json: '{broken' }));
  assert.equal(report[0]?.ok, true);
  assert.deepEqual(report[1], {
    name: 'feedPrice',
    source: 'json',
    ok: false,
    error: { code: 'INVALID_DOCUMENT', message: 'The JSON document is malformed.' },
  });
});

test('missing and oversized documents have explicit failures', () => {
  assert.equal(errorCode(extract(htmlSelector('.price'), {})), 'SOURCE_MISSING');
  assert.equal(
    errorCode(extract(htmlSelector('.price'), { html: 'x'.repeat(1_000_001) })),
    'INVALID_DOCUMENT',
  );
});

test('static policy includes hidden markup but never executes scripts', () => {
  assert.equal(fields(extract(htmlSelector('[hidden] .price'), { html }))[0]?.ok, true);
  assert.equal(errorCode(extract(htmlSelector('#dynamic-price'), { html })), 'NO_MATCH');
  const hiddenStyle = '<span style="display:none" id="price">5.00</span>';
  assert.deepEqual(fields(extract(htmlSelector('#price'), { html: hiddenStyle }))[0], {
    name: 'pagePrice',
    source: 'html',
    ok: true,
    value: { minorUnits: 500, scale: 2 },
  });
});

test('multiple HTML matches fail rather than silently picking the first', () => {
  assert.equal(errorCode(extract(htmlSelector('.price'), { html })), 'AMBIGUOUS_MATCH');
});

test('invalid CSS syntax is a field error, not an uncaught exception', () => {
  assert.equal(errorCode(extract(htmlSelector('['), { html })), 'INVALID_SELECTOR');
});

test('empty and non-numeric HTML content do not become zero', () => {
  for (const text of ['', 'unavailable']) {
    assert.equal(
      errorCode(
        extract(htmlSelector('#price'), { html: `<span id="price">${text}</span>` }),
      ),
      'INVALID_NUMBER',
    );
  }
});

test('JSON equality filters require one exact, case-sensitive string match', () => {
  const onlyJson = { fields: [jsonField] };
  assert.equal(
    errorCode(
      extract(onlyJson, { json: '{"items":[{"code":"NOTEBOOK","price":"1,00"}]}' }),
    ),
    'NO_MATCH',
  );
  assert.equal(
    errorCode(
      extract(onlyJson, { json: '{"items":[{"code":"notebook"},{"code":"notebook"}]}' }),
    ),
    'AMBIGUOUS_MATCH',
  );
  assert.equal(errorCode(extract(onlyJson, { json: '{"items":{}}' })), 'TYPE_MISMATCH');
  assert.equal(
    errorCode(extract(onlyJson, { json: '{"items":[null,{},1]}' })),
    'NO_MATCH',
  );
});

test('JSON path rejects missing keys, wrong containers and non-string numbers', () => {
  const field = { ...jsonField, source: { kind: 'json', path: [{ key: 'price' }] } };
  for (const [document, expected] of [
    ['{}', 'NO_MATCH'],
    ['[]', 'TYPE_MISMATCH'],
    ['null', 'TYPE_MISMATCH'],
    ['{"price":12.5}', 'INVALID_NUMBER'],
    ['{"price":"-1,00"}', 'INVALID_NUMBER'],
  ] as const)
    assert.equal(errorCode(extract({ fields: [field] }, { json: document })), expected);
});

test('configuration failures are distinguished from extraction failures', () => {
  const invalidConfigs: unknown[] = [
    null,
    [],
    {},
    { fields: [] },
    { fields: [htmlField], url: 'https://example.invalid' },
    { fields: [htmlField, htmlField] },
    { fields: [{ ...htmlField, typo: true }] },
    { fields: [{ ...htmlField, name: '__proto__' }] },
    { fields: [{ ...htmlField, number: { locale: 'xx', scale: 2 } }] },
    { fields: [{ ...htmlField, number: { locale: 'en-US', scale: -1 } }] },
    { fields: [{ ...htmlField, number: { locale: 'en-US', scale: 2, decimal: ',' } }] },
    { fields: [{ ...htmlField, source: { kind: 'html', selector: '' } }] },
    { fields: [{ ...jsonField, source: { kind: 'json', path: 'items.price' } }] },
    { fields: [{ ...jsonField, source: { kind: 'json', path: [] } }] },
    {
      fields: [
        { ...jsonField, source: { kind: 'json', path: [{ key: 'constructor' }] } },
      ],
    },
    {
      fields: [{ ...jsonField, source: { kind: 'json', path: [{ key: '__proto__' }] } }],
    },
    {
      fields: [{ ...jsonField, source: { kind: 'json', path: [{ key: 'prototype' }] } }],
    },
    {
      fields: [
        {
          ...jsonField,
          source: { kind: 'json', path: [{ where: { key: 'code', equals: 1 } }] },
        },
      ],
    },
    {
      fields: [
        {
          ...jsonField,
          source: {
            kind: 'json',
            path: [{ key: 'items', where: { key: 'code', equals: 'a' } }],
          },
        },
      ],
    },
  ];
  for (const input of invalidConfigs) {
    const report = extract(input, { html, json });
    assert.equal(report.ok, false, JSON.stringify(input));
    if (!report.ok) assert.equal(report.error.code, 'INVALID_CONFIG');
  }
});

test('JSON traversal never resolves inherited properties', () => {
  const field = { ...jsonField, source: { kind: 'json', path: [{ key: 'toString' }] } };
  assert.equal(errorCode(extract({ fields: [field] }, { json: '{}' })), 'NO_MATCH');
});

test('identifiers reject trailing line terminators in field names and JSON paths', () => {
  for (const suffix of ['\n', '\r', '\u2028', '\u2029']) {
    const invalidFields = [
      { ...htmlField, name: `price${suffix}` },
      { ...jsonField, source: { kind: 'json', path: [{ key: `price${suffix}` }] } },
      {
        ...jsonField,
        source: {
          kind: 'json',
          path: [{ where: { key: `code${suffix}`, equals: 'notebook' } }],
        },
      },
    ];
    for (const field of invalidFields) {
      const report = extract({ fields: [field] }, { html, json });
      assert.equal(report.ok, false);
      if (!report.ok) assert.equal(report.error.code, 'INVALID_CONFIG');
    }
  }
});
