# bjaksic84: Review and results

**Goal:** keep every score safe from suggestion to release, make confirming fast, and show students clear results.

**Read first:** `conventions.md`, `glossary.md`, `data-model.md` (score_records, score_history), `types.md` (api/review), `api.md` (#28 to #33), `internal-interfaces.md` (section 3 review, section 5), `flows.md` (7, 8, 9), ADR-003, ADR-002.

## You own

| Kind | What |
| --- | --- |
| API | `apps/api/src/modules/review/` |
| Web | `apps/web/src/modules/review/`: review screen, queue with filters, confirm controls, history, release; the student results page |
| Tables | `score_records`, `score_history` |
| Endpoints | #28 to #33 |

## You provide

| What | To | By |
| --- | --- | --- |
| `suggest` (stub that writes rows) | lukaazman | M1 |
| `suggest` with every rule in ADR-003 | lukaazman | M2 |
| `getConfirmedScores` | butarca (CSV) | M2 |
| `scoreRecordExamId` (the scope resolver, wired in `app.ts`) | EloRSL (access checks) | M2 |

## You use

| What | From | Until it exists |
| --- | --- | --- |
| `getCountedSubmissions`, `getCheckResult`, `getSubmission` | tzuntar | demo data rows |
| `HiddenTestCheck` | tzuntar | a placeholder that says "checking" |
| `getFinalVersion`, `getTaskAdjustments`, `releaseQuery`, `grade()` | butarca | M1, M2 |
| `CodeEditor` read-only with `highlightLines` | timursic2 | a `<pre>` with line numbers |
| `notifyQuery`, `listStudentMembers`, `getUserNames` | EloRSL | M1 |
| `grading.aiStatus` panel | lukaazman | hide it |

## Tasks in order

### M1, by 2026-11-29

1. `score_records`, `score_history` tables; `suggest` writing one batch.

### M2, by 2026-12-06

2. `suggest` with every write rule (new suggestion on a confirmed record sets `new_suggestion` only).
3. `review.queue`, `review.submission`, `review.confirm`, `review.confirmAll`, `review.release`, `review.myResults` with their rules; `getConfirmedScores`.

### M3, by 2026-12-18 (Core)

4. Review screen (S32, S33, S34): `HiddenTestCheck` at the top, then the queue with filters; per submission: code with quoted lines highlighted, each criterion with suggested points, reason, flag, confirm or change with comment, "Accept all", "Next".
5. Release button with the not-ready counts from `RELEASE_NOT_READY` (S36).
6. Results page (S38): per task the check (passed of total), per criterion points, reason and comment, total, percent, grade, and the label "Suggested by AI, confirmed by your professor".

### M4, by 2026-12-23

7. Source labels (AI, tests, professor) and the history list (S35).

## Tests you write

- A late suggestion never changes a confirmed record's points or state, and sets `newSuggestion` (ADR-003).
- Confirm: kept points, changed points, out of range, no suggestion without points, no-op, after release (notice and `released_at`).
- Release: each not-ready case, removed tasks, idempotent second call, notice.
- `review.myResults` before and after release; no suggestion, quote or test output in a student response (SEC-1).

## MUST NOT

- Let anything but `review.confirm` and `review.confirmAll` change confirmed points.
- Show a suggestion, quote, check output or unreleased score to a student.
- Store a grade.

## Done when

A professor can review a whole class and release the grades, students see clear results, and only the professor can change a confirmed score.
