# Resolving Action Refs

Every generated workflow pins each published action to an immutable commit SHA.
Never use a mutable tag such as `v1`. Resolve each ref placeholder at generation
time.

## Placeholders

| Placeholder          | Action repository          |
| -------------------- | -------------------------- |
| `{{KATA_AGENT_REF}}` | `forwardimpact/kata-agent` |

## Steps

1. List the release tags of the action repository, highest version last:

   ```sh
   gh api repos/forwardimpact/kata-agent/tags --paginate \
     --jq '.[] | "\(.commit.sha) \(.name)"' \
     | grep -E ' v[0-9]+\.[0-9]+\.[0-9]+$' | sort -k2 -V
   ```

2. Pick the last line. It holds the highest `vX.Y.Z` tag and its commit SHA.
3. Emit `<full-40-char-sha> # <tag>` in place of the placeholder:

   ```yaml
   - uses: forwardimpact/kata-agent@b4a5b262f3d7acaee2da63f8b2a09bcf4730d804 # v1.0.0
   ```

If resolution fails, stop and ask the operator.

## Keep Pins Current

Pair the pins with the `github-actions` Dependabot config (`SKILL.md` Step 2).
Dependabot then opens bump PRs, so the pins do not rot.
