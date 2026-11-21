# ADR-004: Runner contract and the output comparison rule

**Status:** Accepted · **Owner:** timursic2 · **Affects:** tzuntar

## Decision

**Runner contract.** `run(code, inputs, timeLimitMs)` runs Python once per input, with the input on standard input, and returns one `RunResult` per input (`types.md`). In Part 1 the runner site implements it: a static site on Cloudflare Pages, a different site from the app, embedded as a hidden iframe, with Pyodide in a Web Worker. In Part 2 a server sandbox on a faculty VM implements the same contract.

**Isolation.** Student code is treated as arbitrary JavaScript on the runner site:

- the runner site is a different site from the app (`pages.dev` against `workers.dev`), so the browser sends none of the app's cookies to it;
- every runner request (one submission) gets a new Web Worker with a fresh interpreter, replaced again after a timeout;
- the runner site's CSP allows connections only to itself.

**Comparison rule.** Expected and actual output are equal after: (1) line endings become `\n`, (2) spaces and tabs at the end of each line are removed, (3) empty lines at the end are removed. Everything else counts, including inner spaces and letter case. Numbers are compared as text. One implementation, `outputsMatch` in `packages/core/src/compare.ts`, used by the browser and the Worker.

**Versions and trust.** Hidden tests run only in the professor's browser, after the exam closes, against the final version. The runner gets inputs only; the Worker compares. A test passes when the program finishes with exit code 0, without timing out, and its output matches (`testPassed`). Each result stores the version it ran against.

## Rules

- **ADR4-1.** All student code runs through a `Runner` (G13). The protocol is in `internal-interfaces.md` section 6.
- **ADR4-2.** `RunnerRequest` has no field for expected outputs, and MUST NOT get one (SEC-2).
- **ADR4-3.** Nothing a program does may affect the next runner request (SEC-8). Pyodide's Python-level restrictions are not a security boundary; the separate site, the fresh Web Worker and the CSP are.
- **ADR4-4.** The shared cases in `packages/core/src/compare.cases.json` run in CI against `outputsMatch` in both the browser test setup and the Worker test setup. Every bug found becomes a new case.
- **ADR4-5.** `hidden_results` stores the version. The review screen marks submissions without a result.

## Do not build

- A separate comparison for each side (rejected: drift on trailing newlines and Windows line endings).
- All comparisons on the server, public tests included (rejected: a server call per click on the free tier).
- Running hidden tests in students' browsers (rejected: students would see hidden inputs).
- Blocking things at the Python level as the security boundary (rejected: it can be bypassed).

## Consequences

- The Part 2 sandbox is a drop-in when it passes the same cases.
- Tasks must state their output format exactly.
- A fresh interpreter adds an estimated 1 to 2 seconds per submission; timursic2 measures it in M1.
- A tolerance for decimal outputs and tasks with several correct outputs come after Part 2.

## Action items

| Item | Who | By |
| --- | --- | --- |
| Runner site, protocol, CSP; prove Pyodide loads under the CSP and student code has no network | timursic2 | M1 |
| Security review of the runner | tzuntar | M1 |
| Shared cases: line endings, trailing spaces, trailing empty lines, empty output, a crash, a timeout, non-English characters | timursic2, tzuntar | M1 |
| CI runs both sides against the cases | EloRSL | M1 |
| Test that one program can't change the next one's result | tzuntar | M2 |
| Store each result with its version; `checked` flag for review | tzuntar | M2 |
| Part 2: the VM sandbox passes the same cases before it takes over | Person A | Part 2 |
