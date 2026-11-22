import { describe, expect, it } from 'vitest';
import { taskInstructionsMarkdown } from './taskInstructions';

const labels = { tips: 'Tips', starterCode: 'Starter code' };

describe('taskInstructionsMarkdown', () => {
  it('combines legacy tips and starter code into the Markdown prompt', () => {
    expect(
      taskInstructionsMarkdown(
        {
          instructions: 'Solve the problem.',
          tips: 'Consider edge cases.',
          starterCode: 'print()',
        },
        labels,
      ),
    ).toBe(
      'Solve the problem.\n\n### Tips\n\nConsider edge cases.\n\n### Starter code\n\n```\nprint()\n```',
    );
  });

  it('uses a longer code fence when starter code contains backticks', () => {
    expect(
      taskInstructionsMarkdown(
        { instructions: '', tips: '', starterCode: 'const example = ```;' },
        labels,
      ),
    ).toBe('### Starter code\n\n````\nconst example = ```;\n````');
  });

  it('does not add empty legacy sections', () => {
    expect(
      taskInstructionsMarkdown({ instructions: 'Prompt', tips: ' \n ', starterCode: '' }, labels),
    ).toBe('Prompt');
  });
});
