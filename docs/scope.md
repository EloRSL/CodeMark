# Scope of Part 1

Part 1 is the basic platform. It supports Python only, and no student code runs on our server: the server stores data, checks results and calls the AI. Part 1 is used only with demo and test users.

Rules for this file:

- **SC-1.** Build only the items in the table below. Every pull request names the scope IDs it implements.
- **SC-2.** Core items come first. Don't start a non-Core item while one of your Core items is unfinished.
- **SC-3.** MUST NOT build anything from the "Not in Part 1" list, not even partly or behind a flag. If a task seems to need one, stop and ask Rok.
- **SC-4.** A new idea goes to Rok for Part 3 or a later list. It never goes into Part 1.

## Milestones

| # | Milestone | Done when | Date |
| --- | --- | --- | --- |
| M1 | Start | The repository, demo sign-in and the deployment work. The limits test on the deployed free Worker has passed. `stateOf` and the AI fake exist. | 2026-11-29 |
| M2 | Connected | The Gate 1 script (`docs/gate1.md`) runs end to end as an automated test, with stand-ins where a part isn't built yet. | 2026-12-06 |
| M3 | Core | Every Core item works with the real parts, and the Gate 1 script passes with the AI fake. | 2026-12-18 |
| M4 | Part 1 complete | Every other Part 1 item is done. | 2026-12-23 |
| M5 | Gate 1 | The Gate 1 script runs on the deployed platform with the real AI. | 2026-12-30 |
| M6 | Hand-in | Part 1 is handed in. | the course's date, to be confirmed |

If time runs short, non-Core items move to January. Gate 1 needs only Core items. Christmas week is the buffer.

## Part 1 items

"Owner" builds the item. "With" builds a part of it, named in that person's role file. "By" is the milestone it must be done by.

### Accounts and language

| ID | Core | Item | Owner | With | By |
| --- | --- | --- | --- | --- | --- |
| S1 | Core | Sign-in with Google or GitHub. The professor role goes only to emails in `PROFESSOR_EMAILS`; everyone else is a student. A student's enrolment number has exactly 8 digits. Demo sign-in works only while `DEMO_MODE` is `"true"`. | EloRSL | | M1 (demo sign-in), M3 (OAuth) |
| S2 | Core | A student joins an exam with the join code and an enrolment number, which is unique per exam. The professor can correct a student's enrolment number. | EloRSL | | M3 |
| S3 | | The professor uploads a class list of enrolment numbers. When one exists, only listed numbers can join. | EloRSL | | M4 |
| S4 | Core | Each student sees only their own work. Every endpoint enforces access (G8). | EloRSL | everyone | M3 |
| S5 | Core | The interface is in Slovene and English, with a language switch. All text is in `sl.json` and `en.json`, and CI fails on a missing key. | EloRSL | everyone | M3 |

### The professor sets up an exam

| ID | Core | Item | Owner | With | By |
| --- | --- | --- | --- | --- | --- |
| S6 | Core | An exam has 1 to 10 tasks. For each task, the professor writes instructions, tips, a rubric, and public and hidden tests by hand. | butarca | | M3 |
| S7 | Core | The professor sets the grading scale in points or percent, with the thresholds for 6 to 10. | butarca | | M3 |
| S8 | Core | The professor sets the opening and closing times and whether the editor offers autocomplete. | butarca | | M3 |
| S9 | Core | The professor can change the closing time while the exam is Scheduled or Open (D26). Setting it to now closes the exam 60 seconds later. | butarca | | M3 |
| S10 | | Before publishing, the professor previews the exam as students see it and tries the AI grading on sample code. | butarca | lukaazman (trial endpoint) | M4 |

### Students take the exam

| ID | Core | Item | Owner | With | By |
| --- | --- | --- | --- | --- | --- |
| S11 | | A practice exam opens at its opening time, never closes and is never checked or graded (D25). | timursic2 | butarca (`stateOf`, create form) | M4 |
| S12 | Core | The exam page shows instructions, tips and rubric next to a CodeMirror editor with syntax highlighting, line numbers and automatic indentation, and autocomplete only when the exam allows it. | timursic2 | | M3 |
| S13 | | Students can upload a `.txt` file or drop it onto the editor. If the editor has code, the page asks before replacing it. | timursic2 | | M4 |
| S14 | | The browser saves the editor's code every 5 seconds, so a crash or refresh doesn't lose it. | timursic2 | | M4 |
| S15 | Core | **Run public tests** runs the public tests in the runner. The page says these results don't decide the grade. | timursic2 | | M3 |
| S16 | Core | **Submit for grading** asks for confirmation, then shows "Submitted at HH:MM" and the receipt: submission ID and SHA-256 of the code. | timursic2 | tzuntar (endpoint) | M3 |
| S17 | Core | A countdown on the server's time shows the time left. The page warns when the editor's code differs from the last submission. | timursic2 | | M3 |
| S18 | Core | The server records each submission's arrival time by its own clock, with a 60-second grace period the page doesn't show. Later work is stored, marked late, and the professor accepts or rejects it. | tzuntar | | M3 |
| S19 | Core | Only submitted code counts. The counted submission is the latest accepted late one, otherwise the latest on-time one. | tzuntar | | M3 |

### Hidden tests

| ID | Core | Item | Owner | With | By |
| --- | --- | --- | --- | --- | --- |
| S20 | Core | On submit, the server stores the code with its hash and arrival time before replying. The student gets the receipt and nothing else. | tzuntar | | M3 |
| S21 | Core | Students never receive a hidden input or any expected output. Expected outputs never go to the runner or the AI. Each endpoint has a test for this (SEC-1). | tzuntar | everyone | M3 |
| S22 | Core | After the exam closes, the professor's review page runs every counted submission against the final version's hidden tests in the runner, one submission at a time, each in a fresh interpreter with no network access and a time limit per test. If the page closes, the next visit continues where it stopped. | tzuntar | timursic2 (runner), bjaksic84 (screen) | M3 |
| S23 | Core | The server compares outputs with the comparison rule, stores pass or fail with the exam version, and students see the results only after the release. | tzuntar | timursic2 (rule) | M3 |

### Changes to the exam

| ID | Core | Item | Owner | With | By |
| --- | --- | --- | --- | --- | --- |
| S24 | | During the exam, the professor changes a task with a note. Students see a banner with the note, and students who already submitted that task are told they can submit again. | butarca | timursic2 (banner) | M4 |
| S25 | Core | Each submission records the exam version it was made against. | tzuntar | butarca (versions) | M3 |
| S26 | | After the exam, the professor removes a task from the grade. Its points come off the maximum, and the professor chooses whether students keep earned points as a bonus. Grades are capped at 10. | butarca | | M4 |
| S27 | | If results were already released, a task removal sends every student a `grade_changed` notice. | butarca | | M4 |

### Grading after the deadline

| ID | Core | Item | Owner | With | By |
| --- | --- | --- | --- | --- | --- |
| S28 | Core | Each counted submission is sent to the AI with the task, the "ai" criteria, the numbered code and the check summary. Never a name, an enrolment number, a user ID, a test input or an expected output. | lukaazman | | M3 |
| S29 | Core | The "runs" criterion gets its points from the hidden tests (`runsPoints`). For the other criteria, the AI suggests points and a reason, quoting the code, even if the code doesn't compile. | lukaazman | | M3 |
| S30 | Core | If the AI is down or the daily budget is used, grading waits and continues later. | lukaazman | EloRSL (jobs) | M3 |

### The professor reviews

| ID | Core | Item | Owner | With | By |
| --- | --- | --- | --- | --- | --- |
| S31 | | During the exam, the professor sees who has submitted, including late work, and accepts or rejects late submissions. | tzuntar | | M4 |
| S32 | Core | When the review screen opens after the exam, the hidden-test check starts on its own and shows progress. Submissions not checked yet are marked. | tzuntar | bjaksic84 (screen) | M3 |
| S33 | Core | The review screen shows the student's code with the AI's quoted lines highlighted, next to the suggested points and reasons. | bjaksic84 | | M3 |
| S34 | Core | The professor confirms or changes each score, or accepts all of one submission's scores, then jumps to the next submission. A filter shows what still needs review. | bjaksic84 | | M3 |
| S35 | | Every score shows whether it came from the AI, the tests or the professor, with a history of changes. | bjaksic84 | | M4 |
| S36 | Core | The professor releases the results once every counted submission is checked and every score is confirmed. | bjaksic84 | | M3 |
| S37 | | The professor exports grades with enrolment numbers as a CSV file (D18). | butarca | | M4 |

### Students see their results

| ID | Core | Item | Owner | With | By |
| --- | --- | --- | --- | --- | --- |
| S38 | Core | After the release, students see points, reason and comment per criterion, hidden test results (passed of total), total and grade, labelled "Suggested by AI, confirmed by your professor". | bjaksic84 | | M3 |
| S39 | Core | Grades come only from confirmed scores, through `grade()` in `packages/core`. | butarca | | M3 |

### Demo and handover

| ID | Core | Item | Owner | With | By |
| --- | --- | --- | --- | --- | --- |
| S40 | Core | Demo accounts and demo data (`docs/demo-data.md`). The demo professor creates an exam, the demo students submit, and setting the closing time to now starts the check and the grading. | EloRSL | everyone (fixtures) | M1 (accounts), M3 (data) |
| S41 | Core | A README with setup steps, the demo accounts and a walk-through of one whole exam. It says that hidden tests run in the professor's browser until Part 2, that the platform assumes a supervised exam, and that Part 1 is for demo and test users only. Each person writes their own section. | EloRSL | everyone | M4 |
| S42 | | Part 2 only changes where the hidden tests run. Submissions, arrival times, comparison and grading MUST work unchanged when a server runner replaces the browser runner. | everyone | | always |
| S43 | Core | The Gate 1 script runs as an automated Playwright test with the AI fake and the fake clock (`docs/gate1.md`). | EloRSL | everyone | M2 (stand-ins), M3 (real parts) |

## Not in Part 1: MUST NOT build

| Feature | Where it belongs |
| --- | --- |
| A server sandbox or any student code running on a server | Part 2 (on a faculty VM) |
| AI drafting of rubrics, tests or whole tasks | Part 2 and Part 3 |
| Grading a submission several times, agreement warnings, measuring how often the professor keeps AI scores | Part 2 |
| Per-student deadline extensions | Part 2 (`stateOf` already takes `studentId`; leave it unused) |
| Removing a single criterion from the grade | Part 2 |
| Re-check requests from students | Part 2 |
| A per-submission status shown to students ("being graded", "graded") | Part 2 |
| A privacy page | Part 2 |
| Flagging identical solutions | Part 2 |
| Languages other than Python | Part 3 |
| Class statistics, common-mistake summaries | Part 3 |
| Sign in with Microsoft, passwords, email sign-in | Not planned (Microsoft is reviewed at Gate 1) |
| An admin page | Not planned |
| Email or push notifications | Not planned |
| WebSockets or server-sent events | Not planned (polling only, D11) |
| A staging environment, release tags | Part 3 |
| Any paid service, or a service that needs a credit card | Never |
