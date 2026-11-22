# Role log: exams (butarca)

What the exams code adds to the docs, and where it differs from them. Read it before you use anything from this module. Only butarca edits this file; Rok reviews every change. Rules and format: `conventions.md` G20 and section 11.

## Added

### `stateOf`, `isOnTime`, `buildStudentView`, `grade`
- Where: `packages/core/src/lifecycle.ts`, `studentView.ts`, `grade.ts`; exported by `packages/core/src/index.ts`.
- What: Pure exam lifecycle, student-view, and grade calculations with UTC millisecond inputs.
- Added: 2026-11-22.

### Exams public API and query functions
- Where: `apps/api/src/modules/exams/`; exports in `apps/api/src/modules/exams/index.ts`.
- What: Exam CRUD, draft/version operations, closing, task adjustments, and CSV export; exports `getExam`, `getExamState`, `getVersion`, `getFinalVersion`, `getTaskAdjustments`, `closeDueExams`, and `releaseQuery`.
- Added: 2026-11-22.

### Professor exam web module
- Where: `apps/web/src/modules/exams/ExamsPage.tsx`, `ExamPage.tsx`, and `ExamLayout.tsx`; routes are wired in `apps/web/src/App.tsx`.
- What: Professors see a bordered, searchable, sortable exam list with 5/10/20-item pagination and a minimum-height results area at `/`; `/exams/:examId` renders within `ExamLayout`. The add-exam form is collapsible. The editor places collapsible general settings and versions above the exercise editor in one column, with the exercise list in a parallel column. It shows one task per tab and selects new tasks immediately. Version adjustment controls are vertically aligned and use colored, accessible dots to show normal, bonus-only, or excluded grading. Resizable textareas are capped at 16rem and scroll internally; solving time can be entered in milliseconds or seconds while retaining the existing 1–10 second limit. Preview is a separate `/exams/:examId/preview` page that displays the current draft as Markdown and returns to the preserved editor state. The single Markdown prompt preserves legacy tips and starter code under headings; grading adjustments use titles from the final published version instead of IDs. Back confirms before discarding unsaved draft or settings edits. Students retain the temporary home page at `/`.
- Added: 2026-11-22.

## Changed

### CSV confirmed-score source
- Docs: `exams.gradesCsv` reads confirmed scores through `review.getConfirmedScores`.
- Code: The review module does not exist yet, so CSV currently uses an empty confirmed-score list and reported totals are zero.
- Why: This follows the role stand-in: use an empty list until bjaksic84 exports `review.getConfirmedScores`.
- Added: 2026-11-22.
