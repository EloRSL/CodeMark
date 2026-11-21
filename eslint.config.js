import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import path from 'node:path';
import tseslint from 'typescript-eslint';

const inModule = /apps\/api\/src\/modules\/([^/]+)(\/.*)?$/;

/** ADR1-2: a file in one API module imports another module only through its index.ts. */
export const moduleBoundary = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { index: "Import module '{{name}}' only through its index.ts (ADR1-2)." },
  },
  create(context) {
    const file = context.filename.replaceAll('\\', '/');
    const from = file.match(inModule)?.[1];
    if (!from) return {};
    const check = (node) => {
      const spec = node.source?.value;
      if (typeof spec !== 'string' || !spec.startsWith('.')) return;
      const [, to, rest] = path.posix.join(path.posix.dirname(file), spec).match(inModule) ?? [];
      if (to && to !== from && rest && !/^\/(index(\.ts)?)?$/.test(rest)) {
        context.report({ node, messageId: 'index', data: { name: to } });
      }
    };
    return {
      ImportDeclaration: check,
      ImportExpression: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};

export default defineConfig([
  globalIgnores([
    '**/dist/',
    '**/.wrangler/',
    '**/worker-configuration.d.ts',
    '**/playwright-report/',
    '**/test-results/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/api/src/**/*.ts'],
    plugins: { codemark: { rules: { 'module-boundary': moduleBoundary } } },
    rules: { 'codemark/module-boundary': 'error' },
  },
  {
    // G4: API code takes the time from c.get('now') or ctx.now, so tests can move the clock.
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/platform/clock.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          "NewExpression[callee.name='Date'][arguments.length=0]",
          "CallExpression[callee.name='Date']",
        ].map((selector) => ({ selector, message: "Use c.get('now') or ctx.now (G4)." })),
      ],
    },
  },
]);
