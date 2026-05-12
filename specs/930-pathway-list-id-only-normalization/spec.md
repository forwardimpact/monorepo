# Spec 930 — Pathway `--list` emits ids only across entity commands

## Why

`fit-pathway` documents one `--list` contract and ships a different one. Issue
[#875](https://github.com/forwardimpact/monorepo/issues/875) caught the
mismatch during a `kata-interview` user-testing run: a J060 software engineer
trying to confirm their current level and the next one above ran
`bunx fit-pathway level --list` and got three unlabeled, comma-separated
columns. Inferring column meaning from the synthetic-data labels alone, the
persona reported "I almost thought I was at the wrong level."

JTBD: **Empowered Engineers § Understand Expectations** ([JTBD.md](../../JTBD.md))
— the job is "see what is expected at my level and what is expected at the
level above." The first surface the persona reaches is `--list`. Today that
surface contradicts itself: the factory header in
`products/pathway/src/commands/command-factory.js:9` says

> `--list`: Clean newline-separated list of IDs (for piping)

but every entity command overrides `formatListItem` to emit a comma-separated
descriptive line:

| Command | Current `--list` shape |
| --- | --- |
| `level` | `J060, Engineer, Senior Manager` |
| `discipline` | `se, backend, individual_contributor, [...tracks]` |
| `track` | `backend, Backend Engineering` |
| `behaviour` | `craftsmanship, Craftsmanship` |
| `driver` | `quality, Quality` |
| `skill` | `code-review, Code Review, craftsmanship` |

The user-visible problem is small (a confusing CSV); the underlying problem is
a contract contradiction that points two ways. Resolving it is a one-line
documentation decision in `command-factory.js` plus six small command-file
edits, but the resolution is a product decision — which is why this is a spec
rather than a one-line patch.

## What

Make every Pathway entity command's `--list` output match the factory contract:
**one id per line, no header, no commas**. Title and descriptive columns are
already available in the default (non-`--list`) view, which is the canonical
human-readable surface; `--list` becomes the canonical pipe-friendly surface.

### In scope

| Surface | Change |
| --- | --- |
| `level --list` | One `levels[].id` per line |
| `discipline --list` | One `disciplines[].id` per line |
| `track --list` | One `tracks[].id` per line |
| `behaviour --list` | One `behaviours[].id` per line |
| `driver --list` | One `drivers[].id` per line |
| `skill --list` | One `skills[].id` per line |
| `command-factory.js` JSDoc | Statement of contract stays as written (matches behaviour after this spec) |
| `level.js` summary hint | Stop advertising "IDs and titles"; reflect id-only `--list` |
| `discipline.js` summary hint | Same — match the new contract |
| Other entity-command summary hints | Audit; align any that imply multi-column `--list` |
| `websites/fit/docs/products/career-paths/index.md` | Update the example output block (lines 48–58 today) and the explanatory sentence at line 60 |
| Other published guides referencing the example | Audit and align: `websites/fit/index.md`, `websites/fit/docs/products/authoring-standards/define-role/index.md`, `websites/fit/docs/products/agent-teams/index.md`, `websites/fit/docs/libraries/integrate-standard/derive-profile/index.md`, `websites/fit/docs/getting-started/engineers/pathway/index.md` |

### Out of scope

- The data-confusion observation in #875 (BioNova synthetic `J060 → Senior
  Manager`, `J070 → Manager` reads as inverted at a glance). That is a
  starter-data ordering choice, not a CLI contract issue. File separately if
  it stays a confusion source after this change.
- Other `fit-pathway` subcommands that take `--list` for a different purpose:
  `job --list`, `interview --list`, `progress --list`, `agent --list`. These
  are not entity-listing commands — they list parameterised invocations of a
  job/interview/progress/agent flow. Their `--list` semantics belong to a
  different surface and are not part of this normalisation.
- Adding a `--format` or `--json` flag for structured output. If users want
  the (id, title) pair programmatically, that is a separate spec.

### Backward compatibility

This is a deliberate behaviour change to a published CLI surface. The triage
on #875 searched for callers that scrape the multi-column output and found
none: no tests, no shell scripts, no CI workflows, no internal tooling parses
the comma-separated shape. The risk window is therefore external callers we
cannot enumerate. The change is acceptable because (a) the published contract
in `command-factory.js:9` has always said id-only and only the implementation
diverged, (b) the human-readable default view continues to expose the
descriptive columns, and (c) the change is a strict subset of today's output
(every existing id-only consumer is preserved). External callers parsing the
multi-column form will break; the released changelog must call this out.

## Verifiable success criteria

| Criterion | Verification |
| --- | --- |
| `level --list` emits one id per line, no header, no commas | `bunx fit-pathway level --list \| grep -c ,` returns `0`; line count equals `bunx fit-pathway level \| grep -c '^J0'` |
| `discipline --list` emits one id per line, no commas | `bunx fit-pathway discipline --list \| grep -c ,` returns `0` |
| `track --list` emits one id per line, no commas | `bunx fit-pathway track --list \| grep -c ,` returns `0` |
| `behaviour --list` emits one id per line, no commas | `bunx fit-pathway behaviour --list \| grep -c ,` returns `0` |
| `driver --list` emits one id per line, no commas | `bunx fit-pathway driver --list \| grep -c ,` returns `0` |
| `skill --list` emits one id per line, no commas | `bunx fit-pathway skill --list \| grep -c ,` returns `0` |
| Default (non-`--list`) invocation of each entity command still renders the multi-column human-readable table | Visual: `bunx fit-pathway level` shows the `ID / Professional Title / Management Title / Experience / Core Level` table |
| Each entity command's summary hint accurately describes what `--list` produces | Read each updated `formatSummary` function; the `--list` bullet says "ids" or "IDs", not "IDs and titles" or similar |
| `command-factory.js:9` JSDoc matches actual behaviour | Read the file; the documented contract requires no edit beyond confirming alignment |
| `websites/fit/docs/products/career-paths/index.md` example block matches new output | Diff the example against `bunx fit-pathway level --list` after implementation |
| All published guides referencing `level/discipline/track/behaviour/driver/skill --list` show the new output | `rg 'fit-pathway (level\|discipline\|track\|behaviour\|driver\|skill) --list' websites/` and inspect each match |

## Persona and job — recap

- **Persona:** Empowered Engineer at level J060, exploring `fit-pathway` for
  the first time to answer "what does my level mean and what is the level
  above?"
- **Job (Big Hire):** Understand Expectations.
- **Forces snapshot from the issue:** persona expected a header or id-only
  output; persona got unlabeled CSV-shaped data; persona briefly mis-read
  their own level. The remedy must remove the "almost thought I was at the
  wrong level" moment on the very first command they run.
