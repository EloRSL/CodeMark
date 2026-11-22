import { describe, expect, it } from 'vitest';
import {
  AuthStartQuery,
  boundedText,
  CheckSummary,
  CreateExamBody,
  ExamSettings,
  LIMITS,
  safeReturnTo,
  Task,
  UpdateMeBody,
  UpdateSettingsBody,
  Uuid,
} from './index';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ok = (schema: { safeParse(v: unknown): { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('contracts', () => {
  it('counts UTF-8 bytes in boundedText', () => {
    expect(ok(boundedText(3), 'čš')).toBe(false); // 4 bytes
    expect(ok(boundedText(4), 'čš')).toBe(true);
  });

  it('accepts the fixed demo IDs as UUIDs', () => {
    expect(ok(Uuid, id(1))).toBe(true);
  });

  it.each([
    ['/exams/1?tab=review#top', '/exams/1?tab=review#top'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['/\t/evil.com', '/'],
    ['/\n/evil.com', '/'],
    ['https://evil.com', '/'],
    ['//[', '/'],
    [undefined, '/'],
  ])('safeReturnTo(%j) is %j', (value, expected) => {
    expect(safeReturnTo(value)).toBe(expected);
  });

  it('turns a returnTo longer than 2000 characters into /', () => {
    expect(safeReturnTo('/' + 'a'.repeat(1999))).toBe('/' + 'a'.repeat(1999));
    expect(safeReturnTo('/' + 'a'.repeat(2000))).toBe('/');
  });

  it('runs returnTo through safeReturnTo and never fails', () => {
    expect(AuthStartQuery.parse({})).toEqual({ returnTo: '/' });
    expect(AuthStartQuery.parse({ returnTo: '/\\evil.com' })).toEqual({ returnTo: '/' });
    expect(AuthStartQuery.parse({ returnTo: 42 })).toEqual({ returnTo: '/' });
  });

  it('needs thresholds in order, and at most 100 on the percent scale', () => {
    const settings = (t10: number, t9 = 80) => ({
      scale: 'percent',
      thresholds: { '6': 50, '7': 60, '8': 70, '9': t9, '10': t10 },
      autocomplete: true,
    });
    expect(ok(ExamSettings, settings(90))).toBe(true);
    expect(ok(ExamSettings, settings(90, 95))).toBe(false);
    expect(ok(ExamSettings, settings(101, 95))).toBe(false);
    expect(ok(ExamSettings, { ...settings(101, 95), scale: 'points' })).toBe(true);
  });

  it('checks the task rules', () => {
    const criterion = (n: number, kind: 'ai' | 'runs') => ({
      id: id(n),
      name: 'c',
      description: '',
      maxPoints: 1,
      kind,
    });
    const test = (n: number, visibility: 'public' | 'hidden') => ({
      id: id(n),
      visibility,
      input: '',
      expectedOutput: '',
    });
    const task = { id: id(1), title: 't', instructions: '', tips: '', starterCode: '' };
    const valid = {
      ...task,
      timeLimitMs: 2000,
      criteria: [criterion(2, 'ai'), criterion(3, 'runs')],
      tests: [test(4, 'hidden')],
    };
    expect(ok(Task, valid)).toBe(true);
    expect(ok(Task, { ...valid, criteria: [criterion(2, 'runs'), criterion(3, 'runs')] })).toBe(
      false,
    );
    expect(ok(Task, { ...valid, tests: [test(4, 'public')] })).toBe(false);
    expect(ok(Task, { ...valid, tests: [test(4, 'hidden'), test(4, 'hidden')] })).toBe(false);
    expect(ok(Task, { ...valid, timeLimitMs: 999 })).toBe(false);
    expect(ok(Task, { ...valid, instructions: 'x'.repeat(LIMITS.taskInstructionsChars) })).toBe(
      true,
    );
    expect(ok(Task, { ...valid, instructions: 'x'.repeat(LIMITS.taskInstructionsChars + 1) })).toBe(
      false,
    );
  });

  it('needs closesAt exactly for a non-practice exam, and after opensAt', () => {
    const body = { title: 'Exam', opensAt: '2026-12-01T09:00:00Z', practice: false };
    expect(ok(CreateExamBody, { ...body, closesAt: '2026-12-01T10:00:00Z' })).toBe(true);
    expect(ok(CreateExamBody, { ...body, closesAt: '2026-12-01T08:00:00Z' })).toBe(false);
    expect(ok(CreateExamBody, { ...body, closesAt: null })).toBe(false);
    expect(ok(CreateExamBody, { ...body, closesAt: null, practice: true })).toBe(true);
  });

  it('keeps an exam title at 1 to 200 characters when it changes', () => {
    expect(ok(UpdateSettingsBody, { title: 'a'.repeat(200) })).toBe(true);
    expect(ok(UpdateSettingsBody, { title: 'a'.repeat(201) })).toBe(false);
    expect(ok(UpdateSettingsBody, { title: '' })).toBe(false);
    expect(ok(UpdateSettingsBody, { opensAt: '2026-12-01T09:00:00Z' })).toBe(true);
  });

  it('needs at least one field in UpdateMeBody', () => {
    expect(ok(UpdateMeBody, {})).toBe(false);
    expect(ok(UpdateMeBody, { locale: 'en' })).toBe(true);
  });

  it('keeps firstFailure null exactly when every test passed', () => {
    expect(ok(CheckSummary, { passed: 3, total: 3, firstFailure: null })).toBe(true);
    expect(ok(CheckSummary, { passed: 0, total: 0, firstFailure: null })).toBe(true);
    expect(ok(CheckSummary, { passed: 2, total: 3, firstFailure: null })).toBe(false);
    const timeout = { kind: 'timeout', errorType: 'ValueError' };
    expect(ok(CheckSummary, { passed: 2, total: 3, firstFailure: timeout })).toBe(false);
  });
});
