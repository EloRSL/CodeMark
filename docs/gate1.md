# Gate 1 script

Part 1 is done when this script runs without help on the deployed platform with the real AI (M5). From M2 on, the same script runs in CI as `e2e/gate1.spec.ts` (EloRSL) with the AI fake and the fake clock.

Rules:

- **GT-1.** The script uses the UI wherever the screen exists. Until a screen exists, the step calls the API instead and says `// stand-in` in the test. By M3, no step uses a stand-in.
- **GT-2.** Every response a student receives during the script is checked with `expectNoHiddenData` (SEC-1).
- **GT-3.** In CI, the clock is fake and starts at T0 = `2026-12-01T09:00:00.000Z`. Expected numbers below are for the AI fake. On the deployment, the AI is real, so the script checks shapes and rules instead of exact points (last section).
- **GT-4.** A change that breaks this script is not merged (definition of done).

## Steps

| # | Step | How | Expected | Owner |
| --- | --- | --- | --- | --- |
| 0 | Set up | fresh database with the demo seed; `test.clock` T0 | | EloRSL |
| 1 | Professor signs in | sign-in page, "Demo professor" (`auth.demo`) | `Me.role` is `professor`; the Demo banner shows | EloRSL |
| 2 | Create the exam | create form (`exams.create`): title "Gate 1 exam", opens T0 + 10 min, closes T0 + 70 min, not practice | state `draft` | butarca |
| 3 | Write the task | editor (`exams.saveDraft`): "Sum of digits" exactly as in `demo-data.md`, with new IDs from the editor | saved | butarca |
| 4 | Publish | publish button (`exams.publish`) | version 1, state `scheduled`; note the join code | butarca |
| 5 | Students join | Ana, Bor, Cvetka sign in and join (`exams.join`) with 63240001, 63240002, 63240003 | each gets the `examId`; the page shows the title and the opening time | EloRSL, timursic2 |
| 6 | The exam opens | `test.clock` T0 + 11 min, then each page's next poll | state `open`; tasks and editor shown | timursic2 |
| 7 | Run public tests | each student pastes their code (`demo-data.md`) and clicks **Run public tests** | Ana 2 of 2, Bor 2 of 2, Cvetka 0 of 2 with `SyntaxError` in the output | timursic2 |
| 8 | Submit | **Submit for grading**, confirm (`submissions.create`) | a receipt each: `late: false`, `version: 1`, `sha256` equals `sha256Hex(code)`; "Submitted at 10:11" (Ljubljana time) | timursic2, tzuntar |
| 9 | Close now | settings, "Close now" (`exams.updateSettings`, `closesAt` = now) at T0 + 12 min | `closesAt` T0 + 12 min; state still `open` (grace) | butarca |
| 10 | The exam closes | `test.clock` T0 + 13 min + 1 s; `test.runJobs` | `examsClosed: 1`; state `closed`; the professor's status has an `exam_closed` notice | EloRSL, butarca |
| 11 | Hidden-test check | professor opens the review screen; `HiddenTestCheck` runs (`recheck.next`, `recheck.submit`) | 3 stored, 3 jobs queued, `notChecked` 0; Ana 3 of 3, Bor 2 of 3 (first failure `error`), Cvetka 0 of 3 | tzuntar, bjaksic84 |
| 12 | AI grading | `test.runJobs` | `jobsRun: 3`; suggestions as in the table below | lukaazman |
| 13 | Review | Ana: **Accept all**. Bor: change "Uses a loop over the digits" from 1 to 2 with the comment "Correct loop; negative numbers are scored separately.", then **Accept all**. Cvetka: **Accept all**. | every record confirmed; Bor's history shows the change | bjaksic84 |
| 14 | Release | release button (`review.release`) | `releasedAt` set; each student's next poll has `results_released` | bjaksic84 |
| 15 | Students see results | results page (`review.myResults`) | the table below; the label "Suggested by AI, confirmed by your professor"; no suggestion, quote, hidden input or expected output in the response | bjaksic84 |
| 16 | CSV (from M4) | `exams.gradesCsv` | 3 rows by enrolment number; totals 7, 5, 3; grades 10, 8, 5 | butarca |

## Expected suggestions with the AI fake (step 12)

| Student | Reads the input (max 1) | Uses a loop (max 2) | Negative numbers (max 1) | Runs (max 3) | Total |
| --- | --- | --- | --- | --- | --- |
| Ana | 1 | 2 | 1 | 3 (all passed) | 7 |
| Bor | 0.5 | 1 | 0.5 | 2 (2 of 3 passed: 2/3 of 3) | 4 |
| Cvetka | 0.5 | 1 | 0.5 | 1 (none passed, fake sets `smallTypo`: 1/3 of 3) | 3 |

Each "ai" suggestion quotes line 1 (`n = int(input())`), the first non-empty line.

## Expected results (step 15), percent scale 50, 60, 70, 80, 90

| Student | Total | Max | Percent | Grade |
| --- | --- | --- | --- | --- |
| Ana | 7 | 7 | 100 | 10 |
| Bor | 5 (4 before the professor's change) | 7 | 71.43 (57.14 before) | 8 (6 before) |
| Cvetka | 3 | 7 | 42.86 | 5 |

## On the deployment (M5)

Run by EloRSL with `GATE1_TARGET=deployed`, on the real clock and `AI_PROVIDER=workers-ai`:

- Step 2 opens 2 minutes from now; step 6 waits for the opening; step 10 waits for the cron (up to 2 minutes after "close now" plus 60 seconds); step 12 waits until `grading.aiStatus` shows `jobsQueued: 0` (up to 15 minutes).
- Step 12 checks shapes, not numbers: every "ai" record has a suggestion with points in range and a reason, or is marked for manual grading; "runs" points are Ana 3, Bor 2, and Cvetka 1 or 0.
- Step 15 checks that each grade equals `grade()` of the confirmed points.
- Afterwards, check request and D1 usage in the Cloudflare dashboard (ADR-005).
