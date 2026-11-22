import { DEFAULT_SETTINGS, type ExamSettings } from '@codemark/contracts';
import { describe, expect, it } from 'vitest';
import { grade, type GradeInput } from './grade';

const input = (overrides: Partial<GradeInput> = {}): GradeInput => ({
  tasks: [{ taskId: 'task-1', criteria: [{ criterionId: 'criterion-1', maxPoints: 10 }] }],
  confirmed: [{ taskId: 'task-1', criterionId: 'criterion-1', points: 8 }],
  adjustments: [],
  settings: DEFAULT_SETTINGS,
  ...overrides,
});

describe('grade', () => {
  it('uses points and percent scales', () => {
    expect(grade(input()).grade).toBe(9);
    const points = input({
      settings: {
        ...DEFAULT_SETTINGS,
        scale: 'points',
        thresholds: { 6: 5, 7: 6, 8: 7, 9: 8, 10: 9 },
      },
    });
    expect(grade(points)).toMatchObject({ total: 8, max: 10, percent: 80, grade: 9 });
  });

  it('handles removed tasks with and without bonus', () => {
    expect(
      grade(input({ adjustments: [{ taskId: 'task-1', removed: true, keepAsBonus: false }] })),
    ).toMatchObject({ total: 0, max: 0, percent: 0, grade: 5 });
    expect(
      grade(input({ adjustments: [{ taskId: 'task-1', removed: true, keepAsBonus: true }] })),
    ).toMatchObject({ total: 8, max: 0, percent: 0, grade: 5 });
  });

  it('applies a threshold exactly and never exceeds grade 10', () => {
    const settings: ExamSettings = {
      ...DEFAULT_SETTINGS,
      thresholds: { 6: 50, 7: 60, 8: 70, 9: 80, 10: 90 },
    };
    expect(grade(input({ settings })).grade).toBe(9);
    expect(
      grade({
        tasks: [{ taskId: 'task-1', criteria: [{ criterionId: 'a', maxPoints: 1 }] }],
        confirmed: [{ taskId: 'task-1', criterionId: 'a', points: 10 }],
        adjustments: [],
        settings,
      }),
    ).toMatchObject({ grade: 10, percent: 1000 });
  });

  it('returns grade 5 with no confirmed points', () => {
    expect(grade(input({ confirmed: [] })).grade).toBe(5);
  });
});
