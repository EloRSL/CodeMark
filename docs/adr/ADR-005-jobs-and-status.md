# ADR-005: Background jobs and the polled exam status endpoint

**Status:** Accepted · **Owner:** EloRSL · **Affects:** butarca, timursic2, lukaazman, bjaksic84

## Decision

**Jobs.** Work outside a request runs as rows in the `jobs` table. A Cron Trigger runs every minute. Each run closes due exams, then claims one due job (`LIMITS.jobsPerCronRun`) with an update that only succeeds while the job is still queued. One job per minute is 1,440 jobs a day, about five times as many as the AI quota allows. `LIMITS.jobsPerCronRun` was 2 until the limits test, where a run with two jobs used 27 to 58 ms of CPU time against the free plan's 10 ms (`architecture.md` section 4). Part 1 has one job type, `grade.submission`.

**Status endpoint.** `GET /api/exams/{examId}/status` returns `serverTime`, `state`, `opensAt`, `closesAt`, `version`, new `notices` and `latestNoticeId` (`api.md` #10). The exam page polls it every 60 s and pauses polling in hidden tabs.

## Rules

- **ADR5-1.** Modules queue work only through `enqueue` or `enqueueQuery`, with a `dedupeKey`. Modules create notices only through `notify` or `notifyQuery` (`internal-interfaces.md`).
- **ADR5-2.** Every job handler is safe to run twice with the same payload.
- **ADR5-3.** Retries: up to 5 attempts, waiting 1, 5, 15 and 60 minutes between them. A budget wait (`{ kind: 'wait' }`) moves the job to 00:05 UTC the next day without spending an attempt. A run that the platform stops before it finishes (for example at the CPU limit) counts as a failure. After the fifth failure the job is `failed` and its `onFailed` runs.
- **ADR5-4.** Bulk writes go in one `db.batch()` or one `INSERT ... SELECT`.
- **ADR5-5.** The countdown and the change banner get their data only from the status endpoint (timursic2 builds them).
- **ADR5-6.** A late cron run breaks nothing: the state comes from the clock, and the next run catches up.
- **ADR5-7.** There are five notice kinds, with their payloads in `types.md`. A new kind needs Rok's approval.

## Do not build

- A hosted queue plus WebSockets or server-sent events (rejected: more moving parts and tighter free tiers).
- Timers inside the server process (rejected: lost on every restart).
- Cloudflare Queues or Workflows (rejected: the D1 table is simpler and shows every job; Workflows have the same 10 ms per step).

## Consequences

- There is one place to see stuck work. The Gate 1 script in CI runs every due job at once (`test.runJobs`).
- Polling adds steady load during an exam: about 120 requests per student over 2 hours.
- If polling gets too heavy, the same response can move to server-sent events later, with no page changes.

## Action items

| Item | Who | By |
| --- | --- | --- |
| `jobs` table, `runDueJobs`, `enqueue`, `enqueueQuery`, the cron, `test.runJobs` | EloRSL | M1 |
| `notices`, `notify`, `notifyQuery`, the status endpoint, `useExamStatus` | EloRSL | M1 |
| State and version for the status endpoint (`getExam`, `stateOf`) | butarca | M1 |
| Countdown and banner from `useExamStatus` only | timursic2 | M3 |
| Grading jobs safe to run twice; budget waits | lukaazman | M3 |
| Check request and D1 usage in the Cloudflare dashboard after the Gate 1 run | EloRSL | M5 |
