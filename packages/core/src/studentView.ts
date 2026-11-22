import type { ExamContent, StudentExamView } from '@codemark/contracts';

export function buildStudentView(content: ExamContent): StudentExamView {
  return {
    schemaVersion: 1,
    tasks: content.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      instructions: task.instructions,
      tips: task.tips,
      starterCode: task.starterCode,
      timeLimitMs: task.timeLimitMs,
      criteria: task.criteria,
      publicTests: task.tests
        .filter((test) => test.visibility === 'public')
        .map((test) => ({ id: test.id, input: test.input, expectedOutput: test.expectedOutput })),
      hiddenTestCount: task.tests.filter((test) => test.visibility === 'hidden').length,
    })),
  };
}
