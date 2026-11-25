import type { AiProvider, GradingAnswer, GradingRequest } from '@codemark/contracts';
import { floorToHalf } from '@codemark/core';

function fakeAnswer({ criteria, check, numberedCode }: GradingRequest): GradingAnswer {
  const allPassed = check !== null && check.total > 0 && check.passed === check.total;
  const reason =
    check === null
      ? 'Fake grader: no tests ran.'
      : allPassed
        ? 'Fake grader: all hidden tests passed.'
        : `Fake grader: ${check.passed} of ${check.total} hidden tests passed.`;
  const lines = numberedCode.split('\n').map((line) => line.slice(line.indexOf(': ') + 2));
  const first = lines.findIndex((line) => line.trim() !== '');
  const quotes = first === -1 ? [] : [{ line: first + 1, text: lines[first]! }];
  return {
    criteria: criteria.map((c) => ({
      criterionId: c.id,
      points: allPassed ? c.maxPoints : floorToHalf(c.maxPoints / 2),
      reason,
      quotes,
    })),
    runs: {
      smallTypo: check !== null && check.total > 0 && check.passed === 0,
      reason: 'Fake grader: no hidden test passed.',
    },
  };
}

const fakeProvider: AiProvider = {
  name: 'fake',
  async suggestScores(request) {
    const answer = fakeAnswer(request);
    return {
      raw: JSON.stringify(answer),
      usage: { model: 'fake', inputTokens: 0, outputTokens: 0, neurons: 0 },
    };
  },
};

export function createAiProvider(env: Env): AiProvider {
  if (env.AI_PROVIDER === 'fake') return fakeProvider;
  // shortcut: workers-ai throws until the M3 provider exists
  throw new Error(`AI_PROVIDER '${env.AI_PROVIDER}' is not available`);
}
