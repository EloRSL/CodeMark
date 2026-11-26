import type { Hono } from 'hono';
import type { AppEnv } from '../../http/context';
import { implement } from '../../http/registry';
import { clock } from '../../platform/clock';
import { runDueJobs, type JobHandlers } from './service';
import { closeDueExams } from '../exams';

/** api.md T1 and T2. app.ts registers these only when APP_ENV is test. */
export function testRoutes(app: Hono<AppEnv>, jobHandlers: JobHandlers): void {
  implement(app, 'test.clock', async ({ body }) => {
    clock.set(body.now === null ? null : Date.parse(body.now));
    return { now: new Date(clock.now()).toISOString() };
  });

  implement(app, 'test.runJobs', async ({ db, env, now }) => {
    const examsClosed = await closeDueExams(db, now);
    let jobsRun = 0;
    while (jobsRun < 100) {
      const run = await runDueJobs(db, env, now, 100 - jobsRun, jobHandlers);
      if (run === 0) break;
      jobsRun += run;
    }
    return { examsClosed, jobsRun };
  });
}
