import { z } from 'zod';
import { AiQuote } from '../ai';
import { Cursor, EnrolmentNo, IsoDateTime, Uuid } from '../common';
import { CriterionKind, Task } from '../examContent';
import { LIMITS } from '../limits';
import { Receipt, StoredTestResult } from './submissions';

export const ScoreState = z.enum(['suggested', 'confirmed']);
export type ScoreState = z.infer<typeof ScoreState>;

export const SuggestionSource = z.enum(['ai', 'tests']);
export type SuggestionSource = z.infer<typeof SuggestionSource>;

export const ScoreSuggestion = z.object({
  criterionId: Uuid,
  points: z.number().min(0).multipleOf(0.5), // also <= the criterion's maxPoints, checked by the caller
  reason: z.string(),
  quotes: z.array(AiQuote),
  source: SuggestionSource,
  flagged: z.boolean(), // a quote was dropped because it didn't match the code
});
export type ScoreSuggestion = z.infer<typeof ScoreSuggestion>;

export const ScoreRecord = z.object({
  id: Uuid,
  submissionId: Uuid,
  criterionId: Uuid,
  state: ScoreState,
  points: z.number().nullable(), // confirmed points; null while suggested
  suggestion: ScoreSuggestion.omit({ criterionId: true }).nullable(), // null: grade manually
  newSuggestion: z.boolean(),
  comment: z.string().nullable(),
  confirmedAt: IsoDateTime.nullable(),
  releasedAt: IsoDateTime.nullable(),
});
export type ScoreRecord = z.infer<typeof ScoreRecord>;

export const ReviewFilter = z.enum(['needs-review', 'not-checked', 'confirmed', 'all']);
export type ReviewFilter = z.infer<typeof ReviewFilter>;

export const ReviewQuery = z.object({
  filter: ReviewFilter.default('needs-review'),
  cursor: Cursor.optional(),
});
export type ReviewQuery = z.infer<typeof ReviewQuery>;

export const ReviewQueueItem = z.object({
  submissionId: Uuid,
  taskId: Uuid,
  studentName: z.string(),
  enrolmentNo: EnrolmentNo.nullable(),
  late: z.boolean(),
  checked: z.boolean(),
  ai: z.enum(['waiting', 'done', 'manual']),
  confirmed: z.number(), // confirmed records
  criteria: z.number(), // criteria of the task in the final version
});
export type ReviewQueueItem = z.infer<typeof ReviewQueueItem>;

export const ReviewQueue = z.object({
  items: z.array(ReviewQueueItem).max(LIMITS.reviewPageSize),
  nextCursor: Cursor.nullable(),
  notChecked: z.number(), // counted submissions without a check result, whole exam
});
export type ReviewQueue = z.infer<typeof ReviewQueue>;

export const CheckResult = z.object({
  version: z.number(),
  passed: z.number(),
  total: z.number(),
  tests: z.array(StoredTestResult),
});
export type CheckResult = z.infer<typeof CheckResult>;

export const HistoryEntry = z.object({
  scoreRecordId: Uuid,
  oldPoints: z.number().nullable(),
  newPoints: z.number().nullable(),
  oldState: ScoreState.nullable(),
  newState: ScoreState,
  actorName: z.string(), // the professor's name, or 'AI' or 'Tests'
  at: IsoDateTime,
  note: z.string().nullable(),
});
export type HistoryEntry = z.infer<typeof HistoryEntry>;

export const SubmissionReview = z.object({
  submission: Receipt.extend({
    code: z.string(),
    studentName: z.string(),
    enrolmentNo: EnrolmentNo.nullable(),
  }),
  task: Task, // from the final version, with expected outputs (professor only)
  check: CheckResult.nullable(),
  scoreRecords: z.array(ScoreRecord), // in the task's criterion order
  history: z.array(HistoryEntry), // newest first
  nextSubmissionId: Uuid.nullable(), // the next item in the 'needs-review' queue, for "next"
});
export type SubmissionReview = z.infer<typeof SubmissionReview>;

export const ConfirmBody = z.object({
  // 0 to the criterion's maxPoints (checked by the handler); absent keeps the suggested points
  points: z.number().min(0).multipleOf(0.5).optional(),
  comment: z.string().max(1000).optional(),
});
export type ConfirmBody = z.infer<typeof ConfirmBody>;

export const ConfirmAllResponse = z.object({ confirmed: z.number() });
export type ConfirmAllResponse = z.infer<typeof ConfirmAllResponse>;

export const ReleaseResponse = z.object({ releasedAt: IsoDateTime });
export type ReleaseResponse = z.infer<typeof ReleaseResponse>;

export const MyResults = z
  .object({
    released: z.boolean(),
    tasks: z.array(
      z.object({
        taskId: Uuid,
        title: z.string(),
        removed: z.boolean(),
        keepAsBonus: z.boolean(),
        check: z.object({ passed: z.number(), total: z.number() }).nullable(),
        criteria: z.array(
          z.object({
            criterionId: Uuid,
            name: z.string(),
            kind: CriterionKind,
            maxPoints: z.number(),
            points: z.number().nullable(), // released confirmed points; null if not released yet
            reason: z.string().nullable(),
            comment: z.string().nullable(),
          }),
        ),
      }),
    ),
    total: z.number(),
    max: z.number(),
    percent: z.number().multipleOf(0.01), // rounded to 2 decimals for display
    grade: z.literal([5, 6, 7, 8, 9, 10]).nullable(),
  })
  .refine((r) => (r.grade === null) === !r.released, {
    error: 'grade is null exactly when released is false',
    path: ['grade'],
  });
export type MyResults = z.infer<typeof MyResults>;
