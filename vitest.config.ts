import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/*',
      { test: { name: 'eslint-rules', include: ['eslint.config.test.js'] } },
    ],
  },
});
