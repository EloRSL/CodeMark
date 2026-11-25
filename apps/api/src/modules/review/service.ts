import { AiQuote, ScoreSuggestion, type SuggestionSource } from '@codemark/contracts';
import { eq, sql } from 'drizzle-orm';
import type { BatchItem, Db } from '../../db/client';
import { scoreHistory, scoreRecords } from './schema';

// Score records and their history (ADR-003; internal-interfaces.md section 3, review).

export type SuggestInput = {
  submissionId: string;
  aiRequestId: string | null;
  suggestions: {
    criterionId: string;
    suggestion: Omit<ScoreSuggestion, 'criterionId'> | null; // null: grade manually
  }[];
};

const Suggestion = ScoreSuggestion.omit({ criterionId: true });
const Quotes = AiQuote.array().nullable();

/** The only columns a suggestion writes on an existing record (data-model.md, write rules). */
type SuggestionColumns = {
  suggestedPoints: number | null;
  reason: string | null;
  quotes: AiQuote[] | null;
  source: SuggestionSource | null;
  flagged: boolean;
  aiRequestId: string | null;
};

function toColumns(
  suggestion: SuggestInput['suggestions'][number]['suggestion'],
  aiRequestId: string | null,
): SuggestionColumns {
  if (suggestion === null) {
    return {
      suggestedPoints: null,
      reason: null,
      quotes: null,
      source: null,
      flagged: false,
      aiRequestId,
    };
  }
  const s = Suggestion.parse(suggestion); // DM-2: the quotes are JSON, checked on every write
  return {
    suggestedPoints: s.points,
    reason: s.reason,
    quotes: s.quotes,
    source: s.source,
    flagged: s.flagged,
    aiRequestId,
  };
}

const sameSuggestion = (a: SuggestionColumns, b: SuggestionColumns) =>
  a.suggestedPoints === b.suggestedPoints &&
  a.reason === b.reason &&
  JSON.stringify(a.quotes) === JSON.stringify(b.quotes) &&
  a.source === b.source &&
  a.flagged === b.flagged &&
  a.aiRequestId === b.aiRequestId;

/**
 * Writes all suggestions of one submission and their history rows in one db.batch()
 * (ADR3-1, ADR3-3): one read and one batch. A record that would not change gets no write and
 * no history row, so a grading job that runs twice adds nothing (G11). A confirmed record
 * keeps its points and state, and gets newSuggestion instead (ADR3-2).
 * Throws before writing anything when a suggestion fails its schema or a criterion repeats.
 * The caller keeps points within the criterion's maxPoints.
 */
export async function suggest(db: Db, input: SuggestInput, now: number): Promise<void> {
  const criterionIds = new Set(input.suggestions.map((s) => s.criterionId));
  if (criterionIds.size !== input.suggestions.length) {
    throw new Error(`suggest got the same criterion twice for submission ${input.submissionId}`);
  }
  const next = input.suggestions.map(({ criterionId, suggestion }) => ({
    criterionId,
    columns: toColumns(suggestion, input.aiRequestId),
  }));
  if (next.length === 0) return;

  const rows = await db
    .select({
      id: scoreRecords.id,
      criterionId: scoreRecords.criterionId,
      state: scoreRecords.state,
      suggestedPoints: scoreRecords.suggestedPoints,
      reason: scoreRecords.reason,
      quotes: scoreRecords.quotes,
      source: scoreRecords.source,
      flagged: scoreRecords.flagged,
      aiRequestId: scoreRecords.aiRequestId,
    })
    .from(scoreRecords)
    .where(eq(scoreRecords.submissionId, input.submissionId));
  const current = new Map(
    rows.map((r) => [r.criterionId, { ...r, quotes: Quotes.parse(r.quotes) }]),
  );

  const writes: BatchItem[] = [];
  for (const { criterionId, columns } of next) {
    const record = current.get(criterionId);
    if (record && sameSuggestion(record, columns)) continue;
    const id = record?.id ?? crypto.randomUUID();
    writes.push(
      db
        .insert(scoreRecords)
        .values({
          id,
          submissionId: input.submissionId,
          criterionId,
          state: 'suggested',
          ...columns,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [scoreRecords.submissionId, scoreRecords.criterionId],
          // ADR3-2: never points or state. A confirmed record is marked instead.
          set: {
            ...columns,
            newSuggestion: sql`CASE WHEN ${scoreRecords.state} = 'confirmed' THEN 1 ELSE ${scoreRecords.newSuggestion} END`,
            updatedAt: now,
          },
        }),
      // For suggestions the history holds the old and new suggested points (data-model.md).
      db.insert(scoreHistory).values({
        id: crypto.randomUUID(),
        scoreRecordId: id,
        oldPoints: record?.suggestedPoints ?? null,
        newPoints: columns.suggestedPoints,
        oldState: record?.state ?? null,
        newState: record?.state ?? 'suggested',
        actorId: null,
        at: now,
        note: columns.source,
      }),
    );
  }
  const [first, ...rest] = writes;
  if (first) await db.batch([first, ...rest]);
}

/**
 * The scope resolver for scoreRecord routes. A stub that throws until M2: it needs tzuntar's
 * submissions table, and it is wired in app.ts only then.
 */
export const scoreRecordExamId: (
  db: Db,
  scoreRecordId: string,
) => Promise<string | null> = async () => {
  throw new Error('review.scoreRecordExamId is not built yet (M2)');
};

/**
 * Confirmed points of counted submissions, for the grades CSV. Stand-in until M2: an empty list,
 * the same stand-in the exams module uses until then.
 */
export const getConfirmedScores: (
  db: Db,
  examId: string,
) => Promise<
  { studentId: string; taskId: string; criterionId: string; points: number }[]
> = async () => [];
