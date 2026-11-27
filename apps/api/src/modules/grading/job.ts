import type { JobHandlerDef } from '../platform';

// shortcut: stand-in that marks the job done without grading, until M2 task 4
export const gradeSubmissionJob: JobHandlerDef<'grade.submission'> = {
  run: async () => ({ kind: 'done' }),
};
