import { LIMITS, type RunResult } from '@codemark/contracts';
import { describe, expect, it } from 'vitest';
import { normalizeOutput, outputsMatch, testPassed } from './compare';
import cases from './compare.cases.json';

describe('normalizeOutput', () => {
  it('normalizes long runs of whitespace quickly', () => {
    for (const text of [
      ' '.repeat(LIMITS.storedOutputBytes - 1) + 'x',
      '\n'.repeat(LIMITS.storedOutputBytes - 1) + 'x',
    ]) {
      const start = performance.now();

      expect(normalizeOutput(text)).toBe(text);
      expect(performance.now() - start).toBeLessThan(20);
    }
  });

  it('normalizes line endings and trailing whitespace', () => {
    expect(normalizeOutput('Hello  \r\nWorld\t\r\n\r\n')).toBe('Hello\nWorld');
  });

  it('preserves leading and inner whitespace', () => {
    expect(normalizeOutput('\n  Hello  World')).toBe('\n  Hello  World');
  });
});

describe('outputsMatch', () => {
  it.each(cases)('$name', ({ expected, actual, match }) => {
    expect(outputsMatch(expected, actual)).toBe(match);
  });
});

describe('testPassed', () => {
  const successfulResult: RunResult = {
    stdout: '42\n',
    stderr: '',
    exitCode: 0,
    timedOut: false,
    durationMs: 1,
  };

  it('passes when output matches and exit code is zero', () => {
    expect(testPassed(successfulResult, '42')).toBe(true);
  });

  it('fails when output does not match', () => {
    expect(testPassed(successfulResult, '43')).toBe(false);
  });

  it('fails when the program crashes', () => {
    expect(
      testPassed(
        {
          ...successfulResult,
          exitCode: 1,
          stderr: 'RuntimeError',
        },
        '42',
      ),
    ).toBe(false);
  });

  it('fails when the program times out', () => {
    expect(
      testPassed(
        {
          ...successfulResult,
          exitCode: -1,
          timedOut: true,
        },
        '42',
      ),
    ).toBe(false);
  });

  it('fails on timeout even if exit code is zero', () => {
    expect(testPassed({ ...successfulResult, timedOut: true }, '42')).toBe(false);
  });

  it('fails when the program exits with a nonzero code', () => {
    expect(testPassed({ ...successfulResult, exitCode: 3 }, '42')).toBe(false);
  });

  it('does not fail solely because stderr is nonempty', () => {
    expect(testPassed({ ...successfulResult, stderr: 'Warning' }, '42')).toBe(true);
  });
});
