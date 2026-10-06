---
name: kata-settings
description: >
  Configure the optional `.kata/settings.json` file. The file selects among
  the policy options that kata skills define, such as the merge gate's trust
  source and the review panel's rigor. Use when an operator wants a policy
  other than the default, when a skill reports an invalid settings value, or
  when you add a configurable key to a kata skill.
---

# Configure Kata Settings

`.kata/settings.json` at the repository root selects among policy options. Each
option set lives in exactly one `<setting>` block in the skill that owns it.
This skill holds the file contract, the setup procedure, and the block grammar.

## When to Use

- An operator wants a trust source or review rigor other than the default
- A skill reported an unreadable file or an invalid value
- A kata skill gains a new configurable key

## Checklists

<read_do_checklist goal="Ground every value in its owning table">

- [ ] Read every owning `<setting>` block before you propose a value.
- [ ] Write only keys that an owning block defines.
- [ ] Leave out each key whose default the operator accepts.

</read_do_checklist>

<do_confirm_checklist goal="Verify the settings change before you open the PR">

- [ ] The file parses as one flat JSON object.
- [ ] Every value is in its key's option set or range.
- [ ] The change rides a PR. Only a trusted human's signal merges it.

</do_confirm_checklist>

## The File Contract

- **Shape.** One flat JSON object. Each key holds an option identifier, an
  integer, or a list of strings. The file is optional.
- **Loader.** The agent reads the file. A skill that consumes a key instructs
  the read at invocation. No library, hook, or environment variable takes part.
- **Absence.** An absent file or key selects the marked default. The defaults
  equal the behavior without the file.
- **Misconfiguration.** A file that does not parse, or a known key with an
  invalid value, degrades by consumer. A non-gate skill uses the default and
  reports the problem on its PR, or in the session output when it owns no PR.
  The merge gate fails closed (`kata-release-merge`).
- **Unknown keys** have no effect. Report them like an invalid value.

## Process

### Step 1: Discover the keys

Run `rg '<setting '` across the installed skills. Each match opens one block.
Today the owning blocks are:

| Keys                                                     | Owning block                                  |
| -------------------------------------------------------- | --------------------------------------------- |
| `trustSource`, `trustContributorCount`, `trustAllowlist` | `kata-release-merge` `references/settings.md` |
| `reviewPanel`, `reviewBlockingSeverity`                  | `kata-review` `references/settings.md`        |

### Step 2: Ask the operator

Read the current file if one exists. For each block, show the options, the
marked default, and the current value. Ask which keys to change. Do not ask
about keys the operator did not raise.

### Step 3: Write the file

Write only the changed keys:

```json
{
  "trustSource": "allowlist",
  "trustAllowlist": ["alice", "bob"],
  "reviewPanel": "thorough"
}
```

### Step 4: Validate

Parse the file. Check each value against its owning block. Run the repository's
checks.

### Step 5: Open the PR

A diff under `.kata/` is a trust-policy change. Open it as a PR. The merge gate
merges it only on a trusted human's explicit signal on that PR, pinned to its
head. No agent approval qualifies.

## Authoring a Setting

Each configurable key lives in exactly one `<setting>` block in its owning
skill's `references/settings.md`:

- The opening tag carries exactly `key` and `default`, on one line within 74
  characters.
- A selector block holds one table. Column one lists the option identifiers.
  Exactly one cell carries the `(default)` suffix. Extra columns are free.
- A parameter block holds short prose: type, constraints, and applicability.
  It never restates the default. The attribute is its one home.

```markdown
<setting key="exampleKey" default="option-a">

| Option | Meaning |
| --- | --- |
| `option-a` (default) | What option-a selects. |
| `option-b` | What option-b selects. |

</setting>
```

Add the new key to the § Step 1 table in the same change.
