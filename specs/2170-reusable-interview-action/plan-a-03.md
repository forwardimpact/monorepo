# Plan 2170 — Part 03: Consumer flip

Flip the monorepo's consumer surfaces onto the published action. **Precondition:
part 02 merged and `publish-actions.yml` succeeded**, so
`forwardimpact/kata-interview` carries the action on its `main` and the split
commit SHA is resolvable.

Libraries used: none (YAML + JS test + Markdown).

## Step 1 — Wrapper workflow

Reduce `kata-interview.yml` to a thin wrapper over the published action, keeping
only what a composite action cannot declare.

Files:

- Modified: `.github/workflows/kata-interview.yml`

Change: replace the whole `steps:` body with a single
`uses: forwardimpact/kata-interview@<published-sha> # v<x.y.z>` step. Keep
`concurrency`, `permissions: contents: read`, and the job's
`timeout-minutes: 50`. Rename the `empty-corpus-test` dispatch input to
`substrate-force-empty-corpus`; add `website-url` (default
`https://www.forwardimpact.team`) and `substrate` (boolean, default `false`)
dispatch inputs — `substrate` replaces the old `product == 'landmark'`
derivation, so no `landmark` literal remains in the workflow. Pass to the action:
`app-id`/`app-private-key`/`anthropic-api-key` from `secrets.*`, `killswitch`
from `${{ vars.KATA_KILLSWITCH }}`, `website-url`/`product`/`job`/`task-amend`/
`substrate`/`substrate-force-empty-corpus` from inputs, and
`jwt-secret`/`service-role-key` from `secrets.SUPABASE_JWT_SECRET` /
`secrets.SUPABASE_SERVICE_ROLE_KEY`.

Verification: `rg 'python3|supabase status' .github/workflows/kata-interview.yml`
returns nothing; `rg "product\s*==\s*'landmark'"` over the workflow returns
nothing; the workflow calls `forwardimpact/kata-interview`.

## Step 2 — Shape test rewrite

Re-target the shape invariant onto the generic `substrate` gating (on the
action) and the sub-60 timeout (on the wrapper).

Files:

- Modified: `.github/workflows/test/kata-interview-shape.test.js`

Change: parse **both** files. On
`products/kata/actions/kata-interview/action.yml`: assert the substrate-only
steps (`Substrate stage`, `Scan logs for sensitive values`) carry
`if: inputs.substrate == 'true'`; assert the `Run interview` env keys
`AGENT_CWD`/`JWT_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` carry the
`inputs.substrate == 'true' && … || ''` ternary; assert no
`product == 'landmark'` literal appears anywhere in the action source. On
`.github/workflows/kata-interview.yml`: assert `jobs.interview.timeout-minutes`
is a number `< 60`, and that a step `uses:` names `forwardimpact/kata-interview`.

Verification: `bun test .github/workflows/test/kata-interview-shape.test.js`
passes.

## Step 3 — Skill + reference parameterization

Stop hardcoding the entry point; read it from `WEBSITE_URL`.

Files:

- Modified: `.claude/skills/kata-interview/SKILL.md`
- Modified: `.claude/skills/kata-interview/references/job-handoff.md`

Change:

- SKILL.md Step 5: state that the website URL comes from the `WEBSITE_URL`
  environment variable (set by the action); if `WEBSITE_URL` is unset the skill
  errors rather than inventing a URL.
- `job-handoff.md`: replace the literal `https://www.forwardimpact.team` in the
  Ask 2 template **and both worked examples (A and B)** with a `<website-url>`
  placeholder sourced from `WEBSITE_URL`, so the file carries no literal entry
  point.

Verification: `rg 'forwardimpact\.team' .claude/skills/kata-interview/` returns
nothing.

## Step 4 — BioNova reference prose

Document a Polaris interview workflow that wraps the published action
(documentation only; no Polaris code).

Files:

- Modified: `references/bionova-apps/design-a.md` (the design prose is the
  documentation home, per design § Reference-app wiring)
- Optionally modified: `references/bionova-apps/spec.md` (exists; add a Scope
  line only if the interview belongs in the reference's scope)

Change: add a short section describing an `interview.yml` in the `bionova-apps`
repo that wraps `forwardimpact/kata-interview@<sha>` with `website-url` = the
Polaris entry point, `substrate: true`, and Polaris'
`JWT_SECRET`/`SERVICE_ROLE_KEY`. Note that Polaris already vendors `story.dsl`
and runs `fit-terrain build`, so the action's build + substrate + scan path
applies unchanged, and that the interview stages synthetic data into a temp
`agent-cwd` (never the app tree), so spec 1160's `--output-root` prerequisite
does not apply.

Verification: `rg -n "kata-interview" references/bionova-apps/` shows the
reference naming the action and passing `website-url` + `substrate`.

## Manual acceptance (spec Success Criterion 1)

After merge, `workflow_dispatch` the wrapper with `substrate: false` and confirm
a non-empty `trace-file` output and a cost line in the step summary.
