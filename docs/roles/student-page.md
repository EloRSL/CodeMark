# timursic2: Student exam page and code runner

**Goal:** give students a calm, reliable place to write and submit code, and give the team one trustworthy runner.

**Read first:** `conventions.md`, `glossary.md`, `types.md` (`runner.ts`, `examContent.ts`, `api/exams.ts`, `api/submissions.ts`, `api/platform.ts`), `api.md` (#13, #20, #21), `internal-interfaces.md` (section 2 `compare.ts`; section 5; section 6), `flows.md` (sections 3, 4, 5, 10), ADR-004, ADR-002, `architecture.md` SEC-6 to SEC-9.

**AI agents:** if you work with an AI agent, it MUST read `AGENTS.md` in the repository root before it starts any task (`conventions.md` section 10).

## You own

| Kind | What |
| --- | --- |
| Runner site | `apps/runner/` (runner page, Web Worker, pinned Pyodide files, `_headers`) |
| Core | `packages/core/src/compare.ts`, `compare.cases.json` (with tzuntar) |
| Web | `apps/web/src/lib/runner/`, `apps/web/src/lib/editor/`, `apps/web/src/modules/student/` (exam page, countdown, submit flow, banner, practice) |
| Tables, endpoints | none |

## You provide

| What | To | By |
| --- | --- | --- |
| `createFakeRunner`, `Runner` usage | tzuntar | M1 |
| `outputsMatch`, `testPassed`, the shared cases | tzuntar, you | M1 |
| The real runner (`createIframeRunner`, `useRunner`) | tzuntar (hidden-test check), you | M1 |
| `CodeEditor` | butarca, bjaksic84 | M1 |
| `useCountdown` | you | M2 |

## You use

| What | From | Until it exists |
| --- | --- | --- |
| `exams.get` (student view) | butarca | a fixture from `packages/core/src/demo/` |
| `submissions.create`, `submissions.mine` | tzuntar | a stand-in that returns a fake receipt |
| `useExamStatus` | EloRSL | a fixed status |

## Tasks in order

### M1, by 2026-11-29

1. Runner site on Cloudflare Pages, with the protocol in `internal-interfaces.md` section 6, Pyodide at one pinned version served from the runner site, and the CSP from SEC-7.
2. Prove with Playwright: Pyodide loads under the CSP; `urllib` and `fetch` from student code fail; a program that changes globals, builtins or files doesn't affect the next request; standard input works; a `while True: pass` stops at the time limit.
3. Measure the start-up time of a fresh interpreter and tell Rok (ADR-004 estimate: 1 to 2 s).
4. `compare.ts`, and the shared comparison cases with tzuntar (the list in ADR-004).
5. `createIframeRunner`, `createFakeRunner`, `useRunner`, `CodeEditor` (Python mode, line numbers, auto indentation, autocomplete on or off, read-only mode with highlighted lines).

### M2, by 2026-12-06

6. Exam page skeleton: the tasks with instructions, tips and rubric (Markdown, SEC-9), the editor, a Submit button, the countdown from `useExamStatus` and `serverOffsetMs`, and the line "Don't write your name in your code" (the AI must never see names).

### M3, by 2026-12-15 (Core)

7. **Run public tests** with per-test results and the note that they don't decide the grade (S15).
8. Submit flow: confirmation, `retryKey`, resend on network error, "Submitted at HH:MM", receipt with ID and SHA-256 (S16).
9. The unsubmitted-changes warning, and the "time is up" warning before a late submit (S17).
10. The view for the Scheduled state; reload when the state changes; the task-change banner from `task_changed` notices (S24, student side).

### M4, by 2026-12-18

11. `.txt` upload and drag and drop with the replace confirmation (S13).
12. Autosave to `localStorage` every 5 seconds, key `exam:{examId}:task:{taskId}` (S14).
13. Practice exam page: no countdown, never late (S11).

## Tests you write

- The shared comparison cases (Vitest, browser setup).
- Runner (Playwright): standard input, time limit, crash, exit codes, no network, no state between requests, wrong origin ignored, non-English output.
- Exam page (Playwright): run public tests, submit with retry, countdown with a server offset, banner after a new version.

## MUST NOT

- Run or `eval` student code anywhere but the runner site (G13).
- Load Pyodide from a CDN, or relax `connect-src` (SEC-7).
- Use `"*"` as a `postMessage` target origin (SEC-6).
- Decide in the browser whether a submission is stored as late. The server decides; the browser only warns.

## Done when

A student can work through the demo exam, run the public tests and submit without help, and the runner passes the shared cases and the isolation tests.
