# Design 1690 — Dispatch Session Token Lifetime

Architecture for [spec 1690](spec.md): a sanctioned in-session re-auth path,
deterministic TTL/expiry accounting via a token-paired stamp, and a
githubstatus-first auth-anomaly playbook. Grounds on the closed evidence
partition (68 runs at 2026-06-10T16:50Z — 19 success / 46 cancelled / 1
failure / 2 in flight; invariant: exactly one failure, zero blocked work) and
the RE falsifier dataset (`wiki/metrics/gh-token-sightings/2026.csv`).

## Components

| Component | Surface | Owns |
|---|---|---|
| **Mint+stamp** | The `GH_TOKEN`-exporting `env:` of the `Assess and Act` step in `kata-dispatch.yml`; the sibling `kata-agent` composite's `Assess and Act` step ([`.github/CLAUDE.md`](../../.github/CLAUDE.md) § `IS_SANDBOX`) | Export `GH_TOKEN` plus a paired stamp env var (`KATA_GH_TOKEN_STAMP`: mint time, expiry, run id, run attempt) into the **same step env** the agent SDK reads (b) |
| **Re-auth helper** | A privileged mint helper the dispatch infra (the composite action / a sidecar process) exposes to the session, holding the key **outside the SDK-forwarded env** | On request, mint a fresh installation token + stamp and write them to a session-readable file; the helper, not the session, holds `KATA_APP_PRIVATE_KEY` (a) |
| **Token accounting** | The (c) playbook's boot + pre-write-batch checks | Read the stamp, compute TTL + issuing-job-execution validity, all clock-only |
| **Auth-anomaly playbook** | New `.claude/agents/references/auth-anomaly.md` | Codify the SE falsifier verbatim + gate + (c1)–(c3) + honesty note |
| **Playbook link** | The reference list inside each agent profile (`.claude/agents/*.md`), where memory/coordination protocols are already linked | Make the playbook reachable from a surface agents already load |

## Data flow

```mermaid
sequenceDiagram
  participant Helper as Re-auth helper (holds key, outside SDK env)
  participant Env as Step env + session-readable file
  participant Agent as Agent session
  participant Play as auth-anomaly playbook
  Helper->>Env: export GH_TOKEN + KATA_GH_TOKEN_STAMP into step env (job start)
  Agent->>Play: boot check (clock vs stamp)
  Play-->>Agent: "expires in N min" | "issuing job ≠ current ⇒ dead"
  Agent->>Play: pre-write-batch check
  alt token expired per stamp
    Agent->>Helper: request re-auth
    Helper-->>Env: write fresh token + fresh stamp to session-readable file
  else gated 401 (unexpired + control read 200)
    Play->>Play: githubstatus probe + retry; live+retro incident check
    Play-->>Agent: falsifier fire ⇒ file sighting, route to SecE
  end
```

## Key Decisions

| # | Decision | Why | Rejected alternative |
|---|---|---|---|
| D1 | Stamp is a **single env var** (`KATA_GH_TOKEN_STAMP`) carrying mint-epoch, expiry-epoch, run-id, run-attempt as one structured value, exported into the **same step env that exports `GH_TOKEN`** (the `Assess and Act` step env the SDK forwards) | Spec (b): the stamp must ride the **same surface** as the token so no carried/resumed state can cross-pair a token with another's stamp | Separate env vars per field — divisible, so resume can pair a live token with a stale mint time; a divorced stamp silently reports a dead token fresh |
| D2 | Re-auth is a **helper the infra exposes to the session** (composite-owned process / sidecar); on request it mints and writes a fresh token+stamp to a session-readable **file**, since the session step env is fixed at step start and cannot be re-set mid-run; `KATA_APP_PRIVATE_KEY` stays with the helper, never in the SDK-forwarded env | Spec (a) private-key isolation; the session env is immutable mid-run (spec scope (a)), so a file is the only surface a running session can re-read | Re-export into session env — the env is fixed at step start; passing the private key into the session — forbidden by design constraint |
| D3 | Accounting is **clock arithmetic only**, computed in the playbook the agent follows, against the D1 stamp — no API call in the check path | Spec gap 2: a 401 probe cannot attribute (token death vs platform fault indistinguishable), cannot anticipate mid-batch expiry, and the writes-vs-reads probe is blind to full expiry | API probe for freshness — the exact defect the spec rejects |
| D4 | Issuing-job-execution identity = **run id + run attempt** compared locally; "issuing job ≠ current ⇒ presumed revoked" | Spec (b): a re-run attempt shares `GITHUB_RUN_ID`; run-id-only comparison passes a revoked attempt-1 token in attempt 2 | Run id alone — coarse; lets a carried attempt-1 token read as fresh on both axes |
| D5 | (a)-issued re-mint **inherits revocation** (dies at issuing job completion) and **is stamped** like any governed token | Spec (a)/(b): a late re-mint must not outlive its job as a live credential, and would otherwise be the one unstamped token in the post-TTL window (a) exists for | Long-lived re-mint — breaks the "dead string after job" invariant; unstamped re-mint — the accounting blind spot |
| D6 | Playbook is a **new shared reference** (`auth-anomaly.md`), prescription not history, with the run-254 honesty note in-text, linked from each agent profile's reference list | Spec (c): new surface alongside memory/coordination protocols, reachable from a surface agents already load (the profiles) | Fold into `coordination-protocol.md` — different concern (auth recovery vs handoff), bloats an unrelated doc |
| D7 | Playbook defines **stampless-surface conduct**: control-read + githubstatus discipline standalone; persistent gated 401 ⇒ unattributable record-and-degrade, never a falsifier fire | Spec governance boundary: surfaces without a (b) stamp (other agents load the playbook) lack the shape-1 gate; fire-condition (2) requires the stamp | Silent on stampless surfaces — leaves the unrouted cell that licenses harvest craft |

## Cross-repo delivery (sequencing constraint, not architecture)

The `kata-agent` composite is a sibling repo. Per
[`.github/CLAUDE.md`](../../.github/CLAUDE.md) § Editing a published action,
its (a)/(b) edits land via append-only patch tag → Dependabot SHA-bump PR, and
under the [#1547](https://github.com/forwardimpact/monorepo/issues/1547)
forbearance clause a manual sibling SHA-bump PR waits ≤7 days for the weekly
sweep unless urgency applies, carrying tag↔SHA verification evidence. The
monorepo PR therefore lands: the `kata-dispatch.yml` mint+stamp+re-auth surface,
the playbook, and the profile links — the in-repo deliverables — and **files an
Issue with the composite diff** for the sibling (agent tokens scope to
`kata-agent-team` only, no sibling push rights). The agent-loaded playbook (c)
is independent of the composite and merges regardless (spec § phased delivery).
Adjacent [#1548](https://github.com/forwardimpact/monorepo/issues/1548) is noted,
not folded.

## Clean break

The checkout-extraheader harvest is **removed from sanctioned conduct**, not
shimmed: the playbook names it permanently excluded (c3), and (a) supersedes its
only use case. No fallback path to the harvest survives. Until (a) ships,
record-and-degrade is the sole sanctioned terminal move (spec § phased
delivery) — this is the spec's named compat wording, not a design shim.

## Out of scope (per spec § Excluded)

(d) transcript token-masking (SE-owned, finding #1557); least-privilege token
narrowing; exposing `KATA_APP_PRIVATE_KEY` to sessions; sanctioning the harvest;
platform-fault remediation.

— Staff Engineer 🛠️
