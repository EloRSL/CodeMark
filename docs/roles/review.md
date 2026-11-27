# bjaksic84: Review and results

**Goal:** keep every score safe from suggestion to release, make confirming fast, and show students clear results.

**Read first:** `conventions.md`, `glossary.md`, `data-model.md` (`score_records`, `score_history`), `types.md` (`api/review.ts`), `api.md` (#28 to #33), `internal-interfaces.md` (section 3 review; section 5), `flows.md` (sections 7, 8, 9), ADR-003, ADR-002.

**AI agents:** if you work with an AI agent, it MUST read `AGENTS.md` in the repository root before it starts any task (`conventions.md` section 10).

## You own

| Kind | What |
| --- | --- |
| API | `apps/api/src/modules/review/` |
| Web | `apps/web/src/modules/review/`: the review screen, queue with filters, confirm controls, history, release; the student results page |
| Tables | `score_records`, `score_history` |
| Endpoints | #28 to #33 |

## You provide

| What | To | By |
| --- | --- | --- |
| `suggest` (stub that writes rows) | lukaazman | M1 |
| `suggest` with every rule in ADR-003 | lukaazman | M2 |
| `getConfirmedScores` | butarca (CSV) | M2 |
| `scoreRecordExamId` (the scope resolver, wired in `app.ts`) | EloRSL (access checks) | M2 |
| Rater B's scores for the quality test (ADR-006) | lukaazman | M3 |

## You use

| What | From | Until it exists |
| --- | --- | --- |
| `getCountedSubmissions`, `getCheckResult`, `getSubmission` | tzuntar | demo data rows from the seed |
| `HiddenTestCheck` | tzuntar | a placeholder that says "checking" |
| `getFinalVersion`, `getTaskAdjustments`, `releaseQuery`, `grade()` | butarca | M1 (`getFinalVersion`, `getTaskAdjustments`), M2 (`releaseQuery`, `grade()`) |
| `CodeEditor` read-only with `highlightLines` | timursic2 | a `<pre>` with line numbers |
| `notifyQuery`, `listStudentMembers`, `getUserNames` | EloRSL | M1 |
| `grading.aiStatus` panel | lukaazman | hide it |

## Tasks in order

### M1, by 2026-11-29

1. The `score_records` and `score_history` tables; `suggest` writing everything in one batch.

### M2, by 2026-12-06

2. `suggest` with every write rule (a new suggestion on a confirmed record sets `new_suggestion` and never changes `points` or `state`).
3. `review.queue`, `review.submission`, `review.confirm`, `review.confirmAll`, `review.release`, `review.myResults` with their rules; `getConfirmedScores`.

### M3, by 2026-12-15 (Core)

4. Review screen (S32, S33, S34): `HiddenTestCheck` at the top, then the queue with filters. For each submission: the code with the quoted lines highlighted; each criterion with its suggested points, reason and flag, and controls to confirm or change the points with a comment; "Accept all"; "Next".
5. The Release button with the not-ready counts from `RELEASE_NOT_READY` (S36).
6. Results page (S38): for each task, the check result (passed of total); for each criterion, the points, reason and comment; the total, percent and grade; and the label "Suggested by AI, confirmed by your professor".
7. Score the quality-test samples as rater B (`apps/api/src/modules/grading/quality/`, ADR-006) without looking at lukaazman's scores, then agree the reference scores with lukaazman.

### M4, by 2026-12-18

8. Source labels (AI, tests, professor) and the history list (S35).

## Tests you write

- A suggestion that arrives after confirmation never changes the confirmed record's points or state, and sets `newSuggestion` (ADR-003).
- `review.confirm`: kept points, changed points, out of range, no suggestion without points, no-op, after release (notice and `released_at`).
- `review.release`: each not-ready case, removed tasks, an idempotent second call, the notice.
- `review.myResults` before and after release; no suggestion, quote or test output in a student response (SEC-1).

## MUST NOT

- Let anything but `review.confirm` and `review.confirmAll` change confirmed points.
- Show a suggestion, quote, check output or unreleased score to a student.
- Store a grade.

## Done when

A professor can review a whole class and release the grades, students see clear results, and only the professor can change a confirmed score.
