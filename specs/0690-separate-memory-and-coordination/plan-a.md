# Plan A — Separate Memory and Coordination

## Approach

Eight textual changes across protocol docs, agent profiles, skill docs,
CLAUDE.md, and KATA.md enforce the memory/coordination separation designed in
design-a.md. No code, no tooling — pure documentation layer. The rename (step 1)
lands first so every downstream step references the new filename; profile
rewrites bundle footer changes with mandate-boundary instructions to minimize
file passes; the invariant row lands last since it depends on the
coordination-protocol rename being in place for its citation reference.

## Steps

### Step 1 — Rename routing-protocol.md → coordination-protocol.md

Rename the file and update its opening framing.

| Action  | File                                                 |
| ------- | ---------------------------------------------------- |
| Created | `.claude/agents/references/coordination-protocol.md` |
| Deleted | `.claude/agents/references/routing-protocol.md`      |

```sh
git mv .claude/agents/references/routing-protocol.md \
      .claude/agents/references/coordination-protocol.md
```

In the renamed file, change line 1 from `# Output Routing Protocol` to
`# Coordination Protocol`. No other content changes — the channel table and
decision questions are already correct per the design.

Verify: `ls .claude/agents/references/routing-protocol.md` fails;
`head -1 .claude/agents/references/coordination-protocol.md` shows
`# Coordination Protocol`.

### Step 2 — Update memory-protocol.md cross-reference and add rotation procedure

Update the sibling link and extend § Cross-Cutting Priority Index.

| Action   | File                                           |
| -------- | ---------------------------------------------- |
| Modified | `.claude/agents/references/memory-protocol.md` |

**2a — Cross-reference (line 5).** Change:

```markdown
[routing-protocol.md](routing-protocol.md).
```

to:

```markdown
[coordination-protocol.md](coordination-protocol.md).
```

**2b — Rotation procedure.** Append three operations after the existing final
paragraph of § Cross-Cutting Priority Index (after
`"Resolved items are removed within one curation cycle."`):

```markdown

**Entry lifecycle:**

- **Add** — Finding affects ≥2 agents and persists beyond the run that surfaced
  it. Link the GitHub artifact (Issue, PR, Discussion) that carries the
  permanent record.
- **Update** — Ownership transfers (change Owner) or material progress lands
  (change Status: PR opened, PR merged, blocker cleared).
- **Remove** — Underlying problem resolved; the linked GitHub artifact is the
  permanent record. Do not keep resolved entries.
```

Verify:
`grep -c "coordination-protocol" .claude/agents/references/memory-protocol.md`
returns 1;
`grep -c "routing-protocol" .claude/agents/references/memory-protocol.md`
returns 0; the file contains `**Add**`, `**Update**`, and `**Remove**` items.

### Step 3 — Add ## Memory and Coordination to CLAUDE.md

Insert a new L8 policy section and compress existing content to stay ≤ 192
lines.

| Action   | File        |
| -------- | ----------- |
| Modified | `CLAUDE.md` |

**3a — Insert new section** between `## Contributor Workflow` (line 109) and
`## Domain Concepts` (line 134), after the checklists paragraph:

```markdown

## Memory and Coordination

Wiki is **memory** — own state (summaries, logs, metrics), not a handoff
channel. **Coordination** requires a named receiver and addressable artifact:
Issue, PR/issue comment, Discussion, or `agent-react`. See
[memory-protocol](.claude/agents/references/memory-protocol.md) and [coordination-protocol](.claude/agents/references/coordination-protocol.md).
```

This adds 7 lines (blank + heading + blank + 4 content lines).

**3b — Compress § Documentation Map** to reclaim 7 lines:

| Before (3 lines)                                                                                                                              | After (1 line)                                                                         | Saves |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----- |
| `Policy entries have one canonical location — other files reference, never`<br>`restate. Per-product Overview and Internals pages are in ...` | `One canonical location per policy. Per-product pages are in [§ Products](#products).` | 2     |

| Before (2 lines)                                                                                  | After (1 line)                                                                                         | Saves |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----- |
| `- **Security** — [CONTRIBUTING.md § Security](CONTRIBUTING.md#security)`<br>`- **Dependency ...` | `- **Security & dependencies** — [CONTRIBUTING.md](CONTRIBUTING.md) (§ Security, § Dependency Policy)` | 1     |

| Before (2 lines)                                                                            | After (1 line)                                                                                      | Saves |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----- |
| `- **Repo self-maintenance** — [KATA.md](KATA.md) ·`<br>`  [Internals](...) · [Brand](...)` | `- **Repo self-maintenance** — [KATA.md](KATA.md) · [Internals](websites/fit/docs/internals/kata/)` | 1     |

| Before (2 lines)                                                           | After (1 line)                                                                  | Saves |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----- |
| `- **Getting started** —`<br>`  [websites/fit/docs/getting-started/](...)` | `- **Getting started** — [Getting Started](websites/fit/docs/getting-started/)` | 1     |

Remove `- **Operations**` entry (1 line — already linked from § Contributor
Workflow line 116). Remove `- **REPL API**` entry (1 line — derivable from
`websites/fit/docs/internals/librepl/` directory).

Total: 2 + 1 + 1 + 1 + 1 + 1 = 7 lines saved = 7 lines reclaimed.

Verify: `wc -l CLAUDE.md` ≤ 192;
`grep -q "^## Memory and Coordination" CLAUDE.md` succeeds; the section mentions
`wiki`, `Issue`, `Discussion`, `comment`, and `agent-react`.

### Step 4 — Update KATA.md § Shared Memory and § Coordination Channels

Align both sections with the memory/coordination dichotomy.

| Action   | File      |
| -------- | --------- |
| Modified | `KATA.md` |

**4a — § Shared Memory** (after line 183). Append after the existing paragraph
ending `"...sub-skills and utility skills are exempt."`:

```markdown
The wiki holds settled state — open questions live in Discussions until answered.
```

**4b — § Coordination Channels** (lines 185–214). Four changes:

1. Opening paragraph (lines 187–194). Replace:

```markdown
Five channels (including the wiki described above) carry agent-to-agent and
agent-to-human collaboration, distinguished by **time horizon** and
**persistence**. Per-output routing across them — including cross-agent
escalation, run-time trust, Discussion ownership, and inbound comment handling —
is governed by
[routing-protocol.md](.claude/agents/references/routing-protocol.md), the
sibling of `memory-protocol.md`. Each channel has an explicit non-purpose so
they don't compete.
```

with:

```markdown
Four channels carry agent-to-agent and agent-to-human collaboration,
distinguished by **time horizon** and **persistence**. Per-output coordination
across them — including cross-agent escalation, run-time trust, Discussion
ownership, and inbound comment handling — is governed by
[coordination-protocol.md](.claude/agents/references/coordination-protocol.md),
the sibling of `memory-protocol.md`. Each channel has an explicit non-purpose so
they don't compete.
```

2. Table (lines 196–202): delete the `**Wiki**` row (the row starting
   `| **Wiki** |`).

3. Sub-agent row: change
   `(not for cross-agent comms — see escalation in routing-protocol)` to
   `(not for cross-agent comms — see escalation in coordination-protocol)`.

4. Bullet list (lines 204–214): delete the `**Wiki**` bullet
   (`- **Wiki** holds settled state...`) — moved to § Shared Memory in 4a.

Verify: § Coordination Channels has no `Wiki` row; opening names four channels;
`grep -q "coordination-protocol" KATA.md` matches;
`grep -qv "routing-protocol" KATA.md`.

### Step 5 — Rewrite agent profile footers and mandate-boundary instructions

Replace the single conflated footer with two distinct entries in all six
profiles, and name receiving artifacts at mandate boundaries.

| Action   | File                                  |
| -------- | ------------------------------------- |
| Modified | `.claude/agents/release-engineer.md`  |
| Modified | `.claude/agents/staff-engineer.md`    |
| Modified | `.claude/agents/improvement-coach.md` |
| Modified | `.claude/agents/product-manager.md`   |
| Modified | `.claude/agents/security-engineer.md` |
| Modified | `.claude/agents/technical-writer.md`  |

**5a — Footer rewrite (all six profiles).** Replace:

```markdown
- **Coordination Channels**:
  [memory](.claude/agents/references/memory-protocol.md) (files:
  `wiki/{agent}.md`, `wiki/{agent}-$(date +%G-W%V).md`),
  [routing](.claude/agents/references/routing-protocol.md).
```

with (substituting the agent name in each file):

```markdown
- **Memory**: [memory-protocol.md](.claude/agents/references/memory-protocol.md)
  — files: `wiki/{agent}.md`, `wiki/{agent}-$(date +%G-W%V).md`
- **Coordination**:
  [coordination-protocol.md](.claude/agents/references/coordination-protocol.md)
  — channels: Issues, Discussions, PR/issue comments, `agent-react`
```

**5b — release-engineer.md mandate boundary (line 39).** Change:

```markdown
   `check:fix`, stop and report)
```

to:

```markdown
   `check:fix`, stop and open a GitHub Issue describing the failure and bisect
   findings)
```

Verify: for each profile `f`, `grep -c "memory-protocol" f` ≥ 1 AND
`grep -c "coordination-protocol" f` ≥ 1 AND no single line matches both
protocols. For release-engineer.md, line 39 area names "GitHub Issue".

### Step 6 — Update kata-ship/SKILL.md mandate boundary

Name the receiving artifact for the ship-flow boundary stop.

| Action   | File                                |
| -------- | ----------------------------------- |
| Modified | `.claude/skills/kata-ship/SKILL.md` |

Change line 173:

```markdown
If any check fails, stop and report — do not attempt code fixes from inside this
```

to:

```markdown
If any check fails, stop and comment on the PR describing the failure — do not
attempt code fixes from inside this
```

Verify: the "stop and" instruction in kata-ship names "comment on the PR".

### Step 7 — Update inbound references in skill files and invariants

Replace `routing-protocol` with `coordination-protocol` in all remaining
references not already handled by steps 2 (memory-protocol.md), 4 (KATA.md), or
5 (agent profiles).

| Action   | File                                                 |
| -------- | ---------------------------------------------------- |
| Modified | `.claude/skills/kata-product-issue/SKILL.md`         |
| Modified | `.claude/skills/kata-documentation/SKILL.md`         |
| Modified | `.claude/skills/kata-trace/SKILL.md`                 |
| Modified | `.claude/skills/kata-product-pr/SKILL.md`            |
| Modified | `.claude/skills/kata-security-audit/SKILL.md`        |
| Modified | `.claude/skills/kata-trace/references/invariants.md` |
| Modified | `CONTRIBUTING.md`                                    |
| Modified | `websites/fit/docs/internals/kata/index.md`          |

In each file, replace every occurrence of `routing-protocol.md` with
`coordination-protocol.md` and every occurrence of `routing-protocol` (in prose)
with `coordination-protocol`. Specific references:

| File                                        | Lines        | Occurrences |
| ------------------------------------------- | ------------ | ----------- |
| `kata-product-issue/SKILL.md`               | 50, 133, 140 | 3           |
| `kata-documentation/SKILL.md`               | 173, 181     | 2           |
| `kata-trace/SKILL.md`                       | 176          | 1           |
| `kata-product-pr/SKILL.md`                  | 171, 180     | 2           |
| `kata-security-audit/SKILL.md`              | 118, 143     | 2           |
| `invariants.md`                             | 79           | 1           |
| `CONTRIBUTING.md`                           | 82           | 1           |
| `websites/fit/docs/internals/kata/index.md` | 164          | 1           |

Verify:
`grep -r "routing-protocol" .claude/ CLAUDE.md KATA.md CONTRIBUTING.md websites/ --include='*.md'`
returns no matches (excluding `specs/` which contains historical references).

### Step 8 — Add mandate-boundary invariant to invariants.md

Add the new cross-cutting invariant.

| Action   | File                                                 |
| -------- | ---------------------------------------------------- |
| Modified | `.claude/skills/kata-trace/references/invariants.md` |

Append a new row to the § Cross-cutting invariants table (after the
`Discussions resolved within 14 days` row):

```markdown
| Mandate-boundary stop produces at least one non-wiki artifact | Agent turn contains boundary-stop language (`stop and report`, `stopping per protocol`, `exceeds scope`, `mandate boundary`) AND trace contains no `fix/` or `spec/` branch creation → at least one of: `gh issue create`, `gh (issue\|pr) comment`, `createDiscussion` mutation, `addDiscussionComment` mutation, or `Agent` tool referencing `agent-react` appears after the trigger turn | **High**   |
```

Verify:
`grep -q "non-wiki artifact" .claude/skills/kata-trace/references/invariants.md`
matches with severity `High`. Re-running the invariant audit against trace
`25039150119` (via `bunx fit-trace download 25039150119`) records `FAIL` on the
new invariant — the trace contains "Stopping per protocol; routing to staff
engineer" with zero non-wiki outputs.

## Libraries used

None.

## Risks

- **CLAUDE.md line budget.** Adding 7 lines and compressing 7 requires precise
  edits; `scripts/check-instructions.mjs` will catch overruns but a miscounted
  compression needs a second pass.

## Execution

Single `staff-engineer` agent, sequential. Step 1 (rename) must land first; all
remaining steps depend on it for the new filename. Steps 2–8 are independent of
each other and could theoretically run in parallel, but the small file count (≤
22 files) makes sequential execution straightforward and avoids merge-conflict
risk on shared files.
