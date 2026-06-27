# Plan 1270 — Part 07: `TRUST.md`

Authors `TRUST.md` at the repository root and links it from
operator-facing documentation. Independent of every other part;
can run at any time. Docs-only.

## Step 1 — Open the STATUS sub-row

Append `1270/trust-md\tplan\tapproved` to `wiki/STATUS.md`.

## Step 2 — Author `TRUST.md`

Created files: `TRUST.md` (repository root).

The document carries one top-level (`##`) heading for each of the six
aspects listed in [spec § Proposal 5](spec.md#5-published-trust-model),
in the same order and with the same wording as the spec list, and a
hosted-vs-self-hosted comparison column per aspect:

1. **Secrets the hosted operator holds.**
2. **Message content the hosted operator sees.**
3. **Workflow runs the hosted operator can observe.**
4. **The BYOK Anthropic boundary.**
5. **What the hosted workflow-identity capability can mint and on
   whose behalf.**
6. **Surfaces the hosted operator cannot reach.**

Per-aspect prose ties to the design's decisions; each section ends
with a one-line link to the relevant part of `design-a.md` and
`spec.md` for the reader who wants the details.

Verification: `rg "^## " TRUST.md | wc -l` returns 6; the section
headings match the spec § Proposal 5 wording verbatim; each section
contains the string `Hosted` and the string `Self-hosted`.

## Step 3 — Link `TRUST.md` from operator-facing docs

Modified files:

- `.claude/skills/kata-setup/SKILL.md` (Read section adds a one-line
  link to `TRUST.md`).
- `services/ghbridge/README.md` (overview section adds a one-line
  link).
- `services/msbridge/README.md` (overview section adds a one-line
  link).

Verification: `rg "TRUST.md" .claude/skills/kata-setup/SKILL.md
services/ghbridge/README.md services/msbridge/README.md` returns
three matches.

## Step 4 — Close the STATUS sub-row

Update `wiki/STATUS.md`: `1270/trust-md\tplan\tapproved` →
`1270/trust-md\tplan\timplemented`.

When this is the last sub-row to flip, the master `1270\tplan\tapproved`
row also advances to `1270\tplan\timplemented`. The implementer of
this final part is responsible for that master advancement (see plan-a.md
parts index).

## Risks

- **Aspect-count or wording drift.** If the spec § Proposal 5 list
  is revised before this part ships, the headings drift. Step 2
  verification pins both the count (6) and verbatim wording per the
  spec; a spec amendment requires re-issuing this part's PR.

- **External link rot.** The cross-links to `design-a.md` and
  `spec.md` are internal repo paths and are stable.

## Libraries used

None.
