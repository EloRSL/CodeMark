# ADR-006: The AI provider interface and its fake

**Status:** Accepted · **Owner:** lukaazman · **Affects:** EloRSL, bjaksic84, tzuntar

## Decision

The grading module calls the AI only through `AiProvider.suggestScores(request)` (`types.md`). `AI_PROVIDER` picks the implementation: `fake` everywhere except the deployment and tzuntar's quality-test runs, which use `workers-ai`. Every answer from any implementation goes through `checkGradingAnswer` (`internal-interfaces.md`).

| Implementation | Used in | Behaviour |
| --- | --- | --- |
| Workers AI | the deployment, the quality-test runs | builds the prompt, asks for JSON (JSON mode only where the model supports it), one retry with the error attached |
| Fake | local, CI, the Gate 1 test | fixed rules in `internal-interfaces.md` section 3: full points when all hidden tests pass, half (rounded down to 0.5) otherwise, a quote of the first non-empty line, `smallTypo` when no test passed |

## Rules

- **ADR6-1.** `GradingRequest` is strict and has no field for a name, an email, an enrolment number, a user ID, a test input or an expected output (SEC-10). It holds the task title and instructions, the "ai" criteria, the numbered code, and the check summary: passed, total, and how the first failure failed (wrong output, an error with only its exception name such as `ValueError`, or timeout). The error message itself is never sent, because it can repeat a hidden input..
- **ADR6-2.** The prompt treats comments and strings in the code as the student's text, never as instructions.
- **ADR6-3.** Every answer is checked: each criterion exactly once, points within range in steps of 0.5, reason at most 600 characters, quotes that match their line (non-matching quotes are dropped and the suggestion flagged). A failing answer is retried once with the error; a second failure means manual grading.
- **ADR6-4.** The AI only suggests. It never changes or fixes a student's code, and the professor confirms every score.
- **ADR6-5.** Grading stops at 9,000 Neurons a day (`LIMITS.aiDailyGradingBudget`), keeping 1,000 for trial grading.

## Model choice and quality bar

The quality test (20 to 30 sample solutions: good, buggy, not compiling; a few with comments that try to instruct the grader) compares four candidates: `@cf/qwen/qwen3-30b-a3b-fp8`, `@cf/openai/gpt-oss-20b`, `@cf/openai/gpt-oss-120b`, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, with reasoning set as low as each allows. Two team members score each sample on their own, then agree one reference score. The cheapest model that meets all of these wins:

1. On at least 80% of criteria, within max(0.5, 25% of the criterion's maximum) of the reference.
2. On no criterion, off by more than half the maximum.
3. On at least 80% of samples, total within 15% of the reference total.
4. No injected comment changes a score.
5. Fewer than 5% of answers fail the checks twice.

The samples and the scores are in `apps/api/src/modules/grading/quality/`. The two raters are lukaazman and bjaksic84. A sample's "Runs" score counts in its total (bar 3) but not in bars 1 and 2, where a score fixed by `runsPoints` would make every model look better.

lukaazman writes the script that runs every sample through the Workers AI provider and `checkGradingAnswer` for one candidate at a time, and tests it with the fake. tzuntar runs it against Workers AI with his Cloudflare login, once per candidate, on a UTC day with no grading on the deployment: its Neurons come from the same daily quota (`LIMITS.aiDailyNeuronQuota`) but aren't in `ai_requests`, so the budget wait (ADR6-5) can't see them. The script stops once a run has used `LIMITS.aiDailyGradingBudget` Neurons, and tzuntar continues on the next UTC day. He gives the output to lukaazman.

Results, including real tokens per grading, go in `docs/ai-quality.md`. Rok sets `AI_MODEL` from them. Groq is a possible fallback behind the same interface, only after lukaazman checks its data terms and Rok approves.

## Do not build

- Calling the provider directly and faking its HTTP responses in tests (rejected: tests tied to one provider).
- Calling the real AI in CI (rejected: spends the quota, flaky).

## Consequences

- EloRSL and bjaksic84 build and test against the fake from week 1.
- The fake's scores mean nothing; any demo to the professor uses Workers AI.
- Part 2 adds `draftRubric` and `draftTests` to the same interface and calls `suggestScores` several times per submission.

## Action items

| Item | Who | By |
| --- | --- | --- |
| The fake provider, `checkGradingAnswer`, `runsPoints`, `buildCheckSummary` | lukaazman | M1 |
| The quality-test samples, script and `docs/ai-quality.md` | lukaazman | M3 |
| Rater B's scores and the agreed reference scores | bjaksic84, with lukaazman | M3 |
| The quality-test runs against Workers AI | tzuntar | M3 |
| Fake as default in local and CI; `AI_PROVIDER=workers-ai` only in the deployment's config | EloRSL | M1 |
| Score records built against `ScoreSuggestion` | bjaksic84 | M2 |
