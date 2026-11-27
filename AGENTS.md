# AGENTS.md

Instructions for AI coding agents working on CodeMark, the AI-Assisted Programming Exam Platform. Read this file before every task. It is committed in the repository root, and only Rok changes it (`docs/conventions.md` section 10). Every rule lives in `docs/`.

## Before any task

1. Read `docs/conventions.md` in full. It defines MUST and MUST NOT, the global rules G1 to G20, the repository layout, the commands and the definition of done.
2. Find your role in `docs/conventions.md` section 4 and read your role file in `docs/roles/`, then every section it lists under "Read first".
3. Read `docs/glossary.md` and use its terms exactly.
4. Read the role log in `docs/log/` of every module your task uses (G20).

## While working

- Do only tasks from your role file, in its order, Core items first (`docs/scope.md`).
- Every shape (body, response, job payload, notice payload, runner message, AI message) comes from `packages/contracts`, which matches `docs/types.md` and `docs/api.md`. Never define one yourself and never change one to make your code work.
- If the docs don't say how to do something, STOP. Don't invent an endpoint, field, table, column, error code, job type, notice kind or library. Write the question in the pull request, leave that part undone, and tell the person you work for to ask Rok.
- If you add something other code or people can use, or your code can't follow a doc as written, record it in your role log (`docs/log/<your role file name>`) in the same pull request: what and where, and for a difference, one or two sentences on why (G20, `docs/conventions.md` section 11).
- When two docs disagree, follow the order in `docs/conventions.md` section 3 and report the conflict.
- Change only files your role owns, plus your role log.
- You MUST follow G19 for every commit and pull request: few commits, short plain titles like a person would write, no `feat:`-style prefixes, no long generated descriptions. The branch is named after the activity (`A22-runner-timeouts`) and the pull request title starts with it (`A22 - Add runner timeouts`), as in `docs/conventions.md` section 12.

## Before you say a task is done

- Check every item of the definition of done in `docs/conventions.md` section 8, including the role log.
- Name the scope IDs (`S12`) and rule IDs (`G4`, `SEC-1`) you implemented in the pull request description.
