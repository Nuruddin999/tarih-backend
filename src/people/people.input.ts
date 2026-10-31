import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Madhhab } from '@prisma/client';

type DictionaryEntry = { slug: string; title: string };
export type CreatePersonInput = {
  slug: string; name: string; honorific?: string; description?: string;
  birthHijri?: string; birthGregorian?: string; deathHijri?: string;
  deathGregorian?: string; dateNote?: string; cities: string[];
  madhhabs: Madhhab[]; eras: DictionaryEntry[]; specialties: DictionaryEntry[];
  sources: { title: string; url: string }[];
};
export type PeopleQuery = {
  q?: string; category?: string; era?: string; specialty?: string;
  madhhab?: Madhhab; page: number; limit: number;
};
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function fail(field: string): never { throw new BadRequestException(`Invalid ${field}`); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('object');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(key);
}
function string(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(field);
  return value.trim();
}
function slug(value: unknown, field: string): string {
  const result = string(value, field, 100);
  if (!slugPattern.test(result)) fail(field);
  return result;
}
function array<T>(value: unknown, field: string, parse: (item: unknown) => T, max = 30): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) fail(field);
  return value.map(parse);
}
function madhhab(value: unknown): Madhhab {
  if (!Object.values(Madhhab).includes(value as Madhhab)) fail('madhhab');
  return value as Madhhab;
}
function dictionary(value: unknown, field: string): DictionaryEntry[] {
  const entries = array(value, field, item => {
    const entry = object(item); keys(entry, ['slug', 'title']);
    return { slug: slug(entry.slug, `${field}.slug`), title: string(entry.title, `${field}.title`) };
  });
  if (new Set(entries.map(entry => entry.slug)).size !== entries.length) fail(field);
  return entries;
}
export function parsePerson(value: unknown): CreatePersonInput {
  const input = object(value);
  const optional = ['honorific', 'description', 'birthHijri', 'birthGregorian', 'deathHijri', 'deathGregorian', 'dateNote'] as const;
  keys(input, ['slug', 'name', ...optional, 'cities', 'madhhabs', 'eras', 'specialties', 'sources']);
  const result: CreatePersonInput = {
    slug: slug(input.slug, 'slug'), name: string(input.name, 'name'),
    cities: [...new Set(array(input.cities, 'cities', item => string(item, 'city')))],
    madhhabs: [...new Set(array(input.madhhabs, 'madhhabs', madhhab, 4))],
    eras: dictionary(input.eras, 'eras'), specialties: dictionary(input.specialties, 'specialties'),
    sources: array(input.sources, 'sources', item => {
      const source = object(item); keys(source, ['title', 'url']);
      const url = string(source.url, 'source.url', 2048);
      try { if (!['https:', 'http:'].includes(new URL(url).protocol)) fail('source.url'); }
      catch { fail('source.url'); }
      return { title: string(source.title, 'source.title'), url };
    }),
  };
  if (!result.eras.length) fail('eras: at least one era is required');
  if (result.specialties.some(entry => Object.values(Madhhab).includes(entry.slug as Madhhab))) {
    fail('specialties: use madhhabs for legal schools');
  }
  for (const field of optional) {
    if (input[field] !== undefined) result[field] = string(input[field], field, field === 'description' ? 10000 : 1000);
  }
  return result;
}
export function parsePeopleQuery(value: unknown): PeopleQuery {
  const input = object(value);
  keys(input, ['q', 'category', 'era', 'specialty', 'madhhab', 'page', 'limit']);
  const result: PeopleQuery = { page: 1, limit: 20 };
  if (input.q !== undefined) {
    if (typeof input.q !== 'string' || input.q.length > 200) fail('q');
    result.q = input.q.trim() || undefined;
  }
  for (const field of ['category', 'era', 'specialty'] as const) {
    if (input[field] !== undefined) result[field] = slug(input[field], field);
  }
  if (result.category === 'all') result.category = undefined;
  if (input.madhhab !== undefined) result.madhhab = madhhab(input.madhhab);
  for (const field of ['page', 'limit'] as const) {
    const raw = input[field];
    if (raw === undefined) continue;
    if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) fail(field);
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n > (field === 'limit' ? 100 : 1000000)) fail(field);
    result[field] = n;
  }
  return result;
}
@Injectable()
export class CreatePersonPipe implements PipeTransform {
  transform(value: unknown) { return parsePerson(value); }
}
@Injectable()
export class PeopleQueryPipe implements PipeTransform {
  transform(value: unknown) { return parsePeopleQuery(value); }
}
