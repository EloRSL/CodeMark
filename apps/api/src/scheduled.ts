import { LIMITS } from '@codemark/contracts';
import { createDb } from './db/client';
import { runDueJobs, type JobHandlers } from './modules/platform';
import { clock } from './platform/clock';

// shortcut: stand-in that marks every grading job done, until lukaazman exports
// grading.gradeSubmissionJob (foundation.md, "You use"); then it goes here.
export const jobHandlers: JobHandlers = {
  'grade.submission': { run: async () => ({ kind: 'done' }) },
};

/** The cron, every minute (internal-interfaces.md section 4). */
export async function scheduled(_event: ScheduledController, env: Env): Promise<void> {
  const db = createDb(env.DB);
  const now = clock.now();
  // exams.closeDueExams(db, now) runs here first once butarca delivers it.
  await runDueJobs(db, env, now, LIMITS.jobsPerCronRun, jobHandlers);
}
