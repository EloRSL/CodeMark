# ADR-001: Modular monolith and module ownership

**Status:** Accepted · **Owner:** EloRSL · **Affects:** everyone

## Decision

CodeMark is one frontend and one backend on one database, split into modules. Each module belongs to one role and owns its tables.

| Module | Owner | Owns (tables) | Offers |
| --- | --- | --- | --- |
| `accounts` | EloRSL | `users`, `oauth_accounts`, `sessions`, `exam_members`, `class_list` | the current user, membership, access checks |
| `platform` | EloRSL | `jobs`, `notices`; the translation files | `enqueue`, `notify`, the status endpoint (ADR-005) |
| `exams` | butarca | `exams`, `exam_versions`, `task_adjustments` | exam state (ADR-002), versions, `grade` (ADR-003) |
| exam page | timursic2 | nothing on the server | the runner and the comparison rule (ADR-004) |
| `submissions` | tzuntar | `submissions`, `hidden_results` | counted submissions, check results |
| `grading` | lukaazman | `ai_requests` | score suggestions through the AI interface (ADR-006) |
| `review` | bjaksic84 | `score_records`, `score_history` | `suggest`, `confirm`, `release` (ADR-003) |

## Rules

- **ADR1-1.** A module's tables are written only by that module's code (G3).
- **ADR1-2.** Other modules call only what a module's `index.ts` exports (`internal-interfaces.md`). ESLint fails an import that reaches past another module's `index.ts`.
- **ADR1-3.** Dependency order: `platform`, `accounts`, `exams`, `submissions`, `review`, `grading`. A module's service code calls only modules earlier in this list. Route handlers may call any module. The cron and the job handlers are wired in `apps/api/src/app.ts` (`architecture.md` A-4).
- **ADR1-4.** The API between the browser and the Worker is defined once, in `packages/contracts` (`types.md`, `api.md`). Only Rok changes it.
- **ADR1-5.** `.github/CODEOWNERS` sends every change in a module's folders to its owner for review.

## Do not build

- A separate service per module (rejected: six deployments, network calls between them, free-tier limits on the number of services).
- One module with no boundaries (rejected: everyone edits every table, and the Part 2 handover has no clear lines).

## Consequences

- Building in parallel against stand-ins works, and each change has a clear reviewer.
- A screen that needs data from several modules (the review screen) calls several functions instead of one query.
- Part 2's server sandbox runs as a separate process on a faculty VM, behind the runner contract (ADR-004).

## Action items

| Item | Who | By |
| --- | --- | --- |
| One folder per module in `apps/api/src/modules` and `apps/web/src/modules` | EloRSL | M1 |
| `.github/CODEOWNERS` (GitHub usernames from Rok) | EloRSL | M1 |
| The ESLint import rule for ADR1-2 | EloRSL | M1 |
| Each module's `index.ts` with the signatures from `internal-interfaces.md`, stubbed | each owner | M1 |
