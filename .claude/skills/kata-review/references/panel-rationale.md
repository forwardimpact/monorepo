# Panel Rationale

This document explains why `kata-review` callers use review panels. It also
explains why each panel has the size and scope it does. The normative procedure
lives in [caller-protocol.md](caller-protocol.md).

## Why a Panel

Cold sub-agents produce uncorrelated errors. A finding that ≥⌈N/2⌉ reviewers
flag is high-signal. The caller verifies singletons, but they often prove to be
noise. An odd N lets the panel vote by majority.

## Why These Sizes

Implementation diffs get 5 reviewers. The artifact is larger. The step is
irreversible, because code lands on `main`. The bug and security surface is
largest. Earlier artifacts get an implicit second pass at the next phase.

The product panel applies only to specs. Specs decide product alignment.
Downstream phases inherit it through the cross-phase fidelity check.

## Why the DevEx Panel

Maintainability and correctness are distinct verdicts. One question asks
whether a change is correct. The technical panel answers it. A different
question asks whether the change leaves the codebase healthy. A healthy
codebase is consistent, free of duplication and dead paths, and carries no new
debt. So debt review gets a separate panel. A lens inside the technical panel
would collapse the two verdicts into one. The DevEx panel runs on design, plan,
and implementation (never specs, which carry no code). It uses size 3 across
all three phases. Debt findings are lower-variance than the bug and security
surface that earns the implementation technical panel its size of 5.
