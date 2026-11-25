import type { CheckSummary, GradingRequest } from '@codemark/contracts';
import { checkGradingAnswer, numberLines, runsPoints } from '@codemark/core';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createAiProvider } from './index';

const C = (n: number) => `00000000-0000-4000-8000-000000000${n}`;
const criteria = [
  { id: C(301), name: 'Reads the input correctly', description: '', maxPoints: 1 },
  { id: C(302), name: 'Uses a loop over the digits', description: '', maxPoints: 2 },
  { id: C(303), name: 'Handles negative numbers', description: '', maxPoints: 1 },
];
const request = (code: string, check: CheckSummary | null): GradingRequest => ({
  task: {
    title: 'Sum of digits',
    instructions: 'Read an integer n and print the sum of its digits.',
  },
  criteria,
  numberedCode: numberLines(code),
  check,
});

// docs/demo-data.md student code; expected values from docs/gate1.md step 12
const ana = 'n = int(input())\nprint(sum(int(d) for d in str(abs(n))))\n';
const bor = 'n = int(input())\ntotal = 0\nfor d in str(n):\n    total += int(d)\nprint(total)\n';
const cvetka =
  'n = int(input())\ntotal = 0\nfor d in str(abs(n))\n    total += int(d)\nprint(total)\n';

describe('AI fake', () => {
  const provider = createAiProvider(env);

  it.each([
    ['Ana', ana, { passed: 3, total: 3, firstFailure: null }, [1, 2, 1], 3],
    [
      'Bor',
      bor,
      { passed: 2, total: 3, firstFailure: { kind: 'error', errorType: 'ValueError' } },
      [0.5, 1, 0.5],
      2,
    ],
    [
      'Cvetka',
      cvetka,
      { passed: 0, total: 3, firstFailure: { kind: 'error', errorType: 'SyntaxError' } },
      [0.5, 1, 0.5],
      1,
    ],
  ] as const)('gives the Gate 1 values for %s', async (_, code, check, points, runs) => {
    const { raw, usage } = await provider.suggestScores(request(code, check));
    const result = checkGradingAnswer(raw, request(code, check), code);
    if (!result.ok) throw new Error(result.error);

    expect(result.flagged).toEqual([]);
    expect(result.answer.criteria.map((c) => c.points)).toEqual(points);
    for (const c of result.answer.criteria)
      expect(c.quotes).toEqual([{ line: 1, text: 'n = int(input())' }]);
    expect(runsPoints({ maxPoints: 3, ...check, smallTypo: result.answer.runs.smallTypo })).toBe(
      runs,
    );
    expect(usage).toEqual({ model: 'fake', inputTokens: 0, outputTokens: 0, neurons: 0 });
    expect(raw).toBe(JSON.stringify(JSON.parse(raw)));
  });

  it.each([
    [{ passed: 3, total: 3, firstFailure: null }, 'Fake grader: all hidden tests passed.'],
    [
      { passed: 2, total: 3, firstFailure: { kind: 'wrong_output', errorType: null } },
      'Fake grader: 2 of 3 hidden tests passed.',
    ],
    [null, 'Fake grader: no tests ran.'],
  ] as const)('writes the reason for %j', async (check, reason) => {
    const { raw } = await provider.suggestScores(request(ana, check));
    expect(JSON.parse(raw).criteria[0].reason).toBe(reason);
  });

  it('gives half points, no smallTypo and no quotes without a check or code', async () => {
    const { raw } = await provider.suggestScores(request('\n  \n', null));
    expect(JSON.parse(raw)).toEqual({
      criteria: criteria.map((c) => ({
        criterionId: c.id,
        points: c.maxPoints / 2,
        reason: 'Fake grader: no tests ran.',
        quotes: [],
      })),
      runs: { smallTypo: false, reason: 'Fake grader: no hidden test passed.' },
    });
  });

  it('quotes the first non-empty line with its number', async () => {
    const { raw } = await provider.suggestScores(request('\n\n  x = 1\n', null));
    expect(JSON.parse(raw).criteria[0].quotes).toEqual([{ line: 3, text: '  x = 1' }]);
  });
});

describe('createAiProvider', () => {
  it.each(['workers-ai', 'other'])('throws for %s', (name) => {
    expect(() => createAiProvider({ ...env, AI_PROVIDER: name })).toThrow();
  });
});
