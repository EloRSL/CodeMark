import { LIMITS } from '@codemark/contracts';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '../../db/client';
import { jobs, notices } from './schema';
import {
  enqueue,
  enqueueQuery,
  listNotices,
  notify,
  notifyQuery,
  runDueJobs,
  type JobContext,
  type JobHandlers,
  type JobOutcome,
} from './service';

const db = createDb(env.DB);
const T = Date.parse('2026-12-01T10:00:00Z');
const sub = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const job = (n: number, runAfter = T) => ({
  type: 'grade.submission' as const,
  payload: { submissionId: sub(n) },
  dedupeKey: `grade:${n}`,
  runAfter,
});
const row = async (dedupeKey: string) =>
  (await db.select().from(jobs).where(eq(jobs.dedupeKey, dedupeKey)).get())!;

/** Handlers whose run and onFailed are spies; run answers done unless told otherwise. */
function spyHandlers(run?: (ctx: JobContext) => Promise<JobOutcome>) {
  const spies = {
    run: vi.fn(async (_payload: unknown, ctx: JobContext) =>
      run ? run(ctx) : ({ kind: 'done' } as const),
    ),
    onFailed: vi.fn<(payload: unknown, ctx: JobContext) => Promise<void>>(async () => {}),
  };
  const handlers: JobHandlers = { 'grade.submission': spies };
  return { handlers, ...spies };
}

beforeEach(async () => {
  await db.delete(jobs);
  await db.delete(notices);
});

describe('enqueue', () => {
  it('queues a job once per dedupe key, alone or in a batch', async () => {
    await enqueue(db, job(1), T);
    await enqueue(db, job(1, T + 5), T);
    await db.batch([enqueueQuery(db, job(1), T), enqueueQuery(db, job(2), T)]);
    expect(await db.select().from(jobs)).toHaveLength(2);
    expect(await row('grade:1')).toMatchObject({ status: 'queued', attempts: 0, runAfter: T });
  });

  it('throws on a bad payload and queues nothing', async () => {
    const bad = { ...job(1), payload: { submissionId: 'not-a-uuid' } };
    await expect(enqueue(db, bad, T)).rejects.toThrow();
    expect(() => enqueueQuery(db, bad, T)).toThrow();
    expect(await db.select().from(jobs)).toHaveLength(0);
  });
});

describe('runDueJobs', () => {
  it('runs due jobs, oldest run_after first, up to the limit', async () => {
    await enqueue(db, job(1, T - 1), T);
    await enqueue(db, job(2, T - 2), T);
    await enqueue(db, job(3, T - 3), T);
    await enqueue(db, job(4, T + 1), T); // not due yet
    const { handlers, run } = spyHandlers();
    expect(await runDueJobs(db, env, T, 2, handlers)).toBe(2);
    expect(run.mock.calls.map(([payload]) => payload)).toEqual([
      { submissionId: sub(3) },
      { submissionId: sub(2) },
    ]);
    expect(await row('grade:3')).toMatchObject({ status: 'done', attempts: 1, lockedUntil: null });
    expect(await row('grade:1')).toMatchObject({ status: 'queued', attempts: 0 });
    expect(await runDueJobs(db, env, T, 2, handlers)).toBe(1);
    expect(await runDueJobs(db, env, T, 2, handlers)).toBe(0);
  });

  it('lets only one of two runs claim a job', async () => {
    await enqueue(db, job(1), T);
    const { handlers, run } = spyHandlers();
    const counts = await Promise.all([
      runDueJobs(db, env, T, 2, handlers),
      runDueJobs(db, env, T, 2, handlers),
    ]);
    expect(counts[0] + counts[1]).toBe(1);
    expect(run).toHaveBeenCalledOnce();
  });

  it('claims one job at a time, so only the running one is locked', async () => {
    await enqueue(db, job(1), T);
    await enqueue(db, job(2), T);
    const running: number[] = [];
    const { handlers } = spyHandlers(async () => {
      running.push((await db.select().from(jobs).where(eq(jobs.status, 'running'))).length);
      return { kind: 'done' };
    });
    expect(await runDueJobs(db, env, T, 2, handlers)).toBe(2);
    expect(running).toEqual([1, 1]);
  });

  it('retries after 1, 5, 15 and 60 minutes, then fails and calls onFailed', async () => {
    await enqueue(db, job(1), T);
    const { handlers, run, onFailed } = spyHandlers(async () => {
      throw new Error('x'.repeat(1200));
    });
    let now = T;
    for (const [i, delay] of LIMITS.jobRetryDelaysMs.entries()) {
      expect(await runDueJobs(db, env, now, 2, handlers)).toBe(1);
      const after = await row('grade:1');
      expect(after).toMatchObject({ status: 'queued', attempts: i + 1, runAfter: now + delay });
      expect(after.lastError).toBe('x'.repeat(1000));
      expect(await runDueJobs(db, env, now + delay - 1, 2, handlers)).toBe(0);
      now += delay;
    }
    expect(onFailed).not.toHaveBeenCalled();
    expect(await runDueJobs(db, env, now, 2, handlers)).toBe(1);
    expect(await row('grade:1')).toMatchObject({ status: 'failed', attempts: 5 });
    expect(run.mock.calls.map(([, ctx]) => ctx.attempt)).toEqual([1, 2, 3, 4, 5]);
    expect(onFailed).toHaveBeenCalledOnce();
    expect(onFailed.mock.calls[0]![1].attempt).toBe(5);
  });

  it('spends no attempt on a budget wait', async () => {
    await enqueue(db, job(1), T);
    const { handlers, run } = spyHandlers(async () => ({ kind: 'wait', runAfter: T + 3600_000 }));
    expect(await runDueJobs(db, env, T, 2, handlers)).toBe(1);
    expect(run.mock.calls[0]![1].attempt).toBe(1);
    expect(await row('grade:1')).toMatchObject({
      status: 'queued',
      attempts: 0,
      runAfter: T + 3600_000,
      lockedUntil: null,
    });
  });

  it('fails a bad payload at once, without running it or calling onFailed', async () => {
    await db.insert(jobs).values({
      id: crypto.randomUUID(),
      type: 'grade.submission',
      payload: { submissionId: 'not-a-uuid' },
      status: 'queued',
      runAfter: T,
      dedupeKey: 'bad',
      createdAt: T,
      updatedAt: T,
    });
    const { handlers, run, onFailed } = spyHandlers();
    expect(await runDueJobs(db, env, T, 2, handlers)).toBe(1);
    const after = await row('bad');
    expect(after.status).toBe('failed');
    expect(after.lastError).toContain('submissionId');
    expect(run).not.toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
  });

  it('logs an onFailed that throws, keeps the job failed and goes on', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await enqueue(db, job(1, T - 1), T);
    await enqueue(db, job(2), T);
    await db.update(jobs).set({ attempts: 4 }).where(eq(jobs.dedupeKey, 'grade:1'));
    const { handlers, run, onFailed } = spyHandlers(async (ctx) => {
      if (ctx.attempt === 5) throw new Error('run broke');
      return { kind: 'done' };
    });
    onFailed.mockRejectedValueOnce(new Error('onFailed broke'));
    expect(await runDueJobs(db, env, T, 2, handlers)).toBe(2);
    expect(await row('grade:1')).toMatchObject({
      status: 'failed',
      lastError: 'onFailed: onFailed broke',
    });
    expect(await row('grade:2')).toMatchObject({ status: 'done' });
    expect(run).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  const lockExpired = (dedupeKey: string, attempts: number) =>
    db
      .update(jobs)
      .set({ status: 'running', attempts, lockedUntil: T - 1 })
      .where(eq(jobs.dedupeKey, dedupeKey));

  it('returns a job with an expired lock to the queue as a failed attempt', async () => {
    await enqueue(db, job(1, T - 10), T);
    await lockExpired('grade:1', 2);
    const { handlers, run } = spyHandlers(async () => {
      throw new Error('again');
    });
    // the run_after is unchanged, so the same run claims it again as attempt 3
    expect(await runDueJobs(db, env, T, 2, handlers)).toBe(1);
    expect(run.mock.calls[0]![1].attempt).toBe(3);

    await enqueue(db, job(2, T - 10), T);
    await lockExpired('grade:2', 2);
    const idle = spyHandlers();
    expect(await runDueJobs(db, env, T - 2, 2, idle.handlers)).toBe(0); // lock still valid
    expect(await row('grade:2')).toMatchObject({ status: 'running', lastError: null });
  });

  it('marks the stopped run in last_error', async () => {
    await enqueue(db, job(1, T - 10), T);
    await lockExpired('grade:1', 1);
    const { handlers } = spyHandlers(async () => ({ kind: 'wait', runAfter: T + 1 }));
    await runDueJobs(db, env, T, 2, handlers);
    expect(await row('grade:1')).toMatchObject({
      status: 'queued',
      attempts: 1,
      lastError: 'run stopped before it finished',
    });
  });

  it('fails an expired lock at the last attempt, calls onFailed and counts it', async () => {
    await enqueue(db, job(1, T - 10), T);
    await enqueue(db, job(2, T - 5), T);
    await lockExpired('grade:1', LIMITS.jobMaxAttempts);
    const { handlers, run, onFailed } = spyHandlers();
    expect(await runDueJobs(db, env, T, 1, handlers)).toBe(1);
    expect(await row('grade:1')).toMatchObject({
      status: 'failed',
      lockedUntil: null,
      lastError: 'run stopped before it finished',
    });
    expect(onFailed).toHaveBeenCalledOnce();
    expect(onFailed.mock.calls[0]![1].attempt).toBe(LIMITS.jobMaxAttempts);
    expect(run).not.toHaveBeenCalled(); // the failed job used up the limit of 1
    expect(await row('grade:2')).toMatchObject({ status: 'queued' });
  });
});

describe('notify', () => {
  it('stores a notice, alone or in a batch', async () => {
    await notify(db, { examId: 'e1', userId: null, kind: 'exam_closed', payload: {} }, T);
    await db.batch([
      notifyQuery(db, { examId: 'e1', userId: 'u1', kind: 'results_released', payload: {} }, T),
    ]);
    expect(await db.select().from(notices)).toHaveLength(2);
  });

  it('throws on a payload that does not fit its kind', async () => {
    const bad = { examId: 'e1', userId: null, kind: 'task_changed' as const, payload: {} };
    await expect(notify(db, bad as never, T)).rejects.toThrow();
    expect(await db.select().from(notices)).toHaveLength(0);
  });
});

describe('listNotices', () => {
  const professor = { examId: 'e1', userId: 'prof', role: 'professor' as const };
  const student = { examId: 'e1', userId: 's1', role: 'student' as const };

  beforeEach(async () => {
    const send = (examId: string, userId: string | null) =>
      notifyQuery(db, { examId, userId, kind: 'results_released', payload: {} }, T);
    // ids 1 to 5 in this order
    await db.batch([
      send('e1', null), // every student
      send('e1', 'prof'), // the professor
      send('e1', 's1'), // student s1
      send('e1', 's2'), // another student
      send('e2', 's1'), // another exam
    ]);
  });

  const ids = async (viewer: Parameters<typeof listNotices>[1], since?: number) => {
    const { notices: list, latestNoticeId } = await listNotices(db, viewer, since);
    return { ids: list.map((n) => n.id), latestNoticeId };
  };

  it('starts with no notices and the newest visible id', async () => {
    const first = (await db.select({ id: notices.id }).from(notices))[0]!.id;
    expect(await ids(student)).toEqual({ ids: [], latestNoticeId: first + 2 });
    expect(await ids(professor)).toEqual({ ids: [], latestNoticeId: first + 1 });
    expect(await ids({ ...student, examId: 'none' })).toEqual({ ids: [], latestNoticeId: 0 });
  });

  it('shows a student their own and the all-student notices after since', async () => {
    const first = (await db.select({ id: notices.id }).from(notices))[0]!.id;
    expect(await ids(student, 0)).toEqual({ ids: [first, first + 2], latestNoticeId: first + 2 });
    expect(await ids(student, first)).toEqual({ ids: [first + 2], latestNoticeId: first + 2 });
    expect(await ids(professor, 0)).toEqual({ ids: [first + 1], latestNoticeId: first + 1 });
  });

  it('returns at most 50, oldest first, with the full shape', async () => {
    await db.batch(
      Array.from({ length: 60 }, () =>
        notifyQuery(db, { examId: 'e1', userId: null, kind: 'exam_closed', payload: {} }, T),
      ) as [ReturnType<typeof notifyQuery>],
    );
    const { notices: list, latestNoticeId } = await listNotices(db, student, 0);
    expect(list).toHaveLength(50);
    expect(list.map((n) => n.id)).toEqual([...list.map((n) => n.id)].sort((a, b) => a - b));
    expect(latestNoticeId).toBeGreaterThan(list.at(-1)!.id);
    expect(list[0]).toEqual({
      id: list[0]!.id,
      kind: 'results_released',
      payload: {},
      createdAt: '2026-12-01T10:00:00.000Z',
    });
  });
});
