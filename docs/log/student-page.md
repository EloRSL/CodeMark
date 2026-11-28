# Role log: student exam page, editor and runner (timursic2)

What the student exam page, editor and runner code adds to the docs, and where it differs from them. Read it before you use anything from this module. Only timursic2 edits this file; Rok reviews every change. Rules and format: `conventions.md` G20 and section 11.


## Added

### Runner startup benchmark
- Where: `e2e/runner.spec.ts`.
- What: measures fresh interpreter startup; local Chromium median 1.776 s over five runs.
- Added: 2026-11-28, pending review.

## Changed

### Runner network isolation
- Docs: `internal-interfaces.md` section 6, step 10.
- Code: CSP blocks cross-origin connections but permits same-origin requests to the runner site.
- Why: SEC-7 requires `connect-src 'self'`; complete network and persistent-storage isolation need security review.
- Added: 2026-11-28, pending review.

