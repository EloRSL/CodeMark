# lukaazman: AI grading

**Goal:** useful, honest score suggestions from a free AI, behind an interface with a fake for tests.

**Read first:** `conventions.md`, `glossary.md`, `data-model.md` (`ai_requests`, `score_records`), `types.md` (`ai.ts`, `api/grading.ts`, `api/review.ts`), `api.md` (#26, #27), `internal-interfaces.md` (section 2 `grading.ts`; section 3 grading, and the jobs part of platform), `flows.md` (section 7), ADR-006, ADR-003, ADR-005.

## You own

| Kind | What |
| --- | --- |
| Core | `packages/core/src/grading.ts` and its tests |
| API | `apps/api/src/modules/grading/` (providers, prompt, job, endpoints) |
| Web | `apps/web/src/modules/grading/`: AI status panel, trial grading result view |
| Docs | `docs/ai-quality.md` (the quality test results) |
| Tables | `ai_requests` |
| Endpoints | #26, #27 |

## You provide

| What | To | By |
| --- | --- | --- |
| The fake provider and `createAiProvider` | EloRSL (CI, Gate 1) | M1 |
| `runsPoints`, `buildCheckSummary`, `numberLines`, `checkGradingAnswer` | you | M1 |
| `gradeSubmissionJob` (with `onFailed`) | EloRSL (cron wiring) | M2 |
| `grading.trial` | butarca (preview) | M4 |
| `grading.aiStatus` and the panel | bjaksic84 (review screen) | M3 |

## You use

| What | From | Until it exists |
| --- | --- | --- |
| `review.suggest` | bjaksic84 | the M1 stub from bjaksic84 |
| `getSubmission`, `isCounted`, `getCheckResult` | tzuntar | demo data rows from the seed |
| `getFinalVersion`, `getExam` | butarca | M1 |
| `JobHandlerDef`, the cron | EloRSL | M1 |
| The `grade.submission` jobs that `recheck.submit` queues | tzuntar | jobs queued with `enqueue` in your tests |
| Rater B's scores for the quality test | bjaksic84 | M3; agree the reference scores with bjaksic84 |
| The quality-test runs against Workers AI | tzuntar | M3; you never call Workers AI yourself |

## Tasks in order

### M1, by 2026-11-29

1. The fake provider, exactly as in `internal-interfaces.md` section 3 (grading).
2. `grading.ts` with table tests; test `checkGradingAnswer` against bad JSON, fenced JSON, missing and extra criteria, out-of-range points and points that aren't a multiple of 0.5, and wrong quotes.
3. Start the quality test: 20 to 30 samples (good, buggy, not compiling, a few with comments that try to instruct the grader) with reference scores from two team members (you and bjaksic84), in `apps/api/src/modules/grading/quality/`.

### M2, by 2026-12-06

4. `ai_requests` table; `gradeSubmissionJob` with the fake, writing through `review.suggest`; `onFailed`.

### M3, by 2026-12-15 (Core)

5. The Workers AI provider and the prompt (all rules in `internal-interfaces.md` section 3, grading), `PROMPT_VERSION`, `MODEL_PRICES`, `JSON_MODE_MODELS`.
6. The budget wait at 9,000 Neurons; retries come from the platform (S30).
7. The quality-test script (ADR-006), tested with the fake, with instructions for running it in `quality/README.md`. tzuntar runs it against Workers AI. From tzuntar's output, write `docs/ai-quality.md` with the results for each of the five quality bars and the real tokens per grading, and recommend a value for `AI_MODEL` to Rok.
8. `grading.aiStatus` and the panel.

### M4, by 2026-12-18

9. `grading.trial` (S10).
10. With tzuntar: test that an accepted late submission is graded before and after the release.

## Tests you write

- `gradeSubmissionJob`: runs twice with the same payload without double records, and without double AI calls after a success; skips a submission that isn't counted; waits when over budget; retries once on a bad answer; manual grading after two bad answers; "runs" points when all tests pass, when some pass, and when none pass, with and without `smallTypo`.
- The `GradingRequest` built for a seeded submission contains no name, email, enrolment number, user ID, test input or expected output (strict schema plus a string search).
- Gate 1 expected values with the fake (`gate1.md`).

## MUST NOT

- Put anything personal, any test input or any expected output in a `GradingRequest` (SEC-10).
- Call Workers AI in CI or local work.
- Write `score_records` yourself. Write them only through `review.suggest`.
- Let the AI change or fix student code.

## Done when

Every counted submission in the demo exam gets checked suggestions, the quality test results are in `docs/ai-quality.md`, and CI runs on the fake.
