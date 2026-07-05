# Plan 2170 — Part 02: Composite action + publish wiring

Create the `kata-interview` composite action owning the generic interview
infrastructure, and wire it into the subtree-split publish set. Merging to
`main` splits it to the `forwardimpact/kata-interview` sibling.

Libraries used: none (YAML + Markdown + workflow config).

## Step 1 — `kata-interview` action

Author the composite action that mirrors `kata-agent`'s shared knobs and adds
the interview-specific inputs, gating substrate steps on the generic
`substrate` input.

Files:

- Created: `products/kata/actions/kata-interview/action.yml`

Change (structure; mirror `products/kata/actions/kata-agent/action.yml`):

- **Inputs** — shared: `app-id`, `app-private-key`, `anthropic-api-key`,
  `app-slug` (default `kata-agent-team`), `max-turns` (default `200`),
  `timeout-minutes`, `allowed-tools`, `killswitch`. Interview-specific:
  `website-url` (required), `product`, `job`, `task-amend`,
  `substrate` (default `"false"`), `substrate-force-empty-corpus`,
  `jwt-secret`, `service-role-key`.
- **Outputs**: `trace-file` and `trace-dir`, both passed through from the inner
  harness step (`${{ steps.interview.outputs.trace-file }}` /
  `…trace-dir }}`) — matches design § Action interface.
- **Steps** (composite):
  1. `Kata killswitch` — first step, reads `inputs.killswitch` (copy
     `kata-agent`'s killswitch step).
  2. `Generate installation token` (create-github-app-token) → checkout
     (`fetch-depth: 0`, App token) → `forwardimpact/bootstrap@<sha>` with
     `token: ${{ steps.ci-app.outputs.token }}` (gates wiki checkout — the
     skill's Step 0 boot and the `always()` wiki-push step depend on it),
     `app-slug`, `app-id`, and
     `clis: fit-terrain fit-trace fit-harness fit-wiki` (no `fit-map`).
  3. `Prepare interview workspace` — `mktemp -d`, `fit-terrain build`,
     `bun install -g supabase`, export `dir` to `$GITHUB_OUTPUT`.
  4. `Substrate stage` — `if: inputs.substrate == 'true'`; runs
     `bunx fit-map substrate stage --cwd <dir> --emit-env "$GITHUB_ENV"`
     (this single call stages **and** emits `SUPABASE_URL`/`SUPABASE_ANON_KEY`
     — no inline `supabase status` / `python3`). Env: `JWT_SECRET`,
     `SUPABASE_SERVICE_ROLE_KEY`, `SUBSTRATE_FORCE_EMPTY_CORPUS` from the
     matching inputs.
  5. `Compose task amendment` — as today, from `product`/`job`/`task-amend`.
  6. `Run interview` (id `interview`) — `forwardimpact/harness@<sha>`,
     `mode: supervise`, `lead-profile: product-manager`, `supervisor-cwd: .`,
     `agent-cwd: <dir>`, `max-turns`, `timeout-minutes` (from the input),
     `allowed-tools`,
     `supervisor-allowed-tools: Bash,Read,Glob,Grep,Write,Edit,Skill,TodoWrite`,
     `task-text` = "Run the `kata-interview` skill." (verbatim from today),
     `task-amend` from step 5. Env: `ANTHROPIC_API_KEY`, `GH_TOKEN`,
     `CLAUDE_CODE_USE_BEDROCK: "0"`, `IS_SANDBOX: "1"`, `WEBSITE_URL: ${{ inputs.website-url }}`
     (always), and the substrate ternaries
     `AGENT_CWD`/`JWT_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` =
     `${{ inputs.substrate == 'true' && <value> || '' }}`.
  7. `Report run cost` — `if: always()`,
     `fit-trace cost "$TRACE_FILE" --markdown >> "$GITHUB_STEP_SUMMARY"`.
  8. `Push wiki changes` — `if: always()`, `forwardimpact/wiki@<sha>`,
     `command: push`, `app-id`/`app-private-key` inputs.
  9. `Scan logs for sensitive values` — `if: always() && inputs.substrate == 'true'`;
     read the persona-JWT stash (`$RUNNER_TEMP/.persona-jwt`, guarded for
     absence, `::add-mask::`), then
     `fit-harness scan-logs --run-id "$GITHUB_RUN_ID" --repo "$GITHUB_REPOSITORY" --secret persona-jwt=<val> --secret jwt-secret=<val> --secret service-role-key=<val>`
     (empty literals skipped by the verb). Env: `GH_TOKEN` from the in-action
     `create-github-app-token` step (`${{ steps.ci-app.outputs.token }}`, not an
     input); `JWT_SECRET`/`SERVICE_ROLE_KEY` from the matching inputs.

Verification: `rg "product\s*==\s*'landmark'"` over `action.yml` returns
nothing; the shape test (part 03) asserts the substrate gating.

## Step 2 — Action README

Document the input/output contract for external consumers.

Files:

- Created: `products/kata/actions/kata-interview/README.md`

Change: mirror `kata-agent/README.md` shape — purpose, a `Usage` block wrapping
`forwardimpact/kata-interview@v1` with `website-url`, `substrate`, and the auth
inputs; a `Prerequisites` list (App with `Actions: Read`, secrets); and an
`Inputs` table covering every input from Step 1. Use fully-qualified public URLs
only; no relative paths into the monorepo.

Verification: the README names every action input and the `trace-file` output.

## Step 3 — Publish wiring

Add `kata-interview` to the subtree-split publish set.

Files:

- Modified: `.github/workflows/publish-actions.yml`

Change: add a `paths` filter entry `products/kata/actions/kata-interview/**` and
a matrix entry
`{ prefix: products/kata/actions/kata-interview, repo: kata-interview }`.

No `.github/dependabot.yml` edit is needed: its github-actions ecosystem already
scans directory `/`, which covers every workflow `uses:` including the wrapper's
new `forwardimpact/kata-interview` pin, so weekly SHA bumps flow with no
per-sibling entry.

Verification: a YAML parse of `publish-actions.yml` succeeds; the matrix entry
and path filter name `kata-interview`.
