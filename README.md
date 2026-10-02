# HTML + JSON extraction pipeline

[![Check](https://github.com/urazaev/html-json-extraction-pipeline/actions/workflows/check.yml/badge.svg)](https://github.com/urazaev/html-json-extraction-pipeline/actions/workflows/check.yml)

Extract numeric values from two different document shapes through one typed result
contract. Each field either produces exact integer minor units or a structured failure. A
missing value does not discard its successful siblings.

This is a small Node.js 22 / TypeScript example with synthetic, local fixtures. There are
no network requests, API keys, database connections or browser sessions.

## Run it

```sh
# Use Node.js 22; with nvm: nvm use
npm ci --ignore-scripts
npm run check
npm run demo
```

The demo prints a JSON report with two successful values and one deliberately missing
field:

| Field              | Source               | Result                          |
| ------------------ | -------------------- | ------------------------------- |
| `pagePrice`        | HTML: `1,234.50`     | `123450` minor units, scale `2` |
| `feedPrice`        | JSON: `1.234,50`     | `123450` minor units, scale `2` |
| `unavailablePrice` | Missing HTML element | `NO_MATCH`                      |

`npm run demo` reads only the three bundled files in `fixtures/`. Arguments are rejected.
It exits successfully for the intentional partial result; exit status `2` means
unsupported CLI arguments. An invalid configuration returns status `1`.

## Start reading here

1. [src/types.ts](src/types.ts) — the config and discriminated result types.
2. [src/extract.ts](src/extract.ts) — preparation, HTML/JSON selection and independent
   field results.
3. [src/config.ts](src/config.ts) — strict runtime config validation.
4. [src/number.ts](src/number.ts) — decimal strings to exact integer minor units.
5. [tests/extract.test.ts](tests/extract.test.ts) and
   [tests/number.test.ts](tests/number.test.ts) — failure cases and numeric boundaries.

```text
unknown config ── validate ── typed fields
                                  │
local HTML ── Cheerio ── CSS match ─┤
local JSON ── JSON.parse ── path ──┤
                                  ▼
                       strict numeric conversion
                                  │
                     ordered success/error results
```

Documents are prepared once per run. The pipeline returns results in config order.
`Report.ok` means the **config was accepted**, not that every field succeeded; inspect
each field's `ok` value. Unexpected programming errors are not silently converted into
data failures.

## Configuration

The public entry point is `extract(config: unknown, documents: Documents)`. Supply a
parsed, JSON-compatible config object and UTF-8 document strings. Unknown config
properties, unsupported locales, duplicate names and malformed path segments return
`INVALID_CONFIG` before extraction begins.

```ts
import { extract } from './src/extract.js';

const report = extract(
  {
    fields: [
      {
        name: 'price',
        source: { kind: 'html', selector: '[data-price]' },
        number: { locale: 'en-US', scale: 2 },
      },
    ],
  },
  { html: '<span data-price>12.30</span>' },
);
```

A successful field is `{ name, source, ok: true, value: { minorUnits, scale } }`. A failed
field is `{ name, source, ok: false, error: { code, message } }`. Error codes are stable
categories; messages are explanatory text.

| Code               | Meaning                                                       |
| ------------------ | ------------------------------------------------------------- |
| `INVALID_CONFIG`   | Whole-run failure; config structure or values are unsupported |
| `SOURCE_MISSING`   | A required document was not supplied                          |
| `INVALID_DOCUMENT` | Wrong document type, size limit exceeded or malformed JSON    |
| `INVALID_SELECTOR` | Invalid or unsupported CSS syntax                             |
| `NO_MATCH`         | No selected element, property or equality-filter match        |
| `AMBIGUOUS_MATCH`  | More than one element or equality-filter match                |
| `TYPE_MISMATCH`    | JSON path expected an object or array at a different value    |
| `INVALID_NUMBER`   | Selected value violates its numeric contract                  |

### HTML selection

Selectors must match **exactly one element**. Its descendant text is the numeric input.
Hidden elements remain eligible, including `[hidden]` and elements styled with
`display: none`. Use a specific selector when the document contains several versions of a
value.

Cheerio parses static markup: it does not compute visibility, apply CSS, run JavaScript or
load linked resources. A script-generated price is therefore missing. Invalid HTML may be
repaired by its HTML parser; this sample does not validate HTML conformance. See the
official [Cheerio introduction](https://cheerio.js.org/docs/intro/),
[loading API](https://cheerio.js.org/docs/basics/loading/#load) and
[selector guide](https://cheerio.js.org/docs/basics/selecting/).

### JSON selection

Paths are arrays of typed segments, not expressions to evaluate:

```json
[
  { "key": "items" },
  { "where": { "key": "code", "equals": "notebook" } },
  { "key": "price" }
]
```

A `key` segment reads an object's own property. A `where` segment requires an array and
exactly one object whose own property is strictly equal to the supplied string. Comparison
is case-sensitive and never coerces numbers. Missing and duplicate matches fail
explicitly.

There are no wildcards, numeric indices, recursive descent or executable expressions.
Identifiers use `[A-Za-z_][A-Za-z0-9_-]{0,63}`; `__proto__`, `prototype` and `constructor`
are forbidden. The code never traverses inherited properties or evaluates path text.

### Numeric contract

A selected value must be a string. JSON numeric values are rejected to avoid starting with
a potentially rounded binary floating-point value. Formats are explicit presets, not
locale inference or a complete international number parser:

| Preset  | Decimal mark | Optional grouping mark          | Example    |
| ------- | ------------ | ------------------------------- | ---------- |
| `en-US` | `.`          | `,`                             | `1,234.50` |
| `de-DE` | `,`          | `.`                             | `1.234,50` |
| `fr-FR` | `,`          | Narrow no-break space, `U+202F` | `1 234,50` |

- ASCII digits only. Leading/trailing ASCII spaces, tabs and line breaks are trimmed.
- No signs, negative values, parentheses, exponent notation, currency symbols or leading
  zeroes other than `0`.
- Grouping is optional; if present, the first group has 1–3 digits and subsequent groups
  exactly 3. Grouped values cannot start with zero.
- An integer part is required. A decimal mark requires 1–`scale` fractional digits. Scale
  is an integer from 0 to 6; scale 0 forbids a decimal mark.
- Missing fractional digits are padded with zeroes. Extra precision is rejected, never
  rounded.
- Conversion uses `BigInt` before returning a `number` bounded by
  `Number.MAX_SAFE_INTEGER`. The value represents units of `10^-scale`; it carries no
  inferred currency.

For example, `1,234` means 1234 with the explicit `en-US` preset. It is rejected with
`de-DE` at scale 2 because it has three fractional digits. Spaces and `U+00A0` are not
interchangeable with the `fr-FR` grouping mark.

## Tests and limits

`npm run check` verifies formatting, TypeScript and the `node:test` suite. Tests cover
both fixture adapters, partial results, hidden/static HTML behavior, malformed JSON,
selector/filter failures, strict config validation, own-property traversal, separator
rules, signs, precision, overflow and the CLI. Run `npm run format` to apply the committed
formatting style.

Config limits are 32 fields, 12 path segments, 256 selector characters and 128 characters
per equality value. Documents are limited to 1,000,000 JavaScript string code units;
selected numeric strings to 128. These bounds keep the example small; they are not a CPU
sandbox for hostile selectors or a streaming parser. The API accepts JSON-compatible data,
not adversarial JavaScript objects with getters or proxies.

The included CI workflow runs the same checks and demo on Node.js 22. It performs no
deployment or package publication. A production ingestion system would need separate
decisions about source access, scheduling, retries, freshness and observability; those
concerns are outside this local extraction example.
