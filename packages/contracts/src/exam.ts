import { z } from 'zod';

export const ExamPhase = z.enum(['draft', 'published', 'released']);
export type ExamPhase = z.infer<typeof ExamPhase>;

export const ExamState = z.enum(['draft', 'scheduled', 'open', 'closed', 'released']);
export type ExamState = z.infer<typeof ExamState>;

const threshold = z.number().min(0);

export const GradeThresholds = z
  .object({ '6': threshold, '7': threshold, '8': threshold, '9': threshold, '10': threshold })
  .refine((t) => t['6'] <= t['7'] && t['7'] <= t['8'] && t['8'] <= t['9'] && t['9'] <= t['10'], {
    error: 'Thresholds must not decrease from 6 to 10',
  });
export type GradeThresholds = z.infer<typeof GradeThresholds>;

export const ExamSettings = z
  .object({
    scale: z.enum(['points', 'percent']),
    thresholds: GradeThresholds,
    autocomplete: z.boolean(),
  })
  .refine((s) => s.scale !== 'percent' || s.thresholds['10'] <= 100, {
    error: 'On the percent scale, the threshold for 10 is at most 100',
    path: ['thresholds', '10'],
  });
export type ExamSettings = z.infer<typeof ExamSettings>;

export const DEFAULT_SETTINGS: ExamSettings = {
  scale: 'percent',
  thresholds: { '6': 50, '7': 60, '8': 70, '9': 80, '10': 90 },
  autocomplete: true,
};

/** What stateOf and isOnTime read. Times in UTC milliseconds. */
export const ExamTiming = z.object({
  phase: ExamPhase,
  opensAt: z.number(),
  closesAt: z.number().nullable(), // null only for practice exams
  closedAt: z.number().nullable(),
  practice: z.boolean(),
});
export type ExamTiming = z.infer<typeof ExamTiming>;
