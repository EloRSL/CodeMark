# CodeMark

CodeMark is a platform for programming exams in Python. The professor writes each task's instructions, rubric, and public and hidden tests by hand. Students solve the tasks in a browser editor, run the public tests in their own browser, and submit. After the exam closes, the hidden tests run in the professor's browser, the AI suggests points for the rubric criteria, and the professor confirms every score before releasing the results and grades. This is Part 1: no student code runs on the server, and it is used only with demo and test users.

## Setup

You need Node 22 or newer (CI uses 26) and pnpm 10.34.9 (`npm install -g pnpm@10.34.9`).

```sh
pnpm install
pnpm db:reset
pnpm dev
```

- Create no `.dev.vars` for local work. The local values (`APP_ENV`, `APP_ORIGIN`, `DEMO_MODE`, `AI_PROVIDER=fake` and the rest) are in `[vars]` in `apps/api/wrangler.toml`, and no code reads a secret until OAuth arrives in M2.
- `pnpm db:reset` creates the local database with the demo data. Stop `pnpm dev` before you run it again.
- `pnpm dev` starts the app at http://localhost:5173 (it forwards `/api` to the API), the API at http://localhost:8787 and the runner site at http://localhost:5174.
- Open http://localhost:5173 and pick a demo account under "Demo accounts": Demo Professor, or the students Ana Novak, Bor Kranjc and Cvetka Zupan (`docs/demo-data.md`).

## Everyday commands

See `docs/conventions.md` section 7.

## Before your first task

Read `docs/conventions.md`, then your role file in `docs/roles/`.

## License

MIT, see `LICENSE`.
