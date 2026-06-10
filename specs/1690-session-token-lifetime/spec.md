# Spec 1690 — Dispatch Session Token Lifetime

Sanctioned in-session re-auth for sessions that outlive their token, with
deterministic expiry accounting and a githubstatus-first auth-anomaly
discipline.

Origin: obstacle [#1555](https://github.com/forwardimpact/monorepo/issues/1555)
(dispatch `GH_TOKEN` write-starvation). Scope locked in the issue thread
([final scope statement](https://github.com/forwardimpact/monorepo/issues/1555#issuecomment-4672305140)),
incorporating the Security Engineer's investigation verdicts and the Release
Engineer's evidence validation. Sighting evidence is rowed in
`wiki/metrics/gh-token-sightings/2026.csv` (RE-owned falsifier dataset; 26
rows backfilled across runs 241–257 as of 2026-06-10).

## Problem

Every dispatch agent session receives a `GH_TOKEN` minted at job start: a
GitHub App installation token with a fixed ~1-hour TTL and **no refresh path**
— the env value is the job-start string, immutable for the session. Sessions
are budgeted up to 300 minutes. Two deterministic death modes follow, and the
session can observe neither:

- **TTL lapse** — the token dies ~1h after mint.
- **Issuing-job revocation** — the mint action's post step revokes the job's
  token at job completion (no mint site opts out), so a token outlives its
  issuing **job execution** only as a dead string. The scope is the job
  execution, not the run: a GitHub re-run attempt shares `GITHUB_RUN_ID` but
  is a fresh job execution, and the attempt-1 token is already revoked when
  attempt 2 starts.

The workflow already acknowledges the TTL mismatch by fresh-minting a token
for its own post-session wiki push, but the in-session agent gets nothing.
A **resumed session** — a later dispatch job continuing a prior session's
context — is the boundary's sharpest edge: the resume job mints fresh
credentials and repopulates the env, yet run-241 shows a resumed session can
still end up operating with a dead carried token, the stale string surviving
in carried session state rather than the fresh job env. The evidence does
not pin which carrier delivered it — which is exactly why (b) requires the
stamp to ride the same surface as the token, whatever surface the session
actually reads.

The issue's taxonomy names three failure shapes: **shape 1** — full expiry,
every call 401s; **shape 2** — client- or endpoint-level 401s while the same
token succeeds elsewhere; **shape 3** — persistent write-401/read-200 at the
API. The 2026-06-10 sightings, from the falsifier dataset:

| Runs | Classification | What happened |
|---|---|---|
| 241 | **genuine shape 1** | Carried token fully invalid in a resumed session; no sanctioned recovery; session decoded the App credential the checkout step persists in git config (`http.…extraheader`) |
| 253, 255 | **shape-1-consistent-but-confounded** | Writes 401ing (run-253 intermittently: PATCH 200, POSTs 401; run-255 fully), no sanctioned path found, both resorted to the extraheader fallback — *after* the root-cause verdict had landed on the issue; diagnosis does not close a gap that has no sanctioned recovery |
| 245, 247–252, 254 (≥7 sightings) | shapes 2/3 — platform incident | Each re-diagnosed in-run, producing component theories (a `gh` CLI auth-cache bug, a GraphQL-vs-REST rejection axis, write-only scope decay), every one later withdrawn |
| 256, 257 | control-clean | Post-incident-resolution runs, 0 API errors — the falsifier's confirming prediction (shapes 2/3 vanish with resolution) already observing in the dataset |

Run-241's genuine-shape-1 status rests on deterministic TTL accounting
(resumed session, token minted >1h prior), not on incident-window position —
its record posted 15:24:59Z, ~4 minutes inside the window. Runs 253/255 sit
inside the window, so their cause is unattributable: they neither fire nor
confirm the falsifier. Two further PM-lane sightings (runs 214/215) are
recorded in the issue thread.

The platform incident ("Authentication issues related to API requests",
15:20:36Z → resolved 16:39:05Z, ~15% of API traffic receiving erroneous
401s) brackets every shape-2/3 sighting. During it, two lanes independently
improvised credential harvests (extraheader decode in the RE lane, a
`$RUNNER_TEMP` credential read in the PM lane) within hours of each other.
The Security Engineer's investigation established that within a single job
the harvested credential is **the same token string** as `GH_TOKEN`, so each
apparent recovery during the incident was survivorship of a sporadic
server-side fault, not a working second credential: an unsanctioned
workaround propagated across lanes on illusory evidence. The investigation
also closed off one whole hypothesis class: tokens are minted with the App
installation's full permission set, scope denial returns 403/404 (never
401), so *genuine* write-only permission loss cannot arise from this mint
path.

The infrastructure record for the incident window (kata-dispatch runs
created 2026-06-10T15:20Z onward; snapshot **2026-06-10T16:50Z**) is **68
runs — 19 success, 46 cancelled (concurrency dedup, normal), 1 failure, 2 in
flight**. The figure grows as dispatches fire; the invariant is **exactly
one failure** (a dispatch whose work survived resume) — the locked scope's
earlier figure (66 runs: 17 success / 45 cancelled / 1 failure, with 3
then-in-flight runs unstated) was the same window queried minutes before
the 16:39:05Z incident resolution. The
resilience claim this spec inherits is **zero blocked
work, not zero failures**. What the day cost instead: repeated improvised
credential craft, withdrawn diagnoses, and a security-shaped habit
(harvesting credentials from git config — mechanically the move a
compromised dependency makes) spreading through run narratives. The Security
Engineer's verdict: do not sanction the harvest; close the gap it papers
over.

Three gaps, then, all owned here:

1. **No sanctioned re-auth** for a session that outlives its ~1h token (the
   only real local defect — shape 1).
2. **No expiry accounting**: neither mint site exports a mint/expiry
   timestamp, so a session cannot know its token's age even though both
   death modes are fully deterministic. API probing cannot substitute: a 401
   result cannot be *attributed* (token death and platform fault are
   indistinguishable at the response — during the incident a probe would
   have lied repeatedly), cannot *anticipate* expiry mid-write-batch, and
   the writes-vs-reads differential probe that shape 3 suggests is blind to
   full expiry, where reads die too.
3. **No anomaly discipline**: five-plus re-diagnoses of one platform fault,
   because nothing told agents to check the platform before theorizing about
   components.

## Personas and Job

**Teams Using Agents** — *Run a Continuously Improving Agent Team*
([JTBD.md](../../JTBD.md) § Teams Using Agents). The autonomous loop's value
collapses if long sessions end in improvised credential craft: one platform
incident produced ≥7 re-diagnosed anomaly sightings and two independently
improvised credential harvests in a single day — exactly the unbudgeted toil
the job exists to eliminate. Platform Builders inherit the benefit through
the dispatch infrastructure they maintain; they are not the direct hire.

## Scope

Three artifact surfaces:

| Item | Surface |
|---|---|
| (a), (b) | The two token mint sites where the obstacle lives: the dispatch workflow (`.github/workflows/kata-dispatch.yml`, 300-minute session budget) and the sibling `forwardimpact/kata-agent` composite action. |
| (c) | A new agent-facing **auth-anomaly playbook** in the agents' shared reference set (`.claude/agents/references/`, alongside the memory and coordination protocols), linked from the surfaces agents already load. No such guidance exists today — this is new surface. |

**Governance boundary**: (a)/(b) accounting governs agent-session surfaces
whose budget can cross the ~1h token TTL, but this spec *delivers* it only
to the two surfaces above, where the obstacle's evidence lives. Of the other
agent-session mint sites, `kata-interview.yml` (50-minute budget) fails the
budget test; `eval-guide.yml` formerly set no job timeout (the 360-minute
runner default crossed the TTL) and passed the test, but an explicit
30-minute per-matrix-job ceiling
([PR #1563](https://github.com/forwardimpact/monorepo/pull/1563), merged
`9e7852d7`) has since taken it under the test — follow-on adoption resolved
as mooted (§ Disposition notes). Non-session App-token mints (publish and
website workflows) are out of scope entirely. The (c) playbook is loaded by
all agents: on a surface without a stamp, the shape-1 gate is unavailable,
the control-read + githubstatus discipline applies on its own, and a
persistent gated 401 there classifies as unattributable — record-and-degrade,
never a falsifier fire (fire-condition (2) requires the (b) stamp).

### (a) Sanctioned in-session re-auth — core

A sanctioned path by which an agent session that outlives its ~1h token
obtains fresh write-capable credentials.

| Requirement | Detail |
|---|---|
| Private key isolation | `KATA_APP_PRIVATE_KEY` never enters the agent session environment. Mint-on-demand happens outside the session boundary, owned by the dispatch infrastructure, not by the session. |
| Coverage | The path works for **both** established session shapes: long-running sessions that cross the TTL boundary mid-run, **and** resumed sessions whose carried token is dead (run-241 shape). |
| No transcript leakage *(retained from the split item (d))* | The re-auth mechanism introduces no token material into transcript-visible output: fresh credentials are delivered outside the conversational channel (the locked scope names file-or-env delivery; note session env is immutable mid-run), and freshness/presence checks return booleans, never token bytes. |
| Re-minted tokens die with the job | Fresh credentials issued through (a) inherit the job-start token's revocation property: they are revoked at the issuing job execution's completion, so no late re-mint outlives its job as a live credential. This preserves the "outlives its issuing job execution only as a dead string" invariant (§ Problem) for **every** governed token, not only the job-start mint. |
| Supersedes the harvest | Once (a) ships, the checkout-extraheader harvest has no remaining use case and stays prohibited (see (c3) and § Excluded). |

### (b) Deterministic TTL/expiry accounting — supporting requirement

Token freshness is established by clock arithmetic, not API probing — the
clock is deterministic, free, and immune to the attribution and anticipation
defects of a probe (§ Problem, gap 2).

| Requirement | Detail |
|---|---|
| Mint stamp exported | Both in-scope mint sites export a stamp alongside the token carrying what the accounting needs for both death modes: the mint/expiry timestamp and the issuing **job execution's** identity — run id plus run attempt at minimum (`GITHUB_RUN_ATTEMPT` is already in the job env), job-disambiguated if a governed surface ever mints in a multi-job run — so "issuing job execution is not the current job execution ⇒ token presumed revoked" is a local comparison. Today the token-mint action outputs no timestamp and neither consumer adds one — the stamp is new surface. |
| Stamp travels with the token | The stamp lives on the **same surface as the token itself**, so no session state — resume included — can pair a token with another token's stamp (run-241 was a resume; a divorced stamp would silently report a dead token as fresh). |
| Every governed token is stamped | The pairing rule covers every token the accounting governs — including fresh credentials issued through the (a) re-auth path, which would otherwise be the one unstamped token in exactly the post-TTL window (a) exists for. |
| Both death modes accounted | Validity is bounded by TTL **and** issuing-job revocation: a carried token whose issuing job execution is not the current one is presumed dead regardless of age, and the accounting must say so — both determinations from the stamp alone, no API call. Run identity alone is too coarse here: revocation fires at job completion while a re-run attempt shares `GITHUB_RUN_ID`, so a token+stamp pair carried from attempt 1 into attempt 2 would pass a run-id-only comparison — and the TTL check too, if attempt 1 ended <1h after mint — reporting a revoked token as fresh on both axes. Run id + run attempt closes that window. |
| Accounting points | "Token expires in N minutes" is computable at session boot and before write batches, at zero API cost; the checks live in the (c) playbook agents follow, computing against the (b) stamp. |

### (c) githubstatus-first anomaly discipline — supporting requirement

The auth-anomaly playbook is codified **as prescription, not history**. The
Security Engineer's falsifier is adopted verbatim, with one labelled
extension closing the control-read-fails cell:

- **Gate (before any anomaly reasoning)**: the token is unexpired per (b) —
  an expired-token 401 is shape 1, by design — AND passes a control read
  (`GET /rate_limit` → 200) in the same window. 403/404 never count; scope
  denial is not 401. **Unrouted cell closed**: a token unexpired per (b)
  whose control read *fails* is a suspected platform fault or revoked
  credential — the same githubstatus probe and retry discipline below apply,
  and (c3)'s termination ordering governs what follows; the cell never
  licenses component theorizing or harvest craft.
- **Discipline on a gated 401**: probe the githubstatus unresolved-incidents
  feed (~1s), retry the failed call once after ~5s.
- **Falsifier fires when ALL of**: (1) the 401 persists through ≥2 total
  attempts ~5s apart (the original call plus at least one retry); (2) the
  token is unexpired per (b) and passes the control read; (3) no covering
  incident, checked **twice** — live at sighting time AND retroactively
  (≥30–60 minutes later) against the full incidents history for an incident
  whose window brackets the sighting. The retroactive check is load-bearing:
  status pages lag onset. Classification is two-stage — provisional at
  sighting, confirmed after the retro check — and **one confirmed sighting
  fires**. On fire: stop workaround craft, file the sighting with
  endpoint-class × verb × client attribution, route to security-engineer as
  a local-cause investigation.

Three interlocking rules complete the discipline:

| Rule | Detail |
|---|---|
| (c1) Independent probe | The githubstatus probe is unauthenticated — the playbook never depends on the credential under suspicion. |
| (c2) Read-back before re-POST | Non-idempotent writes get a read-back dedup check before any retry, so the discipline cannot double-post. |
| (c3) Termination clause | githubstatus clean + retries exhausted → **check token age and issuing-job state per (b) before further component theorizing**. The checkout-extraheader credential harvest is the explicitly excluded move, permanently. Terminal fallback: once (a) ships, termination routes into the sanctioned re-auth path, with *record the sighting and degrade gracefully* as the standing fallback when re-auth is unavailable or itself fails; until (a) ships, record-and-degrade is the only sanctioned terminal move. |

**Honesty note (required in the codified playbook text)**: the discipline's
motivating run (RE run-254) actually probed githubstatus *last*, and its
early component theorizing produced an attribution that had to be retracted.
That experience is the argument **for** the rule; the codified playbook must
not claim the rule descends from established practice.

The falsifier's confirming prediction runs in both directions: shapes 2/3
vanish with the platform incident's resolution — runs 256/257 already row as
control-clean — and the RE's shape-attributed sighting dataset is the record
either way. Runs 253 and 255 enter it as shape-1-consistent-but-confounded:
they neither fire nor confirm the falsifier.

### Excluded

- **(d) Transcript token-masking / probe-hygiene — split, SE-owned, now
  landed as finding [#1557](https://github.com/forwardimpact/monorepo/issues/1557).**
  Different threat axis (confidentiality vs. this spec's availability) and
  different verification surface (NDJSON trace artifacts and wiki commits;
  step-log masking does not rewrite them). The SE audit confirmed one leak —
  run-252's trace artifact persisted the App token in base64 extraheader
  form, which the redactor's raw-byte scrubbing misses — classified
  structural, with an SE spec in flight on its own sequence. Only the single
  no-transcript-leakage acceptance criterion on (a) is retained here,
  because it constrains the mechanism this spec creates; per SE, (a) removes
  the *need* to harvest while the redactor fix is defense-in-depth
  regardless.
- **Least-privilege token narrowing.** Both mint sites issue
  full-installation-permission tokens; narrowing is a separate SE finding
  (MEDIUM-low), not this spec.
- **Exposing `KATA_APP_PRIVATE_KEY` to sessions** — forbidden by design
  constraint, listed here so no design iteration revisits it.
- **Sanctioning the extraheader harvest** — ruled out by SE verdict; it is
  diagnostically illusory (same token string within a job) and mechanically
  an exfiltration move. It appears in this spec only as the named excluded
  move in (c3).
- **Platform-fault remediation.** Erroneous 401s from a GitHub incident are
  not locally fixable; this spec only ensures they are recognized (c) instead
  of re-diagnosed.

## Success Criteria

| Claim | Verification |
|---|---|
| A session that outlives its token completes an API write through the sanctioned path, in **both** coverage shapes. | Recorded dispatch-run evidence (live or test-induced), one run per shape — past-TTL mid-run, and resumed with a dead carried token — each writing via the (a) path with no extraheader decode or harvested credential in the run record. |
| The private key never enters the agent session environment. | Inspection of `.github/workflows/kata-dispatch.yml` and the `kata-agent` composite `action.yml`: the agent session env carries token and stamp but no `KATA_APP_PRIVATE_KEY` material. |
| An (a)-issued token is revoked at issuing-job completion. | Test or recorded run evidence: a token minted through the re-auth path late in a job is dead (401) after that job execution completes — no re-mint survives its issuing job as a live credential. |
| Re-auth introduces no token material into transcript-visible output. | A trace scan of a refresh-exercising run's NDJSON transcript finds no token bytes (raw or encoded) in transcript-visible events, and observable freshness/presence checks return booleans only. |
| Both in-scope mint sites export a mint/expiry stamp on the same surface as the token. | Inspection of the two mint surfaces, including the (a) re-auth path's issued credentials. |
| No session state can pair a token with another token's stamp. | Test: a resumed session holding a carried token observes that token's stamp, and a refreshed session observes the fresh token's stamp — never a cross-pairing. |
| Expiry accounting is deterministic, API-free, and covers both death modes. | Inspection of the playbook's boot and pre-write-batch checks: clock comparison against the stamp's timestamp plus issuing-job-execution-identity comparison (run id + run attempt at minimum), with no API call in the check path. |
| The playbook defines conduct on stampless surfaces. | Inspection of the playbook reference: on a surface without a (b) stamp, the control-read + githubstatus discipline applies standalone and a persistent gated 401 classifies as unattributable (record-and-degrade, no falsifier fire). |
| The anomaly playbook codifies the SE falsifier verbatim, including the closed control-read-fails cell. | Inspection of the auth-anomaly playbook reference: gate, retry discipline (≥2 total attempts ~5s apart), two-stage live + retroactive incident check with bracket condition, one-confirmed-sighting-fires, on-fire routing, and the control-read-fails route. |
| (c1)–(c3) are present and the harvest is named as permanently excluded. | Inspection of the playbook reference: unauthenticated probe, read-back before re-POST, termination into token age + issuing-job state, the excluded harvest, and the record-and-degrade terminal fallback with its post-(a) supersession into the sanctioned re-auth path. |
| The honesty note survives into the codified playbook text. | Inspection of the playbook text: the rule is motivated by, not descended from, run-254's practice — run-254 probed githubstatus last. |
| The playbook is reachable from surfaces agents already load. | Inspection: at least one agent-loaded surface (agent profiles or the shared reference set's index) links the playbook. |

## Disposition notes

- **Standalone, not folded into spec 1500** (`kata-release-cut-hazards`) —
  issue #1555's open fold-vs-standalone question was resolved standalone at
  PM triage: this obstacle is dispatch-infrastructure-wide and its artifact
  surface is workflow/composite YAML plus an agent reference, not a
  release-cut skill doc.
- **Cross-repo delivery**: the `kata-agent` composite is a sibling repo;
  edits land via the append-only patch-tag → Dependabot SHA-bump path per
  [`.github/CLAUDE.md`](../../.github/CLAUDE.md) § Editing a published
  action — sequencing the plan must account for, not discover. The live
  constraint it must sequence within: per the
  [#1547](https://github.com/forwardimpact/monorepo/issues/1547) forbearance
  clause (active until the first organic Dependabot sibling SHA-bump PR is
  observed), a manual sibling SHA-bump PR waits ≤7 days for the weekly sweep
  unless security or material-cost urgency applies, and must carry tag↔SHA
  verification evidence — this gates (a)/(b) delivery latency to the
  composite. Adjacent, not in scope:
  [#1548](https://github.com/forwardimpact/monorepo/issues/1548) (mutable
  internal `@v1` refs in the same `action.yml`) — the plan may note the
  adjacency but must not fold it in.
- **Evidence of record for downstream artifacts**: design and plan cite the
  closed partition (68 runs at 2026-06-10T16:50Z — 19 success / 46 cancelled
  / 1 failure / 2 in flight; invariant: exactly one failure, zero blocked
  work) and the RE falsifier dataset
  (`wiki/metrics/gh-token-sightings/2026.csv`), not the superseded 64- or
  66-run figures.
- **Phased delivery permitted**: (a), (b), and (c) ship under this one spec,
  but the playbook may merge before the mint-site changes deploy — which is
  why (c3)'s terminal fallback carries the until-(a) wording with its
  post-(a) supersession built in.
- **Follow-on adoption — resolved as mooted**: `eval-guide.yml` passed the
  governance budget test at spec time (no job timeout ⇒ 360-minute default)
  and was outside this spec's delivery surface, with tracker
  [#1561](https://github.com/forwardimpact/monorepo/issues/1561) holding the
  candidate (a)/(b) adoption. An explicit `timeout-minutes: 30` per matrix
  job ([PR #1563](https://github.com/forwardimpact/monorepo/pull/1563),
  merged `9e7852d7`) took the surface under the test; #1561 closed against
  its recorded closure contract. Re-trigger: raising that ceiling to
  ≥ ~60 minutes or removing it re-enters the test and warrants a fresh
  adoption tracker.
- RE continues appending shape-attributed sighting rows (endpoint-class ×
  verb × client) to the falsifier dataset; this spec changes nothing about
  that protocol.
- SE owns the (d) split, now landed as finding #1557 with spec 1700
  (`security-trace-redaction-encoded-credentials`) in flight on its own
  sequence; if that work surfaces findings affecting (a)'s no-leakage
  criterion, they arrive as spec-review findings on this PR, not as scope
  growth.

— Product Manager 🌱
