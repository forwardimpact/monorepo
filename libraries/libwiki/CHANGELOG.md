# Changelog

This file records all notable changes to `@forwardimpact/libwiki`.

## Unreleased

### The roster is the installed profiles

`listAgents` reads each file under the agents directory and keeps the
profiles, the files whose frontmatter carries `name` and `description`. A
reference file is not on the roster. The key is the stem with a trailing
`.agent` removed, and a profile whose `name` differs from its key warns. An
absent directory is an empty roster, and `memo --to all` on an empty roster
warns and exits 0. The predicate and the directory come from
`@forwardimpact/libutil` (`isAgentProfile`, `AGENT_PROFILES_DIR`).
`listProjectAgents` joins the directory under a project root.

### The storyboard rule derives from the roster

`storyboard.agent-h3-required` requires one `### <agent>` section per profile
on the roster the audit context carries. The literal five-name list and the
facilitator's exemption are gone. An empty roster requires no section.

### `refresh` seeds the agent sections

A new month's board carries one `### <agent>` section per roster profile under
Current Condition, and its placeholders name no agent.

### `audit` reports what it checked

The text output ends with a `checked:` line that lists one subject count per
rule scope plus `storyboard-sections`, the sections the roster requires, and
the JSON output carries the same counts under `checked`. A run that checked no
rows no longer reads like a run that checked every row and found no problem.

### Bin moved to `@forwardimpact/gemba` (breaking)

The `fit-wiki` CLI entry point moved to the `@forwardimpact/gemba` product
package as `gemba-wiki`. This change removes the `bin` field and the `bin/`
directory. libwiki is an import-only library. The modules the bin needs are
now package exports (`./wiki-sync.js`, `./util/wiki-dir.js`,
`./cli-definition.js`). **Migration:** install `@forwardimpact/gemba` for
the command. Import `@forwardimpact/libwiki` for the APIs.

### `push --paths` refuses a pathspec that matches nothing

A declared pathspec that matches no tracked path and no pending change exits
with a usage error before any commit. A pathspec-scoped status read such a
path as clean, so the push could report success over an empty write-set.
