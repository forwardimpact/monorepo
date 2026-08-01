# Auth-Anomaly Playbook

This playbook prescribes how to diagnose a `GH_TOKEN` 401 in a dispatch agent
session. It codifies the Security Engineer's falsifier. On a 401, the default
move is to run the gate and the discipline below, in order. It is **not** to
theorize about a component. It is **not** to harvest a credential.

This playbook governs every agent session. On a surface that carries the (b)
token stamp (`KATA_GH_TOKEN_STAMP`), the full gate and falsifier apply. On a
stampless surface, see § Stampless surfaces.

## Token accounting (deterministic, API-free)

Token freshness is clock arithmetic against `KATA_GH_TOKEN_STAMP`. It is never
an API probe. The stamp is one value that carries `mint` (epoch), `exp`
(epoch), `run` (`GITHUB_RUN_ID`), and `attempt` (`GITHUB_RUN_ATTEMPT`). Compute
both at session boot and before each write batch, at zero API cost:

- **TTL** — "token expires in N minutes" = `(exp − now) / 60`. At or past `exp`,
  the token is dead (TTL lapse). This is shape 1.
- **Issuing-job validity** — if `run` ≠ the current `GITHUB_RUN_ID` **or**
  `attempt` ≠ the current `GITHUB_RUN_ATTEMPT`, the job execution that issued
  the token is not the current one. The token is then
  **presumed revoked regardless of age**. A re-run attempt shares the run id,
  but it is a fresh job execution that revoked the prior attempt's token. The
  attempt comparison closes that window.

Both determinations come from the stamp alone. A 401 probe cannot substitute.
It cannot attribute the fault, because token death and a platform fault look
identical at the response. It cannot anticipate expiry mid-batch. The
writes-vs-reads differential is blind to full expiry, where reads die too.

## Gate — before any anomaly reasoning

A 401 only enters the discipline below if **both** hold in the same window:

1. The token is **unexpired per the accounting above**. An expired-token 401 is
   shape 1. Re-auth or record-and-degrade handles it. Anomaly reasoning does
   not.
2. A **control read** `GET /rate_limit` returns 200.

`403`/`404` never count. Scope denial is not a 401. The App installation mints
these tokens with its full permission set, so genuine write-only permission
loss cannot arise from this mint path.

**Control-read-fails cell**: a token unexpired per (b) whose control read
*fails* is a suspected platform fault or revoked credential. Apply the same
githubstatus probe and retry discipline below. The termination ordering in (c3)
governs what follows. This cell never licenses component theorizing or harvest
craft.

## Discipline on a gated 401

Probe the githubstatus unresolved-incidents feed (~1s, unauthenticated), then
retry the failed call once after ~5s.

**The falsifier fires when ALL of:**

1. The 401 persists through **≥2 total attempts ~5s apart** (the original call
   plus at least one retry).
2. The token is **unexpired per (b) and passes the control read**.
3. **No covering incident, checked twice** — live at sighting time AND
   retroactively (≥30–60 minutes later) against the full incidents history for
   an incident whose window brackets the sighting. The retroactive check is
   load-bearing, because status pages lag onset.

Classification is two-stage: **provisional** at sighting, **confirmed** after
the retro check. **One confirmed sighting fires.** On fire, stop workaround
craft. File the sighting with endpoint-class × verb × client attribution. Then
route it to security-engineer as a local-cause investigation.

## Interlocking rules

| Rule | Detail |
|---|---|
| (c1) Independent probe | The githubstatus probe is unauthenticated. Never depend on the credential under suspicion. |
| (c2) Read-back before re-POST | A non-idempotent write gets a read-back dedup check before any retry, so the discipline cannot double-post. |
| (c3) Termination clause | githubstatus clean + retries exhausted ⇒ check token age and issuing-job state per (b) **before** any further component theorizing. The checkout-extraheader credential harvest is the **permanently excluded** move. Terminal fallback: once the sanctioned re-auth path ships, termination routes into it. The standing fallback, when re-auth is unavailable or itself fails, is **record the sighting and degrade gracefully**. Until re-auth ships, record-and-degrade is the only sanctioned terminal move. |

## Stampless surfaces

On a surface without a `KATA_GH_TOKEN_STAMP`, the shape-1 TTL gate is
unavailable. The control-read + githubstatus discipline still applies on its
own. A persistent gated 401 there classifies as **unattributable**. Record it
and degrade gracefully. It is **never a falsifier fire**, because
fire-condition (2) requires the stamp.

## Honesty note

Established practice motivates this rule. The rule does not descend from it.
The run that motivated it (RE run-254) actually probed githubstatus **last**.
Its early component theorizing produced an attribution that had to be
retracted. That experience argues **for** a probe of the platform first. The
rule does not claim to codify how the team already worked.
