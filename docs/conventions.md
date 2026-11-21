# Conventions

How the team builds CodeMark, the AI-Assisted Programming Exam Platform: how to read these docs, who decides, who does what, the rules every change follows, the repository layout, the commands and the definition of done. Everyone reads this file before their first task.

## 1. How to read these docs

- **MUST** and **MUST NOT** are hard rules. **SHOULD** means do it unless a doc says otherwise. **MAY** means optional.
- Every rule has an ID, such as `G4` or `SEC-2`. Pull request descriptions name the IDs they implement or rely on.
- Terms have one meaning each, defined in `glossary.md`. Use the exact term and never a synonym: write "hidden-test check", never "re-run" or "verification".
- There are no diagrams. Every flow is written out as numbered steps in `flows.md`.
- If the docs don't say how to do something a task needs, stop. Don't invent an endpoint, a field, a table, a column, an error code, a job type, a notice kind or a library. Ask Rok, and leave that part undone until he answers. Anything else that is new or different inside your own module goes into your role log (G20).

## 2. Who decides

Rok is the PM and architect. He makes every scope and technical decision, and only he changes a contract, an ADR or these docs. The one exception is each role's own role log in `docs/log/` (G20). Anyone MAY suggest a change to Rok. Nothing changes because the team agrees to it.

## 3. When two documents disagree

Follow this order and report the conflict to Rok:

1. `docs/conventions.md`
2. `docs/adr/`
3. `docs/types.md` and `docs/api.md`
4. everything else

A role log (`docs/log/`) is merged only after Rok's review, so it describes that module's code as it is now. When a role log and another doc disagree about that module's own code, follow the role log and report it, so Rok can move it into the main docs. A role log never overrides a contract (G2).

## 4. Team and roles

| GitHub | Area | Role file | Then read |
| --- | --- | --- | --- |
| `EloRSL` (Rok, lead) | Foundation, accounts, jobs, notices, translations, deployment | `roles/foundation.md` | ADR-001, ADR-005 |
| `butarca` | Exam builder, exam lifecycle, grades, CSV | `roles/exams.md` | ADR-002, ADR-003 |
| `timursic2` | Student exam page, editor, code runner | `roles/student-page.md` | ADR-004 |
| `tzuntar` | Submissions, late work, hidden-test check (security lead) | `roles/submissions.md` | ADR-002, ADR-004 |
| `lukaazman` | AI grading | `roles/grading.md` | ADR-006, ADR-003 |
| `bjaksic84` | Review screen, release, results page | `roles/review.md` | ADR-003 |

Every role also reads `glossary.md`, `types.md`, and the sections of `api.md` and `internal-interfaces.md` its role file points to. The docs name people by their GitHub name. `.github/CODEOWNERS` uses the same names.

## 5. Global rules

These apply to every change, in every module.

| ID | Rule |
| --- | --- |
| G1 | TypeScript in strict mode everywhere. Exported functions and types MUST NOT use `any`. |
| G2 | Every request body, response, job payload, notice payload, runner message and AI message MUST use the types in `packages/contracts`, which match `docs/types.md` exactly. MUST NOT define these shapes anywhere else. MUST NOT change a contract to make your code work: stop and tell Rok. |
| G3 | A module writes only its own tables (see `docs/data-model.md`). Other modules use its public functions from its `index.ts`. A query MAY read another module's table in a join by importing the table from `apps/api/src/db/schema.ts`. MUST NOT write another module's table. |
| G4 | Only `stateOf` and `isOnTime` in `packages/core` decide an exam's state or whether a submission is on time. No other code compares the current time with exam times to decide those things. Comparing two given times (for example `closesAt` after `opensAt` in a schema) and the time checks written into the docs (session expiry, a job's `run_after`, storing a past closing time as now in `exams.updateSettings`) are allowed. API code MUST take the current time from the request context (`c.get('now')`) or the job context (`ctx.now`), never from `Date.now()` or `new Date()`, so tests can move the clock. ESLint enforces this in `apps/api/src`: `Date.now()`, `Date()` and `new Date()` without arguments are errors outside `clock.ts` and test files. `new Date(ms)` to format a stored time stays allowed. |
| G5 | Times are stored as UTC milliseconds (integers), sent as ISO 8601 UTC strings, and shown in the Europe/Ljubljana time zone. |
| G6 | IDs are UUIDs from `crypto.randomUUID()`. |
| G7 | MUST NOT send a hidden test's input, or any test's expected output, to a student. MUST NOT send any expected output to the runner or the AI. Every endpoint has a test that checks this (`SEC-1`). |
| G8 | Every route takes its access rule and scope from the endpoint registry in `packages/contracts`. A non-member gets `404 NOT_FOUND`, a member with the wrong role `403 FORBIDDEN`, and a signed-out caller `401 UNAUTHENTICATED`. |
| G9 | Every text a user sees comes from `apps/web/src/i18n/locales/sl.json` and `en.json`, which have the same keys. The API returns error codes, never user-facing text, and the app shows the translation stored under `errors.<CODE>`. |
| G10 | Errors MUST have the shape `{ "error": { "code": "<ErrorCode>", "message": "<English, for developers>" } }`, using only codes from `ErrorCode` in `docs/types.md`. |
| G11 | Writes that belong together go in one `db.batch()`. Every job handler MUST be safe to run twice with the same payload. |
| G12 | Every size or count limit comes from `LIMITS` in `packages/contracts`. MUST NOT hard-code a limit. |
| G13 | Student code runs only inside the runner site (`apps/runner`). MUST NOT run or `eval` student code in the app page or the Worker. |
| G14 | The AI is called only through the `AiProvider` interface. A `GradingRequest` MUST NOT contain a name, an email, an enrolment number, a user ID, a test input or an expected output. Local work and CI use the AI fake. |
| G15 | Each endpoint has tests for: the normal case, each error code it can return, a signed-out caller, a non-member and a member with the wrong role. Tests use the fake clock and the AI fake. |
| G16 | MUST NOT add a runtime dependency (code that ships to the browser, the Worker or the runner site) that isn't in the stack table in `docs/architecture.md` without Rok's approval. Dev-only tools that serve the stack (`@types/*`, `typescript-eslint`, ESLint and Prettier plugins, test helpers, a script runner for `pnpm dev`) MAY be added as dev dependencies; list them in the pull request. |
| G17 | Secrets go only in `.dev.vars` (local, never committed) and Cloudflare secrets (deployment). MUST NOT commit a secret or a real student's data. |
| G18 | Change only files your role owns (see `.github/CODEOWNERS` and your role file). Your role log in `docs/log/` counts as yours (G20). To change another role's files, open a pull request that their owner reviews. |
| G19 | Commits look like a person wrote them. MUST NOT spam commits: one commit per finished, working step, usually 1 to 5 per pull request, and a fix to your own unpushed commit is amended into it instead of added as a new one. Titles are short, plain sentences in the imperative, at most 60 characters, with no prefix (`feat:`, `fix(api):`, `chore:`), no tags in brackets, no emoji and no full stop at the end. A description is optional: only when the title isn't enough, one to three plain sentences on what changed and why, with no headings, no list of every file and no "This commit...". Pull request titles follow the same rule, because a squash merge turns them into the commit on `main`. Good: `Add the submit endpoint`, `Fix the countdown after a tab switch`. Bad: `feat(submissions): implement submission endpoint with retry key support`. |
| G20 | Every pull request that adds something other code or people can use, or makes the code differ from a doc, MUST record it in the author's role log (`docs/log/`) in the same pull request (section 11). Before using another module's functions, hooks or components, read that module's role log. |

## 6. Repository layout

```text
CodeMark/
  AGENTS.md, CLAUDE.md     local AI agent instructions; not in git (section 10)
  apps/
    web/                   React app (Vite); src/modules/<module>/ for each area
    api/                   Cloudflare Worker (Hono); src/modules/<module>/ for each area:
                           schema.ts (Drizzle tables), service.ts (logic),
                           routes.ts (endpoints), index.ts (public functions)
    runner/                runner site on Cloudflare Pages: runner page, Web Worker, Pyodide files
  packages/
    contracts/             zod schemas and types; matches docs/types.md and docs/api.md
    core/                  pure shared code: stateOf, isOnTime, the comparison rule, grade(),
                           runsPoints(), AI answer checks, demo fixtures
  e2e/                     Playwright tests, including the Gate 1 script
  docs/                    these documents; docs/log/ has one role log per role (G20)
  .github/                 CI workflows and CODEOWNERS
```

Every workspace package is named `@codemark/<folder>` (for example `@codemark/contracts`, `@codemark/core`, `@codemark/api`). Internal packages export their TypeScript source directly, with no build step; Vite and Wrangler compile them.

| Area | API module | Web module | Owner |
| --- | --- | --- | --- |
| Jobs, notices, status endpoint | `platform` | `src/lib` (API client, status hook) | EloRSL |
| Users, sessions, membership, access | `accounts` | `accounts` | EloRSL |
| Exams, versions, lifecycle, grades | `exams` | `exams` | butarca |
| Student exam page, editor, runner | (none) | `student`, `src/lib/runner`, `src/lib/editor`, plus `apps/runner` | timursic2 |
| Submissions, hidden-test check | `submissions` | `submissions` | tzuntar |
| AI grading | `grading` | `grading` | lukaazman |
| Score records, review, results | `review` | `review` | bjaksic84 |
| Shared UI components (shadcn/ui) | (none) | `src/components/ui/` | EloRSL; anyone adds a component with the shadcn CLI, EloRSL reviews |

## 7. Commands

EloRSL creates these in milestone 1. Until then, they are the plan.

| Command | What it does |
| --- | --- |
| `pnpm install` | install everything |
| `pnpm dev` | app on :5173, API on :8787, runner site on :5174, with a local database |
| `pnpm db:reset` | fresh local database with the demo data (`docs/demo-data.md`); stop `pnpm dev` first |
| `pnpm db:generate` | a new migration after you change a `schema.ts` |
| `pnpm cron` | one local cron run (closes due exams, runs up to 2 due jobs); needs `pnpm dev` running |
| `pnpm test` | unit tests and API tests (in the Workers runtime) |
| `pnpm e2e` | Playwright, including the Gate 1 script |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | what CI checks |
| `pnpm check:i18n` | fails if `sl.json` and `en.json` have different keys |
| `npx --yes shadcn@4.23.0 add <component>` | adds a shadcn/ui component, run inside `apps/web` (`pnpm dlx shadcn` fails in this workspace) |

## 8. Definition of done for every pull request

- [ ] It implements items from its role file and names their scope IDs (`S12`) and rule IDs.
- [ ] Typecheck, lint, formatting, tests and the translation check pass.
- [ ] Every new text is in both `sl.json` and `en.json`.
- [ ] A changed `schema.ts` comes with its generated migration. Applied migrations are never edited.
- [ ] No contract changed unless Rok changed it first in `docs/types.md` or `docs/api.md`.
- [ ] The tests your task lists exist and pass (G15).
- [ ] The Gate 1 script still passes.
- [ ] Commit titles, descriptions and the pull request title follow G19.
- [ ] Every addition others can use and every difference from the docs is in your role log (G20), or the pull request description says "Role log: nothing to add".
- [ ] A change to access rules, sessions, secrets, the hidden-test check or the runner site has a review from tzuntar.

## 9. Every document and what it answers

| File | Answers |
| --- | --- |
| `docs/glossary.md` | what each term means |
| `docs/scope.md` | what Part 1 includes (S1 to S43, Core items marked), what it excludes, and the milestones |
| `docs/architecture.md` | the stack, decisions D1 to D28, limits, security rules, environments, failure handling |
| `docs/data-model.md` | every table, column, constraint and owner |
| `docs/types.md` | every shared type: exam content, API bodies and responses, errors, jobs, notices, runner, AI |
| `docs/api.md` | all 33 endpoints: access, body, response, errors and rules |
| `docs/internal-interfaces.md` | the functions modules call on each other, job and notice rules, the runner protocol, the AI interface, the cron |
| `docs/flows.md` | the exam lifecycle and every main flow as numbered steps |
| `docs/adr/` | the six architecture decisions and the rules that follow from them |
| `docs/conventions.md` | how to read the docs, who decides, the team, global rules, layout, commands, definition of done |
| `docs/roles/` | each role's tasks, inputs, outputs, stand-ins, tests and definition of done (section 4) |
| `docs/gate1.md` | the Gate 1 script step by step, with expected results |
| `docs/demo-data.md` | the demo accounts, exams and submissions the seed creates |
| `docs/log/` | what each role's code adds to the other docs and where it differs from them (G20, section 11) |

## 10. What is not in git

AI agent instructions stay on each person's computer and are listed in `.gitignore`:

```gitignore
# AI agent instructions (local only)
AGENTS.md
CLAUDE.md
CLAUDE.local.md
.claude/
```

Everything in `docs/` is planning and system design and is committed. Rok sends the current `AGENTS.md` and `CLAUDE.md` to the team; each person copies them into the root of their clone. They hold no rules of their own: every rule is in `docs/`, so a change to the rules is a normal commit.

## 11. Role logs (G20)

Each role has one role log in `docs/log/`, named like its role file: `foundation.md`, `exams.md`, `student-page.md`, `submissions.md`, `grading.md`, `review.md`. It tells the other roles and their agents what the code adds to the docs and where it differs from them. You edit only your own role log; this is the one file in `docs/` you MAY change. Rok reviews every change to `docs/` (CODEOWNERS), so a merged entry is approved. From time to time Rok moves entries into the main docs and deletes them from the log.

**What needs an entry**

- **Added:** something another module, page or person can use or needs to know. For example: a function or type exported from a module's `index.ts`, a hook or component other pages may import, an environment variable, a command or script, a dev dependency (G16), a translation key other modules reuse, or a file or folder others must follow. Code used only inside your module needs no entry.
- **Changed:** your code does something different from a doc, or leaves a step of a task undone, because the doc can't be followed as written: it doesn't work, it's impossible, or two docs disagree. Preferring another way is not a reason; ask Rok instead.

**What an entry can't do**

An entry never replaces Rok's approval for what section 1 and G2 reserve to him: a contract, endpoint, field, table, column, error code, job type, notice kind or library. For those, stop and ask.

**Format**

Newest entry first in its section, one entry per item, at most five lines. The entry below only shows the format; it is not a real entry.

```markdown
## Added

### `exampleFormat(points: number, locale: string): string`
- Where: `apps/web/src/modules/example/format.ts`, exported from the module's `index.ts`.
- What: formats points with one decimal and the locale's decimal sign.
- Added: 2026-11-24, pull request #18.

## Changed

### `flows.md` section 2, step 3 (example)
- Docs: save at most once every 2 seconds while typing.
- Code: saves at most once every 5 seconds.
- Why: at 2 seconds, a full-size draft went over the D1 write limit in the limits test.
- Added: 2026-11-25, pull request #21.
```
