import {
  GradingAnswer,
  type CheckSummary,
  type GradingRequest,
  type StoredTestResult,
} from '@codemark/contracts';

export type AnswerCheck =
  { ok: true; answer: GradingAnswer; flagged: string[] } | { ok: false; error: string };

export function floorToHalf(x: number): number {
  return Math.floor(x * 2 + 1e-9) / 2;
}

export function runsPoints(input: {
  maxPoints: number;
  passed: number;
  total: number;
  smallTypo: boolean;
}): number {
  const { maxPoints, passed, total, smallTypo } = input;
  if (total > 0 && passed === total) return maxPoints;
  if (passed >= 1) return floorToHalf((maxPoints * 2) / 3);
  if (smallTypo) return floorToHalf(maxPoints / 3);
  return 0;
}

const EXCEPTION_NAME = /^[A-Za-z_][A-Za-z0-9_.]{0,99}$/;
// a program can write a hidden input alone to stderr; only real exception names leave the Worker
const EXCEPTION_ENDING = /(Error|Exception|Warning|Interrupt|Exit)$/;

export function buildCheckSummary(results: StoredTestResult[]): CheckSummary {
  const summary = { passed: results.filter((r) => r.passed).length, total: results.length };
  const failed = results.find((r) => !r.passed);
  if (!failed) return { ...summary, firstFailure: null };
  if (failed.timedOut) return { ...summary, firstFailure: { kind: 'timeout', errorType: null } };
  if (failed.exitCode === 0) {
    return { ...summary, firstFailure: { kind: 'wrong_output', errorType: null } };
  }
  // only the name before ':' leaves the Worker; the message can repeat a hidden input
  const lastLine = failed.stderr.split(/\r?\n/).findLast((line) => line.trim() !== '') ?? '';
  const name = lastLine.split(':')[0] ?? '';
  const errorType = EXCEPTION_NAME.test(name) && EXCEPTION_ENDING.test(name) ? name : null;
  return { ...summary, firstFailure: { kind: 'error', errorType } };
}

const codeLines = (code: string) => code.replace(/\r\n?/g, '\n').split('\n');

export function numberLines(code: string): string {
  return codeLines(code)
    .map((line, i) => `${i + 1}: ${line}`)
    .join('\n');
}

export function checkGradingAnswer(
  raw: string,
  request: GradingRequest,
  code: string,
): AnswerCheck {
  // the slice from the first '{' to the last '}' also drops a Markdown fence around the JSON
  let json: unknown;
  try {
    json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    return { ok: false, error: 'The answer is not valid JSON.' };
  }

  const parsed = GradingAnswer.safeParse(json);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const answer = parsed.data;

  const ids = answer.criteria.map((c) => c.criterionId);
  for (const criterion of request.criteria) {
    const count = ids.filter((id) => id === criterion.id).length;
    if (count !== 1) {
      return {
        ok: false,
        error: `Criterion ${criterion.id} must appear exactly once, found ${count}.`,
      };
    }
  }
  const unknown = ids.find((id) => !request.criteria.some((c) => c.id === id));
  if (unknown) return { ok: false, error: `Criterion ${unknown} is not in the request.` };

  for (const c of answer.criteria) {
    const max = request.criteria.find((rc) => rc.id === c.criterionId)!.maxPoints;
    if (c.points > max || !Number.isInteger(c.points * 2)) {
      return {
        ok: false,
        error: `Points for ${c.criterionId} must be between 0 and ${max} in steps of 0.5, got ${c.points}.`,
      };
    }
  }

  const lines = codeLines(code);
  const flagged: string[] = [];
  const criteria = answer.criteria.map((c) => {
    const quotes = c.quotes.filter((q) => q.text.trim() === lines[q.line - 1]?.trim());
    if (quotes.length < c.quotes.length) flagged.push(c.criterionId);
    return { ...c, quotes };
  });
  return { ok: true, answer: { ...answer, criteria }, flagged };
}
