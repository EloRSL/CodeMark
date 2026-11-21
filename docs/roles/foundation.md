# EloRSL: Foundation and accounts

**Goal:** give the team a working base in week 1, and keep the whole platform running.

**Read first:** `conventions.md`, `glossary.md`, `architecture.md`, `data-model.md` (accounts, platform), `types.md`, `api.md` (#1 to #10, T1, T2), `internal-interfaces.md` (sections 1, 3 platform and accounts, 4, 5), ADR-001, ADR-005, `gate1.md`, `demo-data.md`.

## You own

| Kind | What |
| --- | --- |
| Repository | root config, `pnpm-workspace.yaml`, the root `package.json` scripts listed in `conventions.md` section 7, `.gitignore` (with the AI agent lines from section 10), `.github/` (CI, deploy, CODEOWNERS), `README.md` (structure and your sections) |
| Packages | `packages/contracts` (you keep it equal to `types.md` and `api.md`; only Rok changes those), `packages/core/src/demo/` |
| API | `apps/api/src/http/`, `apps/api/src/db/`, `apps/api/src/app.ts`, `apps/api/src/scheduled.ts`, `apps/api/src/platform/clock.ts`, `apps/api/src/modules/accounts/`, `apps/api/src/modules/platform/`, `apps/api/seed/` |
| Web | `apps/web/src/lib/` (except `runner/` and `editor/`), `apps/web/src/modules/accounts/`, `apps/web/src/i18n/` (the files; others add their keys), app shell, routing, sign-in page, Demo banner |
| E2E | `e2e/` harness and `e2e/gate1.spec.ts` |
| Tables | `users`, `oauth_accounts`, `sessions`, `exam_members`, `class_list`, `jobs`, `notices` |
| Endpoints | #1 to #10, T1, T2 |
| Accounts | the GitHub repository is Rok's (`EloRSL/CodeMark`); Rok and tzuntar are the two Cloudflare administrators (D23) |

## You provide

| What | To | By |
| --- | --- | --- |
| Repo, CI, deploy, module folders, CODEOWNERS, ESLint boundary rule | everyone | M1 |
| `packages/contracts` with every type and all 33 endpoints registered as `stub` | everyone | M1 |
| `implement`, `ApiError`, the access and Origin checks, the clock | everyone | M1 |
| Demo sign-in and the demo users | everyone | M1 |
| `enqueue`, `enqueueQuery`, `notify`, `notifyQuery`, `runDueJobs`, the cron, `test.clock`, `test.runJobs` | butarca, tzuntar, lukaazman, bjaksic84 | M1 |
| `api()`, `useMe`, `useExamStatus` | butarca, timursic2, tzuntar, lukaazman, bjaksic84 | M1 |
| `getMembership`, `addMemberQuery`, `listStudentMembers`, `getUserNames`, `resolveScopeExamId` | butarca, tzuntar, bjaksic84 | M1 |
| An API test helper: a signed-in client per demo user, and `runCron(env)` | everyone | M1 |
| The Gate 1 test with stand-ins | everyone | M2 |

## You use

| What | From | Until it exists |
| --- | --- | --- |
| `getExam`, `stateOf` for the status endpoint | butarca | M1, delivered first |
| `closeDueExams` for the cron | butarca | call nothing for closing until M2 |
| `gradeSubmissionJob` for the job handlers | lukaazman | a stand-in handler that returns `done` |
| Every role's screens for the Gate 1 test | everyone | API calls in the test instead of UI steps |

## Tasks in order

### M1, by 2026-11-29

1. Monorepo with pnpm, TypeScript strict, ESLint, Prettier; `apps/web`, `apps/api`, `apps/runner`, `packages/contracts`, `packages/core`, `e2e`.
2. CI on every pull request: install, typecheck, lint, `format:check`, `check:i18n`, Vitest, build, Playwright.
3. `packages/contracts` exactly as `types.md`, the registry as `api.md`, every endpoint registered with `stub`; `endpoints.test.ts`.
4. D1 with Drizzle, `db:generate`, `db:reset`; the accounts and platform tables.
5. `implement`, the API-5 check order, `ApiError`, the clock middleware, `test.clock`. `sha256Hex` in `packages/core/src/hash.ts` (tzuntar reviews it).
6. Sessions (SEC-5), `auth.demo`, `auth.logout`, `me.get`, `me.update` (the API part only).
7. i18n with `sl.json`, `en.json`, the language switch (saves `locale` with `me.update`), `errors.<CODE>` for every code, `check:i18n`. Then the web part of task 6, so every text is written once: `api()`, `useMe`, the app shell, the sign-in page with demo buttons, `DemoBanner`.
8. Jobs, notices, `runDueJobs`, the cron, `pnpm cron`; `exams.status`; `useExamStatus`; `test.runJobs` (it calls nothing for closing exams until butarca delivers `closeDueExams`).
9. Deploy workflow: on merge to `main`, apply migrations, deploy the Worker (`codemark`) and the runner site (`codemark-runner`); variables from the repository variables (architecture.md section 5). Seed the demo data on the deployment once.
10. **Limits test** on the deployed Worker, because local runs don't enforce the 10 ms CPU limit: saving and publishing a 512 KB exam (with butarca's endpoints), and a cron run with two stand-in jobs that each do 10 D1 queries and parse a full-size version. Report the CPU times to Rok. If one fails, Rok lowers `versionBytes` or `jobsPerCronRun` before anyone builds on them.

### M2, by 2026-12-06

11. `e2e/gate1.spec.ts` following `gate1.md`, with the AI fake and the fake clock, using API calls where a screen doesn't exist yet. It runs in CI from now on.
12. OAuth with Google and GitHub (`auth.start`, `auth.callback`), professor role from `PROFESSOR_EMAILS`.

### M3, by 2026-12-18 (Core)

13. `exams.join` and `members.update` (S2), with the join page.
14. Access tests for every endpoint: signed out, non-member, wrong role (S4, G15).
15. Full demo seed per `demo-data.md`, generated from `packages/core/src/demo/` (S40).

### M4, by 2026-12-23

16. `exams.classList` and its upload form (S3).
17. README: setup, demo accounts, a walk-through of one exam, the three Part 1 statements (S41), and the database export to run after every release (`wrangler d1 export codemark-db --remote`, kept in a private folder only Rok and tzuntar can open, the two Cloudflare administrators, D23). Collect each role's section.

### M5, by 2026-12-30

18. Run the Gate 1 script on the deployment with `AI_PROVIDER=workers-ai`. Check request and D1 usage in the Cloudflare dashboard afterwards.

## Tests you write

- Sessions: expiry, logout, cookie flags.
- Origin check: missing and wrong Origin on every method that changes data.
- `PROFESSOR_EMAILS`: listed email gets professor, others student, a removed email is demoted at the next sign-in.
- Join: each error code, already a member, class list on and off.
- `runDueJobs`: claim race (two runs, one job), retry delays, budget wait spends no attempt, failure after 5 attempts calls `onFailed`, expired lock returns to the queue, dedupe.
- Status: notice visibility for professor and student, `since` handling, `latestNoticeId`.
- `check:i18n` fails on a missing key.

## MUST NOT

- Write business logic of another module, or another module's tables.
- Make the test endpoints reachable when `APP_ENV` isn't `test`.
- Commit a secret, `.dev.vars`, or the Cloudflare account email.
- Add a dependency outside `architecture.md` section 2 without Rok.

## Done when

Everyone can sign in with demo accounts on the deployment, others can queue jobs and send notices, the Gate 1 script runs in CI, the limits test result is reported to Rok, and the Gate 1 script passes on the deployment with the real AI.
