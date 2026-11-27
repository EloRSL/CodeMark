# tzuntar: Submissions and hidden tests (security lead)

**Goal:** every submission is stored safely and every hidden test result can be trusted.

**Read first:** `conventions.md`, `glossary.md`, `data-model.md` (submissions), `types.md` (api/submissions, runner), `api.md` (#20 to #25), `internal-interfaces.md` (section 2 compare and hash, section 3 submissions, section 5 `HiddenTestCheck`, section 6), `flows.md` (6, 7, 8), ADR-004, ADR-002, ADR-006 (the quality test), `architecture.md` section 6.

## You own

| Kind | What |
| --- | --- |
| Core | `packages/core/src/hash.ts`; `compare.cases.json` (with timursic2) |
| API | `apps/api/src/modules/submissions/` |
| Web | `apps/web/src/modules/submissions/`: `HiddenTestCheck`, the live submissions list, late decisions |
| Tables | `submissions`, `hidden_results` |
| Endpoints | #20 to #25 |
| Security lead | review of every change to access rules, sessions, secrets, the hidden-test check and the runner site; second administrator of the Cloudflare account (D23) |

## You provide

| What | To | By |
| --- | --- | --- |
| `submissions.create`, `submissions.mine` | timursic2 | M2 |
| `getCountedSubmissions`, `isCounted`, `getSubmission`, `getCheckResult`, and `submissionExamId` (the scope resolver, wired in `app.ts`) | lukaazman, bjaksic84, butarca | M2 |
| `recheck.next`, `recheck.submit` (results plus grading jobs in one batch) | lukaazman | M2 |
| `HiddenTestCheck` | bjaksic84 (review screen) | M2 |
| A shared test helper `expectNoHiddenData(json, exam)` that fails when a hidden test's input or expected output appears (public tests' expected outputs are allowed) | everyone (SEC-1 tests) | M2 |
| The quality-test runs against Workers AI (ADR-006) | lukaazman | M3 |

## You use

| What | From | Until it exists |
| --- | --- | --- |
| `stateOf`, `isOnTime`, `getFinalVersion` | butarca | M1 |
| `useRunner` | timursic2 | `createFakeRunner` |
| `enqueueQuery`, `notifyQuery` | EloRSL | M1 |

## Tasks in order

### M1, by 2026-11-29

1. `sha256Hex`; `submissions` and `hidden_results` tables.
2. `submissions.create` with every rule in `api.md` #20, in that order.
3. Shared comparison cases with timursic2. Security review of the runner site and the CSP.

### M2, by 2026-12-06

4. `getCountedSubmissions` with the counted rule, and the other `index.ts` functions.
5. `recheck.next` and `recheck.submit` (S22, S23): inputs only out, comparison on the server, one batch with the jobs.
6. `HiddenTestCheck` with the fake runner, then the real one.
7. `expectNoHiddenData` and SEC-1 tests for #13, #20, #21.

### M3, by 2026-12-15 (Core)

8. `submissions.mine`. Late marking (S18), the counted rule (S19), version on every submission (S25).
9. Test that one program can't change the next one's result through the real runner (ADR-004).
10. Review the access rules and SEC-1 tests of all 33 endpoints.
11. Run lukaazman's quality-test script against Workers AI with your Cloudflare login, once per candidate model, as ADR-006 says, and give him the output.

### M4, by 2026-12-18

12. `submissions.list` and the live list page with late decisions (S31), `submissions.lateDecision`.
13. Test that an accepted late submission is checked and graded before and after the release (with lukaazman).

## Tests you write

- Submit: retry key returns the first receipt (also concurrently), each state, version bounds, unknown task, the 50 limit, late flag at the grace boundary, practice never late.
- Counted rule: latest on-time, accepted late wins, rejected and pending never count, tasks missing from the final version.
- Recheck: no expected output in `recheck.next`; wrong version or test IDs give `BAD_REQUEST`; resubmitting a stored result stores nothing and queues nothing; a result for a no-longer-counted submission is skipped.

## MUST NOT

- Return anything but the receipt from `submissions.create`.
- Send a hidden test's expected output to any browser except in the professor's exam editor, or any expected output to the runner (SEC-1, SEC-2).
- Run hidden tests anywhere but the professor's browser in Part 1.
- Store a check result against any version but the final one.

## Done when

Students never receive a hidden test's input or expected output, no expected output reaches the runner, every counted submission gets checked, and late work is handled correctly.
