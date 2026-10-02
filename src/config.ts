import { SEPARATORS } from './number.js';
import type { Config, Field, Locale, PathSegment, Source } from './types.js';

function object(
  value: unknown,
  keys: string[],
  location: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new Error(`${location} must be a plain object.`);
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(record, key))
  ) {
    throw new Error(`${location} must contain exactly: ${keys.join(', ')}.`);
  }
  return record;
}

function key(value: unknown, location: string): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(value) ||
    ['__proto__', 'prototype', 'constructor'].includes(value)
  ) {
    throw new Error(`${location} must be a safe identifier of 1–64 characters.`);
  }
  return value;
}

function segment(value: unknown, location: string): PathSegment {
  if (value && typeof value === 'object' && Object.hasOwn(value, 'key')) {
    const part = object(value, ['key'], location);
    return { key: key(part.key, `${location}.key`) };
  }
  const part = object(value, ['where'], location);
  const where = object(part.where, ['key', 'equals'], `${location}.where`);
  if (typeof where.equals !== 'string' || where.equals.length > 128) {
    throw new Error(
      `${location}.where.equals must be a string of at most 128 characters.`,
    );
  }
  return {
    where: { key: key(where.key, `${location}.where.key`), equals: where.equals },
  };
}

function source(value: unknown, location: string): Source {
  if (value && typeof value === 'object' && 'kind' in value && value.kind === 'html') {
    const input = object(value, ['kind', 'selector'], location);
    if (
      typeof input.selector !== 'string' ||
      !input.selector.trim() ||
      input.selector.length > 256
    ) {
      throw new Error(
        `${location}.selector must be a nonempty string of at most 256 characters.`,
      );
    }
    return { kind: 'html', selector: input.selector };
  }
  const input = object(value, ['kind', 'path'], location);
  if (
    input.kind !== 'json' ||
    !Array.isArray(input.path) ||
    input.path.length < 1 ||
    input.path.length > 12
  ) {
    throw new Error(`${location} must use kind json and 1–12 path segments.`);
  }
  return {
    kind: 'json',
    path: Array.from(input.path, (item, index) =>
      segment(item, `${location}.path[${index}]`),
    ),
  };
}

function field(value: unknown, index: number): Field {
  const location = `config.fields[${index}]`;
  const input = object(value, ['name', 'source', 'number'], location);
  const number = object(input.number, ['locale', 'scale'], `${location}.number`);
  if (
    typeof number.locale !== 'string' ||
    !Object.hasOwn(SEPARATORS, number.locale) ||
    typeof number.scale !== 'number' ||
    !Number.isInteger(number.scale) ||
    number.scale < 0 ||
    number.scale > 6
  ) {
    throw new Error(
      `${location}.number requires a supported locale and integer scale from 0 to 6.`,
    );
  }
  return {
    name: key(input.name, `${location}.name`),
    source: source(input.source, `${location}.source`),
    number: { locale: number.locale as Locale, scale: number.scale },
  };
}

/** Validate and copy an unknown JSON-compatible config at the public boundary. */
export function parseConfig(value: unknown): Config {
  const input = object(value, ['fields'], 'config');
  if (
    !Array.isArray(input.fields) ||
    input.fields.length < 1 ||
    input.fields.length > 32
  ) {
    throw new Error('config.fields must contain 1–32 fields.');
  }
  const fields = Array.from(input.fields, field);
  if (new Set(fields.map((item) => item.name)).size !== fields.length) {
    throw new Error('Field names must be unique.');
  }
  return { fields };
}
