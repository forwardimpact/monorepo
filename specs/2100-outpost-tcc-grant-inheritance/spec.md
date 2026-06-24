# Spec 2100 — One TCC grant for Outpost's spawned agents

**Classification:** Product-aligned. The deliverable is the macOS permission
experience of an Outpost end user ([JTBD.md](../../JTBD.md) — Outpost, Empowered
Engineers: keep track of people, projects, and threads without continuous
effort). If diagnosis (below) shows the runtime already needs only one grant and
the three-grant instruction is stale documentation, the work narrows to a
documentation correction and the classification drops to internal — the design
records which case holds.

## Problem

Outpost runs a daemon, launched by `Outpost.app`, that spawns `claude` agents on
a schedule to read content the user chose to sync — Apple Mail and Calendar.
Those reads cross macOS TCC boundaries: reading the Mail and Calendar stores
needs a macOS file-access grant (the sync skills name Full Disk Access; the
product page documents per-folder Files & Folders grants — the design must pin
which TCC service each resource actually requires), and the draft-side skills
drive Mail through AppleEvents (Automation).

Today the Outpost documentation instructs the user to grant TCC access to
**three** separate processes:

- **Outpost.app** — the launcher
- **node** — runs skill scripts (Homebrew's `claude` is a node-shebang script,
  so `node` is the executable macOS sees)
- a version string (e.g. the CLI's version) — the Claude Code CLI, which macOS
  shows by version instead of by name

Evidence: `websites/fit/outpost/index.md` § macOS Privacy & Security, and
`websites/fit/docs/getting-started/engineers/outpost/index.md`.

That three-grant instruction sits in unexplained tension with the project's own
record. Spec 0600 (written for `fit-basecamp`, Outpost's prior name) set as a
success criterion that the bundle-launched scheduler disclaims TCC
responsibility when spawning `claude`, with a hardware test that "observes no TCC
prompt plus a responsible-process lookup that resolves to the basecamp bundle."
In other words, the design intends — and 0600 claimed to verify — that a single
grant to the launching app covers the spawned subtree through the macOS
responsible-process model. Both spawn sites
(`products/outpost/macos/Outpost/Sources/ProcessManager.swift`,
`libraries/libmacos/src/posix-spawn.js`) carry that disclaim call for exactly
this purpose.

So the project record says single-grant coverage should work, while the
user-facing docs tell users to grant three processes. One of them is wrong, and
which one is unknown:

- The runtime may genuinely require three grants (the responsible-process
  attribution is not actually collapsing to `Outpost.app` for these resources,
  or behaves differently for file-access grants than for the Calendar/Contacts
  case 0600 tested), and the docs are correct.
- Or the runtime already needs only one grant and the three-grant instruction is
  stale or over-cautious documentation.

This spec exists to settle that and leave the user needing a single grant. It is
explicitly **not** committing to a direction for the disclaim call: the
documented effect of `responsibility_spawnattrs_setdisclaim` and whether the
current call value produces single-bundle attribution for Mail/Calendar file
access is the central question the design must resolve empirically on macOS
hardware — the project's own code comments and the verification a future change
would rest on cannot both be assumed correct.

A new input motivates revisiting this now: per the triggering request, the team
has obtained Apple Developer signing certificates for the Outpost binaries (an
assumption this spec takes from that request — the repository carries the
signing infrastructure gated on a secret, but cannot prove a certificate was
issued). Today the bundles are **ad-hoc** signed (spec 1290 explicitly excludes
Developer ID signing and notes "the current ad-hoc signature is what … TCC
grants attach to"), with a deterministic cdhash so an ad-hoc grant survives a
`brew upgrade` rebuild on the brew lane (spec 1170). Moving to a stable, named
Developer ID identity changes what TCC pins a grant to and is the natural moment
to close the three-grant gap rather than carry it onto the signed builds. The
identity switch itself is owned by the certificate rollout, not this spec.

## Why it matters

- **First-run friction.** A new Outpost user faces three permission prompts
  before the product does anything, and must reason about which folders each of
  three processes needs.
- **Confusing, low-trust prompts.** Authorizing a bare `node` and a numeric
  version string gives the user no way to tell what they are granting. One named,
  signed application is a clear authorization decision — and Developer ID signing
  makes that name trustworthy.
- **Recurring re-prompts.** A `node` upgrade or a `claude` version bump presents
  a new process identity, re-triggering prompts the user already answered.

## Scope

Affected:

| Area | What changes |
|---|---|
| TCC attribution for the `Outpost.app` → daemon → `claude` (`node`) spawn chain | Whichever layer the diagnosis finds responsible — within a bounded search space of the spawn-site disclaim call, the signing identity the grant pins to, and the documentation — is corrected so a single grant to `Outpost.app` covers the chain; if attribution already works, no code change |
| Outpost macOS Privacy & Security docs | `websites/fit/outpost/index.md` and `websites/fit/docs/getting-started/engineers/outpost/index.md` describe granting one process, with a one-time re-grant note for existing users |
| Spawn-site comments | The comments describing the responsibility call are reconciled with the behavior the design verifies on hardware |

Excluded:

- **Terminal-invoked CLI path.** Running the CLI directly (a `PATH` symlink
  invoked from a terminal) makes the terminal the responsible process. That path
  was deferred in spec 0600 and is unchanged; the single-grant outcome here
  applies to `Outpost.app` launched as an app / login item.
- **The signing pipeline mechanics** (introducing Developer ID signing, cdhash
  determinism) — specs 1170/1290 and the certificate rollout own that; this spec
  consumes a stable signed identity, it does not build one.
- **Config trust boundary and the spawn-env allow-set** (spec 1360) — unchanged.
- **OS-sandboxing the spawned agent** — the residual tracked in
  `products/outpost/CLAUDE.md`; out of scope.

## Success criteria

1. With a macOS file-access grant given to **only** `Outpost.app` — no separate
   grant to `node` or the Claude Code CLI — a scheduled agent wake reads the
   Apple Mail and Calendar stores and completes a sync, and the relevant macOS
   privacy pane shows no required entry for `node` or the CLI version string.
   Verified by a macOS hardware test: `tccutil reset` the relevant services,
   grant only `Outpost.app`, trigger a wake, confirm sync output under the cache
   directory and inspect the privacy panes.
2. The same single-grant coverage holds for a draft-side action that drives Mail
   through AppleEvents (Automation), confirming the outcome is not specific to one
   TCC service. Verified on the same hardware test by triggering a draft-side
   skill after granting only `Outpost.app`.
3. After the one-time migration grant, a subsequent app upgrade — replacing
   `Outpost.app` with a rebuilt, re-signed Developer ID bundle — keeps the grant
   in force with no re-prompt. Verified by reinstalling a freshly built signed
   bundle over an existing grant and running a wake with no new prompt.
4. The design document records the diagnosed root cause: whether the three-grant
   requirement was live runtime behavior (and which layer fixed it) or stale
   documentation. Verified by reading the design.
5. The Outpost macOS Privacy & Security documentation describes granting one
   process and notes the one-time re-grant on migration. Verified by reading the
   two pages named in Scope.
6. The repository carries one consistent description of how Outpost's spawned
   agents obtain TCC access. Verified by reading the spawn-site comments against
   the documented behavior.

## Constraints and risks

- **Requires hardware verification; no CI guard.** The responsible-process model
  and `responsibility_spawnattrs_setdisclaim` cannot be exercised in CI or on
  Linux, so every behavioral criterion terminates in a manual macOS hardware test
  (consistent with spec 0600's verification). There is no durable CI regression
  guard that single-grant behavior stays fixed across future builds; the design
  should propose the lightest-weight manual re-check that fits the release.
- **Direction of the disclaim call is unsettled.** The project's own comments and
  spec 0600 read the call one way; that reading must be confirmed against actual
  hardware behavior before any change, because an inverted change would silently
  preserve or worsen the gap rather than fail loudly.
- **Cross-signer children.** `node` (Homebrew) and `claude` (Anthropic-signed)
  carry signing identities distinct from a Developer-ID-signed `Outpost.app`
  (and an ad-hoc bundle carries no Team ID at all). Whether the
  responsible-process model attributes the grant to `Outpost.app` regardless of a
  child's own signature must be confirmed on hardware (criteria 1–2 exercise this
  directly), not assumed.
- **One-time migration for existing users.** If closing the gap changes
  attribution, existing users re-grant `Outpost.app` once on migration, after
  which the stale `node` and Claude-CLI grants are unnecessary. This is a real
  cost for the persona — a re-prompt after an update they did not initiate — and
  must be weighed against the first-run friction removed and called out in the
  docs, not left to surprise.
