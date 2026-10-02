import type { MinorAmount, NumberFormat } from './types.js';

export const SEPARATORS = {
  'en-US': { decimal: '.', group: ',' },
  'de-DE': { decimal: ',', group: '.' },
  'fr-FR': { decimal: ',', group: '\u202f' },
} as const;

export function parseMinorUnits(raw: unknown, format: NumberFormat): MinorAmount {
  if (!Object.hasOwn(SEPARATORS, format.locale) || !Number.isInteger(format.scale)
    || format.scale < 0 || format.scale > 6) throw new Error('Unsupported numeric format.');
  if (typeof raw !== 'string' || raw.length > 128) throw new Error('Expected a numeric string of at most 128 characters.');
  const text = raw.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  const { decimal, group } = SEPARATORS[format.locale];
  const parts = text.split(decimal);
  if (parts.length > 2) throw new Error('More than one decimal separator.');
  const [integer = '', fraction] = parts;
  const groups = integer.split(group);
  const validInteger = groups.length === 1
    ? /^(0|[1-9][0-9]*)$/.test(integer)
    : /^[1-9][0-9]{0,2}$/.test(groups[0] ?? '') && groups.slice(1).every(part => /^[0-9]{3}$/.test(part));
  if (!validInteger) throw new Error('Invalid integer or grouping for the selected locale.');
  if (fraction !== undefined && (format.scale === 0 || !/^[0-9]+$/.test(fraction) || fraction.length > format.scale)) {
    throw new Error('Invalid fraction or excess precision; values are never rounded.');
  }
  const digits = groups.join('') + (fraction ?? '').padEnd(format.scale, '0');
  const minorUnits = BigInt(digits);
  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Minor units exceed the safe integer range.');
  return { minorUnits: Number(minorUnits), scale: format.scale };
}
