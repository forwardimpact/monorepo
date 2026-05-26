# Spec 0610 — Agent Self-Maintenance Under `.claude/**` Write Protection

## Problem

Agents cannot maintain the files that govern their own behaviour. Every path
under `.claude/**` is guarded by a Claude Code permission check that denies
`Write` and `Edit` calls, and ordinary `Bash` writes too. Any agent task that
edits its own skill references, shared agent protocol files, or nested skill
content silently fails mid-run. Two prior repairs targeted the symptom but left
the guard in place and produced a settings file that advertises capability the
runtime will never grant.

### Evidence — the guard is still active

On 2026-04-23, staff-engineer run
[`24831607838`](https://github.com/forwardimpact/monorepo/actions/runs/24831607838)
attempted to execute spec 0590 Part 01, which rewrites
`.claude/agents/references/memory-protocol.md`. The agent produced six
consecutive permission denials on the same path and the run ended with no commit
and no PR:

| Turn | Tool  | Error                                                                                                                      |
| ---- | ----- | -------------------------------------------------------------------------------------------------------------------------- |
| 60   | Write | `Claude requested permissions to write to …/.claude/agents/references/memory-protocol.md, but you haven't granted it yet.` |
| 62   | Write | Same                                                                                                                       |
| 64   | Write | Same                                                                                                                       |
| 67   | Edit  | Same                                                                                                                       |
| 69   | Edit  | Same                                                                                                                       |
| 72   | Bash  | Same (`cat > … <<ENDOFFILE`)                                                                                               |

Prior traces on the same guard, different path:

- Product-manager run
  [`24756152077`](https://github.com/forwardimpact/monorepo/actions/runs/24756152077)
  — blocked on
  `.claude/skills/kata-documentation/references/source-of-truth.md`.
- Technical-writer run
  [`24634066195`](https://github.com/forwardimpact/monorepo/actions/runs/24634066195)
  — same path (documented in issue #441).

### Evidence — the current settings allow-list is dead code

Commit
[`67e0825b`](https://github.com/forwardimpact/monorepo/commit/67e0825b8f8724a033d9e3ae6a78f098ff439941)
(PR #470) replaced an earlier broad allow rule (`Edit(.claude/**)` /
`Write(.claude/**)`, PR #467) with a narrower allow list:

```json
"allow": [
  "Edit(.claude/skills/**)",
  "Edit(.claude/agents/**)",
  "Write(.claude/skills/**)",
  "Write(.claude/agents/**)"
]
```

The fix was merged on a docs reading with no verification trace. Claude Code's
rule precedence is `deny > ask > allow`, so an `allow` entry cannot shadow the
hardcoded ask-level guard the harness applies to `.claude/**`. The four rules
above are structurally incapable of granting any write — the staff-engineer run
above had them in effect and was still blocked.

### Evidence — one undocumented workaround exists

Product-manager run
[`24757518688`](https://github.com/forwardimpact/monorepo/actions/runs/24757518688)
produced PR #472, which edited
`.claude/skills/kata-documentation/references/source-of-truth.md`. The trace
shows the mechanism. Turns 50–70 logged five identical `Edit` denials on the
path. Turn 66 switched to the `Bash` tool with `dangerouslyDisableSandbox: true`
and a single `sed -i` call, which succeeded:

```json
{
  "tool": "Bash",
  "input": {
    "command": "sed -i '/| Stages.*stages\\.yaml/d' .claude/skills/kata-documentation/references/source-of-truth.md",
    "dangerouslyDisableSandbox": true
  }
}
```

The PR was merged at 02:52Z and closed issue #441. The workaround was empirical,
confined to one agent run, and was never promoted into a skill or reference
where other agents would discover it. Issue #441 was closed on a one-file
repair; the infrastructure that makes the next 46 files unmaintainable was not
touched.

### Evidence — scope of affected files

Files under `.claude/**` that any agent might need to edit and that the guard
currently blocks:

| Location                              | Count              | Example                                            |
| ------------------------------------- | ------------------ | -------------------------------------------------- |
| `.claude/skills/<skill>/references/*` | 24 dirs / 46 files | `.claude/skills/kata-trace/references/examples.md` |
| `.claude/skills/<skill>/examples/*`   | (included above)   | `.claude/skills/fit-guide/references/cli.md`       |
| `.claude/agents/references/*`         | 1 dir / 1 file     | `.claude/agents/references/memory-protocol.md`     |

Total: **47 agent-maintained files structurally unwritable by the agents that
consume them.** Skill bundles ship as self-contained units via
`npx skills add forwardimpact/skills`, so relocating skill references out of
`.claude/skills/` to escape the guard is not viable — it breaks skill
portability.

### Who is affected

All six kata agents and every published `fit-*` skill. Concretely:

- Staff-engineer cannot execute spec 0590 Part 01 (blocked today).
- Technical-writer cannot correct phantom documentation rows (#441 original).
- Every skill author who wants to iteratively refine `references/*.md` based on
  trace evidence is forced into a human-gated path or an undocumented Bash hack.

Secondary effect: the dead allow rules in `.claude/settings.json` are actively
misleading. Future contributors reading the settings will assume agents can
write under `.claude/agents/**` and `.claude/skills/**`; they cannot, and the
next fix attempt framed at that layer will fail the same way.

## Proposal

Establish one supported mechanism by which agents may write files under
`.claude/**` during a normal run, document it where agents discover it, and
remove the dead allow rules from `.claude/settings.json` so the settings file
describes actual capability.

### Capabilities to add or change

**A supported write path for agent self-maintenance.**

There must be one mechanism that a kata agent can use to edit any file under
`.claude/**` during a scheduled run without human intervention. The mechanism
must be observable in a trace (so kata-trace can audit invariant compliance),
reversible at the commit boundary (so review remains a human gate), and
reachable from the standard agent toolset without bespoke setup per skill. Which
mechanism to adopt is a design decision. Candidate directions to evaluate, none
pre-selected:

- Standardise the `dangerouslyDisableSandbox` + `sed`/here-doc pattern used by
  product-manager run `24757518688` as the official escape hatch, with a single
  shared reference that every skill cites when it needs to write under
  `.claude/**`.
- Adopt a staging-directory pattern: agents write to `/tmp/claude-writes/…` and
  a `Stop` hook copies files to their `.claude/**` target on success. Matches
  the existing wiki-push pattern.
- Infrastructure change: upgrade Claude Code, change the supervisor's
  permission-mode configuration, or modify `.claude/settings.json` with rules
  that the runtime actually honours (for example, a `deny` removal or a
  permission-mode override). Whether any such rule exists is a design question.
- Keep `.claude/**` human-only. Agents raise an issue when a `.claude/**` edit
  is required; a human commits it. Accepts higher latency for every skill
  refinement but is the simplest surface.

**Honest settings file.**

`.claude/settings.json` must describe only capabilities the runtime grants. The
four allow rules added by PR #470 that the runtime ignores must either start
granting writes or be removed. Whether additional rules replace them is a
function of the mechanism chosen above.

**Discoverable documentation.**

Whichever mechanism is chosen, the rule by which an agent decides whether a
`.claude/**` edit is possible at all, and how to perform one when it is, must
live in a single canonical location that the agent reads as part of its normal
startup surface (per the tiered-memory protocol that spec 0590 introduces) or
that the skill consults when it needs to write. Ad-hoc per-skill reinvention (as
happened in product-manager run `24757518688`) is explicitly disallowed by this
spec.

## Scope

### Included

- The Claude Code permission model as it applies to `.claude/**` writes, read
  empirically from the four cited traces, not from documentation alone.
- `.claude/settings.json` `permissions.allow` entries targeting `.claude/**`.
- Any new shared reference that documents the supported write path (location to
  be named in design).
- Skills that today edit, or should be able to edit, files under `.claude/**`:
  `kata-wiki-curate`, `kata-documentation`, any skill whose plan writes to its
  own `references/` subdir.
- Reopening of issue #441 as not-fixed: the one-file repair stands, but the
  infrastructure claim (`Closes #441`) is withdrawn.

### Excluded

- **Redesign of the agent permission model at large.** Other sensitive paths
  (`.git/**`, `.github/**`, `.vscode/**`) stay governed by whatever rules
  currently apply; this spec is about `.claude/**` only.
- **Which specific mechanism to adopt.** The four candidate directions in the
  Proposal are enumerated, not ranked; choosing one is the design's job.
- **Spec 0590.** Staff-engineer's in-flight spec is independent and will benefit
  from whichever mechanism this spec settles on, but the re-plan of 590 is not
  part of this spec's deliverables.
- **Retroactive fix of historical non-fixes.** Commit `67e0825b` stays in
  history; this spec only requires that the current state of `settings.json`
  reflects actual capability.

## Success Criteria

1. A single canonical reference names the supported mechanism by which an agent
   may edit a file under `.claude/**`. Any kata agent can locate this reference
   from the files it already reads at startup, without prior knowledge of the
   mechanism. The reference states what is and is not supported.
2. A kata-trace analysis of a newly-scheduled run of the technical-writer or
   staff-engineer agent, invoked on a task that edits a file under
   `.claude/**/references/**`, produces a trace in which the edit succeeds, no
   `"Claude requested permissions to write"` error appears, the tool call used
   is the one the reference documents, and a commit containing the change is
   pushed.
3. `.claude/settings.json` contains no `permissions.allow` entry whose behaviour
   contradicts the runtime. Either every listed rule grants writes under trace
   evidence, or the rule is removed.
4. Issue #441 is either (a) reopened and then closed again via the mechanism
   this spec adopts, confirmed by a trace as in Criterion 2, or (b) a new issue
   supersedes it and closes on the same evidence. The original closure via PR
   #472 alone is not sufficient.
5. A kata-trace report exists (stored under `wiki/metrics/improvement-coach/` or
   equivalent) comparing the number of permission-denial errors seen in
   `.claude/**` write attempts across two adjacent weeks: the week before the
   fix and the week after. Post-fix denials on agent-scheduled runs drop to
   zero.
6. Any skill that edits files under its own `.claude/skills/<skill>/**` path
   cites the canonical reference from Criterion 1. No skill invents its own
   workaround. A grep over `.claude/skills/**/SKILL.md` and
   `.claude/skills/**/references/**` for `dangerouslyDisableSandbox` either
   finds zero matches (if the mechanism is different) or finds every match
   paired with a link to the canonical reference.
7. Existing workflows continue to succeed: `bunx fit-map validate`,
   `just quickstart`, and the wiki push / curate pipelines all pass against the
   repository with the new mechanism in place.
