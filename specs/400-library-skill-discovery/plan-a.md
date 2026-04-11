# Plan A — Library Skill Discovery

Implementation plan for [spec 400](spec.md). Translates the spec's five moves
(reorganise groups, rewrite descriptions/tables, discovery protocol, CI guard,
record rejected alternatives) into concrete, ordered changes across the seven
`libs-*`/`libskill` skill files, `CLAUDE.md`, `CONTRIBUTING.md`, the
`gemba-plan` skill, the staff-engineer agent profile, and one new script.

## Approach

This is a documentation and tooling change. No code inside `libraries/*/src/`
moves. The shape of the work is:

1. **Move the walls** — rename five `.claude/skills/libs-*` directories so the
   six groups match spec 400's Move 1 table, and update
   `CLAUDE.md § Skill Groups` to match.
2. **Repaint the signs** — rewrite every `libs-*` SKILL.md frontmatter
   description in capability verbs, switch the inner `Libraries` tables from
   `Main API` / `Purpose` to `Capabilities` / `Key Exports`, and add the five
   missing library rows.
3. **Post the protocol** — add library-discovery steps to CONTRIBUTING.md's
   READ-DO, to the gemba-plan skill, and to agent profiles that write code.
4. **Install the alarm** — add a `check:skill-exports` script that proves every
   name in a `Key Exports` cell resolves to a real public export and fail
   `bun run check` when it doesn't.

The work decomposes into **four parts** on the feature branch
`claude/spec-400-planning-a4Okz` (already checked out). Parts 01, 02, and 04 are
strictly sequential on the `libs-*` surface. Part 03 (discovery protocol) is
independent of 01/02/04 and can run in parallel with Part 02 if executed by a
second agent.

**Guiding principles:**

1. **Directory rename before content rewrite.** Renaming a skill directory
   (`git mv`) while simultaneously rewriting its SKILL.md is a single diff but
   reviewers struggle to tell "what moved" from "what changed." Part 01 does
   pure renames plus the CLAUDE.md anchor update; Part 02 rewrites the contents.
   `git log --follow` keeps history intact either way.
2. **Keep existing body sections (Decision Guide, Composition Recipes, DI
   Wiring) unless the reorganisation forced a change.** Spec 130 already
   corrected their contents. Part 02's rewrite is surgical: frontmatter, the
   `Libraries` table, and body section titles/intros that referenced the old
   group name.
3. **Capability tables are the CI contract.** The `Capabilities` / `Key Exports`
   column rename is load-bearing — Part 04's check resolves names against the
   `Key Exports` column specifically. Column titles and table placement must be
   consistent across all seven files so the parser has a single contract.
4. **Description rewrites must cover every library's public surface, not just
   the headline.** If `libutil` exposes `Retry`, `waitFor`, and `parseJsonBody`
   but the description only mentions hashing and tokens, an agent searching
   "retry with backoff" will miss it. Capability coverage is the success
   criterion for Move 2, not word count.
5. **CI guard is strict-positive, not reverse.** The check asserts "everything
   advertised in `Key Exports` must resolve"; it does **not** assert "every
   library export must appear in `Key Exports`." Internal helpers stay hidden.
   This matches the spec's explicit guidance under Move 4.

## Part index

Execute parts on the existing `claude/spec-400-planning-a4Okz` branch. Each part
has its own plan file with scope, file list, ordering, and verification steps.

| #   | File                         | Scope                                                                                                    | Agent          |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------- | -------------- |
| 01  | [plan-a-01.md](plan-a-01.md) | Rename five `libs-*` skill directories; update `CLAUDE.md § Skill Groups`                                | staff-engineer |
| 02  | [plan-a-02.md](plan-a-02.md) | Rewrite frontmatter descriptions; switch inner tables to `Capabilities` / `Key Exports`; add orphan rows | staff-engineer |
| 03  | [plan-a-03.md](plan-a-03.md) | Discovery protocol: `CONTRIBUTING.md` READ-DO, `gemba-plan` SKILL.md, `staff-engineer.md` skills list    | staff-engineer |
| 04  | [plan-a-04.md](plan-a-04.md) | `scripts/check-skill-exports.js` + wire into `bun run check` and `check-quality` CI                      | staff-engineer |

## Part dependency graph

```
  01 (directory renames + CLAUDE.md)
    │
    ▼
  02 (SKILL.md content rewrites)               03 (discovery protocol)
    │                                              │
    ▼                                              │
  04 (check:skill-exports script)                  │
    │                                              │
    └──────────────► final verification ◄──────────┘
```

Part 03 is the only part that does not touch `libs-*` files. If the implementer
has parallel capacity, launch 03 as a concurrent sub-agent after 01 merges
locally. Otherwise run 01 → 02 → 03 → 04 sequentially. Either order is correct;
the dependency arrow from 03 to "final verification" is satisfied by running
`bun run check` and `bun run test` once at the end.

## Execution

Run every part on the existing `claude/spec-400-planning-a4Okz` branch. Each
part ends with `bun run check` and `bun run test` passing. Commit per part using
the convention `docs(skills): <summary>` for Parts 01–03 and
`feat(ci): add skill-exports check` for Part 04. Push after each commit.

Route every part to **`staff-engineer`**. Parts 01, 02, and 04 are pure
infrastructure/doc work inside `.claude/skills/`, `CLAUDE.md`, and `scripts/`.
Part 03 also lives in doc-adjacent files (`CONTRIBUTING.md`, `gemba-plan` skill,
`staff-engineer.md` agent profile) and is still staff-engineer scope — no
`website/` or wiki changes, so no technical-writer handoff.

## Cross-cutting conventions

These conventions apply inside every part — restated here so each part can
assume them without repetition.

### New six-group truth table

Parts 01 and 02 both depend on this table. Spec 400 Move 1 is the authoritative
source; reproduced here for in-plan reference.

| New group            | Old group                   | Members (count)                                                                               |
| -------------------- | --------------------------- | --------------------------------------------------------------------------------------------- |
| libs-grpc-services   | libs-service-infrastructure | librpc, libconfig, libtelemetry, libtype, libharness (5)                                      |
| libs-storage         | libs-data-persistence       | libstorage, libindex, libresource, libpolicy, libgraph, libvector (6)                         |
| libs-llm-and-agents  | libs-llm-orchestration      | libllm, libmemory, libprompt, libagent, **libtool** (5)                                       |
| libs-content         | libs-web-presentation       | libui, libformat, libweb, libdoc, libtemplate (5)                                             |
| libs-cli-and-tooling | libs-system-utilities       | **libcli**, **librepl**, libutil, libsecret, libsupervise, librc, libcodegen, **libeval** (8) |
| libs-synthetic-data  | libs-synthetic-data         | libsyntheticgen, libsyntheticprose, libsyntheticrender, **libuniverse** (4)                   |

Standalone: `libskill` stays in `.claude/skills/libskill/`.

Bold entries are either moved from another group or added from the spec's
"orphan" list.

### Inner-table column contract

Every `libs-*/SKILL.md` `## Libraries` table must use exactly these headers in
this order:

```
| Library | Capabilities | Key Exports |
```

`Capabilities` is a verb-led phrase listing what you use the library for ("retry
a flaky fetch," "supervise a daemon"). `Key Exports` is a comma-separated list
of public symbols that resolve to a real export in the library package — the CI
guard in Part 04 parses this column by exact match.

`Key Exports` cells may not be empty. A library with nothing worth advertising
is a signal the library shouldn't be listed at all — but every library in
`libraries/` must appear somewhere, so in practice every cell has content.

### Frontmatter description contract

Every `libs-*/SKILL.md` frontmatter `description` must:

- **Open with "Use when"** so the agent's task verb is the first lexical match
  at router load.
- **List verbs, not library names.** Descriptions describe the tasks the group
  performs; naming a library in the first sentence is the anti-pattern spec 400
  is trying to retire.
- **Cover every public capability of every library in the group** — if a
  capability is in the inner table's `Capabilities` column, it must also be
  reachable from the frontmatter's verb list. The router only sees the
  frontmatter.
- **Stay under ~100 words** so the router can skim it cheaply.

`libskill`'s description is rewritten to the same shape even though it stays
standalone: "Use when deriving a job from Discipline × Level × Track, …" — not
"Work with the libskill package."

### Git history preservation

Use `git mv` for every directory rename in Part 01. Do not `rm -rf` and re-add —
`git log --follow` on SKILL.md should track through the rename.

## Known plan decisions and risks

Flag these to the reviewer before execution.

1. **`libs-cli-and-tooling` is intentionally 8 libraries.** The spec explicitly
   rejects splitting it. Part 02's description for this group has to cover more
   verbs than any other — expect the description to push toward the ~100-word
   cap. If any single capability is omitted, the router will miss it. Part 02's
   verification step explicitly spot-reads this description last because it is
   the most demanding.

2. **`libskill` frontmatter description rewrite is a spec requirement even
   though it isn't in a `libs-*` group.** Spec 400 Move 1 rationale says
   libskill's description is rewritten "as domain logic for jobs, skills,
   agents, career progression." Success criterion 2 says "every `libs-*`
   SKILL.md" but the Move 1 table explicitly covers libskill. The plan treats
   libskill's rewrite as in-scope; if the reviewer reads success criterion 2
   narrowly, flag it and drop libskill's frontmatter from Part 02.

3. **The CI check walks `Key Exports` across the union of all public subpath
   exports, not just `./src/index.js`.** Libraries like `libui` (15 subpaths),
   `libdoc` (4), `libuniverse` (3), `libtemplate` (2) publish symbols via
   subpath export maps in `package.json`. The Part 04 script resolves names by
   reading each value in the `exports` map, parsing the referenced `.js` file,
   and collecting `export`/`export from` declarations. A name in `Key Exports`
   matches if it appears in any of those files. This mirrors the existing
   `check-exports-resolve.js` pattern (spec 390) which also walks the `exports`
   map.

4. **The existing `Libraries` tables in the six files already contain stale
   names.** Example: `libs-service-infrastructure` lists `RpcServer`,
   `RpcClient`, `createClientFactory` but librpc actually exports `Server`,
   `Client`, `createClient`, `createTracer`, `createGrpc`, `createAuth`, `Rpc`,
   `Interceptor`, `HmacAuth`, `healthDefinition`, `createHealthHandlers`,
   `ServingStatus` (no `RpcServer`/`RpcClient`). `libs-llm-orchestration` lists
   `WindowBuilder`, `createWindow` but libmemory currently exports — Part 02
   verifies via Part 04's script while writing the tables, so every new row is
   correct-by-construction. **Do not assume the existing `Main API` column is
   correct.** Read `libraries/<libname>/src/index.js` (and any subpath exports)
   directly when drafting each `Key Exports` cell.

5. **Description rewrites must cover orphan capabilities.** `libtool` moves into
   `libs-llm-and-agents`; its verbs ("dispatch a tool call," "generate a tool
   schema from protobuf," "describe a tool to an LLM") must appear in that
   group's description. Same pattern for `libcli`, `librepl`, `libeval`,
   `libuniverse` in their target groups. A capability absent from the
   frontmatter is invisible to the router even if it's in the inner table.

6. **Agent profile change is minimal.** Only `staff-engineer.md` needs new
   `skills:` entries in Part 03. The other five agents (`improvement-coach`,
   `product-manager`, `release-engineer`, `security-engineer`,
   `technical-writer`) write some code but not library-consuming implementation
   code. `staff-engineer` owns the "writes implementation code" workflow and is
   the only profile where pre-loading the `libs-*` catalog changes router
   behaviour at task time. Flag to reviewer if they want a broader rollout.

7. **`CLAUDE.md § Skill Groups` list ordering is preserved.** The spec's Move 1
   table uses a specific order (grpc → storage → llm → content → cli →
   synthetic). Part 01 writes the new section in that order so the file reads
   the same top-to-bottom.

8. **Existing `libs-synthetic-data` table only needs a `libuniverse` row added
   and column rename.** The group name does not change and membership grows by
   one. This is the smallest single-file change in Part 02.

## Risks

1. **Frontmatter description length vs coverage.** The spec caps descriptions at
   ~100 words so the router can skim them. Covering 8 libraries' capabilities
   for `libs-cli-and-tooling` inside that cap is tight. Mitigation: Part 02's
   verification step counts words in each description and flags any over 120 for
   manual review; the implementer can elide redundant verbs ("hash" + "generate
   hash" → "hash") to fit.

2. **`Key Exports` drift between planning and implementation.** Any library
   refactor that merges while this plan is in flight can re-introduce a stale
   name. Mitigation: strict ordering — **Part 02 commits first with every
   `Key Exports` cell verified by the implementer reading each library's live
   `src/index.js` and its subpath exports manually** (not by running the Part 04
   script, which does not exist yet). Part 04 lands afterwards and **must pass
   on Part 02's output on first run** — any failure is fixed as a Part 04 bug
   (parser/resolution issue) or a Part 02 bug (row edited to a non-existent
   export) and the fix lands in the appropriate part's commit. Once Part 04 is
   in place, any future library refactor that drops an advertised export fails
   `bun run check` and the CI job, catching drift at the source.

3. **CI check cold-start false positives.** The script has to parse every
   `libs-*/SKILL.md` and every library's `src/` export surface; a naive
   implementation that only reads `src/index.js` will miss subpath exports
   (e.g., `libui/render`, `libtelemetry/tracer.js`). Mitigation: Part 04's plan
   mandates parsing the full `package.json` `exports` map per library and
   de-duping exported names across subpaths before matching. First run on the
   final Part 02 output must return zero failures; any failure is a bug in
   either Part 02's table or Part 04's script.

4. **Symbol name collisions between libraries.** Two libraries can export the
   same name (e.g., `generateHash` appears in both `libutil` and `libsecret`).
   The CI check resolves names per-row (which library is this row about?), so
   there is no collision at match time, but the `Capabilities` column must
   disambiguate if both libs are in the same group so the reader knows which one
   to reach for. `libutil` and `libsecret` are in the same
   `libs-cli-and-tooling` group — Part 02's Decision Guide carries the existing
   "libutil.generateHash vs libsecret.generateSecret vs libsecret.hashValues"
   call-out (currently in `libs-system-utilities`) into the new file.

5. **Skill router behaviour change on rename.** Renaming a skill directory can
   break any external reference to the old name (e.g., docs that say "see the
   libs-system-utilities skill"). Mitigation: grep the monorepo for the five old
   names before committing Part 01 and update any hits. Expected hits:
   `CLAUDE.md § Skill Groups` (Part 01 rewrites), `CLAUDE.md § Skill Groups`
   cross-references elsewhere in CLAUDE.md (none found as of drafting but grep
   at execution time), and `.claude/skills/*/SKILL.md` body text in the moved
   files themselves (Part 02 catches these because it rewrites each file's "When
   to Use" and body intro).

6. **Spec 130's Decision Guide text references old group membership.** Any "X vs
   Y" comparison in a Decision Guide may span a group boundary after Part 01
   (e.g., `libtelemetry.Logger` advice that currently lives in
   `libs-service-infrastructure` is still relevant to CLI authors using
   `libs-cli-and-tooling`). Mitigation: Part 02's per-file checklist includes
   "re-read the Decision Guide and update any stale cross-references"; the
   logger guidance stays with `libtelemetry` in its own group
   (`libs-grpc-services`) but a one-line cross-reference from
   `libs-cli-and-tooling` points readers to it.

## References

- Spec: [spec.md](spec.md)
- Spec 130 (prior pass on the same files, fixed body content): spec 130 —
  library skill tables
- Spec 390 (introduced `check:exports`, the pattern Part 04 reuses):
  `scripts/check-exports-resolve.js`, `package.json` `"check"` script
- Current `CLAUDE.md § Skill Groups`: lines 259–276
- Current `CONTRIBUTING.md § READ-DO`: lines 33–51
- Current `gemba-plan` SKILL.md: `.claude/skills/gemba-plan/SKILL.md`
- Current `staff-engineer.md` agent profile: `.claude/agents/staff-engineer.md`
  lines 8–13
- Current `libs-*` SKILL.md files:
  `.claude/skills/libs-{data-persistence, llm-orchestration, service-infrastructure, synthetic-data, system-utilities, web-presentation}/SKILL.md`
  and `.claude/skills/libskill/SKILL.md`
- Existing export-resolution script (pattern for Part 04):
  `scripts/check-exports-resolve.js` (91 lines)
- Orphan library source entry points (Part 02 reads for `Key Exports`):
  `libraries/{libtool,libcli,librepl,libeval,libuniverse}/src/index.js`

— Staff Engineer 🛠️
