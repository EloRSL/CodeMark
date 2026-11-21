import { ESLint, RuleTester } from 'eslint';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { moduleBoundary } from './eslint.config.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const exams = 'apps/api/src/modules/exams/service.ts';
const error = [{ messageId: 'index' }];

new RuleTester().run('module-boundary (ADR1-2)', moduleBoundary, {
  valid: [
    { filename: exams, code: "import { a } from '../submissions';" },
    { filename: exams, code: "import { a } from '../submissions/index';" },
    { filename: exams, code: "import { a } from '../submissions/index.ts';" },
    { filename: exams, code: "import { a } from './schema';" },
    { filename: exams, code: "import { a } from '../../db/schema';" },
    { filename: exams, code: "import { a } from '@codemark/contracts';" },
    { filename: 'apps/api/src/db/schema.ts', code: "export * from '../modules/exams/schema';" },
  ],
  invalid: [
    { filename: exams, code: "import { a } from '../submissions/service';", errors: error },
    { filename: exams, code: "export { a } from '../review/schema';", errors: error },
    { filename: exams, code: "const m = import('../grading/service');", errors: error },
    {
      filename: 'apps/api/src/modules/exams/lib/deep.ts',
      code: "import { a } from '../../platform/jobs';",
      errors: error,
    },
  ],
});

// Lints through the real eslint.config.js, so the file patterns and exemptions are tested too.
describe('G4: no real clock in apps/api/src', () => {
  const eslint = new ESLint({ cwd: fileURLToPath(new URL('.', import.meta.url)) });
  const g4Errors = async (expression, filePath = exams) => {
    const code = `declare const ms: number;\nexport const t = ${expression};\n`;
    const [result] = await eslint.lintText(code, { filePath });
    expect(result.messages.filter((m) => m.fatal)).toEqual([]);
    return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length;
  };

  // Date(x) ignores x and returns the current time as text, so any call of Date() is banned.
  it.each(['Date.now()', 'Date()', 'Date(ms)', 'new Date()', 'new Date'])('bans %s', async (e) => {
    expect(await g4Errors(e)).toBe(1);
  });

  it.each([
    'new Date(ms)',
    'new Date(ms).toISOString()',
    "new Date('2026-12-01T10:00:00.000Z')",
    "Date.parse('2026-12-01T10:00:00.000Z')",
    'Date.UTC(2026, 11, 1)',
  ])('allows %s', async (e) => {
    expect(await g4Errors(e)).toBe(0);
  });

  it.each(['apps/api/src/platform/clock.ts', 'apps/api/src/http/registry.test.ts'])(
    'allows the real clock in %s',
    async (filePath) => {
      expect(await g4Errors('Date.now()', filePath)).toBe(0);
    },
  );
});
