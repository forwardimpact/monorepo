# Plan A Part 03 — Discovery protocol

Part 3 of 4 of [plan-a](plan-a.md) for [spec 400](spec.md).

Adds library discovery as an explicit requirement in three places: the
contributor workflow (`CONTRIBUTING.md` READ-DO), the planning skill
(`gemba-plan` SKILL.md), and the staff-engineer agent profile. Independent of
Parts 01, 02, and 04 — can run in parallel with any of them.

## Scope

- Add a READ-DO checklist item to `CONTRIBUTING.md` that makes library search
  mandatory before writing a helper.
- Update `gemba-plan` SKILL.md to require every `plan-a.md` to enumerate the
  `@forwardimpact/lib*` packages and exports it uses (or explicitly state
  that none are used).
- Add the six `libs-*` skills to `staff-engineer.md`'s `skills:` field so the
  library catalog is pre-loaded when the agent starts work.
- Do **not** modify any other agent profile. Spec 400's success criterion 5
  permits the plan to identify additional code-writing agents; this plan's
  risk #6 in `plan-a.md` explains why only staff-engineer is in scope.

## Files touched

Three files, all edits (no creates, no deletes):

1. `CONTRIBUTING.md` — add one item to the `<read_do_checklist>` block.
2. `.claude/skills/gemba-plan/SKILL.md` — add a "Libraries Used" requirement
   to the plan structure guidance and to the DO-CONFIRM checklist.
3. `.claude/agents/staff-engineer.md` — append six `libs-*` entries to the
   `skills:` list in frontmatter.

## Ordering

Files are independent of each other. Edit in the order listed; one commit
for all three.

### 1. `CONTRIBUTING.md`

Insert a new item into the `<read_do_checklist>` block at `CONTRIBUTING.md`
lines 33–51. Place it after "Read the code" (line 39) and before "Simple
over easy" (line 40), because library search is a read-before-write step.

**New item (exact text, subject to wording review):**

```markdown
- [ ] **Search shared libraries first.** Before writing a helper, utility,
      retry wrapper, argument parser, or any other generic capability,
      search `libraries/` and the `libs-*` skill group that covers the task.
      If a shared library already provides the capability, use it. If not,
      note that in the commit or plan so future contributors don't re-search.
```

**Observable after edit:** `grep 'Search shared libraries' CONTRIBUTING.md`
returns one hit inside the READ-DO block. The READ-DO checklist gains one
item (seven items total, up from six).

### 2. `gemba-plan/SKILL.md`

Two edits:

**Edit 2a — add to "Writing a Plan (HOW)" guidance** (lines 117–144). Insert
a new bullet between the existing "Decisions explained" and "Risks surfaced"
bullets (or append at the end of the list — placement is reviewer
preference; the default is to append so the order follows the natural
workflow of "what to write last").

New bullet (exact text, subject to wording review):

```markdown
- **Libraries used.** Every plan must include a "Libraries used" section
  listing the `@forwardimpact/lib*` packages the implementation will
  consume, with the specific exports it will call (e.g., `libutil.Retry`,
  `libcli.Cli`, `libtelemetry.createLogger`). If the plan uses no shared
  libraries, state that explicitly — absence is a visible signal, not a
  default. This catches "write a helper" steps that could be replaced by an
  existing library before implementation starts, when substitution is
  cheap.
```

**Edit 2b — add to DO-CONFIRM checklist** (lines 41–55). Insert a new item
just after "Risks surfaced" (line 48) and before "Execution recommendation
present" (line 49):

```markdown
- [ ] Libraries-used section present. Every shared library the
      implementation will consume is listed by package and by specific
      exports, or the section explicitly states no shared libraries are
      used.
```

**Observable after edit:** `gemba-plan` SKILL.md contains both the new
writing guidance bullet and the DO-CONFIRM checklist item. The DO-CONFIRM
block gains one item.

### 3. `.claude/agents/staff-engineer.md`

Extend the `skills:` list in frontmatter (currently lines 8–13):

**Before:**

```yaml
skills:
  - gemba-plan
  - gemba-implement
  - gemba-review
  - gemba-gh-cli
```

**After:**

```yaml
skills:
  - gemba-plan
  - gemba-implement
  - gemba-review
  - gemba-gh-cli
  - libs-grpc-services
  - libs-storage
  - libs-llm-and-agents
  - libs-content
  - libs-cli-and-tooling
  - libs-synthetic-data
  - libskill
```

**Observable after edit:** `.claude/agents/staff-engineer.md`'s `skills:`
field contains all six `libs-*` entries plus `libskill`. These match the
renamed directories after Part 01.

**Dependency note:** This edit depends on Part 01 having renamed the
directories. If Part 03 runs in parallel with Parts 01/02, the
`staff-engineer.md` edit must be ordered **after** Part 01's commit or
pulled into a separate commit sequenced after it. The simplest way is to
run Part 03 sequentially after Part 01 lands on the branch.

## Verification

Run at the package root after all three edits:

1. **READ-DO item count.**

   ```sh
   awk '/<read_do_checklist/,/<\/read_do_checklist/' CONTRIBUTING.md | grep -c '^- \[ \]'
   ```

   Expected: `7` (was 6).

2. **gemba-plan DO-CONFIRM item count.**

   ```sh
   awk '/<do_confirm_checklist/,/<\/do_confirm_checklist/' .claude/skills/gemba-plan/SKILL.md | grep -c '^- \[ \]'
   ```

   Expected: one more than the current count (currently 8, so 9 after).

3. **gemba-plan "Libraries used" guidance present.**

   ```sh
   grep -n 'Libraries used' .claude/skills/gemba-plan/SKILL.md
   ```

   Expected: two hits (one in Writing a Plan, one in DO-CONFIRM).

4. **staff-engineer skills list.**

   ```sh
   awk '/^skills:/,/^---/' .claude/agents/staff-engineer.md | grep -c 'libs-'
   ```

   Expected: `6` (six `libs-*` entries). Plus one `libskill` entry.

5. **`bun run check` passes.**

6. **No drift in other agent profiles.**

   ```sh
   grep -l 'libs-' .claude/agents/
   ```

   Expected: `.claude/agents/staff-engineer.md` only. Any other hit is a
   bug — Part 03 should not touch other agents.

## Risks

1. **Checklist ordering in `CONTRIBUTING.md`.** Inserting a new item in the
   middle of a well-established checklist is a documentation-stability
   concern. The placement after "Read the code" and before "Simple over
   easy" is deliberate: you can't reuse code you haven't read, and library
   search is a form of reading. If the reviewer prefers the end of the
   list, move it — the observable criterion is presence, not position.

2. **"Libraries used" section in gemba-plan adds friction for trivial
   plans.** Some plans (e.g., a typo fix) use no libraries and the "state
   it explicitly" rule adds one boilerplate line to every such plan. This
   is a deliberate cost: absence is a visible signal. If reviewer pushback
   is strong, alternative is to scope the requirement to plans with >1
   implementation step — but that creates a harder-to-enforce edge case.
   Keep the universal rule.

3. **staff-engineer pre-loads seven new skill files.** Skills have a cost
   at agent startup (router scan and frontmatter load). Seven additional
   skills (six `libs-*` + `libskill`) is a measurable but not problematic
   overhead — existing agents load 3–5 skills and these files are small
   (~150 lines each, ~50 KB total). No mitigation needed.

4. **Other code-writing agents may still miss libraries.** `product-manager`
   writes fixes for trivial issues and has `gemba-plan` in its skills list
   but not the `libs-*` skills. The spec's success criterion 5 says "staff
   engineer and any other code-writing agent profile identified during
   planning." The plan identifies only `staff-engineer` as the primary
   implementation agent; if the reviewer thinks product-manager's fix
   workflow also needs library discovery, expand the edit to its profile
   too. Flag to reviewer.

## Commit

One commit:

```
docs(protocol): require library discovery in contributor workflow (spec 400 part 3/4)

- CONTRIBUTING.md READ-DO: add "search shared libraries first" checklist item
- gemba-plan SKILL.md: plans must enumerate @forwardimpact/lib* usage
- staff-engineer agent profile: pre-load libs-* skills so the library
  catalog is in context at task start
```

— Staff Engineer 🛠️
