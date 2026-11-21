import { z } from 'zod';
import { IsoDateTime } from '../common';
import { ExamState } from '../exam';
import { Notice } from '../notices';

/** since: the newest notice id the browser has seen. */
export const StatusQuery = z.object({ since: z.coerce.number().int().min(0).optional() });
export type StatusQuery = z.infer<typeof StatusQuery>;

export const ExamStatus = z.object({
  serverTime: IsoDateTime,
  state: ExamState,
  opensAt: IsoDateTime,
  closesAt: IsoDateTime.nullable(), // null for practice; students see this as the end (no grace period)
  version: z.number(), // exams.current_version
  notices: z.array(Notice), // newer than `since`, oldest first; [] when `since` is absent
  latestNoticeId: z.number(), // the newest notice id this caller may see, 0 if none
});
export type ExamStatus = z.infer<typeof ExamStatus>;

/** Test-only endpoints (api.md T1, T2), in the separate testEndpoints registry. */
export const TestClockBody = z.object({ now: IsoDateTime.nullable() }); // null returns to the real clock
export type TestClockBody = z.infer<typeof TestClockBody>;

export const TestClockResponse = z.object({ now: IsoDateTime });
export type TestClockResponse = z.infer<typeof TestClockResponse>;

export const TestRunJobsResponse = z.object({ examsClosed: z.number(), jobsRun: z.number() });
export type TestRunJobsResponse = z.infer<typeof TestRunJobsResponse>;
