import type { ExamContent, ExamSettings } from '@codemark/contracts';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const exams = sqliteTable(
  'exams',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    joinCode: text('join_code').notNull().unique(),
    opensAt: integer('opens_at').notNull(),
    closesAt: integer('closes_at'),
    phase: text('phase').$type<'draft' | 'published' | 'released'>().notNull(),
    practice: integer('practice', { mode: 'boolean' }).notNull().default(false),
    settings: text('settings', { mode: 'json' }).$type<ExamSettings>().notNull(),
    draft: text('draft', { mode: 'json' }).$type<ExamContent>().notNull(),
    currentVersion: integer('current_version').notNull().default(0),
    closedAt: integer('closed_at'),
    releasedAt: integer('released_at'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('exams_phase_closed_at_idx').on(t.phase, t.closedAt)],
);

export const examVersions = sqliteTable(
  'exam_versions',
  {
    examId: text('exam_id').notNull(),
    version: integer('version').notNull(),
    snapshot: text('snapshot', { mode: 'json' }).$type<ExamContent>().notNull(),
    studentView: text('student_view', { mode: 'json' })
      .$type<import('@codemark/contracts').StudentExamView>()
      .notNull(),
    note: text('note').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.examId, t.version] })],
);

export const taskAdjustments = sqliteTable(
  'task_adjustments',
  {
    examId: text('exam_id').notNull(),
    taskId: text('task_id').notNull(),
    removed: integer('removed', { mode: 'boolean' }).notNull(),
    keepAsBonus: integer('keep_as_bonus', { mode: 'boolean' }).notNull(),
    decidedBy: text('decided_by').notNull(),
    decidedAt: integer('decided_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.examId, t.taskId] })],
);
