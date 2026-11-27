import { LIMITS } from '@codemark/contracts';
import { stateOf } from '@codemark/core';
import type { Hono } from 'hono';
import type { AppEnv } from '../../http/context';
import { ApiError } from '../../http/errors';
import { implement } from '../../http/registry';
import { clock } from '../../platform/clock';
import { listNotices, runDueJobs, type JobHandlers } from './service';
import { closeDueExams, getExam } from '../exams';

const iso = (ms: number) => new Date(ms).toISOString();

/** api.md #10. CAP-4: the exam row, the membership (read by the access check) and the notices. */
export function platformRoutes(app: Hono<AppEnv>): void {
  implement(app, 'exams.status', async ({ db, now, query, examId, membership }) => {
    const exam = await getExam(db, examId);
    if (!exam) throw new ApiError('NOT_FOUND', 'No such exam');
    return {
      serverTime: iso(now),
      state: stateOf(exam, now),
      opensAt: iso(exam.opensAt),
      closesAt: exam.closesAt === null ? null : iso(exam.closesAt),
      version: exam.currentVersion,
      ...(await listNotices(db, membership, query.since)),
    };
  });
}

/** api.md T1 and T2. app.ts registers these only when APP_ENV is test. */
export function testRoutes(app: Hono<AppEnv>, jobHandlers: JobHandlers): void {
  implement(app, 'test.clock', async ({ body }) => {
    clock.set(body.now === null ? null : Date.parse(body.now));
    return { now: new Date(clock.now()).toISOString() };
  });

  implement(app, 'test.runJobs', async ({ db, env, now }) => {
    const examsClosed = await closeDueExams(db, now);
    let jobsRun = 0;
    while (jobsRun < LIMITS.jobsPerTestRun) {
      const run = await runDueJobs(db, env, now, LIMITS.jobsPerTestRun - jobsRun, jobHandlers);
      if (run === 0) break;
      jobsRun += run;
    }
    return { examsClosed, jobsRun };
  });
}
