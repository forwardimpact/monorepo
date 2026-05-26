# Spec 0930 — Pathway `--list` emits ids only across entity commands

## Why

`fit-pathway` documents one `--list` contract and ships a different one. Issue
[#875](https://github.com/forwardimpact/monorepo/issues/875) caught the
mismatch during a `kata-interview` user-testing run: a J060 software engineer
trying to confirm their current level and the next one above ran
`bunx fit-pathway level --list` and got unlabeled, comma-separated columns.
Inferring column meaning from the synthetic-data labels alone, the persona
reported:

> "I almost thought I was at the wrong level."

JTBD: **Empowered Engineers § Understand Expectations**
([JTBD.md](../../JTBD.md)) — the job is "see what is expected at my level and
what is expected at the level above." The first command surface the persona
reached was `--list`. Today that surface contradicts itself: the published
factory contract says id-only, and every entity command overrides it to emit a
descriptive comma-separated line.

| Command | Current `--list` output shape |
| --- | --- |
| `level` | `<id>, <professionalTitle \|\| id>, <managementTitle \|\| id>` |
| `discipline` | `<id>, <specialization \|\| id>, <type>, <tracks joined by \|>` where `<type>` is `professional` or `management` |
| `track` | `<id>, <name>` |
| `behaviour` | `<id>, <name>` |
| `driver` | `<id>, <name>` |
| `skill` | `<id>, <name>, <capability>` |

The user-visible problem is small (a confusing CSV on the first command); the
underlying problem is a published contract that points two ways. This spec
makes the implementation match the contract.

## What

Every Pathway entity command's `--list` output emits **one id per line, no
header, no commas**. Title and descriptive columns remain available in the
default (non-`--list`) view, which is already the canonical human-readable
surface (a labeled table). `--list` becomes the canonical pipe-friendly
surface.

### In scope

| Surface | After this spec |
| --- | --- |
| `bunx fit-pathway level --list` | One level id per line |
| `bunx fit-pathway discipline --list` | One discipline id per line |
| `bunx fit-pathway track --list` | One track id per line |
| `bunx fit-pathway behaviour --list` | One behaviour id per line |
| `bunx fit-pathway driver --list` | One driver id per line |
| `bunx fit-pathway skill --list` | One skill id per line |
| Each entity command's default summary footer | The hint advertising what `--list` produces says "ids" — it no longer advertises titles or other descriptive columns |
| Published example output in the Career Paths guide | Matches the new `--list` shape (id-only) |
| Other published guides with multi-column `--list` example blocks — notably the Define Role authoring guide (which shows discipline and track examples) and any other guide returned by the discovery `rg` invocation below | Aligned to the new shape |
| Released CHANGELOG entry | Calls out the breaking change to scraped `--list` output |

### Out of scope

- The synthetic-data ordering observation also raised in #875 (BioNova's
  J060 → "Senior Manager" / J070 → "Manager" reads as inverted at a glance).
  That is a starter-data ordering decision, not a CLI contract. File
  separately if it remains a confusion source after this change.
- Other `fit-pathway` subcommands that use `--list` for a different purpose
  (e.g. `job --list` lists job profile rows from a parameterised search;
  `agent --list` lists valid discipline×track agent combinations). They are
  not entity-listing commands and their `--list` semantics are not part of
  this normalisation. (`interview --list` and `progress --list` are also out
  of scope; both are positional-arg commands that today exit with a usage
  error when invoked with only `--list`, so they do not implement an entity
  listing at all.)
- Adding a structured-output flag (`--json`, `--format`). Programmatic
  consumers wanting the (id, title) pair belong in a separate spec.

### Backward compatibility

This is a deliberate behaviour change to a published CLI surface. The
compatibility risk is **external scrapers of the human-facing CLI output** —
shell scripts, agents, or downstream tooling that capture the comma-separated
shape. Programmatic in-repo call-sites that invoke the command functions
directly with `{options: {list: true}}` are unaffected by the textual
contract; they were not part of the search. The internal search for external
scrapers the triage relied on:

```sh
rg -n '(level|discipline|track|behaviour|driver|skill) --list' \
   --type js --type sh --type yaml --type md
```

returned only the call-sites the spec already covers (route-binding tests in
`products/pathway/test/cli-command.test.js` that assert the command string,
not its output; and the documentation guides under `websites/fit/docs/`). The
change is otherwise a strict subset of today's output — every id-only
consumer is preserved. External callers parsing the comma-separated form
will break; that risk is acceptable because the published contract has
always been id-only and only the implementation diverged. The released
CHANGELOG entry surfaces the break to external consumers.

## Verifiable success criteria

| Criterion | Verification |
| --- | --- |
| For every entity command in `{level, discipline, track, behaviour, driver, skill}`, `--list` emits exactly one id per line, with no commas, no header, and no trailing whitespace | For each: `bunx fit-pathway <entity> --list` — output has zero comma characters; line count equals the count rendered in the default view's table; every line is a non-empty id matching the entity's id-character set |
| The default invocation of each entity command still renders its multi-column human-readable table | Run `bunx fit-pathway level` and confirm a table with the `ID / Professional Title / …` headers prints; repeat for the other five entities |
| The summary footer hint shown to a user running the default invocation accurately describes what `--list` produces | For each entity, run `bunx fit-pathway <entity>` and read the printed hint; it must not promise titles or descriptive columns from `--list` |
| The published factory contract requires no edit to remain accurate | Read the JSDoc in `products/pathway/src/commands/command-factory.js` describing `--list`; behaviour matches the stated "Clean newline-separated list of IDs (for piping)" |
| Published guides that today show a multi-column `--list` example show the id-only example after this spec | `rg -n 'fit-pathway (level\|discipline\|track\|behaviour\|driver\|skill) --list' websites/` — every matched code block displays the new shape |
| The CHANGELOG entry shipped with the implementation surfaces the breaking change | Read the entry; it names the affected commands and the contract change |
| The original persona scenario from #875 no longer reproduces the failure | A J060 persona running `bunx fit-pathway level --list` and reading the output cannot mistake which level row corresponds to their own role; the output is id-only and unambiguous on its face. Re-runnable as a `kata-interview` smoke check against the same persona, or — for an automated proxy — `bunx fit-pathway level --list` followed by `bunx fit-pathway level <id>` for the user-claimed id produces the expected role detail without contradiction |

## Persona and job — recap

- **Persona:** Empowered Engineer at level J060, exploring `fit-pathway` for
  the first time to answer "what does my level mean and what is the level
  above?"
- **Job (Big Hire):** Understand Expectations.
- **Forces snapshot from the issue:** persona expected a header or id-only
  output; persona got unlabeled CSV-shaped data; persona briefly mis-read
  their own level. The remedy must remove the "almost thought I was at the
  wrong level" moment on the very first command they run.
