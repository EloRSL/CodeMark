import { ErrorCode } from '@codemark/contracts';
import { describe, expect, it } from 'vitest';
import { checkLocales, flatKeys } from './keys';
import en from './locales/en.json';
import sl from './locales/sl.json';

describe('check:i18n', () => {
  it('passes for the real locale files', () => {
    expect(checkLocales(sl, en)).toEqual([]);
  });

  it('both files have errors.<CODE> for every error code (types.md)', () => {
    const errorKeys = ErrorCode.options.map((code) => `errors.${code}`);
    expect(flatKeys(sl)).toEqual(expect.arrayContaining(errorKeys));
    expect(flatKeys(en)).toEqual(expect.arrayContaining(errorKeys));
  });

  it('fails on a key missing from either file, at any depth', () => {
    expect(checkLocales({ a: 'x', b: { c: 'y' } }, { a: 'x', b: {} })).toEqual([
      'en.json is missing b.c',
    ]);
    expect(checkLocales({ a: 'x' }, { a: 'x', d: 'z' })).toEqual(['sl.json is missing d']);
  });

  it('compares plural keys without their suffixes', () => {
    const slovene = { files_one: '', files_two: '', files_few: '', files_other: '' };
    expect(checkLocales(slovene, { files_one: '', files_other: '' })).toEqual([]);
  });

  it('fails when a Slovene plural lacks one of its four forms', () => {
    const slovene = { files_one: '', files_two: '', files_other: '' };
    expect(checkLocales(slovene, { files_one: '', files_other: '' })).toEqual([
      'sl.json is missing files_few',
    ]);
  });
});
