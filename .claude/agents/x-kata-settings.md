# Kata Settings

`.kata/settings.json` at the repository root selects among policy options
the kata skills define. This reference is the single home for the read
mechanic and the `<setting>` block grammar. Each vocabulary lives in the
owning skill's settings reference.

## The File

One flat JSON object. Each key holds an identifier from its owning options
table, an integer, or a list of strings. No nesting. No key whose meaning
depends on another object. The file is optional.

## The Loader

The agent is the loader. A skill that consumes a key instructs the read at
invocation. No runtime library, harness hook, or environment variable
participates.

## Absence

An absent file or an absent key selects the marked default. Defaults equal
current behavior. An installation without the file runs unchanged.

## Misconfiguration

A file that fails to parse, or a known key with an out-of-vocabulary or
out-of-range value, degrades by consumer class:

- A **non-gate skill** selects the marked default and reports the problem on
  its coordination surface: a PR comment when the run owns one, the session
  output otherwise.
- The **merge gate fails closed**. The gate-side rules live in the
  `kata-release-merge` skill. This reference does not restate them.

## Unknown Keys

An unknown key has no effect. Report it like an unreadable value.

## `<setting>` Block Grammar

Each configurable key lives in exactly one `<setting>` block in its owning
skill's settings reference:

- The opening tag carries exactly `key` and `default`, on one line within 74
  characters.
- A selector block's body is one table with the option identifiers in column
  one and exactly one cell suffixed `(default)`. Extra columns are free.
- A parameter block's body is short prose: type, constraints, and
  applicability. The body never restates the default literal. The attribute
  is that class's one home.

Example of a selector block:

```markdown
<setting key="exampleKey" default="option-a">

| Option | Meaning |
| --- | --- |
| `option-a` (default) | What option-a selects. |
| `option-b` | What option-b selects. |

</setting>
```

## Discovery and Owning Tables

`rg '<setting '` enumerates every knob. Phase-1 keys and their owning
tables:

| Keys | Owning table |
| --- | --- |
| `trustSource`, `trustContributorCount`, `trustAllowlist` | `kata-release-merge` `references/settings.md` |
| `reviewPanel`, `reviewBlockingSeverity` | `kata-review` `references/settings.md` |
