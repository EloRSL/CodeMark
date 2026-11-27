import type { AiQuote, ScoreState, SuggestionSource } from '@codemark/contracts';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Tables of the review module (docs/data-model.md). Only review code writes them (G3, ADR-003).

export const scoreRecords = sqliteTable(
  'score_records',
  {
    id: text('id').primaryKey(),
    submissionId: text('submission_id').notNull(),
    criterionId: text('criterion_id').notNull(),
    state: text('state').$type<ScoreState>().notNull(),
    points: real('points'), // null until confirmed; a multiple of 0.5
    suggestedPoints: real('suggested_points'), // null: no suggestion, grade manually
    reason: text('reason'),
    quotes: text('quotes', { mode: 'json' }).$type<AiQuote[]>(),
    source: text('source').$type<SuggestionSource>(),
    flagged: integer('flagged', { mode: 'boolean' }).notNull().default(false),
    aiRequestId: text('ai_request_id'),
    newSuggestion: integer('new_suggestion', { mode: 'boolean' }).notNull().default(false),
    comment: text('comment'), // the professor's latest comment, shown to the student
    confirmedBy: text('confirmed_by'),
    confirmedAt: integer('confirmed_at'),
    releasedAt: integer('released_at'), // students see only records where this is set
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('score_records_submission_id_criterion_id_unique').on(
      t.submissionId,
      t.criterionId,
    ),
  ],
);

export const scoreHistory = sqliteTable(
  'score_history',
  {
    id: text('id').primaryKey(),
    scoreRecordId: text('score_record_id').notNull(),
    oldPoints: real('old_points'),
    newPoints: real('new_points'),
    oldState: text('old_state').$type<ScoreState>(), // null for a new record
    newState: text('new_state').$type<ScoreState>().notNull(),
    actorId: text('actor_id'), // null when the AI or the tests made the change
    at: integer('at').notNull(),
    note: text('note'), // 'ai' or 'tests' for suggestions, the comment for confirmations
  },
  (t) => [index('score_history_score_record_id_idx').on(t.scoreRecordId)],
);
