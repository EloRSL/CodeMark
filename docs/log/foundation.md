# Role log: foundation and accounts (EloRSL)

What the foundation and accounts code adds to the docs, and where it differs from them. Read it before you use anything from this module. Only EloRSL edits this file; Rok reviews every change. Rules and format: `conventions.md` G20 and section 11.

## Added

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
