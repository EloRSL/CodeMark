import { z } from 'zod';
import { boundedText, IsoDateTime } from '../common';
import { LIMITS } from '../limits';
import { ScoreSuggestion } from './review';

export const TrialGradeBody = z.object({ code: boundedText(LIMITS.codeBytes) });
export type TrialGradeBody = z.infer<typeof TrialGradeBody>;

export const TrialGradeResponse = z.object({
  suggestions: z.array(ScoreSuggestion), // one per 'ai' criterion; no 'runs' suggestion, because no tests ran
  neuronsUsed: z.number(),
  model: z.string(),
});
export type TrialGradeResponse = z.infer<typeof TrialGradeResponse>;

export const AiStatus = z.object({
  jobsQueued: z.number(), // grade.submission jobs of this exam, queued or running
  jobsFailed: z.number(),
  neuronsUsedToday: z.number(), // all exams, since 00:00 UTC
  dailyBudget: z.number(), // LIMITS.aiDailyGradingBudget
  estimatedFinish: IsoDateTime.nullable(), // see api.md for the formula
});
export type AiStatus = z.infer<typeof AiStatus>;
