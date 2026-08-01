# Jidoka

Run the jidoka checks in CI. The checks build quality into a layered
instruction architecture. The job stops the line the moment an instruction
layer drifts, a jobs block goes stale, or a repository invariant breaks.
See the
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

[forwardimpact/bootstrap](https://github.com/forwardimpact/bootstrap) must
bootstrap the workspace first. It installs `jidoka` as a pinned gear binary on
PATH (it is one of the default tools). The binary is required. There is no
bunx/npx fallback.

## Inputs

| Input               | Required | Default | Description                                                                    |
| ------------------- | -------- | ------- | ------------------------------------------------------------------------------ |
| `command`           | No       | —       | `instructions`, `jtbd`, or `invariants`. Leave empty to run every check       |
| `fix`               | No       | `false` | For `jtbd`: regenerate stale catalog and jobs blocks in place                 |
| `working-directory` | No       | `.`     | Directory in which to run the command                                          |

## Adopting from the predecessor check action

If your workflow used this suite's earlier local composite action, follow the
migration note in the
[standard](https://github.com/forwardimpact/monorepo/blob/main/JIDOKA.md).
Rename the rules directory to `.jidoka/`. Reinstall the skill pack. Point the
step at `forwardimpact/jidoka@v1`.
