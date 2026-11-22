import type { Task } from '@codemark/contracts';

type TaskText = Pick<Task, 'instructions' | 'tips' | 'starterCode'>;

export function taskInstructionsMarkdown(
  task: TaskText,
  labels: { tips: string; starterCode: string },
): string {
  const sections: string[] = [];

  if (task.instructions.trim()) sections.push(task.instructions);
  if (task.tips.trim()) sections.push(`### ${labels.tips}\n\n${task.tips}`);
  if (task.starterCode.trim()) {
    const longestBacktickRun = [...task.starterCode.matchAll(/`+/g)].reduce(
      (longest, [run]) => Math.max(longest, run.length),
      0,
    );
    const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));
    sections.push(`### ${labels.starterCode}\n\n${fence}\n${task.starterCode}\n${fence}`);
  }

  return sections.join('\n\n');
}
