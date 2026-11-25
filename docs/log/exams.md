# Role log: exams (butarca)

What the exams code adds to the docs, and where it differs from them. Read it before you use anything from this module. Only butarca edits this file; Rok reviews every change. Rules and format: `conventions.md` G20 and section 11.

## Added

### Core lifecycle, student view, and grades
- Where: `packages/core/src/lifecycle.ts`, `studentView.ts`, and `grade.ts`, with their tests.
- What: Pure exam-state, student-safe view, and grade calculations using UTC milliseconds.
- Added: 2026-11-22, pull request #5

### Exams API and query functions
- Where: `apps/api/src/modules/exams/`; exports are in its `index.ts`.
- What: Exam CRUD, versioning, deadline closing, grading adjustments, CSV export, and scoped student reads; tests cover endpoint access and errors.
- Added: 2026-11-22, pull request #5

### Professor exam web module
- Where: `apps/web/src/modules/exams/`; routes are wired in `apps/web/src/App.tsx`.
- What: Professor list/editor with pagination, tabs, separate Markdown instructions/tips and starter code, student preview, grading indicators, time units, and Europe/Ljubljana settings.
- Added: 2026-11-22, pull request #5

## Changed

### Save feedback and unsaved editor changes
- Where: `apps/web/src/modules/exams/ExamsPage.tsx` and `ExamPage.tsx`.
- What: Exam creation, draft saves, and settings saves show green success or red failure feedback. The editor Back action prompts when settings or exercise changes are unsaved; confirming saves the exercise draft and discards unsaved settings.
- Added: 2026-11-25, pending review.

### CSV confirmed-score source
- Docs: `exams.gradesCsv` reads confirmed scores through `review.getConfirmedScores`.
- Code: The review module does not export that function yet, so CSV currently uses an empty confirmed-score list and reports zero totals.
- Why: The review module is not implemented in this checkout, so the role's documented empty-list stand-in remains in use.
- Added: 2026-11-22, pull request #5
