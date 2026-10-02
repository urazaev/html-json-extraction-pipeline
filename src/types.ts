export type Locale = 'en-US' | 'de-DE' | 'fr-FR';
export type NumberFormat = { locale: Locale; scale: number };
export type MinorAmount = { minorUnits: number; scale: number };
export type PathSegment = { key: string } | { where: { key: string; equals: string } };
export type Source =
  { kind: 'html'; selector: string } | { kind: 'json'; path: PathSegment[] };
export type Field = { name: string; source: Source; number: NumberFormat };
export type Config = { fields: Field[] };
export type ErrorCode =
  | 'SOURCE_MISSING'
  | 'INVALID_DOCUMENT'
  | 'INVALID_SELECTOR'
  | 'NO_MATCH'
  | 'AMBIGUOUS_MATCH'
  | 'TYPE_MISMATCH'
  | 'INVALID_NUMBER';
export type FieldResult = { name: string; source: Source['kind'] } & (
  | { ok: true; value: MinorAmount }
  | { ok: false; error: { code: ErrorCode; message: string } }
);
export type Report =
  | { ok: true; fields: FieldResult[] }
  | { ok: false; error: { code: 'INVALID_CONFIG'; message: string } };
export type Documents = { html?: string; json?: string };
