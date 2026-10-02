import { load, type CheerioAPI } from 'cheerio';
import { parseConfig } from './config.js';
import { parseMinorUnits } from './number.js';
import type {
  Config,
  Documents,
  ErrorCode,
  Field,
  FieldResult,
  PathSegment,
  Report,
} from './types.js';

class ExtractionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Prepared<T> = { ok: true; value: T } | { ok: false; error: ExtractionError };

function prepare<T>(
  raw: unknown,
  kind: 'HTML' | 'JSON',
  parse: (text: string) => T,
): Prepared<T> {
  if (raw === undefined) {
    return {
      ok: false,
      error: new ExtractionError(
        'SOURCE_MISSING',
        'The source document was not supplied.',
      ),
    };
  }
  if (typeof raw !== 'string' || raw.length > 1_000_000) {
    return {
      ok: false,
      error: new ExtractionError(
        'INVALID_DOCUMENT',
        'Expected a document string of at most 1,000,000 characters.',
      ),
    };
  }
  try {
    return { ok: true, value: parse(raw) };
  } catch {
    return {
      ok: false,
      error: new ExtractionError(
        'INVALID_DOCUMENT',
        `The ${kind} document is malformed.`,
      ),
    };
  }
}

function exactlyOne<T>(matches: T[]): T {
  if (matches.length === 0) {
    throw new ExtractionError('NO_MATCH', 'The selector did not match a value.');
  }
  if (matches.length !== 1) {
    throw new ExtractionError(
      'AMBIGUOUS_MATCH',
      'The selector matched more than one value.',
    );
  }
  return matches[0]!;
}

function htmlValue($: CheerioAPI, selector: string): string {
  let matches;
  try {
    // Query existing nodes; $(string) can also construct nodes from markup.
    // https://cheerio.js.org/docs/basics/traversing/#find
    matches = $.root().find(selector).toArray();
  } catch {
    throw new ExtractionError(
      'INVALID_SELECTOR',
      'The CSS selector is invalid or unsupported.',
    );
  }
  return $(exactlyOne(matches)).text();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function jsonValue(document: unknown, path: PathSegment[]): unknown {
  let current = document;
  for (const segment of path) {
    if ('key' in segment) {
      if (!isRecord(current)) {
        throw new ExtractionError(
          'TYPE_MISMATCH',
          'A property segment requires an object.',
        );
      }
      if (!Object.hasOwn(current, segment.key)) {
        throw new ExtractionError('NO_MATCH', 'The JSON property is missing.');
      }
      current = current[segment.key];
    } else {
      if (!Array.isArray(current)) {
        throw new ExtractionError(
          'TYPE_MISMATCH',
          'An equality filter requires an array.',
        );
      }
      const { key, equals } = segment.where;
      current = exactlyOne(
        current.filter(
          (item) => isRecord(item) && Object.hasOwn(item, key) && item[key] === equals,
        ),
      );
    }
  }
  return current;
}

function extractField(
  field: Field,
  html: Prepared<CheerioAPI>,
  json: Prepared<unknown>,
): FieldResult {
  const context = { name: field.name, source: field.source.kind };
  try {
    let raw: unknown;
    if (field.source.kind === 'html') {
      if (!html.ok) {
        throw html.error;
      }
      raw = htmlValue(html.value, field.source.selector);
    } else {
      if (!json.ok) {
        throw json.error;
      }
      raw = jsonValue(json.value, field.source.path);
    }
    try {
      return { ...context, ok: true, value: parseMinorUnits(raw, field.number) };
    } catch (error) {
      throw new ExtractionError(
        'INVALID_NUMBER',
        error instanceof Error ? error.message : 'Invalid numeric value.',
      );
    }
  } catch (error) {
    if (!(error instanceof ExtractionError)) {
      throw error;
    }
    return { ...context, ok: false, error: { code: error.code, message: error.message } };
  }
}

/** Config errors stop the run. Field errors preserve sibling results and order. */
export function extract(input: unknown, documents: Documents): Report {
  let config: Config;
  try {
    config = parseConfig(input);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INVALID_CONFIG',
        message: error instanceof Error ? error.message : 'Invalid configuration.',
      },
    };
  }
  // load(string) never executes page scripts or fetches linked resources.
  // https://cheerio.js.org/docs/basics/loading/#load
  const html = prepare(documents.html, 'HTML', (text) => load(text));
  const json = prepare(documents.json, 'JSON', (text) => JSON.parse(text) as unknown);
  return {
    ok: true,
    fields: config.fields.map((field) => extractField(field, html, json)),
  };
}
