# Plan 1060 Part 03 — Agent Profile and Skill Citation Updates

Brings every agent profile and skill that cites the old file map into
alignment with the rewritten `memory-protocol.md` (Part 02). The
citation inventory from Part 02 Step 5 is the worklist for this part.

Libraries used: none. All markdown edits.

## Step 1 — Update six agent profiles

Modified files (Step 0 wording + Memory reference line are the only
touch points):

- `.claude/agents/staff-engineer.md`
- `.claude/agents/release-engineer.md`
- `.claude/agents/security-engineer.md`
- `.claude/agents/product-manager.md`
- `.claude/agents/technical-writer.md`
- `.claude/agents/improvement-coach.md`

In each file, replace the `0. **[Action routing]...** — read Tier 1; owned
priorities and storyboard items preempt domain steps.` line with the
following — citation-only (no policy text added beyond what the
rewritten protocol now contains):

```
0. **[On-boot read set](.claude/agents/references/memory-protocol.md#on-boot-read-set)**
   — `Read wiki/MEMORY.md` then `Bash: fit-wiki boot`. The three Tier 1
   surfaces are `wiki/{self}.md`, `wiki/MEMORY.md`, and the current
   `wiki/storyboard-YYYY-MNN.md`. Routing per
   [On-Boot Routing](.claude/agents/references/memory-protocol.md#on-boot-routing).
```

The order `Read → boot` matches design § Step 0 contract. **No
skip-self routing rule appears in the profile** — that policy lives in
the rewritten protocol's On-Boot Routing section (Part 02), keeping the
profile a pure citation and avoiding the substantive-profile-redesign
that spec § Out of scope forbids.

Wiki-write instructions in each profile gain a single citation line
below the existing list (no policy added — the policy lives in the
rewritten protocol):

```
- **Wiki writes** — `fit-wiki` subcommands per
  [Memory Protocol § CLI Contract Map](.claude/agents/references/memory-protocol.md#cli-contract-map).
```

Verification per file:
- YAML frontmatter byte-identical (`head -10 .claude/agents/{agent}.md`
  before and after).
- `rg -n 'fit-wiki boot' .claude/agents/` returns exactly six hits, one
  per profile.
- `rg -n '#on-boot-read-set' .claude/agents/` returns six hits and each
  anchor resolves to an `^## ` heading in the rewritten protocol.

## Step 2 — Update Step 0 in eleven kata-* skills

Modified files — the exact eleven that carry `### Step 0: Read Memory`
today, verified by `rg -l 'Step 0: Read Memory' .claude/skills/`:

- `.claude/skills/kata-design/SKILL.md`
- `.claude/skills/kata-documentation/SKILL.md`
- `.claude/skills/kata-implement/SKILL.md`
- `.claude/skills/kata-interview/SKILL.md`
- `.claude/skills/kata-plan/SKILL.md`
- `.claude/skills/kata-product-issue/SKILL.md`
- `.claude/skills/kata-release-cut/SKILL.md`
- `.claude/skills/kata-release-merge/SKILL.md`
- `.claude/skills/kata-security-audit/SKILL.md`
- `.claude/skills/kata-security-update/SKILL.md`
- `.claude/skills/kata-wiki-curate/SKILL.md`

Re-run that command at implementation time and update the worklist if
it diverges (kata-session and kata-review are not in the set today —
they have different Step 0 wording; they remain untouched).

Each file carries a paragraph like:

```
### Step 0: Read Memory

Read memory per the agent profile. Extract … from prior entries.
```

The exact second sentence varies per skill (some add Tier-2 hints, some
add domain-specific extraction targets). Replace **only the first
sentence** with the citation-only form, preserving the per-skill
extraction sentence verbatim:

```
Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot` (per
[Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md#on-boot-read-set)).
The boot digest's `owned_priorities`, `claims`, and (when this skill
reads Tier-2 surfaces) `storyboard_items` seed the rest of this skill's
Process. <preserved second sentence>
```

Order matches design § Step 0 contract (`Read MEMORY.md` first, `boot`
second). The link is a fully-qualified URL because these skills publish
to `forwardimpact/kata-skills` (per `CLAUDE.md § Distribution Model`)
and must resolve outside the monorepo.

Verification:
- `rg -n 'fit-wiki boot' .claude/skills/kata-*/SKILL.md` returns at least eleven hits.
- Per-skill counts: `for f in .claude/skills/kata-*/SKILL.md; do echo "$f: $(rg -c 'fit-wiki boot' $f)"; done` shows ≥1 per file in the worklist.
- The second sentence (per-skill extraction) survives byte-for-byte: `diff` of the post-edit Step 0 paragraph minus the new first sentence equals the original Step 0 minus its first sentence.

## Step 3 — Update `kata-wiki-curate` SKILL audit reference

Modified: `.claude/skills/kata-wiki-curate/SKILL.md`. Line 80 currently
reads:

```
- **Contract conformance** — When `just wiki-audit` is available (added by spec ...)
```

Replace with:

```
- **Contract conformance** — Run `bunx fit-wiki audit`. (The legacy
  `just wiki-audit` recipe is removed in Part 04; the audit logic now
  lives in `fit-wiki`.)
```

Other references to "just wiki-audit" in the same file (one prose
mention at the bottom) get the same replacement.

Verification: `rg -n 'just wiki-audit' .claude/skills/kata-wiki-curate/SKILL.md`
returns zero hits.

## Step 4 — Update `fit-wiki` SKILL

Modified: `.claude/skills/fit-wiki/SKILL.md`.

Add **short** subcommand sections for `boot`, `log`, `claim` /
`release`, `inbox`, `rotate`, `audit`. Each section is ≤8 lines: name,
one-line description, options as a compact table, **one** example
command. Detailed contract behaviour lives in the protocol's CLI
Contract Map (Part 02) — link to it; do not duplicate. This avoids the
drift the redesign exists to close.

Per subcommand, the new sub-section template:

```markdown
### `<name>` — <one-line>

| Flag | Required | Description |
| --- | --- | --- |
| ... | ... | ... |

```sh
fit-wiki <name> ...
```

Contract: [Memory Protocol § CLI Contract Map](https://www.forwardimpact.team/docs/libraries/wiki-operations/index.md#cli-contract-map)
```

Total addition ≤60 lines, not the original ~80.

Update the `### Marker contract` section to list the new
`<!-- obstacles:open -->`, `<!-- obstacles:closed -->`,
`<!-- experiments:open -->`, `<!-- experiments:closed -->` markers
alongside the existing `<!-- xmr:... -->` family. Note the optional
`:30d` suffix as a reserved future extension.

`## Documentation` block stays unchanged (the URLs are external; the
underlying guides are out of scope here).

Verification:
- One grep per subcommand: `for c in boot log claim release inbox rotate audit; do echo "$c: $(rg -c "fit-wiki $c\b" .claude/skills/fit-wiki/SKILL.md)"; done` shows ≥1 per row.
- `wc -l .claude/skills/fit-wiki/SKILL.md` ≤ original count + 60.
- `bun run check` passes.

## Step 5 — Update `fit-wiki` CLI `--help` documentation entries

Modified: `libraries/libwiki/bin/fit-wiki.js`.

This adds the libcli `documentation` entries (currently two) any new
subcommand needs (none new are mandatory — the existing two cover the
broader picture). Verify the `examples` block already updated in Part
01 Step 9 stays consistent with skill examples added in Step 4 above.

No code change; this step is a consistency audit between Part 01's
bin and Part 03's SKILL.md.

Verification: each subcommand documented in SKILL.md appears in
`fit-wiki --help` output; `rg -n` cross-check passes.

## Step 6 — Update `.github/workflows/publish-skills.yml` references mention

Modified: `.github/workflows/publish-skills.yml` — only if the citation
inventory (Part 02 Step 5) flags any stale `memory-protocol.md` or
`MEMORY.md` reference inside the workflow. Current grep finds none. If
none, this step is a no-op recorded as "verified clean" in the
implementation log.

Verification: `rg 'memory-protocol|MEMORY.md' .github/workflows/`
returns no stale hits (none found at planning time; verify at
implementation).

## Step 7 — Re-run citation inventory

Re-run the command from Part 02 Step 5 against the post-Part-03 tree:

```sh
rg -n 'memory-protocol|MEMORY.md|<!-- memo:inbox -->|80-line|Tier 1|Tier 2' \
   .claude/ wiki/ CONTRIBUTING.md KATA.md products/ \
   > /tmp/citations-after.txt
```

Cross-check against `citation-inventory.md`. Every row marked "updated
in Part 03" must show an edit landed in this part. Any new hit (e.g.
historical match the grep was over-matching) is filed as exempt per
the inventory rules.

Verification: `diff /tmp/citations.txt /tmp/citations-after.txt` shows
only deletions or substitutions that map to inventory rows — no
unaccounted-for stale citations remain.

## Risks (Part 03 only)

- **Profile YAML frontmatter accidentally touched.** Each agent file
  starts with a YAML block. The Step 0 edit is below the frontmatter;
  test by `head -20 .claude/agents/staff-engineer.md` post-edit to
  confirm the frontmatter is byte-identical.
- **Skill metric tables left untouched.** Each `kata-*/SKILL.md`
  carries a metrics reference; this part does not touch them. Tests
  pass only if `bun run check` (Biome) does not surface trailing
  whitespace introduced by the Step-0 edits.
