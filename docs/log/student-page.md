# Role log: student exam page, editor and runner (timursic2)

What the student exam page, editor and runner code adds to the docs, and where it differs from them. Read it before you use anything from this module. Only timursic2 edits this file; Rok reviews every change. Rules and format: `conventions.md` G20 and section 11.

## Added

### Runner client recovery
- Docs: `internal-interfaces.md` sections 5 and 6.
- Code: the client waits for the iframe ready message without a startup deadline.
- Why: the iframe startup timeout is not specified and needs agreement with Rok.
- Added: 2026-11-28, pending review.

## Changed

Nothing yet.
