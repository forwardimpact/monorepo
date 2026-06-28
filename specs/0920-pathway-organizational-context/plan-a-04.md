# Plan 0920-a · Part 04 — Documentation + skill/CLI parity

Overview: [plan-a.md](plan-a.md) · Spec: [spec.md](spec.md) · Design:
[design-a.md](design-a.md)

Depends on: Part 02 merged. After this part merges, the org-context guide
introduces the slot, distinguishes it from track-scoped `teamInstructions`,
documents the marker contract verbatim including the **last-occurrence rule**,
and the authoring-standards guide carries a new entry.

This part is structural prose work — recommended executor: `technical-writer`
for Step 7, `staff-engineer` for Step 8 (or both in the same PR).

## Step 7 — Guide updates

### 7a — `agent-teams/organizational-context/index.md`

**Modified:**
`websites/fit/docs/products/agent-teams/organizational-context/index.md`. Three
edits in the same pass:

**(a) Layer reframe.** The page currently presents a three-layer architecture
(Team Instructions → Agent Profile → Skills). Add the **organizational
context slot** as a distinct layer between the high-level concept and Team
Instructions — installation-scoped per-team facts, separate from the
track-scoped `teamInstructions` body that today carries the page's
"Platform conventions" example. The persona's misdiagnosis in spec 0920
("nothing in the discipline/track YAML accepts repo names") is the gap this
reframe closes; the new copy must distinguish the two layers explicitly so
future readers do not repeat it.

**(b) New `## Use the organizational context slot` section** near the top,
carrying:

- File location: `data/pathway/organizational-context.yaml` (installation-
  scoped, sibling of `claude-settings.yaml`). Canonical path is the data
  directory root; the loader's `repository/` fallback is legacy compatibility
  and is not documented as a recommended position.
- The six concerns and exact YAML shape — lift verbatim from design-a §
  Data Shape.
- The rendered section's exact form — lift verbatim from design-a §
  Rendered Section.
- When to use the slot vs. track-scoped `teamInstructions`: team facts that
  change with the team (repos, manager, oncall) go in the slot; team
  behaviors that match the track everywhere it is used (golden paths,
  conventions) stay in `teamInstructions`.

**(c) New `## Marker contract for downstream tooling` section** carrying
the marker contract verbatim. Required bullets, in this order:

- The section opens with the literal line `## Organizational Context`.
- Downstream tools detect the section by exact-string match on that line.
- **Tooling that needs the unique occurrence MUST match the LAST occurrence
  of `## Organizational Context` in the rendered `.claude/CLAUDE.md`** —
  the section is always appended last, so the final match is robust against
  the unlikely case that a track author writes that heading inside
  `teamInstructions` prose. The bold emphasis on **LAST** stays so the rule
  is visible at a glance.
- A worked example tool snippet:

  ```sh
  awk '/^## Organizational Context$/{i=NR} END{print i}' .claude/CLAUDE.md
  ```

  prints the line number of the section in any CLAUDE.md that has one.

This part of Step 7 is the product-manager's nice-to-have made canonical;
the implementer keeps the LAST-emphasis bold and the worked example
verbatim. Downstream tooling will read the wrong section without this rule
written down.

### 7b — `authoring-standards/index.md`

**Modified:** `websites/fit/docs/products/authoring-standards/index.md`. Add
a new step in the existing numbered procedure, between Drivers and "Configure
the standard":

- New `## Step 7: Add organizational context (optional)` heading, inserted
  between today's Step 6 (Drivers) and today's Step 7 (Configure the
  standard, which becomes Step 8).
- Body: one-paragraph framing (installation-scoped per-team facts, sibling
  of the existing settings files), the YAML shape with placeholder values
  (lift from design-a § Data Shape), the rendered output it produces (one-
  paragraph summary, link forward to `agent-teams/organizational-context`
  for the full rendering and marker rules), and the line "run
  `bunx fit-map validate` to confirm the slot parses."

**Renumber pass.** Run this search command before editing to enumerate every
"Step 7" reference in the file (heading + any cross-references in prose):

```sh
rg -n 'Step 7' websites/fit/docs/products/authoring-standards/index.md
```

Today this returns one hit — the `## Step 7: Configure the standard` heading
at line 428. After Step 7 (new org-context step) is inserted, that heading
becomes `## Step 8: Configure the standard`; rerun the rg to confirm the
file contains a clean run of `## Step 1` … `## Step 8` with no gaps and no
duplicates. Also rg the rest of the docs tree for any external reference to
"Step 7" of this guide:

```sh
rg -nl 'authoring-standards.*Step 7\b' websites/
```

This catches docs in other files that point back to "Step 7" of the
authoring-standards guide. Retarget any matches in the same commit.

## Step 8 — Skill + CLI documentation parity

The org-context guide URL
(`https://www.forwardimpact.team/docs/products/agent-teams/organizational-context/index.md`)
is already present in both the CLI `documentation` array and the skill's
`## Documentation` section. Step 7 reframes the guide content, so Step 8 updates
the description text in both places to reflect the new framing. URL and entry
position in the list are immutable.

**Modified:** `products/pathway/bin/fit-pathway.js` § `documentation`. Update
the matching entry's description text to a single sentence covering both
the track-scoped and installation-scoped layers — proposed text:

```js
{
  title: "Give Agents Organizational Context",
  url: "https://www.forwardimpact.team/docs/products/agent-teams/organizational-context/index.md",
  description:
    "Track-scoped team instructions and installation-scoped organizational context for exported agent teams.",
},
```

**Modified:** `.claude/skills/fit-pathway/SKILL.md` § `## Documentation`.
Update the bullet's description text to match:

```markdown
- [Give Agents Organizational Context](https://www.forwardimpact.team/docs/products/agent-teams/organizational-context/index.md)
  — Track-scoped team instructions and installation-scoped organizational
  context for exported agent teams.
```

## DO-CONFIRM for Part 04

- `bun run format:fix` clean (no unrelated ripple).
- `bun run check` exits 0 (prose linting, jsdoc, harness, context all green).
- `bunx fit-doc build --src=websites/fit` exits 0.
- `rg -n 'LAST occurrence' websites/fit/docs/products/agent-teams/organizational-context/index.md`
  returns ≥1 hit (the last-occurrence marker rule made explicit).
- `rg -nc '## Organizational Context' websites/fit/docs/products/agent-teams/organizational-context/index.md`
  returns ≥2 hits (documented marker + worked example).
- `rg -n '^## Step ' websites/fit/docs/products/authoring-standards/index.md`
  returns a clean numbered run with the new Step 7 inserted (no gaps, no
  duplicates after the renumber).
- Skill/CLI parity for the org-context entry (scope-limited — the existing skill
  and CLI lists on `main` are not byte-identical across all entries and bringing
  the lists into full parity is out of scope for spec 0920; what spec 0920
  requires is that *the org-context entry* sits at the same position with the
  same URL and description in both files):

  ```sh
  # The org-context guide must appear exactly once in each file with the
  # same description text.
  test "$(rg -c 'agent-teams/organizational-context' products/pathway/bin/fit-pathway.js)" = 1
  test "$(rg -c 'agent-teams/organizational-context' .claude/skills/fit-pathway/SKILL.md)" = 1
  # The description text must match between the two surfaces (extract the
  # one-line description after the URL in each file).
  diff \
    <(rg -A1 'agent-teams/organizational-context' products/pathway/bin/fit-pathway.js | rg -o '"[^"]+"' | tail -n1) \
    <(rg -A1 'agent-teams/organizational-context' .claude/skills/fit-pathway/SKILL.md | tail -n1 | sed 's/^[[:space:]]*—[[:space:]]*//')
  ```

  Exit 0 = the two description strings match per `products/CLAUDE.md` § Linking
  rule, scoped to the one entry this spec touches.
- `git diff origin/main...HEAD --stat` lists only the four files in this
  part's slice of the overview File map.

— Staff Engineer 🛠️ / Technical Writer ✍️
