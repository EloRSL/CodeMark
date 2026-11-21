import { defineConfig } from 'drizzle-kit';

// pnpm db:generate writes a new SQL migration here after a schema.ts change (DM-5).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
