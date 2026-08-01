# Outpost TCC Verification Runbook

This is a manual macOS hardware procedure. It **re-checks** that a single grant
to `fit-outpost.app` covers Outpost's spawned agents after any change. There is
no CI equivalent. Neither Linux nor a headless runner can exercise TCC state. So
this runbook is the durable guard. Run it once per release.

## What this measures

macOS attributes a TCC-gated access to the **responsible process** of the
process that requests it. macOS walks the spawn chain to find that process.
Outpost's chain has two `posix_spawn` hops. Each hop carries a
`responsibility_spawnattrs_setdisclaim` call:

```text
fit-outpost.app  --hop 1-->  fit-outpost daemon  --hop 2-->  claude (node)
   (signed bundle)        ProcessManager.swift            posix-spawn.js
```

Hop 1 (`ProcessManager.swift`) always passes `disclaim = 0`. So the daemon stays
a child of `fit-outpost.app`. Hop 2 (`posix-spawn.js`) carries a **per-agent**
disclaim. The agent's declared privilege level sets that disclaim. So an agent
runs with only the macOS reach its job requires:

- A `full` agent (mail/calendar sync, mail send) keeps `disclaim = 0`. So its
  `claude` child inherits `fit-outpost.app` as its responsible process. A single
  grant to the app covers it. This runbook measures that model.
- A `restricted` agent (synced cache → knowledge base only) passes
  `disclaim = 1`. So its `claude` child is **responsible for itself**. The app's
  Full Disk Access and Automation are deliberately **not** extended to it. It
  operates only on non-TCC-protected substrate (the synced cache and the
  relocated knowledge base). macOS denies it a protected read even when it is
  fully prompt-injected.

This runbook re-measures the responsible-process lookup at **each hop** per
release. For a `full` agent both hops must attribute to `fit-outpost.app`. An
inverted `disclaim = 1` would silently break the single-grant model. For a
`restricted` agent hop 2 must be self-responsible and the protected read
**denied**. An inverted `disclaim = 0` would silently grant it the app's reach.

## TCC services and their `tccutil` identifiers

| Resource             | Path                              | TCC service                 | `tccutil` identifier          |
| -------------------- | --------------------------------- | --------------------------- | ----------------------------- |
| Mail store read      | `~/Library/Mail/…/Envelope Index` | Full Disk Access            | `SystemPolicyAllFiles`        |
| Calendar store read  | `~/Library/Calendars/`            | Full Disk Access            | `SystemPolicyAllFiles`        |
| Knowledge base       | `~/.local/share/fit/outpost/<kb>` | none (non-TCC location)     | n/a — a restricted agent reaches it with no grant |
| Draft-side Mail send | Mail via AppleScript              | Automation (AppleEvents)    | `AppleEvents`                 |

Outpost reads the Calendar store **as files** (Full Disk Access). This runbook
does **not** exercise the distinct EventKit Calendar service. So a green
file-access result here does not prove Calendar-API coverage.

## Preconditions

- macOS 14 or later.
- A built, installed `fit-outpost.app`. Note its signing identity (Developer ID
  or ad-hoc) for the results block.
- `claude` installed and resolvable by the daemon. The daemon searches
  `/usr/local/bin`, `~/.claude/bin`, `~/.local/bin`, `/opt/homebrew/bin` in that
  order. Confirm which binary it spawns.
- At least one `full` and one `restricted` agent configured in
  `~/.fit/outpost/scheduler.json`. Each one needs a declared `privilege` level
  and a `kb` that exists (Axis 4 exercises both levels).
- **The daemon must run, and `fit-outpost.app` must launch it** (open the app or
  enable it as a login item). Do not start it with `fit-outpost daemon` from a
  terminal. `fit-outpost wake` forwards the request to this running daemon. Only
  a daemon descended from the app produces the responsible-process chain this
  runbook verifies. A terminal-launched daemon attributes to the terminal
  instead. If no daemon runs, `fit-outpost wake` errors and does not spawn
  locally.
- Root access (`sudo`). The Axis 1 reads (`log stream`, `launchctl procinfo`)
  require it.

## Procedure

Run each step in order. Record outcomes in the **Results** block at the bottom.

**(a) Reset TCC state.** Clear prior grants so the run starts clean:

```sh
tccutil reset SystemPolicyAllFiles
tccutil reset AppleEvents
```

Then in **System Settings → Privacy & Security**, remove any existing `node` or
Claude-CLI (version-string) entries under Full Disk Access and Automation. The
knowledge base is no longer in a TCC-protected folder. So there is no
Files & Folders state to reset.

**(b) Grant only `fit-outpost.app`.** Grant `fit-outpost.app` Full Disk Access
and, if macOS prompts you, Automation for Mail. Grant **nothing** to `node` or
the Claude CLI. The relocated knowledge base
(`~/.local/share/fit/outpost/<kb>`) is outside every TCC-protected folder. So no
Files & Folders grant is involved.

**(c) Start the attribution stream, then wake an agent.** The spawned `claude`
is short-lived. So start the capture before the wake. In a second terminal, the
TCC subsystem logs the responsible process for each access decision. That log is
the **authoritative** attribution signal:

```sh
sudo log stream --predicate 'subsystem == "com.apple.TCC"' --debug
```

Then wake:

```sh
fit-outpost wake <agent-name>
```

This command does not spawn `claude` itself. It forwards the wake over the
daemon socket. The daemon, a child of `fit-outpost.app`, does the spawn. That
places `claude` in the `fit-outpost.app` → daemon → `claude` chain this runbook
measures. The wake runs asynchronously in the daemon. So the command returns as
soon as the daemon accepts it. Sample the pids (step (d)) and the briefing file
(step (e)) against the daemon's work. Do not sample against this command's exit.

**(d) Assert per-hop attribution (Axis 1).** macOS must attribute both the
daemon and its spawned `claude` child to `fit-outpost.app`. The `claude` agent
is a **direct child** of the daemon. That fact keeps you from matching the
operator's own interactive `claude` session. While the wake runs, capture both
hop pids and read each one's responsible process:

```sh
DAEMON_PID=$(pgrep -f 'Contents/MacOS/fit-outpost daemon' | head -1)  # hop 1 child
CLAUDE_PID=$(pgrep -P "$DAEMON_PID" | head -1)                        # hop 2 child
sudo launchctl procinfo "$DAEMON_PID" | grep -i 'responsible'
sudo launchctl procinfo "$CLAUDE_PID" | grep -i 'responsible'
```

Read the responsible process from the TCC stream's access lines
(authoritative). Corroborate it with `launchctl procinfo`'s responsible-pid
field. Record, **per hop**, whether it is `fit-outpost.app`. A leaf-only check
is not sufficient. One correct hop can mask an inverted one. If the child exits
before you sample it, re-wake and capture promptly. You can also pick an agent
whose turn runs longer.

**(e) Assert file-access succeeds under one grant (Axis 1+2, file-access).**
Confirm the agent read the Mail/Calendar stores and wrote its briefing:

```sh
ls -t ~/.cache/fit/outpost/state/*_last_output.md | head -1
```

Confirm the read succeeds with **no** `node` or Claude-CLI entry in the privacy
panes.

**(f) Exercise Automation (Axis 2, AppleEvents).** Trigger a draft-side skill
that drives Mail through AppleScript. Confirm it sends/drafts under the single
`fit-outpost.app` Automation grant, with no separate `node`/CLI Automation
entry.

**(g) Assert per-agent privilege denial (Axis 4).** With the same single
`fit-outpost.app` grant in place, wake one `restricted` agent and one `full`
agent. The `restricted` agent must deliberately attempt a Full Disk
Access-protected read. Make it a **positive probe**, for example a read of
`~/Library/Mail/…/Envelope Index`. A positive probe keeps a denial
distinguishable from "never attempted". In the TCC stream from step (c),
confirm:

- the `restricted` agent's probe shows an explicit `SystemPolicyAllFiles`
  **Denied** decision. `responsible=` resolves to the self-responsible `claude`
  child (not `fit-outpost.app`);
- the `full` agent's live-store read shows `SystemPolicyAllFiles` **Allowed**
  with `responsible=…/fit-outpost.app`.

Then confirm the `restricted` agent still completed its knowledge-base work with
**no** grant present. Its KB is under `~/.local/share/fit/outpost/<kb>`, a
non-TCC location. Its briefing lands at
`~/.cache/fit/outpost/state/<agent>_last_output.md`. Confirm also that **no**
`node`/`claude` entry appears in any privacy pane. Finally, grep the scheduler
log to confirm each wake recorded its resolved level:

```sh
grep outpost.privilege.resolved ~/.fit/outpost/logs/scheduler-*.log
```

Expect one `level: "restricted"` and one `level: "full"` line for the two
agents. An agent whose entry omits the level logs `outpost.privilege.rejected`.
The daemon does not wake it.

**(h) Fix C — conditional direct grant.** If any single service still fails
under the `fit-outpost.app`-only grant, grant **that one service** (per the
table above) to `fit-outpost.app` directly. Re-run (c)–(g). Record which service
needed it. The remedy is still one process. Never grant to `node` or the CLI.

**(i) Persistence across upgrade (Axis 3).** Rebuild and re-sign
`fit-outpost.app`, reinstall it over the existing grant, and re-wake:

```sh
fit-outpost wake <agent-name>
```

Confirm the grant is still in force with **no** re-prompt. Record the signing
identity you used. Developer ID pins to the bundle's designated requirement. An
ad-hoc build with a deterministic cdhash survives a `brew upgrade`.

## Interpreting the result

- **All axes pass with one grant, no change made** → the single-grant model
  holds. Change nothing.
- **Axis 1 fails (a hop resolves to its child)** → the disclaim setting at that
  hop misattributes. Apply the recorded attribution-preserving setting to both
  hops. Re-run.
- **A service fails (Axis 2)** → document the single direct grant for that
  service on `fit-outpost.app`.
- **A `restricted` agent's probe is Allowed, or a `full` agent's read is Denied
  (Axis 4)** → hop 2's per-agent disclaim is inverted. Check
  `resolvePrivilege`/`disclaimFor` and the spawn-call threading in
  `agent-runner.js`. A `restricted` probe that is **never attempted** is not a
  pass. Re-run with the positive probe so you observe the denial.
- **Grant lost on upgrade (Axis 3)** → ship a Developer ID-signed bundle so the
  grant pins to the designated requirement.

## Results

Fill this in on every run. This block is the durable, tracked record of the
diagnosis.

```text
Date:                    <YYYY-MM-DD>
macOS version:           <e.g. 14.5>
fit-outpost.app identity:    <Developer ID | ad-hoc>

Axis 1 — per-hop attribution
  hop 1 (daemon)  responsible process:  <fit-outpost.app | other>   PASS/FAIL
  hop 2 (claude)  responsible process:  <fit-outpost.app | other>   PASS/FAIL
  attribution-preserving disclaim value (if a change was needed):  <0 | 1 | n/a>

Axis 2 — per-service honoring (under one fit-outpost.app grant)
  Full Disk Access (Mail/Calendar read):   PASS/FAIL
  Automation (draft-side Mail):             PASS/FAIL
  service(s) needing a direct grant:        <none | service name(s)>

Axis 3 — persistence across re-signed upgrade
  grant survived, no re-prompt:             PASS/FAIL

Axis 4 — per-agent privilege denial (under one fit-outpost.app grant)
  restricted agent FDA probe:  <SystemPolicyAllFiles Denied | other>   PASS/FAIL
  full agent live-store read:  <SystemPolicyAllFiles Allowed | other>  PASS/FAIL
  restricted KB work completed with no grant (non-TCC KB):             PASS/FAIL
  scheduler log records outpost.privilege.resolved per wake:           PASS/FAIL

Finding:                 <single-grant holds | disclaim setting | non-inherited service | privilege denial | persistence | combination>
Fixes applied:           <none | Step (h) | re-sign | combination>
```
