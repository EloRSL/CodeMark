import { z } from 'zod';
import { IsoDateTime } from './common';

export const NoticeKind = z.enum([
  'task_changed',
  'exam_closed',
  'results_released',
  'grade_changed',
  'late_decision',
]);
export type NoticeKind = z.infer<typeof NoticeKind>;

export const NoticePayloads = {
  task_changed: z.object({ version: z.number().int().min(2), note: z.string() }).strict(),
  exam_closed: z.object({}).strict(),
  results_released: z.object({}).strict(),
  grade_changed: z.object({ taskId: z.uuid() }).strict(),
  late_decision: z
    .object({
      submissionId: z.uuid(),
      taskId: z.uuid(),
      decision: z.enum(['accepted', 'rejected']),
    })
    .strict(),
};

const notice = <K extends NoticeKind>(kind: K) =>
  z.object({
    id: z.number(),
    kind: z.literal(kind),
    payload: NoticePayloads[kind],
    createdAt: IsoDateTime,
  });

/** A discriminated union on kind. */
export const Notice = z.discriminatedUnion('kind', [
  notice('task_changed'),
  notice('exam_closed'),
  notice('results_released'),
  notice('grade_changed'),
  notice('late_decision'),
]);
export type Notice = z.infer<typeof Notice>;
