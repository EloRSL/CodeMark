import type { ExamContent } from '@codemark/contracts';
import { describe, expect, it } from 'vitest';
import { buildStudentView } from './studentView';

describe('buildStudentView', () => {
  it('removes hidden tests and preserves public tests', () => {
    const content: ExamContent = {
      schemaVersion: 1,
      tasks: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Task',
          instructions: 'Do it',
          tips: 'Tip',
          starterCode: '',
          timeLimitMs: 2000,
          criteria: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              name: 'Correctness',
              description: '',
              maxPoints: 1,
              kind: 'ai',
            },
          ],
          tests: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              visibility: 'public',
              input: '1',
              expectedOutput: '1',
            },
            {
              id: '44444444-4444-4444-8444-444444444444',
              visibility: 'hidden',
              input: 'secret',
              expectedOutput: 'answer',
            },
          ],
        },
      ],
    };
    const view = buildStudentView(content);
    expect(view.tasks[0]!.publicTests).toHaveLength(1);
    expect(view.tasks[0]!.hiddenTestCount).toBe(1);
    expect(JSON.stringify(view)).not.toContain('44444444-4444-4444-8444-444444444444');
    expect(JSON.stringify(view)).not.toContain('secret');
    expect(JSON.stringify(view)).not.toContain('answer');
  });
});
