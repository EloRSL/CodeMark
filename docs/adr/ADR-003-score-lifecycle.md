# ADR-003: Score lifecycle and grade calculation

**Status:** Accepted · **Owner:** bjaksic84, with butarca for `grade` · **Affects:** butarca, lukaazman

## Decision

The review module owns one score record per criterion per counted submission (`score_records`). A record is `suggested`, then `confirmed`, and it is released when `released_at` is set. Grades are calculated by the pure function `grade()` in `packages/core/src/grade.ts` whenever they are shown, and never stored.

| State | Set by | Meaning |
| --- | --- | --- |
| suggested | `review.suggest`, called only by the grading job | a proposal: points, reason, quotes, source `ai` or `tests`; or no suggestion (grade manually). Students never see it. |
| confirmed | `review.confirm`, `review.confirmAll` | the professor kept or changed the points. Grades use only these. |
| released | `review.release`, or `review.confirm` after the release | students see the confirmed points, the reason and the comment |

## Rules

- **ADR3-1.** Every change of a record adds a `score_history` row in the same batch: old and new points, old and new state, who (null for AI or tests), when, note.
- **ADR3-2.** A new suggestion never changes a confirmed record's `points` or `state`. It replaces only the suggestion columns and sets `new_suggestion`.
- **ADR3-3.** `suggest` takes all suggestions of one submission in one call and writes them in one `db.batch()`, so a grading job stays under 10 D1 queries.
- **ADR3-4.** A record holds one suggestion in its own columns. Part 2's repeated grading will add a table; MUST NOT add one now.
- **ADR3-5.** The "runs" criterion's points come only from `runsPoints` (`internal-interfaces.md`): all when every hidden test passes, 2/3 when at least one passes, 1/3 when none passes and the AI says `smallTypo`, otherwise 0, rounded down to 0.5. An empty program passes no test and earns 0: the grading job ignores `smallTypo` when the code is empty after trimming.
- **ADR3-6.** Changing a released score sends that student `grade_changed` (ADR-005).
- **ADR3-7.** `grade(input)` reads nothing and stores nothing. The results page, the review screen and the CSV export all call it.

## Do not build

- A table per stage (suggestions, confirmed scores, released grades) owned by different people (rejected: copies drift, history spreads over three places).
- Stored grades updated on every change (rejected: one missed update after a task removal gives a wrong grade).

## Consequences

- The score history and Part 2's "how often the professor keeps the AI's points" come from one table.
- Grading (lukaazman) and review (bjaksic84) can't change the suggestion shape without Rok changing `types.md`.
- Part 3 class statistics may add a stored summary later, filled from these records.

## Action items

| Item | Who | By |
| --- | --- | --- |
| `score_records`, `score_history`, `suggest` with the batch rule | bjaksic84 | M1 (stub), M2 (real) |
| Write suggestions only through `suggest`; use a stand-in until it exists | lukaazman | M2 |
| `grade()` with table-driven tests: both scales, removed task with and without bonus, cap at 10 | butarca | M2 |
| `getCheckResult` for the "runs" criterion | tzuntar | M2 |
| Test: a late AI suggestion never overwrites a confirmed score | bjaksic84 | M3 |
