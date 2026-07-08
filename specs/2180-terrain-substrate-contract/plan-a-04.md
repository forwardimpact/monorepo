# Plan 2180-a part 04 — Interview workflow wiring

Switch the wrapper workflow's persona step to `fit-terrain`, carrying the FI
values as explicit options, and pin the shape in the workflow test (SC8).

## Step 1 — persona-select-command switches to fit-terrain

- Modified: `.github/workflows/kata-interview.yml`

The `persona-select-command` ternary's command string becomes:

```sh
persona=$(fit-terrain substrate pick --format json \
  --memory "wiki/kata-interview/picks.csv") \
&& printf '%s\n' "$persona" \
&& email=$(printf '%s' "$persona" | jq -r '.personas[0].email') \
&& fit-terrain substrate issue --email "$email" --cwd "$AGENT_CWD" \
  --token-env PRODUCT_LANDMARK_TOKEN --stash "$RUNNER_TEMP/.persona-jwt"
```

(single-quoted YAML expression string like today; `fit-terrain` is on PATH in
the action, no `bunx`). `substrate-setup-command` is untouched — `bunx
fit-map substrate stage` stays the sole `fit-map` line, and the comment above
the step updates to say so. Note: the old command extracted `.email` from a
payload whose email lives at `.personas[0].email`; the new extraction is the
correct path, not a behaviour change.

Verify: `yq '.jobs.interview.steps[0].with' .github/workflows/kata-interview.yml`
shows the new command; workflow shape test below passes.

## Step 2 — Shape-test assertions

- Modified: `.github/workflows/test/kata-interview-shape.test.js`

New `describe` block on the wrapper's `with:` map asserting
`persona-select-command`:

- matches `/fit-terrain substrate pick/` and `/fit-terrain substrate issue/`
- carries `--memory "wiki/kata-interview/picks.csv"` and
  `--token-env PRODUCT_LANDMARK_TOKEN`
- does not match `/fit-map/`; and across the whole `with:` map, `fit-map`
  appears only in `substrate-setup-command`

Verify: `bun test .github/workflows/test/kata-interview-shape.test.js` passes.

Libraries used: none.

## Risks

- This part must not land before part 03: the workflow's pick queries
  `substrate.*`, which exists only once map's contract-view migration ships
  in the release the interview runner installs.
