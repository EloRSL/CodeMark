import { z } from 'zod';
import { boundedText } from './common';
import { LIMITS } from './limits';

export const RunResult = z.object({
  stdout: boundedText(LIMITS.storedOutputBytes),
  stderr: boundedText(LIMITS.storedOutputBytes),
  exitCode: z.number(), // 0 finished; 1 uncaught exception; n for SystemExit(n); -1 timed out
  timedOut: z.boolean(),
  durationMs: z.number().min(0), // from the start of this input, without interpreter startup
});
export type RunResult = z.infer<typeof RunResult>;

export interface Runner {
  /** Runs code once per input, in order, each with a fresh globals dict. One RunResult per input. */
  run(code: string, inputs: string[], timeLimitMs: number): Promise<RunResult[]>;
}

/** Page to runner iframe. */
export const RunnerRequest = z.object({
  type: z.literal('run'),
  requestId: z.string().min(1).max(100), // unique per request
  code: boundedText(LIMITS.codeBytes),
  inputs: z.array(z.string()).max(LIMITS.runnerInputsPerRequest),
  timeLimitMs: z.number().int().min(LIMITS.timeLimitMs.min).max(LIMITS.timeLimitMs.max),
});
export type RunnerRequest = z.infer<typeof RunnerRequest>;

/** Runner iframe to page. */
export const RunnerResponse = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), pyodideVersion: z.string() }),
  z.object({ type: z.literal('result'), requestId: z.string(), results: z.array(RunResult) }),
  z.object({
    type: z.literal('error'),
    requestId: z.string().nullable(),
    code: z.enum(['BAD_REQUEST', 'RUNNER_CRASHED']),
    message: z.string(),
  }),
]);
export type RunnerResponse = z.infer<typeof RunnerResponse>;
