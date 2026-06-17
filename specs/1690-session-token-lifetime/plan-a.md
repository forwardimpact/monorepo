# Plan 1690 — Dispatch Session Token Lifetime

Executes [design-a.md](design-a.md) for [spec.md](spec.md). Read both first.

## Approach

Land the three in-repo deliverables in order: the (c) auth-anomaly playbook,
its links from all six agent profiles, then the `kata-dispatch.yml` stamp
surface. The in-repo (b) deliverable is the **stamp** (`KATA_GH_TOKEN_STAMP`)
exported into the same `Assess and Act` step env as `GH_TOKEN`. The (a) re-auth
**helper cannot live in `kata-dispatch.yml`**: workflow steps run sequentially,
so no separate key-holding step runs concurrently with the agent's `Assess and
Act` step to deliver fresh credentials mid-run, and the agent's own step must
not hold `KATA_APP_PRIVATE_KEY` (design D2 — the SDK forwards its env). The
helper is therefore **composite-owned** (`fit-eval`/`kata-agent`, which wraps
the agent process and can hold the key outside the SDK-forwarded env), and ships
as a sibling-composite edit via the Step 4 filed Issue — agent tokens scope to
`kata-agent-team` only, no sibling push rights (§ Editing a published action).
Phasing is spec-sanctioned: the playbook merges regardless (§ phased delivery),
and (c3)'s record-and-degrade is the terminal move until (a) lands in the
composite, superseding into re-auth thereafter.

Libraries used: none.

## Step 1 — Create the auth-anomaly playbook

Codify spec § (c) as prescription. Files created:
`.claude/agents/references/auth-anomaly.md`.

Sections, mapping to spec success criteria:

- **Token accounting** (design D3/D4): boot + pre-write-batch checks computing
  "expires in N minutes" by clock arithmetic against `KATA_GH_TOKEN_STAMP`
  (mint/expiry epoch); issuing-job validity = `GITHUB_RUN_ID` + `GITHUB_RUN_ATTEMPT`
  equality vs the current job — "issuing job ≠ current ⇒ presumed revoked",
  no API call.
- **Gate** (spec (c)): unexpired per stamp AND control read `GET /rate_limit`
  → 200; 403/404 never count; the control-read-*fails* cell routes to the
  githubstatus + retry discipline below, never component theorizing or harvest.
- **Falsifier (verbatim from spec § (c))**: fires when ALL of (1) 401 persists
  through ≥2 attempts ~5s apart; (2) unexpired per (b) + control read passes;
  (3) no covering incident, checked twice (live + retroactive ≥30–60 min against
  full incident history, bracket condition). Two-stage provisional→confirmed;
  one confirmed sighting fires; on fire stop workaround craft, file the sighting
  (endpoint-class × verb × client), route to security-engineer.
- **(c1)** unauthenticated githubstatus probe; **(c2)** read-back dedup before
  any non-idempotent re-POST; **(c3)** termination → check token age +
  issuing-job state per (b); the checkout-extraheader harvest is **permanently
  excluded**; terminal fallback = record-and-degrade, superseding into the (a)
  re-auth path once it ships, record-and-degrade until then.
- **Stampless-surface conduct** (design D7): on a surface without the stamp the
  control-read + githubstatus discipline applies standalone; a persistent gated
  401 there classifies unattributable (record-and-degrade, no falsifier fire,
  since fire-condition (2) needs the stamp).
- **Honesty note (required text)**: run-254 actually probed githubstatus *last*
  and produced a retracted attribution; the rule is motivated by, not descended
  from, that practice.

Verify: `rg -c 'githubstatus' .claude/agents/references/auth-anomaly.md` finds
the gate/probe text and `rg 'run-254' .claude/agents/references/auth-anomaly.md`
finds the honesty note; the repository check command
([CONTRIBUTING.md § DO-CONFIRM](../../CONTRIBUTING.md)) passes (it runs the
context-limit / instructions gate on `.claude/**`).

## Step 2 — Link the playbook from all six agent profiles

Add a `**Auth anomalies**` bullet to each profile's reference block, beside the
existing Memory/Coordination bullets. Files modified:
`.claude/agents/{improvement-coach,product-manager,release-engineer,security-engineer,staff-engineer,technical-writer}.md`.

Insert immediately after the Coordination bullet in each, matching that file's
existing link-text style — bare `[auth-anomaly]` where the file uses bare
`[memory-protocol]` (security-engineer, staff-engineer, technical-writer),
`[auth-anomaly.md]` where it uses `[memory-protocol.md]` (improvement-coach,
product-manager, release-engineer):

```md
- **Auth anomalies**:
  [auth-anomaly](.claude/agents/references/auth-anomaly.md)
```

Verify: `rg -c 'auth-anomaly' .claude/agents/*.md` reports one match in each of
the six profiles, and in each the new bullet immediately follows the
two-line Coordination bullet (label + indented `coordination-protocol` link).

## Step 3 — Export the token stamp in kata-dispatch.yml

Add the (b) stamp to the same step env as `GH_TOKEN`. The (a) re-auth helper is
composite-owned and ships via Step 4 (see Approach). Files modified:
`.github/workflows/kata-dispatch.yml`.

Concrete change:

- After the `ci-app` step (lines 86–91), add a `run:` step that captures mint
  time and writes the stamp to `$GITHUB_ENV` so it is one value available to the
  later step env (`mint+3600` is the conservative TTL floor — the mint action
  exports no expiry, and the spec's "~1 hour" makes a fixed 3600s a safe
  under-estimate, never an over-estimate; see Risks):
  ```yaml
  - name: Stamp token
    run: |
      mint=$(date +%s)
      echo "KATA_GH_TOKEN_STAMP=mint=$mint;exp=$((mint+3600));run=${GITHUB_RUN_ID};attempt=${GITHUB_RUN_ATTEMPT}" >> "$GITHUB_ENV"
  ```
- In the `Assess and Act` step `env:` block (where `GH_TOKEN` is set, line 123),
  add the stamp beside the token so both ride the same step env (design D1):
  ```yaml
          GH_TOKEN: ${{ steps.ci-app.outputs.token }}
          KATA_GH_TOKEN_STAMP: ${{ env.KATA_GH_TOKEN_STAMP }}
  ```

Verify: `rg -A1 'GH_TOKEN: \$\{\{ steps.ci-app' .github/workflows/kata-dispatch.yml`
shows `KATA_GH_TOKEN_STAMP` on the next line within the same `env:` block;
`rg -n 'KATA_APP_PRIVATE_KEY' .github/workflows/kata-dispatch.yml` shows it only
at the `ci-app` mint step (91) and the `fit-wiki` push step (145) — never in the
`Assess and Act` `env:` block; the repository check command passes.

## Step 4 — File the sibling composite Issue

The `kata-agent` composite needs the matching mint+stamp+re-auth edit, delivered
via append-only patch tag → Dependabot SHA-bump per
[`.github/CLAUDE.md`](../../.github/CLAUDE.md) § Editing a published action.
Action (not a repo file change): file an Issue with the composite `action.yml`
diff per § Editing a published action (agent tokens scope to `kata-agent-team`
only, so a sibling push is not available — the Issue carries the diff for a
human/Dependabot to land). Include the #1547 forbearance/sequencing note (≤7-day
weekly-sweep wait, tag↔SHA verification evidence). Note adjacent #1548, do not
fold. Record the Issue number in the PR body.

Verify: Issue exists with the diff and the sequencing note; the monorepo PR body
links it.

## Risks

- **Mint-time skew**: `date +%s` runs one step after `create-github-app-token`,
  so the recorded mint epoch trails true mint by ≤1s — negligible against the
  3600s TTL, but it means the stamp's `exp` is a conservative floor, not the
  exact token expiry. Acceptable; do not tighten by probing the token.
- **(a) coverage lands in the sibling, not this PR**: the spec's two coverage
  shapes (past-TTL mid-run, resumed dead carried token) and the
  (a)-issued-token-revoked criterion are only fully exercisable once the
  composite ships the helper (Step 4). This PR's evidence covers the stamp and
  the no-private-key-in-session criteria; the (a) write-through criteria are
  satisfied on the sibling SHA-bump, not at this merge.
- **Stamp/token divorce on resume**: a resumed session reading a carried token
  must read that token's carried stamp. The single-env-var design (D1) prevents
  cross-pairing structurally, but the resume-shape success criterion is only
  verifiable end-to-end after the sibling helper lands; until then, assert the
  structural property (one env var, never divided) by inspection.

## Execution

Single engineering agent, sequential: Step 1 → 2 → 3 → 4. Steps 1–3 are
code/doc in this repo; Step 4 is an Issue filing. `technical-writer` is not
routed — the playbook is agent-operational prescription, not product
documentation.

— Staff Engineer 🛠️
