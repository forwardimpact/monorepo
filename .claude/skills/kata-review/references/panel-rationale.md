# Panel Rationale

Why `kata-review` callers use review panels, and why each panel has the size
and scope it does. The normative procedure lives in
[caller-protocol.md](caller-protocol.md).

## Why a Panel

Cold sub-agents produce uncorrelated errors. A finding flagged by ≥⌈N/2⌉
reviewers is high-signal; singletons get verified but often prove noise. Odd N
enables majority voting.

## Why These Sizes

Implementation diffs get 5: the artifact is larger, the step irreversible
(code lands on `main`), and the bug/security surface largest; earlier
artifacts get an implicit second pass at the next phase.

The product panel applies only to specs, where product alignment is decided;
downstream phases inherit it via cross-phase fidelity checking.

## Why the DevEx Panel

Maintainability and correctness are distinct verdicts. Whether a change is
correct (the technical panel) and whether it leaves the codebase healthy —
consistent, free of duplication and dead paths, no new debt — are answered by
different questions, so debt review is a separate panel, not a lens folded into
the technical panel where the two would collapse into one. It runs on design,
plan, and implementation (never specs, which carry no code) at size 3 across all
three phases: debt findings are lower-variance than the bug and security surface
that earns the implementation technical panel its size of 5.
