import { env } from 'cloudflare:workers';
import { and, asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '../../db/client';
import { scoreHistory, scoreRecords } from './schema';
import { suggest, type SuggestInput } from './service';

const db = createDb(env.DB);
const T = Date.parse('2026-12-01T10:00:00Z');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const SUBMISSION = id(501);
const LOOP = id(11); // an "ai" criterion
const NAMES = id(12); // an "ai" criterion the AI could not answer
const RUNS = id(13); // the "runs" criterion
const AI_REQUEST = id(901);

const ai = (points: number, reason = 'Uses a loop.') => ({
  points,
  reason,
  quotes: [{ line: 1, text: 'n = int(input())' }],
  source: 'ai' as const,
  flagged: false,
});
const tests = (points: number) => ({
  points,
  reason: '',
  quotes: [],
  source: 'tests' as const,
  flagged: false,
});

const input = (
  suggestions: SuggestInput['suggestions'],
  aiRequestId: string | null = AI_REQUEST,
): SuggestInput => ({ submissionId: SUBMISSION, aiRequestId, suggestions });

const firstGrading = input([
  { criterionId: LOOP, suggestion: ai(1) },
  { criterionId: NAMES, suggestion: null },
  { criterionId: RUNS, suggestion: tests(3) },
]);

const record = async (criterionId: string) =>
  (await db
    .select()
    .from(scoreRecords)
    .where(
      and(eq(scoreRecords.submissionId, SUBMISSION), eq(scoreRecords.criterionId, criterionId)),
    )
    .get())!;
const historyOf = (scoreRecordId: string) =>
  db
    .select()
    .from(scoreHistory)
    .where(eq(scoreHistory.scoreRecordId, scoreRecordId))
    .orderBy(asc(scoreHistory.at));

beforeEach(async () => {
  await db.delete(scoreRecords);
  await db.delete(scoreHistory);
});
afterEach(() => vi.restoreAllMocks());

describe('score_records', () => {
  it('keeps one record per criterion of a submission', async () => {
    const row = { submissionId: SUBMISSION, criterionId: LOOP, state: 'suggested' as const };
    await db.insert(scoreRecords).values({ ...row, id: id(1), updatedAt: T });
    await expect(
      db.insert(scoreRecords).values({ ...row, id: id(2), updatedAt: T }),
    ).rejects.toThrow();
    expect(await record(LOOP)).toMatchObject({
      flagged: false,
      newSuggestion: false,
      points: null,
    });
  });
});

describe('suggest', () => {
  it('creates a suggested record and a history row per criterion, in one batch', async () => {
    const batch = vi.spyOn(db, 'batch');
    await suggest(db, firstGrading, T);
    expect(batch).toHaveBeenCalledTimes(1);

    const loop = await record(LOOP);
    expect(loop).toMatchObject({
      state: 'suggested',
      points: null,
      suggestedPoints: 1,
      reason: 'Uses a loop.',
      quotes: [{ line: 1, text: 'n = int(input())' }],
      source: 'ai',
      flagged: false,
      aiRequestId: AI_REQUEST,
      newSuggestion: false,
      comment: null,
      confirmedBy: null,
      confirmedAt: null,
      releasedAt: null,
      updatedAt: T,
    });
    expect(await record(NAMES)).toMatchObject({
      state: 'suggested',
      suggestedPoints: null,
      reason: null,
      quotes: null,
      source: null,
    });
    expect(await record(RUNS)).toMatchObject({ suggestedPoints: 3, source: 'tests', quotes: [] });

    expect(await historyOf(loop.id)).toEqual([
      {
        id: expect.any(String),
        scoreRecordId: loop.id,
        oldPoints: null,
        newPoints: 1,
        oldState: null,
        newState: 'suggested',
        actorId: null,
        at: T,
        note: 'ai',
      },
    ]);
    expect(await historyOf((await record(NAMES)).id)).toMatchObject([
      { oldPoints: null, newPoints: null, newState: 'suggested', note: null },
    ]);
    expect(await historyOf((await record(RUNS)).id)).toMatchObject([
      { newPoints: 3, note: 'tests' },
    ]);
  });

  it('replaces only the suggestion of a suggested record, with the old and new points', async () => {
    await suggest(db, firstGrading, T);
    const before = await record(LOOP);
    await suggest(
      db,
      input(
        [
          { criterionId: LOOP, suggestion: { ...ai(2, 'Loops over the digits.'), flagged: true } },
          { criterionId: RUNS, suggestion: null },
        ],
        id(902),
      ),
      T + 1000,
    );

    expect(await record(LOOP)).toMatchObject({
      id: before.id,
      state: 'suggested',
      points: null,
      suggestedPoints: 2,
      reason: 'Loops over the digits.',
      flagged: true,
      aiRequestId: id(902),
      updatedAt: T + 1000,
    });
    expect(await record(RUNS)).toMatchObject({ suggestedPoints: null, source: null, quotes: null });
    expect(await record(NAMES)).toMatchObject({ aiRequestId: AI_REQUEST, updatedAt: T });
    expect((await historyOf(before.id)).at(-1)).toMatchObject({
      oldPoints: 1,
      newPoints: 2,
      oldState: 'suggested',
      newState: 'suggested',
      actorId: null,
      at: T + 1000,
      note: 'ai',
    });
    expect(await db.select().from(scoreHistory)).toHaveLength(5);
  });

  it('writes nothing when nothing changes, so a job that runs twice adds no rows (G11)', async () => {
    await suggest(db, firstGrading, T);
    const batch = vi.spyOn(db, 'batch');
    await suggest(db, firstGrading, T + 1000);
    expect(batch).not.toHaveBeenCalled();
    expect(await db.select().from(scoreRecords)).toHaveLength(3);
    expect(await db.select().from(scoreHistory)).toHaveLength(3);
    expect(await record(LOOP)).toMatchObject({ updatedAt: T });
  });

  it("never changes a confirmed record's points or state, and sets newSuggestion (ADR3-2)", async () => {
    await suggest(db, firstGrading, T);
    // What review.confirm (M2) stores: the professor changed 1 to 2, with a comment.
    const confirmed = {
      state: 'confirmed',
      points: 2,
      comment: 'Correct loop.',
      confirmedBy: id(1),
      confirmedAt: T + 500,
    } as const;
    await db.update(scoreRecords).set(confirmed).where(eq(scoreRecords.criterionId, LOOP));
    const { id: loopId } = await record(LOOP);

    await suggest(db, input([{ criterionId: LOOP, suggestion: ai(0, 'No loop.') }]), T + 1000);

    expect(await record(LOOP)).toMatchObject({
      ...confirmed,
      suggestedPoints: 0,
      reason: 'No loop.',
      newSuggestion: true,
      releasedAt: null,
    });
    expect((await historyOf(loopId)).at(-1)).toMatchObject({
      oldPoints: 1,
      newPoints: 0,
      oldState: 'confirmed',
      newState: 'confirmed',
      actorId: null,
      note: 'ai',
    });
    // A suggestion on a record that is still suggested never sets newSuggestion.
    await suggest(db, input([{ criterionId: RUNS, suggestion: tests(2) }]), T + 1000);
    expect(await record(RUNS)).toMatchObject({ state: 'suggested', newSuggestion: false });
  });

  it('keeps newSuggestion off when a confirmed record gets the same suggestion again', async () => {
    await suggest(db, firstGrading, T);
    await db
      .update(scoreRecords)
      .set({ state: 'confirmed', points: 1, confirmedBy: id(1), confirmedAt: T + 500 })
      .where(eq(scoreRecords.criterionId, LOOP));
    await suggest(db, firstGrading, T + 1000);
    expect(await record(LOOP)).toMatchObject({ state: 'confirmed', newSuggestion: false });
  });

  it.each([
    ['points that are not a multiple of 0.5', [{ criterionId: LOOP, suggestion: ai(1.25) }]],
    ['negative points', [{ criterionId: LOOP, suggestion: ai(-1) }]],
    [
      'a quote on line 0',
      [{ criterionId: LOOP, suggestion: { ...ai(1), quotes: [{ line: 0, text: '' }] } }],
    ],
    [
      'the same criterion twice',
      [
        { criterionId: RUNS, suggestion: tests(3) },
        { criterionId: RUNS, suggestion: tests(2) },
      ],
    ],
  ])('throws on %s and writes nothing', async (_name, suggestions) => {
    const valid = { criterionId: NAMES, suggestion: ai(1) };
    await expect(suggest(db, input([valid, ...suggestions]), T)).rejects.toThrow();
    expect(await db.select().from(scoreRecords)).toHaveLength(0);
    expect(await db.select().from(scoreHistory)).toHaveLength(0);
  });

  it('writes nothing for an empty list', async () => {
    const batch = vi.spyOn(db, 'batch');
    await suggest(db, input([]), T);
    expect(batch).not.toHaveBeenCalled();
  });
});
