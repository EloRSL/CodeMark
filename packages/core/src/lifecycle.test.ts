import { LIMITS, type ExamTiming } from '@codemark/contracts';
import { describe, expect, it } from 'vitest';
import { isOnTime, stateOf } from './lifecycle';

const base: ExamTiming = {
  phase: 'published',
  opensAt: 1000,
  closesAt: 5000,
  closedAt: null,
  practice: false,
};

describe('stateOf', () => {
  it('uses phase and practice rules in priority order', () => {
    expect(stateOf({ ...base, phase: 'draft' }, 10000)).toBe('draft');
    expect(stateOf({ ...base, phase: 'released' }, 10000)).toBe('released');
    expect(stateOf(base, 999)).toBe('scheduled');
    expect(stateOf({ ...base, practice: true, closesAt: null }, 10000)).toBe('open');
  });

  it('handles closed_at and grace boundaries', () => {
    expect(stateOf({ ...base, closedAt: 4999 }, 4999)).toBe('closed');
    expect(stateOf({ ...base, closesAt: null }, 10000)).toBe('closed');
    expect(stateOf(base, base.closesAt! - 1000)).toBe('open');
    expect(stateOf(base, base.closesAt! + LIMITS.graceMs - 1)).toBe('open');
    expect(stateOf(base, base.closesAt! + LIMITS.graceMs)).toBe('closed');
    expect(stateOf(base, base.closesAt! + LIMITS.graceMs + 1000)).toBe('closed');
    expect(stateOf(base, base.closesAt! + LIMITS.graceMs + 1000, 'student-id')).toBe('closed');
  });
});

describe('isOnTime', () => {
  it('checks practice and grace boundaries', () => {
    expect(isOnTime({ ...base, practice: true, closesAt: null }, 999999)).toBe(true);
    expect(isOnTime(base, base.closesAt! - 1000)).toBe(true);
    expect(isOnTime(base, base.closesAt! + LIMITS.graceMs - 1)).toBe(true);
    expect(isOnTime(base, base.closesAt! + LIMITS.graceMs)).toBe(false);
    expect(isOnTime(base, base.closesAt! + LIMITS.graceMs + 1000, 'student-id')).toBe(false);
  });
});
