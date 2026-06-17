# Plan 2030 — Fail-closed secret gating on the wiki push path

Executes [design-a.md](design-a.md) for [spec 2030](spec.md).

## Approach

Add one gitleaks gate at the shared `WikiSync.commitAndPush` choke point: after
the push path reconciles to the verified remote tip and before `client.push`,
scan the commit range `remoteTip..HEAD` with `gitleaks detect --log-opts`. A
finding or a missing scanner refuses with a distinct reason and is surfaced as a
non-zero block by the callers (never "saved locally"), unless the matching
off-by-default override is set — each override appends an audited line to a
wiki-tree `secret-overrides.log` before the push. Composes with the post-1850
push path as an added step.

Libraries used: none (libwiki internal; gitleaks invoked via the injected
`runtime.subprocess`).

## Step 1 — The secret-scan gate module

Intent: a single tested function that scans a commit range fail-closed.

Files: create `libraries/libwiki/src/secret-gate.js`. (The design assigned a
`scanRange` git-client primitive; this plan instead expresses the range inline
via gitleaks `--log-opts` and adds no `git-client.js` method — a simplification,
since the range is a string the gate passes to gitleaks, not a git operation.)

- Export `async scanPushWindow({ runtime, wikiDir, range })`:
  - Probe availability: `runtime.subprocess.run("gitleaks", ["version"], { cwd: wikiDir })`; a non-zero exit or thrown error → `{ status: "scanner-absent" }`.
  - Scan: `runtime.subprocess.run("gitleaks", ["detect", "--source", wikiDir, "--log-opts", range, "--report-format", "json", "--report-path", "<tmp>"], { cwd })`. Distinguish by exit code per gitleaks' documented contract: **0 → `{ status: "clean" }`**; **1 (leaks found) → parse the JSON report into `{ status: "finding", findings: [{ file, line, rule }] }`** (location only — never the secret value); **any other non-zero (invocation/usage error) → `{ status: "scanner-absent" }` (fail closed — an error is never reported as clean)**.
- No process globals; everything via `runtime`.

Verification: unit test with a mock `runtime.subprocess` returns clean (exit 0) / finding (exit 1) / scanner-absent (exit 2 error AND `gitleaks version` failure) for each exit shape; asserts findings carry only file/line/rule and no secret value.

## Step 2 — Wire the gate into commitAndPush

Intent: scan the push window at the one choke point, refuse distinctly.

Files: modify `libraries/libwiki/src/wiki-sync.js`.

- In `commitAndPush`, after the reconcile/rebase succeeds and before `client.push`:
  compute `range = `${verifiedRemoteTip}..HEAD`` (the remote tip the post-1850
  path already observes via lsRemote; on the pre-1850 base use `origin/master..HEAD`).
  Call `scanPushWindow`.
- On `status: "finding"` and no `FIT_WIKI_SECRET_OVERRIDE`: return
  `{ pushed: false, reason: "secret-detected", findings }` — no push attempted.
- On `status: "scanner-absent"` and no `FIT_WIKI_SCANNER_ABSENT_OK`: return
  `{ pushed: false, reason: "scanner-unavailable" }` — no push attempted.
- On either override present: call `appendOverrideRecord` (Step 3), commit it
  into the write-set, then proceed to push.
- Add `secret-detected` and `scanner-unavailable` to the reason union doc.

Verification: `wiki-sync` unit test — mock the gate to return finding → result is
`{pushed:false, reason:"secret-detected"}` and the mock git client records **no**
push call; scanner-absent likewise; clean → push proceeds.

## Step 3 — The audited break-glass record

Intent: each override leaves a durable, secret-free record before the push.

Files: modify `libraries/libwiki/src/secret-gate.js` (or a sibling),
`libraries/libwiki/src/wiki-sync.js`.

- In `secret-gate.js`, `appendOverrideRecord({ runtime, wikiDir, klass, reason, findings, gitClient })`:
  read `git config user.email` (asserted identity), append one line to
  `<wikiDir>/secret-overrides.log`:
  `<ISO ts>\t<email>\t<klass>\t<reason>\t<file:line:rule or "scanner-absent">`.
  Create the file if absent. The line carries no secret value.
- The override path stages this file alongside the content (path-scoped) so it
  lands in the same push.

Verification: test — with `FIT_WIKI_SECRET_OVERRIDE="x"` set and a finding, the
push proceeds and `secret-overrides.log` contains a line with the email, reason,
and finding location but not the secret; the absence override writes a
`scanner-absent` line.

## Step 4 — Surface the refusal at the callers

Intent: a security block exits non-zero, distinct from "saved locally".

Files: modify `libraries/libwiki/src/commands/claim.js` (`pushWiki` +
`runClaimCommand` + `runReleaseCommand`), `libraries/libwiki/src/commands/sync.js`
(`runPushCommand`).

- `pushWiki` today returns void and is awaited fire-and-forget; change it to
  **return a `{ ok, code }` envelope** by branching on `result.reason`:
  - `pushed` → success message; `{ ok: true }`.
  - `secret-detected` → stderr names the finding location(s) + the override
    procedure; `{ ok: false, code: 1 }`.
  - `scanner-unavailable` → stderr names the scanner-absence + its override;
    `{ ok: false, code: 1 }`.
  - `clean` (nothing to push) → `{ ok: true }`; a *thrown* network error keeps
    the existing "push failed (saved locally)" stderr and returns `{ ok: true }`
    (spec 5 — network failure unchanged).
- `runClaimCommand` and `runReleaseCommand` currently `await pushWiki(...)` then
  unconditionally `return { ok: true }`. Change both to
  `return await pushWiki(...)` (both call sites, including the `--expired`
  branch) so a security block propagates the non-zero exit. `sync.js`
  `runPushCommand` likewise returns the gate envelope rather than a flat
  `{ ok: true }`.

Verification: `cli-claim` test — gate returns secret-detected → `runClaimCommand`
AND `runReleaseCommand` each return `{ok:false,code:1}`, stderr names the finding,
stdout shows no "pushed"/"saved locally"; a thrown network-failure fixture still
prints "saved locally" and returns `{ok:true}` with the prior behaviour.

## Step 5 — Documentation

Intent: operators can provision the scanner and use the break-glass.

Files: modify `websites/fit/docs/libraries/predictable-team/wiki-operations/index.md`.

- Add `## Secret scanning in wiki pushes` after `## Syncing wiki state`: the
  fail-closed gate, gitleaks provisioning as a prerequisite (pin **v8.24.3**, the
  exact version the repo's `audit` composite action standardises on), and the
  two break-glass procedures (`FIT_WIKI_SECRET_OVERRIDE`,
  `FIT_WIKI_SCANNER_ABSENT_OK`) with the `secret-overrides.log` location and the
  note that the recorded identity is self-asserted attribution, not authenticated.
  Generic prose — no spec/issue/PR numbers.

Verification: `bunx fit-doc` build clean (or the docs lint); manual read covers
the gate and both overrides.

## Step 6 — Integration test against the real push path (spec criterion 1)

Intent: exercise the gate end-to-end against real git, not a mock.

Files: modify `libraries/libwiki/test/wiki-sync.integration.test.js` (real bare
repo + clone harness already present).

- A fixture commit whose content carries a gitleaks-detectable secret (e.g. a
  fake AWS key matching a default gitleaks rule) on the local branch ahead of the
  remote; run `commitAndPush`. Assert: result `{pushed:false, reason:"secret-detected"}`,
  the remote tip is **unchanged** (no remote contact / push attempted), and a
  finding is reported. A clean fixture pushes through. With
  `FIT_WIKI_SECRET_OVERRIDE` set, the same secret-bearing fixture pushes and
  `secret-overrides.log` lands. Gate the secret-scan assertions on
  `gitleaks version` resolving in the runner; skip with a clear message if the
  binary is absent (do not silently pass).

Verification: `bun test libraries/libwiki/test/wiki-sync.integration.test.js`
green where gitleaks is available; the no-remote-contact assertion holds.

## Risks

- **gitleaks `--log-opts` range semantics.** `--log-opts` passes to `git log`;
  `remoteTip..HEAD` must name commits that exist locally post-reconcile. The
  implementer must confirm the remote tip ref is available (the push path's
  lsRemote/fetch makes it so) before constructing the range.
- **1850 ordering.** The verified-remote-tip handle lives in the post-1850
  `commitAndPush`; if implementing before 1850 lands on `main`, use
  `origin/master..HEAD` and leave a note to switch to the lsRemote-observed tip
  when 1850 merges. Both name the same commits on a reconciled tree.
- **gitleaks exit-code contract.** gitleaks returns a specific non-zero code for
  leaks vs other errors; the gate must distinguish a leak (→ finding) from an
  invocation error (→ treat as scanner-absent / fail-closed), per its documented
  exit codes.

## Execution

Single engineering agent, steps in order (1 → 2 → 3 coupled; 4 depends on the
reasons from 2/3; 5 doc, route to `technical-writer` if preferred; 6 the
end-to-end gate after 1–4 land). The Step 6 override case also asserts the
audit-commit window: after an override the pushed range contains the
`secret-overrides.log` commit and it carries no secret value (the design's
no-TOCTOU claim). No parallelism warranted.

— Staff Engineer 🛠️
