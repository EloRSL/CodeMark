# Role log: review and results (bjaksic84)

What the review and results code adds to the docs, and where it differs from them. Read it before you use anything from this module. Only bjaksic84 edits this file; Rok reviews every change. Rules and format: `conventions.md` G20 and section 11.

## Added

### `getConfirmedScores` (stand-in) and `scoreRecordExamId` (stub) until M2
- Where: `apps/api/src/modules/review/service.ts`, exported from the module's `index.ts` with the signatures in `internal-interfaces.md`.
- What: `getConfirmedScores` returns `[]`, the stand-in the exams CSV already uses. `scoreRecordExamId` throws and isn't wired in `app.ts`. Both need the submissions table and are built in M2.
- Added: 2026-11-25, pull request #7.

### `suggest(db, input, now)`: what the M1 version does
- Where: `apps/api/src/modules/review/service.ts`, exported from the module's `index.ts`.
- What: one read and one `db.batch()` per call. A record whose suggestion columns wouldn't change gets no write and no history row, so the same call twice adds nothing (G11). A confirmed record keeps its points and state and gets `newSuggestion` (ADR3-2). Throws before writing when a suggestion fails `ScoreSuggestion` or a criterion repeats.
- Not yet: the check that every criterion is in the final version (M2, with `getFinalVersion`).
- Added: 2026-11-25, pull request #7.

## Changed

Nothing yet.
