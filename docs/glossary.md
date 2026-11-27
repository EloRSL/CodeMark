# Glossary

Every term below has exactly one meaning. Use it exactly as written, in code names, comments, texts and pull requests. The code name is the identifier that MUST be used in code.

## People and access

| Term | Code name | Meaning |
| --- | --- | --- |
| Professor | `role: 'professor'` | A user whose email is on the professor list. Creates exams, reviews and confirms scores. |
| Student | `role: 'student'` | Every other user. Takes exams. |
| Professor list | `PROFESSOR_EMAILS` | A comma-separated Worker variable. Signing in with an email on this list gives the professor role; any other email gives the student role. Nobody can change their own role. |
| Member | `exam_members` row | A user who belongs to one exam, as professor or student. Only members can see an exam. |
| Join code | `joinCode` | A short code the professor gives students. A student joins an exam with the join code and their enrolment number. |
| Enrolment number | `enrolmentNo` | A UL student number of exactly 8 digits. Unique within one exam. |
| Class list | `class_list` | An optional list of enrolment numbers for one exam. When it exists, only those numbers can join. |
| Demo mode | `DEMO_MODE` | A Worker variable. When `"true"`, demo sign-in works and the app shows a Demo banner on every page. |
| Demo accounts | `DemoUser` | `professor`, `student1` (Ana), `student2` (Bor), `student3` (Cvetka). They exist only in demo mode. |

## Exams

| Term | Code name | Meaning |
| --- | --- | --- |
| Exam | `exams` row | One exam: title, times, settings, content, join code. |
| Practice exam | `practice: true` | An exam that opens at its opening time and never closes. It is never checked or graded. Students use it to learn the editor. |
| Exam content | `ExamContent` | One JSON document holding all tasks. The professor edits it as the draft. |
| Draft | `exams.draft` | The exam content the professor is editing. Students never see it. |
| Version | `version`, `exam_versions` row | An immutable snapshot of the exam content, made when the exam is published (version 1) and whenever the professor changes the tasks while the exam is Scheduled or Open (2, 3, ...). |
| Current version | `currentVersion` | The newest version. `0` means not published yet. |
| Final version | (none) | The current version at the moment the exam closes. Hidden tests run against it. |
| Student view | `StudentExamView` | A version with every hidden test removed. It is the only form of exam content a student ever receives. |
| Task | `Task` | One programming exercise in an exam. |
| Criterion | `Criterion` | One rubric line of a task, with a maximum number of points. |
| Rubric | `criteria` | All criteria of a task. |
| "ai" criterion | `kind: 'ai'` | A criterion the AI suggests points for. |
| "runs" criterion | `kind: 'runs'` | A criterion whose points come from the hidden tests (`runsPoints()`); the AI only says whether a program that passes no test has a small typo (`smallTypo`). At most one per task. |
| Public test | `visibility: 'public'` | A test students see and run themselves. It never affects the grade. |
| Hidden test | `visibility: 'hidden'` | A test students never see. It runs only in the hidden-test check. |
| Exam phase | `phase` | The phase stored on the exam: `draft`, `published` or `released`. Code MUST NOT use it to decide what is allowed; use the exam state. |
| Exam state | `ExamState` | The state computed by `stateOf()` from the phase, the exam's times and the clock: `draft`, `scheduled`, `open`, `closed`, `released`. |
| Grace period | `LIMITS.graceMs` | 60 seconds after the closing time during which a submission still counts as on time. Students never see it. |
| Task adjustment | `task_adjustments` row | The professor's decision after the exam to remove a task from the grade, optionally keeping its points as a bonus. |

## Submissions and tests

| Term | Code name | Meaning |
| --- | --- | --- |
| Submission | `submissions` row | Code a student sent for one task, with the server's arrival time and the exam version they were looking at. |
| Receipt | `Receipt` | What the student gets back after submitting: submission ID, task ID, version, SHA-256 of the code, arrival time and the late flag. Nothing else. |
| Retry key | `retryKey` | A UUID the browser creates once per click on Submit. A resend with the same key returns the first receipt and stores nothing new. |
| On time | `isOnTime()` | Arrived before the closing time plus the grace period. |
| Late submission | `late: true` | Arrived at or after the closing time plus the grace period, while the exam is closed. Stored and shown to the professor, who decides on it. |
| Late decision | `lateDecision` | The professor's decision on a late submission: `pending`, `accepted` or `rejected`. Only late submissions have one. |
| Counted submission | (none) | For one student and one task: the latest accepted late submission if there is one, otherwise the latest on-time submission. The only submission that is checked, graded and shown in review. |
| Hidden-test check | "the check" | Running every counted submission against the hidden tests of the final version, in the professor's browser, after the exam closes. Endpoint names use `recheck`; prose always says "hidden-test check". |
| Check result | `hidden_results` row, `CheckResult` | The stored outcome of the hidden-test check for one submission: per-test pass or fail, output and errors. |
| Comparison rule | `outputsMatch()` | Expected and actual output are equal after: (1) line endings become `\n`, (2) spaces and tabs at the end of each line are removed, (3) empty lines at the end are removed. Everything else counts. |
| Runner | `Runner` | Code that runs Python: `run(code, inputs, timeLimitMs)`. In Part 1, the runner site does this. |
| Runner site | `apps/runner` | A static site on Cloudflare Pages, a different site from the app. The app embeds it as a hidden iframe. |
| Fresh interpreter | (none) | A new Web Worker with a new Pyodide instance. Every runner request (one submission's tests) gets one. |

## Scores and grades

| Term | Code name | Meaning |
| --- | --- | --- |
| Score record | `score_records` row | The one record for each criterion of a counted submission. Its state is `suggested`, then `confirmed`; `releasedAt` is set on release. |
| Suggestion | `ScoreSuggestion` | Points, a reason and quoted lines for one criterion, from the AI (`source: 'ai'`) or the tests (`source: 'tests'`). Students never see a suggestion. |
| Confirmed | `state: 'confirmed'` | The professor kept or changed the points. Only confirmed points count toward a grade. |
| New suggestion | `newSuggestion: true` | A suggestion that arrived after the professor confirmed the score record. The confirmed points did not change; the review screen flags the record. |
| Released | `phase: 'released'`, `releasedAt` | Students can see their confirmed points, reasons, check results and grade. |
| Grade | `grade()` | The Slovenian grade 5 to 10, calculated from confirmed points by `grade()`. Never stored. |
| Scale | `settings.scale` | `points` or `percent`: what the thresholds are measured in. |
| Thresholds | `settings.thresholds` | The minimum for grades 6, 7, 8, 9 and 10. Below the 6 threshold the grade is 5. |

## Background work

| Term | Code name | Meaning |
| --- | --- | --- |
| Job | `jobs` row | Work done outside a request, run by the cron. Part 1 has one job type: `grade.submission`. |
| Cron run | `scheduled()` | Runs every minute: closes due exams, then runs one due job (`LIMITS.jobsPerCronRun`). |
| Notice | `notices` row, `Notice` | A message to the browser, picked up by the next status poll. There are five kinds; their payloads and recipients are in `docs/types.md`. |
| Status poll | `GET /api/exams/{examId}/status` | The exam page asks every 60 seconds for the state, times, version and new notices. It pauses in hidden tabs. |
| Neuron | `neurons` | Workers AI's unit of usage. 10,000 a day are free; grading stops at 9,000 and keeps 1,000 for trial grading. |
| Trial grading | `grading.trial` | The professor tries the AI grading on sample code in the preview. It stores no score records. |

## Planning

| Term | Meaning |
| --- | --- |
| Course professor | The teacher who grades this project and agrees to changes in its scope (SC-5). Not a user of the app; in the app, "professor" always means the user role. |
| Core item | A scope item the Gate 1 script needs. Core items are built before every other item (`docs/scope.md`). |
| Gate 1 | The test that ends Part 1: the Gate 1 script runs without help on the deployed platform with the real AI (`docs/gate1.md`). |
| Part 2 | The work from M3 to M6: the server sandbox, AI drafts of rubrics and tests, and more reliable grading. Planned by M3 (`docs/scope.md`). |
| Gate 2 | The test that ends Part 2 at M6. Its steps are written by M3. |
| Stand-in | A temporary implementation that returns fixed, valid data so others can build before the real part exists. The AI fake, the fake clock and the fake runner are stand-ins. |
| Fake clock | `POST /api/test/clock`, which exists only when `APP_ENV=test`. It moves the server's time. |
| Milestone | One of six dated steps in `docs/scope.md`. |
| Activity | One step of the project plan, from A0 to A34 (for example `A22`). Each milestone ends one or more activities (`docs/scope.md`). |
