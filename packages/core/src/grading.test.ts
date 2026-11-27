import type { GradingRequest, StoredTestResult } from '@codemark/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildCheckSummary,
  checkGradingAnswer,
  floorToHalf,
  numberLines,
  runsPoints,
} from './grading';

describe('floorToHalf', () => {
  it.each([
    [0, 0],
    [0.49, 0],
    [0.5, 0.5],
    [1.99, 1.5],
    [2, 2],
    [(3 * 2) / 3, 2], // float noise must not drop a whole step
    [3 / 3, 1],
  ])('floors %d to %d', (x, expected) => {
    expect(floorToHalf(x)).toBe(expected);
  });
});

describe('runsPoints', () => {
  it.each([
    ['all pass', { maxPoints: 3, passed: 3, total: 3, smallTypo: false }, 3],
    ['all pass, smallTypo ignored', { maxPoints: 3, passed: 3, total: 3, smallTypo: true }, 3],
    ['some pass', { maxPoints: 3, passed: 2, total: 3, smallTypo: false }, 2],
    ['some pass, smallTypo ignored', { maxPoints: 3, passed: 1, total: 3, smallTypo: true }, 2],
    ['some pass, rounded down', { maxPoints: 2, passed: 1, total: 4, smallTypo: false }, 1],
    ['none pass', { maxPoints: 3, passed: 0, total: 3, smallTypo: false }, 0],
    ['none pass with smallTypo', { maxPoints: 3, passed: 0, total: 3, smallTypo: true }, 1],
    [
      'none pass with smallTypo, rounded down',
      { maxPoints: 2, passed: 0, total: 4, smallTypo: true },
      0.5,
    ],
    ['no tests', { maxPoints: 3, passed: 0, total: 0, smallTypo: false }, 0],
  ])('%s', (_, input, expected) => {
    expect(runsPoints(input)).toBe(expected);
  });
});

const result = (overrides: Partial<StoredTestResult>): StoredTestResult => ({
  testId: '00000000-0000-4000-8000-000000000403',
  passed: true,
  timedOut: false,
  exitCode: 0,
  stdout: '',
  stderr: '',
  durationMs: 10,
  ...overrides,
});
const traceback = (last: string) =>
  `Traceback (most recent call last):\n  File "main.py", line 3, in <module>\n${last}\n\n`;

describe('buildCheckSummary', () => {
  it.each([
    ['no tests', [], { passed: 0, total: 0, firstFailure: null }],
    ['all pass', [result({}), result({})], { passed: 2, total: 2, firstFailure: null }],
    [
      'wrong output',
      [result({}), result({ passed: false, stdout: '8\n' })],
      { passed: 1, total: 2, firstFailure: { kind: 'wrong_output', errorType: null } },
    ],
    [
      'timeout before an error',
      [result({ passed: false, timedOut: true }), result({ passed: false, exitCode: 1 })],
      { passed: 0, total: 2, firstFailure: { kind: 'timeout', errorType: null } },
    ],
    [
      'error keeps only the exception name',
      [
        result({}),
        result({
          passed: false,
          exitCode: 1,
          stderr: traceback("ValueError: invalid literal for int() with base 10: '-'"),
        }),
      ],
      { passed: 1, total: 2, firstFailure: { kind: 'error', errorType: 'ValueError' } },
    ],
    [
      'dotted exception name',
      [
        result({
          passed: false,
          exitCode: 1,
          stderr: traceback('json.decoder.JSONDecodeError: x'),
        }),
      ],
      {
        passed: 0,
        total: 1,
        firstFailure: { kind: 'error', errorType: 'json.decoder.JSONDecodeError' },
      },
    ],
    [
      'error without a name',
      [result({ passed: false, exitCode: 137, stderr: 'Segmentation fault (core dumped)\n' })],
      { passed: 0, total: 1, firstFailure: { kind: 'error', errorType: null } },
    ],
    [
      'a hidden input written alone to stderr is not a name',
      [result({ passed: false, exitCode: 1, stderr: 'secret_input_42\n' })],
      { passed: 0, total: 1, firstFailure: { kind: 'error', errorType: null } },
    ],
    [
      'error with empty stderr',
      [result({ passed: false, exitCode: 1 })],
      { passed: 0, total: 1, firstFailure: { kind: 'error', errorType: null } },
    ],
  ])('%s', (_, results, expected) => {
    expect(buildCheckSummary(results)).toEqual(expected);
  });

  it.each(['KeyboardInterrupt', 'SystemExit', 'UserWarning', 'BaseException'])(
    'keeps %s',
    (name) => {
      const failed = result({ passed: false, exitCode: 1, stderr: traceback(`${name}: x`) });
      expect(buildCheckSummary([failed]).firstFailure).toEqual({ kind: 'error', errorType: name });
    },
  );
});

describe('numberLines', () => {
  it.each([
    ['a = 1\nprint(a)', '1: a = 1\n2: print(a)'],
    ['a = 1\r\n\r\nprint(a)\r', '1: a = 1\n2: \n3: print(a)\n4: '],
    ['', '1: '],
  ])('numbers %j', (code, expected) => {
    expect(numberLines(code)).toBe(expected);
  });
});

const C1 = '00000000-0000-4000-8000-000000000301';
const C2 = '00000000-0000-4000-8000-000000000302';
const OTHER = '00000000-0000-4000-8000-000000000399';
const code =
  'n = int(input())\r\ntotal = 0\r\nfor d in str(abs(n)):\r\n    total += int(d)\r\nprint(total)\r\n';
const request: GradingRequest = {
  task: { title: 'Sum of digits', instructions: 'Print the sum of the digits of n.' },
  criteria: [
    { id: C1, name: 'Reads the input', description: '', maxPoints: 1 },
    { id: C2, name: 'Uses a loop', description: '', maxPoints: 2 },
  ],
  numberedCode: numberLines(code),
  check: { passed: 3, total: 3, firstFailure: null },
};
const runs = { smallTypo: false, reason: '' };
const answer = (criteria: unknown[]) => JSON.stringify({ criteria, runs });
const c1 = {
  criterionId: C1,
  points: 1,
  reason: 'Reads n.',
  quotes: [{ line: 1, text: 'n = int(input())' }],
};
const c2 = {
  criterionId: C2,
  points: 1.5,
  reason: 'Loops.',
  quotes: [{ line: 3, text: '  for d in str(abs(n)):  ' }],
};

describe('checkGradingAnswer', () => {
  it('accepts a valid answer and keeps matching quotes', () => {
    expect(checkGradingAnswer(answer([c1, c2]), request, code)).toEqual({
      ok: true,
      answer: { criteria: [c1, c2], runs },
      flagged: [],
    });
  });

  it('accepts JSON in a Markdown fence with text around it', () => {
    const raw = 'Here is the result:\n```json\n' + answer([c1, c2]) + '\n```\nDone.';
    expect(checkGradingAnswer(raw, request, code)).toMatchObject({ ok: true, flagged: [] });
  });

  it.each([
    ['not JSON', 'I cannot grade this.'],
    ['broken JSON', '{"criteria": [}'],
    ['empty', ''],
    ['wrong shape', JSON.stringify({ criteria: 'none', runs })],
    ['missing runs', JSON.stringify({ criteria: [c1, c2] })],
    ['reason too long', answer([c1, { ...c2, reason: 'x'.repeat(601) }])],
    ['missing criterion', answer([c1])],
    ['duplicate criterion', answer([c1, c2, c2])],
    ['extra criterion', answer([c1, c2, { ...c2, criterionId: OTHER }])],
    ['points above max', answer([c1, { ...c2, points: 2.5 }])],
    ['negative points', answer([c1, { ...c2, points: -0.5 }])],
    ['points not a multiple of 0.5', answer([c1, { ...c2, points: 1.25 }])],
  ])('rejects %s', (_, raw) => {
    const check = checkGradingAnswer(raw, request, code);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).not.toBe('');
  });

  it('drops wrong quotes and flags their criterion without failing', () => {
    const bad = {
      ...c2,
      quotes: [
        { line: 2, text: 'total = 1' }, // wrong text
        { line: 9, text: 'print(total)' }, // no such line
        { line: 5, text: 'print(total)' },
      ],
    };
    expect(checkGradingAnswer(answer([c1, bad]), request, code)).toEqual({
      ok: true,
      answer: { criteria: [c1, { ...c2, quotes: [{ line: 5, text: 'print(total)' }] }], runs },
      flagged: [C2],
    });
  });
});
