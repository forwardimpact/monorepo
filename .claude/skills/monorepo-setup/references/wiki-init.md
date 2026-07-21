# Wiki init

Copy-paste seam artifacts for [monorepo-setup](../SKILL.md) Step 6 — standing up
the agent team's persistent memory. The wiki is a separate git repository (the
GitHub Wiki of the repo, `<repo>.wiki.git`) cloned into `wiki/` and gitignored,
so it is never created by the bootstrap commit. Neither `jidoka-setup` nor
`kata-setup` seeds it; this skill does.

Two pieces: a `.claude/settings.json` whose Claude Code hooks bootstrap the
environment and drive the wiki lifecycle, and the three named-ledger files
(`Home.md`, `MEMORY.md`, `STATUS.md`) scaffolded empty so the first agent run
reads a valid wiki instead of an empty clone.

## .claude/settings.json

**SessionStart** bootstraps the environment in two moves: curl the published,
versioned `fit-install.sh` release asset to put the pinned FIT toolchain on
`PATH`, then run local `scripts/bootstrap.sh` (workspace install, then wiki
sync). A consuming repo holds no installer of its own — it fetches the released
artifact pinned to a gear release. **Stop** pushes agent memory back;
**WorktreeCreate** clones the wiki into a fresh worktree.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -fsSL https://github.com/forwardimpact/monorepo/releases/download/<gear-release>/fit-install.sh | bash"
          },
          { "type": "command", "command": "bash scripts/bootstrap.sh" }
        ]
      }
    ],
    "WorktreeCreate": [
      {
        "hooks": [{ "type": "command", "command": "gemba-wiki init" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "gemba-wiki push" }]
      }
    ]
  }
}
```

Pin `<gear-release>` to a concrete `gear@vX.Y.Z` tag — resolve the newest at
setup and write it in:
`gh release list -R forwardimpact/monorepo --json tagName -q '[.[].tagName|select(startswith("gear@v"))][0]'`.
The released `fit-install.sh` self-stamps its gear release, so that one tag
fixes the whole toolchain.

If `jidoka-setup` or `kata-setup` already wrote `.claude/settings.json`,
merge these hook arrays into it rather than overwriting — do not drop their
keys. `gemba-wiki init` may install the `Stop` push hook itself; if it is
already present, leave the single copy in place.

## Seed the named ledgers

The wiki needs its three named ledgers before the first agent boots. Create
them under `wiki/`, then let `init` finish the scaffold and `push` publish it:

1. Enable the wiki on the remote and create its first page (any content) so the
   `<repo>.wiki.git` repository exists — an empty wiki has no git repo to clone.
2. `gemba-wiki init` — clones the wiki into `wiki/`, creates
   `wiki/metrics/<skill>/` directories for each installed skill, and appends the
   `## Active Claims` table to `MEMORY.md`.
3. Write the three files below into `wiki/` (Step 2 leaves `MEMORY.md` with only
   the Active Claims block if it did not exist; write the full template, then
   re-run `init` to re-append Active Claims if needed).
4. `gemba-wiki push` — publishes the seeded ledgers.

Each file is empty apart from scaffolding: a heading, a one-line description of
what the surface is for, and an empty table or fence. Agents and `gemba-wiki`
fill them; do not hand-write state.

### wiki/Home.md

The wiki landing page. Names the surfaces an agent will read.

```markdown
# <repo> — Wiki

Persistent memory for the agent team. Managed by `gemba-wiki`; do not hand-edit a
ledger a command owns.

- **MEMORY.md** — cross-cutting priorities and active claims.
- **STATUS.md** — canonical approval record, one row per spec.
- `<agent>.md` — per-agent summary and message inbox.
- `storyboard-<YYYY>-M<NN>.md` — monthly storyboard.
- `metrics/<skill>/<YYYY>.csv` — per-skill run metrics.
```

### wiki/MEMORY.md

Cross-cutting priorities the whole team reads on boot. `gemba-wiki init` appends
the `## Active Claims` table after this block; leave room for it.

```markdown
## Cross-Cutting Priorities

| Item | Agents | Owner | Status | Added |
| --- | --- | --- | --- | --- |
| *None* | — | — | — | — |
```

### wiki/STATUS.md

The canonical approval record. One row per spec inside the fence, tab-separated:
`<id><TAB><phase><TAB><status>`. Phase is one of `spec`, `design`, `plan`;
status is one of `draft`, `approved`, `implemented`, `cancelled`. Scaffold it
with an empty fence — the first spec adds the first row.

````markdown
# Approval Record

Canonical approval state for every spec, read by the release gate at merge time.
One row per spec inside the fence: `<id><TAB><phase><TAB><status>`. Phase is
`spec` | `design` | `plan`; status is `draft` | `approved` | `implemented` |
`cancelled`.

```
```
````
