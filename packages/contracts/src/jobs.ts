import { z } from 'zod';

export const JobType = z.enum(['grade.submission']);
export type JobType = z.infer<typeof JobType>;

export const JobPayloads = {
  'grade.submission': z.object({ submissionId: z.uuid() }).strict(),
};
export type JobPayload<T extends JobType> = z.infer<(typeof JobPayloads)[T]>;

export const JobStatus = z.enum(['queued', 'running', 'done', 'failed']);
export type JobStatus = z.infer<typeof JobStatus>;
