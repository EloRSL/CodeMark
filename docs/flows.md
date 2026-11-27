# Flows

Every flow as numbered steps. Names in `code` are endpoints (`api.md`) or functions (`internal-interfaces.md`).

## 1. Exam lifecycle (ADR-002)

Stored on the exam: `phase` (`draft`, `published`, `released`), `opens_at`, `closes_at`, `closed_at`, `practice`. The state is computed by `stateOf` (`internal-interfaces.md` section 2).

| From | To | Caused by | Side effects |
| --- | --- | --- | --- |
| (none) | Draft | `exams.create` | the professor becomes a member |
| Draft | Scheduled | `exams.publish` | version 1 and its student view are stored |
| Scheduled | Open | the clock reaches `opens_at` | none |
| Open | Closed | the clock reaches `closes_at + 60 s`; the cron then sets `closed_at` once | `exam_closed` notice to the professor |
| Closed | Released | `review.release`, only when ready | `results_released` notice to all students |

There are no other moves. Draft never comes back, Closed never reopens, Released never goes back. A practice exam goes Draft, Scheduled, Open and stays Open.

What each state allows:

| State | Students | Professor |
| --- | --- | --- |
| Draft | can't join; the exam isn't visible | edit the draft and settings, publish, trial grading |
| Scheduled | join; see the title and the opening time | edit the draft and settings, make a new version (no notice), change opening and closing times |
| Open | write, run public tests, submit (on time until `closes_at + 60 s`) | new version (with `task_changed` notice), change the closing time, watch submissions |
| Closed | submit (stored as late), see receipts | hidden-test check, late decisions, review and confirm, task adjustments, settings except times, CSV, release |
| Released | see results | everything Closed allows except release and settings; changes to released scores notify the student |

## 2. Professor creates and publishes an exam

1. Professor signs in (`auth.start`, `auth.callback`, or `auth.demo`).
2. `exams.create` with title, times and `practice`.
3. The editor loads it with `exams.get` and saves the whole content document with `exams.saveDraft` (debounced, at most once every 2 seconds while typing, and on leaving the page).
4. Optional: the preview renders `buildStudentView(draft)` and tries `grading.trial` with sample code (S10).
5. `exams.updateSettings` for scale, thresholds and autocomplete.
6. `exams.publish`. The state is Scheduled, or Open if `opens_at` has passed.
7. The professor gives students the join code shown by `exams.get`.

## 3. Student joins and takes the exam

1. Student signs in. If `Me.enrolmentNo` is null, the join form asks for it.
2. `exams.join` with the join code and enrolment number. Errors show `errors.<CODE>`, which tells the student to ask the professor for `ENROLMENT_TAKEN` and `ENROLMENT_NOT_LISTED`.
3. The exam page loads `exams.get`, `submissions.mine` and starts `useExamStatus`.
4. In Scheduled, the page shows the title and the opening time, and the next poll after `opensAt` reloads `exams.get`.
5. In Open, the page shows each task's instructions, tips and rubric next to `CodeEditor` with the starter code, or the autosaved code from `localStorage` key `exam:{examId}:task:{taskId}`.
6. **Run public tests**: one runner request with the task's public inputs; each result is compared in the browser with `testPassed`. The page states that this doesn't decide the grade.
7. **Submit for grading**: a confirmation dialog, then a new `retryKey` (`crypto.randomUUID()`), then `submissions.create`. On a network error (`NetworkError` from `api()`), resend with the **same** `retryKey` up to 3 times. Then show "Submitted at HH:MM" from the receipt's `arrivedAt` (Europe/Ljubljana time) with the submission ID and SHA-256.
8. The page shows an "unsubmitted changes" warning while the editor's code differs from the code of the latest receipt for that task (compare SHA-256 of the editor's code with the receipt's).
9. The countdown uses `closesAt` and `serverOffsetMs`. When it reaches zero, the page shows "Time is up" and the Submit dialog warns that work may be marked late. Submitting stays possible (S18).

## 4. Task change during the exam (S24)

1. The professor edits the draft and calls `exams.newVersion` with a note.
2. The server stores version n+1 and adds a `task_changed` notice `{ version, note }` for all students.
3. Within 60 seconds each student's poll returns the notice. The page reloads `exams.get`, shows a banner with the note, and for each task the student already submitted shows "This task changed. You can submit again."
4. The editor keeps the student's code. New submissions send the new `version`.

## 5. Closing time change (S9, D26)

1. The professor calls `exams.updateSettings` with `closesAt` while the state is Draft, Scheduled or Open. A time in the past is stored as now.
2. Each student's next poll returns the new `closesAt`, and the countdown follows. No notice is sent.
3. For the demo: setting `closesAt` to now makes the exam Closed 60 seconds later, and the next cron run sends `exam_closed`.

## 6. Submitting (S18 to S20, S25)

1. `submissions.create` checks the `retryKey` first, then the state, the version, the task and the count.
2. It computes the SHA-256, takes `arrivedAt = now`, sets `late` with `isOnTime`, stores the row, and returns the receipt. Nothing else happens on submit.
3. Late submissions (state Closed) are stored with `late_decision = pending` and appear in the professor's `submissions.list` as `lateWaiting`.

## 7. After the deadline: check, grade, review, release

1. **Close.** The first cron run at or after `closes_at + 60 s` runs `closeDueExams`: sets `closed_at` once, then sends `exam_closed` to the professor.
2. **Check.** The professor opens the review screen. `HiddenTestCheck` starts on its own: `recheck.next` gives up to 10 counted submissions with hidden inputs only; each runs in the runner (one request per submission, a fresh interpreter); `recheck.submit` sends the outputs.
3. **Compare and queue.** `recheck.submit` compares each output with the expected output by `testPassed`, and stores `hidden_results` and one `grade.submission` job per submission in one batch.
4. **Resume.** If the tab closes, the next visit continues: `recheck.next` returns only submissions without a result.
5. **Grade.** Each cron run claims one job (`LIMITS.jobsPerCronRun`). `gradeSubmissionJob` builds the `GradingRequest` (no test inputs, no expected outputs, no personal data), checks the answer, computes the "runs" points, and calls `review.suggest` once.
6. **Wait.** When today's grading budget is used, the job waits until 00:05 UTC without spending an attempt. When the AI fails, it retries after 1, 5, 15 and 60 minutes. After 5 failures, `onFailed` leaves the "ai" criteria without a suggestion for manual grading.
7. **Review.** `review.queue` lists counted submissions with filters. `review.submission` shows code with quoted lines highlighted, suggestions, check results and history. The professor uses `review.confirm` per criterion or `review.confirmAll`, then goes to `nextSubmissionId`.
8. **Release.** `review.release` succeeds only when every counted submission is checked and fully confirmed. It sets the phase, marks confirmed records released, and notifies all students.
9. **Results.** Each student's next poll gets `results_released`; the results page loads `review.myResults`.
10. **After release.** The professor exports `exams.gradesCsv` and then exports the database (EloRSL, D23).

## 8. Late work (S18, S31)

1. A student submits while the state is Closed. The receipt shows `late: true`, and the page had warned before sending.
2. The professor sees it in `submissions.list` under `lateWaiting` and calls `submissions.lateDecision`.
3. The student gets a `late_decision` notice.
4. **Accepted** and now the counted submission: it has no check result, so it appears in the next `recheck.next` batch. When the professor next opens the review screen, `HiddenTestCheck` checks it, and its grading job is queued.
5. If the exam is already Released: when the professor confirms its scores, `review.confirm` sets `released_at` and sends the student `grade_changed`. Until then, `review.myResults` shows null points for that task.
6. **Rejected**: nothing else happens. The earlier counted submission, if any, stays counted.

## 9. Task removal after the exam (S26, S27)

1. In Closed or Released, the professor calls `exams.adjustTask` with `removed` and `keepAsBonus`.
2. `grade()` leaves the task out of `max`, and adds its confirmed points to `total` only with `keepAsBonus`.
3. A task removed without bonus doesn't need confirmed scores for release.
4. In Released, all students get `grade_changed { taskId }`.

## 10. Practice exam (S11, D25)

1. The professor creates it with `practice: true` and `closesAt: null`, and publishes it.
2. It is Open from `opens_at` forever. The page shows no countdown.
3. Submissions are stored, never late, never counted, never checked, never graded. `review.release` refuses it.
