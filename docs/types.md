# Shared types

Every type here is implemented once, as a zod schema with the same name, in `packages/contracts/src`. The TypeScript type is `z.infer` of that schema. The comments are validation rules and MUST be in the schema.

Rules:

- **T-1.** Field names, types, enums and nullability MUST match this file exactly. `?` means the field may be absent; `| null` means it is always present and may be null.
- **T-2.** `Uuid` is `z.uuid()`. `IsoDateTime` is `z.iso.datetime()` (UTC, ending in `Z`). `EnrolmentNo` is a string of exactly 8 digits (`/^\d{8}$/`).
- **T-3.** "bytes" limits count UTF-8 bytes (`boundedText(max)` in `common.ts`), not characters.
- **T-4.** Only Rok changes this file. A change here comes first, then the code.

Files: `common.ts`, `limits.ts`, `errors.ts`, `exam.ts`, `examContent.ts`, `jobs.ts`, `notices.ts`, `runner.ts`, `ai.ts`, `api/accounts.ts`, `api/platform.ts`, `api/exams.ts`, `api/submissions.ts`, `api/grading.ts`, `api/review.ts`, `endpoints.ts`.

## common.ts

```ts
type Uuid = string;            // z.uuid()
type IsoDateTime = string;     // z.iso.datetime()
type EnrolmentNo = string;     // /^\d{8}$/
type Locale = 'sl' | 'en';
type UserRole = 'professor' | 'student';
type Ok = { ok: true };
type Cursor = string;          // 1 to 200 characters, opaque to the client
```

## errors.ts

```ts
type ErrorCode =
  | 'BAD_REQUEST'          // 400 body, query or params failed the schema, or a rule in api.md says so
  | 'UNAUTHENTICATED'      // 401 no valid session
  | 'FORBIDDEN'            // 403 signed in, but the wrong role for this route or this exam
  | 'FORBIDDEN_ORIGIN'     // 403 a data-changing request without our Origin (SEC-4)
  | 'NOT_FOUND'            // 404 the thing doesn't exist, or the caller isn't a member of its exam
  | 'CONFLICT'             // 409 the request is valid but the current data doesn't allow it
  | 'EXAM_NOT_OPEN'        // 409 the exam hasn't opened yet
  | 'EXAM_CLOSED'          // 409 the exam no longer allows this
  | 'ENROLMENT_TAKEN'      // 409 another member of this exam has this enrolment number
  | 'ENROLMENT_NOT_LISTED' // 403 the exam has a class list and the number isn't on it
  | 'LIMIT_EXCEEDED'       // 422 a count or budget limit checked outside the schema
  | 'RELEASE_NOT_READY'    // 409 release preconditions not met (ADR-002)
  | 'DEMO_DISABLED'        // 403 demo sign-in while DEMO_MODE isn't "true"
  | 'AI_UNAVAILABLE'       // 503 the AI provider failed during trial grading
  | 'NOT_IMPLEMENTED'      // 501 a registered endpoint whose handler isn't built yet
  | 'INTERNAL';            // 500 anything unexpected

type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;       // English, for developers; never shown to users
    details?: unknown;     // zod issues for BAD_REQUEST; extra data named in api.md
  };
};
```

The HTTP status for each code is the number in the comment, always. Every code has a translation under `errors.<CODE>` in both locale files.

## limits.ts

`LIMITS` exactly as in `architecture.md` section 4, exported `as const`.

## exam.ts

```ts
type ExamPhase = 'draft' | 'published' | 'released';
type ExamState = 'draft' | 'scheduled' | 'open' | 'closed' | 'released';

type GradeThresholds = {
  '6': number; '7': number; '8': number; '9': number; '10': number;  // each >= 0
};  // refine: 6 <= 7 <= 8 <= 9 <= 10; when scale is 'percent', 10 <= 100

type ExamSettings = {
  scale: 'points' | 'percent';
  thresholds: GradeThresholds;
  autocomplete: boolean;
};

const DEFAULT_SETTINGS: ExamSettings = {
  scale: 'percent',
  thresholds: { '6': 50, '7': 60, '8': 70, '9': 80, '10': 90 },
  autocomplete: true,
};

/** What stateOf and isOnTime read. Times in UTC milliseconds. */
type ExamTiming = {
  phase: ExamPhase;
  opensAt: number;
  closesAt: number | null;   // null only for practice exams
  closedAt: number | null;
  practice: boolean;
};
```

## examContent.ts

```ts
type CriterionKind = 'ai' | 'runs';

type Criterion = {
  id: Uuid;
  name: string;              // 1 to 200 characters
  description: string;       // at most 2000 characters
  maxPoints: number;         // > 0, <= 100, multiple of 0.5
  kind: CriterionKind;
};

type TestVisibility = 'public' | 'hidden';

type TestCase = {
  id: Uuid;
  visibility: TestVisibility;
  input: string;             // at most LIMITS.testIoBytes; fed on standard input
  expectedOutput: string;    // at most LIMITS.testIoBytes
};

type Task = {
  id: Uuid;
  title: string;             // 1 to 200 characters
  instructions: string;      // Markdown, at most LIMITS.taskInstructionsChars characters
  tips: string;              // Markdown, at most 10000 characters
  starterCode: string;       // at most LIMITS.codeBytes
  timeLimitMs: number;       // integer, LIMITS.timeLimitMs.min to .max
  criteria: Criterion[];     // 1 to LIMITS.criteriaPerTask
  tests: TestCase[];
};
// refine Task: at most LIMITS.publicTestsPerTask public and LIMITS.hiddenTestsPerTask hidden tests;
// at most one criterion of kind 'runs'; a 'runs' criterion needs at least one hidden test;
// criterion IDs and test IDs unique within the task.

type ExamContent = {
  schemaVersion: 1;
  tasks: Task[];             // 0 to LIMITS.tasksPerExam (publish requires at least 1)
};
// refine ExamContent: JSON.stringify(content) is at most LIMITS.versionBytes; task IDs unique.

type StudentTestCase = { id: Uuid; input: string; expectedOutput: string };  // public tests only

type StudentTask = {
  id: Uuid;
  title: string;
  instructions: string;
  tips: string;
  starterCode: string;
  timeLimitMs: number;
  criteria: Criterion[];     // the rubric is visible to students
  publicTests: StudentTestCase[];
  hiddenTestCount: number;
};

type StudentExamView = {
  schemaVersion: 1;
  tasks: StudentTask[];      // same order as ExamContent.tasks
};
```

IDs never change between versions. The editor keeps every existing ID and makes new ones with `crypto.randomUUID()`.

## jobs.ts

```ts
type JobType = 'grade.submission';

const JobPayloads = {
  'grade.submission': z.object({ submissionId: z.uuid() }).strict(),
};
type JobPayload<T extends JobType> = z.infer<(typeof JobPayloads)[T]>;

type JobStatus = 'queued' | 'running' | 'done' | 'failed';
```

## notices.ts

```ts
type NoticeKind = 'task_changed' | 'exam_closed' | 'results_released' | 'grade_changed' | 'late_decision';

const NoticePayloads = {
  task_changed:     z.object({ version: z.number().int().min(2), note: z.string() }).strict(),
  exam_closed:      z.object({}).strict(),
  results_released: z.object({}).strict(),
  grade_changed:    z.object({ taskId: z.uuid() }).strict(),
  late_decision:    z.object({ submissionId: z.uuid(), taskId: z.uuid(),
                               decision: z.enum(['accepted', 'rejected']) }).strict(),
};

type Notice = {
  [K in NoticeKind]: { id: number; kind: K; payload: z.infer<(typeof NoticePayloads)[K]>; createdAt: IsoDateTime };
}[NoticeKind];   // a discriminated union on kind
```

| Kind | Recipient (`notices.user_id`) | Sent by |
| --- | --- | --- |
| `task_changed` | null: every student of the exam | exams, on a new version while Open |
| `exam_closed` | the exam's professor | exams, from the cron, once |
| `results_released` | null: every student | review, on release |
| `grade_changed` | one student, or null after a task removal | review (a released score changed), exams (a task removed after release) |
| `late_decision` | the student who submitted | submissions |

## runner.ts

```ts
type RunResult = {
  stdout: string;            // cut to LIMITS.storedOutputBytes
  stderr: string;            // cut to LIMITS.storedOutputBytes
  exitCode: number;          // 0 finished; 1 uncaught exception; n for SystemExit(n); -1 timed out
  timedOut: boolean;
  durationMs: number;        // >= 0, measured from the start of this input, without interpreter startup
};

interface Runner {
  /** Runs code once per input, in order, each with a fresh globals dict. One RunResult per input. */
  run(code: string, inputs: string[], timeLimitMs: number): Promise<RunResult[]>;
}

/** Page to runner iframe. */
type RunnerRequest = {
  type: 'run';
  requestId: string;         // 1 to 100 characters, unique per request
  code: string;              // at most LIMITS.codeBytes
  inputs: string[];          // 0 to LIMITS.runnerInputsPerRequest
  timeLimitMs: number;       // integer, LIMITS.timeLimitMs.min to .max
};

/** Runner iframe to page. */
type RunnerResponse =
  | { type: 'ready'; pyodideVersion: string }
  | { type: 'result'; requestId: string; results: RunResult[] }
  | { type: 'error'; requestId: string | null; code: 'BAD_REQUEST' | 'RUNNER_CRASHED'; message: string };
```

## ai.ts

```ts
type GradingCriterion = {
  id: Uuid;
  name: string;
  description: string;
  maxPoints: number;
};

type CheckSummary = {
  passed: number;            // integer >= 0
  total: number;             // integer >= 0
  firstFailure: {
    kind: 'wrong_output' | 'error' | 'timeout';
    errorType: string | null;      // for 'error': only the Python exception name, e.g. 'ValueError',
                                   // 'SyntaxError' (/^[A-Za-z_][A-Za-z0-9_.]{0,99}$/), never the message,
                                   // which can repeat a hidden input; null for the other kinds
  } | null;                  // null when every test passed or total is 0
};

/** strict(): unknown keys are rejected, so nothing personal can be added by mistake (SEC-10). */
type GradingRequest = {
  task: { title: string; instructions: string };   // strict
  criteria: GradingCriterion[];   // only kind 'ai', at least 1
  numberedCode: string;           // numberLines(code)
  check: CheckSummary | null;     // null only for trial grading
};

type AiQuote = { line: number; text: string };   // line: integer >= 1

type AiCriterionAnswer = {
  criterionId: Uuid;
  points: number;            // >= 0
  reason: string;            // at most LIMITS.aiReasonChars
  quotes: AiQuote[];         // at most 10
};

/** The JSON the prompt asks for. checkGradingAnswer() enforces the rest. */
type GradingAnswer = {
  criteria: AiCriterionAnswer[];
  runs: { smallTypo: boolean; reason: string };   // reason at most LIMITS.aiReasonChars
};

type AiUsage = { model: string; inputTokens: number; outputTokens: number; neurons: number };

interface AiProvider {
  readonly name: string;     // 'fake' or 'workers-ai'
  /** Returns the model's raw text and its usage. Throws AiProviderError when the call fails. */
  suggestScores(request: GradingRequest, previousError?: string): Promise<{ raw: string; usage: AiUsage }>;
}
```

## api/accounts.ts

```ts
type Me = {
  id: Uuid;
  email: string;
  name: string;
  role: UserRole;
  enrolmentNo: EnrolmentNo | null;
  locale: Locale;
  demo: boolean;
};

type UpdateMeBody = { enrolmentNo?: EnrolmentNo; locale?: Locale };   // at least one field

type DemoUser = 'professor' | 'student1' | 'student2' | 'student3';
type DemoLoginBody = { user: DemoUser };

type OAuthProvider = 'google' | 'github';
type AuthStartQuery = { returnTo?: string };   // the schema transforms returnTo with safeReturnTo; never a 400

/**
 * A path on our own site to return to after sign-in. Returns "/" when the value is missing,
 * longer than 2000 characters, or doesn't start with "/". Otherwise it resolves
 * url = new URL(value, 'http://codemark.invalid'); if that throws or url.origin isn't
 * 'http://codemark.invalid', it returns "/", else url.pathname + url.search + url.hash.
 * This catches "//evil.com", "/\evil.com", and tabs or newlines that browsers strip.
 */
function safeReturnTo(value: string | undefined): string;

type JoinExamBody = { joinCode: string; enrolmentNo: EnrolmentNo };   // joinCode 4 to 32 characters
type JoinExamResponse = { examId: Uuid };

type ClassListBody = { enrolmentNos: EnrolmentNo[] };   // at most LIMITS.classListMax; [] removes the list
type ClassListResponse = { count: number };

type UpdateMemberBody = { enrolmentNo: EnrolmentNo };

type Member = {
  userId: Uuid;
  name: string;
  email: string;
  role: UserRole;
  enrolmentNo: EnrolmentNo | null;
};
```

## api/platform.ts

```ts
type StatusQuery = { since?: number };   // coerced integer >= 0: the newest notice id the browser has seen

type ExamStatus = {
  serverTime: IsoDateTime;
  state: ExamState;
  opensAt: IsoDateTime;
  closesAt: IsoDateTime | null;   // null for practice; students see this as the end (no grace period)
  version: number;                // exams.current_version
  notices: Notice[];              // newer than `since`, oldest first; [] when `since` is absent
  latestNoticeId: number;         // the newest notice id this caller may see, 0 if none
};

/** Test-only endpoints (api.md T1, T2), in the separate testEndpoints registry. */
type TestClockBody = { now: IsoDateTime | null };   // null returns to the real clock
type TestClockResponse = { now: IsoDateTime };
type TestRunJobsResponse = { examsClosed: number; jobsRun: number };
```

## api/exams.ts

```ts
type ExamSummary = {
  id: Uuid;
  title: string;
  state: ExamState;
  opensAt: IsoDateTime;
  closesAt: IsoDateTime | null;
  currentVersion: number;
  role: UserRole;                 // the caller's role in this exam
  practice: boolean;
};

type ExamListResponse = { exams: ExamSummary[] };   // sorted by opensAt, newest first

type CreateExamBody = {
  title: string;                  // 1 to 200 characters
  opensAt: IsoDateTime;
  closesAt: IsoDateTime | null;
  practice: boolean;
};  // refine: practice === (closesAt === null); closesAt > opensAt when present

type ExamVersionInfo = { version: number; createdAt: IsoDateTime; note: string };

type ExamForProfessor = {
  role: 'professor';
  exam: ExamSummary;
  joinCode: string;
  settings: ExamSettings;
  draft: ExamContent;
  finalVersionTasks: { id: Uuid; title: string }[]; // task names from the final version for adjustments
  versions: ExamVersionInfo[];    // oldest first
  adjustments: TaskAdjustment[];
};

type ExamForStudent = {
  role: 'student';
  exam: ExamSummary;
  autocomplete: boolean;
  view: StudentExamView | null;   // null while draft or scheduled; the current version's view otherwise
};

type ExamDetail = ExamForProfessor | ExamForStudent;   // discriminated on role

type SaveDraftResponse = { savedAt: IsoDateTime };

type UpdateSettingsBody = {
  title?: string;                 // 1 to 200 characters
  opensAt?: IsoDateTime;
  closesAt?: IsoDateTime;
  settings?: ExamSettings;
};  // at least one field

type NewVersionBody = { note: string };   // 1 to 500 characters
type VersionResponse = { version: number };

type TaskAdjustmentBody = { removed: boolean; keepAsBonus: boolean };
type TaskAdjustment = { taskId: Uuid; removed: boolean; keepAsBonus: boolean; decidedAt: IsoDateTime };
```

## api/submissions.ts

```ts
type SubmitBody = {
  code: string;                   // at most LIMITS.codeBytes
  version: number;                // integer >= 1: the version the student was looking at
  retryKey: Uuid;                 // made once per click on Submit
};

type Receipt = {
  submissionId: Uuid;
  taskId: Uuid;
  version: number;
  sha256: string;                 // /^[0-9a-f]{64}$/
  arrivedAt: IsoDateTime;
  late: boolean;
};

type MySubmissionsResponse = { receipts: Receipt[] };   // newest first

type LateDecision = 'pending' | 'accepted' | 'rejected';

type SubmissionListMember = {
  userId: Uuid;
  name: string;
  enrolmentNo: EnrolmentNo | null;
  tasks: {
    taskId: Uuid;
    submissions: number;
    lastArrivedAt: IsoDateTime | null;
    countedSubmissionId: Uuid | null;
    lateWaiting: { submissionId: Uuid; arrivedAt: IsoDateTime }[];   // late, decision pending
    checked: boolean;             // the counted submission has a hidden_results row
  }[];                            // one per task of the current version, in order
};
type SubmissionListResponse = { members: SubmissionListMember[] };   // students only, by enrolment number

type LateDecisionBody = { decision: 'accepted' | 'rejected' };

type RecheckQuery = { limit?: number };   // coerced integer 1 to LIMITS.recheckBatchSize, default 10

type RecheckItem = {
  submissionId: Uuid;
  version: number;                // the final version
  code: string;
  timeLimitMs: number;
  tests: { testId: Uuid; input: string }[];   // hidden tests of the task, in order; inputs only (SEC-2)
};
type RecheckBatch = { items: RecheckItem[]; remaining: number };   // remaining: unchecked after this batch

type CheckedOutput = RunResult & { testId: Uuid };   // stdout and stderr at most LIMITS.storedOutputBytes

type RecheckSubmitBody = {
  results: { submissionId: Uuid; version: number; outputs: CheckedOutput[] }[];   // 1 to LIMITS.recheckBatchSize
};
type RecheckSubmitResponse = { stored: number; gradingJobsQueued: number };

/** One element of hidden_results.results. */
type StoredTestResult = {
  testId: Uuid;
  passed: boolean;
  timedOut: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};
```

## api/review.ts

```ts
type ScoreState = 'suggested' | 'confirmed';
type SuggestionSource = 'ai' | 'tests';

type ScoreSuggestion = {
  criterionId: Uuid;
  points: number;                 // >= 0, multiple of 0.5, <= the criterion's maxPoints
  reason: string;
  quotes: AiQuote[];
  source: SuggestionSource;
  flagged: boolean;               // a quote was dropped because it didn't match the code
};

type ScoreRecord = {
  id: Uuid;
  submissionId: Uuid;
  criterionId: Uuid;
  state: ScoreState;
  points: number | null;          // confirmed points; null while suggested
  suggestion: Omit<ScoreSuggestion, 'criterionId'> | null;   // null: grade manually
  newSuggestion: boolean;
  comment: string | null;
  confirmedAt: IsoDateTime | null;
  releasedAt: IsoDateTime | null;
};

type ReviewFilter = 'needs-review' | 'not-checked' | 'confirmed' | 'all';
type ReviewQuery = { filter?: ReviewFilter; cursor?: Cursor };   // default filter 'needs-review'

type ReviewQueueItem = {
  submissionId: Uuid;
  taskId: Uuid;
  studentName: string;
  enrolmentNo: EnrolmentNo | null;
  late: boolean;
  checked: boolean;
  ai: 'waiting' | 'done' | 'manual';
  confirmed: number;              // confirmed records
  criteria: number;               // criteria of the task in the final version
};
type ReviewQueue = {
  items: ReviewQueueItem[];       // at most LIMITS.reviewPageSize
  nextCursor: Cursor | null;
  notChecked: number;             // counted submissions without a check result, whole exam
};

type CheckResult = {
  version: number;
  passed: number;
  total: number;
  tests: StoredTestResult[];
};

type HistoryEntry = {
  scoreRecordId: Uuid;
  oldPoints: number | null;
  newPoints: number | null;
  oldState: ScoreState | null;
  newState: ScoreState;
  actorName: string;              // the professor's name, or 'AI' or 'Tests'
  at: IsoDateTime;
  note: string | null;
};

type SubmissionReview = {
  submission: Receipt & { code: string; studentName: string; enrolmentNo: EnrolmentNo | null };
  task: Task;                     // from the final version, with expected outputs (professor only)
  check: CheckResult | null;
  scoreRecords: ScoreRecord[];    // in the task's criterion order
  history: HistoryEntry[];        // newest first
  nextSubmissionId: Uuid | null;  // the next item in the 'needs-review' queue, for "next"
};

type ConfirmBody = {
  points?: number;                // multiple of 0.5, 0 to maxPoints; absent keeps the suggested points
  comment?: string;               // at most 1000 characters
};

type ConfirmAllResponse = { confirmed: number };
type ReleaseResponse = { releasedAt: IsoDateTime };

type MyResults = {
  released: boolean;
  tasks: {
    taskId: Uuid;
    title: string;
    removed: boolean;
    keepAsBonus: boolean;
    check: { passed: number; total: number } | null;
    criteria: {
      criterionId: Uuid;
      name: string;
      kind: CriterionKind;
      maxPoints: number;
      points: number | null;      // released confirmed points; null if not released yet
      reason: string | null;
      comment: string | null;
    }[];
  }[];
  total: number;
  max: number;
  percent: number;                // rounded to 2 decimals for display
  grade: 5 | 6 | 7 | 8 | 9 | 10 | null;   // null when released is false
};
```

## api/grading.ts

```ts
type TrialGradeBody = { code: string };   // at most LIMITS.codeBytes

type TrialGradeResponse = {
  suggestions: ScoreSuggestion[];  // one per 'ai' criterion; no 'runs' suggestion, because no tests ran
  neuronsUsed: number;
  model: string;
};

type AiStatus = {
  jobsQueued: number;              // grade.submission jobs of this exam, queued or running
  jobsFailed: number;
  neuronsUsedToday: number;        // all exams, since 00:00 UTC
  dailyBudget: number;             // LIMITS.aiDailyGradingBudget
  estimatedFinish: IsoDateTime | null;   // see api.md for the formula
};
```

## endpoints.ts

The endpoint registry: one entry per endpoint in `api.md`, with `method`, `path` (Hono style, `:examId`), `module`, `access`, `scope`, `summary`, `body?`, `query?`, `response`.

```ts
type Access = 'public' | 'signed-in' | 'professor' | 'student';
type Scope = 'none' | 'exam' | 'submission' | 'scoreRecord';
type ModuleName = 'platform' | 'accounts' | 'exams' | 'submissions' | 'review' | 'grading';
type ResponseKind = z.ZodType | 'redirect' | 'csv';
```

- `access: 'professor'` or `'student'` means the caller's role **in the exam** when `scope` isn't `none`, and the user's role when it is `none`.
- A test in `endpoints.test.ts` checks that every entry is registered by the Worker and every Worker route has an entry.
