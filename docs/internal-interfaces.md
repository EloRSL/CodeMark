# Internal interfaces

What modules call on each other inside the Worker and the browser. Every function here is exported from the named file and nowhere else. Names and signatures MUST match. Owners are in brackets.

Conventions:

- **II-1.** `db` is the Drizzle D1 database (`type Db`, from `apps/api/src/db/client.ts`). `now` is UTC milliseconds from the request or job context (G4).
- **II-2.** A function whose name ends in `Query` returns an unexecuted statement (`type BatchItem`) for `db.batch([...])`. It writes nothing on its own. Use it to put another module's write into your batch (G11).
- **II-3.** Functions throw `ApiError` (from `apps/api/src/http/errors.ts`) only when named below. Everything else returns `null` for "not found".
- **II-4.** A module imports another module only from its `index.ts`, and only modules earlier in the order `platform`, `accounts`, `exams`, `submissions`, `review`, `grading` (A-4). Route handlers may import any module's `index.ts`.

## 1. HTTP plumbing (EloRSL)

`apps/api/src/http/`:

```ts
// context.ts
type AppEnv = {
  Bindings: Env;   // the variables and bindings in architecture.md section 5
  Variables: { db: Db; now: number; user: SessionUser | null; resolvers: Partial<ScopeResolvers> };  // app.ts sets resolvers
};
type SessionUser = Me;   // the users row as the Me type

// errors.ts
class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown);
}

// registry.ts
/** Registers the endpoint from the registry: access, scope, Origin, validation, error shape. */
function implement<K extends EndpointKey | TestEndpointKey>(   // test endpoints get the same validation
  app: Hono<AppEnv>,
  key: K,
  handler: (args: HandlerArgs<K>) => Promise<ResponseOf<K>>,
): void;

/** Registers the endpoint as 501 NOT_IMPLEMENTED with the owner's name in the message. Runs none of the API-5 checks. */
function stub(app: Hono<AppEnv>, key: EndpointKey): void;

type HandlerArgs<K extends EndpointKey | TestEndpointKey> = {
  c: Context<AppEnv>;
  db: Db;
  env: Env;
  now: number;
  user: SessionUser;              // typed non-null, except for access 'public' (may be null)
  params: ParamsOf<K>;
  query: ParsedQueryOf<K>;
  body: ParsedBodyOf<K>;
  examId: string;                 // typed non-null when the scope isn't 'none'
  membership: Membership;         // the caller's membership; typed non-null when the scope isn't 'none'
};
```

- `implement` validates the response against its schema when `APP_ENV` isn't `production` and returns `500 INTERNAL` with the zod issues in `details` on a mismatch, so contract drift fails tests.
- A thrown `ApiError` becomes its error body. Any other error becomes `500 INTERNAL` and is logged.

`apps/api/src/platform/clock.ts`:

```ts
const clock: {
  now(): number;                  // the fake time when set (APP_ENV=test), otherwise Date.now()
  set(ms: number | null): void;   // only test.clock calls it
};
```

A middleware sets `c.set('now', clock.now())` once per request. This file is the only place in `apps/api` allowed to call `Date.now()`.

## 2. packages/core (pure functions)

No I/O, no `Date.now()`. Used by the browser and the Worker. Each file has table-driven tests.

### lifecycle.ts [butarca]

```ts
function stateOf(exam: ExamTiming, now: number, studentId?: string): ExamState;
function isOnTime(exam: ExamTiming, arrivedAt: number, studentId?: string): boolean;
```

`stateOf`, exactly in this order:

1. `phase === 'draft'` gives `draft`.
2. `phase === 'released'` gives `released`.
3. `now < opensAt` gives `scheduled`.
4. `practice` gives `open`.
5. `closedAt !== null` gives `closed`.
6. `now >= closesAt + LIMITS.graceMs` gives `closed`.
7. Otherwise `open`.

`isOnTime`: `true` for a practice exam; otherwise `arrivedAt < closesAt + LIMITS.graceMs`.

`studentId` is unused in Part 1 (it is there for Part 2's per-student extensions). Required tests: one second before closing (on time), inside the grace period (on time), exactly at `closesAt + graceMs` (late), one second after (late).

### compare.ts [timursic2]

```ts
function normalizeOutput(text: string): string;
function outputsMatch(expected: string, actual: string): boolean;
function testPassed(result: RunResult, expectedOutput: string): boolean;
```

- `normalizeOutput`: replace `\r\n` and `\r` with `\n`; remove spaces and tabs at the end of every line; remove all `\n` at the end of the text.
- `outputsMatch`: `normalizeOutput(expected) === normalizeOutput(actual)`.
- `testPassed`: `!result.timedOut && result.exitCode === 0 && outputsMatch(expectedOutput, result.stdout)`.
- `packages/core/src/compare.cases.json` holds the shared cases `[{ "name", "expected", "actual", "match" }]`, written by timursic2 and tzuntar. At least: line endings, trailing spaces, trailing tabs, trailing empty lines, leading empty lines (count), inner spaces (count), letter case (counts), empty output, non-English characters (`č`, `š`, `ž`). The browser and the Worker both run them in CI.

### grading.ts [lukaazman]

```ts
function floorToHalf(x: number): number;   // Math.floor(x * 2 + 1e-9) / 2
function runsPoints(input: { maxPoints: number; passed: number; total: number; smallTypo: boolean }): number;
function buildCheckSummary(results: StoredTestResult[]): CheckSummary;
function numberLines(code: string): string;
function checkGradingAnswer(raw: string, request: GradingRequest, code: string): AnswerCheck;

type AnswerCheck =
  | { ok: true; answer: GradingAnswer; flagged: string[] }   // criterion IDs with dropped quotes
  | { ok: false; error: string };                            // English, sent back to the AI on retry
```

- `runsPoints`: all tests pass (`total > 0 && passed === total`) gives `maxPoints`; else `passed >= 1` gives `floorToHalf(maxPoints * 2 / 3)`; else `smallTypo` gives `floorToHalf(maxPoints / 3)`; else `0`.
- `buildCheckSummary`: `passed` = results with `passed`; `firstFailure` = the first result that didn't pass: `timeout` if `timedOut`, else `error` if `exitCode !== 0` (with `errorType` = the exception name at the start of the last non-empty line of `stderr`, the text before the first `:`, or `null` if it doesn't match the pattern in `types.md`; the rest of the line is never sent, because it can repeat a hidden input), else `wrong_output`. Null when none failed.
- `numberLines`: normalize line endings to `\n`, then `"{n}: {line}"` per line, `n` from 1, joined with `\n`.
- `checkGradingAnswer`, in order:
  1. Strip a Markdown code fence, take the text from the first `{` to the last `}`, `JSON.parse` it. Failure: `ok: false`.
  2. Parse with `GradingAnswer`. Failure: `ok: false` with the zod message.
  3. Every criterion of the request appears exactly once, and no other `criterionId` appears.
  4. Every `points` is between 0 and the criterion's `maxPoints` and a multiple of 0.5.
  5. Each quote's `line` exists and `text.trim()` equals that code line `.trim()`. A quote that doesn't is dropped, and its criterion goes into `flagged`. This alone never makes `ok: false`.

### grade.ts [butarca]

```ts
type GradeInput = {
  tasks: { taskId: string; criteria: { criterionId: string; maxPoints: number }[] }[];   // final version
  confirmed: { taskId: string; criterionId: string; points: number }[];  // one student's counted submissions
  adjustments: { taskId: string; removed: boolean; keepAsBonus: boolean }[];
  settings: ExamSettings;
};
type GradeResult = { total: number; max: number; percent: number; grade: 5 | 6 | 7 | 8 | 9 | 10 };

function grade(input: GradeInput): GradeResult;
```

- `max` = sum of `maxPoints` of tasks that aren't removed.
- `total` = confirmed points of tasks that aren't removed, plus confirmed points of removed tasks with `keepAsBonus`.
- `percent` = `total / max * 100`, or 0 when `max` is 0. Not rounded here.
- The value compared is `total` when `scale` is `points`, `percent` when `percent`. `grade` = the highest of 10, 9, 8, 7, 6 whose threshold is at most the value (with a tolerance of 1e-9), otherwise 5. It never exceeds 10, even when bonus points push `percent` past 100.
- Required tests: both scales, a removed task with and without bonus, the cap at 10, a value exactly on a threshold, no confirmed points.

### studentView.ts [butarca]

```ts
function buildStudentView(content: ExamContent): StudentExamView;
```

Copies every task field except `tests`; `publicTests` = the public tests as `{ id, input, expectedOutput }`; `hiddenTestCount` = number of hidden tests. A test asserts that no hidden test's ID, input or expected output appears anywhere in the result.

### hash.ts [tzuntar; EloRSL writes it in M1 because sessions need it, tzuntar reviews and owns it]

```ts
function sha256Hex(text: string): Promise<string>;   // SHA-256 of UTF-8 bytes, 64 lowercase hex characters
```

### demo/ [EloRSL, with fixtures from every role]

The demo users, exams and the Gate 1 codes (`docs/demo-data.md`), as typed constants. The seed and the Gate 1 test both import them.

## 3. Worker modules

### platform [EloRSL]: `apps/api/src/modules/platform/index.ts`

```ts
type NewJob<T extends JobType = JobType> = {
  type: T; payload: JobPayload<T>; dedupeKey: string; runAfter: number;
};
function enqueue(db: Db, job: NewJob, now: number): Promise<void>;
function enqueueQuery(db: Db, job: NewJob, now: number): BatchItem;

type NoticePayload<K extends NoticeKind> = z.infer<(typeof NoticePayloads)[K]>;
type NewNotice<K extends NoticeKind = NoticeKind> = {
  examId: string; userId: string | null; kind: K; payload: NoticePayload<K>;
};
function notify(db: Db, notice: NewNotice, now: number): Promise<void>;
function notifyQuery(db: Db, notice: NewNotice, now: number): BatchItem;

type JobContext = { db: Db; env: Env; now: number; attempt: number };   // attempt starts at 1
type JobOutcome = { kind: 'done' } | { kind: 'wait'; runAfter: number };
type JobHandlerDef<T extends JobType> = {
  run(payload: JobPayload<T>, ctx: JobContext): Promise<JobOutcome>;   // throw to fail the attempt
  onFailed?(payload: JobPayload<T>, ctx: JobContext): Promise<void>;   // after the last attempt
};
type JobHandlers = { [T in JobType]: JobHandlerDef<T> };

function runDueJobs(db: Db, env: Env, now: number, limit: number, handlers: JobHandlers): Promise<number>;
```

- `enqueue` and `enqueueQuery` validate the payload with `JobPayloads[type]` (DM-2) and throw on a bad payload. They insert with `ON CONFLICT(dedupe_key) DO NOTHING`, so the same job is never queued twice.
- `notify` and `notifyQuery` validate the payload with `NoticePayloads[kind]`.
- `runDueJobs`:
  1. Expired locks (`status = 'running' AND locked_until < now`): the run that held the job was stopped before it finished, usually by the CPU limit. Set `last_error` to "run stopped before it finished". If `attempts < LIMITS.jobMaxAttempts`, the job goes back to `queued` with its `run_after` unchanged. Otherwise it becomes `failed` and its `onFailed` runs (step 6 applies). Each job failed here counts toward `limit`.
  2. Select up to the rest of `limit` jobs with `status = 'queued' AND run_after <= now`, oldest `run_after` first.
  3. Claim and run them one at a time, so a stopped run leaves at most one job locked. Claim with `UPDATE jobs SET status = 'running', locked_until = now + LIMITS.jobLockMs, attempts = attempts + 1 WHERE id = ? AND status = 'queued'`. Skip it if no row changed.
  4. A payload that fails its schema: `failed` at once, with the validation error in `last_error`. `onFailed` doesn't run, because it needs a valid payload.
  5. `run` returns `done`: status `done`. Returns `wait`: status `queued`, `run_after = runAfter`, `attempts - 1` (a wait spends no attempt). Throws: `last_error` = message (first 1000 characters); if `attempts < LIMITS.jobMaxAttempts`, status `queued` and `run_after = now + LIMITS.jobRetryDelaysMs[attempts - 1]`; otherwise status `failed`, then `onFailed`.
  6. If `onFailed` throws: log it and write `onFailed: ` plus the message to `last_error`. The job stays `failed`, and the run goes on with the next job.
  7. Returns the number of jobs claimed, including the ones failed in steps 1 and 4.

### accounts [EloRSL]: `apps/api/src/modules/accounts/index.ts`

```ts
type Membership = { examId: string; userId: string; role: UserRole; enrolmentNo: string | null; joinedAt: number };

function getMembership(db: Db, examId: string, userId: string): Promise<Membership | null>;
function addMemberQuery(db: Db, member: Membership): BatchItem;
function listStudentMembers(db: Db, examId: string): Promise<Member[]>;   // sorted by enrolment number
function getUserNames(db: Db, userIds: string[]): Promise<Map<string, string>>;
type ScopeResolvers = {
  submission: (db: Db, submissionId: string) => Promise<string | null>;    // submissions.submissionExamId
  scoreRecord: (db: Db, scoreRecordId: string) => Promise<string | null>;  // review.scoreRecordExamId
};
function resolveScopeExamId(db: Db, scope: Scope, params: Record<string, string>, resolvers: Partial<ScopeResolvers>): Promise<string | null>;
```

`resolveScopeExamId` maps `exam` to `params.examId` without reading `exams`: a missing exam has no membership, so the membership check (API-5 step 3) already gives `404`. `submission` and `scoreRecord` call the resolver that `apps/api/src/app.ts` passes in, because `accounts` comes before `submissions` and `review` (A-4). Until tzuntar and bjaksic84 export `submissions.submissionExamId` and `review.scoreRecordExamId` and they are wired in `app.ts`, a route with that scope that isn't a `stub` fails with `500 INTERNAL` and the message "scope resolver not wired".

### exams [butarca]: `apps/api/src/modules/exams/index.ts`

```ts
type ExamRecord = ExamTiming & {
  id: string; title: string; currentVersion: number; createdBy: string; settings: ExamSettings;
};

function getExam(db: Db, examId: string): Promise<ExamRecord | null>;
function getExamState(db: Db, examId: string, now: number): Promise<ExamState>;   // throws ApiError NOT_FOUND
function getVersion(db: Db, examId: string, version: number):
  Promise<{ snapshot: ExamContent; studentView: StudentExamView; note: string; createdAt: number } | null>;
function getFinalVersion(db: Db, examId: string): Promise<{ version: number; snapshot: ExamContent }>;
function getTaskAdjustments(db: Db, examId: string): Promise<TaskAdjustment[]>;
function closeDueExams(db: Db, now: number): Promise<number>;
function releaseQuery(db: Db, examId: string, now: number): BatchItem;
```

- `getFinalVersion` returns the current version. Callers use it only in state `closed` or `released`, when it can no longer change.
- `closeDueExams`: select up to 10 exams with `phase = 'published' AND practice = 0 AND closed_at IS NULL AND closes_at + graceMs <= now`. For each: `UPDATE exams SET closed_at = now WHERE id = ? AND closed_at IS NULL`; only if one row changed, `notify` the professor (`created_by`) with `exam_closed {}`. Returns the number closed. A second run finds nothing (ADR-002).
- `releaseQuery`: `UPDATE exams SET phase = 'released', released_at = now WHERE id = ? AND phase = 'published'`.

### submissions [tzuntar]: `apps/api/src/modules/submissions/index.ts`

```ts
type CountedSubmission = { submissionId: string; studentId: string; taskId: string; arrivedAt: number; late: boolean };
type SubmissionRecord = {
  id: string; examId: string; taskId: string; studentId: string; version: number; code: string;
  sha256: string; arrivedAt: number; late: boolean; lateDecision: LateDecision | null;
};

function getCountedSubmissions(db: Db, examId: string): Promise<CountedSubmission[]>;
function isCounted(db: Db, submissionId: string): Promise<boolean>;
function getSubmission(db: Db, submissionId: string): Promise<SubmissionRecord | null>;
function getCheckResult(db: Db, submissionId: string): Promise<CheckResult | null>;
function submissionExamId(db: Db, submissionId: string): Promise<string | null>;   // scope resolver, wired in app.ts
```

`getCountedSubmissions` applies the rule in `data-model.md` against the final version's task IDs, and returns `[]` for a practice exam.

### review [bjaksic84]: `apps/api/src/modules/review/index.ts`

```ts
type SuggestInput = {
  submissionId: string;
  aiRequestId: string | null;
  suggestions: { criterionId: string; suggestion: Omit<ScoreSuggestion, 'criterionId'> | null }[];  // null: grade manually
};
function suggest(db: Db, input: SuggestInput, now: number): Promise<void>;

function scoreRecordExamId(db: Db, scoreRecordId: string): Promise<string | null>;   // scope resolver, wired in app.ts

function getConfirmedScores(db: Db, examId: string):
  Promise<{ studentId: string; taskId: string; criterionId: string; points: number }[]>;   // counted submissions only
```

`suggest` writes every record and history row of the submission in **one** `db.batch()` (ADR-003, CAP-2), following the write rules in `data-model.md`. It never changes `points` or `state` of a confirmed record.

### grading [lukaazman]: `apps/api/src/modules/grading/index.ts`

```ts
const gradeSubmissionJob: JobHandlerDef<'grade.submission'>;
function createAiProvider(env: Env): AiProvider;   // AI_PROVIDER 'fake' or 'workers-ai'
const PROMPT_VERSION: number;
```

`gradeSubmissionJob.run({ submissionId }, ctx)`:

1. Load the submission. If it's missing, isn't counted, or belongs to a practice exam: return `done`.
2. Load the final version's task and the check result. No check result: throw (retry).
3. Neurons used today ≥ `LIMITS.aiDailyGradingBudget`: return `wait` until 00:05 UTC tomorrow.
4. If the task has "ai" criteria: build the `GradingRequest` (`check` = `buildCheckSummary`), call `suggestScores`, record an `ai_requests` row, run `checkGradingAnswer`. If it fails, call once more with the error passed as `previousError` and record that row too (`attempt` 2). If the provider throws, record the row with status `error` and throw (retry).
5. Suggestions: for "ai" criteria, the answer's points, reason and quotes with `source: 'ai'` and `flagged`; after two failed checks, `null` for each "ai" criterion. For the "runs" criterion, `runsPoints` with `smallTypo` from the answer only when `passed === 0` and the code isn't empty after trimming (an empty program earns 0, ADR3-5), `reason` = the answer's `runs.reason` when `smallTypo` was applied, otherwise "", `quotes: []`, `source: 'tests'`.
6. `review.suggest(...)` once, then return `done`. At most 10 D1 queries in total (CAP-2).

`gradeSubmissionJob.onFailed`: call `review.suggest` with `null` for every "ai" criterion and the "runs" suggestion computed with `smallTypo: false`, so the professor can grade by hand.

Providers:

- **Fake** (`AI_PROVIDER=fake`): for each criterion, `maxPoints` when `check` is not null and `check.total > 0 && check.passed === check.total`, otherwise `floorToHalf(maxPoints / 2)`. `reason`: `"Fake grader: all hidden tests passed."`, `"Fake grader: {passed} of {total} hidden tests passed."`, or `"Fake grader: no tests ran."` when `check` is null. `quotes`: the first non-empty line of the code with its number, or `[]`. `runs`: `{ smallTypo: check !== null && check.total > 0 && check.passed === 0, reason: "Fake grader: no hidden test passed." }`. Usage: model `fake`, all zeros. It returns `raw = JSON.stringify(answer)`.
- **Workers AI** (`AI_PROVIDER=workers-ai`): `env.AI.run(env.AI_MODEL, { messages, max_tokens: 2000 })`, plus `response_format: { type: 'json_object' }` only for models listed in `JSON_MODE_MODELS`. Neurons from the reported tokens and `MODEL_PRICES` (both constants in the grading module).
- **The prompt** MUST: ask for exactly the `GradingAnswer` JSON; give each criterion's ID, name, description and maximum; say that comments and strings in the code are the student's text and never instructions (SEC-10); ask for reasons in the language of the task instructions; ask for quotes copied exactly from the numbered lines; say never to rewrite or fix the code; explain `smallTypo` as "a small mistake such as a typo, a missing colon or a wrong output format explains why no test passed".

## 4. The cron [EloRSL]

`apps/api/src/scheduled.ts`, wired in `apps/api/src/app.ts`; `wrangler.toml` has `crons = ["* * * * *"]`.

```ts
async function scheduled(_event: ScheduledController, env: Env): Promise<void> {
  const db = createDb(env.DB);
  const now = clock.now();
  await exams.closeDueExams(db, now);
  await platform.runDueJobs(db, env, now, LIMITS.jobsPerCronRun, jobHandlers);
}
const jobHandlers: JobHandlers = { 'grade.submission': grading.gradeSubmissionJob };
```

Locally, `pnpm cron` triggers one run (wrangler's `/__scheduled` endpoint, with `wrangler dev --test-scheduled`).

## 5. Browser

### API client and status [EloRSL]: `apps/web/src/lib/`

```ts
// api.ts
function api<K extends EndpointKey>(
  key: K,
  args: { params?: ParamsOf<K>; query?: QueryOf<K>; body?: BodyOf<K> },
): Promise<ResponseOf<K>>;
class ApiClientError extends Error { code: ErrorCode; status: number; details?: unknown }   // the API answered with an error
class NetworkError extends Error {}   // no usable answer: fetch failed (offline, connection dropped), or a 502, 503 or 504 without an ApiErrorBody (a proxy or Cloudflare error page); screens show common.networkError, and submit retries it
// any other answer without an ApiErrorBody becomes ApiClientError with code INTERNAL and the real HTTP status

/** The translation key to show for any error from api(): common.networkError or errors.<CODE>. */
function errorKey(error: unknown): 'common.networkError' | `errors.${ErrorCode}`;   // typed, so t(errorKey(e)) needs no cast

// me.ts
function useMe(): { me: Me | null; isLoading: boolean };

// status.ts
function useExamStatus(examId: string, options?: { onNotice?: (notice: Notice) => void }): {
  status: ExamStatus | null;
  serverOffsetMs: number;   // server time minus browser time
  refresh(): void;          // poll now
};
```

`useExamStatus`:

1. First request without `since`; keep `latestNoticeId` as the cursor.
2. Poll every `LIMITS.pollIntervalMs` while `document.visibilityState === 'visible'`; poll at once when the tab becomes visible again; pause while hidden.
3. Call `onNotice` once per new notice, in order, and advance the cursor to the newest notice received (not to `latestNoticeId`), so more than 50 new notices arrive over the next polls instead of being skipped. `onNotice` gets only the notices that arrive while its hook is mounted: a notice is a live event, not history. When several mounted hooks pass `onNotice` for the same exam, each of them gets every new notice once.
4. `serverOffsetMs` = `Date.parse(serverTime)` minus the midpoint of the request's send and receive times.
5. `refresh()` refetches the same query at once; a poll already running is reused, not doubled.

`useCountdown(closesAt, serverOffsetMs, onZero)` [timursic2] computes the time left from the browser clock plus `serverOffsetMs`, and calls `onZero` once when it reaches zero (again if `closesAt` later moves and it reaches zero again). The exam page passes `refresh` from `useExamStatus` as `onZero`, which gives the one extra status poll.

### Runner client [timursic2]: `apps/web/src/lib/runner/`

```ts
function createIframeRunner(): Runner;   // the real runner (SEC-6)
function createFakeRunner(): Runner;     // stand-in: echoes input to stdout, exitCode 0, durationMs 1
function useRunner(): Runner;            // one shared hidden iframe per page
```

### Shared components

| Component | File | Owner | Props |
| --- | --- | --- | --- |
| `CodeEditor` | `apps/web/src/lib/editor/CodeEditor.tsx` | timursic2 | `value: string; onChange?: (v: string) => void; readOnly?: boolean; autocomplete: boolean; highlightLines?: number[]` |
| `HiddenTestCheck` | `apps/web/src/modules/submissions/HiddenTestCheck.tsx` | tzuntar | `examId: string; onDone?: () => void` |
| `DemoBanner` | `apps/web/src/lib/DemoBanner.tsx` | EloRSL | none |

`HiddenTestCheck` loops until `remaining` is 0: `recheck.next`, run each item through `useRunner()` one at a time (one runner request per submission), cut stdout and stderr to `LIMITS.storedOutputBytes`, then `recheck.submit` for the batch. It shows "{done} of {total}". It starts on mount and stops on unmount.

### Translations [EloRSL owns the files]

Keys are grouped by module: `common.*`, `errors.<CODE>` (EloRSL), `accounts.*` (EloRSL), `exams.*` (butarca), `student.*` (timursic2), `submissions.*` (tzuntar), `grading.*` (lukaazman), `review.*` and `results.*` (bjaksic84). Each person adds keys only under their own groups, in both files in the same pull request.

Plurals use i18next's suffixes: Slovene needs all four forms (`_one`, `_two`, `_few`, `_other`), English two (`_one`, `_other`). Pass `count` and let i18next pick the form. `check:i18n` compares keys with those suffixes removed and fails when a plural key in `sl.json` lacks one of its four forms.

Translation keys are typed from `en.json`: a key that isn't in the files fails typecheck, so add the key to both files before you use it.

## 6. Runner protocol [timursic2, reviewed by tzuntar]

The runner page is `{VITE_RUNNER_ORIGIN}/` in the hidden iframe (SEC-6, SEC-7).

1. When its script has loaded, the runner page posts `{ type: 'ready', pyodideVersion }` to `window.parent` with `targetOrigin = VITE_APP_ORIGIN`.
2. The page sends one `RunnerRequest` at a time and waits for its `result` or `error` before sending the next.
3. The runner ignores any message whose `event.origin` isn't `VITE_APP_ORIGIN`. It answers a message that fails the `RunnerRequest` schema with `error` `BAD_REQUEST`.
4. For each request, the runner page starts a **new** Web Worker, which loads Pyodide from the runner site.
5. For each input, in order: the page starts a timer of `timeLimitMs`, and the Web Worker runs the code with a fresh globals dictionary and the input on standard input (EOF after the input). Interpreter start-up isn't timed.
6. On timeout: terminate the Web Worker, return `{ stdout: '', stderr: '', exitCode: -1, timedOut: true, durationMs: timeLimitMs }` for that input, and start a new Web Worker for the remaining inputs.
7. An uncaught exception gives `exitCode: 1` and the traceback in `stderr`. `SystemExit(n)` gives `exitCode: n`.
8. After the last input, terminate the Web Worker and post `{ type: 'result', requestId, results }`.
9. If Pyodide fails to load or the Web Worker dies unexpectedly, post `{ type: 'error', requestId, code: 'RUNNER_CRASHED', message }`.
10. Student code MUST NOT be able to reach the network (SEC-7) or the next request's interpreter (SEC-8). Playwright tests prove both.
