# Demo data

The demo seed gives every role data at each stage from day one. The constants live in `packages/core/src/demo/` (EloRSL, with fixtures from every role). `apps/api/seed/generate.ts` turns them into `apps/api/seed/demo.sql`, with times relative to the moment it runs (R).

- `pnpm db:reset` (local): drop the local database, apply migrations, generate the seed with R = now, apply it.
- Deployment: EloRSL applies the generated seed once, by hand, with `wrangler d1 execute codemark-db --remote --file=seed/demo.sql`.
- Tests: the Vitest and Playwright setups apply the same seed to a fresh database.

All IDs below are fixed, so tests can use them. They are valid UUID version 4 strings.

## Users

| Demo key | ID | Name | Email | Role | Enrolment no. |
| --- | --- | --- | --- | --- | --- |
| `professor` | `00000000-0000-4000-8000-000000000001` | Demo Professor | `professor@demo.invalid` | professor | (none) |
| `student1` | `00000000-0000-4000-8000-000000000002` | Ana Novak | `ana@demo.invalid` | student | 63240001 |
| `student2` | `00000000-0000-4000-8000-000000000003` | Bor Kranjc | `bor@demo.invalid` | student | 63240002 |
| `student3` | `00000000-0000-4000-8000-000000000004` | Cvetka Zupan | `cvetka@demo.invalid` | student | 63240003 |

All have `demo = 1` and `locale = sl`. They have no `oauth_accounts` rows.

## Tasks

Task, criterion and test IDs are unique within an exam. The same task uses the same IDs in every demo exam.

### "Sum of digits" (`00000000-0000-4000-8000-000000000201`)

- Instructions: "Read an integer n from standard input and print the sum of its digits. For a negative number, use its absolute value."
- Tips: "`abs()` and `str()` can help."
- Starter code: `n = int(input())` followed by a newline. Time limit 2000 ms.

| Criterion ID | Name | Kind | Max |
| --- | --- | --- | --- |
| `...0301` | Reads the input correctly | ai | 1 |
| `...0302` | Uses a loop over the digits | ai | 2 |
| `...0303` | Handles negative numbers | ai | 1 |
| `...0304` | Runs | runs | 3 |

| Test ID | Visibility | Input | Expected output |
| --- | --- | --- | --- |
| `...0401` | public | `123\n` | `6\n` |
| `...0402` | public | `0\n` | `0\n` |
| `...0403` | hidden | `9999\n` | `36\n` |
| `...0404` | hidden | `-45\n` | `9\n` |
| `...0405` | hidden | `100000\n` | `1\n` |

`...0301` means `00000000-0000-4000-8000-000000000301`, and so on.

### "Count vowels" (`00000000-0000-4000-8000-000000000202`)

- Instructions: "Read one line and print how many vowels (a, e, i, o, u, upper or lower case) it contains."
- Starter code: empty. Time limit 2000 ms.

| Criterion ID | Name | Kind | Max |
| --- | --- | --- | --- |
| `...0311` | Reads the line | ai | 1 |
| `...0312` | Counts vowels correctly | ai | 2 |
| `...0313` | Runs | runs | 2 |

| Test ID | Visibility | Input | Expected output |
| --- | --- | --- | --- |
| `...0411` | public | `Hello World\n` | `3\n` |
| `...0412` | hidden | `AEIOU xyz\n` | `5\n` |
| `...0413` | hidden | `Programiranje\n` | `5\n` |
| `...0414` | hidden | `\n` | `0\n` |

### "Hello" (`00000000-0000-4000-8000-000000000203`)

- Instructions: "Read a name and print `Hello, <name>!`."
- Starter code: empty. Time limit 2000 ms.

| Criterion ID | Name | Kind | Max |
| --- | --- | --- | --- |
| `...0321` | Prints the greeting | ai | 1 |
| `...0322` | Runs | runs | 1 |

| Test ID | Visibility | Input | Expected output |
| --- | --- | --- | --- |
| `...0421` | public | `Ana\n` | `Hello, Ana!\n` |
| `...0422` | hidden | `Bor\n` | `Hello, Bor!\n` |

## Exams

All three are published at version 1 with `DEFAULT_SETTINGS`, created by the demo professor, with the professor and all three students as members.

| Exam | ID | Join code | Practice | Opens | Closes | `closed_at` | Tasks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Demo exam | `...0101` | `DEMO-2026` | no | R | R + 2 h | null | Sum of digits, Count vowels |
| Practice | `...0102` | `PRACTICE` | yes | R - 1 day | null | null | Hello |
| Closed exam | `...0103` | `CLOSED-2026` | no | R - 3 h | R - 1 h | R - 1 h + 60 s | Sum of digits |

The Demo exam is Open for two hours after a reset. The Closed exam is Closed and has data at every stage of grading.

## Student code (also used by the Gate 1 script)

**Ana** (correct):

```python
n = int(input())
print(sum(int(d) for d in str(abs(n))))
```

**Bor** (fails for negative numbers with a ValueError):

```python
n = int(input())
total = 0
for d in str(n):
    total += int(d)
print(total)
```

**Bor, fixed** (used only for the late submission below):

```python
n = abs(int(input()))
total = 0
for d in str(n):
    total += int(d)
print(total)
```

**Cvetka** (missing colon, a SyntaxError):

```python
n = int(input())
total = 0
for d in str(abs(n))
    total += int(d)
print(total)
```

## Closed exam submissions

| ID | Student | Arrived | Late | Stage | Rows the seed creates |
| --- | --- | --- | --- | --- | --- |
| `...0501` | Ana | R - 1 h - 10 min | no | checked and graded | `hidden_results` 3 of 3; 4 `score_records` (suggested, from the fake: 1, 2, 1, runs 3) with history; a `done` job; an `ai_requests` row (model `fake`) |
| `...0502` | Bor | R - 1 h - 5 min | no | checked only | `hidden_results` 2 of 3 (`-45` failed with exit code 1 and a ValueError traceback); a `queued` job `grade:...0502` |
| `...0503` | Cvetka | R - 1 h - 2 min | no | not checked | none |
| `...0504` | Bor, fixed | R - 1 h + 5 min | yes, `pending` | waiting for a late decision | none |

Locally, the cron runs only when triggered (`pnpm cron`), so Bor's job stays queued until someone runs it. Accepting `...0504` makes it Bor's counted submission, which then needs a check.
