import {
  ApiErrorBody,
  ExamStatus,
  LIMITS,
  TestClockResponse,
  TestRunJobsResponse,
} from '@codemark/contracts';
import { DEMO_USERS } from '@codemark/core';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { runCron, signIn } from '../../../test/client';
import { app, createApp } from '../../app';
import { createDb } from '../../db/client';
import { exams, jobs, notices } from '../../db/schema';
import { clock } from '../../platform/clock';
import { addMemberQuery } from '../accounts';
import { enqueue, notify } from './service';

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
    const done = (await statuses()).filter((status) => status === 'done');
    expect(done).toHaveLength(LIMITS.jobsPerCronRun);
  });
});

describe('exams.status', () => {
  const db = createDb(env.DB);
  const T0 = Date.parse('2026-12-01T10:00:00.000Z');
  const HOUR = 3_600_000;
  const iso = (ms: number) => new Date(ms).toISOString();

  /** An exam opening at T0 + 1 h and closing at T0 + 3 h, with student1 as a member. */
  async function setUp() {
    clock.set(T0);
    const professor = await signIn('professor');
    const created = await professor.request('POST', '/exams', {
      title: 'Status',
      opensAt: iso(T0 + HOUR),
      closesAt: iso(T0 + 3 * HOUR),
      practice: false,
    });
    const { id } = (await created.json()) as { id: string };
    const { id: userId, enrolmentNo } = DEMO_USERS.student1;
    await db.batch([
      addMemberQuery(db, { examId: id, userId, role: 'student', enrolmentNo, joinedAt: T0 }),
    ]);
    const student = await signIn('student1');
    const status = async (who: typeof student, since?: number) => {
      const res = await who.request(
        'GET',
        `/exams/${id}/status${since === undefined ? '' : `?since=${since}`}`,
      );
      expect(res.status).toBe(200);
      return ExamStatus.parse(await res.json());
    };
    return { id, professor, student, status };
  }

  it('answers the state, times and version on the request clock', async () => {
    const { id, student, status } = await setUp();
    expect(await status(student)).toEqual({
      serverTime: iso(T0),
      state: 'draft',
      opensAt: iso(T0 + HOUR),
      closesAt: iso(T0 + 3 * HOUR),
      version: 0,
      notices: [],
      latestNoticeId: 0,
    });
    await db.update(exams).set({ phase: 'published', currentVersion: 1 }).where(eq(exams.id, id));
    expect(await status(student)).toMatchObject({ state: 'scheduled', version: 1 });
    clock.set(T0 + HOUR);
    expect(await status(student)).toMatchObject({ serverTime: iso(T0 + HOUR), state: 'open' });
  });

  it('shows each member only their notices, after since', async () => {
    const { id, professor, student, status } = await setUp();
    const send = (userId: string | null) =>
      notify(db, { examId: id, userId, kind: 'exam_closed', payload: {} }, T0);
    await send(null); // every student
    await send(professor.me.id);
    await send(student.me.id);
    await send(DEMO_USERS.student2.id);
    const ids = (await db.select({ id: notices.id }).from(notices).where(eq(notices.examId, id)))
      .map((n) => n.id)
      .sort((a, b) => a - b);
    const [all, prof, own] = ids as [number, number, number];

    expect(await status(student)).toMatchObject({ notices: [], latestNoticeId: own });
    const fromZero = await status(student, 0);
    expect(fromZero.notices.map((n) => n.id)).toEqual([all, own]);
    expect(fromZero.notices[0]).toEqual({
      id: all,
      kind: 'exam_closed',
      payload: {},
      createdAt: iso(T0),
    });
    expect((await status(student, all)).notices.map((n) => n.id)).toEqual([own]);
    expect(await status(student, own)).toMatchObject({ notices: [], latestNoticeId: own });
    expect(await status(professor)).toMatchObject({ notices: [], latestNoticeId: prof });
    expect((await status(professor, 0)).notices.map((n) => n.id)).toEqual([prof]);
  });

  it('answers 401 signed out, 404 to a non-member and 400 to a bad since', async () => {
    const { id, student } = await setUp();
    const code = async (res: Response) => ApiErrorBody.parse(await res.json()).error.code;
    const signedOut = await app.request(`/api/exams/${id}/status`, {}, env);
    expect([signedOut.status, await code(signedOut)]).toEqual([401, 'UNAUTHENTICATED']);
    const outsider = await (await signIn('student2')).request('GET', `/exams/${id}/status`);
    expect([outsider.status, await code(outsider)]).toEqual([404, 'NOT_FOUND']);
    const missing = await student.request('GET', `/exams/${crypto.randomUUID()}/status`);
    expect([missing.status, await code(missing)]).toEqual([404, 'NOT_FOUND']);
    const bad = await student.request('GET', `/exams/${id}/status?since=-1`);
    expect([bad.status, await code(bad)]).toEqual([400, 'BAD_REQUEST']);
  });
});
