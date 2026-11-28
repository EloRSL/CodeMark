import type { RunResult } from '@codemark/contracts';

function trimEndChars(text: string, chars: string): string {
  let end = text.length;

  while (end > 0 && chars.includes(text.charAt(end - 1))) {
    end--;
  }

  return text.slice(0, end);
}

export function normalizeOutput(text: string): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => trimEndChars(line, ' \t'));

  return trimEndChars(lines.join('\n'), '\n');
}

export function outputsMatch(expected: string, actual: string): boolean {
  return normalizeOutput(expected) === normalizeOutput(actual);
}

export function testPassed(result: RunResult, expectedOutput: string): boolean {
  return !result.timedOut && result.exitCode === 0 && outputsMatch(expectedOutput, result.stdout);
}
