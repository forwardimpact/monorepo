# 630 — Summit Validate Composition Warnings

`fit-summit validate` tells you whether your roster is syntactically valid — but
says nothing about whether its composition makes structural sense. The validator
returns `{ errors, warnings }`, yet the `warnings` array is never populated and
the command handler never prints warnings. Users get a green "Roster is valid"
message for structurally questionable rosters and discover issues only later,
buried in `risks` or `coverage` output.

## Why

### Valid rosters can still have structural blind spots

A roster passes validation as long as every discipline, level, and track ID
exists in the framework. But structural patterns that aren't outright errors can
still indicate problems worth catching early:

- **No experienced members on a team.** A reporting team where every member is
  at the lowest framework level has no one positioned to mentor, review, or
  provide technical leadership. This isn't invalid — it's a staffing choice —
  but it deserves a heads-up before the user invests time in deeper analysis.

- **Entry-level members without a track.** A member at the lowest level with no
  track set is allowed (generalist is a valid configuration), but it may mean
  the member's specialization hasn't been defined yet. Flagging it lets
  leadership confirm the omission is intentional.

- **Thinly-staffed projects.** A project where every member has allocation below
  0.5 has no one primarily focused on it. The project may still succeed, but the
  pattern is a known staffing risk that `validate` could surface before the user
  reaches `risks`.

These patterns share a property: they are observable from the roster and
framework data alone (no coverage computation needed), and they are easy to fix
if unintentional.

### The infrastructure is already in place

`ValidationResult` already defines a `warnings` array alongside `errors`. The
`Issue` type (`{ code, message, context }`) works for both. The `validate`
command handler already differentiates: errors cause `exitCode = 1`, while the
comment on line 5 explicitly states "Warnings do not fail." The JSON output mode
already serializes the full result — any populated warnings appear
automatically.

The only missing pieces are: (1) populating the `warnings` array with
structurally useful observations, (2) printing them in text output mode after
the success message.

### Early signals reduce wasted analysis time

`validate` is the first command users run after writing a roster — it's the
natural checkpoint before `coverage`, `risks`, or `growth`. Surfacing structural
observations here lets leadership correct staffing oversights before running
deeper (and slower) analysis. Two separate Summit evaluation sessions (issues
#331 and #332, observed 2026-04-11 and 2026-04-12) confirmed that users who hit
silent warnings in `validate` only discovered the underlying issues much later
in the `risks` output, after investing time understanding the coverage model.

## What

### 1. Populate warnings in roster validation

The validation function should detect and report structural composition patterns
that are not errors but merit attention. Each warning uses the existing `Issue`
structure (`code`, `message`, `context`).

Initial warning set:

| Code                       | Condition                                                                                                                                                                                             | Applies to                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `NO_SENIOR_MEMBER`         | Every member of a reporting team is at the entry level of the framework (the lowest level defined in the loaded levels data). Applies to teams of any size, including single-member teams.            | Reporting teams (`roster.teams`)        |
| `TRACKLESS_AT_ENTRY_LEVEL` | A member is at the entry level of the framework and has no track set                                                                                                                                  | Reporting team members (`roster.teams`) |
| `LOW_ALLOCATION_PROJECT`   | Every member of a project has allocation below 0.5 (i.e., no one is half-time or more on the project — a recognized staffing risk pattern, consistent with Summit's existing risk severity threshold) | Projects (`roster.projects`)            |

These warnings apply only to their stated roster section — reporting team
warnings do not fire against project members, and the allocation warning does
not fire against reporting teams (which have no allocation field).

Warnings are informational. They do not cause a non-zero exit code.

### 2. Display warnings in text output

When the roster is valid (no errors) and warnings are present, the `validate`
command should print them after the success message. Each warning should display
its code and human-readable message, matching the existing error display format
(`[CODE] message`). When there are no warnings, output is unchanged.

### 3. Include warnings in JSON output

JSON output already serializes the full `ValidationResult`. No behavioral change
needed — once warnings are populated, they appear in the JSON output
automatically. This item exists to make the contract explicit: consumers of the
JSON output may begin receiving non-empty `warnings` arrays after this change.

## Scope

### Affected entities

- `validateRosterAgainstFramework` — roster validation with warning generation
- `validate` command handler — warning display in text output mode
- `ValidationResult.warnings` — populated with the initial warning set above
- Test suite — new test coverage for warning detection

### Excluded

- New warning codes beyond the three defined above — additional patterns can be
  added incrementally in future specs
- Changes to the `Issue` type — the existing `{ code, message, context }`
  structure is sufficient
- Changes to `risks`, `coverage`, or other analytical commands — they already
  have their own detection logic and are not affected
- Markdown output mode — Summit does not currently have a markdown formatter for
  `validate`; adding one is separate work
- Warning suppression flags (e.g., `--nowarn`) — premature until users request
  it
- Exit code changes — warnings must not affect the exit code (zero on valid
  roster, non-zero on errors, regardless of warnings)

## Success criteria

1. `fit-summit validate --roster <fixture>` with a roster exhibiting all three
   warning patterns prints `[NO_SENIOR_MEMBER]`, `[TRACKLESS_AT_ENTRY_LEVEL]`,
   and `[LOW_ALLOCATION_PROJECT]` messages after the "Roster is valid" line. (A
   test fixture covering all three patterns is part of this deliverable.)

2. `fit-summit validate --format json --roster <fixture>` includes non-empty
   `warnings` array entries with the correct codes, messages, and context
   objects for each detected pattern.

3. A valid roster with no warning patterns produces unchanged output — the
   "Roster is valid" message with no additional lines.

4. A roster with both errors and warnings reports errors and exits non-zero.
   Warnings are displayed after the error list so the user sees the full
   picture. Warnings do not suppress errors and do not affect the exit code.

5. `bun test` in `products/summit` passes, including new tests covering all
   three warning codes and the no-warnings baseline.
