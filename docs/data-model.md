# Data model

One D1 database with 15 tables. Each table has one owner module, and only that module's code writes it (G3).

Conventions:

- **DM-1.** SQL names are snake_case. Drizzle field names are camelCase (`enrolment_no` becomes `enrolmentNo`).
- **DM-2.** Times are `integer` UTC milliseconds (D13). Booleans are `integer` 0 or 1 (Drizzle `integer({ mode: 'boolean' })`). JSON is `text` (Drizzle `text({ mode: 'json' })`), validated with the zod schema named in the table on every read and write.
- **DM-3.** IDs are `text` UUIDs (D14), except `notices.id`, which is an autoincrement integer used as a cursor.
- **DM-4.** Each module defines its tables in `apps/api/src/modules/<module>/schema.ts`. `apps/api/src/db/schema.ts` re-exports all of them for joins.
- **DM-5.** Every schema change comes with a migration from `drizzle-kit generate`. An applied migration is never edited.
- **DM-6.** No foreign key constraints between tables of different modules, so modules can be built and tested in any order. Code keeps references valid.
- **DM-7.** The exam state is never stored. `stateOf()` computes it from `phase`, `opens_at`, `closes_at`, `closed_at` and `practice`.

## Owners at a glance

| Owner | Module | Tables |
| --- | --- | --- |
| EloRSL | accounts | `users`, `oauth_accounts`, `sessions`, `exam_members`, `class_list` |
| EloRSL | platform | `jobs`, `notices` |
| butarca | exams | `exams`, `exam_versions`, `task_adjustments` |
| tzuntar | submissions | `submissions`, `hidden_results` |
| lukaazman | grading | `ai_requests` |
| bjaksic84 | review | `score_records`, `score_history` |

## accounts (EloRSL)

### users

| Column | Type | Rules |
| --- | --- | --- |
| id | text | primary key |
| email | text | not null, unique, stored lowercase |
| name | text | not null, from the OAuth profile or the demo seed |
| role | text | not null, `professor` or `student` (SEC-11) |
| enrolment_no | text | null, 8 digits; the student's default, copied when joining |
| locale | text | not null, `sl` or `en`, default `sl` |
| demo | integer | not null, default 0; 1 only for seeded demo users |
| created_at | integer | not null |

Readers: every module that shows a name (submissions, review, exams CSV).

### oauth_accounts

| Column | Type | Rules |
| --- | --- | --- |
| provider | text | `google` or `github` |
| provider_user_id | text | the provider's stable user ID |
| user_id | text | not null |
| created_at | integer | not null |

Primary key `(provider, provider_user_id)`.

### sessions

| Column | Type | Rules |
| --- | --- | --- |
| token_hash | text | primary key, SHA-256 hex of the cookie token |
| user_id | text | not null, indexed |
| created_at | integer | not null |
| expires_at | integer | not null, `created_at + LIMITS.sessionMs` |

### exam_members

| Column | Type | Rules |
| --- | --- | --- |
| exam_id | text | not null |
| user_id | text | not null |
| role | text | `professor` or `student` |
| enrolment_no | text | null for the professor, 8 digits for a student |
| joined_at | integer | not null |

Primary key `(exam_id, user_id)`. Unique `(exam_id, enrolment_no)` (SQLite allows many nulls). Index `(user_id)`.

The professor who creates an exam becomes its only professor member. Part 1 has one professor per exam.

Readers: every module, through `accounts` functions or joins.

### class_list

| Column | Type | Rules |
| --- | --- | --- |
| exam_id | text | not null |
| enrolment_no | text | not null, 8 digits |

Primary key `(exam_id, enrolment_no)`. No rows for an exam means there is no class list.

## platform (EloRSL)

### jobs

| Column | Type | Rules |
| --- | --- | --- |
| id | text | primary key |
| type | text | a `JobType` |
| payload | text (JSON) | validated with `JobPayloads[type]` |
| status | text | `queued`, `running`, `done`, `failed` |
| attempts | integer | not null, default 0; counts started attempts, except budget waits |
| run_after | integer | not null; the earliest time it may run |
| locked_until | integer | null; set while running |
| last_error | text | null |
| dedupe_key | text | not null, unique |
| created_at | integer | not null |
| updated_at | integer | not null |

Index `(status, run_after)`. Readers: grading (counts for `ai-status`).

### notices

| Column | Type | Rules |
| --- | --- | --- |
| id | integer | primary key, autoincrement; the polling cursor |
| exam_id | text | not null |
| user_id | text | null means every student member of the exam (not the professor) |
| kind | text | a `NoticeKind` |
| payload | text (JSON) | validated with `NoticePayloads[kind]` |
| created_at | integer | not null |

Index `(exam_id, id)`.

## exams (butarca)

### exams

| Column | Type | Rules |
| --- | --- | --- |
| id | text | primary key |
| title | text | not null, 1 to 200 characters |
| join_code | text | not null, unique, uppercase |
| opens_at | integer | not null |
| closes_at | integer | null only when `practice` is 1; otherwise greater than `opens_at` |
| phase | text | `draft`, `published`, `released` |
| practice | integer | not null, default 0; never changes after creation |
| settings | text (JSON) | `ExamSettings` |
| draft | text (JSON) | `ExamContent`; read only by the professor's editor, publish and new version (CAP-5) |
| current_version | integer | not null, default 0; 0 means not published |
| closed_at | integer | null; set once by the cron (ADR-002) |
| released_at | integer | null; set once by release |
| created_by | text | not null, the professor's user ID |
| created_at | integer | not null |
| updated_at | integer | not null |

Join code format: 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, stored and shown as `XXXX-XXXX`. Demo exams use fixed codes (`docs/demo-data.md`). Joining compares the code after trimming and uppercasing.

Readers: every module, through `exams` functions.

### exam_versions

| Column | Type | Rules |
| --- | --- | --- |
| exam_id | text | not null |
| version | integer | not null, from 1 |
| snapshot | text (JSON) | `ExamContent`, everything including hidden tests and expected outputs |
| student_view | text (JSON) | `StudentExamView`, made by `buildStudentView(snapshot)` |
| note | text | not null; empty for version 1, the professor's note otherwise |
| created_at | integer | not null |

Primary key `(exam_id, version)`. Rows are never updated or deleted. The **final version** is `exams.current_version` once the exam is closed.

### task_adjustments

| Column | Type | Rules |
| --- | --- | --- |
| exam_id | text | not null |
| task_id | text | not null |
| removed | integer | not null |
| keep_as_bonus | integer | not null; meaningful only when `removed` is 1 |
| decided_by | text | not null |
| decided_at | integer | not null |

Primary key `(exam_id, task_id)`. No row means the task counts normally.

## submissions (tzuntar)

### submissions

| Column | Type | Rules |
| --- | --- | --- |
| id | text | primary key |
| exam_id | text | not null |
| task_id | text | not null |
| student_id | text | not null |
| version | integer | not null; the version the student was looking at |
| code | text | not null, at most `LIMITS.codeBytes` |
| sha256 | text | not null, 64 lowercase hex characters, of the code's UTF-8 bytes |
| arrived_at | integer | not null; the server's `now` when the request arrived |
| late | integer | not null; `!isOnTime(exam, arrived_at)` |
| late_decision | text | null when not late; `pending`, `accepted`, `rejected` when late |
| late_decided_by | text | null |
| late_decided_at | integer | null |
| retry_key | text | not null |

Unique `(student_id, retry_key)`. Index `(exam_id, task_id, student_id, arrived_at)`. Rows are never deleted; only the `late_decision` columns change.

**Counted submission** (`getCountedSubmissions`): for each student and each task in the final version, the latest accepted late submission if there is one, otherwise the latest on-time submission. Practice exams have none. Rejected and pending late submissions never count.

### hidden_results

| Column | Type | Rules |
| --- | --- | --- |
| submission_id | text | primary key; one check per submission |
| version | integer | not null; the final version it ran against |
| results | text (JSON) | `StoredTestResult[]`, one per hidden test in the version's order |
| passed | integer | not null |
| total | integer | not null |
| checked_by | text | not null, the professor's user ID |
| created_at | integer | not null |

Written only by `POST /api/exams/{examId}/recheck` (S22). Readers: review (check results), grading (check summary).

## grading (lukaazman)

### ai_requests

| Column | Type | Rules |
| --- | --- | --- |
| id | text | primary key |
| exam_id | text | not null |
| submission_id | text | null for trial grading |
| kind | text | `grade` or `trial` |
| model | text | not null; `fake` for the fake |
| prompt_version | integer | not null |
| attempt | integer | not null; 1, or 2 for the retry with the error attached |
| input_tokens | integer | not null, 0 if unknown |
| output_tokens | integer | not null, 0 if unknown |
| neurons | real | not null; 0 for the fake |
| status | text | `ok` (answer passed the checks), `invalid` (answer failed the checks), `error` (the call failed) |
| error | text | null |
| latency_ms | integer | not null |
| created_at | integer | not null |

Index `(created_at)`. Neurons used today = sum of `neurons` where `created_at >=` 00:00 UTC today, over all exams.

## review (bjaksic84)

### score_records

| Column | Type | Rules |
| --- | --- | --- |
| id | text | primary key |
| submission_id | text | not null |
| criterion_id | text | not null |
| state | text | `suggested` or `confirmed` |
| points | real | null until confirmed; the confirmed points, a multiple of 0.5 |
| suggested_points | real | null when there is no suggestion (manual grading) |
| reason | text | null; the suggestion's reason |
| quotes | text (JSON) | null; `AiQuote[]` |
| source | text | null; `ai` or `tests` |
| flagged | integer | not null, default 0; 1 when a quote was dropped because it didn't match the code |
| ai_request_id | text | null |
| new_suggestion | integer | not null, default 0 |
| comment | text | null; the professor's latest comment, shown to the student |
| confirmed_by | text | null |
| confirmed_at | integer | null |
| released_at | integer | null; set on release, or at confirmation when the exam is already released |
| updated_at | integer | not null |

Unique `(submission_id, criterion_id)`. A record exists only for criteria of the final version.

Write rules (ADR-003):

- `suggest` inserts a record as `suggested`, or replaces only `suggested_points`, `reason`, `quotes`, `source`, `flagged`, `ai_request_id` and `updated_at`. On a `confirmed` record it also sets `new_suggestion = 1` and never touches `points` or `state`. A record whose six suggestion columns wouldn't change gets no write and no history row, so the same suggestion arriving again changes nothing, not even `new_suggestion`.
- `confirm` sets `state = confirmed`, `points`, `comment`, `confirmed_by`, `confirmed_at`, clears `new_suggestion`, and sets `released_at` when the exam is released.
- A record is **released** when `released_at` is not null. Students see only released records.

### score_history

| Column | Type | Rules |
| --- | --- | --- |
| id | text | primary key |
| score_record_id | text | not null, indexed |
| old_points | real | null |
| new_points | real | null |
| old_state | text | null for a new record |
| new_state | text | not null |
| actor_id | text | null when the AI or the tests made the change |
| at | integer | not null |
| note | text | null; `ai` or `tests` for suggestions, the professor's comment for confirmations |

One row for every insert or change of a score record, in the same batch as the change. For suggestions, `old_points` and `new_points` are the old and new suggested points. For confirmations, they are the old and new confirmed points.
