# CLI Reference

### Global Options

All commands accept these options:

| Option            | Description                               |
| ----------------- | ----------------------------------------- |
| `--roster <path>` | Path to `summit.yaml` roster file         |
| `--data <path>`   | Path to Map standard data directory       |
| `--format <type>` | Output format: `text`, `json`, `markdown` |
| `--help`          | Show command help                         |
| `--version`       | Print version                             |

### Coverage and Risks

```sh
npx fit-summit coverage <team>                  # Capability coverage heatmap
npx fit-summit coverage <team> --evidenced      # Overlay practiced capability
npx fit-summit coverage <team> --project <name> # Project-specific coverage
npx fit-summit risks <team>                     # Structural risks (SPOFs, gaps, concentration)
npx fit-summit risks <team> --evidenced         # Evidence-escalated risks
npx fit-summit risks <team> --audience director # Director-level (anonymized)
```

### What-If Scenarios

```sh
npx fit-summit what-if <team> --remove 'Alice'
npx fit-summit what-if <team> --add '{ discipline: software-engineering, level: J060, track: platform }'
npx fit-summit what-if <team> --promote 'Bob'
npx fit-summit what-if <team> --move 'Carol' --to other-team
npx fit-summit what-if <team> --remove 'Alice' --focus delivery  # Focus diff on one capability
```

The `--add` flag takes a flow-style YAML job expression with `discipline`,
`level`, and optionally `track`.

### Growth and Trajectory

```sh
npx fit-summit growth <team>                    # Growth opportunities aligned with gaps
npx fit-summit growth <team> --evidenced        # Exclude already-practiced skills
npx fit-summit growth <team> --outcomes         # Weight by GetDX driver scores
npx fit-summit trajectory <team>                # Quarterly capability evolution
npx fit-summit trajectory <team> --quarters 8   # Look back 8 quarters
```

### Roster and Validation

```sh
npx fit-summit roster                           # Display current roster
npx fit-summit validate                         # Validate roster against standard data
```

`validate` exits non-zero on errors — use it in CI or pre-commit hooks.

### Team Comparison

```sh
npx fit-summit compare <team1> <team2>          # Diff coverage and risks
npx fit-summit compare <team1> <team2> --audience director
```
