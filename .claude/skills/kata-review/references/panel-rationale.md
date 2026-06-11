# Panel Rationale

Why `kata-review` callers use review panels, and why each panel has the size
and scope it does. The normative procedure lives in
[caller-protocol.md](caller-protocol.md).

## Why a panel

Cold sub-agents produce uncorrelated errors. A finding flagged by ≥⌈N/2⌉
reviewers is high-signal; singletons get verified but often prove noise. Odd N
enables majority voting.

## Why these sizes

Implementation diffs get 5: the artifact is larger, the step irreversible
(code lands on `main`), and the bug/security surface largest; earlier
artifacts get an implicit second pass at the next phase.

The product panel applies only to specs, where product alignment is decided;
downstream phases inherit it via cross-phase fidelity checking.
