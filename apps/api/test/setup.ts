import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { demoSeedSql } from '../seed/sql';

// A fresh test database: every migration, then the same demo seed as pnpm db:reset.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
await env.DB.batch(demoSeedSql(Date.now()).map((statement) => env.DB.prepare(statement)));
