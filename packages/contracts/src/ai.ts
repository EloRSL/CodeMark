import { z } from 'zod';
import { Uuid } from './common';
import { LIMITS } from './limits';

export const GradingCriterion = z.object({
  id: Uuid,
  name: z.string(),
  description: z.string(),
  maxPoints: z.number(),
});
export type GradingCriterion = z.infer<typeof GradingCriterion>;

export const CheckSummary = z
  .object({
    passed: z.number().int().min(0),
    total: z.number().int().min(0),
    firstFailure: z
      .object({
        kind: z.enum(['wrong_output', 'error', 'timeout']),
        // for 'error': only the Python exception name, e.g. 'ValueError', never the message,
        // which can repeat a hidden input; null for the other kinds
        errorType: z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_.]{0,99}$/)
          .nullable(),
      })
      .refine((f) => f.kind === 'error' || f.errorType === null, {
        error: "errorType is null unless kind is 'error'",
        path: ['errorType'],
      })
      .nullable(),
  })
  .refine((s) => (s.firstFailure === null) === (s.passed === s.total), {
    error: 'firstFailure is null exactly when every test passed or total is 0',
    path: ['firstFailure'],
  });
export type CheckSummary = z.infer<typeof CheckSummary>;

/** strict(): unknown keys are rejected, so nothing personal can be added by mistake (SEC-10). */
export const GradingRequest = z
  .object({
    task: z.object({ title: z.string(), instructions: z.string() }).strict(),
    criteria: z.array(GradingCriterion).min(1), // only kind 'ai'
    numberedCode: z.string(), // numberLines(code)
    check: CheckSummary.nullable(), // null only for trial grading
  })
  .strict();
export type GradingRequest = z.infer<typeof GradingRequest>;

export const AiQuote = z.object({ line: z.number().int().min(1), text: z.string() });
export type AiQuote = z.infer<typeof AiQuote>;

export const AiCriterionAnswer = z.object({
  criterionId: Uuid,
  points: z.number().min(0),
  reason: z.string().max(LIMITS.aiReasonChars),
  quotes: z.array(AiQuote).max(10),
});
export type AiCriterionAnswer = z.infer<typeof AiCriterionAnswer>;

/** The JSON the prompt asks for. checkGradingAnswer() enforces the rest. */
export const GradingAnswer = z.object({
  criteria: z.array(AiCriterionAnswer),
  runs: z.object({ smallTypo: z.boolean(), reason: z.string().max(LIMITS.aiReasonChars) }),
});
export type GradingAnswer = z.infer<typeof GradingAnswer>;

export const AiUsage = z.object({
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  neurons: z.number(),
});
export type AiUsage = z.infer<typeof AiUsage>;

export interface AiProvider {
  readonly name: string; // 'fake' or 'workers-ai'
  /** Returns the model's raw text and its usage. Throws when the call fails. */
  suggestScores(
    request: GradingRequest,
    previousError?: string,
  ): Promise<{ raw: string; usage: AiUsage }>;
}
