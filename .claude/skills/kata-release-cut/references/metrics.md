# Metrics — Release Cut

Record per KATA.md § Metrics. Append one row per run.

| Metric       | Unit  | Description                            | Data source     |
| ------------ | ----- | -------------------------------------- | --------------- |
| releases_cut | count | Releases tagged and published this run | gh release list |

Query the unreleased commit count and the time since the last release from
`git log` and `gh release list`. They are stocks or sawtooth series. They are
not process data.
