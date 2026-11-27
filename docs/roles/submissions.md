# tzuntar: Submissions and hidden tests (security lead)

**Goal:** every submission is stored safely and every hidden test result can be trusted.

**Read first:** `conventions.md`, `glossary.md`, `data-model.md` (submissions), `types.md` (`api/submissions.ts`, `runner.ts`), `api.md` (#20 to #25), `internal-interfaces.md` (section 2 `compare.ts` and `hash.ts`; section 3 submissions; section 5 `HiddenTestCheck`; section 6), `flows.md` (sections 6, 7, 8), ADR-004, ADR-002, ADR-006 (the quality test), `architecture.md` section 6.

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
| `getCountedSubmissions`, `isCounted`, `getSubmission`, `getCheckResult`, and `submissionExamId` (the scope resolver, wired in `app.ts`) | lukaazman, bjaksic84, EloRSL (`app.ts`) | M2 |
| `recheck.next`, `recheck.submit` (results plus grading jobs in one batch) | lukaazman | M2 |
| `HiddenTestCheck` | bjaksic84 (review screen) | M2 |
| A shared test helper `expectNoHiddenData(json, exam)` that fails when a hidden test's input or expected output appears (public tests' expected outputs are allowed) | everyone (SEC-1 tests) | M2 |
| The quality-test runs against Workers AI (ADR-006) | lukaazman | M3 |

## You use

| What | From | Until it exists |
| --- | --- | --- |
| `stateOf`, `isOnTime`, `getFinalVersion` | butarca | M1 |
| `useRunner` | timursic2 | `createFakeRunner` |
| `outputsMatch`, `testPassed` | timursic2 | M1 |
| `enqueueQuery`, `notifyQuery` | EloRSL | M1 |

## Tasks in order

### M1, by 2026-11-29

1. Review EloRSL's `sha256Hex`; `submissions` and `hidden_results` tables.
2. `submissions.create` with every rule in `api.md` #20, in that order.
3. Shared comparison cases with timursic2. Security review of the runner site and the CSP.

### M2, by 2026-12-06

4. `getCountedSubmissions` with the counted rule, and the other `index.ts` functions under "You provide": `isCounted`, `getSubmission`, `getCheckResult`, `submissionExamId`.
5. `recheck.next` and `recheck.submit` (S22, S23): only inputs go out, the server compares the outputs, and the results and the grading jobs are written in one batch.
6. `HiddenTestCheck` with the fake runner, then the real one.
7. `submissions.mine`; `expectNoHiddenData`, and the SEC-1 tests for `api.md` #13, #20 and #21.

### M3, by 2026-12-15 (Core)

8. Late marking (S18), the counted rule (S19), and the exam version on every submission (S25).
9. Test that one program can't change the next one's result through the real runner (ADR-004).
10. Review the access rules and SEC-1 tests of all 33 endpoints.
11. Run lukaazman's quality-test script against Workers AI with your Cloudflare login, once per candidate model, as ADR-006 says, and give the output to lukaazman.

### M4, by 2026-12-18

12. `submissions.list` and `submissions.lateDecision`, and the live submissions list page with late decisions (S31).
13. Test that an accepted late submission is checked and graded before and after the release (with lukaazman).

## Tests you write

- `submissions.create`: the same retry key returns the first receipt (also when sent concurrently), each exam state, version bounds, an unknown task, the limit of 50 submissions per student per task, the late flag at the end of the grace period, a practice exam is never late.
- Counted rule: the latest on-time submission counts, an accepted late submission wins, rejected and pending late submissions never count, tasks missing from the final version.
- Hidden-test check (`recheck.next`, `recheck.submit`): no expected output in `recheck.next`; a wrong version or wrong test IDs give `BAD_REQUEST`; resubmitting a stored result stores nothing and queues nothing; a result for a submission that is no longer counted is skipped.

## MUST NOT

- Return anything but the receipt from `submissions.create`.
- Send a hidden test's expected output to any browser except in the professor's exam editor and review screen, or any expected output to the runner (SEC-1, SEC-2).
- Run hidden tests anywhere except the professor's browser in Part 1.
- Store a check result against any version except the final version.

## Done when

Students never receive a hidden test's input or expected output, no expected output reaches the runner, every counted submission gets checked, and late work is handled correctly.
