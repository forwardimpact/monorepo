# Plan 2100-a — One TCC grant for Outpost's spawned agents

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

The design is diagnosis-gated, so the plan is too: author the verification
runbook, run it once on macOS hardware to measure the three axes, apply only the
fix(es) the run implicates, then re-run the runbook green before rewriting the
docs and reconciling the spawn-site comments. The disclaim flag is treated as a
binary setting the run identifies — never flipped blind. Steps 1, 6, 7 are
unconditional; steps 3–5 fire only on their axis. The diagnosed outcome lands in
the runbook's tracked results block (Step 2), discharging spec criterion 4.
Steps 2–5 require a Mac; the rest do not.

Libraries used: none.

## Step 1 — Author the TCC verification runbook

Create the single hardware procedure that both diagnoses and re-checks.

- Created: `products/outpost/macos/TCC-VERIFICATION.md`

Contents: a checklist that (a) `tccutil reset SystemPolicyAllFiles`,
`tccutil reset SystemPolicyDocumentsFolder`, and `tccutil reset AppleEvents`
(the identifiers for the design's Full Disk Access / Files & Folders /
Automation services), and clears any `node`/CLI privacy entries; (b) grants
**only** `Outpost.app`; (c) wakes an agent (`fit-outpost wake`); (d) for **each
hop** resolves the live child's responsible process (`launchctl procinfo <pid>`
and a `log stream --predicate 'subsystem == "com.apple.TCC"'` capture) and
asserts it is `Outpost.app`; (e) confirms the Mail/Calendar read succeeds and
the agent writes its briefing under `~/.cache/fit/outpost/state/` with no
`node`/CLI entry required (Axis 1+2, file-access; reads the Calendar store as
files only — not the EventKit Calendar service, per design § "TCC services");
(f) triggers a draft-side skill to exercise Automation (Axis 2, AppleEvents);
(g) for any service that still fails under the single grant, grants **that one
service** to `Outpost.app` and re-checks (the Fix C path); (h) reinstalls a
re-signed bundle over the grant and re-wakes (Axis 3). The file ends with a
**results block** of fixed fields — per-axis pass/fail, the Axis 1
attribution-preserving disclaim value, any service requiring a direct grant, and
the signing identity in force — which Step 2 fills in as the durable, tracked
record of the diagnosis (and the criterion-4 record).

Verification: the file exists, maps each design service to its `tccutil`
identifier, enumerates the conditional Fix C grant, and carries an empty results
block with the fields above.

## Step 2 — Run the diagnostic on hardware (manual gate)

Execute Step 1's runbook on macOS 14+ against an installed, signed
`Outpost.app`; record which axes fail.

- Modified: `products/outpost/macos/TCC-VERIFICATION.md` (fill in the results
  block)

Change: fill every field of the runbook's results block — per-axis pass/fail,
the Axis 1 attribution-preserving disclaim value, any service needing a direct
grant, the signing identity. This committed block is the input to Steps 3–5 and
the durable record of the diagnosed root cause (spec criterion 4); the
implementation PR body restates it for reviewers.

Verification: the results block names the implicated axes (or "all pass"), the
Axis 1 value, and — if all axes passed — that the change is docs-only and the
classification drops to internal.

## Step 3 — Fix A: correct the disclaim setting (only if Axis 1 fails)

Set the implicated hop(s) to the attribution-preserving setting recorded in Step
2's results block; if the recorded value equals the current setting, make no
change here.

- Modified: `products/outpost/macos/Outpost/Sources/ProcessManager.swift` (the
  `responsibility_spawnattrs_setdisclaim` call, ~line 88)
- Modified: `libraries/libmacos/src/posix-spawn.js` (the `setDisclaim` call,
  ~line 160)

Change: at each implicated hop, set the `responsibility_spawnattrs_setdisclaim`
flag to the value Step 2 recorded (the binary alternative to the current `1`).
Anchor on the symbol name, not the line number, since Step 7 edits adjacent
comments. Both hops carry the same value per the design's single-contract rule.

Verification: re-running the runbook shows each hop's child resolving to
`Outpost.app`.

## Step 4 — Fix C: pin a non-inherited service to Outpost.app (only if Axis 2 fails)

Record which service is not covered by the single grant; its remedy is the
conditional direct-grant sub-step the runbook already performs (Step 1g), and
the docs (Step 6) instruct that single direct grant. Its remedy is still one
process.

- Modified: `products/outpost/macos/TCC-VERIFICATION.md` (name the non-inherited
  service in the results block)

Change: name the affected service (per design § "TCC services per resource") in
the results block. No spawn-code change.

Verification: re-running the runbook's Step 1g sub-step (that service granted to
`Outpost.app`) shows the affected resource succeeding under one process.

## Step 5 — Fix B: ensure Developer ID persistence (only if Axis 3 fails)

A release-configuration dependency, not a code change here: confirm the release
build sets `MACOS_SIGN_IDENTITY` (Developer ID) via the `macos-signing` action
so the grant pins to the bundle's designated requirement. If certs are
unavailable, spec 1170's deterministic ad-hoc cdhash is the interim persistence
path and this step defers without blocking 2100.

- Modified: `products/outpost/macos/TCC-VERIFICATION.md` (record the signing
  identity in force during the Axis 3 reinstall)

Change: none in 2100's code; record whether the Axis 3 run used a Developer ID
or ad-hoc identity. Step 6's docs state the persistence story for whichever
identity ships (re-grant once on the Developer ID cutover; ad-hoc survives
`brew upgrade` in the interim).

Verification: re-running the runbook's Axis 3 reinstall preserves the grant with
no re-prompt under the identity in force.

## Step 6 — Rewrite the macOS Privacy & Security docs (gated on a green run)

Replace the three-process instruction with one process plus the pinned services
and a one-time migration note. Only after steps 2–5 leave the runbook green.

- Modified: `websites/fit/outpost/index.md` (§ macOS Privacy & Security)
- Modified: `websites/fit/docs/getting-started/engineers/outpost/index.md` (§
  macOS Privacy & Security, lines 73–83)

Change: drop the `node` and CLI-version bullets; instruct a single grant to
`Outpost.app`, mapped to the resources from the design's service table (Full
Disk Access for Mail/Calendar, Files & Folders for the `~/Documents` knowledge
base, Automation for draft-side Mail); add a short migration note (a user aid,
not a retained three-grant path) that users upgrading from a three-grant install
re-grant `Outpost.app` once and may remove the stale `node`/CLI grants; state
the persistence story for the identity in force (Developer ID survives upgrades;
the interim ad-hoc build survives `brew upgrade`).

Verification: both pages name only `Outpost.app` and carry the migration note;
`fit-doc` build passes.

## Step 7 — Reconcile the spawn-site comments

Rewrite the responsibility-call comments to match the verified semantics. Runs
after Step 3 so it describes the committed flag value.

- Modified: `products/outpost/macos/Outpost/Sources/ProcessManager.swift`
  (comments, lines 3–8 and 86–87)
- Modified: `libraries/libmacos/src/posix-spawn.js` (comments, lines 13–15 and
  158–159)
- Modified: `libraries/libmacos/src/tcc-responsibility.js` (if its comments
  carry any attribution-direction claim — survey and reconcile or confirm none)

Change: state what the run confirmed the disclaim flag does and that both hops
must hold the attribution-preserving value; remove the unverified "inherit
Outpost.app" wording wherever the run contradicted it, across all three files.

Verification: the three files describe the same, run-confirmed behavior; no
comment still asserts an unverified direction (spec criterion 6).

## Risks

- **Hardware-only diagnosis.** Steps 2–5 cannot run in CI or on Linux; an
  implementer without a Mac can author steps 1, 6, 7 but cannot close the loop.
- **Misread diagnostic inverts Fix A.** Flipping the disclaim flag the wrong way
  silently worsens the gap; the per-hop runbook assertion (Step 1d) is the guard
  and must pass before Step 6.
- **Cert availability.** If Axis 3 is implicated but Developer ID certs are not
  yet issued, Step 5 defers to the rollout; do not block the other fixes or the
  docs on it.

## Execution recommendation

Sequential: Step 1 → Step 2 → (Steps 3/4/5 as implicated) → green runbook re-run
→ Steps 6/7. An engineering agent authors Step 1 and applies Step 3; a
macOS-hardware operator runs Steps 2, 4, 5 (the hardware run and its
results-block records); `technical-writer` authors Step 6; an engineering agent
does Step 7. Steps 6 and 7 may run in parallel once the runbook is green.
