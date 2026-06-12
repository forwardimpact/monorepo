# Spec 1700 — Trace redaction must cover encoded credential forms

**Status:** draft **Persona / job:** Teams Using Agents —
[Run a continuously improving agent team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team).
The team's trust in its own trace artifacts depends on those artifacts being
safe to retain and share; a redactor that silently misses a credential breaks
that trust. **Origin:** Finding
[#1557](https://github.com/forwardimpact/monorepo/issues/1557), item (d) split
from [#1555](https://github.com/forwardimpact/monorepo/issues/1555).

## Problem

At the 2026-06-10 incident, the `libeval` trace redactor scrubbed only **raw**
credential bytes. It missed the credential when it appeared **encoded** — and
that gap let a live, write-capable GitHub App installation token reach a
retained trace artifact.

Evidence (at-incident state; Scope § Baseline records what has since shipped):

| Fact           | Detail                                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmed leak | Workflow run `27288359408` (release-engineer run-252, 2026-06-10T15:52Z) wrote the installation token to its NDJSON trace artifact `trace--default` (id `7541084033`, retained until 2026-09-08)                                                                                            |
| Form           | `AUTHORIZATION: basic <base64(x-access-token:ghs_…)>` — git's stored `http.extraheader` basic-auth credential, captured into a `tool_result` when an agent ran a routine `git config` / `gh auth status` diagnostic                                                                         |
| Why it passed  | The redactor's env-allowlist layer tests `includes(rawToken)`; its pattern layer matches raw prefixes (e.g. the `ghs_` installation-token shape). base64 encoding removes the raw `ghs_` substring and means the raw token value is not a substring of the blob, so **neither layer fires** |
| Corroboration  | Across all 41 success/failure `kata-*` traces of 2026-06-10, the raw token form appears **zero** times (raw redaction works) while the base64 form is present and unredacted in the one run — the redactor is active but encoding-blind                                                     |

The redactor is the defense-in-depth layer that is supposed to make trace
artifacts safe regardless of agent behavior (`core.setSecret` masks Actions step
logs only — the uploaded NDJSON trace artifact is not rewritten by it). A
same-day containment assessment recorded the redactor as "verified live" for
trace artifacts; that assurance held for the raw form and was incomplete for the
encoded form.

The durable problem is not the one expired token: it is that the safety net
missed a credential form agents surface through legitimate, increasingly common
operations. The observed `extraheader` form is since closed at the pattern layer
([PR #1559](https://github.com/forwardimpact/monorepo/pull/1559) — see Scope §
Baseline). The live residual — the present-tense problem this spec carries — is
the env-allowlist layer: it still tests only `includes(rawToken)`, so the
standard base64 of **any** env-allowlisted secret, bare or embedded at any byte
offset within a larger plaintext, passes unredacted (success criterion 2). The
`extraheader` credential fallback is now a routine agent move (release-engineer
runs 241 / 247 / 252 / 255 on 2026-06-10 alone, per the
[#1555](https://github.com/forwardimpact/monorepo/issues/1555) evidence table),
so encoded credentials stay on the hot path — and one pattern-layer regex covers
exactly one composition of them. The leaked token itself was bounded by its ~1h
time-to-live and is now inert, and the App private key never entered any trace
— so this is a durable-control gap, not an active incident.

## Scope

**In scope** — the redaction contract in the `libeval` trace-redaction component
(the `Redactor` and its construction helper) and the credential shapes it
recognizes. The redactor runs on every trace event across the facilitate /
discuss / supervise / run / benchmark / judge surfaces; the change is to what it
recognizes, applied once at that shared component.

**Recognized leak surface to close** — credential material that appears
**base64-transformed** rather than raw in trace events. Two concrete forms, both
derivable by encoding a value the redactor already knows (so no arbitrary blob
need be decoded):

- the HTTP basic-auth `extraheader` wrapper — `AUTHORIZATION: basic <b64>` where
  `<b64>` is the standard base64 of `x-access-token:<token>` — that git stores
  and agents surface via `git config` / `gh auth` diagnostics;
- the standard base64 encoding of any value the env-allowlist already protects,
  **at any byte offset within the encoded plaintext** — not only the bare
  encoding starting at byte 0. A secret embedded mid-plaintext (e.g. basic-auth
  `user:secret` with an arbitrary username, the same composition as the observed
  leak) produces a shifted character stream that a bare-encoding match misses;
  the contract covers it. "Standard base64" includes the **unpadded** variant
  (same alphabet, trailing `=` stripped) — matching must not depend on padding.

**Baseline — pattern-layer half already shipped.**
[PR #1559](https://github.com/forwardimpact/monorepo/pull/1559) (merged
2026-06-10T17:16Z) delivers pattern-layer coverage of the `extraheader` form.
Criteria 1 and 4 are therefore satisfied at the pattern layer and criterion 5's
benign guard is partially exercised. The
**net-new scope this spec carries** is criterion 2 (env-layer encoded coverage,
including the offset case above) and criterion 6 (contract documentation). The
design phase must state explicitly whether the env layer's encoded coverage
deliberately overlaps the pattern layer on the `extraheader` form
(defense-in-depth) or defers to it — the overlap is a decision to record, not an
accident to discover.

**Excluded:**

- The **wiki-commit sink.** The redactor runs only at the trace-write boundary;
  content an agent authors into a wiki commit is never passed through it. This
  spec does not change that — it closes the trace-artifact sink only. (The
  2026-06-10 audit found wiki commits clean; the wiki sink is a separate concern
  if it ever needs a control.)
- **Encodings other than standard base64** — URL-safe base64 (`-`/`_` alphabet),
  hex, percent-encoding, or compressed-then-encoded forms. Only standard base64
  (padded or unpadded — see In scope) is a routine agent-surfaced form today;
  the others are out of scope for this spec and tracked separately if they
  appear.
- Stopping agents from reading git's stored credential, or sanctioning an
  alternative re-auth path — that is
  [#1555](https://github.com/forwardimpact/monorepo/issues/1555) item (a) (spec
  1690). This spec is independent defense-in-depth and must hold whether or not
  (a) ships.
- Least-privilege token narrowing and the probe-hygiene agent-guidance checklist
  — the separate F1/F2 findings already recorded on #1555.
- Any blanket "decode every base64 blob and re-scan" approach. base64 is
  ubiquitous in trace events (file contents, tool output); whichever mechanism
  is chosen must not impose that cost or its false-positive surface. Because
  both in-scope forms are derived by **encoding a known value** rather than
  decoding an unknown one, the contract is satisfiable without it — this holds
  for the offset case too, since a secret's base64 form at each of the three
  byte-offset alignments is computable from the secret alone. How is a design
  question, not a spec decision.

## Success criteria

Criteria 1, 2, and 5 must hold for **arbitrary** secret values, not the captured
fixture — a single hard-coded literal matching only run `27288359408`'s bytes
must fail criteria 1 and 2. Criterion 4's regression reconstructs the leaked
shape with a synthetic token — the literal leaked bytes were never recorded —
matching the finding's redacted fingerprint structure.

| #   | Criterion                                                                                                                                                                                                                                                                                                                                                                                      | Verify                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The redactor replaces the `extraheader` basic-auth form (`AUTHORIZATION: basic <b64>`, `<b64>` = base64 of `x-access-token:<value>`) for an arbitrary allowlisted-token value, with the same placeholder discipline as raw matches.                                                                                                                                                            | A redaction test feeds the `extraheader` string built from a synthetic (non-fixture) allowlisted token and asserts the value no longer appears: `bun test libraries/libeval/test/redaction-matching.test.js`.                                                                                                                                      |
| 2   | The redactor replaces the standard base64 encoding of any env-allowlisted secret value **at any byte offset within the encoded plaintext** — bare (offset 0) and embedded inside a larger plaintext (e.g. `user:secret` with an arbitrary username) — parameterized over the full `DEFAULT_ENV_ALLOWLIST` (not only the `extraheader` wrapper), in both padded and unpadded standard base64. | A redaction test iterates `DEFAULT_ENV_ALLOWLIST`, feeds per name the bare base64 of a synthetic value **and** the base64 of a larger plaintext embedding it at each of the three byte-offset alignments (offsets 0/1/2 mod 3 cover all phase shifts), and asserts in each case that the secret is not recoverable: `bun test libraries/libeval/test/redaction-matching.test.js`. |
| 3   | Raw-form redaction and the opt-out / fail-loud-when-disabled behavior are unchanged.                                                                                                                                                                                                                                                                                                           | The existing redaction suite passes unmodified except for additions: `bun test` over `libraries/libeval/test/redaction-matching.test.js` and `redaction-opt-out.test.js`.                                                                                                                                                                          |
| 4   | A trace event of the exact shape that leaked in run `27288359408` — `gh auth status` / `git config …extraheader` output carrying `AUTHORIZATION: basic <b64>` — is fully redacted.                                        | A redaction test feeds a reconstructed diagnostic-output event and asserts no token survives: `bun test libraries/libeval/test/redaction-matching.test.js`.                                                                                                                                                                                        |
| 5   | The redactor leaves ordinary base64 content that encodes no allowlisted secret unchanged (no false-positive blanket decoding).                                                                                                                                                                                                                                                                 | A redaction test feeds representative base64 trace content (a file blob, tool output) carrying no secret and asserts it is returned unchanged: `bun test libraries/libeval/test/redaction-matching.test.js`.                                                                                                                                       |
| 6   | The `Redactor` contract documentation states that coverage includes the in-scope encoded forms and names its boundary (standard base64 only; trace-write sink only), so the next reader does not re-assume raw-only coverage.                                                                                                                                                                  | The `Redactor` class contract documentation in the redaction module asserts encoded-form coverage and its boundary.                                                                                                                                                                                                                                |

## Out of band

The existing leaked artifact (`7541084033`) and any purge decision are tracked
on #1557. The leaked token is expired; no rotation is owed.
