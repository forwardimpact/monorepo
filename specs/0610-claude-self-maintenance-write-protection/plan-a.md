# Plan A — Spec 0610: Agent Self-Maintenance Write Protection

## Approach

Bridge the `.claude/**` write gap with three artifacts — a path-gated shell
script, a canonical agent reference, and a kata-trace invariant — plus skill
citations that point every affected skill at the canonical reference.
Settings.json is already at target state and needs no changes.

The wrapper is the single approved mechanism for `.claude/**` writes. Every
other artifact exists to document, cite, or enforce that constraint. The total
blast radius is 2 new files, 4 modified files, and 1 verified-unchanged file.

## Step 1 — Create `scripts/claude-write.sh`

**Creates:** `scripts/claude-write.sh`  
**Dependencies:** none

Path-gated writer. Accepts a target path as its sole argument and file content
on stdin. Resolves the target (follows symlinks, collapses `..` segments via
`cd` + `pwd -P`) and writes iff the resolved path is strictly inside the repo's
`.claude/` directory. Refuses all other targets with a distinct exit code.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Path-gated writer for .claude/** files.
# Usage: bash scripts/claude-write.sh <target-path> <<< "content"
#   or:  <content> | bash scripts/claude-write.sh <target-path>
#
# Exit codes: 0 = written, 1 = refused (outside .claude/), 2 = usage error.

target="${1:?Usage: claude-write.sh <target-path>}"

repo_root="$(cd "$(dirname "$0")/.." && pwd -P)"
claude_dir="$repo_root/.claude"

# Make absolute relative to repo root
[[ "$target" = /* ]] || target="$repo_root/$target"

# Parent directory must exist
parent="$(dirname "$target")"
if [[ ! -d "$parent" ]]; then
  echo "claude-write: parent directory does not exist: $parent" >&2
  exit 2
fi

# Resolve parent (follows symlinks, collapses ..)
resolved="$(cd "$parent" && pwd -P)/$(basename "$target")"

# If target is an existing symlink, resolve through it
if [[ -L "$resolved" ]]; then
  link="$(readlink "$resolved")"
  [[ "$link" = /* ]] || link="$(dirname "$resolved")/$link"
  link_parent="$(dirname "$link")"
  if [[ ! -d "$link_parent" ]]; then
    echo "claude-write: symlink target directory does not exist: $link_parent" >&2
    exit 2
  fi
  resolved="$(cd "$link_parent" && pwd -P)/$(basename "$link")"
fi

# Gate: must be strictly inside .claude/
if [[ "$resolved" != "$claude_dir/"* ]]; then
  echo "claude-write: refused — resolved path is outside .claude/: $resolved" >&2
  exit 1
fi

cat > "$resolved"
```

After writing: `chmod +x scripts/claude-write.sh`.

## Step 2 — Create `.claude/agents/references/self-maintenance.md`

**Creates:** `.claude/agents/references/self-maintenance.md`  
**Dependencies:** Step 1 (references the wrapper)

Canonical reference for agent self-maintenance writes. Sibling of
`memory-protocol.md`, on the existing agent startup surface. Contains four
sections: the rule, the invocation contract, the refusal surface, and the trace
invariant pointer.

```markdown
# Self-Maintenance Writes Under `.claude/**`

Claude Code's permission guard blocks `Write`, `Edit`, and sandboxed `Bash`
calls targeting `.claude/**`. Until upstream regression
[claude-code#38806](https://github.com/anthropics/claude-code/issues/38806) is
resolved, agents use the path-gated wrapper described below.

## Rule

Every agent edit under `.claude/**` goes through `scripts/claude-write.sh`. No
other mechanism is supported. Do not use `Edit`, `Write`, or sandboxed `Bash` on
`.claude/**` paths — they will be denied.

## Invocation

Use the `Bash` tool with `dangerouslyDisableSandbox: true`. Deliver file content
on stdin via heredoc:

    bash scripts/claude-write.sh .claude/path/to/file <<'CLAUDE_WRITE_EOF'
    file content here
    CLAUDE_WRITE_EOF

- **Target path** — relative to repo root or absolute. The wrapper resolves `..`
  and symlinks before the gate check.
- **Content** — stdin (heredoc). Written verbatim to the target.
- **Sandbox** — must be disabled (`dangerouslyDisableSandbox: true`). The
  wrapper is unreachable from inside the sandbox.

## Refusal surface

The wrapper refuses writes to any path that resolves outside `.claude/`:

| Exit | Meaning                                        |
| ---- | ---------------------------------------------- |
| 0    | Written successfully                           |
| 1    | Refused — target resolves outside `.claude/`   |
| 2    | Error — parent directory or symlink target missing |

If you see exit 1, the target path is wrong — check for `..` segments or
symlinks that escape `.claude/`. If you see exit 2, the parent directory does not
exist — create it with `mkdir -p` before calling the wrapper.

## Trace invariant

`kata-trace` enforces that every `dangerouslyDisableSandbox: true` Bash call
invokes `scripts/claude-write.sh`. Any sandbox-disabled call not routed through
the wrapper is a **high-severity** trace finding. See
`.claude/skills/kata-trace/references/invariants.md` § Cross-cutting invariants.

## Retirement

When [claude-code#38806](https://github.com/anthropics/claude-code/issues/38806)
lands and `Edit`/`Write` calls on `.claude/**` succeed under
`bypassPermissions`, this wrapper and reference retire by deletion.
`.claude/settings.json` is already at target state — no change needed at
retirement.
```

## Step 3 — Verify `.claude/settings.json`

**Modifies:** nothing  
**Dependencies:** none

Verify that `.claude/settings.json` is already at target state. Expected:

- `"defaultMode": "bypassPermissions"`
- `permissions.allow` contains six entries: `Edit(.claude/agents/**)`,
  `Edit(.claude/commands/**)`, `Edit(.claude/skills/**)`,
  `Write(.claude/agents/**)`, `Write(.claude/commands/**)`,
  `Write(.claude/skills/**)`

Both conditions are already met. No changes needed. If the file has drifted from
this state by implementation time, restore it to the above before proceeding.

**SC3 note:** The design (Component 3) acknowledges tension with SC3 as
literally read ("every allow entry must grant writes under trace evidence
today"). The design reads SC3's intent as "settings must not lie about
capability" — honored because the allow rules track Anthropic's documented
exemption contract for `bypassPermissions` mode, even though regression #38806
currently prevents the contract from being fulfilled. PR #470's prior rules had
no documented basis; these do. The implementer should not remove the allow
entries to satisfy a strict SC3 reading — they are correct at target state.

## Step 4 — Add cross-cutting invariant to `invariants.md`

**Modifies:** `.claude/skills/kata-trace/references/invariants.md`  
**Dependencies:** Step 1 (references the wrapper's trace signature)

Append after the final per-agent table (currently
`## improvement-coach traces`):

```markdown

## Cross-cutting invariants

Applicable to every agent trace regardless of agent type.

| Invariant                                                         | Evidence to find                                                                                                                              | Severity |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `dangerouslyDisableSandbox: true` only used to invoke the wrapper | Every turn with `tool=="Bash"` and `input.dangerouslyDisableSandbox==true` has a `command` beginning with `bash scripts/claude-write.sh ` | **High** |
```

## Step 5 — Add skill citations

**Modifies:** 3 SKILL.md files  
**Dependencies:** Step 2 (the reference must exist to cite)

Insert a one-line conditional pointer after each skill's
`### Step 0: Read Memory` block. The pointer directs agents to the
self-maintenance reference only when the run targets `.claude/**` paths.

### 5a — `kata-documentation`

**File:** `.claude/skills/kata-documentation/SKILL.md`  
**After:** line 71
(`teammates' summaries). Find last review dates per topic in the coverage map.`)  
**Before:**
line 73 (`### Topic selection`)

```markdown

> **`.claude/**` writes:** If this run edits files under `.claude/skills/`,
> follow [self-maintenance.md](../../agents/references/self-maintenance.md).
```

### 5b — `kata-wiki-curate`

**File:** `.claude/skills/kata-wiki-curate/SKILL.md`  
**After:** line 46 (`- `wiki/Home.md``) **Before:** line 48 (`### Step 1:
Summary accuracy`)

```markdown

> **`.claude/**` writes:** If this run edits files under `.claude/agents/` or
> `.claude/skills/`, follow
> [self-maintenance.md](../../agents/references/self-maintenance.md).
```

### 5c — `kata-implement`

**File:** `.claude/skills/kata-implement/SKILL.md`  
**After:** line 62 (`from prior `staff-engineer` entries.`)  
**Before:** line 64 (`### 1. Study the spec deeply`)

```markdown

> **`.claude/**` writes:** If the plan targets files under `.claude/`, follow
> [self-maintenance.md](../../agents/references/self-maintenance.md).
```

## Step 6 — Handle issue #441

**Dependencies:** Steps 1–5 complete

Reopen issue #441 via `gh issue reopen 441` with a comment explaining:

- The original PR #472 fix was a one-file repair; the infrastructure remained
  broken.
- Spec 0610 provides the wrapper mechanism.
- The issue will close when a trace-verified agent run demonstrates the fix
  (SC4).

Alternatively, if #441 cannot be reopened, create a new issue referencing it and
close the new issue on the same evidence.

## Step 7 — Update `specs/STATUS`

**Modifies:** `specs/STATUS`  
**Dependencies:** all above steps

Change line:

```text
0610	design	approved
```

to:

```text
0610	plan	draft
```

## Blast radius

| Action | File                                                 |
| ------ | ---------------------------------------------------- |
| Create | `scripts/claude-write.sh`                            |
| Create | `.claude/agents/references/self-maintenance.md`      |
| Modify | `.claude/skills/kata-trace/references/invariants.md` |
| Modify | `.claude/skills/kata-documentation/SKILL.md`         |
| Modify | `.claude/skills/kata-wiki-curate/SKILL.md`           |
| Modify | `.claude/skills/kata-implement/SKILL.md`             |
| Modify | `specs/STATUS`                                       |
| Verify | `.claude/settings.json` (no change expected)         |

## Ordering

```text
Step 1 (wrapper)  ──┬── Step 4 (invariant) ──┐
                    │                        ├── Step 6 (#441) ── Step 7 (STATUS)
Step 2 (reference) ─┴── Step 5 (citations) ──┘
Step 3 (verify)  ── (independent, no downstream dependents)
```

Steps 1–3 are independent. Step 4 depends on 1. Step 5 depends on 2. Step 3 is a
standalone verification with no downstream dependents. Steps 4 and 5 are
independent of each other. Step 6 depends on 1–5. Step 7 is last.

## Non-obvious decisions

1. **Settings.json needs no changes.** It already has `bypassPermissions` and
   the three `.claude/` subpath allow entries the design specifies. Verified by
   reading the current file against the design's Component 3.

2. **`kata-wiki-curate` gets a citation despite writing to `wiki/`, not
   `.claude/`.** The design explicitly names it. The citation is conditional
   ("if this run edits…") and costs nothing when the run stays inside `wiki/`.

3. **`kata-implement` gets a citation.** It is the primary executor of specs
   whose plans target `.claude/**` files (e.g., spec 0590 Part 01). The citation
   is conditional.

4. **No `mkdir -p` in the wrapper.** The wrapper requires the parent directory
   to exist. Directory creation is a caller responsibility, not a write-gate
   concern.

5. **Heredoc delimiter is a convention, not a mandate.** The reference shows
   `CLAUDE_WRITE_EOF` but agents may use any delimiter. If file content contains
   the delimiter on a line by itself, the agent picks a different one.

## Risks

| Risk                                         | Likelihood    | Mitigation                                                                                                      |
| -------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| `dangerouslyDisableSandbox` removed upstream | Low           | Wrapper retires when #38806 lands; exposure window is bounded                                                   |
| macOS `readlink` single-hop limitation       | Low           | No nested symlinks exist in `.claude/`; parent resolution via `cd + pwd -P` handles `..` and directory symlinks |
| Heredoc delimiter collision                  | Low           | Agents choose a different delimiter; the reference documents the pattern, not a fixed string                    |
| Wrapper is world-executable                  | Informational | Same trust model as every other script in `scripts/`; the gate only controls destination, not authorization     |

## Libraries used

No `@forwardimpact/lib*` packages are consumed. Implementation is shell
(wrapper), Markdown (reference, invariant, citations), and a STATUS file update.

## Execution

Single `staff-engineer` agent, sequential. All changes are small, tightly
coupled, and target a single branch. No `website/` pages are created or modified
— no `technical-writer` agent needed.

## Post-merge verification

These success-criteria checks happen after the implementation merges:

- **SC2** — Schedule a staff-engineer or technical-writer run that edits a
  `.claude/**/references/**` file. Verify via kata-trace that the wrapper
  invocation succeeds, no permission-denial errors appear, and a commit is
  pushed.
- **SC4** — Close issue #441 via the trace evidence from SC2.
- **SC5** — improvement-coach schedules a kata-trace two-week comparative report
  of `.claude/**` permission-denial counts (pre-fix week vs post-fix week),
  stored in `wiki/metrics/improvement-coach/`.
- **SC7** — Verify `bunx fit-map validate`, `just quickstart`, and wiki
  push/curate pipelines pass.
