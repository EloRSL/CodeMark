import { z } from 'zod';
import { boundedText, EnrolmentNo, IsoDateTime, Uuid } from '../common';
import { LIMITS } from '../limits';
import { RunResult } from '../runner';

export const SubmitBody = z.object({
  code: boundedText(LIMITS.codeBytes),
  version: z.number().int().min(1), // the version the student was looking at
  retryKey: Uuid, // made once per click on Submit
});
export type SubmitBody = z.infer<typeof SubmitBody>;

export const Receipt = z.object({
  submissionId: Uuid,
  taskId: Uuid,
  version: z.number(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  arrivedAt: IsoDateTime,
  late: z.boolean(),
});
export type Receipt = z.infer<typeof Receipt>;

/** Newest first. */
export const MySubmissionsResponse = z.object({ receipts: z.array(Receipt) });
export type MySubmissionsResponse = z.infer<typeof MySubmissionsResponse>;

export const LateDecision = z.enum(['pending', 'accepted', 'rejected']);
export type LateDecision = z.infer<typeof LateDecision>;

export const SubmissionListMember = z.object({
  userId: Uuid,
  name: z.string(),
  enrolmentNo: EnrolmentNo.nullable(),
  // one per task of the current version, in order
  tasks: z.array(
    z.object({
      taskId: Uuid,
      submissions: z.number(),
      lastArrivedAt: IsoDateTime.nullable(),
      countedSubmissionId: Uuid.nullable(),
      // late, decision pending
      lateWaiting: z.array(z.object({ submissionId: Uuid, arrivedAt: IsoDateTime })),
      checked: z.boolean(), // the counted submission has a hidden_results row
    }),
  ),
});
export type SubmissionListMember = z.infer<typeof SubmissionListMember>;

/** Students only, by enrolment number. */
export const SubmissionListResponse = z.object({ members: z.array(SubmissionListMember) });
export type SubmissionListResponse = z.infer<typeof SubmissionListResponse>;

export const LateDecisionBody = z.object({ decision: z.enum(['accepted', 'rejected']) });
export type LateDecisionBody = z.infer<typeof LateDecisionBody>;

export const RecheckQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIMITS.recheckBatchSize)
    .default(LIMITS.recheckBatchSize),
});
export type RecheckQuery = z.infer<typeof RecheckQuery>;

export const RecheckItem = z.object({
  submissionId: Uuid,
  version: z.number(), // the final version
  code: z.string(),
  timeLimitMs: z.number(),
  // hidden tests of the task, in order; inputs only (SEC-2)
  tests: z.array(z.object({ testId: Uuid, input: z.string() })),
});
export type RecheckItem = z.infer<typeof RecheckItem>;

/** remaining: unchecked after this batch. */
export const RecheckBatch = z.object({ items: z.array(RecheckItem), remaining: z.number() });
export type RecheckBatch = z.infer<typeof RecheckBatch>;

/** stdout and stderr at most LIMITS.storedOutputBytes (from RunResult). */
export const CheckedOutput = RunResult.extend({ testId: Uuid });
export type CheckedOutput = z.infer<typeof CheckedOutput>;

export const RecheckSubmitBody = z.object({
  results: z
    .array(z.object({ submissionId: Uuid, version: z.number(), outputs: z.array(CheckedOutput) }))
    .min(1)
    .max(LIMITS.recheckBatchSize),
});
export type RecheckSubmitBody = z.infer<typeof RecheckSubmitBody>;

export const RecheckSubmitResponse = z.object({
  stored: z.number(),
  gradingJobsQueued: z.number(),
});
export type RecheckSubmitResponse = z.infer<typeof RecheckSubmitResponse>;

/** One element of hidden_results.results. */
export const StoredTestResult = z.object({
  testId: Uuid,
  passed: z.boolean(),
  timedOut: z.boolean(),
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number(),
});
export type StoredTestResult = z.infer<typeof StoredTestResult>;
