import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// API tests run in the Workers runtime with the Worker from wrangler.toml.
// test/setup.ts applies every migration to the fresh test database.
export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          APP_ENV: 'test',
          TEST_MIGRATIONS: await readD1Migrations(
            fileURLToPath(new URL('./drizzle', import.meta.url)),
          ),
        },
      },
    }),
  ],
  test: { name: 'api', setupFiles: ['./test/setup.ts'] },
}));
