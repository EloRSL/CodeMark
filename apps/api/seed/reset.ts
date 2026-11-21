import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

// pnpm db:reset: a fresh local database with the demo data. Runs in apps/api, like wrangler.
// stdin is ignored, so wrangler doesn't stop to ask before applying migrations.
const run = (command: string) => execSync(command, { stdio: ['ignore', 'inherit', 'inherit'] });

try {
  rmSync('.wrangler/state/v3/d1', { recursive: true, force: true });
} catch (error) {
  console.error('Could not delete the local database. Stop pnpm dev first.', error);
  process.exit(1);
}
run('wrangler d1 migrations apply codemark-db --local');
run('tsx seed/generate.ts');
run('wrangler d1 execute codemark-db --local --file=seed/demo.sql');
