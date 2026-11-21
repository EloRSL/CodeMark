# ADR-002: Exam lifecycle states and transitions

**Status:** Accepted · **Owner:** butarca · **Affects:** timursic2, tzuntar, lukaazman, bjaksic84

## Decision

Every exam is in one of five states: `draft`, `scheduled`, `open`, `closed`, `released`. The exams module owns them. `stateOf(exam, now, studentId?)` in `packages/core/src/lifecycle.ts` computes the state from the stored `phase`, `opens_at`, `closes_at`, `closed_at` and `practice`, so the state is right even when the cron runs late. The algorithm is in `internal-interfaces.md` section 2; the moves and their side effects are in `flows.md` section 1.

## Rules

- **ADR2-1.** No code outside `stateOf` and `isOnTime` compares exam times (G4). Every module asks for the state.
- **ADR2-2.** The grace period (60 s, `LIMITS.graceMs`) is a rule inside Open, not a state. Students never see it.
- **ADR2-3.** Moves with side effects happen only in these functions, each once:
  - publish (`exams.publish`): version 1;
  - close (`exams.closeDueExams`): `closed_at` set with a conditional update, then `exam_closed` to the professor only if the update changed a row;
  - release (`exams.releaseQuery`, called by `review.release`): conditional on `phase = 'published'`.
- **ADR2-4.** The professor can change the closing time while the state is Draft, Scheduled or Open (D26). A closed exam can't be reopened.
- **ADR2-5.** A practice exam opens at its opening time and stays Open. It is never checked, graded or released (D25).
- **ADR2-6.** Closed moves to Released only when every counted submission has a check result and confirmed scores for every criterion (tasks removed without bonus excepted).
- **ADR2-7.** An accepted late submission joins the next check batch and is graded, before or after the release. After the release, its scores reach the student when the professor confirms them.
- **ADR2-8.** Check results and scores stay hidden from students in every state before Released.

## Do not build

- Working out the state from times and flags in each module (rejected: grading could start twice or never).
- Each module comparing times itself (rejected: the modules disagree at the edges, and an accepted late submission is never graded).
- A stored state column (rejected: wrong whenever the cron is late).

## Consequences

- Deadline edge cases are tested in one place, and the Gate 1 test moves time with the fake clock.
- timursic2, tzuntar, lukaazman and bjaksic84 depend on `stateOf` from week 1, so butarca delivers it first.
- Part 2's per-student extensions change only the inside of `stateOf` and `isOnTime`, which already take `studentId`.

## Action items

| Item | Who | By |
| --- | --- | --- |
| `stateOf` and `isOnTime` with their edge-case tests | butarca | M1 |
| The fake clock used by the Gate 1 test | EloRSL | M1 |
| Call `stateOf` instead of comparing times | timursic2, tzuntar, lukaazman, bjaksic84 | always |
| Test that an accepted late submission is graded before and after release | tzuntar, lukaazman | M4 |
| Tests at 1 s before closing, inside the grace period, at exactly `closes_at + 60 s`, and 1 s after | butarca | M1 |
