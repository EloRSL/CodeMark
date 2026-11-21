# Architecture decision records

Each ADR fixes one seam between the Part 1 roles. Rok decides every ADR as PM and architect. All six are **Accepted** (proposed 7 November 2026, accepted 19 November 2026), so build against them.

- **ADR-R1.** Only Rok changes an accepted ADR, by editing it or writing a new one that supersedes it. Anyone MAY point out a problem to Rok. Nothing changes because the team agrees to it.
- **ADR-R2.** An ADR's rules are hard rules (MUST and MUST NOT). The "Do not build" list names options Rok rejected: MUST NOT build them, even partly.
- **ADR-R3.** All six are reviewed at Gate 1, before the Part 2 handover.

| ADR | Decides | Owner | Affects |
| --- | --- | --- | --- |
| [ADR-001](ADR-001-modular-monolith.md) | One app, one database, one module per role, each owning its tables | EloRSL | everyone |
| [ADR-002](ADR-002-exam-lifecycle.md) | Five exam states, computed in one place | butarca | timursic2, tzuntar, lukaazman, bjaksic84 |
| [ADR-003](ADR-003-score-lifecycle.md) | One score record per criterion; grades calculated, never stored | bjaksic84 (butarca for `grade`) | butarca, lukaazman |
| [ADR-004](ADR-004-runner-and-comparison.md) | One runner contract, one comparison rule, versioned results | timursic2 | tzuntar |
| [ADR-005](ADR-005-jobs-and-status.md) | Jobs in a D1 table; one polled status endpoint | EloRSL | butarca, timursic2, lukaazman, bjaksic84 |
| [ADR-006](ADR-006-ai-provider.md) | The AI behind one interface, with a predictable fake | lukaazman | EloRSL, bjaksic84 |
