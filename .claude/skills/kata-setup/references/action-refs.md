# Resolving Action Refs

Every generated workflow pins each published action to an immutable commit SHA.
Never use a mutable tag such as `v1`. Resolve each ref placeholder at generation
time.

## Placeholders

| Placeholder              | Action repository              |
| ------------------------ | ------------------------------ |
| `{{KATA_AGENT_REF}}`     | `forwardimpact/kata-agent`     |
| `{{GEMBA_WATCHDOG_REF}}` | `forwardimpact/gemba-watchdog` |

## Steps

1. List the release tags of the placeholder's action repository, highest
   version last:

   ```sh
   gh api repos/<action-repository>/tags --paginate \
     --jq '.[] | "\(.commit.sha) \(.name)"' \
     | grep -E ' v[0-9]+\.[0-9]+\.[0-9]+$' | sort -k2 -V
   ```

2. Pick the last line. It holds the highest `vX.Y.Z` tag and its commit SHA.
3. Emit `<full-40-char-sha> # <tag>` in place of the placeholder:

   ```yaml
   - uses: forwardimpact/<action>@<full-40-char-sha> # vX.Y.Z
   ```

If resolution fails, stop and ask the operator.

## Keep Pins Current

Pair the pins with the `github-actions` Dependabot config
([`dependabot.md`](dependabot.md)). Dependabot then opens bump PRs, so the pins
do not rot.
