# Jidoka

Run the jidoka checks in CI — built-in quality for a layered instruction
architecture: the job stops the line the moment an instruction layer drifts,
a jobs block goes stale, or a repository invariant breaks. See the
[Jidoka Instruction Architecture Standard](https://github.com/forwardimpact/monorepo/blob/main/JIDOKA.md).

## Usage

```yaml
- uses: forwardimpact/jidoka@v1
  with:
    command: instructions # or "jtbd", "invariants"; omit to run every check
    fix: "false"
    working-directory: "."
```

## Prerequisites

The workspace must already be bootstrapped by
[forwardimpact/bootstrap](https://github.com/forwardimpact/bootstrap), which
installs `jidoka` as a pinned gear binary on PATH (it is one of the default
tools). The binary is required — there is no bunx/npx fallback.

## Inputs

| Input               | Required | Default | Description                                                                    |
| ------------------- | -------- | ------- | ------------------------------------------------------------------------------ |
| `command`           | No       | —       | `instructions`, `jtbd`, or `invariants`; leave empty to run every check       |
| `fix`               | No       | `false` | For `jtbd`: regenerate stale catalog and jobs blocks in place                 |
| `working-directory` | No       | `.`     | Directory in which to run the command                                          |

## Adopting from the predecessor check action

If your workflow used this suite's earlier local composite action, follow the
migration note in the
[standard](https://github.com/forwardimpact/monorepo/blob/main/JIDOKA.md):
rename the rules directory to `.jidoka/`, reinstall the skill pack, and point
the step at `forwardimpact/jidoka@v1`.
