# butarca: Exam builder and grades

**Goal:** let the professor create and change an exam, keep its timeline, and turn confirmed points into grades.

**Read first:** `conventions.md`, `glossary.md`, `data-model.md` (exams), `types.md` (`exam.ts`, `examContent.ts`, `api/exams.ts`), `api.md` (#11 to #19), `internal-interfaces.md` (section 2 `lifecycle.ts`, `grade.ts` and `studentView.ts`; section 3 exams), `flows.md` (sections 1, 2, 4, 5, 9, 10), ADR-002, ADR-003.

**AI agents:** if you work with an AI agent, it MUST read `AGENTS.md` in the repository root before it starts any task (`conventions.md` section 10).

## You own

| Kind | What |
| --- | --- |
| Core | `packages/core/src/lifecycle.ts`, `grade.ts`, `studentView.ts` and their tests |
| API | `apps/api/src/modules/exams/` |
| Web | `apps/web/src/modules/exams/`: the professor's exam list, create form, editor, settings, preview, versions, task adjustments, CSV button |
| Tables | `exams`, `exam_versions`, `task_adjustments` |
| Endpoints | #11 to #19 |

## You provide

| What | To | By |
| --- | --- | --- |
| `stateOf`, `isOnTime` with edge-case tests | everyone | M1 (first, before any page) |
| `getExam`, `getExamState`, `getVersion`, `getFinalVersion`, `getTaskAdjustments` | EloRSL, tzuntar, lukaazman, bjaksic84 | M1 |
| `exams.create`, `exams.get`, `exams.saveDraft`, `exams.publish` | EloRSL (limits test), timursic2 | 2026-11-27 |
| `buildStudentView` | you (`exams.get` for students, the preview) | M1 |
| `closeDueExams`, `releaseQuery` | EloRSL (cron), bjaksic84 (release) | M2 |
| `grade()` with table tests | bjaksic84, you (CSV) | M2 |

## You use

| What | From | Until it exists |
| --- | --- | --- |
| `addMemberQuery`, `notifyQuery`, `implement` | EloRSL | M1 |
| `CodeEditor` for starter code and tests | timursic2 | a plain `<textarea>` |
| `grading.trial` for the preview button | lukaazman | hide the button |
| `review.getConfirmedScores` for the CSV | bjaksic84 | an empty list |

## Tasks in order

### M1, by 2026-11-29

1. `lifecycle.ts` with the tests in ADR-002 (S9 depends on it).
2. The exams module's tables (`exams`, `exam_versions`, `task_adjustments`) and their migrations; `exams.create`, `exams.list`, `exams.get` (for both roles), `exams.saveDraft`, `exams.publish`; `buildStudentView` with its leak test. Deliver `exams.create`, `exams.get`, `exams.saveDraft` and `exams.publish` by 2026-11-27 for the limits test.
3. The `index.ts` functions due in M1 under "You provide": `getExam`, `getExamState`, `getVersion`, `getFinalVersion`, `getTaskAdjustments`.

### M2, by 2026-12-06

4. `grade()` with table tests (S39).
5. `exams.updateSettings` with every rule in `api.md` #15 (S7, S8, S9); `exams.newVersion`; `closeDueExams`; `releaseQuery`.
6. A first editor page: tasks, criteria, tests, save.

### M3, by 2026-12-15 (Core)

7. Complete editor (S6): up to 10 tasks; instructions and tips in Markdown with a preview (SEC-9); criteria with kind and points in steps of 0.5; public and hidden tests; time limit; "Add task" creates a valid task (one "ai" criterion "Correctness", 1 point, default time limit). Show the schema's errors next to the fields.
8. Settings page (S7, S8), "Close now" and changing the closing time (S9). The Publish button.

### M4, by 2026-12-18

9. Preview as students see it, with a trial grading button per task (S10).
10. Changing a task during the exam, with a note (S24), and the versions list.
11. Removing a task, with the bonus choice (S26) and the `grade_changed` notice after release (S27).
12. CSV export (S37).
13. "Practice exam" option in the create form (S11).

## Tests you write

- `stateOf`: every step of the algorithm (`internal-interfaces.md` section 2), both sides of each boundary, a practice exam.
- `grade()`: points and percent scales, a removed task with and without bonus, the cap at 10, a value exactly on a threshold, no confirmed points.
- Every endpoint: each rule and error in `api.md` #11 to #19, plus G15.
- `exams.get` and `buildStudentView` as a student: no hidden test's input or expected output anywhere (SEC-1).
- CSV: BOM, separator, decimal comma, quoting, the `'` before a formula character, both header languages.

## MUST NOT

- Store a grade or an exam state anywhere.
- Read `draft` or `snapshot` in a request made by a student (CAP-5).
- Allow `closesAt` to change when the exam is Closed or Released, or let a practice exam close.
- Change an `exam_versions` row after inserting it.

## Done when

A professor can build, preview, publish and change an exam, every deadline edge case passes its test, and grades come out right for every scale.
