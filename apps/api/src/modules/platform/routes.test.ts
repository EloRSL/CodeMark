import { ApiErrorBody, TestClockResponse, TestRunJobsResponse } from '@codemark/contracts';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { runCron } from '../../../test/client';
import { createApp } from '../../app';
import { createDb } from '../../db/client';
import { clock } from '../../platform/clock';
import { jobs } from './schema';
import { enqueue } from './service';

const setClock = (app: ReturnType<typeof createApp>, now: string | null) =>
  app.request('/api/test/clock', { method: 'POST', body: JSON.stringify({ now }) }, env);

afterEach(() => clock.set(null));

describe('test.clock', () => {
  const app = createApp('test');

  it('sets a fake clock that stands still, without an Origin header', async () => {
    const res = await setClock(app, '2026-12-01T10:00:00.000Z');
    expect(TestClockResponse.parse(await res.json())).toEqual({ now: '2026-12-01T10:00:00.000Z' });
    expect(clock.now()).toBe(Date.parse('2026-12-01T10:00:00.000Z'));
    expect(clock.now()).toBe(Date.parse('2026-12-01T10:00:00.000Z'));
  });

  it('returns to the real clock with null', async () => {
    await setClock(app, '2026-12-01T10:00:00.000Z');
    const { now } = TestClockResponse.parse(await (await setClock(app, null)).json());
    expect(Math.abs(Date.parse(now) - Date.now())).toBeLessThan(60_000);
  });

  it('rejects a time that is not ISO', async () => {
    const res = await setClock(app, 'tomorrow');
    expect(res.status).toBe(400);
  });

  it.each(['local', 'production'])('does not exist when APP_ENV is %s', async (appEnv) => {
    const res = await setClock(createApp(appEnv), '2026-12-01T10:00:00.000Z');
    expect(res.status).toBe(404);
    expect(ApiErrorBody.parse(await res.json()).error.code).toBe('NOT_FOUND');
    expect(clock.now()).not.toBe(Date.parse('2026-12-01T10:00:00.000Z'));
  });
});

describe('test.runJobs and the cron', () => {
  const app = createApp('test');
  const db = createDb(env.DB);
  const T = Date.parse('2026-12-01T10:00:00.000Z');
  const queue = async (count: number, runAfter: number) => {
    for (let n = 0; n < count; n++)
      await enqueue(
        db,
        {
          type: 'grade.submission',
          payload: { submissionId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` },
          dedupeKey: `grade:${n}`,
          runAfter,
        },
        T,
      );
  };
  const runJobs = (target = app) => target.request('/api/test/run-jobs', { method: 'POST' }, env);
  const statuses = async () => (await db.select({ s: jobs.status }).from(jobs)).map((j) => j.s);

  it('runs every due job on the fake clock, without an Origin header', async () => {
    await db.delete(jobs);
    await queue(5, T);
    await setClock(app, '2026-12-01T09:59:59.999Z');
    expect(TestRunJobsResponse.parse(await (await runJobs()).json())).toEqual({
      examsClosed: 0,
      jobsRun: 0,
    });
    await setClock(app, '2026-12-01T10:00:00.000Z');
    expect(await (await runJobs()).json()).toEqual({ examsClosed: 0, jobsRun: 5 });
    expect(await statuses()).toEqual(Array(5).fill('done'));
  });

  it('stops at 100 jobs', async () => {
    await db.delete(jobs);
    await queue(101, T);
    await setClock(app, '2026-12-01T10:00:00.000Z');
    expect(await (await runJobs()).json()).toEqual({ examsClosed: 0, jobsRun: 100 });
    expect(await db.select().from(jobs).where(eq(jobs.status, 'queued'))).toHaveLength(1);
  });

  it('does not exist outside APP_ENV test', async () => {
    expect((await runJobs(createApp('production'))).status).toBe(404);
  });

  it('a cron run takes at most jobsPerCronRun jobs, on the fake clock', async () => {
    await db.delete(jobs);
    await queue(3, T);
    await setClock(app, '2026-12-01T09:00:00.000Z');
    await runCron();
    expect(await statuses()).toEqual(Array(3).fill('queued'));
    await setClock(app, '2026-12-01T10:00:00.000Z');
    await runCron();
    expect((await statuses()).sort()).toEqual(['done', 'done', 'queued']);
  });
});
