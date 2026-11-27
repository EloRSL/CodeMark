import { LIMITS } from '@codemark/contracts';
import { createDb } from './db/client';
import { runDueJobs, type JobHandlers } from './modules/platform';
import { clock } from './platform/clock';
import { closeDueExams } from './modules/exams';
import { gradeSubmissionJob } from './modules/grading';

export const jobHandlers: JobHandlers = { 'grade.submission': gradeSubmissionJob };

/** The cron, every minute (internal-interfaces.md section 4). */
export async function scheduled(_event: ScheduledController, env: Env): Promise<void> {
  const db = createDb(env.DB);
  const now = clock.now();
  await closeDueExams(db, now);
  await runDueJobs(db, env, now, LIMITS.jobsPerCronRun, jobHandlers);
}
