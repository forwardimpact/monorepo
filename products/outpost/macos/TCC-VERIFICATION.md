# Outpost TCC Verification Runbook

A manual macOS hardware procedure that both **diagnoses** whether Outpost's
spawned agents need more than one TCC grant and **re-checks** that a single
grant to `Outpost.app` still covers them after any change. There is no CI
equivalent — TCC state cannot be exercised on Linux or in a headless runner — so
this runbook is the durable guard, run once to diagnose and once per release to
re-check.

## What this measures

macOS attributes a TCC-gated access to the accessing process's **responsible
process**, walking the spawn chain. Outpost's chain has two `posix_spawn` hops,
each carrying a `responsibility_spawnattrs_setdisclaim` call:

```
Outpost.app  --hop 1-->  fit-outpost daemon  --hop 2-->  claude (node)
   (signed bundle)        ProcessManager.swift            posix-spawn.js
```

The goal is that a single grant to `Outpost.app` covers the whole subtree. This
runbook does **not** assume which disclaim setting achieves that — it measures
the responsible-process lookup at **each hop** and records the setting that
keeps `Outpost.app` responsible.

## TCC services and their `tccutil` identifiers

| Resource             | Path                              | TCC service                 | `tccutil` identifier          |
| -------------------- | --------------------------------- | --------------------------- | ----------------------------- |
| Mail store read      | `~/Library/Mail/…/Envelope Index` | Full Disk Access            | `SystemPolicyAllFiles`        |
| Calendar store read  | `~/Library/Calendars/`            | Full Disk Access            | `SystemPolicyAllFiles`        |
| Knowledge base       | `~/Documents/<kb>`                | Files & Folders (Documents) | `SystemPolicyDocumentsFolder` |
| Draft-side Mail send | Mail via AppleScript              | Automation (AppleEvents)    | `AppleEvents`                 |

The Calendar store is read **as files** (Full Disk Access); this runbook does
**not** exercise the distinct EventKit Calendar service, so a green file-access
result here does not prove Calendar-API coverage.

## Preconditions

- macOS 14 or later.
- A built, installed `Outpost.app` (note its signing identity — Developer ID or
  ad-hoc — for the results block).
- `claude` installed and resolvable by the daemon. The daemon searches
  `/usr/local/bin`, `~/.claude/bin`, `~/.local/bin`, `/opt/homebrew/bin` in that
  order — confirm which binary it will spawn.
- At least one agent configured in `~/.fit/outpost/scheduler.json` with a `kb`
  that exists.
- Root access (`sudo`): the Axis 1 reads (`log stream`, `launchctl procinfo`)
  require it.

## Procedure

Run each step in order. Record outcomes in the **Results** block at the bottom.

**(a) Reset TCC state.** Clear prior grants so the run starts clean:

```sh
tccutil reset SystemPolicyAllFiles
tccutil reset SystemPolicyDocumentsFolder
tccutil reset AppleEvents
```

Then in **System Settings → Privacy & Security**, remove any existing `node` or
Claude-CLI (version-string) entries under Full Disk Access, Files & Folders, and
Automation.

**(b) Grant only `Outpost.app`.** Grant `Outpost.app` Full Disk Access and, if
prompted, Files & Folders (Documents) and Automation for Mail. Grant **nothing**
to `node` or the Claude CLI.

**(c) Start the attribution stream, then wake an agent.** The spawned `claude`
is short-lived, so begin capturing before the wake. In a second terminal, the
TCC subsystem logs the responsible process for each access decision — this is
the **authoritative** attribution signal:

```sh
sudo log stream --predicate 'subsystem == "com.apple.TCC"' --debug
```

Then wake:

```sh
fit-outpost wake <agent-name>
```

**(d) Assert per-hop attribution (Axis 1).** The daemon and its spawned `claude`
child must both be attributed to `Outpost.app`. While the wake runs, capture
both hop pids — the `claude` agent is a **direct child** of the daemon, which
avoids matching the operator's own interactive `claude` session — and read each
one's responsible process:

```sh
DAEMON_PID=$(pgrep -f 'Contents/MacOS/fit-outpost daemon' | head -1)  # hop 1 child
CLAUDE_PID=$(pgrep -P "$DAEMON_PID" | head -1)                        # hop 2 child
sudo launchctl procinfo "$DAEMON_PID" | grep -i 'responsible'
sudo launchctl procinfo "$CLAUDE_PID" | grep -i 'responsible'
```

Read the responsible process from the TCC stream's access lines (authoritative)
and corroborate with `launchctl procinfo`'s responsible-pid field. Record, **per
hop**, whether it is `Outpost.app` — a leaf-only check is not sufficient, one
correct hop can mask an inverted one. If the child exits before you sample it,
re-wake and capture promptly (or pick an agent whose turn runs longer).

**(e) Assert file-access succeeds under one grant (Axis 1+2, file-access).**
Confirm the agent read the Mail/Calendar stores and wrote its briefing:

```sh
ls -t ~/.cache/fit/outpost/state/*_last_output.md | head -1
```

Confirm no `node` or Claude-CLI entry is **required** in the privacy panes for
the read to succeed.

**(f) Exercise Automation (Axis 2, AppleEvents).** Trigger a draft-side skill
(one that drives Mail via AppleScript) and confirm it sends/drafts under the
single `Outpost.app` Automation grant, with no separate `node`/CLI Automation
entry.

**(g) Fix C — conditional direct grant.** If any single service still fails
under the `Outpost.app`-only grant, grant **that one service** (per the table
above) to `Outpost.app` directly, re-run (c)–(f), and record which service
needed it. The remedy is still one process — never a grant to `node` or the CLI.

**(h) Persistence across upgrade (Axis 3).** Rebuild and re-sign `Outpost.app`,
reinstall it over the existing grant, and re-wake:

```sh
fit-outpost wake <agent-name>
```

Confirm the grant is still in force with **no** re-prompt. Record the signing
identity used (Developer ID pins to the bundle's designated requirement; an
ad-hoc build with a deterministic cdhash survives a `brew upgrade`).

## Interpreting the result

- **All axes pass with one grant, no change made** → the three-grant
  documentation was stale; only the docs and spawn-site comments change, and the
  work is internal.
- **Axis 1 fails (a hop resolves to its child)** → the disclaim setting at that
  hop misattributes; apply the recorded attribution-preserving setting to both
  hops and re-run.
- **A service fails (Axis 2)** → document the single direct grant for that
  service on `Outpost.app`.
- **Grant lost on upgrade (Axis 3)** → ship a Developer ID-signed bundle so the
  grant pins to the designated requirement.

## Results

Fill in on every run; this block is the durable, tracked record of the
diagnosis.

```
Date:                    <YYYY-MM-DD>
macOS version:           <e.g. 14.5>
Outpost.app identity:    <Developer ID | ad-hoc>

Axis 1 — per-hop attribution
  hop 1 (daemon)  responsible process:  <Outpost.app | other>   PASS/FAIL
  hop 2 (claude)  responsible process:  <Outpost.app | other>   PASS/FAIL
  attribution-preserving disclaim value (if a change was needed):  <0 | 1 | n/a>

Axis 2 — per-service honoring (under one Outpost.app grant)
  Full Disk Access (Mail/Calendar read):   PASS/FAIL
  Files & Folders (Documents KB):           PASS/FAIL
  Automation (draft-side Mail):             PASS/FAIL
  service(s) needing a direct grant:        <none | service name(s)>

Axis 3 — persistence across re-signed upgrade
  grant survived, no re-prompt:             PASS/FAIL

Diagnosed root cause:    <stale docs | disclaim setting | non-inherited service | persistence | combination>
Fixes applied:           <none | Step 3 | Step 4 | Step 5 | combination>
```
