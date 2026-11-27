# API

All 33 endpoints, plus 2 test-only endpoints. Types are in `types.md`. The endpoint registry in `packages/contracts/src/endpoints.ts` holds the same information, and the Worker registers its routes from it.

## Conventions

- **API-1.** Every path starts with `/api`. Registry paths omit `/api` and use Hono parameters (`/exams/:examId`).
- **API-2.** Requests and responses are JSON (`Content-Type: application/json`), except `auth.start` and `auth.callback` (redirects) and `exams.gradesCsv` (CSV).
- **API-3.** Every success is `200` with the response type named below. No other success codes, except the `302` redirects of #1 and #2.
- **API-4.** Errors are `ApiErrorBody` with the status from `types.md` (G10).
- **API-5.** The Worker checks every request in this order, before the handler runs:
  1. POST, PUT, PATCH, DELETE: the `Origin` header equals `APP_ORIGIN`, or `403 FORBIDDEN_ORIGIN` (SEC-4).
  2. Access is not `public`: a valid, unexpired session, or `401 UNAUTHENTICATED`.
  3. Scope `exam`, `submission` or `scoreRecord`: the exam, submission or score record exists and the caller is a member of its exam, or `404 NOT_FOUND`. A `submission` or `scoreRecord` resolves to its exam first.
  4. Access `professor` or `student`: the caller's role matches, or `403 FORBIDDEN`. The role checked is the caller's role in the exam when the endpoint's scope isn't `none`, and the user's role otherwise.
  5. Query and body pass their schemas, or `400 BAD_REQUEST` with the zod issues in `details`. Path parameters have no schemas: they are strings, and a wrong or unknown ID ends in `404 NOT_FOUND` from the scope check or the handler.
- **API-6.** These errors can come from any endpoint and are not repeated below: `FORBIDDEN_ORIGIN`, `UNAUTHENTICATED`, `NOT_FOUND` from scope checks, `FORBIDDEN` from role checks, `BAD_REQUEST` from schemas, `INTERNAL`. Each entry lists only its other errors.
- **API-7.** "State" means `stateOf(exam, now)`. Handlers MUST NOT compare times themselves (G4).
- **API-8.** A handler that writes more than one row puts all writes in one `db.batch()` (G11).
- **API-9.** No response to a student contains a hidden test's input or expected output (SEC-1).

Index:

| # | Key | Method and path | Access | Module | Owner |
| --- | --- | --- | --- | --- | --- |
| 1 | `auth.start` | GET `/api/auth/{provider}/start` | public | accounts | EloRSL |
| 2 | `auth.callback` | GET `/api/auth/{provider}/callback` | public | accounts | EloRSL |
| 3 | `auth.demo` | POST `/api/auth/demo` | public | accounts | EloRSL |
| 4 | `auth.logout` | POST `/api/auth/logout` | signed-in | accounts | EloRSL |
| 5 | `me.get` | GET `/api/me` | signed-in | accounts | EloRSL |
| 6 | `me.update` | PATCH `/api/me` | signed-in | accounts | EloRSL |
| 7 | `exams.join` | POST `/api/exams/join` | student | accounts | EloRSL |
| 8 | `exams.classList` | PUT `/api/exams/{examId}/class-list` | professor, exam | accounts | EloRSL |
| 9 | `members.update` | PATCH `/api/exams/{examId}/members/{userId}` | professor, exam | accounts | EloRSL |
| 10 | `exams.status` | GET `/api/exams/{examId}/status` | signed-in, exam | platform | EloRSL |
| 11 | `exams.create` | POST `/api/exams` | professor | exams | butarca |
| 12 | `exams.list` | GET `/api/exams` | signed-in | exams | butarca |
| 13 | `exams.get` | GET `/api/exams/{examId}` | signed-in, exam | exams | butarca |
| 14 | `exams.saveDraft` | PUT `/api/exams/{examId}/draft` | professor, exam | exams | butarca |
| 15 | `exams.updateSettings` | PATCH `/api/exams/{examId}/settings` | professor, exam | exams | butarca |
| 16 | `exams.publish` | POST `/api/exams/{examId}/publish` | professor, exam | exams | butarca |
| 17 | `exams.newVersion` | POST `/api/exams/{examId}/versions` | professor, exam | exams | butarca |
| 18 | `exams.adjustTask` | PUT `/api/exams/{examId}/tasks/{taskId}/adjustment` | professor, exam | exams | butarca |
| 19 | `exams.gradesCsv` | GET `/api/exams/{examId}/grades.csv` | professor, exam | exams | butarca |
| 20 | `submissions.create` | POST `/api/exams/{examId}/tasks/{taskId}/submissions` | student, exam | submissions | tzuntar |
| 21 | `submissions.mine` | GET `/api/exams/{examId}/my-submissions` | student, exam | submissions | tzuntar |
| 22 | `submissions.list` | GET `/api/exams/{examId}/submissions` | professor, exam | submissions | tzuntar |
| 23 | `submissions.lateDecision` | POST `/api/submissions/{submissionId}/late-decision` | professor, submission | submissions | tzuntar |
| 24 | `recheck.next` | GET `/api/exams/{examId}/recheck` | professor, exam | submissions | tzuntar |
| 25 | `recheck.submit` | POST `/api/exams/{examId}/recheck` | professor, exam | submissions | tzuntar |
| 26 | `grading.trial` | POST `/api/exams/{examId}/tasks/{taskId}/trial-grade` | professor, exam | grading | lukaazman |
| 27 | `grading.aiStatus` | GET `/api/exams/{examId}/ai-status` | professor, exam | grading | lukaazman |
| 28 | `review.queue` | GET `/api/exams/{examId}/review` | professor, exam | review | bjaksic84 |
| 29 | `review.submission` | GET `/api/submissions/{submissionId}/review` | professor, submission | review | bjaksic84 |
| 30 | `review.confirm` | POST `/api/score-records/{scoreRecordId}/confirm` | professor, scoreRecord | review | bjaksic84 |
| 31 | `review.confirmAll` | POST `/api/submissions/{submissionId}/confirm-all` | professor, submission | review | bjaksic84 |
| 32 | `review.release` | POST `/api/exams/{examId}/release` | professor, exam | review | bjaksic84 |
| 33 | `review.myResults` | GET `/api/exams/{examId}/my-results` | student, exam | review | bjaksic84 |
| T1 | `test.clock` | POST `/api/test/clock` | test only | platform | EloRSL |
| T2 | `test.runJobs` | POST `/api/test/run-jobs` | test only | platform | EloRSL |

---

## accounts (EloRSL)

### 1. `auth.start`: GET `/api/auth/{provider}/start`

- **Params:** `provider`: `OAuthProvider`. **Query:** `AuthStartQuery`.
- **Response:** `302` to the provider's sign-in page.
- **Errors:** an unknown provider gives `404 NOT_FOUND`.
- **Rules:**
  1. Create the OAuth state and, for Google, a PKCE code verifier with `arctic`.
  2. Set the cookie `__Host-oauth` (SEC-5, Max-Age 600) holding `{ state, codeVerifier, returnTo }` as JSON. `returnTo` is the parsed query value: `safeReturnTo` (`types.md`, `api/accounts.ts`) has already turned a missing or unsafe value into `/`.
  3. Request the scopes `openid email profile` (Google) or `read:user user:email` (GitHub).

### 2. `auth.callback`: GET `/api/auth/{provider}/callback`

- **Response:** `302` to `returnTo` with `__Host-session` set. On any failure, `302` to `/sign-in?error=<ErrorCode>`.
- **Errors (as the `error` query parameter):** `BAD_REQUEST` (missing or mismatched state, expired cookie), `FORBIDDEN` (no verified email), `INTERNAL` (provider error).
- **Rules:**
  1. Check `state` against the cookie, exchange the code, and delete `__Host-oauth`.
  2. Take the email: Google's `email` with `email_verified: true`, or GitHub's primary verified email from `GET https://api.github.com/user/emails`. Lowercase it.
  3. Find the user by `oauth_accounts (provider, provider_user_id)`. If there is none, find a user by email and add an `oauth_accounts` row. If there is still none, create a user (locale `sl`, `demo` 0) and its `oauth_accounts` row.
  4. Set `role` on every sign-in: `professor` if the email is in `PROFESSOR_EMAILS`, otherwise `student` (SEC-11). Update `name` from the profile (GitHub: `name`, or `login` when `name` is empty).
  5. Create a session (SEC-5) and set the cookie.

### 3. `auth.demo`: POST `/api/auth/demo`

- **Body:** `DemoLoginBody`. **Response:** `Me`, with `__Host-session` set.
- **Errors:** `403 DEMO_DISABLED` when `DEMO_MODE` isn't `"true"`; `404 NOT_FOUND` when the demo user isn't in the database (the seed didn't run).
- **Rules:** map `professor`, `student1`, `student2`, `student3` to the fixed demo user IDs in `docs/demo-data.md`. Create a session as in `auth.callback`.

### 4. `auth.logout`: POST `/api/auth/logout`

- **Response:** `Ok`. Deletes the session row and clears the cookie (`Max-Age=0`).

### 5. `me.get`: GET `/api/me`

- **Response:** `Me`.

### 6. `me.update`: PATCH `/api/me`

- **Body:** `UpdateMeBody`. **Response:** `Me`.
- **Rules:** changes only the caller's `users` row. It never changes an `exam_members.enrolment_no`.

### 7. `exams.join`: POST `/api/exams/join`

- **Body:** `JoinExamBody`. **Response:** `JoinExamResponse`.
- **Errors:** `404 NOT_FOUND` (no exam with this code, or its state is `draft`); `409 EXAM_CLOSED` (state `closed` or `released`); `409 ENROLMENT_TAKEN`; `403 ENROLMENT_NOT_LISTED`.
- **Rules:**
  1. Trim and uppercase `joinCode`, then find the exam by `join_code`.
  2. If the caller is already a member, return the exam's `examId` and change nothing.
  3. If the state is `closed` or `released`: `EXAM_CLOSED`.
  4. If the exam has a class list and `enrolmentNo` isn't on it: `ENROLMENT_NOT_LISTED`.
  5. If another member of the exam has `enrolmentNo`: `ENROLMENT_TAKEN`.
  6. Insert the `exam_members` row (role `student`). If `users.enrolment_no` is null, set it to `enrolmentNo` in the same batch.

### 8. `exams.classList`: PUT `/api/exams/{examId}/class-list`

- **Body:** `ClassListBody`. **Response:** `ClassListResponse` (the number of distinct enrolment numbers stored).
- **Rules:** replace the exam's whole class list in one batch. `[]` removes the list. Existing members stay members. Allowed in every state.

### 9. `members.update`: PATCH `/api/exams/{examId}/members/{userId}`

- **Body:** `UpdateMemberBody`. **Response:** `Member`.
- **Errors:** `404 NOT_FOUND` (`userId` isn't a student member of this exam); `409 ENROLMENT_TAKEN`.
- **Rules:** the professor may set a number that isn't on the class list. Allowed in every state.

---

## platform (EloRSL)

### 10. `exams.status`: GET `/api/exams/{examId}/status`

- **Query:** `StatusQuery`. **Response:** `ExamStatus`.
- **Rules:**
  1. Any member may call it. Read one `exams` row, the caller's membership and the notices (CAP-4).
  2. Visible notices: `exam_id = examId` and (`user_id = caller` or (`user_id IS NULL` and the caller is a student member)).
  3. Without `since`: `notices` is `[]`, and `latestNoticeId` is the highest visible notice id (0 if none). The browser starts polling from it.
  4. With `since`: visible notices with `id > since`, oldest first, at most `LIMITS.noticesPerPoll`. `latestNoticeId` is the highest visible id overall.
  5. `serverTime` is the request's `now`. `version` is `current_version`.

---

## exams (butarca)

### 11. `exams.create`: POST `/api/exams`

- **Body:** `CreateExamBody`. **Response:** `ExamSummary`.
- **Rules:**
  1. Generate `id` and a unique `joinCode` (`data-model.md`); retry up to 5 times on a collision.
  2. Insert the exam with `phase` `draft`, `draft` `{ "schemaVersion": 1, "tasks": [] }`, `settings` `DEFAULT_SETTINGS`, `current_version` 0, `created_by` the caller.
  3. In the same batch, add the caller as the professor member (`accounts.addMemberQuery`).

### 12. `exams.list`: GET `/api/exams`

- **Response:** `ExamListResponse`: every exam the caller is a member of, newest `opensAt` first.

### 13. `exams.get`: GET `/api/exams/{examId}`

- **Response:** `ExamDetail`, chosen by the caller's role in the exam.
- **Rules:**
  1. Professor: `ExamForProfessor`, including `draft` with hidden tests and expected outputs.
  2. Student: `ExamForStudent`. `view` is null in state `draft` or `scheduled`, otherwise the `student_view` of `current_version`. `autocomplete` comes from the settings.
  3. Building a student response MUST NOT read `draft` or `snapshot` (CAP-5, SEC-1).

### 14. `exams.saveDraft`: PUT `/api/exams/{examId}/draft`

- **Body:** `ExamContent`. **Response:** `SaveDraftResponse`.
- **Errors:** `409 EXAM_CLOSED` in state `closed` or `released`.
- **Rules:** replaces `exams.draft`. It never changes a version; publishing or a new version does.

### 15. `exams.updateSettings`: PATCH `/api/exams/{examId}/settings`

- **Body:** `UpdateSettingsBody`. **Response:** `ExamSummary`.
- **Errors:** `409 EXAM_CLOSED` (see rules); `409 CONFLICT` (see rules); `400 BAD_REQUEST` (see rules).
- **Rules:**
  1. `title`: allowed in every state.
  2. `settings`: allowed in every state except `released` (`EXAM_CLOSED`).
  3. `opensAt`: allowed only in `draft` and `scheduled`, otherwise `CONFLICT`.
  4. `closesAt` (D26): allowed only in `draft`, `scheduled` and `open`, otherwise `EXAM_CLOSED`. A practice exam gets `BAD_REQUEST`. A time earlier than `now` is stored as `now`, so "close now" works even when the professor's clock is slightly behind.
  5. After the change, `closesAt` MUST be later than `opensAt`, otherwise `BAD_REQUEST`.
  6. Students see a new closing time at their next poll. No notice is sent.

### 16. `exams.publish`: POST `/api/exams/{examId}/publish`

- **Response:** `VersionResponse` (`{ "version": 1 }`).
- **Errors:** `409 CONFLICT` when the state isn't `draft`; `400 BAD_REQUEST` when the draft has no task.
- **Rules:** in one batch: insert `exam_versions` version 1 (`snapshot` = draft, `student_view` = `buildStudentView(draft)`, `note` = ""), set `phase` `published` and `current_version` 1.

### 17. `exams.newVersion`: POST `/api/exams/{examId}/versions`

- **Body:** `NewVersionBody`. **Response:** `VersionResponse`.
- **Errors:** `409 CONFLICT` in state `draft` (publish first) or when the draft equals the current version's snapshot; `409 EXAM_CLOSED` in `closed` or `released`; `400 BAD_REQUEST` when the draft has no task.
- **Rules:**
  1. Allowed in `scheduled` and `open`.
  2. In one batch: insert version `current_version + 1` from the draft with its student view and the note, update `current_version`, and in state `open` add a `task_changed` notice `{ version, note }` for all students (`platform.notifyQuery`).
  3. Tasks and criteria MAY be added, changed or removed. Grading uses only the final version, so a task missing from it has no counted submissions.

### 18. `exams.adjustTask`: PUT `/api/exams/{examId}/tasks/{taskId}/adjustment`

- **Body:** `TaskAdjustmentBody`. **Response:** `TaskAdjustment`.
- **Errors:** `409 CONFLICT` unless the state is `closed` or `released`; `404 NOT_FOUND` when `taskId` isn't in the final version.
- **Rules:** upsert the `task_adjustments` row. `removed: false` means the task counts normally. In state `released`, add a `grade_changed` notice `{ taskId }` for all students in the same batch (S27).

### 19. `exams.gradesCsv`: GET `/api/exams/{examId}/grades.csv`

- **Response:** `200`, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="grades-{examId}.csv"`.
- **Errors:** `409 CONFLICT` unless the state is `closed` or `released`.
- **Rules (D18):**
  1. The file starts with the UTF-8 byte order mark. Separator `;`, line ending `\r\n`, decimal comma (`3,5`), no thousands separator. A value containing `;`, `"` or a line break is quoted with `"` and inner quotes doubled. A name or task title starting with `=`, `+`, `-`, `@`, a tab or a carriage return first gets a `'` in front, so a spreadsheet shows it as text instead of running it as a formula.
  2. Header, in the caller's locale. `sl`: `Vpisna številka;Ime;<task titles>;Skupaj;Največ;Odstotek;Ocena`. `en`: `Enrolment number;Name;<task titles>;Total;Max;Percent;Grade`. Task titles are in final-version order; a removed task's title ends with ` (removed)` in `en` or ` (odstranjena)` in `sl`.
  3. One row per student member, sorted by enrolment number. Each task column holds the sum of the confirmed points of the student's counted submission for that task (empty when there is none). Total, max, percent (2 decimals) and grade come from `grade()` with confirmed points only.
  4. The route handler reads confirmed scores through `review.getConfirmedScores` (route handlers may call any module, A-4).

---

## submissions (tzuntar)

### 20. `submissions.create`: POST `/api/exams/{examId}/tasks/{taskId}/submissions`

- **Body:** `SubmitBody`. **Response:** `Receipt`.
- **Errors:** `409 EXAM_NOT_OPEN` (state `draft` or `scheduled`); `409 EXAM_CLOSED` (state `released`); `400 BAD_REQUEST` (`version` is not between 1 and `current_version`); `404 NOT_FOUND` (`taskId` isn't in the current version); `422 LIMIT_EXCEEDED` (the student already has `LIMITS.submissionsPerTask` submissions for this task).
- **Rules:** in this order:
  1. If the caller already has a submission with this `retryKey`, return its receipt and stop. No other check runs.
  2. Check the state, the version, the task and the count, with the errors above.
  3. `sha256` = SHA-256 hex of the code's UTF-8 bytes (`sha256Hex` in core). `arrivedAt` = `now`. `late` = `!isOnTime(exam, now)`. `lateDecision` = `pending` when late, otherwise null.
  4. Insert the row, then return the receipt. If the insert hits the unique key `(student_id, retry_key)`, read the existing row and return its receipt.
  5. A practice exam is never late. In state `closed` the submission is stored as late (S18).
  6. The response contains only the receipt (S20) and MUST arrive within 2 seconds.

### 21. `submissions.mine`: GET `/api/exams/{examId}/my-submissions`

- **Response:** `MySubmissionsResponse`: the caller's receipts in this exam, newest first.

### 22. `submissions.list`: GET `/api/exams/{examId}/submissions`

- **Response:** `SubmissionListResponse`: every student member, sorted by enrolment number, with one entry per task of the current version.
- **Rules:** `countedSubmissionId` and `checked` follow the counted-submission rule (`data-model.md`). Before the exam closes, `countedSubmissionId` is the latest on-time submission.

### 23. `submissions.lateDecision`: POST `/api/submissions/{submissionId}/late-decision`

- **Body:** `LateDecisionBody`. **Response:** `Ok`.
- **Errors:** `409 CONFLICT` when the submission isn't late or its decision isn't `pending`.
- **Rules:** in one batch: set `late_decision`, `late_decided_by`, `late_decided_at`, and add a `late_decision` notice `{ submissionId, taskId, decision }` for the student. An accepted submission that is now counted appears in the next `recheck.next` batch, even after the release (ADR-002).

### 24. `recheck.next`: GET `/api/exams/{examId}/recheck`

- **Query:** `RecheckQuery`. **Response:** `RecheckBatch`.
- **Errors:** `409 CONFLICT` unless the state is `closed` or `released`.
- **Rules:**
  1. Items: counted submissions without a `hidden_results` row, oldest `arrived_at` first, at most `limit` (default `LIMITS.recheckBatchSize`).
  2. Each item: the final version, the task's `timeLimitMs`, and the task's hidden tests as `{ testId, input }` in task order. A task without hidden tests gives `tests: []`.
  3. MUST NOT include any expected output (SEC-2).
  4. `remaining` = unchecked counted submissions minus `items.length`.

### 25. `recheck.submit`: POST `/api/exams/{examId}/recheck`

- **Body:** `RecheckSubmitBody`. **Response:** `RecheckSubmitResponse`.
- **Errors:** `409 CONFLICT` unless the state is `closed` or `released`; `400 BAD_REQUEST` when a result's `version` isn't the final version or its `outputs` don't have exactly the task's hidden test IDs in task order.
- **Rules:**
  1. Skip, without error, any result whose submission isn't counted any more or already has a `hidden_results` row. `stored` counts only the results that were stored.
  2. For each test: `passed = testPassed(output, expectedOutput)` (core). Each submission's result also gets the counts `passed` and `total`.
  3. In one batch for the whole request: insert each `hidden_results` row (`ON CONFLICT DO NOTHING`) and, for each, `platform.enqueueQuery(db, { type: 'grade.submission', payload: { submissionId }, dedupeKey: 'grade:' + submissionId, runAfter: now }, now)`.
  4. `gradingJobsQueued` = number of stored results.

---

## grading (lukaazman)

### 26. `grading.trial`: POST `/api/exams/{examId}/tasks/{taskId}/trial-grade`

- **Body:** `TrialGradeBody`. **Response:** `TrialGradeResponse`.
- **Errors:** `404 NOT_FOUND` (`taskId` isn't in the draft); `400 BAD_REQUEST` (the task has no "ai" criterion); `422 LIMIT_EXCEEDED` (Neurons used today have reached `LIMITS.aiDailyNeuronQuota`); `503 AI_UNAVAILABLE` (the provider failed, or the answer failed the checks twice).
- **Rules:**
  1. Allowed in every state. Uses the task from the **draft**, so it works before publishing.
  2. `GradingRequest` with `check: null`. Same checks and one retry as a grading job (`internal-interfaces.md` section 3, grading).
  3. Record each AI call in `ai_requests` with `kind` `trial` and `submission_id` null.
  4. Stores no score records.

### 27. `grading.aiStatus`: GET `/api/exams/{examId}/ai-status`

- **Response:** `AiStatus`.
- **Rules:**
  1. `jobsQueued`, `jobsFailed`: `grade.submission` jobs whose submission belongs to this exam (a read-only join of `jobs` and `submissions`).
  2. `estimatedFinish`: null when `jobsQueued` is 0 or there is no `ai_requests` row of kind `grade` with status `ok` yet. Otherwise, with `avg` = mean `neurons` of the last 20 such rows (at least 1), `budget` = `LIMITS.aiDailyGradingBudget`, `left` = max(0, `budget` - `neuronsUsedToday`):
     - `today` = floor(`left` / `avg`). If `jobsQueued` ≤ `today`: `now` + ceil(`jobsQueued` / `LIMITS.jobsPerCronRun`) minutes.
     - Otherwise `rest` = `jobsQueued` - `today`, `perDay` = max(1, floor(`budget` / `avg`)), `days` = ceil(`rest` / `perDay`): 00:05 UTC tomorrow + (`days` - 1) days + ceil((`rest` - (`days` - 1) × `perDay`) / `LIMITS.jobsPerCronRun`) minutes.

---

## review (bjaksic84)

### 28. `review.queue`: GET `/api/exams/{examId}/review`

- **Query:** `ReviewQuery`. **Response:** `ReviewQueue`.
- **Errors:** `409 CONFLICT` unless the state is `closed` or `released`.
- **Rules:**
  1. Items are counted submissions only.
  2. `checked`: a `hidden_results` row exists. `ai`: `waiting` when the submission has no score records; `manual` when a record of an "ai" criterion has no suggestion; `done` otherwise.
  3. Filters: `not-checked` = not checked. `needs-review` = checked, has records, and some record isn't confirmed or has `newSuggestion`. `confirmed` = every criterion has a confirmed record and none has `newSuggestion`. `all` = everything.
  4. Order: task position in the final version, then enrolment number, then `submissionId`. `cursor` is base64url JSON of the last item's `{ t, e, s }`. Page size `LIMITS.reviewPageSize`.
  5. `notChecked` counts the whole exam, whatever the filter.

### 29. `review.submission`: GET `/api/submissions/{submissionId}/review`

- **Response:** `SubmissionReview`.
- **Rules:** any submission of the exam may be opened, counted or not. `task` comes from the final version. `nextSubmissionId` is the item after this one in the `needs-review` order, or null.

### 30. `review.confirm`: POST `/api/score-records/{scoreRecordId}/confirm`

- **Body:** `ConfirmBody`. **Response:** `ScoreRecord`.
- **Errors:** `409 CONFLICT` unless the state is `closed` or `released`; `400 BAD_REQUEST` when `points` is absent and the record has no suggestion, or `points` exceeds the criterion's `maxPoints`.
- **Rules:**
  1. New points: `points`, or the suggested points when absent. A given `comment` replaces the stored one; an absent `comment` keeps it.
  2. In one batch: update the record (`state` `confirmed`, `points`, `comment`, `confirmed_by`, `confirmed_at`, `new_suggestion` 0, and `released_at` = `now` when the exam is released), and add a `score_history` row with the comment as `note`.
  3. If nothing changes (same state, points and comment, no `newSuggestion`), write nothing and return the record.
  4. In state `released`, when the points changed or the record wasn't released before, add a `grade_changed` notice `{ taskId }` for that student in the same batch.

### 31. `review.confirmAll`: POST `/api/submissions/{submissionId}/confirm-all`

- **Response:** `ConfirmAllResponse`.
- **Errors:** `409 CONFLICT` unless the state is `closed` or `released`.
- **Rules:** confirm, at the suggested points, every record of the submission with `state` `suggested` and a suggestion. Leave records without a suggestion and records already confirmed unchanged. Write everything in one batch with the history rows, and in state `released` add one `grade_changed` notice when at least one record was confirmed.

### 32. `review.release`: POST `/api/exams/{examId}/release`

- **Response:** `ReleaseResponse`.
- **Errors:** `409 RELEASE_NOT_READY` when the exam is a practice exam, the state is neither `closed` nor `released`, or the exam isn't ready. `details`: `{ notChecked: number, notConfirmed: number }`.
- **Rules:**
  1. State `released`: return the stored `releasedAt` and change nothing.
  2. Ready means: every counted submission of every task, except tasks removed without bonus, has a check result and a confirmed record for every criterion of its task.
  3. In one batch: `exams.releaseQuery(db, examId, now)` (sets `phase` `released` and `released_at`), set `released_at` = `now` on every confirmed record of the exam's submissions, and add a `results_released` notice for all students.

### 33. `review.myResults`: GET `/api/exams/{examId}/my-results`

- **Response:** `MyResults`.
- **Rules:**
  1. State not `released`: `{ released: false, tasks: [], total: 0, max: 0, percent: 0, grade: null }`.
  2. Otherwise one entry per task of the final version, using the caller's counted submission. A criterion's `points`, `reason` and `comment` are shown only when its record has `released_at`; otherwise they are null.
  3. `total`, `max`, `percent`, `grade` come from `grade()` with released confirmed points only.
  4. Never return a suggestion, quotes, a hidden input, an expected output or test output (SEC-1).

---

## Test-only endpoints (EloRSL)

The Worker registers these only when `APP_ENV` is `test`; otherwise every path under `/api/test/` gives `404 NOT_FOUND`. They are not among the 33 but in a separate registry, `testEndpoints`, with `access: 'public'` and `scope: 'none'`, and they skip the Origin and session checks.

### T1. `test.clock`: POST `/api/test/clock`

- **Body:** `TestClockBody`. **Response:** `TestClockResponse`.
- **Rules:** sets the fake clock that every request and the cron read. `null` returns to the real clock.

### T2. `test.runJobs`: POST `/api/test/run-jobs`

- **Response:** `TestRunJobsResponse`.
- **Rules:** runs `exams.closeDueExams`, then claims and runs due jobs again and again until none is due (at most `LIMITS.jobsPerTestRun` jobs), using the fake clock.
