import type { RunResult } from '@codemark/contracts';

export function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '');
}

export function outputsMatch(expected: string, actual: string): boolean {
  return normalizeOutput(expected) === normalizeOutput(actual);
}

export function testPassed(result: RunResult, expectedOutput: string): boolean {
  return !result.timedOut && result.exitCode === 0 && outputsMatch(expectedOutput, result.stdout);
}
