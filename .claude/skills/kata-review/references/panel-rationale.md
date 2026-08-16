# Panel Rationale

This document explains why `kata-review` callers use review panels. It also
explains the intent behind each `reviewPanel` profile. The normative procedure
lives in [caller-protocol.md](caller-protocol.md), and the profile table in
[settings.md](settings.md).

## Why a Panel

Cold sub-agents produce uncorrelated errors. A finding that ≥⌈N/2⌉ reviewers
flag is high-signal. The caller verifies singletons, but they often prove to be
noise. An odd N lets the panel vote by majority.

## Why These Profiles

`standard` reproduces the panel sizes the spec → design → plan → implement arc
used before the settings file existed. `light` serves solo maintainers and
teams on metered tokens. `thorough` serves risk-averse organizations. In every
profile the implementation panels are never smaller than the other panels in
the same profile: the artifact is larger, the step is irreversible because
code lands on `main`, and the bug and security surface is largest. Earlier
artifacts get an implicit second pass at the next phase.

The product panel applies only to specs. Specs decide product alignment.
Downstream phases inherit it through the cross-phase fidelity check.

## Why the DevEx Panel

Maintainability and correctness are distinct verdicts. One question asks
whether a change is correct. The technical panel answers it. A different
question asks whether the change leaves the codebase healthy. A healthy
codebase is consistent, free of duplication and dead paths, and carries no new
debt. So debt review gets a separate panel. A lens inside the technical panel
would collapse the two verdicts into one. The DevEx panel runs on design, plan,
and implementation (never specs, which carry no code). Its sizes come from the
same profile table. Debt findings are lower-variance than the implementation
bug and security surface, so no profile gives devex a larger panel than the
technical panel it accompanies.
