# Plan A · Part 06 — Documentation, published skill, and starter template

Parent plan: [plan-a.md](./plan-a.md). Spec: [spec.md](./spec.md). Depends on
Parts 01–05 being merged (needs the final command surface to document
accurately).

This part is the documentation and polish pass. It covers the website, internal
architecture docs, the published Claude skill for external users, root-level doc
updates, and the optional polish item deferred from Part 05 (surfacing active
initiatives inside the health view).

**Route to `technical-writer`** — no code changes beyond optional polish items
listed at the end.

## Scope

**In scope**

- Flesh out `website/landmark/index.md` with content describing the final
  command surface and the audience model.
- Create `website/docs/internals/landmark/index.md` covering architecture, join
  contracts, and the Summit import pattern.
- Create `.claude/skills/fit-landmark/SKILL.md` — the published skill that helps
  external users understand how Landmark _works_ (not how it is implemented).
- Update `CLAUDE.md` if the Landmark entry needs adjustment (the current entry
  is a placeholder — replace with the canonical product summary linking to the
  new overview and internals pages).
- Add Landmark to `website/docs/getting-started/` content where relevant
  (install, first run, authoring markers).
- Author the "Landmark quickstart" guide referenced in spec § Starter Data
  Philosophy at `website/docs/guides/landmark-quickstart/index.md`.
- Update `specs/STATUS` to advance `080` from `draft` to `done` once all code
  parts and this docs part merge. (This step is a reviewer action, not an
  implementation step — documented here for continuity.)

**Out of scope**

- Any new command surface.
- Any change to the generated website build pipeline.
- Marketing copy beyond what the spec already defines.

## Files

### Created

```
website/docs/internals/landmark/
  index.md

website/docs/guides/landmark-quickstart/
  index.md

.claude/skills/fit-landmark/
  SKILL.md
```

### Modified

- `website/landmark/index.md` — replace the stub content with the full overview
  derived from the spec. Keep the YAML front matter (layout: product, hero
  config) and rewrite the body.
- `CLAUDE.md` — confirm the Landmark entry under `## Products` matches the final
  product surface and links to the new overview and internals pages. Adjust
  wording only where the current placeholder text is inaccurate.
- `website/docs/getting-started/engineers/` — add a short section that explains
  `fit-landmark evidence`, `readiness`, and `timeline` for individual use.
- `website/docs/getting-started/leadership/` — add a short section on
  `fit-landmark health` and `voice`, with a note about authoring drivers and
  markers before expecting rich output.
- `specs/STATUS` — advance spec 080 to `done` (reviewer step, performed last).

## Implementation details

### `website/landmark/index.md` rewrite

Replace the stub body with content covering:

- What Landmark is (1 paragraph, lifted from spec § Why).
- The audience model table (from spec § Audience Model — copy verbatim, it is
  already reader-facing).
- The final command list by group (organization, snapshot, evidence, health,
  voice, initiative). Short description per command.
- The "works without Summit / richer with Summit" framing for health.
- Prereqs: GetDX account, Map with activity schema migrated, framework data with
  drivers and markers authored.
- CTAs: link to the quickstart guide and the authoring guide.

Use `npm` and `npx` exclusively in any command snippets in this file — it is an
external-facing page (per CLAUDE.md's documentation rule).

### `website/docs/internals/landmark/index.md`

New page covering:

- Package layout (spec 390) and how it mirrors Summit.
- Data contracts with Map: which queries Landmark consumes, and the subpath
  import paths.
- The Summit import pattern (`src/lib/summit.js`) and the graceful-degrade
  rationale, including the `GrowthContractError` warning path.
- The `item_id ↔ driver.id` (and `scorecard_id ↔ driver.id` for initiatives)
  join contract — call this out as the single most important framework authoring
  constraint.
- The comment and initiative pipelines (ELT flow).
- Testing strategy: stub query pattern, fixture conventions, anchor-comment
  contract for cross-part edits to `health.js` and `formatters/health.js`.
- Audience model enforcement — which commands apply which privacy rules.
- **Behaviour rendering — explicit non-goal.** Drivers may declare
  `contributingBehaviours`, but Landmark does not render behaviour evidence in
  the health view for spec 080. Rationale: behaviours are maturity profiles
  (derived from discipline + level + track), not artifact-level markers, and the
  spec's § Health view mock-up shows skills only. Track as a follow-up if a user
  asks.

This page uses internal contributor conventions — `bun`, `bunx`, `just` —
because it lives under `website/docs/internals/`.

### `.claude/skills/fit-landmark/SKILL.md`

Published skill, follows the pattern of other `fit-*` skills under
`.claude/skills/`. Structure:

```markdown
---
name: fit-landmark
description: >
  Work with the @forwardimpact/landmark product. Use when analyzing
  engineering-system signals, exploring GetDX snapshot trends, reading
  marker evidence, checking promotion readiness, viewing team health
  with growth recommendations, or surfacing engineer voice.
---

# Landmark

<overview paragraph>

## When to Use
<bulleted list>

## Commands
<short description per command — org, snapshot, evidence, marker,
readiness, timeline, coverage, practiced, health, voice, initiative>

## Audience Model
<reference to the per-view privacy rules>

## Prereqs
<GetDX, Map activity schema, authored markers/drivers>

## Common Workflows
<- "What should this engineer be evidenced at?" → readiness
 - "How is this team doing?" → health
 - "What are engineers blocked on?" → voice
 - "Did the initiative we ran actually help?" → initiative impact>
```

Keep the skill short and external-user-friendly. It should answer "what does
Landmark _do_?", not "how was Landmark built?".

### `website/docs/guides/landmark-quickstart/index.md`

Walk an external user from zero to a useful `health` view:

1. Install: `npm install -g @forwardimpact/landmark`.
2. Install Map and generate codegen: `npx fit-codegen --all`.
3. Run Map's activity schema migration: `npx fit-map activity migrate`.
4. Configure GetDX credentials (`MAP_SUPABASE_URL`,
   `MAP_SUPABASE_SERVICE_ROLE_KEY`).
5. Sync GetDX data: `npx fit-map getdx sync` then
   `npx fit-map activity transform`.
6. Author drivers and markers (link to the authoring guide).
7. Run `npx fit-landmark health --manager alice@example.com`.

Keep the guide to one page. Link out for deeper topics.

### `CLAUDE.md` adjustments

Read the existing Landmark entry in `## Products` and confirm it matches the
final command surface. The current placeholder says "No LLM calls" and describes
analysis plus GetDX/GitHub integration — this is still accurate. Update only the
link targets to point at the new overview and internals pages. Do not restate
content that already lives in the spec or on the website (CLAUDE.md's rule:
reference, don't restate).

### STATUS advancement

After all merges land, update `specs/STATUS`:

```
080 done
```

This is the reviewer action. Do not change it until Parts 01–06 are all merged
and the spec-level DO-CONFIRM checklist (§ Verification below) is complete.

## Optional polish (can split into separate small PRs)

These small additive changes close the spec's last cosmetic gaps. Each can be
landed standalone or bundled into this part. Unlike earlier plan revisions, the
**"health shows active initiatives"** feature is no longer optional — it lives
in Part 05 because spec § Initiative tracking mandates it.

- **Initiative impact shows engineer voice.** Extend
  `src/commands/initiative.js` `runImpact` to fetch two representative comments
  for the "after" snapshot in the affected driver and render them under the
  impact line (matching the spec's mock-up). Small diff; routed to
  `staff-engineer` as a Part 06 sub-task.
- **`fit-landmark --help` examples.** Expand the `examples:` array in
  `bin/fit-landmark.js` with one realistic invocation per command group.

Each polish item has a corresponding test addition in the relevant `.test.js`
file. Route these two items to `staff-engineer` separately from the main
documentation pass, since they are code not docs. Part 06's primary routing is
`technical-writer` for everything else in this file.

## Verification

1. `bun run check` — lint, format, layout, exports across the whole repo.
2. `bunx fit-map validate` — still green.
3. `bun test` repo-wide — green.
4. Manual website preview (`bun run site:dev` or equivalent) — new pages render,
   links resolve.
5. `fit-landmark --help` — command list matches spec § CLI.
6. External user simulation: in a fresh directory with only
   `@forwardimpact/landmark`, `@forwardimpact/map`, and `@forwardimpact/summit`
   installed from npm, run through the quickstart guide. Any step that fails in
   that clean context is a documentation bug.
7. Spec-level DO-CONFIRM: re-read spec § Scope and tick off every in-scope
   bullet against an actual command. Anything missing blocks the status advance.

## Deliverable

A merged PR that completes spec 080's documentation surface. `specs/STATUS`
advances to `080 done`. Published skill lives under `.claude/skills/` and syncs
to `forwardimpact/skills` on the next push to `main`.
