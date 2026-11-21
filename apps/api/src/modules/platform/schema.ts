import type { JobPayload, JobStatus, JobType, Notice, NoticeKind } from '@codemark/contracts';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Tables of the platform module (docs/data-model.md). Only platform code writes them (G3).

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    type: text('type').$type<JobType>().notNull(),
    payload: text('payload', { mode: 'json' }).$type<JobPayload<JobType>>().notNull(),
    status: text('status').$type<JobStatus>().notNull(),
    attempts: integer('attempts').notNull().default(0), // started attempts, except budget waits
    runAfter: integer('run_after').notNull(),
    lockedUntil: integer('locked_until'),
    lastError: text('last_error'),
    dedupeKey: text('dedupe_key').notNull().unique(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('jobs_status_run_after_idx').on(t.status, t.runAfter)],
);

export const notices = sqliteTable(
  'notices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }), // the polling cursor
    examId: text('exam_id').notNull(),
    userId: text('user_id'), // null: every student member of the exam
    kind: text('kind').$type<NoticeKind>().notNull(),
    payload: text('payload', { mode: 'json' }).$type<Notice['payload']>().notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('notices_exam_id_id_idx').on(t.examId, t.id)],
);
