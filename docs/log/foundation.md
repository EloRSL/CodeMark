# Role log: foundation and accounts (EloRSL)

What the foundation and accounts code adds to the docs, and where it differs from them. Read it before you use anything from this module. Only EloRSL edits this file; Rok reviews every change. Rules and format: `conventions.md` G20 and section 11.

## Added

### Deploy workflow
- Where: `.github/workflows/deploy.yml`, on every push to `main`.
- Reads: the GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and the repository variables `APP_ORIGIN`, `RUNNER_ORIGIN`, `DEMO_MODE`, `AI_PROVIDER`, `AI_MODEL` and `PROFESSOR_EMAILS` (may be empty). `APP_ENV` is always `production`.
- What: builds the app and the runner site, applies the D1 migrations, deploys the Worker `codemark` and the Pages project `codemark-runner`. No Workers AI binding yet; it arrives when grading needs it.
- Added: 2026-11-21, M1 task 9 pull request.

### D1 `database_id` in `apps/api/wrangler.toml`
- What: the deployed database's ID is committed, which moves the local database too. Run `pnpm db:reset` once after you pull it.
- Also: `pnpm dev` creates an empty `apps/web/dist` when it's missing, because the Worker's static assets point there.
- Added: 2026-11-21, M1 task 9 pull request.

### `runCron(cronEnv: Env = env): Promise<void>`
- Where: `apps/api/test/client.ts`, for API tests only.
- What: one cron run through the Worker's `scheduled` handler, as the Cron Trigger runs it: `LIMITS.jobsPerCronRun` due jobs on the clock `test.clock` set. Use `test.runJobs` to run every due job at once.
- Added: 2026-11-20, M1 task 8 pull request.

### `signIn(user: DemoUser, app: Hono<AppEnv> = app): Promise<{ me: Me; cookie: string; request: (method: string, path: string, body?: unknown) => Promise<Response> }>`
- Where: `apps/api/test/client.ts`, for API tests only.
- What: signs a demo user in through `auth.demo` and returns a client. `request` sends the session cookie and the Origin header; paths omit `/api` (`request('GET', '/me')`). Throws if `auth.demo` doesn't answer 200.
- Added: 2026-11-20, M1 task 8 pull request.

## Changed

Nothing yet.
