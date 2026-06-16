# Plan 1272 Part 04 — Move D: kata-setup hosted template version pins

Implements design [Move D](design-a.md) (criterion 8, first clause): the
kata-setup hosted templates pin the **minimum** sibling-action versions of
`forwardimpact/kata-agent` (and the `fit-eval` action used by `workflow-react`)
that accept the `installation-token` input. Read [spec § criterion 8 + Risks](spec.md)
and design Key Decision 7 before executing.

The hosted templates already emit `installation-token:
${{ steps.mint.outputs.token }}` (`workflow-agent.md` § Template (Hosted), step
3); no template body rewrite is needed. The monorepo-side work is the pin alone.

Libraries used: none (skill-markdown + version-pin guidance edit).

## Blocked-on (external)

This part lands only after the sibling repos tag the versions that accept
`installation-token`:

- `forwardimpact/kata-agent` — `installation-token` input acceptance.
- `forwardimpact/fit-eval` — `installation-token` input acceptance (the
  `workflow-react.md` hosted delta passes it; see workflow-react.md:116).

Token acceptance is verified in the sibling repos' own CI (criterion 8, second
clause), outside this repo. Do **not** gate this part's local verification on a
cross-repo run.

## Step D1 — Pin the minimum token-accepting sibling versions

One sentence: record, in the hosted "Resolving Action Refs" guidance, the
minimum sibling release that accepts `installation-token` so the generated pin
can never resolve below it.

- Modified: `.claude/skills/kata-setup/references/workflow-agent.md`
  (canonical hosted recipe — § Resolving Action Refs)

Concrete change: in § Resolving Action Refs, add a hosted floor: when generating
a **hosted** workflow, the picked `vX.Y.Z` tag for `kata-agent` (and `fit-eval`
for `workflow-react`) must be **≥ the minimum version that accepts
`installation-token`**; name that minimum explicitly (e.g.
`kata-agent ≥ v1.M.P`, `fit-eval ≥ v1.M.P`). If the highest available tag is
below the floor, stop and tell the operator the sibling release has not shipped
yet — never emit a pin below the floor and never fall back to a mutable tag.
Keep the existing self-hosted resolution rule unchanged.

Verification: `rg -n "installation-token" .claude/skills/kata-setup/references`
shows the hosted floor recorded alongside the emit line; the self-hosted
resolution rule is unchanged.

## Step D2 — Cross-reference the floor from the dependent templates

One sentence: point `workflow-facilitate.md` and `workflow-react.md` at the
canonical floor so all three hosted recipes pin consistently.

- Modified: `.claude/skills/kata-setup/references/workflow-facilitate.md`
  (the § Hosted variant note at workflow-facilitate.md:110–126),
  `.claude/skills/kata-setup/references/workflow-react.md`
  (the § Hosted variant note at workflow-react.md:116–122)

Concrete change: update each "depends on `kata-agent`/`fit-eval` accepting an
`installation-token` input" note to read "pin the minimum sibling version that
does — see [`workflow-agent.md` § Resolving Action Refs]". No template YAML
changes.

Verification: both files reference the canonical floor in § Resolving Action
Refs; no duplicated floor numbers (one home — workflow-agent.md).

## Risks

- The floor version numbers are only known once the siblings tag; until then,
  Step D1 must stop-and-ask rather than guess a number. Do not land a placeholder
  pin — an under-floor pin silently re-opens the gap on every kata-setup re-run
  (design Key Decision 7 rejected operator-managed versions for exactly this
  reason).

— Staff Engineer 🛠️
